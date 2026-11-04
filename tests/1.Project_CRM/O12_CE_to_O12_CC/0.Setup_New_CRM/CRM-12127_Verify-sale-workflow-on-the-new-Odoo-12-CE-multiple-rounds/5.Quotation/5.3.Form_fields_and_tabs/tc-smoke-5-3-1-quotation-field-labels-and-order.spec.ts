import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
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
 * =============================================================================
 * O12 CE Main-Business Smoke - Field names and order in the Quotation information area
 * =============================================================================
 * Test Case ID   : CRM-12370_5.3.1
 * Jira           : CRM-12325
 * Automation-Type: refactored
 * Automation-Date: 2026-11-03
 *   (2026-11-03: the verify-evidence shots carried no outline and no banner - the 990dfac bulk conversion passed
 *    only name/passed. Step 12 now outlines the Quotation form; Verification outlines every label read and
 *    burns Expected / Actual / Difference into the image. Assertions unchanged.)
 *
 * Summary:
 *   Verify the Quotation information area carries exactly the 17 pre-production fields, in the
 *   pre-production order (top-left down, then top-right down).
 *
 * -----------------------------------------------------------------------------
 * Source manual TC (pre-production): TC.Performance.1.1.5.15 "Field names and order in the Quotation information area"
 * -----------------------------------------------------------------------------
 *   Pre-condition(s):
 *     - The O12 CE Migration server is reachable and the Admin account can log in
 *       (CRM-12325_1.1.1).
 *
 *   Steps to reproduce (the manual TC's 6 steps):
 *     1. Log in to the CRM.
 *     2. Open "CRM" and switch to the Opportunities list view.
 *     3. Create the Opportunity this test case owns:
 *          - Opp name    = TEST CRM-12370_5.3.1 <timestamp>
 *          - Email       = <generated, unique per run>
 *          - Country     = United States
 *          - State       = Connecticut
 *          - Sales Team  = (cleared)
 *          - Salesperson = (cleared)
 *          - Lead Form   = License
 *     4. Create the Deal Element this test case owns:
 *          - Pricelist    = Public Pricelist_USD
 *          - Payment Term = Immediate Payment
 *          - Order line   = NAKIVO Backup product
 *     5. Press "NEW QUOTATION" to create the Quotation.
 *     6. Read the labelled fields of the Quotation information area, in order.
 *
 *   Verification:
 *     1. The information area carries exactly 17 labelled fields.
 *     2. The labels appear in the pre-production order.
 *
 *   Manual steps 1-5 are the shared O12 CE setup and are run by the suite helper
 *   (o12ce-main-business.helper), which expands them into Step 1 .. Step 11 plus Step 12
 *   below - the same grouping the 4.Deal_Element specs use. Manual step 6 is Step 13,
 *   mapped 1:1.
 *
 * -----------------------------------------------------------------------------
 * Baseline rule (CLAUDE.md): the assertions below are the PRE-PRODUCTION baseline, ported
 * unchanged. Where O12 CE behaves differently this spec stays RED - it is never adapted to
 * what O12 CE happens to do.
 * -----------------------------------------------------------------------------
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_5\.3\.1:" --project=MigSmoke
 */

const TC = 'CRM-12370_5.3.1';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  s12: 'Step 12: Press "NEW QUOTATION" on the saved Deal Element to create the Quotation',
  s13: 'Step 13: Verify the field names and their order',
  verify: 'Verification',
} as const;

/**
 * The Quotation information area as PRE-PRODUCTION renders it, read top-left down and then
 * top-right down - the baseline this port asserts against. The technical fields Odoo keeps
 * hidden behind attrs are not part of it.
 */
const EXPECTED_FIELD_LABELS = [
  'Payer',
  'Invoice Address',
  'Delivery Address',
  'End User',
  'Distributor',
  'Distributor contact',
  'Reseller',
  'Reseller contact',
  'Distributor Discount (%)',
  'Reseller Discount (%)',
  'Send mail',
  'Validity',
  'Pricelist',
  'Payment Terms',
  'Online Payment',
  'Promotion',
  'PO',
];

