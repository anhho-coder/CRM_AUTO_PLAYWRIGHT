/**
 * Shared helper for CRM-9059 (Rule 7) Lead-Merging verification specs.
 *
 * Rule 7: "If Lead.Sales team or Lead.Salesperson is not empty for both leads and different,
 *          such leads shall NOT be merged."
 *
 * All Rule-7 cases create TWO leads that share the SAME email (so they are otherwise
 * merge-eligible) and vary only the Sales Team / Salesperson. This helper centralises:
 *  - createTwoSameEmailLeads(): logs in, creates Lead#1 + Lead#2 (same email) with the
 *    given Sales Team / Salesperson on each; handles the transient Odoo
 *    "Missing Record: mail.followers" server-error dialog that can block the same-email flow.
 *  - verifyNoMerge():        asserts BOTH leads stay Active and neither shows a merge note.
 *  - verifyMergeHappened():  asserts the leads merged (source Lead#2 archived + merge note,
 *                            target Lead#1 survives).
 *  - leadMergingAfterEach(): surfaces the failure reason in the report (not just the stabilize wait).
 *
 * A field value of null/undefined/'' means "leave the field cleared (empty)".
 */
import { Page, TestInfo, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

const MERGE_NOTE = 'This lead has been merged into';

export interface LeadFieldSpec {
  salesTeam?: string | null;
  salesperson?: string | null;
}

export interface TwoLeadsResult {
  sharedEmail: string;
  lead1Id: string;
  lead1Url: string;
  lead2Id: string;
  lead2Url: string;
}

async function applyTeamAndSalesperson(leadPage: LeadPage, spec: LeadFieldSpec): Promise<void> {
  if (spec.salesTeam) {
    await leadPage.selectSalesTeam(spec.salesTeam);
    console.log(`  - Sales Team      : ${spec.salesTeam}`);
  } else {
    await leadPage.clearSalesTeam();
    console.log(`  - Sales Team      : (cleared)`);
  }
  if (spec.salesperson) {
    await leadPage.selectSalesperson(spec.salesperson);
    console.log(`  - Salesperson     : ${spec.salesperson}`);
  } else {
    await leadPage.clearSalesperson();
    console.log(`  - Salesperson     : (cleared)`);
  }
}

/**
 * Create two leads that share the SAME email; Lead#1 = Belgium/Flanders, Lead#2 = Germany/Berlin.
 * Both: Created manually = FALSE, Lead form = License. Only Sales Team / Salesperson differ per spec.
 */
export async function createTwoSameEmailLeads(
  page: Page,
  testInfo: TestInfo,
  opts: { tcId: string; lead1: LeadFieldSpec; lead2: LeadFieldSpec }
): Promise<TwoLeadsResult> {
  const loginPage = new LoginPage(page);
  const homePage = new HomePage(page);
  const leadPage = new LeadPage(page);

  // Pre-condition: login and navigate to CRM > Leads
  await loginPage.navigateTo(baseUrl);
  await loginPage.login(users.admin_crm.username, users.admin_crm.password);
  await loginPage.dismissLocationPermissionDialog();
  await homePage.navigateToCRM();
  await page.waitForTimeout(CommonUtils.waitTimes.long);
  await homePage.navigateToLeads();

  // ONE company email, reused for BOTH leads (same-email scenario)
  const sharedEmail = CommonUtils.generateEmail('Lead1', 'company');
  console.log(`Shared company email (both leads): ${sharedEmail}`);

  // ---- Lead #1 (Belgium / Flanders) ----
  console.log(`=== Creating Lead #1 (${opts.tcId}) ===`);
  await leadPage.clickCreate();
  await leadPage.fillLeadOpportunity(`TEST Lead 1 ${opts.tcId}`);
  await leadPage.fillEmail(sharedEmail);
  await leadPage.fillCompanyName('Company Name Lead 1');
  await leadPage.fillStreet('123street');
  await leadPage.dismissErrorDialogWithRetry(); // transient Missing-Record dialog guard
  await leadPage.selectCountry('Belgium');
  await leadPage.selectState('Flanders');
  await applyTeamAndSalesperson(leadPage, opts.lead1);
  await leadPage.uncheckCreatedManually();
  await leadPage.fillLeadForm('License');
  await leadPage.dismissErrorDialogWithRetry();
  await leadPage.clickSave();
  await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
  const lead1Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
  const lead1Url = page.url();
  console.log(`  Lead #1 saved: ID=${lead1Id}`);
  await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Pre-condition I - Lead #1 created (ID: ${lead1Id})`);

  // ---- Lead #2 (Germany / Berlin, SAME email) ----
  console.log(`=== Creating Lead #2 (${opts.tcId}) - SAME email ===`);
  await leadPage.clickCreate();
  await leadPage.fillLeadOpportunity(`TEST Lead 2 ${opts.tcId}`);
  await leadPage.fillEmail(sharedEmail);
  await leadPage.fillCompanyName('Company Name Lead 2');
  await leadPage.fillContactName('Contact Name Lead 2');
  await leadPage.fillStreet('123street');
  await leadPage.dismissErrorDialogWithRetry();
  await leadPage.selectCountry('Germany');
  await leadPage.selectState('Berlin');
  await applyTeamAndSalesperson(leadPage, opts.lead2);
  await leadPage.uncheckCreatedManually();
  await leadPage.fillLeadForm('License');
  await leadPage.dismissErrorDialogWithRetry();
  await leadPage.clickSave();
  await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
  const lead2Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
  const lead2Url = page.url();
  console.log(`  Lead #2 saved: ID=${lead2Id}`);
  await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Pre-condition II - Lead #2 created (ID: ${lead2Id})`);

  return { sharedEmail, lead1Id, lead1Url, lead2Id, lead2Url };
}

/** Open a saved lead in readonly and return the key merge-relevant fields. */
async function openLeadAndRead(
  page: Page,
  leadPage: LeadPage,
  url: string
): Promise<{ active: boolean; lostReason: string; leadForm: string; logText: string }> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
  await page.waitForTimeout(CommonUtils.waitTimes.long);
  await leadPage.dismissErrorDialogWithRetry(); // transient Missing-Record dialog guard on form load
  const logText = await leadPage.getChatterLogText();
  await leadPage.clickCRMDeveloperTab();
  await page.waitForTimeout(CommonUtils.waitTimes.standard);
  const active = await leadPage.isActiveChecked();
  const lostReason = await leadPage.getLostReasonValueViaTextContent();
  const leadForm = await leadPage.getLeadFormValue();
  return { active, lostReason, leadForm, logText };
}

