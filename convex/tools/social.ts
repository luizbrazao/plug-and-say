import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

const X_MAX_LEN = 280;

/**
 * internal:tools:social:postToX
 * Posts a tweet-like message to X (Twitter).
 */
export const postToX = internalAction({
    args: {
        departmentId: v.id("departments"),
        text: v.string(),
        replyToId: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<any> => {
        const text = args.text.trim();
        if (!text) throw new Error("Tool 'post_to_x' requires a non-empty 'text'.");

        const integration: any = await ctx.runQuery(internal.integrations.getByTypeForDepartment, {
            departmentId: args.departmentId,
            type: "twitter",
        });

        const token =
            integration?.config?.accessToken ||
            integration?.config?.bearerToken ||
            integration?.config?.token;

        if (!token) {
            throw new Error("Twitter/X integration not configured for this department.");
        }

        const postText = text.length > X_MAX_LEN ? `${text.slice(0, X_MAX_LEN - 3)}...` : text;
        const body: any = { text: postText };
        if (args.replyToId?.trim()) {
            body.reply = { in_reply_to_tweet_id: args.replyToId.trim() };
        }

        const response = await fetch("https://api.twitter.com/2/tweets", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Twitter/X API Error (create post): ${err}`);
        }

        const payload: any = await response.json();
        const tweetId = payload?.data?.id;
        return {
            ok: true,
            id: tweetId,
            text: payload?.data?.text ?? postText,
            url: tweetId ? `https://x.com/i/web/status/${tweetId}` : null,
        };
    },
});
