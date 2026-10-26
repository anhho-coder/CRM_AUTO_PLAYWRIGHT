import { Page, TestInfo, test } from '@playwright/test';
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
 *  CRM-12144_6.1 - Open a migrated order and invoice that carried a promotional discount   (crm-mig only, READ-ONLY)
 * ================================================================================================
 * Test Case ID     : CRM-12144_6.1
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 57, Jira link empty)
 * Automation-Type  : refactored (2026-10-23: every pre-production step and query removed - see "Removed" below;
 *                    earlier the same day: every verify shot is taken on the screen its value is read from - Promotion
 *                    and the order values on the Sales Order form, the invoice values on the Invoices list)
 * Automation-Date  : 2026-10-23
 * Baseline         : Discount_6.1 (Jira CRM-13798; tests/1.Project_CRM/10.Sales_Module/Discount/6. Data & history/
 *                    tc-discount-6-1-migrated-order-promotional-discount.spec.ts) - run it on its own for the reference side
 * Spec             : [Migration] Discounts (Promotions) v6 - IS-CRM-FUNC-0090-01
 * Source version   : master row CRM-12144_6.1 as updated 2026-10-23 (reference steps removed) - re-check before trusting this spec
 * Host             : crm-mig only (https://crm-mig.nakivo.site, db nakivoCE)
 * Run as           : reader users.admin_crm_mig
 *
 * READ-ONLY: this spec only reads a migrated order and its invoice. It never saves, confirms, edits or deletes
 * anything, and it creates nothing, so there is no teardown. The migrated ids are never added to any run's record list.
 *
 * Removed - pre-production reference (tester 2026-10-23: pre-production will be shut down)
 * -----------------------------------------------------------------------------------------
 * The old master row's Pre-condition 2, Step 2 and Step 3 opened or compared with the reference system; they were
 * removed from this spec AND from the master row (2026-10-23), and Pre-condition 3 (now searching crm-mig, not
 * pre-production) became Pre-condition 2. The reference half lives only in the baseline spec, run on demand while
 * pre-production is up:
 *   npx playwright test --grep "Discount_6\.1:" --project=chromium
 *
 * Summary
 * -------
 * A migrated sale order with a "10.0% discount on products" line and its invoice are read on crm-mig: exactly one
 * reward line, and the order Total, Total in Company Currency and the invoice Total and Total in Company Currency shown.
 *
 * Known bug - SKIPPED (tester decision 2026-10-23)
 * ------------------------------------------------
 * CRM-13822 (Bug [Maintenance], P2, assigned to Nathan Do): migrated Sales Orders carry no Promotion on crm-mig.
 * SO217919 shows "Deal registration promotion, 10% on Product, Support Services do not qualify" on the reference
 * system and an empty Promotion on crm-mig, so the (now removed) Step 3 - Promotion comparison failed; the other 27 of
 * 28 checks passed (last run 2026-10-23 11:32). Database read 2026-10-23: no migrated order on crm-mig carries a
 * Promotion, for any program. The whole describe block is skipped by test.skip(true, KNOWN_BUG) at describe level.
 * Since the pre-production steps were removed, no check left in this spec reads the Promotion (it is printed and shot
 * only). Remove the skip once CRM-13822 is fixed and re-run.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_6\.1:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_6.1, master "Migration - Discount")
 * ------------------------------------------------------------------------------------------------
 *  Title: Open a migrated order and invoice that carried a promotional discount (IS-CRM-FUNC-0090-01)
 *  Priority: P1 | Spec Areas: 0090-01 - promotional kept
 *  Pre-conditions
 *    1. Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only
 *       (e.g. Thomas Semerich)
 *    2. Find through the search box and filters (never by record id) a migrated sale order with a "10.0% discount on
 *       products" line and its invoice; do not change the migrated record
 *    Note (2026-10-23): the reference-system steps were removed - pre-production will be shut down; the reference side
 *    stays in baseline Discount_6.1 (CRM-13798), run on demand
 *  Executed Steps
 *    1. On crm-mig, open the order and its invoice
 *  Expected Results
 *    1. The order shows exactly one "10.0% discount on products" line; the order Total and Total in Company Currency
 *       and the invoice Total and Total in Company Currency are shown
 *
 *  Port notes (mechanical only): reader account users.admin_crm_mig on crm-mig instead of the salesperson, because the
 *  salesperson cannot open others' orders (the baseline's reason). Pre-condition 2 is a bounded search on crm-mig
 *  (newest first, at most 20 candidates created before 2026-09-01 - only migrated orders are that old), each with its
 *  newest customer invoice; the first candidate that has one is used and opened by id (no sale.order list-search page
 *  object exists). Step 1 keeps the baseline's checks on crm-mig. Promotion, every line and the invoice Untaxed Amount are printed, not asserted.
 * ================================================================================================
 */

