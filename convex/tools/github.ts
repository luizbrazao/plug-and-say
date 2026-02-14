import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

async function getGithubConfig(
    ctx: any,
    departmentId: any
): Promise<{ token: string; server: string; owner?: string; repo?: string }> {
    const integration: any = await ctx.runQuery(internal.integrations.getByTypeForDepartment, {
        departmentId,
        type: "github",
    });

    const token = integration?.config?.token;
    if (!token) {
        throw new Error("GitHub integration not configured for this department.");
    }
    const rawServer =
        typeof integration?.config?.server === "string" ? integration.config.server.trim() : "";
    const server = (rawServer || "https://api.github.com").replace(/\/$/, "");

    const owner = typeof integration?.config?.owner === "string" ? integration.config.owner.trim() : undefined;
    const repo = typeof integration?.config?.repo === "string" ? integration.config.repo.trim() : undefined;
    const user = typeof integration?.config?.user === "string" ? integration.config.user.trim() : undefined;
    const defaultRepo = typeof integration?.config?.defaultRepo === "string" ? integration.config.defaultRepo.trim() : undefined;
    let parsedOwner = owner || user;
    let parsedRepo = repo;
    if ((!parsedOwner || !parsedRepo) && defaultRepo && defaultRepo.includes("/")) {
        const [dOwner, dRepo] = defaultRepo.split("/", 2);
        parsedOwner = parsedOwner || dOwner?.trim();
        parsedRepo = parsedRepo || dRepo?.trim();
    }

    return {
        token,
        server,
        owner: parsedOwner,
        repo: parsedRepo,
    };
}

/**
 * internal:tools:github:createGithubIssue
 */
export const createGithubIssue = internalAction({
    args: {
        departmentId: v.id("departments"),
        owner: v.optional(v.string()),
        repo: v.optional(v.string()),
        title: v.string(),
        body: v.optional(v.string()),
        labels: v.optional(v.array(v.string())),
    },
    handler: async (ctx, args): Promise<any> => {
        const title = args.title.trim();
        if (!title) throw new Error("Tool 'create_github_issue' requires a non-empty 'title'.");

        const cfg = await getGithubConfig(ctx, args.departmentId);
        const owner = (args.owner || cfg.owner || "").trim();
        const repo = (args.repo || cfg.repo || "").trim();
        if (!owner || !repo) {
            throw new Error("Tool 'create_github_issue' requires 'owner' and 'repo' (args or integration config).");
        }

        const response = await fetch(`${cfg.server}/repos/${owner}/${repo}/issues`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${cfg.token}`,
                Accept: "application/vnd.github+json",
                "Content-Type": "application/json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            body: JSON.stringify({
                title,
                body: args.body,
                labels: args.labels,
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`GitHub API Error (create issue): ${err}`);
        }

        const payload: any = await response.json();
        return {
            ok: true,
            issueNumber: payload?.number,
            issueUrl: payload?.html_url,
            title: payload?.title,
            state: payload?.state,
        };
    },
});

/**
 * internal:tools:github:createPullRequest
 */
export const createPullRequest = internalAction({
    args: {
        departmentId: v.id("departments"),
        owner: v.optional(v.string()),
        repo: v.optional(v.string()),
        title: v.string(),
        head: v.string(),
        base: v.string(),
        body: v.optional(v.string()),
        draft: v.optional(v.boolean()),
    },
    handler: async (ctx, args): Promise<any> => {
        const title = args.title.trim();
        const head = args.head.trim();
        const base = args.base.trim();
        if (!title || !head || !base) {
            throw new Error("Tool 'create_pull_request' requires non-empty 'title', 'head', and 'base'.");
        }

        const cfg = await getGithubConfig(ctx, args.departmentId);
        const owner = (args.owner || cfg.owner || "").trim();
        const repo = (args.repo || cfg.repo || "").trim();
        if (!owner || !repo) {
            throw new Error("Tool 'create_pull_request' requires 'owner' and 'repo' (args or integration config).");
        }

        const response = await fetch(`${cfg.server}/repos/${owner}/${repo}/pulls`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${cfg.token}`,
                Accept: "application/vnd.github+json",
                "Content-Type": "application/json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            body: JSON.stringify({
                title,
                head,
                base,
                body: args.body,
                draft: args.draft ?? false,
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`GitHub API Error (create PR): ${err}`);
        }

        const payload: any = await response.json();
        return {
            ok: true,
            pullNumber: payload?.number,
            pullUrl: payload?.html_url,
            title: payload?.title,
            state: payload?.state,
        };
    },
});
