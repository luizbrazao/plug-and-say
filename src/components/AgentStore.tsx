import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useDept } from "../DeptContext";
import { useOrg } from "../OrgContext";
import CreateAgentModal from "./CreateAgentModal";
import AgentDetailsModal from "./AgentDetailsModal";
import DropdownMenu from "./DropdownMenu";
import { dicebearBotttsUrl } from "../lib/avatar";
import { ServiceLogo } from "./integrations/ServiceLogo";
import { openUpgradeModalFromError } from "../lib/upgradeModal";

type ToolMeta = {
    label: string;
    icon: string;
};

type LocalAgentItem = {
    name: string;
};

type AgentTemplateItem = {
    _id: Id<"agentTemplates">;
    name: string;
    avatar?: string;
    role?: string;
    description?: string;
    capabilities?: string[];
    creatorId?: Id<"users">;
    isPublic?: boolean;
    installCount?: bigint | number;
    rating?: number;
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
    send_email: ["resend_or_gmail"],
    create_github_issue: ["github"],
    create_pull_request: ["github"],
    create_notion_page: ["notion"],
    create_notion_database_item: ["notion"],
    update_notion_page: ["notion"],
    post_to_x: ["twitter"],
    generate_image: ["dalle_or_openai"],
};

const TOOL_ALIASES: Record<string, string[]> = {
    resend_or_gmail: ["resend", "gmail"],
    dalle_or_openai: ["dalle", "openai"],
};

function humanizeToolName(type: string) {
    if (type === "resend_or_gmail") return "Resend or Gmail";
    if (type === "dalle_or_openai") return "DALL-E or OpenAI";
    if (type === "twitter") return "X";
    if (type === "dalle") return "DALL-E";
    return type.charAt(0).toUpperCase() + type.slice(1);
}

function isIntegrationConnected(integration: any): boolean {
    return String(integration?.oauthStatus ?? "connected").toLowerCase() === "connected";
}

