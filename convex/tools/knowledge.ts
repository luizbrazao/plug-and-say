import { internalAction, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const SNIPPET_MAX = 1200;
const QUERY_WINDOW = 260;
const KNOWLEDGE_CHUNK_SIZE = 900;
const KNOWLEDGE_MAX_CONTEXT = 5200;

function clampLimit(limit?: number): number {
    const n = limit ?? DEFAULT_LIMIT;
    return Math.max(1, Math.min(n, MAX_LIMIT));
}

function compactSnippet(text: string): string {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length <= SNIPPET_MAX) return normalized;
    return `${normalized.slice(0, SNIPPET_MAX)}...`;
}

function extractQuerySnippet(text: string, query: string): string {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return "";

    const normalizedLower = normalized.toLowerCase();
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return compactSnippet(normalized);

    const segments: string[] = [];
    const usedRanges: Array<{ start: number; end: number }> = [];

    for (const token of queryTokens) {
        const idx = normalizedLower.indexOf(token);
        if (idx === -1) continue;

        const start = Math.max(0, idx - QUERY_WINDOW);
        const end = Math.min(normalized.length, idx + token.length + QUERY_WINDOW);
        const overlaps = usedRanges.some((range) => !(end < range.start || start > range.end));
        if (overlaps) continue;

        usedRanges.push({ start, end });
        segments.push(normalized.slice(start, end).trim());
        if (segments.length >= 3) break;
    }

    if (segments.length === 0) return compactSnippet(normalized);

    const merged = segments.join(" ... ");
    if (merged.length <= SNIPPET_MAX) return merged;
    return `${merged.slice(0, SNIPPET_MAX)}...`;
}

function chunkText(text: string, chunkSize: number): string[] {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return [];
    const chunks: string[] = [];
    for (let i = 0; i < normalized.length; i += chunkSize) {
        chunks.push(normalized.slice(i, i + chunkSize));
    }
    return chunks;
}

function buildKnowledgeSnippet(text: string, query: string): string {
    const chunks = chunkText(text, KNOWLEDGE_CHUNK_SIZE);
    if (chunks.length === 0) return "";
    if (chunks.length === 1) return compactSnippet(chunks[0]);

    const queryTokens = tokenize(query);
    const chunkScores = chunks.map((chunk, idx) => {
        const tokenSet = new Set(tokenize(chunk));
        const overlap = queryTokens.filter((token) => tokenSet.has(token)).length;
        return { idx, overlap };
    });
    chunkScores.sort((a, b) => b.overlap - a.overlap);

    const firstIdx = 0;
    const middleIdx = Math.floor(chunks.length / 2);
    const endIdx = Math.max(0, chunks.length - 1);
    const bestIdx = chunkScores[0]?.idx ?? 0;

    const picked = [firstIdx, bestIdx, middleIdx, endIdx]
        .filter((idx, pos, arr) => arr.indexOf(idx) === pos)
        .map((idx) => chunks[idx]);

    const merged = picked.join(" ... ");
    if (merged.length <= KNOWLEDGE_MAX_CONTEXT) return merged;
    return `${merged.slice(0, KNOWLEDGE_MAX_CONTEXT)}...`;
}

function titleOverlapBoost(title: string, query: string): number {
    const titleTokens = new Set(tokenize(title));
    const queryTokens = tokenize(query);
    if (titleTokens.size === 0 || queryTokens.length === 0) return 0;
    const overlap = queryTokens.filter((t) => titleTokens.has(t)).length;
    if (overlap === 0) return 0;
    return Math.min(0.55, overlap * 0.18);
}

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length >= 3);
}

/**
 * internal:tools:knowledge:getDepartment
 */
export const getDepartment = internalQuery({
    args: { departmentId: v.id("departments") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.departmentId);
    },
});

/**
 * internal:tools:knowledge:fetchDocumentsByIds
 */
export const fetchDocumentsByIds = internalQuery({
    args: {
        ids: v.array(v.id("aiAssets")),
    },
    handler: async (ctx, args) => {
        const docs = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
        return docs.filter(Boolean);
    },
});

