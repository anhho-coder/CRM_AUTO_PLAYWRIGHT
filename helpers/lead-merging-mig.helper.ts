import { test, expect, Browser, BrowserContext, Page, TestInfo } from '@playwright/test';
import { config } from '@config/test.config';
import { users, baseUrl_mig } from '@config/users.config';
import { LeadPage, OpportunityPage } from '@pages';
import { LoginPageMig, HomePageMig, MigPlatformPage, LeadPageMig, OpportunityPageMig } from '@pages/mig';
import { openNotebookTabMig } from '@pages/mig/MigNotebook';
import { CommonUtils } from '@helpers/common.utils';
import { baselineDetailsFrom, BaselineTestDetails } from '@helpers/baseline-traceability';
import { CRM12370_LEAD_MERGING_BASELINE_MAP } from '@helpers/lead-merging-mig.baseline-map';
import { registerMigRecord, teardownMigRecords } from '@helpers/o12ce-main-business.helper';
import { recordMergeForDeferredVerify, migCleanupHandedOff } from '@helpers/deferred-verify-merge.helper';

/**
 * ============================================================================================
 *  CRM-12370 section 9 - Leads Merging on crm-mig (O12 CE): shared steps for the 20 specs ported from
 *  the pre-production Lead Merging baselines (map: helpers/lead-merging-mig.baseline-map.ts).
 * ============================================================================================
 *  Every spec keeps its baseline's flow and assertions; this file only carries what is mechanical on crm-mig:
 *  - login users.admin_crm_mig on baseUrl_mig, CRM > Leads / Pipeline list by URL hash (HomePageMig);
 *  - the merge WAIT: a create-time merge can miss on crm-mig and is then only made by the 20-min re-scan cron
 *    (CRM-12621), once the lead is ~10 min old - so a merge is polled for up to waitTimes.leadMergeMigWindow
 *    (35 min) and a NO-merge case watches the whole window (a shorter watch would pass without proving anything);
 *  - the run marker + clean-up the crm-mig rules require (create -> tag -> delete in afterEach + afterAll sweep).
 *
 *  RUN MARKER (deny-list). One run = one marker `crm12370-9-x-y-<runId>`, carried by every e-mail the run types
 *  (company domain `company-<marker>.com`, or public local part `Test-<marker>@gmail.com`), and every lead name
 *  carries `<TC> <runId>`. The partners Odoo creates from those e-mails therefore carry the marker in their e-mail
 *  (and the Company partner, named after the domain, in its name). Clean-up deletes ONLY records carrying THIS
 *  run's marker or ids this run registered - never a TC-level prefix (that reached older runs' leftovers 26-10).
 *  It COUNTS before it deletes and stops when more rows match than one run can create.
 * ============================================================================================
 */

export const LEAD_MERGING_MASTER_TAB = 'Migration - Setup New CRM';

/** Tags + annotations naming the pre-production baseline of one crm-mig TC (REQUIREMENT #8). */
export function baselineDetails(tc: string): BaselineTestDetails {
  return baselineDetailsFrom(CRM12370_LEAD_MERGING_BASELINE_MAP, tc, {
    mapFile: 'helpers/lead-merging-mig.baseline-map.ts',
    masterTab: LEAD_MERGING_MASTER_TAB,
  });
}

// ------------------------------------------------------------------------------------------------
// Run marker
// ------------------------------------------------------------------------------------------------

export interface LeadMergingRun {
  tc: string;
  runId: string;
  /** e-mail / partner-name marker of THIS run, e.g. crm12370-9-1-1-mh3k2x7a4 */
  marker: string;
}

/** Most rows of one model a single run can create (3 leads/opps + 2 partners each) - more matches = not ours. */
const MAX_ROWS_PER_RUN = 10;

/** Every run started in this worker - the afterAll sweep walks these markers and nothing else. */
const runsInThisWorker: LeadMergingRun[] = [];

export function newLeadMergingRun(tc: string): LeadMergingRun {
  const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const slug = tc.toLowerCase().replace(/^crm-/, 'crm').replace(/[_.]/g, '-');
  const run = { tc, runId, marker: `${slug}-${runId}` };
  runsInThisWorker.push(run);
  console.log(`[run] ${tc} runId=${runId} marker=${run.marker}`);
  return run;
}

/** Company e-mail: `<local>@<prefix>-<marker>.com` (baseline template "Test@company + date time .com"). */
export function companyEmail(run: LeadMergingRun, local = 'Test', domainPrefix = 'company'): string {
  return `${local}@${domainPrefix}-${run.marker}.com`;
}

/** Public e-mail: `Test-<marker>@gmail.com` (baseline template "Test + company + date time @gmail.com"). */
export function publicEmail(run: LeadMergingRun): string {
  return `Test-${run.marker}@gmail.com`;
}

/** Lead / Opp name: `<base> <TC> <runId>` (baseline "TEST Lead 1 + current TC ID / date time"). */
export function recordName(run: LeadMergingRun, base: string): string {
  return `${base} ${run.tc} ${run.runId}`;
}

// ------------------------------------------------------------------------------------------------
// Login + navigation
// ------------------------------------------------------------------------------------------------

