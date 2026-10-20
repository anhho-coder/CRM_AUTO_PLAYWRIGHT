import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, HomePageMig, CurrencyPageMig } from '@pages/mig';
import { QuotationPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  addDealElementOnO12CE,
  pressNewQuotationOnO12CE,
  registerMigRecord,
  teardownMigRecords
} from '@helpers/o12ce-main-business.helper';

/**
 * ===========================================================================
 *  Exchange Rates - CRM-11857_3.3: Quotation rederives rate on pricelist change
 * ===========================================================================
 *  Test Case ID    : CRM-11857_3.3
 *  Jira            : CRM-13394
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-13
 *  Source version  : CRM-13394 updated 2026-10-09T09:58:08+0300, 5 Xray manual steps
 *                    - re-check before trusting this spec
 *  Run as          : CRM administrator (anh.ho@nakivo.com) - the TC asks for a user with Billing
 *                    Manager, Multi Currencies, Settings and Show Full Accounting Features rights.
 *
 *  Summary:
 *    Create an Opportunity with a Deal Element on Public Pricelist_EUR (EUR currency), then
 *    create a quotation. Change the quotation's Order Date from 2026-08-03 to 2026-08-06, and
 *    verify the Total in Company Currency is recalculated using the rate for the new date, not
 *    the original date.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_3\\.3:" --project=O12
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC - CRM-13394 (verbatim)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Log in to crm-mig (https://crm-mig.nakivo.site) as a user with Billing Manager, Multi
 *      Currencies, Settings and Show Full Accounting Features access rights.
 *    - An Opportunity AUTO-CRM-11857-3.3-<runId> exists with a Deal Element on Pricelist =
 *      Public Pricelist_EUR (EUR) and one product line.
 *
 *  1. Open Invoicing > Configuration > Accounting > Currencies, open EUR, click "Rates"
 *     and note the Rate of the row dated 2026-08-03 as R1 and of the row dated 2026-08-06
 *     as R2
 *     Expected Result: R1 is different from R2
 *
 *  2. Open CRM > Sales > My Pipeline, open the Opportunity from the pre-conditions and
 *     click "New Quotation"
 *     Expected Result: A quotation opens with Pricelist = Public Pricelist_EUR (EUR)
 *
 *  3. Click Edit, set Order Date = 2026-08-03 10:00:00 and the Quantity of the product
 *     line = 1, click Save, and note the Total as T1
 *     Expected Result: Total in Company Currency = T1 / R1, rounded to 2 decimals
 *
 *  4. Click Edit, set Order Date = 2026-08-06 10:00:00 and the Quantity of the product
 *     line = 2 in the same edit, click Save
 *     Expected Result: Total = 2 x T1
 *
 *  5. Read the Total in Company Currency on the quotation
 *     Expected Result: Total in Company Currency = Total / R2, rounded to 2 decimals
 *                      Total in Company Currency is not Total / R1
 *
 * ===========================================================================
 */

const CURRENCY_CODE = 'EUR';
const DATE_1 = '2026-08-03';
const DATE_2 = '2026-08-06';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre: 'Pre-condition: Create Opportunity and Deal Element with Public Pricelist_EUR',
  s1: 'Step 1: Open Invoicing > Configuration > Accounting > Currencies and note R1 (2026-08-03) and R2 (2026-08-06)',
  s2: 'Step 2: Open CRM > Sales > My Pipeline, open the Opportunity and click "New Quotation"',
  s3: 'Step 3: Click Edit, set Order Date = 2026-08-03 10:00:00 and the Quantity of the product line = 1, click Save, and note the Total as T1',
  s4: 'Step 4: Click Edit, set Order Date = 2026-08-06 10:00:00 and the Quantity of the product line = 2 in the same edit, click Save',
  s5: 'Step 5: Read the Total in Company Currency on the quotation',
  verify: 'Verification: Total in Company Currency uses the rate for the new Order Date, not the original',
} as const;

const money = (s: string | undefined | null): number =>
  parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

