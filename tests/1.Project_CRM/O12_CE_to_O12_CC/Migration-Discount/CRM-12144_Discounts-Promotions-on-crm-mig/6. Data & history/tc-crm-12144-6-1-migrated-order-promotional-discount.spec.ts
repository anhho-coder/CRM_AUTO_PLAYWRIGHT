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
 *  CRM-12144_6.1 - Open a migrated order and invoice that carried a promotional discount   (crm-mig, READ-ONLY)
 * ================================================================================================
 * Test Case ID     : CRM-12144_6.1
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 57, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_6.1 (Jira CRM-13798; tests/1.Project_CRM/10.Sales_Module/Discount/6. Data & history/
 *                    tc-discount-6-1-migrated-order-promotional-discount.spec.ts) - its reads are the reference side here
 * Spec             : [Migration] Discounts (Promotions) v6 - IS-CRM-FUNC-0090-01
 * Source version   : master row CRM-12144_6.1 as read 2026-10-21 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE) and the reference system (pre-production)
 * Run as           : crm-mig - reader users.admin_crm_mig; reference - users.admin_crm
 *
 * READ-ONLY: this spec only reads a migrated order and its invoice on both systems. It never saves, confirms, edits
 * or deletes anything, and it creates nothing, so there is no teardown. The migrated ids are never added to any
 * run's record list.
 *
 * Summary
 * -------
 * A migrated sale order with a "10.0% discount on products" line and its invoice are read on crm-mig and on the
 * reference system; Promotion, every line Unit Price and Subtotal, Total, Total in Company Currency and the invoice
 * Total and Total in Company Currency must match to the cent.
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
 *    2. Have the reference system URL and login from the development team (a non-Production copy of the CRM in use
 *       today)
 *    3. Find through the search box and filters (never by record id) a migrated sale order with a "10.0% discount on
 *       products" line and its invoice; do not change the migrated record
 *  Executed Steps
 *    1. On crm-mig, open the order and its invoice
 *    2. Open the same order and invoice on the reference system
 *    3. Compare Promotion (the program that produced the discount), the reward line amount, the line amounts, Total
 *       and Total in Company Currency
 *  Expected Results
 *    3. Every compared value is the same on both systems (a difference of 0.01 or more is a fail)
 *
 *  Port notes (mechanical only): reader account users.admin_crm_mig on crm-mig instead of the salesperson, because the
 *  salesperson cannot open others' orders (the baseline's reason; the baseline reads as users.admin_crm for the same
 *  reason). Pre-condition 3 is a bounded search on pre-production (ProgramOwner, newest first, at most 20 candidates created before 2026-09-01);
 *  a candidate is used when its NAME exists exactly once on crm-mig with the same customer and an invoice matched by NUMBER. The
 *  crm-mig order is opened by the id that exact-name check returned: no sale.order list-search page object exists.
 *  Compared: the master's named values on the order (Promotion, each line's Unit Price and Subtotal, Total, Total in
 *  Company Currency), each line's Product (line identity), plus the invoice Total and Total in Company Currency (the
 *  baseline reads them in the same step; the master names the order fields only). Invoice Untaxed Amount and the
 *  invoice lines are printed, not compared.
 * ================================================================================================
 */

const TC = 'CRM-12144_6.1';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich) - [READER users.admin_crm_mig used: the salesperson cannot open others\' orders]',
  pre2: 'Pre-condition 2: Have the reference system URL and login from the development team (pre-production, users.admin_crm) - [signed in on its own browser context]',
  pre3: '[INTERNAL check, Call API] Pre-condition 3: Find through the search box and filters (never by record id) a migrated sale order with a "10.0% discount on products" line and its invoice; do not change the migrated record - [bounded search on pre-production, newest first, at most 20 candidates created before 2026-09-01, each with its newest customer invoice; kept when its NAME exists exactly once on crm-mig with the same customer, and its invoice NUMBER is carried by exactly one invoice on that order]',
  s1: 'Step 1: On crm-mig, open the order and its invoice',
  s2: 'Step 2: Open the same order and invoice on the reference system',
  s3: 'Step 3: Compare Promotion (the program that produced the discount), the reward line amount, the line amounts, Total and Total in Company Currency',
  verify: 'Verification',
} as const;

const CRM_READER = users.admin_crm_mig;
const REF_READER = users.admin_crm;
const REWARD_PRODUCT = DISCOUNT_MIG.dealRegistrationProduct;
const CANDIDATES = 20; // newest orders per search - still bounded

type Inv = { id: number; number: string; type: string; state: string };
interface Candidate { id: number; name: string; partner: string; invoiceId: number; invoiceNumber: string }
interface Target { ref: Candidate; refInvoiceId: number; crmId: number; crmInvoiceId: number }
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

