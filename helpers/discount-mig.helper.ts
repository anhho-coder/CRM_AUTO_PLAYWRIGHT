import { Browser, BrowserContext, Page, TestInfo, expect, test } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { OpportunityPage } from '@pages';
import { LoginPageMig, HomePageMig, ContactPageMig, DiscountProgramEditorPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { DISCOUNT_BASELINE, idFromUrl } from '@helpers/discount-baseline.helper';
import { pressNewQuotationOnO12CE } from '@helpers/o12ce-main-business.helper';
import { CRM12144_BASELINE_MAP } from '@helpers/discount-mig.baseline-map';
import { baselineDetailsFrom } from '@helpers/baseline-traceability';
import type { BaselineTestDetails } from '@helpers/baseline-traceability';
import type { Check, DiscountRun } from '@helpers/discount-baseline.helper';

/**
 * crm-mig port of helpers/discount-baseline.helper.ts - shared setup + teardown for the CRM-12144_x.y specs
 * (Discounts (Promotions) on crm-mig, master tab "Migration - Discount"). The pre-production specs Discount_x.y
 * are the BASELINE: their CRM-side flows and assertions are reused unchanged; only the mechanical parts differ:
 *  - host + login: crm-mig (baseUrl_mig) through LoginPageMig, the *_crm_mig accounts;
 *  - navigation: the Mig sidebar theme hides the navbar, so Contacts / CRM lists open by URL hash (HomePageMig);
 *  - teardown: crm-mig rule (CLAUDE.md) - delete exactly what the run created (afterEach) plus an afterAll sweep
 *    that re-finds a run's leftovers by its own marker (the run's unique timestamp), never by a keep-list.
 * Program names, the reward product and the 4 products are the same on crm-mig (nakivo.promotion 9 / product 555,
 * read 2026-10-21), and so are the borrowed partners of DISCOUNT_PARTNERS (Bailey Systems 13512 Bronze 15.0,
 * OptiCom SIA 26882 Gold 25.0, QBS Software Ltd 14474 Distributor 20.0 - same ids and Partner Discount, names unique).
 */

export {
  DISCOUNT_HIGHLIGHT,
  DISCOUNT_PARTNERS,
  money,
  sameCents,
  rewardRows,
  recordChecks,
  idFromUrl,
  newDiscountRun,
  openDealElementFromOpportunity,
  saveDealElement,
  findRunCopy,
} from '@helpers/discount-baseline.helper';
export type { Check, DiscountRun } from '@helpers/discount-baseline.helper';

/**
 * Test details for a crm-mig CRM-12144 spec - `test(title, baselineDetails(TC), body)`: tags and annotations naming
 * the pre-production BASELINE it was ported from (its Xray key and its automation spec), read from
 * CRM12144_BASELINE_MAP. The HTML report shows them as tag chips + annotation lines, Allure as tags; select with
 * `--grep @baseline-preprod`, `--grep @CRM-13778` (a baseline Jira key) or `--grep @Discount_2.1`.
 * Throws for a TC missing from the map, so a new spec cannot ship without its traceability.
 */
export function baselineDetails(tc: string): BaselineTestDetails {
  return baselineDetailsFrom(CRM12144_BASELINE_MAP, tc, {
    mapFile: 'helpers/discount-mig.baseline-map.ts',
    masterTab: 'Migration - Discount',
  });
}

/** Programs, products, pricelists and payment term as crm-mig names them (same strings as pre-production). */
export const DISCOUNT_MIG = { ...DISCOUNT_BASELINE } as const;

/**
 * Bound for every Playwright action of these specs (test.use({ actionTimeout })). playwright.config.ts sets none,
 * so a click on an element that never becomes actionable waits out the whole 15-min test - on crm-mig that hid the
 * real stop point twice (CRM-11806 on 2026-10-16, this suite's pilot on 2026-10-21).
 */
export const MIG_ACTION_TIMEOUT = CommonUtils.waitTimes.abnormalWait * 3;

/** Skip reason of the specs that need a Program-editor write ("chỉ run manual") - see DiscountProgramEditorPageMig. */
export const PROGRAM_EDITOR_MANUAL_REASON = DiscountProgramEditorPageMig.MANUAL_REASON;

/** The VERIFY block on stdout (printed BEFORE asserting, so it shows on a failure too), then one expect per check. */
export function printVerifyAndAssertMig(checks: Check[]): void {
  console.log('==================== VERIFY ====================');
  checks.forEach((c, i) => {
    console.log(`  Verify #${i + 1} - ${c.what}:`);
    console.log(`     Expected : ${c.expected}`);
    console.log(`     Actual   : ${c.actual}`);
    console.log(`     Result   : ${c.passed ? 'PASS' : 'FAIL'}`);
  });
  console.log('===============================================');
  const failed = checks.filter((c) => !c.passed).length;
  console.log(`OVERALL: ${failed ? 'FAIL' : 'PASS'} - ${checks.length - failed}/${checks.length} checks hold on crm-mig`);
  for (const c of checks) expect(c.passed, `${c.what}: expected ${c.expected}, got ${c.actual}`).toBe(true);
}

/**
 * recordChecks with a READABLE evidence banner (skill REQUIREMENT #3b): each check is printed as its own block -
 * the check, then "Expected :", "Actual   :" and "Result   :" on separate lines, long values wrapped - instead of one
 * `what: expected ... | actual ...` line that runs off the image (CRM-12144_5.3 on 2026-10-26: the banner of the
 * "Signed in as" shot was cut at the right edge and covered the value it reported). `corner` puts the banner away
 * from the outlined element. Same bookkeeping as recordChecks: the checks are appended to `all` and logged.
 */
export async function recordChecksMig(
  page: Page,
  testInfo: TestInfo,
  all: Check[],
  stepChecks: Check[],
  name: string,
  highlight: string[] = [],
  corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'top-right',
): Promise<void> {
  all.push(...stepChecks);
  for (const c of stepChecks) console.log(`  - ${c.what} : ${c.actual} (${c.passed ? 'PASS' : 'FAIL'})`);
  const WIDTH = 100;
  const wrap = (label: string, text: string): string[] => {
    const out: string[] = [];
    let line = label;
    for (const word of String(text).split(/\s+/)) {
      if (line.length + word.length + 1 > WIDTH && line.trim().length > label.trim().length) {
        out.push(line);
        line = ' '.repeat(label.length);
      }
      line += (line.endsWith(' ') || line === '' ? '' : ' ') + word;
    }
    out.push(line);
    return out;
  };
  const lines = stepChecks.flatMap((c, i) => [
    ...(i ? [''] : []),
    ...wrap('', c.what),
    ...wrap('  Expected : ', c.expected),
    ...wrap('  Actual   : ', c.actual),
    `  Result   : ${c.passed ? 'PASS' : 'FAIL'}`,
  ]);
  await CommonUtils.captureVerifyEvidence(page, testInfo, { name, passed: stepChecks.every((c) => c.passed), highlight, lines, corner }).catch(() => {});
}

/**
 * Sign in on crm-mig as the given user, in the current context, and PROVE the switch: the previous crm-mig session is
 * logged out server-side (/web/session/logout - clearing cookies alone is racy, see LoginPage.logout: an in-flight
 * answer of the old page can set the old session cookie again and the new login then silently no-ops), crm-mig's own
 * cookies are cleared, the login form is submitted, and the session's login (/web/session/get_session_info) is read
 * back - a session that is not `user.username` is a failed attempt. Review 2026-10-26 (CRM-12144_7.5, report
 * 2026-10-26-200935): the qty-6 save of "as the salesperson" ran as the administrator after a cookie-only switch.
 * Only crm-mig is logged out, so a Program editor session (discount-crm-mig) opened earlier in the same test survives.
 */
export async function signInMig(page: Page, user: { username: string; password: string }): Promise<void> {
  const loginPage = new LoginPageMig(page);
  // ONE retry, logged: on 2026-10-21 (evening, crm-mig under load) 5 of 10 specs lost their login - the form never
  // rendered its Email box in 90 s (page stuck on "Loading" or a 502 Bad Gateway). A second failure is reported as is.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      // server-side logout of whoever holds the crm-mig session (a no-op redirect to the login page when nobody does)
      await loginPage.logout(baseUrl_mig).catch(() => {});
      await page.context().clearCookies({ domain: /(^|\.)crm-mig\.nakivo\.site$/ });
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(user.username, user.password);
      const session = await readSessionMig(page);
      if (session.login !== user.username) throw new Error(`signed in as "${session.login}" (uid ${session.uid || '-'}), not ${user.username} - the user switch did not take`);
      console.log(`  - Session : ${session.login} (uid ${session.uid}) - read back after sign-in`);
      return;
    } catch (e) {
      const heading = ((await page.locator('h1').first().textContent({ timeout: CommonUtils.waitTimes.long }).catch(() => '')) || '').trim();
      if (attempt === 2) throw new Error(`crm-mig login failed twice for ${user.username} (screen: "${heading || 'no heading'}"): ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      console.log(`  ! crm-mig login did not complete for ${user.username} (screen: "${heading || 'no heading'}"; ${e instanceof Error ? e.message.split('\n')[0] : String(e)}) - waiting, then one retry`);
      await page.waitForTimeout(CommonUtils.waitTimes.abnormalWait);
    }
  }
}

/** [INTERNAL check, Call API] The crm-mig session the page holds: uid + login (0 / "(no session: ...)" when none). */
export async function readSessionMig(page: Page): Promise<{ uid: number; login: string }> {
  let timer: NodeJS.Timeout | undefined;
  const guard = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('get_session_info did not answer')), CommonUtils.waitTimes.abnormalWait * 2); });
  return Promise.race([
    page.evaluate(async () => {
      const res = await fetch('/web/session/get_session_info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: {} }) });
      const json = await res.json().catch(() => ({}));
      return { uid: Number(json?.result?.uid) || 0, login: String(json?.result?.username || '') };
    }),
    guard,
  ]).finally(() => timer && clearTimeout(timer)).catch((e: Error) => ({ uid: 0, login: `(no session: ${e.message.split('\n')[0]})` }));
}

/**
 * The user who ACTS in a step, asserted where the step acts (skill REQUIREMENT #2a) - one scored check plus its evidence
 * shot (REQUIREMENT #3b): the session's login is read back and the top-bar user name is outlined. Use it right after a
 * mid-test signInMig, e.g. "as the salesperson, change Ordered Qty to 6".
 */
export async function recordSignedInUserMig(
  page: Page,
  testInfo: TestInfo,
  all: Check[],
  user: { username: string; displayName?: string },
  label: string,
  name: string,
): Promise<void> {
  const session = await readSessionMig(page);
  const shown = await new LoginPageMig(page).getSignedInUserName();
  await recordChecksMig(page, testInfo, all, [
    {
      what: `${label} - the step acts as ${user.username}${user.displayName ? ` (${user.displayName})` : ''} (another login = the step ran as the wrong user)`,
      expected: `session login = ${user.username}`,
      actual: `session login = ${session.login} (uid ${session.uid || '-'}); top bar shows "${shown || '(nothing)'}"`,
      passed: session.login === user.username,
    },
  ], name, [LoginPageMig.SIGNED_IN_USER], 'bottom-right'); // banner away from the top bar it outlines
}

/**
 * signedInRoleCheckMig WITH its evidence shot (REQUIREMENT #3b): the role check is recorded through recordChecksMig, so
 * the image outlines the signed-in user's name in the top bar and carries the Expected / Actual groups in its banner -
 * a RED role check has a "- FAIL.png" of its own (review 2026-10-26: checks.push() of the bare check left none).
 */
export async function recordSignedInRoleMig(
  page: Page,
  testInfo: TestInfo,
  all: Check[],
  user: { username: string },
  group: string,
  label: string,
  name: string,
): Promise<void> {
  const check = await signedInRoleCheckMig(page, user, group, label);
  await new LoginPageMig(page).getSignedInUserName(); // right after sign-in the top bar may not be drawn yet
  await recordChecksMig(page, testInfo, all, [check], name, [LoginPageMig.SIGNED_IN_USER], 'bottom-right'); // banner away from the top bar
}

/**
 * [INTERNAL check, Call API] The ROLE a TC names, read off the crm-mig session the page is signed in with: the
 * session's login (/web/session/get_session_info) and the user's groups (res.groups whose users hold the uid, with
 * their application = category_id and every group they imply = trans_implied_ids).
 * Returns ONE scored check that holds when (1) the signed-in login is `user.username` and (2) the user is a MEMBER
 * of `group`, implied membership included. Tester's rule (2026-10-19, re-confirmed 2026-10-27): a role is group
 * MEMBERSHIP, not an exclusive Sales level - "Sales / User: All Documents" implies "Sales / User: Own Documents Only",
 * and a user holding it is a valid "Own Documents Only" user (Thomas). The user's highest role in the application is
 * printed for information only; it is not scored.
 * Prints the user's groups of that application one per line with the ones above `group` marked (stdout = evidence).
 * Tester decision 2026-10-26 (NEW_AND_UNSPECCED_TCS.md v2): every spec asserts the role, not only the login.
 * @param label the step the check belongs to, e.g. 'Pre-condition 2' (default 'Pre-condition 1')
 */
export async function signedInRoleCheckMig(page: Page, user: { username: string }, group: string, label: string = 'Pre-condition 1'): Promise<Check> {
  const session = await readSessionMig(page);
  type GroupRow = { id: number; full_name: string; category_id: [number, string] | false; trans_implied_ids: number[] };
  let readError = '';
  const groups: GroupRow[] = session.uid
    ? await rpcMig(page, 'res.groups', 'search_read', [[['users', 'in', [session.uid]]]], { fields: ['full_name', 'category_id', 'trans_implied_ids'], limit: 300 }, CommonUtils.waitTimes.abnormalWait * 2)
      .then((rows: GroupRow[]) => rows, (e: Error) => { readError = e.message.split('\n')[0]; return [] as GroupRow[]; })
    : [];
  const target = groups.find((g) => g.full_name === group);
  const app = group.split(' / ')[0];
  const sameApp = groups
    .filter((g) => (target && target.category_id && g.category_id ? g.category_id[0] === target.category_id[0] : g.full_name.startsWith(`${app} /`)))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const above = target ? sameApp.filter((g) => g.id !== target.id && (g.trans_implied_ids || []).includes(target.id)) : [];
  // the user's highest role(s) in the application: held groups no other held group of the same application implies
  const highest = sameApp.filter((g) => !sameApp.some((o) => o.id !== g.id && (o.trans_implied_ids || []).includes(g.id))).map((g) => g.full_name);
  console.log(`  [INTERNAL check, Call API] role of the signed-in crm-mig user:`);
  console.log(`    - login (session)  : ${session.login} (uid ${session.uid || '-'})`);
  console.log(`    - groups read      : ${groups.length}${readError ? ` (groups not read: ${readError})` : ''}`);
  console.log(`    - "${app}" groups held (">" = implies "${group}", i.e. a HIGHER role):`);
  for (const g of sameApp) console.log(`      ${above.includes(g) ? '>' : ' '} ${g.full_name}`);
  console.log(`    - highest "${app}" role : ${highest.join(', ') || '(none)'}`);
  const passed = session.login === user.username && !!target; // membership, implied included - not the highest role
  return {
    what: `${label} - the signed-in crm-mig user is ${user.username} and is a member of "${group}" (implied membership counts; a FAIL means the run did not use the role the TC names)`,
    expected: `${user.username}, member of "${group}"`,
    actual: `${session.login}, ${!target ? `NOT in "${group}"` : `member of "${group}"${above.length ? ` (also holds the higher ${above.map((g) => `"${g.full_name}"`).join(', ')} - information, not scored)` : ''}`}`,
    passed,
  };
}

/**
 * Open a BORROWED (migrated) company's form on crm-mig, read-only: its id is looked up by exact name (companies only)
 * and must be unique, then the form is opened by URL and gated on the name. Nothing is edited.
 * @returns the res.partner id
 */
export async function openBorrowedCompanyFormMig(page: Page, name: string): Promise<number> {
  const ids: number[] = await rpcMig(page, 'res.partner', 'search', [[['name', '=', name], ['is_company', '=', true]]], { limit: 5 });
  if (ids.length !== 1) throw new Error(`Borrowed company "${name}": expected exactly 1 company on crm-mig, found ${ids.length} (${ids.join(', ')})`);
  const opened = await new ContactPageMig(page).openContactFormByUrl(`${baseUrl_mig}web#id=${ids[0]}&model=res.partner&view_type=form`, name);
  if (!opened) throw new Error(`Borrowed company "${name}" (id ${ids[0]}): its form did not render`);
  return ids[0];
}

/**
 * Leave a borrowed company's form with a FULL page load of the web client (never a hash change), so the form's widgets
 * still loading in the background cannot fail on a view that is gone. CRM-12144_1.17 on 2026-10-26: going from Bailey
 * Systems' form straight to Contacts by hash raised an "Odoo Client Error" over the list, which then blocked CREATE.
 */
export async function leaveBorrowedCompanyFormMig(page: Page): Promise<void> {
  const contactPage = new ContactPageMig(page);
  await page.goto(`${baseUrl_mig}web`, { waitUntil: 'domcontentloaded', timeout: CommonUtils.waitTimes.pageLoad });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: CommonUtils.waitTimes.pageLoad });
  await contactPage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.pageLoad).catch(() => {});
  if (await contactPage.dismissErrorDialog()) console.log('  ⚠ an "Odoo Client Error" was shown after leaving the borrowed company form - dismissed (setup navigation, not a check)');
}

