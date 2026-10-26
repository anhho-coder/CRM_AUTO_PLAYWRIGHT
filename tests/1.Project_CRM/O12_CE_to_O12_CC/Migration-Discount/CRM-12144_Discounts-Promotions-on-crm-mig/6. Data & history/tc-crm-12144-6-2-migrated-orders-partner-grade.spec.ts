import { Page, test } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { QuotationPage, InvoicePage, DealElementPage } from '@pages';
import { QuotationPageMig, InvoiceLinesPageMig, DealElementPageMig } from '@pages/mig';
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
 *  CRM-12144_6.2 - Open migrated orders priced by partner grade   (crm-mig only, READ-ONLY)
 * ================================================================================================
 * Test Case ID     : CRM-12144_6.2
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 58, Jira link empty)
 * Automation-Type  : refactored (2026-10-23: every pre-production step and query removed - see "Removed" below)
 * Automation-Date  : 2026-10-23
 * Baseline         : Discount_6.2 (Jira CRM-13799; tests/1.Project_CRM/10.Sales_Module/Discount/6. Data & history/
 *                    tc-discount-6-2-migrated-orders-partner-grade.spec.ts) - run it on its own for the reference side
 * Spec             : [Migration] Discounts (Promotions) v6 - IS-CRM-FUNC-0090-02
 * Source version   : master row CRM-12144_6.2 as updated 2026-10-23 (reference steps removed) - re-check before trusting this spec
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
 *   npx playwright test --grep "Discount_6\.2:" --project=chromium
 *
 * Summary
 * -------
 * One migrated order per partner grade in use (Gold, Bronze, Basic reseller) and one with a distributor, each with its
 * invoice, read on crm-mig: Total, Total in Company Currency, invoice Total in Company Currency and the Reseller /
 * Distributor Discount (%) of the partners the order carries are shown.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_6\.2:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_6.2, master "Migration - Discount")
 * ------------------------------------------------------------------------------------------------
 *  Title: Open migrated orders priced by partner grade (IS-CRM-FUNC-0090-02)
 *  Priority: P1 | Spec Areas: 0090-02 - grade kept
 *  Pre-conditions
 *    1. Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only
 *       (e.g. Thomas Semerich)
 *    2. Find through the search box and filters (never by record id) one migrated order per partner grade in use
 *       (Gold, Bronze, Basic reseller) and one with a distributor, each with its invoice; do not change the migrated
 *       record
 *    Note (2026-10-23): the reference-system steps were removed - pre-production will be shut down; the reference side
 *    stays in baseline Discount_6.2 (CRM-13799), run on demand
 *  Executed Steps
 *    1. On crm-mig, open the order and its invoice
 *  Expected Results
 *    1. For every order: Total, Total in Company Currency and the invoice Total in Company Currency are shown;
 *       Reseller Discount (%) is a number where the order names a reseller, Distributor Discount (%) where it names a
 *       distributor
 *
 *  Port notes (mechanical only): reader account users.admin_crm_mig on crm-mig instead of the salesperson, because the
 *  salesperson cannot open others' orders (the baseline's reason). Pre-condition 2 is a bounded search on crm-mig
 *  (newest first, at most 20 candidates per target created before 2026-09-01 - only migrated orders are that old -
 *  grade = reseller_id.grade_id.name), each with its newest customer invoice; the first candidate that has one is used
 *  and opened by id (no sale.order list-search page object exists). Step 1 keeps the baseline's checks on crm-mig. Partner Discount (footer
 *  discount_money) and the invoice Total are printed, not asserted.
 * ================================================================================================
 */

const TC = 'CRM-12144_6.2';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich) - [READER users.admin_crm_mig used: the salesperson cannot open others\' orders]',
  pre2: '[INTERNAL check, Call API] Pre-condition 2: Find through the search box and filters (never by record id) one migrated order per partner grade in use (Gold, Bronze, Basic reseller) and one with a distributor, each with its invoice; do not change the migrated record - [bounded search on crm-mig, newest first, at most 20 candidates per target created before 2026-09-01 (only migrated orders are that old), each with its newest customer invoice; the first one that has it is used]',
  s1: 'Step 1: On crm-mig, open the order and its invoice',
  verify: 'Verification',
} as const;

const CRM_READER = users.admin_crm_mig;
const CANDIDATES = 20; // newest orders per search - still bounded
/** One migrated order per target: each partner grade in use, then one with a distributor (the baseline's domains). */
const TARGETS: Array<{ label: string; domain: unknown[][] }> = [
  { label: 'grade Gold', domain: [['reseller_id.grade_id.name', '=', 'Gold']] },
  { label: 'grade Bronze', domain: [['reseller_id.grade_id.name', '=', 'Bronze']] },
  { label: 'grade Basic', domain: [['reseller_id.grade_id.name', '=', 'Basic']] },
  { label: 'distributor', domain: [['distributor_id', '!=', false]] },
];

