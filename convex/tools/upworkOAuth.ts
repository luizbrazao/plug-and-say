import { internalAction, httpAction } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const UPWORK_AUTHORIZE_URL = "https://www.upwork.com/nx/oauth2/authorize";
const UPWORK_TOKEN_URL = "https://www.upwork.com/api/v3/oauth2/token";
const DEFAULT_UPWORK_SCOPES = ["viewer", "jobs"];

function base64UrlEncodeBytes(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    const b64 = btoa(binary);
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeToBytes(b64url: string): Uint8Array {
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function base64UrlEncodeJson(obj: unknown): string {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    return base64UrlEncodeBytes(bytes);
}

function base64UrlDecodeJson<T = any>(b64url: string): T {
    const bytes = base64UrlDecodeToBytes(b64url);
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as T;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
    return diff === 0;
}

async function hmacSha256Base64Url(message: string, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
    return base64UrlEncodeBytes(new Uint8Array(sig));
}

async function signState(payload: object, secret: string): Promise<string> {
    const b64 = base64UrlEncodeJson(payload);
    const sig = await hmacSha256Base64Url(b64, secret);
    return `${b64}.${sig}`;
}

async function verifyState(state: string, secret: string): Promise<any | null> {
    const [b64, sig] = state.split(".");
    if (!b64 || !sig) return null;

    const expected = await hmacSha256Base64Url(b64, secret);
    const ok = constantTimeEqual(
        new TextEncoder().encode(sig),
        new TextEncoder().encode(expected)
    );
    if (!ok) return null;

    try {
        return base64UrlDecodeJson(b64);
    } catch {
        return null;
    }
}

function randomHex(bytesLen = 16): string {
    const bytes = new Uint8Array(bytesLen);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const getAuthUrl = internalAction({
    args: {
        orgId: v.id("organizations"),
        departmentId: v.optional(v.id("departments")),
        initiatedByUserId: v.id("users"),
    },
    handler: async (ctx, args) => {
        if (args.departmentId) {
            const department = await ctx.runQuery(api.departments.get, {
                departmentId: args.departmentId,
            });
            if (!department) {
                throw new Error("Department not found.");
            }
            if (String(department.orgId ?? "") !== String(args.orgId)) {
                throw new Error("Department does not belong to the provided organization.");
            }
        }

        const integration: any = await ctx.runQuery(internal.integrations.getByType, {
            orgId: args.orgId,
            type: "upwork",
        });
        if (!integration) {
            throw new Error("Upwork integration is not configured for this organization.");
        }

        const cfg = integration?.config ?? {};
        const clientId = cfg.clientId as string | undefined;
        const redirectUri = (cfg.redirectUri as string | undefined) || (cfg.redirectUrl as string | undefined);

        if (!clientId || !redirectUri) {
            throw new Error("Upwork integration not configured: missing clientId/redirectUri.");
        }

        const stateSecret = process.env.UPWORK_STATE_SECRET as string | undefined;
        if (!stateSecret) {
            throw new Error("Missing UPWORK_STATE_SECRET.");
        }

        const scopes = DEFAULT_UPWORK_SCOPES;
        const nonce = randomHex(16);
        const issuedAt = Date.now();
        const expiresAt = issuedAt + 10 * 60 * 1000;

        const state = await signState(
            {
                orgId: String(args.orgId),
                departmentId: args.departmentId ? String(args.departmentId) : undefined,
                scopes,
                nonce,
                ts: issuedAt,
            },
            stateSecret
        );

        await ctx.runMutation(internal.integrations.patchConfigForOrg, {
            orgId: args.orgId,
            type: "upwork",
            patch: {
                oauthIntent: {
                    nonce,
                    orgId: String(args.orgId),
                    departmentId: args.departmentId ? String(args.departmentId) : undefined,
                    initiatedByUserId: String(args.initiatedByUserId),
                    scopes,
                    issuedAt,
                    expiresAt,
                },
            },
            authType: "oauth2",
            oauthStatus: "pending",
            lastError: "",
        });

        const params = new URLSearchParams({
            response_type: "code",
            client_id: clientId,
            redirect_uri: redirectUri,
            scope: scopes.join(" "),
            state,
        });

        return {
            ok: true,
            url: `${UPWORK_AUTHORIZE_URL}?${params.toString()}`,
            scopes,
        };
    },
});

export const callback = httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) return new Response(`OAuth error: ${error}`, { status: 400 });
    if (!code || !state) return new Response("Missing code/state", { status: 400 });

    const stateSecret = process.env.UPWORK_STATE_SECRET as string | undefined;
    if (!stateSecret) return new Response("Server missing UPWORK_STATE_SECRET", { status: 500 });

    const decoded = await verifyState(state, stateSecret);
    if (!decoded?.orgId || !decoded?.nonce) {
        return new Response("Invalid state", { status: 400 });
    }
    if (typeof decoded.ts !== "number" || Date.now() - decoded.ts > 10 * 60 * 1000) {
        return new Response("OAuth state expired", { status: 400 });
    }

    const orgId = String(decoded.orgId) as Id<"organizations">;
    const departmentId =
        typeof decoded.departmentId === "string" ? (String(decoded.departmentId) as Id<"departments">) : undefined;
    const scopes =
        Array.isArray(decoded.scopes) && decoded.scopes.length > 0
            ? decoded.scopes.map((scope: unknown) => String(scope))
            : DEFAULT_UPWORK_SCOPES;

    if (departmentId) {
        const department = await ctx.runQuery(api.departments.get, { departmentId });
        if (!department) {
            return new Response("Department not found for OAuth context", { status: 400 });
        }
        if (String(department.orgId ?? "") !== String(orgId)) {
            return new Response("OAuth state department/org mismatch", { status: 400 });
        }
    }

    const integration: any = await ctx.runQuery(internal.integrations.getByType, {
        orgId,
        type: "upwork",
    });
    if (!integration) {
        return new Response("Upwork integration not found for organization", { status: 404 });
    }

    const cfg = integration?.config ?? {};
    const intent = (cfg.oauthIntent ?? {}) as {
        nonce?: string;
        orgId?: string;
        departmentId?: string;
        initiatedByUserId?: string;
        scopes?: string[];
        issuedAt?: number;
        expiresAt?: number;
        usedAt?: number;
    };
    const expectedDepartmentId = departmentId ? String(departmentId) : undefined;
    const intentValid =
        intent &&
        typeof intent.nonce === "string" &&
        intent.nonce === String(decoded.nonce) &&
        intent.orgId === String(orgId) &&
        (intent.departmentId ?? undefined) === expectedDepartmentId &&
        typeof intent.initiatedByUserId === "string" &&
        (!intent.expiresAt || Date.now() <= intent.expiresAt) &&
        !intent.usedAt;
    if (!intentValid) {
        return new Response("Invalid or expired OAuth intent", { status: 400 });
    }

    const stillAuthorized = await ctx.runQuery(internal.integrations.isUserOrgAdmin, {
        orgId,
        userId: String(intent.initiatedByUserId) as Id<"users">,
    });
    if (!stillAuthorized) {
        return new Response("OAuth intent user is no longer authorized for this organization", {
            status: 403,
        });
    }

    const clientId = cfg.clientId as string | undefined;
    const clientSecret = cfg.clientSecret as string | undefined;
    const redirectUri = (cfg.redirectUri as string | undefined) || (cfg.redirectUrl as string | undefined);
    if (!clientId || !clientSecret || !redirectUri) {
        return new Response("Upwork integration missing clientId/clientSecret/redirectUri", { status: 500 });
    }

    const basicAuth = btoa(`${clientId}:${clientSecret}`);
    const tokenRes = await fetch(UPWORK_TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
        }),
    });

    const tokenJson: any = await tokenRes.json();
    if (!tokenRes.ok) {
        await ctx.runMutation(internal.integrations.patchConfigForOrg, {
            orgId,
            type: "upwork",
            patch: {
                oauthIntent: undefined,
            },
            authType: "oauth2",
            oauthStatus: "error",
            lastError: `Token exchange failed: ${JSON.stringify(tokenJson)}`,
        });
        return new Response(`Token exchange failed: ${JSON.stringify(tokenJson)}`, { status: 400 });
    }

    const accessToken = tokenJson.access_token as string | undefined;
    const refreshToken = tokenJson.refresh_token as string | undefined;
    const expiresIn = tokenJson.expires_in as number | undefined;
    const grantedScopes =
        typeof tokenJson.scope === "string" && tokenJson.scope.trim().length > 0
            ? tokenJson.scope.trim().split(/\s+/)
            : scopes;

    if (!accessToken) {
        return new Response("No access_token returned", { status: 400 });
    }

    await ctx.runMutation(internal.integrations.patchConfigForOrg, {
        orgId,
        type: "upwork",
        patch: {
            scopes: grantedScopes,
            accessToken,
            refreshToken: refreshToken || cfg.refreshToken,
            tokenType: tokenJson.token_type ?? "bearer",
            tokenExpiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
            connectedAt: Date.now(),
            oauthIntent: undefined,
            oauthLastConnectedByUserId: intent.initiatedByUserId,
        },
        authType: "oauth2",
        oauthStatus: "connected",
        lastError: "",
    });

    const appUrl =
        (cfg.appReturnUrl as string | undefined) ||
        "http://localhost:5173/settings/integrations";

    return Response.redirect(appUrl, 302);
});
