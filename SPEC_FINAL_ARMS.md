# SPEC_FINAL_ARMS.md

## Objective
Make the squad fully operational by adding the final integration "arms" for design, development, knowledge ops, and social publishing:
- Wanda: image generation (`generate_image`)
- Friday: GitHub operations (`create_github_issue`, `create_pull_request`)
- Wong: Notion operations (`update_notion_page`, `create_notion_database_item`)
- Quill: X/Twitter publishing (`post_to_x`)

## Scope
This spec covers:
1. Integration schema/types updates.
2. Backend tool modules and tool contracts.
3. Dept settings UI for new integrations.
4. Squad capability alignment updates.

This spec does not include advanced OAuth onboarding UI flows (Phase 2+), only BYOK/API-token based operation consistent with current platform behavior.

## Current Baseline
- `integrations` table supports department-scoped provider configs and BYOK pattern.
- `brain.ts` already supports tool dispatch via `[TOOL: name ARG: {json}]` and permission checks with `allowedTools`.
- Existing tools follow `internalAction` execution and provider key lookup via `internal.integrations.getByType`.

## Phase 1: Schema and Integration Types

### 1.1 Update `convex/schema.ts`
Extend integration `type` union to include:
- `"github"`
- `"notion"`
- `"twitter"`
- `"dalle"`

### 1.2 Update `convex/integrations.ts`
Extend both `upsert` and `getByType` `type` unions with the same new literals.

### 1.3 Expected config shapes (convention)
- `dalle`: `{ token: string }` (OpenAI key; may reuse existing `openai` key as fallback)
- `github`: `{ token: string, owner?: string, repo?: string }`
- `notion`: `{ token: string, workspaceId?: string }`
- `twitter`: `{ bearerToken?: string, apiKey?: string, apiSecret?: string, accessToken?: string, accessSecret?: string }`

Note: keep config as `v.any()`; validate required fields at tool runtime with clear errors.

## Phase 2: New Tool Modules

## 2.1 `convex/tools/image.ts`
Implement internal action: `generateImage`

### Contract
```ts
{
  departmentId: Id<"departments">,
  prompt: string,
  size?: "1024x1024" | "1024x1792" | "1792x1024",
  quality?: "standard" | "hd",
  style?: "vivid" | "natural"
}
```

### Behavior
1. Resolve OpenAI key in this order:
   - `integrations[type="dalle"].config.token`
   - fallback: `integrations[type="openai"].config.token || config.key`
2. Call OpenAI Images API with model `gpt-image-1` or DALL-E 3-compatible endpoint used by project standard.
3. Return structured payload:
```ts
{ ok: true, imageUrl?: string, b64Json?: string, revisedPrompt?: string, createdAt: number }
```

### Errors
- Missing key: explicit department-scoped BYOK guidance.
- Empty prompt: validation error.

## 2.2 `convex/tools/github.ts`
Implement:
- `createGithubIssue`
- `createPullRequest`

### `create_github_issue` contract
```ts
{
  departmentId: Id<"departments">,
  owner: string,
  repo: string,
  title: string,
  body?: string,
  labels?: string[]
}
```

### `create_pull_request` contract
```ts
{
  departmentId: Id<"departments">,
  owner: string,
  repo: string,
  title: string,
  head: string,
  base: string,
  body?: string,
  draft?: boolean
}
```

### Behavior
- Use `Authorization: Bearer <token>` from `github` integration.
- Use GitHub REST API v3.
- Return created entity URL/number and status metadata.

## 2.3 `convex/tools/notion.ts`
Implement:
- `updateNotionPage`
- `createNotionDatabaseItem`

### `update_notion_page` contract
```ts
{
  departmentId: Id<"departments">,
  pageId: string,
  title?: string,
  markdown?: string
}
```

### `create_notion_database_item` contract
```ts
{
  departmentId: Id<"departments">,
  databaseId: string,
  properties: Record<string, any>,
  markdown?: string
}
```

