// convex/integrations_gmail.ts

import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const gmailUpsertConfigForDepartment = mutation({
    args: {
        departmentId: v.id("departments"),
        name: v.optional(v.string()),

        clientId: v.string(),
        clientSecret: v.string(),
        redirectUri: v.string(), // ex: https://ceaseless-lion-963.convex.site/oauth/gmail/callback
        appReturnUrl: v.optional(v.string()), // ex: http://localhost:5173/settings/integrations
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        // Busca integração gmail do dept
        const existing = await ctx.db
            .query("integrations")
            .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
            .filter((q) => q.eq(q.field("type"), "gmail"))
            .unique();

        const safeName = args.name?.trim() || "Gmail";

        const config = {
            ...(existing?.config ?? {}),
            clientId: args.clientId.trim(),
            clientSecret: args.clientSecret.trim(),
            redirectUri: args.redirectUri.trim(),
            appReturnUrl: args.appReturnUrl?.trim() || "http://localhost:5173/settings/integrations",
            // NÃO cria tokens aqui; tokens entram no callback depois do OAuth
        };

        if (existing) {
            await ctx.db.patch(existing._id, {
                name: safeName,
                type: "gmail",
                config,
                authType: "oauth2",
                oauthStatus: existing.oauthStatus ?? "not_connected",
                lastSyncAt: Date.now(),
                lastError: "",
            });
            return { ok: true, created: false, id: existing._id };
        }

        const id = await ctx.db.insert("integrations", {
            departmentId: args.departmentId,
            orgId: undefined,
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
        departmentId: v.id("departments"),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        const existing = await ctx.db
            .query("integrations")
            .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
            .filter((q) => q.eq(q.field("type"), "gmail"))
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
        };

        await ctx.db.patch(existing._id, {
            config: cleaned,
            oauthStatus: "not_connected",
            lastSyncAt: Date.now(),
            lastError: "",
        });

        return { ok: true, disconnected: true };
    },
});
