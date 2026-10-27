/**
 * UI readers for the Expected Result of the Investments audience-import TCs
 * (CRM-2482_3.1.1.1.1-3 / CRM-3902_1.2.1 on pre-production, CRM-12370_8.4.1-3 / 8.8.2 on crm-mig).
 *
 * They only READ what a user sees - the CRM list, the Opportunity form, the Contacts list and
 * forms, the Investment > Leads tab - through the page objects. The spec does the asserting and
 * prints the VERIFY block; these return the on-screen values it asserts on.
 *
 * Expected results (pre-production baseline measured 2026-10-21) are written in the master file
 * 'Migration - Setup New CRM' J384-J386 / J411 and in the Jira TCs CRM-9795/9796/9797/9963.
 */
import { Page } from '@playwright/test';
import { OpportunityPage } from '@pages/OpportunityPage';
import { ContactPage } from '@pages/ContactPage';
import { InvestmentPage } from '@pages/InvestmentPage';
import { CommonUtils } from '@helpers/common.utils';

/** What the Opportunity form shows. `investment` is read only where the form carries it (crm-mig). */
export interface OpportunityView {
  url: string;
  opportunity: string;
  stage: string;
  companyName: string;
  contactName: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  country: string;
  salesTeam: string;
  salesperson: string;
  tags: string[];
  investment: string;
  createManually: boolean | null;
  leadForm: string;
  active: boolean | null;
  lostReason: string;
}

export interface ContactView {
  url: string;
  name: string;
  relatedCompany: string;
  email: string;
  phone: string;
  country: string;
  salesTeam: string;
  salesperson: string;
  tags: string[];
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/​/g, '').replace(/\s+/g, ' ').trim();

/**
 * On the CRM app (already opened by the caller - the navigation differs per host): switch to the
 * list view, remove "My Pipeline", search the email and return the number of rows it shows.
 */
export async function searchOpportunitiesByEmail(page: Page, email: string): Promise<number> {
  const opp = new OpportunityPage(page);
  await opp.switchToListView();
  await opp.removeMyPipelineFilter();
  await page.waitForTimeout(CommonUtils.waitTimes.standard);
  await opp.searchByEmail(email);
  await page.waitForTimeout(CommonUtils.waitTimes.standard);
  return await opp.countListRows();
}

/**
 * From the searched list: open the Opportunity (by name when given, else the row carrying the
 * email) and read the fields of the sheet, then the CRM Developer tab.
 */
export async function readOpportunity(
  page: Page,
  opts: { email: string; oppName?: string; readInvestmentOnForm: boolean },
): Promise<OpportunityView> {
  const opp = new OpportunityPage(page);
  if (opts.oppName) await opp.clickOppRowByOppName(opts.oppName);
  else await opp.clickOppRowByEmail(opts.email);
  await page.waitForTimeout(CommonUtils.waitTimes.long);
  const view: OpportunityView = {
    url: page.url(),
    opportunity: clean(await opp.getOpportunityNameValue()),
    stage: clean(await opp.getActiveStatusBarStage()),
    companyName: clean(await opp.getFieldDisplayValue('partner_name')),
    contactName: clean(await opp.getFieldDisplayValue('contact_name')),
    company: clean(await opp.getFieldPartnerName('partner_id')),
    contact: clean(await opp.getFieldPartnerName('contact_partner_id')),
    email: clean(await opp.getEmailReadonly()),
    phone: clean(await opp.getPhoneValue()),
    country: clean(await opp.getFieldDisplayValue('country_id')),
    salesTeam: clean(await opp.getSalesTeamValue()),
    salesperson: clean(await opp.getSalespersonValue()),
    tags: (await opp.getTagList()).map(clean),
    investment: opts.readInvestmentOnForm ? clean(await opp.getFieldPartnerName('activity_id')) : '',
    createManually: await opp.isCreatedManuallyChecked(),
    leadForm: '',
    active: null,
    lostReason: '',
  };
  await opp.clickCRMDeveloperTab();
  view.leadForm = clean(await opp.getLeadFormValue());
  view.active = await opp.isActiveChecked();
  view.lostReason = clean(await opp.getLostReasonValueViaTextContent());
  return view;
}

