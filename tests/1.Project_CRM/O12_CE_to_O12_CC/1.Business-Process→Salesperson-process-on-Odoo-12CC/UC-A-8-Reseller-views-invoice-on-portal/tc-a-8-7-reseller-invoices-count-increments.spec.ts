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
 *  Test Case ID    : TC.-A.8.7
 *  Automation-Type : new
 *  Automation-Date : 2026-06-24
 *
 *  Summary:
 *    Verify the Reseller portal "Invoices" overview count increments by 1 after a
 *    new invoice is validated: note the count (C0), create + validate an invoice as
 *    Thomas, then confirm the Reseller's count is C0 + 1 and the invoice is listed.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-A\.8\.7:" --project=chromium
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
 *  Pre-condition #2:
 *    As Reseller_1, note the current "Invoices" overview count on the portal home (C0).
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
 *  Steps to reproduce #2  -  re-check as the Reseller:
 *    1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *    2. Read the "Invoices" overview count (C1) and open "My invoices"
 *
 *  Verification #1:
 *    1. C1 == C0 + 1, and Invoice Number #1 is listed on "My invoices".
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true; // validated Invoice cannot be cleanly deleted -> retain (see TC.-A.8.1)

test.describe('TC.-A.8.7 - Reseller "Invoices" overview count increments after validating', () => {
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

  test('TC.-A.8.7: Verify the Reseller Invoices overview count increments after validating an invoice', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.8.7 ${compactDateTime}`;
    let countBefore = 0;

    await test.step('Pre-condition 2: As Reseller_1, note the current "Invoices" overview count (C0)', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await resellerPortalPage.waitForPortalReady();
      countBefore = await resellerPortalPage.getOverviewCount('Invoices');
      console.log(`  - Invoices overview count BEFORE (C0): ${countBefore}`);
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
    });

    // Steps to reproduce #1 (1-19): create the validated Invoice as Thomas (shared helper).
    const invoice = await createValidatedInvoiceAsThomas(page, { oppName, contactName: leadName, companyEmail, internalNote });
    createdOppUrl = invoice.oppUrl;

    let countAfter = 0;
    await test.step('Steps to reproduce #2 - Step 1: Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await resellerPortalPage.waitForPortalReady();
      console.log(`✓ Logged in as Reseller_1 (${users.reseller_bronze.displayName})`);
    });

    await test.step('Steps to reproduce #2 - Step 2: Read the "Invoices" overview count (C1) and open "My invoices"', async () => {
      // The portal count badge surfaces asynchronously after VALIDATE - poll it (reload-retry) until it
      // reaches C0 + 1 instead of reading a single (possibly stale) snapshot.
      countAfter = await resellerPortalPage.getOverviewCountWhenAtLeast('Invoices', countBefore + 1);
      console.log(`  - Invoices overview count AFTER (C1): ${countAfter}`);
      await resellerPortalPage.clickMyInvoices();
      console.log('✓ My invoices page opened');
    });

    await test.step('Verification #1: C1 incremented (>= C0 + 1) and Invoice Number #1 is listed', async () => {
      const listed = await resellerPortalPage.isInvoiceListed(invoice.invoiceNumber);
      console.log(`  - C0 = ${countBefore} | C1 = ${countAfter} | Invoice Number #1 "${invoice.invoiceNumber}" listed: ${listed}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.8.7 - Reseller Invoices count incremented');

      expect(listed, `Invoice Number #1 "${invoice.invoiceNumber}" should be listed on My invoices`).toBeTruthy();
      expect(countAfter, 'The "Invoices" overview count should increment after validating a new invoice (>= C0 + 1)').toBeGreaterThanOrEqual(countBefore + 1);
      console.log('✅ The Reseller "Invoices" overview count incremented');
    });
  });
});
