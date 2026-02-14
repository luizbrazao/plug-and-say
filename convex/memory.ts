import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_EMBED_INPUT_CHARS = 12000;

function toEmbeddingInput(text: string): string {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length <= MAX_EMBED_INPUT_CHARS) return normalized;
    return normalized.slice(0, MAX_EMBED_INPUT_CHARS);
}

/**
 * internal:memory:getTaskForEmbedding
 */
export const getTaskForEmbedding = internalQuery({
    args: { taskId: v.id("tasks") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.taskId);
    },
});

/**
 * internal:memory:getDocumentForEmbedding
 */
export const getDocumentForEmbedding = internalQuery({
    args: { documentId: v.id("aiAssets") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.documentId);
    },
});

/**
 * internal:memory:saveTaskEmbedding
 */
export const saveTaskEmbedding = internalMutation({
    args: {
        taskId: v.id("tasks"),
        embedding: v.array(v.float64()),
        embeddingModel: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch("tasks", args.taskId, {
            embedding: args.embedding,
            embeddingModel: args.embeddingModel,
            embeddedAt: Date.now(),
        });
        return { ok: true };
    },
});

/**
 * internal:memory:saveDocumentEmbedding
 */
export const saveDocumentEmbedding = internalMutation({
    args: {
        documentId: v.id("aiAssets"),
        embedding: v.array(v.float64()),
        embeddingModel: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch("aiAssets", args.documentId, {
            embedding: args.embedding,
            embeddingModel: args.embeddingModel,
            embeddedAt: Date.now(),
        });
        return { ok: true };
    },
});

/**
 * internal:memory:embedTask
 */
export const embedTask = internalAction({
    args: { taskId: v.id("tasks") },
    handler: async (ctx, args) => {
        const task: any = await ctx.runQuery(internal.memory.getTaskForEmbedding, {
            taskId: args.taskId,
        });
        if (!task) return { ok: false, reason: "Task not found" };
        if (!task.departmentId) return { ok: false, reason: "Task has no departmentId" };

        const integration: any = await ctx.runQuery(internal.integrations.getByTypeForDepartment, {
            departmentId: task.departmentId,
            type: "openai",
        });
        const apiKey = integration?.config?.key || integration?.config?.token;
        if (!apiKey) {
            throw new Error("OpenAI integration key is not configured for this department.");
        }

        const openai = new OpenAI({ apiKey });
        const input = toEmbeddingInput(
            [
                `Task: ${task.title || ""}`,
                `Description: ${task.description || ""}`,
                `Status: ${task.status || ""}`,
                `Priority: ${task.priority || ""}`,
                `Tags: ${Array.isArray(task.tags) ? task.tags.join(", ") : ""}`,
            ].join("\n")
        );

        const result = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input,
        });
        const embedding = result.data[0]?.embedding;
        if (!embedding) throw new Error("OpenAI returned an empty embedding for task.");

        await ctx.runMutation(internal.memory.saveTaskEmbedding, {
            taskId: args.taskId,
            embedding,
            embeddingModel: EMBEDDING_MODEL,
        });

        return { ok: true, dimensions: embedding.length };
    },
});

/**
 * internal:memory:embedDocument
 */
export const embedDocument = internalAction({
    args: { documentId: v.id("aiAssets") },
    handler: async (ctx, args) => {
        const doc: any = await ctx.runQuery(internal.memory.getDocumentForEmbedding, {
            documentId: args.documentId,
        });
        if (!doc) return { ok: false, reason: "Document not found" };
        if (!doc.departmentId) return { ok: false, reason: "Document has no departmentId" };

        const integration: any = await ctx.runQuery(internal.integrations.getByTypeForDepartment, {
            departmentId: doc.departmentId,
            type: "openai",
        });
        const apiKey = integration?.config?.key || integration?.config?.token;
        if (!apiKey) {
            throw new Error("OpenAI integration key is not configured for this department.");
        }

        const openai = new OpenAI({ apiKey });
        const input = toEmbeddingInput(
            [
                `Document: ${doc.title || ""}`,
                `Type: ${doc.type || ""}`,
                `Content: ${doc.content || ""}`,
            ].join("\n")
        );

        const result = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input,
        });
        const embedding = result.data[0]?.embedding;
        if (!embedding) throw new Error("OpenAI returned an empty embedding for document.");

        await ctx.runMutation(internal.memory.saveDocumentEmbedding, {
            documentId: args.documentId,
            embedding,
            embeddingModel: EMBEDDING_MODEL,
        });

        return { ok: true, dimensions: embedding.length };
    },
});

/**
 * internal:memory:backfill
 * Finds tasks/documents without embeddings and schedules async embedding jobs.
 */
export const backfill = internalMutation({
    args: {
        departmentId: v.optional(v.id("departments")),
        limitPerTable: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = Math.max(1, Math.min(args.limitPerTable ?? 100, 1000));

        let tasks = await ctx.db.query("tasks").collect();
        let docs = await ctx.db.query("aiAssets").collect();

        if (args.departmentId) {
            tasks = tasks.filter((t) => t.departmentId === args.departmentId);
            docs = docs.filter((d) => d.departmentId === args.departmentId);
        }

        const pendingTasks = tasks
            .filter((t) => !t.embedding && t.departmentId)
            .slice(0, limit);
        const pendingDocs = docs
            .filter((d) => !d.embedding && d.departmentId)
            .slice(0, limit);

        for (const task of pendingTasks) {
            await ctx.scheduler.runAfter(0, internal.memory.embedTask, {
                taskId: task._id,
            });
        }

        for (const doc of pendingDocs) {
            await ctx.scheduler.runAfter(0, internal.memory.embedDocument, {
                documentId: doc._id,
            });
        }

        return {
            scheduledTasks: pendingTasks.length,
            scheduledDocuments: pendingDocs.length,
        };
    },
});
