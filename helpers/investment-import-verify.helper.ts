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

/** Investment > Leads tab: the Opportunity / Email of its first lead row (pre-production shows the link here). */
export async function readInvestmentLeadsTab(page: Page, investmentUrl: string): Promise<{ opportunity: string; email: string }> {
  const inv = new InvestmentPage(page);
  await inv.goto(investmentUrl, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await inv.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.pageLoad).catch(() => {});
  await page.waitForTimeout(CommonUtils.waitTimes.long);
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
 * CRM-12370_8.8.2 / CRM-3902_1.2.1 - II. Verify point, Target Opp (from CSV-Audience-copy2): the
 * pre-production baseline is NO merge, the Target keeps its own Investment#2.
 */
export function noMergeTargetChecks(
  rowCount: number,
  v: OpportunityView,
  hasMergedIntoThisLeadLog: boolean,
  exp: { investmentDbId: number; investmentOnForm?: string },
): VerifyCheck[] {
  const checks: VerifyCheck[] = [
    { label: 'Opportunities found for Email_Contact#1 (2 = not merged)', expected: 2, actual: rowCount },
    { label: 'Target Opp - Active', expected: true, actual: v.active },
    { label: 'Target Opp - Stage = New (status bar, upper-cased by the theme)', expected: 'NEW', actual: v.stage.toUpperCase() },
    { label: 'Target Opp - Lost Reason', expected: '', actual: v.lostReason },
    { label: 'Target Opp - Create manually', expected: true, actual: v.createManually },
  ];
  if (exp.investmentOnForm !== undefined) {
    checks.push({ label: 'Target Opp - Investment = Name_Investment#2', expected: exp.investmentOnForm, actual: v.investment });
  }
  checks.push(
    { label: 'Target Opp - CRM Developer tab - Lead form', expected: `Investment: ID-${exp.investmentDbId}`, actual: v.leadForm },
    { label: 'Target Opp - Tags (exactly 1 value)', expected: ['Can_Merge'], actual: v.tags },
    { label: 'Target Opp - Log carries "<Source>, has been merged into this lead"', expected: false, actual: hasMergedIntoThisLeadLog },
  );
  return checks;
}

/** CRM-12370_8.8.2 / CRM-3902_1.2.1 - Source Opp (Name_Contact#1, edited in step I): unchanged, not merged. */
export function noMergeSourceChecks(
  v: OpportunityView,
  hasMergedIntoTargetLog: boolean,
  exp: { investmentOnForm?: string },
): VerifyCheck[] {
  const checks: VerifyCheck[] = [
    { label: 'Source Opp - Active', expected: true, actual: v.active },
    { label: 'Source Opp - Stage = New (status bar, upper-cased by the theme)', expected: 'NEW', actual: v.stage.toUpperCase() },
    { label: 'Source Opp - Lost Reason', expected: '', actual: v.lostReason },
  ];
  if (exp.investmentOnForm !== undefined) {
    checks.push({ label: 'Source Opp - Investment = Name_Investment#1 (unchanged)', expected: exp.investmentOnForm, actual: v.investment });
  }
  checks.push(
    { label: 'Source Opp - CRM Developer tab - Lead form', expected: 'License', actual: v.leadForm },
    { label: 'Source Opp - Tags (any order)', expected: ['Product Registration', 'test'], actual: [...v.tags].sort() },
    { label: 'Source Opp - Log carries "This lead has been merged into <Target>"', expected: false, actual: hasMergedIntoTargetLog },
  );
  return checks;
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
