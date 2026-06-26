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
 *  Test Case ID    : TC.-A.8.6
 *  Automation-Type : new
 *  Automation-Date : 2026-06-24
 *
 *  Summary:
 *    As Thomas, create the deal-registration Invoice but leave it as DRAFT (do NOT
 *    validate); then verify the draft invoice does NOT appear in the Reseller's
 *    "My invoices" (the portal lists posted invoices only).
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-A\.8\.6:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-condition #1:
 *    Build the deal-registration Internal Note #1 with fresh dynamic values.
 *
 *  Steps to reproduce #1  -  create a DRAFT invoice as Thomas:
 *    1-19. Login as Thomas; create the deal-registration Opportunity (Assigned Partner =
 *          TEST-Reseller#Automation-Jun10); DEAL ELEMENT (Pricelist/Payment Term/first product);
 *          SAVE; NEW QUOTATION; CONFIRM; CREATE INVOICE; CREATE AND VIEW INVOICES (capture the
 *          backend invoice id); leave the Invoice as DRAFT (do NOT press VALIDATE).
 *
 *  Steps to reproduce #2  -  check as the Reseller:
 *    1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *    2. After login successful, click at "My invoices" button
 *
 *  Verification #1:
 *    1. The DRAFT invoice (its backend id) is NOT listed on Reseller_1's "My invoices".
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true; // financial chain (Sales Order + draft Invoice) -> retain (see TC.-A.8.1)

test.describe('TC.-A.8.6 - Reseller does not see a draft (un-validated) invoice', () => {
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

  test('TC.-A.8.6: Verify Reseller does not see a draft (un-validated) invoice', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.8.6 ${compactDateTime}`;

    // Steps to reproduce #1 (1-19): create the Invoice as Thomas but leave it as Draft (validate: false).
    const invoice = await createValidatedInvoiceAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
      validate: false,
    });
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
      console.log(`  - Listed invoices: ${JSON.stringify(await resellerPortalPage.getListedInvoiceNumbers())}`);
      console.log('✓ My invoices page opened');
    });

    await test.step('Verification #1: The DRAFT invoice (backend id) is NOT listed on the Reseller portal', async () => {
      console.log(`  - Draft invoice backend id: "${invoice.invoiceBackendId}" | validated: ${invoice.validated}`);
      expect(invoice.invoiceBackendId, 'The draft invoice backend id should have been captured').toBeTruthy();
      expect(invoice.validated, 'The invoice must be left as Draft (not validated) for this test').toBeFalsy();

      const idListed = await resellerPortalPage.isInvoiceIdListed(invoice.invoiceBackendId);
      console.log(`  - Draft invoice id "${invoice.invoiceBackendId}" listed for Reseller_1: ${idListed}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.8.6 - Reseller My invoices (draft invoice absent)');

      expect(idListed, `The DRAFT invoice (id ${invoice.invoiceBackendId}) must NOT appear on Reseller_1's My invoices`).toBeFalsy();
      console.log('✅ The portal lists posted invoices only - the draft invoice is not shown');
    });
  });
});
