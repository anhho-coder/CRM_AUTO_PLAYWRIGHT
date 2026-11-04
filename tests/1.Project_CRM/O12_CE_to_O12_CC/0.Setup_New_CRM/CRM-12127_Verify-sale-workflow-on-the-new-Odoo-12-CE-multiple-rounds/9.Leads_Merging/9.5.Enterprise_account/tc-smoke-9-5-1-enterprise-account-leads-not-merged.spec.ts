import { test } from '@playwright/test';
import { HomePageMig, LeadPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  baselineDetails, newLeadMergingRun, loginAndOpenLeadsOnMig, MergeVerifyLog, teardownLeadMergingRun,
  sweepLeadMergingRunsAfterAll, LeadMergingRun, CreatedRecord, createLeadOnMig, openRecordByUrl, verifyStep,
  watchNoMergeWindowOnMig, recordName,
} from '@helpers/lead-merging-mig.helper';

/**
 * ============================================================================================
 *  CRM-12370_9.5.1 - Enterprise-account leads are protected from auto-merge (O12 CE Migration server)
 * ============================================================================================
 *  Test Case ID    : CRM-12370_9.5.1
 *  Automation-Type : refactored
 *  Automation-Date : 2026-11-04
 *  Run as          : Odoo Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *  Baseline        : CRM-11284_1.1 (Jira CRM-11744) - assertions ported unchanged
 *                    tests/1.Project_CRM/3.Lead_Merging/CRM-11284_Source-Lead-has-Enterprise_account-tag-should-NOT-merged/1.NOT Merged Lead/tc-crm-11284-1-1-enterprise-account-lead-not-merged.spec.ts
 *  Source version  : CRM-11744 updated 2026-07-15T11:35+0300 - re-check before trusting this spec
 *
 * --------------------------------------------------------------------------------------------
 *  Migrated data touched (tester-approved 2026-11-04)
 * --------------------------------------------------------------------------------------------
 *  The baseline uses the real Enterprise-account domain naval-group.com. On crm-mig that is MIGRATED production data
 *  (read 2026-10-30: 4 company partners, 20+ leads/opps, 2 of them still active - 192942, 159641). No partner field
 *  marks a domain as "Enterprise account" (ir.model.fields has none), so a fresh Enterprise domain cannot be built.
 *  Run 2026-11-04 09:54: saving Lead #2 made the system (uid 1) write ALL 24 migrated res.partner records on
 *  naval-group.com (4 companies + 20 contacts) - no lead was written, nothing merged. The tester approved that write
 *  and un-skipped this spec on 2026-11-04 (it was BLOCKED/skipped unless MIG_ENTERPRISE_DOMAIN was set).
 *  If the protection under test ever fails, the test leads can merge into the migrated leads above - report the ids.
 *  Override: MIG_ENTERPRISE_DOMAIN=<domain>  [MIG_ENTERPRISE_LOCALPART=<local part>]
 *
 * --------------------------------------------------------------------------------------------
 *  Summary
 * --------------------------------------------------------------------------------------------
 *  Two merge-eligible leads (team-standard recipe) share one e-mail on the Enterprise-account domain. Verifies they
 *  are NOT auto-merged: both stay Active, no merge log note, both carry the "Enterprise account" tag.
 *
 * --------------------------------------------------------------------------------------------
 *  Command to run
 * --------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_9\.5\.1:" --project=MigSmoke --workers=1
 *
 * --------------------------------------------------------------------------------------------
 *  O12 CE deviations (mechanical only - the assertions are the baseline's)
 * --------------------------------------------------------------------------------------------
 *  - Login users.admin_crm_mig on baseUrl_mig; CRM > Leads opened by URL hash (HomePageMig); CRM Developer opened
 *    inline or through the form's "More (N)" dropdown (LeadPageMig).
 *  - Step 1 watches the whole 35-min window (the re-scan cron makes a missed merge only after ~10 min + 20 min).
 *  - Run marker: e-mail <local>+crm12370-9-5-1-<runId>@<domain>, names "TEST Lead N CRM-12370_9.5.1 <runId>".
 *  - The baseline's Step 4 assertions are made where each lead is read (Steps 2 and 3, soft); Step 4 prints them.
 *
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (baseline header, verbatim)
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (from Khang Nguyen's conclusion comment, 2026-07-14):
 *    Both leads are made merge-eligible with the team-standard recipe (see
 *    config/LEAD_MERGING_TEST_RULES.md) so the ONLY variable is the email domain:
 *      - Lead#1 (older, manual, SURVIVOR): Created Manually = TRUE, Tag = "Can_Merge", Lead form = BLANK
 *      - Lead#2 (newer, other, ABSORBED) : Created Manually = FALSE, Lead form = License
 *      - Both leads share the SAME email (matthieu.herry+<unique>@naval-group.com).
 *    Pre-condition : Login as Odoo Administrator; open CRM > Leads.
 *    1. Create the older lead (Lead #1) on the Enterprise-account domain.
 *    2. Create a new lead (Lead #2) with an email on the same Enterprise-account domain.
 *    3. Let the automatic processing run.
 *    Expected:
 *       - Both leads stay (no merge): both Active = TRUE, no merge log note on either.
 *       - Both carry the "Enterprise account" tag (auto-applied by domain).
 * ============================================================================================
 */