/**
 * "Click New quotation" on a saved Deal Element, crm-mig style. O12 CE creates the quotation in place (~45 s later)
 * and leaves the screen on the Deal Element (grounded 2026-09-21, see pressNewQuotationOnO12CE) - so the quotation
 * is found by its opportunity, its form is opened, and its id is recorded for teardown. Throws when none appears.
 * @returns the quotation's sale.order id
 */
export async function newQuotationMig(page: Page, run: DiscountRun, opportunityId: number | undefined = run.leadId): Promise<number> {
  const outcome = await pressNewQuotationOnO12CE(page, { opportunityId: opportunityId ? String(opportunityId) : '' });
  const id = Number(outcome.quotationId) || 0;
  if (id) run.saleOrderIds.push(id);
  if (!outcome.landedOnQuotation || !id) {
    throw new Error(`New quotation on crm-mig: no quotation form reached (navigated = ${outcome.navigated}, quotation id = ${outcome.quotationId || '(none)'})`);
  }
  return id;
}

/**
 * Setup navigation only: an "Odoo Client Error" that crm-mig raises a few seconds AFTER a list rendered (CRM-12144_1.17,
 * 2026-10-26, twice, both in the 2nd test of a --repeat-each=2 run: it covered the Contacts list and CREATE then timed
 * out at 90 s). Waits briefly for it, prints its details (See details) so the cause stays on record, then presses OK.
 * Never used around a check - a refusal a TC verifies is read by the spec, not cleared here.
 */
