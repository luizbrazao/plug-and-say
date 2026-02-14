import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useDept } from "../DeptContext";

type ActivityType = "All" | "Tasks" | "Comments" | "Docs";

function isToolBlobText(text: string) {
    const normalized = text.trim();
    return normalized.startsWith("[TOOL:") || normalized.includes("[TOOL:");
}

export function LiveActivityFeed() {
    const { activeDeptId } = useDept();
    const [filter, setFilter] = useState<ActivityType>("All");
    const [agentFilter, setAgentFilter] = useState<string>("all_actors");

    const activities = useQuery(
        api.activities.listRecent,
        activeDeptId ? { departmentId: activeDeptId, limit: 30 } : "skip"
    );
    const typeFilteredActivities = useMemo(() => {
        if (!activities) return [];
        const visible = activities.filter((a) => !isToolBlobText(String(a.message || "")));
        if (filter === "All") return visible;

        return visible.filter((a) => {
            if (filter === "Tasks") return a.type.includes("task");
            if (filter === "Comments") return a.type.includes("message");
            if (filter === "Docs") return a.type.includes("document");
            return true;
        });
    }, [activities, filter]);

    const agentOptions = useMemo(() => {
        const counts = new Map<string, { label: string; count: number }>();

        for (const activity of typeFilteredActivities) {
            const key = activity.sessionKey || `actor:${activity.actorName || "System"}`;
            const label = activity.actorName || "System";
            const existing = counts.get(key);
            if (existing) {
                existing.count += 1;
            } else {
                counts.set(key, { label, count: 1 });
            }
        }

        return [
            { key: "all_actors", label: "All Actors", count: typeFilteredActivities.length },
            ...Array.from(counts.entries())
                .map(([key, value]) => ({ key, label: value.label, count: value.count }))
                .sort((a, b) => b.count - a.count),
        ];
    }, [typeFilteredActivities]);

    const filteredActivities = useMemo(() => {
        if (agentFilter === "all_actors") return typeFilteredActivities;
        return typeFilteredActivities.filter((activity) => {
            const key = activity.sessionKey || `actor:${activity.actorName || "System"}`;
            return key === agentFilter;
        });
    }, [typeFilteredActivities, agentFilter]);

    function formatRelativeTime(ts: number) {
        const diff = Date.now() - ts;
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return "NOW";
        if (minutes < 60) return `${minutes}M`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}H`;
        return `${Math.floor(hours / 24)}D`;
    }

    const tabs: ActivityType[] = ["All", "Tasks", "Comments", "Docs"];

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Filters */}
            <div className="flex gap-1 p-4 bg-white/50 border-b border-border-subtle overflow-x-auto scrollbar-none">
                {tabs.map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setFilter(tab)}
                        className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${filter === tab
                            ? "bg-text-primary text-white shadow-sm"
                            : "text-text-secondary hover:bg-black/5"
                            }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <div className="flex gap-2 px-4 py-3 bg-white/40 border-b border-border-subtle overflow-x-auto whitespace-nowrap scrollbar-none">
                {agentOptions.map((agent) => {
                    const active = agentFilter === agent.key;
                    return (
                        <button
                            key={agent.key}
                            onClick={() => setAgentFilter(agent.key)}
                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all border ${active
                                ? "bg-amber-50 border-amber-400 text-amber-700"
                                : "bg-white border-border-subtle text-text-secondary hover:bg-black/5"
                                }`}
                        >
                            <span className="truncate max-w-[100px]">{agent.label}</span>
                            <span className={`text-[10px] font-mono ${active ? "text-amber-700" : "text-text-secondary/60"}`}>
                                {agent.count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
                {!activities ? (
                    <div className="animate-pulse space-y-4">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="flex gap-3">
                                <div className="w-2 h-2 rounded-full bg-border-subtle mt-1.5" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-3 bg-border-subtle/50 rounded w-3/4" />
                                    <div className="h-2 bg-border-subtle/30 rounded w-1/2" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : filteredActivities.length === 0 ? (
                    <div className="py-20 text-center px-6">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-text-secondary italic opacity-40">
                            {filter === "All" ? "Nenhuma atividade encontrada" : `Sem atividades de ${filter.toLowerCase()}`}
                        </div>
                    </div>
                ) : (
                    filteredActivities.map((activity) => (
                        <ActivityItem key={activity._id} activity={activity} formatTime={formatRelativeTime} />
                    ))
                )}
            </div>
        </div>
    );
}

function ActivityItem({ activity, formatTime }: { activity: any; formatTime: (ts: number) => string }) {
    const isMessage = activity.type === "message_sent";
    const isDoc = activity.type.includes("document");
    const isTask = activity.type.includes("task");

    const dotColor = isMessage ? "bg-indigo-400" : isDoc ? "bg-emerald-400" : isTask ? "bg-blue-400" : "bg-gray-400";

    const actor = activity.actorName || activity.sessionKey?.split(":").pop() || "System";

    return (
        <div className="flex gap-3 relative group">
            <div className={`mt-1.5 w-1.5 h-1.5 rounded-full ${dotColor} flex-shrink-0 shadow-[0_0_8px_rgba(0,0,0,0.1)]`} />

            <div className="flex-1 min-w-0 border-b border-[#F0EDEA] pb-3 group-last:border-0">
                <div className="text-[11px] leading-relaxed text-text-primary">
                    <span className="font-bold mr-1">{actor}</span>
                    <span className="text-text-secondary">{activity.message.replace(/.* por .*$/, "").replace(/Status da task "/, "").replace(/" -> .*/, "").trim()}</span>
                    {isTask && activity.message.includes("->") && (
                        <span className="ml-1 px-1.5 py-0.5 rounded bg-black/5 font-mono text-[9px] font-bold">
                            {activity.message.split("->").pop()?.trim()}
                        </span>
                    )}
                </div>

                <div className="mt-1 flex items-center justify-between text-[9px] font-mono font-bold tracking-tighter text-text-secondary opacity-50 uppercase">
                    <span>{activity.type.replace("_", " ")}</span>
                    <span>{formatTime(activity.createdAt)}</span>
                </div>
            </div>
        </div>
    );
}
