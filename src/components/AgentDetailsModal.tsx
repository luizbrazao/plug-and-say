import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { dicebearBotttsUrl } from "../lib/avatar";
import { useOrg } from "../OrgContext";
import { ServiceLogo } from "./integrations/ServiceLogo";

type ToolMeta = {
    label: string;
    icon: string;
};

const TOOL_META: Record<string, ToolMeta> = {
    web_search: { label: "Search", icon: "🔍" },
    send_email: { label: "Email", icon: "✉️" },
    search_knowledge: { label: "Memory", icon: "🧠" },
    delegate_task: { label: "Maestro", icon: "🎯" },
    generate_image: { label: "Design", icon: "🎨" },
    create_github_issue: { label: "GH Issue", icon: "🐙" },
    create_pull_request: { label: "GH PR", icon: "🔧" },
    create_notion_page: { label: "Notion", icon: "📘" },
    create_notion_database_item: { label: "Notion DB", icon: "🗂️" },
    update_notion_page: { label: "Notion Update", icon: "📝" },
    post_to_x: { label: "X Post", icon: "📣" },
};

function friendlyTool(tool: string): ToolMeta {
    return TOOL_META[tool] ?? { label: tool.replace(/_/g, " "), icon: "⚙️" };
}

const CAPABILITY_TOOL_MAP: Record<string, string[]> = {
    web_search: ["tavily"],
    send_email: ["resend", "gmail"],
    create_github_issue: ["github"],
    create_pull_request: ["github"],
    create_notion_page: ["notion"],
    create_notion_database_item: ["notion"],
    update_notion_page: ["notion"],
    post_to_x: ["twitter"],
    generate_image: ["dalle", "openai"],
};

function humanizeToolName(type: string) {
    if (type === "twitter") return "X";
    if (type === "dalle") return "DALL-E";
    return type.charAt(0).toUpperCase() + type.slice(1);
}

type ParsedSoul = {
    name?: string;
    role?: string;
    personality: string[];
    goodAt: string[];
    care: string[];
};

function parseSoulPrompt(raw?: string): ParsedSoul {
    const text = raw ?? "";
    const lines = text.split("\n").map((l) => l.trim());
    const parsed: ParsedSoul = { personality: [], goodAt: [], care: [] };
    let section: "personality" | "goodAt" | "care" | null = null;

    for (const line of lines) {
        if (!line) continue;

        if (line.startsWith("**Name:**")) {
            parsed.name = line.replace("**Name:**", "").trim();
            continue;
        }
        if (line.startsWith("**Role:**")) {
            parsed.role = line.replace("**Role:**", "").trim();
            continue;
        }

        if (/^##\s*Personality/i.test(line)) {
            section = "personality";
            continue;
        }
        if (/^##\s*What You're Good At/i.test(line)) {
            section = "goodAt";
            continue;
        }
        if (/^##\s*What You Care About/i.test(line)) {
            section = "care";
            continue;
        }

        const bullet = line.startsWith("- ") ? line.slice(2).trim() : line;
        if (!bullet) continue;

        if (section === "personality") parsed.personality.push(bullet);
        else if (section === "goodAt") parsed.goodAt.push(bullet);
        else if (section === "care") parsed.care.push(bullet);
    }

    return parsed;
}

interface AgentDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    agent: any | null;
    isCommunity?: boolean;
}

