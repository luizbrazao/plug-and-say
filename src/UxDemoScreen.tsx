import { useCallback, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

import { UxStateView } from "./UxStateView";
import { UX_STATES } from "./uxContract";
import { useUxFlowControllerInstrumented } from "./useUxFlowController.instrumented";
import { makeConvexEmitter, ingestMutationRef } from "./convexEmitter";

type Props = {
    departmentId: string;
    taskId: string;   // flowId (string)
    sessionKey: string;
};

export function UxDemoScreen({ departmentId, taskId, sessionKey }: Props) {
    const [hasStarted, setHasStarted] = useState(false);

    // analytics → uxEvents:ingest
    const ingestUxEvent = useMutation(ingestMutationRef);
    const emitter = useMemo(() => makeConvexEmitter(ingestUxEvent), [ingestUxEvent]);

    // ✅ business run → uxFlows:runForTask
    const runForTask = useMutation(api.uxFlows.runForTask);

    // run() tem que bater com o contrato do controller (Promise<{ok:...}>)
    const run = useCallback(() => {
        return runForTask({
            departmentId: departmentId as any,
            taskId: taskId as any, // se você já tem Id<"tasks"> tipado, remova esse cast
            sessionKey,
        });
    }, [runForTask, sessionKey, taskId, departmentId]);

    const { state, isLocked, triggerAction, resolveAttention } =
        useUxFlowControllerInstrumented(run, {
            emitter,
            flowId: taskId,     // ✅ métricas por task/thread
            userId: sessionKey, // ✅ quem disparou
        });

    if (!hasStarted) {
        return (
            <div style={{ padding: 16, maxWidth: 420 }}>
                <button
                    type="button"
                    onClick={() => {
                        setHasStarted(true);
                        triggerAction();
                    }}
                    style={{
                        width: "100%",
                        height: 44,
                        borderRadius: 12,
                        border: "1px solid rgba(0,0,0,0.18)",
                        background: "white",
                        fontWeight: 700,
                        cursor: "pointer",
                    }}
                >
                    Executar fluxo
                </button>
            </div>
        );
    }

    const isAttention = state === UX_STATES.ATENCAO_NECESSARIA;

    return (
        <div style={{ padding: 16 }}>
            <UxStateView
                state={state}
                actionLabel={isAttention ? "Enviar informação" : undefined}
                onAction={isAttention ? resolveAttention : undefined}
            />

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.6 }}>
                locked: {String(isLocked)}
            </div>
        </div>
    );
}
