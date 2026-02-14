import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { checkLimit } from "./plans";

const CAPABILITY_TOOL_MAP: Record<string, string[]> = {
    jarvis: ["delegate_task", "search_knowledge"],
    vision: ["web_search", "update_task_status"],
    fury: ["web_search", "update_task_status"],
    pepper: ["send_email", "update_task_status"],
    friday: ["web_search", "create_github_issue", "create_pull_request", "update_task_status"],
    wanda: ["generate_image", "update_task_status"],
    wong: ["update_notion_page", "create_notion_database_item", "update_task_status"],
    quill: ["post_to_x", "update_task_status"],
};

/**
 * Agents table shape (from schema.ts):
 * - name: string
 * - role: string
 * - sessionKey: string
 * - status: "idle" | "active" | "blocked"
 * - currentTaskId?: Id<"tasks">
 * - lastSeenAt?: number
 *
 * Indexes:
 * - agents.by_sessionKey(["sessionKey"])
 * - agents.by_status(["status"])  // exists in schema, but we won't rely on it
 */

/**
 * List all agents in an organization (alias for listByDept).
 */
export const listByDept = query({
    args: {
        departmentId: v.id("departments"),
    },
    handler: async (ctx, args) => {
        const agents = await ctx.db
            .query("agents")
            .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
            .collect();

        const telegramIntegration = await ctx.db
            .query("integrations")
            .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
            .filter((q) => q.eq(q.field("type"), "telegram"))
            .unique();

        const hasTelegram = !!telegramIntegration;
        const telegramBotName =
            typeof telegramIntegration?.config?.botName === "string" && telegramIntegration.config.botName.trim().length > 0
                ? telegramIntegration.config.botName.trim()
                : telegramIntegration?.name;

        return agents.map((agent) => {
            const isSquadLead =
                agent.name.toLowerCase() === "jarvis" ||
                agent.role.toLowerCase().includes("squad lead");

            return {
                ...agent,
                hasTelegram: isSquadLead ? hasTelegram : false,
                telegramBotName: isSquadLead ? telegramBotName : undefined,
            };
        });
    },
});

/**
 * List all agents (legacy/debug).
 */
export const list = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("agents").order("desc").collect();
    },
});

/**
 * Get one agent by sessionKey (uses by_sessionKey index).
 */
export const getBySessionKey = query({
    args: {
        sessionKey: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("agents")
            .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
            .unique();
    },
});

/**
 * List agents by status.
 * NOTE: We intentionally do NOT use withIndex("by_status") to avoid
 * type/index mismatches while iterating quickly. This is fine at small scale.
 */
export const listByStatus = query({
    args: {
        status: v.union(v.literal("idle"), v.literal("active"), v.literal("blocked")),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 50;

        const rows = await ctx.db.query("agents").order("desc").collect();
        return rows.filter((a) => a.status === args.status).slice(0, limit);
    },
});

/**
 * Upsert an agent by sessionKey.
 * - If exists: patch provided fields
 * - If not: create with sane defaults
 */
export const upsert = mutation({
    args: {
        departmentId: v.id("departments"),
        sessionKey: v.string(),
        name: v.optional(v.string()),
        role: v.optional(v.string()),
        status: v.optional(
            v.union(v.literal("idle"), v.literal("active"), v.literal("blocked"))
        ),
        currentTaskId: v.optional(v.id("tasks")),
        lastSeenAt: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("agents")
            .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
            .collect();

        const agent = existing.find(a => a.sessionKey === args.sessionKey);

        if (agent) {
            await ctx.db.patch(agent._id, {
                ...(args.name !== undefined ? { name: args.name } : {}),
                ...(args.role !== undefined ? { role: args.role } : {}),
                ...(args.status !== undefined ? { status: args.status } : {}),
                ...(args.currentTaskId !== undefined
                    ? { currentTaskId: args.currentTaskId }
                    : {}),
                lastSeenAt: args.lastSeenAt ?? Date.now(),
                // [NEW] Persist extra fields if provided (though upsert is mostly for legacy/seed)
            });
            return agent._id;
        }

        return await ctx.db.insert("agents", {
            departmentId: args.departmentId,
            name: args.name ?? "Unnamed",
            role: args.role ?? "Unassigned",
            description: `${args.role ?? "General"} specialist agent.`,
            sessionKey: args.sessionKey,
            status: args.status ?? "idle",
            currentTaskId: args.currentTaskId,
            lastSeenAt: args.lastSeenAt ?? Date.now(),
            systemPrompt: undefined, // Default
            allowedTools: undefined, // Default
        });
    },
});