/** Login as Odoo Administrator on crm-mig and open CRM > Leads (URL hash - the sidebar theme hides the top menu). */
export async function loginAndOpenLeadsOnMig(page: Page): Promise<HomePageMig> {
  const loginPage = new LoginPageMig(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await loginPage.navigateTo(baseUrl_mig);
  await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
  await loginPage.dismissLocationPermissionDialog();
  console.log(`  - Logged in as : ${users.admin_crm_mig.displayName} (${users.admin_crm_mig.username})`);
  const homePage = new HomePageMig(page);
  await homePage.navigateToLeads();
  console.log('  - Opened      : CRM > Leads > Leads (list)');
  return homePage;
}

/** Open a saved Lead / Opportunity form by its URL (works for an archived, merged-away record too). */
export async function openRecordByUrl(page: Page, reader: LeadPage | OpportunityPage, url: string): Promise<void> {
  console.log(`  - Opening     : ${url}`);
  // A goto to a hash URL is a same-document navigation, so always reload as well (2026-10-30, both seen on crm-mig):
  // - same URL: Odoo does not re-read the record at all - CRM-12370_9.1.2 polled Lead #2 34 min without a merge that a
  //   re-open after visiting Lead #1 showed at once;
  // - other action (Lead 300 -> Opp 864): the previous form stays drawn while the new one loads - CRM-12370_9.6.1
  //   read Lead #2's address, tags and empty email as "Opp #1" although Opp #1 held Belgium / Renewal / its email.
  if (page.url() !== url) await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await reader.waitForFormView();
  await reader.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
  await page.waitForTimeout(CommonUtils.waitTimes.long);
}

// ------------------------------------------------------------------------------------------------
// Create
// ------------------------------------------------------------------------------------------------

export interface LeadInput {
  name: string;
  email: string;
  companyName: string;
  contactName?: string;
  street: string;
  country: string;
  /** state as typed (baseline "Texas" for Texas (US)) */
  state: string;
  /** null = the field is cleared; undefined = left as the form opens */
  salesTeam?: string | null;
  /** null = the field is cleared; undefined = left as the form opens */
  salesperson?: string | null;
  /** undefined = left as the form opens */
  createdManually?: boolean;
  tags?: string[];
  /** '' = BLANK */
  leadForm: string;
  /** set after the first SAVE: EDIT > Deal registration tab > Registered deal + start / end date > SAVE */
  dealRegistration?: { start: string; end: string };
}

export interface CreatedRecord {
  id: string;
  url: string;
}

function logLeadInput(input: LeadInput, kind: 'Lead' | 'Opp'): void {
  console.log(`  - ${kind} name           : ${input.name}`);
  console.log(`  - Email               : ${input.email}`);
  console.log(`  - Company Name        : ${input.companyName}`);
  if (input.contactName !== undefined) console.log(`  - Contact Name        : ${input.contactName}`);
  console.log(`  - Street              : ${input.street}`);
  console.log(`  - Country             : ${input.country}`);
  console.log(`  - State               : ${input.state}`);
  const shown = (v: string | null | undefined) => (v === null ? 'cleared' : v === undefined ? '(not set)' : v);
  console.log(`  - Sales Team          : ${shown(input.salesTeam)}`);
  console.log(`  - Salesperson         : ${shown(input.salesperson)}`);
  if (input.createdManually !== undefined) console.log(`  - Created manually    : ${input.createdManually ? 'TRUE' : 'FALSE'}`);
  if (input.tags?.length) console.log(`  - Tags                : ${input.tags.join(', ')}`);
  console.log(`  - Lead form (CRM Dev) : ${input.leadForm === '' ? 'BLANK' : input.leadForm}`);
  if (input.dealRegistration) {
    console.log('  - Registered deal     : TRUE');
    console.log(`  - Deal reg. start     : ${input.dealRegistration.start}`);
    console.log(`  - Deal reg. end       : ${input.dealRegistration.end}`);
  }
}

/**
 * CREATE -> fill -> SAVE one Lead from the current Leads list / Lead form, in the baselines' field order, and
 * register it for the afterEach clean-up. Captures the end-of-section screenshot.
 */
export async function createLeadOnMig(
  page: Page,
  testInfo: TestInfo,
  leadPage: LeadPage,
  input: LeadInput,
  label: string,
  /** register: false for a lead the scenario itself deletes (a manual merge unlinks the merged lead) - the
   *  afterEach still finds it by the run marker if it survived. */
  opts: { register?: boolean } = {},
): Promise<CreatedRecord> {
  await leadPage.clickCreate();
  logLeadInput(input, 'Lead');
  await leadPage.fillLeadOpportunity(input.name);
  await leadPage.fillEmail(input.email);
  await leadPage.fillCompanyName(input.companyName);
  if (input.contactName !== undefined) await leadPage.fillContactName(input.contactName);
  await leadPage.fillStreet(input.street);
  await leadPage.selectCountry(input.country);
  await leadPage.selectState(input.state);
  if (input.salesTeam === null) await leadPage.clearSalesTeam();
  else if (input.salesTeam !== undefined) await leadPage.selectSalesTeam(input.salesTeam);
  if (input.salesperson === null) await leadPage.clearSalesperson();
  else if (input.salesperson !== undefined) await leadPage.selectSalesperson(input.salesperson);
  if (input.createdManually === true) await leadPage.checkCreatedManually();
  else if (input.createdManually === false) await leadPage.uncheckCreatedManually();
  for (const tag of input.tags ?? []) await leadPage.addTag(tag);
  await leadPage.clickCRMDeveloperTab();
  await leadPage.fillLeadForm(input.leadForm);
  await leadPage.clickSave();
  await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
  const id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
  if (opts.register !== false) registerMigRecord('crm.lead', id, label);

  if (input.dealRegistration) {
    await leadPage.clickEdit();
    await leadPage.clickDealRegistrationTab();
    await leadPage.checkRegisteredDeal();
    await leadPage.fillDealRegistrationStartDate(input.dealRegistration.start);
    await leadPage.fillDealRegistrationEndDate(input.dealRegistration.end);
    await leadPage.clickSave();
    await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
  }

  const url = page.url();
  console.log(`  -> ${label} saved: id ${id}`);
  console.log(`     URL: ${url}`);
  await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${label} created (ID: ${id})`);
  return { id, url };
}

/**
 * CRM-14071 (Khang, resolved Not a bug 2026-11-04; tester-approved the same day): on crm-mig the auto-merge runs
 * 2-3 s after a lead is created, and the Deal registration fields are read-only on the New form - so the baselines'
 * SAVE -> EDIT -> Deal registration -> SAVE gives the merge nothing to clone. This creates the lead in ONE create
 * with the Deal registration already set, through the logged-in session (/web/dataset/call_kw - the values the form
 * would save, every one of them the baseline's), then opens it in the UI for the end-of-section screenshot.
 * Call it from the CRM > Leads list: the form URL reuses that list's action / menu.
 */
export async function createLeadWithDealRegistrationOnMig(
  page: Page,
  testInfo: TestInfo,
  leadPage: LeadPage,
  input: LeadInput,
  label: string,
): Promise<CreatedRecord> {
  if (!input.dealRegistration) throw new Error(`${label}: no dealRegistration given - use createLeadOnMig`);
  if (typeof input.salesTeam === 'string' || typeof input.salesperson === 'string') {
    throw new Error(`${label}: a named Sales Team / Salesperson is not supported here - only cleared (null) or as the form opens`);
  }
  logLeadInput(input, 'Lead');
  console.log('  - Created by          : one create with the Deal registration set (CRM-14071), then opened in the UI');
  const platform = new MigPlatformPage(page);
  const listUrl = page.url();
  type IdRow = { id: number };
  const country = await platform.callKw<IdRow[]>('res.country', 'search_read', [[['name', '=', input.country]], ['id']], { limit: 2 });
  if (country.length !== 1) throw new Error(`${label}: country "${input.country}" matched ${country.length} rows`);
  const state = await platform.callKw<IdRow[]>('res.country.state', 'search_read', [
    [['country_id', '=', country[0].id], ['name', '=ilike', `${input.state}%`]], ['id'],
  ], { limit: 2 });
  if (state.length !== 1) throw new Error(`${label}: state "${input.state}" matched ${state.length} rows`);
  const tags = input.tags?.length
    ? await platform.callKw<IdRow[]>('crm.lead.tag', 'search_read', [[['name', 'in', input.tags]], ['id']], { limit: 10 })
    : [];
  if (tags.length !== (input.tags?.length ?? 0)) throw new Error(`${label}: tags ${JSON.stringify(input.tags)} matched ${tags.length} rows`);

  const vals: Record<string, unknown> = {
    type: 'lead',
    name: input.name,
    email_from: input.email,
    partner_name: input.companyName,
    street: input.street,
    country_id: country[0].id,
    state_id: state[0].id,
    lead_form: input.leadForm === '' ? false : input.leadForm,
    registered_deal: true,
    deal_registration_start_date: input.dealRegistration.start,
    deal_registration_end_date: input.dealRegistration.end,
  };
  if (input.contactName !== undefined) vals.contact_name = input.contactName;
  if (input.salesTeam === null) vals.team_id = false;
  if (input.salesperson === null) vals.user_id = false;
  if (input.createdManually !== undefined) vals.is_create_manual = input.createdManually;
  if (tags.length) vals.tag_ids = [[6, 0, tags.map((t) => t.id)]];

  const id = String(await platform.callKw<number>('crm.lead', 'create', [vals], { context: { default_type: 'lead' } }));
  registerMigRecord('crm.lead', id, label);
  const action = /[#&]action=(\d+)/.exec(listUrl)?.[1];
  const menu = /[#&]menu_id=(\d+)/.exec(listUrl)?.[1];
  const url = `${new URL(listUrl).origin}/web#id=${id}${action ? `&action=${action}` : ''}&model=crm.lead&view_type=form${menu ? `&menu_id=${menu}` : ''}`;
  await openRecordByUrl(page, leadPage, url);
  console.log(`  -> ${label} saved: id ${id}`);
  console.log(`     URL: ${url}`);
  await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${label} created (ID: ${id})`);
  return { id, url };
}

/** CREATE -> fill -> SAVE one Opportunity from CRM > Pipeline (list view), registered for clean-up. */
export async function createOpportunityOnMig(
  page: Page,
  testInfo: TestInfo,
  homePage: HomePageMig,
  oppPage: OpportunityPage,
  input: LeadInput,
  label: string,
): Promise<CreatedRecord> {
  await homePage.navigateToOpportunitiesList();
  console.log('  - Opened      : CRM > Pipeline (list view)');
  await oppPage.clickCreate();
  logLeadInput(input, 'Opp');
  await oppPage.fillOpportunityName(input.name);
  await oppPage.fillEmail(input.email);
  await oppPage.fillCompanyName(input.companyName);
  if (input.contactName !== undefined) await oppPage.fillContactName(input.contactName);
  await oppPage.fillStreet(input.street);
  await oppPage.selectCountry(input.country);
  await oppPage.selectState(input.state);
  if (input.salesTeam === null) await oppPage.clearSalesTeam();
  else if (input.salesTeam !== undefined) await oppPage.selectSalesTeam(input.salesTeam);
  if (input.salesperson === null) await oppPage.clearSalesperson();
  else if (input.salesperson !== undefined) await oppPage.selectSalesperson(input.salesperson);
  if (input.createdManually === true) await oppPage.checkCreatedManually();
  else if (input.createdManually === false) await oppPage.uncheckCreatedManually();
  await oppPage.clickCRMDeveloperTab();
  await oppPage.fillLeadForm(input.leadForm);
  await oppPage.clickSave();
  await oppPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
  const id = await oppPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
  registerMigRecord('crm.lead', id, label);
  const url = page.url();
  console.log(`  -> ${label} saved: id ${id}`);
  console.log(`     URL: ${url}`);
  await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${label} created (ID: ${id})`);
  return { id, url };
}

