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
 * O12 CE Main-Business Smoke - SEND BY EMAIL button on the Quotation
 * =============================================================================
 * Test Case ID   : CRM-12370_5.2.5
 * Jira           : CRM-12325
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 *
 * Summary:
 *   Verify SEND BY EMAIL opens the mail composer already addressed to the Payer with the
 *   Quotation number in the subject, and that cancelling it leaves the stage untouched.
 *
 * -----------------------------------------------------------------------------
 * Source manual TC (pre-production): TC.Performance.1.1.5.10 "SEND BY EMAIL button on the Quotation"
 * -----------------------------------------------------------------------------
 *   Pre-condition(s):
 *     - The O12 CE Migration server is reachable and the Admin account can log in
 *       (CRM-12325_1.1.1).
 *
 *   Steps to reproduce (the manual TC's 6 steps):
 *     1. Log in to the CRM.
 *     2. Open "CRM" and switch to the Opportunities list view.
 *     3. Create the Opportunity this test case owns:
 *          - Opp name    = TEST CRM-12370_5.2.5 <timestamp>
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
 *     6. Press "SEND BY EMAIL", read the composer recipients and subject, then Cancel it.
 *
 *   Verification:
 *     1. The composer proposes at least one recipient and one of them is the Payer.
 *     2. The composer subject carries the Quotation number.
 *     3. Cancel closes the composer.
 *     4. The Quotation is still on the QUOTATION stage after Cancel.
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
 *   npx playwright test --grep "CRM-12370_5\.2\.5:" --project=MigSmoke
 */

const TC = 'CRM-12370_5.2.5';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  s12: 'Step 12: Press "NEW QUOTATION" on the saved Deal Element to create the Quotation',
  s13: 'Step 13: Press SEND BY EMAIL and verify the composer',
  verify: 'Verification',
} as const;

/** The stage a Quotation sits on until it is sent / confirmed. */
const EXPECTED_STAGE = 'QUOTATION';

const SKIP_CLEANUP_OPP = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken chain for hand-debugging - the 16:00 leftover-data check then reports it.

test.describe(`${TC} - SEND BY EMAIL button on the Quotation`, () => {

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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_5.2.5');
  });

  test(`${TC}: Verify the SEND BY EMAIL button opens the mail composer addressed to the Payer`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);

    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let soNumber = '';
    let payer = '';
    let recipients: string[] = [];
    let subject = '';
    let closed = false;
    let stageAfter = '';

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
      soNumber = await quotationPage.getSalesOrderNumber();
      payer = await quotationPage.getPayerName();

      await quotationPage.clickSendByEmail();
      await quotationPage.waitForEmailDialog();
      recipients = await quotationPage.getEmailRecipients();
      subject = await quotationPage.getEmailSubject();
      closed = await quotationPage.cancelEmailDialog();
      stageAfter = await quotationPage.getActiveStatusBarStage();

      console.log(`  Quotation number : ${soNumber}`);
      console.log(`  Payer            : ${payer}`);
      console.log(`  Recipients       : ${recipients.join(' | ') || '(none)'}`);
      console.log(`  Subject          : ${subject || '(empty)'}`);
      console.log(`  Composer closed  : ${closed}`);
      console.log(`  Stage after      : ${stageAfter}`);

      record('Composer recipients contain the Payer', payer, recipients.join(' | ') || '(none)',
        recipients.some((r) => r.includes(payer) || payer.includes(r)));
      record('Composer subject carries the Quotation number', soNumber,
        subject.includes(soNumber) ? subject : subject || '(empty)', subject.includes(soNumber));
      record('Composer closed by Cancel', 'true', String(closed));
      record('Stage after Cancel', EXPECTED_STAGE, stageAfter);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log(`  Opportunity : id=${opp?.oppId} | Company="${opp?.companyValue}"`);
      printVerify();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Quotation mail composer`);

      expect(recipients.length, 'the composer must propose at least one recipient').toBeGreaterThan(0);
      expect(
        recipients.some((r) => r.includes(payer) || payer.includes(r)),
        `the composer must propose the Payer "${payer}" - proposed: ${recipients.join(' | ')}`
      ).toBe(true);
      expect(subject, 'the subject must carry the Quotation number').toContain(soNumber);
      expect(closed, 'Cancel must close the composer').toBe(true);
      expect(stageAfter, 'cancelling the composer must not move the Quotation on').toBe(EXPECTED_STAGE);
    });
  });
});
