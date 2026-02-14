import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { openUpgradeModalFromError } from "../lib/upgradeModal";

interface CreateTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    departmentId: Id<"departments">;
}

export default function CreateTaskModal({ isOpen, onClose, departmentId }: CreateTaskModalProps) {
    const create = useMutation(api.tasks.create);
    const viewer = useQuery((api as any).viewer.get);
    const agents = useQuery(api.agents.listByDept, { departmentId });
    const [taskPrompt, setTaskPrompt] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const content = taskPrompt.trim();
        if (!content) return;
        const generatedTitle =
            content.length > 90 ? `${content.slice(0, 87).trimEnd()}...` : content;
        const jarvis = (agents ?? []).find((agent: any) => String(agent.name ?? "").toLowerCase() === "jarvis");

        setIsSubmitting(true);
        try {
            await create({
                departmentId,
                title: generatedTitle,
                description: content,
                createdBySessionKey: "user:web",
                createdByName: (viewer?.name as string | undefined) ?? (viewer?.email as string | undefined),
                assigneeSessionKeys: jarvis?.sessionKey ? [jarvis.sessionKey] : [],
                priority: "medium", // Default
                tags: [],
            });
            // Reset and close
            setTaskPrompt("");
            onClose();
        } catch (error: unknown) {
            if (openUpgradeModalFromError(error)) return;
            console.error("Failed to create task:", error);
            alert("Failed to create task. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-2xl animate-in fade-in zoom-in duration-200">
                <form
                    onSubmit={handleSubmit}
                    className="rounded-2xl border border-border-subtle bg-white shadow-2xl p-4"
                >
                    <textarea
                        value={taskPrompt}
                        onChange={(e) => setTaskPrompt(e.target.value)}
                        className="w-full min-h-[120px] max-h-[320px] resize-y bg-transparent text-[20px] leading-8 text-text-primary placeholder:text-text-secondary focus:outline-none"
                        placeholder="Qual a nossa próxima tarefa?"
                        required
                        autoFocus
                    />

                    <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setTaskPrompt("");
                                onClose();
                            }}
                            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-black/5 rounded-md transition-colors"
                            disabled={isSubmitting}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 text-sm font-medium text-white bg-text-primary hover:opacity-90 rounded-md shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={isSubmitting || !taskPrompt.trim()}
                        >
                            {isSubmitting ? "Criando..." : "Enviar"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