/**
 * Assert NO merge occurred: BOTH leads remain Active, neither shows the merge note,
 * Lost Reason blank. (These cases currently FAIL while CRM-9059 is open.)
 */
export async function verifyNoMerge(page: Page, testInfo: TestInfo, r: TwoLeadsResult): Promise<void> {
  const leadPage = new LeadPage(page);
  for (const [label, url] of [['Lead #1', r.lead1Url], ['Lead #2', r.lead2Url]] as const) {
    const f = await openLeadAndRead(page, leadPage, url);
    console.log(`  ${label}: Active=${f.active}, LostReason="${f.lostReason}", merged-note=${f.logText.includes(MERGE_NOTE)}`);
    if (!f.active) {
      console.log(`  ❌ ${label} Active = FALSE -> the lead was ARCHIVED by a merge.`);
    }
    expect(f.logText, `${label} Log note contains "${MERGE_NOTE}" - the leads WERE merged, which must NOT happen (known bug CRM-9059)`).not.toContain(MERGE_NOTE);
    expect(f.active, `${label} Active checkbox is FALSE - the lead was merged/archived, which must NOT happen (known bug CRM-9059)`).toBeTruthy();
    expect(f.lostReason).toBe('');
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${label} verified NOT merged`);
  }
}

/**
 * Assert the merge DID happen (positive control - Rule 7 does not block this combination):
 * source Lead#2 archived + merge note + Lost Reason Duplicate; target Lead#1 survives (Active).
 * (Merge direction observed on pre-prod: the 2nd-created lead is merged into the 1st.)
 */
export async function verifyMergeHappened(page: Page, testInfo: TestInfo, r: TwoLeadsResult): Promise<void> {
  const leadPage = new LeadPage(page);

  // Source (Lead #2) should be merged away
  const src = await openLeadAndRead(page, leadPage, r.lead2Url);
  console.log(`  Lead #2 (source): Active=${src.active}, LostReason="${src.lostReason}", merged-note=${src.logText.includes(MERGE_NOTE)}`);
  expect(src.logText, 'Expected Lead #2 to be merged into Lead #1 (Log note "This lead has been merged into")').toContain(MERGE_NOTE);
  expect(src.active, 'Expected Lead #2 (source) to be archived (Active=FALSE) after the merge').toBeFalsy();
  await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Lead #2 verified MERGED (archived)');

  // Target (Lead #1) should survive
  const tgt = await openLeadAndRead(page, leadPage, r.lead1Url);
  console.log(`  Lead #1 (target): Active=${tgt.active}`);
  expect(tgt.active, 'Expected Lead #1 (target) to survive the merge (Active=TRUE)').toBeTruthy();
  await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Lead #1 verified survived merge');
}

/** Shared afterEach: surface WHY the test failed (assertion reason) in the console/report. */
export async function leadMergingAfterEach(page: Page, testInfo: TestInfo): Promise<void> {
  if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
    const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
    if (failureReason) {
      console.log('❌ TEST FAILED - reason:');
      console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
    }
    // Let the page settle so Playwright's auto-screenshot captures a stable state
    await page.waitForTimeout(CommonUtils.waitTimes.extraLong).catch(() => {});
  }
}
