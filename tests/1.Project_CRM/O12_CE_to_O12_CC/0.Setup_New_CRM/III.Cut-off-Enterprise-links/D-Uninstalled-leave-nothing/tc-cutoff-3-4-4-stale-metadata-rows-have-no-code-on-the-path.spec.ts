import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.4 - Uninstalled modules leave nothing executable
 * Test Case ID: CRM-12326_3.4.4
 * Jira: CRM-12581
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 * Last-revised: 2026-09-16 - manual steps 2, 3, and 4 split back to one test.step each
 *                (they were collapsed into a single "Step 2-4", which read as one opaque
 *                block in the report and hid which action a failure came from)
 *
 * Summary:
 *   This test verifies that two modules (nakivo_sign and marketing_automation_file_template)
 *   have been completely purged from the addons path. On 2026-09-15, their ir.module.module rows
 *   no longer exist (the instance was rebuilt and deploy pruned them). This test proves they are
 *   truly gone by attempting to request their static files (expecting 404) and comparing against
 *   control modules that ARE installed and have static files available (expecting 200).
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 100):
 *
 * Pre-conditions:
 *   - VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable
 *   - Login: anh.ho@nakivo.com (admin_crm_mig)
 *   - Dev root cause on CRM-12125 comment 685345: Odoo 12 never deletes the ir.module.module row
 *     of a module whose directory disappeared, and Update Apps List cannot clear it (876 rows before, 876 after)
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Request a static file under each of nakivo_sign and marketing_automation_file_template.
 *   3. As a CONTROL, request the same path under 3 modules that ARE present on the branch and installed (nakivo_hr_org_chart, nakivo_kpi_developer, nakivo_kpi_sales).
 *   4. Compare the responses.
 *
 * Verification Points:
 *   1. Static files for nakivo_sign and marketing_automation_file_template do NOT resolve (status != 200).
 *   2. The control module's static file DOES resolve (status == 200), proving the 404 is caused by the
 *      missing directory and not by being uninstalled.
 *
 * EVIDENCE: stdout only - this TC drives NO UI. Every step reads over the authenticated JSON-RPC
 * and navigates nowhere, so the screenshot Playwright auto-captures (config `screenshot: 'on'`)
 * shows an idle, still-loading web client and means nothing here. The per-step console.log output
 * IS the artifact. Steps are labelled [INTERNAL check, Call API] so a report reader knows that
 * before wondering whether the blank capture is a failure.
 *
 * CRITICAL CAVEAT: a 404 on /<module>/static/... also occurs when the module is present but simply has
 * no such file, so a 404 alone never proves absence. The control request is what makes the reading valid.
 *
 * READ-ONLY: this spec only reads the module registry and probes static file paths. It creates,
 * modifies and deletes nothing, as required on crm-mig.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_3\.4\.4:" --project=chromium
 */

/** Two modules that are stale metadata rows with no code on the addons path. */
const STALE = ['nakivo_sign', 'marketing_automation_file_template'];

/** Three modules present on the branch AND installed - used as control probes to prove 404 is caused by missing code. */
const CONTROLS = ['nakivo_hr_org_chart', 'nakivo_kpi_developer', 'nakivo_kpi_sales'];

/**
 * Step labels - declared ONCE and used for BOTH the test.step() label and the stdout banner.
 *
 * Writing the two by hand lets them drift: the report step and the log line then describe the
 * same step with different wording, and a reader cannot line the HTML report up against stdout.
 * Reading both from this constant makes that impossible. The text is the manual TC's wording.
 */
const STEP = {
  pre1:    'Pre-condition 1: Login as Admin on the O12 Migration server',
  // Manual steps 2, 3 and 4 are the SUBSTANCE of this TC, so they stay 1:1 with the Xray
  // manual steps. They were previously collapsed into a single "Step 2-4", which read as one
  // opaque block in the report: a reader could not tell which of the three actions a failure
  // came from. Grouping is only allowed for a contiguous run of pure SETUP steps.
  s2:      'Step 2: [INTERNAL check, Call API] Request a static file under each of nakivo_sign and marketing_automation_file_template',
  s3:      'Step 3: [INTERNAL check, Call API] As a CONTROL, request the same path under 3 modules that ARE present on the branch and installed (nakivo_hr_org_chart, nakivo_kpi_developer, nakivo_kpi_sales)',
  s4:      'Step 4: [INTERNAL check, Call API] Compare the responses',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.4 - Uninstalled modules leave nothing executable', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12326_3.4.4: [Part2-3.4] The 2 stale metadata rows have no code on the addons path', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    // Storage for probe results - carried between steps 2 -> 3 -> 4, so each manual step owns exactly one action
    let staleStatuses: number[] = [];
    let controlStatuses: number[] = [];

    console.log('========== CRM-12326_3.4.4 - Stale metadata rows have no code on the addons path ==========');

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
      console.log(`  Probing ${STALE.length} stale modules: ${STALE.join(', ')}`);
      for (const moduleName of STALE) {
        const result = await platform.probe(`/${moduleName}/static/description/icon.png`);
        staleStatuses.push(result.status);
        console.log(`    ${moduleName}: status ${result.status}`);
      }
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log(`  Probing ${CONTROLS.length} control modules: ${CONTROLS.join(', ')}`);
      for (const moduleName of CONTROLS) {
        const result = await platform.probe(`/${moduleName}/static/description/icon.png`);
        controlStatuses.push(result.status);
        console.log(`    ${moduleName}: status ${result.status}`);
      }
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      console.log(`  Stale module statuses: ${JSON.stringify(staleStatuses)}`);
      console.log(`  Control module statuses: ${JSON.stringify(controlStatuses)}`);
    });

    await test.step(STEP.verify, async () => {
      console.log('\n==================== VERIFY ====================');

      // Verify #1: Stale modules do NOT resolve (no status == 200)
      const staleNone200 = staleStatuses.every((status) => status !== 200);
      console.log('  Verify #1 - Static files for stale modules do NOT resolve:');
      console.log(`     Expected : All statuses != 200`);
      console.log(`     Actual   : ${JSON.stringify(staleStatuses)} (all != 200: ${staleNone200})`);
      console.log(`     Result   : ${staleNone200 ? 'PASS' : 'FAIL'}`);

      // Verify #2: At least one control module DOES resolve (at least one status == 200)
      const controlHasAny200 = controlStatuses.some((status) => status === 200);
      console.log('  Verify #2 - At least one control module static file DOES resolve:');
      console.log(`     Expected : At least one status == 200`);
      console.log(`     Actual   : ${JSON.stringify(controlStatuses)} (any == 200: ${controlHasAny200})`);
      console.log(`     Result   : ${controlHasAny200 ? 'PASS' : 'FAIL'}`);

      console.log('===============================================');
      const overallPass = staleNone200 && controlHasAny200;
      console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - ${
        overallPass
          ? 'Stale modules have no code and control modules are present'
          : 'Control modules all returned non-200 statuses, making the result inconclusive'
      }`);

      // Expect #1: stale statuses must not contain any 200
      expect(staleStatuses, 'all stale module static files should not resolve (status != 200)').not.toContain(200);

      // Expect #2: control statuses must contain at least one 200
      expect(controlStatuses, 'at least one control module static file should resolve (status == 200)').toContain(200);
    });
  });
});
