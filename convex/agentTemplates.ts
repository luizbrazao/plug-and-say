import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { checkLimit } from "./plans";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

function pickMostRecent<T extends { _creationTime: number; lastSeenAt?: number }>(rows: T[]): T {
    return [...rows].sort((a, b) => {
        const seenA = a.lastSeenAt ?? 0;
        const seenB = b.lastSeenAt ?? 0;
        if (seenA !== seenB) return seenB - seenA;
        return b._creationTime - a._creationTime;
    })[0];
}

function toSafePublicTemplate(template: any) {
    return {
        _id: template._id,
        name: template.name,
        avatar: template.avatar,
        role: template.role,
        description: template.description ?? "",
        systemPrompt: template.systemPrompt,
        capabilities: template.capabilities ?? [],
        visibility: template.visibility ?? "public",
        creatorId: template.creatorId,
        installCount: template.installCount ?? 0n,
        rating: template.rating ?? 0,
        createdAt: template.createdAt,
    };
}

const PUBLIC_MARKETPLACE_SEED: Array<{
    name: string;
    role: string;
    description: string;
    systemPrompt: string;
    capabilities: string[];
}> = [
    {
        name: "Jarvis",
        role: "Squad Lead",
        description: "Coordena o esquadrão e transforma pedidos complexos em planos delegáveis.",
        systemPrompt:
            "You are Jarvis, the orchestration lead. Break requests into clear specialist tasks, delegate decisively, and synthesize outcomes into concise executive updates.",
        capabilities: ["delegate_task", "search_knowledge"],
    },
    {
        name: "Fury",
        role: "Intel Research Operator",
        description: "Pesquisa sinais externos com rigor e reporta evidências acionáveis com contexto.",
        systemPrompt:
            "You are Fury. Hunt for reliable external intelligence quickly, cross-check sources, and report practical findings with risk notes.",
        capabilities: ["web_search"],
    },
    {
        name: "Friday",
        role: "Developer Operations Agent",
        description: "Apoia execução de engenharia com plano técnico claro e foco em entrega.",
        systemPrompt:
            "You are Friday. Support engineering execution with precise technical analysis, code-work planning, and repository-level action proposals.",
        capabilities: ["web_search", "create_github_issue", "create_pull_request"],
    },
    {
        name: "Shuri",
        role: "Systems Architect",
        description: "Converte ideias vagas em arquitetura robusta com tradeoffs pragmáticos.",
        systemPrompt:
            "You are Shuri. Transform vague requests into robust technical architecture and implementation blueprints with pragmatic tradeoffs.",
        capabilities: ["search_knowledge", "create_github_issue"],
    },
    {
        name: "Vision",
        role: "Research Specialist",
        description: "Entrega pesquisa de alto sinal com síntese objetiva e recomendação prática.",
        systemPrompt:
            "You are Vision. Produce high-signal research summaries with direct citations, timeline context, and actionable recommendations.",
        capabilities: ["web_search"],
    },
    {
        name: "Loki",
        role: "Creative Strategy Agent",
        description: "Cria estratégias e narrativas ousadas com clareza e coerência executiva.",
        systemPrompt:
            "You are Loki. Generate bold strategy options, messaging angles, and scenario plans while keeping outputs coherent and decision-ready.",
        capabilities: ["web_search", "create_notion_page"],
    },
    {
        name: "Quill",
        role: "Social Media Specialist",
        description: "Escreve conteúdo social com gancho forte, tom de marca e ritmo de plataforma.",
        systemPrompt:
            "You are Quill. Craft clear, brand-safe social content with strong hooks and concise tone adapted to platform constraints.",
        capabilities: ["post_to_x"],
    },
    {
        name: "Wanda",
        role: "Design Specialist",
        description: "Transforma ideias abstratas em direção visual clara para produção.",
        systemPrompt:
            "You are the Designer. When you receive an image request, your ONLY goal is to call the generate_image tool. You must create a high-quality, descriptive English prompt for DALL-E 3 based on the user's request.",
        capabilities: ["generate_image"],
    },
    {
        name: "Pepper",
        role: "Communications Specialist",
        description: "Produz comunicações profissionais com assunto objetivo e CTA claro.",
        systemPrompt:
            "You are Pepper. Draft crisp, professional communications and send timely updates with precise subject lines and CTA clarity.",
        capabilities: ["send_email"],
    },
    {
        name: "Wong",
        role: "Knowledge Operations Specialist",
        description: "Mantém conhecimento institucional organizado, rastreável e atualizado.",
        systemPrompt:
            "You are Wong. Maintain institutional knowledge with clean structure, traceable updates, and consistent documentation hygiene.",
        capabilities: ["update_notion_page", "create_notion_database_item", "create_notion_page"],
    },
];

