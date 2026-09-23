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
 * O12 CE Main-Business Smoke - Summary log note of the Quotation
 * =============================================================================
 * Test Case ID   : CRM-12370_5.6.2
 * Jira           : CRM-12325
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 *
 * Summary:
 *   Verify the summary log note of the Quotation repeats, field by field, the Payer, End User,
 *   Salesperson, Status and Total the Quotation form itself carries.
 *
 * -----------------------------------------------------------------------------
 * Source manual TC (pre-production): TC.Performance.1.1.5.34 "Summary log note of the Quotation"
 * -----------------------------------------------------------------------------
 *   Pre-condition(s):
 *     - The O12 CE Migration server is reachable and the Admin account can log in
 *       (CRM-12325_1.1.1).
 *
 *   Steps to reproduce (the manual TC's 6 steps):
 *     1. Log in to the CRM.
 *     2. Open "CRM" and switch to the Opportunities list view.
 *     3. Create the Opportunity this test case owns:
 *          - Opp name    = TEST CRM-12370_5.6.2 <timestamp>
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
 *     6. Read the summary log note of the Quotation and compare it to the form.
 *
 *   Verification:
 *     1. The summary log note is posted.
 *     2. Its Payer matches the Payer on the form.
 *     3. Its End User matches the End User on the form.
 *     4. Its Salesperson matches the Salesperson on the form.
 *     5. Its Status reads Quotation.
 *     6. Its Total matches the Total on the form.
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
 *   npx playwright test --grep "CRM-12370_5\.6\.2:" --project=MigSmoke
 */

const TC = 'CRM-12370_5.6.2';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  s12: 'Step 12: Press "NEW QUOTATION" on the saved Deal Element to create the Quotation',
  s13: 'Step 13: Verify the summary log note',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP_OPP = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken chain for hand-debugging - the 16:00 leftover-data check then reports it.

test.describe(`${TC} - Summary log note of the Quotation`, () => {

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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_5.6.2');
  });

  test(`${TC}: Verify the Log note summary reports the Payer, End User, Salesperson, Status and Total`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);

    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let payer = '';
    let endUser = '';
    let salesperson = '';
    let total = 0;
    let note: string | null = null;
    let fields: Record<string, string> = {};
    let notedTotal = 0;

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
      let __verifyPassed = false;
      try {
        expect(
          quotation.landedOnQuotation,
          'the Quotation raised by "NEW QUOTATION" must be open on screen before this TC can read it'
        ).toBeTruthy();
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - Quotation created`, passed: __verifyPassed }).catch(() => {});
      }
    });

    await test.step(STEP.s13, async () => {
      console.log(`\n--- ${STEP.s13} ---`);
      payer = await quotationPage.getFieldPartnerName('partner_id');
      endUser = await quotationPage.getFieldPartnerName('partner_end_user_id');
      salesperson = await quotationPage.getSalespersonName();
      total = await quotationPage.getQuotationTotal();

      note = await quotationPage.waitForChatterMessage(/Payer:/i);
      console.log(`  - Summary log note: ${note ? note.replace(/\n/g, ' | ') : '(not found)'}`);
      fields = note ? quotationPage.parseLogNoteFields(note) : {};
      notedTotal = parseFloat((fields['Total'] || '').replace(/,/g, '')) || 0;

      console.log('  Form values vs the log note :');
      console.log(`      - Payer       : form="${payer}" | note="${fields['Payer'] || '(missing)'}"`);
      console.log(`      - End User    : form="${endUser}" | note="${fields['End User'] || '(missing)'}"`);
      console.log(`      - Salesperson : form="${salesperson}" | note="${fields['Salesperson'] || '(missing)'}"`);
      console.log(`      - Status      : note="${fields['Status'] || '(missing)'}"`);
      console.log(`      - Total       : form=${total} | note=${notedTotal}`);

      record('Summary log note posted', 'present', note ? 'present' : '(not found)', note !== null);
      record('Log note Payer', payer, fields['Payer'] || '(missing)');
      record('Log note End User', endUser, fields['End User'] || '(missing)');
      record('Log note Salesperson', salesperson, fields['Salesperson'] || '(missing)');
      record('Log note Status', 'Quotation', fields['Status'] || '(missing)');
      record('Log note Total', total, notedTotal, Math.abs(notedTotal - total) < 0.01);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log(`  Opportunity : id=${opp?.oppId} | Company="${opp?.companyValue}"`);
      printVerify();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Quotation summary log note`);

      expect(note, 'the Quotation must carry the summary log note').not.toBeNull();
      expect(fields['Payer'], 'the log note must report the Payer of the Quotation').toBe(payer);
      expect(fields['End User'], 'the log note must report the End User of the Quotation').toBe(endUser);
      expect(fields['Salesperson'], 'the log note must report the Salesperson of the Quotation').toBe(salesperson);
      expect(fields['Status'], 'the log note must report the Quotation status').toBe('Quotation');
      expect(notedTotal, 'the log note must report the Total of the Quotation').toBeCloseTo(total, 2);
    });
  });
});
