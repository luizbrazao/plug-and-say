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
        type AgentCandidate = { _id?: string; name?: string; slug?: string; sessionKey?: string };
        const sanitizeToken = (value: string): string =>
            value
                .trim()
                .toLowerCase()
                .replace(/\s+/g, "")
                .replace(/[^a-z0-9_:-]/g, "")
                .slice(0, 32);
        const sanitizeSlug = (value: string): string =>
            value
                .trim()
                .toLowerCase()
                .replace(/\s+/g, "")
                .replace(/[^a-z0-9_-]/g, "")
                .slice(0, 32);
        const parseAssignee = (rawValue: string) => {
            const trimmed = rawValue.trim();
            const withoutAt = trimmed.replace(/^@+/, "");
            const token = sanitizeToken(withoutAt);
            const withoutAgentPrefix = token.startsWith("agent:")
                ? token.slice("agent:".length)
                : token;
            const slug = sanitizeSlug((withoutAgentPrefix.split(":")[0] ?? "").replace(/^@+/, ""));
            const nameCandidate = withoutAt.replace(/^agent:/i, "").split(":")[0]?.trim().toLowerCase() ?? "";
            return {
                raw: rawValue,
                token,
                slug,
                nameCandidate,
            };
        };

        const matchAssignee = (
            rawAssignee: string,
            pool: AgentCandidate[]
        ): { match?: AgentCandidate; kind: "match_exact" | "match_prefix" | "match_name" | "not_found"; slug: string } => {
            const parsed = parseAssignee(rawAssignee);
            console.log("[delegation] resolve:start", {
                rawAssignee: rawAssignee,
                deptId: args.departmentId,
                parsed,
            });

            if (!parsed.slug && !parsed.nameCandidate) {
                console.log("[delegation] resolve:not_found", {
                    rawAssignee,
                    deptId: args.departmentId,
                    reason: "invalid_slug",
                });
                return { kind: "not_found", slug: "" };
            }

            const exact = pool.find((candidate) => {
                const candidateSlug = sanitizeSlug(candidate.slug ?? candidate.name ?? "");
                return parsed.slug.length > 0 && candidateSlug === parsed.slug;
            });
            if (exact) {
                console.log("[delegation] resolve:match_exact", {
                    rawAssignee,
                    deptId: args.departmentId,
                    slug: parsed.slug,
                    agentSessionKey: exact.sessionKey,
                    agentName: exact.name,
                });
                return { match: exact, kind: "match_exact", slug: parsed.slug };
            }

            const prefix = pool.find((candidate) => {
                const candidateSession = sanitizeToken(candidate.sessionKey ?? "");
                return parsed.slug.length > 0 && candidateSession.startsWith(`agent:${parsed.slug}:`);
            });
            if (prefix) {
                console.log("[delegation] resolve:match_prefix", {
                    rawAssignee,
                    deptId: args.departmentId,
                    slug: parsed.slug,
                    agentSessionKey: prefix.sessionKey,
                    agentName: prefix.name,
                });
                return { match: prefix, kind: "match_prefix", slug: parsed.slug };
            }

            const byName = pool.find((candidate) => {
                const candidateName = (candidate.name ?? "").trim().toLowerCase();
                return parsed.nameCandidate.length > 0 && candidateName === parsed.nameCandidate;
            });
            if (byName) {
                console.log("[delegation] resolve:match_name", {
                    rawAssignee,
                    deptId: args.departmentId,
                    nameCandidate: parsed.nameCandidate,
                    agentSessionKey: byName.sessionKey,
                    agentName: byName.name,
                });
                return { match: byName, kind: "match_name", slug: parsed.slug };
            }

            console.log("[delegation] resolve:not_found", {
                rawAssignee,
                deptId: args.departmentId,
                slug: parsed.slug,
                nameCandidate: parsed.nameCandidate,
            });
            return { kind: "not_found", slug: parsed.slug };
        };

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

        const resolveAssignees = (pool: AgentCandidate[]) => {
            const matched: AgentCandidate[] = [];
            const unresolved: string[] = [];
            for (const requested of requestedAssignees) {
                const result = matchAssignee(requested, pool);
                if (result.match) {
                    matched.push(result.match);
                } else {
                    unresolved.push(requested);
                }
            }
            const names = Array.from(
                new Set(
                    matched
                        .map((a) => a.name)
                        .filter((value): value is string => typeof value === "string" && value.length > 0)
                )
            );
            const sessions = Array.from(
                new Set(
                    matched
                        .map((a) => a.sessionKey)
                        .filter((value): value is string => typeof value === "string" && value.length > 0)
                )
            );
            return { matched, names, sessions, unresolved };
        };

        const summarizePool = (pool: AgentCandidate[]) =>
            pool.map((candidate) => ({
                id: candidate._id ?? null,
                name: candidate.name ?? null,
                slug: candidate.slug ?? null,
                sessionKey: candidate.sessionKey ?? null,
            }));

        const ensureMissingSessionKeys = async (matches: AgentCandidate[]) => {
            const missing = matches.filter(
                (candidate) =>
                    !candidate.sessionKey || candidate.sessionKey.trim().length === 0
            );
            if (missing.length === 0) return false;

            console.log("[delegation] resolve:missing_session_keys", {
                deptId: args.departmentId,
                missing: missing.map((candidate) => ({
                    id: candidate._id ?? null,
                    name: candidate.name ?? null,
                    slug: candidate.slug ?? null,
                    sessionKey: candidate.sessionKey ?? null,
                })),
            });

            for (const candidate of missing) {
                if (!candidate._id) continue;
                const ensured = await ctx.runMutation((internal as any).agents.ensureSessionKeyForAgent, {
                    agentId: candidate._id,
                });
                console.log("[delegation] resolve:ensure_session_key", {
                    deptId: args.departmentId,
                    agentId: candidate._id,
                    ensured,
                });
            }

            return true;
        };

        let agents: any[] = await ctx.runQuery(api.agents.listByDept, {
            departmentId: args.departmentId,
        });

        let { matched: resolvedMatched, names: resolvedNames, sessions: resolvedSessionKeys, unresolved: unresolvedNames } =
            resolveAssignees(agents);
        if (await ensureMissingSessionKeys(resolvedMatched)) {
            agents = await ctx.runQuery(api.agents.listByDept, {
                departmentId: args.departmentId,
            });
            ({ matched: resolvedMatched, names: resolvedNames, sessions: resolvedSessionKeys, unresolved: unresolvedNames } =
                resolveAssignees(agents));
        }

        if (unresolvedNames.length > 0) {
            const deptTemplates: any[] = await ctx.runQuery(api.agentTemplates.listByDept, {
                departmentId: args.departmentId,
            });
            const publicTemplates: any[] = await ctx.runQuery(api.agentTemplates.listPublic, {
                limit: 200,
            });

            for (const unresolved of unresolvedNames) {
                const target = parseAssignee(unresolved).slug;
                if (!target) continue;
                const localTemplate = deptTemplates.find(
                    (t) => parseAssignee(String(t.slug ?? t.name ?? "")).slug === target
                );
                if (localTemplate?._id) {
                    const upserted = await ctx.runMutation(internal.agents.upsertFromTemplateForDepartment, {
                        departmentId: args.departmentId,
                        templateId: localTemplate._id,
                    });
                    console.log("[delegation] resolve:upsert_local_template", {
                        target,
                        templateId: localTemplate._id,
                        upserted,
                    });
                    continue;
                }

                const publicTemplate = publicTemplates.find(
                    (t) => parseAssignee(String(t.slug ?? t.name ?? "")).slug === target
                );
                if (publicTemplate?._id) {
                    const installed = await ctx.runMutation(internal.agentTemplates.installPublicTemplateSystem, {
                        templateId: publicTemplate._id,
                        targetDepartmentId: args.departmentId,
                    });
                    console.log("[delegation] resolve:install_public_template", {
                        target,
                        templateId: publicTemplate._id,
                        installed,
                    });
                }
            }

            agents = await ctx.runQuery(api.agents.listByDept, {
                departmentId: args.departmentId,
            });
            ({ matched: resolvedMatched, names: resolvedNames, sessions: resolvedSessionKeys, unresolved: unresolvedNames } =
                resolveAssignees(agents));
            if (await ensureMissingSessionKeys(resolvedMatched)) {
                agents = await ctx.runQuery(api.agents.listByDept, {
                    departmentId: args.departmentId,
                });
                ({ matched: resolvedMatched, names: resolvedNames, sessions: resolvedSessionKeys, unresolved: unresolvedNames } =
                    resolveAssignees(agents));
            }
        }

        if (resolvedSessionKeys.length === 0) {
            console.log("[delegation] resolve:pre_throw", {
                deptId: args.departmentId,
                requestedAssignees,
                unresolvedNames,
                matched: resolvedMatched.map((candidate) => ({
                    id: candidate._id ?? null,
                    name: candidate.name ?? null,
                    slug: candidate.slug ?? null,
                    sessionKey: candidate.sessionKey ?? null,
                })),
                resolvedSessionKeys,
                pool: summarizePool(agents),
            });
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