async function clearLateClientErrorMig(page: Page, where: string): Promise<void> {
  const dialog = page.locator('xpath=//div[contains(@class,"modal") and contains(@class,"show")][.//*[contains(normalize-space(),"Odoo Client Error") or contains(normalize-space(),"Odoo Server Error")]]')
    .or(page.locator('.modal.show').filter({ hasText: /Odoo (Client|Server) Error/ })).first();
  const shown = await dialog.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.long * 2 }).then(() => true, () => false);
  if (!shown) return;
  await dialog.getByText('See details', { exact: true }).click({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => {});
  const text = ((await dialog.innerText({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  console.log(`  ⚠ ${where}: crm-mig showed an Odoo error dialog (setup navigation, not a check) - pressing OK. Text: "${text.slice(0, 700)}"`);
  await dialog.getByRole('button', { name: /^\s*ok\s*$/i }).click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
  await dialog.waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
}

/**
 * Contacts > Create on crm-mig: a new end-customer company (no Reseller, no Distributor) with the given pricelist.
 * Same data as the pre-production baseline (Country / State / Sales Team / Salesperson / Pricelist).
 */
export async function createEndCustomerCompanyMig(
  page: Page,
  run: DiscountRun,
  salesperson: { displayName: string },
  pricelist: string = DISCOUNT_MIG.pricelistUsd
): Promise<void> {
  const homePage = new HomePageMig(page);
  const contactPage = new ContactPageMig(page);
  console.log('  Company to create (crm-mig):');
  console.log(`    - Name        = ${run.company}`);
  console.log(`    - Type        = Company (end customer: no Reseller, no Distributor)`);
  console.log(`    - Email       = ${run.email}`);
  console.log(`    - Country     = United States`);
  console.log(`    - State       = Maryland`);
  console.log(`    - Sales Team  = BDEU`);
  console.log(`    - Salesperson = ${salesperson.displayName}`);
  console.log(`    - Pricelist   = ${pricelist}`);
  await homePage.navigateToContacts();
  await clearLateClientErrorMig(page, 'Contacts list, before CREATE');
  await contactPage.clickCreate();
  // ContactPage.createContact() hung on the crm-mig form (2026-10-21) - the Mig variant fills it by field name
  run.partnerId = await contactPage.createCompanyMig({
    name: run.company,
    email: run.email,
    country: 'United States',
    state: 'Maryland',
    salesTeam: 'BDEU',
    salesperson: salesperson.displayName,
    pricelist,
  }) || idFromUrl(page.url());
  if (!run.partnerId) throw new Error(`Company ${run.company} was not saved on crm-mig - no record id in ${page.url()}`);
  console.log(`  ✓ Company saved, id = ${run.partnerId}`);
}

/**
 * CRM > Pipeline (LIST view) > Create on crm-mig: a new opportunity whose Company is the run's company (linked by
 * the background job through the e-mail). Same fields as the pre-production baseline.
 */
/**
 * crm-mig: a notebook-tab click on an unsaved form can change the URL hash, and the web client then asks "The record
 * has been modified, your changes will be discarded. Do you want to proceed?" (CRM-12144_2.7, 2026-10-22: it covered
 * SAVE on the new opportunity). OK would throw the record away - answer CANCEL and stay on the form.
 */
async function keepUnsavedFormMig(page: Page): Promise<void> {
  const dialog = page.locator('.modal.show').filter({ hasText: /changes will be discarded/i }).first();
  const shown = await dialog.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.standard }).then(() => true).catch(() => false);
  if (!shown) return;
  console.log('    ⚠ "The record has been modified, your changes will be discarded" - CANCEL (keep the unsaved form)');
  await dialog.getByRole('button', { name: /^\s*cancel\s*$/i }).click({ timeout: CommonUtils.waitTimes.abnormalWait });
  await dialog.waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
}

export async function createOpportunityForCompanyMig(
  page: Page,
  run: DiscountRun,
  salesperson: { displayName: string },
  opts: { name?: string } = {}
): Promise<string> {
  const homePage = new HomePageMig(page);
  const opportunityPage = new OpportunityPage(page);
  const oppName = opts.name ?? run.opp;
  console.log('  Opportunity to create (crm-mig):');
  console.log(`    - Name         = ${oppName}`);
  console.log(`    - Email        = ${run.email}`);
  console.log(`    - Company Name = ${run.company}`);
  console.log(`    - Street       = 123 street`);
  console.log(`    - Country      = United States`);
  console.log(`    - State        = Maryland`);
  console.log(`    - Sales Team   = BDEU`);
  console.log(`    - Salesperson  = ${salesperson.displayName}`);
  console.log(`    - Lead Form    = Download Free Trial`);
  console.log(`    - Stage        = New`);
  await homePage.navigateToOpportunitiesList();
  await opportunityPage.clickCreate();
  await opportunityPage.fillOpportunityName(oppName);
  await opportunityPage.fillEmail(run.email);
  await opportunityPage.fillCompanyName(run.company);
  await opportunityPage.fillStreet('123 street');
  await opportunityPage.selectCountry('United States');
  await opportunityPage.selectState('Maryland');
  await opportunityPage.selectSalesTeam('BDEU');
  await opportunityPage.selectSalesperson(salesperson.displayName);
  await opportunityPage.uncheckCreatedManually().catch(() => {});
  await opportunityPage.clickCRMDeveloperTab().catch(() => {});
  await keepUnsavedFormMig(page);
  await opportunityPage.fillLeadForm('Download Free Trial').catch(() => {});
  await opportunityPage.selectStage('New');
  await keepUnsavedFormMig(page);
  await opportunityPage.clickSave();
  await opportunityPage.waitForSaveComplete();
  await opportunityPage.waitForIdInUrlAndExtract();
  const url = page.url();
  const id = idFromUrl(url);
  if (!id) throw new Error(`Opportunity ${oppName} was not saved on crm-mig - no record id in ${url}`);
  if (opts.name) run.extraLeadIds.push(id);
  else { run.urlOpp = url; run.leadId = id; }
  // the Company link is filled by a background job after the e-mail is entered - wait for it, and stop here if it
  // never links (the Deal Element would open without a customer or pricelist)
  const linked = await opportunityPage
    .waitForContactFieldPopulated(run.company, 6, CommonUtils.waitTimes.long * 4)
    .then((r) => r.contactFieldFound && (r.contactValue ?? '').includes(run.company))
    .catch(() => false);
  if (!linked) throw new Error(`Opportunity ${oppName}: Company ${run.company} was not linked by the background job on crm-mig - the Deal Element would open without a customer or pricelist`);
  console.log(`  ✓ Opportunity saved, id = ${id}`);
  return url;
}

/**
 * A second browser session for the REFERENCE system (pre-production) inside a crm-mig spec, so its sign-in never
 * clears crm-mig's session. Same pattern as openApproverSessionOnO12CE: a context made with browser.newContext() does
 * not inherit the config's video, so it records its own, and closeReferenceSessionMig attaches it under the name
 * "video" - the merge reporter then joins it to the crm-mig half instead of the reference steps having no video.
 */
export async function openReferenceSessionMig(browser: Browser, testInfo: TestInfo): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: testInfo.outputPath('reference-session'), size: { width: 800, height: 450 } },
  });
  const page = await context.newPage();
  return { context, page };
}

