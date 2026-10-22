import { Browser, BrowserContext, Page, TestInfo, expect } from '@playwright/test';
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

/** Program editor guard (tester decision 2026-10-21) - see DiscountProgramEditorPageMig. */
export const PROGRAM_EDITOR_WRITES_CONFIRMED = DiscountProgramEditorPageMig.PROGRAM_EDITOR_WRITES_CONFIRMED;
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
 * Sign in on crm-mig as the given user, in the current context. Only crm-mig's own cookies are cleared (to switch
 * user), so a Program editor session (discount-crm-mig) opened earlier in the same test survives.
 */
export async function signInMig(page: Page, user: { username: string; password: string }): Promise<void> {
  const loginPage = new LoginPageMig(page);
  // ONE retry, logged: on 2026-10-21 (evening, crm-mig under load) 5 of 10 specs lost their login - the form never
  // rendered its Email box in 90 s (page stuck on "Loading" or a 502 Bad Gateway). A second failure is reported as is.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.context().clearCookies({ domain: /(^|\.)crm-mig\.nakivo\.site$/ });
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(user.username, user.password);
      return;
    } catch (e) {
      const heading = ((await page.locator('h1').first().textContent({ timeout: CommonUtils.waitTimes.long }).catch(() => '')) || '').trim();
      if (attempt === 2) throw new Error(`crm-mig login failed twice for ${user.username} (screen: "${heading || 'no heading'}"): ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      console.log(`  ⚠ crm-mig login did not complete (screen: "${heading || 'no heading'}") - waiting, then one retry`);
      await page.waitForTimeout(CommonUtils.waitTimes.abnormalWait);
    }
  }
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
  await opportunityPage.fillLeadForm('Download Free Trial').catch(() => {});
  await opportunityPage.selectStage('New');
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
      const json = await res.json();
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
    await rpcMig(page, model, 'unlink', [[id]]).catch((e: Error) => console.log(`  ⚠ ${model} ${id}: ${e.message}`));
    const left = await rpcMig(page, model, 'search_count', [[['id', '=', id], ['active', 'in', [true, false]]]]).catch(() => -1);
    console.log(`  - ${model} ${id} remaining = ${left}`);
    if (left) survivors.push(`${model} ${id}`);
  }
  return survivors;
}

/**
 * afterEach teardown on crm-mig, as the administrator: remove exactly the records this run created, then count
 * them again. Throws when a record survives, so a teardown miss is reported instead of passing silently.
 */
export async function teardownDiscountRunMig(page: Page, run: DiscountRun, _testInfo?: TestInfo): Promise<void> {
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
