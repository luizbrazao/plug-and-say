# SPEC: Telegram Multi-tenant Bridge

This document specifies the real-time bridge between external Telegram bots and Plug and Say departments.

## 1. Webhook Infrastructure

### URL Pattern
`POST https://<CONVEX_SITE_URL>/telegram-webhook/<DEPT_SLUG>`

### Request Flow
1.  **Telegram** hits the endpoint with an `Update` object.
2.  **`convex/http.ts`** extracts `<DEPT_SLUG>` and passes the body to `internal.telegram.handleUpdate`.
3.  **`handleUpdate`** resolves the `departmentId` via the slug.

## 2. Inbound Routing (Telegram -> MC)

### Thread Mapping
To maintain a continuous conversation per user:
-   **Identity**: Each Telegram user is identified by their `chat_id`.
-   **Task Title**: `Telegram Chat: <FirstName> (<ChatID>)`
-   **Lookup**: `ctx.db.query("tasks").withIndex("by_departmentId")` and filtering by title.
-   **Action**: 
    -   If Task exists: Use it.
    -   If Task missing: Insert a new Task with `status: "inbox"`.

### Message Creation
-   Incoming text is inserted into the `messages` table.
-   `fromSessionKey`: `user:telegram:<chatId>`.

## 3. Outbound Routing (MC -> Telegram)

### Trigger
-   `api.messages.create` triggers `internal.brain.onNewMessage`.
-   Agent "thinks" and generates a response.

### Dispatch
-   `internal.brain.think` checks if the task title matches the Telegram pattern.
-   Extracts `chatId` from parentheses in the title.
-   Calls `api.telegram.sendMessage` with `departmentId` and `chatId`.
-   `sendMessage` looks up the **`telegram`** integration for that department to get the **Bot Token**.

## 4. Activation Flow

To activate a bot:
1.  User adds Telegram Integration in MC Settings (provides Name and Token).
2.  System (or manual trigger) calls `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WEBHOOK_URL>`.
3.  Bot is now live and talking to Plug and Say.
