import { useMemo, useState } from "react";
import { ServiceLogo } from "./ServiceLogo";

const SERVICES = [
    { value: "gmail", label: "Gmail" },
    { value: "openai", label: "OpenAI" },
    { value: "github", label: "GitHub" },
    { value: "notion", label: "Notion" },
    { value: "twitter", label: "Twitter / X" },
    { value: "tavily", label: "Tavily" },
    { value: "resend", label: "Resend" },
] as const;

type CredentialGalleryModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSelectService: (service: string) => void;
};

export function CredentialGalleryModal({ isOpen, onClose, onSelectService }: CredentialGalleryModalProps) {
    const [query, setQuery] = useState("");

    const filteredServices = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return SERVICES;
        return SERVICES.filter((service) => service.label.toLowerCase().includes(normalized));
    }, [query]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-border-subtle bg-white shadow-2xl">
                <header className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold tracking-tight">Create Credential</h2>
                        <p className="text-xs text-text-secondary">Pick a service to configure.</p>
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
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search credentials..."
                        className="w-full rounded-xl border border-border-subtle px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {filteredServices.map((service) => (
                            <button
                                key={service.value}
                                onClick={() => onSelectService(service.value)}
                                className="rounded-xl border border-border-subtle p-3 text-left hover:bg-black/[0.03] transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <ServiceLogo service={service.value} className="w-12 h-12" />
                                    <div>
                                        <p className="text-sm font-semibold">{service.label}</p>
                                        <p className="text-[11px] text-text-secondary uppercase tracking-wide">Credential</p>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
