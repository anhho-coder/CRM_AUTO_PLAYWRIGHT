import { Page, TestInfo, expect, request as pwRequest, APIRequestContext } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { LoginPage, HomePage, ContactPage, OpportunityPage, DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Shared setup + teardown for the Discount pre-production BASELINE suite (Discount_x.y, which mirrors the
 * crm-mig manual TCs CRM-12144_x.y one-to-one). Pre-production is the "reference system" (Odoo 12 EE).
 *
 * Every TC builds its own fresh records through the UI (end-customer company, opportunity) and records the
 * ids it created; teardown removes EXACTLY those ids (a deny-list - never a keep-list) and counts them again,
 * because CommonUtils.deleteRecordByUrl reported "Record deleted successfully" for a company that a Deal
 * Element still referenced, while the company was in fact still there (pre-prod, 2026-10-20).
 */

/** Programs and products as they stand on pre-production (sale.coupon.program, read 2026-10-20). */
export const DISCOUNT_BASELINE = {
  dealRegistration: 'Deal registration promotion, 10% on Product, Support Services do not qualify',
  dealRegistrationProduct: '10.0% discount on products',
  pricelistUsd: 'Public Pricelist_USD',
  // the EUR / GBP / CHF lists in those currencies (NOT "Public Pricelist_EUR (EUR)", which is a USD list)
  pricelistEur: 'Public Pricelist_EUR',
  pricelistGbp: 'Public Pricelist_GBP',
  pricelistChf: 'Public Pricelist_CHF',
  paymentTerm: 'Immediate Payment',
  listedProduct: '[A2144B]',
  noProgramProduct: '[A2160B]',
  supportProduct: '[A2165B]',
  subscriptionProduct: '[O365-SUB-5Y]',
} as const;

/** What a verify-point shot outlines (the same selectors the page objects read). */
export const DISCOUNT_HIGHLIGHT = {
  orderLines: '.o_notebook .tab-pane.active table.o_list_view',
  totals: '.oe_subtotal_footer',
  promotionField: "div[name='promotion_id']",
  // plain CSS (document.querySelectorAll): jQuery's ':visible' threw there, which dropped the shot's banner silently
  // (CRM-12144_7.5 review 2026-10-26); a closed jQuery-UI menu carries style="display: none;"
  promotionList: 'ul.ui-autocomplete:not([style*="display: none"])',
} as const;

/**
 * Existing partners the baseline borrows - referenced on the order only, never edited (pre-prod, read 2026-10-20).
 * Each name is unique on pre-prod (checked by name ilike) - the Deal Element picks the partner by its exact name.
 * The order's Reseller / Distributor Discount (%) comes from the PARTNER's own "Partner Discount" (discount_id),
 * not from its Level: the automation partners users.reseller_bronze / reseller_gold / distributor_partner carry
 * the right Level but discount_id = false, so on a Deal Element they give 0.00 % (measured 2026-10-20).
 */
export const DISCOUNT_PARTNERS = {
  bronze: 'Bailey Systems', // res.partner 13512, Level Bronze, Partner Discount 15.0
  gold: 'OptiCom SIA', // res.partner 26882, Level Gold, Partner Discount 25.0 (NOT "Data Sciences Corporation": 4 partners share that name)
  distributor: 'QBS Software Ltd', // res.partner 14474, Level Distributor, Partner Discount 20.0
} as const;

/**
 * Step "Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate
 * Payment" - the opportunity form must be open. Logs what the Deal Element showed on open.
 */
export async function openDealElementFromOpportunity(page: Page): Promise<void> {
  const opportunityPage = new OpportunityPage(page);
  const dealElementPage = new DealElementPage(page);
  await opportunityPage.clickDealElement();
  await dealElementPage.waitForFormOpen();
  await dealElementPage.dismissErrorDialogWithRetry();
  await dealElementPage.waitForAutoPopulate();
  const paymentTerm = await dealElementPage.getPaymentTermValue();
  console.log(`  - Payment Terms on open : ${paymentTerm || '(empty)'}`);
  if (!paymentTerm) await dealElementPage.selectPaymentTerm(DISCOUNT_BASELINE.paymentTerm);
  console.log(`  - Pricelist             : ${await dealElementPage.getPricelistValue()}`);
}

/** Save the open Deal Element and record its id for teardown. @returns the id (undefined when the URL carries none) */
export async function saveDealElement(page: Page, run: DiscountRun): Promise<number | undefined> {
  await new DealElementPage(page).save(CommonUtils.waitTimes.savingPage);
  const id = idFromUrl(page.url());
  if (id) run.saleOrderIds.push(id);
  console.log(`  - Deal Element saved, id = ${id ?? '(not in URL)'}`);
  return id;
}

/** The reward lines among a list of order-line rows (Product = "10.0% discount on products" etc.). */
export function rewardRows(rows: Array<Record<string, string>>, product: string = DISCOUNT_BASELINE.dealRegistrationProduct): Array<Record<string, string>> {
  return rows.filter((r) => (r['Product'] ?? '').trim() === product);
}

/** One verification point: what is checked, Expected, Actual, PASS/FAIL. */
export interface Check { what: string; expected: string; actual: string; passed: boolean }

/** "1,480.50" / "$ -164.50" / "€ 1,260.00" -> number (NaN when the screen showed nothing). */
export const money = (s: string): number => {
  const n = parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
  return Number.isNaN(n) ? NaN : n;
};

/** Two amounts equal to the cent. */
export const sameCents = (a: number, b: number): boolean => Math.round(a * 100) === Math.round(b * 100);

/**
 * Record a step's checks and take the step's verify-point evidence (red/green outline of what was read).
 * The assertions themselves run in the Verification step - see printVerifyAndAssert.
 */
export async function recordChecks(
  page: Page,
  testInfo: TestInfo,
  all: Check[],
  stepChecks: Check[],
  name: string,
  highlight: string[] = []
): Promise<void> {
  all.push(...stepChecks);
  for (const c of stepChecks) console.log(`  - ${c.what} : ${c.actual} (${c.passed ? 'PASS' : 'FAIL'})`);
  await CommonUtils.captureVerifyEvidence(page, testInfo, {
    name,
    passed: stepChecks.every((c) => c.passed),
    highlight,
    lines: stepChecks.map((c) => `${c.what}: expected ${c.expected} | actual ${c.actual}`),
  }).catch(() => {});
}

/** The VERIFY block on stdout (printed BEFORE asserting, so it shows on a failure too), then one expect per check. */
export function printVerifyAndAssert(checks: Check[]): void {
  console.log('==================== VERIFY ====================');
  checks.forEach((c, i) => {
    console.log(`  Verify #${i + 1} - ${c.what}:`);
    console.log(`     Expected : ${c.expected}`);
    console.log(`     Actual   : ${c.actual}`);
    console.log(`     Result   : ${c.passed ? 'PASS' : 'FAIL'}`);
  });
  console.log('===============================================');
  const failed = checks.filter((c) => !c.passed).length;
  console.log(`OVERALL: ${failed ? 'FAIL' : 'PASS'} - ${checks.length - failed}/${checks.length} checks hold on the reference system`);
  for (const c of checks) expect(c.passed, `${c.what}: expected ${c.expected}, got ${c.actual}`).toBe(true);
}

/** The records one TC run created, so teardown can remove exactly these. */
export interface DiscountRun {
  ts: string;
  company: string;
  email: string;
  opp: string;
  partnerId?: number;
  leadId?: number;
  urlOpp?: string;
  saleOrderIds: number[];
  /** further opportunities of the same run (a second opportunity, a duplicated one) */
  extraLeadIds: number[];
  /** draft customer invoices the run created */
  invoiceIds: number[];
  /** test promotion programs the run created (sale.coupon.program) - removed with their reward product */
  programIds: number[];
}

export function newDiscountRun(): DiscountRun {
  const ts = `${Date.now()}`.slice(-8) + Math.floor(Math.random() * 90 + 10);
  return {
    ts,
    company: `Disc-Cust-${ts}`,
    // a domain of its own per run: the hourly duplicate-lead job keys on the e-mail domain
    email: `disc.cust.${ts}@d${ts}.discautotest.com`,
    opp: `Disc-Opp-${ts}`,
    saleOrderIds: [],
    extraLeadIds: [],
    invoiceIds: [],
    programIds: [],
  };
}

/** The record id carried in an Odoo form URL (#id=123&...), if any. */
export function idFromUrl(url: string): number | undefined {
  const m = url.match(/[#&?]id=(\d+)/);
  return m ? Number(m[1]) : undefined;
}

/** Sign in on pre-production as the given user, in the current context. */
export async function signIn(page: Page, user: { username: string; password: string }): Promise<void> {
  const loginPage = new LoginPage(page);
  await page.context().clearCookies();
  await loginPage.navigateTo(baseUrl);
  await loginPage.login(user.username, user.password, CommonUtils.waitTimes.pageLoad);
  await loginPage.dismissLocationPermissionDialog();
}

/**
 * Contacts > Create: a new end-customer company (no Reseller, no Distributor) with the given pricelist.
 * The contact form is filled the way the pre-prod suites fill it (Country / State / Sales Team / Salesperson).
 */
export async function createEndCustomerCompany(
  page: Page,
  run: DiscountRun,
  salesperson: { displayName: string },
  pricelist: string = DISCOUNT_BASELINE.pricelistUsd
): Promise<void> {
  const homePage = new HomePage(page);
  const contactPage = new ContactPage(page);
  console.log('  Company to create:');
  console.log(`    - Name        = ${run.company}`);
  console.log(`    - Type        = Company (end customer: no Reseller, no Distributor)`);
  console.log(`    - Email       = ${run.email}`);
  console.log(`    - Country     = United States`);
  console.log(`    - State       = Maryland`);
  console.log(`    - Sales Team  = BDEU`);
  console.log(`    - Salesperson = ${salesperson.displayName}`);
  console.log(`    - Pricelist   = ${pricelist}`);
  // start from the apps home: a second company in the same test (Discount_1.8 GBP / CHF) starts on a Deal Element
  await homePage.ensureAppsHome();
  await homePage.navigateToContactsFromHome();
  await homePage.waitForPageReady();
  await contactPage.clickCreate();
  await contactPage.createContact('Company', run.company, run.email, 'United States', 'BDEU', 'Maryland', salesperson.displayName);
  await contactPage.clickEdit();
  await contactPage.clickSalesPurchasesTab();
  await contactPage.selectPricelist(pricelist, { exact: true });
  await contactPage.clickSaveIfEditable();
  await contactPage.waitForSaveComplete();
  run.partnerId = idFromUrl(page.url());
  if (!run.partnerId) throw new Error(`Company ${run.company} was not saved - no record id in ${page.url()}`);
  console.log(`  ✓ Company saved, id = ${run.partnerId}`);
}

/**
 * CRM > Pipeline > Create: a new opportunity whose Company is the run's company (linked through the e-mail).
 */
export async function createOpportunityForCompany(
  page: Page,
  run: DiscountRun,
  salesperson: { displayName: string },
  opts: { name?: string } = {}
): Promise<string> {
  const homePage = new HomePage(page);
  const opportunityPage = new OpportunityPage(page);
  // a second opportunity of the same run (e.g. Disc-Opp2-<timestamp>) is recorded in extraLeadIds
  const oppName = opts.name ?? run.opp;
  console.log('  Opportunity to create:');
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
  await homePage.returnToHome();
  await homePage.waitForPageFullyLoaded();
  await homePage.navigateToCRM();
  await homePage.waitForPageReady();
  await opportunityPage.switchToListView();
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
  // same CRM Developer > Lead Form the pre-prod suites set before saving an opportunity
  await opportunityPage.clickCRMDeveloperTab().catch(() => {});
  await opportunityPage.fillLeadForm('Download Free Trial').catch(() => {});
  await opportunityPage.selectStage('New');
  await opportunityPage.clickSave();
  await opportunityPage.waitForSaveComplete();
  await opportunityPage.waitForIdInUrlAndExtract();
  const url = page.url();
  const id = idFromUrl(url);
  if (!id) throw new Error(`Opportunity ${oppName} was not saved - no record id in ${url}`);
  if (opts.name) run.extraLeadIds.push(id);
  else { run.urlOpp = url; run.leadId = id; }
  // the Company link is filled by a background step after the e-mail is entered. It can take minutes when the job
  // queue is busy (Discount_5.1, 2026-10-21: not linked after 2 refreshes -> the Deal Element opened with no customer
  // and no pricelist, so the Promotion list was empty and Save failed). Wait longer, and stop here if it never links.
  const linked = await opportunityPage
    .waitForContactFieldPopulated(run.company, 6, CommonUtils.waitTimes.long * 4)
    .then((r) => r.contactFieldFound && (r.contactValue ?? '').includes(run.company))
    .catch(() => false);
  if (!linked) throw new Error(`Opportunity ${oppName}: Company ${run.company} was not linked by the background job - the Deal Element would open without a customer or pricelist`);
  console.log(`  ✓ Opportunity saved, id = ${id}`);
  return url;
}

async function rpc(page: Page, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}): Promise<any> {
  return page.evaluate(
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
}

/** Pre-production database (the "reference system"). */
const PREPROD_DB = 'nakivo';

/** A test promotion program as the crm-mig Program editor row describes it. */
export interface TestProgram {
  /** shown name; must carry the run marker */
  name: string;
  /** Reward percent */
  percent: number;
  /** Scope: order | specific products (product default codes) */
  scope: 'order' | { products: string[] };
  /** Customer condition: the customer (company) NAME the program is limited to */
  customerName?: string;
  /** Min qty (>=) */
  minQty?: number;
  /** Valid from / Valid to, 'YYYY-MM-DD HH:mm:ss' UTC */
  validFrom?: string;
  validTo?: string;
}

/**
 * The "Program editor" of the reference system. On crm-mig programs live in the Discount Service's Program editor;
 * on pre-production (Odoo 12 EE) they are sale.coupon.program records, kept by a Sales / Manager. This talks to them
 * over JSON-RPC from its OWN request context (own cookie jar), signed in as the CRM administrator, so the browser
 * page never has to switch session mid-test (a Thomas -> admin switch on the page proved unreliable, 2026-10-21).
 */
export class ProgramOwner {
  private constructor(private readonly api: APIRequestContext) {}

  static async open(): Promise<ProgramOwner> {
    // https directly: http:// answers 301 -> https, and a redirected POST comes back as a GET (the login HTML page)
    const api = await pwRequest.newContext({ baseURL: baseUrl.replace(/^http:/, 'https:'), ignoreHTTPSErrors: true });
    const res = await api.post('web/session/authenticate', {
      headers: { 'Content-Type': 'application/json' },
      data: { jsonrpc: '2.0', method: 'call', params: { db: PREPROD_DB, login: users.admin_crm.username, password: users.admin_crm.password } },
      timeout: CommonUtils.waitTimes.abnormalWait,
    });
    const body = await res.json();
    if (body.error || !body.result?.uid) throw new Error(`Program owner sign-in failed: ${String(body.error?.data?.message ?? body.error?.message ?? 'no uid').slice(0, 200)}`);
    return new ProgramOwner(api);
  }

  async call(model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}): Promise<any> {
    const res = await this.api.post('web/dataset/call_kw', {
      headers: { 'Content-Type': 'application/json' },
      data: { jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } },
      timeout: CommonUtils.waitTimes.abnormalWait * 2,
    });
    const body = await res.json();
    if (body.error) throw new Error(String(body.error.data?.message ?? body.error.message).slice(0, 400));
    return body.result;
  }

  /** Create a program (automatically offered - no code - like Deal registration) and record it in the run. */
  async createProgram(run: DiscountRun, p: TestProgram): Promise<number> {
    const values: Record<string, unknown> = {
      name: p.name,
      program_type: 'promotion_program',
      promo_code_usage: 'no_code_needed',
      promo_applicability: 'on_current_order',
      reward_type: 'discount',
      discount_type: 'percentage',
      discount_percentage: p.percent,
      rule_min_quantity: p.minQty ?? 1,
      rule_minimum_amount: 0,
      rule_partners_domain: p.customerName ? JSON.stringify([['name', '=', p.customerName]]) : '[]',
    };
    if (p.scope === 'order') values.discount_apply_on = 'on_order';
    else {
      values.discount_apply_on = 'specific_products';
      const ids: number[] = await this.call('product.product', 'search', [[['default_code', 'in', p.scope.products]]], { limit: 50 });
      values.discount_specific_product_ids = [[6, 0, ids]];
    }
    if (p.validFrom) values.rule_date_from = p.validFrom;
    if (p.validTo) values.rule_date_to = p.validTo;
    const id: number = await this.call('sale.coupon.program', 'create', [values]);
    run.programIds.push(id);
    console.log('  Program created (reference system: Sales > Configuration > Promotion Programs, over JSON-RPC):');
    console.log(`    - Name                 = ${p.name}   (id ${id})`);
    console.log(`    - Reward percent       = ${p.percent}`);
    console.log(`    - Scope                = ${p.scope === 'order' ? 'order' : `specific products ${p.scope.products.join(', ')}`}`);
    console.log(`    - Customer condition   = ${p.customerName ? `customer name is ${p.customerName}` : '(none)'}`);
    console.log(`    - Min qty              = ${p.minQty !== undefined ? `>= ${p.minQty}` : '(none)'}`);
    console.log(`    - Valid from / to      = ${p.validFrom ?? '-'} / ${p.validTo ?? '-'}`);
    console.log('    - Promo code           = (none - the reference system offers coded programs only through a code)');
    return id;
  }

  /** "Delete the row and save a new version" on the reference system = archive the program. */
  async archiveProgram(id: number): Promise<void> {
    await this.call('sale.coupon.program', 'write', [[id], { active: false }]);
    console.log(`  Program ${id} archived (no longer active)`);
  }

  async close(): Promise<void> {
    await this.api.dispose().catch(() => {});
  }
}

/**
 * [automation aid] The newest record of `model` belonging to this run's own company that is not yet known. On the
 * reference system a Duplicate (quotation header button / opportunity Action > Duplicate) creates its copy
 * server-side and LEAVES THE SCREEN ON THE SOURCE (pre-prod 2026-10-21) - this is how the spec finds the copy.
 */
export async function findRunCopy(
  page: Page,
  model: 'sale.order' | 'crm.lead',
  run: DiscountRun,
  known: number[],
  timeout: number = CommonUtils.waitTimes.abnormalWait * 8
): Promise<number | undefined> {
  if (!run.partnerId) return undefined;
  // the copy is not instant: in one run it existed ~20 s after the click, in the next it was still absent after
  // the fixed wait (2026-10-21) - so poll instead of reading once
  const deadline = Date.now() + timeout;
  let lastError = '';
  while (Date.now() < deadline) {
    const ids: number[] = await rpc(page, model, 'search', [[['partner_id', '=', run.partnerId], ['id', 'not in', known]]], { limit: 1, order: 'id desc' }).catch((e: Error) => {
      lastError = e.message;
      return [];
    });
    if (ids[0]) {
      console.log(`  - [automation aid] ${model} copy found: ${ids[0]} (${Math.round((timeout - (deadline - Date.now())) / 1000)} s after the click)`);
      return ids[0];
    }
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  }
  console.log(`  - [automation aid] no ${model} copy of the run's company after ${timeout / 1000} s${lastError ? ` (last RPC error: ${lastError})` : ''}`);
  return undefined;
}

/**
 * Teardown as the CRM administrator: remove exactly the records this run created, children first
 * (Deal Elements / quotations -> opportunity -> company), then count them again.
 * Throws when a record survives, so a teardown miss is reported instead of passing silently.
 */
export async function teardownDiscountRun(page: Page, run: DiscountRun, testInfo: TestInfo): Promise<void> {
  await signIn(page, users.admin_crm);
  const survivors: string[] = [];
  // the run's own orders: the ids it captured + any order hanging off one of the run's own opportunities
  // (a Deal Element or quotation whose id was not captured because a step failed first)
  // ...and any opportunity / order of the run's OWN company (unique per run) whose id was never captured - e.g. the
  // copy an opportunity Duplicate makes server-side (Discount_3.2, 2026-10-20: lead 1101330 + DE048167 survived)
  if (run.partnerId) {
    const companyLeads: number[] = await rpc(page, 'crm.lead', 'search', [[['partner_id', '=', run.partnerId], ['active', 'in', [true, false]]]], { limit: 20 }).catch(() => []);
    for (const id of companyLeads) if (id !== run.leadId && !run.extraLeadIds.includes(id)) run.extraLeadIds.push(id);
  }
  const runLeadIds = [run.leadId, ...run.extraLeadIds].filter((x): x is number => !!x);
  const linked: number[] = runLeadIds.length
    ? await rpc(page, 'sale.order', 'search', [['|', ['opportunity_id', 'in', runLeadIds], ['partner_id', '=', run.partnerId ?? -1]]], { limit: 50 }).catch(() => [])
    : [];
  const orderIds = [...new Set([...run.saleOrderIds, ...linked])];
  // invoices first: the ones the run captured + the ones raised from the run's own orders
  const orderInvoices: number[] = orderIds.length
    ? (await rpc(page, 'sale.order', 'read', [orderIds], { fields: ['invoice_ids'] }).catch(() => [])).flatMap((o: any) => o.invoice_ids || [])
    : [];
  const invoiceIds = [...new Set([...run.invoiceIds, ...orderInvoices])];
  if (invoiceIds.length) {
    const invoices = await rpc(page, 'account.invoice', 'search_read', [[['id', 'in', invoiceIds]]], { fields: ['number', 'state'] });
    for (const inv of invoices) {
      if (inv.state !== 'cancel') await rpc(page, 'account.invoice', 'action_invoice_cancel', [[inv.id]]).catch((e: Error) => console.log(`  ⚠ cancel invoice ${inv.id}: ${e.message}`));
      await rpc(page, 'account.invoice', 'unlink', [[inv.id]]).catch((e: Error) => console.log(`  ⚠ unlink invoice ${inv.id}: ${e.message}`));
    }
    const left = await rpc(page, 'account.invoice', 'search_count', [[['id', 'in', invoiceIds]]]);
    console.log(`  - account.invoice ${JSON.stringify(invoiceIds)} remaining = ${left}`);
    if (left) survivors.push(`account.invoice x${left}`);
  }
  if (orderIds.length) {
    const orders = await rpc(page, 'sale.order', 'search_read', [[['id', 'in', orderIds]]], { fields: ['name', 'state'] });
    for (const o of orders) {
      if (!['draft', 'cancel'].includes(o.state)) await rpc(page, 'sale.order', 'action_cancel', [[o.id]]).catch(() => {});
      await rpc(page, 'sale.order', 'unlink', [[o.id]]).catch((e: Error) => console.log(`  ⚠ ${o.name}: ${e.message}`));
    }
    const left = await rpc(page, 'sale.order', 'search_count', [[['id', 'in', orderIds]]]);
    console.log(`  - sale.order ${JSON.stringify(orderIds)} remaining = ${left}`);
    if (left) survivors.push(`sale.order x${left}`);
  }
  // the opportunity's e-mail makes Odoo create a CONTACT named after it in the background - it is the run's record
  // too, and it survived every teardown until 2026-10-20 (30 contacts *@*.discautotest.com found that day).
  // Deny-list: only partners carrying THIS run's unique e-mail, the run's company excluded (it goes last).
  let contacts: number[] = await rpc(page, 'res.partner', 'search', [['&', ['active', 'in', [true, false]], '|', ['email', '=', run.email], ['name', '=', run.email]]], { limit: 10 }).catch(() => []);
  // a run makes its company + one auto-contact (+ one per duplicated opportunity); more than that is not ours to judge
  if (contacts.length > 4) {
    console.log(`  ⚠ ${contacts.length} partners carry ${run.email} - more than one run can create; NOT deleting them: ${JSON.stringify(contacts)}`);
    survivors.push(`res.partner x${contacts.length} with ${run.email} (left for review)`);
    contacts = [];
  }
  // test programs of this run: the ids it recorded + any program carrying this run's marker (deny-list), then their
  // reward products (Odoo creates one per program)
  const markedPrograms: number[] = await rpc(page, 'sale.coupon.program', 'search', [[['name', 'ilike', `-${run.ts}`], ['active', 'in', [true, false]]]], { limit: 20 }).catch(() => []);
  const programIds = [...new Set([...run.programIds, ...markedPrograms])];
  if (programIds.length) {
    const progs = await rpc(page, 'sale.coupon.program', 'read', [programIds], { fields: ['discount_line_product_id'] }).catch(() => []);
    // Odoo refuses to delete an active program ("You can not delete a program in active state"): archive first
    await rpc(page, 'sale.coupon.program', 'write', [programIds, { active: false }]).catch((e: Error) => console.log(`  ⚠ archive programs: ${e.message}`));
    await rpc(page, 'sale.coupon.program', 'unlink', [programIds]).catch((e: Error) => console.log(`  ⚠ programs ${JSON.stringify(programIds)}: ${e.message}`));
    const leftP = await rpc(page, 'sale.coupon.program', 'search_count', [[['id', 'in', programIds], ['active', 'in', [true, false]]]]);
    console.log(`  - sale.coupon.program ${JSON.stringify(programIds)} remaining = ${leftP}`);
    if (leftP) survivors.push(`sale.coupon.program x${leftP}`);
    const prods = progs.map((pr: any) => pr.discount_line_product_id?.[0]).filter((x: number | undefined) => !!x);
    if (prods.length) {
      await rpc(page, 'product.product', 'unlink', [prods]).catch((e: Error) => console.log(`  ⚠ reward products ${JSON.stringify(prods)}: ${e.message}`));
      const leftR = await rpc(page, 'product.product', 'search_count', [[['id', 'in', prods], ['active', 'in', [true, false]]]]);
      console.log(`  - product.product (reward) ${JSON.stringify(prods)} remaining = ${leftR}`);
      if (leftR) survivors.push(`reward product x${leftR}`);
    }
  }
  const targets: Array<[string, number | undefined]> = [
    ...run.extraLeadIds.map((id): [string, number] => ['crm.lead', id]),
    ['crm.lead', run.leadId],
    ...contacts.filter((id) => id !== run.partnerId).map((id): [string, number] => ['res.partner', id]),
    ['res.partner', run.partnerId],
  ];
  for (const [model, id] of targets) {
    if (!id) continue;
    await rpc(page, model, 'unlink', [[id]]).catch((e: Error) => console.log(`  ⚠ ${model} ${id}: ${e.message}`));
    const left = await rpc(page, model, 'search_count', [[['id', '=', id], ['active', 'in', [true, false]]]]);
    console.log(`  - ${model} ${id} remaining = ${left}`);
    if (left) survivors.push(`${model} ${id}`);
  }
  if (survivors.length) throw new Error(`Teardown left records behind: ${survivors.join(', ')}`);
  console.log('  ✓ every record this run created is gone');
}
