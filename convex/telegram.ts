import { action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const TOOL_BLOB_GLOBAL_REGEX = /\[TOOL:\s*[a-zA-Z0-9_-]+\s+ARG:\s*\{[\s\S]*?\}\s*\]/g;
const MEMORY_USED_MARKER_REGEX = /\[MEMORY_USED\]\s*/g;
const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi;
const INTERNAL_MARKER_LINE_REGEX = /^\[[A-Z0-9_:-]{2,}\]\s*/gm;

function sanitizeTelegramText(text: string): string {
    const base = text
        .replace(TOOL_BLOB_GLOBAL_REGEX, "")
        .replace(MEMORY_USED_MARKER_REGEX, "")
        .replace(INTERNAL_MARKER_LINE_REGEX, "")
        .trim();
    const withoutImages = base.replace(MARKDOWN_IMAGE_REGEX, "").trim();
    const loweredWithoutImages = withoutImages.toLowerCase();
    const imageMentions: string[] = [];

    for (const match of base.matchAll(MARKDOWN_IMAGE_REGEX)) {
        const alt = String(match[1] ?? "").trim();
        const url = String(match[2] ?? "").trim();
        if (!url) continue;
        if (loweredWithoutImages.includes(url.toLowerCase())) continue;
        if (alt && loweredWithoutImages.includes(alt.toLowerCase())) continue;
        imageMentions.push(alt ? `${alt}: ${url}` : url);
    }

    const merged =
        imageMentions.length > 0
            ? `${withoutImages}${withoutImages ? "\n\n" : ""}${imageMentions.join("\n")}`
            : withoutImages;

    return merged
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function normalizeSingleLine(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function summarizeTelegramTaskTitle(rawText: string, firstName: string): string {
    const normalized = normalizeSingleLine(rawText);
    if (!normalized) return `Telegram from ${firstName}`;

    const cleaned = normalized
        .replace(/^\s*\/[a-z0-9_]+\b/i, "")
        .replace(/^\s*[@#][^\s]+\s*/g, "")
        .trim();
    const safe = cleaned || normalized;
    const max = 80;
    return safe.length > max ? `${safe.slice(0, max - 3)}...` : safe;
}

function isFinishedStatus(status: unknown): boolean {
    const normalized = String(status ?? "").trim().toLowerCase();
    return normalized === "done" || normalized === "review";
}

function normalizeOrganizationLanguage(input: unknown): "en" | "es" | "pt" {
    const normalized = String(input ?? "").trim().toLowerCase();
    if (normalized === "en" || normalized === "es" || normalized === "pt") {
        return normalized;
    }
    return "pt";
}

function localizedAcknowledge(language: "en" | "es" | "pt"): string {
    if (language === "en") return "Understood.";
    if (language === "es") return "Entendido.";
    return "Entendido.";
}

async function getOrgOwnerOrAdminUserId(
    ctx: any,
    orgId: Id<"organizations">
): Promise<Id<"users"> | null> {
    const organization = await ctx.db.get(orgId);
    if (organization?.ownerId) {
        return organization.ownerId;
    }

    const memberships = await ctx.db
        .query("orgMemberships")
        .withIndex("by_orgId", (q: any) => q.eq("orgId", orgId))
        .collect();
    const ownerMembership = memberships.find((membership: any) => membership.role === "owner");
    if (ownerMembership?.userId) return ownerMembership.userId;
    const adminMembership = memberships.find((membership: any) => membership.role === "admin");
    return adminMembership?.userId ?? null;
}

/**
 * telegram:sendMessage
 * Outbound action to send a message to a Telegram chat.
 */
export const sendMessage = action({
    args: {
        departmentId: v.id("departments"),
        chatId: v.number(),
        text: v.string(),
        language: v.optional(v.union(v.literal("en"), v.literal("es"), v.literal("pt"))),
    },
    handler: async (ctx, args): Promise<any> => {
        // 1. Fetch integration token
        const integration: any = await ctx.runQuery(internal.telegram.getIntegration, {
            departmentId: args.departmentId,
        });

        if (!integration || !integration.config || !integration.config.token) {
            throw new Error("Telegram integration not configured for this department.");
        }

        const token: string = integration.config.token;
        const url: string = `https://api.telegram.org/bot${token}/sendMessage`;
        const fallbackLanguage = normalizeOrganizationLanguage(args.language);
        const sanitizedText = sanitizeTelegramText(args.text) || localizedAcknowledge(fallbackLanguage);

        const response: Response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: args.chatId,
                text: sanitizedText,
            }),
        });

        if (!response.ok) {
            const err: string = await response.text();
            throw new Error(`Telegram API Error: ${err}`);
        }

        return await response.json();
    },
});

/**
 * internal:telegram:getIntegration
 * Helper to fetch the telegram integration for a department.
 */
export const getIntegration = internalQuery({
    args: { departmentId: v.id("departments") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("integrations")
            .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
            .filter((q) => q.eq(q.field("type"), "telegram"))
            .unique();
    },
});

/**
 * internal:telegram:handleUpdate
 * Inbound handler called by httpAction.
 */
export const handleUpdate = internalMutation({
    args: {
        deptSlug: v.string(),
        update: v.any(),
    },
    handler: async (ctx, args) => {
        const { message, callback_query } = args.update;
        const msg = message || callback_query?.message;
        if (!msg || (!msg.text && !callback_query)) return;
        const TELEGRAM_INBOX_STATUS = "inbox" as const;

        const chat_id = msg.chat.id;
        const text = msg.text || callback_query?.data || "";
        const firstName = msg.from?.first_name || "User";

        // 1. Resolve department
        const dept = await ctx.db
            .query("departments")
            .withIndex("by_slug", (q) => q.eq("slug", args.deptSlug))
            .unique();

        if (!dept) throw new Error(`Department "${args.deptSlug}" not found`);
        const org = dept.orgId ? await ctx.db.get(dept.orgId) : null;
        const organizationLanguage = normalizeOrganizationLanguage(
            (org as { language?: string } | null)?.language
        );
        const ownerUserId = dept.orgId ? await getOrgOwnerOrAdminUserId(ctx, dept.orgId) : null;

        const agents = await ctx.db
            .query("agents")
            .withIndex("by_departmentId", (q) => q.eq("departmentId", dept._id))
            .collect();
        const jarvis = agents.find((a) => a.name.toLowerCase() === "jarvis");
        const fallbackAgent = agents.find((a) => a.sessionKey === "agent:main:main") || agents[0];
        const targetAgentSessionKey = jarvis?.sessionKey || fallbackAgent?.sessionKey || "agent:main:main";

        // 2. Find an active task for this chat, or create a fresh one when the previous is finished.
        const chatMarker = `Telegram Chat ID: ${chat_id}`;
        const tasksForChat = (
            await ctx.db
                .query("tasks")
                .withIndex("by_departmentId", (q) => q.eq("departmentId", dept._id))
                .collect()
        )
            .filter((task) => typeof task.description === "string" && task.description.includes(chatMarker))
            .sort(
                (a, b) =>
                    (b.createdAt ?? b._creationTime) - (a.createdAt ?? a._creationTime)
            );
        const latestTask = tasksForChat[0] ?? null;
        const existingTask = tasksForChat.find((task) => !isFinishedStatus(task.status)) ?? null;

        let taskId = existingTask?._id;

        if (!taskId) {
            const titlePreview = summarizeTelegramTaskTitle(text, firstName);
            taskId = await ctx.db.insert("tasks", {
                departmentId: dept._id,
                title: titlePreview || `Telegram from ${firstName}`,
                description: `Live support thread for ${firstName}. ${chatMarker}`,
                createdBySessionKey: `user:telegram:${chat_id}`,
                createdByName: firstName,
                ownerUserId: ownerUserId ?? undefined,
                status: TELEGRAM_INBOX_STATUS,
                assigneeSessionKeys: [targetAgentSessionKey],
                createdAt: Date.now(),
            });

            // Log activity
            await ctx.db.insert("activities", {
                departmentId: dept._id,
                type: "task_created",
                message: `New Telegram thread started by ${firstName}`,
                sessionKey: `user:telegram:${chat_id}`,
                actorName: firstName,
                actorType: "user",
                taskId,
                createdAt: Date.now(),
            });
            if (latestTask && isFinishedStatus(latestTask.status)) {
                console.log("[telegram] created fresh task after finished thread", {
                    departmentId: String(dept._id),
                    chatId: chat_id,
                    previousTaskId: String(latestTask._id),
                    previousStatus: latestTask.status,
                    newTaskId: String(taskId),
                });
            }
        } else {
            // Reopen existing Telegram thread so it becomes visible in Kanban inbox again.
            const patch: Record<string, unknown> = {
                status: TELEGRAM_INBOX_STATUS,
                assigneeSessionKeys: [targetAgentSessionKey],
            };
            if (!existingTask?.ownerUserId && ownerUserId) {
                patch.ownerUserId = ownerUserId;
            }
            await ctx.db.patch(taskId, patch);
        }

        // 3. Create message in thread
        await ctx.runMutation(api.messages.create, {
            departmentId: dept._id,
            taskId: taskId as any,
            fromSessionKey: `user:telegram:${chat_id}`,
            fromDisplayName: firstName,
            content: text,
        });

        // 4. Explicitly wake the Brain for Telegram inbound messages.
        await ctx.scheduler.runAfter(0, internal.brain.thinkInternal, {
            departmentId: dept._id,
            taskId: taskId as any,
            agentSessionKey: targetAgentSessionKey,
            triggerKey: `telegram:${String(args.update?.update_id ?? Date.now())}:${targetAgentSessionKey}`,
            language: organizationLanguage,
        });

        return { taskId };
    },
});
/**
 * telegram:registerWebhook
 * Registers the Telegram webhook for a specific bot and department.
 */
export const registerWebhook = action({
    args: {
        token: v.string(),
        deptSlug: v.string(),
    },
    handler: async (_ctx, args) => {
        const baseUrl = process.env.CONVEX_SITE_URL;
        if (!baseUrl) {
            throw new Error("CONVEX_SITE_URL is not set in environment variables.");
        }

        const webhookUrl = `${baseUrl}/telegram-webhook/${args.deptSlug}`;
        const url = `https://api.telegram.org/bot${args.token}/setWebhook`;

        console.log(`Registering Telegram webhook: ${webhookUrl}`);

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: webhookUrl }),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Telegram setWebhook Error: ${err}`);
        }

        return await response.json();
    },
});
