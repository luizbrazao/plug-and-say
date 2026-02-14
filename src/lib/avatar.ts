export function normalizeAvatarSeed(input?: string | null, fallback = "agent") {
    const raw = (input ?? "").trim();
    if (!raw) return fallback;
    return raw;
}

export function dicebearBotttsUrl(seed?: string | null) {
    const safeSeed = normalizeAvatarSeed(seed, "agent");
    return `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(safeSeed)}`;
}

export function randomAvatarSeed(prefix = "agent") {
    const suffix = Math.random().toString(36).slice(2, 10);
    return `${prefix}-${suffix}`;
}
