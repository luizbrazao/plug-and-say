import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Migration: backfillActivitiesCreatedAt
 * Access: Public
 */
export const backfillActivitiesCreatedAt = mutation({
    args: {},
    handler: async (ctx) => {
        const rows = await ctx.db.query("activities").collect();
        let patched = 0;
        for (const a of rows) {
            if (!("createdAt" in a) || a.createdAt === undefined || a.createdAt === null) {
                await ctx.db.patch(a._id, { createdAt: a._creationTime });
                patched += 1;
            }
        }
        return { total: rows.length, patched };
    },
});

/**
 * Migration: backfillOrganizationPlans
 * Ensures existing organizations have a plan set.
 */
export const backfillOrganizationPlans = mutation({
    args: {},
    handler: async (ctx) => {
        const organizations = await ctx.db.query("organizations").collect();
        let patched = 0;
        for (const org of organizations) {
            if (!org.plan) {
                await ctx.db.patch(org._id, { plan: "starter" });
                patched += 1;
            }
        }
        return { total: organizations.length, patched };
    },
});

/**
 * Migration: backfillOrganizationLanguage
 * Ensures existing organizations have language set to "pt".
 */
export const backfillOrganizationLanguage = mutation({
    args: {},
    handler: async (ctx) => {
        const organizations = await ctx.db.query("organizations").collect();
        let patched = 0;
        for (const org of organizations) {
            if (!org.language) {
                await ctx.db.patch(org._id, { language: "pt" });
                patched += 1;
            }
        }
        return { total: organizations.length, patched };
    },
});

/**
 * Migration: migrateBlockedTasksToInProgress
 * Keeps legacy blocked tasks visible on the simplified Kanban flow.
 */
export const migrateBlockedTasksToInProgress = mutation({
    args: {
        departmentId: v.optional(v.id("departments")),
    },
    handler: async (ctx, args) => {
        const tasks = await ctx.db.query("tasks").collect();
        let patched = 0;
        for (const task of tasks) {
            if (args.departmentId && task.departmentId !== args.departmentId) continue;
            if (String(task.status).toLowerCase() !== "blocked") continue;
            await ctx.db.patch(task._id, { status: "in_progress" });
            patched += 1;
        }
        return { total: tasks.length, patched };
    },
});

/* Legacy Migrations - Commented out to satisfy schema constraints */

/**
 * Migration: backfillOrgId
 */
export const backfillOrgId = mutation({
    args: { defaultDeptId: v.id("departments") },
    handler: async (ctx, args) => {
        const tables = [
            "agents",
            "tasks",
            "messages",
            "documents",
            "notifications",
            "activities",
            "thread_reads",
            "thread_subscriptions",
            "executor_runs",
        ] as const;

        let updated = 0;
        for (const table of tables) {
            const rows = await ctx.db.query(table).collect();
            for (const row of rows) {
                const hasDeptId = "departmentId" in row && row.departmentId !== undefined;
                if (!hasDeptId) {
                    await ctx.db.patch(row._id as any, { departmentId: args.defaultDeptId } as any);
                    updated++;
                }
            }
        }
        return { updated, defaultDeptId: args.defaultDeptId };
    },
});

/**
 * Migration: cleanupLegacyData
 * Removes 'orgId' from all records to satisfy strict schema.
 */
export const cleanupLegacyData = mutation({
    args: {},
    handler: async (ctx) => {
        const tables = [
            "agents",
            "tasks",
            "messages",
            "documents",
            "aiAssets",
            "knowledgeBase",
            "notifications",
            "activities",
            "thread_reads",
            "thread_subscriptions",
            "executor_runs",
            "uxEvents",
            "agentTemplates",
        ] as const;

        let updated = 0;
        for (const table of tables) {
            const rows = await ctx.db.query(table).collect();
            for (const row of rows) {
                if ("orgId" in row) {
                    // @ts-ignore - removing field
                    await ctx.db.patch(row._id, { orgId: undefined });
                    updated++;
                }
            }
        }
        return { updated };
    },
});

/**
 * Migration: migrateDocumentsToAssets
 * Copies legacy `documents` rows to `aiAssets` (idempotent by content signature).
 */
export const migrateDocumentsToAssets = mutation({
    args: {},
    handler: async (ctx) => {
        const legacyDocs = await ctx.db.query("documents").collect();
        const existingAssets = await ctx.db.query("aiAssets").collect();

        const signatures = new Set(
            existingAssets.map((asset) =>
                JSON.stringify([
                    asset.departmentId ?? null,
                    asset.taskId ?? null,
                    asset.title,
                    asset.content,
                    asset.type,
                    asset.createdAt,
                ])
            )
        );

        let inserted = 0;
        let skipped = 0;

        for (const doc of legacyDocs) {
            const signature = JSON.stringify([
                doc.departmentId ?? null,
                doc.taskId ?? null,
                doc.title,
                doc.content,
                doc.type,
                doc.createdAt,
            ]);
            if (signatures.has(signature)) {
                skipped += 1;
                continue;
            }

            await ctx.db.insert("aiAssets", {
                departmentId: doc.departmentId,
                title: doc.title,
                content: doc.content,
                type: doc.type,
                taskId: doc.taskId,
                createdAt: doc.createdAt,
                createdBySessionKey: doc.createdBySessionKey,
                embedding: doc.embedding,
                embeddingModel: doc.embeddingModel,
                embeddedAt: doc.embeddedAt,
                orgId: doc.orgId,
            });
            signatures.add(signature);
            inserted += 1;
        }

        return {
            totalLegacyDocuments: legacyDocs.length,
            inserted,
            skipped,
            totalAssetsAfter: existingAssets.length + inserted,
        };
    },
});

/*
export const backfillDepartments = mutation({
    args: {},
    handler: async (ctx) => {
        // This migration refers to 'orgs' and 'orgMemberships' which no longer exist in schema.ts
        return "Migration disabled: legacy schema (orgs) removed.";
    },
});
*/
