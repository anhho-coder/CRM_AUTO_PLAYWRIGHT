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
 * O12 CE Main-Business Smoke - Invoice log note - created from Sales Order
 * Test Case ID: CRM-12370_6.6.1
 * Automation-Type: ported
 * Automation-Date: 2026-09-22
 *
 * Summary:
 *   Verify the chatter of a newly created Invoice carries the note "This invoice has been created
 *   from: SO<number>", naming the Sales Order it was generated from.
 *
 * Source manual TC (pre-production): TC.Performance.6.6.1 "Invoice log note - The Log note reports
 * the Sales Order the Invoice was created from".
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
 *   - chatter note retrieval uses waitForChatterMessage / findChatterMessage with retry logic,
 *     preserving the pre-prod pattern.
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the sales IC account Thomas Semerich can log in.
 *
 * Steps (1-14 = the shared Opportunity + Deal Element chain):
 *   1-14. Login, create Opportunity, Deal Element, Quotation, Sales Order, and Invoice.
 *
 * Steps run:
 *  15. Read the messages of the Invoice chatter.
 *  16. Find the note that reports where the invoice was created from.
 *
 * Verification:
 *   - A chatter note reads "This invoice has been created from: SO<number>".
 *   - The Sales Order it names is the Source Document of the Invoice.
 *   - It is the newest message of the chatter.
 *
 * crm-mig house rule: this spec CREATES data and removes it in teardown.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_6\\.6\\.1:" --project=chromium
 */

const SKIP_CLEANUP_OPP = false;

const STEP = {
  chain: 'Steps 1-14: Login, create Opportunity, Deal Element, Quotation, Sales Order, and Invoice',
  read: 'Steps 15-16: Read the chatter and find the "created from" note',
  verify: 'Verification: The "created from" note is correct',
} as const;

test.describe('CRM-12370_6.6.1 - O12 CE smoke: Invoice log note - created from Sales Order', () => {

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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_6.6.1');
  });

  test('CRM-12370_6.6.1: Verify the Log note reports the Sales Order the Invoice was created from', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const TC_ID = 'CRM-12370_6.6.1';
    const invoicePage = new InvoicePage(page);
    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let saleOrderNumber = '';

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
      await invoicePage.openOtherInfoTab();
      saleOrderNumber = await invoicePage.getSourceDocument();
      await invoicePage.clickInvoiceLinesTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log(`  Source Document (Sales Order): ${saleOrderNumber}`);
    });

    await test.step(STEP.read, async () => {
      console.log(`\n--- ${STEP.read} ---`);
      const note = await invoicePage.waitForChatterMessage(/This invoice has been created from/);
      const messages = await invoicePage.getChatterMessages();
      console.log(`  - Chatter messages: ${messages.length}`);
      messages.forEach((m, i) => console.log(`    [${i}] ${m.replace(/\n/g, ' / ')}`));

      const naming = note ? (note.match(/SO\d+/) || [''])[0] : '';

      record('The "created from" note is in the chatter', 'present', note ? 'present' : 'absent', !!note);
      record('The note names a Sales Order', 'SO<number>', naming || '(none)', /^SO\d+$/.test(naming));
      record('The Sales Order it names is the Source Document', saleOrderNumber, naming);
      record('It is the newest chatter message', 'newest', messages[0] === note ? 'newest' : 'not the newest',
        messages[0] === note);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerify();

      const note = await invoicePage.waitForChatterMessage(/This invoice has been created from/);
      const messages = await invoicePage.getChatterMessages();
      const naming = note ? (note.match(/SO\d+/) || [''])[0] : '';

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Invoice created from Sales Order log note`);

      expect(note, 'the Invoice chatter must carry the "created from" note').not.toBeNull();
      expect(naming, `the note must name the Sales Order, read "${note}"`).toBe(saleOrderNumber);
      expect(messages[0], 'the "created from" note must be the newest chatter message').toBe(note);
    });
  });
});
