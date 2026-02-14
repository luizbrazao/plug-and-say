# SPEC_MAESTRO.md

## Objective
Enable Jarvis to act as Squad Lead (Maestro) by delegating work to other agents through a `delegate_task` tool, using **public tasks only** for full visibility.

## Product Decision
- Internal agent-to-agent communication will happen via **public Kanban tasks + task messages**.
- No private direct messages between agents in Phase 1.

## Current Baseline
- `brain.ts` already supports tool dispatch via `[TOOL: name ARG: {json}]` and permission checks (`allowedTools`).
- `tasks.create` can create and assign tasks via `assigneeSessionKeys`.
- `messages.create` can post initial instruction messages and trigger mention notifications.
- `brain.getAssembledContext` currently does not include team roster in prompt context.

## Phase 1: Tool Design (`delegate_task`)

### Tool Contract
Name: `delegate_task`

Arguments:
```ts
{
  "title": string,
  "description": string,
  "assignees": string[],
  "instruction": string,
  "priority"?: "low" | "medium" | "high",
  "tags"?: string[]
}
```

Expected behavior:
1. Resolve `assignees` (agent names) to `assigneeSessionKeys` in the same department.
2. Create a new public task in the same `departmentId`.
3. Post first instruction message to the new task from delegator agent.
4. Return created task metadata (`taskId`, `title`, `assigneesResolved`).

### Implementation Module
Create: `convex/tools/delegation.ts`

Function:
- `internalAction delegateTask({ departmentId, delegatorSessionKey, title, description, assignees, instruction, priority?, tags? })`

Internal steps:
1. Query `agents.by_departmentId`.
2. Resolve assignee names (case-insensitive), dedupe, validate non-empty.
3. `ctx.runMutation(api.tasks.create, { ... })`.
4. `ctx.runMutation(api.messages.create, { taskId, fromSessionKey: delegatorSessionKey, content: instruction })`.
5. Optionally prepend mentions in message (e.g. `@Dev Bot`) to notify humans/agents watching thread.

Error handling:
- If zero assignees resolve: throw clear error with unknown names.
- If instruction/title missing: validation error.

Security:
- Department-scoped only.
- Delegator must belong to same department (or be an existing agent in that dept).

## Phase 2: Brain Integration

### Tool Dispatcher
In `convex/brain.ts` `executeTool(...)`:
- Add case `delegate_task`.
- Map tool args into `internal.tools.delegation.delegateTask`.
- Pass `departmentId` and `agentSessionKey` (delegator identity).

### Prompt Update (Organizational Orchestration)
Enhance system prompt with delegation instruction:
- If agent is Squad Lead (Jarvis), it can delegate via `delegate_task`.
- Clarify that delegation creates a new public task and posts first instruction.

Recommended criteria for Squad Lead:
- `agent.sessionKey === "agent:jarvis:<dept>"` OR
- `agent.name.toLowerCase() === "jarvis"` OR
- future explicit flag (`isSquadLead`) on `agents`.

### Token/Loop discipline
- Keep existing max tool iterations (`MAX_TOOL_ITERATIONS = 2`).
- Return concise tool observation so LLM summarizes outcomes without token bloat.

## Phase 3: Squad Awareness in Brain

### Context Enrichment
Update `internal:brain:getAssembledContext` to fetch all department agents:
- `name`, `role`, `sessionKey`, `status`

Return payload extension:
```ts
{ ..., squad: Array<{name, role, sessionKey, status}> }
```

### Prompt Injection
For Squad Lead only, append:
```text
=== SQUAD ROSTER ===
- Name | Role | Status
...
=== END SQUAD ROSTER ===
```

Guidelines in prompt:
- Delegate to the most relevant role.
- Prefer explicit assignees.
- Use public tasks for coordination transparency.

## Phase 4: Allowed Tools & UX

### Tool permissions
- Ensure Jarvis templates/agents include `delegate_task` in `allowedTools`.
- Add `delegate_task` to `CreateAgentModal` available tools list (for custom squad leads).

### Observability
Optional but recommended:
- Include `[DELEGATED_TASK]` marker in tool result summary so UI can show badge.
- Track activity event `delegation_created` for analytics.

## API and Data Shape

### `tools/delegation:delegateTask` return
```ts
{
  ok: true,
  taskId: Id<"tasks">,
  title: string,
  assigneesResolved: string[],
  assigneesRequested: string[]
}
```

## Acceptance Criteria
1. Jarvis can call `delegate_task` from a normal thread.
2. A new task is created in the same department with resolved assignees.
3. First instruction message is posted automatically in that new task.
4. Assigned agents are triggered by current task/message brain triggers.
5. Jarvis system prompt includes squad roster (name + role) for orchestration.
6. No private agent DMs are introduced; delegation is fully visible in Kanban.

## Test Plan

### Functional
1. Mention Jarvis in a task: ask to split work between two agents.
2. Validate a new task appears with expected assignees.
3. Validate first message contains instruction.
4. Validate assignee agents are triggered (via existing `onNewTask`/mentions).

### Negative cases
1. Unknown assignee names -> clear error returned in thread.
2. Empty assignee list -> tool call failure with guidance.
3. Non-squad agent without `delegate_task` permission -> permission denied.

### Logging
- Confirm logs show `[TOOL: delegate_task]` execution.
- Confirm activity feed logs task creation + first message.

## Future Extensions (Post-Phase 1)
- Add dependency graph (`parentTaskId`, `blockedByTaskIds`) for richer orchestration.
- Add delegation policies (e.g., max concurrent tasks per agent).
- Add confidence-based reassignment and follow-up reminders.