// ------------------------------------------------------------------------------------------------
// Merge wait (crm-mig budget)
// ------------------------------------------------------------------------------------------------

function minutesSince(start: number): string {
  return ((Date.now() - start) / 60000).toFixed(1);
}

/** Which form a record URL opens - the crm-mig round-2 reads it with the matching Mig page object. */
function formOf(reader: LeadPageMig | OpportunityPageMig): 'lead' | 'opportunity' {
  return reader instanceof OpportunityPageMig ? 'opportunity' : 'lead';
}

/**
 * MERGE expected: reload the SOURCE record until its log reads "This lead has been merged into <target>", for up to
 * waitTimes.leadMergeMigWindow. Returns whether it was seen - the spec's own verification steps assert the result.
 * Not seen -> a deferred checkpoint (Jenkins round-1 only, DEFERRED_MERGE_MANIFEST): round-2 re-checks ~90 min later.
 */
export async function pollForMergeOnMig(
  page: Page,
  reader: LeadPageMig | OpportunityPageMig,
  source: { url: string; name: string },
  targetName: string,
): Promise<boolean> {
  const start = Date.now();
  const deadline = start + CommonUtils.waitTimes.leadMergeMigWindow;
  console.log(`  - Polling     : ${source.name} for "This lead has been merged into ${targetName}"`);
  console.log(`  - Budget      : ${CommonUtils.waitTimes.leadMergeMigWindow / 60000} min, every ${CommonUtils.waitTimes.leadMergeMigPoll / 1000} s`);
  for (let attempt = 1; ; attempt++) {
    await openRecordByUrl(page, reader, source.url);
    await reader.waitForChatterMessagesMig();
    if (await reader.hasTargetLeadMergeMessage(targetName)) {
      console.log(`  - Merge seen  : after ${minutesSince(start)} min (attempt ${attempt})`);
      return true;
    }
    if (Date.now() + CommonUtils.waitTimes.leadMergeMigPoll > deadline) break;
    console.log(`    attempt ${attempt}: not merged yet (${minutesSince(start)} min)`);
    await page.waitForTimeout(CommonUtils.waitTimes.leadMergeMigPoll);
  }
  console.log(`  - Merge NOT seen within ${minutesSince(start)} min`);
  recordMergeForDeferredVerify(page, {
    role: 'source', counterpartName: targetName, expected: 'merged', merged: false, leadUrl: source.url, form: formOf(reader),
  });
  return false;
}

