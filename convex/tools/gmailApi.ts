import { action } from "../_generated/server";
import { v } from "convex/values";
import { base64urlEncode, getGmailIntegrationConfig, gmailFetch, type GmailPower } from "./gmailClient";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";
const LABEL_CACHE_TTL_MS = 60_000;

type GmailLabel = {
    id: string;
    name: string;
    type: string;
    messageListVisibility?: string;
    labelListVisibility?: string;
};

const labelCache = new Map<string, { expiresAt: number; labels: GmailLabel[] }>();

function requirePower(powers: GmailPower[], required: GmailPower) {
    if (!powers.includes(required)) {
        throw new Error(`Gmail integration missing required power: ${required}`);
    }
}

function asNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function decodeBase64UrlUtf8(input?: string): string | null {
    if (!input) return null;
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "===".slice((normalized.length + 3) % 4);

    const bufferCtor = (globalThis as { Buffer?: { from(input: string, enc: string): { toString(enc: string): string } } }).Buffer;
    if (bufferCtor) {
        return bufferCtor.from(padded, "base64").toString("utf8");
    }

    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
}

function collectMessageBodies(payload: any): { text: string | null; html: string | null } {
    let text: string | null = null;
    let html: string | null = null;

    const visit = (part: any) => {
        if (!part || typeof part !== "object") return;
        const mimeType = asNonEmptyString(part.mimeType);
        const bodyData = asNonEmptyString(part?.body?.data);
        if (mimeType === "text/plain" && bodyData && text === null) {
            text = decodeBase64UrlUtf8(bodyData);
        }
        if (mimeType === "text/html" && bodyData && html === null) {
            html = decodeBase64UrlUtf8(bodyData);
        }
        if (Array.isArray(part.parts)) {
            for (const child of part.parts) visit(child);
        }
    };

    visit(payload);
    return { text, html };
}

function extractBasicHeaders(payload: any) {
    const entries = Array.isArray(payload?.headers) ? payload.headers : [];
    const get = (name: string): string | undefined => {
        const match = entries.find(
            (entry: any) => typeof entry?.name === "string" && entry.name.toLowerCase() === name.toLowerCase()
        );
        return asNonEmptyString(match?.value);
    };
    return {
        from: get("From"),
        to: get("To"),
        cc: get("Cc"),
        bcc: get("Bcc"),
        replyTo: get("Reply-To"),
        subject: get("Subject"),
        date: get("Date"),
    };
}

