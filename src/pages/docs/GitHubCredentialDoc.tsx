import React from "react";
import { Link } from "../../lib/router";

function Badge({
    children,
    tone = "neutral",
}: {
    children: React.ReactNode;
    tone?: "neutral" | "blue" | "amber" | "red" | "green";
}) {
    const toneClass =
        tone === "blue"
            ? "border-blue-200 bg-blue-50 text-blue-900"
            : tone === "amber"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : tone === "red"
                    ? "border-red-200 bg-red-50 text-red-900"
                    : tone === "green"
                        ? "border-green-200 bg-green-50 text-green-900"
                        : "border-border-subtle bg-black/5 text-text-secondary";

    return (
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${toneClass}`}>
            {children}
        </span>
    );
}

function Card({
    title,
    description,
    children,
    id,
}: {
    title: React.ReactNode;
    description?: React.ReactNode;
    children: React.ReactNode;
    id?: string;
}) {
    return (
        <section
            id={id}
            className="rounded-2xl border border-border-subtle bg-white p-5 space-y-3 scroll-mt-24"
        >
            <div className="space-y-1">
                <h2 className="text-xl font-semibold">{title}</h2>
                {description ? <p className="text-sm text-text-secondary">{description}</p> : null}
            </div>
            {children}
        </section>
    );
}

function InlineCode({ children }: { children: React.ReactNode }) {
    return (
        <code className="rounded-md border border-border-subtle bg-black/5 px-1.5 py-0.5 text-[0.9em]">
            {children}
        </code>
    );
}

function ExternalLink({
    href,
    children,
}: {
    href: string;
    children: React.ReactNode;
}) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-semibold underline decoration-border-subtle underline-offset-4 hover:decoration-text-secondary"
        >
            {children}
        </a>
    );
}

export default function GitHubCredentialDoc() {
    return (
        <div className="h-screen overflow-y-auto bg-warm-bg text-text-primary">
            <div className="mx-auto max-w-5xl px-6 py-10 space-y-6">
                {/* Header */}
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-3xl font-bold tracking-tight">GitHub Credential</h1>
                            <Badge tone="blue">PlugandSay</Badge>
                            <Badge tone="neutral">Docs</Badge>
                        </div>

                        <p className="text-sm text-text-secondary max-w-2xl">
                            Use this credential to allow agents and workflows to interact with the GitHub API—creating issues, managing
                            pull requests, and triggering repository workflows securely.
                        </p>

                        <div className="flex flex-wrap gap-2 pt-1">
                            <Badge tone="green">Works with: GitHub + Triggers</Badge>
                            <Badge tone="amber">Document Loader: token only</Badge>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Link
                            href="/"
                            className="px-3 py-2 rounded-lg border border-border-subtle text-sm font-semibold hover:bg-black/5"
                        >
                            Back to Dashboard
                        </Link>
                    </div>
                </div>

                {/* Layout */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-[260px_1fr]">
                    {/* Sidebar / Table of contents */}
                    <aside className="md:sticky md:top-6 h-fit rounded-2xl border border-border-subtle bg-white p-4">
                        <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                            On this page
                        </div>
                        <nav className="mt-3 space-y-2 text-sm">
                            <a className="block hover:underline" href="#supported-integrations">
                                Supported integrations
                            </a>
                            <a className="block hover:underline" href="#when-to-use">
                                When to use
                            </a>
                            <a className="block hover:underline" href="#auth-methods">
                                Authentication methods
                            </a>
                            <a className="block hover:underline" href="#required-fields">
                                Required fields
                            </a>
                            <a className="block hover:underline" href="#api-token">
                                Using API access token
                            </a>
                            <a className="block hover:underline" href="#oauth2">
                                Using OAuth2
                            </a>
                            <a className="block hover:underline" href="#troubleshooting">
                                Troubleshooting
                            </a>
                            <a className="block hover:underline" href="#tools-mapped">
                                Tools mapped
                            </a>
                            <a className="block hover:underline" href="#security">
                                Security best practices
                            </a>
                            <a className="block hover:underline" href="#references">
                                Official references
                            </a>
                        </nav>
                    </aside>

                    {/* Content */}
                    <main className="space-y-6">
                        <Card
                            id="supported-integrations"
                            title="Supported integrations"
                            description="Where this credential can be used inside PlugandSay."
                        >
                            <ul className="list-disc pl-6 space-y-1 text-sm">
                                <li>
                                    <strong>GitHub</strong> (core integration)
                                </li>
                                <li>
                                    <strong>GitHub Trigger</strong> (event-based automation)
                                </li>
                                <li>
                                    <strong>GitHub Document Loader</strong>: API token only — OAuth not supported
                                </li>
                            </ul>
                        </Card>

                        <Card
                            id="when-to-use"
                            title="When to use"
                            description="Use this credential whenever an agent needs to act on a repository."
                        >
                            <ul className="list-disc pl-6 space-y-1 text-sm">
                                <li>Create GitHub Issues</li>
                                <li>Create or manage Pull Requests</li>
                                <li>Trigger GitHub Actions workflows</li>
                                <li>Read repository data and contents</li>
                                <li>Access org repositories (when permitted)</li>
                            </ul>
                        </Card>

                        <Card
                            id="auth-methods"
                            title="Authentication methods"
                            description="PlugandSay supports two authentication modes depending on your governance needs."
                        >
                            <ul className="list-disc pl-6 space-y-2 text-sm">
                                <li>
                                    <strong>API Access Token (Recommended)</strong>
                                    <div className="text-text-secondary mt-1">
                                        Use a Personal Access Token (Classic). Works with all GitHub-related tools (including the Document Loader).
                                    </div>
                                </li>
                                <li>
                                    <strong>OAuth2 (Advanced)</strong>
                                    <div className="text-text-secondary mt-1">
                                        Use for centralized governance, easier rotation, and team compliance. Supported for GitHub + GitHub Trigger
                                        only.
                                    </div>
                                </li>
                            </ul>

                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                OAuth2 is <strong>not</strong> supported for GitHub Document Loader. Use an API token for that integration.
                            </div>
                        </Card>

                        <Card
                            id="required-fields"
                            title="Required fields"
                            description="These fields appear in the PlugandSay credential form."
                        >
                            <ul className="list-disc pl-6 space-y-1 text-sm">
                                <li>
                                    <strong>GitHub Server</strong> (default: <InlineCode>https://api.github.com</InlineCode>)
                                    <div className="text-text-secondary mt-1">
                                        Only change this if you're using GitHub Enterprise Server.
                                    </div>
                                </li>
                                <li>
                                    <strong>User</strong> (recommended)
                                    <div className="text-text-secondary mt-1">Your GitHub username as shown on your profile.</div>
                                </li>
                                <li>
                                    <strong>Access Token</strong> (required)
                                </li>
                                <li>
                                    <strong>Default Repository</strong> (optional, format <InlineCode>owner/repo</InlineCode>)
                                    <div className="text-text-secondary mt-1">
                                        Example: <InlineCode>luizbrazao/mission-control</InlineCode>
                                    </div>
                                </li>
                            </ul>
                        </Card>

                        <Card
                            id="api-token"
                            title="Using API access token"
                            description="Recommended for most setups. Works across all GitHub tools."
                        >
                            <div className="space-y-3 text-sm">
                                <div className="rounded-xl border border-border-subtle bg-black/5 p-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge tone="blue">Recommended</Badge>
                                        <span className="font-semibold">Personal Access Token (Classic)</span>
                                    </div>
                                    <p className="mt-2 text-text-secondary">
                                        Fine-grained tokens may not cover all endpoints depending on your use case. Classic tokens tend to be the
                                        most compatible option.
                                    </p>
                                </div>

                                <h3 className="text-base font-semibold">Prerequisites</h3>
                                <ul className="list-disc pl-6 space-y-1">
                                    <li>A valid GitHub account</li>
                                    <li>Verified email address in GitHub</li>
                                </ul>

                                <h3 className="text-base font-semibold">Step 1 — Generate a Personal Access Token (Classic)</h3>
                                <ol className="list-decimal pl-6 space-y-2">
                                    <li>Open your GitHub profile and go to <strong>Settings</strong>.</li>
                                    <li>
                                        In the left navigation, open <strong>Developer settings</strong>.
                                    </li>
                                    <li>
                                        Under <strong>Personal access tokens</strong>, open <strong>Tokens (classic)</strong>.
                                    </li>
                                    <li>
                                        Click <strong>Generate new token</strong> → <strong>Generate new token (classic)</strong>.
                                    </li>
                                    <li>
                                        Add a descriptive name (example: <InlineCode>PlugandSay Integration</InlineCode>).
                                    </li>
                                    <li>
                                        Choose an expiration (or “No expiration” if allowed by your security policy).
                                    </li>
                                    <li>Select the scopes you need (see below).</li>
                                    <li>Click <strong>Generate token</strong>, then copy the token (it will be shown only once).</li>
                                </ol>

                                <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                                    <div className="font-semibold mb-1">Recommended scopes</div>
                                    <div className="space-y-1">
                                        <div>
                                            <InlineCode>repo</InlineCode> — required for issues, PRs, and repository access
                                        </div>
                                        <div>
                                            <InlineCode>read:org</InlineCode> — only if accessing organization repositories
                                        </div>
                                        <div>
                                            <InlineCode>workflow</InlineCode> — only if triggering GitHub Actions workflows
                                        </div>
                                    </div>
                                    <div className="mt-2 text-blue-900/90">
                                        A token without scopes can only access public information.
                                    </div>
                                </div>

                                <h3 className="text-base font-semibold">Step 2 — Configure in PlugandSay</h3>
                                <ul className="list-disc pl-6 space-y-2">
                                    <li>
                                        Keep <strong>GitHub Server</strong> as <InlineCode>https://api.github.com</InlineCode> unless you use
                                        GitHub Enterprise Server.
                                    </li>
                                    <li>
                                        Fill <strong>User</strong> with your GitHub username.
                                    </li>
                                    <li>
                                        Paste your <strong>Access Token</strong>.
                                    </li>
                                    <li>
                                        Optionally set a <strong>Default Repository</strong> as <InlineCode>owner/repo</InlineCode>.
                                    </li>
                                </ul>
                            </div>
                        </Card>

                        <Card
                            id="oauth2"
                            title="Using OAuth2"
                            description="Best for teams that need centralized governance, easier rotation, and compliance."
                        >
                            <div className="space-y-4 text-sm">
                                <div className="rounded-xl border border-border-subtle bg-black/5 p-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge tone="amber">Advanced</Badge>
                                        <span className="font-semibold">OAuth2</span>
                                    </div>
                                    <p className="mt-2 text-text-secondary">
                                        OAuth2 is supported for GitHub and GitHub Trigger. Do not use OAuth2 for GitHub Document Loader.
                                    </p>
                                </div>

                                <h3 className="text-base font-semibold">GitHub Cloud</h3>
                                <p className="text-text-secondary">
                                    Use the <strong>Connect GitHub Account</strong> button inside PlugandSay and complete authorization
                                    in your browser.
                                </p>

                                <h3 className="text-base font-semibold">Self-hosted / GitHub Enterprise</h3>
                                <p className="text-text-secondary">
                                    Create a GitHub OAuth App and add its credentials in PlugandSay.
                                </p>

                                <ol className="list-decimal pl-6 space-y-2">
                                    <li>Open GitHub → <strong>Settings</strong> → <strong>Developer settings</strong>.</li>
                                    <li>Open <strong>OAuth Apps</strong> and click <strong>New OAuth App</strong>.</li>
                                    <li>
                                        Fill in:
                                        <ul className="list-disc pl-6 mt-2 space-y-1">
                                            <li>
                                                <strong>Application name</strong>: <InlineCode>PlugandSay Integration</InlineCode>
                                            </li>
                                            <li>
                                                <strong>Homepage URL</strong>: your PlugandSay instance URL
                                            </li>
                                            <li>
                                                <strong>Authorization callback URL</strong>: paste the OAuth Redirect URL provided by PlugandSay
                                            </li>
                                        </ul>
                                    </li>
                                    <li>Register the application and copy <strong>Client ID</strong> + <strong>Client Secret</strong>.</li>
                                    <li>Paste them into PlugandSay OAuth settings and finish authorization.</li>
                                </ol>
                            </div>
                        </Card>

                        <Card
                            id="troubleshooting"
                            title="Troubleshooting"
                            description="Most failures come down to token validity, scopes, or repository permissions."
                        >
                            <ul className="list-disc pl-6 space-y-2 text-sm">
                                <li>
                                    <strong>401 Unauthorized</strong>
                                    <div className="text-text-secondary mt-1">Token expired, revoked, or incorrectly pasted.</div>
                                </li>
                                <li>
                                    <strong>403 Forbidden</strong>
                                    <div className="text-text-secondary mt-1">Missing scope, insufficient permissions, or API rate limit exceeded.</div>
                                </li>
                                <li>
                                    <strong>404 Not Found</strong>
                                    <div className="text-text-secondary mt-1">Wrong <InlineCode>owner/repo</InlineCode> path or no access to the repository.</div>
                                </li>
                            </ul>

                            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                                Tip: a <strong>404</strong> can also mean “you don’t have permission” (GitHub often hides private repos behind 404s).
                            </div>
                        </Card>

                        <Card
                            id="tools-mapped"
                            title="Tools mapped"
                            description="Internal tools that rely on this credential."
                        >
                            <ul className="list-disc pl-6 space-y-1 text-sm">
                                <li>
                                    <InlineCode>create_github_issue</InlineCode>
                                </li>
                                <li>
                                    <InlineCode>create_pull_request</InlineCode>
                                </li>
                                <li>
                                    <InlineCode>trigger_github_workflow</InlineCode>
                                </li>
                                <li>
                                    <InlineCode>list_repository_issues</InlineCode>
                                </li>
                                <li>
                                    <InlineCode>get_repository_content</InlineCode>
                                </li>
                            </ul>
                        </Card>

                        <Card
                            id="security"
                            title="Security best practices"
                            description="Because tokens are basically tiny keys to your kingdom."
                        >
                            <ul className="list-disc pl-6 space-y-1 text-sm">
                                <li>Never share your access token in screenshots, logs, or chat.</li>
                                <li>Prefer short expirations when possible.</li>
                                <li>Revoke unused tokens regularly.</li>
                                <li>Limit scopes to the minimum required.</li>
                                <li>Prefer OAuth2 for team environments and governance.</li>
                            </ul>
                        </Card>

                        <Card
                            id="references"
                            title="Official references"
                            description="Primary sources for GitHub authentication and API usage."
                        >
                            <ul className="list-disc pl-6 space-y-2 text-sm">
                                <li>
                                    Personal Access Tokens:{" "}
                                    <ExternalLink href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token">
                                        GitHub Docs
                                    </ExternalLink>
                                </li>
                                <li>
                                    OAuth scopes:{" "}
                                    <ExternalLink href="https://docs.github.com/en/developers/apps/building-oauth-apps/scopes-for-oauth-apps">
                                        GitHub Docs
                                    </ExternalLink>
                                </li>
                                <li>
                                    Authorizing OAuth Apps:{" "}
                                    <ExternalLink href="https://docs.github.com/en/developers/apps/building-oauth-apps/authorizing-oauth-apps">
                                        GitHub Docs
                                    </ExternalLink>
                                </li>
                                <li>
                                    REST API reference:{" "}
                                    <ExternalLink href="https://docs.github.com/en/rest">
                                        GitHub REST API
                                    </ExternalLink>
                                </li>
                            </ul>
                        </Card>

                        {/* Footer hint */}
                        <div className="text-xs text-text-secondary px-1">
                            PlugandSay uses the official GitHub REST API and standard OAuth2 flows for secure integration.
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
}
