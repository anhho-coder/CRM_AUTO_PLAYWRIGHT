import { Page, test } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { QuotationPage, InvoicePage } from '@pages';
import { QuotationPageMig, InvoiceLinesPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_MIG,
  DISCOUNT_HIGHLIGHT,
  Check,
  recordChecks,
  printVerifyAndAssertMig,
  signInMig,
  rpcMig,
  MIG_ACTION_TIMEOUT,
  baselineDetails,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_6.3 - Open migrated orders priced through each pricelist   (crm-mig only, READ-ONLY)
 * ================================================================================================
 * Test Case ID     : CRM-12144_6.3
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 59, Jira link empty)
 * Automation-Type  : refactored (2026-10-23: every pre-production step and query removed - see "Removed" below)
 * Automation-Date  : 2026-10-23
 * Baseline         : Discount_6.3 (Jira CRM-13801; tests/1.Project_CRM/10.Sales_Module/Discount/6. Data & history/
 *                    tc-discount-6-3-migrated-orders-pricelists.spec.ts) - run it on its own for the reference side
 * Spec             : [Migration] Discounts (Promotions) v6 - IS-CRM-FUNC-0090-03
 * Source version   : master row CRM-12144_6.3 as updated 2026-10-23 (reference steps removed) - re-check before trusting this spec
 * Host             : crm-mig only (https://crm-mig.nakivo.site, db nakivoCE)
 * Run as           : reader users.admin_crm_mig
 *
 * READ-ONLY: only existing orders and invoices are read. Nothing is saved, confirmed, edited or deleted, and nothing
 * is created, so there is no teardown. The migrated ids are never added to any run's record list.
 *
 * Removed - pre-production reference (tester 2026-10-23: pre-production will be shut down)
 * -----------------------------------------------------------------------------------------
 * The old master row's Pre-condition 2, Step 2 and Step 3 opened or compared with the reference system; they were
 * removed from this spec AND from the master row (2026-10-23), and Pre-condition 3 (now searching crm-mig, not
 * pre-production) became Pre-condition 2. The reference half lives only in the baseline spec, run on demand while
 * pre-production is up:
 *   npx playwright test --grep "Discount_6\.3:" --project=chromium
 *
 * Summary
 * -------
 * One migrated order per pricelist currency (USD, EUR, GBP, CHF), each with its invoice, read on crm-mig: the Pricelist,
 * a Unit Price on every line, Total, Total in Company Currency and the invoice Total in Company Currency are shown.
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
 *    2. Find through the search box and filters (never by record id) one migrated order per pricelist in use
 *       (USD, EUR, GBP, CHF), each with its invoice; do not change the migrated record
 *    Note (2026-10-23): the reference-system steps were removed - pre-production will be shut down; the reference side
 *    stays in baseline Discount_6.3 (CRM-13801), run on demand
 *  Executed Steps
 *    1. On crm-mig, open the order and its invoice
 *  Expected Results
 *    1. For every order: the Pricelist is shown, every order line shows a Unit Price, and Total, Total in Company
 *       Currency and the invoice Total in Company Currency are shown
 *
 *  Port notes (mechanical only): reader account users.admin_crm_mig on crm-mig instead of the salesperson, because the
 *  salesperson cannot open others' orders (the baseline's reason). Pre-condition 2 is a bounded search on crm-mig
 *  (newest first, at most 20 candidates per pricelist created before 2026-09-01 - only migrated orders are that old -
 *  pricelist_id.name = the pricelist), each with its newest customer invoice; the first candidate that has one is used
 *  and opened by id (no sale.order list-search page object exists). Step 1 keeps the baseline's checks on crm-mig. The invoice Total is printed, not asserted.
 * ================================================================================================
 */

const TC = 'CRM-12144_6.3';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich) - [READER users.admin_crm_mig used: the salesperson cannot open others\' orders]',
  pre2: '[INTERNAL check, Call API] Pre-condition 2: Find through the search box and filters (never by record id) one migrated order per pricelist in use (USD, EUR, GBP, CHF), each with its invoice; do not change the migrated record - [bounded search on crm-mig, newest first, at most 20 candidates per pricelist created before 2026-09-01 (only migrated orders are that old), each with its newest customer invoice; the first one that has it is used]',
  s1: 'Step 1: On crm-mig, open the order and its invoice',
  verify: 'Verification',
} as const;

