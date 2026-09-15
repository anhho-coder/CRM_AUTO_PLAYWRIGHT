import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 * CRM-12325 Part 2-A.2 - R&E Time Tracking app opens cleanly and within a reasonable time
 * ===========================================================================
 * Test Case ID    : CRM-12325_1.1.8
 * Jira            : CRM-12343
 * Test Repository : /CRM test/Migration - Setup New CRM/CRM-12325_Build fresh Odoo 12 Community/A. Reachable & boot
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE)
 * Automation-Type : new
 * Automation-Date : 2026-08-19
 * Automation-Updated: 2026-09-15 (steps re-synced with the Jira manual TC; skip-by-bug added below)
 *
 * ---------------------------------------------------------------------------
 * SKIPPED BY BUG CRM-12656 - tester's decision, 2026-09-15
 * ---------------------------------------------------------------------------
 * Recorded as instructed. The attribution is NOT confirmed, and the note below says why, so that
 * whoever picks this up next is not misled by the bug number alone.
 *
 * WHAT WAS MEASURED (6 of 6 runs on 2026-09-15, every one FAIL, response time 1507-2562 ms):
 *   - the dialog raised here is the GENERIC shell - "Odoo Client Error" / "An error occurred" /
 *     "Please use the copy button to report the error to your support service". Nothing else.
 *   - the repo detects CRM-12656 by the text
 *         /remote instance has no browser origin|NAKIVO Remote Instance|Odoo 19 URL/i
 *     (tc-cutoff-3-3-2 line 63, tc-cutoff-3-7-2 line 86). That pattern matches this dialog
 *     ZERO times.
 *   - the sidebar on the resulting screen lists 24 apps and contains no "R&E Time Tracking" entry.
 *
 * WHAT THAT POINTS AT INSTEAD: `MigPlatformPage.ABSENT_ON_MIG` already records this app as having no
 * live `ir.ui.menu` row at any depth, and `MigPlatformPage.HASH.reTimeTracking` states that opening
 * the hash "WILL raise an Odoo error dialog ... the truth about the instance, not a bug in the spec".
 * The same file adds that a dead-hash "An error occurred" shell is "an automation defect, not a
 * product defect - so do NOT raise a bug for them". On that evidence this failure is the app being
 * ABSENT, not CRM-12656.
 *
 * NOT VERIFIED: CRM-12656 itself could not be read back - the Jira MCP session was expired at the
 * time of writing, so the ticket's own wording was never compared against this dialog.
 *
 * OPEN QUESTION for the TC owner - nobody has answered this yet:
 *   Is R&E Time Tracking in scope for the migration at all?
 *     - if YES, the app missing from crm-mig is a migration gap in its own right and this spec is
 *       right to go red;
 *     - if NO, manual TC CRM-12343 should drop the app and this spec should assert ABSENCE
 *       (app not present in the menu) instead of asserting that it opens cleanly.
 *
 * The skip below is CONDITIONAL on the error actually occurring, following tc-cutoff-3-7-2: the day
 * the app appears, the skip stops firing by itself and the assertions resume.
 *
 * Summary:
 *   Verifies the R&E Time Tracking app opens on the Migration server with no server error / traceback
 *   and renders within a reasonable response-time budget.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_1\.1\.8:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 * Source manual TC - Jira CRM-12343, Xray Manual Steps (verbatim, in order)
 * ---------------------------------------------------------------------------
 * Pre-conditions:
 *   _ Login: anh.ho@nakivo.com (admin_crm_mig) on crm-mig.nakivo.site
 *
 * Steps to reproduce #1:
 *   1. Open the R&E Time Tracking app (via its menu) and let its action view render.
 *      AUTOMATION: automated - opens by URL hash and waits for the loading spinner to clear
 *      (@pages/mig MigPlatformPage.openAppAndMeasureMs).
 *
 * Verification - Expected Result on step 1:
 *   _ No server error / traceback dialog is shown
 *   _ The R&E Time Tracking app loads within a reasonable time (response time under the ~30s budget)
 * ---------------------------------------------------------------------------
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1:   'Pre-condition 1: Login: anh.ho@nakivo.com (admin_crm_mig) on crm-mig.nakivo.site',
  s1:     'Step 1: Open the R&E Time Tracking app (via its menu) and let its action view render.',
  verify: 'Verification',
} as const;

test.describe('CRM-12325 Part 2-A.2 - R&E Time Tracking opens cleanly and fast', () => {

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

  test('CRM-12325_1.1.8: [Part2-A] R&E Time Tracking app opens with no server error and within a reasonable time', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    const budget = MigPlatformPage.APP_RESPONSE_BUDGET_MS;
    let ms: number;
    let hasError: boolean;

    console.log('========== CRM-12325_1.1.8 - R&E Time Tracking app opens cleanly and fast ==========');

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
      ms = await platform.openAppAndMeasureMs(MigPlatformPage.HASH.reTimeTracking);
      hasError = await platform.isErrorDialogVisible();
      console.log(`  R&E Time Tracking opened - errorDialog=${hasError}, response time=${ms} ms`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log('\n==================== VERIFY ====================');
      console.log('Verify #1 - No server error / traceback dialog is shown:');
      console.log(`   Expected : hasError = false`);
      console.log(`   Actual   : hasError = ${hasError}`);
      console.log(`   Result   : ${!hasError ? 'PASS' : 'FAIL'}`);
      console.log('Verify #2 - The R&E Time Tracking app loads within a reasonable time (response time under the ~30s budget):');
      console.log(`   Expected : ms < ${budget}`);
      console.log(`   Actual   : ms = ${ms}`);
      console.log(`   Result   : ${ms < budget ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${(!hasError && ms < budget) ? 'PASS' : 'FAIL'} - R&E Time Tracking app opens cleanly and within budget`);

      // SKIPPED BY BUG CRM-12656 - tester's decision 2026-09-15. See the SKIP block in the header
      // for the measured caveat: the dialog observed here does NOT carry this bug's signature.
      //
      // Deliberately placed AFTER the VERIFY logging and made conditional, not a blanket skip at the
      // top of the file. Two reasons: the run still records hasError and the response time, so the
      // evidence survives for whoever revisits the attribution; and the day the app appears the
      // condition stops matching and the assertions below resume on their own.
      if (hasError) {
        console.log('\n  SKIP: error dialog present on a screen with no live menu - skipping by bug CRM-12656, not failing.');
        test.skip(true, 'Skipped due to bug CRM-12656');
      }

      expect(hasError, 'R&E Time Tracking app should open with no server error / traceback').toBeFalsy();
      expect(ms, `R&E Time Tracking app should load within ${budget}ms (actual ${ms}ms)`).toBeLessThan(budget);
    });
  });
});
