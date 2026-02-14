import { action } from "./_generated/server";
import { v } from "convex/values";
import OpenAI from "openai";

export const chat = action({
    args: {
        systemPrompt: v.string(),
        messages: v.array(v.object({
            role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
            content: v.string(),
        })),
        apiKey: v.optional(v.string()), // [NEW] Optional override
        maxTokens: v.optional(v.number()),
    },
    handler: async (_ctx, args) => {
        const apiKey = args.apiKey || process.env.OPENAI_API_KEY; // Priority: Args -> Env

        if (!apiKey) {
            throw new Error("OpenAI API Key not configured. Please set it in Department Settings or Environment Variables.");
        }

        const openai = new OpenAI({ apiKey });

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: args.systemPrompt },
                ...args.messages,
            ],
            temperature: 0.7,
            max_tokens: args.maxTokens ?? 900,
        });

        const content = response.choices[0].message.content;
        if (!content) {
            throw new Error("Empty response from OpenAI");
        }

        return content;
    },
});
