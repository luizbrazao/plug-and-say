import type React from "react";
import { UX_STATES, UX_COPY, type UXState } from "./uxContract";

type Props = {
    state: UXState;
    /** Se o estado for ATENCAO_NECESSARIA, você define o texto do único botão */
    actionLabel?: string;
    /** Clique do único botão (só será usado em ATENCAO_NECESSARIA) */
    onAction?: () => void;
};

export function UxStateView({ state, actionLabel, onAction }: Props) {
    const title = getTitle(state);
    const messageLines = getMessageLines(state);

    const showAction = state === UX_STATES.ATENCAO_NECESSARIA;

    return (
        <div style={styles.container}>
            {/* Zona 1 — Estado */}
            <div style={styles.stateTitle}>{title}</div>

            {/* Zona 2 — Mensagem humana */}
            <div style={styles.message}>
                {messageLines.map((line) => (
                    <div key={line} style={styles.messageLine}>
                        {line}
                    </div>
                ))}
            </div>

            {/* Zona 3 — Ação (0 ou 1 botão) */}
            <div style={styles.actionArea}>
                {showAction ? (
                    <button
                        type="button"
                        onClick={onAction}
                        disabled={!onAction}
                        style={styles.button}
                    >
                        {actionLabel ?? "Continuar"}
                    </button>
                ) : null}
            </div>
        </div>
    );
}

function getTitle(state: UXState) {
    switch (state) {
        case UX_STATES.CONFIRMADO:
            return "Confirmado";
        case UX_STATES.EM_ANDAMENTO:
            return "Em andamento";
        case UX_STATES.CONCLUIDO:
            return "Concluído";
        case UX_STATES.ATENCAO_NECESSARIA:
            return "Atenção necessária";
        default: {
            // Exhaustiveness guard (TypeScript)
            const _exhaustive: never = state;
            return _exhaustive;
        }
    }
}

function getMessageLines(state: UXState) {
    switch (state) {
        case UX_STATES.CONFIRMADO:
            return [UX_COPY.CONFIRMADO];
        case UX_STATES.EM_ANDAMENTO:
            return [UX_COPY.EM_ANDAMENTO_LINE_1, UX_COPY.EM_ANDAMENTO_LINE_2];
        case UX_STATES.CONCLUIDO:
            return [UX_COPY.CONCLUIDO];
        case UX_STATES.ATENCAO_NECESSARIA:
            return [UX_COPY.ATENCAO_NECESSARIA];
        default: {
            const _exhaustive: never = state;
            return [_exhaustive];
        }
    }
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        padding: 16,
        borderRadius: 16,
        border: "1px solid rgba(0,0,0,0.12)",
        maxWidth: 420,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    },
    stateTitle: {
        fontSize: 18,
        fontWeight: 700,
        marginBottom: 12,
    },
    message: {
        fontSize: 14,
        lineHeight: 1.4,
        marginBottom: 16,
    },
    messageLine: {
        marginBottom: 6,
    },
    actionArea: {
        minHeight: 44,
        display: "flex",
        alignItems: "center",
    },
    button: {
        width: "100%",
        height: 44,
        borderRadius: 12,
        border: "1px solid rgba(0,0,0,0.18)",
        background: "white",
        fontWeight: 700,
        cursor: "pointer",
    },
};