function splitAddressList(value?: string): string[] {
    const raw = asNonEmptyString(value);
    if (!raw) return [];
    return raw
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

async function fetchLabels(
    ctx: any,
    departmentId: any,
    options?: { useCache?: boolean }
): Promise<GmailLabel[]> {
    const cacheKey = String(departmentId);
    const useCache = options?.useCache ?? true;
    const cached = labelCache.get(cacheKey);
    if (useCache && cached && cached.expiresAt > Date.now()) {
        return cached.labels;
    }

    const response = await gmailFetch(ctx, departmentId, `${GMAIL_API_BASE}/users/me/labels`, { method: "GET" });
    const payload = await parseOrThrow(response, "Gmail listLabels failed");

    const labels = (Array.isArray(payload?.labels) ? payload.labels : [])
        .map((label: any) => {
            const id = asNonEmptyString(label?.id);
            const name = asNonEmptyString(label?.name);
            const type = asNonEmptyString(label?.type) ?? "user";
            if (!id || !name) return null;
            return {
                id,
                name,
                type,
                messageListVisibility: asNonEmptyString(label?.messageListVisibility),
                labelListVisibility: asNonEmptyString(label?.labelListVisibility),
            } satisfies GmailLabel;
        })
        .filter((label: GmailLabel | null): label is GmailLabel => Boolean(label));

    labelCache.set(cacheKey, {
        expiresAt: Date.now() + LABEL_CACHE_TTL_MS,
        labels,
    });

    return labels;
}

async function resolveLabelIdsByName(
    ctx: any,
    departmentId: any,
    names: string[]
): Promise<string[]> {
    if (names.length === 0) return [];

    const labels = await fetchLabels(ctx, departmentId, { useCache: true });
    const byName = new Map<string, string>();
    const byNameUpper = new Map<string, string>();
    const knownIds = new Set<string>();

    for (const label of labels) {
        byName.set(label.name, label.id);
        byNameUpper.set(label.name.toUpperCase(), label.id);
        knownIds.add(label.id);
    }

    const missing: string[] = [];
    const resolved = names.map((value) => {
        const normalized = value.trim();
        if (!normalized) return "";
        if (knownIds.has(normalized)) return normalized;

        const exact = byName.get(normalized);
        if (exact) return exact;

        const upper = byNameUpper.get(normalized.toUpperCase());
        if (upper) return upper;

        missing.push(normalized);
        return "";
    });

    if (missing.length > 0) {
        throw new Error(`Gmail labels not found: ${missing.join(", ")}`);
    }

    return resolved.filter(Boolean);
}

function buildRawMessage(args: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
    cc?: string;
    bcc?: string;
    replyTo?: string;
}) {
    const to = splitAddressList(args.to);
    const cc = splitAddressList(args.cc);
    const bcc = splitAddressList(args.bcc);
    const subject = asNonEmptyString(args.subject) ?? "";
    const text = asNonEmptyString(args.text);
    const html = asNonEmptyString(args.html);
    const replyTo = asNonEmptyString(args.replyTo);

    if (to.length === 0) {
        throw new Error("sendMessage requires at least one recipient in 'to'.");
    }
    if (!text && !html) {
        throw new Error("sendMessage requires 'text' or 'html'.");
    }

    const headers: string[] = [];
    headers.push("MIME-Version: 1.0");
    headers.push(`To: ${to.join(", ")}`);
    if (cc.length > 0) headers.push(`Cc: ${cc.join(", ")}`);
    if (bcc.length > 0) headers.push(`Bcc: ${bcc.join(", ")}`);
    if (replyTo) headers.push(`Reply-To: ${replyTo}`);
    headers.push(`Subject: ${subject}`);

    if (text && html) {
        const boundary = `mc-${Math.random().toString(16).slice(2)}`;
        headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
        const bodyLines = [
            `--${boundary}`,
            "Content-Type: text/plain; charset=UTF-8",
            "",
            text,
            `--${boundary}`,
            "Content-Type: text/html; charset=UTF-8",
            "",
            html,
            `--${boundary}--`,
        ];
        return `${headers.join("\r\n")}\r\n\r\n${bodyLines.join("\r\n")}`;
    }

    if (html) {
        headers.push("Content-Type: text/html; charset=UTF-8");
        return `${headers.join("\r\n")}\r\n\r\n${html}`;
    }

    headers.push("Content-Type: text/plain; charset=UTF-8");
    return `${headers.join("\r\n")}\r\n\r\n${text ?? ""}`;
}

async function parseOrThrow(response: Response, prefix: string) {
    if (response.ok) return await response.json();
    const text = await response.text();
    let reason = `HTTP ${response.status}`;
    try {
        const parsed = JSON.parse(text);
        reason =
            asNonEmptyString(parsed?.error?.message) ||
            asNonEmptyString(parsed?.error_description) ||
            asNonEmptyString(parsed?.error) ||
            reason;
    } catch {
        if (asNonEmptyString(text)) {
            reason = text;
        }
    }
    throw new Error(`${prefix}: ${reason}`);
}

export const listMessages = action({
    args: {
        departmentId: v.id("departments"),
        q: v.optional(v.string()),
        maxResults: v.optional(v.number()),
        pageToken: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const { powers } = await getGmailIntegrationConfig(ctx, args.departmentId);
        requirePower(powers, "read");

        const params = new URLSearchParams();
        if (asNonEmptyString(args.q)) params.set("q", args.q!.trim());
        if (typeof args.maxResults === "number" && Number.isFinite(args.maxResults)) {
            params.set("maxResults", String(Math.max(1, Math.min(100, Math.trunc(args.maxResults)))));
        }
        if (asNonEmptyString(args.pageToken)) params.set("pageToken", args.pageToken!.trim());

        const query = params.toString();
        const url = `${GMAIL_API_BASE}/users/me/messages${query ? `?${query}` : ""}`;
        const response = await gmailFetch(ctx, args.departmentId, url, { method: "GET" });
        const payload = await parseOrThrow(response, "Gmail listMessages failed");

        return {
            messages: Array.isArray(payload?.messages) ? payload.messages : [],
            nextPageToken: asNonEmptyString(payload?.nextPageToken) ?? null,
            resultSizeEstimate:
                typeof payload?.resultSizeEstimate === "number" ? payload.resultSizeEstimate : 0,
        };
    },
});

export const listLabels = action({
    args: {
        departmentId: v.id("departments"),
    },
    handler: async (ctx, args) => {
        const { powers } = await getGmailIntegrationConfig(ctx, args.departmentId);
        requirePower(powers, "organize");

        const labels = await fetchLabels(ctx, args.departmentId, { useCache: false });
        return { labels };
    },
});

