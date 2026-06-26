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
 *  Test Case ID    : TC.-B.1.6
 *  Jira            : CRM-11167
 *  Manual TC       : O12CE-O12CC-UC-B1.6
 *  Automation-Type : new
 *  Automation-Date : 2026-06-25
 *
 *  Summary:
 *    Create a fresh validated multi-product invoice whose Product#1 has a large Quantity (Qty#1), then
 *    as the Reseller verify Product#1 shows Quantity = Qty#1 and Amount = Qty#1 x Unit Price#1 with no
 *    rounding/overflow error.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.1\.6:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition: fresh VALIDATED multi-product invoice (Invoice #1); Product#1 Qty = Qty#1 (large, > 50).
 *  Steps to reproduce:
 *    1. Login as Reseller_1
 *    2. Open this test's Invoice #1 from "My invoices"
 *    3. Locate the Product#1 line (the high-quantity line)
 *       -> Product#1 Quantity = Qty#1 and Amount = Qty#1 x Unit Price#1
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;

test.describe('TC.-B.1.6 - Reseller views the high-quantity product line', () => {
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

  test('TC.-B.1.6: Multi-product invoice shows the correct quantity and amount for the high-quantity product line', async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.1.6 ${compactDateTime}`;

    const invoice = await createMultiProductInvoiceAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote: note, browser, testInfo,
    });
    createdOppUrl = invoice.oppUrl;
    const product1 = invoice.products[0]; // the quantity-variable line

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

    await test.step('Steps to reproduce - Step 3: Locate the Product#1 line (the high-quantity line)', async () => {
      const line = await resellerPortalPage.getDetailProductLine(product1.code);
      expect(line, `Product#1 (${product1.code}) should be listed`).not.toBeNull();
      const portalQty = qtyNum(line!.quantity);
      const portalAmount = money(line!.amount);
      const expectedAmount = product1.unitPrice * invoice.qty1;
      console.log(`  - Product#1 ${product1.code}: Qty#1=${invoice.qty1} | portal qty=${portalQty} amount=${portalAmount} | expected=${expectedAmount.toFixed(2)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.1.6 - Reseller portal high-quantity line');

      expect(invoice.qty1, 'Qty#1 should be a large quantity (> 1)').toBeGreaterThan(1);
      expect(portalQty, 'Product#1 Quantity on the portal should equal Qty#1').toBe(invoice.qty1);
      expect(portalAmount, 'Product#1 Amount should equal Qty#1 x Unit Price#1').toBeCloseTo(expectedAmount, 2);
      console.log('✅ The high-quantity Product#1 line shows the correct quantity and amount');
    });
  });
});
