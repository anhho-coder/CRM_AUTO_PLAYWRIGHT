import { Browser, BrowserContext, Page, TestInfo, test } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { QuotationPage, InvoicePage } from '@pages';
import { QuotationPageMig, InvoiceLinesPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_MIG,
  DISCOUNT_HIGHLIGHT,
  Check,
  money,
  sameCents,
  recordChecks,
  printVerifyAndAssertMig,
  signInMig,
  rpcMig,
  MIG_ACTION_TIMEOUT,
  openReferenceSessionMig,
  closeReferenceSessionMig,
  baselineDetails,
} from '@helpers/discount-mig.helper';
import { signIn, ProgramOwner } from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  CRM-12144_6.3 - Open migrated orders priced through each pricelist   (crm-mig, READ-ONLY)
 * ================================================================================================
 * Test Case ID     : CRM-12144_6.3
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 59, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_6.3 (Jira CRM-13801; tests/1.Project_CRM/10.Sales_Module/Discount/6. Data & history/
 *                    tc-discount-6-3-migrated-orders-pricelists.spec.ts) - its reads are the reference side here
 * Spec             : [Migration] Discounts (Promotions) v6 - IS-CRM-FUNC-0090-03
 * Source version   : master row CRM-12144_6.3 as read 2026-10-21 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE) and the reference system (pre-production)
 * Run as           : crm-mig - reader users.admin_crm_mig; reference - users.admin_crm
 *
 * READ-ONLY: only existing orders and invoices are read on both systems. Nothing is saved, confirmed, edited or
 * deleted, and nothing is created, so there is no teardown. The migrated ids are never added to any run's record list.
 *
 * Summary
 * -------
 * One migrated order per pricelist currency (USD, EUR, GBP, CHF), each with its invoice. The Pricelist, every Unit
 * Price, Total and Total in Company Currency must match to the cent on crm-mig and on the reference system.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_6\.3:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_6.3, master "Migration - Discount")
 * ------------------------------------------------------------------------------------------------
 *  Title: Open migrated orders priced through each pricelist (IS-CRM-FUNC-0090-03)
 *  Priority: P2 | Spec Areas: 0090-03 - pricelist kept
 *  Pre-conditions
 *    1. Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only
 *       (e.g. Thomas Semerich)
 *    2. Have the reference system URL and login from the development team (a non-Production copy of the CRM in use
 *       today)
 *    3. Find through the search box and filters (never by record id) one migrated order per pricelist in use
 *       (USD, EUR, GBP, CHF), each with its invoice; do not change the migrated record
 *  Executed Steps
 *    1. On crm-mig, open the order and its invoice
 *    2. Open the same order and invoice on the reference system
 *    3. Compare the Pricelist, every Unit Price, Total and Total in Company Currency
 *  Expected Results
 *    3. Every compared value is the same on both systems (a difference of 0.01 or more is a fail)
 *
 *  Port notes (mechanical only): reader account users.admin_crm_mig on crm-mig instead of the salesperson, because the
 *  salesperson cannot open others' orders (the baseline's reason). Pre-condition 3 is a bounded search on pre-production
 *  (ProgramOwner, newest first, at most 20 candidates per pricelist created before 2026-09-01, pricelist_id.name = the pricelist); a candidate is
 *  used when its NAME exists exactly once on crm-mig with the same customer and an invoice matched by NUMBER. The crm-mig orders are opened
 *  by the ids those exact-name checks returned (no sale.order list-search page object exists). Invoice Total and Total
 *  in Company Currency are compared too (the baseline reads them in the same step; the master names the order fields
 *  only). The order-line count is compared so that "every Unit Price" is compared line for line.
 * ================================================================================================
 */

const TC = 'CRM-12144_6.3';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich) - [READER users.admin_crm_mig used: the salesperson cannot open others\' orders]',
  pre2: 'Pre-condition 2: Have the reference system URL and login from the development team (pre-production, users.admin_crm) - [signed in on its own browser context]',
  pre3: '[INTERNAL check, Call API] Pre-condition 3: Find through the search box and filters (never by record id) one migrated order per pricelist in use (USD, EUR, GBP, CHF), each with its invoice; do not change the migrated record - [bounded search on pre-production, newest first, at most 20 candidates per pricelist created before 2026-09-01, each with its newest customer invoice; kept when its NAME exists exactly once on crm-mig with the same customer, and its invoice NUMBER is carried by exactly one invoice on that order]',
  s1: 'Step 1: On crm-mig, open the order and its invoice',
  s2: 'Step 2: Open the same order and invoice on the reference system',
  s3: 'Step 3: Compare the Pricelist, every Unit Price, Total and Total in Company Currency',
  verify: 'Verification',
} as const;

