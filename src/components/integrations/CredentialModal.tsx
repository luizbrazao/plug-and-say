import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ServiceLogo } from "./ServiceLogo";
import { GitHubCredentialModal } from "./GitHubCredentialModal";
import type { IntegrationLike } from "./types";
import { openUpgradeModalFromError } from "../../lib/upgradeModal";

type CredentialModalProps = {
    isOpen: boolean;
    service: string | null;
    orgId: Id<"organizations">;
    departmentId?: Id<"departments">;
    integration?: IntegrationLike;
    onClose: () => void;
};

const GENERIC_API_KEY_SERVICES = new Set(["openai", "anthropic", "tavily", "dalle"]);
type GmailOAuthPower = "read" | "send" | "organize";
const DEFAULT_GMAIL_POWERS: GmailOAuthPower[] = ["send"];
const GMAIL_POWER_OPTIONS: Array<{ id: GmailOAuthPower; label: string; description: string }> = [
    { id: "send", label: "Send", description: "Send emails on behalf of the account." },
    { id: "read", label: "Read", description: "Read message content and metadata." },
    { id: "organize", label: "Organize", description: "Apply labels, archive, and mark read/unread." },
];

function isGmailPower(value: unknown): value is GmailOAuthPower {
    return value === "read" || value === "send" || value === "organize";
}

function getConvexSiteUrl() {
    const raw = import.meta.env.VITE_CONVEX_URL as string | undefined;
    if (!raw) return "";
    return raw.replace(/\/$/, "");
}

function titleForService(service: string) {
    switch (service) {
        case "gmail":
            return "Gmail OAuth2 API";
        case "notion":
            return "Notion API";
        case "github":
            return "GitHub API";
        case "twitter":
            return "Twitter / X API";
        case "resend":
            return "Resend API";
        case "openai":
            return "OpenAI API";
        case "anthropic":
            return "Anthropic API";
        case "tavily":
            return "Tavily API";
        case "dalle":
            return "DALL-E API";
        default:
            return "Credential";
    }
}

