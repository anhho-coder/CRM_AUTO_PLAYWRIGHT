import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { InvestmentPageMig } from '@pages/mig/InvestmentPageMig';
import { CommonUtils } from '@helpers/common.utils';
import { resetMigCreatedRecords } from '@helpers/o12ce-main-business.helper';

/**
 * ============================================================================================
 *  CRM-12370_8.2.13 - Investment record: "Track conversion date end" field (O12 CE Migration server)
 * ============================================================================================
 *  Test Case ID    : CRM-12370_8.2.13
 *  Automation-Type : ported
 *  Automation-Date : 2026-10-19
 *  Run as          : Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *
 *  Source TC (pre-production) : CRM-2482_2.1.1.13
 *  Source spec                : tests/1.Project_CRM/4.Investments/CRM-2482_Investments_module-General_fields/2.Investment_record/2.1.Main_section/2.1.1.List_of_fields/tc-crm-2482-2-1-1-13-Verify-Track_conversion_date_end-field.spec.ts
 *  Source version             : commit 74dc5b6 (2026-05-18) - re-check before trusting this spec
 *
 * --------------------------------------------------------------------------------------------
 *  Summary
 * --------------------------------------------------------------------------------------------
 *  Opens Investments > Investments > CREATE on crm-mig and verifies the "Track conversion date end" field of
 *  the main section is a Calendar field - the pre-production assertion, unchanged.
 *
 * --------------------------------------------------------------------------------------------
 *  Command to run
 * --------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_8.2.13:" --project=MigSmoke
 *
 * --------------------------------------------------------------------------------------------
 *  O12 CE deviations (mechanical only - BASELINE RULE: the assertion is copied unchanged)
 * --------------------------------------------------------------------------------------------
 *  - Login account users.admin_crm_mig on baseUrl_mig, via LoginPageMig.
 *  - Navigation by URL hash built from the XML ids of the Investments action + menu
 *    (InvestmentPageMig.navigateToInvestment) instead of clicking the menu text.
 *  - No data is created (the CREATE form is never saved), so there is nothing to clean up.
 *
 * --------------------------------------------------------------------------------------------
 *  Source manual TC
 * --------------------------------------------------------------------------------------------
 *  Pre-condition(s):
 *    1. After login successful, click at "Investments" button
 *    2. On "Investments" page, on menu on top of page, select "Investment" item
 *  Steps to reproduce:
 *    1. Press "CREATE" button and wait
 *    2. Verify "Track conversion date end" field is a Calendar field
 *  Verification:
 *    - "Track conversion date end" field exists on the CREATE form and is a Calendar field
 * ============================================================================================
 */

const TC = 'CRM-12370_8.2.13';
const FIELD_LABEL = 'Track conversion date end';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1-2: Login as Admin on crm-mig, open Investments > Investments (list)',
  s1: 'Step 1: Press "CREATE" button and wait',
  s2: 'Step 2: Verify "Track conversion date end" field is a Calendar field',
} as const;

test.describe(`${TC} - Track conversion date end field`, () => {
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
    console.log('Teardown: nothing to delete - the CREATE form was never saved');
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Verify the main fields of a Investment record includes "Track conversion date end" field`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

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
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - Investments list open');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await investmentPage.clickCreateButton();
      investmentPage.logUnsavedFormUrl('Investment');
      console.log('  OK - CREATE form is open');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const isValid = await investmentPage.verifyTrackConversionDateEndField();

      console.log('\n==================== VERIFY ====================');
      console.log(`  Verify #1 - "${FIELD_LABEL}" field on the CREATE form:`);
      console.log('     Expected : present, and a Calendar field');
      console.log(`     Actual   : ${isValid ? 'present, as expected' : 'missing or not as expected'}`);
      console.log(`     Result   : ${isValid ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${isValid ? 'PASS' : 'FAIL'} - "${FIELD_LABEL}" field check`);

      let __verifyPassed = false;
      try {
        expect(isValid, `"${FIELD_LABEL}" must be a Calendar field on the Investment form`).toBeTruthy();
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - ${FIELD_LABEL} field`,
          passed: __verifyPassed,
        }).catch(() => {});
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - field verified');
    });
  });
});