const CRM_READER = users.admin_crm_mig;
const REF_READER = users.admin_crm;
const CANDIDATES = 20; // newest orders per search - still bounded
/** One migrated order per pricelist currency in use (the baseline's pricelists). */
const TARGETS: Array<{ label: string; pricelist: string }> = [
  { label: 'USD', pricelist: DISCOUNT_MIG.pricelistUsd },
  { label: 'EUR', pricelist: DISCOUNT_MIG.pricelistEur },
  { label: 'GBP', pricelist: DISCOUNT_MIG.pricelistGbp },
  { label: 'CHF', pricelist: DISCOUNT_MIG.pricelistChf },
];

type Inv = { id: number; number: string; type: string; state: string };
interface Candidate { id: number; name: string; partner: string; invoiceId: number; invoiceNumber: string }
interface Target { label: string; ref: Candidate; refInvoiceId: number; crmId: number; crmInvoiceId: number }
interface Read { values: Record<string, string>; lines: number; linesWithPrice: number; pricelist: string; invoiceTcc: string }
type Values = Record<string, string>;
type Match = { ok: true; crmId: number; crmInvoiceId: number } | { ok: false; reason: string };

/** Two amounts equal to the cent; an empty or unreadable value is never equal. */
const sameAmount = (crm: string, ref: string): boolean => {
  const a = money(crm);
  const b = money(ref);
  return !Number.isNaN(a) && !Number.isNaN(b) && sameCents(a, b);
};

/** Blank on both systems is the same value (the list shows it blank); blank on ONE side only is a difference. */
const sameValue = (crm: string, ref: string, amount: boolean): boolean => {
  if (!crm.trim() && !ref.trim()) return true;
  return amount ? sameAmount(crm, ref) : crm !== '' && crm === ref;
};

/** A second browser context for the reference system (pre-production), so its sign-in never clears crm-mig's session. */
async function openReferenceSide(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  return openReferenceSessionMig(browser, test.info()); // records its own video, attached on close
}

/** Up to 20 migrated orders of the reference system that match `extra`, newest first, created before 2026-09-01 (the two systems diverged then). Each keeps its newest CUSTOMER invoice (out_invoice, open/paid): a credit note is never compared. */
async function findCandidates(extra: unknown[][]): Promise<Candidate[]> {
  const owner = await ProgramOwner.open();
  try {
    const rows: Array<{ id: number; name: string; partner_id: [number, string] | false; invoice_ids: number[] }> = await owner.call(
      'sale.order',
      'search_read',
      [[['state', 'in', ['sale', 'done']], ['invoice_ids', '!=', false], ['create_date', '<', '2026-09-01 00:00:00'], ...extra]],
      { fields: ['name', 'partner_id', 'invoice_ids'], limit: CANDIDATES, order: 'id desc' }
    );
    // one bounded read of the candidates' invoices, same session: type and state pick the customer invoice
    const invoiceIds = [...new Set(rows.flatMap((r) => r.invoice_ids))];
    const invoices: Inv[] = invoiceIds.length
      ? await owner.call('account.invoice', 'search_read', [[['id', 'in', invoiceIds]]], { fields: ['number', 'type', 'state'], limit: 500 })
      : [];
    const byId = new Map<number, Inv>(invoices.map((i) => [i.id, i] as [number, Inv]));
    const out: Candidate[] = [];
    for (const r of rows) {
      const customer = r.invoice_ids
        .map((id) => byId.get(id))
        .filter((i): i is Inv => !!i && i.type === 'out_invoice' && ['open', 'paid'].includes(i.state))
        .sort((a, b) => b.id - a.id)[0];
      if (!customer) {
        console.log(`    skipped ${r.name}: no customer invoice (out_invoice, open/paid) among ${r.invoice_ids.length} invoice(s)`);
        continue;
      }
      out.push({ id: r.id, name: r.name, partner: Array.isArray(r.partner_id) ? r.partner_id[1] : '', invoiceId: customer.id, invoiceNumber: customer.number });
    }
    return out;
  } finally {
    await owner.close();
  }
}

