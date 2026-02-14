import { api } from "../convex/_generated/api";
import type { UXEmitter, UXEvent } from "./uxAnalytics";

// Tipagem mínima para o Convex mutation
type IngestArgs = {
    name: UXEvent["name"];
    ts: number;
    flowId?: string;
    userId?: string;
    state?: string;
    meta?: any;
};

export function makeConvexEmitter(mutate: (args: IngestArgs) => Promise<any>): UXEmitter {
    return (event) => {
        // Fire-and-forget: analytics não pode travar UX
        void mutate({
            name: event.name,
            ts: event.ts,
            flowId: event.flowId,
            userId: event.userId,
            state: event.state,
            meta: event.meta,
        });
    };
}

/**
 * Helper para usar diretamente com useMutation(api.uxEvents.ingest)
 * Exemplo de uso:
 * const ingest = useMutation(api.uxEvents.ingest);
 * const emitter = useMemo(() => makeConvexEmitter(ingest), [ingest]);
 */
export const ingestMutationRef = api.uxEvents.ingest;
