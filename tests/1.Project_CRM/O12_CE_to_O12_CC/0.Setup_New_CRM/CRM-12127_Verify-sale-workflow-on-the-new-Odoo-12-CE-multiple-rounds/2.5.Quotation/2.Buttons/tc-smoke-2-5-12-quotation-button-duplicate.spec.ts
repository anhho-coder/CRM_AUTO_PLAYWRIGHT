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
  registerMigRecordFromUrl,
} from '@helpers/o12ce-main-business.helper';

/**
 * =============================================================================
 * O12 CE Main-Business Smoke - Duplicate button on the Quotation
 * =============================================================================
 * Test Case ID   : CRM-12325_2.5.12
 * Jira           : CRM-12325
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 *
 * Summary:
 *   Verify Duplicate opens a NEW sale.order record that carries its own SO number, the Payer of
 *   the source Quotation and the QUOTATION stage.
 *
 * -----------------------------------------------------------------------------
 * Source manual TC (pre-production): TC.Performance.1.1.5.12 "Duplicate button on the Quotation"
 * -----------------------------------------------------------------------------
 *   Pre-condition(s):
 *     - The O12 CE Migration server is reachable and the Admin account can log in
 *       (CRM-12325_1.1.1).
 *
 *   Steps to reproduce (the manual TC's 6 steps):
 *     1. Log in to the CRM.
 *     2. Open "CRM" and switch to the Opportunities list view.
 *     3. Create the Opportunity this test case owns:
 *          - Opp name    = TEST CRM-12325_2.5.12 <timestamp>
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
 *     6. Press "Duplicate" and read the copy it opens.
 *
 *   Verification:
 *     1. Duplicate lands on a different record than the source.
 *     2. The copy carries its own Quotation number.
 *     3. The copy carries the Payer of the source Quotation.
 *     4. The copy is on the QUOTATION stage.
 *     5. Duplicate raises no Odoo error dialog.
 *
 *   Manual steps 1-5 are the shared O12 CE setup and are run by the suite helper
 *   (o12ce-main-business.helper), which expands them into Step 1 .. Step 11 plus Step 12
 *   below - the same grouping the 2.4.Deal_Element specs use. Manual step 6 is Step 13,
 *   mapped 1:1.
 *
 * -----------------------------------------------------------------------------
 * Baseline rule (CLAUDE.md): the assertions below are the PRE-PRODUCTION baseline, ported
 * unchanged. Where O12 CE behaves differently this spec stays RED - it is never adapted to
 * what O12 CE happens to do.
 * -----------------------------------------------------------------------------
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.5\.12:" --project=MigSmoke
 */

const TC = 'CRM-12325_2.5.12';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  s12: 'Step 12: Press "NEW QUOTATION" on the saved Deal Element to create the Quotation',
  s13: 'Step 13: Press Duplicate and verify the copy',
  verify: 'Verification',
} as const;

/** The stage a freshly created / duplicated Quotation sits on. */
const EXPECTED_STAGE = 'QUOTATION';

const SKIP_CLEANUP_OPP = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken chain for hand-debugging - the 16:00 leftover-data check then reports it.

test.describe(`${TC} - Duplicate button on the Quotation`, () => {

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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12325_2.5.12');
  });

  test(`${TC}: Verify the Duplicate button creates a copy of the Quotation`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);

    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let sourceNumber = '';
    let sourcePayer = '';
    let copyNumber = '';
    let copyPayer = '';
    let copyStage = '';
    let dupNavigated = false;
    let dupSourceId = '';
    let dupNewId = '';
    let dupPopup = '';

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
      sourceNumber = await quotationPage.getSalesOrderNumber();
      sourcePayer = await quotationPage.getPayerName();

      const duplicate = await quotationPage.clickDuplicateQuotation();
      dupNavigated = duplicate.navigated;
      dupSourceId = duplicate.sourceRecordId;
      dupNewId = duplicate.newRecordId;
      dupPopup = duplicate.popupText;

      // The copy is a record THIS run created - it has to be torn down with the rest of the chain.
      registerMigRecordFromUrl(page.url(), `Quotation copy ${TC}`, 'sale.order');

      copyNumber = await quotationPage.getSalesOrderNumber();
      copyPayer = await quotationPage.getPayerName();
      copyStage = await quotationPage.getActiveStatusBarStage();

      console.log(`  Source Quotation number : ${sourceNumber}`);
      console.log(`  Source Payer            : ${sourcePayer}`);
      console.log(`  Source record id        : ${dupSourceId}`);
      console.log(`  Copy record id          : ${dupNewId}`);
      console.log(`  Copy Quotation number   : ${copyNumber}`);
      console.log(`  Copy Payer              : ${copyPayer}`);
      console.log(`  Copy stage              : ${copyStage}`);
      console.log(`  Copy URL                : ${page.url()}`);

      record('Landed on a different record', 'true', String(dupNavigated));
      record('Copy record id differs from the source', `not ${dupSourceId}`, dupNewId,
        dupNewId !== '' && dupNewId !== dupSourceId);
      record('Copy carries its own Quotation number', 'a SO number', copyNumber, /^SO\d+/.test(copyNumber));
      record('Copy Payer', sourcePayer, copyPayer);
      record('Copy stage', EXPECTED_STAGE, copyStage);
      record('Backend popup', '(none)', dupPopup === '' ? '(none)' : dupPopup);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log(`  Opportunity : id=${opp?.oppId} | Company="${opp?.companyValue}"`);
      printVerify();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Quotation copy`);

      expect(dupNavigated, 'Duplicate must open the copy').toBe(true);
      expect(dupNewId, 'the copy must be a different record').not.toBe(dupSourceId);
      expect(copyNumber, 'the copy must carry its own Quotation number').toMatch(/^SO\d+/);
      expect(copyPayer, 'the copy must carry the Payer of the source Quotation').toBe(sourcePayer);
      expect(copyStage, 'the copy must be a Quotation, not a Sale Order').toBe(EXPECTED_STAGE);
      expect(dupPopup, 'Duplicate must not raise an Odoo error dialog').toBe('');
    });
  });
});
