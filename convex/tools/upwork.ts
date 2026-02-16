import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const UPWORK_TOKEN_URL = "https://www.upwork.com/api/v3/oauth2/token";
const UPWORK_GRAPHQL_URL = "https://api.upwork.com/graphql";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

type UpworkIntegrationConfig = {
    clientId?: string;
    clientSecret?: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: number;
};

type MoneyShape = {
    rawValue?: string | number | null;
    currency?: string | null;
    displayValue?: string | null;
} | null | undefined;

function asNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseLimit(limit: unknown): number {
    if (typeof limit !== "number" || !Number.isFinite(limit)) return DEFAULT_LIMIT;
    return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit)));
}

function decodeJsonSafely(raw: string): any {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function formatMoney(money: MoneyShape): string | null {
    if (!money || typeof money !== "object") return null;
    const displayValue = asNonEmptyString((money as any).displayValue);
    if (displayValue) return displayValue;
    const rawValue = asNonEmptyString((money as any).rawValue) ?? String((money as any).rawValue ?? "");
    const currency = asNonEmptyString((money as any).currency);
    if (!rawValue) return null;
    return currency ? `${rawValue} ${currency}` : rawValue;
}

function buildJobUrl(ciphertext: unknown): string | null {
    const token = asNonEmptyString(ciphertext);
    if (!token) return null;
    return `https://www.upwork.com/jobs/~${token}`;
}

async function resolveOrgIdFromDepartment(
    ctx: any,
    departmentId: Id<"departments">
): Promise<Id<"organizations">> {
    const department = await ctx.runQuery(api.departments.get, { departmentId });
    if (!department) throw new Error("Department not found.");
    if (!department.orgId) throw new Error("Department has no organization linked.");
    return department.orgId;
}

async function getUpworkIntegration(
    ctx: any,
    departmentId: Id<"departments">
): Promise<{ orgId: Id<"organizations">; integration: any; config: UpworkIntegrationConfig }> {
    const orgId = await resolveOrgIdFromDepartment(ctx, departmentId);
    const integration: any = await ctx.runQuery(internal.integrations.getByType, {
        orgId,
        type: "upwork",
    });
    if (!integration) {
        throw new Error("Upwork integration not configured for this organization.");
    }
    const config = (integration?.config ?? {}) as UpworkIntegrationConfig;
    return { orgId, integration, config };
}

async function markOauthError(
    ctx: any,
    departmentId: Id<"departments">,
    message: string
) {
    try {
        const orgId = await resolveOrgIdFromDepartment(ctx, departmentId);
        await ctx.runMutation(internal.integrations.patchConfigForOrg, {
            orgId,
            type: "upwork",
            patch: {},
            oauthStatus: "error",
            lastError: message,
        });
    } catch {
        // Keep the original tool error.
    }
}

async function refreshAccessToken(
    ctx: any,
    departmentId: Id<"departments">,
    config: UpworkIntegrationConfig
): Promise<string> {
    const clientId = asNonEmptyString(config.clientId);
    const clientSecret = asNonEmptyString(config.clientSecret);
    const refreshToken = asNonEmptyString(config.refreshToken);
    if (!clientId || !clientSecret) {
        const message = "Upwork integration missing clientId/clientSecret.";
        await markOauthError(ctx, departmentId, message);
        throw new Error(message);
    }
    if (!refreshToken) {
        const message = "Upwork integration missing refresh token. Reconnect Upwork.";
        await markOauthError(ctx, departmentId, message);
        throw new Error(message);
    }

    const basicAuth = btoa(`${clientId}:${clientSecret}`);
    const tokenRes = await fetch(UPWORK_TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
        }),
    });
    const tokenText = await tokenRes.text();
    const tokenJson = decodeJsonSafely(tokenText);
    const accessToken = asNonEmptyString(tokenJson?.access_token);
    const newRefreshToken = asNonEmptyString(tokenJson?.refresh_token);
    const expiresIn = asOptionalNumber(tokenJson?.expires_in);

    if (!tokenRes.ok || !accessToken) {
        const reason =
            asNonEmptyString(tokenJson?.error_description) ||
            asNonEmptyString(tokenJson?.error) ||
            `HTTP ${tokenRes.status}`;
        const message = `Upwork token refresh failed: ${reason}`;
        await markOauthError(ctx, departmentId, message);
        throw new Error(message);
    }

    const orgId = await resolveOrgIdFromDepartment(ctx, departmentId);
    await ctx.runMutation(internal.integrations.patchConfigForOrg, {
        orgId,
        type: "upwork",
        patch: {
            accessToken,
            refreshToken: newRefreshToken || refreshToken,
            tokenExpiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
            tokenType: asNonEmptyString(tokenJson?.token_type) ?? "bearer",
        },
        authType: "oauth2",
        oauthStatus: "connected",
        lastError: "",
    });

    return accessToken;
}

async function ensureValidAccessToken(
    ctx: any,
    departmentId: Id<"departments">
): Promise<string> {
    const { config } = await getUpworkIntegration(ctx, departmentId);
    const accessToken = asNonEmptyString(config.accessToken);
    const tokenExpiresAt = asOptionalNumber(config.tokenExpiresAt);
    const shouldRefresh = !accessToken || !tokenExpiresAt || Date.now() >= tokenExpiresAt - 60_000;
    if (!shouldRefresh && accessToken) return accessToken;
    return await refreshAccessToken(ctx, departmentId, config);
}

