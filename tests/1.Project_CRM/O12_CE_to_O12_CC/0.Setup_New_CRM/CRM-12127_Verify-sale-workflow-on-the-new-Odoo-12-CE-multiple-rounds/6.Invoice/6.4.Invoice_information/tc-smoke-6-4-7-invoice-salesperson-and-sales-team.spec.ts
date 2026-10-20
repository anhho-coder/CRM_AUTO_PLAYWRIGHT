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
 * O12 CE Main-Business Smoke - Invoice data verification - Salesperson and Sales Team
 * Test Case ID: CRM-12370_6.4.7
 * Automation-Type: refactored
 * Automation-Date: 2026-09-22
 * Expectation-Updated: 2026-10-01 (Sales Team: empty -> BDEU - see "O12 CE deviations" below)
 *
 * Objective: Verify Salesperson equals the logged-in user; Sales Team is the salesperson's
 * default Sales Team (BDEU).
 *
 * BASELINE RULE (tester's standing requirement): the assertions below are the PRE-PRODUCTION TC's
 * assertions, copied unchanged. Only the login account, the navigation path, the run marker and the
 * wait/timeout durations are adapted. Where O12 CE behaves differently this TC FAILS - that failure
 * IS the migration finding and must never be softened into a pass.
 * ONE EXCEPTION, decided by the tester on 2026-10-01: the Sales Team expectation (see the
 * "NON-MECHANICAL deviation" block below). Every other assertion here is still the baseline's.
 *
 * Source manual TC (pre-production): TC.Performance.6.4.7
 * (tests/1.Project_CRM/1.SalesReport_Performance/6.Invoice/6.4.Invoice_information). Section II ports
 * the pre-production Invoice data verification set to the O12 CE Migration server.
 *
 * O12 CE deviations vs the pre-production scenario (MECHANICAL only):
 *   - Login as the sales IC Thomas Semerich (`users.sale_ic_thomas_crm_mig`).
 *   - The run marker is "TEST ..." instead of the pre-prod format.
 *   - Test timeout raised to config.timeouts.test (15 min).
 *
 * NON-MECHANICAL deviation - Sales Team (tester's decision, 2026-10-01):
 *   The pre-production baseline asserts `Sales Team = (empty)`, because the Opportunity is created
 *   with its Sales Team cleared. On O12 CE the chain does NOT carry that empty value through: the
 *   Quotation created by "NEW QUOTATION" takes the Sales Team from the LOGGED-IN USER's default
 *   team, and the Sales Order passes it on to the Invoice. For `users.sale_ic_thomas_crm_mig` that
 *   is "BDEU" (verified on crm-mig: `res.users.sale_team_id` = crm.team id 40 "BDEU").
 *   The tester reviewed the O12 CE result on 2026-10-01 and confirmed `Salesperson = Thomas
 *   Semerich` + `Sales Team = BDEU` is the CORRECT expected result on the migration base, so this
 *   TC asserts BDEU rather than the baseline's empty. The expected team is READ from the users
 *   config (`users.sale_ic_thomas_crm_mig.salesTeam`), not hardcoded.
 *   This is the only assertion in this file that departs from the pre-production baseline.
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
 *   1. Read the "Salesperson" and "Sales Team" fields.
 *
 * Verification Points:
 *   1. Salesperson is filled.
 *   2. Salesperson = the user who created the chain (Thomas Semerich).
 *   3. Sales Team is filled.
 *   4. Sales Team = the salesperson's default Sales Team (BDEU).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_6\.4\.7:" --project=chromium
 */

const SKIP_CLEANUP_OPP = false;

const STEP = {
  s1: 'Steps 1-14: Login, create Opportunity, Deal Element, confirm Quotation, create Invoice',
  s2: 'Step 1: Verifying Salesperson and Sales Team',
};

test.describe('CRM-12370_6.4.7 - Salesperson and Sales Team', () => {
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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_6.4.7');
  });

  test('CRM-12370_6.4.7: Verify Salesperson and Sales Team on the Invoice', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const TC_ID = 'CRM-12370_6.4.7';
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
      console.log('\n--- Step 1: Verifying Salesperson and Sales Team ---');
      const invoicePage = new InvoicePage(page);
      const salesperson = await invoicePage.getSalesperson();
      const salesTeam = await invoicePage.getSalesTeam();
      console.log(`  - Salesperson: ${salesperson}`);
      console.log(`  - Sales Team: "${salesTeam}"`);

      // Pre-prod reads the expected name from the users config (users.admin_crm.createdByName);
      // the Mig account carries the same fact in `displayName`, so the expectation is read, not
      // hardcoded - the assertion itself is the pre-production one, unchanged.
      const expectedSalesperson = users.sale_ic_thomas_crm_mig.displayName;
      // Sales Team: the O12 CE expectation confirmed by the tester on 2026-10-01 (see the
      // "NON-MECHANICAL deviation" note in the header). Read from the users config, not hardcoded.
      const expectedSalesTeam = users.sale_ic_thomas_crm_mig.salesTeam;

      record('Salesperson is filled', 'not empty', salesperson || '(empty)', salesperson !== '');
      record('Salesperson is the user that created the chain', expectedSalesperson, salesperson);
      record('Sales Team is filled', 'not empty', salesTeam || '(empty)', salesTeam !== '');
      record("Sales Team is the salesperson's default Sales Team", expectedSalesTeam, salesTeam);
      printVerify();

      let __verifyPassed = false;
      try {
        expect(salesperson, 'the Invoice Salesperson must be filled').not.toBe('');
        expect(salesperson, 'the Invoice Salesperson must be the user who created the chain').toBe(expectedSalesperson);
        expect(salesTeam, 'the Invoice Sales Team must be filled').not.toBe('');
        expect(salesTeam, "the Invoice Sales Team must be the salesperson's default Sales Team").toBe(expectedSalesTeam);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC_ID} - Invoice Salesperson and Sales Team verification`, passed: __verifyPassed }).catch(() => {});
      }
    });
  });
});