export default function AgentDetailsModal({ isOpen, onClose, agent, isCommunity = false }: AgentDetailsModalProps) {
    const { activeOrgId } = useOrg();
    const integrations = useQuery(api.integrations.listByOrg, activeOrgId ? { orgId: activeOrgId } : "skip");
    const submitReview = useMutation((api as any).reviews.submitReview);
    const myReview = useQuery(
        (api as any).reviews.getMyReview,
        agent?._id ? { templateId: agent._id } : "skip"
    );
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);
    const [reviewMessage, setReviewMessage] = useState<string | null>(null);
    const stars = useMemo(() => [1, 2, 3, 4, 5], []);
    const capabilities: string[] = Array.isArray(agent?.capabilities) ? agent.capabilities : [];
    const connectedToolTypes = useMemo(() => {
        const connectedTypes = new Set(
            (integrations ?? []).map((integration: any) => String(integration.type).toLowerCase())
        );
        const required = new Set<string>();
        for (const capability of capabilities) {
            for (const toolType of CAPABILITY_TOOL_MAP[capability] ?? []) {
                if (connectedTypes.has(toolType)) required.add(toolType);
            }
        }
        return Array.from(required);
    }, [capabilities, integrations]);

    if (!isOpen || !agent) return null;

    const soul = parseSoulPrompt(agent?.systemPrompt || "");
    const currentRating = typeof myReview?.rating === "number" ? myReview.rating : 0;

    const handleRate = async (rating: number) => {
        setIsSubmittingReview(true);
        setReviewMessage(null);
        try {
            await submitReview({
                templateId: agent._id,
                rating,
            });
        } catch (error: any) {
            setReviewMessage(error?.message || "Failed to save rating.");
        } finally {
            setIsSubmittingReview(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl rounded-3xl border border-white/25 bg-white/75 shadow-2xl backdrop-blur-md p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto scrollbar-thin">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-full border border-border-subtle bg-slate-100 overflow-hidden p-1 flex-shrink-0">
                            <img
                                src={dicebearBotttsUrl(agent.avatar || agent.name)}
                                alt={`${agent.name} avatar`}
                                className="w-full h-full object-cover"
                            />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight text-text-primary">{agent.name}</h2>
                            <p className="text-sm text-text-secondary mt-1">{soul.role || agent.role}</p>
                            {isCommunity && (
                                <p className="mt-2 text-[11px] font-mono text-text-secondary/80">
                                    Installs: {agent.installCount?.toString?.() ?? "0"} • Rating: {(agent.rating ?? 0).toFixed(1)}
                                </p>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-text-secondary hover:bg-black/5"
                    >
                        Fechar
                    </button>
                </div>

                <div className="mt-6 space-y-6">
                    <section>
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary/70 mb-3">Powers</h3>
                        <div className="flex flex-wrap gap-2">
                            {capabilities.length === 0 ? (
                                <span className="text-xs text-text-secondary/70">No external tools</span>
                            ) : (
                                <>
                                    {capabilities.map((tool) => {
                                        const meta = friendlyTool(tool);
                                        return (
                                            <span key={tool} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/80 border border-black/10 text-xs font-semibold text-text-primary">
                                                <span>{meta.icon}</span>
                                                <span>{meta.label}</span>
                                            </span>
                                        );
                                    })}
                                    {connectedToolTypes.map((toolType) => (
                                        <span
                                            key={`connected-${toolType}`}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-800"
                                        >
                                            <ServiceLogo service={toolType} className="w-4 h-4" />
                                            <span>{humanizeToolName(toolType)}</span>
                                        </span>
                                    ))}
                                </>
                            )}
                        </div>
                    </section>

                    <section>
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary/70 mb-2">Personality</h3>
                        <ul className="space-y-1 text-sm text-text-primary/90">
                            {soul.personality.length > 0 ? soul.personality.map((line, idx) => (
                                <li key={idx}>• {line}</li>
                            )) : <li>{agent.systemPrompt || "No profile available."}</li>}
                        </ul>
                    </section>

                    <section>
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary/70 mb-2">What You're Good At</h3>
                        <ul className="space-y-1 text-sm text-text-primary/90">
                            {soul.goodAt.length > 0 ? soul.goodAt.map((line, idx) => (
                                <li key={idx}>• {line}</li>
                            )) : <li>No explicit strengths listed.</li>}
                        </ul>
                    </section>

                    <section>
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary/70 mb-2">What You Care About</h3>
                        <ul className="space-y-1 text-sm text-text-primary/90">
                            {soul.care.length > 0 ? soul.care.map((line, idx) => (
                                <li key={idx}>• {line}</li>
                            )) : <li>No explicit priorities listed.</li>}
                        </ul>
                    </section>

                    <section>
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary/70 mb-2">Rate this Agent</h3>
                        <div className="flex items-center gap-2">
                            {stars.map((star) => {
                                const active = star <= currentRating;
                                return (
                                    <button
                                        key={star}
                                        type="button"
                                        onClick={() => handleRate(star)}
                                        disabled={isSubmittingReview}
                                        className={`text-2xl leading-none transition-transform hover:scale-110 ${active ? "text-amber-500" : "text-slate-500 hover:text-amber-400"} disabled:opacity-60`}
                                        aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
                                        title={`${star} star${star > 1 ? "s" : ""}`}
                                    >
                                        {active ? "★" : "☆"}
                                    </button>
                                );
                            })}
                            <span className="text-xs text-text-secondary ml-2">
                                {currentRating > 0 ? `Your rating: ${currentRating}` : "No rating yet"}
                            </span>
                        </div>
                        {reviewMessage && (
                            <p className="mt-2 text-xs text-text-secondary">{reviewMessage}</p>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
