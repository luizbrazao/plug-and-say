import { Link } from "../../lib/router";

type CredentialHelpBannerProps = {
    href: string;
};

export function CredentialHelpBanner({ href }: CredentialHelpBannerProps) {
    const isInternal = href.startsWith("/");
    return (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
            Need help filling out these fields?{" "}
            {isInternal ? (
                <Link
                    href={href}
                    className="font-semibold underline decoration-blue-400 underline-offset-2 hover:text-blue-700"
                >
                    Open docs
                </Link>
            ) : (
                <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold underline decoration-blue-400 underline-offset-2 hover:text-blue-700"
                >
                    Open docs
                </a>
            )}
        </div>
    );
}