/** Close the reference session and attach its video (never throws - it runs in afterEach). */
export async function closeReferenceSessionMig(context: BrowserContext | undefined, page: Page | undefined, testInfo: TestInfo): Promise<void> {
  if (!context) return;
  const video = page?.video();
  await context.close().catch(() => {});
  if (!video) return;
  try {
    await testInfo.attach('video', { path: await video.path(), contentType: 'video/webm' });
  } catch (e) {
    console.log(`  ⚠ reference-session video not attached: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** JSON-RPC as the signed-in user of the page's current origin, bounded so a hung call cannot stall teardown. */
export async function rpcMig(page: Page, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}, timeout: number = CommonUtils.waitTimes.abnormalWait * 4): Promise<any> {
  const call = page.evaluate(
    async ({ model, method, args, kwargs }) => {
      const res = await fetch('/web/dataset/call_kw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } }),
      });
      const text = await res.text();
      let json: any;
      // a proxy error (502 / 504) answers with an HTML page - name it, so "no answer from Odoo" is not read as an Odoo error
      try { json = JSON.parse(text); } catch (_e) {
        const title = (text.match(/<title>([^<]*)<\/title>/i)?.[1] || text.slice(0, 80)).replace(/\s+/g, ' ').trim();
        throw new Error(`HTTP ${res.status} - no JSON-RPC answer ("${title}")`);
      }
      if (json.error) throw new Error(json.error.data?.message || json.error.message || 'RPC error');
      return json.result;
    },
    { model, method, args, kwargs }
  );
  let timer: NodeJS.Timeout | undefined;
  const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${model}.${method} did not answer within ${timeout / 1000} s`)), timeout); });
  try {
    return await Promise.race([call, guard]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Runs whose records are confirmed gone - the afterAll sweep skips them. */
const CLEANED = new Set<string>();

/** rpcMig errors that mean crm-mig never answered (proxy page or guard timeout), as opposed to an Odoo error. */
const NO_ANSWER = /HTTP \d{3} - no JSON-RPC answer|did not answer within/;

/**
 * Unlink ONE record of the run, then count it again. A partner delete on crm-mig can outlast the proxy: the gateway
 * answers with an HTML page while Odoo goes on and commits the delete (CRM-12144_2.1, 2026-10-22: company 100002339
 * got "<html>" back, the count right after got no answer either, and the company was gone afterwards). So a delete
 * that got no answer is RE-READ until crm-mig answers - never re-sent blindly - and sent ONCE more only when the
 * re-read still finds the record. An Odoo error (access, constraint) is not retried.
 * @returns 0 = gone, >0 = still there, -1 = crm-mig never answered the count (unverified - NOT clean)
 */
async function unlinkAndConfirmMig(page: Page, model: string, id: number): Promise<number> {
  const recount = async (): Promise<number> => {
    const count = (): Promise<number> => rpcMig(page, model, 'search_count', [[['id', '=', id], ['active', 'in', [true, false]]]], {}, CommonUtils.waitTimes.abnormalWait).catch(() => -1);
    const deadline = Date.now() + CommonUtils.waitTimes.migUnlinkRecheck;
    let left = await count();
    while (left < 0 && Date.now() < deadline) {
      await page.waitForTimeout(CommonUtils.waitTimes.migUnlinkRecheckInterval);
      left = await count();
    }
    return left;
  };
  const failure = await rpcMig(page, model, 'unlink', [[id]]).then(() => '', (e: Error) => e.message.split('\n')[0]);
  if (failure) console.log(`  ⚠ ${model} ${id}: ${failure}`);
  if (!NO_ANSWER.test(failure)) return recount();
  console.log(`    crm-mig did not answer the delete - re-reading ${model} ${id} before any retry`);
  let left = await recount();
  if (left > 0) {
    console.log(`    ${model} ${id} is still there - one more delete`);
    await rpcMig(page, model, 'unlink', [[id]]).catch((e: Error) => console.log(`  ⚠ ${model} ${id} (retry): ${e.message.split('\n')[0]}`));
    left = await recount();
  }
  return left;
}

/**
 * Delete exactly the run's records on crm-mig, children first, then count them again. The page must be signed in
 * as the crm-mig administrator. Every id comes from this run: the ids it captured, plus the orders / opportunities
 * of the run's OWN company (unique per run) and the partners carrying the run's OWN e-mail. Never a migrated record.
 * @returns what survived (empty = clean)
 */
async function deleteRunRecordsMig(page: Page, run: DiscountRun): Promise<string[]> {
  const survivors: string[] = [];
  if (run.partnerId) {
    const companyLeads: number[] = await rpcMig(page, 'crm.lead', 'search', [[['partner_id', '=', run.partnerId], ['active', 'in', [true, false]]]], { limit: 20 }).catch(() => []);
    for (const id of companyLeads) if (id !== run.leadId && !run.extraLeadIds.includes(id)) run.extraLeadIds.push(id);
  }
  const runLeadIds = [run.leadId, ...run.extraLeadIds].filter((x): x is number => !!x);
  const linked: number[] = runLeadIds.length || run.partnerId
    ? await rpcMig(page, 'sale.order', 'search', [['|', ['opportunity_id', 'in', runLeadIds.length ? runLeadIds : [-1]], ['partner_id', '=', run.partnerId ?? -1]]], { limit: 50 }).catch(() => [])
    : [];
  const orderIds = [...new Set([...run.saleOrderIds, ...linked])];
  // count before deleting: one run makes a handful of orders - anything near the bound is not ours to judge
  if (orderIds.length > 20) return [`sale.order x${orderIds.length} found for run ${run.ts} - more than one run can create; NOT deleted: ${JSON.stringify(orderIds)}`];
  const orderInvoices: number[] = orderIds.length
    ? (await rpcMig(page, 'sale.order', 'read', [orderIds], { fields: ['invoice_ids'] }).catch(() => [])).flatMap((o: any) => o.invoice_ids || [])
    : [];
  const invoiceIds = [...new Set([...run.invoiceIds, ...orderInvoices])];
  if (invoiceIds.length) {
    const invoices = await rpcMig(page, 'account.invoice', 'search_read', [[['id', 'in', invoiceIds]]], { fields: ['number', 'state'] }).catch(() => []);
    for (const inv of invoices) {
      if (inv.state !== 'cancel') await rpcMig(page, 'account.invoice', 'action_invoice_cancel', [[inv.id]]).catch((e: Error) => console.log(`  ⚠ cancel invoice ${inv.id}: ${e.message}`));
      await rpcMig(page, 'account.invoice', 'unlink', [[inv.id]]).catch((e: Error) => console.log(`  ⚠ unlink invoice ${inv.id}: ${e.message}`));
    }
    const left = await rpcMig(page, 'account.invoice', 'search_count', [[['id', 'in', invoiceIds]]]).catch(() => -1);
    console.log(`  - account.invoice ${JSON.stringify(invoiceIds)} remaining = ${left}`);
    if (left) survivors.push(`account.invoice x${left}`);
  }
  if (orderIds.length) {
    const orders = await rpcMig(page, 'sale.order', 'search_read', [[['id', 'in', orderIds]]], { fields: ['name', 'state'] }).catch(() => []);
    for (const o of orders) {
      if (!['draft', 'cancel'].includes(o.state)) await rpcMig(page, 'sale.order', 'action_cancel', [[o.id]]).catch(() => {});
      await rpcMig(page, 'sale.order', 'unlink', [[o.id]]).catch((e: Error) => console.log(`  ⚠ ${o.name}: ${e.message}`));
    }
    const left = await rpcMig(page, 'sale.order', 'search_count', [[['id', 'in', orderIds]]]).catch(() => -1);
    console.log(`  - sale.order ${JSON.stringify(orderIds)} remaining = ${left}`);
    if (left) survivors.push(`sale.order x${left}`);
  }
  // the opportunity's e-mail makes Odoo create a CONTACT named after it in the background - the run's record too.
  let contacts: number[] = await rpcMig(page, 'res.partner', 'search', [['&', ['active', 'in', [true, false]], '|', ['email', '=', run.email], ['name', '=', run.email]]], { limit: 10 }).catch(() => []);
  if (contacts.length > 4) {
    console.log(`  ⚠ ${contacts.length} partners carry ${run.email} - more than one run can create; NOT deleting them: ${JSON.stringify(contacts)}`);
    survivors.push(`res.partner x${contacts.length} with ${run.email} (left for review)`);
    contacts = [];
  }
  const targets: Array<[string, number | undefined]> = [
    ...run.extraLeadIds.map((id): [string, number] => ['crm.lead', id]),
    ['crm.lead', run.leadId],
    ...contacts.filter((id) => id !== run.partnerId).map((id): [string, number] => ['res.partner', id]),
    ['res.partner', run.partnerId],
  ];
  for (const [model, id] of targets) {
    if (!id) continue;
    const left = await unlinkAndConfirmMig(page, model, id);
    console.log(`  - ${model} ${id} remaining = ${left < 0 ? 'unknown (crm-mig did not answer)' : left}`);
    if (left > 0) survivors.push(`${model} ${id}`);
    else if (left < 0) survivors.push(`${model} ${id} (unverified - crm-mig did not answer the re-read)`);
  }
  return survivors;
}

/**
 * afterEach teardown on crm-mig, as the administrator: remove exactly the records this run created, then count
 * them again. Throws when a record survives, so a teardown miss is reported instead of passing silently.
 */
export async function teardownDiscountRunMig(page: Page, run: DiscountRun, _testInfo?: TestInfo): Promise<void> {
  // tester review only: the records stay on crm-mig and MUST be deleted afterwards (the 16:00 check reports them)
  if (process.env.SKIP_CLEANUP_MIG === '1') {
    console.log(`\n[mig-cleanup] SKIPPED by SKIP_CLEANUP_MIG=1 - run ${run.ts} LEFT on crm-mig:`);
    console.log(`[mig-cleanup] KEPT ${JSON.stringify({ ts: run.ts, company: run.company, partnerId: run.partnerId, opp: run.opp, leadId: run.leadId, urlOpp: run.urlOpp, extraLeadIds: run.extraLeadIds, saleOrderIds: run.saleOrderIds, invoiceIds: run.invoiceIds, email: run.email })}`);
    CLEANED.add(run.ts); // so the afterAll sweep leaves it too
    return;
  }
  await signInMig(page, users.admin_crm_mig);
  const survivors = await deleteRunRecordsMig(page, run);
  if (survivors.length) throw new Error(`Teardown left records behind on crm-mig: ${survivors.join(', ')}`);
  CLEANED.add(run.ts);
  console.log('  ✓ every record this run created on crm-mig is gone');
}

/**
 * afterAll sweep (crm-mig rule: catches what an aborted test left behind). For every run of this file whose
 * teardown did not confirm a clean state, re-find its records by the run's OWN marker - the company named
 * exactly run.company, the partners carrying exactly run.email, the opportunities of that company - and delete
 * those (a deny-list; never a keep-list). Stops on a count that one run cannot have made.
 */
export async function sweepDiscountRunsMig(browser: Browser, runs: DiscountRun[]): Promise<void> {
  const pending = runs.filter((r) => r && !CLEANED.has(r.ts));
  if (!pending.length) return;
  if (process.env.SKIP_CLEANUP_MIG === '1') {
    for (const r of pending) console.log(`[mig-cleanup] KEPT (sweep skipped) ${JSON.stringify({ ts: r.ts, company: r.company, partnerId: r.partnerId, opp: r.opp, leadId: r.leadId, saleOrderIds: r.saleOrderIds })}`);
    return;
  }
  // the hook has the config's 30 s, less than a crm-mig sign-in alone: CRM-12144_2.1 (2026-10-22) - the sweep was
  // cut at 30 s ("afterAll" hook timeout) before it deleted anything. A sweep with work gets the script budget.
  test.setTimeout(CommonUtils.waitTimes.runningTestScript);
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  try {
    await signInMig(page, users.admin_crm_mig);
    for (const run of pending) {
      console.log(`\n--- afterAll sweep (crm-mig): run ${run.ts} ---`);
      if (!run.partnerId) {
        const byName: number[] = await rpcMig(page, 'res.partner', 'search', [[['name', '=', run.company], ['active', 'in', [true, false]]]], { limit: 5 }).catch(() => []);
        if (byName.length > 1) { console.log(`  ⚠ ${byName.length} partners named ${run.company} - not ours to judge, left for review: ${JSON.stringify(byName)}`); continue; }
        run.partnerId = byName[0];
      }
      if (!run.leadId) {
        const byOpp: number[] = await rpcMig(page, 'crm.lead', 'search', [[['name', '=', run.opp], ['active', 'in', [true, false]]]], { limit: 5 }).catch(() => []);
        if (byOpp.length === 1) run.leadId = byOpp[0];
      }
      const survivors = await deleteRunRecordsMig(page, run);
      if (survivors.length) console.log(`  ⚠ sweep could not remove: ${survivors.join(', ')} - report it with this spec`);
      else { CLEANED.add(run.ts); console.log('  ✓ sweep: nothing of this run is left'); }
    }
  } finally {
    await context.close().catch(() => {});
  }
}