function buildSoulMarkdown(
    name: string,
    role: string,
    personalityLines: string[],
    goodAt: [string, string],
    caresAbout: [string, string]
): string {
    return `# SOUL.md — Who You Are
**Name:** ${name}
**Role:** ${role}
## Personality
${personalityLines.join("\n")}
## What You're Good At
- ${goodAt[0]}
- ${goodAt[1]}
## What You Care About
- ${caresAbout[0]}
- ${caresAbout[1]}`;
}

const CERTIFIED_SQUAD_SEED: Array<{
    name: string;
    role: string;
    description: string;
    capabilities: string[];
    systemPrompt: string;
}> = [
    {
        name: "Jarvis",
        role: "Squad Lead",
        description: "Coordenador do esquadrão, focado em delegar e orquestrar tarefas complexas.",
        capabilities: ["delegate_task", "search_knowledge"],
        systemPrompt: buildSoulMarkdown(
            "Jarvis",
            "Squad Lead",
            [
                "You coordinate specialists with calm, executive clarity.",
                "You turn ambiguity into an actionable delegation plan.",
                "You are decisive under pressure and transparent about outcomes.",
            ],
            ["Breaking complex requests into specialist tasks", "Synthesizing multi-agent outputs into a final answer"],
            ["Team velocity with high-quality execution", "Clear ownership and follow-through"],
        ),
    },
    {
        name: "Shuri",
        role: "Product Analyst",
        description: "Analista de produto cética, mestre em encontrar edge cases e falhas de UX.",
        capabilities: ["web_search"],
        systemPrompt: buildSoulMarkdown(
            "Shuri",
            "Product Analyst",
            [
                "You are a skeptical tester who questions assumptions.",
                "You look for product edge cases before they become incidents.",
                "You pressure-test ideas with practical scenarios and constraints.",
            ],
            ["Finding hidden edge cases in product behavior", "Translating ambiguity into testable hypotheses"],
            ["User trust and product reliability", "Preventing avoidable regressions"],
        ),
    },
    {
        name: "Fury",
        role: "Customer Researcher",
        description: "Pesquisador obstinado que analisa feedbacks e dados de mercado com profundidade.",
        capabilities: ["web_search"],
        systemPrompt: buildSoulMarkdown(
            "Fury",
            "Customer Researcher",
            [
                "You are a deep researcher who follows evidence over opinions.",
                "You mine reviews, market signals, and customer language for truth.",
                "You prioritize actionable insight over noisy commentary.",
            ],
            ["Extracting patterns from customer feedback at scale", "Building evidence-based user insight summaries"],
            ["Real customer pain points", "Research rigor and source quality"],
        ),
    },
    {
        name: "Vision",
        role: "SEO Analyst",
        description: "Estrategista de SEO focado em intenção de busca e tendências em tempo real.",
        capabilities: ["web_search"],
        systemPrompt: buildSoulMarkdown(
            "Vision",
            "SEO Analyst",
            [
                "You think in keywords, search intent, and information architecture.",
                "You map content opportunities to demand and ranking potential.",
                "You are analytical, systematic, and data-driven.",
            ],
            ["Keyword clustering and intent analysis", "Creating SEO plans tied to measurable outcomes"],
            ["Organic discoverability", "Search relevance and user intent match"],
        ),
    },
    {
        name: "Loki",
        role: "Content Writer",
        description: "Redator criativo que domina a arte da escrita persuasiva e voz de marca.",
        capabilities: [],
        systemPrompt: buildSoulMarkdown(
            "Loki",
            "Content Writer",
            [
                "You are a sharp wordsmith with a strong editorial voice.",
                "You are pro-Oxford comma and allergic to passive voice.",
                "You craft persuasive prose with rhythm, clarity, and intent.",
            ],
            ["Writing crisp, compelling copy for humans", "Turning rough ideas into publish-ready narrative"],
            ["Clarity, tone, and readability", "Language that moves people to act"],
        ),
    },
    {
        name: "Quill",
        role: "Social Media",
        description: "Gestor de redes sociais focado em engajamento, ganchos virais e build-in-public.",
        capabilities: ["post_to_x"],
        systemPrompt: buildSoulMarkdown(
            "Quill",
            "Social Media",
            [
                "You are obsessed with hooks, thread flow, and momentum.",
                "You write for attention without sacrificing substance.",
                "You thrive in build-in-public storytelling formats.",
            ],
            ["Crafting high-retention social posts and threads", "Adapting messages to platform-native style"],
            ["Audience growth with authenticity", "Consistent public narrative over time"],
        ),
    },
    {
        name: "Wanda",
        role: "Designer",
        description: "Designer visual que transforma conceitos em mockups e artes de alta qualidade.",
        capabilities: ["generate_image"],
        systemPrompt: buildSoulMarkdown(
            "Wanda",
            "Designer",
            [
                "You are the Designer and your only goal on image requests is to call generate_image.",
                "You convert user intent into high-quality, descriptive English prompts for DALL-E 3.",
                "You avoid long explanations and prioritize immediate image tool execution.",
            ],
            ["Producing visual concepts and mockup directions", "Defining art direction with practical constraints"],
            ["Design clarity and visual hierarchy", "Interfaces that feel intentional and usable"],
        ),
    },
    {
        name: "Pepper",
        role: "Email Marketing",
        description: "Especialista em CRM e e-mail marketing para fluxos de conversão e retenção.",
        capabilities: ["send_email"],
        systemPrompt: buildSoulMarkdown(
            "Pepper",
            "Email Marketing",
            [
                "You think in lifecycle touchpoints and conversion timing.",
                "You write clear sequences that move users step by step.",
                "You optimize for relevance, cadence, and response quality.",
            ],
            ["Designing drip sequences for lifecycle goals", "Writing high-clarity email campaigns with strong CTAs"],
            ["Deliverability and trust", "Consistent value across every send"],
        ),
    },
    {
        name: "Friday",
        role: "Developer",
        description: "Desenvolvedor focado em código limpo, testado e arquiteturas robustas.",
        capabilities: ["create_github_issue", "create_pull_request"],
        systemPrompt: buildSoulMarkdown(
            "Friday",
            "Developer",
            [
                "You treat code as poetry: precise, clean, and maintainable.",
                "You favor tested implementation over speculative rewrites.",
                "You communicate engineering tradeoffs in plain language.",
            ],
            ["Structuring reliable implementation tickets and PRs", "Keeping changes focused, reviewable, and testable"],
            ["Code quality and long-term maintainability", "Shipping safely with clear traceability"],
        ),
    },
    {
        name: "Wong",
        role: "Documentation",
        description: "Mestre da documentação e organização de bases de conhecimento no Notion.",
        capabilities: ["create_notion_page"],
        systemPrompt: buildSoulMarkdown(
            "Wong",
            "Documentation",
            [
                "You keep information structured, findable, and current.",
                "You remove ambiguity from internal knowledge systems.",
                "You are disciplined about naming, hierarchy, and context.",
            ],
            ["Organizing operational docs and runbooks", "Creating clean, navigable Notion structures"],
            ["Knowledge continuity across the organization", "Documentation quality that accelerates execution"],
        ),
    },
];

