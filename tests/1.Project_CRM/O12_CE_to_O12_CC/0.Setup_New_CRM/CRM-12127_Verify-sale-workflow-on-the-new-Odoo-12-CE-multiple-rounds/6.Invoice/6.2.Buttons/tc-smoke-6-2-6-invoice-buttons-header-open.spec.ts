import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users } from '@config/users.config';
import { HomePageMig } from '@pages/mig';
import { InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  addDealElementOnO12CE,
  pressNewQuotationOnO12CE,
  confirmQuotationOnO12CE,
  createInvoiceOnO12CE,
  O12ceOpportunity,
  O12ceQuotationResult,
  teardownMigRecords,
  sweepMigLeftoversAfterAll,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Invoice buttons - Open header
 * Test Case ID: CRM-12370_6.2.6
 * Automation-Type: refactored
 * Automation-Date: 2026-09-22
 *
 * Objective: Verify a validated Invoice replaces the Draft header set with the six buttons an open invoice offers - SEND & PRINT, REGISTER PAYMENT, ADD CREDIT NOTE, PREVIEW, CANCEL and CREATE LICENSE.
 *
 * BASELINE RULE (tester's standing requirement): the assertions below are the PRE-PRODUCTION TC's
 * assertions, copied unchanged. Only the login account, the navigation path, the run marker and the
 * wait/timeout durations are adapted. Where O12 CE behaves differently this TC FAILS - that failure
 * IS the migration finding and must never be softened into a pass.
 *
 * Source manual TC (pre-production): TC.Performance.6.2.6
 * (tests/1.Project_CRM/1.SalesReport_Performance/6.Invoice/6.2.Buttons). Section II ports it as a
 * FUNCTIONAL smoke (elapsed time printed for reference; the gate is the business outcome).
 *
 * O12 CE deviations vs the pre-production scenario (MECHANICAL only):
 *   - Login as the sales IC Thomas Semerich (`users.sale_ic_thomas_crm_mig`).
 *   - Navigation and chain driven by helper functions instead of pre-prod page objects.
 *   - The run marker is "TEST ..." so the crm-mig leftover sweep finds the record.
 *   - Test timeout raised to config.timeouts.test (15 min).
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the sales IC account Thomas Semerich can log in
 *   (CRM-12325_1.1.1).
 *
 * Steps (1-14 = the shared Opportunity + Deal Element chain):
 *   1-14. Login, open Opportunities list, CREATE + fill + SAVE Opportunity, wait for Contact, press
 *         "DEAL ELEMENT", select Pricelist + Payment Term, add product, press "SAVE", press
 *         "NEW QUOTATION", press "CONFIRM" to create Sales Order, press "CREATE INVOICE" and
 *         "CREATE AND VIEW INVOICES".
 *
 * Steps run:
 *   1. Press VALIDATE on the Draft Invoice to move it to Open.
 *   2. Read the header buttons of the Open Invoice.
 *
 * Verification:
 *   - The Invoice is OPEN before the button read
 *   - The header carries exactly 6 buttons
 *   - They read SEND & PRINT, REGISTER PAYMENT, ADD CREDIT NOTE, PREVIEW, CANCEL, CREATE LICENSE in that order
 *   - VALIDATE is no longer offered
 *
 * crm-mig house rule: this spec CREATES data and removes it in teardown. The Opportunity it makes carries
 * the marker "TEST CRM-12370_6.2.6 <timestamp>" so the afterAll sweep can find it again even when the test dies
 * mid-way.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_6\.2\.6:" --project=chromium
 */

const SKIP_CLEANUP_OPP = false;

const STEP = {
  s1: 'Step 1-14: Login, create Opportunity, Deal Element, Quotation, Sales Order, Invoice',
  s2: 'Step 15: Validating and verifying the header buttons of the Open Invoice',
};

test.describe('CRM-12370_6.2.6 - Invoice header buttons on an Open Invoice', () => {

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

  test.afterAll(async ({ browser }) => {
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_6.2.6');
  });

  test('CRM-12370_6.2.6: Verify the header buttons of an Open Invoice', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const TC_ID = 'CRM-12370_6.2.6';
    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let confirmResult: { status: string; orderNumber: string } = { status: '', orderNumber: '' };
    let invoice: { elapsedMs: number; invoiceNumber: string; status: string; invoiceUrl: string } | null = null;

    const CHECKS: Array<{ what: string; expected: string; actual: string; pass: boolean }> = [];
    const record = (what: string, expected: unknown, actual: unknown, pass?: boolean) => {
      const expectedText = String(expected);
      const actualText = String(actual);
      CHECKS.push({
        what,
        expected: expectedText,
        actual: actualText,
        pass: pass === undefined ? expectedText === actualText : pass,
      });
    };
    const printVerify = () => {
      console.log('==================== VERIFY ====================');
      CHECKS.forEach((c, i) => {
        console.log(`  Verify #${i + 1} - ${c.what}:`);
        console.log(`     Expected : ${c.expected}`);
        console.log(`     Actual   : ${c.actual}`);
        console.log(`     Result   : ${c.pass ? 'PASS' : 'FAIL'}`);
      });
      console.log('===============================================');
      const passed = CHECKS.filter((c) => c.pass).length;
      console.log(
        `OVERALL: ${passed === CHECKS.length ? 'PASS' : 'FAIL'} - ${passed}/${CHECKS.length} checks matched`
      );
    };

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await loginToO12CE(page, users.sale_ic_thomas_crm_mig);
      await openOpportunitiesListOnO12CE(page);
      opp = await createOpportunityOnO12CE(page, TC_ID);
      await addDealElementOnO12CE(page);
      quotation = await pressNewQuotationOnO12CE(page);
      // Setup gate - NOT this TC's assertion. On O12 CE "NEW QUOTATION" creates the Quotation in
      // place instead of navigating to it; the helper then looks the record up and puts the form on
      // it. This TC's setup only needs the form to BE on the Quotation, so it gates on
      // landedOnQuotation. Whether the button NAVIGATES is the subject of CRM-12370_6.1.1 and is
      // asserted there - gating on it here would make every screen-verification TC duplicate that
      // one finding and never reach its own checks.
      expect(
        quotation.landedOnQuotation,
        `the setup must land on the created Quotation so it can be confirmed (navigated=${quotation.navigated}, quotationId="${quotation.quotationId}", chatter: "${(quotation.chatterText || '').substring(0, 200)}")`
      ).toBeTruthy();
      confirmResult = await confirmQuotationOnO12CE(page);
      invoice = await createInvoiceOnO12CE(page);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const EXPECTED = ['SEND & PRINT', 'REGISTER PAYMENT', 'ADD CREDIT NOTE', 'PREVIEW', 'CANCEL', 'CREATE LICENSE'];

      const invoicePage = new InvoicePage(page);

      await invoicePage.clickStatusbarButtonByName('action_invoice_open', CommonUtils.waitTimes.pageLoad);
      await invoicePage.waitForInvoiceStatus('Open').catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      const buttons = await invoicePage.getStatusbarButtons();
      const stage = await invoicePage.getActiveStatusBarStage();
      console.log(`  - Stage: ${stage} | buttons: ${buttons.join(' | ')}`);

      record('Invoice is OPEN before the button read', 'OPEN', stage);
      record('Number of header buttons on an OPEN Invoice', EXPECTED.length, buttons.length);
      record('Header button names and order', EXPECTED.join(' | '), buttons.join(' | '));
      record('VALIDATE is no longer offered', 'absent', buttons.includes('VALIDATE') ? 'present' : 'absent');
      printVerify();

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Open Invoice header`);

      expect(stage, 'the Invoice must be OPEN before its header is read').toBe('OPEN');
      expect(buttons, 'an OPEN Invoice header must carry exactly 6 buttons').toHaveLength(EXPECTED.length);
      expect(buttons, 'the OPEN Invoice header buttons must match the documented set and order').toEqual(EXPECTED);
    });
  });
});
