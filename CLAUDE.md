# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Playwright + TypeScript end-to-end test framework for the **Nakivo Partner Portal CRM**, an Odoo-based application. Tests run against the Pre-Production environment.

**Environment access requires VPN.** Base URL resolves to internal hosts (`10.220.222.100` / `pre-production.nakivo.site`) defined in `config/users.config.ts`.

## Commands

```bash
# Run a single test file (most common during development)
npx playwright test "tests/<path>/<file>.spec.ts" --project=chromium

# Run a test by ID using the title pattern "CRM-XXXX_X.X.X:"
npx playwright test --grep "CRM-2482_1\.1\.1:" --project=chromium

# Run all tests in a feature folder
npx playwright test tests/1.Project_CRM/4.Investments --project=chromium

# Run modes
npm run test:headed      # headed (default project already runs headed)
npm run test:ui          # interactive UI mode
npm run test:debug       # Playwright inspector
npm run report           # open last HTML report

# Headless run (CI-style)
npx playwright test --project=chromium-headless

# Clean reports/results
npm run clean
```

The `chromium` project runs **headed** with `slowMo: 100ms`. Use `chromium-headless` for fast CI-style runs. Tests are configured `workers: 1` (no parallelism within a run) and `fullyParallel: false` — concurrency is not supported by these tests as written.

When a test fails, the custom reporter prints a copy-pasteable rerun command using the test's `CRM-XXXX_X.X.X:` title prefix.

## TypeScript path aliases

Defined in `tsconfig.json` and used throughout. Always prefer these over relative imports:

```ts
import { LoginPage, HomePage, InvestmentPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
```

## Architecture

### Page Object Model
- `pages/BasePage.ts` — shared base class. All page objects extend it. Provides Odoo-shell utilities: `waitForPageReady`, `waitForFormSaved`, `waitForEditButton`, `dismissErrorDialog`, `dismissDiscardChangesDialog`, `discardFormIfInEditMode`, plus a `wait(ms)` helper that wraps `page.waitForTimeout`.
- `pages/index.ts` — barrel export. Import page objects from `@pages`, not individual files.
- One page object per Odoo screen/entity: `LoginPage`, `HomePage`, `LeadPage`, `OpportunityPage`, `ContactPage`, `DealElementPage`, `QuotationPage`, `InvoicePage`, `LicensePage`, `InvestmentPage`, `ReAssignationPage`.
- Locators are defined as private arrow functions returning a `Locator`, then called inline (e.g. `await this.createButton().click()`). Public methods are action-level (`clickCreateButton`, `fillActivityTypeForm`, `verifyActivityTypeInList`).

### Helpers
- `helpers/common.utils.ts` — `CommonUtils` static class. Contains the **`waitTimes` constants** (see below), test data generators (`generateLeadName`, `generateContactEmail`, `generateUniqueId`), screenshot/attachment helpers, and the shared `deleteRecordByUrl` teardown utility.
- `helpers/auth.helper.ts`, `helpers/crm.helper.ts`, `helpers/login.helper.ts` — older procedural helpers; new code should use page objects.

### Config
- `config/users.config.ts` — `users` map (e.g. `users.admin_crm`, `users.manager_max`) and the active `baseUrl`. Switch the exported `baseUrl` to swap environments.
- `config/test.config.ts` — `config.timeouts.test` (15-min test timeout used in `test.setTimeout()`), `config.timeouts.urlWait`, etc.
- `config/global-setup.ts` — minimal; the meaningful global setup lives in `playwright.config.ts` (timestamp/folder env vars).
- `config/custom-reporter.ts` — renames the per-run report folder to `YYYY-MM-DD-HHMMSS_<TestFolder>_[Worker-N]_<Passed|Failed>` and prints the rerun command on failure. Output goes to `playwright-report/<run-folder>/`.

## Wait-time convention — important

Tests target a slow Odoo backend, so fixed buffers exist alongside Playwright's auto-waits. Always use named constants from `CommonUtils.waitTimes`:

| Constant | ms | Use for |
|---|---|---|
| `short` | 300 | dropdowns / quick UI updates |
| `medium` | 500 | standard UI interactions |
| `standard` | 1000 | session cleanup / state changes |
| `long` | 2000 | page loads / navigation |
| `extraLong` | 3000 | complex form transitions |
| `abnormalWait` | 30000 | default `waitFor` timeout for visibility checks |
| `elementVisibility` | 30000 | visibility checks with retry |
| `savingPage` | 30000 | form-save spinner |
| `reAssignationWait` | 60000 | slow Re-Assignation page operations |
| `elementAppear` | 180000 | elements that may take minutes |
| `pageLoad` | 240000 | slow page loads (login, heavy modules) |
| `runningTestScript` | 600000 | overall script-level timeout |

There are more entity-specific constants in [helpers/common.utils.ts](helpers/common.utils.ts) (e.g. `bdrTeamAssignment`, `leadMerging`, `savingDealElement`); always pick the closest-fitting named constant rather than inventing a number.

**Rule — no raw timeout numbers.** Never write `await page.waitForTimeout(2000)` or `{ timeout: 10000 }`. Every wait — `waitForTimeout`, `waitFor`, `waitForSelector`, `waitForURL`, `isVisible({ timeout })`, `inputValue({ timeout })`, `textContent({ timeout })`, etc., in both tests and page objects — must reference a `CommonUtils.waitTimes.*` constant. If no existing constant fits, add a new named one to `waitTimes` rather than inlining a number.

**Pattern in page objects:** call `waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })` for synchronization, then optionally a small fixed `this.wait(N)` as a render-stabilization buffer. The fixed buffers can usually be tuned down, but the `waitFor` should stay.

## Strict Page Object Model

Test files (`.spec.ts`) must contain **zero direct Playwright locator calls**. This is the most-enforced convention in the repo — see [.github/instructions/quocanh_context1.instructions.md](.github/instructions/quocanh_context1.instructions.md) for the full rule set.

**Forbidden in test files:** `page.locator(...)`, `page.getByRole(...)`, `page.getByText(...)`, `page.getByPlaceholder(...)`, `.filter(...)`, or any other direct locator method. All element interaction goes through a public method on a page object (e.g. `await leadPage.selectSalesTeam('CMR')`, not `await page.locator('select[name="team_id"]').selectOption({ label: 'CMR' })`).

**Allowed in test files:** test-flow code, page-object method calls, `expect()` assertions, `console.log`, `test.step` blocks.

**Locator definition rules (in page objects):**
- Locators are grouped at the top of the class under a `// Locators` comment, defined as private/protected arrow functions returning a `Locator`.
- Every new locator uses a **two-layer strategy: XPath primary, CSS fallback**. The fallback try-logic lives inside the page-object method, never in the test.
- If a new test needs an action that has no existing method, add the method to the page object first, then write the test.

## Test structure & naming

```
tests/
  1.Project_CRM/
    1.SalesReport_Performance/   tc-performance-X-X-X-X-<action>.spec.ts
    2.Leads_Assignment/
    3.Lead_Merging/
    4.Investments/CRM-2482_Investments_module-General_fields/...
    9.CRM_Module/
```

- File naming: `tc-<area>-<numeric-id>-<action>.spec.ts` or `tc-crm-<ticket>-<numeric-id>-<action>.spec.ts`.
- Test title MUST start with the case ID followed by colon, e.g. `'CRM-2482_1.1.1: Verify the authorised user can create/edit an Activity type'`. The custom reporter parses this to print rerun commands.
- Standard test shape: `test.beforeEach` clears cookies + small wait → `test()` calls `test.setTimeout(config.timeouts.test)`, sets viewport `1920x1080`, instantiates page objects, walks `test.step('Step N: ...')` blocks → optional teardown step that deletes created records.
- `test.afterEach` typically inspects `testInfo.status` and waits for Odoo loading spinners (`.o_loading, .oe_loading, [class*="loading"]`) to hide before Playwright's auto-screenshot fires.
- **`test.step` labels must be plain ASCII.** Use `-` instead of en-dash `–` or em-dash `—`, and never `\u20XX` escapes. Example: `'Step 3-5: ...'`, not `'Step 3–5: ...'`. This is easy to break when editing on Windows — when using PowerShell `Get-Content`/`Set-Content` on test files, pass `-Encoding UTF8` to avoid Unicode corruption.