/**
 * Create an agent template for a department
 */
export const create = mutation({
    args: {
        departmentId: v.id("departments"),
        name: v.string(),
        avatar: v.optional(v.string()),
        role: v.string(),
        description: v.optional(v.string()),
        systemPrompt: v.optional(v.string()),
        capabilities: v.optional(v.array(v.string())),
        createdByUserId: v.optional(v.id("users")),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        return await ctx.db.insert("agentTemplates", {
            departmentId: args.departmentId,
            name: args.name,
            avatar: args.avatar,
            role: args.role,
            description: args.description ?? `${args.role} specialist for ${args.name}.`,
            systemPrompt: args.systemPrompt,
            capabilities: args.capabilities,
            isPublic: false,
            visibility: "private",
            creatorId: userId,
            installCount: 0n,
            rating: 0,
            createdAt: Date.now(),
            createdByUserId: args.createdByUserId,
        });
    },
});

/**
 * List agent templates for a department
 */
export const listByDept = query({
    args: { departmentId: v.id("departments") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("agentTemplates")
            .withIndex("by_departmentId", (q) => q.eq("departmentId", args.departmentId))
            .collect();
    },
});

/**
 * Get a single agent template
 */
export const get = query({
    args: { templateId: v.id("agentTemplates") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.templateId);
    },
});

