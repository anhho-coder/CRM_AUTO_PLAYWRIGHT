import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createValidatedInvoiceAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-8-invoice.helper';

/**
 * ===========================================================================
 *  UC-A-8  -  Reseller views invoice on portal
 * ===========================================================================
 *  Test Case ID    : TC.-A.8.10
 *  Automation-Type : new
 *  Automation-Date : 2026-06-24
 *
 *  Summary:
 *    As Thomas, create a deal-registration validated Invoice (Invoice Number #1);
 *    then as the Reseller open the invoice via its portal detail URL (deep link with
 *    access token) and verify the top-of-page number equals Invoice Number #1.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-A\.8\.10:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-condition #1:
 *    Build the deal-registration Internal Note #1 from the template, filling the <...> placeholders
 *    with fresh dynamic values each run (key fields, one per line):
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
 *
 *  Steps to reproduce #1  -  create the invoice as Thomas:
 *    1-19. Login as Thomas; create the deal-registration Opportunity (Assigned Partner below);
 *          build the DEAL ELEMENT below; SAVE; NEW QUOTATION; CONFIRM; CREATE INVOICE; CREATE
 *          AND VIEW INVOICES; remember Invoice Number #1; VALIDATE.
 *          Opportunity:
 *            - Assigned Partner = TEST-Reseller#Automation-Jun10
 *          Deal Element:
 *            - Pricelist
 *            - Payment Term
 *            - Order Lines = first product
 *
 *  Steps to reproduce #2  -  open via deep link as the Reseller:
 *    1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *    2. After login successful, click at "My invoices" button
 *    3. Open Invoice Number #1 to capture its detail URL, then open that URL directly (deep link)
 *
 *  Verification #1:
 *    1. The deep-link detail page top-of-page Invoice number equals Invoice Number #1.
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true; // validated Invoice cannot be cleanly deleted -> retain (see TC.-A.8.1)

test.describe('TC.-A.8.10 - Reseller opens an invoice via its portal deep link', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('TC.-A.8.10: Verify Reseller can open an invoice via its portal deep link', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.8.10 ${compactDateTime}`;
    let detailUrl = '';

    // Steps to reproduce #1 (1-19): create the validated Invoice as Thomas (shared helper).
    const invoice = await createValidatedInvoiceAsThomas(page, { oppName, contactName: leadName, companyEmail, internalNote });
    createdOppUrl = invoice.oppUrl;

    await test.step('Steps to reproduce #2 - Step 1: Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await resellerPortalPage.waitForPortalReady();
      console.log(`✓ Logged in as Reseller_1 (${users.reseller_bronze.displayName})`);
    });

    await test.step('Steps to reproduce #2 - Step 2: After login successful, click at "My invoices" button', async () => {
      await resellerPortalPage.clickMyInvoices();
      console.log('✓ My invoices page opened');
    });

    await test.step('Steps to reproduce #2 - Step 3: Open Invoice Number #1 to capture its detail URL, then open that URL directly', async () => {
      detailUrl = await resellerPortalPage.openInvoiceByNumber(invoice.invoiceNumber);
      console.log(`  - Captured detail URL: ${detailUrl}`);
      // Re-open the captured URL directly (deep link), as if from a bookmark / emailed link.
      await resellerPortalPage.openInvoiceByUrl(detailUrl);
      console.log('✓ Re-opened the invoice via its deep-link URL');
    });

    await test.step('Verification #1: The deep-link detail page top-of-page number equals Invoice Number #1', async () => {
      const topNumber = await resellerPortalPage.getDetailInvoiceNumber();
      console.log(`  - Detail URL: ${detailUrl}`);
      console.log(`  - Top-of-page number: "${topNumber}" | Invoice Number #1: "${invoice.invoiceNumber}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.8.10 - Reseller invoice deep-link detail');

      expect(detailUrl, 'The detail URL should be a /my/invoices/<id> deep link with an access token').toMatch(/\/my\/invoices\/\d+/);
      expect(detailUrl, 'The deep link should carry an access_token').toContain('access_token');
      expect(topNumber, `The deep-link detail page should show Invoice Number #1 "${invoice.invoiceNumber}"`).toContain(invoice.invoiceNumber);
      console.log('✅ Reseller can open the invoice via its portal deep link');
    });
  });
});
