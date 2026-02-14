import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { checkLimit } from "./plans";

/**
 * Create a new department
 */
export const create = mutation({
    args: {
        name: v.string(),
        slug: v.string(),
        orgId: v.id("organizations"),
        plan: v.optional(v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise"))),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        await checkLimit(ctx, args.orgId, "departments");

        // Check if slug already exists
        const existing = await ctx.db
            .query("departments")
            .withIndex("by_slug", (q) => q.eq("slug", args.slug))
            .unique();

        if (existing) {
            throw new Error(`Department with slug "${args.slug}" already exists`);
        }

        const departmentId = await ctx.db.insert("departments", {
            name: args.name,
            slug: args.slug,
            orgId: args.orgId,
            plan: args.plan ?? "free",
            createdAt: now,
        });

        // Seed default "Jarvis" agent for the new department (idempotent on retries).
        const jarvisSessionKey = `agent:jarvis:${args.slug}`;
        const existingJarvis = await ctx.db
            .query("agents")
            .withIndex("by_dept_sessionKey", (q) =>
                q.eq("departmentId", departmentId).eq("sessionKey", jarvisSessionKey)
            )
            .unique();
        if (!existingJarvis) {
            await ctx.db.insert("agents", {
                departmentId,
                name: "Jarvis",
                slug: "jarvis",
                role: "Head of Operations",
                description: "Coordenador do departamento focado em orquestração e delegação.",
                sessionKey: jarvisSessionKey,
                status: "idle",
                lastSeenAt: now,
            });
        }

        return departmentId;
    },
});

/**
 * Get department by slug
 */
export const getBySlug = query({
    args: { slug: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("departments")
            .withIndex("by_slug", (q) => q.eq("slug", args.slug))
            .unique();
    },
});

/**
 * Get department by ID
 */
export const get = query({
    args: { departmentId: v.id("departments") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.departmentId);
    },
});

/**
 * List departments for an organization
 */
export const list = query({
    args: {
        orgId: v.id("organizations"),
        limit: v.optional(v.number())
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        const membership = await ctx.db
            .query("orgMemberships")
            .withIndex("by_userId_orgId", (q) => q.eq("userId", userId).eq("orgId", args.orgId))
            .unique();
        if (!membership) {
            throw new Error("Access denied: not a member of this organization");
        }

        const limit = args.limit ?? 50;

        return await ctx.db
            .query("departments")
            .withIndex("by_orgId", (q) => q.eq("orgId", args.orgId))
            .order("desc")
            .take(limit);
    },
});

/**
 * Add a user to a department
 */
export const addMember = mutation({
    args: {
        departmentId: v.id("departments"),
        userId: v.id("users"),
        role: v.optional(v.union(v.literal("owner"), v.literal("admin"), v.literal("member"))),
    },
    handler: async (ctx, args) => {
        const now = Date.now();

        // Check if already a member
        const existing = await ctx.db
            .query("deptMemberships")
            .withIndex("by_userId_departmentId", (q) =>
                q.eq("userId", args.userId).eq("departmentId", args.departmentId)
            )
            .unique();

        if (existing) {
            return { ok: true, alreadyMember: true, membershipId: existing._id };
        }

        const membershipId = await ctx.db.insert("deptMemberships", {
            departmentId: args.departmentId,
            userId: args.userId,
            role: args.role ?? "member",
            joinedAt: now,
        });

        return { ok: true, alreadyMember: false, membershipId };
    },
});

/**
 * Get departments for a user
 */
export const getForUser = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const memberships = await ctx.db
            .query("deptMemberships")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .collect();

        const departments = await Promise.all(
            memberships.map(async (m) => {
                const dept = await ctx.db.get(m.departmentId!);
                return dept ? { ...dept, role: m.role } : null;
            })
        );

        return departments.filter((d) => d !== null);
    },
});

/**
 * Internal: List all departments for cron jobs
 */
export const listAll = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("departments").collect();
    },
});

/**
 * Update department name (org admin/owner only).
 */
