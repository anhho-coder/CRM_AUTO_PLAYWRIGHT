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
 * ===========================================================================
 * O12 CE Main-Business Smoke - Invoice - breadcrumb trail survives a refresh
 * ===========================================================================
 * Test Case ID    : CRM-12370_6.2.12
 * Automation-Type : new
 * Automation-Date : 2026-10-01
 * Run as          : Sales IC - Thomas Semerich (users.sale_ic_thomas_crm_mig)
 * Server          : O12 CE Migration server (crm-mig.nakivo.site)
 *
 * Summary:
 *   Drives the same Opportunity -> Deal Element -> Quotation -> Sales Order -> Invoice chain as
 *   CRM-12370_6.2.2, then refreshes the Invoice page the way a tester presses F5 and checks that the
 *   breadcrumb trail above the form is still the one the chain built, segment for segment.
 *
 * ---------------------------------------------------------------------------
 * Source
 * ---------------------------------------------------------------------------
 *   Cloned from : CRM-12370_6.2.2 "Verify the control-panel buttons of the Invoice"
 *                 (6.Invoice/6.2.Buttons/tc-smoke-6-2-2-invoice-buttons-control-panel.spec.ts)
 *                 - steps 1-14 (the chain) are that spec's setup, unchanged.
 *   Raised by   : the tester on 2026-10-01, from a crm-mig run of CRM-12370_6.2.2: after refreshing
 *                 the Invoice screen the breadcrumb read "SO217899 / Invoice" instead of the full
 *                 "All Pipeline / <Opportunity> / <Deal Element> / <Sale Order> / Invoice" trail.
 *   Source TC   : NONE - there is no Xray manual TC behind this one yet. REQUIREMENT #7 (pin the
 *                 source version) cannot apply until the manual case is written; create the manual
 *                 TC before quoting this spec as coverage.
 *
 * ---------------------------------------------------------------------------
 * Known caveat - read before treating a FAIL as a migration defect
 * ---------------------------------------------------------------------------
 *   The Odoo 12 web client holds the breadcrumb trail in the client-side action stack only; the URL
 *   hash carries action + model + id and nothing else. Whether that makes the trail legitimately
 *   unrecoverable after an F5 is NOT established here - this spec records what crm-mig does. Run the
 *   same scenario on pre-production before filing a bug: if pre-prod loses the trail too, the
 *   behaviour is the Odoo 12 baseline and not a migration finding.
 *
 * ---------------------------------------------------------------------------
 * Pre-conditions
 * ---------------------------------------------------------------------------
 *   The O12 CE Migration server is reachable and the sales IC account Thomas Semerich can log in
 *   (CRM-12325_1.1.1).
 *
 * ---------------------------------------------------------------------------
 * Steps to reproduce
 * ---------------------------------------------------------------------------
 *   1-14. Login, open Opportunities list, CREATE + fill + SAVE Opportunity, wait for Contact, press
 *         "DEAL ELEMENT", select Pricelist + Payment Term, add product, press "SAVE", press
 *         "NEW QUOTATION", press "CONFIRM" to create the Sales Order, press "CREATE INVOICE" and
 *         "CREATE AND VIEW INVOICES".
 *   15.   Read the breadcrumb trail above the Invoice form, left to right, and note it as the
 *         baseline (N segments).
 *         Expected: the trail carries the whole chain, ending on the Invoice.
 *   16.   Refresh the Invoice page (F5) and wait for the Invoice form to render again.
 *         Expected: the Invoice form comes back in readonly mode (EDIT visible).
 *   17.   Read the breadcrumb trail again and compare it with the baseline.
 *         Expected: the same N segments, in the same order, ending on the same Invoice segment.
 *
 * ---------------------------------------------------------------------------
 * Verification
 * ---------------------------------------------------------------------------
 *   - Number of breadcrumb segments after the refresh = the baseline count (delta 0)
 *   - The segments and their ORDER after the refresh = the baseline segments
 *   - The last (active) segment after the refresh = the last segment of the baseline, so the refresh
 *     landed back on the same Invoice and a shorter trail cannot be excused by a navigation
 *
 * crm-mig house rule: this spec CREATES data and removes it in teardown. The Opportunity it makes
 * carries the marker "TEST CRM-12370_6.2.12 <timestamp>" so the afterAll sweep finds it again even
 * when the test dies mid-way.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_6\.2\.12:" --project=chromium
 */

