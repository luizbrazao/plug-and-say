# SPEC: Frontend Multi-Tenant Refactor

This plan outlines the steps to refactor the Plug and Say frontend to support multi-tenancy, following the backend changes already implemented.

## Objectives
1.  **Authentication Enforcement**: Protect the application using `@convex-dev/auth`.
2.  **Organization Context**: Implement a global context to manage the active organization.
3.  **Scoped Backend Calls**: Update all `useQuery` and `useMutation` calls to include `orgId`.
4.  **UI Components**: Create an Organization Switcher and Onboarding flow.

## 1. Authentication & Security
We will use `@convex-dev/auth` to manage user sessions.

### Changes
-   **Enforce Auth**: Use `Authenticated` and `Unauthenticated` wrappers in `src/App.tsx`.
-   **Login Page**: Implement a simple `SignIn` component using `Password` provider.

## 2. Organization Context (`OrgProvider`)
We need a way to track the selected organization across the app.

### Implementation
-   **[NEW] [OrgContext.tsx](file:///Users/luizbrazao/mission-control/mission-control/src/OrgContext.tsx)**:
    -   Fetches user's organizations via `api.orgs.getOrgsForUser`.
    -   Manages `activeOrgId` in local storage or state.
    -   Provides `useOrg()` hook to access `orgId` and `orgs` list.

## 3. Scoped Backend Calls
Every data-fetching call must be updated to include the `orgId`.

### [MODIFY] [App.tsx](file:///Users/luizbrazao/mission-control/mission-control/src/App.tsx)
-   Wrap the main layout in `OrgProvider`.
-   Update `Column` component:
    ```tsx
    const tasks = useQuery(api.tasks.listByStatus, { 
      orgId: activeOrgId, // From useOrg()
      status, 
      limit: 50 
    });
    ```
-   Update all mutations (`createMessage`, `setStatus`, `runExecutor`, etc.) to pass `orgId`.

### [MODIFY] [page.tsx](file:///Users/luizbrazao/mission-control/mission-control/app/page.tsx)
-   Similar updates for the Next.js entry point (if still in use).

## 4. UI Components

### [NEW] [OrgSwitcher.tsx](file:///Users/luizbrazao/mission-control/mission-control/src/components/OrgSwitcher.tsx)
-   A dropdown in the header to switch between organizations.
-   Option to "Create New Organization".

### [NEW] [Onboarding.tsx](file:///Users/luizbrazao/mission-control/mission-control/src/components/Onboarding.tsx)
-   Redirect users with no organizations to create their first one.

## Verification Plan
1.  **Auth Check**: Verify that the app redirects to Login if unauthenticated.
2.  **Data Isolation**: Login as User A (Org 1), create a task. Login as User B (Org 2), verify Task A is NOT visible.
3.  **Org Switch**: Verify that switching organizations immediately updates the UI with the corresponding data.
4.  **Type Safety**: Run `npm run build` to ensure all Convex calls match the updated schema.