/** The candidate's NAME must exist exactly once on crm-mig, with the same customer and an invoice; that invoice is matched by its NUMBER (exactly one, on that order). Read only. */
async function matchOnCrm(page: Page, c: Candidate): Promise<Match> {
  const found: Array<{ id: number; partner_id: [number, string] | false; invoice_ids: number[] }> = await rpcMig(
    page,
    'sale.order',
    'search_read',
    [[['name', '=', c.name]]],
    { fields: ['name', 'partner_id', 'invoice_ids'], limit: 2 }
  );
  if (found.length !== 1) return { ok: false, reason: `${found.length} crm-mig order(s) carry the name ${c.name} (need exactly 1)` };
  const partner = Array.isArray(found[0].partner_id) ? found[0].partner_id[1] : '';
  if (partner !== c.partner) return { ok: false, reason: `customer on crm-mig is "${partner}", on the reference "${c.partner}"` };
  const orderInvoices = found[0].invoice_ids ?? [];
  if (!orderInvoices.length) return { ok: false, reason: 'no invoice on crm-mig' };
  // matched by NUMBER, never by the reference id: exactly one crm-mig invoice carries it, and it must be on this order
  const byNumber: Array<{ id: number }> = await rpcMig(page, 'account.invoice', 'search_read', [[['number', '=', c.invoiceNumber]]], { fields: ['number'], limit: 2 });
  if (byNumber.length !== 1) return { ok: false, reason: `${byNumber.length} crm-mig invoice(s) carry the number ${c.invoiceNumber} (need exactly 1)` };
  if (!orderInvoices.includes(byNumber[0].id)) return { ok: false, reason: `crm-mig invoice ${c.invoiceNumber} (id ${byNumber[0].id}) is not on the matched crm-mig order` };
  return { ok: true, crmId: found[0].id, crmInvoiceId: byNumber[0].id };
}

/** Order + invoice read on one system: the pricelist, every line's Unit Price, the totals and the invoice totals. */
async function readPair(q: QuotationPage, inv: InvoicePage, base: string, orderId: number, invoiceId: number, tag: string): Promise<Read> {
  await q.openRecordFormById(base, 'sale.order', orderId);
  await q.dismissErrorDialogWithRetry();
  const pricelist = await q.getFieldDisplayValue('pricelist_id');
  const rows = await q.getAllOrderLineRows();
  const values: Values = { Pricelist: pricelist, 'Order lines': String(rows.length) };
  rows.forEach((r, i) => {
    values[`Line ${i + 1} Unit Price`] = r['Unit Price'] ?? '';
  });
  values['Total'] = await q.getFieldDisplayValue('amount_total');
  values['Total in Company Currency'] = await q.getFieldDisplayValue('amount_total_company_signed');
  const linesWithPrice = rows.filter((r) => !!r['Unit Price']).length;
  console.log(`  ORDER [${tag}] pricelist ${pricelist || '(empty)'} (${rows.length} line(s))`);
  for (const r of rows) console.log(`    - line ${r['Product'] ?? '?'} | Unit Price ${r['Unit Price'] ?? '(empty)'}`);
  console.log(`    - Total                     : ${values['Total'] || '(empty)'}`);
  console.log(`    - Total in Company Currency : ${values['Total in Company Currency'] || '(empty)'}`);

  await inv.openInvoiceById(invoiceId);
  await inv.dismissErrorDialogWithRetry();
  values['Invoice Total'] = await inv.getFieldDisplayValue('amount_total');
  const listed = await inv.getTotalInCompanyCurrencyForInvoiceId(invoiceId);
  values['Invoice Total in Company Currency'] = listed.value;
  console.log(`  INVOICE [${tag}] id ${invoiceId}`);
  console.log(`    - Total                     : ${values['Invoice Total'] || '(empty)'}`);
  console.log(`    - Total in Company Currency : ${values['Invoice Total in Company Currency'] || '(empty)'}`);
  return { values, lines: rows.length, linesWithPrice, pricelist, invoiceTcc: listed.value };
}

/** The baseline's assertions for one order on one system. */
function baselineChecks(tag: string, label: string, r: Read): Check[] {
  return [
    { what: `${tag} - ${label}: Pricelist was read`, expected: 'a non-empty value', actual: r.pricelist || '(empty)', passed: !!r.pricelist },
    { what: `${tag} - ${label}: every order line shows a Unit Price`, expected: `${r.lines} lines with a Unit Price`, actual: `${r.linesWithPrice} of ${r.lines}`, passed: r.lines > 0 && r.linesWithPrice === r.lines },
    { what: `${tag} - ${label}: Total was read`, expected: 'a non-empty amount', actual: r.values['Total'] || '(empty)', passed: !!r.values['Total'] },
    { what: `${tag} - ${label}: Total in Company Currency was read`, expected: 'a non-empty amount', actual: r.values['Total in Company Currency'] || '(empty)', passed: !!r.values['Total in Company Currency'] },
    { what: `${tag} - ${label}: invoice Total in Company Currency was read`, expected: 'a non-empty amount', actual: r.invoiceTcc || '(empty)', passed: !!r.invoiceTcc },
  ];
}