### Required file-header `Command to run:` block

Every spec must include a header comment with the rerun command(s):

```typescript
/**
 * Summary: ...
 *
 * Command to run:
 *   npx playwright test --grep "CRM-2482_1\.1\.1:" --project=chromium
 */
```

If the test is linked to a known bug, include **both** grep commands (one for the case ID, one for the bug ID) — see the next section.

## Known defects & skipping

For a test expected to fail because of a tracked bug, use `test.fail()` plus an annotation, and embed the bug ID in the test title so `--grep "<BUG-ID>"` finds it. `--grep` only matches the title, not annotation metadata — the annotation alone is not enough.

```typescript
test('CRM-3374_2.4 [CRM-9857]: Verify ...', async ({ page }, testInfo) => {
  testInfo.annotations.push({ type: 'defect', description: 'CRM-9857' });
  test.fail(); // Expected to fail due to known defect
  // ...
});
```

Also update the header `Command to run:` block to list both grep commands (case ID and bug ID).

- Do **not** use `test.fixme()` for known defects — it skips the test entirely and removes it from tracking.
- Only when the user explicitly asks to **skip** (not fail) a test for a bug, use declaration-level skipping so fixtures never spin up the browser: `test.skip('... @BUG-ID', async ({ page }) => { ... })` or `test.describe.skip(...)`. Never call `test.skip(true, '...')` inside the test body — by that point the `page` fixture has already launched a browser.

## Cleanup toggles in beforeEach / afterEach

Tests that perform cleanup must expose per-entity boolean toggles so cleanup can be disabled without rewriting the test. Define them near the `describe` or test setup and guard each cleanup block:

```typescript
const SKIP_CLEANUP_OPPS = false;     // toggle to true to skip Opps cleanup
const SKIP_CLEANUP_CONTACTS = false; // toggle to true to skip Contacts cleanup

test.beforeEach(async ({ browser, context }) => {
  if (!SKIP_CLEANUP_OPPS) { /* cleanup */ }
});

test.afterEach(async ({ page }, testInfo) => {
  if (!SKIP_CLEANUP_CONTACTS) { /* cleanup */ }
});
```

Convention: `true` = skip, `false` = run. Default to `false`. Prefer one toggle per entity over a single shared switch. Don't remove these toggles when updating existing tests unless explicitly asked.

## Odoo-specific gotchas

- After form save, Odoo enters readonly mode; if a follow-up action needs the form back in edit/readonly state, use `BasePage.discardFormIfInEditMode()` or wait for the Edit button (`waitForEditButton`).
- A "record has been modified, your changes will be discarded" dialog can appear when navigating away from a dirty form — `BasePage.dismissDiscardChangesDialog()` handles it.
- "Odoo Client Error" popups can intercept clicks — `BasePage.dismissErrorDialog()` handles them.
- Many2one combobox inputs need `fill('')` to clear, then `fill(value)`, then `keyboard.press('Enter')`, with small waits between (see `InvestmentPage.selectInvestmentType` as the canonical pattern).
- Locators frequently rely on XPath into Odoo's class names (`o_list_button_add`, `o_form_readonly`, `o_user_menu`, `o_loading`).

## A note on README.md

`README.md` is **outdated** — it documents an old procedural `AuthHelper` / `CRMHelper` style and references files that no longer exist. Treat this CLAUDE.md (plus [.github/instructions/quocanh_context1.instructions.md](.github/instructions/quocanh_context1.instructions.md)) as the source of truth for conventions. Don't copy patterns from `README.md`.

## Reports & artifacts

- `playwright-report/<timestamped-run-folder>/` — HTML report, JSON, JUnit XML per run.
- `test-results/` — screenshots, videos (recorded for **all** tests, not just failures), traces (on first retry).
- Failing-test artifacts: `test-results/<encoded-test-name>/test-failed-1.png`, `video.webm`, `error-context.md` (page snapshot YAML, very useful for debugging locator failures).
