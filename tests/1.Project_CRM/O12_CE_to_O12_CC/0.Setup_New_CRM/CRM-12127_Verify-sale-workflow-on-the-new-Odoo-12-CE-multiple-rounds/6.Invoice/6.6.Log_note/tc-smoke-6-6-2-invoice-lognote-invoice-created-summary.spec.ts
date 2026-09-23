import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users } from '@config/users.config';
import { InvoicePage } from '@pages';
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
  O12ceOpportunity,
  O12ceQuotationResult,
  teardownMigRecords,
  sweepMigLeftoversAfterAll,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Invoice log note - Invoice Created summary
 * Test Case ID: CRM-12370_6.6.2
 * Automation-Type: ported
 * Automation-Date: 2026-09-22
 *
 * Summary:
 *   Verify the chatter of a newly created Invoice carries the "Invoice Created" note and that the
 *   six values it summarises - Type, Status, Currency, Salesperson, Payer and End User - match the
 *   Invoice.
 *
 * Source manual TC (pre-production): TC.Performance.6.6.2 "Invoice log note - The 'Invoice Created'
 * Log note summarises the Invoice".
 *
 * BASELINE RULE (tester's standing requirement): the assertions below are the PRE-PRODUCTION TC's
 * assertions, copied unchanged. Only the login account, the navigation path, the run marker and the
 * wait/timeout durations are adapted. Where O12 CE behaves differently this TC FAILS - that failure
 * IS the migration finding and must never be softened into a pass.
 *
 * O12 CE deviations vs the pre-production scenario (MECHANICAL only):
 *   - Login as the sales IC Thomas Semerich (`users.sale_ic_thomas_crm_mig`).
 *   - The setup chain is driven by helper functions.
 *   - The run marker is "TEST ...".
 *   - Test timeout raised to config.timeouts.test.
 *   - chatter note retrieval uses waitForChatterMessage with the updated expectedSalesperson logic.
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the sales IC account Thomas Semerich can log in.
 *
 * Steps (1-14 = the shared Opportunity + Deal Element chain):
 *   1-14. Login, create Opportunity, Deal Element, Quotation, Sales Order, and Invoice.
 *
 * Steps run:
 *  15. Read the messages of the Invoice chatter.
 *  16. Find the "Invoice Created" note and read the six values it reports.
 *
 * Verification:
 *   - A chatter note titled "Invoice Created" is present.
 *   - It reports Type: Customer Invoice.
 *   - It reports Status: Draft.
 *   - It reports Currency: USD.
 *   - It reports the Salesperson of the Invoice.
 *   - It reports the Payer, which is the Company of the Opportunity.
 *   - It reports the End User, which is the Company of the Opportunity.
 *
 * crm-mig house rule: this spec CREATES data and removes it in teardown.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_6\\.6\\.2:" --project=chromium
 */

const SKIP_CLEANUP_OPP = false;

const STEP = {
  chain: 'Steps 1-14: Login, create Opportunity, Deal Element, Quotation, Sales Order, and Invoice',
  read: 'Steps 15-16: Read the chatter and find the "Invoice Created" note',
  verify: 'Verification: The "Invoice Created" note summarises the Invoice correctly',
} as const;

test.describe('CRM-12370_6.6.2 - O12 CE smoke: Invoice log note - Invoice Created summary', () => {

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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_6.6.2');
  });

  test('CRM-12370_6.6.2: Verify the "Invoice Created" Log note summarises the Type, Status, Currency, Salesperson, Payer and End User', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const TC_ID = 'CRM-12370_6.6.2';
    const invoicePage = new InvoicePage(page);
    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let oppCompany = '';

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

    await test.step(STEP.chain, async () => {
      console.log(`\n--- ${STEP.chain} ---`);
      await loginToO12CE(page, users.sale_ic_thomas_crm_mig);
      await openOpportunitiesListOnO12CE(page);
      opp = await createOpportunityOnO12CE(page, TC_ID);
      oppCompany = opp.companyValue;
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
      await confirmQuotationOnO12CE(page);
      await createInvoiceOnO12CE(page);
    });

    await test.step(STEP.read, async () => {
      console.log(`\n--- ${STEP.read} ---`);
      const note = await invoicePage.waitForChatterMessage(/Invoice Created/);
      console.log(`  - "Invoice Created" note:\n${note}`);

      const fields = note ? invoicePage.parseLogNoteFields(note) : {};
      const expectedSalesperson = users.sale_ic_thomas_crm_mig.displayName;

      record('The "Invoice Created" note is in the chatter', 'present', note ? 'present' : 'absent', !!note);
      record('Type', 'Customer Invoice', fields['Type'] || '(missing)');
      record('Status', 'Draft', fields['Status'] || '(missing)');
      record('Currency', 'USD', fields['Currency'] || '(missing)');
      record('Salesperson', expectedSalesperson, fields['Salesperson'] || '(missing)');
      record('Payer', oppCompany, fields['Payer'] || '(missing)');
      record('End User', oppCompany, fields['End User'] || '(missing)');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerify();

      const note = await invoicePage.waitForChatterMessage(/Invoice Created/);
      const fields = note ? invoicePage.parseLogNoteFields(note) : {};
      const expectedSalesperson = users.sale_ic_thomas_crm_mig.displayName;

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Invoice Created log note`);

      expect(note, 'the Invoice chatter must carry the "Invoice Created" note').not.toBeNull();
      expect(fields['Type'], 'the note must report Type: Customer Invoice').toBe('Customer Invoice');
      expect(fields['Status'], 'the note must report Status: Draft').toBe('Draft');
      expect(fields['Currency'], 'the note must report Currency: USD').toBe('USD');
      expect(fields['Salesperson'], 'the note must report the Salesperson of the Invoice').toBe(expectedSalesperson);
      expect(fields['Payer'], 'the note must report the Company of the Opportunity as the Payer').toBe(oppCompany);
      expect(fields['End User'], 'the note must report the Company of the Opportunity as the End User').toBe(oppCompany);
    });
  });
});
