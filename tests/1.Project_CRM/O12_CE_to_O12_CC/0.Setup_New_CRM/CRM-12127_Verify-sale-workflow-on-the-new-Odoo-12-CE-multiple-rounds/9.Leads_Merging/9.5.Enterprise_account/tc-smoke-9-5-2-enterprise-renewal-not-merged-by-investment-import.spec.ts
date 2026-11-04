import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import { HomePageMig, LeadPageMig } from '@pages/mig';
import { InvestmentPageMig } from '@pages/mig/InvestmentPageMig';
import { CommonUtils } from '@helpers/common.utils';
import { registerMigRecord } from '@helpers/o12ce-main-business.helper';
import {
  baselineDetails, newLeadMergingRun, loginAndOpenLeadsOnMig, MergeVerifyLog, teardownLeadMergingRun,
  sweepLeadMergingRunsAfterAll, LeadMergingRun, CreatedRecord, createLeadOnMig, openRecordByUrl, verifyStep,
  watchNoMergeWindowOnMig, recordName,
} from '@helpers/lead-merging-mig.helper';

/**
 * ============================================================================================
 *  CRM-12370_9.5.2 - Enterprise renewal lead not merged by an Investment-import lead (O12 CE Migration server)
 * ============================================================================================
 *  Test Case ID    : CRM-12370_9.5.2
 *  Automation-Type : refactored
 *  Automation-Date : 2026-11-04
 *  Run as          : Odoo Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *  Baseline        : CRM-11284_1.3 (Jira CRM-11745) - assertions ported unchanged
 *                    tests/1.Project_CRM/3.Lead_Merging/CRM-11284_Source-Lead-has-Enterprise_account-tag-should-NOT-merged/1.NOT Merged Lead/tc-crm-11284-1-3-enterprise-renewal-not-merged-by-investment-import.spec.ts
 *  Source version  : CRM-11745 updated 2026-07-15T11:37+0300 - re-check before trusting this spec
 *
 * --------------------------------------------------------------------------------------------
 *  Migrated data touched (tester-approved 2026-11-04)
 * --------------------------------------------------------------------------------------------
 *  Same domain as CRM-12370_9.5.1: the baseline's Enterprise-account domain (naval-group.com) is migrated production
 *  data on crm-mig and no partner field marks a fresh domain as Enterprise. The tester approved writes to the 24
 *  migrated res.partner records on that domain and un-skipped this spec on 2026-11-04 (it was BLOCKED/skipped unless
 *  MIG_ENTERPRISE_DOMAIN was set). If the protection under test ever fails, the test lead can merge into a migrated
 *  lead - report the ids. Override: MIG_ENTERPRISE_DOMAIN=<domain> [MIG_ENTERPRISE_LOCALPART=<local part>].
 *
 * --------------------------------------------------------------------------------------------
 *  Summary
 * --------------------------------------------------------------------------------------------
 *  A renewal Lead #1 (IB NC Leads) on the Enterprise domain, then an Investment whose imported audience uses the same
 *  e-mail (spawns event Lead #2). Verifies Lead #1 is NOT merged and still carries "Enterprise account".
 *
 * --------------------------------------------------------------------------------------------
 *  Command to run
 * --------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_9\.5\.2:" --project=MigSmoke --workers=1
 *
 * --------------------------------------------------------------------------------------------
 *  O12 CE deviations (mechanical only - the assertions are the baseline's)
 * --------------------------------------------------------------------------------------------
 *  - Login users.admin_crm_mig on baseUrl_mig; CRM > Leads by URL hash (HomePageMig); Investments by XML-id hash
 *    (InvestmentPageMig); CRM Developer inline or through the form's "More (N)" dropdown (LeadPageMig).
 *  - Investment data substituted as in CRM-12370_9.7.1 (crm-mig event-type names): Completion Events
 *    "Attended webinar" -> "Atttended webinar" (sic), Conversion Events "Download free trial" -> "Downloaded free trial".
 *  - Step 1 watches the whole 35-min window; the Investment import merge on crm-mig can also land only through the
 *    20-min re-scan cron (CRM-12621, measured 2026-10-28).
 *  - Run marker: e-mail <local>+crm12370-9-5-2-<runId>@<domain>; the Investment is named "TEST Investment
 *    CRM-12370_9.5.2 <runId>" and deleted in the afterEach with the leads / partners carrying the marker.
 *
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (baseline header, verbatim)
 * --------------------------------------------------------------------------------------------
 *  Source manual TC:
 *    Pre-condition : Login as Odoo Administrator; open CRM > Leads.
 *    1. Create the renewal Lead #1 (Created Manually = FALSE, Lead form = IB NC Leads) on the
 *       Enterprise domain (matthieu.herry+<unique>@naval-group.com).
 *    2. Create an Investment and import an audience whose contact email is the SAME Enterprise
 *       email -> spawns the event Lead #2.
 *    3. Let the automatic processing run.
 *    Expected: the renewal Lead #1 is NOT merged - it stays Active, keeps Lead form = IB NC Leads,
 *    carries "Enterprise account", and shows NO merge log note in either direction.
 *  NOTE: the hard assertions are on the renewal Lead #1 (fully controllable via its URL). The event
 *  Lead #2 is created from the Investment audience import by a slow async cron on pre-prod that does
 *  NOT surface within the test window (neither the audience row nor the Leads-tab row appears in
 *  time), so Lead #2 is reported as BEST-EFFORT EVIDENCE only, not a pass/fail gate.
 * ============================================================================================
 */

