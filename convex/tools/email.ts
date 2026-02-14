import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

/**
 * internal:tools:email:sendEmail
 * Sends an email using the department's configured RESEND_API_KEY.
 */
export const sendEmail = internalAction({
    args: {
        departmentId: v.id("departments"),
        to: v.string(),
        subject: v.string(),
        body: v.string(),
    },
    handler: async (ctx, args): Promise<any> => {
        // 1. Fetch Resend integration
        const integration: any = await ctx.runQuery(internal.integrations.getByTypeForDepartment, {
            departmentId: args.departmentId,
            type: "resend",
        });

        if (!integration || !integration.config || !integration.config.token) {
            throw new Error("Resend (Email) integration not configured for this department.");
        }
        const fromEmail = integration.config.fromEmail || "onboarding@resend.dev";

        console.log(`[TOOL: send_email] Sending to ${args.to}: ${args.subject}`);

        // Call Resend API
        const response: Response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${integration.config.token}`,
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

        return { ok: true, sentAt: Date.now() };
    },
});

/**
 * getResendIntegration
 * Helper to find the email integration.
 */
export const getResendIntegration = internal.integrations.getByTypeForDepartment as any;
