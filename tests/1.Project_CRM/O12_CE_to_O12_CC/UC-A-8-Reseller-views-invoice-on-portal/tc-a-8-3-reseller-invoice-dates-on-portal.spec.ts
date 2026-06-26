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
 *  Test Case ID    : TC.-A.8.3
 *  Automation-Type : new
 *  Automation-Date : 2026-06-24
 *
 *  Summary:
 *    As Thomas, create a deal-registration validated Invoice (Immediate Payment);
 *    then as the Reseller verify the "My invoices" row shows a valid Invoice Date
 *    and Due Date, with Due Date equal to the Invoice Date (Immediate Payment).
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-A\.8\.3:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-condition #1:
 *    Build the deal-registration Internal Note #1 with fresh dynamic values.
 *
 *  Steps to reproduce #1  -  create the invoice as Thomas:
 *    1-19. Login as Thomas; create the deal-registration Opportunity (Assigned Partner =
 *          TEST-Reseller#Automation-Jun10) and capture Opp URL #1; DEAL ELEMENT (Pricelist
 *          Public Pricelist_USD, Payment Term Immediate Payment, first product); SAVE; NEW
 *          QUOTATION; CONFIRM (Sales Order); CREATE INVOICE; CREATE AND VIEW INVOICES;
 *          remember Invoice Number #1; VALIDATE (capture the backend Invoice/Due dates).
 *
 *  Steps to reproduce #2  -  view the invoice as the Reseller:
 *    1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *    2. After login successful, click at "My invoices" button
 *
 *  Verification #1:
 *    1. The "My invoices" row for Invoice Number #1 shows a valid Invoice Date and Due Date
 *       (MM/DD/YYYY), and (Immediate Payment) the Due Date equals the Invoice Date.
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true; // validated Invoice cannot be cleanly deleted -> retain (see TC.-A.8.1)
const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;

test.describe('TC.-A.8.3 - Reseller sees the invoice Invoice/Due dates on the portal', () => {
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

  test('TC.-A.8.3: Verify Reseller sees the invoice Invoice/Due dates on the portal', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.8.3 ${compactDateTime}`;

    // Steps to reproduce #1 (1-19): create the validated Invoice as Thomas (shared helper).
    const invoice = await createValidatedInvoiceAsThomas(page, { oppName, contactName: leadName, companyEmail, internalNote });
    createdOppUrl = invoice.oppUrl;

    await test.step('Steps to reproduce #2 - Step 1: Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_1.username, users.reseller_1.password);
      await resellerPortalPage.waitForPortalReady();
      console.log(`✓ Logged in as Reseller_1 (${users.reseller_1.displayName})`);
    });

    await test.step('Steps to reproduce #2 - Step 2: After login successful, click at "My invoices" button', async () => {
      await resellerPortalPage.clickMyInvoices();
      console.log('✓ My invoices page opened');
    });

    await test.step('Verification #1: The row shows valid Invoice Date and Due Date (Immediate Payment: Due = Invoice Date)', async () => {
      const row = await resellerPortalPage.getInvoiceRowData(invoice.invoiceNumber);
      console.log(`  - Row for "${invoice.invoiceNumber}": ${JSON.stringify(row)}`);
      console.log(`  - Backend Invoice Date: "${invoice.invoiceDate}" | Backend Due Date: "${invoice.dueDate}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.8.3 - Reseller My invoices (Invoice/Due dates)');

      expect(row, 'The invoice row should be found on My invoices').not.toBeNull();
      expect(row?.invoiceDate, 'Invoice Date should be a valid MM/DD/YYYY date').toMatch(DATE_RE);
      expect(row?.dueDate, 'Due Date should be a valid MM/DD/YYYY date').toMatch(DATE_RE);
      expect(row?.dueDate, 'Immediate Payment: the Due Date should equal the Invoice Date').toBe(row?.invoiceDate);
      console.log('✅ The portal shows the invoice Invoice/Due dates correctly');
    });
  });
});