/** Order + invoice read on one system (the same screens on both): the master's values, plus the lines' amounts. */
async function readPair(q: QuotationPage, inv: InvoicePage, base: string, orderId: number, invoiceId: number, tag: string): Promise<{ values: Values; rewardLines: number; orderLines: number; invoiceTcc: string }> {
  const values: Values = {};
  await q.openRecordFormById(base, 'sale.order', orderId);
  await q.dismissErrorDialogWithRetry();
  values['Promotion'] = await q.getFieldDisplayValue('promotion_id');
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

/** Step 3 - every compared value, side by side, to the cent (text values must match exactly). */
async function compareStep(page: Page, testInfo: TestInfo, checks: Check[], crm: Values, ref: Values): Promise<void> {
  const keys = [...new Set([...Object.keys(crm), ...Object.keys(ref)])];
  console.log('  Side by side (crm-mig | reference):');
  const rows: Check[] = keys.map((k) => {
    const c = crm[k] ?? '(missing)';
    const r = ref[k] ?? '(missing)';
    const amount = /Unit Price|Subtotal|Total/.test(k);
    const blankBoth = !c.trim() && !r.trim();
    const shownC = blankBoth ? '(blank on both)' : c;
    const shownR = blankBoth ? '(blank on both)' : r;
    console.log(`    - ${k.padEnd(34)} ${shownC.padEnd(18)} | ${shownR}`);
    return { what: `Step 3 - ${k}`, expected: shownR, actual: shownC, passed: sameValue(c, r, amount) };
  });
  await recordChecks(page, testInfo, checks, rows, `${TC} - Step 3 crm-mig vs reference`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
}

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Migrated order and invoice with a promotional discount (crm-mig, read-only)`, () => {
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

  test(`${TC}: Open a migrated order and invoice that carried a promotional discount`, baselineDetails(TC), async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const checks: Check[] = [];
    let target: Target | undefined;

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
      const candidates = await findCandidates([['order_line.product_id.name', '=', REWARD_PRODUCT]]);
      console.log(`  - reference candidates (newest first): ${candidates.map((c) => c.name).join(', ') || '(none)'}`);
      for (const c of candidates) {
        const m = await matchOnCrm(page, c);
        if (m.ok) {
          target = { ref: c, refInvoiceId: c.invoiceId, crmId: m.crmId, crmInvoiceId: m.crmInvoiceId };
          console.log(`  - used: ${c.name} (customer ${c.partner}) - crm-mig order id ${m.crmId}, invoice id ${m.crmInvoiceId}; reference order id ${c.id}, invoice id ${target.refInvoiceId}`);
          break;
        }
        console.log(`  - not used: ${c.name} - ${m.reason}`);
      }
      await recordChecks(page, testInfo, checks, [
        { what: 'Pre-condition 3 - a migrated order with the reward line matched on both systems', expected: '1 order', actual: target ? target.ref.name : 'none of the candidates matched', passed: !!target },
      ], `${TC} - Pre-condition 3 order found`, []);
    });

    // ================= Steps =================
    let crmRead: Awaited<ReturnType<typeof readPair>> | undefined;
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      if (!target) {
        console.log('  - not run: no migrated order matched (Pre-condition 3)');
        return;
      }
      crmRead = await readPair(new QuotationPageMig(page), new InvoiceLinesPageMig(page), baseUrl_mig, target.crmId, target.crmInvoiceId, 'crm-mig');
      await recordChecks(page, testInfo, checks, [
        { what: 'crm-mig - order shows exactly one "10.0% discount on products" line', expected: '1', actual: String(crmRead.rewardLines), passed: crmRead.rewardLines === 1 },
        { what: 'crm-mig - order Total was read', expected: 'a non-empty amount', actual: crmRead.values['Total'] || '(empty)', passed: !!crmRead.values['Total'] },
        { what: 'crm-mig - order Total in Company Currency was read', expected: 'a non-empty amount', actual: crmRead.values['Total in Company Currency'] || '(empty)', passed: !!crmRead.values['Total in Company Currency'] },
        { what: 'crm-mig - invoice Total was read', expected: 'a non-empty amount', actual: crmRead.values['Invoice Total'] || '(empty)', passed: !!crmRead.values['Invoice Total'] },
        { what: 'crm-mig - invoice Total in Company Currency was read', expected: 'a non-empty amount', actual: crmRead.invoiceTcc || '(empty)', passed: !!crmRead.invoiceTcc },
      ], `${TC} - Step 1 crm-mig values read`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - migrated order and invoice read on crm-mig');
    });

    let refRead: Awaited<ReturnType<typeof readPair>> | undefined;
    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const refNow = refPage;
      if (!target || !refNow) {
        console.log('  - not run: no migrated order matched (Pre-condition 3)');
        return;
      }
      refRead = await readPair(new QuotationPage(refNow), new InvoicePage(refNow), baseUrl, target.ref.id, target.refInvoiceId, 'reference');
      await recordChecks(refNow, testInfo, checks, [
        { what: 'reference - order shows exactly one "10.0% discount on products" line', expected: '1', actual: String(refRead.rewardLines), passed: refRead.rewardLines === 1 },
        { what: 'reference - order Total was read', expected: 'a non-empty amount', actual: refRead.values['Total'] || '(empty)', passed: !!refRead.values['Total'] },
        { what: 'reference - order Total in Company Currency was read', expected: 'a non-empty amount', actual: refRead.values['Total in Company Currency'] || '(empty)', passed: !!refRead.values['Total in Company Currency'] },
        { what: 'reference - invoice Total was read', expected: 'a non-empty amount', actual: refRead.values['Invoice Total'] || '(empty)', passed: !!refRead.values['Invoice Total'] },
        { what: 'reference - invoice Total in Company Currency was read', expected: 'a non-empty amount', actual: refRead.invoiceTcc || '(empty)', passed: !!refRead.invoiceTcc },
      ], `${TC} - Step 2 reference values read`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
      await CommonUtils.captureAndAttachScreenshot(refNow, testInfo, 'Step 2 - migrated order and invoice read on the reference system');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      if (!crmRead || !refRead) {
        console.log('  - not run: one of the two reads did not happen');
        return;
      }
      await compareStep(page, testInfo, checks, crmRead.values, refRead.values);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
