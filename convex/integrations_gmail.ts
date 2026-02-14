// convex/integrations_gmail.ts

import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { assertIntegrationAllowed } from "./plans";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
    requireAuthenticatedUser,
    requireDepartmentWithOrg,
    requireOrgAdminMembership,
} from "./lib/orgAuthorization";

async function assertDepartmentMatchesOrg(
    ctx: MutationCtx,
    departmentId: Id<"departments"> | undefined,
    orgId: Id<"organizations">
): Promise<void> {
    if (!departmentId) return;
    const department = await requireDepartmentWithOrg(ctx, departmentId);
    if (department.orgId !== orgId) {
        throw new Error("Department does not belong to the provided organization.");
    }
}

export const gmailUpsertConfigForDepartment = mutation({
    args: {
        orgId: v.id("organizations"),
        departmentId: v.optional(v.id("departments")),
        name: v.optional(v.string()),
        clientId: v.string(),
        clientSecret: v.string(),
        redirectUri: v.string(), // ex: https://<deployment>.convex.site/oauth/gmail/callback
        appReturnUrl: v.optional(v.string()), // ex: http://localhost:5173/settings/integrations
    },
    handler: async (ctx, args) => {
        const userId = await requireAuthenticatedUser(ctx);
        await requireOrgAdminMembership(ctx, userId, args.orgId);
        await assertDepartmentMatchesOrg(ctx, args.departmentId, args.orgId);
        await assertIntegrationAllowed(ctx, args.orgId, "gmail");

        const existing = await ctx.db
            .query("integrations")
            .withIndex("by_org_type", (q) => q.eq("orgId", args.orgId).eq("type", "gmail"))
            .unique();

        const safeName = args.name?.trim() || "Gmail";
        const config = {
            ...(existing?.config ?? {}),
            clientId: args.clientId.trim(),
            clientSecret: args.clientSecret.trim(),
            redirectUri: args.redirectUri.trim(),
            appReturnUrl: args.appReturnUrl?.trim() || "http://localhost:5173/settings/integrations",
            oauthContextDepartmentId: args.departmentId ? String(args.departmentId) : undefined,
        };

        if (existing) {
            await ctx.db.patch(existing._id, {
                name: safeName,
                type: "gmail",
                config,
                authType: "oauth2",
                oauthStatus: existing.oauthStatus ?? "not_connected",
                orgId: args.orgId,
                departmentId: undefined,
                lastSyncAt: Date.now(),
                lastError: "",
            });
            return { ok: true, created: false, id: existing._id };
        }

        const id = await ctx.db.insert("integrations", {
            departmentId: undefined,
            orgId: args.orgId,
            name: safeName,
            type: "gmail",
            config,
            authType: "oauth2",
            oauthStatus: "not_connected",
            lastSyncAt: Date.now(),
            lastError: "",
            createdAt: Date.now(),
        });

        return { ok: true, created: true, id };
    },
});

export const gmailDisconnectForDepartment = mutation({
    args: {
        orgId: v.id("organizations"),
        departmentId: v.optional(v.id("departments")),
    },
    handler: async (ctx, args) => {
        const userId = await requireAuthenticatedUser(ctx);
        await requireOrgAdminMembership(ctx, userId, args.orgId);
        await assertDepartmentMatchesOrg(ctx, args.departmentId, args.orgId);

        const existing = await ctx.db
            .query("integrations")
            .withIndex("by_org_type", (q) => q.eq("orgId", args.orgId).eq("type", "gmail"))
            .unique();

        if (!existing) return { ok: true, disconnected: false };

        const cfg = existing.config ?? {};
        const cleaned = {
            ...cfg,
            accessToken: undefined,
            refreshToken: undefined,
            tokenExpiresAt: undefined,
            scopes: undefined,
            powers: undefined,
            connectedAt: undefined,
            oauthIntent: undefined,
        };

        await ctx.db.patch(existing._id, {
            config: cleaned,
            oauthStatus: "not_connected",
            orgId: args.orgId,
            departmentId: undefined,
            lastSyncAt: Date.now(),
            lastError: "",
        });

        return { ok: true, disconnected: true };
    },
});
