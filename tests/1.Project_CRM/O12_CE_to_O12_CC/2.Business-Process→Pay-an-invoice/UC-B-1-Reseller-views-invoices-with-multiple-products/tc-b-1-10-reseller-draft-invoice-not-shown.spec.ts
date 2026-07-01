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
 *  Test Case ID    : TC.-B.1.10
 *  Jira            : CRM-11171
 *  Manual TC       : O12CE-O12CC-UC-B1.10
 *  Automation-Type : new
 *  Automation-Date : 2026-06-25
 *
 *  Summary:
 *    Create a fresh multi-product invoice but leave it in DRAFT (do NOT validate), then verify the
 *    draft invoice is NOT shown on the Reseller portal "My invoices" (only validated/posted invoices appear).
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.1\.10:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition: fresh multi-product invoice (Invoice #3) created via "Create and view invoices" but
 *    NOT validated -> Status = Draft.
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
 *    3. Look for this test's Invoice #3 (the draft invoice)  -> the DRAFT invoice is NOT shown
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;

test.describe('TC.-B.1.10 - Draft multi-product invoice is not shown on the portal', () => {
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

  test('TC.-B.1.10: Draft multi-product invoice is not shown on the reseller portal', async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.1.10 ${compactDateTime}`;

    // Pre-condition: create the multi-product invoice but DO NOT validate (leave Draft).
    const invoice = await createMultiProductInvoiceAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote: note, browser, testInfo, validate: false,
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

    await test.step('Steps to reproduce - Step 3: Look for this test\'s Invoice #3 (the draft invoice)', async () => {
      // The draft invoice has no posted number yet, so check by its backend id (its portal data-href).
      const listed = await resellerPortalPage.isInvoiceIdListed(invoice.invoiceBackendId, 4);
      console.log(`  - Draft invoice backend id "${invoice.invoiceBackendId}" listed for Reseller_1: ${listed}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.1.10 - Reseller My invoices (draft invoice absent)');
      expect(invoice.invoiceBackendId, 'A draft invoice backend id should have been captured').toBeTruthy();
      expect(listed, 'The DRAFT invoice must NOT appear on Reseller_1\'s My invoices').toBeFalsy();
      console.log('✅ Draft multi-product invoice is not shown on the portal');
    });
  });
});
