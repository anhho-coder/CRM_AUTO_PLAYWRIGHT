import { test, expect } from '@playwright/test';
import { HomePageMig, LeadPageMig, OpportunityPageMig } from '@pages/mig';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';
import {
  baselineDetails, newLeadMergingRun, loginAndOpenLeadsOnMig, MergeVerifyLog, teardownLeadMergingRun,
  sweepLeadMergingRunsAfterAll, LeadMergingRun, CreatedRecord, createLeadOnMig, createOpportunityOnMig,
  companyEmail, recordName,
} from '@helpers/lead-merging-mig.helper';

/**
 * ============================================================================================
 *  CRM-12370_9.6.3 - Manual merge of a Lead into an Opp via "Convert to Opportunity" (O12 CE Migration server)
 * ============================================================================================
 *  Test Case ID    : CRM-12370_9.6.3
 *  Automation-Type : refactored
 *  Automation-Date : 2026-11-02
 *  Run as          : Odoo Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *  Baseline        : CRM-10066_1.1 (Jira CRM-11418) - assertions ported unchanged
 *                    tests/1.Project_CRM/3.Lead_Merging/Manual_Lead_Merging_test_cases/CRM-10066_Cannot-make-manual-merging-using-Conver_to_opportunity-option/tc-crm-10066-1-1-manual-merge-convert-to-opportunity.spec.ts
 *  Source version  : CRM-11418 updated 2026-07-07T06:39+0300 - re-check before trusting this spec
 *  Status          : UN-SKIPPED 2026-11-02 - CRM-14066 Resolved (fix on crm-mig), re-verify
 *
 * --------------------------------------------------------------------------------------------
 *  Was blocked by CRM-14066 (Resolved 2026-11-02)
 * --------------------------------------------------------------------------------------------
 *  On crm-mig, CONVERT TO OPPORTUNITY on a Lead opened "Odoo Server Error" instead of the wizard
 *  (nakivo_sale/models/crm_lead.py:361 searches crm.team on 'merge_leads', a field crm-mig did not have), so Step 4
 *  could never be reached. Run 2026-10-30: Step 4 FAIL, reproduced 2/2. Pre-prod baseline CRM-10066_1.1 re-run
 *  2026-11-02: PASS. Skip lifted on the tester's request 2026-11-02 after CRM-14066 was resolved.
 *
 * --------------------------------------------------------------------------------------------
 *  Summary
 * --------------------------------------------------------------------------------------------
 *  Opp #1 and Lead #1 share one new company domain and Company Name; on the Lead, Convert to Opportunity > Merge with
 *  existing opportunities > add Opp #1 > CREATE OPPORTUNITY. Verifies the merge completes (P2 bug CRM-10066).
 *
 * --------------------------------------------------------------------------------------------
 *  Command to run
 * --------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_9\.6\.3:" --project=MigSmoke --workers=1
 *
 * --------------------------------------------------------------------------------------------
 *  O12 CE deviations (mechanical only - the assertions are the baseline's)
 * --------------------------------------------------------------------------------------------
 *  - Login users.admin_crm_mig on baseUrl_mig; CRM lists opened by URL hash (HomePageMig).
 *  - Notebook tabs (CRM Developer) opened inline or through the form's "More (N)" dropdown (LeadPageMig /
 *    OpportunityPageMig): the crm-mig form folds overflow tabs there.
 *  - Run marker: e-mails <local>@ap14test-crm12370-9-6-3-<runId>.com, names "... CRM-12370_9.6.3 <runId>".
 *  - Lead #1 is not queued for deletion: the manual merge unlinks it. If it survived, the afterEach finds it by
 *    the run marker and deletes it with Opp #1 and the partners carrying the marker.
 *
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (baseline header, verbatim)
 * --------------------------------------------------------------------------------------------
 *  Pre-condition: On Pre-production, login and open CRM.
 *  1. Create Opp #1 having:
 *       - Email address = "Opp-test-hot@<shared company domain>"   (unique per run)
 *       - Lead Form     = License
 *       - Company Name  = test123                                  (unique per run)
 *       - Street        = 123street
 *       - Country       = United States
 *       - State         = Texas (US)
 *       - Sale Team     = CMR
 *       - Status        = NEW
 *  2. Create Lead #1 having:
 *       - Email address = "lead-test-hot@<same company domain as Opp#1>"   (unique per run)
 *       - Lead Form     = IB NC Leads
 *       - Company Name  = test123                                          (same as Opp#1)
 *       - Street        = 123street
 *       - Country       = United States
 *       - State         = Texas (US)
 *       - Sale Team     = IBSA
 *  3. Select Lead#1, press "Convert to Opportunity" button
 *  4. Select option "Merge with existing opportunities"
 *  5. Select "Add a line" and filter all Opp with Email = "Opp-test-hot@<shared domain>"
 *  6. Select the Opp#1, then press "CREATE OPPORTUNITY" finally
 *  7. Observe result
 *  Expected Result : The Merging will complete.
 *  Observed (bug)  : The Merging did not happen.
 * ============================================================================================
 */

