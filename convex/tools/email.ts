import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

/**
 * internal:tools:email:sendEmail
 * Sends an email using Resend when configured, otherwise falls back to org-level Gmail OAuth.
 */
export const sendEmail = internalAction({
    args: {
        departmentId: v.id("departments"),
        to: v.string(),
        subject: v.string(),
        body: v.string(),
    },
    handler: async (ctx, args): Promise<any> => {
        const resendIntegration: any = await ctx.runQuery(internal.integrations.getByTypeForDepartment, {
            departmentId: args.departmentId,
            type: "resend",
        });

        const resendToken =
            typeof resendIntegration?.config?.token === "string" &&
            resendIntegration.config.token.trim().length > 0
                ? resendIntegration.config.token.trim()
                : "";
        if (resendToken) {
            const fromEmail = resendIntegration.config.fromEmail || "onboarding@resend.dev";
            console.log("[tools.email.sendEmail] provider=resend", {
                departmentId: String(args.departmentId),
                to: args.to,
                subject: args.subject,
            });

            const response: Response = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${resendToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    from: `PlugandSay <${fromEmail}>`,
                    to: args.to,
                    subject: args.subject,
                    html: `<div style="font-family: sans-serif;">${args.body}</div>`,
                }),
            });

            if (!response.ok) {
                const err: string = await response.text();
                throw new Error(`Resend API Error: ${err}`);
            }

            return { ok: true, provider: "resend", sentAt: Date.now() };
        }

        const gmailIntegration: any = await ctx.runQuery(internal.integrations.getByTypeForDepartment, {
            departmentId: args.departmentId,
            type: "gmail",
        });
        console.log("[tools.email.sendEmail] provider=gmail candidate", {
            departmentId: String(args.departmentId),
            found: Boolean(gmailIntegration),
            oauthStatus: gmailIntegration?.oauthStatus ?? null,
        });
        if (gmailIntegration?.oauthStatus === "connected") {
            return await ctx.runAction(internal.tools.gmailTools.gmailSendEmail, {
                departmentId: args.departmentId,
                to: args.to,
                subject: args.subject,
                text: args.body,
            });
        }

        throw new Error("No email integration available. Configure Resend API key or connect Gmail OAuth.");
    },
});

/**
 * getResendIntegration
 * Helper to find the email integration.
 */
export const getResendIntegration = internal.integrations.getByTypeForDepartment as any;