type Inv = { id: number; number: string; type: string; state: string };
interface Candidate { id: number; name: string; partner: string; invoiceId: number; invoiceNumber: string }
interface Target { label: string; order: Candidate }
interface Read { values: Record<string, string>; reseller: string; distributor: string; invoiceTcc: string }
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

/** Order + invoice read on crm-mig: the partner discounts, the totals and the invoice totals. */
async function readPair(q: QuotationPage, footer: DealElementPage, inv: InvoicePage, base: string, orderId: number, invoiceId: number, tag: string): Promise<Read> {
  await q.openRecordFormById(base, 'sale.order', orderId);
  await q.dismissErrorDialogWithRetry();
  const reseller = await q.getFieldDisplayValue('reseller_id');
  const distributor = await q.getFieldDisplayValue('distributor_id');
  const values: Values = {
    'Reseller Discount (%)': await q.getFieldDisplayValue('reseller_discount'),
    'Distributor Discount (%)': await q.getFieldDisplayValue('distributor_discount'),
    'Partner Discount': await footer.getSubtotalFooterValue('discount_money'),
    Total: await q.getFieldDisplayValue('amount_total'),
    'Total in Company Currency': await q.getFieldDisplayValue('amount_total_company_signed'),
  };
  console.log(`  ORDER [${tag}] (reseller ${reseller || '(empty)'}, distributor ${distributor || '(empty)'})`);
  for (const [k, v] of Object.entries(values)) console.log(`    - ${k.padEnd(28)}: ${v || '(empty)'}`);

  await inv.openInvoiceById(invoiceId);
  await inv.dismissErrorDialogWithRetry();
  values['Invoice Total'] = await inv.getFieldDisplayValue('amount_total');
  const listed = await inv.getTotalInCompanyCurrencyForInvoiceId(invoiceId);
  values['Invoice Total in Company Currency'] = listed.value;
  console.log(`  INVOICE [${tag}] id ${invoiceId}`);
  console.log(`    - Total                     : ${values['Invoice Total'] || '(empty)'}`);
  console.log(`    - Total in Company Currency : ${values['Invoice Total in Company Currency'] || '(empty)'}`);
  return { values, reseller, distributor, invoiceTcc: listed.value };
}

/** The baseline's assertions for one order. */
function baselineChecks(tag: string, label: string, r: Read): Check[] {
  return [
    { what: `${tag} - ${label}: Total was read`, expected: 'a non-empty amount', actual: r.values['Total'] || '(empty)', passed: !!r.values['Total'] },
    { what: `${tag} - ${label}: Total in Company Currency was read`, expected: 'a non-empty amount', actual: r.values['Total in Company Currency'] || '(empty)', passed: !!r.values['Total in Company Currency'] },
    { what: `${tag} - ${label}: invoice Total in Company Currency was read`, expected: 'a non-empty amount', actual: r.invoiceTcc || '(empty)', passed: !!r.invoiceTcc },
    ...(r.reseller ? [{ what: `${tag} - ${label}: Reseller Discount (%) was read`, expected: 'a number', actual: r.values['Reseller Discount (%)'] || '(empty)', passed: !Number.isNaN(money(r.values['Reseller Discount (%)'])) }] : []),
    ...(r.distributor ? [{ what: `${tag} - ${label}: Distributor Discount (%) was read`, expected: 'a number', actual: r.values['Distributor Discount (%)'] || '(empty)', passed: !Number.isNaN(money(r.values['Distributor Discount (%)'])) }] : []),
  ];
}

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Migrated orders priced by partner grade (crm-mig only, read-only)`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - end').catch(() => {});
  });

  test(`${TC}: Open migrated orders priced by partner grade`, baselineDetails(TC), async ({ page }, testInfo) => {
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
        const candidates = await findCandidates(page, t.domain);
        console.log(`  - ${t.label}: crm-mig candidates with a customer invoice (newest first): ${candidates.map((c) => c.name).join(', ') || '(none)'}`);
        const order = candidates[0];
        if (order) {
          targets.push({ label: t.label, order });
          console.log(`    used: ${order.name} (customer ${order.partner}) - crm-mig order id ${order.id}, invoice ${order.invoiceNumber} (id ${order.invoiceId})`);
        } else console.log(`    no migrated order found on crm-mig for ${t.label}`);
      }
      await recordChecks(page, testInfo, checks, [
        { what: 'Pre-condition 2 - an order with a customer invoice was found on crm-mig for every grade and for the distributor', expected: `${TARGETS.length} orders`, actual: `${targets.length} orders`, passed: targets.length === TARGETS.length },
      ], `${TC} - Pre-condition 2 orders found`, []);
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      if (!targets.length) console.log('  - not run: no migrated order found (Pre-condition 2)');
      for (const target of targets) {
        const read = await readPair(new QuotationPageMig(page), new DealElementPageMig(page), new InvoiceLinesPageMig(page), baseUrl_mig, target.order.id, target.order.invoiceId, `crm-mig ${target.label}`);
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
