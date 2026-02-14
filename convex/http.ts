// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { callback as gmailOAuthCallback } from "./tools/gmailOAuth";
import { webhook as stripeWebhook } from "./stripe";

const http = httpRouter();
auth.addHttpRoutes(http);

/**
 * Telegram Webhook Handler
 */
const handleTelegramWebhook = httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const deptSlug = pathParts[pathParts.length - 1];

    if (!deptSlug || !url.pathname.includes("/telegram-webhook")) {
        return new Response("Invalid webhook path", { status: 400 });
    }

    try {
        const body = await request.json();
        await ctx.runMutation(internal.telegram.handleUpdate, {
            deptSlug,
            update: body,
        });
        return new Response("OK", { status: 200 });
    } catch (err: any) {
        console.error("Telegram Webhook Error:", err);
        return new Response("Internal Error", { status: 500 });
    }
});

/**
 * Routes
 */
http.route({
    pathPrefix: "/telegram-webhook/",
    method: "POST",
    handler: handleTelegramWebhook,
});

// ✅ Gmail OAuth callback (Google redirect URI)
http.route({
    path: "/oauth/gmail/callback",
    method: "GET",
    handler: gmailOAuthCallback,
});

http.route({
    path: "/stripe",
    method: "POST",
    handler: stripeWebhook,
});

export default http;
