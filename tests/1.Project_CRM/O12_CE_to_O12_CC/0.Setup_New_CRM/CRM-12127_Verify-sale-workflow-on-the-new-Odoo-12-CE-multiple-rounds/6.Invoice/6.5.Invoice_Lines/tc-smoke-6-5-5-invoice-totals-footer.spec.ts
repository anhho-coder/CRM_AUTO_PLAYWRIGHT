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
  validateInvoiceOnO12CE,
  O12ceOpportunity,
  O12ceQuotationResult,
  teardownMigRecords,
  sweepMigLeftoversAfterAll,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Invoice totals footer
 * Test Case ID: CRM-12370_6.5.5
 * Automation-Type: ported
 * Automation-Date: 2026-09-22
 *
 * Summary:
 *   Verify the Invoice totals footer displays the correct row labels and values, and changes when
 *   the Invoice is validated.
 *
 * Source manual TC (pre-production): TC.Performance.6.5.5 "Invoice Invoice Lines - The totals
 * footer is correct".
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
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the sales IC account Thomas Semerich can log in.
 *
 * Steps (1-14 = the shared Opportunity + Deal Element chain):
 *   1-14. Login, create Opportunity, Deal Element, Quotation, Sales Order, and Invoice.
 *
 * Steps run:
 *  15. Read the Invoice totals footer rows (Draft state).
 *  16. Press the VALIDATE button to move the Invoice to Open state.
 *  17. Read the Invoice totals footer rows again (Open state).
 *
 * Verification:
 *   - Draft totals reads Subtotal, Partner Discount, Total (in that order).
 *   - Amount Due is not present on a Draft Invoice.
 *   - Total equals the Subtotal on a Draft Invoice.
 *   - Amount Due appears in the totals block once the Invoice is validated to Open.
 *   - Amount Due equals the Total of the unpaid posted Invoice.
 *
 * crm-mig house rule: this spec CREATES data and removes it in teardown.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_6\\.5\\.5:" --project=chromium
 */

const SKIP_CLEANUP_OPP = false;

const STEP = {
  chain: 'Steps 1-14: Login, create Opportunity, Deal Element, Quotation, Sales Order, and Invoice',
  read: 'Step 15: Read the Invoice totals footer on Draft state',
  validate: 'Step 16: Press VALIDATE to move the Invoice to Open state',
  readOpen: 'Step 17: Read the Invoice totals footer on Open state',
  verify: 'Verification: Totals footer is correct on Draft and Open states',
} as const;

test.describe('CRM-12370_6.5.5 - O12 CE smoke: Invoice totals footer', () => {

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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_6.5.5');
  });

  test('CRM-12370_6.5.5: Verify the Invoice totals footer is correct on Draft and Open states', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const TC_ID = 'CRM-12370_6.5.5';
    const invoicePage = new InvoicePage(page);
    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;

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
    });

    let draftTotals: Array<{ label: string; value: string }> = [];
    let draftSubtotal = 0;
    let draftTotal = 0;

    await test.step(STEP.read, async () => {
      console.log(`\n--- ${STEP.read} ---`);
      draftTotals = await invoicePage.getInvoiceTotalsFooter();
      const draftLabels = draftTotals.map((t) => t.label);
      console.log(`  - Draft totals: ${draftTotals.map((t) => t.label + '=' + t.value).join(' | ')}`);

      const money = (value: string) => {
        const match = (value || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
        return match ? parseFloat(match[0]) : NaN;
      };
      draftSubtotal = money((draftTotals.find((t) => t.label === 'Subtotal') || { value: '' }).value);
      draftTotal = money((draftTotals.find((t) => t.label === 'Total') || { value: '' }).value);

      record('Draft totals rows', 'Subtotal | Partner Discount | Total', draftLabels.join(' | '));
      record('Amount Due is hidden on a draft Invoice', 'absent',
        draftLabels.includes('Amount Due') ? 'present' : 'absent');
      record('Total equals the Subtotal', draftSubtotal.toFixed(2), draftTotal.toFixed(2));
    });

    await test.step(STEP.validate, async () => {
      console.log(`\n--- ${STEP.validate} ---`);
      await invoicePage.clickStatusbarButtonByName('action_invoice_open', CommonUtils.waitTimes.pageLoad);
      await invoicePage.waitForInvoiceStatus('Open').catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.long);
    });

    let openTotals: Array<{ label: string; value: string }> = [];
    let amountDue = 0;

    await test.step(STEP.readOpen, async () => {
      console.log(`\n--- ${STEP.readOpen} ---`);
      openTotals = await invoicePage.getInvoiceTotalsFooter();
      const openLabels = openTotals.map((t) => t.label);
      const money = (value: string) => {
        const match = (value || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
        return match ? parseFloat(match[0]) : NaN;
      };
      amountDue = money((openTotals.find((t) => t.label === 'Amount Due') || { value: '' }).value);
      console.log(`  - Open totals : ${openTotals.map((t) => t.label + '=' + t.value).join(' | ')}`);

      record('Amount Due joins the block after VALIDATE', 'present',
        openLabels.includes('Amount Due') ? 'present' : 'absent');
      record('Amount Due equals the Total', draftTotal.toFixed(2), amountDue.toFixed(2),
        Math.abs(amountDue - draftTotal) < 0.01);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerify();

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Invoice totals footer`);

      const draftLabels = draftTotals.map((t) => t.label);
      const openLabels = openTotals.map((t) => t.label);

      expect(draftLabels, 'the draft totals block must read Subtotal, Partner Discount, Total').toEqual([
        'Subtotal',
        'Partner Discount',
        'Total',
      ]);
      expect(draftLabels, 'Amount Due must not be shown on a draft Invoice').not.toContain('Amount Due');
      expect(draftTotal, 'the Total must equal the Subtotal when no discount applies').toBeCloseTo(draftSubtotal, 2);
      expect(openLabels, 'Amount Due must join the totals block once the Invoice is validated').toContain('Amount Due');
      expect(amountDue, 'the Amount Due of an unpaid posted Invoice must equal its Total').toBeCloseTo(draftTotal, 2);
    });
  });
});
