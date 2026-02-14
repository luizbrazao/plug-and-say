export const UX_STATES = {
    CONFIRMADO: "CONFIRMADO",
    EM_ANDAMENTO: "EM_ANDAMENTO",
    CONCLUIDO: "CONCLUIDO",
    ATENCAO_NECESSARIA: "ATENCAO_NECESSARIA",
} as const;

export type UXState = typeof UX_STATES[keyof typeof UX_STATES];

export const UX_COPY = {
    CONFIRMADO: "Recebido. Pode deixar com a gente.",
    EM_ANDAMENTO_LINE_1: "Estamos cuidando disso em segundo plano.",
    EM_ANDAMENTO_LINE_2: "Você não precisa fazer nada agora.",
    CONCLUIDO: "Tudo certo. Já está feito.",
    ATENCAO_NECESSARIA: "Precisamos de você para continuar.",
} as const;

// Regras imutáveis de UX (documentação executável)
export const UX_RULES = {
    MAX_ACTIONS: 1,
    MAX_MESSAGES: 2,
    ALLOW_TECHNICAL_LANGUAGE: false,
    ALLOW_PROCESS_EXPLANATION: false,
    ALLOW_OPEN_QUESTIONS: false,
};