const AgentStore: React.FC = () => {
    const { t } = useTranslation();
    const { activeDeptId } = useDept();
    const { activeOrgId, organizations } = useOrg();
    const templates = useQuery(api.agentTemplates.listByDept, activeDeptId ? { departmentId: activeDeptId } : "skip");
    const communityTemplates = useQuery(api.agentTemplates.listPublic, { limit: 100 });
    const localAgents = useQuery(api.agents.listByDept, activeDeptId ? { departmentId: activeDeptId } : "skip");
    const integrations = useQuery(api.integrations.listByOrg, activeOrgId ? { orgId: activeOrgId } : "skip");
    const currentUserId = useQuery(api.organizations.currentUserId);
    const deployTemplate = useMutation(api.agentTemplates.createAgentFromTemplate);
    const installPublicTemplate = useMutation(api.agentTemplates.installPublicTemplate);
    const deleteTemplate = useMutation(api.agentTemplates.remove);
    const publishTemplate = useMutation(api.agentTemplates.publishToMarketplace);

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
    const [selectedAgent, setSelectedAgent] = useState<any | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [detailsIsCommunity, setDetailsIsCommunity] = useState(false);
    const [hiringTemplateId, setHiringTemplateId] = useState<string | null>(null);
    const [hiringCommunityTemplateId, setHiringCommunityTemplateId] = useState<string | null>(null);
    const [blockedHire, setBlockedHire] = useState<{ agentName: string; missingTools: string[] } | null>(null);

    if (!activeDeptId) return <div className="glass-card p-8 text-center text-gray-500">{t("agentStore.selectDepartment")}</div>;
    if (templates === undefined || communityTemplates === undefined || localAgents === undefined) return <div className="glass-card p-8 text-center animate-pulse text-gray-400">{t("agentStore.loading")}</div>;

    const typedLocalAgents = localAgents as LocalAgentItem[];
    const typedTemplates = templates as AgentTemplateItem[];
    const typedCommunityTemplates = communityTemplates as AgentTemplateItem[];
    const localAgentNameSet = new Set(typedLocalAgents.map((agent: LocalAgentItem) => agent.name.toLowerCase()));
    const activeOrg = organizations?.find((o) => o._id === activeOrgId);
    const isOrgAdmin = activeOrg?.role === "owner" || activeOrg?.role === "admin";

    const openDetails = (agent: any, isCommunity: boolean) => {
        setSelectedAgent(agent);
        setDetailsIsCommunity(isCommunity);
        setIsDetailsOpen(true);
    };

    const getMissingTools = (capabilities?: string[]) => {
        const enabledCapabilities = Array.isArray(capabilities) ? capabilities : [];
        const connectedTypes = new Set(
            (integrations ?? [])
                .filter((integration: any) => isIntegrationConnected(integration))
                .map((integration: any) => String(integration.type).toLowerCase())
        );

        const missingTools = new Set<string>();
        for (const capability of enabledCapabilities) {
            const requirements = CAPABILITY_TOOL_MAP[capability] ?? [];
            for (const requirement of requirements) {
                const options = TOOL_ALIASES[requirement] ?? [requirement];
                const satisfied = options.some((option) => connectedTypes.has(option));
                if (!satisfied) {
                    if (options.length > 1) {
                        missingTools.add(requirement);
                    } else {
                        missingTools.add(options[0]);
                    }
                }
            }
        }

        return Array.from(missingTools);
    };

    const canHireTemplate = (name: string, capabilities?: string[]) => {
        const missingTools = getMissingTools(capabilities);
        if (missingTools.length === 0) return true;
        setBlockedHire({ agentName: name, missingTools });
        return false;
    };

    const handleHire = async (templateId: any, name: string, capabilities?: string[]) => {
        if (!canHireTemplate(name, capabilities)) return;

        try {
            setHiringTemplateId(String(templateId));
            await deployTemplate({ templateId });
            alert(t("agentStore.hireSuccess"));
        } catch (err: unknown) {
            if (openUpgradeModalFromError(err)) return;
            const message = err instanceof Error ? err.message : "Unknown error";
            alert(t("agentStore.hireFailed", { message }));
        } finally {
            setHiringTemplateId(null);
        }
    };

    const handleHireFromCommunity = async (templateId: any, name: string, capabilities?: string[]) => {
        if (!activeDeptId) return;
        if (!canHireTemplate(name, capabilities)) return;
        try {
            setHiringCommunityTemplateId(String(templateId));
            const result = await installPublicTemplate({ templateId, targetDepartmentId: activeDeptId });
            if (result?.alreadyExists) {
                alert(t("agentStore.alreadyInDept", { name }));
                return;
            }
            alert(t("agentStore.communityHireSuccess", { name }));
        } catch (err: unknown) {
            if (openUpgradeModalFromError(err)) return;
            const message = err instanceof Error ? err.message : "Unknown error";
            alert(t("agentStore.hireFailed", { message }));
        } finally {
            setHiringCommunityTemplateId(null);
        }
    };

    const renderCapabilityChips = (capabilities?: string[]) => {
        const tools = Array.isArray(capabilities) ? capabilities : [];
        if (tools.length === 0) {
            return <span className="text-[10px] text-gray-400">{t("agentStore.noExternalTools")}</span>;
        }

        const head = tools.slice(0, 3);
        const remaining = tools.length - head.length;

        return (
            <>
                {head.map((tool) => {
                    const meta = friendlyTool(tool);
                    return (
                        <span key={tool} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-50 border border-gray-200 text-[10px] font-semibold text-gray-700">
                            <span>{meta.icon}</span>
                            <span>{meta.label}</span>
                        </span>
                    );
                })}
                {remaining > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-gray-100 text-[10px] font-semibold text-gray-600">+{remaining}</span>
                )}
            </>
        );
    };

    const getConnectedToolTypes = (capabilities?: string[]) => {
        const enabledCapabilities = Array.isArray(capabilities) ? capabilities : [];
        const connectedTypes = new Set(
            (integrations ?? [])
                .filter((integration: any) => isIntegrationConnected(integration))
                .map((integration: any) => String(integration.type).toLowerCase())
        );
        const toolTypes = new Set<string>();

        for (const capability of enabledCapabilities) {
            const requiredTools = CAPABILITY_TOOL_MAP[capability] ?? [];
            for (const toolType of requiredTools) {
                const options = TOOL_ALIASES[toolType] ?? [toolType];
                for (const option of options) {
                    if (connectedTypes.has(option)) {
                        toolTypes.add(option);
                    }
                }
            }
        }

        return Array.from(toolTypes);
    };

    const renderToolConnectionChips = (capabilities?: string[]) => {
        const chips = getConnectedToolTypes(capabilities);
        if (chips.length === 0) return null;

        return chips.map((toolType) => (
            <span
                key={`tool-${toolType}`}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-[10px] font-semibold text-blue-800"
            >
                <ServiceLogo service={toolType} className="w-4 h-4" />
                <span>{humanizeToolName(toolType)}</span>
            </span>
        ));
    };

    return (
        <div className="flex flex-col gap-8 p-8 max-w-7xl mx-auto w-full">
            <header className="flex justify-between items-end border-b border-gray-200 pb-6">
                <div>
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">
                        {t("agentStore.title")}
                    </h1>
                    <p className="text-sm text-gray-500 mt-2 max-w-lg">
                        {t("agentStore.subtitle")}
                    </p>
                </div>
                <button
                    onClick={() => {
                        setEditingTemplate(null);
                        setIsCreateModalOpen(true);
                    }}
                    className="px-6 py-3 bg-black text-white rounded-xl text-sm font-bold uppercase tracking-wide hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
                >
                    {t("agentStore.createCustomAgent")}
                </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                <div className="col-span-full mb-2 mt-2">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">{t("agentStore.myDepartmentTemplates")}</h2>
                </div>

                {templates.length === 0 && (
                    <div className="col-span-full p-12 text-center border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">
                        {t("agentStore.noTemplates")}
                    </div>
                )}

                {typedTemplates.map((template: AgentTemplateItem) => {
                    const isAlreadyInSquad = localAgentNameSet.has(template.name.toLowerCase());
                    const canManageTemplate = currentUserId === template.creatorId || isOrgAdmin;
                    const connectedToolTypes = getConnectedToolTypes(template.capabilities);
                    const primaryConnectedTool = connectedToolTypes[0];

                    return (
                        <div key={template._id} className="group relative bg-white rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-md hover:border-blue-500/30 transition-all flex flex-col h-full">
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-start gap-2 min-w-0">
                                    <div className="w-12 h-12 overflow-hidden flex-shrink-0">
                                        <img
                                            src={dicebearBotttsUrl(template.avatar || template.name)}
                                            alt={`${template.name} avatar`}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1 min-w-0">
                                        <h3 className="text-lg font-bold text-gray-900 leading-tight">{template.name}</h3>
                                        <span className="self-start px-2 py-1 bg-gray-100 rounded-lg text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                            {template.role}
                                        </span>
                                        {primaryConnectedTool ? (
                                            <span className="self-start inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                                                <ServiceLogo service={primaryConnectedTool} className="w-3.5 h-3.5" />
                                                {humanizeToolName(primaryConnectedTool)}
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    {canManageTemplate && (
                                        <DropdownMenu
                                            ariaLabel={t("agentStore.templateActions.edit")}
                                            items={[
                                                {
                                                    label: template.isPublic ? t("agentStore.templateActions.makePrivate") : t("agentStore.templateActions.publish"),
                                                    onClick: async () => {
                                                        await publishTemplate({
                                                            templateId: template._id,
                                                            isPublic: !template.isPublic,
                                                        });
                                                    },
                                                },
                                                {
                                                    label: t("agentStore.templateActions.edit"),
                                                    onClick: () => {
                                                        setEditingTemplate(template);
                                                        setIsCreateModalOpen(true);
                                                    },
                                                },
                                                {
                                                    label: t("agentStore.templateActions.delete"),
                                                    danger: true,
                                                    onClick: async () => {
                                                        const ok = window.confirm(
                                                            t("agentStore.templateActions.confirmDelete", { name: template.name })
                                                        );
                                                        if (!ok) return;
                                                        await deleteTemplate({ id: template._id });
                                                    },
                                                },
                                            ]}
                                        />
                                    )}
                                </div>
                            </div>

                            <p className="text-sm text-gray-500 leading-relaxed mb-4 line-clamp-3 min-h-[4.5rem]">
                                {template.description}
                            </p>

                            <div className="mb-5">
                                <div className="flex flex-wrap gap-1.5">
                                    {renderCapabilityChips(template.capabilities)}
                                    {renderToolConnectionChips(template.capabilities)}
                                </div>
                            </div>

                            <div className="mt-auto flex items-center justify-between gap-2">
                                <button
                                    onClick={() => openDetails(template, false)}
                                    className="text-xs font-bold text-blue-700 hover:text-blue-600"
                                >
                                    {t("common.learnMore")}
                                </button>
                                {isAlreadyInSquad ? (
                                    <button
                                        disabled
                                        className="px-3 py-2 bg-gray-100 text-gray-400 border border-gray-200 rounded-xl text-sm font-bold cursor-not-allowed"
                                    >
                                        {t("agentStore.alreadyInSquad")}
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleHire(template._id, template.name, template.capabilities)}
                                        disabled={hiringTemplateId === String(template._id)}
                                        className="px-3 py-2 bg-emerald-600 border border-emerald-600 text-white rounded-xl text-sm font-bold shadow-sm hover:bg-emerald-500 hover:border-emerald-500 transition-all"
                                    >
                                        {hiringTemplateId === String(template._id)
                                            ? t("common.hiring")
                                            : t("agentStore.hireAgent", { name: template.name })}
                                    </button>
                                )}
                            </div>
                        </div>
                    )
                })}

                <div className="col-span-full mb-2 mt-6">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">{t("agentStore.communityAgents")}</h2>
                </div>

                {communityTemplates.length === 0 && (
                    <div className="col-span-full p-12 text-center border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">
                        {t("agentStore.noCommunityAgents")}
                    </div>
                )}

                {typedCommunityTemplates.map((template: AgentTemplateItem) => {
                    const isJarvis = template.name === "Jarvis";
                    const isAlreadyInSquad = localAgentNameSet.has(template.name.toLowerCase());
                    const isDisabled = isJarvis || isAlreadyInSquad;
                    const connectedToolTypes = getConnectedToolTypes(template.capabilities);
                    const primaryConnectedTool = connectedToolTypes[0];

                    return (
                        <div key={template._id} className="group relative bg-white rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-md hover:border-emerald-500/30 transition-all flex flex-col h-full">
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-start gap-2 min-w-0">
                                    <div className="w-12 h-12 overflow-hidden flex-shrink-0">
                                        <img
                                            src={dicebearBotttsUrl(template.avatar || template.name)}
                                            alt={`${template.name} avatar`}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1 min-w-0">
                                        <h3 className="text-lg font-bold text-gray-900 leading-tight">{template.name}</h3>
                                        <span className="self-start px-2 py-1 bg-gray-100 rounded-lg text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                            {template.role}
                                        </span>
                                        {primaryConnectedTool ? (
                                            <span className="self-start inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                                                <ServiceLogo service={primaryConnectedTool} className="w-3.5 h-3.5" />
                                                {humanizeToolName(primaryConnectedTool)}
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                            </div>

                            <p className="text-sm text-gray-500 leading-relaxed mb-3 line-clamp-3 min-h-[4.5rem]">
                                {template.description}
                            </p>

                            <div className="mb-3">
                                <div className="flex flex-wrap gap-1.5">
                                    {renderCapabilityChips(template.capabilities)}
                                    {renderToolConnectionChips(template.capabilities)}
                                </div>
                            </div>

                            <div className="mb-4 text-[11px] text-gray-500 font-mono">
                                {t("agentStore.installs")}: {template.installCount?.toString?.() ?? "0"} • {t("agentStore.rating")}: {(template.rating ?? 0).toFixed(1)}
                            </div>

                            <div className="mt-auto flex items-center justify-between gap-2">
                                <button
                                    onClick={() => openDetails(template, true)}
                                    className="text-xs font-bold text-emerald-700 hover:text-emerald-600"
                                >
                                    {t("common.learnMore")}
                                </button>
                                {isDisabled ? (
                                    <button
                                        disabled
                                        className="px-3 py-2 bg-gray-100 text-gray-400 border border-gray-200 rounded-xl text-sm font-bold cursor-not-allowed"
                                    >
                                        {isJarvis ? t("agentStore.defaultSquadLead") : t("agentStore.alreadyInSquad")}
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleHireFromCommunity(template._id, template.name, template.capabilities)}
                                        disabled={hiringCommunityTemplateId === String(template._id)}
                                        className="px-3 py-2 bg-emerald-600 border border-emerald-600 text-white rounded-xl text-sm font-bold shadow-sm hover:bg-emerald-500 hover:border-emerald-500 transition-all"
                                    >
                                        {hiringCommunityTemplateId === String(template._id)
                                            ? t("common.hiring")
                                            : t("agentStore.hireAgent", { name: template.name })}
                                    </button>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            <CreateAgentModal
                isOpen={isCreateModalOpen}
                onClose={() => {
                    setIsCreateModalOpen(false);
                    setEditingTemplate(null);
                }}
                departmentId={activeDeptId}
                templateId={editingTemplate?._id}
                initialData={
                    editingTemplate
                        ? {
                            name: editingTemplate.name,
                            avatar: editingTemplate.avatar,
                            role: editingTemplate.role,
                            description: editingTemplate.description,
                            systemPrompt: editingTemplate.systemPrompt,
                            capabilities: editingTemplate.capabilities,
                        }
                        : null
                }
            />

            <AgentDetailsModal
                isOpen={isDetailsOpen}
                onClose={() => setIsDetailsOpen(false)}
                agent={selectedAgent}
                isCommunity={detailsIsCommunity}
            />

            {blockedHire ? (
                <div className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4">
                    <div className="w-full max-w-xl rounded-2xl border border-border-subtle bg-white shadow-2xl p-6 space-y-4">
                        <h3 className="text-lg font-bold text-text-primary">{t("agentStore.credentialRequired")}</h3>
                        <p className="text-sm text-text-secondary">
                            {t("agentStore.credentialRequiredDesc", { name: blockedHire.agentName })}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {blockedHire.missingTools.map((tool) => (
                                <span
                                    key={tool}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800"
                                >
                                    {tool === "resend_or_gmail" || tool === "dalle_or_openai" ? null : (
                                        <ServiceLogo service={tool} className="w-4 h-4" />
                                    )}
                                    <span>{humanizeToolName(tool)}</span>
                                </span>
                            ))}
                        </div>
                        <p className="text-xs text-text-secondary">
                            {t("agentStore.credentialHint")}
                        </p>
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => setBlockedHire(null)}
                                className="px-4 py-2 rounded-lg bg-text-primary text-white text-xs font-bold uppercase tracking-wider"
                            >
                                {t("agentStore.ok")}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default AgentStore;
