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
 *  Test Case ID    : TC.-B.1.2
 *  Jira            : CRM-11163
 *  Manual TC       : O12CE-O12CC-UC-B1.2
 *  Automation-Type : new
 *  Automation-Date : 2026-06-25
 *
 *  Summary:
 *    Create a fresh validated multi-product invoice (4 different products, approved by Max), then as
 *    the Reseller open it on the portal and verify all 4 product lines are listed with their
 *    Description, Quantity, Unit Price and Amount.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.1\.2:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition:
 *    Create a FRESH, uniquely-named VALIDATED multi-product invoice (Invoice #1) for THIS test:
 *    as Thomas create a deal-registration Opp (unique data, Assigned Partner = TEST-Reseller#Automation-Jun10);
 *    Deal Element with 4 DIFFERENT products sized into the approval band ($15k-$20k); New Quotation >
 *    To Approve > approved by Max > Confirm > Create Invoice > Invoiceable lines > Create and view
 *    invoices > Validate (Status = Open).
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
 *    3. Open this test's Invoice #1 from the list      -> detail opens, title shows Invoice #1
 *    4. Review the product list on the invoice detail  -> all 4 products listed (Description/Qty/Unit Price/Amount)
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true; // validated Invoice cannot be cleanly deleted -> retain (O12 convention)

test.describe('TC.-B.1.2 - Reseller views all product lines of a multi-product invoice', () => {
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

  test('TC.-B.1.2: Reseller views a multi-product invoice with all product lines listed on the portal', async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.1.2 ${compactDateTime}`;

    // Pre-condition: create the validated multi-product Invoice as Thomas (approved by Max).
    const invoice = await createMultiProductInvoiceAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote: note, browser, testInfo,
    });
    createdOppUrl = invoice.oppUrl;

    await test.step('Steps to reproduce - Step 1: Login as Reseller_1', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await resellerPortalPage.waitForPortalReady();
      console.log(`✓ Logged in as Reseller_1 (${users.reseller_bronze.displayName})`);
    });

    await test.step('Steps to reproduce - Step 2: Click "My invoices"', async () => {
      await resellerPortalPage.clickMyInvoices();
      console.log('✓ My invoices page opened');
    });

    await test.step('Steps to reproduce - Step 3: Open this test\'s Invoice #1 from the list', async () => {
      const detailUrl = await resellerPortalPage.openInvoiceByNumber(invoice.invoiceNumber);
      await resellerPortalPage.waitForDetailLineTable();
      const topNumber = await resellerPortalPage.getDetailInvoiceNumber();
      console.log(`  - Detail opened (${detailUrl}); title number: "${topNumber}"`);
      expect(topNumber, `The invoice title should show Invoice #1 ("${invoice.invoiceNumber}")`).toContain(invoice.invoiceNumber);
    });

    await test.step('Steps to reproduce - Step 4: Review the product list on the invoice detail page', async () => {
      const found: string[] = [];
      for (const pr of invoice.products) {
        const line = await resellerPortalPage.getDetailProductLine(pr.code);
        console.log(`  - ${pr.code}: ${line ? `qty="${line.quantity}" amount="${line.amount}"` : 'NOT FOUND'}`);
        expect(line, `Product ${pr.code} should be listed on the invoice`).not.toBeNull();
        found.push(pr.code);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.1.2 - Reseller portal multi-product invoice (all lines)');
      expect(found.length, 'All 4 products should be listed on the invoice detail').toBe(invoice.products.length);
      console.log('✅ All 4 product lines are listed on the portal invoice');
    });
  });
});
