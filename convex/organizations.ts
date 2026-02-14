import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

const organizationLanguage = v.union(
    v.literal("en"),
    v.literal("es"),
    v.literal("pt")
);

/**
 * Create a new Organization
 */
export const create = mutation({
    args: {
        name: v.string(),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        const slug = args.name.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now().toString().slice(-4);

        const orgId = await ctx.db.insert("organizations", {
            name: args.name,
            slug,
            ownerId: userId,
            language: "pt",
            plan: "starter",
            createdAt: Date.now(),
        });

        // Add creator as owner
        await ctx.db.insert("orgMemberships", {
            userId,
            orgId,
            role: "owner",
            joinedAt: Date.now(),
        });

        return orgId;
    },
});

/**
 * List Organizations for the current user
 */
export const listForUser = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) return [];

        const memberships = await ctx.db
            .query("orgMemberships")
            .withIndex("by_userId", (q) => q.eq("userId", userId))
            .collect();

        const orgs = await Promise.all(
            memberships.map(async (m) => {
                const org = await ctx.db.get(m.orgId);
                if (!org) return null;
                const language =
                    org.language === "en" || org.language === "es" || org.language === "pt"
                        ? org.language
                        : "pt";
                return { ...org, language, role: m.role };
            })
        );

        return orgs.filter((o) => o !== null);
    },
});

/**
 * Returns the authenticated user id for client-side ownership checks.
 */
export const currentUserId = query({
    args: {},
    handler: async (ctx) => {
        return await getAuthUserId(ctx);
    },
});

/**
 * Find one organization by exact name (case-insensitive).
 * Useful for one-time repairs/migrations.
 */
export const findByName = query({
    args: {
        name: v.string(),
    },
    handler: async (ctx, args) => {
        const target = args.name.trim().toLowerCase();
        if (!target) return null;

        const orgs = await ctx.db.query("organizations").collect();
        return orgs.find((org) => org.name.trim().toLowerCase() === target) ?? null;
    },
});

/**
 * List members for an organization.
 * Access: any authenticated member of the organization.
 */
export const listMembers = query({
    args: {
        orgId: v.id("organizations"),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        const requesterMembership = await ctx.db
            .query("orgMemberships")
            .withIndex("by_userId_orgId", (q) => q.eq("userId", userId).eq("orgId", args.orgId))
            .unique();

        if (!requesterMembership) {
            throw new Error("Access denied: not a member of this organization");
        }

        const memberships = await ctx.db
            .query("orgMemberships")
            .withIndex("by_orgId", (q) => q.eq("orgId", args.orgId))
            .collect();

        const enriched = await Promise.all(
            memberships.map(async (membership) => {
                const user: any = await ctx.db.get(membership.userId);
                const profile: any = await ctx.db
                    .query("userProfiles")
                    .withIndex("by_userId", (q) => q.eq("userId", membership.userId))
                    .first();

                const avatarUrl = profile?.avatarStorageId
                    ? await ctx.storage.getUrl(profile.avatarStorageId)
                    : null;

                return {
                    ...membership,
                    name:
                        profile?.displayName ??
                        user?.name ??
                        (typeof user?.email === "string" && user.email.includes("@")
                            ? user.email.split("@")[0]
                            : "Unknown User"),
                    email: profile?.email ?? user?.email ?? "",
                    avatarUrl,
                };
            })
        );

        return enriched;
    },
});

/**
 * Remove a member from an organization (owner/admin only).
 */
export const removeMember = mutation({
    args: {
        orgId: v.id("organizations"),
        membershipId: v.id("orgMemberships"),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        const requesterMembership = await ctx.db
            .query("orgMemberships")
            .withIndex("by_userId_orgId", (q) => q.eq("userId", userId).eq("orgId", args.orgId))
            .unique();

        if (!requesterMembership || (requesterMembership.role !== "owner" && requesterMembership.role !== "admin")) {
            throw new Error("Access denied: admin or owner role required.");
        }

        const targetMembership = await ctx.db.get("orgMemberships", args.membershipId);
        if (!targetMembership || targetMembership.orgId !== args.orgId) {
            throw new Error("Organization membership not found.");
        }

        if (targetMembership.role === "owner") {
            throw new Error("Owner membership cannot be removed.");
        }

        if (requesterMembership.role === "admin" && targetMembership.role === "admin") {
            throw new Error("Only owners can remove other admins.");
        }

        const orgDepartments = await ctx.db
            .query("departments")
            .withIndex("by_orgId", (q) => q.eq("orgId", args.orgId))
            .collect();
        const orgDepartmentIds = new Set(orgDepartments.map((d) => d._id));

        const userDeptMemberships = await ctx.db
            .query("deptMemberships")
            .withIndex("by_userId", (q) => q.eq("userId", targetMembership.userId))
            .collect();

        let removedDeptMemberships = 0;
        for (const deptMembership of userDeptMemberships) {
            if (deptMembership.departmentId && orgDepartmentIds.has(deptMembership.departmentId)) {
                await ctx.db.delete("deptMemberships", deptMembership._id);
                removedDeptMemberships += 1;
            }
        }

        await ctx.db.delete("orgMemberships", targetMembership._id);
        return {
            ok: true,
            removedMembershipId: targetMembership._id,
            removedDeptMemberships,
        };
    },
});

