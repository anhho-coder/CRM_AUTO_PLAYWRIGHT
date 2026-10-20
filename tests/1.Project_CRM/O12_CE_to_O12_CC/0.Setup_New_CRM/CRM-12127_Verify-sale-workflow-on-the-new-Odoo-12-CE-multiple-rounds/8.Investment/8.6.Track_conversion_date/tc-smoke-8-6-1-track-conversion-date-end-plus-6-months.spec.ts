import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { InvestmentPageMig } from '@pages/mig/InvestmentPageMig';
import { CommonUtils } from '@helpers/common.utils';
import { resetMigCreatedRecords } from '@helpers/o12ce-main-business.helper';

/**
 * ============================================================================================
 *  CRM-12370_8.6.1 - Track conversion date end = Date start + 6 months, new Investment (O12 CE Migration server)
 * ============================================================================================
 *  Test Case ID    : CRM-12370_8.6.1
 *  Automation-Type : ported
 *  Automation-Date : 2026-10-19
 *  Run as          : Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *
 *  Source TC (pre-production) : CRM-3326_1.1.2
 *  Source spec                : tests/1.Project_CRM/4.Investments/CRM-3326_The-fields-Track_conversion_date_start-and-Track_conversion_date_end-are-required-fields/
 *                               1.Create-new-Investment/tc-crm-3326-1-1-2-Verify-Track_conversion_date_start-equal-to-Date_end-Plus-6-months.spec.ts
 *  Source version             : commit 74dc5b6 (2026-05-18) - re-check before trusting this spec
 *
 * --------------------------------------------------------------------------------------------
 *  Summary
 * --------------------------------------------------------------------------------------------
 *  On a new (unsaved) Investment, sets Date start = today and verifies the auto-filled
 *  "Track conversion date end" = today + 6 months - the pre-production assertion, unchanged.
 *
 * --------------------------------------------------------------------------------------------
 *  Command to run
 * --------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_8\.6\.1:" --project=MigSmoke
 *
 * --------------------------------------------------------------------------------------------
 *  O12 CE deviations (mechanical only - BASELINE RULE: the assertion is copied unchanged)
 * --------------------------------------------------------------------------------------------
 *  - Login account users.admin_crm_mig on baseUrl_mig, via LoginPageMig.
 *  - Navigation by URL hash built from the XML ids (InvestmentPageMig.navigateToInvestment).
 *  - The new Investment is never saved, so there is nothing to clean up.
 *
 * --------------------------------------------------------------------------------------------
 *  Source manual TC
 * --------------------------------------------------------------------------------------------
 *  Pre-condition(s):
 *    1. After login successful, click at "Investments" button
 *    2. On "Investments" page, on menu on top of page, select "Investment" item
 *    3. Press "CREATE" button and wait
 *  Steps to reproduce:
 *    1. On Investment page, enter the value to the following fields: "Date start" date = current date
 *    2. Verify that the value at the following fields are automatically added:
 *       "Track conversion date end" date = current date + 6 months
 * ============================================================================================
 */

const TC = 'CRM-12370_8.6.1';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1-2: Login as Admin on crm-mig, open Investments > Investments (list)',
  pre2: 'Pre-condition 3: Press "CREATE" button and wait',
  s1: 'Step 1: On Investment page, enter "Date start" = current date',
  s2: 'Step 2: Verify "Track conversion date end" = current date + 6 months (automatically added)',
} as const;

test.describe(`${TC} - Track conversion date end on a new Investment`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
    }
    console.log('Teardown: nothing to delete - the new Investment was never saved');
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Verify Track conversion date end is set equal to Date start + 6 months when creating Investment`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const now = new Date();
    const currentDate = formatMDY(now);
    const sixMonthsLater = new Date(now);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    const expectedTrackEndDate = formatMDY(sixMonthsLater);

    const loginPage = new LoginPageMig(page);
    const investmentPage = new InvestmentPageMig(page);

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      resetMigCreatedRecords();
      console.log(`  - Host    : ${baseUrl_mig}`);
      console.log(`  - Account : ${users.admin_crm_mig.username}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await investmentPage.navigateToInvestment();
      console.log('  OK - Investments list is open');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await investmentPage.clickCreateButton();
      investmentPage.logUnsavedFormUrl('Investment');
      console.log('  OK - CREATE form is open');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await investmentPage.fillDateStart(currentDate);
      console.log(`  OK - Date start entered: ${currentDate}`);
      console.log(`  - Expected Track conversion date end: ${expectedTrackEndDate}`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const trackEndActual = await investmentPage.getTrackConversionDateEndValue();
      const ok = trackEndActual === expectedTrackEndDate;

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #2.1 - "Track conversion date end" after Date start was set:');
      console.log(`     Expected : "${expectedTrackEndDate}" (Date start + 6 months)`);
      console.log(`     Actual   : "${trackEndActual}"`);
      console.log(`     Result   : ${ok ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${ok ? 'PASS' : 'FAIL'} - Track conversion date end check`);

      let __verifyPassed = false;
      try {
        expect(trackEndActual, 'Step 2: Track conversion date end should equal Date start + 6 months').toBe(expectedTrackEndDate);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - Track conversion date end`,
          passed: __verifyPassed,
        }).catch(() => {});
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Track conversion date end verified');
    });
  });
});

function formatMDY(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}
