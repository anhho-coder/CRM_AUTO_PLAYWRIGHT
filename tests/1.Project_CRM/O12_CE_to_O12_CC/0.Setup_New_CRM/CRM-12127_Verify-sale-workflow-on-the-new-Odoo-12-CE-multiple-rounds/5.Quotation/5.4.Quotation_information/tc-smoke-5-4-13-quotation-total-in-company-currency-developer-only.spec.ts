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
import { baseUrl_mig } from '@config/users.config';

/**
 * =============================================================================
 * O12 CE Main-Business Smoke - Total in Company Currency is a developer-only field
 * =============================================================================
 * Test Case ID   : CRM-12370_5.4.13
 * Jira           : CRM-12325
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 *
 * Summary:
 *   "Total in Company Currency" must be hidden from a normal session and appear at position 11
 *   of the Quotation information area once Odoo developer (debug) mode is on.
 *
 * -----------------------------------------------------------------------------
 * Source manual TC (pre-production): TC.Performance.1.1.5.37 "Total in Company Currency is a developer-only field"
 * -----------------------------------------------------------------------------
 *   Pre-condition(s):
 *     - The O12 CE Migration server is reachable and the Admin account can log in
 *       (CRM-12325_1.1.1).
 *
 *   Steps to reproduce (the manual TC's 6 steps):
 *     1. Log in to the CRM.
 *     2. Open "CRM" and switch to the Opportunities list view.
 *     3. Create the Opportunity this test case owns:
 *          - Opp name    = TEST CRM-12370_5.4.13 <timestamp>
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
 *     6. Read the field labels in a normal session, then reopen the same record with developer mode on and read them again.
 *
 *   Verification:
 *     1. A normal session shows the 17 fields and NOT "Total in Company Currency".
 *     2. Developer mode adds "Total in Company Currency" at position 11, for 18 fields in total.
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
 * O12 CE notes:
 *   - This TC deliberately turns Odoo developer (?debug) mode on. A debug session renders fields a
 *   - normal session never shows - that difference is the point of the TC, and the normal-session
 *   - read above it is what guards against reading the debug view as the real one.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_5\.4\.13:" --project=MigSmoke
 */

const TC = 'CRM-12370_5.4.13';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  s12: 'Step 12: Press "NEW QUOTATION" on the saved Deal Element to create the Quotation',
  s13: 'Step 13: Verify the field is developer-only',
  verify: 'Verification',
} as const;

/** The developer-only field of the Quotation information area. */
const DEVELOPER_ONLY_FIELD = 'Total in Company Currency';

/** What a NORMAL session shows - see CRM-12370_5.3.1. */
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

/** What the SAME record shows once Odoo developer (debug) mode is on. */
const EXPECTED_FIELD_LABELS_DEBUG = [
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
  'Total in Company Currency',
  'Send mail',
  'Validity',
  'Pricelist',
  'Payment Terms',
  'Online Payment',
  'Promotion',
  'PO',
];

const SKIP_CLEANUP_OPP = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken chain for hand-debugging - the 16:00 leftover-data check then reports it.

test.describe(`${TC} - Total in Company Currency is a developer-only field`, () => {

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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_5.4.13');
  });

  test(`${TC}: Verify Total in Company Currency is a developer-only field on the Quotation`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);

    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let normalLabels: string[] = [];
    let debugLabels: string[] = [];

    // The VERIFY block printed before the expect()s, so a failing check still reaches stdout.
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
      expect(
        quotation.landedOnQuotation,
        'the Quotation raised by "NEW QUOTATION" must be open on screen before this TC can read it'
      ).toBeTruthy();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Quotation created`);
    });

    await test.step(STEP.s13, async () => {
      console.log(`\n--- ${STEP.s13} ---`);
      normalLabels = await quotationPage.getVisibleFieldLabels();
      console.log('  Fields in a NORMAL session :');
      normalLabels.forEach((l, i) => console.log(`      #${i + 1} ${l}`));

      await quotationPage.reopenCurrentRecordInDebugMode(baseUrl_mig);
      debugLabels = await quotationPage.getVisibleFieldLabels();
      console.log('  Fields with DEBUG mode ON  :');
      debugLabels.forEach((l, i) => console.log(`      #${i + 1} ${l}`));

      record('Field count in a normal session', EXPECTED_FIELD_LABELS.length, normalLabels.length);
      record('"Total in Company Currency" in a normal session', 'absent',
        normalLabels.includes(DEVELOPER_ONLY_FIELD) ? 'present' : 'absent');
      record('Field count with debug mode ON', EXPECTED_FIELD_LABELS_DEBUG.length, debugLabels.length);
      record('Fields with debug mode ON, in order', EXPECTED_FIELD_LABELS_DEBUG.join(' | '), debugLabels.join(' | '));
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log(`  Opportunity : id=${opp?.oppId} | Company="${opp?.companyValue}"`);
      printVerify();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Quotation information area in developer mode`);

      expect(normalLabels, 'a normal session must show the 17 fields of the Quotation').toEqual(
        EXPECTED_FIELD_LABELS
      );
      expect(
        normalLabels.includes(DEVELOPER_ONLY_FIELD),
        '"Total in Company Currency" must not be shown to a normal user'
      ).toBe(false);
      expect(debugLabels, 'debug mode must add "Total in Company Currency" at position 11').toEqual(
        EXPECTED_FIELD_LABELS_DEBUG
      );
    });
  });
});
