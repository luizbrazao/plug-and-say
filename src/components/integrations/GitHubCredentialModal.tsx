import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ServiceLogo } from "./ServiceLogo";
import { CredentialHelpBanner } from "./CredentialHelpBanner";
import type { GithubCredentialConfig, IntegrationLike } from "./types";
import { openUpgradeModalFromError } from "../../lib/upgradeModal";

type GitHubCredentialModalProps = {
    orgId: Id<"organizations">;
    departmentId?: Id<"departments">;
    integration?: IntegrationLike;
    onClose: () => void;
};

function normalizeServerUrl(value: string) {
    const trimmed = value.trim();
    return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function formatSyncDate(timestamp?: number) {
    if (!timestamp) return "Never";
    return new Date(timestamp).toLocaleString();
}

export function GitHubCredentialModal({
    orgId,
    departmentId,
    integration,
    onClose,
}: GitHubCredentialModalProps) {
    const upsertIntegration = useMutation(api.integrations.upsert);
    const [server, setServer] = useState(
        integration?.config?.server?.trim() || "https://api.github.com"
    );
    const [user, setUser] = useState(integration?.config?.user?.trim() || "");
    const [token, setToken] = useState(integration?.config?.token ?? "");
    const [defaultRepo, setDefaultRepo] = useState(
        integration?.config?.defaultRepo?.trim() || ""
    );
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const statusLabel = useMemo(() => {
        if (integration?.oauthStatus === "error" || integration?.lastError) return "Error";
        if (integration?.oauthStatus === "pending") return "Pending";
        if (integration?.oauthStatus === "connected") return "Connected";
        return "Not connected";
    }, [integration?.lastError, integration?.oauthStatus]);

    const handleSave = async () => {
        setError(null);
        const normalizedServer = normalizeServerUrl(server);
        if (!normalizedServer) {
            setError("GitHub Server is required.");
            return;
        }
        if (!/^https?:\/\//i.test(normalizedServer)) {
            setError("GitHub Server must start with http:// or https://.");
            return;
        }
        if (!token.trim()) {
            setError("Access Token is required.");
            return;
        }

        const config: GithubCredentialConfig = {
            server: normalizedServer,
            token: token.trim(),
            ...(user.trim() ? { user: user.trim() } : {}),
            ...(defaultRepo.trim() ? { defaultRepo: defaultRepo.trim() } : {}),
        };

        setIsSaving(true);
        try {
            await upsertIntegration({
                orgId,
                departmentId,
                name: "GitHub API",
                type: "github",
                config,
                authType: "apikey",
                oauthStatus: "connected",
                lastError: "",
                lastSyncAt: Date.now(),
            } as any);
            onClose();
        } catch (err: unknown) {
            if (openUpgradeModalFromError(err)) return;
            const message = err instanceof Error ? err.message : "Failed to save GitHub credential.";
            setError(message ?? "Failed to save GitHub credential.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <header className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <ServiceLogo service="github" />
                    <div>
                        <h2 className="text-lg font-bold tracking-tight">GitHub API</h2>
                        <p className="text-xs text-text-secondary">
                            Configure and connect your credential.
                        </p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-lg hover:bg-black/5 text-text-secondary"
                    aria-label="Close"
                >
                    ✕
                </button>
            </header>

            <div className="p-5 space-y-4">
                <CredentialHelpBanner href="/docs/credentials/github" />
                <div className="space-y-1">
                    <label className="text-[11px] uppercase tracking-wider font-semibold text-text-secondary">
                        GitHub Server
                    </label>
                    <input
                        value={server}
                        onChange={(e) => setServer(e.target.value)}
                        placeholder="https://api.github.com"
                        className="w-full rounded-xl border border-border-subtle px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[11px] uppercase tracking-wider font-semibold text-text-secondary">
                        User
                    </label>
                    <input
                        value={user}
                        onChange={(e) => setUser(e.target.value)}
                        placeholder="octocat"
                        className="w-full rounded-xl border border-border-subtle px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[11px] uppercase tracking-wider font-semibold text-text-secondary">
                        Access Token
                    </label>
                    <input
                        type="password"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder="ghp_..."
                        className="w-full rounded-xl border border-border-subtle px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[11px] uppercase tracking-wider font-semibold text-text-secondary">
                        Default Repository (optional)
                    </label>
                    <input
                        value={defaultRepo}
                        onChange={(e) => setDefaultRepo(e.target.value)}
                        placeholder="owner/repo"
                        className="w-full rounded-xl border border-border-subtle px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                </div>
                <div className="rounded-xl border border-border-subtle bg-warm-bg/30 p-3 text-xs text-text-secondary">
                    <div>Status: <span className="font-semibold text-text-primary">{statusLabel}</span></div>
                    <div>Last sync: <span className="font-semibold text-text-primary">{formatSyncDate(integration?.lastSyncAt)}</span></div>
                </div>
                {integration?.lastError ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        {integration.lastError}
                    </div>
                ) : null}

                {error ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        {error}
                    </div>
                ) : null}

                <footer className="flex items-center justify-end gap-2 border-t border-border-subtle pt-4">
                    <button
                        onClick={onClose}
                        className="px-3.5 py-2 rounded-xl border border-border-subtle text-sm font-semibold hover:bg-black/5"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-4 py-2 rounded-xl bg-text-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                    >
                        {isSaving ? "Saving..." : "Save"}
                    </button>
                </footer>
            </div>
        </>
    );
}
