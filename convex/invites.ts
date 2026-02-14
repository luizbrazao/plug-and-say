// convex/invites.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { checkLimit } from "./plans";

// 7 days in milliseconds
const INVITE_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeEmail(email: string) {
    return email.trim().toLowerCase();
}

function generateInviteToken() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}


/**
 * Fetch the authed user's email from userProfiles (per your schema).
 */
async function getAuthedUserEmail(ctx: any, userId: any): Promise<string | null> {
    const profile = await ctx.db
        .query("userProfiles")
        .withIndex("by_userId", (q: any) => q.eq("userId", userId))
        .unique();

    const email = profile?.email;
    if (!email || typeof email !== "string") return null;
    return normalizeEmail(email);
}

/**
 * Generate a new invite link
 */
export const create = mutation({
    args: {
        orgId: v.id("organizations"),
        role: v.union(v.literal("admin"), v.literal("member")),
        email: v.optional(v.string()), // Optional specific email
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        // Verify requester is admin/owner of the org
        const membership = await ctx.db
            .query("orgMemberships")
            .withIndex("by_userId_orgId", (q) => q.eq("userId", userId).eq("orgId", args.orgId))
            .unique();

        if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
            throw new Error("Only admins can create invites");
        }
        await checkLimit(ctx, args.orgId, "team_invites");

        const token = generateInviteToken();
        const inviteEmail = args.email ? normalizeEmail(args.email) : undefined;

        await ctx.db.insert("invites", {
            token,
            orgId: args.orgId,
            role: args.role,
            email: inviteEmail,
            expiresAt: Date.now() + INVITE_EXPIRATION_MS,
            status: "pending",
            createdByUserId: userId,
        });

        return token;
    },
});

/**
 * Validate an invite token
 */
export const validate = query({
    args: { token: v.string() },
    handler: async (ctx, args) => {
        const invite = await ctx.db
            .query("invites")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .unique();

        if (!invite) return { valid: false as const, reason: "Invalid token" };
        if (invite.status !== "pending") return { valid: false as const, reason: `Invite is ${invite.status}` };
        if (invite.expiresAt < Date.now()) return { valid: false as const, reason: "Invite expired" };

        const org = await ctx.db.get(invite.orgId);

        return {
            valid: true as const,
            orgName: org?.name ?? "Organization",
            email: invite.email ?? null,
            boundToEmail: Boolean(invite.email),
            role: invite.role,
            expiresAt: invite.expiresAt,
        };
    },
});

/**
 * Accept an invite
 */
export const accept = mutation({
    args: { token: v.string() },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Unauthorized");

        const invite = await ctx.db
            .query("invites")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .unique();

        if (!invite || invite.status !== "pending" || invite.expiresAt < Date.now()) {
            throw new Error("Invalid or expired invite");
        }

        // ✅ Enforce email-bound invite (if invite.email exists)
        if (invite.email) {
            const authedEmail = await getAuthedUserEmail(ctx, userId);

            // If your product requires email-bound invites to ONLY work after profile has email set,
            // this is correct. If you'd rather allow acceptance and then force email later, change it.
            if (!authedEmail) {
                throw new Error("This invitation is restricted to a specific email. Please sign in with the invited email.");
            }

            if (normalizeEmail(invite.email) !== authedEmail) {
                throw new Error("This invitation is restricted to a different email address.");
            }
        }

        // Check if already a member
        const existing = await ctx.db
            .query("orgMemberships")
            .withIndex("by_userId_orgId", (q) => q.eq("userId", userId).eq("orgId", invite.orgId))
            .unique();

        if (existing) {
            return { ok: true as const, alreadyMember: true as const, orgId: invite.orgId };
        }

        // Add to Org
        await ctx.db.insert("orgMemberships", {
            userId,
            orgId: invite.orgId,
            role: invite.role,
            joinedAt: Date.now(),
        });

        // Mark invite as accepted (single-use)
        await ctx.db.patch(invite._id, { status: "accepted" });

        return { ok: true as const, alreadyMember: false as const, orgId: invite.orgId };
    },
});