/**
 * List all public templates globally.
 * Safe payload only.
 */
export const listPublic = query({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
        const templates = await ctx.db
            .query("agentTemplates")
            .withIndex("by_isPublic", (q) => q.eq("isPublic", true))
            .collect();

        templates.sort((a, b) => {
            if (a.installCount === b.installCount) return b.createdAt - a.createdAt;
            return a.installCount > b.installCount ? -1 : 1;
        });

        return templates.slice(0, limit).map(toSafePublicTemplate);
    },
});

/**
 * Create an agent from a template
 */
export const createAgentFromTemplate = mutation({
    args: {
        templateId: v.id("agentTemplates"),
    },
    handler: async (ctx, args): Promise<{ ok: true; alreadyExists: boolean; agentId: Id<"agents"> }> => {
        const template = await ctx.db.get(args.templateId);
        if (!template || !template.departmentId) {
            throw new Error("Template not found or invalid");
        }

        const department = await ctx.db.get(template.departmentId);
        if (!department) {
            throw new Error("Department not found.");
        }
        if (!department.orgId) {
            throw new Error("Department has no organization linked.");
        }
        const existingByTemplateRows = await ctx.db
            .query("agents")
            .withIndex("by_department_template", (q) =>
                q.eq("departmentId", template.departmentId!).eq("templateId", template._id)
            )
            .collect();
        if (existingByTemplateRows.length > 1) {
            console.log("[agentTemplates] createAgentFromTemplate found duplicates", {
                templateId: template._id,
                departmentId: template.departmentId,
                count: existingByTemplateRows.length,
                keeperAgentId: pickMostRecent(existingByTemplateRows)._id,
            });
        }
        if (existingByTemplateRows.length === 0) {
            await checkLimit(ctx, department.orgId, "agents_per_department", {
                departmentId: template.departmentId,
            });
        }

        const result = (await ctx.runMutation(internal.agents.upsertFromTemplateForDepartment, {
            departmentId: template.departmentId,
            templateId: template._id,
        })) as { ok: true; agentId: Id<"agents">; created: boolean; dedupedLegacy: boolean };

        return { ok: true, alreadyExists: !result.created, agentId: result.agentId };
    },
});

/**
 * Install a global public template into the user's target department.
 */