async function fetchUpworkGraphql(
    ctx: any,
    departmentId: Id<"departments">,
    requestBody: unknown
): Promise<Response> {
    const token = await ensureValidAccessToken(ctx, departmentId);
    const firstResponse = await fetch(UPWORK_GRAPHQL_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    });

    if (firstResponse.status !== 401) {
        return firstResponse;
    }

    const { config } = await getUpworkIntegration(ctx, departmentId);
    const refreshedToken = await refreshAccessToken(ctx, departmentId, config);
    return await fetch(UPWORK_GRAPHQL_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${refreshedToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    });
}

const SEARCH_JOBS_QUERY = `
query SearchUpworkJobs($marketPlaceJobFilter: MarketplaceJobPostingsSearchFilter) {
  marketplaceJobPostingsSearch(marketPlaceJobFilter: $marketPlaceJobFilter) {
    totalCount
    edges {
      node {
        id
        title
        description
        ciphertext
        amount {
          rawValue
          currency
          displayValue
        }
        hourlyBudgetMin {
          rawValue
          currency
          displayValue
        }
        hourlyBudgetMax {
          rawValue
          currency
          displayValue
        }
        weeklyBudget {
          rawValue
          currency
          displayValue
        }
        client {
          totalFeedback
          totalHires
          totalPostedJobs
          totalSpent {
            rawValue
            currency
            displayValue
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;

/**
 * Tool: search_upwork_jobs
 * Searches Upwork job postings and returns structured + summarized results for LLM use.
 */
export const searchJobs = internalAction({
    args: {
        departmentId: v.id("departments"),
        query: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<any> => {
        const query = args.query.trim();
        if (!query) {
            throw new Error("Tool 'search_upwork_jobs' requires a non-empty 'query'.");
        }
        const limit = parseLimit(args.limit);

        const requestBody = {
            query: SEARCH_JOBS_QUERY,
            variables: {
                marketPlaceJobFilter: {
                    searchExpression_eq: query,
                    pagination_eq: {
                        first: limit,
                    },
                },
            },
        };

        const response = await fetchUpworkGraphql(ctx, args.departmentId, requestBody);

        const payloadText = await response.text();
        const payload = decodeJsonSafely(payloadText) ?? {};

        if (!response.ok) {
            throw new Error(
                `Upwork GraphQL request failed (HTTP ${response.status}): ${asNonEmptyString(payloadText) ?? "Unknown error"}`
            );
        }

        const gqlErrors = Array.isArray(payload?.errors) ? payload.errors : [];
        if (gqlErrors.length > 0) {
            const firstMessage =
                asNonEmptyString(gqlErrors[0]?.message) ??
                "Unknown Upwork GraphQL error";
            throw new Error(`Upwork GraphQL error: ${firstMessage}`);
        }

        const searchData = payload?.data?.marketplaceJobPostingsSearch;
        const edges = Array.isArray(searchData?.edges) ? searchData.edges : [];

        const jobs = edges
            .map((edge: any) => edge?.node)
            .filter(Boolean)
            .map((job: any) => {
                const title = asNonEmptyString(job?.title) ?? "Untitled";
                const description = asNonEmptyString(job?.description) ?? "";
                const amount = formatMoney(job?.amount);
                const hourlyMin = formatMoney(job?.hourlyBudgetMin);
                const hourlyMax = formatMoney(job?.hourlyBudgetMax);
                const weeklyBudget = formatMoney(job?.weeklyBudget);
                const budget =
                    amount ||
                    (hourlyMin || hourlyMax
                        ? `${hourlyMin ?? "?"} - ${hourlyMax ?? "?"} / hour`
                        : weeklyBudget
                            ? `${weeklyBudget} / week`
                            : null);
                const clientRating =
                    typeof job?.client?.totalFeedback === "number"
                        ? Number(job.client.totalFeedback)
                        : null;
                const clientTotalSpent = formatMoney(job?.client?.totalSpent);
                const url = buildJobUrl(job?.ciphertext);

                return {
                    id: asNonEmptyString(job?.id) ?? null,
                    title,
                    description,
                    url,
                    budget,
                    client: {
                        rating: clientRating,
                        totalSpent: clientTotalSpent,
                        totalHires:
                            typeof job?.client?.totalHires === "number"
                                ? job.client.totalHires
                                : null,
                        totalPostedJobs:
                            typeof job?.client?.totalPostedJobs === "number"
                                ? job.client.totalPostedJobs
                                : null,
                    },
                };
            });

        const summaryLines = jobs.slice(0, 8).map((job: any, index: number) => {
            const compactDescription = job.description.replace(/\s+/g, " ").slice(0, 180);
            const rating = typeof job.client?.rating === "number" ? job.client.rating.toFixed(1) : "n/a";
            return `${index + 1}. ${job.title} | budget: ${job.budget ?? "n/a"} | client rating: ${rating} | client spent: ${job.client?.totalSpent ?? "n/a"} | ${compactDescription}`;
        });

        return {
            ok: true,
            query,
            totalCount:
                typeof searchData?.totalCount === "number"
                    ? searchData.totalCount
                    : jobs.length,
            hasNextPage: Boolean(searchData?.pageInfo?.hasNextPage),
            endCursor: asNonEmptyString(searchData?.pageInfo?.endCursor) ?? null,
            jobs,
            summary: summaryLines.join("\n"),
        };
    },
});
