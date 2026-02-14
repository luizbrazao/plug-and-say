# Multi-Tenant SaaS Implementation Plan

> **Approved**: 2026-02-08 | **Option A**: Explicit `orgId` field

---

## Overview

| Metric | Value |
|--------|-------|
| Tables to modify | 11 |
| Files to update | 15 |
| Query operations | 33 |
| New tables | 3 (`orgs`, `orgMemberships`, `agentTemplates`) |

---

## Phase 1: Schema Migration

### 1.1 Add New Tables

#### [NEW] [schema.ts](file:///Users/luizbrazao/mission-control/mission-control/convex/schema.ts)

Add after line 30 (after `...authTables`):

```typescript
/**
 * Organizations (tenants)
 */
orgs: defineTable({
  name: v.string(),
  slug: v.string(), // unique URL-safe identifier
  plan: v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise")),
  createdAt: v.float64(),
})
  .index("by_slug", ["slug"]),

/**
 * Org memberships (user ↔ org)
 */
orgMemberships: defineTable({
  userId: v.id("users"), // from authTables
  orgId: v.id("orgs"),
  role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
  joinedAt: v.float64(),
})
  .index("by_userId", ["userId"])
  .index("by_orgId", ["orgId"])
  .index("by_userId_orgId", ["userId", "orgId"]),

/**
 * Agent templates (per-org agent configuration)
 */
agentTemplates: defineTable({
  orgId: v.id("orgs"),
  name: v.string(),
  role: v.string(),
  systemPrompt: v.optional(v.string()),
  capabilities: v.optional(v.array(v.string())),
  createdAt: v.float64(),
  createdByUserId: v.optional(v.id("users")),
})
  .index("by_orgId", ["orgId"]),
```

### 1.2 Add `orgId` to Existing Tables

Add `orgId: v.id("orgs")` to each table and update indexes:

| Table | New Field | New Index |
|-------|-----------|-----------|
| `agents` | `orgId: v.id("orgs")` | `by_org_sessionKey: ["orgId", "sessionKey"]` |
| `tasks` | `orgId: v.id("orgs")` | `by_org_status: ["orgId", "status"]` |
| `messages` | `orgId: v.id("orgs")` | `by_org_taskId: ["orgId", "taskId"]` |
| `documents` | `orgId: v.id("orgs")` | `by_org_taskId: ["orgId", "taskId"]` |
| `notifications` | `orgId: v.id("orgs")` | `by_org_mentioned: ["orgId", "mentionedSessionKey"]` |
| `activities` | `orgId: v.id("orgs")` | `by_org_createdAt: ["orgId", "createdAt"]` |
| `thread_reads` | `orgId: v.id("orgs")` | `by_org_task_reader: ["orgId", "taskId", "readerSessionKey"]` |
| `thread_subscriptions` | `orgId: v.id("orgs")` | `by_org_taskId: ["orgId", "taskId"]` |
| `executor_runs` | `orgId: v.id("orgs")` | `by_org_task_runKey: ["orgId", "taskId", "runKey"]` |
| `uxEvents` | `orgId: v.optional(v.id("orgs"))` | `by_org_ts: ["orgId", "ts"]` |

### 1.3 Migration Script

#### [NEW] [migrations.ts](file:///Users/luizbrazao/mission-control/mission-control/convex/migrations.ts) — Add function

```typescript
export const backfillOrgId = mutation({
  args: { defaultOrgId: v.id("orgs") },
  handler: async (ctx, args) => {
    const tables = ["agents", "tasks", "messages", "documents", 
                    "notifications", "activities", "thread_reads",
                    "thread_subscriptions", "executor_runs"];
    
    let updated = 0;
    for (const table of tables) {
      const rows = await ctx.db.query(table as any).collect();
      for (const row of rows) {
        if (!row.orgId) {
          await ctx.db.patch(row._id, { orgId: args.defaultOrgId });
          updated++;
        }
      }
    }
    return { updated };
  },
});
```

---

## Phase 2: Auth/Authz Middleware

### 2.1 Org Context Helper

#### [NEW] [lib/orgContext.ts](file:///Users/luizbrazao/mission-control/mission-control/convex/lib/orgContext.ts)

```typescript
import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

export async function getOrgIdFromSession(
  ctx: QueryCtx | MutationCtx,
  sessionKey: string
): Promise<Id<"orgs">> {
  const agent = await ctx.db
    .query("agents")
    .withIndex("by_sessionKey", (q) => q.eq("sessionKey", sessionKey))
    .unique();
  
  if (!agent?.orgId) {
    throw new Error("Agent not found or missing orgId");
  }
  return agent.orgId;
}

export async function requireOrgMembership(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  orgId: Id<"orgs">
): Promise<void> {
  const membership = await ctx.db
    .query("orgMemberships")
    .withIndex("by_userId_orgId", (q) => 
      q.eq("userId", userId).eq("orgId", orgId)
    )
    .unique();
  
  if (!membership) {
    throw new Error("Access denied: not a member of this organization");
  }
}
```

