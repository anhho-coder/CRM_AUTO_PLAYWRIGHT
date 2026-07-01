import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createMultiProductInvoiceAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-b-1-multi-product-invoice.helper';

/**
 * ===========================================================================
 *  UC-B-1  -  Reseller views invoices with multiple products
 * ===========================================================================
 *  Test Case ID    : TC.-B.1.11
 *  Jira            : CRM-11172
 *  Manual TC       : O12CE-O12CC-UC-B1.11
 *  Automation-Type : new
 *  Automation-Date : 2026-06-25
 *
 *  Summary:
 *    Create a fresh validated multi-product invoice, then as the Reseller search "My invoices" by the
 *    invoice number, verify only that invoice is returned, open it, and verify the title plus all 4
 *    product lines.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.1\.11:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition: fresh VALIDATED multi-product invoice (Invoice #1); note its number.
 *
 *    Internal Note #1 (deal-registration template; key fields, one per line):
 *      - NAKIVO deal registration*  = <random 4-digit number>
 *      - Name                       = TEST <current date time>
 *      - Email                      = Test@company<compact date time>.com
 *      - Created Date               = <current date time>
 *      - phone                      = <random 9-digit number>
 *      - Company                    = Company Name Lead 1
 *      - Partner Company Name       = TEST-Reseller#Automation-Jun10
 *      - IP                         = 128.183.189.157
 *      - Country                    = United States
 *    (Remaining template lines - Solution used, Edition, License Type, etc. - are static defaults.)
 *  Steps to reproduce:
 *    1. Login as Reseller_1
 *    2. Click "My invoices"
 *    3. Type Invoice #1 number into the Search box and submit  -> only Invoice #1 is listed in the results
 *    4. Open the matching result   -> detail opens, title shows Invoice #1, all 4 products listed (Qty + Amount)
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;

test.describe('TC.-B.1.11 - Reseller searches a multi-product invoice by number', () => {
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

  test('TC.-B.1.11: Search the multi-product invoice by number returns and opens it with all products', async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.1.11 ${compactDateTime}`;

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

    await test.step('Steps to reproduce - Step 2: Click "My invoices"', async () => {
      await resellerPortalPage.clickMyInvoices();
    });

    await test.step('Steps to reproduce - Step 3: Type Invoice #1 number into the Search box and submit', async () => {
      await resellerPortalPage.searchInvoices(invoice.invoiceNumber);
      const listed = await resellerPortalPage.getListedInvoiceNumbers();
      console.log(`  - Search results for "${invoice.invoiceNumber}": ${JSON.stringify(listed)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.1.11 - Reseller My invoices search results');
      expect(listed.some(n => n.includes(invoice.invoiceNumber)), 'Invoice #1 should be in the search results').toBeTruthy();
      expect(listed.length, 'Only Invoice #1 should be listed in the search results').toBe(1);
    });

    await test.step('Steps to reproduce - Step 4: Open the matching result', async () => {
      await resellerPortalPage.openInvoiceByNumber(invoice.invoiceNumber);
      await resellerPortalPage.waitForDetailLineTable();
      const topNumber = await resellerPortalPage.getDetailInvoiceNumber();
      expect(topNumber, `The invoice title should show Invoice #1 ("${invoice.invoiceNumber}")`).toContain(invoice.invoiceNumber);
      for (const pr of invoice.products) {
        const line = await resellerPortalPage.getDetailProductLine(pr.code);
        console.log(`  - ${pr.code}: ${line ? `qty="${line.quantity}" amount="${line.amount}"` : 'NOT FOUND'}`);
        expect(line, `Product ${pr.code} should be listed on the opened invoice`).not.toBeNull();
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.1.11 - Reseller opened invoice (all products)');
      console.log('✅ Search returns Invoice #1 and the opened invoice lists all 4 products');
    });
  });
});
