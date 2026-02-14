// convex/planLimits.ts (Conceitual)

export const PLANS = {
    starter: {
        maxOrgs: 1,
        maxDeptsPerOrg: 1,
        maxAgentsPerDept: 3,
        maxDocs: 5,
        allowedTools: ["web_search", "delegate_task"], // Sem GitHub/Notion
        allowTeamInvites: false,
    },
    pro: {
        maxOrgs: 1,
        maxDeptsPerOrg: 5,
        maxAgentsPerDept: 10,
        maxDocs: 50,
        allowedTools: "ALL",
        allowTeamInvites: false, // Uso individual potente
    },
    business: {
        maxOrgs: 5,
        maxDeptsPerOrg: 999,
        maxAgentsPerDept: 999,
        maxDocs: 999,
        allowedTools: "ALL",
        allowTeamInvites: true, // Colaboração
    }
};