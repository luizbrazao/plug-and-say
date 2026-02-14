import React, { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { dicebearBotttsUrl, normalizeAvatarSeed, randomAvatarSeed } from "../lib/avatar";
import { openUpgradeModalFromError } from "../lib/upgradeModal";

interface CreateAgentModalProps {
    isOpen: boolean;
    onClose: () => void;
    departmentId: Id<"departments">;
    templateId?: Id<"agentTemplates">;
    initialData?: {
        name: string;
        avatar?: string;
        role: string;
        description: string;
        systemPrompt?: string;
        capabilities?: string[];
    } | null;
}

const AVAILABLE_TOOLS = [
    { id: "web_search", label: "Web Search (Tavily)" },
    { id: "send_email", label: "Send Email (Resend)" },
    { id: "search_knowledge", label: "Search Knowledge (Vector Memory)" },
    { id: "generate_image", label: "Generate Image (DALL-E)" },
    { id: "create_github_issue", label: "Create GitHub Issue" },
    { id: "create_pull_request", label: "Create GitHub Pull Request" },
    { id: "create_notion_page", label: "Create Notion Page" },
    { id: "post_to_x", label: "Post to X (Twitter)" },
];

const PERSONALITY_PLACEHOLDER = `You keep information structured, findable, and current.
You remove ambiguity from internal knowledge systems.
You are disciplined about naming, hierarchy, and context.`;

const GOOD_AT_PLACEHOLDER = `Organizing operational docs and runbooks
Creating clean, navigable Notion structures`;

const CARES_PLACEHOLDER = `Knowledge continuity across the organization
Documentation quality that accelerates execution`;

function parseLines(value: string) {
    return value
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

function buildSoulMarkdown(args: {
    name: string;
    role: string;
    personality: string;
    goodAt: string;
    caresAbout: string;
}) {
    const personalityLines = parseLines(args.personality);
    const goodAtLines = parseLines(args.goodAt);
    const careLines = parseLines(args.caresAbout);

    return `# SOUL.md — Who You Are
**Name:** ${args.name}
**Role:** ${args.role}
## Personality
${personalityLines.join("\n")}
## What You're Good At
${goodAtLines.map((line) => `- ${line}`).join("\n")}
## What You Care About
${careLines.map((line) => `- ${line}`).join("\n")}`;
}

function parseSoulSections(systemPrompt?: string) {
    const prompt = systemPrompt ?? "";
    const personalityMatch = prompt.match(/## Personality\s*([\s\S]*?)## What You're Good At/m);
    const goodAtMatch = prompt.match(/## What You're Good At\s*([\s\S]*?)## What You Care About/m);
    const careMatch = prompt.match(/## What You Care About\s*([\s\S]*)$/m);

    const cleanList = (value?: string) =>
        (value ?? "")
            .split("\n")
            .map((line) => line.replace(/^\s*-\s*/, "").trim())
            .filter(Boolean)
            .join("\n");

    return {
        personality: (personalityMatch?.[1] ?? "").trim(),
        goodAt: cleanList(goodAtMatch?.[1]),
        caresAbout: cleanList(careMatch?.[1]),
    };
}

export default function CreateAgentModal({ isOpen, onClose, departmentId, templateId, initialData }: CreateAgentModalProps) {
    const createCustom = useMutation(api.agents.createCustom);
    const updateTemplate = useMutation(api.agentTemplates.update);

    const parsedInitial = useMemo(
        () => parseSoulSections(initialData?.systemPrompt),
        [initialData?.systemPrompt]
    );
    const [name, setName] = useState("");
    const [avatar, setAvatar] = useState("");
    const [role, setRole] = useState("");
    const [description, setDescription] = useState("");
    const [personality, setPersonality] = useState("");
    const [goodAt, setGoodAt] = useState("");
    const [caresAbout, setCaresAbout] = useState("");
    const [allowedTools, setAllowedTools] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isEditMode = Boolean(templateId);

    useEffect(() => {
        if (!isOpen) return;
        setName(initialData?.name ?? "");
        setAvatar(initialData?.avatar ?? randomAvatarSeed("agent"));
        setRole(initialData?.role ?? "");
        setDescription(initialData?.description ?? "");
        setPersonality(parsedInitial.personality);
        setGoodAt(parsedInitial.goodAt);
        setCaresAbout(parsedInitial.caresAbout);
        setAllowedTools(initialData?.capabilities ?? []);
    }, [isOpen, initialData, parsedInitial]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const trimmedName = name.trim();
            const trimmedRole = role.trim();
            const soul = buildSoulMarkdown({
                name: trimmedName,
                role: trimmedRole,
                personality,
                goodAt,
                caresAbout,
            });

            const capabilities = allowedTools.filter((toolId) => toolId !== "delegate_task");
            if (isEditMode && templateId) {
                await updateTemplate({
                    id: templateId,
                    name: trimmedName,
                    avatar: normalizeAvatarSeed(avatar, trimmedName.toLowerCase() || "agent"),
                    role: trimmedRole,
                    description: description.trim(),
                    systemPrompt: soul,
                    capabilities,
                });
            } else {
                await createCustom({
                    departmentId,
                    name: trimmedName,
                    avatar: normalizeAvatarSeed(avatar, trimmedName.toLowerCase() || "agent"),
                    role: trimmedRole,
                    description: description.trim(),
                    systemPrompt: soul,
                    allowedTools: capabilities,
                });
            }
            setName("");
            setAvatar("");
            setRole("");
            setDescription("");
            setPersonality("");
            setGoodAt("");
            setCaresAbout("");
            setAllowedTools([]);
            onClose();
        } catch (error: unknown) {
            if (openUpgradeModalFromError(error)) return;
            console.error(error);
            alert("Failed to create agent");
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleTool = (toolId: string) => {
        setAllowedTools(prev =>
            prev.includes(toolId)
                ? prev.filter(t => t !== toolId)
                : [...prev, toolId]
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <h2 className="text-xl font-bold text-gray-800">{isEditMode ? "Edit Agent" : "Create Custom Agent"}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Avatar Section */}
                    <div className="space-y-4">
                        <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Avatar</div>
                        <div className="flex items-center gap-4">
                            <div className="w-20 h-20 rounded-full border border-gray-200 bg-slate-100 overflow-hidden flex items-center justify-center p-1">
                                <img
                                    src={dicebearBotttsUrl(avatar || name || "agent")}
                                    alt="Avatar preview"
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <div className="flex-1 space-y-2">
                                <input
                                    type="text"
                                    value={avatar}
                                    onChange={(e) => setAvatar(e.target.value)}
                                    placeholder="avatar seed"
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                                />
                                <button
                                    type="button"
                                    onClick={() => setAvatar(randomAvatarSeed("agent"))}
                                    className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold uppercase tracking-wider hover:border-blue-300 hover:bg-blue-50 transition-all"
                                >
                                    Randomize
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Identity Section */}
                    <div className="space-y-4">
                        <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Identity</div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                                <input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="e.g. Athena"
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                                <input
                                    type="text"
                                    required
                                    value={role}
                                    onChange={e => setRole(e.target.value)}
                                    placeholder="e.g. Analyst"
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Short Description</label>
                            <input
                                type="text"
                                required
                                maxLength={100}
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="Brief summary of this agent (max 100 chars)"
                                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                            />
                            <p className="mt-1 text-xs text-gray-400 text-right">{description.length}/100</p>
                        </div>
                    </div>

                    {/* Personality Section */}
                    <div className="space-y-4">
                        <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Personality (Soul)</div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Personality</label>
                            <textarea
                                required
                                value={personality}
                                onChange={e => setPersonality(e.target.value)}
                                placeholder={PERSONALITY_PLACEHOLDER}
                                rows={4}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none font-mono text-sm"
                            />
                            <p className="mt-1 text-xs text-gray-400">One line per behavior trait.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">What You're Good At</label>
                            <textarea
                                required
                                value={goodAt}
                                onChange={e => setGoodAt(e.target.value)}
                                placeholder={GOOD_AT_PLACEHOLDER}
                                rows={3}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none font-mono text-sm"
                            />
                            <p className="mt-1 text-xs text-gray-400">One item per line. Saved as bullet points in SOUL.md.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">What You Care About</label>
                            <textarea
                                required
                                value={caresAbout}
                                onChange={e => setCaresAbout(e.target.value)}
                                placeholder={CARES_PLACEHOLDER}
                                rows={3}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none font-mono text-sm"
                            />
                            <p className="mt-1 text-xs text-gray-400">One item per line. Saved as bullet points in SOUL.md.</p>
                        </div>
                    </div>

                    {/* Capabilities Section */}
                    <div className="space-y-4">
                        <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Capabilities</div>
                        <div className="grid grid-cols-1 gap-3">
                            {AVAILABLE_TOOLS.map(tool => (
                                <label key={tool.id} className={`flex items-center p-3 rounded-xl border transition-all cursor-pointer ${allowedTools.includes(tool.id) ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-blue-300"}`}>
                                    <input
                                        type="checkbox"
                                        checked={allowedTools.includes(tool.id)}
                                        onChange={() => toggleTool(tool.id)}
                                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                    />
                                    <span className="ml-3 text-sm font-medium text-gray-700">{tool.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </form>

                <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={
                            isSubmitting ||
                            !name.trim() ||
                            !role.trim() ||
                            !description.trim() ||
                            description.length > 100 ||
                            parseLines(personality).length === 0 ||
                            parseLines(goodAt).length === 0 ||
                            parseLines(caresAbout).length === 0
                        }
                        className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-500 hover:shadow-blue-500/40 disabled:opacity-50 disabled:shadow-none transition-all transform active:scale-95"
                    >
                        {isSubmitting ? (isEditMode ? "Saving..." : "Creating...") : (isEditMode ? "Save Changes" : "Create Agent")}
                    </button>
                </div>
            </div>
        </div>
    );
}
