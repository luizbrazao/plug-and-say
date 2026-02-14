import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";

function extractMentions(content: string): { all: boolean; names: string[] } {
    // captura tokens do tipo @Vision, @Fury, @customer-researcher etc.
    // (não inclui pontuação final tipo @Vision, ou @Vision.)
    const re = /@([a-zA-Z0-9_-]+)/g;

    const names: string[] = [];
    let all = false;

    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
        const raw = m[1];
        if (!raw) continue;

        if (raw.toLowerCase() === "all") {
            all = true;
            continue;
        }

        names.push(raw);
    }

    // dedup case-insensitive
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const n of names) {
        const key = n.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(n);
    }

    return { all, names: deduped };
}

function parseTelegramUserNameFromTaskDescription(description?: string): string | null {
    if (!description) return null;
    const match = description.match(/Live support thread for\s+(.+?)\.\s+Telegram Chat ID:/i);
    if (!match?.[1]) return null;
    return match[1].trim();
}

/**
 * messages:create
 * - cria uma mensagem (comentário) ligada a uma task
 * - registra uma activity no feed global
 * - cria notifications a partir de @mentions (inclui @all)
 * - instrumenta user_ping_message para UX (quando mensagem é "ping")
 */
export const create = mutation({
    args: {
        departmentId: v.id("departments"),
        taskId: v.id("tasks"),
        fromSessionKey: v.string(),
        fromDisplayName: v.optional(v.string()),
        content: v.string(),
    },
    handler: async (ctx, args) => {
        const now = Date.now();

        // garante que a task existe e pertence ao department
        const task = await ctx.db.get(args.taskId);
        if (!task || task.departmentId !== args.departmentId) {
            throw new Error("Task não encontrada ou acesso negado.");
        }

        // cria a mensagem
        const messageId = await ctx.db.insert("messages", {
            departmentId: task.departmentId,
            taskId: args.taskId,
            fromSessionKey: args.fromSessionKey,
            content: args.content,
            createdAt: now,
        });

        // atualiza timestamp da task
        await ctx.db.patch(args.taskId, { createdAt: now });

        let agentsCache: any[] | null = null;
        const getAgents = async () => {
            if (agentsCache) return agentsCache;
            agentsCache = await ctx.db
                .query("agents")
                .withIndex("by_departmentId", (q) => q.eq("departmentId", task.departmentId))
                .collect();
            return agentsCache;
        };

        const resolveActorMeta = async () => {
            const preferred = args.fromDisplayName?.trim();
            if (preferred) {
                return {
                    actorName: preferred,
                    actorType: args.fromSessionKey.startsWith("agent:") ? "agent" as const : "user" as const,
                };
            }
            if (args.fromSessionKey.startsWith("agent:")) {
                const agents = await getAgents();
                const agent = agents.find((a) => a.sessionKey === args.fromSessionKey);
                return { actorName: agent?.name ?? (args.fromSessionKey.split(":").pop() || "Agent"), actorType: "agent" as const };
            }
            if (args.fromSessionKey.startsWith("user:telegram:")) {
                return {
                    actorName: parseTelegramUserNameFromTaskDescription(task.description) ?? "Telegram User",
                    actorType: "user" as const,
                };
            }
            if (args.fromSessionKey.startsWith("user:")) {
                return { actorName: "User", actorType: "user" as const };
            }
            return { actorName: args.fromSessionKey, actorType: "system" as const };
        };

        const actor = await resolveActorMeta();

        // log activity entry
        await ctx.db.insert("activities", {
            departmentId: args.departmentId,
            type: "comment_added",
            message: `Novo comentário na task: ${args.content.substring(0, 50)}${args.content.length > 50 ? "..." : ""
                }`,
            sessionKey: args.fromSessionKey,
            actorName: actor.actorName,
            actorType: actor.actorType,
            taskId: args.taskId,
            createdAt: now,
        });

        // analytics (fire-and-forget logic if needed)
        await ctx.db.insert("uxEvents", {
            departmentId: args.departmentId,
            name: "message_created",
            ts: now,
            flowId: args.taskId,
            userId: args.fromSessionKey,
            meta: { messageId },
        });

        // notifica inscritos (exceto autor)
        await ctx.runMutation(
            api.thread_subscriptions_notify.notifySubscribersOfMessage,
            {
                taskId: args.taskId,
                messageId,
                authorSessionKey: args.fromSessionKey,
                contentPreview: args.content.slice(0, 300),
            }
        );

        // registra atividade (feed global)
        await ctx.db.insert("activities", {
            departmentId: task.departmentId,
            type: "message_sent",
            message: `Mensagem em "${task.title}" por ${args.fromSessionKey}`,
            sessionKey: args.fromSessionKey,
            actorName: actor.actorName,
            actorType: actor.actorType,
            taskId: args.taskId,
            createdAt: now,
        });

        // ---- Mentions -> Notifications ----
        const mentions = extractMentions(args.content);

        // Se não tem mentions, terminou
        if (!mentions.all && mentions.names.length === 0) {
            return { messageId, notified: 0 };
        }

        // carrega agents da mesma org para resolver mentions
        const agents = await getAgents();

        // resolve mentioned sessionKeys
        const mentionedSessionKeys = new Set<string>();

        if (mentions.all) {
            for (const a of agents) {
                if (a.sessionKey !== args.fromSessionKey) {
                    mentionedSessionKeys.add(a.sessionKey);
                }
            }
        }

        if (mentions.names.length > 0) {
            // mapeia name -> sessionKey (case-insensitive)
            for (const name of mentions.names) {
                const target = agents.find(
                    (a) => a.name.toLowerCase() === name.toLowerCase()
                );
                if (!target) continue; // ignora mention inválida
                if (target.sessionKey === args.fromSessionKey) continue; // não notifica o autor
                mentionedSessionKeys.add(target.sessionKey);
            }
        }

        // cria notifications
        // ✅ inclui source/sourceMessageId para permitir idempotência por mensagem+destinatário
        let notified = 0;
        for (const mentionedSessionKey of mentionedSessionKeys) {
            await ctx.db.insert("notifications", {
                departmentId: task.departmentId,
                mentionedSessionKey,
                content: args.content,
                delivered: false,
                createdAt: now,
                deliveredAt: undefined,
                taskId: args.taskId,

                // 🔽 idempotência por mensagem (quando você migrar para createIfNotExists)
                source: "mention",
                sourceMessageId: messageId,
            });
            notified += 1;
        }

        // opcional: log activity para auditoria de mentions
        if (notified > 0) {
            await ctx.db.insert("activities", {
                departmentId: task.departmentId,
                type: "notifications_created",
                message: `Notificações criadas: ${notified} (mentions)`,
                sessionKey: args.fromSessionKey,
                actorName: actor.actorName,
                actorType: actor.actorType,
                taskId: args.taskId,
                createdAt: now,
            });
        }

        // ---- Brain Trigger (Async Thinking) ----
        await ctx.scheduler.runAfter(0, internal.brain.onNewMessage, {
            departmentId: args.departmentId,
            taskId: args.taskId,
            messageId,
            content: args.content,
        });

        return { messageId, notified };
    },
});

/**
 * messages:listByTask
 * - lista mensagens de uma task
 * - ordenadas por createdAt asc (thread cronológica)
 * - com limit opcional (default: 100)
 */
export const listByTask = query({
    args: {
        taskId: v.id("tasks"),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 100;

        const task = await ctx.db.get(args.taskId);
        if (!task) throw new Error("Task não encontrada.");

        const rows = await ctx.db
            .query("messages")
            .withIndex("by_department_taskId", (q) =>
                q.eq("departmentId", task.departmentId).eq("taskId", args.taskId)
            )
            .collect();

        // ordena cronologicamente (thread real)
        rows.sort((a, b) => a.createdAt - b.createdAt);

        // se passar do limite, retorna apenas as últimas N
        if (rows.length > limit) {
            return rows.slice(rows.length - limit);
        }

        return rows;
    },
});
