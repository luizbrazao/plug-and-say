import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Get the authenticated user's review for a template.
 */
export const getMyReview = query({
    args: {
        templateId: v.id("agentTemplates"),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) return null;

        return await ctx.db
            .query("reviews")
            .withIndex("by_user_template", (q) =>
                q.eq("userId", userId).eq("templateId", args.templateId)
            )
            .unique();
    },
});

/**
 * Submit or update a review (1 to 5 stars), then update template average rating.
 */
export const submitReview = mutation({
    args: {
        templateId: v.id("agentTemplates"),
        rating: v.number(),
        comment: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        const rating = Number(args.rating);
        if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
            throw new Error("Rating must be a number between 1 and 5.");
        }

        const template = await ctx.db.get(args.templateId);
        if (!template) throw new Error("Template not found.");

        const now = Date.now();
        const existing = await ctx.db
            .query("reviews")
            .withIndex("by_user_template", (q) =>
                q.eq("userId", userId).eq("templateId", args.templateId)
            )
            .unique();

        if (existing) {
            await ctx.db.patch(existing._id, {
                rating,
                comment: args.comment?.trim() || undefined,
                updatedAt: now,
            });
        } else {
            await ctx.db.insert("reviews", {
                templateId: args.templateId,
                userId,
                rating,
                comment: args.comment?.trim() || undefined,
                createdAt: now,
                updatedAt: now,
            });
        }

        const reviews = await ctx.db
            .query("reviews")
            .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
            .collect();

        const sum = reviews.reduce((acc, review) => acc + Number(review.rating || 0), 0);
        const average = reviews.length > 0 ? sum / reviews.length : 0;

        await ctx.db.patch(args.templateId, { rating: average });

        return {
            ok: true,
            averageRating: average,
            totalReviews: reviews.length,
            myRating: rating,
        };
    },
});
