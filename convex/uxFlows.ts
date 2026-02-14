import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Um "run" real do produto:
 * - recebe taskId (flowId)
 * - executa alguma lógica de negócio (placeholder por enquanto)
 * - retorna ok:true ou ok:false (needs_user_action)
 */
export const runForTask = mutation({
    args: {
        departmentId: v.id("departments"),
        taskId: v.id("tasks"),
        sessionKey: v.string(),
    },
    handler: async (ctx, args) => {
        const now = Date.now();

        // garante que a task existe e pertence ao department
        const task = await ctx.db.get(args.taskId);
        if (!task || task.departmentId !== args.departmentId) {
            throw new Error("Task não encontrada ou acesso negado.");
        }

        // ✅ (opcional) log interno de execução
        await ctx.db.insert("activities", {
            departmentId: task.departmentId,
            type: "ux_flow_run",
            message: `UX flow run for task "${task.title}" by ${args.sessionKey}`,
            sessionKey: args.sessionKey,
            taskId: args.taskId,
            createdAt: now,
        });

        /**
         * Aqui é onde você pluga a lógica real:
         * - chamar executor
         * - disparar agente
         * - criar doc
         * - etc.
         *
         * Por enquanto, placeholder determinístico:
         * - se task.status == "blocked" => precisa de ação
         * - senão => ok
         */
        if (task.status === "blocked") {
            return { ok: false as const, reason: "needs_user_action" as const };
        }

        return { ok: true as const };
    },
});
