// src/lib/gmailPowers.ts
// "Poderes" que o usuário escolhe na UI e os scopes OAuth correspondentes.
// Referência (scopes Gmail): https://developers.google.com/gmail/api/auth/scopes
// (o link está citado na conversa via fontes do Google)

export type GmailPower =
    | "read_email"          // ler emails e metadados
    | "send_email"          // enviar emails
    | "organize_inbox";     // mover, marcar como lido/não lido, labels, arquivar, lixeira, spam etc.

export type GmailPowerConfig = {
    id: GmailPower;
    title: string;
    description: string;
    // Scopes OAuth necessários para esse poder.
    // OBS: manter o mínimo necessário por poder.
    scopes: string[];
};

export const GMAIL_POWERS: GmailPowerConfig[] = [
    {
        id: "read_email",
        title: "Ler emails",
        description:
            "Permite listar e ler mensagens (conteúdo e metadados). Não permite alterar nada.",
        scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    },
    {
        id: "send_email",
        title: "Enviar emails",
        description:
            "Permite enviar mensagens em nome do usuário (não dá acesso total à caixa).",
        scopes: ["https://www.googleapis.com/auth/gmail.send"],
    },
    {
        id: "organize_inbox",
        title: "Organizar caixa (labels, mover, marcar, arquivar, spam/lixeira)",
        description:
            "Permite modificar mensagens: aplicar/remover labels, marcar como lido, mover para lixeira/spam, etc.",
        scopes: ["https://www.googleapis.com/auth/gmail.modify"],
    },
];

/**
 * Converte uma lista de poderes em uma lista deduplicada de scopes.
 * Isso é o que você passa para o fluxo OAuth quando o usuário conecta o Gmail.
 */
export function scopesForGmailPowers(powers: GmailPower[]): string[] {
    const set = new Set<string>();
    for (const p of powers) {
        const cfg = GMAIL_POWERS.find((x) => x.id === p);
        for (const scope of cfg?.scopes ?? []) set.add(scope);
    }
    return Array.from(set);
}

/**
 * Helper: valida powers vindo do client (defensivo).
 */
export function normalizeGmailPowers(input: unknown): GmailPower[] {
    if (!Array.isArray(input)) return [];
    const allowed = new Set(GMAIL_POWERS.map((p) => p.id));
    return input.filter((x): x is GmailPower => typeof x === "string" && allowed.has(x as GmailPower));
}
