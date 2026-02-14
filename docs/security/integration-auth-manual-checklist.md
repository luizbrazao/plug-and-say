# Integration Auth Manual Checklist

## Preconditions
- Have two organizations: `Org A` and `Org B`.
- Have at least one department in each org.
- Have 3 users:
  - `ownerA` (owner/admin in Org A)
  - `memberA` (member in Org A, not admin)
  - `ownerB` (owner/admin in Org B)

## 1) Cross-org IDOR/BOLA protections
1. Login as `ownerA`.
2. Attempt `api.integrations.upsert` with `orgId=OrgA` and `departmentId` from `OrgB`.
3. Expected: request fails with department/org mismatch.

## 2) Membership enforcement
1. Login as `ownerB`.
2. Attempt `api.integrations.upsert` for `orgId=OrgA`.
3. Expected: request fails with "not a member of this organization".

## 3) Role enforcement (admin/owner only)
1. Login as `memberA`.
2. Attempt `api.integrations.upsert` in `OrgA`.
3. Attempt `api.integrations.remove` for an integration in `OrgA`.
4. Expected: both fail with admin/owner required.

## 4) Admin happy path
1. Login as `ownerA`.
2. Upsert Gmail/Notion/Resend/Twitter/GitHub credentials in `OrgA`.
3. Remove one credential in `OrgA`.
4. Expected: all actions succeed.

## 5) orgId consistency on integrations rows
1. Create/update integrations from UI for different services.
2. Verify each row has `orgId` populated.
3. Expected: no newly written integration row has `orgId` empty.

## 6) Gmail OAuth intent hardening
1. Login as `ownerA`, start Gmail OAuth flow.
2. Tamper callback params (`state`/`departmentId`) manually.
3. Expected: callback returns invalid state/intent error.
4. Reuse the same callback URL after a successful connection.
5. Expected: fails because intent is one-time and cleared.

## 7) Callback authorization persistence
1. Start OAuth as `ownerA`.
2. Before completing callback, remove/downgrade `ownerA` admin role in org.
3. Complete callback.
4. Expected: callback fails with authorization error and no token persisted.

## Org-level policy notes
- Org-level integrations are resolved by `departmentId -> department.orgId -> integrations.by_org_type`.
- `telegram` remains department-scoped; all other providers are org-scoped.
- AuthZ policy:
  - Read: org member.
  - Write/connect/disconnect: org admin or owner.
