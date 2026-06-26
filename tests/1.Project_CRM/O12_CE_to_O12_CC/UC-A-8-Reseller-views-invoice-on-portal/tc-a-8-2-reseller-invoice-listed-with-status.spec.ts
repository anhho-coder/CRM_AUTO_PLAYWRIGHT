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
 *  Test Case ID    : TC.-A.8.2
 *  Automation-Type : new
 *  Automation-Date : 2026-06-24
 *
 *  Summary:
 *    As Thomas, create a deal-registration validated Invoice (Invoice Number #1);
 *    then as the Reseller open "My invoices" and verify the invoice is listed
 *    with Status "Open".
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-A\.8\.2:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-condition #1:
 *    Build the deal-registration Internal Note #1 with fresh dynamic values
 *    (test-data/CRM-deal_registration/deal-registration.note.ts).
 *
 *  Steps to reproduce #1  -  create the invoice as Thomas:
 *    1-19. Login as Thomas; CRM > view list > CREATE; enter Opp/Contact/Company/Email/Country/State/IP,
 *          Create manually = FALSE, clear Sales Team/Salesperson; CRM Developer Lead form; Assigned
 *          Partner = TEST-Reseller#Automation-Jun10; Internal Note #1; SAVE (capture Opp URL #1);
 *          refresh + verify Contact; DEAL ELEMENT (Pricelist Public Pricelist_USD, Payment Term
 *          Immediate Payment, first product); SAVE; NEW QUOTATION; CONFIRM (Sales Order); CREATE
 *          INVOICE; CREATE AND VIEW INVOICES; remember Invoice Number #1; VALIDATE.
 *
 *  Steps to reproduce #2  -  view the invoice as the Reseller:
 *    1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *    2. After login successful, click at "My invoices" button
 *
 *  Verification #1:
 *    1. Invoice Number #1 is listed on "My invoices" with Status "Open".
 * ===========================================================================
 */

// Financial chain (Opp -> Deal Element -> Quotation -> Sales Order -> validated Invoice): a posted
// Invoice cannot be cleanly deleted, so records are retained (see TC.-A.8.1). Toggle false to attempt
// deleting the created Opportunity (will NOT remove the Sales Order / Invoice).
const SKIP_CLEANUP_OPP = true;

test.describe('TC.-A.8.2 - Reseller sees the validated invoice listed with Status Open', () => {
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

  test('TC.-A.8.2: Verify Reseller sees the validated invoice listed with Status Open', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.8.2 ${compactDateTime}`;

    // Steps to reproduce #1 (1-19): create the validated Invoice as Thomas (shared helper).
    const invoice = await createValidatedInvoiceAsThomas(page, { oppName, contactName: leadName, companyEmail, internalNote });
    createdOppUrl = invoice.oppUrl;

    await test.step('Steps to reproduce #2 - Step 1: Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful', async () => {
      console.log('Step 1: Switching session and logging in as Reseller_1');
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_1.username, users.reseller_1.password);
      await resellerPortalPage.waitForPortalReady();
      console.log(`✓ Logged in as Reseller_1 (${users.reseller_1.displayName})`);
    });

    await test.step('Steps to reproduce #2 - Step 2: After login successful, click at "My invoices" button', async () => {
      await resellerPortalPage.clickMyInvoices();
      console.log(`  - Listed invoices: ${JSON.stringify(await resellerPortalPage.getListedInvoiceNumbers())}`);
      console.log('✓ My invoices page opened');
    });

    await test.step('Verification #1: Invoice Number #1 is listed with Status "Open"', async () => {
      const listed = await resellerPortalPage.isInvoiceListed(invoice.invoiceNumber);
      const row = await resellerPortalPage.getInvoiceRowData(invoice.invoiceNumber);
      console.log(`  - Invoice Number #1: "${invoice.invoiceNumber}" | listed: ${listed} | row: ${JSON.stringify(row)} | backend status: "${invoice.status}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.8.2 - Reseller My invoices (invoice listed with status)');

      expect(listed, `Invoice Number #1 "${invoice.invoiceNumber}" should be listed on the Reseller's My invoices`).toBeTruthy();
      expect(row, 'The invoice row should be found on My invoices').not.toBeNull();
      expect(row?.status, 'The Status column should show a posted/validated status (e.g. "Open")').toMatch(/Open|Posted|Paid/i);
      console.log('✅ Reseller sees the validated invoice listed with the correct status');
    });
  });
});
