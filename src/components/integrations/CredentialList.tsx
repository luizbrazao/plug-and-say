import React from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { ServiceLogo } from "./ServiceLogo";

type IntegrationItem = {
    _id: Id<"integrations">;
    name: string;
    type: string;
    oauthStatus?: string;
    lastError?: string;
    lastSyncAt?: number;
};

type CredentialListProps = {
    integrations: IntegrationItem[];
    onCreateCredential: () => void;
    onDeleteCredential: (id: Id<"integrations">) => void;
    showEmptyState?: boolean;
};

function getStatus(integration: IntegrationItem) {
    if (integration.oauthStatus === "error" || !!integration.lastError) {
        return {
            label: "🔴 Error",
            className: "bg-red-50 text-red-700 border-red-200",
        };
    }

    if (integration.oauthStatus === "pending") {
        return {
            label: "🟡 Pending",
            className: "bg-amber-50 text-amber-700 border-amber-200",
        };
    }

    return {
        label: "🟢 Connected",
        className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
}

function formatRelativeTime(timestamp?: number) {
    if (!timestamp || Number.isNaN(timestamp)) return "Updated never";
    const diffMs = Date.now() - timestamp;
    if (diffMs < 0) return "Updated just now";
    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return `Updated ${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `Updated ${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Updated ${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `Updated ${days}d ago`;
}

export const CredentialList: React.FC<CredentialListProps> = ({
    integrations,
    onCreateCredential,
    onDeleteCredential,
    showEmptyState = true,
}) => {
    if (integrations.length === 0 && showEmptyState) {
        return (
            <div className="rounded-2xl border border-dashed border-border-subtle bg-white/60 p-12 text-center">
                <h3 className="text-base font-semibold tracking-tight">No credentials configured</h3>
                <p className="text-sm text-text-secondary mt-2">
                    Create your first credential to connect external services.
                </p>
                <button
                    onClick={onCreateCredential}
                    className="mt-6 px-4 py-2 bg-text-primary text-white rounded-xl text-xs font-bold uppercase tracking-widest"
                >
                    Create Credential
                </button>
            </div>
        );
    }

    return (
        <div className="grid gap-3">
            {integrations.map((integration) => {
                const status = getStatus(integration);
                return (
                    <article
                        key={integration._id}
                        className="rounded-2xl border border-border-subtle bg-white/80 px-4 py-3 flex items-center justify-between gap-4"
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <ServiceLogo service={integration.type} />
                            <div className="min-w-0">
                                <p className="text-sm font-semibold truncate">{integration.name}</p>
                                <p className="text-[11px] uppercase tracking-wider text-text-secondary truncate">
                                    {integration.type} credential
                                </p>
                                <p className="text-[11px] text-text-secondary/80 truncate">
                                    {formatRelativeTime(integration.lastSyncAt)}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                            <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${status.className}`}
                            >
                                {status.label}
                            </span>
                            <button
                                onClick={() => {
                                    if (window.confirm("Disconnect integration?")) {
                                        onDeleteCredential(integration._id);
                                    }
                                }}
                                className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-red-700 hover:bg-red-50 rounded-lg"
                            >
                                Revoke
                            </button>
                        </div>
                    </article>
                );
            })}
        </div>
    );
};
