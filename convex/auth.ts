import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile: (params) => {
        const email = String(params.email ?? "");
        const name =
          typeof params.name === "string" && params.name.trim().length > 0
            ? params.name.trim()
            : undefined;
        return {
          email,
          ...(name ? { name } : {}),
        };
      },
    }),
  ],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, args) {
      const user = await ctx.db.get(args.userId);
      if (!user) return;

      const existingProfiles = await ctx.db.query("userProfiles").collect();
      const existing = existingProfiles.find((profile: any) => profile.userId === args.userId) ?? null;

      const userName = typeof (user as any).name === "string" ? (user as any).name.trim() : "";
      const userEmail = typeof (user as any).email === "string" ? (user as any).email.trim() : "";
      const now = Date.now();

      if (existing) {
        const patch: Record<string, unknown> = { updatedAt: now };
        if (!existing.displayName && userName) patch.displayName = userName;
        if (!existing.email && userEmail) patch.email = userEmail;
        if (!existing.role) patch.role = "Operator";
        if (!existing.language) patch.language = "pt-BR";
        await ctx.db.patch(existing._id, patch);
        return;
      }

      await ctx.db.insert("userProfiles", {
        userId: args.userId,
        displayName: userName || undefined,
        email: userEmail || undefined,
        role: "Operator",
        language: "pt-BR",
        createdAt: now,
        updatedAt: now,
      });
    },
  },
});
