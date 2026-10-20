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
 *  CRM-12370_8.6.2 - Track conversion date end = Date start + 6 months, on update (O12 CE Migration server)
 * ============================================================================================
 *  Test Case ID    : CRM-12370_8.6.2
 *  Automation-Type : ported
 *  Automation-Date : 2026-10-19
 *  Run as          : Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *
 *  Source TC (pre-production) : CRM-3326_2.1.2
 *  Source spec                : tests/1.Project_CRM/4.Investments/CRM-3326_The-fields-Track_conversion_date_start-and-Track_conversion_date_end-are-required-fields/
 *                               2.Update-Investment/tc-crm-3326-2-1-2-Verify-Track_conversion_date_star-equal-to-Date_end-Plus-6-months-when-update.spec.ts
 *  Source version             : commit 74dc5b6 (2026-05-18) + uncommitted working-tree edits (git status: M) - re-check before trusting this spec
 *
 * --------------------------------------------------------------------------------------------
 *  Summary
 * --------------------------------------------------------------------------------------------
 *  Creates its own Investment, then EDITs Date start = today - 3 days and verifies the
 *  "Track conversion date end" = new Date start + 6 months - the pre-production assertion, unchanged.
 *
 * --------------------------------------------------------------------------------------------
 *  Command to run
 * --------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_8\.6\.2:" --project=MigSmoke
 *
 * --------------------------------------------------------------------------------------------
 *  O12 CE deviations (mechanical only - BASELINE RULE: the assertion is copied unchanged)
 * --------------------------------------------------------------------------------------------
 *  - Login account users.admin_crm_mig on baseUrl_mig, via LoginPageMig.
 *  - Navigation by URL hash built from the XML ids (InvestmentPageMig.navigateToInvestment).
 *  - Investment Name carries the run marker "TEST CRM-12370_8.6.2 ..." for the afterAll sweep.
 *  - Test data that does not exist on crm-mig was substituted (same values as CRM-12370_8.3.5):
 *      Completion Events : Attended webinar    -> Atttended webinar
 *      Conversion Events : Download free trial -> Downloaded free trial
 *  - Clean-up: the source's UI teardown (Action > Delete) is replaced by the cleanup ledger. The
 *    Investment is registered after SAVE; afterEach deletes it through teardownMigRecords; afterAll
 *    sweeps Investments named "TEST CRM-12370_8.6.2" (count first, DENY-list by marker).
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
 *    2. Set the new value: "Date start" date = current date - 3 days (remember it)
 *    3. Verify that the value at "Track conversion date end" = the value of "Date start" date + 6 months
 *  Tear down: delete the Investment (ledger, see above)
 * ============================================================================================
 */

const TC = 'CRM-12370_8.6.2';

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
  s1: 'Step 1: On Investment page, press "EDIT" button and set "Date start" = current date - 3 days',
  s2: 'Step 2: Verify "Track conversion date end" = new "Date start" + 6 months',
} as const;

/** Per-test state the afterEach needs. */
let investmentId = 0;

test.describe(`${TC} - Track conversion date end on update`, () => {
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

  test(`${TC}: Verify Track conversion date end is set equal to Date start + 6 months when updating Investment`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const now = new Date();
    const currentDate = formatMDY(now);
    const sixMonthsLater = new Date(now);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    const dateEndPlus6Months = formatMDY(sixMonthsLater);
    const threeDaysBack = new Date(now);
    threeDaysBack.setDate(threeDaysBack.getDate() - 3);
    const newDateStart = formatMDY(threeDaysBack);
    const newDateStartPlusSix = new Date(threeDaysBack);
    newDateStartPlusSix.setMonth(newDateStartPlusSix.getMonth() + 6);
    const expectedTrackEndDate = formatMDY(newDateStartPlusSix);

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
      await investmentPage.fillDateStart(newDateStart);
      console.log(`  OK - Date start updated to: ${newDateStart} (current date - 3 days)`);
      console.log(`  - Expected Track conversion date end: ${expectedTrackEndDate} (Date start + 6 months)`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const trackEndActual = await investmentPage.getTrackConversionDateEndValue();
      const ok = trackEndActual === expectedTrackEndDate;

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #2.1 - "Track conversion date end" after Date start was updated:');
      console.log(`     Expected : "${expectedTrackEndDate}" (updated Date start + 6 months)`);
      console.log(`     Actual   : "${trackEndActual}"`);
      console.log(`     Result   : ${ok ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${ok ? 'PASS' : 'FAIL'} - Track conversion date end on update check`);

      let __verifyPassed = false;
      try {
        expect(trackEndActual, 'Step 2: Track conversion date end should equal updated Date start + 6 months').toBe(expectedTrackEndDate);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - Track conversion date end on update`,
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
