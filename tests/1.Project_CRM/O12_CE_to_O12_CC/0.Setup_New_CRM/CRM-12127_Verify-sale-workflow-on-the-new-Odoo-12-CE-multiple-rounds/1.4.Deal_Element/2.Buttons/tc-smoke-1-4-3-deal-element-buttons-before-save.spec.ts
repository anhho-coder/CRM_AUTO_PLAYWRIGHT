import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users } from '@config/users.config';
import { DealElementPage, OpportunityPage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  addDealElementOnO12CE,
  registerMigRecordFromUrl,
  O12CE_DATA,
  O12ceOpportunity,
  teardownMigRecords,
  sweepMigLeftoversAfterAll,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Buttons of an unsaved Deal Element
 * Test Case ID: CRM-12370_1.4.3
 * Automation-Type: new
 * Automation-Date: 2026-09-17
 *
 * Summary:
 *   Verify that a Deal Element opened from the Opportunity offers exactly the SAVE and DISCARD
 *   control-panel buttons, and that its form header carries the New quotation button only.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.4.3 "Deal Element buttons before SAVE".
 *
 * O12 CE notes (grounded on crm-mig over XML-RPC, 2026-09-17):
 *   - The Deal Element form on O12 CE is the dedicated view `sale.order.deal.element.view.form`
 *     (id 2140, `create="false" delete="false"`) - the same view pre-production renders.
 *   - EXPECTED RED - O12 CE renders the buttons in a different case: the header action is
 *     "New quotation" against pre-production's "NEW QUOTATION", the unsaved control panel is
 *     "Save"/"Discard" against "SAVE"/"DISCARD", and a saved record adds a "Print" dropdown
 *     pre-production does not show. This spec keeps the PRE-PRODUCTION captions and is
 *     EXPECTED TO FAIL on O12 CE (observed in run 2026-09-17-184002).
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the Admin account can log in (CRM-12325_1.1.1).
 *
 * Steps:
 *   1. Use the account of Admin to login successful.
 *   2. Open "CRM" and switch to the Opportunities list view.
 *   3. On the "Opp" page, click at "CREATE" button.
 *   4. Enter the opportunity information (Country = United States, State = Connecticut, Sales Team and
 *      Salesperson cleared, "Create manually" FALSE).
 *   5. Click at "CRM Developer" tab at the bottom of page (Lead form = License).
 *   6. Press "SAVE" button.
 *   7. Refresh page to see the "Contact" field is entered.
 *   8. Create "DEAL ELEMENT" - press the "DEAL ELEMENT" button.
 *   9. Read the control-panel buttons and the form header buttons of the unsaved Deal Element.
 *
 * Verification Points:
 *   1. The control panel of the unsaved Deal Element carries exactly SAVE and DISCARD, in that order.
 *   2. The form header carries exactly one button, reading "NEW QUOTATION".
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.4\.3:" --project=MigSmoke
 */

const TC = 'CRM-12370_1.4.3';

// PRE-PRODUCTION BASELINE. O12 CE actually renders "New quotation" - kept deliberately so the
// difference fails the test instead of being absorbed by it.
const HEADER_BUTTON = 'NEW QUOTATION';

const SKIP_CLEANUP_OPP = process.env.SKIP_CLEANUP_OPP === 'true'; // default false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken chain for hand-debugging - the 16:00 leftover-data check then reports it.

test.describe(`${TC} - Buttons before SAVE`, () => {

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

  // CLAUDE.md crm-mig rule: the afterAll sweep also removes what a dying test created but never
  // got to register. Opens its own session, so it costs one extra login per spec file.
  test.afterAll(async ({ browser }) => {
    if (SKIP_CLEANUP_OPP) {
      console.log('[mig-sweep] SKIPPED by SKIP_CLEANUP_OPP=true - records KEPT on O12 CE for hand-inspection.');
      return;
    }
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_1.4.3');
  });

  test('CRM-12370_1.4.3: Verify the buttons offered by a Deal Element that has not been saved yet', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const dealElementPage = new DealElementPage(page);
    const opportunityPage = new OpportunityPage(page);

    let opp: O12ceOpportunity | null = null;
    let dealElementUrl = '';

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

    await loginToO12CE(page);
    await openOpportunitiesListOnO12CE(page);
    opp = await createOpportunityOnO12CE(page, TC);
    const oppCompany = opp.companyValue;

    await test.step('Step 8: Create "DEAL ELEMENT" - press the "DEAL ELEMENT" button', async () => {
      console.log('\n--- Step 8: Open the Deal Element (NOT saved - the buttons are read on the new form) ---');
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      await dealElementPage.waitForAutoPopulate();
      console.log('  OK - Deal Element (sale.order) form opened, still unsaved');
    });

    await test.step('Verification', async () => {
      const controlPanelButtons = await dealElementPage.getControlPanelButtons();
      const headerButtons = await dealElementPage.getStatusbarButtons();

      record('Control panel button count', 2, controlPanelButtons.length);
      record('Control panel buttons, in order', 'SAVE | DISCARD', controlPanelButtons.join(' | '));
      record('Form header button count', 1, headerButtons.length);
      record('Form header buttons, in order', HEADER_BUTTON, headerButtons.join(' | '));
      printVerify();

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Buttons of the unsaved Deal Element`);

      expect(controlPanelButtons, 'an unsaved Deal Element offers SAVE and DISCARD only').toEqual([
        'SAVE',
        'DISCARD',
      ]);
      expect(headerButtons, `the Deal Element header offers "${HEADER_BUTTON}" only`).toEqual([
        HEADER_BUTTON,
      ]);
    });
  });
});
