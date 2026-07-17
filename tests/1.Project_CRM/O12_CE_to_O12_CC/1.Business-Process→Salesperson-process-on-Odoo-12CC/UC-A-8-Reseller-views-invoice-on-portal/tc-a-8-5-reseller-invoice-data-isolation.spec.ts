import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote, DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createValidatedInvoiceAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-8-invoice.helper';

/**
 * ===========================================================================
 *  UC-A-8  -  Reseller views invoice on portal
 * ===========================================================================
 *  Test Case ID    : TC.-A.8.5
 *  Automation-Type : new
 *  Automation-Date : 2026-06-24
 *
 *  Summary:
 *    As Thomas, create a validated Invoice on an Opportunity that is NOT assigned
 *    to the Reseller; then verify the invoice does NOT appear in Reseller_1's
 *    "My invoices" (data isolation / access control).
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-A\.8\.5:" --project=chromium
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
 *  Steps to reproduce #1  -  create an invoice NOT linked to the Reseller, as Thomas:
 *    1-19. Login as Thomas; create the deal-registration Opportunity with the Internal Note's Partner
 *          identity blanked and "Assigned Partner" EMPTY (so the invoice's Reseller is NOT reseller_bronze);
 *          build the DEAL ELEMENT below; SAVE; NEW QUOTATION; CONFIRM; CREATE INVOICE; CREATE AND VIEW
 *          INVOICES; remember Invoice Number #1; VALIDATE.
 *          Opportunity:
 *            - Internal Note Partner identity = blanked
 *            - Assigned Partner               = EMPTY
 *          Deal Element:
 *            - Pricelist
 *            - Payment Term
 *            - Order Lines = first product
 *
 *  Steps to reproduce #2  -  check as the Reseller:
 *    1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *    2. After login successful, click at "My invoices" button
 *
 *  Verification #1:
 *    1. Invoice Number #1 (unassigned) is NOT listed on Reseller_1's "My invoices".
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true; // validated Invoice cannot be cleanly deleted -> retain (see TC.-A.8.1)

test.describe('TC.-A.8.5 - Reseller does not see an invoice not assigned to them', () => {
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

  test('TC.-A.8.5: Verify Reseller does not see an invoice not assigned to them', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const gen = generateDealRegistrationNote();
    const { leadName, companyEmail, compactDateTime } = gen;
    const oppName = `TEST TC.-A.8.5 ${compactDateTime}`;

    // Isolation setup: the portal keys invoice visibility off the invoice's "Reseller" field, which the
    // deal-reg automation derives from the Internal Note's Partner Business Email. Blank the note's
    // Partner identity lines (and leave Assigned Partner empty) so the invoice is NOT linked to
    // reseller_bronze's partner.
    const isolatedNote = gen.note
      .replace(`Partner Company Name: ${DEAL_REGISTRATION.partnerCompanyName}`, 'Partner Company Name: ')
      .replace(`Partner Contact Name: ${DEAL_REGISTRATION.partnerContactName}`, 'Partner Contact Name: ')
      .replace(`Partner Business Email: ${DEAL_REGISTRATION.partnerBusinessEmail}`, 'Partner Business Email: ');

    // Steps to reproduce #1 (1-19): create the validated Invoice as Thomas with NO Assigned Partner
    // and the Partner-stripped note, so the invoice is NOT linked to reseller_bronze.
    const invoice = await createValidatedInvoiceAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote: isolatedNote,
      assignedPartner: null,
    });
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
      console.log(`  - Listed invoices: ${JSON.stringify(await resellerPortalPage.getListedInvoiceNumbers())}`);
      console.log('✓ My invoices page opened');
    });

    await test.step('Verification #1: The unassigned Invoice Number #1 is NOT listed on the Reseller portal', async () => {
      // Negative check: a few reload-retries are enough to conclude the invoice is absent.
      const listed = await resellerPortalPage.isInvoiceListed(invoice.invoiceNumber, 3);
      console.log(`  - Invoice Number #1 (unassigned): "${invoice.invoiceNumber}" | listed for Reseller_1: ${listed}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.8.5 - Reseller My invoices (unassigned invoice absent)');

      expect(invoice.invoiceNumber, 'A validated Invoice Number #1 should have been created').toBeTruthy();
      expect(listed, `The unassigned Invoice "${invoice.invoiceNumber}" must NOT appear on Reseller_1's My invoices`).toBeFalsy();
      console.log('✅ Data isolation holds - the Reseller cannot see an invoice not assigned to them');
    });
  });
});
