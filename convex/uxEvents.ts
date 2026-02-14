import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth.js";

export const track = mutation({
    args: {
        departmentId: v.optional(v.id("departments")),
        name: v.string(), // Changed from uxEventName to v.string()
        flowId: v.optional(v.string()),
        state: v.optional(v.string()),
        meta: v.optional(v.any()),
    },
    handler: async (ctx: MutationCtx, args: {
        departmentId?: any; // Generic ID for insert
        name: string;
        flowId?: string;
        state?: string;
        meta?: any;
    }) => {
        const userId = (await auth.getUserId(ctx)) ?? undefined; // Added userId retrieval
        // Removed metaSize check

        await ctx.db.insert("uxEvents", {
            departmentId: args.departmentId, // Changed from orgId to departmentId
            name: args.name,
            ts: Date.now(), // Changed from args.ts to Date.now()
            flowId: args.flowId,
            userId, // Used retrieved userId
            state: args.state,
            meta: args.meta,
        });

        return { ok: true };
    },
});

/**
 * Public ingest endpoint used by frontend analytics emitter.
 * Accepts a flexible event payload and stores it in uxEvents.
 */
export const ingest = mutation({
    args: {
        name: v.string(),
        ts: v.optional(v.float64()),
        departmentId: v.optional(v.id("departments")),
        flowId: v.optional(v.string()),
        userId: v.optional(v.string()),
        state: v.optional(v.string()),
        meta: v.optional(v.any()),
        event: v.optional(v.any()),
    },
    handler: async (ctx: MutationCtx, args: {
        name: string;
        ts?: number;
        departmentId?: any;
        flowId?: string;
        userId?: string;
        state?: string;
        meta?: any;
        event?: any;
    }) => {
        const event = (args.event && typeof args.event === "object") ? args.event : {};
        const ts = typeof args.ts === "number" ? args.ts : (typeof event.ts === "number" ? event.ts : Date.now());

        await ctx.db.insert("uxEvents", {
            departmentId:
                args.departmentId ??
                (event.departmentId ?? undefined),
            name: args.name ?? event.name ?? "unknown_event",
            ts,
            flowId: args.flowId ?? event.flowId ?? undefined,
            userId: args.userId ?? event.userId ?? undefined,
            state: args.state ?? event.state ?? undefined,
            meta: args.meta ?? event.meta ?? undefined,
        });

        return { ok: true };
    },
});

/**
 * Calcula as 4 métricas principais numa janela de tempo:
 * - repetição de ação (ansiedade)
 * - ping do usuário
 * - tempo até primeiro ping (proxy de "time to first user message")
 * - resolução de atenção necessária
 */
export const metrics = query({
    args: {
        departmentId: v.id("departments"),
        // uma das duas opções abaixo:
        sinceTs: v.optional(v.float64()),
        windowHours: v.optional(v.number()),

        // filtro opcional por fluxo
        flowId: v.optional(v.string()),

        // segurança: limite de eventos lidos (evita query gigante)
        maxEvents: v.optional(v.number()),
    },
    handler: async (ctx: QueryCtx, args: {
        departmentId: any;
        sinceTs?: number;
        windowHours?: number;
        flowId?: string;
        maxEvents?: number;
    }) => {
        const untilTs = Date.now();
        const windowHours = args.windowHours ?? 24;
        const sinceTs =
            args.sinceTs ?? (untilTs - windowHours * 60 * 60 * 1000);

        const maxEvents = Math.min(args.maxEvents ?? 5000, 20000);

        // Busca por índice com range
        let events: Array<{
            name: string;
            ts: number;
            flowId?: string;
            userId?: string;
            state?: string;
            meta?: any;
        }> = [];

        if (args.flowId) {
            events = await ctx.db
                .query("uxEvents")
                // Fallback para index sem departmentId se flowId for global, mas idealmente temos departmentId
                .withIndex("by_flowId_ts", (q: any) =>
                    q.eq("flowId", args.flowId!).gte("ts", sinceTs)
                )
                .take(maxEvents);
        } else {
            events = await ctx.db
                .query("uxEvents")
                .withIndex("by_department_ts", (q: any) =>
                    q.eq("departmentId", args.departmentId).gte("ts", sinceTs)
                )
                .take(maxEvents);
        }

        // Filtra também por untilTs (porque a query pega >= sinceTs)
        const windowed = events.filter((e) => e.ts <= untilTs);

        // Contagens globais
        let actionTriggered = 0;
        let repeatedAction = 0;
        let userPing = 0;
        let attentionEntered = 0;
        let attentionResolved = 0;
        let flowCompleted = 0;

        // Para "tempo até primeiro ping", calculamos por flowId:
        // first(action_triggered) -> first(user_ping_message after)
        const firstTriggerByFlow = new Map<string, number>();
        const firstPingByFlow = new Map<string, number>();

        for (const e of windowed) {
            switch (e.name) {
                case "action_triggered":
                    actionTriggered++;
                    if (e.flowId) {
                        const prev = firstTriggerByFlow.get(e.flowId);
                        if (prev === undefined || e.ts < prev) firstTriggerByFlow.set(e.flowId, e.ts);
                    }
                    break;

                case "user_repeated_action":
                    repeatedAction++;
                    break;

                case "user_ping_message":
                    userPing++;
                    if (e.flowId) {
                        const triggerTs = firstTriggerByFlow.get(e.flowId);
                        if (triggerTs !== undefined && e.ts >= triggerTs) {
                            const prevPing = firstPingByFlow.get(e.flowId);
                            if (prevPing === undefined || e.ts < prevPing) firstPingByFlow.set(e.flowId, e.ts);
                        }
                    }
                    break;

                case "state_entered_attention":
                    attentionEntered++;
                    break;

                case "attention_resolved":
                    attentionResolved++;
                    break;

                case "flow_completed":
                    flowCompleted++;
                    break;

                default:
                    break;
            }
        }

        // Métricas (com guard contra divisão por zero)
        const repeatedActionRate =
            actionTriggered === 0 ? 0 : repeatedAction / actionTriggered;

        const pingRate =
            actionTriggered === 0 ? 0 : userPing / actionTriggered;

        const attentionResolutionRate =
            attentionEntered === 0 ? null : attentionResolved / attentionEntered;

        // avg time to first ping (ms)
        let sumFirstPingMs = 0;
        let flowsWithPing = 0;
        for (const [flowId, triggerTs] of firstTriggerByFlow.entries()) {
            const pingTs = firstPingByFlow.get(flowId);
            if (pingTs !== undefined) {
                sumFirstPingMs += pingTs - triggerTs;
                flowsWithPing += 1;
            }
        }
        const avgTimeToFirstPingMs =
            flowsWithPing === 0 ? null : Math.round(sumFirstPingMs / flowsWithPing);

        return {
            window: {
                sinceTs,
                untilTs,
                flowId: args.flowId ?? null,
                usedMaxEvents: maxEvents,
                returnedEvents: windowed.length,
            },
            counts: {
                actionTriggered,
                repeatedAction,
                userPing,
                attentionEntered,
                attentionResolved,
                flowCompleted,
                flowsWithPing,
            },
            rates: {
                repeatedActionRate,
                pingRate,
                attentionResolutionRate,
            },
            derived: {
                avgTimeToFirstPingMs,
            },
        };
    },
});