const TC = 'CRM-12370_9.5.1';
const SKIP_CLEANUP_MIG = false;
const ENTERPRISE_DOMAIN = process.env.MIG_ENTERPRISE_DOMAIN || 'naval-group.com';
const ENTERPRISE_LOCALPART = process.env.MIG_ENTERPRISE_LOCALPART ?? 'matthieu.herry';
const ENTERPRISE_TAG = 'Enterprise account';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition I: Login as Odoo Administrator, open CRM > Leads, and create Lead #1 (older) on the Enterprise-account domain',
  pre2: 'Pre-condition II: Create a new lead (Lead #2) with an email on the same Enterprise-account domain',
  s1: 'Step 1: Let the automatic processing run (wait for the async tag + merge window) (crm-mig: watch the whole 35-min window)',
  s2: 'Step 2: Open Lead #1 and read its final state (tag, Active, merge log)',
  s2_1: 'Lead #1 must NOT show a "merged into this lead" log note',
  s2_2: 'Lead #1 must carry the "Enterprise account" tag',
  s2_3: 'Lead #1 must stay Active (not archived by a merge)',
  s3: 'Step 3: Open Lead #2 and read its final state (tag, Active, merge log)',
  s3_1: 'Lead #2 must NOT show a "this lead has been merged into" log note',
  s3_2: 'Lead #2 must carry the "Enterprise account" tag',
  s3_3: 'Lead #2 must stay Active (not archived by a merge)',
  s4: 'Step 4: Verify both leads stay (no merge) and both carry the "Enterprise account" tag',
} as const;

let run: LeadMergingRun | undefined;

test.describe(`${TC} - Enterprise account lead is protected from auto-merge`, () => {
  test.afterEach(async ({ page }, testInfo) => {
    await teardownLeadMergingRun(page, testInfo, run, SKIP_CLEANUP_MIG);
  });

  test.afterAll(async ({ browser }) => {
    await sweepLeadMergingRunsAfterAll(browser, SKIP_CLEANUP_MIG);
  });

  test(`${TC}: Enterprise-account lead is protected - leads on an Enterprise domain do NOT auto-merge and both carry the "Enterprise account" tag`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(CommonUtils.waitTimes.leadMergeMigTest);
    run = newLeadMergingRun(TC);
    const leadPage = new LeadPageMig(page);
    const vlog = new MergeVerifyLog();
    let homePage!: HomePageMig;
    const sharedEmail = `${ENTERPRISE_LOCALPART}+${run.marker}@${ENTERPRISE_DOMAIN}`;
    const lead1Name = recordName(run, 'TEST Lead 1');
    const lead2Name = recordName(run, 'TEST Lead 2');
    let lead1!: CreatedRecord;
    let lead2!: CreatedRecord;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      homePage = await loginAndOpenLeadsOnMig(page);
      lead1 = await createLeadOnMig(page, testInfo, leadPage, {
        name: lead1Name, email: sharedEmail, companyName: 'Company Name Lead 1', street: '123street',
        country: 'Belgium', state: 'Flanders', salesTeam: null, salesperson: null, createdManually: true,
        tags: ['Can_Merge'], leadForm: '',
      }, 'Pre-condition I - Lead #1');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await homePage.navigateToLeads();
      lead2 = await createLeadOnMig(page, testInfo, leadPage, {
        name: lead2Name, email: sharedEmail, companyName: 'Company Name Lead 2', contactName: 'Contact Name Lead 2',
        street: '123street', country: 'United States', state: 'Texas', salesTeam: null, salesperson: null,
        createdManually: false, leadForm: 'License',
      }, 'Pre-condition II - Lead #2');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await watchNoMergeWindowOnMig(page, leadPage, [{ url: lead1.url, name: lead1Name }, { url: lead2.url, name: lead2Name }]);
    });

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s2, [
      { label: STEP.s2_1, kind: 'noSourceMergeMsg', expected: lead2Name },
      { label: STEP.s2_2, kind: 'tags', expected: [ENTERPRISE_TAG] },
      { label: STEP.s2_3, kind: 'activeTrue' },
    ], async () => { await openRecordByUrl(page, leadPage, lead1.url); await leadPage.clickCRMDeveloperTab(); });

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s3, [
      { label: STEP.s3_1, kind: 'noTargetMergeMsg', expected: lead1Name },
      { label: STEP.s3_2, kind: 'tags', expected: [ENTERPRISE_TAG] },
      { label: STEP.s3_3, kind: 'activeTrue' },
    ], async () => { await openRecordByUrl(page, leadPage, lead2.url); await leadPage.clickCRMDeveloperTab(); });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      vlog.print('both Enterprise-account leads stayed Active, unmerged, with the "Enterprise account" tag');
    });
  });
});
