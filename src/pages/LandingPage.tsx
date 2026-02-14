import { motion } from "framer-motion";
import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  MessageCircle,
  Quote,
  Sparkles,
  Workflow,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "../lib/router";
import { ServiceLogo } from "../components/integrations/ServiceLogo";
import { LandingNavbar } from "../components/landing/LandingNavbar";
import { HeroAgents } from "../components/landing/HeroAgents";
import { LandingFooter } from "../components/landing/LandingFooter";
import {
  PLAN_ORDER,
  PRICING_PLANS,
  formatPlanPrice,
  getPlanFeatures,
  type BillingCycle,
} from "../lib/billingPlans";

const TRUSTED_BY = ["openai", "anthropic", "tavily", "resend", "github", "notion"] as const;
const INTEGRATIONS = [
  "github",
  "notion",
  "gmail",
  "twitter",
  "openai",
  "anthropic",
  "tavily",
  "resend",
  "github",
  "notion",
  "openai",
  "resend",
] as const;

const fadeUp = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { duration: 0.55, ease: "easeOut" as const },
};

function PricingCheckIcon({ featured }: { featured: boolean }) {
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

function SectionHeading({
  eyebrow,
  title,
  subtitle,
  light = false,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  light?: boolean;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow ? (
        <div
          className={`mb-4 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] ${light
            ? "border border-white/20 bg-white/10 text-[#d4ff3f]"
            : "border border-[#d9d4c9] bg-white text-[#244442]"
            }`}
        >
          {eyebrow}
        </div>
      ) : null}
      <h2
        className={`font-display text-4xl font-semibold leading-tight md:text-5xl ${light ? "text-[#f7f4f0]" : "text-[#062427]"
          }`}
      >
        {title}
      </h2>
      {subtitle ? (
        <p
          className={`mx-auto mt-4 max-w-2xl text-base leading-relaxed md:text-lg ${light ? "text-[#b8cbc9]" : "text-[#4f6462]"
            }`}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

export function LandingPage() {
  const { t } = useTranslation();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("annual");

  return (
    <div className="min-h-screen bg-[#f7f4f0] text-[#062427]">
      <LandingNavbar />

      <main className="overflow-x-clip">
        <section className="relative isolate">
          <div
            className="absolute inset-0 -z-10 opacity-60"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(6,36,39,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(6,36,39,0.08) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage:
                "radial-gradient(circle at center, black 50%, transparent 100%)",
            }}
          />

          <div className="relative mx-auto w-full max-w-6xl px-4 pb-16 pt-20 md:px-6 md:pb-24 md:pt-24">
            <HeroAgents />
            <motion.div {...fadeUp} className="relative z-20 mx-auto max-w-4xl text-center">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#d9d4c9] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#244442]">
                <Sparkles size={14} />
                {t("landing.hero.badge")}
              </div>
              <h1 className="font-display text-5xl font-semibold leading-tight tracking-tight text-[#062427] md:text-7xl">
                {t("landing.hero.titleStart")}{" "}
                <span className="underline decoration-[#d4ff3f] decoration-[5px] underline-offset-6">
                  {t("landing.hero.titleHighlight")}
                </span>
                .
              </h1>
              <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-[#4f6462] md:text-xl">
                {t("landing.hero.subtitle")}
              </p>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#062427] px-6 py-3 text-sm font-semibold text-[#f7f4f0] transition-all hover:-translate-y-0.5 hover:shadow-lg"
                >
                  {t("landing.hero.primaryCta")}
                  <ArrowRight size={16} />
                </Link>

              </div>
            </motion.div>
          </div>
        </section>

        <motion.section
          {...fadeUp}
          className="mx-auto w-full max-w-6xl px-4 pb-16 md:px-6 md:pb-24"
        >
          <p className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[#5c7472]">
            {t("landing.trustedBy")}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {TRUSTED_BY.map((service) => (
              <div
                key={service}
                className="flex items-center justify-center rounded-2xl border border-[#d9d4c9] bg-white/75 py-4 grayscale transition-all hover:-translate-y-0.5 hover:grayscale-0"
              >
                <ServiceLogo service={service} className="h-12 w-12 border-none shadow-none" />
              </div>
            ))}
          </div>
        </motion.section>

        <section id="features" className="mx-auto w-full max-w-6xl px-4 pb-16 md:px-6 md:pb-24">
          <motion.div {...fadeUp}>
            <SectionHeading
              eyebrow={t("landing.features.eyebrow")}
              title={t("landing.features.title")}
            />
          </motion.div>

          <div className="mt-10 grid gap-4 md:gap-5 lg:grid-cols-2">
            <motion.article
              {...fadeUp}
              className="rounded-3xl border border-[#d9d4c9] bg-white p-6 md:p-8 lg:col-span-2"
            >
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-5">
                  <h3 className="font-display text-3xl font-semibold text-[#062427]">
                    {t("landing.features.dashboard.title")}
                  </h3>
                  <p className="max-w-md text-base leading-relaxed text-[#4f6462]">
                    {t("landing.features.dashboard.copy")}
                  </p>
                  <a
                    href="#integrations"
                    className="inline-flex items-center gap-2 rounded-xl bg-[#062427] px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    {t("landing.features.dashboard.cta")}
                    <ArrowRight size={14} />
                  </a>
                </div>

                <div className="rounded-2xl border border-[#d9d4c9] bg-[#f6f2ea] p-4">
                  <div className="mb-3 flex items-center justify-between text-xs font-semibold text-[#3e5856]">
                    <span>{t("landing.features.dashboard.mockTitle")}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1">
                      <CheckCircle2 size={12} />
                      {t("landing.features.dashboard.mockLive")}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {["inbox", "progress", "done"].map((column) => (
                      <div key={column} className="space-y-2 rounded-xl bg-white p-2.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#617977]">
                          {t(`landing.features.dashboard.${column}`)}
                        </div>
                        <div className="space-y-1.5">
                          {Array.from({ length: column === "progress" ? 3 : 2 }).map((_, idx) => (
                            <div
                              key={`${column}-${idx}`}
                              className={`h-6 rounded-md ${column === "done"
                                ? "bg-[#d4ff3f]/55"
                                : column === "progress"
                                  ? "bg-[#062427]/15"
                                  : "bg-[#ece8df]"
                                }`}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.article>

            <motion.article
              {...fadeUp}
              className="rounded-3xl border border-[#d9d4c9] bg-white p-6"
            >
              <div className="mb-4 inline-flex rounded-xl bg-[#dff38f] p-2 text-[#062427]">
                <MessageCircle size={18} />
              </div>
              <h3 className="font-display text-2xl font-semibold">
                {t("landing.features.telegram.title")}
              </h3>
              <p className="mt-3 text-base leading-relaxed text-[#4f6462]">
                {t("landing.features.telegram.copy")}
              </p>
            </motion.article>

            <motion.article
              {...fadeUp}
              className="rounded-3xl border border-[#d9d4c9] bg-white p-6"
            >
              <div className="mb-4 inline-flex rounded-xl bg-[#dff38f] p-2 text-[#062427]">
                <Workflow size={18} />
              </div>
              <h3 className="font-display text-2xl font-semibold">
                {t("landing.features.maestro.title")}
              </h3>
              <p className="mt-3 text-base leading-relaxed text-[#4f6462]">
                {t("landing.features.maestro.copy")}
              </p>
            </motion.article>
          </div>
        </section>

        <section id="integrations" className="bg-[#062427] py-16 md:py-24">
          <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
            <motion.div {...fadeUp}>
              <SectionHeading
                eyebrow={t("landing.integrations.eyebrow")}
                title={t("landing.integrations.title")}
                subtitle={t("landing.integrations.copy")}
                light
              />
            </motion.div>
            <motion.div
              {...fadeUp}
              className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur"
            >
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {INTEGRATIONS.map((service, idx) => (
                  <div
                    key={`${service}-${idx}`}
                    className="flex items-center justify-center rounded-2xl bg-white p-3"
                  >
                    <ServiceLogo service={service} className="h-12 w-12 border-none shadow-none" />
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-4xl px-4 py-16 text-center md:px-6 md:py-24">
          <motion.div {...fadeUp}>
            <Quote className="mx-auto mb-5 text-[#5e7c2a]" size={30} />
            <blockquote className="font-display text-3xl leading-tight text-[#062427] md:text-4xl">
              “{t("landing.testimonial.quote")}”
            </blockquote>
            <p className="mt-7 text-sm font-semibold uppercase tracking-[0.15em] text-[#4f6462]">
              {t("landing.testimonial.author")}
            </p>
            <p className="text-sm text-[#607775]">{t("landing.testimonial.role")}</p>
          </motion.div>
        </section>

        <section id="stats" className="mx-auto w-full max-w-6xl px-4 pb-16 md:px-6 md:pb-24">
          <motion.div
            {...fadeUp}
            className="grid gap-4 rounded-3xl border border-[#d9d4c9] bg-white p-5 md:grid-cols-3 md:p-7"
          >
            {["founded", "tasks", "squads"].map((item) => (
              <div key={item} className="rounded-2xl bg-[#f6f2ea] p-5 text-center">
                <div className="font-display text-4xl font-semibold text-[#062427]">
                  {t(`landing.stats.${item}.value`)}
                </div>
                <div className="mt-2 text-sm font-medium text-[#4f6462]">
                  {t(`landing.stats.${item}.label`)}
                </div>
              </div>
            ))}
          </motion.div>
        </section>

        <section id="pricing" className="mx-auto w-full max-w-6xl px-4 pb-16 md:px-6 md:pb-24">
          <motion.div
            {...fadeUp}
            className="rounded-3xl border border-[#d9d4c9]/90 bg-white px-4 py-8 md:px-8 md:py-10"
          >
            <div className="space-y-7">
              <header className="mx-auto max-w-3xl space-y-3 text-center">
                <h2 className="font-display text-4xl font-semibold tracking-tight text-[#062427] md:text-5xl">
                  {t("billing.pricingTitle")}
                </h2>
                <p className="mx-auto max-w-xl text-sm text-[#4f6462] md:text-base">
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
                      : "text-[#627775] hover:text-[#062427]"
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
                      : "text-[#627775] hover:text-[#062427]"
                      }`}
                  >
                    {t("billing.monthly")}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
                {PLAN_ORDER.map((planId) => {
                  const plan = PRICING_PLANS[planId];
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
                        : "border-black/8 bg-[#f4f4f4] text-[#062427]"
                        }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1.5">
                          <h3 className="text-3xl font-black tracking-tight">{plan.name}</h3>
                          <p className={`text-base ${isFeatured ? "text-white/75" : "text-[#4f6462]"}`}>
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
                          <li key={feature} className={`flex items-start gap-2.5 text-sm ${isFeatured ? "text-white/90" : "text-[#062427]"}`}>
                            <PricingCheckIcon featured={isFeatured} />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-6 space-y-4">
                        <div className="flex items-end justify-between gap-3">
                          <div className="flex items-end gap-2">
                            <span className="text-4xl font-black leading-none">{amount}</span>
                            {cadenceLabel ? (
                              <span className={`mb-1 text-xs ${isFeatured ? "text-white/70" : "text-[#627775]"}`}>
                                {cadenceLabel}
                              </span>
                            ) : null}
                          </div>
                          <span className={`text-xs font-medium ${isFeatured ? "text-white/75" : "text-[#627775]"}`}>
                            {billingHint}
                          </span>
                        </div>

                        <Link
                          href="/signup"
                          className={`block w-full rounded-full px-5 py-3 text-center text-base font-bold transition ${isFeatured
                            ? "bg-white text-black hover:bg-white/90"
                            : "bg-black text-white hover:bg-black/90"
                            }`}
                        >
                          {plan.id === "starter" ? t("landing.nav.buildSquad") : t("billing.upgradeTo", { plan: plan.name })}
                        </Link>

                        <p className={`text-center text-xs ${isFeatured ? "text-white/65" : "text-[#627775]"}`}>
                          {billingCycle === "annual"
                            ? t("billing.saveWithYearly")
                            : t("billing.switchToYearly")}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-16 md:px-6 md:pb-24">
          <motion.div
            {...fadeUp}
            className="rounded-3xl bg-[#d4ff3f] p-8 md:p-10 lg:flex lg:items-center lg:justify-between"
          >
            <h3 className="font-display max-w-2xl text-4xl font-semibold leading-tight text-[#062427] md:text-5xl">
              {t("landing.finalCta.title")}
            </h3>
            <div className="mt-6 flex flex-wrap gap-3 lg:mt-0">
              <Link
                href="/signup"
                className="inline-flex items-center rounded-xl bg-[#062427] px-5 py-3 text-sm font-semibold text-white"
              >
                {t("landing.finalCta.primary")}
              </Link>

            </div>
          </motion.div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