/**
 * Lean reader for the merge outcome (CRM-12370_8.8.2 / CRM-3902_1.2.1): ONLY the fields the checks use -
 * Opportunity name, Tags, Investment (where the form shows it), then CRM Developer tab Active + Lost Reason.
 * The full readOpportunity() on a MERGED (archived) Opportunity opened from Archive > All hung ~19 min on
 * 2026-10-21 (several getters wait their full default timeout for widgets that form does not render), which
 * blew the 67-min test budget. Every field the checks do not need is left at its empty default.
 */
export async function readMergeOutcome(
  page: Page,
  opts: { readInvestmentOnForm: boolean },
): Promise<OpportunityView> {
  // The caller has opened the Opportunity (openFromAllLeadsByName).
  const opp = new OpportunityPage(page);
  const t0 = Date.now();
  // Each read is capped: a widget the archived form does not render yields '(timeout)' - a visible FAIL in the
  // VERIFY block - instead of an unbounded wait (this repo sets no actionTimeout).
  const capped = async <T>(label: string, read: () => Promise<T>, fallback: T): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<T>((resolve) => {
      timer = setTimeout(() => { console.log(`    ! ${label}: no value within ${CommonUtils.waitTimes.abnormalWait / 1000} s`); resolve(fallback); },
        CommonUtils.waitTimes.abnormalWait);
    });
    const pending = read();
    pending.catch(() => {}); // a read abandoned on timeout must not surface later as an unhandled rejection
    try { return await Promise.race([pending, limit]); } finally { if (timer) clearTimeout(timer); }
  };
  const view: OpportunityView = {
    url: page.url(), stage: '', companyName: '', contactName: '', company: '', contact: '', email: '', phone: '',
    country: '', salesTeam: '', salesperson: '', createManually: null, leadForm: '',
    opportunity: clean(await capped('Opportunity name', () => opp.getOpportunityNameValue(), '(timeout)')),
    tags: (await capped('Tags', () => opp.getTagList(), ['(timeout)'])).map(clean),
    investment: opts.readInvestmentOnForm ? clean(await capped('Investment', () => opp.getFieldPartnerName('activity_id'), '(timeout)')) : '',
    active: null,
    lostReason: '',
  };
  await capped('CRM Developer tab', () => opp.clickCRMDeveloperTab(), undefined);
  view.active = await capped('Active', () => opp.isActiveChecked(), null);
  view.lostReason = clean(await capped('Lost Reason', () => opp.getLostReasonValueViaTextContent(), '(timeout)'));
  console.log(`    (read in ${Math.round((Date.now() - t0) / 1000)} s)`);
  return view;
}

/**
 * CRM > Archive > All, drop the favorites, search the Opportunity NAME alone (unique per run), return the row
 * count and open the first row. The name must be searched WITHOUT the email: both land in the same
 * "Opportunity" facet, which Odoo ORs - on 2026-10-21 an email+name search opened the same (merged) record for
 * both Opportunities. The caller opened the CRM app (the navigation differs per host).
 */
export async function openFromAllLeadsByName(page: Page, oppName: string): Promise<number> {
  const opp = new OpportunityPage(page);
  await opp.navigateToAllLeads();
  await page.waitForTimeout(CommonUtils.waitTimes.standard);
  await opp.clearSearchFacets({ favoritesOnly: true });
  await opp.searchByName(oppName);
  const rows = await opp.countListRows();
  console.log(`  - Archive > All rows for "${oppName}" : ${rows}`);
  if (rows > 0) await opp.openFirstListRecord();
  return rows;
}

/**
 * Teardown: delete THIS Investment in place (openInvestmentForm, then deleteCurrentRecord), retrying when the
 * Action menu does not offer "Delete" yet - right after an XLSX import it did not, twice on 2026-10-21, while the
 * same record offered it a few minutes later.
 */
export async function deleteInvestmentByUrl(page: Page, investmentUrl: string, attempts = 3): Promise<void> {
  const inv = new InvestmentPage(page);
  for (let attempt = 1; ; attempt++) {
    await openInvestmentForm(page, investmentUrl);
    try {
      await inv.deleteCurrentRecord();
      return;
    } catch (e) {
      if (attempt >= attempts) throw e;
      console.log(`  ! "Delete" not offered (attempt ${attempt}/${attempts}) - retrying after ${CommonUtils.waitTimes.mergeReverifyBudget / 1000} s`);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.mergeReverifyBudget);
    }
  }
}

