import { action, internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import OpenAI from "openai";
import { checkLimit } from "./plans";

const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_TEXT_LENGTH = 3500;

function toEmbeddingInput(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_TEXT_LENGTH) return normalized;
  return normalized.slice(0, MAX_TEXT_LENGTH);
}

async function createEmbedding(
  ctx: any,
  departmentId: Id<"departments">,
  text: string
): Promise<number[] | undefined> {
  const integration: any = await ctx.runQuery(internal.integrations.getByTypeForDepartment, {
    departmentId,
    type: "openai",
  });
  const apiKey = integration?.config?.key || process.env.OPENAI_API_KEY;
  if (!apiKey) return undefined;

  const openai = new OpenAI({ apiKey });
  const input = toEmbeddingInput(text);

  try {
    const result = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input,
    });
    return result.data?.[0]?.embedding;
  } catch {
    return undefined;
  }
}

export const createEntry = internalMutation({
  args: {
    title: v.string(),
    text: v.string(),
    fileStorageId: v.optional(v.id("_storage")),
    orgId: v.optional(v.id("organizations")),
    departmentId: v.id("departments"),
    embedding: v.optional(v.array(v.float64())),
    embeddingModel: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        filename: v.optional(v.string()),
        type: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const department = await ctx.db.get(args.departmentId);
    const orgId = department?.orgId ?? args.orgId;
    if (!orgId) throw new Error("Department has no organization linked.");
    await checkLimit(ctx, orgId, "docs");

    const now = Date.now();
    const id = await ctx.db.insert("knowledgeBase", {
      title: args.title,
      text: args.text,
      fileStorageId: args.fileStorageId,
      orgId: args.orgId,
      departmentId: args.departmentId,
      embedding: args.embedding,
      embeddingModel: args.embeddingModel,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

export const listByDepartment = query({
  args: {
    departmentId: v.id("departments"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
    const rows = await ctx.db
      .query("knowledgeBase")
      .withIndex("by_department_createdAt", (q) => q.eq("departmentId", args.departmentId))
      .order("desc")
      .take(limit);

    return rows.map((row) => ({
      ...row,
      source: row.fileStorageId ? "File" : "Manual",
    }));
  },
});

export const remove = mutation({
  args: {
    id: v.id("knowledgeBase"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return { ok: true, deleted: false };

    if (row.fileStorageId) {
      await ctx.storage.delete(row.fileStorageId);
    }

    await ctx.db.delete(args.id);
    return { ok: true, deleted: true };
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const ingestText = action({
  args: {
    departmentId: v.id("departments"),
    title: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args): Promise<{ id: Id<"knowledgeBase"> }> => {
    const cleanText = args.text.trim();
    if (!cleanText) throw new Error("Texto vazio.");

    const department: any = await ctx.runQuery(internal.tools.knowledge.getDepartment, {
      departmentId: args.departmentId,
    });

    const embedding = await createEmbedding(ctx, args.departmentId, cleanText);

    const result = await ctx.runMutation(internal.knowledge.createEntry, {
      title: args.title || "Manual Knowledge",
      text: cleanText,
      departmentId: args.departmentId,
      orgId: department?.orgId,
      embedding,
      embeddingModel: embedding ? EMBEDDING_MODEL : undefined,
      metadata: { type: "text/manual" },
    });

    return { id: result.id };
  },
});
