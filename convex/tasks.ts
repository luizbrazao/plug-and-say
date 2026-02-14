import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator, type PaginationOptions, type PaginationResult } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";

function parseTelegramUserNameFromTaskDescription(description?: string): string | null {
    if (!description) return null;
    const match = description.match(/Live support thread for\s+(.+?)\.\s+Telegram Chat ID:/i);
    if (!match?.[1]) return null;
    return match[1].trim();
}

async function resolveActorMeta(ctx: any, departmentId: any, sessionKey?: string | null) {
    if (!sessionKey) return { actorName: "System", actorType: "system" as const };
    if (sessionKey.startsWith("user:telegram:")) {
        return { actorName: "Telegram User", actorType: "user" as const };
    }
    if (sessionKey.startsWith("user:")) {
        return { actorName: "User", actorType: "user" as const };
    }
    if (sessionKey.startsWith("agent:")) {
        const agents = await ctx.db
            .query("agents")
            .withIndex("by_departmentId", (q: any) => q.eq("departmentId", departmentId))
            .collect();
        const agent = agents.find((a: any) => a.sessionKey === sessionKey);
        return { actorName: agent?.name ?? (sessionKey.split(":").pop() || "Agent"), actorType: "agent" as const };
    }
    return { actorName: sessionKey, actorType: "system" as const };
}
/**
 * Status schema (reuso)
 */
const taskStatus = v.union(
    v.literal("inbox"),
    v.literal("assigned"),
    v.literal("in_progress"),
    v.literal("review"),
    v.literal("done"),
    v.literal("blocked")
);

const VALID_STATUSES = ["inbox", "assigned", "in_progress", "review", "done", "blocked"] as const;
type TaskStatus = (typeof VALID_STATUSES)[number];

function normalizeTaskStatus(input: string): TaskStatus {
    const normalized = input.toLowerCase() as TaskStatus;
    return (VALID_STATUSES as readonly string[]).includes(normalized) ? normalized : "inbox";
}

async function getOrganizationLanguageByDepartment(
    ctx: any,
    departmentId: Id<"departments">
): Promise<"en" | "es" | "pt"> {
    const department = await ctx.db.get(departmentId);
    if (!department?.orgId) return "pt";
    const organization = await ctx.db.get(department.orgId);
    const language = String((organization as { language?: string } | null)?.language ?? "")
        .trim()
        .toLowerCase();
    if (language === "en" || language === "es" || language === "pt") {
        return language;
    }
    return "pt";
}

/**
 * Create a task in PlugandSay.
 * Status starts as "assigned" if there are assignees, otherwise "inbox".
 */
export const create = mutation({
    args: {
        departmentId: v.id("departments"),
        parentTaskId: v.optional(v.id("tasks")),
        title: v.string(),
        description: v.string(),
        createdBySessionKey: v.optional(v.string()),
        createdByName: v.optional(v.string()),
        assigneeSessionKeys: v.array(v.string()), // Keeping this as it's used in the handler and not explicitly removed in the diff for the handler
        priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
        tags: v.optional(v.array(v.string())),
    },
    handler: async (ctx, args) => {
        const now = Date.now();

        // Para multitenancy, garantimos que a task pertence a uma org (department)
        const initialStatus = normalizeTaskStatus(
            args.assigneeSessionKeys.length > 0 ? "assigned" : "inbox"
        );
        const taskId = await ctx.db.insert("tasks", {
            departmentId: args.departmentId,
            parentTaskId: args.parentTaskId,
            title: args.title,
            description: args.description,
            createdBySessionKey: args.createdBySessionKey,
            createdByName: args.createdByName,
            status: initialStatus,
            assigneeSessionKeys: args.assigneeSessionKeys,
            priority: args.priority ?? "medium",
            tags: args.tags ?? [],
            createdAt: now,
        });

        const creatorSessionKey = args.createdBySessionKey ?? "agent:main:main";
        const actor =
            args.createdByName?.trim()
                ? {
                    actorName: args.createdByName.trim(),
                    actorType: creatorSessionKey.startsWith("agent:") ? ("agent" as const) : ("user" as const),
                }
                : await resolveActorMeta(ctx, args.departmentId, creatorSessionKey);

        // log activity entry
        await ctx.db.insert("activities", {
            departmentId: args.departmentId,
            type: "task_created",
            sessionKey: creatorSessionKey,
            actorName: actor.actorName,
            actorType: actor.actorType,
            taskId, // ✅ útil para auditoria/feeds por task
            message: `Task criada: ${args.title}`,
            createdAt: now,
        });

        // Trigger Brain (Async)
        await ctx.scheduler.runAfter(0, internal.brain.onNewTask, {
            departmentId: args.departmentId,
            taskId,
            description: args.description,
            assigneeSessionKeys: args.assigneeSessionKeys,
        });

        // Long-term memory: embed every new task
        await ctx.scheduler.runAfter(0, internal.memory.embedTask, {
            taskId,
        });

        return taskId;
    },
});

