import { useQuery, Authenticated, Unauthenticated } from "convex/react";
import { api } from "../convex/_generated/api";
import { DeptProvider, useDept } from "../src/DeptContext";
import DeptSwitcher from "../src/components/DeptSwitcher";
import { SignIn } from "../src/components/SignIn";

const COLUMNS = [
    { key: "inbox", title: "Inbox" },
    { key: "assigned", title: "Assigned" },
    { key: "in_progress", title: "In Progress" },
    { key: "review", title: "Review" },
    { key: "done", title: "Done" },
    { key: "blocked", title: "Blocked" },
] as const;

type Status = (typeof COLUMNS)[number]["key"];

function Column({ status, title }: { status: Status; title: string }) {
    const { activeDeptId } = useDept();
    const tasks = useQuery(api.tasks.listByStatus, activeDeptId ? {
        departmentId: activeDeptId,
        status,
        limit: 50
    } : "skip");

    return (
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{title}</strong>
                <span style={{ opacity: 0.7 }}>{tasks?.length ?? "…"}</span>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {tasks === undefined ? (
                    <div style={{ opacity: 0.7 }}>Carregando…</div>
                ) : tasks.length === 0 ? (
                    <div style={{ opacity: 0.7 }}>Vazio</div>
                ) : (
                    tasks.map((t) => (
                        <div
                            key={t._id}
                            style={{
                                border: "1px solid #eee",
                                borderRadius: 10,
                                padding: 10,
                                background: "white",
                                color: "#111"
                            }}
                        >
                            <div style={{ fontWeight: 600 }}>{t.title}</div>
                            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                                {t.assigneeSessionKeys?.length
                                    ? `Assignees: ${t.assigneeSessionKeys.join(", ")}`
                                    : "Unassigned"}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

function MainApp() {
    return (
        <main style={{ padding: 20 }}>
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h1 style={{ margin: 0 }}>PlugandSay</h1>
                <DeptSwitcher />
            </header>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(5, minmax(220px, 1fr))",
                    gap: 12,
                    alignItems: "start",
                }}
            >
                {COLUMNS.map((c) => (
                    <Column key={c.key} status={c.key} title={c.title} />
                ))}
            </div>
        </main>
    );
}

export default function App() {
    return (
        <>
            <Authenticated>
                <DeptProvider>
                    <MainApp />
                </DeptProvider>
            </Authenticated>
            <Unauthenticated>
                <SignIn />
            </Unauthenticated>
        </>
    );
}
