import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createMultiProductInvoiceAsThomas, deleteCreatedOpportunityAsAdmin, money, qtyNum } from '@helpers/uc-b-1-multi-product-invoice.helper';

/**
 * ===========================================================================
 *  UC-B-1  -  Reseller views invoices with multiple products
 * ===========================================================================
 *  Test Case ID    : TC.-B.1.4
 *  Jira            : CRM-11165
 *  Manual TC       : O12CE-O12CC-UC-B1.4
 *  Automation-Type : new
 *  Automation-Date : 2026-06-25
 *
 *  Summary:
 *    Create a fresh validated multi-product invoice, then as the Reseller verify that for every
 *    product line on the portal, Amount = Quantity x Unit Price (the gross line amount, before the
 *    order-level Partner Discount).
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.1\.4:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition: fresh VALIDATED multi-product invoice (Invoice #1).
 *  Steps to reproduce:
 *    1. Login as Reseller_1
 *    2. Open this test's Invoice #1 from "My invoices"
 *    3. For each product line, read Quantity, Unit Price and Amount
 *       -> for every line, Amount = Quantity x Unit Price (Product#1 = Qty#1 x Unit Price#1; #2/#3/#4 = 1 x Unit Price)
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;

test.describe('TC.-B.1.4 - Each product line Amount equals Quantity x Unit Price', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const rp = new ResellerPortalPage(page);
      await rp.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('TC.-B.1.4: Each product line Amount equals Quantity x Unit Price on the multi-product invoice', async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.1.4 ${compactDateTime}`;

    const invoice = await createMultiProductInvoiceAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote: note, browser, testInfo,
    });
    createdOppUrl = invoice.oppUrl;

    await test.step('Steps to reproduce - Step 1: Login as Reseller_1', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_1.username, users.reseller_1.password);
      await resellerPortalPage.waitForPortalReady();
    });

    await test.step('Steps to reproduce - Step 2: Open this test\'s Invoice #1 from "My invoices"', async () => {
      await resellerPortalPage.clickMyInvoices();
      await resellerPortalPage.openInvoiceByNumber(invoice.invoiceNumber);
      await resellerPortalPage.waitForDetailLineTable();
    });

    await test.step('Steps to reproduce - Step 3: For each product line, read Quantity, Unit Price and Amount', async () => {
      for (const pr of invoice.products) {
        const line = await resellerPortalPage.getDetailProductLine(pr.code);
        expect(line, `Product ${pr.code} should be listed`).not.toBeNull();
        const qty = qtyNum(line!.quantity);
        const amount = money(line!.amount);
        const expected = pr.unitPrice * qty;
        console.log(`  - ${pr.code}: qty=${qty} unitPrice=${pr.unitPrice} amount=${amount} | expected qty*price=${expected.toFixed(2)}`);
        expect(amount, `Amount for ${pr.code} should equal Quantity x Unit Price`).toBeCloseTo(expected, 2);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.1.4 - Reseller portal invoice line amounts');
      console.log('✅ Every product line Amount = Quantity x Unit Price');
    });
  });
});
