export type BillingCycle = "monthly" | "annual";

export type PlanId = "starter" | "pro" | "business";
export type PaidPlanId = Exclude<PlanId, "starter">;

export interface PlanPrices {
  monthly: number | null;
  annual: number | null;
  currency: "USD";
}

export interface PlanLimits {
  organizations: number;
  departments: number;
  agentsPerDepartment: number;
  knowledgeDocs: number;
  customAgents: number;
  teamInvites: number;
}

export interface PlanFlags {
  teamInvitesAllowed: boolean;
  allIntegrations: boolean;
  telegramConnectionAllowed: boolean;
}

export interface Plan {
  id: PlanId;
  name: string;
  description: string;
  badge?: string;
  highlightLabel?: string;
  prices: PlanPrices;
  limits: PlanLimits;
  flags: PlanFlags;
}

const UNLIMITED = Number.POSITIVE_INFINITY;

export const PRICING_PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    description: "For solo builders getting started.",
    badge: "Free",
    prices: {
      monthly: null,
      annual: null,
      currency: "USD",
    },
    limits: {
      organizations: 1,
      departments: 1,
      agentsPerDepartment: 3,
      knowledgeDocs: 5,
      customAgents: 0,
      teamInvites: 0,
    },
    flags: {
      teamInvitesAllowed: false,
      allIntegrations: true,
      telegramConnectionAllowed: true,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "For advanced individual teams.",
    prices: {
      monthly: 18,
      annual: 15,
      currency: "USD",
    },
    limits: {
      organizations: 3,
      departments: 5,
      agentsPerDepartment: 10,
      knowledgeDocs: 50,
      customAgents: 10,
      teamInvites: 0,
    },
    flags: {
      teamInvitesAllowed: false,
      allIntegrations: true,
      telegramConnectionAllowed: true,
    },
  },
  business: {
    id: "business",
    name: "Business",
    description: "For team collaboration at scale.",
    highlightLabel: "Best for teams",
    prices: {
      monthly: 99,
      annual: 85,
      currency: "USD",
    },
    limits: {
      organizations: UNLIMITED,
      departments: UNLIMITED,
      agentsPerDepartment: UNLIMITED,
      knowledgeDocs: 100,
      customAgents: UNLIMITED,
      teamInvites: UNLIMITED,
    },
    flags: {
      teamInvitesAllowed: true,
      allIntegrations: true,
      telegramConnectionAllowed: true,
    },
  },
};

export const PLAN_ORDER: readonly PlanId[] = ["starter", "pro", "business"];

export function normalizePlanId(plan: string | null | undefined): PlanId {
  if (plan === "pro" || plan === "business" || plan === "starter") return plan;
  return "starter";
}

export function isPaidPlanId(planId: PlanId): planId is PaidPlanId {
  return planId === "pro" || planId === "business";
}

export function formatLimitValue(limit: number): string {
  return Number.isFinite(limit) ? String(limit) : "Unlimited";
}

function formatBoundedFeature(limit: number, singular: string, plural: string): string {
  if (Number.isFinite(limit)) {
    return `Up to ${limit} ${limit === 1 ? singular : plural}`;
  }
  return `Unlimited ${plural}`;
}

export function getPlanFeatures(plan: Plan): string[] {
  const lines: string[] = [
    formatBoundedFeature(plan.limits.organizations, "organization", "organizations"),
    formatBoundedFeature(plan.limits.departments, "department", "departments"),
    formatBoundedFeature(plan.limits.agentsPerDepartment, "agent per department", "agents per department"),
    formatBoundedFeature(plan.limits.knowledgeDocs, "knowledge base document", "knowledge base documents"),
    plan.id === "starter" ? "All integrations" : "All integrations",
  ];

  if (plan.flags.teamInvitesAllowed) {
    lines.push("Unlimited team invites");
  }

  if (plan.id === "starter" && plan.flags.telegramConnectionAllowed) {
    lines.push("Telegram connection included");
  }

  if (plan.id === "pro" && plan.limits.customAgents > 0) {
    lines.push(formatBoundedFeature(plan.limits.customAgents, "custom agent", "custom agents"));
  }

  return lines;
}

export function formatPlanPrice(
  plan: Plan,
  cycle: BillingCycle
): { primary: string; secondary: string | null } {
  if (plan.id === "starter") {
    return { primary: "Free", secondary: null };
  }

  const amount = cycle === "annual" ? plan.prices.annual : plan.prices.monthly;
  const primary = amount === null ? "Contact sales" : `$${amount}/mo`;
  const secondary = cycle === "annual" ? "billed annually" : null;
  return { primary, secondary };
}
