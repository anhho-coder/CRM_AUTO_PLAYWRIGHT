import { Page, test } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { QuotationPage, InvoicePage } from '@pages';
import { QuotationPageMig, InvoiceLinesPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_HIGHLIGHT,
  Check,
  money,
  recordChecks,
  printVerifyAndAssertMig,
  signInMig,
  rpcMig,
  MIG_ACTION_TIMEOUT,
  baselineDetails,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_6.4 - Open a migrated order with a manual line discount   (crm-mig only, READ-ONLY)
 * ================================================================================================
 * Test Case ID     : CRM-12144_6.4
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 60, Jira link empty)
 * Automation-Type  : refactored (2026-10-23: every pre-production step and query removed - see "Removed" below)
 * Automation-Date  : 2026-10-23
 * Baseline         : Discount_6.4 (Jira CRM-13802; tests/1.Project_CRM/10.Sales_Module/Discount/6. Data & history/
 *                    tc-discount-6-4-migrated-order-manual-line-discount.spec.ts) - run it on its own for the reference side
 * Spec             : [Migration] Discounts (Promotions) v6 - IS-CRM-FUNC-0090-04
 * Source version   : master row CRM-12144_6.4 as updated 2026-10-23 (reference steps removed) - re-check before trusting this spec
 * Host             : crm-mig only (https://crm-mig.nakivo.site, db nakivoCE)
 * Run as           : reader users.admin_crm_mig
 *
 * READ-ONLY: only an existing order and its invoice are read. Nothing is saved, confirmed, edited or deleted, and
 * nothing is created, so there is no teardown. The migrated ids are never added to any run's record list.
 *
 * Removed - pre-production reference (tester 2026-10-23: pre-production will be shut down)
 * -----------------------------------------------------------------------------------------
 * The old master row's Pre-condition 2, Step 2 and Step 3 opened or compared with the reference system; they were
 * removed from this spec AND from the master row (2026-10-23), and Pre-condition 3 (now searching crm-mig, not
 * pre-production) became Pre-condition 2. The reference half lives only in the baseline spec, run on demand while
 * pre-production is up:
 *   npx playwright test --grep "Discount_6\.4:" --project=chromium
 *
 * Summary
 * -------
 * A migrated order with a line Discount (%) above 0 and its invoice are read on crm-mig: the discounted line shows a
 * Subtotal, and the order Total, Total in Company Currency and the invoice Total in Company Currency are shown.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_6\.4:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_6.4, master "Migration - Discount")
 * ------------------------------------------------------------------------------------------------
 *  Title: Open a migrated order with a manual line discount (IS-CRM-FUNC-0090-04)
 *  Priority: P2 | Spec Areas: 0090-04 - line discount kept
 *  Pre-conditions
 *    1. Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only
 *       (e.g. Thomas Semerich)
 *    2. Find through the search box and filters (never by record id) a migrated order with a manually entered line
 *       discount and its invoice; do not change the migrated record
 *    Note (2026-10-23): the reference-system steps were removed - pre-production will be shut down; the reference side
 *    stays in baseline Discount_6.4 (CRM-13802), run on demand
 *  Executed Steps
 *    1. On crm-mig, open the order and its invoice
 *  Expected Results
 *    1. The order has at least one line with Discount (%) above 0 and that line shows a Subtotal; the order Total,
 *       Total in Company Currency and the invoice Total in Company Currency are shown
 *
 *  Port notes (mechanical only): reader account users.admin_crm_mig on crm-mig instead of the salesperson, because the
 *  salesperson cannot open others' orders (the baseline's reason). Pre-condition 2 is a bounded search on crm-mig
 *  (newest first, at most 20 candidates among the orders of the newest 500 lines with discount > 0, created before
 *  2026-09-01 - only migrated orders are that old), each with its newest customer invoice; the first candidate that has
 *  one is used and opened by id (no sale.order list-search page object exists). The line Discount (%) column is found by
 *  its caption ("Discount (%)" or "Special Discount(%)", as the baseline does). Step 1 keeps the baseline's checks on
 *  crm-mig. Every line's Discount (%)
 *  and Subtotal and the invoice Total are printed, not asserted.
 * ================================================================================================
 */

const TC = 'CRM-12144_6.4';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich) - [READER users.admin_crm_mig used: the salesperson cannot open others\' orders]',
  pre2: '[INTERNAL check, Call API] Pre-condition 2: Find through the search box and filters (never by record id) a migrated order with a manually entered line discount and its invoice; do not change the migrated record - [bounded search on crm-mig, newest first, at most 20 candidates with a line Discount (%) above 0, created before 2026-09-01 (only migrated orders are that old), each with its newest customer invoice; the first one that has it is used]',
  s1: 'Step 1: On crm-mig, open the order and its invoice',
  verify: 'Verification',
} as const;

const CRM_READER = users.admin_crm_mig;
const CANDIDATES = 20; // newest orders per search - still bounded
const DISCOUNT_CAPTION = /^(Special )?Discount ?\(%\)$/;

type Inv = { id: number; number: string; type: string; state: string };
interface Candidate { id: number; name: string; partner: string; invoiceId: number; invoiceNumber: string }
interface Read { values: Record<string, string>; lines: number; discounted: number; firstDiscountedSubtotal: string; invoiceTcc: string }
type Values = Record<string, string>;