/**
 * List tasks by status, newest first.
 * (Usa índice by_org_status do schema)
 */
export const listByStatus = query({
    args: {
        departmentId: v.id("departments"),
        status: taskStatus,
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 50;
        const requestedStatus = normalizeTaskStatus(args.status);

        const tasks = await ctx.db
            .query("tasks")
            .withIndex("by_departmentId", (q) =>
                q.eq("departmentId", args.departmentId)
            )
            .collect();
        // Defensive filter handles legacy uppercase/mixed-case rows.
        return tasks
            .filter((t) => {
                const normalizedStatus = normalizeTaskStatus(String(t.status));
                if (requestedStatus === "in_progress") {
                    return normalizedStatus === "in_progress" || normalizedStatus === "blocked";
                }
                if (requestedStatus === "done") {
                    return normalizedStatus === "done" && !t.doneClearedAt;
                }
                return normalizedStatus === requestedStatus;
            })
            .sort((a, b) => (b.createdAt ?? b._creationTime) - (a.createdAt ?? a._creationTime))
            .slice(0, limit)
            .map((t) => ({
                ...t,
                ownerName:
                    t.createdByName ??
                    parseTelegramUserNameFromTaskDescription(t.description) ??
                    undefined,
            }));
    },
});

/**
 * List done tasks with server-side pagination, newest first.
 */
export const listDonePaginated = query({
    args: {
        departmentId: v.id("departments"),
        paginationOpts: paginationOptsValidator,
    },
    handler: async (
        ctx,
        args: {
            departmentId: Id<"departments">;
            paginationOpts: PaginationOptions;
        }
    ): Promise<PaginationResult<Doc<"tasks">>> => {
        return await ctx.db
            .query("tasks")
            .withIndex("by_dept_status", (q) =>
                q.eq("departmentId", args.departmentId).eq("status", "done")
            )
            .order("desc")
            .paginate(args.paginationOpts);
    },
});

/**
 * Debug helper: inspect latest tasks and their routing fields.
 */
export const debugLatest = query({
    args: {
        departmentId: v.optional(v.id("departments")),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
        let tasks = await ctx.db.query("tasks").order("desc").take(limit * 3);
        if (args.departmentId) {
            tasks = tasks.filter((t) => t.departmentId === args.departmentId);
        }
        return tasks.slice(0, limit).map((t) => ({
            _id: t._id,
            _creationTime: t._creationTime,
            departmentId: t.departmentId,
            parentTaskId: t.parentTaskId,
            status: t.status,
            title: t.title,
            assigneeSessionKeys: t.assigneeSessionKeys ?? [],
            hasTelegramMarker:
                typeof t.description === "string" &&
                /Telegram Chat ID:\s*\d+/i.test(t.description),
        }));
    },
});

/**
 * Get a single task by id.
 */
export const get = query({
    args: {
        departmentId: v.id("departments"),
        taskId: v.id("tasks")
    },
    handler: async (ctx, args) => {
        const task = await ctx.db.get(args.taskId);
        if (!task || task.departmentId !== args.departmentId) {
            throw new Error("Task not found in this department");
        }
        return task;
    },
});

/**
 * tasks:getThreadSnapshot
 * - snapshot atômico de uma task + sua thread de mensagens
 * - ordena mensagens por createdAt asc (thread real)
 * - aplica limit opcional (default: 100)
 * - base de leitura para agentes
 */
