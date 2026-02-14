import React, { useEffect, useState } from "react";

function normalizePath(pathname: string) {
    if (!pathname) return "/";
    if (pathname.length > 1 && pathname.endsWith("/")) {
        return pathname.slice(0, -1);
    }
    return pathname;
}

export function getCurrentPath() {
    if (typeof window === "undefined") return "/";
    return normalizePath(window.location.pathname || "/");
}

export function navigate(pathname: string, options?: { replace?: boolean }) {
    if (typeof window === "undefined") return;
    const target = normalizePath(pathname);
    const current = getCurrentPath();
    if (target === current) return;
    if (options?.replace) {
        window.history.replaceState({}, "", target);
    } else {
        window.history.pushState({}, "", target);
    }
    window.dispatchEvent(new Event("popstate"));
}

export function usePathname() {
    const [pathname, setPathname] = useState<string>(() => getCurrentPath());

    useEffect(() => {
        const onPopState = () => setPathname(getCurrentPath());
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, []);

    return pathname;
}

type LinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    href: string;
};

export function Link({ href, onClick, ...props }: LinkProps) {
    const isInternal = href.startsWith("/");

    if (!isInternal) {
        return <a href={href} onClick={onClick} {...props} />;
    }

    return (
        <a
            href={href}
            onClick={(event) => {
                onClick?.(event);
                if (event.defaultPrevented) return;
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                if ((event as React.MouseEvent).button !== 0) return;
                event.preventDefault();
                navigate(href);
            }}
            {...props}
        />
    );
}