const TC = 'CRM-12144_6.1';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich) - [READER users.admin_crm_mig used: the salesperson cannot open others\' orders]',
  pre2: '[INTERNAL check, Call API] Pre-condition 2: Find through the search box and filters (never by record id) a migrated sale order with a "10.0% discount on products" line and its invoice; do not change the migrated record - [bounded search on crm-mig, newest first, at most 20 candidates created before 2026-09-01 (only migrated orders are that old), each with its newest customer invoice; the first one that has it is used]',
  s1: 'Step 1: On crm-mig, open the order and its invoice',
  verify: 'Verification',
} as const;

const CRM_READER = users.admin_crm_mig;
const REWARD_PRODUCT = DISCOUNT_MIG.dealRegistrationProduct;
const CANDIDATES = 20; // newest orders per search - still bounded
const KNOWN_BUG =
  'Skipped due to bug CRM-13822 - migrated Sales Orders carry no Promotion on crm-mig; expected result kept, see header';

type Inv = { id: number; number: string; type: string; state: string };
interface Candidate { id: number; name: string; partner: string; invoiceId: number; invoiceNumber: string }
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

/**
 * Order + invoice read on crm-mig: the master's values, plus the lines' amounts.
 * The order form is shot with the Promotion field outlined BEFORE the invoice is opened (the shot carries no verdict).
 */
async function readPair(page: Page, testInfo: TestInfo, q: QuotationPage, inv: InvoicePage, base: string, orderId: number, invoiceId: number, tag: string): Promise<{ values: Values; rewardLines: number; orderLines: number; invoiceTcc: string }> {
  const values: Values = {};
  await q.openRecordFormById(base, 'sale.order', orderId);
  await q.dismissErrorDialogWithRetry();
  values['Promotion'] = await q.getFieldDisplayValue('promotion_id');
  const promotionField = await q.revealFormField('promotion_id');
  const shown = promotionField.visible ? 'shown on the form' : promotionField.present ? 'on the form but HIDDEN' : 'NOT on the form';
  console.log(`  - Promotion field (promotion_id) [${tag}] : ${shown}`);
  await CommonUtils.captureVerifyEvidence(page, testInfo, {
    name: `${TC} - order form on ${tag} (Promotion field)`,
    passed: 'read',
    highlight: [promotionField.selector],
    lines: [`[${tag}] order id ${orderId}`, `Promotion : ${values['Promotion'] || '(empty)'}`, `Promotion field : ${shown}`],
  }).catch(() => {});
  const rows = await q.getAllOrderLineRows();
  rows.forEach((r, i) => {
    values[`Line ${i + 1} Product`] = r['Product'] ?? '';
    values[`Line ${i + 1} Unit Price`] = r['Unit Price'] ?? '';
    values[`Line ${i + 1} Subtotal`] = r['Subtotal'] ?? '';
  });
  values['Total'] = await q.getFieldDisplayValue('amount_total');
  values['Total in Company Currency'] = await q.getFieldDisplayValue('amount_total_company_signed');
  const rewardLines = rows.filter((r) => (r['Product'] ?? '').trim() === REWARD_PRODUCT).length;
  console.log(`  ORDER [${tag}] (${rows.length} lines, ${rewardLines} reward line(s))`);
  console.log(`    - Promotion                 : ${values['Promotion'] || '(empty)'}`);
  for (const r of rows) console.log(`    - line ${r['Product'] ?? '?'} | Unit Price ${r['Unit Price'] ?? '(empty)'} | Subtotal ${r['Subtotal'] ?? '(empty)'}`);
  console.log(`    - Total                     : ${values['Total'] || '(empty)'}`);
  console.log(`    - Total in Company Currency : ${values['Total in Company Currency'] || '(empty)'}`);

  await inv.openInvoiceById(invoiceId);
  await inv.dismissErrorDialogWithRetry();
  values['Invoice Total'] = await inv.getFieldDisplayValue('amount_total');
  const untaxed = await inv.getFieldDisplayValue('amount_untaxed');
  const invLines = await inv.getInvoiceLineRowCount();
  const listed = await inv.getTotalInCompanyCurrencyForInvoiceId(invoiceId);
  values['Invoice Total in Company Currency'] = listed.value;
  console.log(`  INVOICE [${tag}] id ${invoiceId} (not compared: untaxed ${untaxed || '(empty)'}, ${invLines} invoice line(s))`);
  console.log(`    - Total                     : ${values['Invoice Total'] || '(empty)'}`);
  console.log(`    - Total in Company Currency : ${values['Invoice Total in Company Currency'] || '(empty)'}`);
  return { values, rewardLines, orderLines: rows.length, invoiceTcc: listed.value };
}

