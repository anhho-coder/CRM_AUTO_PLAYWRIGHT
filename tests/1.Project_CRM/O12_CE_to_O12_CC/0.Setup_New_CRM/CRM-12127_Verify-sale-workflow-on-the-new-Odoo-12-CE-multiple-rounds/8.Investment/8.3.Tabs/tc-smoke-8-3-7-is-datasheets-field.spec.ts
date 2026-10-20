import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { InvestmentPageMig } from '@pages/mig/InvestmentPageMig';
import { CommonUtils } from '@helpers/common.utils';
import { resetMigCreatedRecords } from '@helpers/o12ce-main-business.helper';

/**
 * ============================================================================================
 *  CRM-12370_8.3.7 - Investment Required items tab: "Is Datasheets" (O12 CE Migration server)
 * ============================================================================================
 *  Test Case ID    : CRM-12370_8.3.7
 *  Automation-Type : ported
 *  Automation-Date : 2026-10-19
 *  Run as          : Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *
 *  Source TC (pre-production) : CRM-2482_2.2.5.1.1
 *  Source spec                : tests/1.Project_CRM/4.Investments/CRM-2482_Investments_module-General_fields/2.Investment_record/2.2.Tabs/2.2.5. Required_items_tab/2.2.5.1.Giveaways_section/tc-crm-2482-2-2-5-1-1-Verify-Is_Datasheets-field.spec.ts
 *  Source version             : commit 74dc5b6 (2026-05-18) - re-check before trusting this spec
 *
 * --------------------------------------------------------------------------------------------
 *  Summary
 * --------------------------------------------------------------------------------------------
 *  Opens Investments > Investments > CREATE on crm-mig, drives the Required items tab as the
 *  source TC does, and verifies "Is Datasheets" is a checkbox field - the pre-production assertion, unchanged.
 *
 * --------------------------------------------------------------------------------------------
 *  Command to run
 * --------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_8\.3\.7:" --project=MigSmoke
 *
 * --------------------------------------------------------------------------------------------
 *  O12 CE deviations (mechanical only - BASELINE RULE: the assertion is copied unchanged)
 * --------------------------------------------------------------------------------------------
 *  - Login account users.admin_crm_mig on baseUrl_mig, via LoginPageMig.
 *  - Navigation by URL hash built from the XML ids (InvestmentPageMig.navigateToInvestment).
 *  - No data is saved (the CREATE form is never saved), so there is nothing to clean up.
 *
 * --------------------------------------------------------------------------------------------
 *  Source manual TC
 * --------------------------------------------------------------------------------------------
 *  Pre-condition(s):
 *    1. After login successful, click at "Investments" button
 *    2. On "Investments" page, on menu on top of page, select "Investment" item
 *  Steps to reproduce:
 *    1. Press "CREATE" button and wait
 *    2. Click at "Required items" tab and wait
 *    3. Click at "Is Datasheets" field
 *    4. Verify "Is Datasheets" field is a checkbox field
 *  Verification:
 *    - "Is Datasheets" is a checkbox field
 * ============================================================================================
 */

const TC = 'CRM-12370_8.3.7';
const FIELD_LABEL = 'Is Datasheets';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1-2: Login as Admin on crm-mig, open Investments > Investments (list)',
  s1: 'Step 1: Press "CREATE" button and wait',
  s2: 'Step 2: Click at "Required items" tab and wait',
  s3: 'Step 3: Click at "Is Datasheets" field',
  s4: 'Step 4: Verify "Is Datasheets" field is a checkbox field',
} as const;

test.describe(`${TC} - Required items tab: ${FIELD_LABEL}`, () => {
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

  test(`${TC}: Verify the Required items tab of a Investment record includes "Is Datasheets" field`, async ({ page }, testInfo) => {
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
      console.log('  OK - done');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await investmentPage.clickRequiredItemsTab();
      console.log('  OK - done');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await investmentPage.clickIsDatasheetsField();
      console.log('  OK - done');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      const isValid = await investmentPage.verifyIsDatasheetsField();

      console.log('\n==================== VERIFY ====================');
      console.log(`  Verify #1 - "${FIELD_LABEL}" field on the Investment form:`);
      console.log('     Expected : present, and a checkbox field');
      console.log(`     Actual   : ${isValid ? 'present, as expected' : 'missing or not as expected'}`);
      console.log(`     Result   : ${isValid ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${isValid ? 'PASS' : 'FAIL'} - "${FIELD_LABEL}" check`);

      let __verifyPassed = false;
      try {
        expect(isValid, `"${FIELD_LABEL}" must be a checkbox field on the Investment form`).toBeTruthy();
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
