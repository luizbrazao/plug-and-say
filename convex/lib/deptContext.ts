import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Helper to get departmentId from an agent's sessionKey.
 * Useful for mutations/queries triggered by agents.
 */
export async function getDeptIdFromSession(
    ctx: QueryCtx | MutationCtx,
    sessionKey: string
): Promise<Id<"departments">> {
    const agent = await ctx.db
        .query("agents")
        .withIndex("by_sessionKey", (q) => q.eq("sessionKey", sessionKey))
        .unique();

    if (!agent?.departmentId) {
        throw new Error(`Agent with sessionKey "${sessionKey}" not found or missing departmentId`);
    }
    return agent.departmentId;
}

/**
 * Helper to require that a user is a member of a department.
 * Useful for user-facing queries/mutations.
 */
export async function requireDeptMembership(
    ctx: QueryCtx | MutationCtx,
    userId: Id<"users">,
    departmentId: Id<"departments">
): Promise<void> {
    const membership = await ctx.db
        .query("deptMemberships")
        .withIndex("by_userId_departmentId", (q) =>
            q.eq("userId", userId).eq("departmentId", departmentId)
        )
        .unique();

    if (!membership) {
        throw new Error("Access denied: not a member of this department");
    }

    // Security: Ensure user is also a member of the parent Organization
    const department = await ctx.db.get(departmentId);
    if (!department) throw new Error("Department not found");

    if (department.orgId) {
        const orgMembership = await ctx.db
            .query("orgMemberships")
            .withIndex("by_userId_orgId", (q) =>
                q.eq("userId", userId).eq("orgId", department.orgId!)
            )
            .unique();

        if (!orgMembership) {
            throw new Error("Access denied: You are not a member of the parent Organization");
        }
    }
}
