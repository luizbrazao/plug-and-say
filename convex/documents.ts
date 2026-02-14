import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const create = mutation({
    args: {
        title: v.string(),
        content: v.string(),
        type: v.union(
            v.literal("deliverable"),
            v.literal("research"),
            v.literal("protocol"),
            v.literal("note")
        ),
        departmentId: v.id("departments"),
        taskId: v.optional(v.id("tasks")),
        createdBySessionKey: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();

        // se taskId foi enviado, valida existência
        if (args.taskId) {
            const task = await ctx.db.get("tasks", args.taskId);
            if (!task) {
                throw new Error("Task não encontrada (taskId inválido).");
            }
        }

        const documentId = await ctx.db.insert("aiAssets", {
            departmentId: args.departmentId,
            title: args.title,
            content: args.content,
            type: args.type,
            taskId: args.taskId,
            createdAt: now,
            createdBySessionKey: args.createdBySessionKey,
        });

        // log activity se houver task
        if (args.taskId) {
            await ctx.db.insert("activities", {
                departmentId: args.departmentId,
                type: "document_created",
                message: `Documento criado: ${args.title}`,
                sessionKey: args.createdBySessionKey,
                taskId: args.taskId,
                createdAt: now,
            });
        }

        // Long-term memory: embed every new document
        await ctx.scheduler.runAfter(0, internal.memory.embedDocument, {
            documentId,
        });

        return { documentId };
    },
});

/**
 * (Opcional) List docs by task (mais novos primeiro)
 */
export const listByTask = query({
    args: {
        taskId: v.id("tasks"),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 20;

        const task = await ctx.db.get("tasks", args.taskId);
        if (!task) throw new Error("Task não encontrada.");

        const docs = await ctx.db
            .query("aiAssets")
            .withIndex("by_department_taskId", (q) =>
                q.eq("departmentId", task.departmentId).eq("taskId", args.taskId)
            )
            .collect();

        docs.sort((a, b) => b.createdAt - a.createdAt);
        return docs.slice(0, limit);
    },
});

/**
 * List docs for a department (global docs view for current workspace).
 */
export const listByDepartment = query({
    args: {
        departmentId: v.id("departments"),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 100;
        const docs = await ctx.db
            .query("aiAssets")
            .withIndex("by_department_taskId", (q) =>
                q.eq("departmentId", args.departmentId)
            )
            .collect();
        docs.sort((a, b) => b.createdAt - a.createdAt);
        return docs.slice(0, limit);
    },
});
