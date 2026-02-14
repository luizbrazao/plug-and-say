// /convex/integrations.ts

import {
    action,
    internalMutation,
    internalQuery,
    mutation,
    query,
} from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { assertIntegrationAllowed } from "./plans";

// --- Types ---

type IntegrationType =
    | "telegram"
    | "openai"
    | "anthropic"
    | "gmail"
    | "tavily"
    | "resend"
    | "github"
    | "notion"
    | "twitter"
    | "dalle";

type IntegrationConfig = Record<string, unknown>;

// --- Helper Functions ---

function getNonEmptyString(
    config: IntegrationConfig | null | undefined,
    key: string
): string | null {
    const value = config?.[key];
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function validateIntegrationConfig(type: IntegrationType, config: unknown) {
    if (!config || typeof config !== "object") {
        throw new Error("Integration config must be an object.");
    }

    const cfg = config as IntegrationConfig;

    const requireFields = (fields: string[]) => {
        const missing = fields.filter((field) => !getNonEmptyString(cfg, field));
        if (missing.length > 0) {
            throw new Error(
                `Missing required config fields for ${type}: ${missing.join(", ")}`
            );
        }
    };

    const requireOneOf = (fields: string[]) => {
        const hasAny = fields.some((field) => !!getNonEmptyString(cfg, field));
        if (!hasAny) {
            throw new Error(
                `Missing required config fields for ${type}: one of [${fields.join(", ")}]`
            );
        }
    };

    switch (type) {
        case "github":
            requireFields(["token", "server"]);
            break;

        case "notion":
            requireFields(["token", "parentPageId"]);
            break;

        case "twitter":
            requireFields(["apiKey", "apiSecret", "accessToken", "accessSecret"]);
            break;

        case "resend":
            requireFields(["token", "fromEmail"]);
            break;

        case "gmail":
            // redirectUrl pode vir do config OU cair no fallback por CONVEX_SITE_URL.
            // Então a única coisa realmente obrigatória no config é clientId e clientSecret.
            requireFields(["clientId", "clientSecret"]);
            break;

        case "openai":
        case "anthropic":
        case "dalle":
            requireOneOf(["token", "key", "apiKey"]);
            break;

        case "telegram":
        case "tavily":
            requireFields(["token"]);
            break;

        default:
            break;
    }
}

// --- Public Queries ---

/**
 * listByOrg
 * Returns all active integrations for an organization.
 */
export const listByOrg = query({
    args: { orgId: v.id("organizations") },
    handler: async (ctx, args) => {
        const rows = await ctx.db
            .query("integrations")
            .withIndex("by_orgId", (q) => q.eq("orgId", args.orgId))
            .collect();

        // Telegram é department-scoped e normalmente não deve aparecer em listas globais de org.
        return rows.filter((integration) => integration.type !== "telegram");
    },
});

/**
 * getByDepartmentType
 * Returns one integration for a specific department + type.
 */
export const getByDepartmentType = query({
    args: {
        departmentId: v.id("departments"),
        type: v.union(
            v.literal("telegram"),
            v.literal("openai"),
            v.literal("anthropic"),
            v.literal("gmail"),
            v.literal("tavily"),
            v.literal("resend"),
            v.literal("github"),
            v.literal("notion"),
            v.literal("twitter"),
            v.literal("dalle")
        ),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("integrations")
            .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
            .filter((q) => q.eq(q.field("type"), args.type))
            .unique();
    },
});

// --- Public Mutations ---

/**
 * upsert
 * Create or update an integration by org + type.
 */
export const upsert = mutation({
    args: {
        orgId: v.id("organizations"),
        departmentId: v.optional(v.id("departments")),
        name: v.string(),
        type: v.union(
            v.literal("openai"),
            v.literal("anthropic"),
            v.literal("telegram"),
            v.literal("gmail"),
            v.literal("tavily"),
            v.literal("resend"),
            v.literal("github"),
            v.literal("notion"),
            v.literal("twitter"),
            v.literal("dalle")
        ),
        config: v.any(),
        authType: v.optional(v.string()),
        oauthStatus: v.optional(v.string()),
        lastSyncAt: v.optional(v.number()),
        lastError: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const type = args.type as IntegrationType;

        if (type === "telegram" && !args.departmentId) {
            throw new Error("Telegram integration must be scoped to a department.");
        }

        await assertIntegrationAllowed(ctx, args.orgId, type);
        validateIntegrationConfig(type, args.config);

        let integration: any | null = null;

        if (type === "telegram") {
            integration = await ctx.db
                .query("integrations")
                .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId!))
                .filter((q) => q.eq(q.field("type"), "telegram"))
                .unique();
        } else {
            // Para types globais, garantimos 1 por orgId+type
            integration = await ctx.db
                .query("integrations")
                .withIndex("by_orgId", (q) => q.eq("orgId", args.orgId))
                .filter((q) => q.eq(q.field("type"), type))
                .unique();
        }

        const patchBase: Record<string, unknown> = {
            name: args.name,
            config: args.config,
            orgId: args.orgId,
            authType: args.authType,
            oauthStatus: args.oauthStatus,
            lastSyncAt: args.lastSyncAt,
            lastError: args.lastError,
            ...(args.departmentId ? { departmentId: args.departmentId } : {}),
        };

        if (integration) {
            await ctx.db.patch(integration._id, patchBase);
        } else {
            await ctx.db.insert("integrations", {
                departmentId: args.departmentId,
                orgId: args.orgId,
                name: args.name,
                type,
                config: args.config,
                authType: args.authType,
                oauthStatus: args.oauthStatus,
                lastSyncAt: args.lastSyncAt,
                lastError: args.lastError,
                createdAt: Date.now(),
            });
        }

        // Auto-register Telegram webhook if token provided
        if (type === "telegram" && (args.config as any)?.token && args.departmentId) {
            const dept = await ctx.db.get(args.departmentId);
            if (dept) {
                await ctx.scheduler.runAfter(0, api.telegram.registerWebhook, {
                    token: (args.config as any).token,
                    deptSlug: dept.slug,
                });
            }
        }

        return true;
    },
});

