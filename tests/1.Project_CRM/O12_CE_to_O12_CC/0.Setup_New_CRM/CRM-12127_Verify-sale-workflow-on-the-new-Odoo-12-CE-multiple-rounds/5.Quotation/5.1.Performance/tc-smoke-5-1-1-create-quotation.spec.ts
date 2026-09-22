import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users } from '@config/users.config';
import { QuotationPage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  addDealElementOnO12CE,
  pressNewQuotationOnO12CE,
  O12ceOpportunity,
  O12ceQuotationResult,
  teardownMigRecords,
  sweepMigLeftoversAfterAll,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Create a Quotation
 * Test Case ID: CRM-12370_5.1.1
 * Automation-Type: refactored
 * Automation-Date: 2026-08-26
 *
 * Summary:
 *   Verify pressing "NEW QUOTATION" on a saved Deal Element creates the Quotation (sale.order) on the
 *   O12 CE Migration server.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.5.1 "Create Quotation". Section II ports it as
 * a FUNCTIONAL smoke (elapsed time printed for reference; the gate is the business outcome).
 *
 * O12 CE notes (grounded on crm-mig, 2026-08-21):
 *   - Login as the sales IC Thomas Semerich (`users.sale_ic_thomas_crm_mig`) - the pre-prod owner of
 *     this chain; CRM > Pipeline opened in list view by URL hash.
 *   - Two behaviours exist on pre-prod for this button: it either navigates to the created Quotation
 *     (performance suite) or creates the Sale Order in place and logs it in the Deal Element chatter
 *     (TC.-A.5.1). Both count as "the Quotation was created"; the spec reports which variant O12 CE
 *     took, so the chained TCs (2.5.2-2.7.2) can be read against it.
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the sales IC account Thomas Semerich can log in
 *   (CRM-12325_1.1.1).
 *
 * Steps (1-11 = the shared Opportunity + Deal Element chain):
 *   1-7.  Login, open the Opportunities list, CREATE + fill + SAVE the Opportunity, wait for Contact.
 *   8-11. Press "DEAL ELEMENT", select Pricelist + Payment Term, add a product, press "SAVE".
 *
 * Steps run:
 *   1. Press "NEW QUOTATION" button and wait.
 *
 * Verification Points:
 *   1. The Quotation is created - the action either opens the new Quotation form or logs the Sale
 *      Order creation in the Deal Element chatter.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_5\.1\.1:" --project=chromium
 */

const SKIP_CLEANUP_OPP = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken chain for hand-debugging - the 16:00 leftover-data check then reports it.

test.describe('CRM-12370_5.1.1 - O12 CE smoke: create a Quotation', () => {

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
    await teardownMigRecords(page, SKIP_CLEANUP_OPP);
  });

  // CLAUDE.md crm-mig rule: the afterAll sweep also removes what a dying test created but never
  // got to register. Opens its own session, so it costs one extra login per spec file.
  test.afterAll(async ({ browser }) => {
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_5.1.1');
  });

  test('CRM-12370_5.1.1: Verify a Quotation can be created on the O12 CE Migration server', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);

    const TC_ID = 'CRM-12370_5.1.1';
    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let quotationStatus = '';
    let quotationUrl = '';

    await loginToO12CE(page, users.sale_ic_thomas_crm_mig);
    await openOpportunitiesListOnO12CE(page);
    opp = await createOpportunityOnO12CE(page, TC_ID);
    await addDealElementOnO12CE(page);

    await test.step('Steps run - Step 1: Press "NEW QUOTATION" button and wait', async () => {
      console.log('\n--- Steps run - Step 1: Press NEW QUOTATION ---');
      quotation = await pressNewQuotationOnO12CE(page);
      quotationUrl = page.url();
      if (quotation.navigated) {
        quotationStatus = await quotationPage.getQuotationStatus().catch(() => '');
      }
      console.log(`  Quotation URL    : ${quotationUrl}`);
      console.log(`  Quotation status : "${quotationStatus}"`);
    });

    await test.step('Verification', async () => {
      // The chatter is NOT evidence of creation: the Deal Element's own save already posts
      // "Sale Order created" and "Status: Quotation", so the old `navigated || chatterFound` gate
      // passed on crm-mig whether or not a Quotation existed. The record id resolved by the helper
      // is the real proof, so that is what this TC asserts.
      const createdOk = !!quotation && quotation.quotationId !== '';

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The Quotation is created on O12 CE:');
      console.log('     Expected : the NEW QUOTATION action creates a sale.order Quotation that can be resolved and opened');
      console.log(`     Actual   : quotation id=${quotation?.quotationId || '(none)'} | name=${quotation?.quotationName || '(unknown)'}`);
      console.log(`     Result   : ${createdOk ? 'PASS' : 'FAIL'}`);
      console.log(`  Info - Variant taken by O12 CE : ${quotation?.navigated ? 'navigated to the new Quotation form' : 'created in place, then opened by the id lookup'}`);
      console.log(`  Info - Chatter matched (reported only, not a creation signal) : ${quotation?.chatterFound}`);
      console.log(`  Info - Quotation status read back : "${quotationStatus}"`);
      console.log(`  Info - Opportunity: id=${opp?.oppId} | Company="${opp?.companyValue}"`);
      console.log(`  Info - NEW QUOTATION elapsed: ${((quotation?.elapsedMs ?? 0) / 1000).toFixed(2)}s`);
      if (!quotation?.navigated) {
        console.log(`  Info - Deal Element chatter (first 300 chars): "${(quotation?.chatterText ?? '').substring(0, 300)}"`);
      }
      console.log('===============================================');
      console.log(`OVERALL: ${createdOk ? 'PASS' : 'FAIL'} - Quotation creation on the O12 CE Migration server`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Quotation created on O12 CE`);

      expect(
        createdOk,
        `"NEW QUOTATION" must create a Quotation on O12 CE that can be resolved as a record (navigated=${quotation?.navigated}, resolved id=${quotation?.quotationId || 'none'})`
      ).toBeTruthy();
    });
  });
});