export const updateName = mutation({
    args: {
        departmentId: v.id("departments"),
        name: v.string(),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        const dept = await ctx.db.get(args.departmentId);
        if (!dept) throw new Error("Department not found.");
        if (!dept.orgId) throw new Error("Department has no organization linked.");

        const membership = await ctx.db
            .query("orgMemberships")
            .withIndex("by_userId_orgId", (q) => q.eq("userId", userId).eq("orgId", dept.orgId!))
            .unique();
        if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
            throw new Error("Access denied: admin or owner role required.");
        }

        const name = args.name.trim();
        if (!name) throw new Error("Department name is required.");

        await ctx.db.patch(args.departmentId, { name });
        return { ok: true };
    },
});

/**
 * Delete department (org admin/owner only) and cascade delete department-scoped data.
 */
export const remove = mutation({
    args: {
        departmentId: v.id("departments"),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        const dept = await ctx.db.get(args.departmentId);
        if (!dept) throw new Error("Department not found.");
        if (!dept.orgId) throw new Error("Department has no organization linked.");

        const membership = await ctx.db
            .query("orgMemberships")
            .withIndex("by_userId_orgId", (q) => q.eq("userId", userId).eq("orgId", dept.orgId!))
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

        const [agentTemplates, agents, tasks, messages, threadReads, activities, documents, notifications, subscriptions, runs, uxEvents, integrations, deptMemberships] = await Promise.all([
            ctx.db.query("agentTemplates").withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId)).collect(),
            ctx.db.query("agents").withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId)).collect(),
            ctx.db.query("tasks").withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId)).collect(),
            ctx.db.query("messages").withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId)).collect(),
            ctx.db.query("thread_reads").withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId)).collect(),
            ctx.db.query("activities").withIndex("by_department_createdAt", (q) => q.eq("departmentId", args.departmentId)).collect(),
            ctx.db.query("documents").withIndex("by_department_taskId", (q) => q.eq("departmentId", args.departmentId)).collect(),
            ctx.db.query("notifications").withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId)).collect(),
            ctx.db.query("thread_subscriptions").withIndex("by_department_taskId", (q) => q.eq("departmentId", args.departmentId)).collect(),
            ctx.db.query("executor_runs").withIndex("by_department_taskId", (q) => q.eq("departmentId", args.departmentId)).collect(),
            ctx.db.query("uxEvents").withIndex("by_department_ts", (q) => q.eq("departmentId", args.departmentId)).collect(),
            ctx.db.query("integrations").withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId)).collect(),
            ctx.db.query("deptMemberships").withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId)).collect(),
        ]);

        const deletedAgentTemplates = await deleteRows(agentTemplates as any);
        const deletedAgents = await deleteRows(agents as any);
        const deletedTasks = await deleteRows(tasks as any);
        const deletedMessages = await deleteRows(messages as any);
        const deletedThreadReads = await deleteRows(threadReads as any);
        const deletedActivities = await deleteRows(activities as any);
        const deletedDocuments = await deleteRows(documents as any);
        const deletedNotifications = await deleteRows(notifications as any);
        const deletedSubscriptions = await deleteRows(subscriptions as any);
        const deletedRuns = await deleteRows(runs as any);
        const deletedUxEvents = await deleteRows(uxEvents as any);
        const deletedIntegrations = await deleteRows(integrations as any);
        const deletedDeptMemberships = await deleteRows(deptMemberships as any);

        await ctx.db.delete(args.departmentId);

        return {
            ok: true,
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
            deletedIntegrations,
            deletedDeptMemberships,
        };
    },
});

/**
 * One-time repair: force link all departments to a given organization.
 */
export const linkToOrg = mutation({
    args: {
        orgId: v.id("organizations"),
    },
    handler: async (ctx, args) => {
        const org = await ctx.db.get(args.orgId);
        if (!org) {
            throw new Error("Organization not found.");
        }

        const departments = await ctx.db.query("departments").collect();
        let updated = 0;
        let alreadyLinked = 0;

        for (const dept of departments) {
            if (dept.orgId === args.orgId) {
                alreadyLinked += 1;
                continue;
            }

            await ctx.db.patch(dept._id, { orgId: args.orgId });
            updated += 1;
        }

        return {
            ok: true,
            orgId: args.orgId,
            orgName: org.name,
            totalDepartments: departments.length,
            updated,
            alreadyLinked,
        };
    },
});