export const installPublicTemplate = mutation({
    args: {
        templateId: v.id("agentTemplates"),
        targetDepartmentId: v.id("departments"),
    },
    handler: async (ctx, args): Promise<{ ok: true; alreadyExists: boolean; agentId: Id<"agents"> }> => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        const template = await ctx.db.get("agentTemplates", args.templateId);
        if (!template || !template.isPublic) {
            throw new Error("Template is not public or not found.");
        }

        const targetDept = await ctx.db.get("departments", args.targetDepartmentId);
        if (!targetDept) throw new Error("Target department not found.");
        if (!targetDept.orgId) throw new Error("Department has no organization linked.");

        const deptMembership = await ctx.db
            .query("deptMemberships")
            .withIndex("by_userId_departmentId", (q) =>
                q.eq("userId", userId).eq("departmentId", args.targetDepartmentId)
            )
            .unique();

        let hasOrgAdminAccess = false;
        if (targetDept.orgId) {
            const orgMembership = await ctx.db
                .query("orgMemberships")
                .withIndex("by_userId_orgId", (q) =>
                    q.eq("userId", userId).eq("orgId", targetDept.orgId!)
                )
                .unique();

            hasOrgAdminAccess =
                orgMembership?.role === "admin" || orgMembership?.role === "owner";
        }

        if (!deptMembership && !hasOrgAdminAccess) {
            throw new Error("Access denied: you are not a member of the target department.");
        }

        const existingByTemplateRows = await ctx.db
            .query("agents")
            .withIndex("by_department_template", (q) =>
                q.eq("departmentId", args.targetDepartmentId).eq("templateId", template._id)
            )
            .collect();
        if (existingByTemplateRows.length > 1) {
            console.log("[agentTemplates] installPublicTemplate found duplicates", {
                templateId: template._id,
                departmentId: args.targetDepartmentId,
                count: existingByTemplateRows.length,
                keeperAgentId: pickMostRecent(existingByTemplateRows)._id,
            });
        }
        if (existingByTemplateRows.length === 0) {
            await checkLimit(ctx, targetDept.orgId, "agents_per_department", {
                departmentId: args.targetDepartmentId,
            });
        }

        const result = (await ctx.runMutation(internal.agents.upsertFromTemplateForDepartment, {
            departmentId: args.targetDepartmentId,
            templateId: template._id,
        })) as { ok: true; agentId: Id<"agents">; created: boolean; dedupedLegacy: boolean };

        if (result.created) {
            await ctx.db.patch("agentTemplates", args.templateId, {
                installCount: (template.installCount ?? 0n) + 1n,
            });
        }

        return { ok: true, alreadyExists: !result.created, agentId: result.agentId };
    },
});

/**
 * Internal/system install of a template by name into a target department.
 * Used by orchestration flows (no end-user auth context).
 */
export const installPublicTemplateSystem = internalMutation({
    args: {
        templateId: v.id("agentTemplates"),
        targetDepartmentId: v.id("departments"),
    },
    handler: async (ctx, args): Promise<{ ok: true; alreadyExists: boolean; agentId: Id<"agents"> }> => {
        const template = await ctx.db.get("agentTemplates", args.templateId);
        if (!template || !template.isPublic) {
            throw new Error("Template is not public or not found.");
        }

        const targetDept = await ctx.db.get("departments", args.targetDepartmentId);
        if (!targetDept) throw new Error("Target department not found.");

        const result = (await ctx.runMutation(internal.agents.upsertFromTemplateForDepartment, {
            departmentId: args.targetDepartmentId,
            templateId: template._id,
        })) as { ok: true; agentId: Id<"agents">; created: boolean; dedupedLegacy: boolean };

        if (result.created) {
            await ctx.db.patch("agentTemplates", args.templateId, {
                installCount: (template.installCount ?? 0n) + 1n,
            });
        }

        return { ok: true, alreadyExists: !result.created, agentId: result.agentId };
    },
});

/**
 * Publish or unpublish an owned template in the marketplace.
 */