const TC = 'CRM-12370_9.5.2';
const SKIP_CLEANUP_MIG = false;
const ENTERPRISE_DOMAIN = process.env.MIG_ENTERPRISE_DOMAIN || 'naval-group.com';
const ENTERPRISE_LOCALPART = process.env.MIG_ENTERPRISE_LOCALPART ?? 'matthieu.herry';
const ENTERPRISE_TAG = 'Enterprise account';

/** crm-mig Investment data - the CRM-12370_9.7.1 values (crm-mig event-type names). */
const INVESTMENT_DATA = {
  type: 'Webinar',
  channel: 'Channel',
  countries: 'Albania',
  responsibleSales: 'Aleksey Galbur',
  responsibleMarketing: 'Nadiia Suprun',
  nbrProductList: 'M365',
  completionEvents: 'Atttended webinar',
  conversionEvents: 'Downloaded free trial',
} as const;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition I: Login, open CRM > Leads, and create the renewal Lead #1 (Lead form = IB NC Leads) on the Enterprise domain',
  pre2: 'Pre-condition II: Create an Investment and import an audience on the SAME Enterprise email to spawn Lead #2 (the event lead)',
  s1: 'Step 1: Let the automatic processing run (wait for the async import->lead + merge window) (crm-mig: watch the whole 35-min window)',
  s2: 'Step 2: Reopen the Investment and confirm the imported event Lead #2 appears in its Leads tab',
  s3: 'Step 3: Open the renewal Lead #1 and read its final state (chatter, Active, tag, Lead form)',
  s4: 'Step 4: Verify the renewal Lead #1 was NOT merged by the imported event lead and still carries "Enterprise account"',
  s4_1: 'Renewal Lead #1 must NOT show any merge log note (no merge occurred)',
  s4_2: 'Renewal Lead #1 must carry the "Enterprise account" tag',
  s4_3: 'Renewal Lead #1 must stay Active (not archived by a merge)',
  s4_4: 'Renewal Lead #1 must keep Lead form = IB NC Leads',
  verify: 'Verification',
} as const;

