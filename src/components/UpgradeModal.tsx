import type { PaidPlanId } from "../lib/billingPlans";

type UpgradeModalProps = {
  isOpen: boolean;
  planId: PaidPlanId | null;
  onClose: () => void;
  onGoToBilling: () => void;
};

export function UpgradeModal({
  isOpen,
  planId,
  onClose,
  onGoToBilling,
}: UpgradeModalProps) {
  if (!isOpen) return null;

  const ctaLabel =
    planId === "business" ? "Ir para Business" : planId === "pro" ? "Ir para Pro" : "Ver planos";
  const badgeLabel =
    planId === "business"
      ? "Escala de equipe"
      : planId === "pro"
        ? "Upgrade recomendado"
        : "Planos Plug&Say";
  const subtitle =
    planId === "business"
      ? "Seu time cresceu. Libere colaboração avançada e limites maiores."
      : planId === "pro"
        ? "Você chegou no limite do plano atual. Faça upgrade e continue sem bloqueios."
        : "Você atingiu um limite do plano atual. Escolha um plano para continuar criando.";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#062427]/35 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-[28px] border border-[#d9d4c9] bg-[#f7f4f0] shadow-[0_30px_70px_rgba(6,36,39,0.22)]"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="border-b border-[#e5ddd2] bg-gradient-to-r from-[#f7f4f0] via-[#f7f4f0] to-[#eef5dd] px-7 py-6">
          <div className="mb-3 inline-flex items-center rounded-full border border-[#cdd9bc] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#355350]">
            {badgeLabel}
          </div>
          <h2 className="font-display text-4xl font-semibold leading-tight text-[#062427]">
            Desbloqueie seu próximo nível
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[#4f6462]">{subtitle}</p>
        </div>

        <div className="px-7 pb-7 pt-6">
          <div className="rounded-2xl border border-[#d9d4c9] bg-white/80 p-4 text-sm text-[#36504e]">
            Continue criando departamentos, agentes, documentos e integrações com mais liberdade.
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#d3cdc4] bg-white px-5 py-3 text-xs font-bold uppercase tracking-[0.11em] text-[#5a6664] transition hover:bg-[#f2ede6]"
            >
              Agora não
            </button>
            <button
              type="button"
              onClick={onGoToBilling}
              className="rounded-xl bg-[#062427] px-5 py-3 text-xs font-bold uppercase tracking-[0.11em] text-[#f7f4f0] transition hover:-translate-y-0.5 hover:bg-[#0b3034] hover:shadow-lg"
            >
              {ctaLabel}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="absolute right-7 top-6 h-8 w-8 rounded-lg text-[#5a6664] transition hover:bg-black/5"
          aria-label="Fechar modal"
        >
          ×
        </button>
      </div>
    </div>
  );
}