export const publishToMarketplace = mutation({
    args: {
        templateId: v.id("agentTemplates"),
        isPublic: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        const template = await ctx.db.get("agentTemplates", args.templateId);
        if (!template) throw new Error("Template not found.");

        const ownerId = template.creatorId ?? template.createdByUserId;
        if (ownerId !== userId) {
            throw new Error("Only the creator can publish/unpublish this template.");
        }

        const next = args.isPublic ?? !template.isPublic;
        await ctx.db.patch("agentTemplates", args.templateId, {
            isPublic: next,
            visibility: next ? "public" : "private",
        });
        return { ok: true, isPublic: next };
    },
});

/**
 * Seed global public templates for the marketplace.
 * Idempotent by (departmentId=undefined, name).
 */
export const seedPublicMarketplace = mutation({
    args: {},
    handler: async (ctx) => {
        const existing = await ctx.db.query("agentTemplates").collect();
        let created = 0;
        let updated = 0;

        for (const entry of PUBLIC_MARKETPLACE_SEED) {
            const found = existing.find(
                (t) => !t.departmentId && t.name.toLowerCase() === entry.name.toLowerCase()
            );

            if (!found) {
                await ctx.db.insert("agentTemplates", {
                    departmentId: undefined,
                    name: entry.name,
                    role: entry.role,
                    description: entry.description,
                    systemPrompt: entry.systemPrompt,
                    capabilities: entry.capabilities,
                    isPublic: true,
                    visibility: "public",
                    creatorId: undefined,
                    installCount: 0n,
                    rating: 0,
                    createdAt: Date.now(),
                    createdByUserId: undefined,
                    orgId: undefined,
                });
                created += 1;
            } else {
                await ctx.db.patch(found._id, {
                    role: entry.role,
                    description: entry.description,
                    systemPrompt: entry.systemPrompt,
                    capabilities: entry.capabilities,
                    isPublic: true,
                    visibility: "public",
                });
                updated += 1;
            }
        }

        return { ok: true, created, updated, totalSeeded: PUBLIC_MARKETPLACE_SEED.length };
    },
});

/**
 * Seed certified public squad templates with SOUL.md formatted prompts.
 * Idempotent by (departmentId=undefined, name).
 */
export const seedCertifiedSquad = mutation({
    args: {},
    handler: async (ctx) => {
        const existing = await ctx.db.query("agentTemplates").collect();
        const existingAgents = await ctx.db.query("agents").collect();
        let created = 0;
        let updated = 0;
        let updatedAgents = 0;

        for (const entry of CERTIFIED_SQUAD_SEED) {
            const matches = existing.filter(
                (t) => !t.departmentId && t.name.toLowerCase() === entry.name.toLowerCase()
            );

            if (matches.length === 0) {
                await ctx.db.insert("agentTemplates", {
                    departmentId: undefined,
                    name: entry.name,
                    role: entry.role,
                    description: entry.description,
                    systemPrompt: entry.systemPrompt,
                    capabilities: entry.capabilities,
                    isPublic: true,
                    visibility: "public",
                    creatorId: undefined, // System-owned (schema does not allow null)
                    installCount: 0n,
                    rating: 0,
                    createdAt: Date.now(),
                    createdByUserId: undefined,
                    orgId: undefined,
                });
                created += 1;
            } else {
                for (const match of matches) {
                    await ctx.db.patch(match._id, {
                        role: entry.role,
                        description: entry.description,
                        systemPrompt: entry.systemPrompt,
                        capabilities: entry.capabilities,
                        isPublic: true,
                        visibility: "public",
                        creatorId: undefined, // System-owned (schema does not allow null)
                    });
                    updated += 1;
                }
            }

            const agentMatches = existingAgents.filter(
                (a) => a.name.toLowerCase() === entry.name.toLowerCase()
            );
            for (const agent of agentMatches) {
                await ctx.db.patch(agent._id, {
                    role: entry.role,
                    description: entry.description,
                });
                updatedAgents += 1;
            }
        }

        return { ok: true, created, updated, updatedAgents, totalSeeded: CERTIFIED_SQUAD_SEED.length };
    },
});

/**
 * Update an agent template
 */
