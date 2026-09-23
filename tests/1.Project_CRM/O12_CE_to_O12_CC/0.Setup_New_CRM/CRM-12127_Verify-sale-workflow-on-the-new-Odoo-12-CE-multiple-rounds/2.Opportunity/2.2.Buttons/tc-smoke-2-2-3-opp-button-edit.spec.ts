import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { OpportunityPage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  O12ceOpportunity,
  teardownMigRecords,
  sweepMigLeftoversAfterAll,
} from '@helpers/o12ce-main-business.helper';

/**
 * =============================================================================================
 *  O12 CE Migration - Opportunity screen verification - Buttons
 * =============================================================================================
 *  Test Case ID    : CRM-12370_2.2.3
 *  Automation-Type : new
 *  Automation-Date : 2026-09-23
 *  Feature folder  : .../CRM-12127_.../2.Opportunity/2.2.Buttons
 *  Source manual TC: TC.Performance.1.1.2.5 (pre-production baseline, 37/37 PASS 2026-09-21)
 *
 *  Summary
 *  ---------------------------------------------------------------------------------------------
 *  Creates its own Opportunity on the O12 CE Migration server (crm-mig) and asserts that
 *  a saved Opportunity opens in READ mode, and pressing EDIT switches the form to EDIT mode
 *  and swaps the control panel to SAVE | DISCARD.
 *
 *  Command to run
 *  ---------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_2\\.2\\.3:" --project=MigSmoke
 *
 *  Source manual TC
 *  ---------------------------------------------------------------------------------------------
 *  Pre-condition(s):
 *    1. The O12 CE Migration server is reachable and `admin_crm_mig` can log in
 *    2. Each run uses its own token (a timestamp) so the Opportunity it creates can be found again
 *
 *  Steps to reproduce:
 *    1-3. [GROUPED SETUP - shared helper `o12ce-main-business.helper`] Log in; open CRM > Pipeline
 *         (list view); CREATE and fill the Opportunity form; SAVE; wait for the async Company /
 *         Contact creation. The helper prints these as its own chain banners "Step 1" - "Step 7".
 *           - Opportunity     = TEST CRM-12370_2.2.3 <unique>
 *           - Contact Name    = TEST CRM-12370_2.2.3 <unique>
 *           - Email           = Test@company<unique>.com
 *           - Country         = United States
 *           - State           = Connecticut
 *           - Sales Team      = cleared
 *           - Salesperson     = cleared
 *           - Lead Form (CRM Developer tab) = License
 *    4.   Press the EDIT button of the saved Opportunity  -> spec label "Step 8"
 *    5.   Read the form mode and the control-panel buttons  -> spec label "Step 9"
 *
 *  Verification:
 *    4. The saved Opportunity opens in READ mode
 *    5. After pressing EDIT the form is editable and the control panel shows SAVE | DISCARD
 *
 *  BASELINE RULE (CLAUDE.md, crm-mig automation)
 *  ---------------------------------------------------------------------------------------------
 *  The expected values below are the PRE-PRODUCTION baseline, byte-identical to TC.Performance.1.1.2.5.
 *  They are NOT adapted to what O12 CE renders. If O12 CE differs this spec goes RED - and that
 *  RED is the CORRECT result, because it is the parity gap this suite exists to find. Do not
 *  "fix" the spec by editing the expected values.
 *
 *  Teardown: crm-mig allows writes, so this spec deletes what it created (afterEach) plus an
 *  afterAll sweep for anything an aborted run left behind. Records carry the greppable marker
 *  `TEST CRM-12370_2.2.3 ...` - the same marker `sweepMigLeftoversOnO12CE` searches for.
 * =============================================================================================
 */

const TC = 'CRM-12370_2.2.3';

/** The control-panel buttons while the Opportunity form is in edit mode (PRE-PROD baseline). */
const EXPECTED_EDIT = [
    'SAVE',
    'DISCARD',
  ];

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  s8: 'Step 8: Press the EDIT button of the saved Opportunity',
  s9: 'Step 9: Read the form mode and the control-panel buttons',
};

const SKIP_CLEANUP_OPP = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).

test.describe(`${TC} - O12 CE Opportunity Buttons`, () => {

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
    await sweepMigLeftoversAfterAll(browser, TC);
  });

  test(`${TC}: Verify the EDIT button puts the Opportunity form in edit mode`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    let opp: O12ceOpportunity;
    let beforeEditable = true;

    // The VERIFY block printed in the last step - filled by record(), printed before the expect()s
    // so it also reaches stdout when a check fails.
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

    // Steps 1-3 of the manual TC, run as the shared O12 CE setup helper (its own "Step 1".."Step 7"
    // banners). Grouped on purpose: this block is setup, not what the TC verifies.
    await loginToO12CE(page);
    await openOpportunitiesListOnO12CE(page);
    opp = await createOpportunityOnO12CE(page, TC);
    console.log(`  Opportunity created by this run: ${opp.oppUrl}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Pre-condition - Opportunity created`);

    await test.step(STEP.s8, async () => {
      console.log(`\n--- ${STEP.s8} ---`);

      beforeEditable = await opportunityPage.isFormEditable();
      console.log(`  Form editable BEFORE pressing EDIT: ${beforeEditable}`);
      record('The saved Opportunity opens in READ mode', 'false', String(beforeEditable));
      await opportunityPage.clickEdit();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
    });

    await test.step(STEP.s9, async () => {
      console.log(`\n--- ${STEP.s9} ---`);

      const editable = await opportunityPage.isFormEditable();
      const buttons = await opportunityPage.getControlPanelButtons();
      console.log(`  Form editable AFTER pressing EDIT : ${editable}`);
      console.log(`  Control-panel buttons             : ${buttons.join(' | ')}`);
      record('The form is in EDIT mode after pressing EDIT', 'true', String(editable));
      record('Control-panel buttons in edit mode', EXPECTED_EDIT.join(' | '), buttons.join(' | '));
      printVerify();

      let verifyPassed = false;
      try {
        expect(beforeEditable, 'a saved Opportunity must open in READ mode').toBe(false);
        expect(editable, 'the form must be in EDIT mode after pressing EDIT').toBe(true);
        expect(buttons, 'the control-panel buttons offered in edit mode').toEqual(EXPECTED_EDIT);
        verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - Form in edit mode`,
          passed: verifyPassed,
        }).catch(() => {});
      }
    });
  });
});
