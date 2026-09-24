import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { OpportunityPage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  O12CE_DATA,
  O12ceOpportunity,
  teardownMigRecords,
  sweepMigLeftoversAfterAll,
} from '@helpers/o12ce-main-business.helper';

/**
 * =============================================================================================
 *  O12 CE Migration - Opportunity screen verification - Log note
 * =============================================================================================
 *  Test Case ID    : CRM-12370_2.6.1
 *  Automation-Type : new
 *  Automation-Date : 2026-09-23
 *  Feature folder  : .../CRM-12127_.../2.Opportunity/2.6.Log_note
 *  Source manual TC: TC.Performance.2.6.1 (pre-production baseline, 37/37 PASS 2026-09-21)
 *
 *  Summary
 *  ---------------------------------------------------------------------------------------------
 *  Creates its own Opportunity on the O12 CE Migration server (crm-mig) and runs the pre-production
 *  baseline's checks against it, unchanged, so any O12 CE deviation shows up as a failed assertion.
 *
 *  Command to run
 *  ---------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_2\\.6\\.1:" --project=MigSmoke
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
 *    4.   Read the "Opportunity created" log note in the chatter  -> spec label "Step 8"
 *
 *  BASELINE RULE (CLAUDE.md, crm-mig automation)
 *  ---------------------------------------------------------------------------------------------
 *  Every expected value below is the PRE-PRODUCTION baseline, copied from TC.Performance.2.6.1
 *  without modification. It is NOT adapted to what O12 CE renders. If O12 CE differs this spec
 *  goes RED - and that RED is the CORRECT result, because it is the parity gap this suite exists
 *  to find. Do not "fix" the spec by editing the expected values.
 *
 *  Teardown: crm-mig allows writes, so this spec deletes what it created (afterEach) plus an
 *  afterAll sweep for anything an aborted run left behind. Records carry the greppable marker
 *  `TEST CRM-12370_2.6.1 ...` - the same marker `sweepMigLeftoversOnO12CE` searches for.
 * =============================================================================================
 */

const TC = 'CRM-12370_2.6.1';

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  s8: 'Step 8: Read the "Opportunity created" log note in the chatter',
};

const SKIP_CLEANUP_OPP = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).

test.describe(`${TC} - O12 CE Opportunity`, () => {

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

  test(`${TC}: Verify the "Opportunity created" log note reports the entered Opportunity data`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    let opp: O12ceOpportunity;

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

      const note = await opportunityPage.waitForChatterMessage(/^Opportunity created/);
      console.log('  The "Opportunity created" log note:');
      console.log(`${(note || '(not found)').split('\n').map((l) => '    ' + l).join('\n')}`);
      record('The chatter carries an "Opportunity created" log note', 'FOUND', note ? 'FOUND' : 'NOT FOUND');
      const fields = note ? opportunityPage.parseLogNoteFields(note) : {};
      record('Contact Name reported by the log note', opp.contactName, fields['Contact Name'] ?? '(missing)');
      record('Email reported by the log note', opp.email, fields['Email'] ?? '(missing)');
      record('Active reported by the log note', 'true', fields['Active'] ?? '(missing)');
      record('Stage reported by the log note', 'New', fields['Stage'] ?? '(missing)');
      record('Priority (System) reported by the log note', 'Low', fields['Priority (System)'] ?? '(missing)');
      record('Expected Revenue reported by the log note', '750', fields['Expected Revenue'] ?? '(missing)');
      printVerify();
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - verification`,
        passed: CHECKS.every((c) => c.pass),
      }).catch(() => {});

      expect(note, 'the chatter must carry an "Opportunity created" log note').not.toBeNull();
      expect(fields['Contact Name'], 'the Contact Name the log note reports').toBe(opp.contactName);
      expect(fields['Email'], 'the Email the log note reports').toBe(opp.email);
      expect(fields['Active'], 'the Active flag the log note reports').toBe('true');
      expect(fields['Stage'], 'the Stage the log note reports').toBe('New');
      expect(fields['Priority (System)'], 'the Priority the log note reports').toBe('Low');
      expect(fields['Expected Revenue'], 'the Expected Revenue the log note reports').toBe('750');
    });
  });
});
