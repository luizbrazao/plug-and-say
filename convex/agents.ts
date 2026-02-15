import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { checkLimit } from "./plans";

const PEPPER_GMAIL_READ_TOOLS = [
    "list_emails",
    "get_email_details",
    "search_emails",
] as const;

const CAPABILITY_TOOL_MAP: Record<string, string[]> = {
    jarvis: ["delegate_task", "search_knowledge"],
    vision: ["web_search", "update_task_status"],
    fury: ["web_search", "update_task_status"],
    pepper: ["send_email", ...PEPPER_GMAIL_READ_TOOLS, "update_task_status"],
    friday: ["web_search", "create_github_issue", "create_pull_request", "update_task_status"],
    wanda: ["generate_image", "update_task_status"],
    wong: ["update_notion_page", "create_notion_database_item", "update_task_status"],
    quill: ["post_to_x", "update_task_status"],
};

function withPepperGmailReadTools(agentLikeName: string, tools?: string[] | null): string[] {
    const base = Array.isArray(tools) ? tools : [];
    if (normalizeAgentSlug(agentLikeName) !== "pepper") {
        return base;
    }
    return Array.from(new Set([...base, "send_email", ...PEPPER_GMAIL_READ_TOOLS]));
}

function normalizeAgentSlug(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/^@+/, "")
        .replace(/^agent:/, "")
        .split(":")[0]
        .replace(/[_\s]+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function slugFromSessionKey(sessionKey: string): string {
    if (!sessionKey.toLowerCase().startsWith("agent:")) {
        return normalizeAgentSlug(sessionKey);
    }
    return normalizeAgentSlug(sessionKey.slice("agent:".length));
}

function buildTemplateSessionKey(name: string, departmentSlug: string): string {
    const slug = normalizeAgentSlug(name);
    if (slug === "jarvis") {
        const safeDeptSlug = normalizeAgentSlug(departmentSlug) || "main";
        return `agent:jarvis:${safeDeptSlug}`;
    }
    if (slug === "friday") {
        return "agent:main:main";
    }
    return `agent:${slug}:main`;
}

function buildDeterministicSessionKeyFromSlug(slug: string, departmentSlug: string): string {
    const safeSlug = normalizeAgentSlug(slug) || "agent";
    if (safeSlug === "jarvis") {
        const safeDeptSlug = normalizeAgentSlug(departmentSlug) || "main";
        return `agent:jarvis:${safeDeptSlug}`;
    }
    if (safeSlug === "friday") {
        return "agent:main:main";
    }
    return `agent:${safeSlug}:main`;
}

function pickPreferredAgent<T extends { _creationTime: number; lastSeenAt?: number }>(agents: T[]): T {
    return [...agents].sort((a, b) => {
        const seenA = a.lastSeenAt ?? 0;
        const seenB = b.lastSeenAt ?? 0;
        if (seenA !== seenB) return seenB - seenA;
        return b._creationTime - a._creationTime;
    })[0];
}

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

export const upsertFromTemplateForDepartment = internalMutation({
    args: {
        departmentId: v.id("departments"),
        templateId: v.id("agentTemplates"),
    },
    handler: async (ctx, args) => {
        const template = await ctx.db.get(args.templateId);
        if (!template) {
            throw new Error("Template not found.");
        }
        if (template.departmentId && template.departmentId !== args.departmentId) {
            throw new Error("Template does not belong to the provided department.");
        }

        const department = await ctx.db.get(args.departmentId);
        if (!department) {
            throw new Error("Department not found.");
        }

        const slug = normalizeAgentSlug(template.name);
        const sessionKey = buildTemplateSessionKey(template.name, department.slug ?? "main");
        const templateAllowedTools = withPepperGmailReadTools(
            template.name,
            template.capabilities ?? []
        );

        const byTemplateCandidates = await ctx.db
            .query("agents")
            .withIndex("by_department_template", (q) =>
                q.eq("departmentId", args.departmentId).eq("templateId", args.templateId)
            )
            .collect();
        if (byTemplateCandidates.length > 0) {
            const keeper = pickPreferredAgent(byTemplateCandidates);
            const keeperSessionKey =
                typeof keeper.sessionKey === "string" && keeper.sessionKey.trim().length > 0
                    ? keeper.sessionKey.trim()
                    : sessionKey;
            await ctx.db.patch(keeper._id, {
                templateId: template._id,
                slug,
                name: template.name,
                avatar: template.avatar,
                role: template.role,
                description: template.description ?? `${template.role} specialist.`,
                systemPrompt: template.systemPrompt,
                allowedTools: templateAllowedTools,
                sessionKey: keeperSessionKey,
                lastSeenAt: Date.now(),
            });
            return { ok: true, agentId: keeper._id, created: false, dedupedLegacy: false };
        }

        const deptAgents = await ctx.db
            .query("agents")
            .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
            .collect();

        const legacy = deptAgents.find((agent) => {
            if (agent.templateId && String(agent.templateId) === String(args.templateId)) {
                return true;
            }
            const existingSlug =
                normalizeAgentSlug(agent.slug ?? "") ||
                normalizeAgentSlug(agent.name) ||
                slugFromSessionKey(agent.sessionKey);
            return existingSlug === slug;
        });

        if (legacy) {
            const legacySessionKey =
                typeof legacy.sessionKey === "string" && legacy.sessionKey.trim().length > 0
                    ? legacy.sessionKey.trim()
                    : sessionKey;
            await ctx.db.patch(legacy._id, {
                templateId: template._id,
                slug,
                name: template.name,
                avatar: template.avatar,
                role: template.role,
                description: template.description ?? `${template.role} specialist.`,
                systemPrompt: template.systemPrompt,
                allowedTools: templateAllowedTools,
                sessionKey: legacySessionKey,
                lastSeenAt: Date.now(),
            });
            return { ok: true, agentId: legacy._id, created: false, dedupedLegacy: true };
        }

        const agentId = await ctx.db.insert("agents", {
            departmentId: args.departmentId,
            templateId: template._id,
            slug,
            name: template.name,
            avatar: template.avatar,
            role: template.role,
            description: template.description ?? `${template.role} specialist.`,
            sessionKey,
            status: "idle",
            lastSeenAt: Date.now(),
            systemPrompt: template.systemPrompt,
            allowedTools: templateAllowedTools,
        });

        return { ok: true, agentId, created: true, dedupedLegacy: false };
    },
});

export const ensureSessionKeyForAgent = internalMutation({
    args: {
        agentId: v.id("agents"),
    },
    handler: async (ctx, args) => {
        const agent = await ctx.db.get(args.agentId);
        if (!agent) {
            throw new Error("Agent not found.");
        }

        const existingSessionKey = typeof agent.sessionKey === "string" ? agent.sessionKey.trim() : "";
        if (existingSessionKey.length > 0) {
            return { ok: true, updated: false, agentId: agent._id, sessionKey: existingSessionKey };
        }

        const department = agent.departmentId ? await ctx.db.get(agent.departmentId) : null;
        const departmentSlug = department?.slug ?? "main";
        const slug = normalizeAgentSlug(agent.slug ?? agent.name ?? "agent");
        if (!slug) {
            throw new Error("Cannot derive agent slug to generate a deterministic sessionKey.");
        }

        const nextSessionKey = buildDeterministicSessionKeyFromSlug(slug, departmentSlug);
        await ctx.db.patch(agent._id, {
            slug,
            sessionKey: nextSessionKey,
            lastSeenAt: Date.now(),
        });

        return { ok: true, updated: true, agentId: agent._id, sessionKey: nextSessionKey };
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
        const agent = await ctx.db
            .query("agents")
            .withIndex("by_dept_sessionKey", (q) =>
                q.eq("departmentId", args.departmentId).eq("sessionKey", args.sessionKey)
            )
            .unique();

        if (agent) {
            await ctx.db.patch(agent._id, {
                ...(args.name !== undefined ? { name: args.name } : {}),
                ...(args.name !== undefined ? { slug: normalizeAgentSlug(args.name) } : {}),
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
            slug: normalizeAgentSlug(args.name ?? args.sessionKey),
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

        const agent = await ctx.db
            .query("agents")
            .withIndex("by_dept_sessionKey", (q) =>
                q.eq("departmentId", departmentId).eq("sessionKey", args.sessionKey)
            )
            .unique();

        if (!agent) {
            // Autocreate minimal agent on first heartbeat
            await ctx.db.insert("agents", {
                departmentId,
                sessionKey: args.sessionKey,
                name: args.sessionKey.split(":").pop() ?? "Agent",
                slug: normalizeAgentSlug(args.sessionKey),
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
            const agent = await ctx.db
                .query("agents")
                .withIndex("by_dept_sessionKey", (q) =>
                    q.eq("departmentId", args.departmentId).eq("sessionKey", r.sessionKey)
                )
                .unique();

            if (!agent) {
                await ctx.db.insert("agents", {
                    departmentId: args.departmentId,
                    ...r,
                    slug: normalizeAgentSlug(r.name),
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
                    slug: normalizeAgentSlug(r.name),
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
                    slug: normalizeAgentSlug(entry.name),
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
                slug: normalizeAgentSlug(entry.name),
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

        const slug = normalizeAgentSlug(name);
        if (!slug) throw new Error("Agent name must generate a valid slug.");
        const slugConflicts = await ctx.db
            .query("agents")
            .withIndex("by_department_slug", (q) =>
                q.eq("departmentId", args.departmentId).eq("slug", slug)
            )
            .collect();
        if (slugConflicts.length > 0) {
            throw new Error("An agent with this slug already exists in the department.");
        }

        const sessionKey = buildDeterministicSessionKeyFromSlug(slug, department.slug ?? "main");
        const now = Date.now();
        const capabilities = args.allowedTools ?? [];

        const templateId = await ctx.db.insert("agentTemplates", {
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

        const agentId = await ctx.db.insert("agents", {
            departmentId: args.departmentId,
            templateId,
            slug,
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

        return agentId;
    },
});

export const dedupeByDepartmentKey = internalMutation({
    args: {
        departmentId: v.optional(v.id("departments")),
        dryRun: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const dryRun = args.dryRun ?? true;

        const agents = args.departmentId
            ? await ctx.db
                .query("agents")
                .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
                .collect()
            : await ctx.db.query("agents").collect();

        const tasks = args.departmentId
            ? await ctx.db
                .query("tasks")
                .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
                .collect()
            : await ctx.db.query("tasks").collect();
        const messages = args.departmentId
            ? await ctx.db
                .query("messages")
                .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
                .collect()
            : await ctx.db.query("messages").collect();
        const threadReads = args.departmentId
            ? await ctx.db
                .query("thread_reads")
                .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
                .collect()
            : await ctx.db.query("thread_reads").collect();
        const activities = args.departmentId
            ? await ctx.db
                .query("activities")
                .withIndex("by_department_createdAt", (q) => q.eq("departmentId", args.departmentId))
                .collect()
            : await ctx.db.query("activities").collect();
        const notifications = args.departmentId
            ? await ctx.db
                .query("notifications")
                .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
                .collect()
            : await ctx.db.query("notifications").collect();
        const threadSubscriptionsRaw = await ctx.db.query("thread_subscriptions").collect();
        const threadSubscriptions = args.departmentId
            ? threadSubscriptionsRaw.filter((row) => row.departmentId === args.departmentId)
            : threadSubscriptionsRaw;
        const executorRunsRaw = await ctx.db.query("executor_runs").collect();
        const executorRuns = args.departmentId
            ? executorRunsRaw.filter((row) => row.departmentId === args.departmentId)
            : executorRunsRaw;
        const documentsRaw = await ctx.db.query("documents").collect();
        const documents = args.departmentId
            ? documentsRaw.filter((row) => row.departmentId === args.departmentId)
            : documentsRaw;
        const templatesRaw = await ctx.db.query("agentTemplates").collect();
        const templates = args.departmentId
            ? templatesRaw.filter(
                (template) => template.departmentId === args.departmentId || template.departmentId === undefined
            )
            : templatesRaw;

        const localTemplateByDeptSlug = new Map<string, (typeof templates)[number]>();
        const publicTemplateBySlug = new Map<string, Array<(typeof templates)[number]>>();
        for (const template of templates) {
            const slug = normalizeAgentSlug(template.name);
            if (!slug) continue;
            if (template.departmentId) {
                localTemplateByDeptSlug.set(`${String(template.departmentId)}::${slug}`, template);
                continue;
            }
            const existing = publicTemplateBySlug.get(slug);
            if (existing) {
                existing.push(template);
            } else {
                publicTemplateBySlug.set(slug, [template]);
            }
        }

        const templateIdOverride = new Map<(typeof agents)[number]["_id"], (typeof templates)[number]["_id"]>();
        let templateBackfilled = 0;
        for (const agent of agents) {
            if (!agent.departmentId || agent.templateId) continue;
            const slug = normalizeAgentSlug(agent.slug ?? agent.name ?? agent.sessionKey);
            if (!slug) continue;
            const local = localTemplateByDeptSlug.get(`${String(agent.departmentId)}::${slug}`);
            const publicCandidates = publicTemplateBySlug.get(slug) ?? [];
            const selectedTemplate = local ?? (publicCandidates.length === 1 ? publicCandidates[0] : null);
            if (!selectedTemplate) continue;

            templateIdOverride.set(agent._id, selectedTemplate._id);
            if (!dryRun) {
                await ctx.db.patch(agent._id, { templateId: selectedTemplate._id });
            }
            templateBackfilled += 1;
        }

        const refCountBySession = new Map<string, number>();
        const bump = (sessionKey: string | undefined) => {
            if (!sessionKey) return;
            refCountBySession.set(sessionKey, (refCountBySession.get(sessionKey) ?? 0) + 1);
        };

        for (const task of tasks) {
            bump(task.createdBySessionKey);
            for (const sessionKey of task.assigneeSessionKeys ?? []) bump(sessionKey);
        }
        for (const message of messages) bump(message.fromSessionKey);
        for (const threadRead of threadReads) bump(threadRead.readerSessionKey);
        for (const activity of activities) bump(activity.sessionKey);
        for (const notification of notifications) bump(notification.mentionedSessionKey);
        for (const subscription of threadSubscriptions) bump(subscription.sessionKey);
        for (const run of executorRuns) bump(run.executorSessionKey);
        for (const document of documents) bump(document.createdBySessionKey);

        const groups = new Map<string, typeof agents>();
        for (const agent of agents) {
            if (!agent.departmentId) continue;
            const effectiveTemplateId = agent.templateId ?? templateIdOverride.get(agent._id);
            const key = effectiveTemplateId
                ? `${String(agent.departmentId)}::template::${String(effectiveTemplateId)}`
                : `${String(agent.departmentId)}::slug::${normalizeAgentSlug(agent.slug ?? agent.name ?? agent.sessionKey)}`;
            const existing = groups.get(key);
            if (existing) {
                existing.push(agent);
            } else {
                groups.set(key, [agent]);
            }
        }

        const rewiredRows = {
            tasks: 0,
            messages: 0,
            threadReads: 0,
            activities: 0,
            notifications: 0,
            threadSubscriptions: 0,
            executorRuns: 0,
            documents: 0,
        };

        const rewriteSessionKey = async (from: string, to: string) => {
            if (from === to) return;

            for (const task of tasks) {
                const nextAssignees = (task.assigneeSessionKeys ?? []).map((sessionKey) =>
                    sessionKey === from ? to : sessionKey
                );
                const dedupedAssignees = Array.from(new Set(nextAssignees));
                const assigneesChanged =
                    dedupedAssignees.length !== (task.assigneeSessionKeys ?? []).length ||
                    dedupedAssignees.some((sessionKey, index) => sessionKey !== (task.assigneeSessionKeys ?? [])[index]);
                const creatorChanged = task.createdBySessionKey === from;
                if (!assigneesChanged && !creatorChanged) continue;
                if (!dryRun) {
                    await ctx.db.patch(task._id, {
                        ...(assigneesChanged ? { assigneeSessionKeys: dedupedAssignees } : {}),
                        ...(creatorChanged ? { createdBySessionKey: to } : {}),
                    });
                }
                if (assigneesChanged) task.assigneeSessionKeys = dedupedAssignees;
                if (creatorChanged) task.createdBySessionKey = to;
                rewiredRows.tasks += 1;
            }

            for (const message of messages) {
                if (message.fromSessionKey !== from) continue;
                if (!dryRun) await ctx.db.patch(message._id, { fromSessionKey: to });
                message.fromSessionKey = to;
                rewiredRows.messages += 1;
            }

            for (const threadRead of threadReads) {
                if (threadRead.readerSessionKey !== from) continue;
                if (!dryRun) await ctx.db.patch(threadRead._id, { readerSessionKey: to });
                threadRead.readerSessionKey = to;
                rewiredRows.threadReads += 1;
            }

            for (const activity of activities) {
                if (activity.sessionKey !== from) continue;
                if (!dryRun) await ctx.db.patch(activity._id, { sessionKey: to });
                activity.sessionKey = to;
                rewiredRows.activities += 1;
            }

            for (const notification of notifications) {
                if (notification.mentionedSessionKey !== from) continue;
                if (!dryRun) await ctx.db.patch(notification._id, { mentionedSessionKey: to });
                notification.mentionedSessionKey = to;
                rewiredRows.notifications += 1;
            }

            for (const subscription of threadSubscriptions) {
                if (subscription.sessionKey !== from) continue;
                if (!dryRun) await ctx.db.patch(subscription._id, { sessionKey: to });
                subscription.sessionKey = to;
                rewiredRows.threadSubscriptions += 1;
            }

            for (const run of executorRuns) {
                if (run.executorSessionKey !== from) continue;
                if (!dryRun) await ctx.db.patch(run._id, { executorSessionKey: to });
                run.executorSessionKey = to;
                rewiredRows.executorRuns += 1;
            }

            for (const document of documents) {
                if (document.createdBySessionKey !== from) continue;
                if (!dryRun) await ctx.db.patch(document._id, { createdBySessionKey: to });
                document.createdBySessionKey = to;
                rewiredRows.documents += 1;
            }
        };

        let duplicateGroups = 0;
        let duplicateRows = 0;
        let deleted = 0;

        for (const group of groups.values()) {
            if (group.length <= 1) continue;
            duplicateGroups += 1;

            const sorted = [...group].sort((a, b) => {
                const refA = refCountBySession.get(a.sessionKey) ?? 0;
                const refB = refCountBySession.get(b.sessionKey) ?? 0;
                if (refA !== refB) return refB - refA;
                const lastSeenA = a.lastSeenAt ?? 0;
                const lastSeenB = b.lastSeenAt ?? 0;
                if (lastSeenA !== lastSeenB) return lastSeenB - lastSeenA;
                return b._creationTime - a._creationTime;
            });

            const keeper = sorted[0];
            let keeperTemplateId = keeper.templateId ?? templateIdOverride.get(keeper._id);
            let keeperSlug = keeper.slug;
            for (const duplicate of sorted.slice(1)) {
                duplicateRows += 1;
                await rewriteSessionKey(duplicate.sessionKey, keeper.sessionKey);

                if (!dryRun) {
                    const duplicateTemplateId =
                        duplicate.templateId ?? templateIdOverride.get(duplicate._id);
                    if (!keeperTemplateId && duplicateTemplateId) {
                        await ctx.db.patch(keeper._id, { templateId: duplicateTemplateId });
                        keeperTemplateId = duplicateTemplateId;
                    }
                    if (!keeperSlug && duplicate.slug) {
                        await ctx.db.patch(keeper._id, { slug: duplicate.slug });
                        keeperSlug = duplicate.slug;
                    }
                    await ctx.db.delete(duplicate._id);
                    deleted += 1;
                }
            }
        }

        return {
            ok: true,
            dryRun,
            totalAgents: agents.length,
            templateBackfilled,
            duplicateGroups,
            duplicateRows,
            deleted,
            rewiredRows,
        };
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