/** Prints what readMergeOutcome() read, one field per line. */
export function logMergeOutcome(title: string, v: OpportunityView): void {
  console.log(`  ${title}`);
  console.log(`    - URL         : ${v.url}`);
  console.log(`    - Opportunity : ${v.opportunity}`);
  console.log(`    - Tags        : ${JSON.stringify(v.tags)}`);
  console.log(`    - Investment  : ${v.investment || '(not on this form)'}`);
  console.log(`    - Active      : ${v.active}`);
  console.log(`    - Lost Reason : ${v.lostReason || '(blank)'}`);
}

/** Prints an Opportunity view one field per line (the step's evidence). */
export function logOpportunity(title: string, v: OpportunityView): void {
  console.log(`  ${title}`);
  console.log(`    - URL             : ${v.url}`);
  console.log(`    - Opportunity     : ${v.opportunity}`);
  console.log(`    - Stage           : ${v.stage}`);
  console.log(`    - Company Name    : ${v.companyName}`);
  console.log(`    - Contact Name    : ${v.contactName}`);
  console.log(`    - Company         : ${v.company}`);
  console.log(`    - Contact         : ${v.contact}`);
  console.log(`    - Email           : ${v.email}`);
  console.log(`    - Phone           : ${v.phone}`);
  console.log(`    - Country         : ${v.country}`);
  console.log(`    - Sales Team      : ${v.salesTeam}`);
  console.log(`    - Salesperson     : ${v.salesperson}`);
  console.log(`    - Tags            : ${JSON.stringify(v.tags)}`);
  console.log(`    - Investment      : ${v.investment || '(not on this form)'}`);
  console.log(`    - Create manually : ${v.createManually}`);
  console.log(`    - Lead form       : ${v.leadForm}`);
  console.log(`    - Active          : ${v.active}`);
  console.log(`    - Lost Reason     : ${v.lostReason || '(blank)'}`);
}

/**
 * Opens THIS Investment's form in the current tab with a full reload (a hash-only goto can leave the previous
 * record on screen) and checks the URL carries its id - so a following deleteCurrentRecord() hits this record.
 */