export function CredentialModal({ isOpen, service, orgId, departmentId, integration, onClose }: CredentialModalProps) {
    const upsertIntegration = useMutation(api.integrations.upsert);
    const generateGmailAuthUrl = useAction((api as any).integrations.generateGmailAuthUrl);

    const [clientId, setClientId] = useState("");
    const [clientSecret, setClientSecret] = useState("");
    const [notionToken, setNotionToken] = useState("");
    const [notionParentPageId, setNotionParentPageId] = useState("");
    const [resendToken, setResendToken] = useState("");
    const [resendFromEmail, setResendFromEmail] = useState("");
    const [twitterApiKey, setTwitterApiKey] = useState("");
    const [twitterApiSecret, setTwitterApiSecret] = useState("");
    const [twitterAccessToken, setTwitterAccessToken] = useState("");
    const [twitterAccessSecret, setTwitterAccessSecret] = useState("");
    const [genericApiKey, setGenericApiKey] = useState("");
    const [gmailPowers, setGmailPowers] = useState<GmailOAuthPower[]>(DEFAULT_GMAIL_POWERS);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const redirectUrl = useMemo(() => {
        const base = getConvexSiteUrl();
        return base ? `${base}/oauth/gmail/callback` : "Missing VITE_CONVEX_URL";
    }, []);

    useEffect(() => {
        if (!service) return;
        if (service === "gmail") {
            setClientId(integration?.config?.clientId ?? "");
            setClientSecret(integration?.config?.clientSecret ?? "");
            const savedPowersRaw = (integration as any)?.config?.powers;
            const savedPowers = Array.isArray(savedPowersRaw)
                ? savedPowersRaw.filter((value: unknown): value is GmailOAuthPower => isGmailPower(value))
                : [];
            setGmailPowers(savedPowers.length > 0 ? savedPowers : DEFAULT_GMAIL_POWERS);
            return;
        }
        if (service === "notion") {
            setNotionToken(integration?.config?.token ?? "");
            setNotionParentPageId(integration?.config?.parentPageId ?? "");
            return;
        }
        if (service === "resend") {
            setResendToken(integration?.config?.token ?? "");
            setResendFromEmail(integration?.config?.fromEmail ?? "");
            return;
        }
        if (service === "twitter") {
            setTwitterApiKey(integration?.config?.apiKey ?? "");
            setTwitterApiSecret(integration?.config?.apiSecret ?? "");
            setTwitterAccessToken(integration?.config?.accessToken ?? "");
            setTwitterAccessSecret(integration?.config?.accessSecret ?? "");
            return;
        }
        if (GENERIC_API_KEY_SERVICES.has(service)) {
            setGenericApiKey(integration?.config?.token ?? integration?.config?.key ?? "");
        }
    }, [integration, service]);

    useEffect(() => {
        if (!isOpen) return;
        const onMessage = (event: MessageEvent) => {
            const isOAuthEvent = event.data && typeof event.data === "object" && event.data.type === "gmail-oauth-complete";
            if (isOAuthEvent) {
                setError(null);
            }
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [isOpen]);

    if (!isOpen || !service) return null;

    const isConnected = integration?.oauthStatus === "connected";
    const statusLabel = isConnected ? "Account connected" : "Not connected";
    const statusClass = isConnected
        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
        : "bg-slate-50 border-slate-200 text-slate-700";

    const copyRedirectUrl = async () => {
        try {
            await navigator.clipboard.writeText(redirectUrl);
        } catch {
            window.alert("Unable to copy URL");
        }
    };

    const saveCredential = async (args: any) => {
        setIsSubmitting(true);
        try {
            await upsertIntegration(args);
            onClose();
        } catch (err: unknown) {
            if (openUpgradeModalFromError(err)) return;
            const message = err instanceof Error ? err.message : "Failed to save credential.";
            setError(message ?? "Failed to save credential.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setError(null);
        if (!departmentId) {
            setError("Select a department before connecting Gmail.");
            return;
        }
        if (!clientId.trim() || !clientSecret.trim()) {
            setError("Client ID and Client Secret are required.");
            return;
        }
        if (gmailPowers.length === 0) {
            setError("Select at least one Gmail power.");
            return;
        }
        if (!redirectUrl.startsWith("http")) {
            setError("VITE_CONVEX_URL is not configured.");
            return;
        }

        setIsSubmitting(true);
        try {
            await upsertIntegration({
                orgId,
                departmentId,
                name: "Gmail OAuth2",
                type: "gmail",
                config: {
                    clientId: clientId.trim(),
                    clientSecret: clientSecret.trim(),
                    // Persist callback URL and power selection used in OAuth.
                    redirectUri: redirectUrl,
                    redirectUrl,
                    powers: gmailPowers,
                    refreshToken: integration?.config?.refreshToken ?? "",
                    accessToken: integration?.config?.accessToken ?? "",
                },
                authType: "oauth2",
                oauthStatus: "pending",
                lastError: "",
            } as any);

            const response = await generateGmailAuthUrl({
                departmentId,
                powers: gmailPowers,
            });
            const authUrl = response?.url as string | undefined;
            if (!authUrl) throw new Error("Failed to generate Google auth URL.");

            const popup = window.open(authUrl, "gmail-oauth", "width=560,height=720");
            if (!popup) window.location.href = authUrl;
        } catch (err: unknown) {
            if (openUpgradeModalFromError(err)) return;
            const message = err instanceof Error ? err.message : "OAuth initiation failed.";
            setError(message ?? "OAuth initiation failed.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveNotion = async () => {
        setError(null);
        if (!notionToken.trim() || !notionParentPageId.trim()) {
            setError("Internal Integration Token and Default Parent Page ID are required.");
            return;
        }
        await saveCredential({
            orgId,
            departmentId,
            name: "Notion API",
            type: "notion",
            config: { token: notionToken.trim(), parentPageId: notionParentPageId.trim() },
            authType: "apikey",
            oauthStatus: "connected",
            lastError: "",
        } as any);
    };

    const handleSaveResend = async () => {
        setError(null);
        if (!resendToken.trim() || !resendFromEmail.trim()) {
            setError("API Key and Default From Email are required.");
            return;
        }
        await saveCredential({
            orgId,
            departmentId,
            name: "Resend API",
            type: "resend",
            config: { token: resendToken.trim(), fromEmail: resendFromEmail.trim() },
            authType: "apikey",
            oauthStatus: "connected",
            lastError: "",
        } as any);
    };

    const handleSaveTwitter = async () => {
        setError(null);
        if (!twitterApiKey.trim() || !twitterApiSecret.trim() || !twitterAccessToken.trim() || !twitterAccessSecret.trim()) {
            setError("API Key, API Secret, Access Token, and Access Secret are required.");
            return;
        }
        await saveCredential({
            orgId,
            departmentId,
            name: "Twitter / X API",
            type: "twitter",
            config: {
                apiKey: twitterApiKey.trim(),
                apiSecret: twitterApiSecret.trim(),
                accessToken: twitterAccessToken.trim(),
                accessSecret: twitterAccessSecret.trim(),
            },
            authType: "apikey",
            oauthStatus: "connected",
            lastError: "",
        } as any);
    };

    const handleSaveGenericApiKey = async () => {
        setError(null);
        if (!genericApiKey.trim()) {
            setError("API Key is required.");
            return;
        }
        await saveCredential({
            orgId,
            departmentId,
            name: `${titleForService(service)}`,
            type: service,
            config: { token: genericApiKey.trim() },
            authType: "apikey",
            oauthStatus: "connected",
            lastError: "",
        } as any);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
            <div className="w-full max-w-xl rounded-2xl border border-border-subtle bg-white shadow-2xl">
                {service === "github" ? (
                    <GitHubCredentialModal
                        orgId={orgId}
                        departmentId={departmentId}
                        integration={integration}
                        onClose={onClose}
                    />
                ) : (
                    <>
                <header className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <ServiceLogo service={service} />
                        <div>
                            <h2 className="text-lg font-bold tracking-tight">{titleForService(service)}</h2>
                            <p className="text-xs text-text-secondary">Configure and connect your credential.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-black/5 text-text-secondary" aria-label="Close">
                        ✕
                    </button>
                </header>

                <div className="p-5 space-y-4">
                    {service === "gmail" && (
                        <>
                            <div className={`rounded-xl border px-3 py-2 text-sm font-medium ${statusClass}`}>
                                {isConnected ? "🟢 " : "⚪ "} {statusLabel}
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] uppercase tracking-wider font-semibold text-text-secondary">Client ID</label>
                                <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="123...apps.googleusercontent.com" className="w-full rounded-xl border border-border-subtle px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] uppercase tracking-wider font-semibold text-text-secondary">Client Secret</label>
                                <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="GOCSPX-..." className="w-full rounded-xl border border-border-subtle px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] uppercase tracking-wider font-semibold text-text-secondary">Redirect URL</label>
                                <div className="flex gap-2">
                                    <input value={redirectUrl} readOnly className="flex-1 rounded-xl border border-border-subtle bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700" />
                                    <button onClick={copyRedirectUrl} className="px-3 py-2 rounded-xl border border-border-subtle text-xs font-semibold hover:bg-black/5">Copy</button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] uppercase tracking-wider font-semibold text-text-secondary">Powers</label>
                                <div className="grid gap-2">
                                    {GMAIL_POWER_OPTIONS.map((power) => (
                                        <label key={power.id} className="flex items-start gap-2 rounded-lg border border-border-subtle px-3 py-2 text-xs">
                                            <input
                                                type="checkbox"
                                                className="mt-0.5"
                                                checked={gmailPowers.includes(power.id)}
                                                onChange={(e) => {
                                                    setGmailPowers((prev) => {
                                                        if (e.target.checked) return Array.from(new Set([...prev, power.id]));
                                                        return prev.filter((current) => current !== power.id);
                                                    });
                                                }}
                                            />
                                            <span>
                                                <span className="block font-semibold text-text-primary">{power.label}</span>
                                                <span className="block text-text-secondary">{power.description}</span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            {integration?.lastError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{integration.lastError}</div>}
                            <button onClick={handleGoogleSignIn} disabled={isSubmitting} className="w-full rounded-xl bg-[#1a73e8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1768d1] disabled:opacity-50">
                                {isSubmitting ? "Connecting..." : "Sign in with Google"}
                            </button>
                        </>
                    )}

                    {service === "notion" && (
                        <>
                            <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                                Important: You must "Invite" your integration to the specific Notion page you want the agents to access.
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] uppercase tracking-wider font-semibold text-text-secondary">Internal Integration Token</label>
                                <input type="password" value={notionToken} onChange={(e) => setNotionToken(e.target.value)} placeholder="secret_..." className="w-full rounded-xl border border-border-subtle px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] uppercase tracking-wider font-semibold text-text-secondary">Default Parent Page ID</label>
                                <input value={notionParentPageId} onChange={(e) => setNotionParentPageId(e.target.value)} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="w-full rounded-xl border border-border-subtle px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                            </div>
                            <button onClick={handleSaveNotion} disabled={isSubmitting} className="w-full rounded-xl bg-text-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                                {isSubmitting ? "Saving..." : "Save Credential"}
                            </button>
                        </>
                    )}

                    {service === "resend" && (
                        <>
                            <div className="space-y-1">
                                <label className="text-[11px] uppercase tracking-wider font-semibold text-text-secondary">API Key</label>
                                <input type="password" value={resendToken} onChange={(e) => setResendToken(e.target.value)} placeholder="re_..." className="w-full rounded-xl border border-border-subtle px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] uppercase tracking-wider font-semibold text-text-secondary">Default From Email</label>
                                <input type="email" value={resendFromEmail} onChange={(e) => setResendFromEmail(e.target.value)} placeholder="agent@yourdomain.com" className="w-full rounded-xl border border-border-subtle px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                            </div>
                            <button onClick={handleSaveResend} disabled={isSubmitting} className="w-full rounded-xl bg-text-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                                {isSubmitting ? "Saving..." : "Save Credential"}
                            </button>
                        </>
                    )}

                    {service === "twitter" && (
                        <>
                            <div className="space-y-1">
                                <label className="text-[11px] uppercase tracking-wider font-semibold text-text-secondary">API Key</label>
                                <input type="password" value={twitterApiKey} onChange={(e) => setTwitterApiKey(e.target.value)} placeholder="..." className="w-full rounded-xl border border-border-subtle px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] uppercase tracking-wider font-semibold text-text-secondary">API Secret</label>
                                <input type="password" value={twitterApiSecret} onChange={(e) => setTwitterApiSecret(e.target.value)} placeholder="..." className="w-full rounded-xl border border-border-subtle px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] uppercase tracking-wider font-semibold text-text-secondary">Access Token</label>
                                <input type="password" value={twitterAccessToken} onChange={(e) => setTwitterAccessToken(e.target.value)} placeholder="..." className="w-full rounded-xl border border-border-subtle px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] uppercase tracking-wider font-semibold text-text-secondary">Access Secret</label>
                                <input type="password" value={twitterAccessSecret} onChange={(e) => setTwitterAccessSecret(e.target.value)} placeholder="..." className="w-full rounded-xl border border-border-subtle px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                            </div>
                            <button onClick={handleSaveTwitter} disabled={isSubmitting} className="w-full rounded-xl bg-text-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                                {isSubmitting ? "Saving..." : "Save Credential"}
                            </button>
                        </>
                    )}

                    {GENERIC_API_KEY_SERVICES.has(service) && (
                        <>
                            <div className="space-y-1">
                                <label className="text-[11px] uppercase tracking-wider font-semibold text-text-secondary">API Key</label>
                                <input type="password" value={genericApiKey} onChange={(e) => setGenericApiKey(e.target.value)} placeholder="Enter API key" className="w-full rounded-xl border border-border-subtle px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                            </div>
                            <button onClick={handleSaveGenericApiKey} disabled={isSubmitting} className="w-full rounded-xl bg-text-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                                {isSubmitting ? "Saving..." : "Save Credential"}
                            </button>
                        </>
                    )}

                    {error && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            {error}
                        </div>
                    )}
                </div>
                    </>
                )}
            </div>
        </div>
    );
}