/**
 * The crm-mig orders carrying a manually entered line discount, read from the LINES: newest first, at most 500 lines
 * created before 2026-09-01. 2026-10-22: the path filter `order_line.discount > 0` on sale.order makes Odoo collect every
 * discounted line first and timed out (60 s, on pre-production) twice; a plain filter on the line's own columns does not.
 */
async function discountedOrderIds(page: Page): Promise<number[]> {
  const lines: Array<{ order_id: [number, string] | false }> = await rpcMig(
    page,
    'sale.order.line',
    'search_read',
    [[['discount', '>', 0], ['create_date', '<', '2026-09-01 00:00:00']]],
    { fields: ['order_id'], limit: 500, order: 'id desc' }
  );
  return [...new Set(lines.map((l) => (Array.isArray(l.order_id) ? l.order_id[0] : 0)).filter((id) => id > 0))];
}

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

/** Order + invoice read on crm-mig: every line's Discount (%) and Subtotal, the totals and the invoice totals. */
async function readPair(q: QuotationPage, inv: InvoicePage, base: string, orderId: number, invoiceId: number, tag: string): Promise<Read> {
  await q.openRecordFormById(base, 'sale.order', orderId);
  await q.dismissErrorDialogWithRetry();
  const rows = await q.getAllOrderLineRows();
  // the line's Discount (%) is sale.order.line.discount; the sale order form relabels it "Special Discount(%)" on some views
  const discKey = Object.keys(rows[0] ?? {}).find((k) => DISCOUNT_CAPTION.test(k)) ?? 'Discount (%)';
  const values: Values = { 'Order lines': String(rows.length) };
  rows.forEach((r, i) => {
    values[`Line ${i + 1} Discount (%)`] = r[discKey] ?? '';
    values[`Line ${i + 1} Subtotal`] = r['Subtotal'] ?? '';
  });
  const discounted = rows.filter((r) => money(r[discKey] ?? '') > 0);
  values['Total'] = await q.getFieldDisplayValue('amount_total');
  values['Total in Company Currency'] = await q.getFieldDisplayValue('amount_total_company_signed');
  console.log(`  ORDER [${tag}] (${rows.length} line(s), column "${discKey}")`);
  for (const r of rows) console.log(`    - line ${r['Product'] ?? '?'} | ${discKey} ${r[discKey] ?? '(empty)'} | Subtotal ${r['Subtotal'] ?? '(empty)'}`);
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
  return { values, lines: rows.length, discounted: discounted.length, firstDiscountedSubtotal: discounted[0]?.['Subtotal'] ?? '', invoiceTcc: listed.value };
}

/** The baseline's assertions for the order. */
function baselineChecks(tag: string, r: Read): Check[] {
  return [
    { what: `${tag} - the order has a line with Discount (%) above 0`, expected: '>= 1 line', actual: `${r.discounted} line(s)`, passed: r.discounted >= 1 },
    { what: `${tag} - that line shows a Subtotal`, expected: 'a non-empty amount', actual: r.firstDiscountedSubtotal || '(empty)', passed: !!r.firstDiscountedSubtotal },
    { what: `${tag} - order Total was read`, expected: 'a non-empty amount', actual: r.values['Total'] || '(empty)', passed: !!r.values['Total'] },
    { what: `${tag} - order Total in Company Currency was read`, expected: 'a non-empty amount', actual: r.values['Total in Company Currency'] || '(empty)', passed: !!r.values['Total in Company Currency'] },
    { what: `${tag} - invoice Total in Company Currency was read`, expected: 'a non-empty amount', actual: r.invoiceTcc || '(empty)', passed: !!r.invoiceTcc },
  ];
}

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Migrated order with a manual line discount (crm-mig only, read-only)`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - end').catch(() => {});
  });

  test(`${TC}: Open a migrated order with a manual line discount`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const checks: Check[] = [];
    let target: Candidate | undefined;

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Login : ${CRM_READER.username} (${CRM_READER.displayName}) on crm-mig`);
      await signInMig(page, CRM_READER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in on crm-mig (reader)');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      const candidates = await findCandidates(page, [['id', 'in', await discountedOrderIds(page)]]);
      console.log(`  - crm-mig candidates with a customer invoice (newest first): ${candidates.map((c) => c.name).join(', ') || '(none)'}`);
      target = candidates[0];
      if (target) console.log(`  - used: ${target.name} (customer ${target.partner}) - crm-mig order id ${target.id}, invoice ${target.invoiceNumber} (id ${target.invoiceId})`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Pre-condition 2 - a migrated order with a line discount and a customer invoice found on crm-mig', expected: '1 order', actual: target ? target.name : 'none found', passed: !!target },
      ], `${TC} - Pre-condition 2 order found`, []);
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      if (!target) {
        console.log('  - not run: no migrated order found (Pre-condition 2)');
        return;
      }
      const crmRead = await readPair(new QuotationPageMig(page), new InvoiceLinesPageMig(page), baseUrl_mig, target.id, target.invoiceId, 'crm-mig');
      await recordChecks(page, testInfo, checks, baselineChecks('crm-mig', crmRead), `${TC} - Step 1 crm-mig values read`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - migrated order and invoice read on crm-mig');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