/**
 * Update organization name (owner/admin only).
 */
export const updateName = mutation({
    args: {
        orgId: v.id("organizations"),
        name: v.string(),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        const org = await ctx.db.get(args.orgId);
        if (!org) throw new Error("Organization not found.");

        const membership = await ctx.db
            .query("orgMemberships")
            .withIndex("by_userId_orgId", (q) => q.eq("userId", userId).eq("orgId", args.orgId))
            .unique();
        if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
            throw new Error("Access denied: admin or owner role required.");
        }

        const name = args.name.trim();
        if (!name) throw new Error("Organization name is required.");

        await ctx.db.patch(args.orgId, { name });
        return { ok: true };
    },
});

/**
 * Update organization language (owner/admin only).
 */
export const updateLanguage = mutation({
    args: {
        orgId: v.id("organizations"),
        language: organizationLanguage,
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        const org = await ctx.db.get(args.orgId);
        if (!org) throw new Error("Organization not found.");

        const membership = await ctx.db
            .query("orgMemberships")
            .withIndex("by_userId_orgId", (q) => q.eq("userId", userId).eq("orgId", args.orgId))
            .unique();
        if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
            throw new Error("Access denied: admin or owner role required.");
        }

        await ctx.db.patch(args.orgId, { language: args.language });
        return { ok: true, language: args.language };
    },
});

/**
 * Delete organization (owner/admin only).
 * Safety guard: requires zero departments linked to the org.
 */
