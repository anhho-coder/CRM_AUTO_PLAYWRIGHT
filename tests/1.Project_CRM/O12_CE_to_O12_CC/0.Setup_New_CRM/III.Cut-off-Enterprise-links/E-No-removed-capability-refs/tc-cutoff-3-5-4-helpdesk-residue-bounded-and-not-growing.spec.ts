import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.5 - No reference to a removed capability
 * Test Case ID: CRM-12326_3.5.4
 * Jira: CRM-12585
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 * Last-revised: 2026-09-16 - manual steps 2, 3, 4, 5 split back to one test.step each
 *                (steps 2-4 were collapsed; step 5 was incorrectly named s4; all RPC-only steps
 *                now labelled [INTERNAL check, Call API])
 *
 * Summary:
 *   Verify that the helpdesk residue on the O12 CC base remains bounded at 0 ir.model.data rows
 *   and does not grow. This is a regression guard to catch any new references to the removed
 *   helpdesk module, and by extension any references to other removed Enterprise modules.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 105):
 *
 * Pre-conditions:
 *   VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable
 *   Login: anh.ho@nakivo.com (admin_crm_mig)
 *   Baseline measured 2026-09-15: 0 rows (instance was rebuilt; prior baseline 2026-08-21 = 18 rows)
 *   Helpdesk's absence is accepted (CRM-11196) - not scored as a defect
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Count every ir.model.data row whose module is helpdesk.
 *   3. Break the count down by the model each row points at.
 *   4. Compare the total against the ceiling of 0.
 *   5. Confirm no rows are attributed to any other removed Enterprise module.
 *
 * Verification Points:
 *   1. The residue count is zero (no residue from the removed helpdesk module).
 *   2. The breakdown by target model is reported, so a shrink is visible as progress.
 *   3. 0 rows attributed to any other removed Enterprise module.
 *
 * EVIDENCE: stdout only - this TC drives NO UI. Every step after login reads over the authenticated
 * JSON-RPC and navigates nowhere, so the screenshot Playwright auto-captures (config `screenshot: 'on'`)
 * shows an idle, still-loading web client and means nothing here. The per-step console.log output
 * IS the artifact. Steps are labelled [INTERNAL check, Call API] so a report reader knows that
 * before wondering whether the blank capture is a failure.
 *
 * READ-ONLY: this spec only reads ir.model.data rows. It creates, modifies and deletes nothing,
 * as required on crm-mig.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_3\.5\.4:" --project=chromium
 */

/** The 0-row baseline of helpdesk residue (measured 2026-09-15 after instance rebuild). Only growth is a defect. */
const HELPDESK_RESIDUE_CEILING = 0;

