import { test, expect, Browser } from '@playwright/test';
import { config } from '@config/test.config';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { InvestmentPageMig } from '@pages/mig/InvestmentPageMig';
import { CommonUtils } from '@helpers/common.utils';
import {
  resetMigCreatedRecords,
  registerMigRecord,
  teardownMigRecords,
  listMigCreatedRecords,
} from '@helpers/o12ce-main-business.helper';

/**
 * ============================================================================================
 *  CRM-12370_8.6.3 - Track conversion date start is a required field after clearing (O12 CE Migration server)
 * ============================================================================================
 *  Test Case ID    : CRM-12370_8.6.3
 *  Automation-Type : ported
 *  Automation-Date : 2026-10-19
 *  Run as          : Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *
 *  Source TC (pre-production) : CRM-3326_3.1.1
 *  Source spec                : tests/1.Project_CRM/4.Investments/CRM-3326_The-fields-Track_conversion_date_start-and-Track_conversion_date_end-are-required-fields/
 *                               3.Clear-the-field/tc-crm-3326-3-1-1-Verify-Track_conversion_date_start-is-a-required-field.spec.ts
 *  Source version             : commit 74dc5b6 (2026-05-18) - re-check before trusting this spec
 *
 * --------------------------------------------------------------------------------------------
 *  Summary
 * --------------------------------------------------------------------------------------------
 *  Creates its own Investment, EDITs it, clears "Track conversion date start", SAVEs and verifies
 *  the required-field warning lists "Track conversion date start" - the pre-production assertion,
 *  unchanged. Then sets the date again and SAVEs.
 *
 * --------------------------------------------------------------------------------------------
 *  Command to run
 * --------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_8\.6\.3:" --project=MigSmoke
 *
 * --------------------------------------------------------------------------------------------
 *  O12 CE deviations (mechanical only - BASELINE RULE: the assertion is copied unchanged)
 * --------------------------------------------------------------------------------------------
 *  - Login account users.admin_crm_mig on baseUrl_mig, via LoginPageMig.
 *  - Navigation by URL hash built from the XML ids (InvestmentPageMig.navigateToInvestment).
 *  - Investment Name carries the run marker "TEST CRM-12370_8.6.3 ..." for the afterAll sweep.
 *  - Test data that does not exist on crm-mig was substituted (same values as CRM-12370_8.3.5):
 *      Completion Events : Attended webinar    -> Atttended webinar
 *      Conversion Events : Download free trial -> Downloaded free trial
 *  - Clean-up: the source's UI teardown (Action > Delete) is replaced by the cleanup ledger. The
 *    Investment is registered after its first SAVE; afterEach deletes it through teardownMigRecords;
 *    afterAll sweeps Investments named "TEST CRM-12370_8.6.3" (count first, DENY-list by marker).
 *
 * --------------------------------------------------------------------------------------------
 *  Source manual TC
 * --------------------------------------------------------------------------------------------
 *  Pre-condition(s):
 *    1. After login successful, click at "Investments" button
 *    2. On "Investments" page, on menu on top of page, select "Investment" item
 *    3. Press "CREATE" button and wait
 *    4. Create a blank Investment (Type Webinar, Channel, Countries Albania, Date start / Date end /
 *       Track conversion date start = current date, Track conversion date end = current date + 6 months,
 *       Responsible - Sales Aleksey Galbur, Responsible - Marketing Nadiia Suprun, NBR Product List M365)
 *  Steps to reproduce:
 *    1. On Investment page, press "EDIT" button
 *    2. Clear the value: "Track conversion date start" date = BLANK
 *    3. Press "SAVE" button
 *    4. Verify "Track conversion date start" date is a required field by showing this warning:
 *       "The following fields are invalid: Track conversion date start"
 *    5. Set the value: "Track conversion date start" date = current date
 *    6. Press "SAVE" button and wait
 *  Tear down: delete the Investment (ledger, see above)
 * ============================================================================================
 */

const TC = 'CRM-12370_8.6.3';

/** Investment master data - crm-mig substitutions as in CRM-12370_8.3.5 (see header). */
const INVESTMENT_DATA = {
  type: 'Webinar',
  channel: 'Channel',
  countries: 'Albania',
  responsibleSales: 'Aleksey Galbur',
  responsibleMarketing: 'Nadiia Suprun',
  nbrProductList: 'M365',
  completionEvents: 'Atttended webinar',
  conversionEvents: 'Downloaded free trial',
} as const;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1-2: Login as Admin on crm-mig, open Investments > Investments (list)',
  pre2: 'Pre-condition 3: Press "CREATE" button and wait',
  pre3: 'Pre-condition 4: Create a blank Investment',
  s1: 'Step 1: On Investment page, press "EDIT" button',
  s2: 'Step 2: Clear the value: "Track conversion date start" date = BLANK',
  s3: 'Step 3: Press "SAVE" button',
  s4: 'Step 4: Verify "Track conversion date start" is a required field (warning: "The following fields are invalid")',
  s5: 'Step 5: Set the value: "Track conversion date start" date = current date',
  s6: 'Step 6: Press "SAVE" button and wait',
} as const;