### Behavior
- Use Notion versioned API headers.
- Build minimal block mapping for markdown/plain content.
- Return page URL/id.

## 2.4 `convex/tools/social.ts`
Implement:
- `postToX`

### `post_to_x` contract
```ts
{
  departmentId: Id<"departments">,
  text: string,
  replyToId?: string
}
```

### Behavior
- Use Twitter/X API v2 create post endpoint.
- Prefer OAuth 1.0a token set in integration config.
- Return tweet id/url.

### Constraints
- Hard-limit text to provider max; trim or fail with clear error.
- Optional: simple anti-empty/anti-spam guard.

## Phase 3: Brain Tool Dispatcher Integration

Update `convex/brain.ts`:
1. Register tool names:
   - `generate_image`
   - `create_github_issue`
   - `create_pull_request`
   - `update_notion_page`
   - `create_notion_database_item`
   - `post_to_x`
2. Validate per-tool args before dispatch.
3. Route to corresponding internal actions.
4. Preserve existing no-leak etiquette rules (no raw tool blobs in public output).

## Phase 4: Dept Settings UI

Update `src/components/DeptSettings.tsx`:
- Extend type union for `formData.type`.
- Add dropdown options:
  - GitHub
  - Notion
  - Twitter / X
  - DALL-E

Optional UX note:
- Keep single token input for now.
- Future pass can show provider-specific fields.

## Phase 5: Squad Capability Alignment

Update `convex/agents.ts` capability mapping and alignment logic.

### Required mapping
- Jarvis: `delegate_task`, `search_knowledge`
- Wanda: `generate_image`
- Friday: `web_search`, `create_github_issue`, `create_pull_request`
- Wong: `update_notion_page`, `create_notion_database_item`
- Quill: `post_to_x`
- Vision/Fury/Pepper remain as previously defined.

### `alignSquadCapabilities`
- Ensure these agents exist in department (create if missing).
- Patch `allowedTools` deterministically each run.
- Return counts (`created`, `updated`) for observability.

## Security and Data Boundaries

1. Department-scoped keys only:
- Every tool must fetch integration keys by current `departmentId`.

2. No key leakage:
- Never include tokens/secrets in tool return payloads, logs, messages, or activity feed.

3. Least-privilege output:
- Tool output should include IDs/URLs/status, not raw provider response dumps unless needed.

4. Error surfacing:
- Tool failures should be surfaced as user-safe error summaries in-thread.

## Acceptance Criteria

1. New integration types save and load successfully.
2. New tools execute with valid keys and return structured success payloads.
3. Brain can dispatch all six new tools through `[TOOL: ...]` syntax.
4. Dept Settings displays all four new integration providers.
5. `alignSquadCapabilities` assigns correct tools to Wanda/Friday/Wong/Quill.
6. No raw tool JSON appears in user-facing chat/activity feed.

## Verification Plan

1. Schema/analysis
- Run `npx convex dev` and confirm function analysis passes.

2. Integration CRUD
- Add each integration in Settings and verify row persistence.

3. Tool smoke tests (one per provider)
- `generate_image`: prompt returns URL/base64 payload.
- `create_github_issue`: issue created in target repo.
- `create_pull_request`: PR created against branch pair.
- `update_notion_page`: page updated.
- `create_notion_database_item`: record inserted.
- `post_to_x`: post created and ID returned.

4. Agent behavior
- Ask Jarvis to orchestrate a multi-step request crossing research + code + documentation + social.
- Confirm delegation and downstream specialist tool calls occur.

## Rollout Order

1. Phase 1 (schema/types)
2. Phase 2 (tool modules)
3. Phase 3 (brain dispatcher)
4. Phase 4 (settings UI)
5. Phase 5 (capability alignment)
6. Smoke tests + fixes

## Future Enhancements (Post-Spec)
- OAuth-first provider onboarding for GitHub/Notion/X.
- Provider-specific validation UIs in Settings.
- Rate-limit and retry policy per provider.
- Audit table for external tool calls (`provider`, `action`, `status`, `latencyMs`, `taskId`).
