# SPEC: Agent Execution Pipeline ("The Brain")

This specification outlines the architecture for making agents autonomous and responsive within Plug and Say.

## 1. Schema Extensions

### `integrations` Table
Stores tokens and configuration for external services per department.
```typescript
integrations: defineTable({
  departmentId: v.id("departments"),
  name: v.string(), // "Plug and Say Telegram", "CEO Gmail"
  type: v.union(v.literal("telegram"), v.literal("gmail"), v.literal("openai"), v.literal("anthropic")),
  config: v.any(), // { token: "...", apiKey: "...", ... }
  createdAt: v.float64(),
}).index("by_departmentId", ["departmentId"])
```

## 2. LLM Orchestration ("The Brain")

### Trigger Protocol
When `messages:create` is called:
1. Identify target agents (via @mentions or task assignment).
2. Schedule `internal.brain.processMessage` via `ctx.scheduler`.

### Brain Action Flow (`brain:processMessage`)
1. **Context Assembly**:
   - Fetch task description + metadata.
   - Fetch last 10 messages from `messages` (thread context).
   - Fetch Agent "Soul" (System prompt + capabilities from `agents` joined with `agentTemplates`).
2. **Thinking (LLM Call)**:
   - Construct prompt: `<Soul> \n <Task> \n <Context> \n <Tools>`.
   - Call LLM (OpenAI/Anthropic) via specialized action helper.
3. **Execution**:
   - If output is a direct response: `ctx.runMutation(api.messages.create, { ... })`.
   - If output is a tool call: Handle tool protocol (see below).

## 3. Tool Framework

### Declaration
Agents declare capabilities in `agentTemplates.capabilities` (e.g., `["web_search", "gmail_send"]`).

### Protocol
LLM is instructed to use a specific format for tools:
`[TOOL: <name> ARG: <json_args>]`

### Execution
1. Brain parses the format.
2. Validates if agent has the capability.
3. Executes tool (internally or via another action).
4. Pipes result back to brain context or as a "system" message.

## 4. Initial Pilot Implementation
- **Provider**: OpenAI (GPT-4o) or Anthropic (Claude 3.5 Sonnet).
- **First Tool**: `web_research` (stub or simple fetch).
- **Target**: Ensure @mentions trigger immediate agent responses in the Kanban thread.

🦾 **Objective**: Zero-latency perception (async trigger) and high-fidelity action (context-aware thinking).
