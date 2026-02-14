import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const cleanupOrphanAuthAccounts = mutation({
  args: {
    provider: v.optional(v.string()),
    accountId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const provider = args.provider ?? "password";
    const rows = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) => q.eq("provider", provider))
      .collect();

    let deleted = 0;
    for (const row of rows) {
      if (args.accountId && row.providerAccountId !== args.accountId) continue;
      const user = await ctx.db.get(row.userId);
      if (!user) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    }

    return { ok: true, deleted };
  },
});