function formatMDY(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

let run: LeadMergingRun | undefined;

test.describe(`${TC} - Enterprise renewal lead not merged by an Investment-import lead`, () => {
  test.afterEach(async ({ page }, testInfo) => {
    await teardownLeadMergingRun(page, testInfo, run, SKIP_CLEANUP_MIG);
  });

  test.afterAll(async ({ browser }) => {
    await sweepLeadMergingRunsAfterAll(browser, SKIP_CLEANUP_MIG);
  });

  test(`${TC}: Enterprise-account renewal lead (IB NC Leads) is not merged by a same-domain lead IMPORTED from the Investment module`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(CommonUtils.waitTimes.leadMergeMigTest);
    run = newLeadMergingRun(TC);
    const runId = run.runId;
    const leadPage = new LeadPageMig(page);
    const investmentPage = new InvestmentPageMig(page);
    const vlog = new MergeVerifyLog();
    let homePage!: HomePageMig;
    const sharedEmail = `${ENTERPRISE_LOCALPART}+${run.marker}@${ENTERPRISE_DOMAIN}`;
    const lead1Name = recordName(run, 'TEST Lead 1');
    const investmentName = recordName(run, 'TEST Investment');
    const investmentID = `TEST-Investment-${run.marker}`;
    let lead1!: CreatedRecord;
    let investmentId = 0;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      homePage = await loginAndOpenLeadsOnMig(page);
      lead1 = await createLeadOnMig(page, testInfo, leadPage, {
        name: lead1Name, email: sharedEmail, companyName: 'Company Name Lead 1', street: '123street',
        country: 'Belgium', state: 'Flanders', salesTeam: null, salesperson: null, createdManually: false,
        leadForm: 'IB NC Leads',
      }, 'Pre-condition I - renewal Lead #1');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      const now = new Date();
      const sixMonthsLater = new Date(now);
      sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
      console.log(`  - Investment Name   : ${investmentName}`);
      console.log(`  - Investment ID     : ${investmentID}`);
      console.log(`  - Completion Events : ${INVESTMENT_DATA.completionEvents}`);
      console.log(`  - Conversion Events : ${INVESTMENT_DATA.conversionEvents}`);
      await investmentPage.navigateToInvestment();
      await investmentPage.clickCreateButton();
      await investmentPage.createBlankInvestment({
        investmentName, investmentID, ...INVESTMENT_DATA,
        dateStart: formatMDY(now), dateEnd: formatMDY(now),
        trackConversionDateStart: formatMDY(now), trackConversionDateEnd: formatMDY(sixMonthsLater),
      });
      investmentId = await investmentPage.findInvestmentIdByName(investmentName);
      expect(investmentId, `the Investment "${investmentName}" must exist after SAVE`).toBeGreaterThan(0);
      registerMigRecord(InvestmentPageMig.MODEL, investmentId, 'Investment');
      const csv = await investmentPage.createImportAudienceFile({
        contactName: `TEST_EVENT_name_${runId}`,
        company: `TEST_company_name_${runId}`,
        email: sharedEmail,
        tags: 'Test',
        createManually: 'FALSE',
        investmentId: investmentID,
        outputFileName: `CSV-Audience-${TC}-${runId}.csv`,
      });
      expect(fs.existsSync(csv.outputPath), 'Audience CSV file must be created').toBeTruthy();
      await investmentPage.importCompanyAudience(csv.outputPath);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - audience imported');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await watchNoMergeWindowOnMig(page, leadPage, [{ url: lead1.url, name: lead1Name }]);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      // best-effort evidence only (baseline NOTE) - not a pass/fail gate
      const found = await investmentPage.findImportCreatedRecords(investmentId, sharedEmail, `TEST_company_name_${runId}`)
        .catch(() => ({ leadIds: [] as number[], partnerIds: [] as number[] }));
      found.leadIds.forEach((id) => registerMigRecord('crm.lead', id, 'Lead created by the import'));
      found.partnerIds.forEach((id) => registerMigRecord('res.partner', id, 'Partner created by the import', { deleteLast: true }));
      vlog.add({ what: 'event Lead #2 created by the import (best-effort evidence)', expected: '', actual: `${found.leadIds.length} lead(s): ${found.leadIds.join(', ') || '-'}`, result: 'OBSERVED' });
      console.log(`  Observation (not scored): import created lead(s) ${found.leadIds.join(', ') || 'none yet'}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await openRecordByUrl(page, leadPage, lead1.url);
    });

    await verifyStep(page, testInfo, vlog, leadPage, STEP.s4, [
      { label: STEP.s4_1, kind: 'noAnyMergeMsg' },
      { label: STEP.s4_2, kind: 'tags', expected: [ENTERPRISE_TAG] },
      { label: STEP.s4_3, kind: 'activeTrue' },
      { label: STEP.s4_4, kind: 'leadFormContains', expected: 'IB NC Leads' },
    ], () => leadPage.clickCRMDeveloperTab());

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      vlog.print('the renewal Lead #1 was not merged by the imported event lead and keeps "Enterprise account"');
    });
  });
});