/** Other removed Enterprise modules that must also have zero residue (if any). */
const OTHER_REMOVED_MODULES = [
  'sale_subscription', 'sale_coupon', 'website_sale_coupon', 'website_crm_score',
  'account_asset', 'sign', 'marketing_automation', 'web_studio',
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
  s2:      'Step 2: [INTERNAL check, Call API] Count every ir.model.data row whose module is helpdesk',
  s3:      'Step 3: [INTERNAL check, Call API] Break the count down by the model each row points at',
  s4:      'Step 4: [INTERNAL check, Call API] Compare the total against the ceiling of 0',
  s5:      'Step 5: [INTERNAL check, Call API] Confirm no rows are attributed to any other removed Enterprise module',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.5 - No reference to a removed capability', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12326_3.5.4: [Part2-3.5] Helpdesk residue bounded and not growing', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    let helpdeskResidueCount = 0;
    let helpdeskByModel: Record<string, number> = {};
    let otherModuleRowCount = 0;

    console.log('========== CRM-12326_3.5.4 - Helpdesk residue bounded and not growing ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in on the Migration server');
    });

    // Carried between steps 2 -> 3 -> 4 -> 5, so each manual step owns exactly one action.
    let helpdeskRows: Array<{ model: string; name: string }> = [];
    let otherModuleRows: Array<{ module: string; model: string; name: string }> = [];

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);

      helpdeskRows = await platform.callKw<Array<{ model: string; name: string }>>(
        'ir.model.data', 'search_read',
        [[['module', '=', 'helpdesk']], ['model', 'name']],
        { limit: 500 },
      );
      helpdeskResidueCount = helpdeskRows.length;
      console.log(`  Total helpdesk residue rows: ${helpdeskResidueCount}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      helpdeskByModel = {};
      for (const row of helpdeskRows) {
        helpdeskByModel[row.model] = (helpdeskByModel[row.model] ?? 0) + 1;
      }

      console.log('  Breakdown by target model:');
      for (const [model, count] of Object.entries(helpdeskByModel).sort()) {
        console.log(`    - ${model}: ${count} row(s)`);
      }
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      console.log(`  Helpdesk residue baseline : ${HELPDESK_RESIDUE_CEILING}`);
      console.log(`  Helpdesk residue actual   : ${helpdeskResidueCount}`);
      console.log(`  Result                    : ${helpdeskResidueCount <= HELPDESK_RESIDUE_CEILING ? 'within bounds' : 'EXCEEDS BASELINE'}`);
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);

      otherModuleRows = await platform.callKw<Array<{ module: string; model: string; name: string }>>(
        'ir.model.data', 'search_read',
        [[['module', 'in', OTHER_REMOVED_MODULES]], ['module', 'model', 'name']],
        { limit: 500 },
      );
      otherModuleRowCount = otherModuleRows.length;
      console.log(`  Rows from other removed modules: ${otherModuleRowCount}`);

      if (otherModuleRowCount > 0) {
        console.log('  Breakdown by module:');
        const byModule: Record<string, number> = {};
        for (const row of otherModuleRows) {
          byModule[row.module] = (byModule[row.module] ?? 0) + 1;
        }
        for (const [module, count] of Object.entries(byModule).sort()) {
          console.log(`    - ${module}: ${count} row(s)`);
        }
      }
    });

    await test.step(STEP.verify, async () => {
      console.log('\n==================== VERIFY ====================');

      console.log('  Verify #1 - Helpdesk residue count is bounded (≤ 0):');
      console.log(`     Expected : ≤ ${HELPDESK_RESIDUE_CEILING}`);
      console.log(`     Actual   : ${helpdeskResidueCount}`);
      console.log(`     Result   : ${helpdeskResidueCount <= HELPDESK_RESIDUE_CEILING ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #2 - Breakdown by model is complete:');
      const groupedTotal = Object.values(helpdeskByModel).reduce((sum, count) => sum + count, 0);
      console.log(`     Expected : grouped total = residue count (${helpdeskResidueCount})`);
      console.log(`     Actual   : grouped total = ${groupedTotal}`);
      console.log(`     Result   : ${groupedTotal === helpdeskResidueCount ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #3 - No residue from other removed Enterprise modules:');
      console.log(`     Expected : 0 rows`);
      console.log(`     Actual   : ${otherModuleRowCount}`);
      console.log(`     Result   : ${otherModuleRowCount === 0 ? 'PASS' : 'FAIL'}`);

      console.log('===============================================');
      const allPass = helpdeskResidueCount <= HELPDESK_RESIDUE_CEILING &&
                      groupedTotal === helpdeskResidueCount &&
                      otherModuleRowCount === 0;
      console.log(`OVERALL: ${allPass ? 'PASS' : 'FAIL'} - helpdesk residue bounded, breakdown complete, no other module residue`);

      // expect() calls - one per verification bullet
      expect(
        helpdeskResidueCount,
        `helpdesk residue (${helpdeskResidueCount}) exceeds baseline ceiling (${HELPDESK_RESIDUE_CEILING})`,
      ).toBeLessThanOrEqual(HELPDESK_RESIDUE_CEILING);

      expect(
        groupedTotal,
        `grouped breakdown (${groupedTotal}) does not match residue count (${helpdeskResidueCount})`,
      ).toBe(helpdeskResidueCount);

      expect(
        otherModuleRowCount,
        `found ${otherModuleRowCount} row(s) from other removed modules - regression detected`,
      ).toBe(0);
    });
  });
});
