import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Inscreve (idempotente) um sessionKey em uma task
 */
export const upsert = mutation({
    args: {
        taskId: v.id("tasks"),
        sessionKey: v.string(),
        reason: v.optional(
            v.union(
                v.literal("commented"),
                v.literal("assigned"),
                v.literal("mentioned"),
                v.literal("manual")
            )
        ),
    },
    handler: async (ctx, args) => {
        const now = Date.now();

        const task = await ctx.db.get("tasks", args.taskId);
        if (!task) throw new Error("Task não encontrada.");

        const existing = await ctx.db
            .query("thread_subscriptions")
            .withIndex("by_dept_task_sessionKey", (q) =>
                q.eq("departmentId", task.departmentId).eq("taskId", args.taskId).eq("sessionKey", args.sessionKey)
            )
            .unique();

        if (existing) {
            return { ok: true, existed: true };
        }

        await ctx.db.insert("thread_subscriptions", {
            departmentId: task.departmentId,
            taskId: args.taskId,
            sessionKey: args.sessionKey,
            subscribedAt: now,
            reason: args.reason,
        });

        return { ok: true, existed: false };
    },
});

/**
 * Lista inscritos de uma task
 */
export const listByTask = query({
    args: {
        taskId: v.id("tasks"),
    },
    handler: async (ctx, args) => {
        const task = await ctx.db.get("tasks", args.taskId);
        if (!task) throw new Error("Task não encontrada.");

        return ctx.db
            .query("thread_subscriptions")
            .withIndex("by_department_taskId", (q) =>
                q.eq("departmentId", task.departmentId).eq("taskId", args.taskId)
            )
            .collect();
    },
});
