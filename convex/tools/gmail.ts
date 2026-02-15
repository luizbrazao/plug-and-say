import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

type GmailHeaderBag = {
    from?: string;
    to?: string;
    subject?: string;
    date?: string;
};

function sanitizeLimit(limit: unknown, fallback = 10): number {
    if (typeof limit !== "number" || !Number.isFinite(limit)) return fallback;
    return Math.max(1, Math.min(25, Math.trunc(limit)));
}

function toEmailSummary(message: any) {
    const headers = (message?.headers ?? {}) as GmailHeaderBag;
    return {
        id: String(message?.id ?? ""),
        threadId: typeof message?.threadId === "string" ? message.threadId : null,
        from: typeof headers.from === "string" ? headers.from : null,
        to: typeof headers.to === "string" ? headers.to : null,
        subject: typeof headers.subject === "string" ? headers.subject : null,
        date: typeof headers.date === "string" ? headers.date : null,
        snippet: typeof message?.snippet === "string" ? message.snippet : null,
    };
}

async function fetchMessageDetailsBatch(
    ctx: any,
    departmentId: any,
    messageIds: string[]
): Promise<any[]> {
    const results = await Promise.all(
        messageIds.map(async (messageId) => {
            try {
                return await ctx.runAction((api as any).tools.gmailApi.getMessage, {
                    departmentId,
                    messageId,
                    format: "full",
                });
            } catch (error) {
                console.warn("[tools.gmail] failed to fetch message details", {
                    departmentId: String(departmentId),
                    messageId,
                    error: error instanceof Error ? error.message : String(error),
                });
                return null;
            }
        })
    );
    return results.filter(Boolean);
}

/**
 * Tool: list_emails
 * Returns the latest inbox emails with sender/subject/snippet.
 */
export const list_emails = internalAction({
    args: {
        departmentId: v.id("departments"),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<any> => {
        const maxResults = sanitizeLimit(args.limit, 10);
        const listing: any = await ctx.runAction((api as any).tools.gmailApi.listMessages, {
            departmentId: args.departmentId,
            q: "in:inbox",
            maxResults,
        });
        const messageIds = Array.isArray(listing?.messages)
            ? listing.messages
                .map((message: any) => (typeof message?.id === "string" ? message.id : ""))
                .filter((id: string) => id.length > 0)
            : [];
        const detailed = await fetchMessageDetailsBatch(ctx, args.departmentId, messageIds);

        return {
            ok: true,
            emails: detailed.map(toEmailSummary),
            nextPageToken:
                typeof listing?.nextPageToken === "string" ? listing.nextPageToken : null,
            resultSizeEstimate:
                typeof listing?.resultSizeEstimate === "number"
                    ? listing.resultSizeEstimate
                    : detailed.length,
        };
    },
});

/**
 * Tool: get_email_details
 * Returns rich details for one email id (snippet + headers + body).
 */
export const get_email_details = internalAction({
    args: {
        departmentId: v.id("departments"),
        emailId: v.string(),
    },
    handler: async (ctx, args): Promise<any> => {
        const emailId = args.emailId.trim();
        if (!emailId) {
            throw new Error("Tool 'get_email_details' requires a non-empty 'emailId'.");
        }

        const details: any = await ctx.runAction((api as any).tools.gmailApi.getMessage, {
            departmentId: args.departmentId,
            messageId: emailId,
            format: "full",
        });

        const headers = (details?.headers ?? {}) as GmailHeaderBag;
        const textBody =
            typeof details?.content?.text === "string" && details.content.text.trim().length > 0
                ? details.content.text
                : null;
        const htmlBody =
            typeof details?.content?.html === "string" && details.content.html.trim().length > 0
                ? details.content.html
                : null;

        return {
            ok: true,
            email: {
                id: String(details?.id ?? emailId),
                threadId: typeof details?.threadId === "string" ? details.threadId : null,
                from: typeof headers.from === "string" ? headers.from : null,
                to: typeof headers.to === "string" ? headers.to : null,
                subject: typeof headers.subject === "string" ? headers.subject : null,
                date: typeof headers.date === "string" ? headers.date : null,
                snippet: typeof details?.snippet === "string" ? details.snippet : null,
                bodyText: textBody,
                bodyHtml: htmlBody,
            },
        };
    },
});

/**
 * Tool: search_emails
 * Runs Gmail query syntax and returns matched emails with summary fields.
 */
export const search_emails = internalAction({
    args: {
        departmentId: v.id("departments"),
        query: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<any> => {
        const query = args.query.trim();
        if (!query) {
            throw new Error("Tool 'search_emails' requires a non-empty 'query'.");
        }

        const maxResults = sanitizeLimit(args.limit, 10);
        const listing: any = await ctx.runAction((api as any).tools.gmailApi.listMessages, {
            departmentId: args.departmentId,
            q: query,
            maxResults,
        });

        const messageIds = Array.isArray(listing?.messages)
            ? listing.messages
                .map((message: any) => (typeof message?.id === "string" ? message.id : ""))
                .filter((id: string) => id.length > 0)
            : [];
        const detailed = await fetchMessageDetailsBatch(ctx, args.departmentId, messageIds);

        return {
            ok: true,
            query,
            emails: detailed.map(toEmailSummary),
            nextPageToken:
                typeof listing?.nextPageToken === "string" ? listing.nextPageToken : null,
            resultSizeEstimate:
                typeof listing?.resultSizeEstimate === "number"
                    ? listing.resultSizeEstimate
                    : detailed.length,
        };
    },
});