/** The two screens one system's values are read from. */
interface Screens { q: QuotationPage; inv: InvoicePage; base: string; orderId: number; invoiceId: number }

/**
 * Each check's evidence on the screen its value is read from: Promotion (outlined alone) and the order values on the
 * Sales Order form, the invoice values on the Invoices list (where Total in Company Currency is read). A shot taken on
 * the wrong screen marks nothing and points the reader at the wrong record. Navigation only - nothing is edited.
 */
async function recordOnScreens(page: Page, testInfo: TestInfo, checks: Check[], rows: Check[], name: string, s: Screens): Promise<void> {
  const isInvoice = (c: Check): boolean => /\binvoice\b/i.test(c.what);
  const isPromotion = (c: Check): boolean => /\bPromotion\b/.test(c.what);
  const promotionRows = rows.filter(isPromotion);
  const orderRows = rows.filter((c) => !isInvoice(c) && !isPromotion(c));
  const invoiceRows = rows.filter(isInvoice);
  if (promotionRows.length || orderRows.length) {
    await s.q.openRecordFormById(s.base, 'sale.order', s.orderId);
    await s.q.dismissErrorDialogWithRetry();
    if (promotionRows.length) {
      const promotionField = await s.q.revealFormField('promotion_id');
      await recordChecks(page, testInfo, checks, promotionRows, `${name} - Sales Order, Promotion`, [promotionField.selector]);
    }
    if (orderRows.length) await recordChecks(page, testInfo, checks, orderRows, `${name} - Sales Order`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
  }
  if (invoiceRows.length) {
    await s.inv.getTotalInCompanyCurrencyForInvoiceId(s.invoiceId); // lands on the Invoices list filtered on this invoice
    await recordChecks(page, testInfo, checks, invoiceRows, `${name} - Invoice`, []);
  }
}

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Migrated order and invoice with a promotional discount (crm-mig only, read-only)`, () => {
  // Skipped due to bug CRM-13822: migrated Sales Orders carry no Promotion on crm-mig (every program) - remove when fixed
  test.skip(true, KNOWN_BUG); // bug CRM-13822 (open)

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - end').catch(() => {});
  });

  test(`${TC}: Open a migrated order and invoice that carried a promotional discount [CRM-13822]`, baselineDetails(TC), async ({ page }, testInfo) => {
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
      const candidates = await findCandidates(page, [['order_line.product_id.name', '=', REWARD_PRODUCT]]);
      console.log(`  - crm-mig candidates with a customer invoice (newest first): ${candidates.map((c) => c.name).join(', ') || '(none)'}`);
      target = candidates[0];
      if (target) console.log(`  - used: ${target.name} (customer ${target.partner}) - crm-mig order id ${target.id}, invoice ${target.invoiceNumber} (id ${target.invoiceId})`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Pre-condition 2 - a migrated order with the reward line and a customer invoice found on crm-mig', expected: '1 order', actual: target ? target.name : 'none found', passed: !!target },
      ], `${TC} - Pre-condition 2 order found`, []);
    });

    // ================= Steps =================
    let crmRead: Awaited<ReturnType<typeof readPair>> | undefined;
    let crmScreens: Screens | undefined;
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      if (!target) {
        console.log('  - not run: no migrated order found (Pre-condition 2)');
        return;
      }
      crmScreens = { q: new QuotationPageMig(page), inv: new InvoiceLinesPageMig(page), base: baseUrl_mig, orderId: target.id, invoiceId: target.invoiceId };
      crmRead = await readPair(page, testInfo, crmScreens.q, crmScreens.inv, crmScreens.base, crmScreens.orderId, crmScreens.invoiceId, 'crm-mig');
      await recordOnScreens(page, testInfo, checks, [
        { what: 'crm-mig - order shows exactly one "10.0% discount on products" line', expected: '1', actual: String(crmRead.rewardLines), passed: crmRead.rewardLines === 1 },
        { what: 'crm-mig - order Total was read', expected: 'a non-empty amount', actual: crmRead.values['Total'] || '(empty)', passed: !!crmRead.values['Total'] },
        { what: 'crm-mig - order Total in Company Currency was read', expected: 'a non-empty amount', actual: crmRead.values['Total in Company Currency'] || '(empty)', passed: !!crmRead.values['Total in Company Currency'] },
        { what: 'crm-mig - invoice Total was read', expected: 'a non-empty amount', actual: crmRead.values['Invoice Total'] || '(empty)', passed: !!crmRead.values['Invoice Total'] },
        { what: 'crm-mig - invoice Total in Company Currency was read', expected: 'a non-empty amount', actual: crmRead.invoiceTcc || '(empty)', passed: !!crmRead.invoiceTcc },
      ], `${TC} - Step 1 crm-mig values read`, crmScreens);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - migrated order and invoice read on crm-mig');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
