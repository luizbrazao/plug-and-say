import { useCallback, useRef, useState } from "react";
import { UX_STATES, type UXState } from "./uxContract";

type RunResult =
    | { ok: true }
    | { ok: false; reason: "needs_user_action" | "failed" };

type Controller = {
    state: UXState;
    isLocked: boolean;
    triggerAction: () => void;
    resolveAttention: () => void;
};

export function useUxFlowController(run: () => Promise<RunResult>): Controller {
    const [state, setState] = useState<UXState>(UX_STATES.CONFIRMADO);
    const [isLocked, setIsLocked] = useState(false);

    // impede cliques duplicados mesmo com re-render
    const inFlightRef = useRef(false);

    const triggerAction = useCallback(() => {
        // Bloqueio duro de duplicação (regra do produto)
        if (inFlightRef.current) return;

        inFlightRef.current = true;
        setIsLocked(true);

        // Optimistic UI: confirma imediatamente
        setState(UX_STATES.CONFIRMADO);

        // Microtask para permitir que CONFIRMADO renderize antes
        Promise.resolve()
            .then(() => {
                setState(UX_STATES.EM_ANDAMENTO);
                return run();
            })
            .then((result) => {
                if (result.ok) {
                    setState(UX_STATES.CONCLUIDO);
                } else {
                    setState(UX_STATES.ATENCAO_NECESSARIA);
                }
            })
            .catch(() => {
                // Nunca expor erro técnico → cai em atenção necessária
                setState(UX_STATES.ATENCAO_NECESSARIA);
            })
            .finally(() => {
                setIsLocked(false);
                inFlightRef.current = false;
            });
    }, [run]);

    const resolveAttention = useCallback(() => {
        // Quando o usuário resolve a pendência, re-executa o fluxo
        triggerAction();
    }, [triggerAction]);

    return { state, isLocked, triggerAction, resolveAttention };
}
