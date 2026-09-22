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
 * O12 CE Main-Business Smoke - Fields left empty on a new Quotation
 * =============================================================================
 * Test Case ID   : CRM-12370_1.5.28
 * Jira           : CRM-12325
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 *
 * Summary:
 *   Verify the six fields a plain Quotation never fills by itself - Distributor, Distributor
 *   contact, Reseller, Reseller contact, Promotion and PO - all come back empty.
 *
 * -----------------------------------------------------------------------------
 * Source manual TC (pre-production): TC.Performance.1.1.5.28 "Fields left empty on a new Quotation"
 * -----------------------------------------------------------------------------
 *   Pre-condition(s):
 *     - The O12 CE Migration server is reachable and the Admin account can log in
 *       (CRM-12325_1.1.1).
 *
 *   Steps to reproduce (the manual TC's 6 steps):
 *     1. Log in to the CRM.
 *     2. Open "CRM" and switch to the Opportunities list view.
 *     3. Create the Opportunity this test case owns:
 *          - Opp name    = TEST CRM-12370_1.5.28 <timestamp>
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
 *     6. Read the Distributor, Distributor contact, Reseller, Reseller contact, Promotion and PO fields of the created Quotation.
 *
 *   Verification:
 *     1. Distributor is empty.
 *     2. Distributor contact is empty.
 *     3. Reseller is empty.
 *     4. Reseller contact is empty.
 *     5. Promotion is empty.
 *     6. PO is empty.
 *
 *   Manual steps 1-5 are the shared O12 CE setup and are run by the suite helper
 *   (o12ce-main-business.helper), which expands them into Step 1 .. Step 11 plus Step 12
 *   below - the same grouping the 1.4.Deal_Element specs use. Manual step 6 is Step 13,
 *   mapped 1:1.
 *
 * -----------------------------------------------------------------------------
 * Baseline rule (CLAUDE.md): the assertions below are the PRE-PRODUCTION baseline, ported
 * unchanged. Where O12 CE behaves differently this spec stays RED - it is never adapted to
 * what O12 CE happens to do.
 * -----------------------------------------------------------------------------
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_1\.5\.28:" --project=MigSmoke
 */

const TC = 'CRM-12370_1.5.28';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  s12: 'Step 12: Press "NEW QUOTATION" on the saved Deal Element to create the Quotation',
  s13: 'Step 13: Verify the fields left empty',
  verify: 'Verification',
} as const;

/** The six labels that must be PRESENT on the form before "empty" can mean anything. */
const EXPECTED_LABELS = [
  'Distributor',
  'Distributor contact',
  'Reseller',
  'Reseller contact',
  'Promotion',
  'PO',
];

const SKIP_CLEANUP_OPP = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken chain for hand-debugging - the 16:00 leftover-data check then reports it.

test.describe(`${TC} - Fields left empty on a new Quotation`, () => {

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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_1.5.28');
  });

  test(`${TC}: Verify Distributor, Reseller, their contacts, Promotion and PO are empty on a Quotation created without them`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);

    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let distributor = '';
    let distributorContact = '';
    let reseller = '';
    let resellerContact = '';
    let promotion = '';
    let po = '';
    let labels: string[] = [];
    let missingLabels: string[] = [];

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
      // An ABSENT field reads back as an empty string exactly like an empty one, so a plain
      // "is it empty" check would go green on a form that does not carry these fields at all.
      // The labels are read first and their presence asserted, so a parity gap is reported as a
      // gap instead of passing as a default.
      labels = await quotationPage.getVisibleFieldLabels();
      missingLabels = EXPECTED_LABELS.filter((l) => !labels.includes(l));

      distributor = await quotationPage.getFieldPartnerName('distributor_id');
      distributorContact = await quotationPage.getFieldPartnerName('distributor_contact_id');
      reseller = await quotationPage.getFieldPartnerName('reseller_id');
      resellerContact = await quotationPage.getFieldPartnerName('reseller_contact_id');
      promotion = await quotationPage.getFieldDisplayValue('promotion_id');
      po = await quotationPage.getFieldDisplayValue('partner_purchase_order');

      console.log(`  Labels present on the form : ${labels.join(' | ')}`);
      console.log(`  Labels this TC needs       : ${EXPECTED_LABELS.join(' | ')}`);
      console.log(`  MISSING from the form      : ${missingLabels.join(' | ') || '(none)'}`);
      console.log('  Fields that must come back empty :');
      console.log(`      - Distributor         : ${distributor || '(empty)'}`);
      console.log(`      - Distributor contact : ${distributorContact || '(empty)'}`);
      console.log(`      - Reseller            : ${reseller || '(empty)'}`);
      console.log(`      - Reseller contact    : ${resellerContact || '(empty)'}`);
      console.log(`      - Promotion           : ${promotion || '(empty)'}`);
      console.log(`      - PO                  : ${po || '(empty)'}`);

      record('All six fields are present on the form', EXPECTED_LABELS.join(' | '),
        missingLabels.length === 0 ? 'all present' : `MISSING: ${missingLabels.join(' | ')}`,
        missingLabels.length === 0);
      record('Distributor', '(empty)', distributor === '' ? '(empty)' : distributor);
      record('Distributor contact', '(empty)', distributorContact === '' ? '(empty)' : distributorContact);
      record('Reseller', '(empty)', reseller === '' ? '(empty)' : reseller);
      record('Reseller contact', '(empty)', resellerContact === '' ? '(empty)' : resellerContact);
      record('Promotion', '(empty)', promotion === '' ? '(empty)' : promotion);
      record('PO', '(empty)', po === '' ? '(empty)' : po);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log(`  Opportunity : id=${opp?.oppId} | Company="${opp?.companyValue}"`);
      printVerify();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Quotation empty fields`);

      expect(
        missingLabels,
        `these fields must EXIST on the Quotation before "they are empty" means anything - missing on this form: ${missingLabels.join(' | ') || 'none'}`
      ).toEqual([]);
      expect(distributor, 'Distributor must be empty on a new Quotation').toBe('');
      expect(distributorContact, 'Distributor contact must be empty on a new Quotation').toBe('');
      expect(reseller, 'Reseller must be empty on a new Quotation').toBe('');
      expect(resellerContact, 'Reseller contact must be empty on a new Quotation').toBe('');
      expect(promotion, 'Promotion must be empty on a new Quotation').toBe('');
      expect(po, 'PO must be empty on a new Quotation').toBe('');
    });
  });
});
