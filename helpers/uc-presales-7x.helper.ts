import { Page, TestInfo, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { LoginPage, HomePage, OpportunityPage, SESupportPage, HelpdeskPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Shared building blocks for the pre-sale-7.7 .. 7.15 suite (Xray CRM-12203 .. CRM-12235, folder
 * /CRM test/CRM module/Pre-sales SE support/7.7 .. 7.15). All of it runs on PRE-PRODUCTION
 * (`baseUrl`), the current SE-support flow: Opportunity "Request SE support" -> "New Ticket" window ->
 * a Helpdesk ticket on the "Sales Engineers" team.
 *
 * Unlike the 7.1 .. 7.6 helpers these functions emit NO test.step of their own: the spec owns every
 * step label (one module-scope STEP const = the test.step label AND the stdout banner), and calls
 * these inside the step that the manual TC names.
 */

/** Fresh, unique run data - every TC builds its own Opportunity and request (REQUIREMENT #2). */
export function presalesRunId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${stamp}${Math.floor(Math.random() * 900 + 100)}`;
}

/** The reseller used wherever a TC asks for "an existing active Reseller". */
export const PRESALES_RESELLER = 'TEST-Reseller#Automation-Jun10';

export interface PresalesOppInput {
  /** Opportunity Name, e.g. "SE Raise Dialog <unique>". */
  oppName: string;
  /** Company (Company Name on the Opp form), e.g. "Test Co <unique>". */
  companyName: string;
  /**
   * Email - only some TCs list it. Specs that read the Opportunity "Tickets" smart button add it: without
   * an Email (with a Reseller set) that button stayed hidden in two runs on 2026-10-15 - cause not isolated.
   */
  email?: string;
  /** Country - the TCs always use United States. */
  country?: string;
  /** Expected Revenue (header "Expected Revenue", field planned_revenue_custom). */
  expectedRevenue: string;
  /** Reseller name, or null/undefined to leave it BLANK. */
  reseller?: string | null;
}

/** Sign out whoever is signed in and sign in as `user` on pre-production. */
export async function signInAs(page: Page, user: { username: string; password: string }, who: string): Promise<void> {
  const loginPage = new LoginPage(page);
  await loginPage.logout(baseUrl).catch(() => {});
  await page.context().clearCookies();
  await loginPage.navigateTo(baseUrl);
  await loginPage.login(user.username, user.password);
  await loginPage.dismissLocationPermissionDialog().catch(() => {});
  console.log(`  - Signed in as ${who} (${user.username})`);
}

/**
 * Pre-condition shared by most 7.7 .. 7.15 TCs: as the Salesperson Thomas Semerich open CRM, click
 * CREATE on the pipeline list and save an Opportunity with exactly the fields the TC lists. Returns the
 * saved Opportunity URL. Logs every field on its own line.
 */
export async function createPresalesOpportunityAsThomas(page: Page, input: PresalesOppInput): Promise<string> {
  const homePage = new HomePage(page);
  const opportunityPage = new OpportunityPage(page);
  const country = input.country ?? 'United States';

  await signInAs(page, users.sale_ic_thomas, 'Salesperson Thomas Semerich');
  await homePage.navigateToCRM();
  await opportunityPage.switchToListView();
  await opportunityPage.clickCreate();

  console.log('  Opportunity to create:');
  console.log(`    - Opportunity Name   = ${input.oppName}`);
  console.log(`    - Company            = ${input.companyName}`);
  console.log(`    - Email              = ${input.email ?? 'blank'}`);
  console.log(`    - Country            = ${country}`);
  console.log(`    - Expected Revenue   = ${input.expectedRevenue}`);
  console.log(`    - Reseller           = ${input.reseller ?? 'blank'}`);

  await opportunityPage.fillOpportunityName(input.oppName);
  await opportunityPage.fillCompanyName(input.companyName);
  if (input.email) await opportunityPage.fillEmail(input.email);
  await opportunityPage.selectCountry(country);
  await opportunityPage.fillExpectedRevenueDeal(input.expectedRevenue);
  if (input.reseller) {
    const ok = await opportunityPage.fillReseller(input.reseller);
    expect(ok, `Pre-condition: the Reseller "${input.reseller}" should be selectable on the Opportunity`).toBeTruthy();
  }
  await opportunityPage.saveAndWaitForCompletion();
  const oppUrl = page.url();
  const savedName = await opportunityPage.getOpportunityNameValue();
  console.log(`  - Saved Opportunity URL : ${oppUrl}`);
  expect(/[#?&]id=\d+/.test(oppUrl), 'Pre-condition: the Opportunity should be saved (URL carries a record id)').toBeTruthy();
  expect(savedName, 'Pre-condition: the Opportunity name should persist after save').toContain(input.oppName);
  if (input.email) {
    // The Email makes pre-production create the customer Company/Contact asynchronously - wait for it so
    // the Opportunity is complete before anything is raised from it.
    await opportunityPage.openByUrl(oppUrl);
    const populated = await opportunityPage.waitForCompanyAndContactPopulated();
    console.log(`  - Customer created from the Email : Company "${populated.companyValue}" | Contact "${populated.contactValue}"`);
  }
  return oppUrl;
}

export interface SERequestInput {
  subject: string;
  description: string;
  supportType: string;
}

/**
 * Raise an SE support request from an Opportunity (the signed-in user must be the Salesperson):
 * open the Opp -> "Request SE support" -> fill Subject / Description / Support type (Meeting Time left
 * at the default the window pre-fills, Meeting link blank) -> Tab -> SAVE.
 */
export async function raiseSERequestFromOpportunity(page: Page, oppUrl: string, req: SERequestInput): Promise<void> {
  const opportunityPage = new OpportunityPage(page);
  const seSupportPage = new SESupportPage(page);
  console.log('  New Ticket window input:');
  console.log(`    - Subject      = ${req.subject}`);
  console.log('    - Meeting Time = left at the window default (pre-production pre-fills it)');
  console.log(`    - Description  = ${req.description}`);
  console.log('    - Meeting link = blank');
  console.log(`    - Support type = ${req.supportType}`);
  await opportunityPage.openByUrl(oppUrl);
  await opportunityPage.clickRequestSESupport();
  await seSupportPage.waitForWindowOpen();
  await seSupportPage.fillSubject(req.subject);
  await seSupportPage.fillDescription(req.description);
  await seSupportPage.selectSupportType(req.supportType);
  await seSupportPage.save();
}

/** Wait (reload-and-retry) for the Opportunity chatter line that confirms a raised request. */
export async function waitForRaiseLogNote(page: Page, oppUrl: string, subject: string): Promise<{ found: boolean; expected: string }> {
  const opportunityPage = new OpportunityPage(page);
  const expected = `A new ticket has been opened by the customer: ${subject}`;
  await opportunityPage.openByUrl(oppUrl);
  const r = await opportunityPage.waitForChatterContaining(expected, 6, CommonUtils.waitTimes.long, CommonUtils.waitTimes.pageLoad);
  console.log(`  - Opportunity chatter "${expected}" : ${r.found ? 'FOUND' : 'NOT FOUND'}`);
  return { found: r.found, expected };
}

/**
 * As the signed-in Sales Engineer: Helpdesk > Sales Engineers > Tickets (list view), search the
 * Subject, and open the ticket.
 */
export async function openSETicketFromHelpdesk(page: Page, subject: string): Promise<void> {
  const homePage = new HomePage(page);
  const helpdesk = new HelpdeskPage(page);
  await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.pageLoad);
  await helpdesk.navigateToHelpdesk();
  await helpdesk.openSalesEngineersTickets();
  await helpdesk.switchToListView();
  await helpdesk.searchTicket(subject);
  const visible = await helpdesk.isTicketVisible(subject);
  expect(visible, `the ticket "${subject}" should be listed under Helpdesk > Sales Engineers > Tickets`).toBeTruthy();
  await helpdesk.openTicket(subject);
}

/** Print a VERIFY block (REQUIREMENT #4) and return the overall verdict. */
export interface VerifyLine {
  what: string;
  expected: string;
  actual: string;
  pass: boolean;
}
export function printVerify(lines: VerifyLine[], outcome: string): boolean {
  const ok = lines.every((l) => l.pass);
  console.log('\n==================== VERIFY ====================');
  lines.forEach((l, i) => {
    console.log(`  Verify #${i + 1} - ${l.what}:`);
    console.log(`     Expected : ${l.expected}`);
    console.log(`     Actual   : ${l.actual}`);
    console.log(`     Result   : ${l.pass ? 'PASS' : 'FAIL'}`);
  });
  console.log('===============================================');
  console.log(`OVERALL: ${ok ? 'PASS' : 'FAIL'} - ${outcome}`);
  return ok;
}

/** Same lines, shortened for the evidence caption burned into the screenshot. */
export function verifyCaption(lines: VerifyLine[]): string[] {
  return lines.map((l, i) => `#${i + 1} ${l.pass ? 'PASS' : 'FAIL'} - ${l.what}: ${l.actual}`.slice(0, 160));
}

/** Set-equality on two label lists (order ignored, whitespace-collapsed). */
export function sameSet(actual: string[], expected: string[]): boolean {
  const a = [...new Set(actual.map((s) => s.trim()))].sort();
  const e = [...new Set(expected.map((s) => s.trim()))].sort();
  return a.length === e.length && a.every((v, i) => v === e[i]);
}

export type { TestInfo };