/** Per-test state the afterEach needs. */
let investmentId = 0;

test.describe(`${TC} - Track conversion date start is a required field after clearing`, () => {
  test.beforeEach(async ({ context, page }) => {
    investmentId = 0;
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
    // Evidence: the URL of every record this test created, printed before teardown removes (or keeps) them.
    await new InvestmentPageMig(page).logRecordUrls(TC, listMigCreatedRecords()).catch(() => {});
    await teardownMigRecords(page, false);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.afterAll(async ({ browser }) => {
    await sweepInvestmentsAfterAll(browser, TC);
  });

  test(`${TC}: Verify Track conversion date start is a required field after clearing the field`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const now = new Date();
    const currentDate = formatMDY(now);
    const sixMonthsLater = new Date(now);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    const dateEndPlus6Months = formatMDY(sixMonthsLater);

    const investmentName = `TEST ${TC} Investment ${CommonUtils.generateTimestamp()}`;
    const investmentID = `TEST-Investment-${CommonUtils.generateTimestamp()}`;

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
      console.log('  OK - CREATE form is open');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      console.log(`  - Investment Name             : ${investmentName}`);
      console.log(`  - Investment ID               : ${investmentID}`);
      console.log(`  - Date start / Date end       : ${currentDate}`);
      console.log(`  - Track conversion date start : ${currentDate}`);
      console.log(`  - Track conversion date end   : ${dateEndPlus6Months}`);
      await investmentPage.createBlankInvestment({
        investmentName,
        investmentID,
        ...INVESTMENT_DATA,
        dateStart: currentDate,
        dateEnd: currentDate,
        trackConversionDateStart: currentDate,
        trackConversionDateEnd: dateEndPlus6Months,
      });
      investmentId = await investmentPage.findInvestmentIdByName(investmentName);
      expect(investmentId, `the Investment "${investmentName}" must exist after SAVE`).toBeGreaterThan(0);
      registerMigRecord(InvestmentPageMig.MODEL, investmentId, 'Investment');
      InvestmentPageMig.logRecordUrl('Investment', InvestmentPageMig.MODEL, investmentId);
      console.log(`  OK - Investment saved (id ${investmentId})`);
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await investmentPage.clickEditButton();
      console.log('  OK - Investment is in EDIT mode');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await investmentPage.clearTrackConversionDateStart();
      const valueAfterClear = await investmentPage.getTrackConversionDateStartValue();
      console.log(`  - "Track conversion date start" after clear: "${valueAfterClear}"`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await investmentPage.clickSaveButton();
      console.log('  OK - SAVE pressed');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      const warningText = await investmentPage.getInvalidFieldsWarningText();

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #4.1 - warning after SAVE with the field blank:');
      console.log('     Expected : warning lists the invalid fields and names "Track conversion date start"');
      console.log(`     Actual   : "${warningText}"`);
      console.log('===============================================');

      let __verifyPassed = false;
      try {
        expect(warningText, 'Step 4: Warning should mention invalid fields').toContain('following field');
        expect(warningText, 'Step 4: Warning should list "Track conversion date start"').toContain('Track conversion date start');
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - required-field warning`,
          passed: __verifyPassed,
        }).catch(() => {});
      }
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      await investmentPage.fillTrackConversionDateStart(currentDate);
      console.log(`  OK - Track conversion date start set to ${currentDate}`);
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      await investmentPage.clickSaveButton();
      console.log('  OK - SAVE pressed');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - saved with Track conversion date start');
    });
  });
});

function formatMDY(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * afterAll safety net (own admin session - afterAll gets no `page`): delete Investments still named
 * "TEST <tcId> ..." and the Leads linked to them. Bounded hook budget; never throws.
 */
async function sweepInvestmentsAfterAll(browser: Browser, tcId: string): Promise<void> {
  test.setTimeout(120_000);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const loginPage = new LoginPageMig(page);
    await loginPage.navigateTo(baseUrl_mig);
    await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
    await new InvestmentPageMig(page).sweepInvestmentLeftovers(tcId);
  } catch (err) {
    console.log(`[mig-sweep] SKIPPED - could not open a sweep session: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
  } finally {
    await context.close().catch(() => {});
  }
}