export const remove = mutation({
    args: {
        orgId: v.id("organizations"),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        const org = await ctx.db.get(args.orgId);
        if (!org) throw new Error("Organization not found.");

        const membership = await ctx.db
            .query("orgMemberships")
            .withIndex("by_userId_orgId", (q) => q.eq("userId", userId).eq("orgId", args.orgId))
            .unique();
        if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
            throw new Error("Access denied: admin or owner role required.");
        }

        const deleteRows = async (rows: Array<{ _id: any }>) => {
            for (const row of rows) {
                await ctx.db.delete(row._id);
            }
            return rows.length;
        };

        const linkedDepartments = await ctx.db
            .query("departments")
            .withIndex("by_orgId", (q) => q.eq("orgId", args.orgId))
            .collect();

        let deletedDepartments = 0;
        let deletedDeptMemberships = 0;
        let deletedAgentTemplates = 0;
        let deletedAgents = 0;
        let deletedTasks = 0;
        let deletedMessages = 0;
        let deletedThreadReads = 0;
        let deletedActivities = 0;
        let deletedDocuments = 0;
        let deletedNotifications = 0;
        let deletedSubscriptions = 0;
        let deletedRuns = 0;
        let deletedUxEvents = 0;
        let deletedLegacyDeptIntegrations = 0;

        for (const dept of linkedDepartments) {
            const [agentTemplates, agents, tasks, messages, threadReads, activities, documents, notifications, subscriptions, runs, uxEvents, integrations, deptMemberships] = await Promise.all([
                ctx.db.query("agentTemplates").withIndex("by_departmentId", (q) => q.eq("departmentId", dept._id)).collect(),
                ctx.db.query("agents").withIndex("by_departmentId", (q) => q.eq("departmentId", dept._id)).collect(),
                ctx.db.query("tasks").withIndex("by_departmentId", (q) => q.eq("departmentId", dept._id)).collect(),
                ctx.db.query("messages").withIndex("by_departmentId", (q) => q.eq("departmentId", dept._id)).collect(),
                ctx.db.query("thread_reads").withIndex("by_departmentId", (q) => q.eq("departmentId", dept._id)).collect(),
                ctx.db.query("activities").withIndex("by_department_createdAt", (q) => q.eq("departmentId", dept._id)).collect(),
                ctx.db.query("documents").withIndex("by_department_taskId", (q) => q.eq("departmentId", dept._id)).collect(),
                ctx.db.query("notifications").withIndex("by_departmentId", (q) => q.eq("departmentId", dept._id)).collect(),
                ctx.db.query("thread_subscriptions").withIndex("by_department_taskId", (q) => q.eq("departmentId", dept._id)).collect(),
                ctx.db.query("executor_runs").withIndex("by_department_taskId", (q) => q.eq("departmentId", dept._id)).collect(),
                ctx.db.query("uxEvents").withIndex("by_department_ts", (q) => q.eq("departmentId", dept._id)).collect(),
                ctx.db.query("integrations").withIndex("by_departmentId", (q) => q.eq("departmentId", dept._id)).collect(),
                ctx.db.query("deptMemberships").withIndex("by_departmentId", (q) => q.eq("departmentId", dept._id)).collect(),
            ]);

            deletedAgentTemplates += await deleteRows(agentTemplates as any);
            deletedAgents += await deleteRows(agents as any);
            deletedTasks += await deleteRows(tasks as any);
            deletedMessages += await deleteRows(messages as any);
            deletedThreadReads += await deleteRows(threadReads as any);
            deletedActivities += await deleteRows(activities as any);
            deletedDocuments += await deleteRows(documents as any);
            deletedNotifications += await deleteRows(notifications as any);
            deletedSubscriptions += await deleteRows(subscriptions as any);
            deletedRuns += await deleteRows(runs as any);
            deletedUxEvents += await deleteRows(uxEvents as any);
            deletedLegacyDeptIntegrations += await deleteRows(integrations as any);
            deletedDeptMemberships += await deleteRows(deptMemberships as any);

            await ctx.db.delete(dept._id);
            deletedDepartments += 1;
        }

        const orgIntegrations = await ctx.db
            .query("integrations")
            .withIndex("by_orgId", (q) => q.eq("orgId", args.orgId))
            .collect();
        const deletedOrgIntegrations = await deleteRows(orgIntegrations as any);

        const memberships = await ctx.db
            .query("orgMemberships")
            .withIndex("by_orgId", (q) => q.eq("orgId", args.orgId))
            .collect();
        for (const row of memberships) {
            await ctx.db.delete(row._id);
        }

        const invites = await ctx.db
            .query("invites")
            .withIndex("by_orgId", (q) => q.eq("orgId", args.orgId))
            .collect();
        for (const invite of invites) {
            await ctx.db.delete(invite._id);
        }

        await ctx.db.delete(args.orgId);
        return {
            ok: true,
            deletedDepartments,
            deletedDeptMemberships,
            deletedAgentTemplates,
            deletedAgents,
            deletedTasks,
            deletedMessages,
            deletedThreadReads,
            deletedActivities,
            deletedDocuments,
            deletedNotifications,
            deletedSubscriptions,
            deletedRuns,
            deletedUxEvents,
            deletedLegacyDeptIntegrations,
            deletedOrgIntegrations,
            removedMemberships: memberships.length,
            removedInvites: invites.length,
        };
    },
});

/**
 * Get (or Create) Default Organization for Migration
 * If user has no orgs, create a "Personal" one.
 */
export const getOrCreateDefault = mutation({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        // Check if user has any orgs
        const memberships = await ctx.db
            .query("orgMemberships")
            .withIndex("by_userId", (q) => q.eq("userId", userId))
            .first();

        if (memberships) {
            return memberships.orgId;
        }

        // Create Default Org
        const orgId = await ctx.db.insert("organizations", {
            name: "Personal Workspace",
            slug: `personal-${userId.slice(-6)}`,
            ownerId: userId,
            language: "pt",
            plan: "starter",
            createdAt: Date.now(),
        });

        await ctx.db.insert("orgMemberships", {
            userId,
            orgId,
            role: "owner",
            joinedAt: Date.now(),
        });

        // Migration: Link orphan departments to this new org
        const userDepts = await ctx.db
            .query("deptMemberships")
            .withIndex("by_userId", (q) => q.eq("userId", userId))
            .collect();

        for (const membership of userDepts) {
            if (membership.departmentId) {
                const dept = await ctx.db.get(membership.departmentId);
                if (dept && !dept.orgId) {
                    await ctx.db.patch(dept._id, { orgId });
                }
            }
        }

        return orgId;
    },
});
