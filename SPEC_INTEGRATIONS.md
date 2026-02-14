# SPEC: Integrations & External Channels

This specification defines how Plug and Say interacts with external platforms like Telegram and Email.

## 1. Telegram Webhook Bridge

### Inbound Flow (Telegram -> Dashboard)
1. **Webhook Endpoint**: `POST /telegram-webhook/<dept_slug>`
   - The department slug in the URL allows us to immediately identify the `departmentId`.
2. **Message Routing**:
   - Convex `httpAction` parses the update.
   - If a task/thread associated with that Telegram `chat_id` exists: Add a message to it.
   - If not: Create a new Task titled "Telegram Chat: <User Name>".
3. **Agent Trigger**: `messages:create` is called, which automatically triggers the "Brain" pipeline.

### Outbound Flow (Dashboard -> Telegram)
1. **Brain Detection**: The Brain identifies that a task has a `telegram_chat_id` in its metadata.
2. **Dispatch**: Instead of (or in addition to) writing to the board, the Brain calls `api.telegram.sendMessage`.

## 2. Integration Management UI

### Settings View
A new tab/page in the Dashboard for `Owner/Admin` users to manage:
- `TELEGRAM_BOT_TOKEN`
- `OPENAI_API_KEY` (allowing departments to bring their own bills)
- `RESEND_API_KEY` for the email tool.

## 3. Tool Framework Expansion

### Pilot: `send_email` Tool
- **Capability**: `["email_send"]`
- **Protocol**: `[TOOL: send_email ARG: { to: "...", subject: "...", body: "..." }]`
- **Logic**: Fetch `RESEND_API_KEY` from the `integrations` table for the active department.

### Marketplace Transparency
In `AgentStore.tsx`, templates will display a "Requires" list based on their capabilities:
- `["email_send"]` -> Displays: "🔴 Requires Email Integration".

🦾 **Objective**: Transform Plug and Say from a siloed dashboard into a proactive communication hub.
