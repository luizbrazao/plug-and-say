import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

/**
 * internal:tools:notion:createNotionPage
 * Creates a child page in Notion under a parent page.
 */
export const createNotionPage = internalAction({
    args: {
        departmentId: v.id("departments"),
        parentPageId: v.optional(v.string()),
        title: v.string(),
        content: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<any> => {
        const title = args.title.trim();
        const content = (args.content || "").trim();
        if (!title) throw new Error("Tool 'create_notion_page' requires a non-empty 'title'.");

        const integration: any = await ctx.runQuery(internal.integrations.getByTypeForDepartment, {
            departmentId: args.departmentId,
            type: "notion",
        });
        const token = integration?.config?.token;
        if (!token) {
            throw new Error("Notion integration not configured for this department.");
        }
        const parentPageId = (args.parentPageId || integration?.config?.parentPageId || "").trim();
        if (!parentPageId) {
            throw new Error("Tool 'create_notion_page' requires 'parentPageId' (arg or notion integration config.parentPageId).");
        }

        const children: any[] = [
            {
                object: "block",
                type: "heading_2",
                heading_2: {
                    rich_text: [{ type: "text", text: { content: title } }],
                },
            },
        ];

        if (content) {
            children.push({
                object: "block",
                type: "paragraph",
                paragraph: {
                    rich_text: [{ type: "text", text: { content } }],
                },
            });
        }

        const response = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                parent: { page_id: parentPageId },
                children,
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Notion API Error (create page): ${err}`);
        }

        const payload: any = await response.json();
        return {
            ok: true,
            pageId: payload?.id,
            pageUrl: payload?.url,
            title,
        };
    },
});
