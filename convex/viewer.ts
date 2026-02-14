import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;
        const userId = await getAuthUserId(ctx);
        const user = userId ? await ctx.db.get(userId) : null;
        const profile =
            userId
                ? await ctx.db
                    .query("userProfiles")
                    .withIndex("by_userId", (q) => q.eq("userId", userId))
                    .first()
                : null;
        const avatarUrl = profile?.avatarStorageId
            ? await ctx.storage.getUrl(profile.avatarStorageId)
            : null;

        return {
            userId: userId ?? null,
            name: profile?.displayName ?? (user as any)?.name ?? identity.name ?? null,
            email: profile?.email ?? (user as any)?.email ?? identity.email ?? null,
            subject: identity.subject ?? null,
            role: profile?.role ?? null,
            language: profile?.language ?? null,
            avatarUrl,
            avatarStorageId: profile?.avatarStorageId ?? null,
        };
    },
});

export const generateAvatarUploadUrl = mutation({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");
        return await ctx.storage.generateUploadUrl();
    },
});

export const updateProfile = mutation({
    args: {
        displayName: v.string(),
        email: v.string(),
        role: v.string(),
        language: v.string(),
        avatarStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        const now = Date.now();
        const existing = await ctx.db
            .query("userProfiles")
            .withIndex("by_userId", (q) => q.eq("userId", userId))
            .first();

        const patch: Record<string, unknown> = {
            displayName: args.displayName.trim(),
            email: args.email.trim(),
            role: args.role.trim(),
            language: args.language.trim(),
            updatedAt: now,
        };

        if (args.avatarStorageId !== undefined) {
            if (args.avatarStorageId === null) {
                patch.avatarStorageId = undefined;
            } else {
                patch.avatarStorageId = args.avatarStorageId;
            }
        }

        if (existing) {
            await ctx.db.patch(existing._id, patch);
            return { ok: true, profileId: existing._id };
        }

        const profileId = await ctx.db.insert("userProfiles", {
            userId,
            displayName: args.displayName.trim(),
            email: args.email.trim(),
            role: args.role.trim(),
            language: args.language.trim(),
            avatarStorageId: args.avatarStorageId === null ? undefined : args.avatarStorageId,
            createdAt: now,
            updatedAt: now,
        });
        return { ok: true, profileId };
    },
});

export const ensureProfileFromAuth = mutation({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        const user: any = await ctx.db.get(userId);
        const existing = await ctx.db
            .query("userProfiles")
            .withIndex("by_userId", (q) => q.eq("userId", userId))
            .first();

        const passwordAccount = await ctx.db
            .query("authAccounts")
            .withIndex("userIdAndProvider", (q) => q.eq("userId", userId).eq("provider", "password"))
            .first();

        const emailFromAccount =
            typeof passwordAccount?.providerAccountId === "string" && passwordAccount.providerAccountId.includes("@")
                ? passwordAccount.providerAccountId.trim()
                : "";
        const emailFromUser = typeof user?.email === "string" ? user.email.trim() : "";
        const nameFromUser = typeof user?.name === "string" ? user.name.trim() : "";

        const finalEmail = existing?.email?.trim() || emailFromUser || emailFromAccount || "";
        const finalName = existing?.displayName?.trim() || nameFromUser || (finalEmail ? finalEmail.split("@")[0] : "");

        const now = Date.now();
        if (existing) {
            const patch: Record<string, unknown> = { updatedAt: now };
            if (!existing.email && finalEmail) patch.email = finalEmail;
            if (!existing.displayName && finalName) patch.displayName = finalName;
            if (!existing.role) patch.role = "Operator";
            if (!existing.language) patch.language = "pt-BR";
            await ctx.db.patch(existing._id, patch);
            return { ok: true, profileId: existing._id };
        }

        const profileId = await ctx.db.insert("userProfiles", {
            userId,
            displayName: finalName || undefined,
            email: finalEmail || undefined,
            role: "Operator",
            language: "pt-BR",
            createdAt: now,
            updatedAt: now,
        });
        return { ok: true, profileId };
    },
});