/**
 * MERGE expected, read on the TARGET side: reload the target record until its log reads "<source>, has been merged into
 * this lead", for up to waitTimes.leadMergeMigWindow. For steps that open the survivor first (CRM-12370_9.7.1 part II).
 */
export async function pollForMergeIntoTargetOnMig(
  page: Page,
  reader: LeadPageMig | OpportunityPageMig,
  target: { url: string; name: string },
  sourceName: string,
): Promise<boolean> {
  const start = Date.now();
  const deadline = start + CommonUtils.waitTimes.leadMergeMigWindow;
  console.log(`  - Polling     : ${target.name} for "${sourceName}, has been merged into this lead."`);
  console.log(`  - Budget      : ${CommonUtils.waitTimes.leadMergeMigWindow / 60000} min, every ${CommonUtils.waitTimes.leadMergeMigPoll / 1000} s`);
  for (let attempt = 1; ; attempt++) {
    await openRecordByUrl(page, reader, target.url);
    await reader.waitForChatterMessagesMig();
    if (await reader.hasSourceLeadMergeMessage(sourceName)) {
      console.log(`  - Merge seen  : after ${minutesSince(start)} min (attempt ${attempt})`);
      return true;
    }
    if (Date.now() + CommonUtils.waitTimes.leadMergeMigPoll > deadline) break;
    console.log(`    attempt ${attempt}: not merged yet (${minutesSince(start)} min)`);
    await page.waitForTimeout(CommonUtils.waitTimes.leadMergeMigPoll);
  }
  console.log(`  - Merge NOT seen within ${minutesSince(start)} min`);
  recordMergeForDeferredVerify(page, {
    role: 'target', counterpartName: sourceName, expected: 'merged', merged: false, leadUrl: target.url, form: formOf(reader),
  });
  return false;
}

/**
 * NO merge expected: watch the whole waitTimes.leadMergeMigWindow, reloading every record and reading its log for a
 * "has been merged into" line. Stops early (and reports which record) the moment a merge shows up.
 */
