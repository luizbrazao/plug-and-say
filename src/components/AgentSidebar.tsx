import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import { useDept } from "../DeptContext";
import ConnectTelegramModal from "./ConnectTelegramModal";
import { dicebearBotttsUrl } from "../lib/avatar";

export function AgentSidebar() {
    const { t } = useTranslation();
    const { activeDeptId } = useDept();
    const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
    const [selectedJarvisName, setSelectedJarvisName] = useState<string | undefined>(undefined);
    const agents = useQuery(api.agents.listByDept, activeDeptId ? { departmentId: activeDeptId } : "skip");
    const deleteAgent = useMutation(api.agents.deleteAgent);

    if (!agents) return (
        <div className="space-y-3 px-2">
            {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-14 bg-white/40 rounded-xl animate-pulse" />
            ))}
        </div>
    );

    return (
        <div className="space-y-3 px-2">
            {agents.map((agent) => {
                const isSquadLead =
                    agent.name.toLowerCase() === "jarvis" ||
                    agent.role.toLowerCase().includes("squad lead");

                return (
                <div key={agent._id} className="glass-card border-0 shadow-sm bg-white p-3 flex items-center gap-3 group transition-all relative">
                    {/* Avatar Area */}
                    <div className="relative">
                        <div className="w-10 h-10 overflow-hidden">
                            <img
                                src={dicebearBotttsUrl(agent.avatar || agent.name)}
                                alt={`${agent.name} avatar`}
                                className="w-full h-full object-cover"
                            />
                        </div>
                        {agent.status === "active" && (
                            <span className="absolute bottom-0 right-0 block w-2.5 h-2.5 rounded-full border-2 border-white working-pulse" />
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold truncate tracking-tight">{agent.name}</div>
                        <div className="flex mt-1">
                            <RoleBadge role={agent.role} />
                        </div>
                    </div>

                    {agent.status === "active" && (
                        <div className="text-[10px] font-mono font-bold text-emerald-600 tracking-tighter animate-pulse mr-2">
                            {t("sidebar.working")}
                        </div>
                    )}

                    {isSquadLead && (
                        agent.hasTelegram ? (
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedJarvisName(agent.telegramBotName);
                                    setIsTelegramModalOpen(true);
                                }}
                                title="Telegram connected"
                                className="mr-2 self-start mt-0.5 rounded-md px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-600 animate-pulse hover:bg-emerald-50 transition-colors"
                            >
                                {t("sidebar.connected")}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedJarvisName(agent.telegramBotName);
                                    setIsTelegramModalOpen(true);
                                }}
                                title={t("sidebar.connectTelegram")}
                                className="mr-2 self-start mt-1 rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    className="h-4 w-4 opacity-50"
                                    aria-hidden="true"
                                >
                                    <path d="M20.67 3.53c.77-.33 1.59.37 1.38 1.19l-3.03 14.1a1.25 1.25 0 0 1-1.87.76l-4.43-2.61-2.53 2.44a1.02 1.02 0 0 1-1.73-.73l.08-3.5 9.07-8.2a.75.75 0 0 0-.91-1.18L5.53 12.1 1.9 11.1a1.23 1.23 0 0 1-.12-2.33z" />
                                </svg>
                            </button>
                        )
                    )}

                    {!isSquadLead && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm(t("sidebar.confirmFire", { name: agent.name }))) {
                                    deleteAgent({ departmentId: activeDeptId!, agentId: agent._id });
                                }
                            }}
                            className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 text-red-400 hover:text-red-600 rounded transition-all"
                            title={t("sidebar.fireAgent")}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    )}
                </div>
            )})}

            <ConnectTelegramModal
                isOpen={isTelegramModalOpen}
                onClose={() => setIsTelegramModalOpen(false)}
                currentBotName={selectedJarvisName}
            />
        </div>
    );
}

function RoleBadge({ role }: { role: string }) {
    const lower = role.toLowerCase();
    let colors = "bg-gray-100 text-gray-800"; // Default Intern

    if (lower.includes("lead") || lower.includes("squad")) {
        colors = "bg-amber-100 text-amber-800";
    } else if (lower.includes("specialist") || lower.includes("analyst") || lower.includes("developer")) {
        colors = "bg-blue-100 text-blue-800";
    }

    return (
        <span className={`inline-flex whitespace-nowrap px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider ${colors}`}>
            {role}
        </span>
    );
}
