import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import OpenAI from "openai";

/**
 * internal:tools:image:generateImage
 * Generates an image with DALL-E 3 and stores a document reference.
 */
export const generateImage = internalAction({
    args: {
        departmentId: v.id("departments"),
        taskId: v.optional(v.id("tasks")),
        createdBySessionKey: v.optional(v.string()),
        prompt: v.string(),
        size: v.optional(v.union(v.literal("1024x1024"), v.literal("1024x1792"), v.literal("1792x1024"))),
        quality: v.optional(v.union(v.literal("standard"), v.literal("hd"))),
        style: v.optional(v.union(v.literal("vivid"), v.literal("natural"))),
    },
    handler: async (ctx, args): Promise<any> => {
        const prompt = args.prompt.trim();
        if (!prompt) {
            throw new Error("Tool 'generate_image' requires a non-empty 'prompt' string.");
        }

        const dalleIntegration: any = await ctx.runQuery(internal.integrations.getByTypeForDepartment, {
            departmentId: args.departmentId,
            type: "dalle",
        });
        const openaiIntegration: any = await ctx.runQuery(internal.integrations.getByTypeForDepartment, {
            departmentId: args.departmentId,
            type: "openai",
        });

        const dalleKey = dalleIntegration?.config?.token || dalleIntegration?.config?.key;
        const openaiKey = openaiIntegration?.config?.token || openaiIntegration?.config?.key;
        const apiKey = dalleKey || openaiKey;

        if (!apiKey) {
            throw new Error("OpenAI key is not configured for this department (dalle/openai integration).");
        }

        const openai = new OpenAI({ apiKey });
        const result = await openai.images.generate({
            model: "dall-e-3",
            prompt,
            size: args.size ?? "1024x1024",
            quality: args.quality ?? "standard",
            style: args.style ?? "vivid",
            n: 1,
        });

        const image = result.data?.[0];
        const imageUrl = image?.url ?? null;
        const revisedPrompt = image?.revised_prompt ?? prompt;

        if (!imageUrl) {
            throw new Error("OpenAI image generation returned no URL.");
        }

        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
            throw new Error(`Failed to fetch generated image from OpenAI URL (status ${imageResponse.status}).`);
        }

        const imageBuffer = await imageResponse.arrayBuffer();
        const imageBlob = new Blob([imageBuffer], { type: "image/png" });
        const storageId = await ctx.storage.store(imageBlob);
        const permanentUrl = await ctx.storage.getUrl(storageId);
        if (!permanentUrl) {
            throw new Error("Failed to resolve permanent URL from Convex Storage.");
        }
        const displayUrl = `${permanentUrl}#generated.png`;

        const docTitle = `Generated Image: ${prompt.slice(0, 60)}${prompt.length > 60 ? "..." : ""}`;
        const docContent = displayUrl;

        const createdDoc: any = await ctx.runMutation(api.documents.create, {
            departmentId: args.departmentId,
            taskId: args.taskId,
            createdBySessionKey: args.createdBySessionKey,
            title: docTitle,
            content: docContent,
            type: "deliverable",
        });

        if (args.taskId && args.createdBySessionKey) {
            await ctx.runMutation(api.messages.create, {
                departmentId: args.departmentId,
                taskId: args.taskId,
                fromSessionKey: args.createdBySessionKey,
                content: `![Generated Image](${displayUrl})\n\nPrompt: ${revisedPrompt}`,
            });
        }

        return {
            ok: true,
            imageUrl: displayUrl,
            revisedPrompt,
            storageId,
            documentId: createdDoc?.documentId,
            createdAt: Date.now(),
        };
    },
});
