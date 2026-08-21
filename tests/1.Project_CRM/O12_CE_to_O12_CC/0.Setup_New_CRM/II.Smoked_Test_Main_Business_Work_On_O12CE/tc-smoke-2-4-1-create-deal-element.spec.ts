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
 * O12 CE Main-Business Smoke - Create a Deal Element
 * Test Case ID: CRM-12325_2.4.1
 * Automation-Type: new
 * Automation-Date: 2026-08-21
 *
 * Summary:
 *   Verify a Deal Element (sale.order with `is_deal_element` = TRUE) can be created from an
 *   Opportunity on the O12 CE Migration server - Pricelist, Payment Term and one product line save.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.4.1 "Create Deal Element". Section II ports
 * it as a FUNCTIONAL smoke (elapsed time printed for reference; the gate is the business outcome).
 *
 * O12 CE notes (grounded on crm-mig, 2026-08-21):
 *   - Login as Admin (`users.admin_crm_mig`); CRM > Pipeline opened in list view by URL hash.
 *   - The NAKIVO sale.order customisation IS on the Migration server: `is_deal_element`, the
 *     `pending_approval`/`approved` states, Reseller / Distributor / End User; pricelist
 *     "Public Pricelist_USD" and payment term "Immediate Payment" both exist.
 *   - "Lead Form" DOES exist on O12 CE as the module field `lead_form` (pre-prod: Studio field
 *     `x_studio_lead_sorce`); the page objects accept both names, so the value is entered normally.
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the Admin account can log in (CRM-12325_1.1.1).
 *
 * Steps (1-7 = the shared Opportunity chain, 8-11 = the Deal Element):
 *   1. Use the account of Admin to login successful.
 *   2. Open "CRM" and switch to the Opportunities list view.
 *   3. On the "Opp" page, click at "CREATE" button.
 *   4. Enter the opportunity information.
 *   5. Click at "CRM Developer" tab at the bottom of page (Lead form = License).
 *   6. Press "SAVE" button.
 *   7. Refresh page to see the "Contact" field is entered.
 *   8. Create "DEAL ELEMENT" - press the "DEAL ELEMENT" button.
 *   9. On the "Deal Element" screen select Pricelist = Public Pricelist_USD and
 *      Payment Term = Immediate Payment.
 *  10. At "Order Lines" section - press "Add a product" and select a NAKIVO Backup product.
 *  11. Finally, press "SAVE" button on the top page and wait.
 *
 * Verification Points:
 *   1. The Deal Element is saved as a sale.order record (form URL carries model=sale.order + an id).
 *   2. The saved Payment Term is "Immediate Payment".
 *   3. The Deal Element has one saved Order Line with the selected NAKIVO product.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.4\.1:" --project=chromium
 */

const SKIP_CLEANUP_OPP = true; // true = skip teardown-delete (O12 CE convention: keep created records)

test.describe('CRM-12325_2.4.1 - O12 CE smoke: create a Deal Element', () => {

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

  test('CRM-12325_2.4.1: Verify a Deal Element can be created on the O12 CE Migration server', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const dealElementPage = new DealElementPage(page);

    const TC_ID = 'CRM-12325_2.4.1';
    let opp: O12ceOpportunity | null = null;
    let productName = '';
    let dealElementUrl = '';
    let paymentTermReadback = '';
    let orderLineCount = 0;
    let payerReadback = '';
    const startedAt = Date.now();

    await loginToO12CE(page);
    await openOpportunitiesListOnO12CE(page);
    opp = await createOpportunityOnO12CE(page, TC_ID);
    const dealElement = await addDealElementOnO12CE(page);
    productName = dealElement.productName;

    await test.step('Read back the saved Deal Element', async () => {
      console.log('\n--- Read back the saved Deal Element ---');
      dealElementUrl = page.url();
      paymentTermReadback = (await dealElementPage.getPaymentTermValue()) ?? '';
      orderLineCount = await dealElementPage.getOrderLineCount();
      payerReadback = await dealElementPage.getPayerValue().catch(() => '');
      console.log(`  Deal Element URL : ${dealElementUrl}`);
      console.log(`  Payment Term     : "${paymentTermReadback.trim()}"`);
      console.log(`  Order lines      : ${orderLineCount}`);
      console.log(`  Product line     : "${productName}"`);
      console.log(`  Payer            : "${payerReadback}"`);
    });

    await test.step('Verification', async () => {
      const savedOk = /model=sale\.order/.test(dealElementUrl) && /[?#&]id=\d+/.test(dealElementUrl);
      const paymentTermOk = paymentTermReadback.includes(O12CE_DATA.paymentTerm);
      const lineOk = orderLineCount >= 1 && /NAKIVO/i.test(productName);
      const totalSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The Deal Element is saved as a sale.order record:');
      console.log('     Expected : form URL carries model=sale.order and id=<digits>');
      console.log(`     Actual   : ${dealElementUrl}`);
      console.log(`     Result   : ${savedOk ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - The saved Payment Term is the selected one:');
      console.log(`     Expected : ${O12CE_DATA.paymentTerm}`);
      console.log(`     Actual   : "${paymentTermReadback.trim()}"`);
      console.log(`     Result   : ${paymentTermOk ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - The Deal Element has one saved Order Line with the NAKIVO product:');
      console.log('     Expected : >= 1 order line, product name contains "NAKIVO"');
      console.log(`     Actual   : lines=${orderLineCount}, product="${productName}"`);
      console.log(`     Result   : ${lineOk ? 'PASS' : 'FAIL'}`);
      console.log(`  Info - Opportunity: id=${opp?.oppId} | Company="${opp?.companyValue}"`);
      console.log(`  Info - Total elapsed for the whole flow: ${totalSeconds}s`);
      console.log('===============================================');
      console.log(`OVERALL: ${savedOk && paymentTermOk && lineOk ? 'PASS' : 'FAIL'} - Deal Element creation on the O12 CE Migration server`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Deal Element saved on O12 CE`);

      expect(savedOk, `the Deal Element must be saved as a sale.order record on O12 CE (URL read back: ${dealElementUrl})`).toBeTruthy();
      expect(paymentTermOk, `the saved Deal Element must keep Payment Term = "${O12CE_DATA.paymentTerm}" (read back: "${paymentTermReadback.trim()}")`).toBeTruthy();
      expect(lineOk, `the saved Deal Element must carry the NAKIVO product line (lines=${orderLineCount}, product="${productName}")`).toBeTruthy();
    });
  });
});
