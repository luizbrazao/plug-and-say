import { useCallback, useRef, useState } from "react";
import { UX_STATES, type UXState } from "./uxContract";
import { type UXEmitter, emit, consoleEmitter } from "./uxAnalytics";

type RunResult =
    | { ok: true }
    | { ok: false; reason: "needs_user_action" | "failed" };

type Controller = {
    state: UXState;
    isLocked: boolean;
    triggerAction: () => void;
    resolveAttention: () => void;
};

type Options = {
    emitter?: UXEmitter;
    flowId?: string;
    userId?: string;
};

export function useUxFlowControllerInstrumented(
    run: () => Promise<RunResult>,
    options: Options = {}
): Controller {
    const emitter = options.emitter ?? consoleEmitter;
    const flowId = options.flowId;
    const userId = options.userId;

    const [state, setState] = useState<UXState>(UX_STATES.CONFIRMADO);
    const [isLocked, setIsLocked] = useState(false);

    const inFlightRef = useRef(false);
    const lastTriggerTsRef = useRef<number | null>(null);

    const setStateWithEvents = useCallback(
        (next: UXState) => {
            setState(next);

            if (next === UX_STATES.CONFIRMADO) {
                emit(emitter, {
                    name: "action_confirmed_rendered",
                    flowId,
                    userId,
                    state: next,
                });
            }

            if (next === UX_STATES.ATENCAO_NECESSARIA) {
                emit(emitter, {
                    name: "state_entered_attention",
                    flowId,
                    userId,
                    state: next,
                });
            }

            if (next === UX_STATES.CONCLUIDO) {
                emit(emitter, {
                    name: "flow_completed",
                    flowId,
                    userId,
                    state: next,
                    meta: {
                        // útil para medir tempo total do fluxo
                        totalMs:
                            lastTriggerTsRef.current != null
                                ? Date.now() - lastTriggerTsRef.current
                                : null,
                    },
                });
            }
        },
        [emitter, flowId, userId]
    );

    const triggerAction = useCallback(() => {
        // Detecta repetição (ansiedade) — se já está em flight
        if (inFlightRef.current) {
            emit(emitter, { name: "user_repeated_action", flowId, userId });
            return;
        }

        inFlightRef.current = true;
        setIsLocked(true);

        lastTriggerTsRef.current = Date.now();
        emit(emitter, { name: "action_triggered", flowId, userId });

        // optimistic UI
        setStateWithEvents(UX_STATES.CONFIRMADO);

        Promise.resolve()
            .then(() => {
                setStateWithEvents(UX_STATES.EM_ANDAMENTO);
                return run();
            })
            .then((result) => {
                if (result.ok) setStateWithEvents(UX_STATES.CONCLUIDO);
                else setStateWithEvents(UX_STATES.ATENCAO_NECESSARIA);
            })
            .catch(() => {
                setStateWithEvents(UX_STATES.ATENCAO_NECESSARIA);
            })
            .finally(() => {
                setIsLocked(false);
                inFlightRef.current = false;
            });
    }, [emitter, flowId, run, setStateWithEvents, userId]);

    const resolveAttention = useCallback(() => {
        emit(emitter, { name: "attention_resolved", flowId, userId });
        triggerAction();
    }, [emitter, flowId, triggerAction, userId]);

    return { state, isLocked, triggerAction, resolveAttention };
}
