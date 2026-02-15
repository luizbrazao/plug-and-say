import { internalMutation, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

/**
 * Uprising: The module that wakes up agents.
 * Handles cron-based heartbeats and distributed processing.
 */

// How often (in ms) an agent needs to be "active" to not be considered stale
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

function normalizeOrganizationLanguage(input: unknown): "en" | "es" | "pt" {
    const normalized = String(input ?? "").trim().toLowerCase();
    if (normalized === "en" || normalized === "es" || normalized === "pt") {
        return normalized;
    }
    return "pt";
}

/**
 * Global dispatch: Runs periodically (e.g. every 15 mins).
 * Iterates over all departments and schedules a per-department check.
 * Staggers execution to avoid thundering herd on external APIs.
 */
export const dispatchGlobal = internalAction({
    args: {},
    handler: async (ctx) => {
        // Fetch all departments
        // Note: In a massive scale app, we'd paginate this. For now, fetch all is fine.
        const departments = await ctx.runQuery(api.departments.listAll);

        // Shuffle to randomize load if running frequently
        const shuffled = departments.sort(() => Math.random() - 0.5);

        for (let i = 0; i < shuffled.length; i++) {
            const dept = shuffled[i];

            // Stagger by 5 seconds per department
            const delayMs = i * 5000;

            await ctx.scheduler.runAfter(delayMs, internal.uprising.dispatchDept, {
                departmentId: dept._id,
            });
        }
    },
});

/**
 * Per-Department dispatch.
 * Checks all agents in the department.
 */
export const dispatchDept = internalMutation({
    args: {
        departmentId: v.id("departments"),
    },
    handler: async (ctx, args) => {
        const department = await ctx.db.get(args.departmentId);
        const organization = department?.orgId ? await ctx.db.get(department.orgId) : null;
        const organizationLanguage = normalizeOrganizationLanguage(
            (organization as { language?: string } | null)?.language
        );
        const agents = await ctx.db
            .query("agents")
            .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
            .collect();

        const now = Date.now();

        for (const agent of agents) {
            // Only wake up active agents
            if (agent.status !== "active") continue;

            // Check if they are working on a task
            if (agent.currentTaskId) {
                const lastSeen = agent.lastSeenAt || 0;

                // If they haven't been seen recently, give them a nudge
                if (now - lastSeen > STALE_THRESHOLD_MS) {
                    await ctx.scheduler.runAfter(0, internal.brain.thinkInternal, {
                        departmentId: args.departmentId,
                        taskId: agent.currentTaskId,
                        agentSessionKey: agent.sessionKey,
                        triggerKey: `uprising:${String(agent.currentTaskId)}:${agent.sessionKey}`,
                        language: organizationLanguage,
                    });
                }
            }

            // Future: logic for idle agents to check inbox could go here 
        }
    },
});
