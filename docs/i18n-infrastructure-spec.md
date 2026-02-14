# i18n Infrastructure Specification

## Scope
This implementation introduces the base i18n infrastructure for `en`, `es`, and `pt` across:
- Organization-level language persistence in Convex.
- Frontend i18n runtime initialization with `react-i18next`.
- Automatic language switching when active organization changes.
- Agent/Brain language awareness so responses (including Telegram flows) follow organization language.

This is infrastructure-only. Full UI translation coverage is intentionally out of scope for now.

## Data Model
### `organizations` table
Added optional field:
- `language?: "en" | "es" | "pt"`

Default behavior:
- New organizations are created with `language: "pt"`.
- Existing organizations are backfilled via migration.
- Client fallback remains `"pt"` even before migration is run.

### Migration
Added mutation:
- `migrations.backfillOrganizationLanguage`

Behavior:
- Iterates all organizations.
- If `language` is missing, patches it to `"pt"`.

## Frontend Architecture
### Libraries
Dependencies added:
- `i18next`
- `react-i18next`

### Initialization
Created `src/i18n/config.ts`:
- Initializes i18n with `initReactI18next`.
- Registers resources for `en`, `es`, `pt`.
- Sets `fallbackLng: "pt"` and initial `lng: "pt"`.
- Exposes:
  - `SUPPORTED_LANGUAGES`
  - `SupportedLanguage`
  - `normalizeSupportedLanguage(...)`

### Locale structure
Created:
- `src/i18n/locales/en/translation.json`
- `src/i18n/locales/es/translation.json`
- `src/i18n/locales/pt/translation.json`

Currently includes initial keys for language selector UX.

### Runtime wiring
- `src/main.tsx` imports `src/i18n/config.ts` once for app bootstrap.
- `tsconfig.app.json` enables `resolveJsonModule` for JSON locale imports.

### Organization-driven language switching
Updated `src/OrgContext.tsx`:
- Reads active organization language.
- Normalizes with fallback to `pt`.
- Calls `i18n.changeLanguage(...)` when active org changes.

### Language selector UI
Updated `src/components/Billing.tsx`:
- Added a language selector using `useTranslation()` hook pattern.
- Saves selection via `organizations.updateLanguage`.
- Applies immediate client-side language switch.

## Backend Agent/Brain Behavior
### Brain language context
Updated `convex/brain.ts`:
- `think` now accepts optional `language` arg (`en|es|pt`).
- Also resolves fallback from assembled context organization language.
- Injects mandatory prompt protocol:
  - Communicate exclusively in target language.
  - Summarize tool outputs in target language.

### Trigger propagation
All scheduling points now pass language into `internal.brain.think`:
- `brain.onNewMessage`
- `brain.onNewTask`
- `tasks.setStatus` parent wake path
- `tasks.approve` parent wake path
- `telegram.handleUpdate`
- `uprising.dispatchDept`

### Telegram consistency
- `brain` forwards target language to `telegram.sendMessage`.
- `telegram.sendMessage` accepts optional language and uses localized fallback when sanitized text is empty.

## Organization API updates
Updated `convex/organizations.ts`:
- `create`: sets `language: "pt"`.
- `getOrCreateDefault`: sets `language: "pt"`.
- `listForUser`: normalizes/fallbacks language to `"pt"` in returned payload.
- Added `updateLanguage` mutation (owner/admin).

## Operational Notes
1. Run codegen/deploy flow after schema change.
2. Execute migration once in a safe window:
   - `migrations.backfillOrganizationLanguage`
3. Full content translation can be incrementally migrated using `useTranslation()` in components.