export async function watchNoMergeWindowOnMig(
  page: Page,
  reader: LeadPageMig,
  records: Array<{ url: string; name: string }>,
): Promise<string | null> {
  const start = Date.now();
  const deadline = start + CommonUtils.waitTimes.leadMergeMigWindow;
  console.log(`  - Watching    : ${records.map((r) => r.name).join(' | ')}`);
  console.log(`  - Window      : ${CommonUtils.waitTimes.leadMergeMigWindow / 60000} min (covers one 20-min re-scan after the leads are ~10 min old)`);
  for (let attempt = 1; ; attempt++) {
    for (const r of records) {
      await openRecordByUrl(page, reader, r.url);
      await reader.waitForChatterMessagesMig();
      const log = await reader.getChatterLogText();
      if (/has been merged into/.test(log)) {
        console.log(`  - MERGE SEEN on ${r.name} after ${minutesSince(start)} min - window stopped early`);
        return r.name;
      }
    }
    if (Date.now() + CommonUtils.waitTimes.leadMergeMigPoll > deadline) break;
    console.log(`    check ${attempt}: no merge (${minutesSince(start)} min)`);
    await page.waitForTimeout(CommonUtils.waitTimes.leadMergeMigPoll);
  }
  console.log(`  - No merge during the ${minutesSince(start)}-min window`);
  // Deferred checkpoint per record (Jenkins round-1 only): round-2 confirms ~90 min later that still no merge happened.
  for (const r of records) {
    const others = records.filter((o) => o !== r).map((o) => o.name).join(' | ');
    recordMergeForDeferredVerify(page, {
      role: 'any', counterpartName: others, expected: 'not_merged', merged: false, leadUrl: r.url, form: 'lead',
    });
  }
  return null;
}

// ------------------------------------------------------------------------------------------------
// Verification (baseline assertions, unchanged) + VERIFY block
// ------------------------------------------------------------------------------------------------

export type CheckKind =
  | 'tags' // contains every `expected`, and none of `not`
  | 'tagsObserve'
  | 'company'
  | 'address'
  | 'salesTeam'
  | 'salesTeamObserve'
  | 'salesperson'
  | 'email'
  | 'contact'
  | 'leadFormBe'
  | 'leadFormContains'
  | 'activeTrue'
  | 'activeFalse'
  | 'isWon'
  | 'lostReason'
  | 'sourceMergeMsg' // "<expected>, has been merged into this lead." present
  | 'noSourceMergeMsg'
  | 'targetMergeMsg' // "This lead has been merged into <expected>" present
  | 'noTargetMergeMsg'
  | 'noAnyMergeMsg' // no "has been merged into" line at all, either direction (Lead page only)
  | 'registeredDeal'
  | 'dealStart'
  | 'dealEnd';

export interface Check {
  /** the baseline's test.step label for this verification point - test.step label AND stdout banner */
  label: string;
  kind: CheckKind;
  expected?: string | string[];
  /** tags only: values that must NOT be present */
  not?: string[];
  /** what a FAIL would mean, printed on the Expected line (REQUIREMENT #4a) */
  meaning?: string;
}

interface VerifyRow {
  what: string;
  expected: string;
  actual: string;
  result: 'PASS' | 'FAIL' | 'OBSERVED';
  /** FAIL only - what differs between Expected and Actual (REQUIREMENT #4c); computed, never a cause or a fix */
  difference?: string;
}

/** Collects every verification point of one test and prints the VERIFY block (REQUIREMENT #4). */
export class MergeVerifyLog {
  private rows: VerifyRow[] = [];
  add(row: VerifyRow): void {
    // a FAIL added without its Difference (e.g. the spec's own Step 1 row) gets the scalar form
    if (row.result === 'FAIL' && !row.difference) row.difference = `expected ${row.expected}, got '${row.actual}'`;
    this.rows.push(row);
  }
  failed(): VerifyRow[] {
    return this.rows.filter((r) => r.result === 'FAIL');
  }
  print(outcome: string): void {
    console.log('\n==================== VERIFY ====================');
    let n = 0;
    const failures: string[] = [];
    for (const r of this.rows) {
      if (r.result === 'OBSERVED') {
        console.log(`  Observation (not scored) - ${r.what} : ${r.actual}`);
        continue;
      }
      n++;
      console.log(`  Verify #${n} - ${r.what}:`);
      console.log(`     Expected : ${r.expected}`);
      console.log(`     Actual   : ${r.actual}`);
      console.log(`     Result   : ${r.result}`);
      if (r.result === 'FAIL') {
        console.log(`     Difference : ${r.difference}`);
        failures.push(`Verify #${n}: ${r.difference}`);
      }
    }
    console.log('================================================');
    console.log(failures.length === 0 ? `OVERALL: PASS - ${outcome}` : `OVERALL: FAIL - ${failures.join(' | ')}`);
  }
}

/** The labelled rows read only where a user can see them (BasePage.readVisibleFormRow): label + evidence key. */
const VISIBLE_ROW: Partial<Record<CheckKind, { label: string; key: string }>> = {
  company: { label: 'Company Name', key: 'company-name' },
  address: { label: 'Address', key: 'address' },
  contact: { label: 'Contact Name', key: 'contact-name' },
  leadFormBe: { label: 'Lead Form', key: 'lead-form' },
  leadFormContains: { label: 'Lead Form', key: 'lead-form' },
  activeTrue: { label: 'Active', key: 'active' },
  activeFalse: { label: 'Active', key: 'active' },
  isWon: { label: 'Is Won', key: 'is-won' },
  lostReason: { label: 'Lost Reason', key: 'lost-reason' },
};

/**
 * Checks that live only in the LAST of the two "CRM Developer" tabs: the first one shows Lead Form but not Is Won /
 * Active / Lost Reason, and the old readers then took the hidden copy (pre-prod 1103654, 2026-11-02,
 * probe-preprod-crm-developer-tabs). The 9.x specs open the first tab for the source lead.
 */
const LAST_DEV_TAB_KINDS: CheckKind[] = ['activeTrue', 'activeFalse', 'isWon', 'lostReason'];

