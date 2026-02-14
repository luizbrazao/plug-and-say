import { internalAction, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";

export const findRecentDelegatedTask = internalQuery({
    args: {
        departmentId: v.id("departments"),
        parentTaskId: v.optional(v.id("tasks")),
        title: v.string(),
        windowMs: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const windowMs = Math.max(1, Math.min(args.windowMs ?? 5 * 60_000, 60 * 60_000));
        const threshold = now - windowMs;
        const normalizedTitle = args.title.trim().toLowerCase();

        const tasks = await ctx.db
            .query("tasks")
            .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
            .collect();

        const match = tasks.find((task) => {
            const taskCreatedAt = task.createdAt ?? task._creationTime;
            const sameParent =
                (args.parentTaskId === undefined && task.parentTaskId === undefined) ||
                task.parentTaskId === args.parentTaskId;
            return (
                sameParent &&
                String(task.title ?? "").trim().toLowerCase() === normalizedTitle &&
                taskCreatedAt >= threshold
            );
        });

        return match ? { taskId: match._id, createdAt: match.createdAt ?? match._creationTime } : null;
    },
});

/**
 * internal:tools:delegation:delegateTask
 * Creates a public task, assigns specialists, and posts the first instruction.
 */
export const delegateTask = internalAction({
    args: {
        departmentId: v.id("departments"),
        parentTaskId: v.optional(v.id("tasks")),
        delegatorSessionKey: v.string(),
        title: v.string(),
        description: v.string(),
        assignees: v.array(v.string()),
        instruction: v.string(),
        priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
        tags: v.optional(v.array(v.string())),
    },
    handler: async (ctx, args): Promise<any> => {
        const normalizeAssignee = (value: string) =>
            value.trim().replace(/^@+/, "").toLowerCase();

        const title = args.title.trim();
        const rawDescription = args.description.trim();
        const description = rawDescription || "Task delegated by Squad Lead";
        const instruction = args.instruction.trim();
        const requestedAssignees = args.assignees.map((a) => a.trim()).filter(Boolean);

        if (!title) throw new Error("delegate_task requires a non-empty 'title'.");
        if (!instruction) throw new Error("delegate_task requires a non-empty 'instruction'.");
        if (requestedAssignees.length === 0) {
            throw new Error("delegate_task requires at least one assignee.");
        }

        const resolveAssignees = (pool: any[]) => {
            const matched = requestedAssignees
                .map((name) =>
                    pool.find(
                        (a) =>
                            a.name?.toLowerCase() === normalizeAssignee(name) ||
                            a.sessionKey?.toLowerCase() === normalizeAssignee(name)
                    )
                )
                .filter(Boolean);
            const names = Array.from(new Set(matched.map((a) => a.name)));
            const sessions = Array.from(new Set(matched.map((a) => a.sessionKey)));
            const unresolved = requestedAssignees.filter(
                (name) => !names.some((resolved) => resolved.toLowerCase() === normalizeAssignee(name))
            );
            return { matched, names, sessions, unresolved };
        };

        let agents: any[] = await ctx.runQuery(api.agents.listByDept, {
            departmentId: args.departmentId,
        });

        let { names: resolvedNames, sessions: resolvedSessionKeys, unresolved: unresolvedNames } =
            resolveAssignees(agents);

        if (unresolvedNames.length > 0) {
            const deptTemplates: any[] = await ctx.runQuery(api.agentTemplates.listByDept, {
                departmentId: args.departmentId,
            });
            const publicTemplates: any[] = await ctx.runQuery(api.agentTemplates.listPublic, {
                limit: 200,
            });

            for (const unresolved of unresolvedNames) {
                const target = normalizeAssignee(unresolved);
                const localTemplate = deptTemplates.find(
                    (t) => t.name?.toLowerCase() === target
                );
                if (localTemplate?._id) {
                    await ctx.runMutation(api.agentTemplates.createAgentFromTemplate, {
                        templateId: localTemplate._id,
                        sessionKey: `agent:${target}:${Date.now()}`,
                    });
                    continue;
                }

                const publicTemplate = publicTemplates.find(
                    (t) => t.name?.toLowerCase() === target
                );
                if (publicTemplate?._id) {
                    await ctx.runMutation(internal.agentTemplates.installPublicTemplateSystem, {
                        templateId: publicTemplate._id,
                        targetDepartmentId: args.departmentId,
                    });
                }
            }

            agents = await ctx.runQuery(api.agents.listByDept, {
                departmentId: args.departmentId,
            });
            ({ names: resolvedNames, sessions: resolvedSessionKeys, unresolved: unresolvedNames } =
                resolveAssignees(agents));
        }

        if (resolvedSessionKeys.length === 0) {
            throw new Error(
                `delegate_task could not resolve assignees. Unknown: ${unresolvedNames.join(", ")}`
            );
        }

        const taskDescription =
            unresolvedNames.length > 0
                ? `${description}\n\n[Delegation note] Unresolved assignees: ${unresolvedNames.join(", ")}`
                : description;

        const existing = await ctx.runQuery(internal.tools.delegation.findRecentDelegatedTask, {
            departmentId: args.departmentId,
            parentTaskId: args.parentTaskId,
            title,
            windowMs: 5 * 60_000,
        });

        if (existing?.taskId) {
            return {
                ok: true,
                taskId: existing.taskId,
                reused: true,
                title,
                descriptionUsedFallback: rawDescription.length === 0,
                assigneesRequested: requestedAssignees,
                assigneesResolved: resolvedNames,
                unresolvedAssignees: unresolvedNames,
            };
        }

        const taskId = await ctx.runMutation(api.tasks.create, {
            departmentId: args.departmentId,
            parentTaskId: args.parentTaskId,
            title,
            description: taskDescription,
            assigneeSessionKeys: resolvedSessionKeys,
            priority: args.priority,
            tags: args.tags,
        });

        // Keep delegated tasks visible immediately in inbox.
        await ctx.runMutation(api.tasks.setStatus, {
            departmentId: args.departmentId,
            taskId,
            status: "inbox",
            bySessionKey: args.delegatorSessionKey,
            reason: "delegation_inbox_visibility",
        });

        await ctx.runMutation(api.messages.create, {
            departmentId: args.departmentId,
            taskId,
            fromSessionKey: args.delegatorSessionKey,
            content: instruction,
        });

        return {
            ok: true,
            taskId,
            reused: false,
            title,
            descriptionUsedFallback: rawDescription.length === 0,
            assigneesRequested: requestedAssignees,
            assigneesResolved: resolvedNames,
            unresolvedAssignees: unresolvedNames,
        };
    },
});

/**
 * internal:tools:delegation:updateTaskStatus
 * Allows specialists to mark their delegated task as review.
 */
export const updateTaskStatus = internalAction({
    args: {
        departmentId: v.id("departments"),
        taskId: v.id("tasks"),
        bySessionKey: v.string(),
        status: v.union(v.literal("review"), v.literal("done")),
        summary: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<any> => {
        const bySession = String(args.bySessionKey ?? "").toLowerCase();
        const isSquadLead =
            bySession.includes("jarvis") ||
            bySession === "agent:main:main";
        const nextStatus = args.status === "done" && isSquadLead ? "done" : "review";
        const summary = args.summary?.trim();
        if (summary) {
            await ctx.runMutation(api.messages.create, {
                departmentId: args.departmentId,
                taskId: args.taskId,
                fromSessionKey: args.bySessionKey,
                content: summary,
            });
        }

        await ctx.runMutation(api.tasks.setStatus, {
            departmentId: args.departmentId,
            taskId: args.taskId,
            status: nextStatus,
            bySessionKey: args.bySessionKey,
            reason: nextStatus === "done" ? "specialist_completion_done" : "specialist_completion",
        });

        return {
            ok: true,
            taskId: args.taskId,
            status: nextStatus,
            summaryPosted: Boolean(summary),
        };
    },
});
