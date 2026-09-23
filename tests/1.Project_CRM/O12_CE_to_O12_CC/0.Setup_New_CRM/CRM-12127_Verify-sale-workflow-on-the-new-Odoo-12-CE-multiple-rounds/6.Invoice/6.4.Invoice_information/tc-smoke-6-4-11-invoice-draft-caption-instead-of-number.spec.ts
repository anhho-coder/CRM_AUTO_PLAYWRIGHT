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
 * O12 CE Main-Business Smoke - Invoice data verification - Draft caption instead of number
 * Test Case ID: CRM-12370_6.4.11
 * Automation-Type: refactored
 * Automation-Date: 2026-09-22
 *
 * Objective: Verify draft shows "Draft Invoice" caption; number is withheld until validation.
 *
 * BASELINE RULE (tester's standing requirement): the assertions below are the PRE-PRODUCTION TC's
 * assertions, copied unchanged. Only the login account, the navigation path, the run marker and the
 * wait/timeout durations are adapted. Where O12 CE behaves differently this TC FAILS - that failure
 * IS the migration finding and must never be softened into a pass.
 *
 * Source manual TC (pre-production): TC.Performance.6.4.11
 * (tests/1.Project_CRM/1.SalesReport_Performance/6.Invoice/6.4.Invoice_information). Section II ports
 * the pre-production Invoice data verification set to the O12 CE Migration server.
 *
 * O12 CE deviations vs the pre-production scenario (MECHANICAL only):
 *   - Login as the sales IC Thomas Semerich (`users.sale_ic_thomas_crm_mig`).
 *   - The run marker is "TEST ..." instead of the pre-prod format.
 *   - Test timeout raised to config.timeouts.test (15 min).
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the sales IC account Thomas Semerich can log in.
 *
 * Steps (1-14 = the shared chain):
 *   1-7.  Login, open Opportunities list, CREATE + fill + SAVE Opportunity, wait for Contact.
 *   8-11. Press "DEAL ELEMENT", select Pricelist + Payment Term, add product, press "SAVE".
 *  12. Press "NEW QUOTATION" button and wait.
 *  13. Press "CONFIRM" button and wait for Sales Order.
 *  14. Press "CREATE INVOICE" button and "CREATE AND VIEW INVOICES".
 *
 * Steps run:
 *   1. Read the Invoice title/caption, Invoice number, and the Stage field.
 *
 * Verification Points:
 *   1. Caption = "Draft Invoice".
 *   2. Invoice number is empty.
 *   3. Stage = "DRAFT".
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_6\.4\.11:" --project=chromium
 */

const SKIP_CLEANUP_OPP = false;

const STEP = {
  s1: 'Steps 1-14: Login, create Opportunity, Deal Element, confirm Quotation, create Invoice',
  s2: 'Step 1: Verifying Draft caption and number',
};

test.describe('CRM-12370_6.4.11 - Draft caption instead of number', () => {
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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_6.4.11');
  });

  test('CRM-12370_6.4.11: Verify draft shows Draft Invoice caption instead of number', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const TC_ID = 'CRM-12370_6.4.11';
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
      console.log(`OVERALL: ${passed === CHECKS.length ? 'PASS' : 'FAIL'} - ${passed}/${CHECKS.length} checks matched`);
    };

    await test.step(STEP.s1, async () => {
      console.log('\n--- Steps 1-14: Login, create Opportunity, Deal Element, confirm Quotation, create Invoice ---');
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
      console.log('\n--- Step 1: Verifying Draft caption and number ---');
      const invoicePage = new InvoicePage(page);
      const caption = await invoicePage.getInvoiceTitleCaption();
      const invoiceNumber = await invoicePage.getInvoiceNumberOrEmpty();
      const stage = await invoicePage.getFieldDisplayValue('state');
      console.log(`  - Caption: "${caption}"`);
      console.log(`  - Invoice number: "${invoiceNumber}"`);
      console.log(`  - Stage: "${stage}"`);

      record('Caption = Draft Invoice', 'Draft Invoice', caption);
      record('Invoice number is empty', '(empty)', invoiceNumber || '(empty)');
      record('Stage = DRAFT', 'DRAFT', stage);
      printVerify();

      let __verifyPassed = false;
      try {
        expect(caption, 'the draft Invoice must show "Draft Invoice" caption').toBe('Draft Invoice');
        expect(invoiceNumber, 'a draft Invoice must have no number yet').toBe('');
        expect(stage, 'the Invoice stage must be DRAFT').toBe('DRAFT');
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC_ID} - Invoice Draft caption`, passed: __verifyPassed }).catch(() => {});
      }
    });
  });
});
