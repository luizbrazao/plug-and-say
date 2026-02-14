// convex/uxPing.ts
export function isUserPingMessage(content: string): boolean {
    const t = content
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .trim();

    // muito curto e vazio -> ping
    if (t === "?" || t === "oi" || t === "ola" || t === "alô" || t === "alo") return true;

    // pings comuns (PT/ES/EN) — simples e robusto
    const patterns: RegExp[] = [
        /\b(e ai|eae|e aí|eai|e a[ií])\b/,
        /\b(oi|ola|ol[aá]|hello|hi|hey)\b/,
        /\b(alguem|alguem ai|alguem aí|alguien)\b/,
        /\b(novidade|novidades|alguma novidade|alguna novedad)\b/,
        /\b(funcionou|deu certo|esta pronto|está pronto|ja foi|já foi)\b/,
        /\b(ta pronto|tá pronto|ta indo|tá indo)\b/,
        /\b(alguma atualizacao|alguma atualização|update|status)\b/,
        /\b(esta indo\?|está indo\?)\b/,
        /\b(tem resposta|me responde|me responda)\b/,
        /\b(que houve|que aconteceu|que pasa|que paso|what happened)\b/,
    ];

    // Se for muito longo, provavelmente não é ping (evita falso positivo)
    if (t.length > 80) return false;

    return patterns.some((r) => r.test(t));
}
