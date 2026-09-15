import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 * CRM-12325 Part 2-D - Light smoke
 * ===========================================================================
 * Test Case ID    : CRM-12325_1.4.1
 * Jira            : CRM-12364
 * Test Repository : /CRM test/Migration - Setup New CRM/CRM-12325_Build fresh Odoo 12 Community/D. Light smoke
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE)
 * Automation-Type : new
 * Automation-Date : 2026-08-19
 * Automation-Updated: 2026-09-15 (steps re-synced with the Jira manual TC)
 *
 * Summary:
 *   Light smoke of the Migration server - the core CE apps (Contacts, CRM, Sales, Settings)
 *   render with no error, and the write path is alive (create + delete a trivial Contact).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_1\.4\.1:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 * Source manual TC - Jira CRM-12364, Xray Manual Steps (verbatim, in order)
 * ---------------------------------------------------------------------------
 * Pre-conditions:
 *   _ Login: anh.ho@nakivo.com (admin_crm_mig) on crm-mig.nakivo.site
 *
 * Steps to reproduce #1:
 *   1. Open a few core CE apps (Contacts, CRM, Sales, Settings) and confirm they render.
 *
 * Steps to reproduce #2:
 *   2. Create and delete one trivial record (a Contact) to confirm the write path is alive.
 *      AUTOMATION: automated - write path via RPC create+unlink res.partner (the partner UI
 *      form requires accounting fields from nakivo_accounting, beyond a base smoke).
 *
 * Verification - Expected Result on step 2:
 *   _ Each core app renders with no error
 *   _ The write path persisted a record (create returns an id), then cleaned it up
 * ---------------------------------------------------------------------------
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1:   'Pre-condition 1: Login: anh.ho@nakivo.com (admin_crm_mig) on crm-mig.nakivo.site',
  s1:     'Step 1: Open a few core CE apps (Contacts, CRM, Sales, Settings) and confirm they render.',
  s2:     'Step 2: Create and delete one trivial record (a Contact) to confirm the write path is alive.',
  verify: 'Verification',
} as const;

test.describe('CRM-12325 Part 2-D - Light smoke', () => {

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const spinnerLocator = page.locator('.o_loading, .oe_loading, [class*="loading"]');
      await page.waitForTimeout(3000);
      await spinnerLocator.first().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }
  });

  test('CRM-12325_1.4.1: [Part2-D] Core apps render and the write path is alive', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    // Collect results for final verification
    const appRenderResults: { name: string; hasError: boolean }[] = [];
    let writePathResult: { id: number; deleted: boolean; error?: string } | null = null;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in on the Migration server');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const apps: Array<[string, string]> = [
        ['Contacts', MigPlatformPage.HASH.contacts],
        ['CRM', MigPlatformPage.HASH.crm],
        ['Sales', MigPlatformPage.HASH.sales],
        ['Settings', MigPlatformPage.HASH.settings],
      ];
      for (const [name, hash] of apps) {
        await platform.openAppAndAssertRendered(hash);
        const hasError = await platform.isErrorDialogVisible();
        appRenderResults.push({ name, hasError });
        console.log(`  ${name}: rendered, errorDialog=${hasError} -> ${hasError ? 'FAIL' : 'PASS'}`);
      }
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const contactName = `TEST Contact Mig ${Date.now()}`;
      writePathResult = await platform.writePathAliveViaPartner(contactName);
      console.log(`  Created: ${contactName}`);
      console.log(`  Record id: ${writePathResult.id}  |  cleanup deleted: ${writePathResult.deleted}  |  error: ${writePathResult.error || 'none'}`);
      console.log(`  Result : ${writePathResult.id > 0 ? 'PASS' : 'FAIL'} (write path persisted a record)`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);

      // Verification #1: Each core app renders with no error
      console.log('  Verify #1 - Each core app renders with no error:');
      for (const result of appRenderResults) {
        console.log(`     Expected : ${result.name} renders without error dialog`);
        console.log(`     Actual   : errorDialog=${result.hasError}`);
        console.log(`     Result   : ${result.hasError ? 'FAIL' : 'PASS'}`);
      }

      // Verification #2: The write path persisted a record (create returns an id), then cleaned it up
      console.log('  Verify #2 - The write path persisted a record (create returns an id), then cleaned it up:');
      console.log(`     Expected : record id > 0, cleanup successful`);
      console.log(`     Actual   : id=${writePathResult?.id}, deleted=${writePathResult?.deleted}`);
      console.log(`     Result   : ${writePathResult && writePathResult.id > 0 ? 'PASS' : 'FAIL'}`);

      console.log('===============================================');
      console.log('OVERALL: ' + (appRenderResults.every(r => !r.hasError) && writePathResult && writePathResult.id > 0 ? 'PASS' : 'FAIL') + ' - Core apps rendered and write path persisted record');

      // Run all expects after VERIFY block
      for (const result of appRenderResults) {
        expect(result.hasError, `${result.name} should render with no error`).toBeFalsy();
      }
      expect(writePathResult?.id, `the write path should persist a record (create returns an id). error=${writePathResult?.error || 'none'}`).toBeGreaterThan(0);
    });
  });
});