const SKIP_CLEANUP_OPP = false;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  s1: 'Step 1-14: Login, create Opportunity, Deal Element, Quotation, Sales Order, Invoice',
  s2: 'Step 15: Read the breadcrumb trail above the Invoice form, left to right, and note it as the baseline',
  s3: 'Step 16: Refresh the Invoice page (F5) and wait for the Invoice form to render again',
  s4: 'Step 17: Read the breadcrumb trail again and compare it with the baseline',
} as const;

test.describe('CRM-12370_6.2.12 - Invoice breadcrumb trail after a refresh', () => {

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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_6.2.12');
  });

  test('CRM-12370_6.2.12: Verify the breadcrumb trail of the Invoice survives a page refresh', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const TC_ID = 'CRM-12370_6.2.12';
    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let confirmResult: { status: string; orderNumber: string } = { status: '', orderNumber: '' };
    let invoice: { elapsedMs: number; invoiceNumber: string; status: string; invoiceUrl: string } | null = null;

    let trailBefore: string[] = [];
    let trailAfter: string[] = [];

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

    const invoicePage = new InvoicePage(page);

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
      // landedOnQuotation. Whether the button NAVIGATES is the subject of CRM-12370_6.1.1.
      expect(
        quotation.landedOnQuotation,
        `the setup must land on the created Quotation so it can be confirmed (navigated=${quotation.navigated}, quotationId="${quotation.quotationId}", chatter: "${(quotation.chatterText || '').substring(0, 200)}")`
      ).toBeTruthy();
      confirmResult = await confirmQuotationOnO12CE(page);
      invoice = await createInvoiceOnO12CE(page);
      console.log(`  - Opportunity : ${opp?.oppName ?? ''}`);
      console.log(`  - Sales Order : ${confirmResult.orderNumber}`);
      console.log(`  - Invoice     : ${invoice?.invoiceNumber ?? ''}`);
      console.log(`  - Invoice URL : ${invoice?.invoiceUrl ?? ''}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Steps 1-14 - Invoice opened from the Sales Order`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      trailBefore = await invoicePage.getBreadcrumbTrail();
      console.log(`  Breadcrumb segments BEFORE the refresh : ${trailBefore.length}`);
      trailBefore.forEach((c, i) => console.log(`    ${i + 1}. ${c}`));
      // Baseline gate - NOT the finding. A trail that is already short here means the chain never
      // built one, so there would be nothing for the refresh to lose and the TC would pass vacuously.
      expect(
        trailBefore.length,
        `the chain must leave a multi-level breadcrumb before the refresh, got ${trailBefore.length}: "${trailBefore.join(' / ')}"`
      ).toBeGreaterThan(1);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await invoicePage.reloadInvoiceForm(CommonUtils.waitTimes.abnormalWait);
      console.log('  OK - the Invoice form is back in readonly mode after the refresh');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      trailAfter = await invoicePage.getBreadcrumbTrail();
      console.log(`  Breadcrumb segments AFTER the refresh  : ${trailAfter.length}`);
      trailAfter.forEach((c, i) => console.log(`    ${i + 1}. ${c}`));

      const lastBefore = trailBefore[trailBefore.length - 1] ?? '';
      const lastAfter = trailAfter[trailAfter.length - 1] ?? '';

      record(
        'Number of breadcrumb segments after the refresh (a smaller number means the client rebuilt the view from the URL alone and the Sales Order / Deal Element / Opportunity levels are gone - the user cannot step back up the chain)',
        trailBefore.length,
        trailAfter.length
      );
      record(
        'The breadcrumb segments and their ORDER after the refresh',
        trailBefore.join(' / '),
        trailAfter.join(' / ')
      );
      record(
        'The last (active) segment after the refresh - proves the refresh landed back on the same Invoice, so a shorter trail cannot be explained by a navigation',
        lastBefore,
        lastAfter
      );
      printVerify();

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Breadcrumb after the refresh`);

      expect(
        trailAfter.length,
        `the breadcrumb must keep the ${trailBefore.length} segments it had before the refresh, got ${trailAfter.length}: "${trailAfter.join(' / ')}"`
      ).toBe(trailBefore.length);
      expect(trailAfter, 'the breadcrumb segments and their order must be unchanged by the refresh').toEqual(trailBefore);
      expect(lastAfter, 'the refresh must land back on the same Invoice record').toBe(lastBefore);
    });
  });
});