export async function openInvestmentForm(page: Page, investmentUrl: string): Promise<void> {
  const inv = new InvestmentPage(page);
  const id = /[#&?]id=(\d+)/.exec(investmentUrl)?.[1] ?? '';
  await inv.goto(investmentUrl, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await inv.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.pageLoad).catch(() => {});
  await page.waitForTimeout(CommonUtils.waitTimes.long);
  if (id && !new RegExp(`[#&?]id=${id}(&|$)`).test(page.url())) {
    throw new Error(`openInvestmentForm: expected Investment #${id} on screen, the URL is ${page.url()}`);
  }
}

/** Investment > Leads tab: the Opportunity / Email of its first lead row (pre-production shows the link here). */
export async function readInvestmentLeadsTab(page: Page, investmentUrl: string): Promise<{ opportunity: string; email: string }> {
  const inv = new InvestmentPage(page);
  await openInvestmentForm(page, investmentUrl);
  await inv.clickLeadsTab();
  await inv.waitForLeadsRowToAppear();
  return {
    opportunity: clean(await inv.getLeadsFirstRowCellText('Opportunity')),
    email: clean(await inv.getLeadsFirstRowCellText('Email')),
  };
}

/**
 * Contacts > search the email. Returns the row names, the row names left by the "Companies" filter,
 * and the two forms (company first, then the individual contact).
 */
export async function readImportedContacts(
  page: Page,
  email: string,
  personName: string,
): Promise<{ rowNames: string[]; companyRowNames: string[]; company: ContactView; person: ContactView }> {
  const contacts = new ContactPage(page);
  await contacts.openContactsList();
  await contacts.searchContactsByEmail(email);
  const rowNames = (await contacts.getListRowNames()).map(clean);
  await contacts.applyCompaniesFilter();
  const companyRowNames = (await contacts.getListRowNames()).map(clean);
  await contacts.openFirstListRecord();
  const company = await readContactForm(page);
  await contacts.openContactsList();
  await contacts.searchContactsByName(personName);
  await contacts.openFirstListRecord();
  const person = await readContactForm(page);
  return { rowNames, companyRowNames, company, person };
}

async function readContactForm(page: Page): Promise<ContactView> {
  const c = new ContactPage(page);
  await page.waitForTimeout(CommonUtils.waitTimes.long);
  return {
    url: page.url(),
    name: clean(await c.getFieldDisplayValue('name')),
    relatedCompany: clean(await c.getFieldPartnerName('parent_id')),
    email: clean(await c.getFieldDisplayValue('email')),
    phone: clean(await c.getFieldDisplayValue('phone')),
    country: clean(await c.getFieldDisplayValue('country_id')),
    salesTeam: clean(await c.getFieldPartnerName('team_id')),
    salesperson: clean(await c.getFieldPartnerName('user_id')),
    tags: (await c.getTagList()).map(clean),
  };
}

/** One verification point: the spec asserts `actual` toEqual `expected` under `label`. */
export interface VerifyCheck {
  label: string;
  expected: unknown;
  actual: unknown;
}

const show = (v: unknown) => (typeof v === 'string' ? v || '(blank)' : JSON.stringify(v));

/** Prints the VERIFY block (Expected / Actual / Result per check + OVERALL) and returns the lines. */
export function printVerify(checks: VerifyCheck[], outcome: string): { allPass: boolean; lines: string[] } {
  const lines: string[] = [];
  let allPass = true;
  checks.forEach((c, i) => {
    const pass = JSON.stringify(c.actual) === JSON.stringify(c.expected);
    allPass = allPass && pass;
    lines.push(`Verify #${i + 1} - ${c.label}: Expected ${show(c.expected)} | Actual ${show(c.actual)} | ${pass ? 'PASS' : 'FAIL'}`);
  });
  console.log('\n==================== VERIFY ====================');
  checks.forEach((c, i) => {
    const pass = JSON.stringify(c.actual) === JSON.stringify(c.expected);
    console.log(`  Verify #${i + 1} - ${c.label}:`);
    console.log(`     Expected : ${show(c.expected)}`);
    console.log(`     Actual   : ${show(c.actual)}`);
    console.log(`     Result   : ${pass ? 'PASS' : 'FAIL'}`);
  });
  console.log('===============================================');
  console.log(`OVERALL: ${allPass ? 'PASS' : 'FAIL'} - ${outcome}`);
  return { allPass, lines };
}

/** Expected Result 1 of the 8.4.x / CRM-2482_3.1.1.1.x TCs - the ONE Opportunity the import created. */
export function importedOpportunityChecks(
  rowCount: number,
  v: OpportunityView,
  exp: { contactName: string; companyName: string; email: string; investmentDbId: number; investmentOnForm?: string },
): VerifyCheck[] {
  const checks: VerifyCheck[] = [
    { label: 'Opportunities found for Email_Contact#1 (list, "My Pipeline" removed)', expected: 1, actual: rowCount },
    { label: '1.1 Opportunity', expected: exp.contactName, actual: v.opportunity },
    // The status bar prints stage names upper-case (CSS) on both hosts - compare case-insensitively.
    { label: '1.1 Stage = New (status bar, upper-cased by the theme)', expected: 'NEW', actual: v.stage.toUpperCase() },
    { label: '1.2 Company Name', expected: exp.companyName, actual: v.companyName },
    { label: '1.2 Contact Name', expected: exp.contactName, actual: v.contactName },
    { label: '1.3 Company', expected: exp.companyName, actual: v.company },
    { label: '1.3 Contact', expected: `${exp.companyName}, ${exp.contactName}`, actual: v.contact },
    { label: '1.4 Email', expected: exp.email, actual: v.email },
    { label: '1.4 Phone', expected: '1234125125', actual: v.phone },
    { label: '1.4 Country', expected: 'China', actual: v.country },
    { label: '1.5 Sales Team', expected: 'CMR', actual: v.salesTeam },
    { label: '1.5 Salesperson', expected: 'Sergey Karachin', actual: v.salesperson },
    { label: '1.6 Tags (exactly 1 value)', expected: ['test'], actual: v.tags },
  ];
  if (exp.investmentOnForm !== undefined) {
    checks.push({ label: '1.7 Investment (on the Opportunity form)', expected: exp.investmentOnForm, actual: v.investment });
  }
  checks.push(
    { label: '1.8 CRM Developer tab - Lead form', expected: `Investment: ID-${exp.investmentDbId}`, actual: v.leadForm },
    { label: '1.8 CRM Developer tab - Active', expected: true, actual: v.active },
  );
  return checks;
}

/** Expected Result 2 of the 8.4.x / CRM-2482_3.1.1.1.x TCs - the TWO Contacts the import created. */
export function importedContactsChecks(
  r: { rowNames: string[]; companyRowNames: string[]; company: ContactView; person: ContactView },
  exp: { contactName: string; companyName: string; email: string },
): VerifyCheck[] {
  const common = (who: string, c: ContactView): VerifyCheck[] => [
    { label: `${who} Email`, expected: exp.email, actual: c.email },
    { label: `${who} Phone`, expected: '1234125125', actual: c.phone },
    { label: `${who} Country`, expected: 'China', actual: c.country },
    { label: `${who} Sales Team`, expected: 'CMR', actual: c.salesTeam },
    { label: `${who} Salesperson`, expected: 'Sergey Karachin', actual: c.salesperson },
  ];
  return [
    { label: 'Contacts found for Email_Contact#1', expected: 2, actual: r.rowNames.length },
    { label: '2.1 Is a Company - the "Companies" filter keeps exactly Company_Contact#1', expected: [exp.companyName], actual: r.companyRowNames },
    { label: '2.1 Company_Contact#1 Name', expected: exp.companyName, actual: r.company.name },
    ...common('2.1 Company_Contact#1', r.company),
    { label: '2.1 Company_Contact#1 Tags', expected: ['test'], actual: r.company.tags },
    { label: '2.2 Name_Contact#1 Name', expected: exp.contactName, actual: r.person.name },
    { label: '2.2 Name_Contact#1 Related Company', expected: exp.companyName, actual: r.person.relatedCompany },
    ...common('2.2 Name_Contact#1', r.person),
  ];
}

/**
 * CRM-12370_8.8.2 / CRM-3902_1.2.1 - the two same-email Opportunities are merged LATE, by the
 * "NAKIVO: Re-scan same-email duplicate leads (CRM-12621)" cron (every 20 min; measured 18-27 min after the
 * import on 2026-10-21). Polls the default CRM list (active records only) for the email until `target` rows
 * remain. `openCrm` opens the CRM app on the host the spec drives (the navigation differs per host).
 */
export async function waitForActiveOpportunityCount(
  page: Page,
  email: string,
  target: number,
  polls: number,
  openCrm: () => Promise<void>,
): Promise<{ rows: number; pollsUsed: number; waitedMin: number }> {
  const t0 = Date.now();
  const minutes = () => Math.round((Date.now() - t0) / 6000) / 10;
  let rows = -1;
  let pollsUsed = 0;
  while (pollsUsed < polls) {
    pollsUsed++;
    await openCrm();
    rows = await searchOpportunitiesByEmail(page, email);
    console.log(`    poll ${pollsUsed}/${polls} at +${minutes()} min : ${rows} active Opportunities for ${email}`);
    if (rows === target) break;
    if (pollsUsed < polls) await page.waitForTimeout(CommonUtils.waitTimes.mergeReverifyBudget);
  }
  return { rows, pollsUsed, waitedMin: minutes() };
}

/** CRM > Archive > All (active AND archived records), search the email, return the row count. The caller opened CRM. */
export async function searchAllOpportunitiesByEmail(page: Page, email: string): Promise<number> {
  const opp = new OpportunityPage(page);
  await opp.navigateToAllLeads();
  await page.waitForTimeout(CommonUtils.waitTimes.standard);
  // Pre-production opens "All Leads" with a user's DEFAULT favorite applied, which ANDs with the email search
  // and returns 0 rows - drop favorites only, keep whatever filter the action itself sets.
  await opp.clearSearchFacets({ favoritesOnly: true });
  await opp.searchByEmail(email);
  await page.waitForTimeout(CommonUtils.waitTimes.standard);
  return await opp.countListRows();
}

/**
 * Expected Result 2-3 of CRM-12370_8.8.2 / CRM-3902_1.2.1 after the re-scan merge: exactly 1 of the 2
 * Opportunities stays Active, the other is merged (Active FALSE, Lost Reason Duplicate), and no Investment moves.
 * Which one survives is NOT fixed (both directions were measured), so no check assumes it. `investment1OnForm` /
 * `investment2OnForm` = the Investment each Opp must keep, where the form shows the field (crm-mig); on
 * pre-production the spec adds a Leads-tab check instead.
 */
export function rescanMergeChecks(
  allRows: number,
  copy1: OpportunityView,
  copy2: OpportunityView,
  exp: { investment1OnForm?: string; investment2OnForm?: string },
): { checks: VerifyCheck[]; survivor: OpportunityView; merged: OpportunityView } {
  const activeCount = [copy1.active, copy2.active].filter((a) => a === true).length;
  const survivor = copy2.active === true && copy1.active !== true ? copy2 : copy1;
  const merged = survivor === copy1 ? copy2 : copy1;
  const checks: VerifyCheck[] = [
    { label: 'Opportunities for Email_Contact#1 incl. archived (Archive > All)', expected: 2, actual: allRows },
    { label: 'Exactly 1 of the 2 Opportunities is Active', expected: 1, actual: activeCount },
    { label: 'Surviving Opp - Lost Reason', expected: '', actual: survivor.lostReason },
    {
      label: 'Surviving Opp - Tags include "Can_Merge" and "test"',
      expected: ['Can_Merge', 'test'],
      actual: survivor.tags.filter((t) => t === 'Can_Merge' || t === 'test').sort(),
    },
    { label: 'Merged Opp - Active', expected: false, actual: merged.active },
    { label: 'Merged Opp - Lost Reason', expected: 'Duplicate', actual: merged.lostReason },
  ];
  if (exp.investment1OnForm !== undefined) {
    checks.push({ label: 'Opp of CSV-Audience-copy1 keeps Name_Investment#1 (not transferred)', expected: exp.investment1OnForm, actual: copy1.investment });
  }
  if (exp.investment2OnForm !== undefined) {
    checks.push({ label: 'Opp of CSV-Audience-copy2 keeps Name_Investment#2 (not transferred)', expected: exp.investment2OnForm, actual: copy2.investment });
  }
  return { checks, survivor, merged };
}

/** Prints a contact form one field per line. */
export function logContact(title: string, v: ContactView): void {
  console.log(`  ${title}`);
  console.log(`    - URL             : ${v.url}`);
  console.log(`    - Name            : ${v.name}`);
  console.log(`    - Related Company : ${v.relatedCompany || '(blank)'}`);
  console.log(`    - Email           : ${v.email}`);
  console.log(`    - Phone           : ${v.phone}`);
  console.log(`    - Country         : ${v.country}`);
  console.log(`    - Sales Team      : ${v.salesTeam}`);
  console.log(`    - Salesperson     : ${v.salesperson}`);
  console.log(`    - Tags            : ${JSON.stringify(v.tags)}`);
}

/**
 * JSON-RPC `call_kw` in the page's own (logged-in) session, bounded: the request is aborted after `timeoutMs` and
 * the evaluate is raced against the same bound, so a dead page cannot hang a teardown. Never logs the request.
 */
async function rpcBounded<T>(
  page: Page,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {},
  timeoutMs: number = CommonUtils.waitTimes.abnormalWait,
): Promise<T> {
  const call = page.evaluate(async ({ model, method, args, kwargs, timeoutMs }) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch('/web/dataset/call_kw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } }),
        signal: ctl.signal,
      });
      const j = await r.json();
      if (j.error) throw new Error(String((j.error.data || {}).message || j.error.message || 'rpc error').slice(0, 300));
      return j.result;
    } finally {
      clearTimeout(timer);
    }
  }, { model, method, args, kwargs, timeoutMs });
  let guard: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<never>((_, reject) => {
    guard = setTimeout(() => reject(new Error(`RPC ${model}.${method} did not answer within ${timeoutMs} ms`)), timeoutMs + CommonUtils.waitTimes.extraLong);
  });
  try {
    return (await Promise.race([call, bound])) as T;
  } finally {
    if (guard) clearTimeout(guard);
  }
}

