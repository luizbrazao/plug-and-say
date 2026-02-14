import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

function parseTelegramUserNameFromTaskDescription(description?: string): string | null {
    if (!description) return null;
    const match = description.match(/Live support thread for\s+(.+?)\.\s+Telegram Chat ID:/i);
    if (!match?.[1]) return null;
    return match[1].trim();
}

function fallbackNameFromSessionKey(sessionKey?: string | null): string {
    if (!sessionKey) return "System";
    if (sessionKey.startsWith("user:telegram:")) return "Telegram User";
    if (sessionKey.startsWith("user:")) return "User";
    if (sessionKey.startsWith("agent:")) return sessionKey.split(":").pop() || "Agent";
    return sessionKey;
}

export const listRecent = query({
    args: {
        departmentId: v.id("departments"),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 20;

        // pega os mais recentes por departmentId e createdAt
        const items = await ctx.db
            .query("activities")
            .withIndex("by_department_createdAt", (q) => q.eq("departmentId", args.departmentId))
            .order("desc")
            .take(limit);

        const agents = await ctx.db
            .query("agents")
            .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
            .collect();
        const agentBySessionKey = new Map(agents.map((agent) => [agent.sessionKey, agent.name]));

        const taskIds = Array.from(new Set(items.map((item) => item.taskId).filter(Boolean))) as any[];
        const taskById = new Map<string, any>();
        for (const taskId of taskIds) {
            const task = await ctx.db.get(taskId);
            if (task) taskById.set(taskId, task);
        }

        return items.map((a) => ({
            ...(function resolveActor() {
                if (a.actorName) {
                    return {
                        actorName: a.actorName,
                        actorType: a.actorType ?? "system",
                    };
                }

                const sessionKey = a.sessionKey ?? null;
                if (!sessionKey) {
                    return { actorName: "System", actorType: "system" as const };
                }

                if (sessionKey.startsWith("agent:")) {
                    return {
                        actorName: agentBySessionKey.get(sessionKey) ?? fallbackNameFromSessionKey(sessionKey),
                        actorType: "agent" as const,
                    };
                }

                if (sessionKey.startsWith("user:telegram:")) {
                    const task = a.taskId ? taskById.get(a.taskId) : null;
                    const telegramUserName = parseTelegramUserNameFromTaskDescription(task?.description);
                    return {
                        actorName: telegramUserName ?? "Telegram User",
                        actorType: "user" as const,
                    };
                }

                if (sessionKey.startsWith("user:")) {
                    return { actorName: "User", actorType: "user" as const };
                }

                return {
                    actorName: fallbackNameFromSessionKey(sessionKey),
                    actorType: "system" as const,
                };
            })(),
            _id: a._id,
            _creationTime: a._creationTime,
            type: a.type,
            message: a.message,
            sessionKey: a.sessionKey ?? null,
            taskId: a.taskId ?? null,
            createdAt: a.createdAt,
        }));
    },
});

export const backfillActorNames = mutation({
    args: {
        departmentId: v.optional(v.id("departments")),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 500;
        const items = args.departmentId
            ? await ctx.db
                .query("activities")
                .withIndex("by_department_createdAt", (q) => q.eq("departmentId", args.departmentId!))
                .order("desc")
                .take(limit)
            : await ctx.db.query("activities").order("desc").take(limit);

        let patched = 0;
        let skipped = 0;

        const agentsByDepartment = new Map<string, Map<string, string>>();
        const taskCache = new Map<string, any>();

        for (const activity of items) {
            if (activity.actorName) {
                skipped += 1;
                continue;
            }

            const departmentId = activity.departmentId;
            const sessionKey = activity.sessionKey ?? null;
            let actorName = "System";
            let actorType: "agent" | "user" | "system" = "system";

            if (sessionKey?.startsWith("agent:") && departmentId) {
                const cacheKey = String(departmentId);
                let deptAgents = agentsByDepartment.get(cacheKey);
                if (!deptAgents) {
                    const agents = await ctx.db
                        .query("agents")
                        .withIndex("by_departmentId", (q) => q.eq("departmentId", departmentId as any))
                        .collect();
                    deptAgents = new Map(agents.map((agent) => [agent.sessionKey, agent.name]));
                    agentsByDepartment.set(cacheKey, deptAgents);
                }
                actorName = deptAgents.get(sessionKey) ?? fallbackNameFromSessionKey(sessionKey);
                actorType = "agent";
            } else if (sessionKey?.startsWith("user:telegram:")) {
                actorType = "user";
                let task: any = null;
                if (activity.taskId) {
                    const taskKey = String(activity.taskId);
                    task = taskCache.get(taskKey);
                    if (!task) {
                        task = await ctx.db.get(activity.taskId);
                        if (task) taskCache.set(taskKey, task);
                    }
                }
                actorName = parseTelegramUserNameFromTaskDescription(task?.description) ?? "Telegram User";
            } else if (sessionKey?.startsWith("user:")) {
                actorName = "User";
                actorType = "user";
            } else if (sessionKey) {
                actorName = fallbackNameFromSessionKey(sessionKey);
            }

            await ctx.db.patch(activity._id, { actorName, actorType } as any);
            patched += 1;
        }

        return { ok: true, patched, skipped, total: items.length };
    },
});
