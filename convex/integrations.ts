// /convex/integrations.ts

import {
    type ActionCtx,
    action,
    internalMutation,
    internalQuery,
    mutation,
    query,
} from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { assertIntegrationAllowed } from "./plans";
import {
    requireAuthenticatedUser,
    requireDepartmentOrgAdminMembership,
    requireDepartmentOrgMembership,
    requireDepartmentWithOrg,
    requireOrgAdminMembership,
    requireOrgMembership,
    type OrgRole,
} from "./lib/orgAuthorization";

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

const ORG_ADMIN_ROLES: ReadonlySet<OrgRole> = new Set(["owner", "admin"]);

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

async function assertActionOrgAdmin(
    ctx: ActionCtx,
    orgId: Id<"organizations">
): Promise<void> {
    const userOrgs = (await ctx.runQuery(api.organizations.listForUser, {})) as Array<{
        _id: Id<"organizations">;
        role: OrgRole;
    }>;
    const org = userOrgs.find((row) => row._id === orgId);
    if (!org) {
        throw new Error("Access denied: not a member of this organization.");
    }
    if (!ORG_ADMIN_ROLES.has(org.role)) {
        throw new Error("Access denied: admin or owner role required.");
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
        const userId = await requireAuthenticatedUser(ctx);
        await requireOrgMembership(ctx, userId, args.orgId);

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
        const userId = await requireAuthenticatedUser(ctx);
        await requireDepartmentOrgMembership(ctx, userId, args.departmentId);

        return await ctx.db
            .query("integrations")
            .withIndex("by_department_type", (q) =>
                q.eq("departmentId", args.departmentId).eq("type", args.type)
            )
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
        const userId = await requireAuthenticatedUser(ctx);

        if (type === "telegram" && !args.departmentId) {
            throw new Error("Telegram integration must be scoped to a department.");
        }

        let resolvedOrgId = args.orgId;
        if (args.departmentId) {
            const { department } = await requireDepartmentOrgAdminMembership(ctx, userId, args.departmentId);
            if (department.orgId !== args.orgId) {
                throw new Error("Department does not belong to the provided organization.");
            }
            resolvedOrgId = department.orgId;
        } else {
            await requireOrgAdminMembership(ctx, userId, args.orgId);
        }

        await assertIntegrationAllowed(ctx, resolvedOrgId, type);
        validateIntegrationConfig(type, args.config);

        let integration: any | null = null;

        if (type === "telegram") {
            integration = await ctx.db
                .query("integrations")
                .withIndex("by_department_type", (q) =>
                    q.eq("departmentId", args.departmentId!).eq("type", "telegram")
                )
                .unique();
        } else {
            // Para types globais, garantimos 1 por orgId+type
            integration = await ctx.db
                .query("integrations")
                .withIndex("by_org_type", (q) => q.eq("orgId", resolvedOrgId).eq("type", type))
                .unique();
            if (!integration && args.departmentId) {
                integration = await ctx.db
                    .query("integrations")
                    .withIndex("by_department_type", (q) =>
                        q.eq("departmentId", args.departmentId!).eq("type", type)
                    )
                    .unique();
            }
        }

        const patchBase: Record<string, unknown> = {
            name: args.name,
            config: args.config,
            orgId: resolvedOrgId,
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
                orgId: resolvedOrgId,
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
        const userId = await requireAuthenticatedUser(ctx);
        const integration = await ctx.db.get(args.id);
        if (!integration) throw new Error("Integration not found.");

        let orgId = integration.orgId ?? undefined;
        if (!orgId && integration.departmentId) {
            const department = await requireDepartmentWithOrg(ctx, integration.departmentId);
            orgId = department.orgId;
            await ctx.db.patch(integration._id, { orgId });
        }
        if (!orgId) {
            throw new Error("Integration is missing organization linkage.");
        }

        await requireOrgAdminMembership(ctx, userId, orgId);
        await ctx.db.delete(args.id);
        return true;
    },
});

// --- Internal Queries ---

export const isUserOrgAdmin = internalQuery({
    args: {
        orgId: v.id("organizations"),
        userId: v.id("users"),
    },
    handler: async (ctx, args) => {
        const membership = await ctx.db
            .query("orgMemberships")
            .withIndex("by_userId_orgId", (q) => q.eq("userId", args.userId).eq("orgId", args.orgId))
            .unique();
        if (!membership) return false;
        return membership.role === "owner" || membership.role === "admin";
    },
});

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
            .withIndex("by_org_type", (q) => q.eq("orgId", args.orgId).eq("type", args.type))
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
                .withIndex("by_department_type", (q) =>
                    q.eq("departmentId", args.departmentId).eq("type", "telegram")
                )
                .unique();
        }

        const dept = await ctx.db.get(args.departmentId);
        if (!dept) return null;

        if (dept.orgId) {
            const byOrg = await ctx.db
                .query("integrations")
                .withIndex("by_org_type", (q) => q.eq("orgId", dept.orgId).eq("type", args.type))
                .unique();
            if (byOrg) return byOrg;
        }

        return await ctx.db
            .query("integrations")
            .withIndex("by_department_type", (q) =>
                q.eq("departmentId", args.departmentId).eq("type", args.type)
            )
            .unique();
    },
});

// --- Migrations ---

export const migrateToOrg = internalMutation({
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
        orgId: v.id("organizations"),
        departmentId: v.id("departments"),
        powers: v.array(v.union(v.literal("read"), v.literal("send"), v.literal("organize"))),
    },
    handler: async (
        ctx,
        args
    ): Promise<{ url: string; scopes: string[] }> => {
        await assertActionOrgAdmin(ctx, args.orgId);
        const department = await ctx.runQuery(api.departments.get, {
            departmentId: args.departmentId,
        });
        if (!department) {
            throw new Error("Department not found.");
        }
        if (!department.orgId) {
            throw new Error("Department has no organization linked.");
        }
        if (department.orgId !== args.orgId) {
            throw new Error("Department does not belong to the provided organization.");
        }
        const initiatedByUserId = await ctx.runQuery(api.organizations.currentUserId, {});
        if (!initiatedByUserId) {
            throw new Error("Unauthorized");
        }

        // Delegate URL/scopes construction to the unified OAuth module.
        const response: any = await ctx.runAction(internal.tools.gmailOAuth.getAuthUrl, {
            orgId: args.orgId,
            departmentId: args.departmentId,
            powers: args.powers,
            initiatedByUserId,
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
            .withIndex("by_department_type", (q) =>
                q.eq("departmentId", args.departmentId).eq("type", args.type)
            )
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
        if (!integration.orgId) {
            const dept = await ctx.db.get(args.departmentId);
            if (dept?.orgId) {
                patchDoc.orgId = dept.orgId;
            }
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