const CRM_READER = users.admin_crm_mig;
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
interface Target { label: string; order: Candidate }
interface Read { values: Record<string, string>; lines: number; linesWithPrice: number; pricelist: string; invoiceTcc: string }
type Values = Record<string, string>;

/** Up to 20 migrated orders on crm-mig that match `extra`, newest first, created before 2026-09-01 (only migrated orders are that old). Each keeps its newest CUSTOMER invoice (out_invoice, open/paid): a credit note is never read. Read only. */
async function findCandidates(page: Page, extra: unknown[][]): Promise<Candidate[]> {
  const rows: Array<{ id: number; name: string; partner_id: [number, string] | false; invoice_ids: number[] }> = await rpcMig(
    page,
    'sale.order',
    'search_read',
    [[['state', 'in', ['sale', 'done']], ['invoice_ids', '!=', false], ['create_date', '<', '2026-09-01 00:00:00'], ...extra]],
    { fields: ['name', 'partner_id', 'invoice_ids'], limit: CANDIDATES, order: 'id desc' }
  );
  // one bounded read of the candidates' invoices: type and state pick the customer invoice
  const invoiceIds = [...new Set(rows.flatMap((r) => r.invoice_ids))];
  const invoices: Inv[] = invoiceIds.length
    ? await rpcMig(page, 'account.invoice', 'search_read', [[['id', 'in', invoiceIds]]], { fields: ['number', 'type', 'state'], limit: 500 })
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
}

/** Order + invoice read on crm-mig: the pricelist, every line's Unit Price, the totals and the invoice totals. */
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

/** The baseline's assertions for one order. */
function baselineChecks(tag: string, label: string, r: Read): Check[] {
  return [
    { what: `${tag} - ${label}: Pricelist was read`, expected: 'a non-empty value', actual: r.pricelist || '(empty)', passed: !!r.pricelist },
    { what: `${tag} - ${label}: every order line shows a Unit Price`, expected: `${r.lines} lines with a Unit Price`, actual: `${r.linesWithPrice} of ${r.lines}`, passed: r.lines > 0 && r.linesWithPrice === r.lines },
    { what: `${tag} - ${label}: Total was read`, expected: 'a non-empty amount', actual: r.values['Total'] || '(empty)', passed: !!r.values['Total'] },
    { what: `${tag} - ${label}: Total in Company Currency was read`, expected: 'a non-empty amount', actual: r.values['Total in Company Currency'] || '(empty)', passed: !!r.values['Total in Company Currency'] },
    { what: `${tag} - ${label}: invoice Total in Company Currency was read`, expected: 'a non-empty amount', actual: r.invoiceTcc || '(empty)', passed: !!r.invoiceTcc },
  ];
}

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Migrated orders priced through each pricelist (crm-mig only, read-only)`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - end').catch(() => {});
  });

  test(`${TC}: Open migrated orders priced through each pricelist`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
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
      for (const t of TARGETS) {
        const candidates = await findCandidates(page, [['pricelist_id.name', '=', t.pricelist]]);
        console.log(`  - ${t.label} (${t.pricelist}): crm-mig candidates with a customer invoice (newest first): ${candidates.map((c) => c.name).join(', ') || '(none)'}`);
        const order = candidates[0];
        if (order) {
          targets.push({ label: t.label, order });
          console.log(`    used: ${order.name} (customer ${order.partner}) - crm-mig order id ${order.id}, invoice ${order.invoiceNumber} (id ${order.invoiceId})`);
        } else console.log(`    no migrated order found on crm-mig for ${t.label}`);
      }
      await recordChecks(page, testInfo, checks, [
        { what: 'Pre-condition 2 - an order with a customer invoice was found on crm-mig for every pricelist', expected: `${TARGETS.length} orders`, actual: `${targets.length} orders`, passed: targets.length === TARGETS.length },
      ], `${TC} - Pre-condition 2 orders found`, []);
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      if (!targets.length) console.log('  - not run: no migrated order found (Pre-condition 2)');
      for (const target of targets) {
        const read = await readPair(new QuotationPageMig(page), new InvoiceLinesPageMig(page), baseUrl_mig, target.order.id, target.order.invoiceId, `crm-mig ${target.label}`);
        await recordChecks(page, testInfo, checks, baselineChecks('crm-mig', target.label, read), `${TC} - Step 1 crm-mig ${target.label}`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - migrated orders and invoices read on crm-mig');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
