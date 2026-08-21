import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { LicensePage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  addDealElementOnO12CE,
  pressNewQuotationOnO12CE,
  confirmQuotationOnO12CE,
  createInvoiceOnO12CE,
  validateInvoiceOnO12CE,
  openLicenseFromInvoiceOnO12CE,
  O12CE_DATA,
  O12ceOpportunity,
  O12ceQuotationResult,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Create a License
 * Test Case ID: CRM-12325_2.7.1
 * Automation-Type: new
 * Automation-Date: 2026-08-21
 *
 * Summary:
 *   Verify the end of the main business chain on the O12 CE Migration server: a validated Invoice can
 *   produce a License ("CREATE LICENSE"), the "for monitoring" mode is set and the License saves.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.7.1 "Create License". Section II ports it as a
 * FUNCTIONAL smoke (elapsed time printed for reference; the gate is the business outcome).
 *
 * O12 CE notes (grounded on crm-mig, 2026-08-21):
 *   - Login as Admin (`users.admin_crm_mig`); CRM > Pipeline opened in list view by URL hash.
 *   - The license module IS on the Migration server: model `license_management.license` with
 *     `it_monitoring_mode_select` (SOCKET = "sockets" / VM = "workloads") and `support_type`
 *     (24_7 = "24/7" / standard), plus the invoice-form "CREATE LICENSE" view.
 *   - This TC needs the created Quotation to be OPEN on screen, so it asserts that "NEW QUOTATION"
 *     navigated to the new Quotation form (see CRM-12325_2.5.1 for the two observed variants).
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the Admin account can log in (CRM-12325_1.1.1).
 *
 * Steps (1-11 = the shared Opportunity + Deal Element chain):
 *   1-7.  Login, open the Opportunities list, CREATE + fill + SAVE the Opportunity, wait for Contact.
 *   8-11. Press "DEAL ELEMENT", select Pricelist + Payment Term, add a product, press "SAVE".
 *  12. Press "NEW QUOTATION" button and wait.
 *  13. Press "CONFIRM" button and wait to create a Sales Order.
 *  14. Press "CREATE INVOICE" and then "CREATE AND VIEW INVOICES" and wait.
 *  15. Press "VALIDATE" button and wait.
 *  16. Press "CREATE LICENSE" button and wait.
 *  17. Once the "License" screen appears, select "sockets" in the "for monitoring" dropdown.
 *
 * Steps run:
 *   1. Press "SAVE" button.
 *
 * Verification Points:
 *   1. The License form opens as a license_management.license record (URL carries the model).
 *   2. The License saves and the "for monitoring" value reads "sockets" (SOCKET).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.7\.1:" --project=chromium
 */

const SKIP_CLEANUP_OPP = true; // true = skip teardown-delete (O12 CE convention: keep created records)

test.describe('CRM-12325_2.7.1 - O12 CE smoke: create a License', () => {

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
      const homePage = new HomePageMig(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    console.log(`Teardown: SKIP_CLEANUP_OPP=${SKIP_CLEANUP_OPP} - the created records are kept on O12 CE`);
  });

  test('CRM-12325_2.7.1: Verify a License can be created on the O12 CE Migration server', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const licensePage = new LicensePage(page);

    const TC_ID = 'CRM-12325_2.7.1';
    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let validated: { status: string; invoiceNumber: string } = { status: '', invoiceNumber: '' };
    let licenseUrl = '';
    let saveMs = 0;
    let monitoringReadback = '';

    await loginToO12CE(page);
    await openOpportunitiesListOnO12CE(page);
    opp = await createOpportunityOnO12CE(page, TC_ID);
    await addDealElementOnO12CE(page);

    await test.step('Step 12: Press "NEW QUOTATION" button and wait', async () => {
      console.log('\n--- Step 12: Press NEW QUOTATION ---');
      quotation = await pressNewQuotationOnO12CE(page);
      expect(
        quotation.navigated,
        `the "NEW QUOTATION" action must open the created Quotation form so it can be confirmed (O12 CE created it in place instead - chatter: "${(quotation.chatterText || '').substring(0, 200)}")`
      ).toBeTruthy();
    });

    await confirmQuotationOnO12CE(page);
    await createInvoiceOnO12CE(page);
    validated = await validateInvoiceOnO12CE(page);
    const license = await openLicenseFromInvoiceOnO12CE(page);
    licenseUrl = license.licenseUrl;

    await test.step('Steps run - Step 1: Press "SAVE" button', async () => {
      console.log('\n--- Steps run - Step 1: Save the License ---');
      saveMs = await licensePage.clickSaveAndWaitForCompletion(CommonUtils.waitTimes.savingPage);
      monitoringReadback = await licensePage.getForMonitoringValue();
      console.log(`  Save elapsed             : ${(saveMs / 1000).toFixed(2)}s (recorded for reference, not asserted)`);
      console.log(`  for monitoring read back : "${monitoringReadback}"`);
      console.log(`  License URL              : ${page.url()}`);
    });

    await test.step('Verification', async () => {
      const licenseFormOk = /model=license_management\.license/.test(licenseUrl);
      const monitoringOk = /socket/i.test(monitoringReadback);

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The License form opens as a license_management.license record:');
      console.log('     Expected : URL carries model=license_management.license');
      console.log(`     Actual   : ${licenseUrl}`);
      console.log(`     Result   : ${licenseFormOk ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - The License saves and the "for monitoring" value reads "sockets":');
      console.log(`     Expected : contains "socket" (selected "${O12CE_DATA.forMonitoring}")`);
      console.log(`     Actual   : "${monitoringReadback}"`);
      console.log(`     Result   : ${monitoringOk ? 'PASS' : 'FAIL'}`);
      console.log(`  Info - Opportunity: id=${opp?.oppId} | Invoice: "${validated.invoiceNumber}" (${validated.status})`);
      console.log(`  Info - Save elapsed: ${(saveMs / 1000).toFixed(2)}s`);
      console.log('===============================================');
      console.log(`OVERALL: ${licenseFormOk && monitoringOk ? 'PASS' : 'FAIL'} - License creation on the O12 CE Migration server`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - License saved on O12 CE`);

      expect(licenseFormOk, `"CREATE LICENSE" must open a license_management.license record on O12 CE (URL read back: ${licenseUrl})`).toBeTruthy();
      expect(monitoringOk, `the saved License must keep "for monitoring" = "${O12CE_DATA.forMonitoring}" (read back: "${monitoringReadback}")`).toBeTruthy();
    });
  });
});
