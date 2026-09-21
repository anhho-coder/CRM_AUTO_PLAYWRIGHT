import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.2 - Enterprise add-ons absent
 * Test Case ID: CRM-12326_3.2.3
 * Jira: CRM-12571
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 * Last-revised: 2026-09-16 - manual steps 2 and 3 split back to one test.step each
 *                (they were collapsed into a single "Step 2-3", which read as one opaque
 *                block in the report and hid which action a failure came from)
 *
 * Summary:
 *   Verify that no Enterprise-only view types (gantt, grid, cohort, dashboard) remain active
 *   on the O12 CE Migration server. These view types only exist in Odoo Enterprise and would
 *   fail to render on Community Edition. The map view type is excluded as it comes from the
 *   free web_google_maps module, not Enterprise.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 88):
 *
 * Pre-conditions:
 *   VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable
 *   Login: anh.ho@nakivo.com (admin_crm_mig)
 *   NOTE: the map view type is NOT Enterprise-only - it comes from the free web_google_maps module
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Read every active ir.ui.view whose type is gantt, grid, cohort or dashboard.
 *   3. For any view found, report its owning module and the model it targets.
 *
 * Verification Points:
 *   1. 0 active views of type gantt, grid, cohort or dashboard exist.
 *   2. Any view found is reported with its owning module so it can be routed to the module that has to drop it.
 *
 * EVIDENCE: stdout only - this TC drives NO UI. Every step reads over the authenticated JSON-RPC
 * and navigates nowhere, so the screenshot Playwright auto-captures (config `screenshot: 'on'`)
 * shows an idle, still-loading web client and means nothing here. The per-step console.log output
 * IS the artifact. Steps are labelled [INTERNAL check, Call API] so a report reader knows that
 * before wondering whether the blank capture is a failure.
 *
 * READ-ONLY: this spec only reads the view registry via ir.ui.view and ir.model.data. It creates,
 * modifies and deletes nothing, as required on crm-mig.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_3\.2\.3:" --project=chromium
 */

/**
 * Enterprise-only view types that should not exist on Community Edition.
 * The map view type is NOT included because web_google_maps is a free module available on CE.
 */
const ENTERPRISE_VIEW_TYPES = ['gantt', 'grid', 'cohort', 'dashboard'];

/**
 * Step labels - declared ONCE and used for BOTH the test.step() label and the stdout banner.
 *
 * Writing the two by hand lets them drift: the report step and the log line then describe the
 * same step with different wording, and a reader cannot line the HTML report up against stdout.
 * Reading both from this constant makes that impossible. The text is the manual TC's wording.
 */
const STEP = {
  pre1:    'Pre-condition 1: Login as Admin on the O12 Migration server',
  s2:      'Step 2: [INTERNAL check, Call API] Read every active ir.ui.view whose type is gantt, grid, cohort or dashboard',
  s3:      'Step 3: [INTERNAL check, Call API] For any view found, report its owning module and the model it targets',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.2 - Enterprise add-ons absent', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12326_3.2.3: [Part2-3.2] No Enterprise-only view type is in use', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform = new MigPlatformPage(page);

    // Carried between steps 2 -> 3, so each manual step owns exactly one action.
    let views: Array<{ id: number; name: string; model: string; type: string }> = [];
    const viewsWithModules: Array<{ id: number; name: string; model: string; type: string; module: string }> = [];
    let foundViewsCount = 0;
    let reportsWithModule = 0;

    console.log('========== CRM-12326_3.2.3 - No Enterprise-only view type is in use ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in on the Migration server');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log('  The Enterprise-only view types being searched for:');
      ENTERPRISE_VIEW_TYPES.forEach((t) => console.log(`    - ${t}`));

      views = await platform.callKw(
        'ir.ui.view',
        'search_read',
        [[['type', 'in', ENTERPRISE_VIEW_TYPES], ['active', '=', true]], ['id', 'name', 'model', 'type']],
        { limit: 500 },
      );

      foundViewsCount = views.length;
      console.log(`\n  Active views with Enterprise-only types: ${foundViewsCount}`);
      if (foundViewsCount === 0) {
        console.log('  -> none found, which is the expected state after the cut-off');
      }
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      if (views.length > 0) {
        const viewIds = views.map((v) => v.id);
        console.log(`  Distinct views to resolve owning modules : ${viewIds.length}`);

        const modelDataRecords: Array<{ res_id: number; module: string }> = await platform.callKw(
          'ir.model.data',
          'search_read',
          [[['model', '=', 'ir.ui.view'], ['res_id', 'in', viewIds]], ['res_id', 'module']],
          { limit: 500 },
        );

        // Build a map of res_id -> module
        const moduleMap: Record<number, string> = {};
        modelDataRecords.forEach((record) => {
          moduleMap[record.res_id] = record.module;
        });

        // Enrich views with their owning modules
        views.forEach((view) => {
          const owningModule = moduleMap[view.id] || 'unknown';
          viewsWithModules.push({
            id: view.id,
            name: view.name,
            model: view.model,
            type: view.type,
            module: owningModule,
          });
          if (owningModule !== 'unknown') {
            reportsWithModule++;
          }
        });

        console.log('  Enterprise-only views with owning modules:');
        viewsWithModules.forEach((view) => {
          console.log(`    id=${view.id}, name="${view.name}", model="${view.model}", type="${view.type}", module="${view.module}"`);
        });
      } else {
        console.log('  (no views to resolve - no Enterprise-only view type found)');
      }
    });

    await test.step(STEP.verify, async () => {
      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - 0 active views of Enterprise-only types exist:');
      console.log(`     Expected : 0`);
      console.log(`     Actual   : ${foundViewsCount}`);
      console.log(`     Result   : ${foundViewsCount === 0 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - Any found view is reported with its owning module:');
      console.log(`     Expected : ${foundViewsCount}`);
      console.log(`     Actual   : ${reportsWithModule}`);
      console.log(`     Result   : ${reportsWithModule === foundViewsCount ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${foundViewsCount === 0 && reportsWithModule === foundViewsCount ? 'PASS' : 'FAIL'} - No Enterprise-only view types should exist on CE`);

      expect(foundViewsCount, 'no active views of Enterprise-only types should exist').toBe(0);
      expect(reportsWithModule, 'all found views must be reported with their owning module').toBe(foundViewsCount);
    });
  });
});