test.describe('CRM-11857_3.3 - Exchange Rates: Quotation rederives rate when order date or pricelist changes', () => {
  test.describe.configure({ timeout: config.timeouts.test });

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
      const homePage = new HomePageMig(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-11857_3.3: Verify a draft quotation rederives its conversion rate when order date changes', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const homePage = new HomePageMig(page);

    const runId = Date.now().toString();
    const opportunityName = `AUTO-CRM-11857-3.3-${runId}`;

    let rate1 = 0;
    let rate2 = 0;
    let opportunityId = '';

    try {
      await test.step(STEP.pre, async () => {
        console.log(`\n--- ${STEP.pre} ---`);
        console.log(`  Target  : ${baseUrl}`);
        console.log(`  Account : ${users.admin_crm_mig.username} (${users.admin_crm_mig.displayName})`);
        console.log(`  Opportunity: ${opportunityName}`);

        await loginToO12CE(page);

        // Create Opportunity with Deal Element
        await openOpportunitiesListOnO12CE(page);

        const oppResult = await createOpportunityOnO12CE(page, opportunityName, {});
        opportunityId = oppResult.oppId;
        console.log(`  - Opportunity created: ${opportunityId}`);
        registerMigRecord('crm.lead', opportunityId, `Opportunity ${opportunityName}`);

        // Add Deal Element with Public Pricelist_EUR
        await addDealElementOnO12CE(page, {
          productQty: 1,
          pricelist: 'Public Pricelist_EUR',
          product: 'Service', // default product
        });
        console.log(`  - Deal Element added with Public Pricelist_EUR`);

        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - Opportunity and Deal Element created').catch(() => {});
      });

      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        const currencyPage = new CurrencyPageMig(page);
        await currencyPage.openRatesForCurrency(CURRENCY_CODE, CommonUtils.waitTimes.pageLoad);

        const rateRow1 = await currencyPage.getRateApplicableToDate(DATE_1);
        const rateRow2 = await currencyPage.getRateApplicableToDate(DATE_2);

        expect(rateRow1).toBeTruthy();
        expect(rateRow2).toBeTruthy();

        rate1 = rateRow1?.rate || 0;
        rate2 = rateRow2?.rate || 0;

        expect(rate1).toBeGreaterThan(0);
        expect(rate2).toBeGreaterThan(0);
        expect(rate1).not.toEqual(rate2);

        console.log(`  - Rate for ${DATE_1}: R1 = ${rate1}`);
        console.log(`  - Rate for ${DATE_2}: R2 = ${rate2}`);
        console.log(`  ✓ Confirmed: R1 (${rate1}) != R2 (${rate2})`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - EUR rates').catch(() => {});
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        // Navigate to opportunities
        await openOpportunitiesListOnO12CE(page);

        // Open the opportunity
        await page.goto(`${baseUrl}#id=${opportunityId}&view_type=form&model=crm.lead`, { waitUntil: 'networkidle' });
        console.log(`  - Opportunity ${opportunityName} opened`);

        // Create quotation
        const quoteResult = await pressNewQuotationOnO12CE(page, { opportunityId });
        console.log(`  - New Quotation created: ${quoteResult.quotationId}`);
        registerMigRecord('sale.order', quoteResult.quotationId, `Quotation for ${opportunityName}`);

        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Quotation created').catch(() => {});
      });

      let totalT1 = 0;
      let totalInCompanyCurrencyT1 = '';

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        const quotationPage = new QuotationPage(page);

        // Click Edit
        await quotationPage.clickEdit();
        console.log(`  - Clicked Edit`);

        // Set Order Date to 2026-08-03 10:00:00
        const dateSet = await quotationPage.setOrderDate(`${DATE_1} 10:00:00`);
        expect(dateSet).toBeTruthy();
        console.log(`  - Set Order Date = ${DATE_1} 10:00:00`);

        // Set Quantity of the product line to 1
        const qtySet = await quotationPage.setOrderLineQuantity('Service', 1);
        expect(qtySet).toBeTruthy();
        console.log(`  - Set Quantity = 1 for product line`);

        // Click Save
        await quotationPage.clickSaveButton();
        console.log(`  - Clicked Save`);

        // Note the Total as T1
        totalT1 = await quotationPage.getQuotationTotal();
        totalInCompanyCurrencyT1 = await quotationPage.getTotalInCompanyCurrency();
        console.log(`  - Total (T1) = ${totalT1}`);
        console.log(`  - Total in Company Currency (T1_cc) = ${totalInCompanyCurrencyT1}`);

        // Verify: Total in Company Currency = T1 / R1 (rounded to 2 decimals)
        const expectedT1CC = Math.round((totalT1 / rate1) * 100) / 100;
        const actualT1CC = parseFloat(totalInCompanyCurrencyT1);
        console.log(`  - Expected: Total in Company Currency = ${totalT1} / ${rate1} = ${expectedT1CC}`);
        console.log(`  - Actual: ${actualT1CC}`);
        expect(Math.abs(actualT1CC - expectedT1CC)).toBeLessThan(0.01);

        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Order Date and Quantity set').catch(() => {});
      });

      let totalT2 = 0;

      await test.step(STEP.s4, async () => {
        console.log(`\n--- ${STEP.s4} ---`);
        const quotationPage = new QuotationPage(page);

        // Click Edit
        await quotationPage.clickEdit();
        console.log(`  - Clicked Edit`);

        // Set Order Date to 2026-08-06 10:00:00
        const dateSet = await quotationPage.setOrderDate(`${DATE_2} 10:00:00`);
        expect(dateSet).toBeTruthy();
        console.log(`  - Set Order Date = ${DATE_2} 10:00:00`);

        // Set Quantity of the product line to 2
        const qtySet = await quotationPage.setOrderLineQuantity('Service', 2);
        expect(qtySet).toBeTruthy();
        console.log(`  - Set Quantity = 2 for product line`);

        // Click Save
        await quotationPage.clickSaveButton();
        console.log(`  - Clicked Save`);

        // Note the Total
        totalT2 = await quotationPage.getQuotationTotal();
        console.log(`  - Total = ${totalT2}`);

        // Verify: Total = 2 x T1
        const expectedTotal = totalT1 * 2;
        console.log(`  - Expected: Total = 2 x ${totalT1} = ${expectedTotal}`);
        console.log(`  - Actual: ${totalT2}`);
        expect(Math.abs(totalT2 - expectedTotal)).toBeLessThan(0.01);

        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - Order Date changed and Quantity updated').catch(() => {});
      });

      await test.step(STEP.s5, async () => {
        console.log(`\n--- ${STEP.s5} ---`);
        const quotationPage = new QuotationPage(page);

        // Read Total in Company Currency
        const totalInCompanyCurrencyT2 = await quotationPage.getTotalInCompanyCurrency();
        console.log(`  - Total in Company Currency = ${totalInCompanyCurrencyT2}`);

        // Verify: Total in Company Currency = Total / R2 (rounded to 2 decimals)
        const expectedT2CC = Math.round((totalT2 / rate2) * 100) / 100;
        const actualT2CC = parseFloat(totalInCompanyCurrencyT2);
        console.log(`  - Expected: Total in Company Currency = ${totalT2} / ${rate2} = ${expectedT2CC}`);
        console.log(`  - Actual: ${actualT2CC}`);
        expect(Math.abs(actualT2CC - expectedT2CC)).toBeLessThan(0.01);

        // Verify: Total in Company Currency != Total / R1 (the rate was re-derived, not kept)
        const wrongT2CC = Math.round((totalT2 / rate1) * 100) / 100;
        console.log(`  - Verify NOT using old rate R1: Total / R1 = ${totalT2} / ${rate1} = ${wrongT2CC}`);
        console.log(`  - Actual: ${actualT2CC}, Expected not to equal: ${wrongT2CC}`);
        expect(actualT2CC).not.toEqual(wrongT2CC);

        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - Total in Company Currency verified').catch(() => {});
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        console.log('==================== VERIFY ====================');

        // Check 1: R1 != R2
        console.log(`\n  Check 1 - Rates are different:`);
        console.log(`     Expected : R1 (${DATE_1}) != R2 (${DATE_2})`);
        console.log(`     Actual   : R1 = ${rate1}, R2 = ${rate2}`);
        const check1 = rate1 !== rate2;
        console.log(`     Result   : ${check1 ? 'PASS' : 'FAIL'}`);
        expect(check1).toBeTruthy();

        // Check 2: Total in Company Currency = T1 / R1
        const expectedT1CC = Math.round((totalT1 / rate1) * 100) / 100;
        const actualT1CC = parseFloat(totalInCompanyCurrencyT1);
        console.log(`\n  Check 2 - Step 3 Total in Company Currency uses R1:`);
        console.log(`     Expected : ${expectedT1CC}`);
        console.log(`     Actual   : ${actualT1CC}`);
        const check2 = Math.abs(actualT1CC - expectedT1CC) < 0.01;
        console.log(`     Result   : ${check2 ? 'PASS' : 'FAIL'}`);
        expect(check2).toBeTruthy();

        // Check 3: Total = 2 x T1
        const expectedT2 = totalT1 * 2;
        console.log(`\n  Check 3 - Step 4 Total quantity doubled correctly:`);
        console.log(`     Expected : ${expectedT2}`);
        console.log(`     Actual   : ${totalT2}`);
        const check3 = Math.abs(totalT2 - expectedT2) < 0.01;
        console.log(`     Result   : ${check3 ? 'PASS' : 'FAIL'}`);
        expect(check3).toBeTruthy();

        // Check 4: Total in Company Currency = Total / R2 (and NOT Total / R1)
        const quotationPage = new QuotationPage(page);
        const totalInCompanyCurrencyT2 = await quotationPage.getTotalInCompanyCurrency();
        const expectedT2CC = Math.round((totalT2 / rate2) * 100) / 100;
        const actualT2CC = parseFloat(totalInCompanyCurrencyT2);
        const wrongT2CC = Math.round((totalT2 / rate1) * 100) / 100;
        console.log(`\n  Check 4 - Step 5 Total in Company Currency re-derived with R2, not kept from R1:`);
        console.log(`     Expected : ${expectedT2CC} (using R2 = ${rate2}), NOT ${wrongT2CC} (using old R1 = ${rate1})`);
        console.log(`     Actual   : ${actualT2CC}`);
        const check4 = Math.abs(actualT2CC - expectedT2CC) < 0.01 && actualT2CC !== wrongT2CC;
        console.log(`     Result   : ${check4 ? 'PASS' : 'FAIL'}`);
        expect(check4).toBeTruthy();

        console.log('===============================================');
        console.log('OVERALL: PASS - Quotation successfully re-derived exchange rate on Order Date change');
      });

    } finally {
      // Teardown: delete created records
      await teardownMigRecords(page, false).catch(() => {});
    }
  });
});
