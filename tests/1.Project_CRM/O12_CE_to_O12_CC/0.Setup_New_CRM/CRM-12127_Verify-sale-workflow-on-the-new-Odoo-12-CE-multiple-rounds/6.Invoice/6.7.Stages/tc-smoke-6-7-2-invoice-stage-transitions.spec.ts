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
 * O12 CE Main-Business Smoke - Invoice stages - transitions
 * Test Case ID: CRM-12370_6.7.2
 * Automation-Type: ported
 * Automation-Date: 2026-09-22
 *
 * Summary:
 *   Verify a newly created Invoice sits on the first stage of the statusbar, that VALIDATE moves it
 *   to OPEN, and that CANCEL puts it on a CANCELLED stage the bar does not offer until then.
 *
 * Source manual TC (pre-production): TC.Performance.6.7.2 "Invoice stages - The stage a newly
 * created Invoice sits on and the stages it moves through".
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
 *   - Odoo does NOT re-render the statusbar after a state action - the reload-and-retry pattern
 *     (waitForActiveStage) is preserved from pre-prod.
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the sales IC account Thomas Semerich can log in.
 *
 * Steps (1-14 = the shared Opportunity + Deal Element chain):
 *   1-14. Login, create Opportunity, Deal Element, Quotation, Sales Order, and Invoice.
 *
 * Steps run:
 *  15. Read the active stage of the newly created Invoice.
 *  16. Press the "VALIDATE" button and read the active stage again.
 *  17. Press the "CANCEL" button, reload the form and read the active stage and the stage list.
 *
 * Verification:
 *   - On creation the active stage is DRAFT, the first stage of the statusbar.
 *   - After VALIDATE the active stage is OPEN.
 *   - After CANCEL the active stage is CANCELLED.
 *   - CANCELLED is not among the stages offered before the Invoice is cancelled.
 *
 * crm-mig house rule: this spec CREATES data and removes it in teardown.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_6\\.7\\.2:" --project=chromium
 */

const SKIP_CLEANUP_OPP = false;

const STEP = {
  chain: 'Steps 1-14: Login, create Opportunity, Deal Element, Quotation, Sales Order, and Invoice',
  read: 'Step 15: Read the active stage on creation',
  validate: 'Step 16: Press VALIDATE and read the active stage',
  cancel: 'Step 17: Press CANCEL and read the active stage and stage list',
  verify: 'Verification: Stage transitions are correct',
} as const;

test.describe('CRM-12370_6.7.2 - O12 CE smoke: Invoice stages - transitions', () => {

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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_6.7.2');
  });

  test('CRM-12370_6.7.2: Verify the stage a newly created Invoice sits on and the stages it moves through', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const TC_ID = 'CRM-12370_6.7.2';
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

    let stagesOnCreation: string[] = [];
    let stageOnCreation = '';

    await test.step(STEP.read, async () => {
      console.log(`\n--- ${STEP.read} ---`);
      stagesOnCreation = await invoicePage.getStatusBarStages();
      stageOnCreation = await invoicePage.getActiveStatusBarStage();
      console.log(`  - On creation: active="${stageOnCreation}" stages="${stagesOnCreation.join(' | ')}"`);

      record('Active stage on creation', 'DRAFT', stageOnCreation);
      record('It is the FIRST stage of the statusbar', stagesOnCreation[0] || '(none)', stageOnCreation);
      record('CANCELLED is not offered before the Invoice is cancelled', 'absent',
        stagesOnCreation.includes('CANCELLED') ? 'present' : 'absent');
    });

    let stageAfterValidate = '';

    await test.step(STEP.validate, async () => {
      console.log(`\n--- ${STEP.validate} ---`);
      await invoicePage.clickStatusbarButtonByName('action_invoice_open', CommonUtils.waitTimes.pageLoad);
      await invoicePage.waitForInvoiceStatus('Open').catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      stageAfterValidate = await invoicePage.getActiveStatusBarStage();
      console.log(`  - After VALIDATE: active="${stageAfterValidate}"`);

      record('Active stage after VALIDATE', 'OPEN', stageAfterValidate);
    });

    let stageAfterCancel = '';
    let stagesAfterCancel: string[] = [];

    await test.step(STEP.cancel, async () => {
      console.log(`\n--- ${STEP.cancel} ---`);
      await invoicePage.clickCancelInvoice();
      // Odoo 12 leaves the statusbar and the header buttons showing the PREVIOUS state after
      // the action returns, so the screen is polled (reloading between passes) until the stage
      // the product moved to is actually on it. A fixed wait reads the old render and fails a
      // flow that worked; the assertions below are unchanged, only the moment of the read is.
      await invoicePage.waitForActiveStage('CANCELLED');
      stageAfterCancel = await invoicePage.getActiveStatusBarStage();
      stagesAfterCancel = await invoicePage.getStatusBarStages();
      console.log(`  - After CANCEL: active="${stageAfterCancel}" stages="${stagesAfterCancel.join(' | ')}"`);

      record('Active stage after CANCEL', 'CANCELLED', stageAfterCancel);
      record('CANCELLED joins the statusbar once the Invoice is cancelled', 'present',
        stagesAfterCancel.includes('CANCELLED') ? 'present' : 'absent');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerify();

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Invoice stage transitions`);

      expect(stageOnCreation, 'a newly created Invoice must sit on DRAFT').toBe('DRAFT');
      expect(stageOnCreation, 'DRAFT must be the first stage of the statusbar').toBe(stagesOnCreation[0]);
      expect(stagesOnCreation, 'CANCELLED must not be offered before the Invoice is cancelled').not.toContain('CANCELLED');
      expect(stageAfterValidate, 'VALIDATE must move the Invoice to OPEN').toBe('OPEN');
      expect(stageAfterCancel, 'CANCEL must move the Invoice to CANCELLED').toBe('CANCELLED');
      expect(stagesAfterCancel, 'CANCELLED must join the statusbar once the Invoice is cancelled').toContain('CANCELLED');
    });
  });
});
