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
 *  Test Case ID    : TC.-A.8.8
 *  Automation-Type : new
 *  Automation-Date : 2026-06-24
 *
 *  Summary:
 *    As Thomas, create a deal-registration validated Invoice (Invoice Number #1);
 *    then as the Reseller search "My invoices" by that number and verify the list
 *    is filtered to the matching invoice.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-A\.8\.8:" --project=chromium
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
 *          TEST-Reseller#Automation-Jun10); DEAL ELEMENT (Pricelist/Payment Term/first product);
 *          SAVE; NEW QUOTATION; CONFIRM; CREATE INVOICE; CREATE AND VIEW INVOICES; remember
 *          Invoice Number #1; VALIDATE.
 *
 *  Steps to reproduce #2  -  search as the Reseller:
 *    1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *    2. After login successful, click at "My invoices" button
 *    3. In the Search box, enter Invoice Number #1 and submit
 *
 *  Verification #1:
 *    1. The filtered list contains Invoice Number #1 and every listed row matches the search.
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true; // validated Invoice cannot be cleanly deleted -> retain (see TC.-A.8.1)

test.describe('TC.-A.8.8 - Reseller searches My invoices by Invoice Number', () => {
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

  test('TC.-A.8.8: Verify Reseller can search My invoices by Invoice Number', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.8.8 ${compactDateTime}`;

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

    await test.step('Steps to reproduce #2 - Step 3: In the Search box, enter Invoice Number #1 and submit', async () => {
      await resellerPortalPage.searchInvoices(invoice.invoiceNumber);
      console.log(`✓ Searched for "${invoice.invoiceNumber}"`);
    });

    await test.step('Verification #1: The filtered list contains Invoice Number #1 and every row matches', async () => {
      const listed = await resellerPortalPage.getListedInvoiceNumbers();
      console.log(`  - Filtered invoices: ${JSON.stringify(listed)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.8.8 - Reseller My invoices (search by number)');

      expect(listed.length, 'The search should return at least the matching invoice').toBeGreaterThanOrEqual(1);
      expect(listed.some((n) => n.includes(invoice.invoiceNumber)), `The filtered list should contain Invoice Number #1 "${invoice.invoiceNumber}"`).toBeTruthy();
      expect(
        listed.every((n) => n.includes(invoice.invoiceNumber)),
        'Every listed row should match the searched Invoice Number (the list is filtered)'
      ).toBeTruthy();
      console.log('✅ Reseller can search My invoices by Invoice Number');
    });
  });
});
