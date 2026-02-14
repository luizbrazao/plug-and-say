import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

/**
 * internal:tools:search:webSearch
 * Runs a real web search using Tavily API.
 */
export const webSearch = internalAction({
    args: {
        departmentId: v.id("departments"),
        query: v.string(),
    },
    handler: async (ctx, args) => {
        console.log(`[TOOL: web_search] Querying: ${args.query}`);

        const integration: any = await ctx.runQuery(internal.integrations.getByTypeForDepartment, {
            departmentId: args.departmentId,
            type: "tavily",
        });

        if (!integration?.config?.token) {
            throw new Error("Tavily (Search) integration not configured for this department.");
        }

        const response: Response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: integration.config.token,
                query: args.query,
                search_depth: "basic",
                max_results: 5,
                include_answer: true,
                include_raw_content: false,
            }),
        });

        if (!response.ok) {
            const err: string = await response.text();
            throw new Error(`Tavily API Error: ${err}`);
        }

        const payload: any = await response.json();
        const results = Array.isArray(payload?.results) ? payload.results : [];

        return {
            query: args.query,
            answer: payload?.answer ?? null,
            results: results.map((r: any) => ({
                title: r?.title ?? "Untitled",
                url: r?.url ?? "",
                snippet: r?.content ?? "",
                score: r?.score ?? null,
            })),
            timestamp: Date.now(),
        };
    },
});
