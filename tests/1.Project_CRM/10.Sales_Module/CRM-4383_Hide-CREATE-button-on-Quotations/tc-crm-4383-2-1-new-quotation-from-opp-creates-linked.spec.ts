import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { OpportunityPage, DealElementPage, QuotationPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * ============================================================================================
 *  CRM-4383_2.1 - Salesperson: "New Quotation" from an Opportunity still creates a linked quotation
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-4383_2.1
 *  Jira:            CRM-4383 (regression of CRM-2329)
 *  Automation-Type: new
 *  Automation-Date: 2026-08-11
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    CRM-4383 only removes the dead-end (the list-view CREATE button); the INTENDED path must still
 *    work. As the Salesperson, create an Opportunity, build its Deal Element with a product, then
 *    click "New Quotation" - a quotation is created and linked to the Opportunity (it gets a Sales
 *    Order number and inherits the Opportunity's customer as Payer).
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-4383_2\.1:" --project=chromium
 *
 *  Pre-conditions:
 *    - Login as a Salesperson (Ex: Thomas Semerich).
 *    - An Opportunity owned by that Salesperson (created in-test).
 *
 *  Steps:
 *    1. Open the Opportunity.
 *    2. Click "Deal Element" to open the deal element (sale.order).
 *    3. Set Pricelist = Public Pricelist_USD, Payment terms = Immediate Payment.
 *    4. Add a product line.
 *    5. Click "New Quotation".
 *
 *  Expected Result (step 5):
 *    - A quotation is created and linked to the Opportunity: it has a Sales Order number and a Payer
 *      (the customer inherited from the Opportunity). The intended create path is unaffected by the fix.
 *
 *  Design notes:
 *    - Mirrors the proven Subscription-1.1 create path (Opp -> Deal Element -> add product -> New
 *      Quotation). "New Quotation" here = the Deal Element's action_create_quote_from_de button
 *      (QuotationPage.clickNewQuotation), i.e. the only sanctioned way for a Salesperson to raise a
 *      quotation now that the list CREATE button is hidden.
 */

const SKIP_CLEANUP_OPP = false;
const PRODUCT_SKU = '[A2144B]';

test.describe('CRM-4383_2.1 - Salesperson: New Quotation from an Opportunity creates a linked quotation', () => {

  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('X TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
      await CommonUtils.waitForSpinnersToHide(page).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-4383_2.1: Salesperson can still create a linked quotation via "New Quotation" on an Opportunity', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);

    const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST CRM-4383_2.1 ${compactDateTime}`;

    // Pre-condition: create the Opportunity as the Salesperson (Thomas). Grouped via the proven helper.
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
      stepPrefix: 'Pre-condition',
    });

    await test.step('Pre-condition: refresh until Company and Contact are populated on the Opportunity', async () => {
      await opportunityPage.openByUrl(createdOppUrl as string);
      const populated = await opportunityPage.waitForCompanyAndContactPopulated();
      console.log(`  - Company: "${populated.companyValue}" | Contact: "${populated.contactValue}"`);
      expect(populated.populated, 'Company and Contact should both populate before opening the Deal Element').toBeTruthy();
    });

    await test.step('Step 1: Open the Opportunity', async () => {
      await opportunityPage.openByUrl(createdOppUrl as string);
      console.log('✓ Opportunity opened');
    });

    await test.step('Step 2: Click "Deal Element" to open the deal element', async () => {
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      await dealElementPage.waitForAutoPopulate();
      console.log('✓ Deal Element form opened');
    });

    await test.step('Step 3: Set Pricelist = Public Pricelist_USD and Payment terms = Immediate Payment', async () => {
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      console.log('✓ Pricelist and Payment terms set');
    });

    await test.step(`Step 4: Add a product line (SKU "${PRODUCT_SKU}")`, async () => {
      await dealElementPage.addProductLine(PRODUCT_SKU, 1);
      await dealElementPage.save(CommonUtils.waitTimes.savingDealElement);
      const added = await dealElementPage.isProductInOrderLines(PRODUCT_SKU);
      expect(added, `The order line for "${PRODUCT_SKU}" should be present`).toBeTruthy();
      console.log('✓ Product added and Deal Element saved');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Deal Element with product saved');
    });

    let salesOrderNumber = '';
    let payer = '';
    await test.step('Step 5: Click "New Quotation" and read the created quotation', async () => {
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await quotationPage.waitForEditButton(CommonUtils.waitTimes.pageLoad).catch(() => {});
      await quotationPage.dismissErrorDialogWithRetry().catch(() => {});

      salesOrderNumber = await quotationPage.getSalesOrderNumber().catch(() => '');
      payer = await quotationPage.getPayerName().catch(() => '');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Quotation created from the Opportunity');
    });

    await test.step('Expected: a quotation is created and linked to the Opportunity (has a SO number and a Payer)', async () => {
      const hasNumber = /\d/.test(salesOrderNumber) && !/^new$/i.test(salesOrderNumber.trim());

      console.log('==== VERIFY (CRM-4383_2.1) ====');
      console.log('Expected: "New Quotation" from the Opportunity creates a linked quotation (Sales Order number assigned, Payer inherited from the Opportunity)');
      console.log(`Actual  : Sales Order number="${salesOrderNumber}", Payer="${payer}"`);
      console.log(`Result  : ${hasNumber && !!payer ? 'PASS' : 'FAIL'}`);

      expect(hasNumber, 'The created quotation should have a Sales Order number (the intended create path still works)').toBeTruthy();
      expect(payer, 'The created quotation should have a Payer inherited from the Opportunity (it is linked, not a blank dead-end)').toBeTruthy();
      console.log('✅ CRM-4383_2.1 verified: New Quotation from an Opportunity still creates a linked quotation');
    });
  });
});