const TC = 'CRM-12370_9.6.3';
const SKIP_CLEANUP_MIG = false;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre: 'Pre-condition: Login and open CRM (crm-mig: CRM > Leads opened by URL hash - the sidebar theme hides the top menu)',
  s1: 'Step 1: Create Opp#1 (Email, Lead Form=License, Company=test123, Address, Sale Team=CMR, Status=NEW)',
  s2: 'Step 2: Create Lead#1 (Email same-domain, Lead Form=IB NC Leads, Company=test123, Address, Sale Team=IBSA)',
  s3: 'Step 3: Select Lead#1, press "Convert to Opportunity" button',
  s4: 'Step 4: Select option "Merge with existing opportunities"',
  s5: 'Step 5: Select "Add a line" and filter all Opp with Email = Opp#1 email',
  s6: 'Step 6: Select the Opp#1, then press "CREATE OPPORTUNITY"',
  s7: 'Step 7: Observe result - the Merging is completed',
  verify: 'Verification',
} as const;

const OPP1_TEAM = 'CMR';
/** baseline value - on crm-mig IBSA is the display name (nakivo_name) of crm.team 20 "Install Base" */
const LEAD1_TEAM = 'IBSA';

let run: LeadMergingRun | undefined;

test.describe(`${TC} - Manual merge via "Convert to Opportunity" option completes`, () => {
  test.afterEach(async ({ page }, testInfo) => {
    await teardownLeadMergingRun(page, testInfo, run, SKIP_CLEANUP_MIG);
  });

  test.afterAll(async ({ browser }) => {
    await sweepLeadMergingRunsAfterAll(browser, SKIP_CLEANUP_MIG);
  });

  test(`${TC}: [CRM-14066] Verify manual merging using "Convert to Opportunity" option completes successfully`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    run = newLeadMergingRun(TC);
    const leadPage = new LeadPageMig(page);
    const oppPage = new OpportunityPageMig(page);
    const vlog = new MergeVerifyLog();
    let homePage!: HomePageMig;
    const oppEmail = companyEmail(run, 'opp-test-hot', 'ap14test');
    const leadEmail = companyEmail(run, 'lead-test-hot', 'ap14test');
    const companyName = `test123-${run.runId}`;
    const opp1Name = recordName(run, 'TEST Opp 1');
    const lead1Name = recordName(run, 'TEST Lead 1');
    let opp1!: CreatedRecord;

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      console.log(`  - Opp#1 email          : ${oppEmail}`);
      console.log(`  - Lead#1 email         : ${leadEmail}`);
      console.log(`  - Company Name (shared): ${companyName}`);
      homePage = await loginAndOpenLeadsOnMig(page);
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      opp1 = await createOpportunityOnMig(page, testInfo, homePage, oppPage, {
        name: opp1Name, email: oppEmail, companyName, street: '123street', country: 'United States', state: 'Texas',
        salesTeam: OPP1_TEAM, leadForm: 'License',
      }, 'Step 1 - Opp #1');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await homePage.navigateToLeads();
      console.log('  - Opened      : CRM > Leads > Leads (list)');
      await createLeadOnMig(page, testInfo, leadPage, {
        name: lead1Name, email: leadEmail, companyName, street: '123street', country: 'United States', state: 'Texas',
        salesTeam: LEAD1_TEAM, leadForm: 'IB NC Leads',
      }, 'Step 2 - Lead #1', { register: false });
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await leadPage.clickConvertToOpportunity();
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      const mergeAvailable = await leadPage.isMergeOptionAvailable();
      vlog.add({
        what: '"Merge with existing opportunities" is offered',
        expected: 'offered (Opp#1 and Lead#1 share the same company e-mail domain)',
        actual: mergeAvailable ? 'offered' : 'NOT offered',
        result: mergeAvailable ? 'PASS' : 'FAIL',
      });
      let verifyPassed = false;
      try {
        expect(mergeAvailable, '"Merge with existing opportunities" should be offered (Opp#1 and Lead#1 share the same company email domain)').toBeTruthy();
        verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - Step 4 - Merge option offered`, passed: verifyPassed }).catch(() => {});
      }
      await leadPage.selectConversionActionMerge();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Merge option selected');
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      const pick = await leadPage.addOpportunityToMergeByEmailAndTeam(oppEmail, OPP1_TEAM);
      vlog.add({
        what: `Opp#1 found and selected in the "Add: Opportunities" picker (filter Email = ${oppEmail}, Sales Team ${OPP1_TEAM})`,
        expected: 'selected',
        actual: `${pick.selectedByTeam ? 'selected' : 'NOT selected'} (${pick.rowCount} row(s) matched)`,
        result: pick.selectedByTeam ? 'PASS' : 'FAIL',
      });
      let verifyPassed = false;
      try {
        expect(pick.selectedByTeam, `Opp#1 (Sales Team ${OPP1_TEAM}) should be found and selected in the "Add: Opportunities" picker`).toBeTruthy();
        verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - Step 5 - Opp#1 added to merge list`, passed: verifyPassed }).catch(() => {});
      }
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      await leadPage.clickCreateOpportunity();
      console.log(`  - URL after CREATE OPPORTUNITY: ${page.url()}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - CREATE OPPORTUNITY clicked');
    });

    await test.step(STEP.s7, async () => {
      console.log(`\n--- ${STEP.s7} ---`);
      await page.goto(opp1.url, { waitUntil: 'domcontentloaded' });
      await oppPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const mergeLog = await oppPage.waitForChatterContaining(`Merged lead : ${lead1Name}`, 3, CommonUtils.waitTimes.long);
      const stageNewVisible = await oppPage.isStageNewVisible();
      vlog.add({
        what: 'Opp#1 log records the merged Lead',
        expected: `"Merged lead : ${lead1Name}" (NOT FOUND means the manual merge did not complete - CRM-10066)`,
        actual: mergeLog.found ? 'FOUND' : 'NOT FOUND',
        result: mergeLog.found ? 'PASS' : 'FAIL',
      });
      vlog.add({
        what: 'Opp#1 still shows Stage "New" after the merge',
        expected: 'Stage "New" visible',
        actual: stageNewVisible ? 'visible' : 'NOT visible',
        result: stageNewVisible ? 'PASS' : 'FAIL',
      });
      let verifyPassed = false;
      try {
        expect(mergeLog.found, `Verify #1 FAILED - Opp#1 log should record "Merged lead : ${lead1Name}" (CRM-10066 fixed - manual merge completed)`).toBeTruthy();
        expect(stageNewVisible, 'Verify #2 FAILED - Opp#1 should still show Stage "New" after the merge').toBeTruthy();
        verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - Step 7 - Merge completed (Opp#1)`,
          passed: verifyPassed,
          highlight: ['.o_mail_thread'],
          lines: [`Merged lead : ${lead1Name} -> ${mergeLog.found ? 'FOUND' : 'NOT FOUND'}`, `Stage New -> ${stageNewVisible ? 'visible' : 'NOT visible'}`],
        }).catch(() => {});
      }
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      vlog.print('the manual merge completed - Opp#1 logs the merged Lead and keeps Stage "New"');
    });
  });
});
