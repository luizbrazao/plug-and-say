# SPEC_FINAL_DEPT.md - Final Implementation Steps

This document outlines the specific steps to finalize the Plug and Say "Department" migration and onboarding features.

## 1. Stage 4: Schema Cleanup
Remove all legacy `orgId` references to enforce the new Department-only architecture.

- [ ] **Delete Tables**: Remove `orgs` and `orgMemberships` from `convex/schema.ts`.
- [ ] **Purge Fields**: Remove `orgId: v.optional(v.id("orgs"))` from:
    - `deptMemberships`, `agentTemplates`, `agents`, `tasks`, `messages`, `thread_reads`, `activities`, `documents`, `notifications`, `thread_subscriptions`, `executor_runs`, `uxEvents`.
- [ ] **Remove Indexes**: Delete all `.index("by_orgId", ...)` and combined indexes starting with `orgId`.
- [ ] **Strict Enforcement**: Change `departmentId: v.optional(...)` to `departmentId: v.id("departments")` in core operational tables.

## 2. Department Creation & Jarvis Seeding
Update `convex/departments.ts` to ensure every department starts with a head of operations.

- [ ] Modify `create` mutation:
    - After `ctx.db.insert("departments", ...)`, use `ctx.db.insert("agents", ...)` to create "Jarvis".
    - Role: "Head of Operations"
    - Status: "idle"
    - sessionKey: `jarvis-${deptId}`

## 3. DeptSwitcher Enhancements
Improve the UI to allow rapid deployment of new departments.

- [ ] **Dropdown Update**: Add "➕ Create New Department..." as the last item in the select list.
- [ ] **Capture Logic**: When selected, show a `window.prompt` (or custom modal) to get the name and slug.
- [ ] **Navigation**: Auto-switch to the new department upon successful creation.

## 4. Agent Store UI
Create a marketplace placeholder for and template deployments.

- [ ] **New Component**: `src/components/AgentStore.tsx`.
- [ ] **Data Fetching**: Use `api.agentTemplates.listByDept` (or a global list query).
- [ ] **Layout**: CSS Grid with `glass-card` styling for each template.
- [ ] **Integration**: Accessible via a simple toggle or separate URL route.

---
*Authorized by: Plug and Say Architecture Team*
