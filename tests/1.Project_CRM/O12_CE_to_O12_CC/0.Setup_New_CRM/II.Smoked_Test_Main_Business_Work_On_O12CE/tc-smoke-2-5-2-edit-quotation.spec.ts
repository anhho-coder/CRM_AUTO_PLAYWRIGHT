import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { QuotationPage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  addDealElementOnO12CE,
  pressNewQuotationOnO12CE,
  O12CE_DATA,
  O12ceOpportunity,
  O12ceQuotationResult,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Edit a Quotation
 * Test Case ID: CRM-12325_2.5.2
 * Automation-Type: new
 * Automation-Date: 2026-08-21
 *
 * Summary:
 *   Verify a created Quotation can be edited on the O12 CE Migration server - changing "Payment Terms"
 *   to "15 Days" is persisted after SAVE.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.5.2 "Edit Quotation". Section II ports it as a
 * FUNCTIONAL smoke (elapsed time printed for reference; the gate is the persisted change).
 *
 * O12 CE notes (grounded on crm-mig, 2026-08-21):
 *   - Login as Admin (`users.admin_crm_mig`); CRM > Pipeline opened in list view by URL hash.
 *   - This TC needs the created Quotation to be OPEN on screen, so it asserts that "NEW QUOTATION"
 *     navigated to the new Quotation form. If O12 CE instead created the Sale Order in place (the
 *     TC.-A.5.1 variant), the spec fails here with the chatter evidence - that is a real finding to
 *     raise, not a spec defect.
 *   - Payment term "15 Days" exists on the Migration server (id 2).
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the Admin account can log in (CRM-12325_1.1.1).
 *
 * Steps (1-11 = the shared Opportunity + Deal Element chain):
 *   1-7.  Login, open the Opportunities list, CREATE + fill + SAVE the Opportunity, wait for Contact.
 *   8-11. Press "DEAL ELEMENT", select Pricelist + Payment Term, add a product, press "SAVE".
 *  12. Press "NEW QUOTATION" button and wait.
 *
 * Steps run:
 *   1. Press "EDIT" button on the Quotation.
 *   2. Set the "Payment Terms" field to "15 Days".
 *   3. Press "SAVE" button.
 *
 * Verification Points:
 *   1. The "NEW QUOTATION" action opened the created Quotation form (pre-condition for the edit).
 *   2. After the edit + SAVE, the Quotation "Payment Terms" reads "15 Days".
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.5\.2:" --project=chromium
 */

const SKIP_CLEANUP_OPP = true; // true = skip teardown-delete (O12 CE convention: keep created records)

test.describe('CRM-12325_2.5.2 - O12 CE smoke: edit a Quotation', () => {

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
      const homePage = new HomePageMig(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    console.log(`Teardown: SKIP_CLEANUP_OPP=${SKIP_CLEANUP_OPP} - the created records are kept on O12 CE`);
  });

  test('CRM-12325_2.5.2: Verify a Quotation can be edited on the O12 CE Migration server', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);

    const TC_ID = 'CRM-12325_2.5.2';
    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let paymentTermCheck: { success: boolean; actualValue: string } = { success: false, actualValue: '' };
    let editSaveMs = 0;

    await loginToO12CE(page);
    await openOpportunitiesListOnO12CE(page);
    opp = await createOpportunityOnO12CE(page, TC_ID);
    await addDealElementOnO12CE(page);

    await test.step('Step 12: Press "NEW QUOTATION" button and wait', async () => {
      console.log('\n--- Step 12: Press NEW QUOTATION ---');
      quotation = await pressNewQuotationOnO12CE(page);
      expect(
        quotation.navigated,
        `the "NEW QUOTATION" action must open the created Quotation form so it can be edited (O12 CE created it in place instead - chatter: "${(quotation.chatterText || '').substring(0, 200)}")`
      ).toBeTruthy();
    });

    await test.step('Steps run - Step 1: Press "EDIT" button on the Quotation', async () => {
      console.log('\n--- Steps run - Step 1: Click EDIT on the Quotation ---');
      await quotationPage.clickEdit(CommonUtils.waitTimes.abnormalWait);
      console.log('  OK - Quotation back in edit mode');
    });

    await test.step(`Steps run - Step 2: Set the "Payment Terms" field to "${O12CE_DATA.paymentTermEdited}"`, async () => {
      console.log('\n--- Steps run - Step 2: Change the Payment Terms ---');
      console.log(`  To : ${O12CE_DATA.paymentTermEdited}`);
      await quotationPage.changePaymentTerm(O12CE_DATA.paymentTermEdited, CommonUtils.waitTimes.abnormalWait);
      console.log('  OK - Payment Terms re-selected');
    });

    await test.step('Steps run - Step 3: Press "SAVE" button', async () => {
      console.log('\n--- Steps run - Step 3: Save the edited Quotation ---');
      const start = Date.now();
      await quotationPage.saveQuotation(CommonUtils.waitTimes.savingPage);
      editSaveMs = Date.now() - start;
      paymentTermCheck = await quotationPage.verifyPaymentTerm(O12CE_DATA.paymentTermEdited, CommonUtils.waitTimes.long);
      console.log(`  Save elapsed            : ${(editSaveMs / 1000).toFixed(2)}s (recorded for reference, not asserted)`);
      console.log(`  Payment Terms read back : "${paymentTermCheck.actualValue}"`);
    });

    await test.step('Verification', async () => {
      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The "NEW QUOTATION" action opened the created Quotation form:');
      console.log('     Expected : navigated to the Quotation form');
      console.log(`     Actual   : navigated=${quotation?.navigated}`);
      console.log(`     Result   : ${quotation?.navigated ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - After the edit + SAVE the Quotation "Payment Terms" reads the new value:');
      console.log(`     Expected : ${O12CE_DATA.paymentTermEdited}`);
      console.log(`     Actual   : "${paymentTermCheck.actualValue}"`);
      console.log(`     Result   : ${paymentTermCheck.success ? 'PASS' : 'FAIL'}`);
      console.log(`  Info - Opportunity: id=${opp?.oppId}`);
      console.log(`  Info - Save elapsed after edit: ${(editSaveMs / 1000).toFixed(2)}s`);
      console.log('===============================================');
      console.log(`OVERALL: ${quotation?.navigated && paymentTermCheck.success ? 'PASS' : 'FAIL'} - Quotation edit on the O12 CE Migration server`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Quotation edited on O12 CE`);

      expect(
        paymentTermCheck.success,
        `the edited Quotation must persist Payment Terms = "${O12CE_DATA.paymentTermEdited}" (read back: "${paymentTermCheck.actualValue}")`
      ).toBeTruthy();
    });
  });
});
