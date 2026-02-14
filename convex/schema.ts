import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

/**
 * Status possíveis de uma task
 */
const taskStatus = v.union(
  v.literal("inbox"),
  v.literal("assigned"),
  v.literal("in_progress"),
  v.literal("review"),
  v.literal("done"),
  v.literal("blocked")
);

/**
 * Status possíveis de um agente
 */
const agentStatus = v.union(
  v.literal("idle"),
  v.literal("active"),
  v.literal("blocked")
);

const organizationLanguage = v.union(
  v.literal("en"),
  v.literal("es"),
  v.literal("pt")
);

export default defineSchema({
  /**
   * Tabelas internas do Convex Auth
   */
  ...authTables,

  /**
   * User profiles (app-level preferences and metadata)
   */
  userProfiles: defineTable({
    userId: v.id("users"),
    displayName: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.optional(v.string()),
    language: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
    createdAt: v.float64(),
    updatedAt: v.float64(),
  }).index("by_userId", ["userId"]),

  /**
   * Organizations (Top Level)
   */
  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    ownerId: v.id("users"),
    language: v.optional(organizationLanguage),
    plan: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    createdAt: v.float64(),
  }).index("by_slug", ["slug"]),

  /**
   * Organization Memberships (User <-> Org)
   */
  orgMemberships: defineTable({
    userId: v.id("users"),
    orgId: v.id("organizations"),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
    joinedAt: v.float64(),
  })
    .index("by_userId", ["userId"])
    .index("by_orgId", ["orgId"])
    .index("by_userId_orgId", ["userId", "orgId"]),

  /**
   * Invites (Token-based)
   */
  invites: defineTable({
    token: v.string(),
    orgId: v.id("organizations"),
    email: v.optional(v.string()), // Optional: invite specific email
    role: v.union(v.literal("admin"), v.literal("member")),
    expiresAt: v.float64(),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("expired")),
    createdByUserId: v.id("users"),
  })
    .index("by_token", ["token"])
    .index("by_orgId", ["orgId"]),

  /**
   * Departments (formerly Orgs)
   */
  departments: defineTable({
    name: v.string(),
    slug: v.string(),
    orgId: v.optional(v.id("organizations")),
    plan: v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise")),
    createdAt: v.float64(),
  })
    .index("by_slug", ["slug"])
    .index("by_orgId", ["orgId"]),

  /**
   * Dept memberships (user ↔ dept)
   */
  deptMemberships: defineTable({
    userId: v.id("users"),
    departmentId: v.optional(v.id("departments")),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
    joinedAt: v.float64(),
  })
    .index("by_userId", ["userId"])
    .index("by_departmentId", ["departmentId"])
    .index("by_userId_departmentId", ["userId", "departmentId"]),

  /**
   * Agent templates (per-dept agent configuration)
   */
  agentTemplates: defineTable({
    departmentId: v.optional(v.id("departments")),
    name: v.string(),
    avatar: v.optional(v.string()),
    role: v.string(),
    description: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    capabilities: v.optional(v.array(v.string())),
    isPublic: v.boolean(),
    visibility: v.optional(v.union(v.literal("private"), v.literal("public"))),
    creatorId: v.optional(v.id("users")),
    installCount: v.int64(),
    rating: v.float64(),
    createdAt: v.float64(),
    createdByUserId: v.optional(v.id("users")),
    orgId: v.optional(v.any()),
  })
    .index("by_departmentId", ["departmentId"])
    .index("by_isPublic", ["isPublic"])
    .index("by_installCount", ["installCount"]),

  /**
   * Agentes do sistema
   */
  agents: defineTable({
    departmentId: v.optional(v.id("departments")),
    name: v.string(),
    avatar: v.optional(v.string()),
    role: v.string(),
    sessionKey: v.string(),
    status: agentStatus,
    currentTaskId: v.optional(v.id("tasks")),
    lastSeenAt: v.optional(v.float64()),
    orgId: v.optional(v.any()),
    // [NEW] Fields for Custom Agents
    allowedTools: v.optional(v.array(v.string())),
    systemPrompt: v.optional(v.string()), // The "Soul"
    description: v.optional(v.string()), // Short description for UI display
  })
    .index("by_sessionKey", ["sessionKey"])
    .index("by_departmentId", ["departmentId"])
    .index("by_dept_sessionKey", ["departmentId", "sessionKey"]),

  /**
   * Tasks (Kanban)
   */
  tasks: defineTable({
    departmentId: v.optional(v.id("departments")),
    parentTaskId: v.optional(v.id("tasks")),
    title: v.string(),
    description: v.string(),
    createdBySessionKey: v.optional(v.string()),
    createdByName: v.optional(v.string()),
    status: taskStatus,
    assigneeSessionKeys: v.array(v.string()),
    parentNotifiedAt: v.optional(v.float64()),
    brainLockOwner: v.optional(v.string()),
    brainLockExpiresAt: v.optional(v.float64()),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    tags: v.optional(v.array(v.string())),
    createdAt: v.optional(v.float64()),
    doneClearedAt: v.optional(v.float64()),
    embedding: v.optional(v.array(v.float64())),
    embeddingModel: v.optional(v.string()),
    embeddedAt: v.optional(v.float64()),
    orgId: v.optional(v.any()),
  })
    .index("by_status", ["status"])
    .index("by_departmentId", ["departmentId"])
    .index("by_parentTaskId", ["parentTaskId"])
    .index("by_department_parentTaskId", ["departmentId", "parentTaskId"])
    .index("by_dept_status", ["departmentId", "status"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["departmentId", "status"],
    }),

  /**
   * Mensagens (thread por task)
   */
  messages: defineTable({
    departmentId: v.optional(v.id("departments")),
    taskId: v.id("tasks"),
    fromSessionKey: v.string(),
    content: v.string(),
    createdAt: v.float64(),
    orgId: v.optional(v.any()),
  })
    .index("by_taskId", ["taskId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_departmentId", ["departmentId"])
    .index("by_department_taskId", ["departmentId", "taskId"]),

  /**
   * Leituras de thread (reader idempotente)
   */
  thread_reads: defineTable({
    departmentId: v.optional(v.id("departments")),
    taskId: v.id("tasks"),
    readerSessionKey: v.string(),
    lastSeenCreatedAt: v.float64(),
    lastCheckpointMessageId: v.optional(v.id("messages")),
    updatedAt: v.float64(),
    orgId: v.optional(v.any()),
  })
    .index("by_task_reader", ["taskId", "readerSessionKey"])
    .index("by_reader", ["readerSessionKey"])
    .index("by_departmentId", ["departmentId"])
    .index("by_dept_task_reader", ["departmentId", "taskId", "readerSessionKey"]),

  /**
   * Feed global de atividades
   */
  activities: defineTable({
    departmentId: v.optional(v.id("departments")),
    type: v.string(),
    message: v.string(),
    sessionKey: v.optional(v.string()),
    actorName: v.optional(v.string()),
    actorType: v.optional(
      v.union(v.literal("agent"), v.literal("user"), v.literal("system"))
    ),
    actorHandle: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
    createdAt: v.float64(),
    orgId: v.optional(v.any()),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_department_createdAt", ["departmentId", "createdAt"]),

  /**
   * Documentos
   */
  documents: defineTable({
    departmentId: v.optional(v.id("departments")),
    title: v.string(),
    content: v.string(),
    type: v.union(
      v.literal("deliverable"),
      v.literal("research"),
      v.literal("protocol"),
      v.literal("note")
    ),
    taskId: v.optional(v.id("tasks")),
    createdAt: v.float64(),
    createdBySessionKey: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())),
    embeddingModel: v.optional(v.string()),
    embeddedAt: v.optional(v.float64()),
    orgId: v.optional(v.any()),
  })
    .index("by_taskId", ["taskId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_department_taskId", ["departmentId", "taskId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["departmentId", "type"],
    }),

  /**
   * AI Assets (generated by agents: images, reports, outputs)
   */
  aiAssets: defineTable({
    departmentId: v.optional(v.id("departments")),
    title: v.string(),
    content: v.string(),
    type: v.union(
      v.literal("deliverable"),
      v.literal("research"),
      v.literal("protocol"),
      v.literal("note")
    ),
    taskId: v.optional(v.id("tasks")),
    createdAt: v.float64(),
    createdBySessionKey: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())),
    embeddingModel: v.optional(v.string()),
    embeddedAt: v.optional(v.float64()),
    orgId: v.optional(v.any()),
  })
    .index("by_taskId", ["taskId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_department_taskId", ["departmentId", "taskId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["departmentId", "type"],
    }),

  /**
   * Knowledge Base (uploaded/curated company knowledge)
   */
  knowledgeBase: defineTable({
    title: v.string(),
    text: v.string(),
    fileStorageId: v.optional(v.id("_storage")),
    orgId: v.optional(v.id("organizations")),
    departmentId: v.optional(v.id("departments")),
    embedding: v.optional(v.array(v.float64())),
    embeddingModel: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        filename: v.optional(v.string()),
        type: v.optional(v.string()),
      })
    ),
    createdAt: v.float64(),
    updatedAt: v.optional(v.float64()),
  })
    .index("by_orgId", ["orgId"])
    .index("by_departmentId", ["departmentId"])
    .index("by_department_createdAt", ["departmentId", "createdAt"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["departmentId", "orgId"],
    }),

  /**
   * Notificações
   */
  notifications: defineTable({
    departmentId: v.optional(v.id("departments")),
    mentionedSessionKey: v.string(),
    content: v.string(),
    delivered: v.boolean(),
    createdAt: v.float64(),
    deliveredAt: v.optional(v.float64()),
    taskId: v.optional(v.id("tasks")),
    orgId: v.optional(v.any()),

    // 🔽 campos novos (necessários para idempotência por mensagem)
    source: v.optional(v.union(v.literal("mention"), v.literal("subscription"))),
    sourceMessageId: v.optional(v.id("messages")),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_delivered", ["delivered"])
    .index("by_mentionedSessionKey", ["mentionedSessionKey"])
    .index("by_mentioned_delivered_createdAt", [
      "mentionedSessionKey",
      "delivered",
      "createdAt",
    ])
    // ✅ índice exigido pelo createIfNotExists
    .index("by_message_recipient", ["sourceMessageId", "mentionedSessionKey"])
    .index("by_departmentId", ["departmentId"])
    .index("by_department_mentioned_delivered_createdAt", ["departmentId", "mentionedSessionKey", "delivered", "createdAt"]),

  /**
   * Subscrições de thread
   */
  thread_subscriptions: defineTable({
    departmentId: v.optional(v.id("departments")),
    taskId: v.id("tasks"),
    sessionKey: v.string(),
    subscribedAt: v.float64(),
    lastNotifiedAt: v.optional(v.float64()),
    reason: v.optional(
      v.union(
        v.literal("commented"),
        v.literal("assigned"),
        v.literal("mentioned"),
        v.literal("manual")
      )
    ),
    orgId: v.optional(v.any()),
  })
    .index("by_task_sessionKey", ["taskId", "sessionKey"])
    .index("by_taskId", ["taskId"])
    .index("by_sessionKey", ["sessionKey"])
    .index("by_department_taskId", ["departmentId", "taskId"])
    .index("by_dept_task_sessionKey", ["departmentId", "taskId", "sessionKey"]),

  /**
   * Execuções de executor (idempotência por runKey)
   */
  executor_runs: defineTable({
    departmentId: v.optional(v.id("departments")),
    taskId: v.id("tasks"),
    executorSessionKey: v.string(),
    runKey: v.string(),
    documentId: v.id("documents"),
    messageId: v.id("messages"),
    createdAt: v.float64(),
    orgId: v.optional(v.any()),
  })
    .index("by_task_runKey", ["taskId", "runKey"])
    .index("by_task_executor", ["taskId", "executorSessionKey"])
    .index("by_department_taskId", ["departmentId", "taskId"])
    .index("by_dept_task_runKey", ["departmentId", "taskId", "runKey"]),

  /**
   * UX Events (instrumentação mínima do fluxo)
   */
  uxEvents: defineTable({
    departmentId: v.optional(v.id("departments")),
    name: v.string(), // "action_triggered", etc
    ts: v.float64(), // Date.now()
    flowId: v.optional(v.string()),
    userId: v.optional(v.string()),
    state: v.optional(v.string()),
    meta: v.optional(v.any()),
    orgId: v.optional(v.any()),
  })
    .index("by_ts", ["ts"])
    .index("by_flowId_ts", ["flowId", "ts"])
    .index("by_userId_ts", ["userId", "ts"])
    .index("by_department_ts", ["departmentId", "ts"]),

  /**
   * Integrations (tokens and config for external services)
   */
  integrations: defineTable({
    departmentId: v.optional(v.id("departments")),
    orgId: v.optional(v.id("organizations")),
    name: v.string(),
    type: v.union(
      v.literal("openai"),
      v.literal("anthropic"),
      v.literal("telegram"),
      v.literal("gmail"),
      v.literal("tavily"),
      v.literal("resend"),
      v.literal("github"),
      v.literal("notion"),
      v.literal("twitter"),
      v.literal("dalle")
    ),
    config: v.any(), // Encrypted or sensitive fields usually go here
    authType: v.optional(v.string()),
    oauthStatus: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    createdAt: v.float64(),
  })
    .index("by_departmentId", ["departmentId"])
    .index("by_orgId", ["orgId"]),

  /**
   * Reviews for agent templates (1..5 stars)
   */
  reviews: defineTable({
    templateId: v.id("agentTemplates"),
    userId: v.id("users"),
    rating: v.number(),
    comment: v.optional(v.string()),
    createdAt: v.float64(),
    updatedAt: v.float64(),
  })
    .index("by_template", ["templateId"])
    .index("by_user_template", ["userId", "templateId"]),
});