export const remove = mutation({
    args: { id: v.id("integrations") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.id);
        return true;
    },
});

// --- Internal Queries ---

/**
 * internal:integrations:getByType
 * Usada para obter uma integração por org + type.
 */
export const getByType = internalQuery({
    args: {
        orgId: v.id("organizations"),
        type: v.union(
            v.literal("openai"),
            v.literal("anthropic"),
            v.literal("telegram"),
            v.literal("gmail"),
            v.literal("tavily"),
            v.literal("resend"),
            v.literal("github"),
            v.literal("notion"),
            v.literal("twitter"),
            v.literal("dalle")
        ),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("integrations")
            .withIndex("by_orgId", (q) => q.eq("orgId", args.orgId))
            .filter((q) => q.eq(q.field("type"), args.type))
            .unique();
    },
});

/**
 * internal:integrations:getByTypeForDepartment
 */
export const getByTypeForDepartment = internalQuery({
    args: {
        departmentId: v.id("departments"),
        type: v.union(
            v.literal("openai"),
            v.literal("anthropic"),
            v.literal("telegram"),
            v.literal("gmail"),
            v.literal("tavily"),
            v.literal("resend"),
            v.literal("github"),
            v.literal("notion"),
            v.literal("twitter"),
            v.literal("dalle")
        ),
    },
    handler: async (ctx, args) => {
        if (args.type === "telegram") {
            return await ctx.db
                .query("integrations")
                .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
                .filter((q) => q.eq(q.field("type"), "telegram"))
                .unique();
        }

        const dept = await ctx.db.get(args.departmentId);
        if (!dept) return null;

        if (dept.orgId) {
            const byOrg = await ctx.db
                .query("integrations")
                .withIndex("by_orgId", (q) => q.eq("orgId", dept.orgId))
                .filter((q) => q.eq(q.field("type"), args.type))
                .unique();
            if (byOrg) return byOrg;
        }

        return await ctx.db
            .query("integrations")
            .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
            .filter((q) => q.eq(q.field("type"), args.type))
            .unique();
    },
});