/**
 * internal:tools:knowledge:fetchKnowledgeByIds
 */
export const fetchKnowledgeByIds = internalQuery({
    args: {
        ids: v.array(v.id("knowledgeBase")),
    },
    handler: async (ctx, args) => {
        const rows = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
        return rows.filter(Boolean);
    },
});

/**
 * internal:tools:knowledge:fetchTasksByIds
 */
export const fetchTasksByIds = internalQuery({
    args: {
        ids: v.array(v.id("tasks")),
    },
    handler: async (ctx, args) => {
        const tasks = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
        return tasks.filter(Boolean);
    },
});

/**
 * internal:tools:knowledge:listKnowledgeByDepartment
 */
export const listKnowledgeByDepartment = internalQuery({
    args: {
        departmentId: v.id("departments"),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const rows = await ctx.db
            .query("knowledgeBase")
            .withIndex("by_department_createdAt", (q) => q.eq("departmentId", args.departmentId))
            .collect();
        rows.sort((a, b) => b.createdAt - a.createdAt);
        return rows.slice(0, args.limit ?? 200);
    },
});

/**
 * internal:tools:knowledge:searchKnowledge
 * Searches long-term memory across knowledgeBase, aiAssets and tasks.
 */
export const searchKnowledge = internalAction({
    args: {
        departmentId: v.id("departments"),
        query: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = clampLimit(args.limit);
        const queryText = args.query.trim();
        if (!queryText) {
            throw new Error("Tool 'search_knowledge' requires a non-empty 'query' string.");
        }

        console.log(`[TOOL: search_knowledge] Querying memory: ${queryText}`);

        const department: any = await ctx.runQuery(internal.tools.knowledge.getDepartment, {
            departmentId: args.departmentId,
        });
        if (!department) throw new Error("Department not found.");

        const integration: any = await ctx.runQuery(internal.integrations.getByTypeForDepartment, {
            departmentId: args.departmentId,
            type: "openai",
        });
        const apiKey = integration?.config?.key || integration?.config?.token;

        let knowledgeHits: any[] = [];
        let assetHits: any[] = [];
        let taskHits: any[] = [];

        if (apiKey) {
            try {
                const openai = new OpenAI({ apiKey });
                const embeddingResponse = await openai.embeddings.create({
                    model: EMBEDDING_MODEL,
                    input: queryText,
                });
                const queryEmbedding = embeddingResponse.data[0]?.embedding;
                if (queryEmbedding) {
                    [knowledgeHits, assetHits, taskHits] = await Promise.all([
                        ctx.vectorSearch("knowledgeBase", "by_embedding", {
                            vector: queryEmbedding,
                            limit: Math.min(limit * 4, 40),
                            filter: (q) => q.eq("departmentId", args.departmentId),
                        }),
                        ctx.vectorSearch("aiAssets", "by_embedding", {
                            vector: queryEmbedding,
                            limit: Math.min(limit * 3, 30),
                            filter: (q) => q.eq("departmentId", args.departmentId),
                        }),
                        ctx.vectorSearch("tasks", "by_embedding", {
                            vector: queryEmbedding,
                            limit: Math.min(limit * 3, 30),
                            filter: (q) => q.eq("departmentId", args.departmentId),
                        }),
                    ]);
                }
            } catch (error: any) {
                console.warn("[search_knowledge] embedding/vector path failed, using lexical fallback only:", error?.message || error);
            }
        }

        const docs: any[] = await ctx.runQuery(internal.tools.knowledge.fetchDocumentsByIds, {
            ids: assetHits.map((hit) => hit._id),
        });
        const knowledgeRows: any[] = await ctx.runQuery(internal.tools.knowledge.fetchKnowledgeByIds, {
            ids: knowledgeHits.map((hit) => hit._id),
        });
        const tasks: any[] = await ctx.runQuery(internal.tools.knowledge.fetchTasksByIds, {
            ids: taskHits.map((hit) => hit._id),
        });

        const docById = new Map(docs.map((doc) => [doc._id, doc]));
        const kbById = new Map(knowledgeRows.map((row) => [row._id, row]));
        const taskById = new Map(tasks.map((task) => [task._id, task]));

        const orgId = department.orgId;

        const memoryRows: Array<{
            kind: "knowledge" | "asset" | "task";
            id: string;
            title: string;
            snippet: string;
            date: number;
            score: number;
        }> = [];

        for (const hit of knowledgeHits) {
            const row = kbById.get(hit._id);
            if (!row) continue;
            if (row.departmentId !== args.departmentId) continue;
            if (orgId && row.orgId && row.orgId !== orgId) continue;
            memoryRows.push({
                kind: "knowledge",
                id: String(row._id),
                title: row.title || "Untitled knowledge",
                snippet: buildKnowledgeSnippet(String(row.text || ""), queryText),
                date: row.updatedAt || row.createdAt || row._creationTime || Date.now(),
                // Boost knowledge base so factual docs are prioritized.
                score: hit._score + 0.2 + titleOverlapBoost(String(row.title ?? ""), queryText),
            });
        }

        for (const hit of assetHits) {
            const doc = docById.get(hit._id);
            if (!doc) continue;
            if (doc.departmentId !== args.departmentId) continue;
            if (orgId && doc.orgId && doc.orgId !== orgId) continue;
            memoryRows.push({
                kind: "asset",
                id: String(doc._id),
                title: doc.title || "Untitled document",
                snippet: extractQuerySnippet(String(doc.content || ""), queryText),
                date: doc.createdAt || doc._creationTime || Date.now(),
                score: hit._score,
            });
        }

        for (const hit of taskHits) {
            const task = taskById.get(hit._id);
            if (!task) continue;
            if (task.departmentId !== args.departmentId) continue;
            if (orgId && task.orgId && task.orgId !== orgId) continue;
            memoryRows.push({
                kind: "task",
                id: String(task._id),
                title: task.title || "Untitled task",
                snippet: extractQuerySnippet(String(task.description || ""), queryText),
                date: task.createdAt || task._creationTime || Date.now(),
                score: hit._score,
            });
        }

        const lexicalKnowledge: any[] = await ctx.runQuery(internal.tools.knowledge.listKnowledgeByDepartment, {
            departmentId: args.departmentId,
            limit: 200,
        });
        const queryTokens = tokenize(queryText);
        for (const row of lexicalKnowledge) {
            const title = String(row.title ?? "");
            const text = String(row.text ?? "");
            const source = `${title}\n${text}`;
            const sourceTokens = new Set(tokenize(source));
            const overlap = queryTokens.filter((token) => sourceTokens.has(token)).length;
            const minOverlap = queryTokens.length <= 4 ? 1 : 2;
            if (overlap < minOverlap) continue;
            memoryRows.push({
                kind: "knowledge",
                id: String(row._id),
                title: title || "Untitled knowledge",
                snippet: buildKnowledgeSnippet(text, queryText),
                date: row.updatedAt || row.createdAt || row._creationTime || Date.now(),
                score: 0.1 + overlap * 0.03 + titleOverlapBoost(title, queryText),
            });
        }

        const deduped = new Map<string, typeof memoryRows[number]>();
        for (const row of memoryRows) {
            const key = `${row.kind}:${row.id}`;
            const current = deduped.get(key);
            if (!current || row.score > current.score) {
                deduped.set(key, row);
            }
        }

        const mergedRows = Array.from(deduped.values());
        if (mergedRows.length === 0 && lexicalKnowledge.length > 0) {
            for (const row of lexicalKnowledge.slice(0, limit)) {
                mergedRows.push({
                    kind: "knowledge",
                    id: String(row._id),
                    title: String(row.title ?? "Untitled knowledge"),
                    snippet: buildKnowledgeSnippet(String(row.text ?? ""), queryText),
                    date: row.updatedAt || row.createdAt || row._creationTime || Date.now(),
                    score: 0.01,
                });
            }
        }
        mergedRows.sort((a, b) => b.score - a.score);
        const memories = mergedRows.slice(0, limit);

        return {
            query: queryText,
            memories,
            totalCandidates: mergedRows.length,
            timestamp: Date.now(),
        };
    },
});
