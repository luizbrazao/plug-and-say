import React, { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useOrg } from "../OrgContext";
import { useTranslation } from "react-i18next";
import i18n, { normalizeSupportedLanguage, type SupportedLanguage } from "../i18n/config";
import {
  PLAN_ORDER,
  PRICING_PLANS,
  formatLimitValue,
  formatPlanPrice,
  getPlanFeatures,
  isPaidPlanId,
  normalizePlanId,
  type BillingCycle,
  type PaidPlanId,
} from "../lib/billingPlans";

function CheckIcon({ featured }: { featured: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={`mt-0.5 h-5 w-5 flex-none ${featured ? "text-sky-300" : "text-sky-500"}`}
    >
      <path
        d="M5 10.5L8.2 13.6L15 6.8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProgressRow({
  label,
  current,
  limit,
}: {
  label: string;
  current: number;
  limit: number;
}) {
  const isUnlimited = !Number.isFinite(limit);
  const ratio = isUnlimited ? 1 : limit > 0 ? Math.min(current / limit, 1) : 0;
  const isFull = !isUnlimited && current >= limit;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-mono">
        <span className="text-text-secondary">{label}</span>
        <span className={isFull ? "text-red-600 font-bold" : "text-text-primary"}>
          {current}/{formatLimitValue(limit)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-black/10 overflow-hidden">
        <div
          className={`h-full ${isUnlimited ? "bg-sky-400/70" : isFull ? "bg-red-500" : "bg-emerald-500"} transition-all`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}

const Billing: React.FC = () => {
  const { activeOrgId, organizations } = useOrg();
  const { t } = useTranslation();
  const billing = useQuery(api.stripe.billingOverview, activeOrgId ? { orgId: activeOrgId } : "skip");
  const pay = useAction(api.stripe.pay);
  const updateOrganizationLanguage = useMutation(api.organizations.updateLanguage);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("annual");
  const [loadingPlan, setLoadingPlan] = useState<PaidPlanId | null>(null);
  const [isSavingLanguage, setIsSavingLanguage] = useState(false);
  const search = typeof window !== "undefined" ? window.location.search : "";
  const showSuccess = useMemo(() => new URLSearchParams(search).get("success") === "true", [search]);
  const showCanceled = useMemo(() => new URLSearchParams(search).get("canceled") === "true", [search]);

  if (!activeOrgId) return <div className="p-8">{t("common.loading")}</div>;
  if (!billing) return <div className="p-8">{t("common.loading")}</div>;

  const currentPlanId = normalizePlanId(billing.plan);
  const currentPlan = PRICING_PLANS[currentPlanId];
  const activeOrgLanguage = normalizeSupportedLanguage(
    organizations?.find((org) => org._id === activeOrgId)?.language
  );

  const usageRows = [
    {
      key: "departments",
      label: t("billing.departments"),
      current: billing.usage.departments,
      limit: currentPlan.limits.departments,
    },
    {
      key: "agentsPeakPerDept",
      label: t("billing.agentsPeak"),
      current: billing.usage.agentsPeakPerDept,
      limit: currentPlan.limits.agentsPerDepartment,
    },
    {
      key: "docs",
      label: t("billing.knowledgeDocs"),
      current: billing.usage.docs,
      limit: currentPlan.limits.knowledgeDocs,
    },
  ] as const;

  const reachedLimits = usageRows.filter(
    (row) => Number.isFinite(row.limit) && row.current >= row.limit
  );

  async function handleUpgrade(planId: PaidPlanId) {
    if (!activeOrgId) return;
    try {
      setLoadingPlan(planId);
      const result = await pay({
        orgId: activeOrgId,
        planId,
        // TODO: send billingCycle to checkout once backend supports monthly/annual price IDs.
      });
      window.location.href = result.url;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to start checkout.";
      window.alert(message);
    } finally {
      setLoadingPlan(null);
    }
  }

  async function handleLanguageChange(nextLanguage: SupportedLanguage) {
    if (!activeOrgId || isSavingLanguage) return;
    try {
      setIsSavingLanguage(true);
      await updateOrganizationLanguage({
        orgId: activeOrgId,
        language: nextLanguage,
      });
      void i18n.changeLanguage(nextLanguage);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update language.";
      window.alert(message);
    } finally {
      setIsSavingLanguage(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-6 md:p-8 space-y-8">
      <section className="rounded-2xl border border-border-subtle bg-white/70 p-5 space-y-4">
        <div className="space-y-1">
          <div className="text-sm font-bold uppercase tracking-wider">{t("language.label")}</div>
          <p className="text-xs text-text-secondary">{t("language.description")}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={activeOrgLanguage}
            onChange={(event) => {
              const nextLanguage = normalizeSupportedLanguage(event.target.value);
              void handleLanguageChange(nextLanguage);
            }}
            disabled={isSavingLanguage}
            className="rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 ring-blue-500 disabled:opacity-60"
          >
            <option value="pt">{t("language.portuguese")}</option>
            <option value="en">{t("language.english")}</option>
            <option value="es">{t("language.spanish")}</option>
          </select>
          {isSavingLanguage ? (
            <span className="text-xs text-text-secondary">{t("language.saving")}</span>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-border-subtle bg-white/70 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold uppercase tracking-wider">{t("billing.currentUsage")}</div>
          <div className="text-xs font-mono opacity-70">
            {t("billing.plan")}: <span className="font-bold uppercase">{currentPlanId}</span>
          </div>
        </div>

        <div className="grid gap-4">
          {usageRows.map((row) => (
            <ProgressRow
              key={row.key}
              label={row.label}
              current={row.current}
              limit={row.limit}
            />
          ))}
        </div>

        {reachedLimits.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t("billing.limitReached", {
              plan: currentPlan.name,
              labels: reachedLimits.map((row) => row.label).join(", "),
            })}
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-border-subtle/70 bg-white px-4 py-8 md:px-8 md:py-10">
        <div className="space-y-7">
          <header className="mx-auto max-w-3xl space-y-3 text-center">
            <h1 className="text-3xl font-black tracking-tight md:text-5xl">{t("billing.pricingTitle")}</h1>
            <p className="mx-auto max-w-xl text-sm text-text-secondary md:text-base">
              {t("billing.pricingSubtitle")}
            </p>
          </header>

          <div className="flex justify-center">
            <div className="inline-flex rounded-full bg-black/8 p-1">
              <button
                type="button"
                onClick={() => {
                  setBillingCycle("annual");
                }}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${billingCycle === "annual"
                  ? "bg-white text-black shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
                  }`}
              >
                {t("billing.yearly")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setBillingCycle("monthly");
                }}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${billingCycle === "monthly"
                  ? "bg-white text-black shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
                  }`}
              >
                {t("billing.monthly")}
              </button>
            </div>
          </div>

          {showSuccess ? (
              <div className="mx-auto max-w-4xl rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {t("billing.subscriptionSuccess")}
              </div>
          ) : null}
          {showCanceled ? (
            <div className="mx-auto max-w-4xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {t("billing.checkoutCanceled")}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
            {PLAN_ORDER.map((planId) => {
              const plan = PRICING_PLANS[planId];
              const isCurrent = currentPlanId === plan.id;
              let upgradePlanId: PaidPlanId | null = null;
              if (isPaidPlanId(plan.id)) {
                upgradePlanId = plan.id;
              }
              const isLoading = upgradePlanId !== null && loadingPlan === upgradePlanId;
              const features = getPlanFeatures(plan);
              const pricing = formatPlanPrice(plan, billingCycle);
              const isFeatured = plan.id === "pro";
              const amount =
                plan.id === "starter"
                  ? pricing.primary
                  : `$${billingCycle === "annual" ? plan.prices.annual : plan.prices.monthly}`;
              const cadenceLabel = plan.id === "starter" ? null : t("billing.perMonth");
              const billingHint =
                plan.id === "starter"
                  ? t("billing.alwaysFree")
                  : billingCycle === "annual"
                    ? t("billing.billedYearly")
                    : t("billing.billedMonthly");

              return (
                <article
                  key={plan.id}
                  className={`flex h-full min-h-[540px] flex-col rounded-3xl border p-5 md:p-6 ${isFeatured
                    ? "border-black bg-black text-white shadow-xl"
                    : "border-black/8 bg-[#f4f4f4] text-text-primary"
                    }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <h3 className="text-3xl font-black tracking-tight">{plan.name}</h3>
                      <p className={`text-base ${isFeatured ? "text-white/75" : "text-text-secondary"}`}>
                        {t(`billing.planDescriptions.${plan.id}`, { defaultValue: plan.description })}
                      </p>
                    </div>

                    <div className="flex flex-nowrap items-center gap-2">
                      {isFeatured ? (
                        <span className="whitespace-nowrap rounded-full bg-blue-600/90 px-3 py-1 text-xs font-bold text-white">
                          {t("billing.bestChoice")}
                        </span>
                      ) : null}
                      {plan.badge ? (
                        <span className="whitespace-nowrap rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-bold uppercase text-emerald-700">
                          {plan.badge}
                        </span>
                      ) : null}
                      {plan.id === "business" ? (
                        <span className="whitespace-nowrap rounded-full bg-slate-200 px-3 py-1 text-[11px] font-bold uppercase text-slate-700">
                          {t("billing.teamScale")}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <ul className="mt-6 flex-1 space-y-2.5">
                    {features.map((feature) => (
                      <li key={feature} className={`flex items-start gap-2.5 text-sm ${isFeatured ? "text-white/90" : "text-text-primary"}`}>
                        <CheckIcon featured={isFeatured} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6 space-y-4">
                    <div className="flex items-end justify-between gap-3">
                      <div className="flex items-end gap-2">
                        <span className="text-4xl font-black leading-none">{amount}</span>
                        {cadenceLabel ? (
                          <span className={`mb-1 text-xs ${isFeatured ? "text-white/70" : "text-text-secondary"}`}>
                            {cadenceLabel}
                          </span>
                        ) : null}
                      </div>
                      <span className={`text-xs font-medium ${isFeatured ? "text-white/75" : "text-text-secondary"}`}>
                        {billingHint}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={isCurrent || upgradePlanId === null || isLoading}
                      onClick={upgradePlanId ? () => { void handleUpgrade(upgradePlanId); } : undefined}
                      className={`w-full rounded-full px-5 py-3 text-base font-bold transition ${isCurrent || upgradePlanId === null
                        ? isFeatured
                          ? "bg-white/10 text-white/60"
                          : "bg-black/10 text-text-secondary"
                        : isFeatured
                          ? "bg-white text-black hover:bg-white/90"
                          : "bg-black text-white hover:bg-black/90"
                        }`}
                    >
                      {isCurrent
                        ? t("billing.currentPlan")
                        : isLoading
                          ? t("billing.redirecting")
                          : upgradePlanId
                            ? t("billing.upgradeTo", { plan: plan.name })
                            : t("billing.included")}
                    </button>

                    <p className={`text-center text-xs ${isFeatured ? "text-white/65" : "text-text-secondary"}`}>
                      {isCurrent
                        ? t("billing.activeSubscription")
                        : billingCycle === "annual"
                          ? t("billing.saveWithYearly")
                          : t("billing.switchToYearly")}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Billing;