/** Step 3 - every compared value of one target, side by side, to the cent (text values must match exactly). */
async function compareStep(page: Page, testInfo: TestInfo, checks: Check[], label: string, crm: Values, ref: Values): Promise<void> {
  console.log(`  Side by side, ${label} (crm-mig | reference):`);
  const keys = [...new Set([...Object.keys(crm), ...Object.keys(ref)])];
  const rows: Check[] = keys.map((k) => {
    const c = crm[k] ?? '(missing)';
    const r = ref[k] ?? '(missing)';
    const amount = /Unit Price|Total/.test(k);
    const blankBoth = !c.trim() && !r.trim();
    const shownC = blankBoth ? '(blank on both)' : c;
    const shownR = blankBoth ? '(blank on both)' : r;
    console.log(`    - ${k.padEnd(34)} ${shownC.padEnd(18)} | ${shownR}`);
    return { what: `Step 3 - ${label} - ${k}`, expected: shownR, actual: shownC, passed: sameValue(c, r, amount) };
  });
  await recordChecks(page, testInfo, checks, rows, `${TC} - Step 3 ${label}`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
}

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Migrated orders priced through each pricelist (crm-mig, read-only)`, () => {
  let refPage: Page | undefined;
  let refContext: BrowserContext | undefined;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    refPage = undefined;
    refContext = undefined;
  });

  test.afterEach(async ({ page }, testInfo) => {
    await closeReferenceSessionMig(refContext, refPage, test.info());
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - end').catch(() => {});
  });

  test(`${TC}: Open migrated orders priced through each pricelist`, baselineDetails(TC), async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2); // four currencies, each read on both systems
    await page.setViewportSize({ width: 1920, height: 1080 });
    const checks: Check[] = [];
    const targets: Target[] = [];

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Login : ${CRM_READER.username} (${CRM_READER.displayName}) on crm-mig`);
      await signInMig(page, CRM_READER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in on crm-mig (reader)');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      const side = await openReferenceSide(browser);
      refContext = side.context;
      refPage = side.page;
      await signIn(side.page, REF_READER);
      await CommonUtils.captureAndAttachScreenshot(side.page, testInfo, 'Pre-condition 2 - signed in on the reference system (reader)');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      for (const t of TARGETS) {
        const candidates = await findCandidates([['pricelist_id.name', '=', t.pricelist]]);
        console.log(`  - ${t.label} (${t.pricelist}): reference candidates (newest first): ${candidates.map((c) => c.name).join(', ') || '(none)'}`);
        let found = false;
        for (const c of candidates) {
          const m = await matchOnCrm(page, c);
          if (m.ok) {
            targets.push({ label: t.label, ref: c, refInvoiceId: c.invoiceId, crmId: m.crmId, crmInvoiceId: m.crmInvoiceId });
            console.log(`    used: ${c.name} (customer ${c.partner}) - crm-mig order id ${m.crmId}, invoice id ${m.crmInvoiceId}; reference order id ${c.id}`);
            found = true;
            break;
          }
          console.log(`    not used: ${c.name} - ${m.reason}`);
        }
        if (!found) console.log(`    no candidate of ${candidates.length} matched on crm-mig for ${t.label}`);
      }
      await recordChecks(page, testInfo, checks, [
        { what: 'Pre-condition 3 - an order with an invoice was matched on both systems for every pricelist', expected: `${TARGETS.length} orders`, actual: `${targets.length} orders`, passed: targets.length === TARGETS.length },
      ], `${TC} - Pre-condition 3 orders found`, []);
    });

    // ================= Steps =================
    const crmReads: Array<{ target: Target; read: Read }> = [];
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      if (!targets.length) console.log('  - not run: no migrated order matched (Pre-condition 3)');
      for (const target of targets) {
        const read = await readPair(new QuotationPageMig(page), new InvoiceLinesPageMig(page), baseUrl_mig, target.crmId, target.crmInvoiceId, `crm-mig ${target.label}`);
        crmReads.push({ target, read });
        await recordChecks(page, testInfo, checks, baselineChecks('crm-mig', target.label, read), `${TC} - Step 1 crm-mig ${target.label}`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - migrated orders and invoices read on crm-mig');
    });

    const refReads: Array<{ target: Target; read: Read }> = [];
    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const refNow = refPage;
      if (!refNow) throw new Error('The reference system was not opened at Pre-condition 2');
      if (!targets.length) console.log('  - not run: no migrated order matched (Pre-condition 3)');
      for (const target of targets) {
        const read = await readPair(new QuotationPage(refNow), new InvoicePage(refNow), baseUrl, target.ref.id, target.refInvoiceId, `reference ${target.label}`);
        refReads.push({ target, read });
        await recordChecks(refNow, testInfo, checks, baselineChecks('reference', target.label, read), `${TC} - Step 2 reference ${target.label}`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
      }
      await CommonUtils.captureAndAttachScreenshot(refNow, testInfo, 'Step 2 - migrated orders and invoices read on the reference system');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      for (const c of crmReads) {
        const r = refReads.find((x) => x.target.label === c.target.label);
        if (!r) {
          console.log(`  - ${c.target.label}: no reference read`);
          continue;
        }
        await compareStep(page, testInfo, checks, c.target.label, c.read.values, r.read.values);
      }
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