/** The crm.lead / res.partner ids an audience-import run left on the base. */
export interface ImportRunRecords {
  leadIds: number[];
  partnerIds: number[];
}

/**
 * Teardown of a pre-production audience-import TC (CRM-3902_1.2.1): deletes the Opportunities and contacts THIS
 * run's import(s) created, found by the run's own marker only - the run's unique Email_Contact#1
 * (Test@company<run date+time>.com) and the run's company names (TEST_company_name_<run timestamp>) - archived
 * rows included (the re-scan merge archives one Opportunity). Deny-list: nothing else is ever selected, and NOTHING
 * is deleted when a count exceeds what the run can have created (`max`) - that mismatch is returned in `refused`
 * instead. Leads go first, then the individual contacts, then the companies. Ends with a read-back (`left`).
 * Added 2026-10-27 - the source TC's own tear-down deletes only the two Investments and the CSV files, so every
 * earlier run left its 2 Opportunities + 4 contacts behind (e.g. leads #1101919-#1101921 of 2026-10-21).
 */
export async function deleteImportRunRecords(
  page: Page,
  marker: { email: string; companyNames: string[] },
  max: { leads: number; partners: number },
): Promise<{ found: ImportRunRecords; left: ImportRunRecords; refused: string; errors: string[] }> {
  const errors: string[] = [];
  const leadDomain = [['email_from', '=ilike', marker.email], '|', ['active', '=', true], ['active', '=', false]];
  const partnerDomain = ['|', ['email', '=ilike', marker.email], ['name', 'in', marker.companyNames], '|', ['active', '=', true], ['active', '=', false]];
  const read = async (): Promise<{ leads: Array<{ id: number }>; partners: Array<{ id: number; is_company: boolean }> }> => ({
    leads: await rpcBounded<Array<{ id: number }>>(page, 'crm.lead', 'search_read', [leadDomain], { fields: ['id'], limit: max.leads + 5 }),
    partners: await rpcBounded<Array<{ id: number; is_company: boolean }>>(page, 'res.partner', 'search_read', [partnerDomain], { fields: ['id', 'is_company'], limit: max.partners + 5 }),
  });
  const before = await read();
  const found = { leadIds: before.leads.map((r) => r.id), partnerIds: before.partners.map((r) => r.id) };
  if (found.leadIds.length > max.leads || found.partnerIds.length > max.partners) {
    return {
      found,
      left: found,
      refused: `found ${found.leadIds.length} leads / ${found.partnerIds.length} contacts for the run marker, more than this run can have created (${max.leads} / ${max.partners}) - nothing deleted`,
      errors,
    };
  }
  if (found.leadIds.length) {
    await rpcBounded(page, 'crm.lead', 'unlink', [found.leadIds], {}, CommonUtils.waitTimes.reAssignationWait)
      .catch((e) => errors.push(`crm.lead ${found.leadIds.join(',')}: ${String(e).split('\n')[0]}`));
  }
  const ordered = [...before.partners].sort((a, b) => Number(a.is_company) - Number(b.is_company)); // individuals first
  for (const p of ordered) {
    await rpcBounded(page, 'res.partner', 'unlink', [[p.id]], {}, CommonUtils.waitTimes.reAssignationWait)
      .catch((e) => errors.push(`res.partner ${p.id}: ${String(e).split('\n')[0]}`));
  }
  const after = await read();
  return { found, left: { leadIds: after.leads.map((r) => r.id), partnerIds: after.partners.map((r) => r.id) }, refused: '', errors };
}

/**
 * Teardown: delete THIS Investment in place - openInvestmentForm() (reload + id check), then Action (confirmed
 * open) > Delete > OK. Unlike deleteInvestmentByUrl() it does not depend on the first click opening the Action menu
 * (measured 2026-10-27: after a reload the first click is lost - see InvestmentPage.openActionMenuConfirmed()).
 */
export async function deleteInvestmentInPlace(page: Page, investmentUrl: string): Promise<void> {
  await openInvestmentForm(page, investmentUrl);
  await new InvestmentPage(page).deleteCurrentRecordConfirmed();
}

/** Read-back for a teardown: which of these Investment ids still exist (bounded RPC on the ids only). */
export async function investmentIdsLeft(page: Page, ids: number[]): Promise<number[]> {
  if (!ids.length) return [];
  const rows = await rpcBounded<Array<{ id: number }>>(page, 'nakivo.investment.activity', 'search_read',
    [[['id', 'in', ids], '|', ['active', '=', true], ['active', '=', false]]], { fields: ['id'], limit: ids.length });
  return rows.map((r) => r.id);
}