export const getThreadSnapshot = query({
    args: {
        taskId: v.id("tasks"),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 100;

        const task = await ctx.db.get("tasks", args.taskId);
        if (!task) {
            return {
                task: null,
                messages: [],
                totalMessages: 0,
                returnedMessages: 0,
                snapshotAt: Date.now(),
            };
        }

        const messages = await ctx.db
            .query("messages")
            .withIndex("by_department_taskId", (q) =>
                q.eq("departmentId", task.departmentId).eq("taskId", args.taskId)
            )
            .collect();

        messages.sort((a, b) => a.createdAt - b.createdAt);

        const trimmed =
            messages.length > limit
                ? messages.slice(messages.length - limit)
                : messages;

        return {
            task,
            messages: trimmed,
            totalMessages: messages.length,
            returnedMessages: trimmed.length,
            snapshotAt: Date.now(),
        };
    },
});

/**
 * Set status (general mutation).
 */
export const setStatus = mutation({
    args: {
        departmentId: v.id("departments"),
        taskId: v.id("tasks"),
        status: taskStatus,
        bySessionKey: v.string(), // quem executou a mudança (ex: "agent:developer:main")
        reason: v.optional(v.string()), // opcional: motivo da mudança
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const nextStatus = normalizeTaskStatus(args.status);
        const allowDirectDoneReasons = new Set([
            "specialist_completion_done",
            "brain_auto_done_from_provenance",
            "squad_lead_auto_close",
        ]);
        if (nextStatus === "done" && !allowDirectDoneReasons.has(args.reason ?? "")) {
            throw new Error("Direct move to done is disabled. Use tasks.approve from review.");
        }

        const task = await ctx.db.get("tasks", args.taskId);
        if (!task || task.departmentId !== args.departmentId) {
            throw new Error("Task not found in this department");
        }

        const previousStatus = normalizeTaskStatus(String(task.status));
        const actor = await resolveActorMeta(ctx, args.departmentId, args.bySessionKey);
        await ctx.db.patch("tasks", args.taskId, {
            status: nextStatus,
            doneClearedAt: nextStatus === "done" ? undefined : task.doneClearedAt,
        });

        const enteredCompletionState = nextStatus === "review" || nextStatus === "done";
        const statusChanged = nextStatus !== previousStatus;

        if (enteredCompletionState && statusChanged && task.parentTaskId) {
            const parentTask = await ctx.db.get(task.parentTaskId);
            if (parentTask && parentTask.departmentId === task.departmentId) {
                const parentNotifyAt = Date.now();
                await ctx.db.patch("tasks", args.taskId, {
                    parentNotifiedAt: parentNotifyAt,
                });

                const agents = await ctx.db
                    .query("agents")
                    .withIndex("by_departmentId", (q) => q.eq("departmentId", task.departmentId))
                    .collect();
                const jarvis = agents.find((a) => a.name.toLowerCase() === "jarvis");
                const watcherSessionKey =
                    jarvis?.sessionKey ||
                    parentTask.assigneeSessionKeys?.[0] ||
                    "agent:main:main";

                await ctx.scheduler.runAfter(0, internal.brain.think, {
                    departmentId: task.departmentId,
                    taskId: parentTask._id,
                    agentSessionKey: watcherSessionKey,
                    triggerKey: `child_completed:${String(args.taskId)}:${nextStatus}`,
                    language: await getOrganizationLanguageByDepartment(ctx, task.departmentId),
                });

                await ctx.db.insert("activities", {
                    departmentId: task.departmentId,
                    type: "parent_wake_triggered",
                    message: `Parent task wake triggered from child "${task.title}" -> ${nextStatus}`,
                    sessionKey: args.bySessionKey,
                    actorName: actor.actorName,
                    actorType: actor.actorType,
                    taskId: args.taskId,
                    createdAt: parentNotifyAt,
                });
            }
        }

        await ctx.db.insert("activities", {
            departmentId: task.departmentId,
            type: "task_status_changed",
            message: `Status da task "${task.title}" -> ${nextStatus}${args.reason ? ` (${args.reason})` : ""
                }`,
            sessionKey: args.bySessionKey,
            actorName: actor.actorName,
            actorType: actor.actorType,
            taskId: args.taskId,
            createdAt: now,
        });

        return { ok: true };
    },
});

