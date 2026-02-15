import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";

const MAX_TOOL_ITERATIONS = 2;
const TOOL_BLOB_GLOBAL_REGEX = /\[TOOL:\s*[a-zA-Z0-9_-]+\s+ARG:\s*\{[\s\S]*?\}\s*\]/g;
const MEMORY_USED_MARKER_REGEX = /\[MEMORY_USED\]\s*/g;
const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi;
const ORGANIZATION_LANGUAGE_VALIDATOR = v.union(
    v.literal("en"),
    v.literal("es"),
    v.literal("pt")
);

type OrganizationLanguage = "en" | "es" | "pt";

type ToolCall = {
    name: string;
    args: Record<string, any>;
};
type LlmMessage = {
    role: "assistant" | "user" | "system";
    content: string;
};
type SquadMember = {
    name: string;
    role: string;
    sessionKey: string;
    status: string;
};

type SubtaskProgress = {
    _id: any;
    title: string;
    status: string;
    assigneeSessionKeys: string[];
    latestUpdate?: string;
    docUrls?: string[];
};

function normalizeOrganizationLanguage(input: unknown): OrganizationLanguage {
    const normalized = String(input ?? "").trim().toLowerCase();
    if (normalized === "en" || normalized === "es" || normalized === "pt") {
        return normalized;
    }
    return "pt";
}

function organizationLanguageLabel(language: OrganizationLanguage): string {
    if (language === "en") return "English";
    if (language === "es") return "Spanish";
    return "Portuguese";
}

function localizedAcknowledge(language: OrganizationLanguage): string {
    if (language === "en") return "Understood.";
    if (language === "es") return "Entendido.";
    return "Entendido.";
}

function localizedDelegationAcknowledge(language: OrganizationLanguage): string {
    if (language === "en") {
        return "Understood. I have already delegated this to the team and recorded the next steps. You can follow progress on the board.";
    }
    if (language === "es") {
        return "Entendido. Ya delegué esto al equipo y registré los próximos pasos. Puedes seguir el progreso en el tablero.";
    }
    return "Entendido! Ja deleguei as tarefas para o time e registrei os proximos passos. Voce pode acompanhar no quadro.";
}

function localizedSafeRunningMessage(language: OrganizationLanguage): string {
    if (language === "en") {
        return "Understood. I am taking care of this now and will return with a clear summary shortly.";
    }
    if (language === "es") {
        return "Entendido. Me encargaré de esto ahora y volveré con un resumen claro en breve.";
    }
    return "Entendido! Estou cuidando disso agora e te retorno com um resumo claro em seguida.";
}

function localizedMemoryFallbackIntro(language: OrganizationLanguage): string {
    if (language === "en") return "I found these excerpts in the Knowledge Base:";
    if (language === "es") return "Encontré estos extractos en la Base de Conocimiento:";
    return "Encontrei estes trechos no Knowledge Base:";
}

function localizedMemoryFallbackOutro(language: OrganizationLanguage): string {
    if (language === "en") {
        return "If you want, I can extract only the date and key facts in an objective format.";
    }
    if (language === "es") {
        return "Si quieres, puedo extraer solo la fecha y los datos clave en un formato objetivo.";
    }
    return "Se quiser, eu extraio apenas a data e os dados-chave em formato objetivo.";
}

async function getDepartmentLanguageFromDb(
    ctx: any,
    departmentId: any
): Promise<OrganizationLanguage> {
    const department = await ctx.db.get(departmentId);
    if (!department?.orgId) return "pt";
    const organization = await ctx.db.get(department.orgId);
    return normalizeOrganizationLanguage((organization as { language?: string } | null)?.language);
}

function formatLongTermMemoryContext(memories: any[]): string {
    const top = memories.slice(0, 5);
    const lines = top.map((m: any, idx: number) => {
        const date = m?.date ? new Date(m.date).toISOString().slice(0, 10) : "unknown-date";
        return `${idx + 1}. [${m?.kind || "memory"}] ${m?.title || "Untitled"} | ${date} | score=${(m?.score ?? 0).toFixed(3)}\n${m?.snippet || ""}`;
    });
    return `=== LONG-TERM MEMORY CONTEXT ===\n${lines.join("\n\n")}\n=== END LONG-TERM MEMORY CONTEXT ===`;
}

function formatEmptyLongTermMemoryContext(query?: string): string {
    const suffix = query ? ` for query "${query}"` : "";
    return `=== LONG-TERM MEMORY CONTEXT ===\nNo relevant memories found${suffix}.\n=== END LONG-TERM MEMORY CONTEXT ===`;
}

function formatSquadRoster(squad: SquadMember[]): string {
    if (!squad || squad.length === 0) return "=== SQUAD ROSTER ===\n(no agents found)\n=== END SQUAD ROSTER ===";
    const lines = squad.map((m) => `- ${m.name} | ${m.role} | ${m.status}`);
    return `=== SQUAD ROSTER ===\n${lines.join("\n")}\n=== END SQUAD ROSTER ===`;
}

function tryParseToolArgs(rawArgs: string): Record<string, any> | null {
    const attempts: string[] = [];
    attempts.push(rawArgs);

    // Remove common trailing comma issues: {"a":1,} or [1,2,]
    const noTrailingCommas = rawArgs.replace(/,\s*([}\]])/g, "$1");
    if (noTrailingCommas !== rawArgs) attempts.push(noTrailingCommas);

    // Quote unquoted object keys: {prompt: "x"} -> {"prompt":"x"}
    const quotedKeys = noTrailingCommas.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    if (quotedKeys !== noTrailingCommas) attempts.push(quotedKeys);

    // Replace smart quotes occasionally generated by LLMs.
    const normalizedQuotes = quotedKeys
        .replace(/[“”]/g, "\"")
        .replace(/[‘’]/g, "'");
    if (normalizedQuotes !== quotedKeys) attempts.push(normalizedQuotes);

    for (const candidate of attempts) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed as Record<string, any>;
            }
        } catch {
            // Try next candidate
        }
    }

    return null;
}

function formatSubtaskProgress(subtasks: SubtaskProgress[]): string {
    if (!subtasks || subtasks.length === 0) {
        return "=== DELEGATED SUBTASKS ===\n(no delegated subtasks)\n=== END DELEGATED SUBTASKS ===";
    }
    const lines = subtasks.map((s) => {
        const assignees = (s.assigneeSessionKeys ?? []).join(", ") || "unassigned";
        const update = s.latestUpdate ? ` | latest: ${s.latestUpdate}` : "";
        const docs = (s.docUrls ?? []).length > 0 ? ` | docs=${(s.docUrls ?? []).join(", ")}` : "";
        return `- ${s.title} | status=${s.status} | assignees=${assignees}${update}${docs}`;
    });
    return `=== DELEGATED SUBTASKS ===\n${lines.join("\n")}\n=== END DELEGATED SUBTASKS ===`;
}

function formatProvenanceData(subtasks: SubtaskProgress[]): string {
    const completed = (subtasks ?? []).filter(
        (s) => s.status === "done" || s.status === "review"
    );
    if (completed.length === 0) {
        return "=== PROVENANCE_DATA ===\n(no completed child-task result yet)\n=== END PROVENANCE_DATA ===";
    }
    const lines = completed.map((s) => {
        const assignees = (s.assigneeSessionKeys ?? []).join(", ") || "unassigned";
        const result = s.latestUpdate ? s.latestUpdate : "(no textual result found)";
        const docs = (s.docUrls ?? []).length > 0 ? `\nDOC_URLS: ${(s.docUrls ?? []).join(", ")}` : "";
        return `- CHILD_RESULT | title="${s.title}" | status=${s.status} | assignees=${assignees}${docs}\nLAST_MESSAGE_CONTENT:\n${result}`;
    });
    return `=== PROVENANCE_DATA ===\n${lines.join("\n\n")}\n=== END PROVENANCE_DATA ===`;
}

