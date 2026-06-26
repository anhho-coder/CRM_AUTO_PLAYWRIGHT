import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote, DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createMultiProductInvoiceAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-b-1-multi-product-invoice.helper';

/**
 * ===========================================================================
 *  UC-B-1  -  Reseller views invoices with multiple products
 * ===========================================================================
 *  Test Case ID    : TC.-B.1.9
 *  Jira            : CRM-11170
 *  Manual TC       : O12CE-O12CC-UC-B1.9
 *  Automation-Type : new
 *  Automation-Date : 2026-06-25
 *
 *  Summary:
 *    Create a fresh validated multi-product invoice that belongs to a DIFFERENT reseller (Invoice #2,
 *    Reseller != Reseller_1), then verify Reseller_1 cannot see it on "My invoices" and cannot open it
 *    by its detail URL (data isolation).
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.1\.9:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition: fresh VALIDATED multi-product invoice (Invoice #2) NOT linked to Reseller_1
 *    (the deal-reg Note's Partner identity lines are blanked and no Assigned Partner is set, so the
 *    invoice Reseller != Reseller_1 - the portal keys visibility off the invoice Reseller field).
 *  Steps to reproduce:
 *    1. Login as Reseller_1
 *    2. Click "My invoices"
 *    3. Search/look for this test's Invoice #2          -> Invoice #2 is NOT listed
 *    4. Try to open Invoice #2 by its detail URL        -> Reseller_1 cannot access it (no access / not found)
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;

test.describe('TC.-B.1.9 - Reseller cannot see another reseller\'s multi-product invoice', () => {
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

  test('TC.-B.1.9: Reseller cannot see another reseller\'s multi-product invoice (data isolation)', async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const gen = generateDealRegistrationNote();
    const { leadName, companyEmail, compactDateTime } = gen;
    const oppName = `TEST TC.-B.1.9 ${compactDateTime}`;

    // Make the invoice belong to a DIFFERENT reseller: blank the Note's Partner identity lines and set
    // no Assigned Partner, so the invoice Reseller is NOT Reseller_1 (the portal keys visibility off it).
    const isolatedNote = gen.note
      .replace(`Partner Company Name: ${DEAL_REGISTRATION.partnerCompanyName}`, 'Partner Company Name: ')
      .replace(`Partner Contact Name: ${DEAL_REGISTRATION.partnerContactName}`, 'Partner Contact Name: ')
      .replace(`Partner Business Email: ${DEAL_REGISTRATION.partnerBusinessEmail}`, 'Partner Business Email: ');

    const invoice = await createMultiProductInvoiceAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote: isolatedNote, assignedPartner: null, browser, testInfo,
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
      console.log(`  - Listed invoices: ${JSON.stringify(await resellerPortalPage.getListedInvoiceNumbers())}`);
    });

    await test.step('Steps to reproduce - Step 3: Search/look for this test\'s Invoice #2 (the other reseller\'s invoice)', async () => {
      const listed = await resellerPortalPage.isInvoiceListed(invoice.invoiceNumber, 3);
      console.log(`  - Invoice #2 ("${invoice.invoiceNumber}") listed for Reseller_1: ${listed}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.1.9 - Reseller My invoices (other reseller invoice absent)');
      expect(invoice.invoiceNumber, 'A validated Invoice #2 should have been created').toBeTruthy();
      expect(listed, `Invoice #2 ("${invoice.invoiceNumber}") must NOT appear on Reseller_1's My invoices`).toBeFalsy();
    });

    await test.step('Steps to reproduce - Step 4: Try to open Invoice #2 by its detail URL', async () => {
      const portalUrl = `${baseUrl}my/invoices/${invoice.invoiceBackendId}`;
      await resellerPortalPage.openInvoiceByUrl(portalUrl);
      const topNumber = await resellerPortalPage.getDetailInvoiceNumber();
      console.log(`  - Tried portal URL ${portalUrl} -> detail number shown: "${topNumber}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.1.9 - Reseller direct URL access denied');
      expect(topNumber, `Reseller_1 must NOT be able to view Invoice #2 ("${invoice.invoiceNumber}") by URL`).not.toContain(invoice.invoiceNumber);
      console.log('✅ Data isolation holds - Reseller_1 cannot see or open another reseller\'s invoice');
    });
  });
});
