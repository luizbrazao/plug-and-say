import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id, Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = MutationCtx | QueryCtx;
export type OrgRole = "owner" | "admin" | "member";

function isOrgAdmin(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}

export async function requireAuthenticatedUser(ctx: Ctx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

export async function requireOrgMembership(
  ctx: Ctx,
  userId: Id<"users">,
  orgId: Id<"organizations">
): Promise<OrgRole> {
  const membership = await ctx.db
    .query("orgMemberships")
    .withIndex("by_userId_orgId", (q) => q.eq("userId", userId).eq("orgId", orgId))
    .unique();
  if (!membership) {
    throw new Error("Access denied: not a member of this organization.");
  }
  return membership.role;
}

export async function requireOrgAdminMembership(
  ctx: Ctx,
  userId: Id<"users">,
  orgId: Id<"organizations">
): Promise<OrgRole> {
  const role = await requireOrgMembership(ctx, userId, orgId);
  if (!isOrgAdmin(role)) {
    throw new Error("Access denied: admin or owner role required.");
  }
  return role;
}

export async function requireDepartmentWithOrg(
  ctx: Ctx,
  departmentId: Id<"departments">
): Promise<Doc<"departments"> & { orgId: Id<"organizations"> }> {
  const department = await ctx.db.get(departmentId);
  if (!department) throw new Error("Department not found.");
  if (!department.orgId) throw new Error("Department has no organization linked.");
  return department as Doc<"departments"> & { orgId: Id<"organizations"> };
}

export async function requireDepartmentOrgMembership(
  ctx: Ctx,
  userId: Id<"users">,
  departmentId: Id<"departments">
): Promise<{ department: Doc<"departments"> & { orgId: Id<"organizations"> }; role: OrgRole }> {
  const department = await requireDepartmentWithOrg(ctx, departmentId);
  const role = await requireOrgMembership(ctx, userId, department.orgId);
  return { department, role };
}

export async function requireDepartmentOrgAdminMembership(
  ctx: Ctx,
  userId: Id<"users">,
  departmentId: Id<"departments">
): Promise<{ department: Doc<"departments"> & { orgId: Id<"organizations"> }; role: OrgRole }> {
  const department = await requireDepartmentWithOrg(ctx, departmentId);
  const role = await requireOrgAdminMembership(ctx, userId, department.orgId);
  return { department, role };
}