/**
 * Set agent status by sessionKey.
 */
export const setStatus = mutation({
    args: {
        sessionKey: v.string(),
        status: v.union(v.literal("idle"), v.literal("active"), v.literal("blocked")),
    },
    handler: async (ctx, args) => {
        const agent = await ctx.db
            .query("agents")
            .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
            .unique();

        if (!agent) {
            throw new Error(`Agent not found for sessionKey=${args.sessionKey}`);
        }

        await ctx.db.patch("agents", agent._id, {
            status: args.status,
            lastSeenAt: Date.now(),
        });

        return agent._id;
    },
});

/**
 * Assign/unassign currentTaskId for an agent.
 */
export const setCurrentTask = mutation({
    args: {
        sessionKey: v.string(),
        currentTaskId: v.optional(v.id("tasks")), // undefined clears
    },
    handler: async (ctx, args) => {
        const agent = await ctx.db
            .query("agents")
            .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
            .unique();

        if (!agent) {
            throw new Error(`Agent not found for sessionKey=${args.sessionKey}`);
        }

        await ctx.db.patch("agents", agent._id, {
            ...(args.currentTaskId !== undefined
                ? { currentTaskId: args.currentTaskId }
                : { currentTaskId: undefined }),
            lastSeenAt: Date.now(),
        });

        return agent._id;
    },
});

/**
 * Heartbeat: update lastSeenAt and optionally status.
 * This is what your cron/agent wake-ups should call.
 */
export const heartbeat = mutation({
    args: {
        departmentId: v.optional(v.id("departments")),
        sessionKey: v.string(),
        status: v.optional(
            v.union(v.literal("idle"), v.literal("active"), v.literal("blocked"))
        ),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        let departmentId = args.departmentId;

        if (!departmentId) {
            const bySession = await ctx.db
                .query("agents")
                .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
                .unique();
            if (!bySession?.departmentId) {
                throw new Error("heartbeat requires departmentId when agent is unknown.");
            }
            departmentId = bySession.departmentId;
        }

        const existing = await ctx.db
            .query("agents")
            .withIndex("by_departmentId", (q) => q.eq("departmentId", departmentId))
            .collect();

        const agent = existing.find(a => a.sessionKey === args.sessionKey);

        if (!agent) {
            // Autocreate minimal agent on first heartbeat
            await ctx.db.insert("agents", {
                departmentId,
                sessionKey: args.sessionKey,
                name: args.sessionKey.split(":").pop() ?? "Agent",
                role: "Specialist",
                description: "General specialist agent ready to help.",
                status: args.status ?? "active",
                lastSeenAt: now,
                systemPrompt: undefined,
                allowedTools: undefined,
            });
            return;
        }

        await ctx.db.patch(agent._id, {
            status: args.status ?? agent.status,
            lastSeenAt: now,
        });
    },
});

/**
 * Seed the official roster of 10 agents (idempotent).
 * - Upserts by sessionKey within the org
 * - Ensures name + role match the roster
 * - Does NOT overwrite status if agent already exists
 */
export const seedRoster = mutation({
    args: {
        departmentId: v.id("departments"),
    },
    handler: async (ctx, args) => {
        const roster = [
            { name: "Friday", role: "PlugandSay", sessionKey: "agent:main:main" },
            { name: "Dev Bot", role: "Specialist", sessionKey: "agent:developer:main" },
            { name: "Research AI", role: "Specialist", sessionKey: "agent:researcher:main" },
            { name: "QA Agent", role: "Intern", sessionKey: "agent:qa:main" },
            { name: "SRE Bot", role: "Lead", sessionKey: "agent:sre:main" },
        ];

        let created = 0;
        let updated = 0;

        for (const r of roster) {
            const existing = await ctx.db
                .query("agents")
                .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
                .collect();

            const agent = existing.find(a => a.sessionKey === r.sessionKey);

            if (!agent) {
                await ctx.db.insert("agents", {
                    departmentId: args.departmentId,
                    ...r,
                    description: `${r.role} focused agent for mission support.`,
                    status: "idle",
                    lastSeenAt: Date.now(),
                    systemPrompt: undefined,
                    allowedTools: CAPABILITY_TOOL_MAP[r.name.toLowerCase()],
                });
                created++;
            } else {
                await ctx.db.patch(agent._id, {
                    name: r.name,
                    role: r.role,
                    allowedTools: CAPABILITY_TOOL_MAP[r.name.toLowerCase()] ?? agent.allowedTools,
                });
                updated++;
            }
        }

        return { created, updated };
    },
});

/**
 * Ensure core squad capabilities are aligned for a department.
 * Also creates missing core agents with sane defaults.
 */