/**
 * Human approval gate: review -> done.
 */
export const approve = mutation({
    args: {
        departmentId: v.id("departments"),
        taskId: v.id("tasks"),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        const task = await ctx.db.get(args.taskId);
        if (!task || task.departmentId !== args.departmentId) {
            throw new Error("Task not found in this department");
        }

        const previousStatus = normalizeTaskStatus(String(task.status));
        if (previousStatus !== "review") {
            throw new Error("Only tasks in review can be approved.");
        }

        const now = Date.now();
        const user = await ctx.db.get(userId);
        const actorName =
            String(user?.name ?? "").trim() ||
            String(user?.email ?? "").trim() ||
            "User";
        const sessionKey = `user:${String(userId)}`;

        await ctx.db.patch(args.taskId, {
            status: "done",
            doneClearedAt: undefined,
        });

        await ctx.scheduler.runAfter(0, internal.memory.embedTask, {
            taskId: args.taskId,
        });

        if (task.parentTaskId) {
            const parentTask = await ctx.db.get(task.parentTaskId);
            if (parentTask && parentTask.departmentId === task.departmentId) {
                const parentNotifyAt = Date.now();
                await ctx.db.patch("tasks", args.taskId, {
                    parentNotifiedAt: parentNotifyAt,
                });

                const agents = await ctx.db
                    .query("agents")
                    .withIndex("by_departmentId", (q) => q.eq("departmentId", task.departmentId))
                    .collect();
                const jarvis = agents.find((a) => a.name.toLowerCase() === "jarvis");
                const watcherSessionKey =
                    jarvis?.sessionKey ||
                    parentTask.assigneeSessionKeys?.[0] ||
                    "agent:main:main";

                await ctx.scheduler.runAfter(0, internal.brain.think, {
                    departmentId: task.departmentId,
                    taskId: parentTask._id,
                    agentSessionKey: watcherSessionKey,
                    triggerKey: `child_completed:${String(args.taskId)}:done`,
                    language: await getOrganizationLanguageByDepartment(ctx, task.departmentId),
                });

                await ctx.db.insert("activities", {
                    departmentId: task.departmentId,
                    type: "parent_wake_triggered",
                    message: `Parent task wake triggered from child "${task.title}" -> done`,
                    sessionKey,
                    actorName,
                    actorType: "user",
                    taskId: args.taskId,
                    createdAt: parentNotifyAt,
                });
            }
        }

        await ctx.db.insert("activities", {
            departmentId: args.departmentId,
            type: "task_approved",
            message: `Task "${task.title}" approved and moved to done`,
            sessionKey,
            actorName,
            actorType: "user",
            taskId: args.taskId,
            createdAt: now,
        });

        return { ok: true, status: "done" as const };
    },
});

/**
 * tasks:unblock
 * - resolve a pendência do UX quando status == "blocked"
 * - muda para nextStatus (default: in_progress)
 */
export const unblock = mutation({
    args: {
        departmentId: v.id("departments"),
        taskId: v.id("tasks"),
        sessionKey: v.string(),
        nextStatus: v.optional(taskStatus),
    },
    handler: async (ctx, args) => {
        const now = Date.now();

        const task = await ctx.db.get(args.taskId);
        if (!task || task.departmentId !== args.departmentId) {
            throw new Error("Task not found in this department");
        }

        if (task.status !== "blocked") {
            return { ok: true, alreadyUnblocked: true };
        }

        const next = normalizeTaskStatus(args.nextStatus ?? "in_progress");
        const actor = await resolveActorMeta(ctx, args.departmentId, args.sessionKey);

        await ctx.db.patch("tasks", args.taskId, { status: next });

        await ctx.db.insert("activities", {
            departmentId: task.departmentId,
            type: "task_unblocked",
            message: `Task desbloqueada por ${args.sessionKey} -> ${next}`,
            sessionKey: args.sessionKey,
            actorName: actor.actorName,
            actorType: actor.actorType,
            taskId: args.taskId,
            createdAt: now,
        });

        return { ok: true, alreadyUnblocked: false, nextStatus: next };
    },
});

