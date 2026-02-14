import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useDept } from "../DeptContext";
import { useOrg } from "../OrgContext";

interface ConnectTelegramModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentBotName?: string;
}

export default function ConnectTelegramModal({
    isOpen,
    onClose,
    currentBotName,
}: ConnectTelegramModalProps) {
    const { activeDeptId } = useDept();
    const { activeOrgId } = useOrg();
    const upsertIntegration = useMutation(api.integrations.upsert);
    const telegramIntegration = useQuery(
        (api as any).integrations.getByDepartmentType,
        activeDeptId ? { departmentId: activeDeptId, type: "telegram" } : "skip"
    );

    const [botToken, setBotToken] = useState("");
    const [integrationName, setIntegrationName] = useState("Jarvis Telegram");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [existingToken, setExistingToken] = useState("");

    useEffect(() => {
        if (!isOpen) return;

        if (telegramIntegration?.name) {
            setIntegrationName(telegramIntegration.name);
        } else if (currentBotName) {
            setIntegrationName(currentBotName);
        } else {
            setIntegrationName("Jarvis Telegram");
        }

        const token = typeof telegramIntegration?.config?.token === "string" ? telegramIntegration.config.token : "";
        setExistingToken(token);
        setBotToken("");
    }, [isOpen, telegramIntegration, currentBotName]);

    const maskedToken = useMemo(() => {
        if (!existingToken) return null;
        if (existingToken.length <= 6) return "******";
        return `${"*".repeat(Math.max(4, existingToken.length - 4))}${existingToken.slice(-4)}`;
    }, [existingToken]);

    if (!isOpen) return null;

    const onSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!activeOrgId) {
            window.alert("Select an organization first.");
            return;
        }
        if (!activeDeptId) {
            window.alert("Select a department first.");
            return;
        }

        const token = botToken.trim() || existingToken;
        if (!token) return;

        setIsSubmitting(true);
        try {
            await upsertIntegration({
                orgId: activeOrgId,
                departmentId: activeDeptId,
                name: integrationName.trim() || "Jarvis Telegram",
                type: "telegram",
                config: { token },
            });
            onClose();
        } catch (error: any) {
            window.alert(`Failed to connect Telegram: ${error?.message ?? "Unknown error"}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl border border-white/25 bg-white/70 shadow-2xl backdrop-blur-md p-6 animate-in fade-in zoom-in duration-200">
                <h2 className="text-lg font-bold tracking-tight text-text-primary">Connect Telegram Bot</h2>
                <p className="mt-1 text-sm text-text-secondary">
                    Link Jarvis to Telegram without opening settings.
                </p>
                {currentBotName ? (
                    <p className="mt-2 text-xs text-blue-700">
                        Current bot: <span className="font-semibold">{currentBotName}</span>
                    </p>
                ) : null}

                <form onSubmit={onSubmit} className="mt-5 space-y-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold opacity-60 uppercase tracking-wider">
                            Integration Name
                        </label>
                        <input
                            value={integrationName}
                            onChange={(event) => setIntegrationName(event.target.value)}
                            placeholder="Jarvis Telegram"
                            className="w-full rounded-xl border border-black/10 bg-white/75 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold opacity-60 uppercase tracking-wider">
                            Telegram Bot Token
                        </label>
                        <input
                            type="password"
                            value={botToken}
                            onChange={(event) => setBotToken(event.target.value)}
                            placeholder={existingToken ? "Leave blank to keep current token" : "123456:ABC..."}
                            className="w-full rounded-xl border border-black/10 bg-white/75 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                            autoFocus
                        />
                        {maskedToken ? (
                            <p className="text-[11px] text-emerald-700">
                                Connected token: <span className="font-mono">{maskedToken}</span>
                            </p>
                        ) : (
                            <p className="text-[11px] text-text-secondary">No token connected yet.</p>
                        )}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-text-secondary hover:bg-black/5"
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || (!botToken.trim() && !existingToken)}
                            className="px-5 py-2 rounded-lg bg-text-primary text-white text-xs font-bold uppercase tracking-wider hover:bg-black transition-colors disabled:opacity-60"
                        >
                            {isSubmitting ? "Saving..." : existingToken ? "Save" : "Connect"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
