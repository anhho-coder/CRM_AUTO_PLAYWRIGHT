import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.5 - No reference to a removed capability
 * Test Case ID: CRM-12326_3.5.1
 * Jira: CRM-12582
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 * Last-revised: 2026-09-16 - manual steps 2 and 3 split back to one test.step each
 *                (they were collapsed into a single "Step 2-3", which read as one opaque
 *                block in the report and hid which action a failure came from)
 *
 * Summary:
 *   Verify that no active view on the O12 CC instance targets a model that was removed
 *   when its Enterprise module left the migration scope. Views referencing absent models
 *   are broken screens, not install errors, so they must be detected and reported.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 102):
 *
 * Pre-conditions:
 *   VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable
 *   Login: anh.ho@nakivo.com (admin_crm_mig)
 *   Removed-capability models: helpdesk.ticket, helpdesk.team, helpdesk.stage, sale.subscription,
 *   sale.coupon, coupon.program, website.crm.score, account.asset.category, sign.request,
 *   marketing.campaign
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Read every active ir.ui.view whose model is one of the removed-capability models.
 *   3. For each view found, read its owning module through ir.model.data.
 *
 * Verification Points:
 *   1. Every view found is reported with its id, model and owning module.
 *   2. Zero views target a removed model.
 *
 * EVIDENCE: stdout only - this TC drives NO UI after login. Steps 2-3 and verification read over
 * the authenticated JSON-RPC and navigate nowhere, so the screenshot Playwright auto-captures
 * (config `screenshot: 'on'`) shows an idle, still-loading web client and means nothing here.
 * The per-step console.log output IS the artifact. Steps are labelled [INTERNAL check, Call API]
 * so a report reader knows that before wondering whether the blank capture is a failure.
 *
 * READ-ONLY: this spec only reads ir.ui.view and ir.model.data. It creates, modifies and
 * deletes nothing, as required on crm-mig.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_3\.5\.1:" --project=chromium
 */

/** The 10 Odoo models removed when their Enterprise modules left the migration scope. */
const REMOVED_CAPABILITY_MODELS = [
  'helpdesk.ticket',
  'helpdesk.team',
  'helpdesk.stage',
  'sale.subscription',
  'sale.coupon',
  'coupon.program',
  'website.crm.score',
  'account.asset.category',
  'sign.request',
  'marketing.campaign',
];

/**
 * Step labels - declared ONCE and used for BOTH the test.step() label and the stdout banner.
 *
 * Writing the two by hand lets them drift: the report step and the log line then describe the
 * same step with different wording, and a reader cannot line the HTML report up against stdout.
 * Reading both from this constant makes that impossible. The text is the manual TC's wording.
 */
const STEP = {
  pre1:    'Pre-condition 1: Login as Admin on the O12 Migration server',
  s2:      'Step 2: [INTERNAL check, Call API] Read every active ir.ui.view whose model is one of the removed-capability models',
  s3:      'Step 3: [INTERNAL check, Call API] For each view found, read its owning module through ir.model.data',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.5 - No reference to a removed capability', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12326_3.5.1: [Part2-3.5] No active view targets a removed model', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    // Carried between steps 2 -> 3, so each manual step owns exactly one action.
    let foundViews: Array<{ id: number; name: string; model: string }> = [];
    let viewsFound: Array<{ id: number; name: string; model: string; owningModule: string | null }> = [];

    console.log('========== CRM-12326_3.5.1 - No active view targets a removed model ==========');

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

      foundViews = await platform.callKw<Array<{ id: number; name: string; model: string }>>(
        'ir.ui.view',
        'search_read',
        [
          [['model', 'in', REMOVED_CAPABILITY_MODELS], ['active', '=', true]],
          ['id', 'name', 'model'],
        ],
        { limit: 500 },
      );
      console.log(`  Views found targeting removed models: ${foundViews.length}`);

      if (foundViews.length === 0) {
        console.log('  -> No active views found targeting removed models');
      }
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      if (foundViews.length === 0) {
        console.log('  (no views to resolve - no active views found targeting removed models)');
        viewsFound = [];
        return;
      }

      for (const view of foundViews) {
        // Query ir.model.data for this specific view to find its owning module
        const modelDataRows = await platform.callKw<Array<{ module: string }>>(
          'ir.model.data',
          'search_read',
          [
            [['model', '=', 'ir.ui.view'], ['res_id', '=', view.id]],
            ['module'],
          ],
          { limit: 1 },
        );
        const owningModule = modelDataRows.length > 0 ? modelDataRows[0].module : null;
        viewsFound.push({
          id: view.id,
          name: view.name,
          model: view.model,
          owningModule,
        });
        console.log(`    View id=${view.id}, name='${view.name}', model='${view.model}', module=${owningModule}`);
      }
    });

    await test.step(STEP.verify, async () => {
      console.log('\n==================== VERIFY ====================');

      // Verify #1: Every found view has an owning module resolved
      const viewsWithModule = viewsFound.filter(v => v.owningModule !== null);
      console.log('  Verify #1 - Every view found is reported with id, model and owning module:');
      console.log(`     Expected : ${viewsFound.length} views with resolved owning module`);
      console.log(`     Actual   : ${viewsWithModule.length} views with resolved module`);
      console.log(`     Result   : ${viewsWithModule.length === viewsFound.length ? 'PASS' : 'FAIL'}`);

      // Verify #2: No views target a removed model
      console.log('  Verify #2 - Zero views target a removed model:');
      console.log(`     Expected : 0 views targeting removed models`);
      console.log(`     Actual   : ${viewsFound.length} views targeting removed models`);
      console.log(`     Result   : ${viewsFound.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log('===============================================');
      const overallPass = viewsWithModule.length === viewsFound.length &&
                          viewsFound.length === 0;
      console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - ${overallPass ? 'no broken views targeting removed models' : 'broken views targeting removed models detected'}`);

      expect(
        viewsWithModule.length,
        'not all found views have an owning module resolved',
      ).toBe(viewsFound.length);

      expect(
        viewsFound.length,
        `views found targeting removed models: [${viewsFound.map(v => `id=${v.id}`).join(', ')}]`,
      ).toBe(0);
    });
  });
});