/**
 * Hide done cards from Kanban column while keeping them in history.
 */
export const clearDoneColumn = mutation({
    args: {
        departmentId: v.id("departments"),
        bySessionKey: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const tasks = await ctx.db
            .query("tasks")
            .withIndex("by_dept_status", (q) =>
                q.eq("departmentId", args.departmentId).eq("status", "done")
            )
            .collect();

        const visibleDoneTasks = tasks.filter((task) => !task.doneClearedAt);

        for (const task of visibleDoneTasks) {
            await ctx.db.patch(task._id, {
                doneClearedAt: now,
            });
        }

        const actor = await resolveActorMeta(ctx, args.departmentId, args.bySessionKey ?? null);
        await ctx.db.insert("activities", {
            departmentId: args.departmentId,
            type: "done_column_cleared",
            message: `Done column cleaned (${visibleDoneTasks.length} task(s) hidden from board)`,
            sessionKey: args.bySessionKey ?? "agent:main:main",
            actorName: actor.actorName,
            actorType: actor.actorType,
            createdAt: now,
        });

        return {
            ok: true,
            clearedCount: visibleDoneTasks.length,
        };
    },
});

/**
 * Remove a task and task-scoped related data.
 */
export const remove = mutation({
    args: {
        departmentId: v.id("departments"),
        taskId: v.id("tasks"),
        bySessionKey: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const task = await ctx.db.get(args.taskId);
        if (!task || task.departmentId !== args.departmentId) {
            throw new Error("Task not found in this department");
        }

        const [messages, threadReads, subscriptions, runs, docs, allNotifications, allActivities] = await Promise.all([
            ctx.db
                .query("messages")
                .withIndex("by_department_taskId", (q) =>
                    q.eq("departmentId", args.departmentId).eq("taskId", args.taskId)
                )
                .collect(),
            ctx.db
                .query("thread_reads")
                .withIndex("by_task_reader", (q) => q.eq("taskId", args.taskId))
                .collect(),
            ctx.db
                .query("thread_subscriptions")
                .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
                .collect(),
            ctx.db
                .query("executor_runs")
                .withIndex("by_task_runKey", (q) => q.eq("taskId", args.taskId))
                .collect(),
            ctx.db
                .query("documents")
                .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
                .collect(),
            ctx.db
                .query("notifications")
                .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
                .collect(),
            ctx.db
                .query("activities")
                .withIndex("by_department_createdAt", (q) => q.eq("departmentId", args.departmentId))
                .collect(),
        ]);

        const notifications = allNotifications.filter((n) => n.taskId === args.taskId);
        const activities = allActivities.filter((a) => a.taskId === args.taskId);

        const deleteRows = async (rows: Array<{ _id: any }>) => {
            for (const row of rows) {
                await ctx.db.delete(row._id);
            }
            return rows.length;
        };

        const deletedMessages = await deleteRows(messages as any);
        const deletedThreadReads = await deleteRows(threadReads as any);
        const deletedSubscriptions = await deleteRows(subscriptions as any);
        const deletedRuns = await deleteRows(runs as any);
        const deletedDocs = await deleteRows(docs as any);
        const deletedNotifications = await deleteRows(notifications as any);
        const deletedActivities = await deleteRows(activities as any);

        await ctx.db.delete(args.taskId);
        const actor = await resolveActorMeta(ctx, args.departmentId, args.bySessionKey ?? null);

        await ctx.db.insert("activities", {
            departmentId: args.departmentId,
            type: "task_deleted",
            message: `Task removida: ${task.title}`,
            sessionKey: args.bySessionKey ?? "agent:main:main",
            actorName: actor.actorName,
            actorType: actor.actorType,
            createdAt: Date.now(),
        });

        return {
            ok: true,
            deletedTaskId: args.taskId,
            deletedMessages,
            deletedThreadReads,
            deletedSubscriptions,
            deletedRuns,
            deletedDocs,
            deletedNotifications,
            deletedActivities,
        };
    },
});
