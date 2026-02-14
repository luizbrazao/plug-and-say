import { v } from "convex/values";
import { action, httpAction, internalMutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { PLANS } from "./plans";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";

type PaidPlanId = "pro" | "business";

function getStripeSecretKey() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("Missing STRIPE_SECRET_KEY environment variable.");
  return secretKey;
}

function getAppBaseUrl() {
  return (
    process.env.APP_ORIGIN ||
    process.env.FRONTEND_URL ||
    process.env.SITE_URL ||
    "http://localhost:5173"
  );
}

function getPriceIdForPlan(planId: PaidPlanId) {
  const priceByPlan: Record<PaidPlanId, string | undefined> = {
    pro: process.env.STRIPE_PRICE_PRO,
    business: process.env.STRIPE_PRICE_BUSINESS,
  };
  const priceId = priceByPlan[planId];
  if (!priceId) {
    throw new Error(`Missing Stripe price id for plan "${planId}". Set STRIPE_PRICE_${planId.toUpperCase()}.`);
  }
  return priceId;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toHex(new Uint8Array(signature));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function createCheckoutSession(params: {
  planId: PaidPlanId;
  orgId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("line_items[0][price]", getPriceIdForPlan(params.planId));
  body.set("line_items[0][quantity]", "1");
  body.set("success_url", params.successUrl);
  body.set("cancel_url", params.cancelUrl);
  body.set("metadata[orgId]", params.orgId);
  body.set("metadata[planId]", params.planId);
  body.set("client_reference_id", params.orgId);
  body.set("allow_promotion_codes", "true");

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2025-01-27.acacia",
    },
    body: body.toString(),
  });

  const data = (await response.json()) as any;
  if (!response.ok) {
    const message = data?.error?.message || "Stripe checkout session creation failed.";
    throw new Error(message);
  }

  if (!data?.url) throw new Error("Stripe checkout URL was not generated.");
  return { url: data.url as string };
}

export const pay = action({
  args: {
    orgId: v.id("organizations"),
    planId: v.union(v.literal("pro"), v.literal("business")),
  },
  handler: async (ctx, args): Promise<{ url: string }> => {
    const organizations: Array<{ _id: Id<"organizations">; role: string }> = await ctx.runQuery(
      api.organizations.listForUser,
      {}
    );
    const org = organizations.find((row) => row._id === args.orgId);
    if (!org) throw new Error("Access denied: organization not found for current user.");
    if (org.role !== "owner" && org.role !== "admin") {
      throw new Error("Only owner/admin can manage billing.");
    }

    const baseUrl = getAppBaseUrl();
    return await createCheckoutSession({
      orgId: args.orgId,
      planId: args.planId,
      successUrl: `${baseUrl}/settings?success=true`,
      cancelUrl: `${baseUrl}/settings?canceled=true`,
    });
  },
});

export const billingOverview = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const membership = await ctx.db
      .query("orgMemberships")
      .withIndex("by_userId_orgId", (q) => q.eq("userId", userId).eq("orgId", args.orgId))
      .unique();
    if (!membership) throw new Error("Access denied: not a member of this organization.");

    const org = await ctx.db.get(args.orgId);
    if (!org) throw new Error("Organization not found.");

    const currentPlan = org.plan === "pro" || org.plan === "business" ? org.plan : "starter";
    const planLimits = PLANS[currentPlan];

    const departments = await ctx.db
      .query("departments")
      .withIndex("by_orgId", (q) => q.eq("orgId", args.orgId))
      .collect();

    let agentsTotal = 0;
    let agentsPeakPerDept = 0;
    for (const dept of departments) {
      const agents = await ctx.db
        .query("agents")
        .withIndex("by_departmentId", (q) => q.eq("departmentId", dept._id))
        .collect();
      agentsTotal += agents.length;
      if (agents.length > agentsPeakPerDept) agentsPeakPerDept = agents.length;
    }

    const docs = await ctx.db
      .query("knowledgeBase")
      .withIndex("by_orgId", (q) => q.eq("orgId", args.orgId))
      .collect();

    return {
      orgId: args.orgId,
      plan: currentPlan,
      subscriptionStatus: org.subscriptionStatus ?? "inactive",
      usage: {
        departments: departments.length,
        agents: agentsTotal,
        agentsPeakPerDept,
        docs: docs.length,
      },
      limits: {
        departments: planLimits.maxDepts,
        agentsPerDepartment: planLimits.maxAgentsPerDept,
        docs: planLimits.maxDocs,
      },
    };
  },
});

export const applyCheckoutCompleted = internalMutation({
  args: {
    orgId: v.id("organizations"),
    planId: v.union(v.literal("pro"), v.literal("business")),
    subscriptionStatus: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.orgId);
    if (!org) throw new Error("Organization not found.");

    await ctx.db.patch(args.orgId, {
      plan: args.planId,
      subscriptionStatus: args.subscriptionStatus ?? "active",
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
    });

    return { ok: true };
  },
});

export const webhook = httpAction(async (ctx, request) => {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return new Response("Missing STRIPE_WEBHOOK_SECRET", { status: 500 });

  const signatureHeader = request.headers.get("stripe-signature");
  if (!signatureHeader) return new Response("Missing stripe-signature", { status: 400 });

  const payload = await request.text();

  const pairs = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = pairs.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = pairs.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));

  if (!timestamp || signatures.length === 0) {
    return new Response("Invalid stripe-signature header", { status: 400 });
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expected = await hmacSha256Hex(webhookSecret, signedPayload);
  const valid = signatures.some((candidate) => timingSafeEqual(candidate, expected));
  if (!valid) {
    return new Response("Webhook signature verification failed", { status: 400 });
  }

  const event = JSON.parse(payload) as any;
  if (event.type === "checkout.session.completed") {
    const session = event.data?.object ?? {};
    const orgId = session?.metadata?.orgId as Id<"organizations"> | undefined;
    const planId = session?.metadata?.planId as PaidPlanId | undefined;
    if (!orgId || !planId) {
      return new Response("Missing metadata orgId/planId", { status: 400 });
    }

    await ctx.runMutation((internal as any).stripe.applyCheckoutCompleted, {
      orgId,
      planId,
      subscriptionStatus: "active",
      stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
      stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
    });
  }

  return new Response("ok", { status: 200 });
});

