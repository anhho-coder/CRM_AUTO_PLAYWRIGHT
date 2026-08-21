import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { DealElementPage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  addDealElementOnO12CE,
  O12CE_DATA,
  O12ceOpportunity,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Edit a Deal Element
 * Test Case ID: CRM-12325_2.4.2
 * Automation-Type: new
 * Automation-Date: 2026-08-21
 *
 * Summary:
 *   Verify a saved Deal Element can be edited on the O12 CE Migration server - changing the Payment
 *   Term from "Immediate Payment" to "15 Days" is persisted after SAVE.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.4.2 "Edit Deal Element". Section II ports it
 * as a FUNCTIONAL smoke (elapsed time printed for reference; the gate is the persisted change).
 *
 * O12 CE notes (grounded on crm-mig, 2026-08-21):
 *   - Login as Admin (`users.admin_crm_mig`); CRM > Pipeline opened in list view by URL hash.
 *   - Both payment terms exist on the Migration server: "Immediate Payment" (id 1) and "15 Days" (id 2).
 *   - "Lead Form" DOES exist on O12 CE as the module field `lead_form` (pre-prod: Studio field
 *     `x_studio_lead_sorce`); the page objects accept both names, so the value is entered normally.
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the Admin account can log in (CRM-12325_1.1.1).
 *
 * Steps (1-11 = the shared Opportunity + Deal Element chain):
 *   1-7.  Login, open the Opportunities list, CREATE + fill + SAVE the Opportunity, wait for Contact.
 *   8-11. Press "DEAL ELEMENT", select Pricelist + Payment Term = Immediate Payment, add a product,
 *         press "SAVE".
 *  12. Press "EDIT" button on the Deal Element.
 *  13. Set the "Payment Terms" field to "15 Days".
 *  14. Press "SAVE" button.
 *
 * Verification Points:
 *   1. The Deal Element is saved as a sale.order record (form URL carries model=sale.order + an id).
 *   2. After the edit + SAVE, the Payment Term reads "15 Days".
 *   3. The Order Line is still present after the edit.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.4\.2:" --project=chromium
 */

const SKIP_CLEANUP_OPP = true; // true = skip teardown-delete (O12 CE convention: keep created records)

test.describe('CRM-12325_2.4.2 - O12 CE smoke: edit a Deal Element', () => {

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
    console.log(`Teardown: SKIP_CLEANUP_OPP=${SKIP_CLEANUP_OPP} - the created Opportunity / Deal Element are kept on O12 CE`);
  });

  test('CRM-12325_2.4.2: Verify a Deal Element can be edited on the O12 CE Migration server', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const dealElementPage = new DealElementPage(page);

    const TC_ID = 'CRM-12325_2.4.2';
    let opp: O12ceOpportunity | null = null;
    let dealElementUrl = '';
    let paymentTermAfterEdit = '';
    let orderLineCountAfterEdit = 0;
    let editSaveMs = 0;

    await loginToO12CE(page);
    await openOpportunitiesListOnO12CE(page);
    opp = await createOpportunityOnO12CE(page, TC_ID);
    await addDealElementOnO12CE(page);
    dealElementUrl = page.url();

    await test.step('Step 12: Press "EDIT" button on the Deal Element', async () => {
      console.log('\n--- Step 12: Click EDIT on the Deal Element ---');
      await dealElementPage.clickEdit();
      console.log('  OK - Deal Element back in edit mode');
    });

    await test.step(`Step 13: Set the "Payment Terms" field to "${O12CE_DATA.paymentTermEdited}"`, async () => {
      console.log('\n--- Step 13: Change the Payment Term ---');
      console.log(`  From : ${O12CE_DATA.paymentTerm}`);
      console.log(`  To   : ${O12CE_DATA.paymentTermEdited}`);
      const changed = await dealElementPage.selectPaymentTerm(O12CE_DATA.paymentTermEdited);
      expect(changed, `the Payment Term "${O12CE_DATA.paymentTermEdited}" must be selectable on the O12 CE Deal Element`).toBeTruthy();
    });

    await test.step('Step 14: Press "SAVE" button', async () => {
      console.log('\n--- Step 14: Save the edited Deal Element ---');
      const start = Date.now();
      await dealElementPage.save(CommonUtils.waitTimes.savingPage);
      await dealElementPage.waitForEditButton(CommonUtils.waitTimes.savingPage);
      editSaveMs = Date.now() - start;
      paymentTermAfterEdit = (await dealElementPage.getPaymentTermValue()) ?? '';
      orderLineCountAfterEdit = await dealElementPage.getOrderLineCount();
      console.log(`  Save elapsed            : ${(editSaveMs / 1000).toFixed(2)}s (recorded for reference, not asserted)`);
      console.log(`  Payment Term after edit : "${paymentTermAfterEdit.trim()}"`);
      console.log(`  Order lines after edit  : ${orderLineCountAfterEdit}`);
    });

    await test.step('Verification', async () => {
      const savedOk = /model=sale\.order/.test(dealElementUrl) && /[?#&]id=\d+/.test(dealElementUrl);
      const paymentTermOk = paymentTermAfterEdit.includes(O12CE_DATA.paymentTermEdited);
      const lineOk = orderLineCountAfterEdit >= 1;

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The Deal Element is saved as a sale.order record:');
      console.log('     Expected : form URL carries model=sale.order and id=<digits>');
      console.log(`     Actual   : ${dealElementUrl}`);
      console.log(`     Result   : ${savedOk ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - After the edit + SAVE the Payment Term reads the new value:');
      console.log(`     Expected : ${O12CE_DATA.paymentTermEdited}`);
      console.log(`     Actual   : "${paymentTermAfterEdit.trim()}"`);
      console.log(`     Result   : ${paymentTermOk ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - The Order Line is still present after the edit:');
      console.log('     Expected : >= 1 order line');
      console.log(`     Actual   : ${orderLineCountAfterEdit}`);
      console.log(`     Result   : ${lineOk ? 'PASS' : 'FAIL'}`);
      console.log(`  Info - Opportunity: id=${opp?.oppId}`);
      console.log(`  Info - Save elapsed after edit: ${(editSaveMs / 1000).toFixed(2)}s`);
      console.log('===============================================');
      console.log(`OVERALL: ${savedOk && paymentTermOk && lineOk ? 'PASS' : 'FAIL'} - Deal Element edit on the O12 CE Migration server`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Deal Element edited on O12 CE`);

      expect(savedOk, `the Deal Element must be saved as a sale.order record on O12 CE (URL read back: ${dealElementUrl})`).toBeTruthy();
      expect(paymentTermOk, `the edited Deal Element must persist Payment Term = "${O12CE_DATA.paymentTermEdited}" (read back: "${paymentTermAfterEdit.trim()}")`).toBeTruthy();
      expect(lineOk, `the Order Line must survive the edit (lines=${orderLineCountAfterEdit})`).toBeTruthy();
    });
  });
});