### 2.2 Create Org Mutations

#### [NEW] [orgs.ts](file:///Users/luizbrazao/mission-control/mission-control/convex/orgs.ts)

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    plan: v.optional(v.union(v.literal("free"), v.literal("pro"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("orgs", {
      name: args.name,
      slug: args.slug,
      plan: args.plan ?? "free",
      createdAt: now,
    });
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orgs")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});
```

---

## Phase 3: Agent System Updates

### 3.1 Update Agent Mutations

#### [MODIFY] [agents.ts](file:///Users/luizbrazao/mission-control/mission-control/convex/agents.ts)

Update `upsert` to require `orgId`:

```diff
export const upsert = mutation({
    args: {
+       orgId: v.id("orgs"),
        sessionKey: v.string(),
        ...
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("agents")
-           .withIndex("by_sessionKey", (q) => q.eq("sessionKey", args.sessionKey))
+           .withIndex("by_org_sessionKey", (q) => 
+               q.eq("orgId", args.orgId).eq("sessionKey", args.sessionKey)
+           )
            .unique();
        
        if (existing) {
            ...
        }
        
        await ctx.db.insert("agents", {
+           orgId: args.orgId,
            sessionKey: args.sessionKey,
            ...
        });
    },
});
```

### 3.2 Agent Templates

#### [NEW] [agentTemplates.ts](file:///Users/luizbrazao/mission-control/mission-control/convex/agentTemplates.ts)

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    orgId: v.id("orgs"),
    name: v.string(),
    role: v.string(),
    systemPrompt: v.optional(v.string()),
    capabilities: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentTemplates", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const listByOrg = query({
  args: { orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentTemplates")
      .withIndex("by_orgId", (q) => q.eq("orgId", args.orgId))
      .collect();
  },
});

export const createAgentFromTemplate = mutation({
  args: {
    templateId: v.id("agentTemplates"),
    sessionKey: v.string(),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");
    
    return await ctx.db.insert("agents", {
      orgId: template.orgId,
      sessionKey: args.sessionKey,
      name: template.name,
      role: template.role,
      status: "idle",
      lastSeenAt: Date.now(),
    });
  },
});
```

---

## Phase 4: Query/Mutation Updates

### Files to Update

| File | Changes |
|------|---------|
| [tasks.ts](file:///Users/luizbrazao/mission-control/mission-control/convex/tasks.ts) | Add `orgId` to create, filter by `orgId` in queries |
| [messages.ts](file:///Users/luizbrazao/mission-control/mission-control/convex/messages.ts) | Inherit `orgId` from task, filter by `orgId` |
| [documents.ts](file:///Users/luizbrazao/mission-control/mission-control/convex/documents.ts) | Inherit `orgId` from task |
| [notifications.ts](file:///Users/luizbrazao/mission-control/mission-control/convex/notifications.ts) | Add `orgId` to create, filter by `orgId` |
| [activities.ts](file:///Users/luizbrazao/mission-control/mission-control/convex/activities.ts) | Add `orgId` filtering |
| [executors.ts](file:///Users/luizbrazao/mission-control/mission-control/convex/executors.ts) | Inherit `orgId` from task |
| [agents_reader.ts](file:///Users/luizbrazao/mission-control/mission-control/convex/agents_reader.ts) | Inherit `orgId` from task |
| [thread_subscriptions.ts](file:///Users/luizbrazao/mission-control/mission-control/convex/thread_subscriptions.ts) | Inherit `orgId` from task |

### Pattern for Task-Based Operations

```typescript
// Before
const messages = await ctx.db
  .query("messages")
  .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
  .collect();

// After
const task = await ctx.db.get(args.taskId);
if (!task) throw new Error("Task not found");

const messages = await ctx.db
  .query("messages")
  .withIndex("by_org_taskId", (q) => 
    q.eq("orgId", task.orgId).eq("taskId", args.taskId)
  )
  .collect();
```

---

## Verification Plan

### Automated Tests

```bash
# Run Convex tests after schema changes
npx convex dev --once  # Validate schema
npx convex run migrations:backfillOrgId '{"defaultOrgId": "..."}'
```

### Manual Verification

1. Create a new org via `orgs:create`
2. Create an agent template via `agentTemplates:create`
3. Create agent from template via `agentTemplates:createAgentFromTemplate`
4. Create task with `orgId` → verify messages inherit `orgId`
5. Query tasks by org → verify isolation