function isToolBlobContent(content: string): boolean {
    const normalized = content.trim();
    return normalized.startsWith("[TOOL:") || normalized.includes("[TOOL:");
}

async function wasRecentlySentByAgent(
    ctx: any,
    taskId: any,
    fromSessionKey: string,
    content: string,
    windowMs: number
): Promise<boolean> {
    return await ctx.runQuery(internal.brain.checkDuplicateMessage, {
        taskId,
        fromSessionKey,
        content,
        windowMs,
    });
}

function parseAllToolCalls(content: string): ToolCall[] {
    const calls: ToolCall[] = [];
    let cursor = 0;

    while (cursor < content.length) {
        const slice = content.slice(cursor);
        const headerMatch = slice.match(/\[TOOL:\s*([a-zA-Z0-9_-]+)\s+ARG:\s*/i);
        if (!headerMatch || headerMatch.index === undefined) break;

        const headerIndex = cursor + headerMatch.index;
        const name = headerMatch[1]?.trim().toLowerCase();
        if (!name) break;

        let i = headerIndex + headerMatch[0].length;
        while (i < content.length && /\s/.test(content[i])) i += 1;

        if (content.slice(i, i + 7).toLowerCase() === "```json") {
            i += 7;
            while (i < content.length && /\s/.test(content[i])) i += 1;
        } else if (content.slice(i, i + 3) === "```") {
            i += 3;
            while (i < content.length && /\s/.test(content[i])) i += 1;
        }

        const start = content.indexOf("{", i);
        if (start === -1) break;

        let depth = 0;
        let inString = false;
        let escaped = false;
        let end = -1;
        for (let pos = start; pos < content.length; pos += 1) {
            const ch = content[pos];
            if (inString) {
                if (escaped) escaped = false;
                else if (ch === "\\") escaped = true;
                else if (ch === "\"") inString = false;
                continue;
            }
            if (ch === "\"") {
                inString = true;
                continue;
            }
            if (ch === "{") depth += 1;
            if (ch === "}") {
                depth -= 1;
                if (depth === 0) {
                    end = pos;
                    break;
                }
            }
        }
        if (end === -1) break;

        const rawArgs = content.slice(start, end + 1).trim();
        const parsed = tryParseToolArgs(rawArgs);
        if (parsed) {
            calls.push({ name, args: parsed });
        }

        cursor = end + 1;
    }

    return calls;
}

function formatToolCallEcho(toolCalls: ToolCall[]): string {
    return toolCalls
        .map((toolCall) => `[TOOL: ${toolCall.name} ARG: ${JSON.stringify(toolCall.args)}]`)
        .join("\n");
}

function sanitizePublicAssistantContent(content: string): string {
    return content
        .replace(TOOL_BLOB_GLOBAL_REGEX, "")
        .replace(MEMORY_USED_MARKER_REGEX, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function sanitizeProvenanceSnippet(content: string): string {
    return sanitizePublicAssistantContent(content)
        .replace(MARKDOWN_IMAGE_REGEX, (_match, _alt, url) => String(url))
        .replace(/\s+/g, " ")
        .trim();
}

function sanitizeTelegramOutboundContent(content: string): string {
    const base = sanitizePublicAssistantContent(content);
    const withoutImages = base.replace(MARKDOWN_IMAGE_REGEX, "").trim();
    const loweredWithoutImages = withoutImages.toLowerCase();
    const imageMentions: string[] = [];

    for (const match of base.matchAll(MARKDOWN_IMAGE_REGEX)) {
        const alt = String(match[1] ?? "").trim();
        const url = String(match[2] ?? "").trim();
        if (!url) continue;
        if (loweredWithoutImages.includes(url.toLowerCase())) continue;
        if (alt && loweredWithoutImages.includes(alt.toLowerCase())) continue;
        imageMentions.push(alt ? `${alt}: ${url}` : url);
    }

    const merged =
        imageMentions.length > 0
            ? `${withoutImages}${withoutImages ? "\n\n" : ""}${imageMentions.join("\n")}`
            : withoutImages;

    return merged.replace(/\n{3,}/g, "\n\n").trim();
}

function hasToolSyntax(content: string): boolean {
    return content.includes("[TOOL:");
}

function looksLikeNoInfoResponse(content: string): boolean {
    const normalized = content.toLowerCase();
    const patterns = [
        "não localizei",
        "nao localizei",
        "não encontrei",
        "nao encontrei",
        "não tenho acesso",
        "nao tenho acesso",
        "não há informações",
        "nao ha informacoes",
        "não tenho informações",
        "nao tenho informacoes",
    ];
    return patterns.some((p) => normalized.includes(p));
}

function normalizeForSimilarity(content: string): string {
    return content.toLowerCase().replace(/\s+/g, " ").trim();
}

function trigramSimilarity(aRaw: string, bRaw: string): number {
    const a = normalizeForSimilarity(aRaw);
    const b = normalizeForSimilarity(bRaw);
    if (!a || !b) return 0;
    if (a === b) return 1;

    const trigrams = (text: string) => {
        if (text.length < 3) return [text];
        const out: string[] = [];
        for (let i = 0; i <= text.length - 3; i += 1) {
            out.push(text.slice(i, i + 3));
        }
        return out;
    };

    const aTri = trigrams(a);
    const bTri = trigrams(b);
    const bCount = new Map<string, number>();
    for (const tri of bTri) {
        bCount.set(tri, (bCount.get(tri) ?? 0) + 1);
    }

    let intersection = 0;
    for (const tri of aTri) {
        const count = bCount.get(tri) ?? 0;
        if (count > 0) {
            intersection += 1;
            bCount.set(tri, count - 1);
        }
    }

    return (2 * intersection) / (aTri.length + bTri.length);
}

async function executeTool(
    ctx: any,
    departmentId: any,
    taskId: any,
    delegatorSessionKey: string,
    toolCall: ToolCall,
    allowedTools?: string[]
): Promise<any> {
    const permissionAliases: Record<string, string[]> = {
        gmail_send_email: ["send_email"],
        send_email: ["gmail_send_email"],
        list_emails: ["gmail_list_inbox"],
        gmail_list_inbox: ["list_emails", "search_emails"],
        get_email_details: ["gmail_get_message"],
        gmail_get_message: ["get_email_details"],
        search_emails: ["gmail_list_inbox", "list_emails"],
    };
    const aliasMatches =
        permissionAliases[toolCall.name]?.some((alias) => allowedTools?.includes(alias)) ?? false;
    const isToolAllowed =
        !allowedTools || allowedTools.includes(toolCall.name) || aliasMatches;

    console.log("[brain.executeTool] attempting", {
        toolName: toolCall.name,
        departmentId: String(departmentId),
        taskId: String(taskId),
        hasAllowedTools: Array.isArray(allowedTools),
        allowedTools: allowedTools ?? null,
        aliasMatches,
    });

    // 1. Enforce Permissions
    if (!isToolAllowed) {
        console.warn("[brain.executeTool] denied by allowedTools", {
            toolName: toolCall.name,
            departmentId: String(departmentId),
            taskId: String(taskId),
            allowedTools: allowedTools ?? null,
        });
        throw new Error(`Permission Denied: Agent is not allowed to use tool '${toolCall.name}'.`);
    }

    if (toolCall.name === "web_search") {
        const query = typeof toolCall.args.query === "string" ? toolCall.args.query : "";
        if (!query) throw new Error("Tool 'web_search' requires a non-empty 'query' string.");
        return await ctx.runAction(internal.tools.search.webSearch, {
            departmentId,
            query,
        });
    }

    if (toolCall.name === "send_email") {
        const to = typeof toolCall.args.to === "string" ? toolCall.args.to : "";
        const subject = typeof toolCall.args.subject === "string" ? toolCall.args.subject : "";
        const body = typeof toolCall.args.body === "string" ? toolCall.args.body : "";

        if (!to || !subject || !body) {
            throw new Error("Tool 'send_email' requires 'to', 'subject', and 'body' strings.");
        }

        return await ctx.runAction(internal.tools.email.sendEmail, {
            departmentId,
            to,
            subject,
            body,
        });
    }

    if (toolCall.name === "list_emails") {
        const limit =
            typeof toolCall.args.limit === "number" && Number.isFinite(toolCall.args.limit)
                ? toolCall.args.limit
                : typeof toolCall.args.maxResults === "number" && Number.isFinite(toolCall.args.maxResults)
                    ? toolCall.args.maxResults
                    : undefined;

        return await ctx.runAction((internal as any).tools.gmail.list_emails, {
            departmentId,
            limit,
        });
    }

    if (toolCall.name === "get_email_details") {
        const emailId =
            typeof toolCall.args.emailId === "string"
                ? toolCall.args.emailId
                : typeof toolCall.args.messageId === "string"
                    ? toolCall.args.messageId
                    : "";
        if (!emailId.trim()) {
            throw new Error("Tool 'get_email_details' requires a non-empty 'emailId'.");
        }

        return await ctx.runAction((internal as any).tools.gmail.get_email_details, {
            departmentId,
            emailId,
        });
    }

    if (toolCall.name === "search_emails") {
        const query =
            typeof toolCall.args.query === "string"
                ? toolCall.args.query
                : typeof toolCall.args.q === "string"
                    ? toolCall.args.q
                    : "";
        const limit =
            typeof toolCall.args.limit === "number" && Number.isFinite(toolCall.args.limit)
                ? toolCall.args.limit
                : typeof toolCall.args.maxResults === "number" && Number.isFinite(toolCall.args.maxResults)
                    ? toolCall.args.maxResults
                    : undefined;
        if (!query.trim()) {
            throw new Error("Tool 'search_emails' requires a non-empty 'query'.");
        }

        return await ctx.runAction((internal as any).tools.gmail.search_emails, {
            departmentId,
            query,
            limit,
        });
    }

    if (toolCall.name === "gmail_list_inbox") {
        const q = typeof toolCall.args.q === "string" ? toolCall.args.q : undefined;
        const pageToken = typeof toolCall.args.pageToken === "string" ? toolCall.args.pageToken : undefined;
        const maxResults =
            typeof toolCall.args.maxResults === "number" && Number.isFinite(toolCall.args.maxResults)
                ? toolCall.args.maxResults
                : undefined;

        return await ctx.runAction((internal as any).tools.gmailTools.gmailListInbox, {
            departmentId,
            q,
            maxResults,
            pageToken,
        });
    }

    if (toolCall.name === "gmail_get_message") {
        const messageId = typeof toolCall.args.messageId === "string" ? toolCall.args.messageId : "";
        const format =
            toolCall.args.format === "minimal" ||
                toolCall.args.format === "full" ||
                toolCall.args.format === "metadata" ||
                toolCall.args.format === "raw"
                ? toolCall.args.format
                : undefined;
        if (!messageId.trim()) {
            throw new Error("Tool 'gmail_get_message' requires a non-empty 'messageId'.");
        }

        return await ctx.runAction((internal as any).tools.gmailTools.gmailGetMessage, {
            departmentId,
            messageId,
            format,
        });
    }

    if (toolCall.name === "gmail_list_labels") {
        return await ctx.runAction((internal as any).tools.gmailTools.gmailListLabels, {
            departmentId,
        });
    }

    if (toolCall.name === "gmail_get_capabilities") {
        return await ctx.runAction((internal as any).tools.gmailTools.gmailGetCapabilities, {
            departmentId,
        });
    }

    if (toolCall.name === "gmail_send_email") {
        const to = typeof toolCall.args.to === "string" ? toolCall.args.to : "";
        const subject = typeof toolCall.args.subject === "string" ? toolCall.args.subject : "";
        const body = typeof toolCall.args.body === "string" ? toolCall.args.body : undefined;
        const text = typeof toolCall.args.text === "string" ? toolCall.args.text : body;
        const html = typeof toolCall.args.html === "string" ? toolCall.args.html : undefined;
        const cc = typeof toolCall.args.cc === "string" ? toolCall.args.cc : undefined;
        const bcc = typeof toolCall.args.bcc === "string" ? toolCall.args.bcc : undefined;
        const replyTo = typeof toolCall.args.replyTo === "string" ? toolCall.args.replyTo : undefined;
        const threadId = typeof toolCall.args.threadId === "string" ? toolCall.args.threadId : undefined;

        if (!to.trim() || !subject.trim() || (!text?.trim() && !html?.trim())) {
            throw new Error("Tool 'gmail_send_email' requires 'to', 'subject', and at least one of 'text' or 'html'.");
        }

        return await ctx.runAction((internal as any).tools.gmailTools.gmailSendEmail, {
            departmentId,
            to,
            subject,
            text,
            html,
            cc,
            bcc,
            replyTo,
            threadId,
        });
    }

    if (toolCall.name === "gmail_mark_read") {
        const messageId = typeof toolCall.args.messageId === "string" ? toolCall.args.messageId : "";
        if (!messageId.trim()) {
            throw new Error("Tool 'gmail_mark_read' requires a non-empty 'messageId'.");
        }
        return await ctx.runAction((internal as any).tools.gmailTools.gmailMarkRead, {
            departmentId,
            messageId,
        });
    }

    if (toolCall.name === "gmail_mark_unread") {
        const messageId = typeof toolCall.args.messageId === "string" ? toolCall.args.messageId : "";
        if (!messageId.trim()) {
            throw new Error("Tool 'gmail_mark_unread' requires a non-empty 'messageId'.");
        }
        return await ctx.runAction((internal as any).tools.gmailTools.gmailMarkUnread, {
            departmentId,
            messageId,
        });
    }

    if (toolCall.name === "gmail_archive_message") {
        const messageId = typeof toolCall.args.messageId === "string" ? toolCall.args.messageId : "";
        if (!messageId.trim()) {
            throw new Error("Tool 'gmail_archive_message' requires a non-empty 'messageId'.");
        }
        return await ctx.runAction((internal as any).tools.gmailTools.gmailArchiveMessage, {
            departmentId,
            messageId,
        });
    }

    if (toolCall.name === "gmail_unarchive_message") {
        const messageId = typeof toolCall.args.messageId === "string" ? toolCall.args.messageId : "";
        if (!messageId.trim()) {
            throw new Error("Tool 'gmail_unarchive_message' requires a non-empty 'messageId'.");
        }
        return await ctx.runAction((internal as any).tools.gmailTools.gmailUnarchiveMessage, {
            departmentId,
            messageId,
        });
    }

    if (toolCall.name === "search_knowledge") {
        const query = typeof toolCall.args.query === "string" ? toolCall.args.query : "";
        const limit =
            typeof toolCall.args.limit === "number" && Number.isFinite(toolCall.args.limit)
                ? toolCall.args.limit
                : 5;
        if (!query) throw new Error("Tool 'search_knowledge' requires a non-empty 'query' string.");
        return await ctx.runAction(internal.tools.knowledge.searchKnowledge, {
            departmentId,
            query,
            limit,
        });
    }

    if (toolCall.name === "delegate_task") {
        const title = typeof toolCall.args.title === "string" ? toolCall.args.title : "";
        const description = typeof toolCall.args.description === "string" ? toolCall.args.description : "";
        const instruction = typeof toolCall.args.instruction === "string" ? toolCall.args.instruction : "";
        const assigneesFromArray = Array.isArray(toolCall.args.assignees)
            ? toolCall.args.assignees.filter((x: any) => typeof x === "string")
            : [];
        const assigneesFromSingle =
            typeof toolCall.args.assignee === "string"
                ? [toolCall.args.assignee]
                : typeof toolCall.args.assigneeName === "string"
                    ? [toolCall.args.assigneeName]
                    : [];
        const assignees = [...assigneesFromArray, ...assigneesFromSingle];
        const priority =
            toolCall.args.priority === "low" ||
                toolCall.args.priority === "medium" ||
                toolCall.args.priority === "high"
                ? toolCall.args.priority
                : undefined;
        const tags = Array.isArray(toolCall.args.tags)
            ? toolCall.args.tags.filter((x: any) => typeof x === "string")
            : undefined;

        return await ctx.runAction(internal.tools.delegation.delegateTask, {
            departmentId,
            parentTaskId: taskId,
            delegatorSessionKey,
            title,
            description,
            assignees,
            instruction,
            priority,
            tags,
        });
    }

    if (toolCall.name === "update_task_status") {
        const requestedStatus = toolCall.args.status === "review" || toolCall.args.status === "done"
            ? toolCall.args.status
            : null;
        const summary = typeof toolCall.args.summary === "string" ? toolCall.args.summary : undefined;
        if (!requestedStatus) {
            throw new Error("Tool 'update_task_status' requires status to be 'review' or 'done'.");
        }
        return await ctx.runAction((internal as any).tools.delegation.updateTaskStatus, {
            departmentId,
            taskId,
            bySessionKey: delegatorSessionKey,
            status: requestedStatus,
            summary,
        });
    }

    if (toolCall.name === "generate_image") {
        let prompt = typeof toolCall.args.prompt === "string" ? toolCall.args.prompt : "";
        const size =
            toolCall.args.size === "1024x1024" ||
                toolCall.args.size === "1024x1792" ||
                toolCall.args.size === "1792x1024"
                ? toolCall.args.size
                : undefined;
        const quality =
            toolCall.args.quality === "standard" || toolCall.args.quality === "hd"
                ? toolCall.args.quality
                : undefined;
        const style =
            toolCall.args.style === "vivid" || toolCall.args.style === "natural"
                ? toolCall.args.style
                : undefined;

        if (!prompt.trim()) {
            const taskPromptFallback = await ctx.runQuery(internal.brain.getTaskPromptFallback, {
                departmentId,
                taskId,
            });
            prompt = taskPromptFallback?.prompt ?? "";
        }

        if (!prompt.trim()) {
            throw new Error("Tool 'generate_image' requires a non-empty 'prompt' string (and task context fallback was empty).");
        }

        return await ctx.runAction(internal.tools.image.generateImage, {
            departmentId,
            taskId,
            createdBySessionKey: delegatorSessionKey,
            prompt,
            size,
            quality,
            style,
        });
    }

    if (toolCall.name === "create_github_issue") {
        const owner = typeof toolCall.args.owner === "string" ? toolCall.args.owner : undefined;
        const repo = typeof toolCall.args.repo === "string" ? toolCall.args.repo : undefined;
        const title = typeof toolCall.args.title === "string" ? toolCall.args.title : "";
        const body = typeof toolCall.args.body === "string" ? toolCall.args.body : undefined;
        const labels = Array.isArray(toolCall.args.labels)
            ? toolCall.args.labels.filter((x: any) => typeof x === "string")
            : undefined;

        if (!title.trim()) {
            throw new Error("Tool 'create_github_issue' requires a non-empty 'title'.");
        }

        return await ctx.runAction(internal.tools.github.createGithubIssue, {
            departmentId,
            owner,
            repo,
            title,
            body,
            labels,
        });
    }

    if (toolCall.name === "create_pull_request") {
        const owner = typeof toolCall.args.owner === "string" ? toolCall.args.owner : undefined;
        const repo = typeof toolCall.args.repo === "string" ? toolCall.args.repo : undefined;
        const title = typeof toolCall.args.title === "string" ? toolCall.args.title : "";
        const head = typeof toolCall.args.head === "string" ? toolCall.args.head : "";
        const base = typeof toolCall.args.base === "string" ? toolCall.args.base : "";
        const body = typeof toolCall.args.body === "string" ? toolCall.args.body : undefined;
        const draft = typeof toolCall.args.draft === "boolean" ? toolCall.args.draft : undefined;

        if (!title.trim() || !head.trim() || !base.trim()) {
            throw new Error("Tool 'create_pull_request' requires non-empty 'title', 'head', and 'base'.");
        }

        return await ctx.runAction(internal.tools.github.createPullRequest, {
            departmentId,
            owner,
            repo,
            title,
            head,
            base,
            body,
            draft,
        });
    }

    if (toolCall.name === "create_notion_page") {
        const parentPageId = typeof toolCall.args.parentPageId === "string" ? toolCall.args.parentPageId : undefined;
        const title = typeof toolCall.args.title === "string" ? toolCall.args.title : "";
        const content = typeof toolCall.args.content === "string" ? toolCall.args.content : undefined;

        if (!title.trim()) {
            throw new Error("Tool 'create_notion_page' requires non-empty 'title'.");
        }

        return await ctx.runAction(internal.tools.notion.createNotionPage, {
            departmentId,
            parentPageId,
            title,
            content,
        });
    }

    if (toolCall.name === "post_to_x") {
        const text = typeof toolCall.args.text === "string" ? toolCall.args.text : "";
        const replyToId = typeof toolCall.args.replyToId === "string" ? toolCall.args.replyToId : undefined;

        if (!text.trim()) {
            throw new Error("Tool 'post_to_x' requires a non-empty 'text'.");
        }

        return await ctx.runAction(internal.tools.social.postToX, {
            departmentId,
            text,
            replyToId,
        });
    }

    throw new Error(`Unknown tool '${toolCall.name}'.`);
}

/**
 * internal:brain:onNewMessage
 * Triggered by messages:create to decide if an agent needs to wake up.
 */
export const onNewMessage = internalMutation({
    args: {
        departmentId: v.id("departments"),
        taskId: v.id("tasks"),
        messageId: v.id("messages"),
        content: v.string(),
    },
    handler: async (ctx, args) => {
        // 1. Identify agents to trigger
        // For now: trigger ANY agent mentioned, or the assigned agent if it's a direct task message.

        // Simple logic: if message has @mentions, trigger those agents.
        const mentions = args.content.match(/@([a-zA-Z0-9_-]+)/g) || [];
        const agentNames = mentions.map((m: string) => m.slice(1).toLowerCase());

        if (agentNames.length === 0) return;

        const agents = await ctx.db
            .query("agents")
            .withIndex("by_departmentId", q => q.eq("departmentId", args.departmentId))
            .collect();
        const organizationLanguage = await getDepartmentLanguageFromDb(ctx, args.departmentId);

        for (const name of agentNames) {
            const target = agents.find(a => a.name.toLowerCase() === name);
            if (target) {
                // Schedule thinking for this agent
                await ctx.scheduler.runAfter(0, internal.brain.thinkInternal, {
                    departmentId: args.departmentId,
                    taskId: args.taskId,
                    agentSessionKey: target.sessionKey,
                    triggerKey: `message:${String(args.messageId)}:${target.sessionKey}`,
                    language: organizationLanguage,
                });
            }
        }
    },
});

/**
 * internal:brain:onNewTask
 * Triggered by tasks:create to decide if an agent needs to wake up.
 */
export const onNewTask = internalMutation({
    args: {
        departmentId: v.id("departments"),
        taskId: v.id("tasks"),
        description: v.string(),
        assigneeSessionKeys: v.array(v.string()), // Agentes explicitamente assignados
    },
    handler: async (ctx, args) => {
        // 1. Identify agents to trigger
        const mentions = args.description.match(/@([a-zA-Z0-9_-]+)/g) || [];
        const mentionedNames = mentions.map((m: string) => m.slice(1).toLowerCase());

        // Combine mentions and assignees
        const targetSessionKeys = new Set(args.assigneeSessionKeys);

        // Resolve mentioned names to sessionKeys
        if (mentionedNames.length > 0) {
            const agents = await ctx.db
                .query("agents")
                .withIndex("by_departmentId", q => q.eq("departmentId", args.departmentId))
                .collect();

            for (const name of mentionedNames) {
                const target = agents.find(a => a.name.toLowerCase() === name);
                if (target) {
                    targetSessionKeys.add(target.sessionKey);
                }
            }
        }

        if (targetSessionKeys.size === 0) return;
        const organizationLanguage = await getDepartmentLanguageFromDb(ctx, args.departmentId);

        // 2. Schedule thinking for each unique agent
        for (const sessionKey of targetSessionKeys) {
            await ctx.scheduler.runAfter(0, internal.brain.thinkInternal, {
                departmentId: args.departmentId,
                taskId: args.taskId,
                agentSessionKey: sessionKey,
                triggerKey: `task_created:${String(args.taskId)}:${sessionKey}`,
                language: organizationLanguage,
            });
        }
    },
});

/**
 * brain:think
 * Public action used by the Task Inspector to force a re-analysis.
 */
export const think = action({
    args: {
        departmentId: v.id("departments"),
        taskId: v.id("tasks"),
        agentSessionKey: v.string(),
        triggerKey: v.optional(v.string()),
        language: v.optional(ORGANIZATION_LANGUAGE_VALIDATOR),
    },
    handler: async (ctx, args): Promise<{ ok: true }> => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        const department = await ctx.runQuery(api.departments.get, {
            departmentId: args.departmentId,
        });
        if (!department) throw new Error("Department not found.");
        if (!department.orgId) throw new Error("Department has no organization linked.");

        const organizations = (await ctx.runQuery(api.organizations.listForUser, {})) as Array<{
            _id: Id<"organizations">;
            role: "owner" | "admin" | "member";
        }>;
        const membership = organizations.find((organization) => organization._id === department.orgId);
        if (!membership) {
            throw new Error("Access denied: not a member of this organization.");
        }

        await ctx.runAction(internal.brain.thinkInternal, {
            ...args,
            triggerKey:
                args.triggerKey ??
                `manual_reanalysis:${String(args.taskId)}:${String(userId)}:${Date.now()}`,
        });
        return { ok: true };
    },
});

/**
 * internal:brain:thinkInternal
 * The main "thinking" action. Fetches context and calls LLM.
 */
export const thinkInternal = internalAction({
    args: {
        departmentId: v.id("departments"),
        taskId: v.id("tasks"),
        agentSessionKey: v.string(),
        triggerKey: v.optional(v.string()),
        language: v.optional(ORGANIZATION_LANGUAGE_VALIDATOR),
    },
    handler: async (ctx, args) => {
        const lockKey = args.triggerKey || `think:${String(args.taskId)}:${args.agentSessionKey}`;
        const lock = await ctx.runMutation(internal.brain.acquireThinkLock, {
            taskId: args.taskId,
            agentSessionKey: args.agentSessionKey,
            lockKey,
            ttlMs: 20_000,
        });
        if (!lock?.acquired) {
            return;
        }
        try {
            // 1. Fetch integration key for this specific department (BYOK)
            const integration = await ctx.runQuery(internal.integrations.getByTypeForDepartment, {
                departmentId: args.departmentId,
                type: "openai",
            });
            const apiKey = integration?.config?.key || integration?.config?.token;
            console.log(
                `Thinking for Department: ${String(args.departmentId)} - Key Found: ${apiKey ? "Yes" : "No"}`
            );

            const context = await ctx.runQuery(internal.brain.getAssembledContext, {
                taskId: args.taskId,
                agentSessionKey: args.agentSessionKey,
            });

            if (!context) return;
            const targetLanguage = normalizeOrganizationLanguage(
                args.language ?? context.organizationLanguage
            );
            const targetLanguageLabel = organizationLanguageLabel(targetLanguage);

            if (context.task.status === "inbox") {
                await ctx.runMutation(api.tasks.setStatus, {
                    departmentId: args.departmentId,
                    taskId: args.taskId,
                    status: "assigned",
                    bySessionKey: args.agentSessionKey,
                    reason: "brain_auto_start",
                });
            }

        // Determine System Prompt (Soul)
        // Priority: Agent Custom Prompt -> Template Prompt -> Default
        const customPrompt = context.agent.systemPrompt;
        const templatePrompt = context.template?.systemPrompt;
        const baseSystemPrompt = customPrompt || templatePrompt || "Be helpful and efficient.";

        const isSquadLead =
            context.agent.name?.toLowerCase() === "jarvis" ||
            context.agent.sessionKey?.toLowerCase().includes("jarvis");
        const squadRoster = isSquadLead ? formatSquadRoster(context.squad || []) : "";
        if (isSquadLead) {
            console.log(`[SQUAD ROSTER COUNT]: ${(context.squad ?? []).length}`);
        }
        const subtaskProgress = isSquadLead ? formatSubtaskProgress(context.subtasks || []) : "";
        const provenanceData = isSquadLead ? formatProvenanceData(context.subtasks || []) : "";
        const delegateToolContract =
            `Tool contract for delegate_task: when calling it, you MUST include a concise 'title', ` +
            `a detailed 'description' that gives specialist context, an 'instruction', and an 'assignees' array.`;
        const specialistCompletionContract =
            `You are a TECHNICAL AGENT. You are forbidden from saying you finished a task in plain text. ` +
            `You MUST use your tools. If you don't use the tool, the task is NOT considered finished. ` +
            `When you finish your assigned task, you MUST call [TOOL: update_task_status ARG: {"status":"review","summary":"..."}].`;
        const wandaProtocol =
            `WANDA PROTOCOL: you are the squad's Designer. ` +
            `On image requests, you MUST call [TOOL: generate_image ARG: {"prompt":"..."}] first, ` +
            `using a high-quality artistic English prompt. Then call update_task_status with status "review".`;
        const visionProtocol =
            `VISION PROTOCOL: deliver your result and then call update_task_status with status "review".`;
        const isPepper =
            context.agent.name?.toLowerCase() === "pepper" ||
            context.agent.sessionKey?.toLowerCase().includes(":pepper:");
        const pepperGmailReadTools = ["list_emails", "get_email_details", "search_emails", "send_email"];
        const pepperProtocol =
            `PEPPER GMAIL PROTOCOL: You now have full access to the user's Gmail. ` +
            `If asked for the last email, call [TOOL: list_emails ARG: {"limit": 10}] first to find the message id, ` +
            `then call [TOOL: get_email_details ARG: {"emailId":"..."}] to read and summarize it. ` +
            `For filtered lookup, use [TOOL: search_emails ARG: {"query":"...","limit":10}]. ` +
            `Do not say you cannot access the inbox while these tools are available.`;
        const baseAllowedTools = context.agent.allowedTools ?? [];
        const baseAllowedToolsWithPepper = isPepper
            ? Array.from(new Set([...baseAllowedTools, ...pepperGmailReadTools]))
            : baseAllowedTools;
        const effectiveAllowedTools = isSquadLead
            ? baseAllowedToolsWithPepper
            : Array.from(new Set([...(baseAllowedToolsWithPepper ?? []), "update_task_status"]));
        console.log("[brain.think] tool policy", {
            agentSessionKey: args.agentSessionKey,
            agentName: context.agent.name,
            departmentId: String(args.departmentId),
            taskId: String(args.taskId),
            isSquadLead,
            effectiveAllowedTools: effectiveAllowedTools ?? null,
        });

            const systemPrompt = `You are ${context.agent.name}, acting as ${context.agent.role}.\n` +
                `Department Context: ${context.department.name}\n` +
                `Task: ${context.task.title}\n` +
                `Description: ${context.task.description}\n\n` +
                `Your current "Soul" (System Prompt): ${baseSystemPrompt}\n\n` +
                `Language Protocol: You must communicate exclusively in ${targetLanguageLabel}. ` +
                `All tool outputs must be summarized in ${targetLanguageLabel}.\n\n` +
            `Instruction: Respond to the thread in character. Keep it concise. ` +
            `Execute tools IMMEDIATELY. Do not announce what you are going to do. ` +
            `If a tool is needed, call it directly. Your final response to the user should happen only AFTER tool results are back. ` +
            `NEVER send a message saying what you ARE GOING to do. ONLY send a message AFTER tools finish confirming what HAS BEEN done. ` +
            `When a tool is needed, output one or more tool calls in this format: [TOOL: name ARG: {json}]. ` +
            `You have access to Organizational Memory using the tool 'search_knowledge'. ` +
            `Use it when the user asks about past decisions, prior tasks, or historical context. ` +
            (isSquadLead
                ? `You are an ORCHESTRATOR. Your primary goal is to MOVE THE KANBAN. ` +
                `You are a SQUAD LEAD. If the user asks for anything involving search, design, code, or email, you are STRICTLY FORBIDDEN from replying with only text. ` +
                `You MUST use the delegate_task tool. Your response MUST start with the [TOOL:...] block. ` +
                `When you decide to delegate, you must emit the [TOOL: delegate_task] block IMMEDIATELY. ` +
                `Do not provide an intro like "Vou pedir ao..." unless tool execution fails. ` +
                `Talk to the user only to confirm success AFTER tasks are created. ` +
                `As Squad Lead, you have a team. DO NOT say you cannot do something. ` +
                `If you need information from the web, use 'delegate_task' to ask @Vision. ` +
                `If you need to send an email, use 'delegate_task' to ask @Pepper. ` +
                `Prioritize delegation to specialists instead of trying to execute every specialty yourself. ` +
                `Specialists (Vision/Pepper) need clear context, expected output, and constraints to work effectively. ` +
                `${delegateToolContract}\n${squadRoster}\n${subtaskProgress}\n${provenanceData}\n` +
                `If a child task is DONE/REVIEW, read PROVENANCE_DATA and provide the final answer in the original channel. ` +
                `When PROVENANCE_DATA has completed child results, you MUST do two things in sequence: ` +
                `1) send a concise final summary to the user; ` +
                `2) IMMEDIATELY call [TOOL: update_task_status ARG: {"status":"done","summary":"..."}] to close your own task. ` +
                `Never leave the parent task open after returning the final summary. ` +
                `If a specialist generated a file or image, your final report MUST include the link, and for images include markdown ![Image](url). ` +
                `Do not say the specialist is still working when completed result data exists.\n`
                : `${specialistCompletionContract}\n${context.agent.name?.toLowerCase() === "wanda" ? wandaProtocol : ""}\n${context.agent.name?.toLowerCase() === "vision" ? visionProtocol : ""}\n${isPepper ? pepperProtocol : ""}\n`) +
            `After receiving tool observations, produce the final answer for the user.` +
            (effectiveAllowedTools ? `\nAllowed Tools: ${effectiveAllowedTools.join(", ")}` : "");

            const conversationMessages: LlmMessage[] = context.messages.map((m: any) => ({
                role: m.fromSessionKey === args.agentSessionKey ? "assistant" : "user",
                content: m.content,
            }));
            const latestHumanMessage = [...(context.messages ?? [])]
                .reverse()
                .find((m: any) =>
                    typeof m?.content === "string" &&
                    m.content.trim().length > 0 &&
                    !String(m.fromSessionKey ?? "").startsWith("agent:")
                );

            let usedLongTermMemory = false;
            const surfacedMemories: any[] = [];
            if (latestHumanMessage?.content) {
                try {
                    const memoryQuery = `${String(latestHumanMessage.content).slice(0, 500)}\n${String(context.task.title ?? "").slice(0, 200)}`;
                    const preloadedMemory = await ctx.runAction(internal.tools.knowledge.searchKnowledge, {
                        departmentId: args.departmentId,
                        query: memoryQuery,
                        limit: 8,
                    });
                    const memories = Array.isArray(preloadedMemory?.memories)
                        ? preloadedMemory.memories
                        : [];
                    if (memories.length > 0) {
                        surfacedMemories.push(...memories);
                    }
                    conversationMessages.push({
                        role: "system",
                        content: memories.length > 0
                            ? formatLongTermMemoryContext(memories)
                            : formatEmptyLongTermMemoryContext(String(latestHumanMessage.content)),
                    });
                    if (memories.length > 0) {
                        usedLongTermMemory = true;
                    }
                } catch (memoryError: any) {
                    console.warn("[brain.think] memory preload failed:", memoryError?.message || memoryError);
                }
            }

            let response = await ctx.runAction(api.openai.chat, {
                systemPrompt,
                messages: conversationMessages,
                apiKey,
                maxTokens: 900,
            });
            console.log("[RAW LLM RESPONSE]:", response);

            let toolIterations = 0;
            let toolWasCalled = false;
            let toolExecutionFailed = false;
            let enforcedToolRetryUsed = false;
            let lastToolError: { tool: string; error: string } | null = null;
            const executedToolNames = new Set<string>();
            const isWanda = context.agent.name?.toLowerCase() === "wanda";
            while (toolIterations < MAX_TOOL_ITERATIONS) {
                const toolCalls = parseAllToolCalls(response);
                if (toolCalls.length === 0) {
                    if (!enforcedToolRetryUsed && !isSquadLead) {
                        const reminder =
                            isWanda
                                ? "Wanda, you forgot to call the tool. Call generate_image now."
                                : "You are a technical agent. You must use tools and update_task_status before saying task is finished.";
                        conversationMessages.push({ role: "assistant", content: response });
                        conversationMessages.push({ role: "system", content: reminder });
                        response = await ctx.runAction(api.openai.chat, {
                            systemPrompt,
                            messages: conversationMessages,
                            apiKey,
                        });
                        enforcedToolRetryUsed = true;
                        continue;
                    }
                    break;
                }

                if (isWanda && !toolCalls.some((call) => call.name === "generate_image") && !enforcedToolRetryUsed) {
                    conversationMessages.push({ role: "assistant", content: response });
                    conversationMessages.push({ role: "system", content: "Wanda, you forgot to call the tool. Call generate_image now." });
                    response = await ctx.runAction(api.openai.chat, {
                        systemPrompt,
                        messages: conversationMessages,
                        apiKey,
                    });
                    enforcedToolRetryUsed = true;
                    continue;
                }
                toolIterations += 1;
                toolWasCalled = true;
                const hasDelegateTool = toolCalls.some((call) => call.name === "delegate_task");
                const assistantToolTurn =
                    hasDelegateTool
                        ? formatToolCallEcho(toolCalls)
                        : response;
                conversationMessages.push({ role: "assistant", content: assistantToolTurn });

                for (const toolCall of toolCalls) {
                    let observation: any;
                    try {
                        executedToolNames.add(toolCall.name);
                        const toolResult = await executeTool(
                            ctx,
                            args.departmentId,
                            args.taskId,
                            args.agentSessionKey,
                            toolCall,
                            effectiveAllowedTools
                        );
                        observation = { ok: true, tool: toolCall.name, result: toolResult };
                    } catch (error: any) {
                        toolExecutionFailed = true;
                        observation = {
                            ok: false,
                            tool: toolCall.name,
                            error: error?.message || "Unknown tool execution error.",
                        };
                        lastToolError = {
                            tool: toolCall.name,
                            error: error?.message || "Unknown tool execution error.",
                        };
                    }

                    conversationMessages.push({
                        role: "system",
                        content: `TOOL_OBSERVATION ${JSON.stringify(observation)}`,
                    });

                    if (observation?.ok && toolCall.name === "search_knowledge") {
                        const memories = Array.isArray(observation?.result?.memories)
                            ? observation.result.memories
                            : [];
                        if (memories.length > 0) {
                            surfacedMemories.push(...memories);
                        }
                        if (memories.length > 0) {
                            usedLongTermMemory = true;
                        }
                        conversationMessages.push({
                            role: "system",
                            content: memories.length > 0
                                ? formatLongTermMemoryContext(memories)
                                : formatEmptyLongTermMemoryContext(
                                    typeof toolCall.args?.query === "string" ? toolCall.args.query : undefined
                                ),
                        });
                    }
                }

                response = await ctx.runAction(api.openai.chat, {
                    systemPrompt,
                    messages: conversationMessages,
                    apiKey,
                    maxTokens: 1200,
                });
                console.log("[RAW LLM RESPONSE]:", response);
            }

            if (parseAllToolCalls(response).length > 0) {
                response = lastToolError
                    ? `I could not complete your request because tool '${lastToolError.tool}' failed: ${lastToolError.error}`
                    : "I could not complete your request because the tool execution limit was reached (max 2 iterations).";
            }

            if (toolExecutionFailed) {
                await ctx.runMutation(api.tasks.setStatus, {
                    departmentId: args.departmentId,
                    taskId: args.taskId,
                    status: "review",
                    bySessionKey: args.agentSessionKey,
                    reason: "tool_execution_error",
                });
            }

            const rawFinalResponse = usedLongTermMemory ? `[MEMORY_USED]\n${response}` : response;
            let finalResponse = sanitizePublicAssistantContent(rawFinalResponse);
            const delegatedInThisRun = executedToolNames.has("delegate_task");
            if (delegatedInThisRun && !toolExecutionFailed) {
                finalResponse = localizedDelegationAcknowledge(targetLanguage);
            }
            if (toolWasCalled && !finalResponse) {
                finalResponse = localizedDelegationAcknowledge(targetLanguage);
            }
            if (!toolWasCalled && hasToolSyntax(finalResponse)) {
                finalResponse = localizedSafeRunningMessage(targetLanguage);
            }
            if (!finalResponse) {
                finalResponse = localizedAcknowledge(targetLanguage);
            }

            if (usedLongTermMemory && looksLikeNoInfoResponse(finalResponse)) {
                const merged = new Map<string, any>();
                for (const memory of surfacedMemories) {
                    const key = `${String(memory?.kind ?? "memory")}:${String(memory?.id ?? "")}`;
                    if (!merged.has(key)) merged.set(key, memory);
                }
                const sample = Array.from(merged.values()).slice(0, 3);
                if (sample.length > 0) {
                    const lines = sample.map((m: any, idx: number) => {
                        const title = String(m?.title ?? "Documento");
                        const snippet = String(m?.snippet ?? "").trim();
                        const clipped = snippet.length > 420 ? `${snippet.slice(0, 420)}...` : snippet;
                        return `${idx + 1}. ${title}\n${clipped}`;
                    });
                    finalResponse =
                        `${localizedMemoryFallbackIntro(targetLanguage)}\n\n` +
                        lines.join("\n\n") +
                        `\n\n${localizedMemoryFallbackOutro(targetLanguage)}`;
                }
            }

            const duplicateInLast30s = await wasRecentlySentByAgent(
                ctx,
                args.taskId,
                args.agentSessionKey,
                finalResponse,
                60_000
            );
            console.log(`[LOG] Duplicate check complete. Should skip: ${duplicateInLast30s}`);
            if (duplicateInLast30s) {
                return;
            }

            await ctx.runMutation(api.messages.create, {
                departmentId: args.departmentId,
                taskId: args.taskId,
                fromSessionKey: args.agentSessionKey,
                content: finalResponse,
            });

            const chatIdFromDescription = context.task.description.match(/Telegram Chat ID:\s*(\d+)/i);
            const chatIdFromLegacyTitle = context.task.title.match(/\((\d+)\)$/);
            const rawChatId = chatIdFromDescription?.[1] || chatIdFromLegacyTitle?.[1];
            if (rawChatId) {
                const chatId = parseInt(rawChatId, 10);
                const telegramText = sanitizeTelegramOutboundContent(finalResponse);
                await ctx.runAction(api.telegram.sendMessage, {
                    departmentId: args.departmentId,
                    chatId,
                    text: telegramText || localizedAcknowledge(targetLanguage),
                    language: targetLanguage,
                });
            }

            const explicitlyUpdatedStatus = executedToolNames.has("update_task_status");
            const hasCompletedChildResult = (context.subtasks ?? []).some((subtask: any) =>
                (subtask.status === "done" || subtask.status === "review") &&
                (
                    (typeof subtask.latestUpdate === "string" && subtask.latestUpdate.trim().length > 0) ||
                    ((subtask.docUrls ?? []).length > 0)
                )
            );
            const shouldAutoCompleteAsDone =
                isSquadLead &&
                hasCompletedChildResult &&
                !toolExecutionFailed &&
                !explicitlyUpdatedStatus &&
                !delegatedInThisRun;
            const shouldAutoCompleteAsReview =
                isSquadLead &&
                !hasCompletedChildResult &&
                !toolExecutionFailed &&
                !explicitlyUpdatedStatus &&
                !delegatedInThisRun;
            if (shouldAutoCompleteAsDone && context.task.status !== "done") {
                await ctx.runMutation(api.tasks.setStatus, {
                    departmentId: args.departmentId,
                    taskId: args.taskId,
                    status: "done",
                    bySessionKey: args.agentSessionKey,
                    reason: "brain_auto_done_from_provenance",
                });
            } else if (shouldAutoCompleteAsReview && context.task.status !== "review") {
                await ctx.runMutation(api.tasks.setStatus, {
                    departmentId: args.departmentId,
                    taskId: args.taskId,
                    status: "review",
                    bySessionKey: args.agentSessionKey,
                    reason: "brain_auto_review",
                });
            }
        } finally {
            await ctx.runMutation(internal.brain.releaseThinkLock, {
                taskId: args.taskId,
                lockKey,
            });
        }
    },
});

/**
 * internal:brain:getAssembledContext
 * Helper query to fetch all required data for thinking in one go.
 */
export const getAssembledContext = internalQuery({
    args: {
        taskId: v.id("tasks"),
        agentSessionKey: v.string(),
    },
    handler: async (ctx, args) => {
        const task = await ctx.db.get(args.taskId);
        if (!task) return null;

        const department = await ctx.db.get(task.departmentId!);
        if (!department) return null;
        const organization = department.orgId ? await ctx.db.get(department.orgId) : null;
        const organizationLanguage = normalizeOrganizationLanguage(
            (organization as { language?: string } | null)?.language
        );

        const agent = await ctx.db
            .query("agents")
            .withIndex("by_sessionKey", q => q.eq("sessionKey", args.agentSessionKey))
            .unique();
        if (!agent) return null;

        // Optional: get template for the "Soul"
        const templates = await ctx.db
            .query("agentTemplates")
            .withIndex("by_departmentId", q => q.eq("departmentId", task.departmentId))
            .collect();
        const template = templates.find(t => t.name === agent.name);

        const squad = await ctx.db
            .query("agents")
            .withIndex("by_departmentId", q => q.eq("departmentId", task.departmentId))
            .collect();

        const deptTasks = await ctx.db
            .query("tasks")
            .withIndex("by_departmentId", (q) => q.eq("departmentId", task.departmentId))
            .collect();
        const subtasks = deptTasks.filter((t: any) => t.parentTaskId === args.taskId);
        const subtasksWithLatest = await Promise.all(
            subtasks.map(async (subtask: any) => {
                const latestMessages = await ctx.db
                    .query("messages")
                    .withIndex("by_taskId", (q) => q.eq("taskId", subtask._id))
                    .order("desc")
                    .take(8);
                const latestNonTool = latestMessages.find(
                    (m: any) =>
                        typeof m?.content === "string" &&
                        m.content.trim().length > 0 &&
                        !isToolBlobContent(String(m.content ?? ""))
                );
                const subtaskDocs = await ctx.db
                    .query("documents")
                    .withIndex("by_department_taskId", (q) =>
                        q.eq("departmentId", task.departmentId).eq("taskId", subtask._id)
                    )
                    .collect();
                const docUrls = subtaskDocs
                    .map((d: any) => String(d.content ?? "").trim())
                    .filter((c: string) => /^https?:\/\//i.test(c));
                return {
                    _id: subtask._id,
                    title: subtask.title,
                    status: subtask.status,
                    assigneeSessionKeys: subtask.assigneeSessionKeys ?? [],
                    latestUpdate: latestNonTool?.content
                        ? sanitizeProvenanceSnippet(String(latestNonTool.content)).slice(0, 700)
                        : undefined,
                    docUrls,
                };
            })
        );

        const messages = await ctx.db
            .query("messages")
            .withIndex("by_taskId", q => q.eq("taskId", args.taskId))
            .order("desc")
            .take(10);

        messages.reverse(); // Chronological for LLM

        return {
            task,
            department,
            organizationLanguage,
            agent,
            template,
            messages,
            subtasks: subtasksWithLatest,
            squad: squad.map((a: any) => ({
                name: a.name,
                role: a.role,
                sessionKey: a.sessionKey,
                status: a.status,
            })),
        };
    },
});

export const getTaskPromptFallback = internalQuery({
    args: {
        departmentId: v.id("departments"),
        taskId: v.id("tasks"),
    },
    handler: async (ctx, args) => {
        const task = await ctx.db.get(args.taskId);
        if (!task || task.departmentId !== args.departmentId) {
            return { prompt: "" };
        }

        const description = typeof task.description === "string" ? task.description.trim() : "";
        const title = typeof task.title === "string" ? task.title.trim() : "";
        const prompt = description || title || "";
        return { prompt };
    },
});

/**
 * internal:brain:checkDuplicateMessage
 * Checks if the same agent already sent an equivalent message for the same task recently.
 */
export const checkDuplicateMessage = internalQuery({
    args: {
        taskId: v.id("tasks"),
        fromSessionKey: v.string(),
        content: v.string(),
        windowMs: v.number(),
    },
    handler: async (ctx, args) => {
        const recent = await ctx.db
            .query("messages")
            .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
            .order("desc")
            .take(20);

        const now = Date.now();
        const expectedContent = String(args.content);
        let maxSimilarity = 0;

        const duplicated = recent.some((m) => {
            if (m.fromSessionKey !== args.fromSessionKey) return false;
            if (now - m.createdAt > args.windowMs) return false;
            const similarity = trigramSimilarity(String(m.content ?? ""), expectedContent);
            if (similarity > maxSimilarity) {
                maxSimilarity = similarity;
            }
            return similarity >= 0.7;
        });

        console.log("[brain.checkDuplicateMessage]", {
            taskId: String(args.taskId),
            fromSessionKey: args.fromSessionKey,
            windowMs: args.windowMs,
            duplicated,
            maxSimilarity,
        });
        return duplicated;
    },
});

/**
 * internal:brain:acquireThinkLock
 * Strict first-in-wins lock on task row.
 */
export const acquireThinkLock = internalMutation({
    args: {
        taskId: v.id("tasks"),
        agentSessionKey: v.string(),
        lockKey: v.string(),
        ttlMs: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const ttlMs = Math.max(1000, Math.min(args.ttlMs ?? 20_000, 120_000));
        const task = await ctx.db.get(args.taskId);
        if (!task) return { acquired: false, reason: "task_not_found" as const };

        const activeUntil = task.brainLockExpiresAt ?? 0;
        if (activeUntil > now) {
            return { acquired: false };
        }

        await ctx.db.patch(args.taskId, {
            brainLockOwner: `${args.agentSessionKey}:${args.lockKey}`,
            brainLockExpiresAt: now + ttlMs,
        });

        return { acquired: true };
    },
});

export const releaseThinkLock = internalMutation({
    args: {
        taskId: v.id("tasks"),
        lockKey: v.string(),
    },
    handler: async (ctx, args) => {
        const task = await ctx.db.get(args.taskId);
        if (!task) return { released: false };
        if (!task.brainLockOwner?.endsWith(`:${args.lockKey}`)) {
            return { released: false };
        }
        await ctx.db.patch(args.taskId, {
            brainLockOwner: undefined,
            brainLockExpiresAt: undefined,
        });
        return { released: true };
    },
});
