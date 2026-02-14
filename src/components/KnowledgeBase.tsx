import { useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import { useDept } from "../DeptContext";
import { formatLocalizedDateTime } from "../lib/i18nTime";
import { openUpgradeModalFromError } from "../lib/upgradeModal";

export default function KnowledgeBase() {
    const { t, i18n } = useTranslation();
    const language = i18n.resolvedLanguage ?? "pt";
    const { activeDeptId } = useDept();
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const entries = useQuery(
        (api as any).knowledge.listByDepartment,
        activeDeptId ? { departmentId: activeDeptId, limit: 200 } : "skip"
    );
    const generateUploadUrl = useMutation((api as any).knowledge.generateUploadUrl);
    const ingestText = useAction((api as any).knowledge.ingestText);
    const ingestFile = useAction((api as any).knowledgeNode.ingestFile);
    const removeEntry = useMutation((api as any).knowledge.remove);

    const [showTextForm, setShowTextForm] = useState(false);
    const [title, setTitle] = useState("");
    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    async function onAddText() {
        if (!activeDeptId) return;
        const cleanText = text.trim();
        if (!cleanText) {
            setError(t("knowledge.textRequired"));
            return;
        }

        setBusy(true);
        setError(null);
        setMessage(null);
        try {
            await ingestText({
                departmentId: activeDeptId,
                title: title.trim() || t("knowledge.manualKnowledge"),
                text: cleanText,
            });
            setTitle("");
            setText("");
            setShowTextForm(false);
            setMessage(t("knowledge.entryCreated"));
        } catch (err: unknown) {
            if (openUpgradeModalFromError(err)) return;
            const message = err instanceof Error ? err.message : t("knowledge.createFailed");
            setError(message || t("knowledge.createFailed"));
        } finally {
            setBusy(false);
        }
    }

    async function onUploadFile(file: File) {
        if (!activeDeptId) return;
        setBusy(true);
        setError(null);
        setMessage(null);
        try {
            const postUrl = await generateUploadUrl({});
            const uploadResponse = await fetch(postUrl, {
                method: "POST",
                headers: { "Content-Type": file.type || "application/octet-stream" },
                body: file,
            });
            if (!uploadResponse.ok) {
                throw new Error(t("knowledge.uploadFailed"));
            }
            const uploadJson = await uploadResponse.json();
            const storageId = uploadJson.storageId as string;
            if (!storageId) {
                throw new Error(t("knowledge.missingStorageId"));
            }

            await ingestFile({
                departmentId: activeDeptId,
                storageId,
                filename: file.name,
                mimeType: file.type,
            });
            setMessage(t("knowledge.uploadIngestSuccess", { name: file.name }));
        } catch (err: unknown) {
            if (openUpgradeModalFromError(err)) return;
            const message = err instanceof Error ? err.message : t("knowledge.uploadIngestFailed");
            setError(message || t("knowledge.uploadIngestFailed"));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="p-8 max-w-6xl mx-auto w-full space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold">{t("knowledge.title")}</h2>
                    <p className="text-sm text-text-secondary">{t("knowledge.subtitle")}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowTextForm((v) => !v)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide bg-text-primary text-white hover:opacity-90"
                    >
                        {t("knowledge.addText")}
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide bg-blue-600 text-white hover:opacity-90"
                    >
                        {t("knowledge.uploadFile")}
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".txt,.csv,.pdf,text/plain,text/csv,application/pdf"
                        className="hidden"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.currentTarget.value = "";
                            if (!file) return;
                            void onUploadFile(file);
                        }}
                    />
                </div>
            </div>

            {showTextForm && (
                <div className="rounded-2xl border border-border-subtle bg-white/70 p-4 space-y-3">
                    <input
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder={t("knowledge.titlePlaceholder")}
                        className="w-full border border-border-subtle rounded-lg px-3 py-2 text-sm bg-white"
                    />
                    <textarea
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        placeholder={t("knowledge.textPlaceholder")}
                        rows={8}
                        className="w-full border border-border-subtle rounded-lg px-3 py-2 text-sm bg-white font-mono"
                    />
                    <div className="flex items-center justify-end gap-2">
                        <button
                            onClick={() => setShowTextForm(false)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border border-border-subtle"
                        >
                            {t("common.cancel")}
                        </button>
                        <button
                            disabled={busy}
                            onClick={() => {
                                void onAddText();
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide bg-emerald-600 text-white disabled:opacity-60"
                        >
                            {t("common.save")}
                        </button>
                    </div>
                </div>
            )}

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">
                    {error}
                </div>
            )}
            {message && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm px-4 py-3">
                    {message}
                </div>
            )}

            {!entries ? (
                    <div className="p-6 rounded-2xl border border-border-subtle bg-white/60 text-sm text-text-secondary">
                    {t("knowledge.loadingEntries")}
                </div>
            ) : entries.length === 0 ? (
                <div className="p-6 rounded-2xl border border-dashed border-border-subtle bg-white/30 text-sm text-text-secondary italic">
                    {t("knowledge.noEntries")}
                </div>
            ) : (
                <div className="space-y-3">
                    {entries.map((entry: any) => (
                        <div key={entry._id} className="rounded-2xl border border-border-subtle bg-white/70 p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="text-sm font-bold text-text-primary truncate">{entry.title}</div>
                                    <div className="text-xs text-text-secondary mt-1">
                                        {t("knowledge.source")}: {entry.source} | {t("knowledge.date")}: {entry.createdAt ? formatLocalizedDateTime(entry.createdAt, language) : "-"}
                                    </div>
                                    {entry.metadata?.filename ? (
                                        <div className="text-[11px] font-mono text-text-secondary mt-1 break-all">
                                            {entry.metadata.filename}
                                        </div>
                                    ) : null}
                                </div>
                                <button
                                    onClick={() => {
                                        void removeEntry({ id: entry._id });
                                    }}
                                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide border border-red-200 text-red-600 hover:bg-red-50"
                                >
                                    {t("knowledge.delete")}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
