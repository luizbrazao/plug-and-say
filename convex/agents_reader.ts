import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const readTaskThreadOnce = mutation({
    args: {
        taskId: v.id("tasks"),
        readerSessionKey: v.string(), // ex: "agent:developer:main"
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const limit = args.limit ?? 100;

        // 1) Load task
        const task = await ctx.db.get("tasks", args.taskId);
        if (!task) {
            throw new Error("Task não encontrada (taskId inválido).");
        }

        // 2) Load last read marker for (taskId, readerSessionKey)
        const existingRead = await ctx.db
            .query("thread_reads")
            .withIndex("by_dept_task_reader", (q) =>
                q.eq("departmentId", task.departmentId).eq("taskId", args.taskId).eq("readerSessionKey", args.readerSessionKey)
            )
            .unique();

        const lastSeenCreatedAt = existingRead?.lastSeenCreatedAt ?? 0;

        // cursor canônico (pode ser ajustado depois)
        let effectiveLastSeen = lastSeenCreatedAt;

        // 3) Load all messages for the task (filtered by department)
        const allMessages = await ctx.db
            .query("messages")
            .withIndex("by_department_taskId", (q) =>
                q.eq("departmentId", task.departmentId).eq("taskId", args.taskId)
            )
            .collect();

        allMessages.sort((a, b) => a.createdAt - b.createdAt);

        // No messages at all
        if (allMessages.length === 0) {
            if (!existingRead) {
                await ctx.db.insert("thread_reads", {
                    departmentId: task.departmentId,
                    taskId: args.taskId,
                    readerSessionKey: args.readerSessionKey,
                    lastSeenCreatedAt: effectiveLastSeen,
                    updatedAt: now,
                });
            } else {
                await ctx.db.patch("thread_reads", existingRead._id, { updatedAt: now });
            }

            return {
                skipped: true,
                reason: "no_messages",
                effectiveLastSeen,
                totalMessages: 0,
            };
        }

        // 4) Relevant messages = not written by THIS reader
        const relevantMessages = allMessages.filter(
            (m) => m.fromSessionKey !== args.readerSessionKey
        );

        if (relevantMessages.length === 0) {
            if (!existingRead) {
                await ctx.db.insert("thread_reads", {
                    departmentId: task.departmentId,
                    taskId: args.taskId,
                    readerSessionKey: args.readerSessionKey,
                    lastSeenCreatedAt: effectiveLastSeen,
                    updatedAt: now,
                });
            } else {
                await ctx.db.patch("thread_reads", existingRead._id, { updatedAt: now });
            }

            return {
                skipped: true,
                reason: "no_relevant_messages",
                effectiveLastSeen,
                totalMessages: allMessages.length,
            };
        }

        const newestRelevantCreatedAt =
            relevantMessages[relevantMessages.length - 1].createdAt;

        // hygiene: clamp cursor if historical value is ahead of relevant stream
        if (effectiveLastSeen > newestRelevantCreatedAt) {
            effectiveLastSeen = newestRelevantCreatedAt;
        }

        // 5) Idempotency gate (based on effectiveLastSeen)
        if (newestRelevantCreatedAt <= effectiveLastSeen) {
            if (existingRead) {
                await ctx.db.patch("thread_reads", existingRead._id, { updatedAt: now });
            } else {
                await ctx.db.insert("thread_reads", {
                    departmentId: task.departmentId,
                    taskId: args.taskId,
                    readerSessionKey: args.readerSessionKey,
                    lastSeenCreatedAt: effectiveLastSeen,
                    updatedAt: now,
                });
            }

            return {
                skipped: true,
                reason: "no_new_relevant_messages",
                effectiveLastSeen,
                newestRelevantCreatedAt,
                totalMessages: allMessages.length,
            };
        }

        // 6) Apply limit on full thread (reporting only)
        const trimmed =
            allMessages.length > limit
                ? allMessages.slice(allMessages.length - limit)
                : allMessages;

        const lastRelevant = relevantMessages[relevantMessages.length - 1];
        const lastLine = `Última mensagem relevante (${lastRelevant.fromSessionKey}): "${lastRelevant.content}"`;

        // 7) Build checkpoint
        const checkpoint = [
            `[reader] Snapshot @ ${now}`,
            `Task: "${task.title}" (status: ${task.status})`,
            `Mensagens totais: ${allMessages.length} (retornadas: ${trimmed.length})`,
            `Último visto (relevante): ${effectiveLastSeen}`,
            `Novo topo (relevante): ${newestRelevantCreatedAt}`,
            lastLine,
            `Sugestão: avance para um executor que cria deliverable/document e muda status via Convex.`,
        ].join("\n");

        // 8) Write checkpoint message (with departmentId)
        const messageId = await ctx.db.insert("messages", {
            departmentId: task.departmentId,
            taskId: args.taskId,
            fromSessionKey: args.readerSessionKey,
            content: checkpoint,
            createdAt: now,
        });

        // 9) Log activity
        await ctx.db.insert("activities", {
            departmentId: task.departmentId,
            type: "message_sent",
            message: `Checkpoint gerado por ${args.readerSessionKey}`,
            sessionKey: args.readerSessionKey,
            taskId: args.taskId,
            createdAt: now,
        });

        if (!existingRead) {
            await ctx.db.insert("thread_reads", {
                departmentId: task.departmentId,
                taskId: args.taskId,
                readerSessionKey: args.readerSessionKey,
                lastSeenCreatedAt: newestRelevantCreatedAt,
                lastCheckpointMessageId: messageId,
                updatedAt: now,
            });
        } else {
            await ctx.db.patch("thread_reads", existingRead._id, {
                lastSeenCreatedAt: newestRelevantCreatedAt,
                lastCheckpointMessageId: messageId,
                updatedAt: now,
            });
        }

        return {
            skipped: false,
            messageId,
            totalMessages: allMessages.length,
            messagesReturned: trimmed.length,
            effectiveLastSeen,
            newestRelevantCreatedAt,
        };
    },
});
