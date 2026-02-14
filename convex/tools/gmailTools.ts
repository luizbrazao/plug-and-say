import { internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";
import { getGmailIntegrationConfig, type GmailPower } from "./gmailClient";

type GmailCapabilitiesResponse = {
    ok: true;
    powers: GmailPower[];
    scopes: string[];
    hasRefreshToken: boolean;
    tokenExpiresAt: number | null;
    oauthStatus: string | null;
};

export const gmailListInbox = internalAction({
    args: {
        departmentId: v.id("departments"),
        q: v.optional(v.string()),
        maxResults: v.optional(v.number()),
        pageToken: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<unknown> => {
        return await ctx.runAction((api as any).tools.gmailApi.listMessages, args);
    },
});

export const gmailGetMessage = internalAction({
    args: {
        departmentId: v.id("departments"),
        messageId: v.string(),
        format: v.optional(
            v.union(v.literal("minimal"), v.literal("full"), v.literal("metadata"), v.literal("raw"))
        ),
    },
    handler: async (ctx, args): Promise<unknown> => {
        return await ctx.runAction((api as any).tools.gmailApi.getMessage, args);
    },
});

export const gmailListLabels = internalAction({
    args: {
        departmentId: v.id("departments"),
    },
    handler: async (ctx, args): Promise<unknown> => {
        return await ctx.runAction((api as any).tools.gmailApi.listLabels, args);
    },
});

export const gmailGetCapabilities = internalAction({
    args: {
        departmentId: v.id("departments"),
    },
    handler: async (ctx, args): Promise<GmailCapabilitiesResponse> => {
        const department = await ctx.runQuery(api.departments.get, {
            departmentId: args.departmentId,
        });
        if (!department?.orgId) {
            return {
                ok: true,
                powers: [],
                scopes: [],
                hasRefreshToken: false,
                tokenExpiresAt: null,
                oauthStatus: null,
            };
        }
        const integration: any = await ctx.runQuery(internal.integrations.getByType, {
            orgId: department.orgId,
            type: "gmail",
        });

        if (!integration) {
            return {
                ok: true,
                powers: [],
                scopes: [],
                hasRefreshToken: false,
                tokenExpiresAt: null,
                oauthStatus: null,
            };
        }

        const { config, powers, scopes } = await getGmailIntegrationConfig(ctx, args.departmentId);
        return {
            ok: true,
            powers,
            scopes,
            hasRefreshToken: Boolean(typeof config.refreshToken === "string" && config.refreshToken.trim()),
            tokenExpiresAt:
                typeof config.tokenExpiresAt === "number" && Number.isFinite(config.tokenExpiresAt)
                    ? config.tokenExpiresAt
                    : null,
            oauthStatus:
                typeof integration.oauthStatus === "string" && integration.oauthStatus.trim()
                    ? integration.oauthStatus
                    : null,
        };
    },
});

export const gmailSendEmail = internalAction({
    args: {
        departmentId: v.id("departments"),
        to: v.string(),
        subject: v.string(),
        text: v.optional(v.string()),
        html: v.optional(v.string()),
        cc: v.optional(v.string()),
        bcc: v.optional(v.string()),
        replyTo: v.optional(v.string()),
        threadId: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<unknown> => {
        console.log("[gmailTools.gmailSendEmail] start", {
            departmentId: String(args.departmentId),
        });
        return await ctx.runAction((api as any).tools.gmailApi.sendMessage, args);
    },
});

export const gmailMarkRead = internalAction({
    args: {
        departmentId: v.id("departments"),
        messageId: v.string(),
    },
    handler: async (ctx, args): Promise<unknown> => {
        return await ctx.runAction((api as any).tools.gmailApi.modifyMessageLabels, {
            departmentId: args.departmentId,
            messageId: args.messageId,
            removeLabelIds: ["UNREAD"],
        });
    },
});

export const gmailMarkUnread = internalAction({
    args: {
        departmentId: v.id("departments"),
        messageId: v.string(),
    },
    handler: async (ctx, args): Promise<unknown> => {
        return await ctx.runAction((api as any).tools.gmailApi.modifyMessageLabels, {
            departmentId: args.departmentId,
            messageId: args.messageId,
            addLabelIds: ["UNREAD"],
        });
    },
});

export const gmailArchiveMessage = internalAction({
    args: {
        departmentId: v.id("departments"),
        messageId: v.string(),
    },
    handler: async (ctx, args): Promise<unknown> => {
        // In Gmail, archive is removing the INBOX label.
        return await ctx.runAction((api as any).tools.gmailApi.modifyMessageLabels, {
            departmentId: args.departmentId,
            messageId: args.messageId,
            removeLabelIds: ["INBOX"],
        });
    },
});

export const gmailUnarchiveMessage = internalAction({
    args: {
        departmentId: v.id("departments"),
        messageId: v.string(),
    },
    handler: async (ctx, args): Promise<unknown> => {
        return await ctx.runAction((api as any).tools.gmailApi.modifyMessageLabels, {
            departmentId: args.departmentId,
            messageId: args.messageId,
            addLabelIds: ["INBOX"],
        });
    },
});
