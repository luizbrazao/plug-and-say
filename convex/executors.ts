import { mutation } from "./_generated/server";
import { v } from "convex/values";

function isMachineMessage(m: { fromSessionKey: string; content: string }, executorSessionKey: string) {
    // Exclui qualquer coisa escrita pelo próprio executor
    if (m.fromSessionKey === executorSessionKey) return true;

    // Exclui mensagens "de sistema" por convenção de conteúdo
    const c = m.content ?? "";
    if (c.startsWith("[reader]")) return true;
    if (c.startsWith("[executor]")) return true;

    // Se você quiser ser ainda mais restritivo, poderia excluir qualquer `agent:*` aqui,
    // mas por enquanto vamos excluir só os marcadores acima + o próprio executor.
    return false;
}

export const runOnce = mutation({
    args: {
        departmentId: v.id("departments"),
        taskId: v.id("tasks"),
        executorSessionKey: v.string(), // ex: "agent:developer:main"
        limit: v.optional(v.number()),
        markStatus: v.optional(
            v.union(
                v.literal("in_progress"),
                v.literal("review"),
                v.literal("done"),
                v.literal("blocked")
            )
        ),
        runKey: v.optional(v.string()), // ex: "deliverable-v2"
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const limit = args.limit ?? 100;
        const nextStatus = args.markStatus === "done" ? "review" : (args.markStatus ?? "review");
        const runKey = args.runKey ?? "deliverable-v1";

        // 1) Load task first to get departmentId and check isolation
        const task = await ctx.db.get(args.taskId);
        if (!task || task.departmentId !== args.departmentId) {
            throw new Error("Task não encontrada ou acesso negado.");
        }

        // 0) Idempotency check (taskId + runKey)
        const existingRun = await ctx.db
            .query("executor_runs")
            .withIndex("by_dept_task_runKey", (q) =>
                q.eq("departmentId", task.departmentId).eq("taskId", args.taskId).eq("runKey", runKey)
            )
            .unique();

        if (existingRun) {
            return {
                ok: true,
                skipped: true,
                reason: "already_ran",
                runKey,
                documentId: existingRun.documentId,
                messageId: existingRun.messageId,
            };
        }

        // 2) Load messages (thread)
        const allMessages = await ctx.db
            .query("messages")
            .withIndex("by_department_taskId", (q) =>
                q.eq("departmentId", task.departmentId).eq("taskId", args.taskId)
            )
            .collect();

        allMessages.sort((a, b) => a.createdAt - b.createdAt);

        const trimmed =
            allMessages.length > limit
                ? allMessages.slice(allMessages.length - limit)
                : allMessages;

        // 2.1) Sanitize: ignore machine/self messages for "context"
        const relevant = trimmed.filter((m) => !isMachineMessage(m, args.executorSessionKey));

        const lastRelevant = relevant.length > 0 ? relevant[relevant.length - 1] : null;

        // 2.2) Build a compact bullet list from relevant messages (last up to 8)
        const lastRelevantBullets = relevant
            .slice(Math.max(0, relevant.length - 8))
            .map((m) => `- (${m.fromSessionKey}) ${m.content}`);

        // 3) Build deterministic deliverable doc (now with clean context)
        const deliverableTitle = `Deliverable — ${task.title}`;
        const deliverableContent = [
            `# ${task.title}`,
            ``,
            `**Status anterior:** ${task.status}`,
            `**Status definido:** ${nextStatus}`,
            `**Executor:** ${args.executorSessionKey}`,
            `**RunKey:** ${runKey}`,
            `**Gerado em:** ${now}`,
            ``,
            `## Contexto (sanitizado)`,
            task.description ? `- ${task.description}` : `- (sem descrição)`,
            `- Mensagens totais (thread): ${allMessages.length}`,
            `- Mensagens consideradas (janela): ${trimmed.length}`,
            `- Mensagens relevantes (sem [reader]/[executor]/self): ${relevant.length}`,
            lastRelevant
                ? `- Última mensagem relevante: (${lastRelevant.fromSessionKey}) "${lastRelevant.content}"`
                : `- Última mensagem relevante: (nenhuma — só mensagens de sistema/self na janela)`,
            ``,
            `## Evidências (últimas relevantes)`,
            lastRelevantBullets.length > 0
                ? lastRelevantBullets.join("\n")
                : `- (nenhuma evidência relevante na janela atual)`,
            ``,
            `## Próximos passos (stub)`,
            `- Definir critério objetivo de "done"`,
            `- Substituir stub por executor com LLM + ferramentas`,
            `- Adicionar política de status (ex: review → done por aprovação)`,
            ``,
        ].join("\n");

        const documentId = await ctx.db.insert("documents", {
            departmentId: task.departmentId,
            title: deliverableTitle,
            content: deliverableContent,
            type: "deliverable",
            taskId: args.taskId,
            createdAt: now,
            createdBySessionKey: args.executorSessionKey,
        });

        // 4) Comment in thread linking deliverable
        const messageId = await ctx.db.insert("messages", {
            departmentId: task.departmentId,
            taskId: args.taskId,
            fromSessionKey: args.executorSessionKey,
            content: `[executor] Deliverable criado: "${deliverableTitle}" (runKey: ${runKey}, documentId: ${documentId})`,
            createdAt: now,
        });

        // 5) Update task status
        await ctx.db.patch("tasks", args.taskId, { status: nextStatus });

        // 6) Log activities
        await ctx.db.insert("activities", {
            departmentId: task.departmentId,
            type: "document_created",
            message: `Documento criado: ${deliverableTitle} (runKey: ${runKey})`,
            sessionKey: args.executorSessionKey,
            taskId: args.taskId,
            createdAt: now,
        });

        await ctx.db.insert("activities", {
            departmentId: task.departmentId,
            type: "task_status_changed",
            message: `Status da task "${task.title}" -> ${nextStatus} (executor runKey: ${runKey})`,
            sessionKey: args.executorSessionKey,
            taskId: args.taskId,
            createdAt: now,
        });

        // 7) Record executor run (idempotency ledger)
        await ctx.db.insert("executor_runs", {
            departmentId: task.departmentId,
            taskId: args.taskId,
            executorSessionKey: args.executorSessionKey,
            runKey,
            documentId,
            messageId,
            createdAt: now,
        });

        return {
            ok: true,
            skipped: false,
            runKey,
            documentId,
            messageId,
            nextStatus,
            messagesIncluded: trimmed.length,
            relevantMessagesIncluded: relevant.length,
            totalMessages: allMessages.length,
        };
    },
});