export const alignSquadCapabilities = mutation({
    args: {
        departmentId: v.id("departments"),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const dept = await ctx.db.get(args.departmentId);
        const deptSlug = dept?.slug ?? "main";
        const rows = await ctx.db
            .query("agents")
            .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
            .collect();

        const byName = new Map<string, (typeof rows)[number]>();
        for (const agent of rows) {
            byName.set(agent.name.toLowerCase(), agent);
        }

        const ensuredAgents = [
            { name: "Jarvis", role: "Head of Operations", sessionKey: `agent:jarvis:${deptSlug}` },
            { name: "Vision", role: "Research Specialist", sessionKey: "agent:vision:main" },
            { name: "Fury", role: "Research Specialist", sessionKey: "agent:fury:main" },
            { name: "Pepper", role: "Communications Specialist", sessionKey: "agent:pepper:main" },
            { name: "Friday", role: "PlugandSay", sessionKey: "agent:main:main" },
            { name: "Wanda", role: "Design Specialist", sessionKey: "agent:wanda:main" },
            { name: "Wong", role: "Knowledge Ops Specialist", sessionKey: "agent:wong:main" },
            { name: "Quill", role: "Social Media Specialist", sessionKey: "agent:quill:main" },
        ];

        let created = 0;
        let updated = 0;

        for (const entry of ensuredAgents) {
            const key = entry.name.toLowerCase();
            const allowedTools = CAPABILITY_TOOL_MAP[key];
            const existing = byName.get(key);

            if (!existing) {
                await ctx.db.insert("agents", {
                    departmentId: args.departmentId,
                    name: entry.name,
                    role: entry.role,
                    description: `${entry.role} focused specialist.`,
                    sessionKey: entry.sessionKey,
                    status: "idle",
                    lastSeenAt: now,
                    allowedTools,
                    systemPrompt: undefined,
                });
                created += 1;
                continue;
            }

            await ctx.db.patch(existing._id, {
                allowedTools,
                role: existing.role || entry.role,
                lastSeenAt: now,
            });
            updated += 1;
        }

        return { ok: true, created, updated };
    },
});

/**
 * Create a custom agent (Marketplace/Creator).
 */
export const createCustom = mutation({
    args: {
        departmentId: v.id("departments"),
        name: v.string(),
        avatar: v.optional(v.string()),
        role: v.string(),
        description: v.string(),
        systemPrompt: v.optional(v.string()),
        allowedTools: v.optional(v.array(v.string())),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        const description = args.description.trim();
        if (!description) {
            throw new Error("Short description is required.");
        }
        if (description.length > 100) {
            throw new Error("Short description must be 100 characters or less.");
        }

        const name = args.name.trim();
        const role = args.role.trim();
        if (!name) throw new Error("Agent name is required.");
        if (!role) throw new Error("Agent role is required.");

        const department = await ctx.db.get(args.departmentId);
        if (!department) throw new Error("Department not found.");
        if (!department.orgId) throw new Error("Department has no organization linked.");
        await checkLimit(ctx, department.orgId, "agents_per_department", {
            departmentId: args.departmentId,
        });

        // Generate a session key strictly based on name
        const normalizedName = name.toLowerCase().replace(/\s+/g, '-');
        const sessionKey = `agent:${normalizedName}:${Date.now()}`;
        const now = Date.now();
        const capabilities = args.allowedTools ?? [];

        const agentId = await ctx.db.insert("agents", {
            departmentId: args.departmentId,
            name,
            avatar: args.avatar,
            role,
            description,
            sessionKey,
            status: "active",
            lastSeenAt: now,
            systemPrompt: args.systemPrompt,
            allowedTools: capabilities,
        });

        await ctx.db.insert("agentTemplates", {
            departmentId: args.departmentId,
            name,
            avatar: args.avatar,
            role,
            description,
            systemPrompt: args.systemPrompt,
            capabilities,
            isPublic: false,
            visibility: "private",
            creatorId: userId,
            installCount: 1n,
            rating: 0,
            createdAt: now,
            createdByUserId: userId,
            orgId: department.orgId,
        });

        return agentId;
    },
});

/**
 * Delete an agent (Fire).
 */
export const deleteAgent = mutation({
    args: {
        departmentId: v.id("departments"),
        agentId: v.id("agents"),
    },
    handler: async (ctx, args) => {
        const agent = await ctx.db.get(args.agentId);
        if (!agent || agent.departmentId !== args.departmentId) {
            throw new Error("Agent not found or access denied.");
        }
        await ctx.db.delete(args.agentId);
    },
});
