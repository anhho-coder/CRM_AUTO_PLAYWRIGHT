import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPage, QuotationPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_BASELINE,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  money,
  sameCents,
  newDiscountRun,
  idFromUrl,
  signIn,
  createEndCustomerCompany,
  createOpportunityForCompany,
  openDealElementFromOpportunity,
  saveDealElement,
  rewardRows,
  recordChecks,
  printVerifyAndAssert,
  teardownDiscountRun,
} from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  Discount_2.4 - Confirm and invoice a quotation carrying Deal registration   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_2.4
 * Automation-Type  : new
 * Automation-Date  : 2026-10-20
 * Mirrors          : CRM-12144_2.4 (crm-mig manual TC, master "Migration - Discount" row 37) - same steps,
 *                    same expected results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : CRM-13781
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0078
 * Source version   : master row CRM-12144_2.4 as read 2026-10-20 - re-check before trusting this spec
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Steps 1-3 - Salesperson in Sales / User: Own Documents Only who also has Accounting & Finance /
 *                    Billing (Thomas Semerich, users.sale_ic_thomas - holds Billing on pre-prod, read 2026-10-20)
 *                    Step 4   - Operations user (Veronika Stasinievych, users.manager_veronika - group "Operations")
 *
 * Summary
 * -------
 * A Deal-registration quotation (A2144B x 6) is confirmed and invoiced: the invoice carries the untaxed qty-1 negative
 * reward line and the order's totals; as the Operations user the reward line books 0 and the product lines book the total.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_2\.4:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_2.4, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Login to pre-production as a salesperson in Sales / User: Own Documents Only who also has Accounting &
 *       Finance / Billing (Thomas Semerich)
 *    2. Contacts > Create a new company:
 *         - Name        = Disc-Cust-<timestamp>
 *         - Type        = Company - end customer (no Reseller, no Distributor)
 *         - Email       = disc.cust.<timestamp>@d<timestamp>.discautotest.com
 *         - Country     = United States
 *         - State       = Maryland
 *         - Sales Team  = BDEU
 *         - Salesperson = Thomas Semerich
 *         - Pricelist   = Public Pricelist_USD   (crm-mig: "Public Pricelist (USD)")
 *    3. CRM > Pipeline (LIST view) > Create a new opportunity:
 *         - Name         = Disc-Opp-<timestamp>
 *         - Email        = the company's e-mail (links Company = Disc-Cust-<timestamp>)
 *         - Company Name = Disc-Cust-<timestamp>
 *         - Street       = 123 street
 *         - Country      = United States
 *         - State        = Maryland
 *         - Sales Team   = BDEU
 *         - Salesperson  = Thomas Semerich
 *         - Lead Form    = Download Free Trial
 *         - Stage        = New
 *    4. Have an Operations user to read Booked value (company currency) = Veronika Stasinievych
 *  Steps
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment;
 *       add A2144B with Ordered Qty 6, pick Deal registration, click Save, then New quotation
 *    2. Click Confirm
 *         -> Expected: the status bar shows Sale Order; the reward line is unchanged
 *    3. Click Create Invoice and create the invoice (the Invoice Lines list leaves a reward line's Quantity blank -
 *       open the line to read it. The invoice form does not show Total in Company Currency: open Invoicing >
 *       Customers > Invoices (list), filter ID = <the invoice's id> so only that invoice is listed - switch the
 *       "Total in Company Currency" column on in the column toggler if the list hides it - and read that cell;
 *       it is compared with the order's Total of the previous check)
 *         -> Expected: the invoice has a "10.0% discount on products" line, quantity 1, a negative amount, no tax; its
 *            Untaxed Amount and Total equal the order's Total; its Total in Company Currency equals the order's
 *    4. As the Operations user, open each invoice line
 *         -> Expected: the reward line's Booked value (company currency) = 0; the product lines' booked values add up
 *            to the Total in Company Currency
 *    5. Clean-up: cancel the invoice and the sale order - done by the afterEach teardown as the CRM administrator
 *       (cancel, then delete by id and recount), so a failed step cannot leave them behind
 * ================================================================================================
 */

const TC = 'Discount_2.4';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to pre-production (Odoo 12 EE, the reference system) as a salesperson in Sales / User: Own Documents Only who also has Accounting & Finance / Billing (Thomas Semerich)',
  pre2: 'Pre-condition 2: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_USD',
  pre3: 'Pre-condition 3: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment; add A2144B with Ordered Qty 6, pick Deal registration, click Save, then New quotation',
  s2: 'Step 2: Click Confirm',
  s3: 'Step 3: Click Create Invoice and create the invoice',
  s4: 'Step 4: As the Operations user, open each invoice line',
  s5: 'Step 5: [done by the afterEach teardown] Clean-up: cancel the invoice and the sale order',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const SALES = users.sale_ic_thomas;
const OPERATIONS = users.manager_veronika;

/** The cell of a row whose header matches `re` (invoice-line headers differ from order-line headers). */
const cellBy = (row: Record<string, string>, re: RegExp): string => {
  const key = Object.keys(row).find((k) => re.test(k));
  return key ? row[key] : '';
};
const isRewardRow = (row: Record<string, string>) => Object.values(row).some((v) => v.includes(DISCOUNT_BASELINE.dealRegistrationProduct));

test.describe(`${TC} - Confirm and invoice a quotation carrying Deal registration (pre-prod baseline of CRM-12144_2.4)`, () => {
  let run: DiscountRun;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    run = newDiscountRun();
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (!SKIP_CLEANUP) await teardownDiscountRun(page, run, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Confirm and invoice a quotation carrying Deal registration`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const invoicePage = new InvoicePage(page);
    const checks: Check[] = [];
    const order = { total: '', companyTotal: '', reward: '' };
    let invoiceId: number | undefined;
    let invoiceCompanyTotal = '';

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : pre-production`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signIn(page, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as the salesperson');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await createEndCustomerCompany(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - company created');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createOpportunityForCompany(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - opportunity created');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.listedProduct, 6);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,974.00');
      await dealElementPage.setPromotion('Deal registration');
      await saveDealElement(page, run);
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await quotationPage.dismissErrorDialogWithRetry();
      const qId = idFromUrl(page.url());
      if (qId) run.saleOrderIds.push(qId);
      order.reward = rewardRows(await quotationPage.getAllOrderLineRows())[0]?.['Subtotal'] ?? '';
      console.log(`  - Quotation id ${qId ?? '(not in URL)'} | reward line ${order.reward || '(none)'}`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.dismissErrorDialogWithRetry();
      await quotationPage.waitForConfirmButtonToDisappear(CommonUtils.waitTimes.abnormalWait).catch(() => {});
      const stage = await quotationPage.getActiveStatusBarStage();
      const rewards = rewardRows(await quotationPage.getAllOrderLineRows());
      order.total = await quotationPage.getFieldDisplayValue('amount_total');
      order.companyTotal = await quotationPage.getFieldDisplayValue('amount_total_company_signed');
      console.log(`  - Order Total                     : ${order.total}`);
      console.log(`  - Order Total in Company Currency : ${order.companyTotal}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - the status bar shows Sale Order', expected: 'Sales Order', actual: stage, passed: /sale/i.test(stage) && !/quotation/i.test(stage) },
        { what: 'Step 2 - the reward line is unchanged', expected: `1 line of ${order.reward}`, actual: `${rewards.length} line(s), ${rewards[0]?.['Subtotal'] ?? '-'}`, passed: rewards.length === 1 && order.reward !== '' && rewards[0]['Subtotal'] === order.reward },
      ], `${TC} - Step 2 confirmed sale order`, [DISCOUNT_HIGHLIGHT.orderLines]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-2 - sale order confirmed');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await invoicePage.clickCreateInvoice(CommonUtils.waitTimes.abnormalWait);
      await invoicePage.selectInvoiceableLines();
      await invoicePage.clickCreateAndViewInvoices();
      await invoicePage.dismissErrorDialogWithRetry();
      invoiceId = idFromUrl(page.url());
      if (invoiceId) run.invoiceIds.push(invoiceId);
      console.log(`  - Invoice id : ${invoiceId ?? '(not in URL)'}`);
      const n = await invoicePage.getInvoiceLineRowCount();
      const lines: Array<Record<string, string>> = [];
      for (let i = 0; i < n; i++) lines.push(await invoicePage.getInvoiceLineRowCells(i));
      lines.forEach((l, i) => console.log(`  - line ${i}: ${JSON.stringify(l)}`));
      const reward = lines.find(isRewardRow) ?? {};
      const amount = cellBy(reward, /^(amount|subtotal)$/i);
      const untaxed = await invoicePage.getFieldDisplayValue('amount_untaxed');
      const total = await invoicePage.getFieldDisplayValue('amount_total');
      // the list leaves the reward line's Quantity blank - open the line and read it there
      let qty = '';
      let taxes = cellBy(reward, /tax/i);
      if (Object.keys(reward).length) {
        const line = await invoicePage.openInvoiceLineDialog(DISCOUNT_BASELINE.dealRegistrationProduct);
        qty = cellBy(line, /^quantity$/i);
        if (Object.keys(line).some((k) => /^taxes$/i.test(k))) taxes = cellBy(line, /^taxes$/i);
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - Step 3 reward invoice line opened`, passed: money(qty) === 1, highlight: ['.modal-dialog'] }).catch(() => {});
        await invoicePage.closeLineDialog();
      }
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - the invoice has a "10.0% discount on products" line', expected: 'present', actual: Object.keys(reward).length ? 'present' : 'absent', passed: Object.keys(reward).length > 0 },
        { what: 'Step 3 - reward line quantity (read on the opened line)', expected: '1', actual: qty || '(none)', passed: money(qty) === 1 },
        { what: 'Step 3 - reward line amount is negative', expected: '< 0', actual: amount || '(none)', passed: money(amount) < 0 },
        { what: 'Step 3 - reward line has no tax', expected: '(none)', actual: taxes || '(none)', passed: taxes.trim() === '' },
        { what: "Step 3 - invoice Untaxed Amount = the order's Total", expected: order.total, actual: untaxed, passed: order.total !== '' && sameCents(money(untaxed), money(order.total)) },
        { what: "Step 3 - invoice Total = the order's Total", expected: order.total, actual: total, passed: order.total !== '' && sameCents(money(total), money(order.total)) },
      ], `${TC} - Step 3 invoice`, ['.o_form_sheet table.o_list_view', DISCOUNT_HIGHLIGHT.totals]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - invoice created');
      // Total in Company Currency is not on the invoice form - read it on the Invoices LIST, filtered to this one
      // invoice by its ID (tester's recipe, 2026-10-21); Expected = the order's Total of the previous check
      const listed = await invoicePage.getTotalInCompanyCurrencyForInvoiceId(invoiceId ?? 0);
      invoiceCompanyTotal = listed.value;
      await recordChecks(page, testInfo, checks, [
        {
          what: "Step 3 - invoice Total in Company Currency (Invoices list, ID filter) = the order's Total (the amount of the previous check)",
          expected: order.total,
          actual: listed.rows === 1 ? listed.value || '(empty cell)' : `${listed.rows} rows after the ID filter`,
          passed: listed.rows === 1 && order.total !== '' && sameCents(money(listed.value), money(order.total)),
        },
      ], `${TC} - Step 3 invoice Total in Company Currency (list)`, ['table.o_list_view']);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      console.log(`  - Login : ${OPERATIONS.username} (${OPERATIONS.displayName})`);
      await signIn(page, OPERATIONS);
      await invoicePage.openInvoiceById(invoiceId ?? 0);
      const n = await invoicePage.getInvoiceLineRowCount();
      const lines: Array<Record<string, string>> = [];
      for (let i = 0; i < n; i++) lines.push(await invoicePage.getInvoiceLineRowCells(i));
      console.log(`  - invoice line columns : ${JSON.stringify(Object.keys(lines[0] ?? {}))}`);
      lines.forEach((l, i) => console.log(`  - line ${i} booked value : ${cellBy(l, /booked/i) || '(no Booked value column)'}`));
      const reward = lines.find(isRewardRow);
      const products = lines.filter((l) => !isRewardRow(l));
      const rewardBooked = reward ? cellBy(reward, /booked/i) : '';
      const productBooked = products.reduce((s, l) => s + (money(cellBy(l, /booked/i)) || 0), 0);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 - reward line Booked value (company currency)', expected: '0.00', actual: rewardBooked || '(not shown)', passed: rewardBooked !== '' && money(rewardBooked) === 0 },
        { what: 'Step 4 - product lines Booked values add up to the Total in Company Currency', expected: invoiceCompanyTotal || order.companyTotal, actual: productBooked.toFixed(2), passed: sameCents(productBooked, money(invoiceCompanyTotal || order.companyTotal)) },
      ], `${TC} - Step 4 booked values`, ['.o_form_sheet table.o_list_view']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - invoice lines as the Operations user');
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      console.log(`  - invoice ids to cancel + delete in teardown    : ${JSON.stringify(run.invoiceIds)}`);
      console.log(`  - sale order ids to cancel + delete in teardown : ${JSON.stringify(run.saleOrderIds)}`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
