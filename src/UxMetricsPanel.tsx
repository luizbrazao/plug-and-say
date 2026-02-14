import React from "react";
import { useQuery } from "convex/react";
// Import from ../convex because this file is in src/
import { api } from "../convex/_generated/api";
import { useDept } from "./DeptContext";

function formatRate(x: number | null) {
    if (x === null) return "—";
    const pct = x * 100;
    return `${pct.toFixed(1)}%`;
}

function formatMs(ms: number | null) {
    if (ms === null) return "—";
    if (ms < 1000) return `${ms} ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)} s`;
    const m = s / 60;
    return `${m.toFixed(1)} min`;
}

export function UxMetricsPanel() {
    const { activeDeptId } = useDept();
    const data = useQuery(
        api.uxEvents.metrics,
        activeDeptId ? { departmentId: activeDeptId, windowHours: 24 } : "skip"
    );

    if (!activeDeptId) {
        return <div style={{ padding: 16 }}>Selecione um departamento para ver métricas.</div>;
    }

    if (!data) {
        return <div style={{ padding: 16 }}>Carregando métricas…</div>;
    }

    const { rates, derived, counts, window } = data;

    return (
        <div style={{ padding: 16, maxWidth: 560, fontFamily: "system-ui" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
                UX Metrics (últimas 24h)
            </div>

            <div style={card}>
                <div style={row}>
                    <span>Repetição de ação (ansiedade)</span>
                    <strong>{formatRate(rates.repeatedActionRate)}</strong>
                </div>
                <div style={row}>
                    <span>Ping do usuário</span>
                    <strong>{formatRate(rates.pingRate)}</strong>
                </div>
                <div style={row}>
                    <span>Tempo até 1º ping</span>
                    <strong>{formatMs(derived.avgTimeToFirstPingMs)}</strong>
                </div>
                <div style={row}>
                    <span>Resolução de atenção</span>
                    <strong>{formatRate(rates.attentionResolutionRate)}</strong>
                </div>
            </div>

            <div style={{ ...card, marginTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Contagens</div>
                <div style={smallRow}>
                    <span>actionTriggered</span>
                    <strong>{counts.actionTriggered}</strong>
                </div>
                <div style={smallRow}>
                    <span>repeatedAction</span>
                    <strong>{counts.repeatedAction}</strong>
                </div>
                <div style={smallRow}>
                    <span>userPing</span>
                    <strong>{counts.userPing}</strong>
                </div>
                <div style={smallRow}>
                    <span>attentionEntered</span>
                    <strong>{counts.attentionEntered}</strong>
                </div>
                <div style={smallRow}>
                    <span>attentionResolved</span>
                    <strong>{counts.attentionResolved}</strong>
                </div>
                <div style={smallRow}>
                    <span>flowCompleted</span>
                    <strong>{counts.flowCompleted}</strong>
                </div>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.6 }}>
                events: {window.returnedEvents} | sinceTs: {Math.round(window.sinceTs)}
            </div>
        </div>
    );
}

const card: React.CSSProperties = {
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 16,
    padding: 12,
};

const row: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
};

const smallRow: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    padding: "6px 0",
};