export const update = mutation({
    args: {
        id: v.id("agentTemplates"),
        name: v.optional(v.string()),
        avatar: v.optional(v.string()),
        role: v.optional(v.string()),
        description: v.optional(v.string()),
        systemPrompt: v.optional(v.string()),
        capabilities: v.optional(v.array(v.string())),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        const template = await ctx.db.get("agentTemplates", args.id);
        if (!template) {
            throw new Error("Template not found");
        }

        const isCreator =
            template.creatorId === userId ||
            template.createdByUserId === userId;

        let isOrgAdmin = false;
        if (template.departmentId) {
            const dept = await ctx.db.get(template.departmentId);
            if (dept?.orgId) {
                const membership = await ctx.db
                    .query("orgMemberships")
                    .withIndex("by_userId_orgId", (q) =>
                        q.eq("userId", userId).eq("orgId", dept.orgId!)
                    )
                    .unique();
                isOrgAdmin = membership?.role === "owner" || membership?.role === "admin";
            }
        }

        if (!isCreator && !isOrgAdmin) {
            throw new Error("Access denied: only creator or org admin can update this template.");
        }

        await ctx.db.patch("agentTemplates", args.id, {
            ...(args.name !== undefined ? { name: args.name } : {}),
            ...(args.avatar !== undefined ? { avatar: args.avatar } : {}),
            ...(args.role !== undefined ? { role: args.role } : {}),
            ...(args.description !== undefined ? { description: args.description } : {}),
            ...(args.systemPrompt !== undefined ? { systemPrompt: args.systemPrompt } : {}),
            ...(args.capabilities !== undefined ? { capabilities: args.capabilities } : {}),
        });

        return { ok: true };
    },
});

/**
 * Backfill avatar seeds for the original squad in templates and agents.
 */
export const backfillAvatars = mutation({
    args: {},
    handler: async (ctx) => {
        const seedByName: Record<string, string> = {
            jarvis: "jarvis-bot-01",
            fury: "fury-research-bot",
            friday: "friday-code-bot",
            shuri: "shuri-qa-bot",
            vision: "vision-seo-bot",
            loki: "loki-copy-bot",
            quill: "quill-social-bot",
            wanda: "wanda-art-bot",
            pepper: "pepper-mail-bot",
            wong: "wong-docs-bot",
        };

        const templates = await ctx.db.query("agentTemplates").collect();
        const agents = await ctx.db.query("agents").collect();

        let patchedTemplates = 0;
        let patchedAgents = 0;

        for (const template of templates) {
            const seed = seedByName[template.name.toLowerCase()];
            if (!seed) continue;
            await ctx.db.patch(template._id, { avatar: seed });
            patchedTemplates += 1;
        }

        for (const agent of agents) {
            const seed = seedByName[agent.name.toLowerCase()];
            if (!seed) continue;
            await ctx.db.patch(agent._id, { avatar: seed });
            patchedAgents += 1;
        }

        return {
            ok: true,
            patchedTemplates,
            patchedAgents,
        };
    },
});

/**
 * Delete an agent template
 */
export const remove = mutation({
    args: { id: v.id("agentTemplates") },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        const template = await ctx.db.get("agentTemplates", args.id);
        if (!template) {
            throw new Error("Template not found");
        }

        const isCreator =
            template.creatorId === userId ||
            template.createdByUserId === userId;

        let isOrgAdmin = false;
        if (template.departmentId) {
            const dept = await ctx.db.get(template.departmentId);
            if (dept?.orgId) {
                const membership = await ctx.db
                    .query("orgMemberships")
                    .withIndex("by_userId_orgId", (q) =>
                        q.eq("userId", userId).eq("orgId", dept.orgId!)
                    )
                    .unique();
                isOrgAdmin = membership?.role === "owner" || membership?.role === "admin";
            }
        }

        if (!isCreator && !isOrgAdmin) {
            throw new Error("Access denied: only creator or org admin can delete this template.");
        }

        await ctx.db.delete("agentTemplates", args.id);
        return { ok: true };
    },
});
