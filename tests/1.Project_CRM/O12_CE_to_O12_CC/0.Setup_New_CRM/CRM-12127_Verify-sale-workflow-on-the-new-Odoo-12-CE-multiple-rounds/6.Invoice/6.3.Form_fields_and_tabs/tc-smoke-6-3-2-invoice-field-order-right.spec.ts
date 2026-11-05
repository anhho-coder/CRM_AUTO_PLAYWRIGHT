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
  openInvoiceReaderSessionOnO12CE,
  closeReaderSessionOnO12CE,
  getMigSessionGroups,
  O12ceOpportunity,
  O12ceQuotationResult,
  teardownMigRecords,
  sweepMigLeftoversAfterAll,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Invoice screen verification - Field names and order - right column
 * Test Case ID: CRM-12370_6.3.2
 * Automation-Type: refactored
 * Automation-Date: 2026-11-05
 *
 * Objective: Verify the field names and their order in the right column of the Invoice information area
 *
 * BASELINE RULE (tester's standing requirement): the assertions below are the PRE-PRODUCTION TC's
 * assertions, copied unchanged. Only the login account, the navigation path, the run marker and the
 * wait/timeout durations are adapted. Where O12 CE behaves differently this TC FAILS - that failure
 * IS the migration finding and must never be softened into a pass.
 *
 * Source manual TC (pre-production): TC.Performance.6.3.2
 * (tests/1.Project_CRM/1.SalesReport_Performance/6.Invoice/6.3.Form_fields_and_tabs). Section II ports
 * the pre-production Invoice screen-verification set to the O12 CE Migration server: the same fact is
 * verified, on the O12 CE Invoice form.
 *
 * O12 CE deviations vs the pre-production scenario (MECHANICAL only):
 *   - Login as the sales IC Thomas Semerich (`users.sale_ic_thomas_crm_mig`) - the pre-prod owner of
 *     this chain; CRM > Pipeline opened in list view by helper functions.
 *   - Step 16 reads the right column in a SECOND browser session as Faye Nguyen
 *     (`users.accountance_ic_faye_crm_mig`, Billing Manager). The pre-prod baseline runs as admin_crm;
 *     "Don't send license" and "License Send" render only for Billing Manager, which Thomas does not
 *     hold on crm-mig or pre-production (CRM-13273, Khang 2026-11-04). Tester ruling 2026-11-05:
 *     Thomas keeps the chain, the lowest Billing Manager account reads.
 *   - The run marker is "TEST ..." instead of "AUTO ..." so the crm-mig leftover sweep finds the record
 *     again (the sweep matches name LIKE 'TEST' AND name LIKE '<TC id>').
 *   - Test timeout raised to config.timeouts.test (15 min): login + create + save costs ~6 min on crm-mig.
 *   - Navigation and chain are driven by helper functions instead of the pre-prod page objects.
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the sales IC account Thomas Semerich can log in
 *   (CRM-12325_1.1.1).
 *
 * Steps (1-14 = the shared Opportunity + Deal Element + Quotation + Invoice chain):
 *   1-7.  Login, open the Opportunities list, CREATE + fill + SAVE the Opportunity, wait for Contact.
 *   8-11. Press "DEAL ELEMENT", select Pricelist + Payment Term, add a product, press "SAVE".
 *  12. Press "NEW QUOTATION" button and wait.
 *  13. Press "CONFIRM" button and wait to create a Sales Order.
 *  14. On the "Sales Order" screen, press "CREATE INVOICE" button and wait.
 *  15. On the "Invoice Order" window, press "CREATE AND VIEW INVOICES" button.
 *
 * Steps run:
 *   16. Open another browser, login as Faye Nguyen (Billing Manager), open the Invoice and read the
 *       field labels of the right column of the Invoice information area, top to bottom.
 *
 * Verification:
 *   - The right column carries exactly 11 fields
 *   - They read Invoice Date, Due Date, Paid Date, Salesperson, Sales Team, Currency, Can Edit Actually Received, Actually Received, Don't send license, License Send, Postpone Date in that order
 *
 * crm-mig house rule: this spec CREATES data and removes it in teardown. The Opportunity it makes carries
 * the marker "TEST CRM-12370_6.3.2 <timestamp>" so the afterAll sweep can find it again even when the test dies
 * mid-way.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_6\.3\.2:" --project=chromium
 */

const SKIP_CLEANUP_OPP = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken chain for hand-debugging - the 16:00 leftover-data check then reports it.

const STEP = {
  s1: 'Step 1-11: Login, open Opportunities, create Opportunity and Deal Element',
  s2: 'Step 12: Press NEW QUOTATION and wait',
  s3: 'Step 13: Press CONFIRM and wait to create Sales Order',
  s4: 'Step 14: Press CREATE INVOICE and wait',
  s5: 'Step 15: On Invoice Order window, press CREATE AND VIEW INVOICES',
  s6: 'Step 16: Verifying the right column of the Invoice information area',
};

test.describe('CRM-12370_6.3.2 - Invoice field names and order - right column', () => {

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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_6.3.2');
  });

  test('CRM-12370_6.3.2: Verify the field names and their order in the right column of the Invoice information area', async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const TC_ID = 'CRM-12370_6.3.2';
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

    await loginToO12CE(page, users.sale_ic_thomas_crm_mig);
    await openOpportunitiesListOnO12CE(page);
    opp = await createOpportunityOnO12CE(page, TC_ID);
    await addDealElementOnO12CE(page);

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
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
    });

    confirmResult = await confirmQuotationOnO12CE(page);
    invoice = await createInvoiceOnO12CE(page);

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      // Already completed in createInvoiceOnO12CE
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      const EXPECTED = [
        'Invoice Date',
        'Due Date',
        'Paid Date',
        'Salesperson',
        'Sales Team',
        'Currency',
        'Can Edit Actually Received',
        'Actually Received',
        "Don't send license",
        'License Send',
        'Postpone Date',
      ];

      const reader = users.accountance_ic_faye_crm_mig;
      const session = await openInvoiceReaderSessionOnO12CE(browser, invoice!.invoiceUrl, reader, testInfo);
      let __verifyPassed = false;
      try {
        const groups = await getMigSessionGroups(session.readerPage, ['account.group_account_manager']);
        console.log(`  - Reader account : ${reader.username} (${reader.displayName})`);
        console.log(`  - Billing Manager: ${groups['account.group_account_manager']}`);

        const invoicePage = new InvoicePage(session.readerPage);
        const columns = await invoicePage.getInformationAreaColumns();
        const right = columns.right;
        console.log(`  - Right column: ${right.join(' | ')}`);

        record('Number of fields in the right column', EXPECTED.length, right.length);
        record('Right column field names and order', EXPECTED.join(' | '), right.join(' | '));
        printVerify();

        try {
          expect(right, 'the right column of the Invoice must carry exactly 11 fields').toHaveLength(EXPECTED.length);
          expect(right, 'the right column field names and their order must match the documented list').toEqual(EXPECTED);
          __verifyPassed = true;
        } finally {
          await CommonUtils.captureVerifyEvidence(session.readerPage, testInfo, { name: `${TC_ID} - Invoice field order right column`, passed: __verifyPassed }).catch(() => {});
        }
      } finally {
        // Always close the reader browser context (and attach its video), even when verification failed.
        await closeReaderSessionOnO12CE(session, testInfo);
      }
    });
  });
});