// --- Migrations ---

export const migrateToOrg = mutation({
    args: {},
    handler: async (ctx) => {
        const integrations = await ctx.db.query("integrations").collect();

        let migrated = 0;
        let skipped = 0;
        let missingDepartment = 0;
        let missingOrg = 0;

        for (const row of integrations) {
            if (row.orgId) {
                skipped += 1;
                continue;
            }

            if (!row.departmentId) {
                missingDepartment += 1;
                continue;
            }

            const dept = await ctx.db.get(row.departmentId);
            if (!dept) {
                missingDepartment += 1;
                continue;
            }

            if (!dept.orgId) {
                missingOrg += 1;
                continue;
            }

            await ctx.db.patch(row._id, { orgId: dept.orgId });
            migrated += 1;
        }

        return {
            ok: true,
            migrated,
            skipped,
            missingDepartment,
            missingOrg,
            total: integrations.length,
        };
    },
});

// --- Gmail OAuth (unified flow) ---

export const generateGmailAuthUrl = action({
    args: {
        departmentId: v.id("departments"),
        powers: v.array(v.union(v.literal("read"), v.literal("send"), v.literal("organize"))),
    },
    handler: async (
        ctx,
        args
    ): Promise<{ url: string; scopes: string[] }> => {
        // Delegate URL/scopes construction to the unified OAuth module.
        const response: any = await ctx.runAction(internal.tools.gmailOAuth.getAuthUrl, {
            departmentId: args.departmentId,
            powers: args.powers,
        });

        if (!response?.ok || typeof response.url !== "string") {
            throw new Error("Failed to generate Gmail OAuth URL.");
        }

        return {
            url: response.url,
            scopes: Array.isArray(response.scopes) ? response.scopes : [],
        };
    },
});

/**
 * patchConfigForDepartment
 * Atualiza (merge) config de uma integração por departmentId + type.
 */
export const patchConfigForDepartment = internalMutation({
    args: {
        departmentId: v.id("departments"),
        type: v.union(
            v.literal("openai"),
            v.literal("anthropic"),
            v.literal("telegram"),
            v.literal("gmail"),
            v.literal("tavily"),
            v.literal("resend"),
            v.literal("github"),
            v.literal("notion"),
            v.literal("twitter"),
            v.literal("dalle")
        ),
        patch: v.any(),
        authType: v.optional(v.string()),
        oauthStatus: v.optional(v.string()),
        lastError: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<{ ok: true }> => {
        const integration = await ctx.db
            .query("integrations")
            .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
            .filter((q) => q.eq(q.field("type"), args.type))
            .unique();

        if (!integration) {
            throw new Error(`Integration ${args.type} not found for department.`);
        }

        const mergedConfig = {
            ...(integration.config ?? {}),
            ...(args.patch ?? {}),
        };

        const patchDoc: Record<string, unknown> = {
            config: mergedConfig,
            lastSyncAt: Date.now(),
            lastError: typeof args.lastError === "string" ? args.lastError : "",
        };

        if (typeof args.authType === "string") {
            patchDoc.authType = args.authType;
        }
        if (typeof args.oauthStatus === "string") {
            patchDoc.oauthStatus = args.oauthStatus;
        }

        await ctx.db.patch(integration._id, patchDoc);

        return { ok: true };
    },
});

/**
 * Alias compatível com chamadas antigas:
 * internal.integrations.updateConfigForDepartment(...)
 */
export const updateConfigForDepartment = patchConfigForDepartment;
