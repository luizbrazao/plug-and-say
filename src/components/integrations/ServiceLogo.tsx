import { useEffect, useMemo, useState } from "react";

type SupportedService =
    | "gmail"
    | "openai"
    | "github"
    | "notion"
    | "twitter"
    | "upwork"
    | "tavily"
    | "resend"
    | "anthropic"
    | "dalle";

type LogoConfig = {
    label: string;
    bg: string;
    source: "cdn" | "inline";
    slug?: string;     // usado no simpleicons (se quiser)
    color?: string;    // usado no simpleicons (se quiser)
    cdnUrl?: string;   // ✅ usado quando a fonte NÃO é simpleicons
};

type ServiceLogoProps = {
    service: string;
    className?: string;
};

// ✅ URLs confirmadas em fontes oficiais/estáveis
const OFFICIAL_LOGOS = {
    resendIconBlackSvg: "https://cdn.resend.com/brand/resend-icon-black.svg",
    tavilySvg: "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/tavily.svg",
    openaiSimpleIcons: "https://static.cdnlogo.com/logos/o/38/openai.svg",
} as const;

const LOGO_CONFIG: Record<SupportedService, LogoConfig> = {
    gmail: { label: "Gmail", bg: "bg-white", source: "cdn", slug: "gmail" },
    github: { label: "GitHub", bg: "bg-white", source: "cdn", slug: "github" },
    notion: { label: "Notion", bg: "bg-white", source: "cdn", slug: "notion" },
    anthropic: { label: "Anthropic", bg: "bg-white", source: "cdn", slug: "anthropic" },

    // ✅ corrigidos
    resend: {
        label: "Resend",
        bg: "bg-white",
        source: "cdn",
        cdnUrl: OFFICIAL_LOGOS.resendIconBlackSvg,
    },
    openai: {
        label: "OpenAI",
        bg: "bg-white",
        source: "cdn",
        cdnUrl: OFFICIAL_LOGOS.openaiSimpleIcons,
    },
    tavily: {
        label: "Tavily",
        bg: "bg-white",
        source: "cdn",
        cdnUrl: OFFICIAL_LOGOS.tavilySvg,
    },

    twitter: { label: "X", bg: "bg-white", source: "cdn", slug: "x" },
    upwork: { label: "Upwork", bg: "bg-white", source: "cdn", slug: "upwork", color: "14a800" },
    dalle: { label: "DALL-E", bg: "bg-white", source: "inline" },
};

// Mantive seus SVGs inline como fallback (caso algum CDN falhe)
function OpenAILogo({ fill = "#000000" }: { fill?: string }) {
    return (
        <svg viewBox="0 0 24 24" xmlns="https://static.cdnlogo.com/logos/o/38/openai.svg" fill={fill}>
            <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5153-4.9066 6.0462 6.0462 0 0 0-4.7235-3.1351 6.0414 6.0414 0 0 0-5.123.3055L10.2008 3.0173c-.1583.0891-.313.1932-.4518.2917a5.9818 5.9818 0 0 0-4.8193.3013 6.0366 6.0366 0 0 0-3.136 4.7265 6.041 6.041 0 0 0 .3055 5.123l1.932 3.4241c.0894.1581.194.3132.2926.4526a5.9823 5.9823 0 0 0 .301 4.8193 6.037 6.037 0 0 0 4.7263 3.136 6.0415 6.0415 0 0 0 5.1232-.3055l1.7203-1.0205c.1585-.0891.3132-.1935.4523-.2917a5.9818 5.9818 0 0 0 4.819-.3013 6.037 6.037 0 0 0 3.136-4.7265 6.0415 6.0415 0 0 0-.3055-5.1233l-1.932-3.4241a5.378 5.378 0 0 0-.2926-.4526z" />
        </svg>
    );
}

function ResendLogo() {
    return (
        <svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
            <rect width="256" height="256" rx="40" fill="black" />
            <path
                d="M72 72h72c26.5 0 48 21.5 48 48s-21.5 48-48 48h-24v32h-48V72zm48 64h24c8.8 0 16-7.2 16-16s-7.2-16-16-16h-24v32z"
                fill="white"
            />
        </svg>
    );
}

function TavilyLogo() {
    return (
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <rect width="100" height="100" rx="22" fill="#00A3FF" />
            <circle cx="45" cy="45" r="18" stroke="white" strokeWidth="6" fill="none" />
            <path d="M60 60L78 78" stroke="white" strokeWidth="8" strokeLinecap="round" />
        </svg>
    );
}

function FallbackLogo() {
    return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
            <rect x="10" y="10" width="44" height="44" rx="12" fill="#F0F2F5" />
            <path d="M22 22h20v20H22z" fill="#BDC1C6" />
        </svg>
    );
}

function InlineLogo({ service }: { service: string }) {
    switch (service) {
        case "openai":
            return <OpenAILogo fill="#000000" />;
        case "dalle":
            return <OpenAILogo fill="#EF4444" />;
        case "resend":
            return <ResendLogo />;
        case "tavily":
            return <TavilyLogo />;
        default:
            return <FallbackLogo />;
    }
}

// Simple Icons (mantido) — útil pros outros (gmail/github/notion/etc)
function getSimpleIconsUrl(slug: string, color?: string) {
    if (color) return `https://cdn.simpleicons.org/${slug}/${color}`;
    return `https://cdn.simpleicons.org/${slug}`;
}

export function ServiceLogo({ service, className }: ServiceLogoProps) {
    const normalized = useMemo(() => {
        const s = service.toLowerCase().trim();
        if (s.includes("twitter") || s === "x") return "twitter";
        if (s.includes("gmail")) return "gmail";
        if (s.includes("openai")) return "openai";
        if (s.includes("tavily")) return "tavily";
        if (s.includes("resend")) return "resend";
        if (s.includes("upwork")) return "upwork";
        if (s.includes("dalle") || s.includes("dall-e")) return "dalle";
        return s as SupportedService;
    }, [service]);

    const config = LOGO_CONFIG[normalized];
    const wrapperClassName = className ?? "w-11 h-11";
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        setImgError(false);
    }, [normalized]);

    const cdnUrl = useMemo(() => {
        if (!config) return null;
        // ✅ prioridade: cdnUrl explícita (Resend/Tavily/OpenAI aqui)
        if (config.cdnUrl) return config.cdnUrl;
        // fallback: simpleicons por slug
        if (config.slug) return getSimpleIconsUrl(config.slug, config.color);
        return null;
    }, [config]);

    return (
        <div
            className={`${wrapperClassName} rounded-xl border border-border-subtle overflow-hidden flex items-center justify-center ${config?.bg ?? "bg-white shadow-sm"
                }`}
            title={config?.label ?? service}
        >
            <div className="w-[70%] h-[70%] flex items-center justify-center">
                {config?.source === "cdn" && !!cdnUrl && !imgError ? (
                    <img
                        src={cdnUrl}
                        alt={`${config.label} logo`}
                        className="w-full h-full object-contain"
                        onError={() => setImgError(true)}
                    />
                ) : (
                    <InlineLogo service={normalized} />
                )}
            </div>
        </div>
    );
}