const HIGHLIGHT: Partial<Record<CheckKind, string>> = {
  tags: '.o_form_view [name="tag_ids"]',
  email: '.o_form_view [name="email_from"]',
  // the cells readVisibleFormRow() read - the [name="..."] widgets have hidden copies (3 contact_name, all hidden on crm-mig)
  company: LeadPage.verifyRow('company-name'),
  address: LeadPage.verifyRow('address'),
  contact: LeadPage.verifyRow('contact-name'),
  activeTrue: LeadPage.verifyRow('active'),
  activeFalse: LeadPage.verifyRow('active'),
  isWon: LeadPage.verifyRow('is-won'),
  lostReason: LeadPage.verifyRow('lost-reason'),
  salesTeam: '.o_form_view [name="team_id"]',
  leadFormBe: LeadPage.verifyRow('lead-form'),
  leadFormContains: LeadPage.verifyRow('lead-form'),
  sourceMergeMsg: '.o_mail_thread',
  noSourceMergeMsg: '.o_mail_thread',
  targetMergeMsg: '.o_mail_thread',
  noTargetMergeMsg: '.o_mail_thread',
  noAnyMergeMsg: '.o_mail_thread',
};

function asList(v: string | string[] | undefined): string[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

/**
 * One baseline verification step: optional `before` (open a tab), then one nested test.step per verification
 * point - read, record the Expected/Actual row, assert with expect.soft (a crm-mig run takes up to 55 min, so one
 * run reports EVERY difference instead of stopping at the first), and one verify-point evidence capture of the
 * step's screen state in which every field is outlined in the colour of ITS OWN checks.
 * Company Name / Address / Contact Name and the CRM Developer fields are read only where shown
 * (BasePage.readVisibleFormRow): after a merge the main-sheet rows are hidden, and Active / Is Won / Lost Reason exist
 * only in the LAST "CRM Developer" tab - the label readers returned the hidden copies (CRM-542_1.2.1.1, 2026-11-02).
 */
export async function verifyStep(
  page: Page,
  testInfo: TestInfo,
  vlog: MergeVerifyLog,
  reader: LeadPageMig | OpportunityPageMig,
  stepLabel: string,
  checks: Check[],
  before?: () => Promise<unknown>,
): Promise<void> {
  await test.step(stepLabel, async () => {
    console.log(`\n--- ${stepLabel} ---`);
    if (before) await before();
    const devKind = checks.find((c) => LAST_DEV_TAB_KINDS.includes(c.kind))?.kind;
    if (devKind) {
      // one screen state for the whole step: when the opened tab does not show the field, open the LAST "CRM Developer"
      const row = VISIBLE_ROW[devKind]!;
      const probe = await reader.readVisibleFormRow(row.label, row.key, null);
      if (probe.where.startsWith('not visible')) {
        await openNotebookTabMig(page, 'CRM Developer', 'last');
        console.log(`  - Notebook    : "${row.label}" is not on the opened tab - the LAST "CRM Developer" tab opened (it carries Is Won / Active / Lost Reason)`);
      }
    }
    const lines: string[] = [];
    let allPassed = true;
    // per highlighted element: PASS only while every check read from it passed
    const outlines = new Map<string, boolean>();

    for (const c of checks) {
      await test.step(c.label, async () => {
        console.log(`--- ${c.label} ---`);
        const exp = asList(c.expected);
        let actual = '';
        let passed: boolean | null = true;
        let expectedText = exp.join(', ');
        let difference = '';
        let where = '';

        switch (c.kind) {
          case 'tags':
          case 'tagsObserve': {
            actual = (await reader.getTagsText()).replace(/\s+/g, ' ').trim();
            if (c.kind === 'tagsObserve') { passed = null; break; }
            const diffs: string[] = [];
            for (const v of exp) { expect.soft(actual, `${c.label} - contains "${v}"`).toContain(v); if (!actual.includes(v)) { passed = false; diffs.push(`'${v}' not found`); } }
            for (const v of c.not ?? []) { expect.soft(actual, `${c.label} - must not contain "${v}"`).not.toContain(v); if (actual.includes(v)) { passed = false; diffs.push(`'${v}' found but must be absent`); } }
            difference = diffs.join('; ');
            expectedText = `contains ${exp.map((v) => `"${v}"`).join(' + ')}${c.not?.length ? `; NOT ${c.not.map((v) => `"${v}"`).join(', ')}` : ''}`;
            break;
          }
          case 'company':
          case 'address':
          case 'contact': {
            const row = VISIBLE_ROW[c.kind]!;
            const read = await reader.readVisibleFormRow(row.label, row.key);
            actual = read.value;
            where = read.where;
            expect.soft(actual, `${c.label} - read where shown (${where})`).toContain(exp[0]);
            passed = actual.includes(exp[0]);
            expectedText = `contains "${exp[0]}" (on the screen)`;
            difference = `'${exp[0]}' not found in '${actual || '(empty)'}' (${where})`;
            break;
          }
          case 'salesTeam':
          case 'salesTeamObserve':
          case 'salesperson':
          case 'email': {
            const read: Record<string, () => Promise<string>> = {
              salesTeam: () => reader.getSalesTeamValue(),
              salesTeamObserve: () => reader.getSalesTeamValue(),
              salesperson: () => reader.getSalespersonValue(),
              email: () => reader.getEmailReadonly(),
            };
            actual = ((await read[c.kind]()) || '').replace(/\s+/g, ' ').trim();
            if (c.kind === 'salesTeamObserve') { passed = null; break; }
            expect.soft(actual, c.label).toContain(exp[0]);
            passed = actual.includes(exp[0]);
            expectedText = `contains "${exp[0]}"`;
            difference = `'${exp[0]}' not found in '${actual || '(empty)'}'`;
            break;
          }
          case 'leadFormContains': {
            const read = await reader.readVisibleFormRow('Lead Form', 'lead-form', null);
            actual = read.value;
            where = read.where;
            expect.soft(actual, `${c.label} - read where shown (${where})`).toContain(exp[0]);
            passed = actual.includes(exp[0]);
            expectedText = `contains "${exp[0]}"`;
            difference = `'${exp[0]}' not found in '${actual || '(empty)'}' (${where})`;
            break;
          }
          case 'leadFormBe':
          case 'isWon':
          case 'lostReason': {
            const row = VISIBLE_ROW[c.kind]!;
            const read = await reader.readVisibleFormRow(row.label, row.key, null);
            where = read.where;
            expect.soft(read.value, `${c.label} - read where shown (${where})`).toBe(exp[0]);
            passed = read.value === exp[0];
            expectedText = exp[0] === '' ? 'BLANK' : `"${exp[0]}"`;
            actual = read.value === '' ? 'BLANK' : `"${read.value}"`;
            difference = `expected ${expectedText}, got ${actual} (${where})`;
            break;
          }
          case 'activeTrue':
          case 'activeFalse': {
            const read = await reader.readVisibleFormRow('Active', 'active', null);
            where = read.where;
            const want = c.kind === 'activeTrue';
            // no shown checkbox (checked === null) fails both ways - a hidden copy proves nothing
            if (want) expect.soft(read.checked, `${c.label} - read where shown (${where})`).toBe(true);
            else expect.soft(read.checked, `${c.label} - read where shown (${where})`).toBe(false);
            passed = read.checked === want;
            expectedText = want ? 'TRUE' : 'FALSE';
            actual = read.checked === null ? 'NO SHOWN CHECKBOX' : read.checked ? 'TRUE' : 'FALSE';
            difference = `expected ${expectedText}, got ${actual} (${where})`;
            break;
          }
          case 'sourceMergeMsg':
          case 'noSourceMergeMsg': {
            await reader.waitForChatterMessagesMig();
            const found = await reader.hasSourceLeadMergeMessage(exp[0]);
            const want = c.kind === 'sourceMergeMsg';
            if (want) expect.soft(found, c.label).toBeTruthy(); else expect.soft(found, c.label).toBeFalsy();
            passed = found === want;
            expectedText = `"${exp[0]}, has been merged into this lead." ${want ? 'PRESENT' : 'ABSENT'}`;
            actual = found ? 'FOUND' : 'NOT FOUND';
            difference = want ? `'${exp[0]}, has been merged into this lead.' not found` : `'${exp[0]}, has been merged into this lead.' found but must be absent`;
            break;
          }
          case 'targetMergeMsg':
          case 'noTargetMergeMsg': {
            await reader.waitForChatterMessagesMig();
            const found = await reader.hasTargetLeadMergeMessage(exp[0]);
            const want = c.kind === 'targetMergeMsg';
            if (want) expect.soft(found, c.label).toBeTruthy(); else expect.soft(found, c.label).toBeFalsy();
            passed = found === want;
            expectedText = `"This lead has been merged into ${exp[0]}." ${want ? 'PRESENT' : 'ABSENT'}`;
            actual = found ? 'FOUND' : 'NOT FOUND';
            difference = want ? `'This lead has been merged into ${exp[0]}.' not found` : `'This lead has been merged into ${exp[0]}.' found but must be absent`;
            break;
          }
          case 'noAnyMergeMsg': {
            await reader.waitForChatterMessagesMig();
            const found = /has been merged into/.test(await (reader as LeadPageMig).getChatterLogText());
            expect.soft(found, c.label).toBeFalsy();
            passed = !found;
            expectedText = 'no "has been merged into" log note';
            actual = found ? 'merge note FOUND' : 'none';
            difference = `a 'has been merged into' log note found but must be absent`;
            break;
          }
          case 'registeredDeal': {
            const on = await (reader as LeadPage).isRegisteredDealChecked();
            expect.soft(on, c.label).toBeTruthy();
            passed = Boolean(on);
            expectedText = 'TRUE';
            actual = on ? 'TRUE' : 'FALSE';
            difference = `expected TRUE, got ${actual}`;
            break;
          }
          case 'dealStart':
          case 'dealEnd': {
            actual = c.kind === 'dealStart'
              ? await (reader as LeadPage).getDealRegistrationStartDate()
              : await (reader as LeadPage).getDealRegistrationEndDate();
            expect.soft(actual, c.label).toBe(exp[0]);
            passed = actual === exp[0];
            expectedText = `"${exp[0]}"`;
            difference = `expected "${exp[0]}", got "${actual}"`;
            break;
          }
        }

        if (c.meaning) expectedText = `${expectedText} (${c.meaning})`;
        if (passed === null) {
          vlog.add({ what: c.label, expected: '', actual: actual || '(empty)', result: 'OBSERVED' });
          console.log(`  Observation (not scored): ${actual || '(empty)'}`);
          return;
        }
        const shownActual = `${actual || '(empty)'}${where ? `  [read on: ${where}]` : ''}`;
        vlog.add({ what: c.label, expected: expectedText, actual: shownActual, result: passed ? 'PASS' : 'FAIL', difference: passed ? undefined : difference });
        console.log(`  Expected : ${expectedText}`);
        console.log(`  Actual   : ${shownActual}`);
        console.log(`  Result   : ${passed ? 'PASS' : 'FAIL'}`);
        if (!passed) console.log(`  Difference : ${difference}`);
        lines.push(`${passed ? 'PASS' : 'FAIL'} ${c.label}`);
        lines.push(`  expected: ${expectedText}`);
        lines.push(`  actual  : ${shownActual}`);
        if (!passed) lines.push(`  difference: ${difference}`);
        if (!passed) allPassed = false;
        const hl = HIGHLIGHT[c.kind];
        if (hl) outlines.set(hl, (outlines.get(hl) ?? true) && passed);
      });
    }

    if (lines.length > 0) {
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: stepLabel,
        passed: allPassed,
        outlines: [...outlines].map(([selector, ok]) => ({ selector, passed: ok })),
        lines,
        corner: 'bottom-right',
      }).catch(() => {});
    }
  });
}

