import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export type GmailPower = "read" | "send" | "organize";

export type GmailIntegrationConfig = {
    clientId?: string;
    clientSecret?: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: number;
    scopes?: string[];
    powers?: GmailPower[];
};

function normalizeGmailPowers(input: unknown): GmailPower[] {
    if (!Array.isArray(input)) return [];
    return input.filter((value): value is GmailPower => value === "read" || value === "send" || value === "organize");
}

function asNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function buildErrorMessage(prefix: string, detail?: unknown): string {
    const tail = asNonEmptyString(detail);
    return tail ? `${prefix}: ${tail}` : prefix;
}

function decodeJsonSafely(raw: string): any {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

async function markOauthError(ctx: any, departmentId: Id<"departments">, message: string) {
    try {
        const orgId = await resolveOrgIdFromDepartment(ctx, departmentId);
        await ctx.runMutation(internal.integrations.patchConfigForOrg, {
            orgId,
            type: "gmail",
            patch: {},
            oauthStatus: "error",
            lastError: message,
        });
    } catch {
        // Do not mask the original OAuth/refresh error with a secondary patch error.
    }
}

async function resolveOrgIdFromDepartment(
    ctx: any,
    departmentId: Id<"departments">
): Promise<Id<"organizations">> {
    const department = await ctx.runQuery(api.departments.get, { departmentId });
    if (!department) {
        throw new Error("Department not found.");
    }
    if (!department.orgId) {
        throw new Error("Department has no organization linked.");
    }
    return department.orgId;
}

async function refreshAccessToken(
    ctx: any,
    departmentId: Id<"departments">,
    cfg: GmailIntegrationConfig
): Promise<string> {
    const refreshToken = asNonEmptyString(cfg.refreshToken);
    const clientId = asNonEmptyString(cfg.clientId);
    const clientSecret = asNonEmptyString(cfg.clientSecret);

    if (!refreshToken) {
        const message = "Gmail integration missing refresh token. Reconnect Gmail to continue.";
        await markOauthError(ctx, departmentId, message);
        throw new Error(message);
    }
    if (!clientId || !clientSecret) {
        const message = "Gmail integration missing clientId/clientSecret.";
        await markOauthError(ctx, departmentId, message);
        throw new Error(message);
    }

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        }),
    });

    const tokenText = await tokenRes.text();
    const tokenJson = decodeJsonSafely(tokenText);
    const accessToken = asNonEmptyString(tokenJson?.access_token);
    const expiresIn = asOptionalNumber(tokenJson?.expires_in);
    const scopeText = asNonEmptyString(tokenJson?.scope);

    if (!tokenRes.ok || !accessToken) {
        const reason =
            asNonEmptyString(tokenJson?.error_description) ||
            asNonEmptyString(tokenJson?.error) ||
            `HTTP ${tokenRes.status}`;
        const message = buildErrorMessage("Gmail token refresh failed", reason);
        await markOauthError(ctx, departmentId, message);
        throw new Error(message);
    }

    const orgId = await resolveOrgIdFromDepartment(ctx, departmentId);
    await ctx.runMutation(internal.integrations.patchConfigForOrg, {
        orgId,
        type: "gmail",
        patch: {
            accessToken,
            tokenExpiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
            ...(scopeText ? { scopes: scopeText.split(" ").filter(Boolean) } : {}),
        },
        authType: "oauth2",
        oauthStatus: "connected",
        lastError: "",
    });

    return accessToken;
}

export async function getGmailIntegrationConfig(
    ctx: any,
    departmentId: Id<"departments">
): Promise<{
    config: GmailIntegrationConfig;
    powers: GmailPower[];
    scopes: string[];
}> {
    const orgId = await resolveOrgIdFromDepartment(ctx, departmentId);
    const integration: any = await ctx.runQuery(internal.integrations.getByType, {
        orgId,
        type: "gmail",
    });

    if (!integration) {
        throw new Error("Gmail integration not configured for this organization.");
    }
    console.log("[gmailClient.getConfig] lookup", {
        orgId: String(orgId),
        departmentId: String(departmentId),
        oauthStatus: integration?.oauthStatus ?? null,
    });

    const configRaw = integration?.config ?? {};
    const cfg = (configRaw && typeof configRaw === "object" ? configRaw : {}) as GmailIntegrationConfig;
    const powers = normalizeGmailPowers(cfg.powers);
    const scopes = Array.isArray(cfg.scopes)
        ? cfg.scopes.filter((scope): scope is string => typeof scope === "string" && scope.trim().length > 0)
        : [];

    return { config: cfg, powers, scopes };
}

export async function ensureValidAccessToken(
    ctx: any,
    departmentId: Id<"departments">
): Promise<string> {
    const { config } = await getGmailIntegrationConfig(ctx, departmentId);
    const accessToken = asNonEmptyString(config.accessToken);
    const tokenExpiresAt = asOptionalNumber(config.tokenExpiresAt);
    const shouldRefresh = !tokenExpiresAt || Date.now() >= tokenExpiresAt - 60_000 || !accessToken;

    if (!shouldRefresh && accessToken) {
        return accessToken;
    }

    return await refreshAccessToken(ctx, departmentId, config);
}

export async function gmailFetch(
    ctx: any,
    departmentId: Id<"departments">,
    url: string,
    options?: RequestInit
): Promise<Response> {
    const token = await ensureValidAccessToken(ctx, departmentId);
    const headers = new Headers(options?.headers ?? {});
    headers.set("Authorization", `Bearer ${token}`);

    const firstResponse = await fetch(url, {
        ...options,
        headers,
    });

    if (firstResponse.status !== 401) {
        return firstResponse;
    }

    const { config } = await getGmailIntegrationConfig(ctx, departmentId);
    const refreshedToken = await refreshAccessToken(ctx, departmentId, config);
    const retryHeaders = new Headers(options?.headers ?? {});
    retryHeaders.set("Authorization", `Bearer ${refreshedToken}`);

    return await fetch(url, {
        ...options,
        headers: retryHeaders,
    });
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
    const bufferCtor = (globalThis as { Buffer?: { from(input: Uint8Array): { toString(enc: string): string } } }).Buffer;
    if (bufferCtor) {
        const base64 = bufferCtor.from(bytes).toString("base64");
        return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }

    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64urlEncode(input: string | Uint8Array): string {
    const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
    return base64UrlEncodeBytes(bytes);
}
