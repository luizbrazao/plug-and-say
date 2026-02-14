// convex/tools/gmailOAuth.ts
import { internalAction, httpAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

type GmailPower = "read" | "send" | "organize";

function powersToScopes(powers: GmailPower[]): string[] {
    const set = new Set<string>();
    for (const p of powers) {
        if (p === "read") set.add("https://www.googleapis.com/auth/gmail.readonly");
        if (p === "send") set.add("https://www.googleapis.com/auth/gmail.send");
        if (p === "organize") set.add("https://www.googleapis.com/auth/gmail.modify");
    }
    if (set.size === 0) set.add("https://www.googleapis.com/auth/gmail.readonly");
    return Array.from(set);
}

// ---------- WebCrypto helpers (no node:crypto) ----------

function base64UrlEncodeBytes(bytes: Uint8Array): string {
    // btoa expects binary string
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
    const b64 = btoa(s);
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

// ---------- Actions ----------

/**
 * internal.tools.gmailOAuth.getAuthUrl
 */
export const getAuthUrl = internalAction({
    args: {
        orgId: v.id("organizations"),
        departmentId: v.id("departments"),
        powers: v.array(v.union(v.literal("read"), v.literal("send"), v.literal("organize"))),
        initiatedByUserId: v.id("users"),
    },
    handler: async (ctx, args) => {
        const integration: any = await ctx.runQuery(internal.integrations.getByTypeForDepartment, {
            departmentId: args.departmentId,
            type: "gmail",
        });
        if (!integration) {
            throw new Error("Gmail integration is not configured for this department.");
        }
        if (!integration.orgId) {
            throw new Error("Gmail integration is missing organization linkage.");
        }
        if (integration.orgId !== args.orgId) {
            throw new Error("Gmail integration org mismatch for this department.");
        }

        const cfg = integration?.config ?? {};
        const clientId = cfg.clientId as string | undefined;

        // ⚠️ mantenha o nome igual ao que você usa no config do integration
        // eu recomendo "redirectUri" (mesmo nome do Google)
        const redirectUri = (cfg.redirectUri as string | undefined) || (cfg.redirectUrl as string | undefined);

        if (!clientId || !redirectUri) {
            throw new Error("Gmail integration not configured: missing clientId/redirectUri.");
        }

        const stateSecret = process.env.GMAIL_STATE_SECRET as string | undefined;

        if (!stateSecret) {
            throw new Error("Missing state secret. Set integration.config.stateSecret or env GMAIL_STATE_SECRET.");
        }

        const scopes = powersToScopes(args.powers as GmailPower[]);
        const nonce = randomHex(16);
        const issuedAt = Date.now();
        const expiresAt = issuedAt + 10 * 60 * 1000;

        const state = await signState(
            {
                orgId: String(args.orgId),
                departmentId: String(args.departmentId),
                powers: args.powers,
                nonce,
                ts: issuedAt,
            },
            stateSecret
        );

        await ctx.runMutation(internal.integrations.patchConfigForDepartment, {
            departmentId: args.departmentId,
            type: "gmail",
            patch: {
                oauthIntent: {
                    nonce,
                    orgId: String(args.orgId),
                    departmentId: String(args.departmentId),
                    initiatedByUserId: String(args.initiatedByUserId),
                    issuedAt,
                    expiresAt,
                },
            },
            authType: "oauth2",
            oauthStatus: "pending",
            lastError: "",
        });

        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: "code",
            scope: scopes.join(" "),
            access_type: "offline",
            prompt: "consent",
            include_granted_scopes: "true",
            state,
        });

        return {
            ok: true,
            url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
            scopes,
        };
    },
});

/**
 * HTTP callback do OAuth
 */
export const callback = httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) return new Response(`OAuth error: ${error}`, { status: 400 });
    if (!code || !state) return new Response("Missing code/state", { status: 400 });

    const stateSecret = process.env.GMAIL_STATE_SECRET as string | undefined;
    if (!stateSecret) return new Response("Server missing GMAIL_STATE_SECRET", { status: 500 });

    const decoded = await verifyState(state, stateSecret);
    if (!decoded?.departmentId || !decoded?.orgId || !decoded?.nonce) {
        return new Response("Invalid state", { status: 400 });
    }
    if (typeof decoded.ts !== "number" || Date.now() - decoded.ts > 10 * 60 * 1000) {
        return new Response("OAuth state expired", { status: 400 });
    }

    const orgId = String(decoded.orgId) as Id<"organizations">;
    const departmentId = String(decoded.departmentId) as Id<"departments">;
    const powers = (decoded.powers ?? []) as GmailPower[];

    const integration: any = await ctx.runQuery(internal.integrations.getByTypeForDepartment, {
        departmentId,
        type: "gmail",
    });

    const cfg = integration?.config ?? {};
    const intent = (cfg.oauthIntent ?? {}) as {
        nonce?: string;
        orgId?: string;
        departmentId?: string;
        initiatedByUserId?: string;
        issuedAt?: number;
        expiresAt?: number;
        usedAt?: number;
    };
    const intentValid =
        intent &&
        typeof intent.nonce === "string" &&
        intent.nonce === String(decoded.nonce) &&
        intent.orgId === String(orgId) &&
        intent.departmentId === String(departmentId) &&
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
    if (integration.orgId && String(integration.orgId) !== String(orgId)) {
        return new Response("OAuth state org mismatch", { status: 400 });
    }

    const clientId = cfg.clientId as string | undefined;
    const clientSecret = cfg.clientSecret as string | undefined;
    const redirectUri = (cfg.redirectUri as string | undefined) || (cfg.redirectUrl as string | undefined);

    if (!clientId || !clientSecret || !redirectUri) {
        return new Response("Gmail integration missing clientId/clientSecret/redirectUri", { status: 500 });
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
        }),
    });

    const tokenJson: any = await tokenRes.json();
    if (!tokenRes.ok) {
        await ctx.runMutation(internal.integrations.patchConfigForDepartment, {
            departmentId,
            type: "gmail",
            patch: {
                oauthIntent: undefined,
            },
            authType: "oauth2",
            oauthStatus: "error",
            lastError: `Token exchange failed: ${JSON.stringify(tokenJson)}`,
        });
        return new Response(`Token exchange failed: ${JSON.stringify(tokenJson)}`, { status: 400 });
    }

    const scopes = powersToScopes(powers);
    const accessToken = tokenJson.access_token as string | undefined;
    const refreshToken = tokenJson.refresh_token as string | undefined;
    const expiresIn = tokenJson.expires_in as number | undefined;

    if (!accessToken) return new Response("No access_token returned", { status: 400 });

    await ctx.runMutation(internal.integrations.patchConfigForDepartment, {
        departmentId,
        type: "gmail",
        patch: {
            powers,
            scopes,
            accessToken,
            refreshToken: refreshToken || cfg.refreshToken,
            tokenExpiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
            connectedAt: Date.now(),
            oauthIntent: undefined,
            oauthLastConnectedByUserId: intent.initiatedByUserId,
        },
        // Keep integration status in sync with the OAuth callback completion.
        authType: "oauth2",
        oauthStatus: "connected",
        lastError: "",
    });

    const appUrl =
        (cfg.appReturnUrl as string | undefined) ||
        "http://localhost:5173/settings/integrations";

    return Response.redirect(appUrl, 302);
});