// ------------------------------------------------------------------------------------------------
// Clean-up (crm-mig rule: delete what the run made, deny-list, count first)
// ------------------------------------------------------------------------------------------------

type Row = { id: number; name: string };

/** Records carrying THIS run's marker, read as the current session (inactive ones included). */
async function findRunRecords(platform: MigPlatformPage, run: LeadMergingRun): Promise<{ leads: Row[]; partners: Row[] }> {
  const opts = { limit: MAX_ROWS_PER_RUN + 1, context: { active_test: false } };
  const leads = await platform.callKw<Row[]>('crm.lead', 'search_read', [
    ['|', ['email_from', 'ilike', run.marker], '&', ['name', 'ilike', run.tc], ['name', 'ilike', run.runId]],
    ['id', 'name'],
  ], opts);
  const partners = await platform.callKw<Row[]>('res.partner', 'search_read', [
    ['|', ['email', 'ilike', run.marker], ['name', 'ilike', run.marker]],
    ['id', 'name'],
  ], opts);
  return { leads, partners };
}

/**
 * afterEach: register every record carrying this run's marker (partners Odoo created from the run's e-mails are
 * known only this way), then delete everything registered via the shared crm-mig teardown. Screenshots at start/end.
 */
export async function teardownLeadMergingRun(
  page: Page,
  testInfo: TestInfo,
  run: LeadMergingRun | undefined,
  skip: boolean,
): Promise<void> {
  await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
  if (testInfo.status !== testInfo.expectedStatus) {
    const reason = testInfo.error?.message?.split('\n').slice(0, 6).join('\n').trim();
    if (reason) console.log(`TEST FAILED - reason:\n   ${reason.replace(/\n/g, '\n   ')}`);
  }
  if (run && !skip) {
    try {
      const platform = new MigPlatformPage(page);
      const { leads, partners } = await findRunRecords(platform, run);
      console.log(`[mig-cleanup] marker "${run.marker}": crm.lead=${leads.length} res.partner=${partners.length}`);
      if (leads.length > MAX_ROWS_PER_RUN || partners.length > MAX_ROWS_PER_RUN) {
        console.log(`[mig-cleanup] STOPPED - more than ${MAX_ROWS_PER_RUN} rows carry the marker; nothing extra registered (count before unlink)`);
      } else {
        leads.forEach((r) => registerMigRecord('crm.lead', r.id, `${r.name} (run marker)`));
        partners.forEach((r) => registerMigRecord('res.partner', r.id, `${r.name} (run marker)`, { deleteLast: true }));
      }
    } catch (err) {
      console.log(`[mig-cleanup] marker lookup failed - ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
    }
  }
  await teardownMigRecords(page, skip);
  await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
}

/** afterAll safety net: own admin session, deletes what still carries a marker of a run started in this worker. */
export async function sweepLeadMergingRunsAfterAll(browser: Browser, skip: boolean): Promise<void> {
  test.setTimeout(CommonUtils.waitTimes.pageLoad);
  if (skip) {
    console.log('[mig-sweep] SKIPPED by the spec cleanup toggle');
    return;
  }
  if (runsInThisWorker.length === 0) return;
  let context: BrowserContext | undefined;
  try {
    context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new LoginPageMig(page);
    await loginPage.navigateTo(baseUrl_mig);
    await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
    const platform = new MigPlatformPage(page);
    for (const run of runsInThisWorker) {
      if (migCleanupHandedOff(run.tc)) {
        console.log(`[mig-sweep] "${run.marker}": teardown handed to the round-2 re-verify - its records are left for it to delete`);
        continue;
      }
      const { leads, partners } = await findRunRecords(platform, run);
      console.log(`[mig-sweep] marker "${run.marker}": crm.lead=${leads.length} res.partner=${partners.length}`);
      if (leads.length > MAX_ROWS_PER_RUN || partners.length > MAX_ROWS_PER_RUN) {
        console.log(`[mig-sweep] STOPPED for "${run.marker}" - more rows than one run creates; nothing deleted`);
        continue;
      }
      for (const [model, rows] of [['crm.lead', leads], ['res.partner', partners]] as Array<[string, Row[]]>) {
        for (const r of rows) {
          try {
            await platform.callKw(model, 'unlink', [[r.id]]);
            console.log(`  [mig-sweep] deleted ${model}#${r.id} (${r.name})`);
          } catch (err) {
            console.log(`  [mig-sweep] LEFTOVER ${model}#${r.id} (${r.name}) - ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
          }
        }
      }
    }
  } catch (err) {
    console.log(`[mig-sweep] SKIPPED - could not open a sweep session: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
  } finally {
    await context?.close().catch(() => {});
  }
}
