import { type UXState } from "./uxContract";

export type UXEventName =
    | "action_triggered"
    | "action_confirmed_rendered"
    | "user_repeated_action"
    | "user_ping_message"
    | "state_entered_attention"
    | "attention_resolved"
    | "flow_completed";

export type UXEvent = {
    name: UXEventName;
    ts: number; // Date.now()
    // Identificadores opcionais (plugar depois em taskId/sessionId/userId)
    flowId?: string;
    userId?: string;
    // Dados mínimos e úteis
    state?: UXState;
    meta?: Record<string, string | number | boolean | null>;
};

export type UXEmitter = (event: UXEvent) => void;

/**
 * Default emitter: console (para dev).
 * Depois você troca por Convex, PostHog, Segment, etc.
 */
export const consoleEmitter: UXEmitter = (event) => {
     
    console.log("[UX_EVENT]", event.name, event);
};

export function emit(emitter: UXEmitter, event: Omit<UXEvent, "ts">) {
    emitter({ ...event, ts: Date.now() });
}
