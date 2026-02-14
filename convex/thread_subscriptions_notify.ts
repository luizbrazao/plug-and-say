import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

export const notifySubscribersOfMessage = mutation({
    args: {
        taskId: v.id("tasks"),
        messageId: v.id("messages"),
        authorSessionKey: v.string(),
        contentPreview: v.string(),
    },
    handler: async (ctx, args) => {
        const task = await ctx.db.get("tasks", args.taskId);
        if (!task) throw new Error("Task não encontrada.");

        const subs = await ctx.db
            .query("thread_subscriptions")
            .withIndex("by_department_taskId", (q) => q.eq("departmentId", task.departmentId).eq("taskId", args.taskId))
            .collect();

        // Quem deve receber: inscritos, exceto o autor
        const recipients = subs
            .map((s) => s.sessionKey)
            .filter((k) => k !== args.authorSessionKey);

        let created = 0;

        for (const mentionedSessionKey of recipients) {
            const payload =
                `[PlugandSay]\n` +
                `Nova mensagem na task ${args.taskId}\n` +
                `De: ${args.authorSessionKey}\n\n` +
                `${args.contentPreview}`;

            const res = await ctx.runMutation(api.notifications.createIfNotExists, {
                departmentId: task.departmentId as Id<"departments">,
                mentionedSessionKey,
                content: payload,
                taskId: args.taskId,
                source: "subscription",
                sourceMessageId: args.messageId,
            });

            if (!res.existed) created += 1;
        }

        return { ok: true, recipients: recipients.length, created };
    },
});
