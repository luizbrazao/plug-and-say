import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const PLANS = {
  starter: {
    maxDepts: 1,
    maxAgentsPerDept: 3,
    maxDocs: 5,
    allowedIntegrations: ["telegram", "openai", "anthropic", "tavily", "resend", "gmail"] as const,
    allowTeamInvites: false,
  },
  pro: {
    maxDepts: 5,
    maxAgentsPerDept: 10,
    maxDocs: 50,
    allowedIntegrations: "ALL" as const,
    allowTeamInvites: false,
  },
  business: {
    maxDepts: 999,
    maxAgentsPerDept: 999,
    maxDocs: 999,
    allowedIntegrations: "ALL" as const,
    allowTeamInvites: true,
  },
} as const;

type Ctx = MutationCtx | QueryCtx;
type PlanName = keyof typeof PLANS;
type LimitResource = "departments" | "agents_per_department" | "docs" | "team_invites";
export type PlanIntegrationType =
  | "telegram"
  | "openai"
  | "anthropic"
  | "gmail"
  | "tavily"
  | "resend"
  | "github"
  | "notion"
  | "twitter"
  | "dalle";

function normalizePlan(plan: string | undefined): PlanName {
  if (plan === "pro" || plan === "business" || plan === "starter") return plan;
  return "starter";
}

function featureLabel(type: PlanIntegrationType): string {
  switch (type) {
    case "github":
      return "GitHub";
    case "notion":
      return "Notion";
    case "dalle":
      return "DALL-E";
    case "gmail":
      return "Gmail";
    case "twitter":
      return "Twitter";
    case "telegram":
      return "Telegram";
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
    case "tavily":
      return "Tavily";
    case "resend":
      return "Resend";
    default:
      return "This integration";
  }
}

export async function checkLimit(
  ctx: Ctx,
  orgId: Id<"organizations">,
  resourceType: LimitResource,
  options?: {
    departmentId?: Id<"departments">;
    integrationType?: PlanIntegrationType;
  }
): Promise<void> {
  const org = await ctx.db.get(orgId);
  if (!org) throw new Error("Organization not found.");

  const planName = normalizePlan(org.plan);
  const plan = PLANS[planName];

  if (resourceType === "departments") {
    const count = await ctx.db
      .query("departments")
      .withIndex("by_orgId", (q) => q.eq("orgId", orgId))
      .collect();
    if (count.length >= plan.maxDepts) {
      throw new Error("Upgrade to Pro to create more departments.");
    }
    return;
  }

  if (resourceType === "agents_per_department") {
    const departmentId = options?.departmentId;
    if (!departmentId) throw new Error("Department is required to enforce agent limits.");
    const count = await ctx.db
      .query("agents")
      .withIndex("by_departmentId", (q) => q.eq("departmentId", departmentId))
      .collect();
    if (count.length >= plan.maxAgentsPerDept) {
      throw new Error("Upgrade to Pro to hire more agents in this department.");
    }
    return;
  }

  if (resourceType === "docs") {
    const count = await ctx.db
      .query("knowledgeBase")
      .withIndex("by_orgId", (q) => q.eq("orgId", orgId))
      .collect();
    if (count.length >= plan.maxDocs) {
      throw new Error("Upgrade to Pro to add more knowledge base documents.");
    }
    return;
  }

  if (resourceType === "team_invites") {
    if (!plan.allowTeamInvites) {
      throw new Error("Team collaboration is a Business feature.");
    }
    return;
  }
}

export async function assertIntegrationAllowed(
  ctx: Ctx,
  orgId: Id<"organizations">,
  integrationType: PlanIntegrationType
): Promise<void> {
  const org = await ctx.db.get(orgId);
  if (!org) throw new Error("Organization not found.");

  const planName = normalizePlan(org.plan);
  const plan = PLANS[planName];
  if (plan.allowedIntegrations === "ALL") return;
  const allowed = plan.allowedIntegrations as readonly string[];
  if (!allowed.includes(integrationType)) {
    throw new Error(`${featureLabel(integrationType)} is a Pro feature.`);
  }
}
