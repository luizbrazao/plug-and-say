# SPEC_INVITES.md

## Objective
Enable human-to-human collaboration by allowing Organization members with admin privileges to invite other users, accept invites via tokenized links, and see/manage team membership in the UI.

## Scope
- Org-level invites only (not department-level invites).
- Invite creation and acceptance in Convex backend.
- Team management tab in Settings UI.
- Membership-scoped visibility in org/dept switchers.

## Current State (as of this branch)
- `invites` table already exists in `convex/schema.ts`.
- `invites:create`, `invites:validate`, and `invites:accept` already exist in `convex/invites.ts`.
- `organizations:listForUser` already scopes orgs through `orgMemberships`.
- Missing pieces are mostly UI and route wiring for join links, plus stricter access checks in read paths.

## Data Model
### Table: `invites`
Fields:
- `token: string` unique invite token.
- `orgId: Id<"organizations">` target organization.
- `email?: string` optional email lock.
- `role: "admin" | "member"` role granted on accept.
- `status: "pending" | "accepted" | "expired"` lifecycle state.
- `expiresAt: number` epoch millis.
- `createdByUserId: Id<"users">` inviter.

Indexes:
- `by_token`
- `by_orgId`

Recommended additions:
- `by_orgId_status` for team panel filtering and housekeeping.

## Backend Plan

### 1) Invite creation (`invites:create`)
Target: `convex/invites.ts`
- Keep token generation and admin/owner authorization.
- Add collision guard:
  - Retry token generation if `by_token` already exists.
  - Max retry count (e.g. 5) then throw.
- Return structured payload:
  - `{ token, inviteId, inviteUrl }`.
  - Build URL from app origin env (`SITE_URL`) + `/join/${token}`.

### 2) Invite acceptance (`invites:accept`)
Target: `convex/invites.ts`
- Keep validation checks: pending + not expired.
- Optional email lock:
  - If invite has `email`, compare to authenticated user email and reject mismatches.
- Keep idempotency: if already org member, return success with `alreadyMember: true`.
- On first accept:
  - Insert `orgMemberships` with invite role.
  - Patch invite `status` to `accepted` and optionally `acceptedAt` (schema update if needed).

### 3) Team/member listing
Add in `convex/organizations.ts` (or `convex/invites.ts`):
- `organizations:listMembers`
  - Args: `{ orgId }`.
  - Auth: requester must belong to the org.
  - Return org members from `orgMemberships` (+ user profile fields when available).
- `invites:listByOrg`
  - Args: `{ orgId }`.
  - Auth: owner/admin only.
  - Return pending/accepted invite rows for Team tab.

### 4) Access control hardening
- Ensure every org-scoped query/mutation verifies requester membership via `orgMemberships`.
- Ensure `departments:list` remains org-scoped and does not fallback to global list.
- For any direct department access (`tasks`, `messages`, etc.), enforce parent org membership where missing.

## Frontend Plan

### 1) Settings: Team tab
Target files:
- `src/App.tsx` (current `view` handling)
- new component: `src/components/TeamSettings.tsx`

UI requirements:
- Add `Team` tab in Settings area.
- Show current organization members.
- Show pending invites.
- Provide `Invite Member` form:
  - role select (`member`/`admin`)
  - optional email
  - submit -> receives invite URL
  - copy-to-clipboard action.

### 2) Join page (`/join/:token`)
Target options:
- Existing Vite app route/state handling in `src/App.tsx` based on `window.location.pathname`.
- Or dedicated page if router exists.

Flow:
1. Read token from URL.
2. If unauthenticated: show sign-in prompt and preserve token in URL/local state.
3. Call `invites:validate`.
4. If valid, allow `Accept invite` -> call `invites:accept`.
5. On success, set `activeOrgId` and navigate dashboard.

### 3) Org/Dept switcher visibility
- `OrgSwitcher` should render only `organizations` from `organizations:listForUser`.
- `DeptSwitcher` should render only departments from `departments:list({ orgId: activeOrgId })`.
- Clear invalid localStorage selections when org/dept no longer exists in fetched lists.

## API Contracts

### `invites:create`
Input:
```ts
{ orgId: Id<"organizations">; role: "admin" | "member"; email?: string }
```
Output:
```ts
{ token: string; inviteId: Id<"invites">; inviteUrl: string }
```

### `invites:validate`
Input:
```ts
{ token: string }
```
Output:
```ts
{ valid: boolean; reason?: string; orgName?: string; email?: string }
```

### `invites:accept`
Input:
```ts
{ token: string }
```
Output:
```ts
{ ok: true; alreadyMember: boolean; orgId: Id<"organizations"> }
```

### `organizations:listMembers` (new)
Input:
```ts
{ orgId: Id<"organizations"> }
```
Output:
```ts
Array<{ userId: Id<"users">; role: "owner" | "admin" | "member"; joinedAt: number }>
```

## Security Rules
- Only `owner`/`admin` can create invites.
- Only authenticated users can accept invites.
- Invite acceptance must be scoped to token validity and expiration.
- Email-locked invites must validate user email.
- All org/dept list APIs must be membership-scoped.

## Testing Plan

### Backend
- Create invite as owner/admin succeeds.
- Create invite as member fails.
- Accept valid invite inserts membership.
- Accept invite twice is idempotent (`alreadyMember: true`).
- Expired/invalid token rejects.
- Email mismatch rejects when invite has `email`.

### Frontend
- Team tab renders members and pending invites.
- Invite creation returns copyable join URL.
- `/join/:token` validates and accepts.
- Switchers hide inaccessible orgs/depts.
- Invalid stored org/dept IDs self-heal to a valid entry.

## Rollout Sequence
1. Backend hardening (`invites`, list members, ACL checks).
2. Team tab UI + invite creation UX.
3. Join token page/flow.
4. Switcher storage/visibility hardening.
5. End-to-end QA with two real user accounts.

## Acceptance Criteria
- A user with owner/admin role can invite another human using a shareable link.
- Invited user can accept invite and instantly gain org visibility.
- Team tab shows members and invite status.
- Org/Dept switchers never display entities without valid `orgMemberships` access.