/** REQUIREMENT #4c - the FAIL conclusion of an ordered-list check, built from the asserted values. */
function listDifference(expected: string[], actual: string[]): string {
  const parts: string[] = [];
  const extra = actual.filter((e) => !expected.includes(e));
  const missing = expected.filter((e) => !actual.includes(e));
  if (actual.length !== expected.length) parts.push(`count ${actual.length}, expected ${expected.length} (${actual.length > expected.length ? '+' : ''}${actual.length - expected.length})`);
  if (extra.length) parts.push(`not expected but shown: ${extra.map((e) => { const i = actual.indexOf(e); return `'${e}' (#${i + 1}${i > 0 ? `, after '${actual[i - 1]}'` : ''})`; }).join(', ')}`);
  if (missing.length) parts.push(`expected but missing: ${missing.map((e) => `'${e}'`).join(', ')}`);
  const shared = actual.filter((e) => expected.includes(e));
  const want = expected.filter((e) => actual.includes(e));
  const k = shared.findIndex((e, i) => e !== want[i]);
  parts.push(k < 0 ? 'the entries both lists share are in the expected order' : `order differs from '${want[k]}': expected it before '${shared[k]}'`);
  return extra.length || missing.length || k >= 0 || actual.length !== expected.length ? parts.join('; ') : 'none';
}

/** A numbered list wrapped for the evidence banner - one long line runs off the image (REQUIREMENT #3b). */
function bannerList(items: string[]): string[] {
  const out: string[] = [];
  let cur = '';
  items.forEach((t, i) => {
    const part = `${i + 1}. ${t}`;
    if (cur && `${cur}, ${part}`.length > 90) { out.push(`    ${cur},`); cur = part; } else cur = cur ? `${cur}, ${part}` : part;
  });
  if (cur) out.push(`    ${cur}`);
  return out;
}

const SKIP_CLEANUP_OPP = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken chain for hand-debugging - the 16:00 leftover-data check then reports it.

test.describe(`${TC} - Field names and order in the Quotation information area`, () => {

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - afterEach - start`).catch(() => {});
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
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - afterEach - teardown done`).catch(() => {});
  });

  // CLAUDE.md crm-mig rule: the afterAll sweep also removes what a dying test created but never
  // got to register. Opens its own session, so it costs one extra login per spec file.
  test.afterAll(async ({ browser }) => {
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_5.3.1');
  });

  test(`${TC}: Verify the field names and their order in the Quotation information area`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);

    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let labels: string[] = [];

    // The VERIFY block printed before the expect()s, so a failing check still reaches stdout.
    const CHECKS: Array<{ what: string; expected: string; actual: string; pass: boolean; difference: string }> = [];
    const record = (what: string, expected: unknown, actual: unknown, pass?: boolean) => {
      const expectedText = String(expected);
      const actualText = String(actual);
      const delta = Number(actualText) - Number(expectedText);
      CHECKS.push({
        what,
        expected: expectedText,
        actual: actualText,
        pass: pass === undefined ? expectedText === actualText : pass,
        // REQUIREMENT #4c - computed from the recorded values, never a cause
        difference: Number.isFinite(delta) && typeof expected === 'number'
          ? `expected ${expectedText}, got ${actualText} (${delta > 0 ? '+' : ''}${delta})`
          : `expected '${expectedText}', got '${actualText}'`,
      });
    };
    const printVerify = () => {
      console.log('==================== VERIFY ====================');
      CHECKS.forEach((c, i) => {
        console.log(`  Verify #${i + 1} - ${c.what}:`);
        console.log(`     Expected : ${c.expected}`);
        console.log(`     Actual   : ${c.actual}`);
        console.log(`     Result   : ${c.pass ? 'PASS' : 'FAIL'}`);
        if (!c.pass) console.log(`     Difference : ${c.difference}`);
      });
      console.log('===============================================');
      const passed = CHECKS.filter((c) => c.pass).length;
      console.log(passed === CHECKS.length
        ? `OVERALL: PASS - ${passed}/${CHECKS.length} checks matched`
        : `OVERALL: FAIL - ${passed}/${CHECKS.length} checks matched; field list: ${listDifference(EXPECTED_FIELD_LABELS, labels)}`);
    };

    // Manual steps 1-5 - the shared O12 CE setup (Step 1 .. Step 11, labelled by the helper).
    await loginToO12CE(page);
    await openOpportunitiesListOnO12CE(page);
    opp = await createOpportunityOnO12CE(page, TC);
    await addDealElementOnO12CE(page);

    await test.step(STEP.s12, async () => {
      console.log(`\n--- ${STEP.s12} ---`);
      quotation = await pressNewQuotationOnO12CE(page, { opportunityId: opp?.oppId });
      console.log(`  Quotation URL : ${page.url()}`);
      // O12 CE does not navigate on NEW QUOTATION - the helper looks the created Quotation up and
      // puts the form on it. Either route is fine; what this TC needs is to BE on the Quotation.
      const landed = quotation.landedOnQuotation;
      let __verifyPassed = false;
      try {
        expect(
          landed,
          'the Quotation raised by "NEW QUOTATION" must be open on screen before this TC can read it'
        ).toBeTruthy();
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - Quotation created`,
          passed: __verifyPassed,
          highlight: '.o_form_sheet',
          lines: [
            `${__verifyPassed ? 'PASS' : 'FAIL'} ${STEP.s12}`,
            '  expected: the Quotation raised by "NEW QUOTATION" is open on screen',
            `  actual  : ${landed ? 'the Quotation form is open' : 'NOT on the Quotation'}`,
            `            ${page.url()}`,
          ],
          corner: 'bottom-right',
        }).catch(() => {});
      }
    });

    await test.step(STEP.s13, async () => {
      console.log(`\n--- ${STEP.s13} ---`);
      labels = await quotationPage.getVisibleFieldLabels();
      console.log('  Labelled fields read back, in order :');
      labels.forEach((l, i) => console.log(`      #${i + 1} ${l}`));

      record('Number of labelled fields', EXPECTED_FIELD_LABELS.length, labels.length);
      EXPECTED_FIELD_LABELS.forEach((expected, i) => {
        record(`Field #${i + 1}`, expected, labels[i] === undefined ? '(missing)' : labels[i]);
      });
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log(`  Opportunity : id=${opp?.oppId} | Company="${opp?.companyValue}"`);
      printVerify();
      // the same verdict as the toEqual below: same length and every label equal, in order
      const listPassed = labels.length === EXPECTED_FIELD_LABELS.length && labels.every((l, i) => l === EXPECTED_FIELD_LABELS[i]);
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Quotation information area`,
        passed: listPassed,
        highlight: QuotationPage.verifyRow('quotation-info-label'), // every label getVisibleFieldLabels() read
        lines: [
          `${listPassed ? 'PASS' : 'FAIL'} ${STEP.s13}`,
          `  expected: ${EXPECTED_FIELD_LABELS.length} labelled fields, in this order:`,
          ...bannerList(EXPECTED_FIELD_LABELS),
          `  actual  : ${labels.length} labelled fields, in this order:`,
          ...bannerList(labels),
          ...(listPassed ? [] : [`  difference: ${listDifference(EXPECTED_FIELD_LABELS, labels)}`]),
        ],
        corner: 'bottom-right',
      }).catch(() => {});

      expect(labels, 'the information area must carry exactly the expected fields, in order').toEqual(
        EXPECTED_FIELD_LABELS
      );
    });
  });
});
