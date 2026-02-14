import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Lista notificações ainda não entregues
 * para um sessionKey (agente), em ordem cronológica por createdAt.
 *
 * Usa índice: by_mentioned_delivered_createdAt
 * (mentionedSessionKey, delivered, createdAt)
 */
export const listUndeliveredBySessionKey = query({
    args: {
        departmentId: v.id("departments"),
        mentionedSessionKey: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 10;

        return await ctx.db
            .query("notifications")
            .withIndex("by_department_mentioned_delivered_createdAt", (q) =>
                q
                    .eq("departmentId", args.departmentId)
                    .eq("mentionedSessionKey", args.mentionedSessionKey)
                    .eq("delivered", false)
            )
            .order("desc")
            .take(limit);
    },
});

/**
 * Marca notificação como entregue (idempotente)
 */
export const markDelivered = mutation({
    args: {
        notificationId: v.id("notifications"),
        deliveredAt: v.optional(v.float64()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();

        const notification = await ctx.db.get(args.notificationId);
        if (!notification) {
            throw new Error("Notification não encontrada.");
        }

        if (notification.delivered) {
            return { ok: true, alreadyDelivered: true };
        }

        await ctx.db.patch(args.notificationId, {
            delivered: true,
            deliveredAt: args.deliveredAt ?? now,
        });

        return { ok: true, alreadyDelivered: false };
    },
});

/**
 * Idempotent creation of notifications.
 * Can be triggered by mentions or subscriptions.
 */
export const createIfNotExists = mutation({
    args: {
        departmentId: v.id("departments"),
        mentionedSessionKey: v.string(),
        content: v.string(),
        taskId: v.optional(v.id("tasks")),
        source: v.optional(v.union(v.literal("mention"), v.literal("subscription"))),
        sourceMessageId: v.optional(v.id("messages")),
    },
    handler: async (ctx, args) => {
        const now = Date.now();

        if (args.sourceMessageId) {
            const existing = await ctx.db
                .query("notifications")
                .withIndex("by_message_recipient", (q) =>
                    q
                        .eq("sourceMessageId", args.sourceMessageId)
                        .eq("mentionedSessionKey", args.mentionedSessionKey)
                )
                .unique();

            if (existing) {
                return {
                    ok: true,
                    existed: true,
                    notificationId: existing._id,
                };
            }
        }

        const notificationId = await ctx.db.insert("notifications", {
            departmentId: args.departmentId,
            mentionedSessionKey: args.mentionedSessionKey,
            content: args.content,
            delivered: false,
            createdAt: now,
            deliveredAt: undefined,
            taskId: args.taskId,
            source: args.source,
            sourceMessageId: args.sourceMessageId,
        });

        return {
            ok: true,
            existed: false,
            notificationId,
        };
    },
});