export const getMessage = action({
    args: {
        departmentId: v.id("departments"),
        messageId: v.string(),
        format: v.optional(
            v.union(v.literal("minimal"), v.literal("full"), v.literal("metadata"), v.literal("raw"))
        ),
    },
    handler: async (ctx, args) => {
        const { powers } = await getGmailIntegrationConfig(ctx, args.departmentId);
        requirePower(powers, "read");

        const messageId = args.messageId.trim();
        if (!messageId) {
            throw new Error("getMessage requires a non-empty messageId.");
        }

        const format = args.format ?? "full";
        const params = new URLSearchParams({ format });
        const url = `${GMAIL_API_BASE}/users/me/messages/${encodeURIComponent(messageId)}?${params.toString()}`;
        const response = await gmailFetch(ctx, args.departmentId, url, { method: "GET" });
        const payload = await parseOrThrow(response, "Gmail getMessage failed");

        const basicHeaders = extractBasicHeaders(payload?.payload);
        const content = collectMessageBodies(payload?.payload);

        return {
            id: asNonEmptyString(payload?.id) ?? messageId,
            threadId: asNonEmptyString(payload?.threadId) ?? null,
            labelIds: Array.isArray(payload?.labelIds) ? payload.labelIds : [],
            snippet: asNonEmptyString(payload?.snippet) ?? null,
            internalDate: asNonEmptyString(payload?.internalDate) ?? null,
            historyId: asNonEmptyString(payload?.historyId) ?? null,
            headers: basicHeaders,
            content,
        };
    },
});

export const sendMessage = action({
    args: {
        departmentId: v.id("departments"),
        to: v.string(),
        subject: v.string(),
        text: v.optional(v.string()),
        html: v.optional(v.string()),
        cc: v.optional(v.string()),
        bcc: v.optional(v.string()),
        replyTo: v.optional(v.string()),
        threadId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const { powers } = await getGmailIntegrationConfig(ctx, args.departmentId);
        requirePower(powers, "send");

        const rawMessage = buildRawMessage({
            to: args.to,
            subject: args.subject,
            text: args.text,
            html: args.html,
            cc: args.cc,
            bcc: args.bcc,
            replyTo: args.replyTo,
        });

        const body: Record<string, unknown> = {
            raw: base64urlEncode(rawMessage),
        };
        const threadId = asNonEmptyString(args.threadId);
        if (threadId) body.threadId = threadId;

        const response = await gmailFetch(ctx, args.departmentId, `${GMAIL_API_BASE}/users/me/messages/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const payload = await parseOrThrow(response, "Gmail sendMessage failed");

        return {
            ok: true,
            id: asNonEmptyString(payload?.id) ?? null,
            threadId: asNonEmptyString(payload?.threadId) ?? null,
            labelIds: Array.isArray(payload?.labelIds) ? payload.labelIds : [],
        };
    },
});

export const modifyMessageLabels = action({
    args: {
        departmentId: v.id("departments"),
        messageId: v.string(),
        addLabelIds: v.optional(v.array(v.string())),
        removeLabelIds: v.optional(v.array(v.string())),
    },
    handler: async (ctx, args) => {
        const { powers } = await getGmailIntegrationConfig(ctx, args.departmentId);
        requirePower(powers, "organize");

        const messageId = args.messageId.trim();
        if (!messageId) {
            throw new Error("modifyMessageLabels requires a non-empty messageId.");
        }

        const addLabelIdsInput = (args.addLabelIds ?? []).map((label) => label.trim()).filter(Boolean);
        const removeLabelIdsInput = (args.removeLabelIds ?? []).map((label) => label.trim()).filter(Boolean);
        const addLabelIds = await resolveLabelIdsByName(ctx, args.departmentId, addLabelIdsInput);
        const removeLabelIds = await resolveLabelIdsByName(ctx, args.departmentId, removeLabelIdsInput);
        if (addLabelIds.length === 0 && removeLabelIds.length === 0) {
            throw new Error("modifyMessageLabels requires addLabelIds and/or removeLabelIds.");
        }

        // Gmail uses the "UNREAD" label to represent read state.
        // Mark read: remove "UNREAD"; mark unread: add "UNREAD".
        const response = await gmailFetch(
            ctx,
            args.departmentId,
            `${GMAIL_API_BASE}/users/me/messages/${encodeURIComponent(messageId)}/modify`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ addLabelIds, removeLabelIds }),
            }
        );
        const payload = await parseOrThrow(response, "Gmail modifyMessageLabels failed");

        return {
            id: asNonEmptyString(payload?.id) ?? messageId,
            threadId: asNonEmptyString(payload?.threadId) ?? null,
            labelIds: Array.isArray(payload?.labelIds) ? payload.labelIds : [],
        };
    },
});
