import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPageMig, QuotationPageMig, InvoiceLinesPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { confirmQuotationOnO12CE } from '@helpers/o12ce-main-business.helper';
import {
  DISCOUNT_MIG,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  money,
  sameCents,
  newDiscountRun,
  idFromUrl,
  rewardRows,
  recordChecks,
  printVerifyAndAssertMig,
  signInMig,
  createEndCustomerCompanyMig,
  createOpportunityForCompanyMig,
  openDealElementFromOpportunity,
  saveDealElement,
  newQuotationMig,
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
  baselineDetails,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_2.4 - Confirm and invoice a quotation carrying Deal registration   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_2.4
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 37, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_2.4 (Jira CRM-13781; tests/1.Project_CRM/10.Sales_Module/Discount/2. Applying discounts to orders/
 *                    tc-discount-2-4-confirm-and-invoice-deal-registration.spec.ts) - assertions ported unchanged
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0078
 * Source version   : master row CRM-12144_2.4 as read 2026-10-21 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE)
 * Run as           : Steps 1-3 - Salesperson in Sales / User: Own Documents Only who also has Accounting & Finance /
 *                    Billing (Thomas Semerich, users.sale_ic_thomas_crm_mig)
 *                    Step 4   - Operations user (Veronika Stasinievych, users.manager_veronika_crm_mig)
 *
 * Summary
 * -------
 * A Deal-registration quotation (A2144B x 6) is confirmed and invoiced: the invoice carries the untaxed qty-1 negative
 * reward line and the order's totals; as the Operations user the reward line books 0 and the product lines book the total.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_2\.4:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_2.4, master "Migration - Discount")
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Login to crm-mig as a salesperson in Sales / User: Own Documents Only who also has Accounting & Finance / Billing
 *    2. Create a new company in Contacts with:
 *         - Name        = Disc-Cust-<timestamp>
 *         - Type        = end customer (no Reseller, no Distributor)
 *         - Pricelist   = Public Pricelist (USD)
 *       [automation data, same as the baseline]
 *         - Email       = disc.cust.<timestamp>@d<timestamp>.discautotest.com
 *         - Country     = United States
 *         - State       = Maryland
 *         - Sales Team  = BDEU
 *         - Salesperson = Thomas Semerich
 *    3. Create a new opportunity in CRM > Pipeline with (LIST view - the kanban quick-create card lacks these fields):
 *         - Name        = Disc-Opp-<timestamp>
 *         - Customer    = Disc-Cust-<timestamp>
 *    4. Have an Operations user to read Booked value (company currency)
 *    5. As the salesperson, in Invoicing > Customers > Invoices (list), switch on the "Total in Company Currency"
 *       column in the column panel - crm-mig hides it by default, pre-production shows it (tester, 2026-10-23)
 *  Executed Steps
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment; add A2144B with Ordered Qty 6, pick Deal registration, click Save, then New quotation
 *    2. Click Confirm
 *    3. Click Create Invoice and create the invoice
 *    4. As the Operations user, open each invoice line
 *    5. Clean-up: cancel the invoice and the sale order
 *  Expected Results
 *    2. The status bar shows Sale Order; the reward line is unchanged
 *    3. The invoice has a "10.0% discount on products" line, quantity 1, a negative amount, no tax; its Untaxed Amount and Total equal the order's Total; its Total in Company Currency equals the order's
 *    4. The reward line's Booked value (company currency) = 0; the product lines' booked values add up to the Total in Company Currency
 *
 *  Port notes : accounts *_crm_mig; Mig helpers and Mig list readers; New quotation = newQuotationMig; Confirm =
 *               confirmQuotationOnO12CE (status bar read after it flips); every invoice id goes to run.invoiceIds.
 * ================================================================================================
 */

const TC = 'CRM-12144_2.4';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only who also has Accounting & Finance / Billing (Thomas Semerich)',
  pre2: 'Pre-condition 2: On crm-mig, create a new company in Contacts: Name = Disc-Cust-<timestamp>, end customer (no Reseller, no Distributor), Pricelist = Public Pricelist (USD)',
  pre3: 'Pre-condition 3: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields): Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  pre5: 'Pre-condition 5: As the salesperson, in Invoicing > Customers > Invoices (list), switch on the "Total in Company Currency" column in the column panel (hidden by default on crm-mig)',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment; add A2144B with Ordered Qty 6, pick Deal registration, click Save, then New quotation',
  s2: 'Step 2: Click Confirm',
  s3: 'Step 3: Click Create Invoice and create the invoice',
  s4: 'Step 4: As the Operations user, open each invoice line',
  s5: 'Step 5: Clean-up: cancel the invoice and the sale order (done by the afterEach teardown as the CRM administrator)',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const SALES = users.sale_ic_thomas_crm_mig;
const OPERATIONS = users.manager_veronika_crm_mig;
const runs: DiscountRun[] = [];

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

/** The cell of a row whose header matches `re` (invoice-line headers differ from order-line headers). */
const cellBy = (row: Record<string, string>, re: RegExp): string => {
  const key = Object.keys(row).find((k) => re.test(k));
  return key ? row[key] : '';
};
const isRewardRow = (row: Record<string, string>) => Object.values(row).some((v) => v.includes(DISCOUNT_MIG.dealRegistrationProduct));

test.describe(`${TC} - Confirm and invoice a quotation carrying Deal registration (crm-mig)`, () => {
  let run: DiscountRun;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    run = newDiscountRun();
    runs.push(run);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (!SKIP_CLEANUP) await teardownDiscountRunMig(page, run, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.afterAll(async ({ browser }) => {
    if (!SKIP_CLEANUP) await sweepDiscountRunsMig(browser, runs);
  });

  test(`${TC}: Confirm and invoice a quotation carrying Deal registration`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const quotationPage = new QuotationPageMig(page);
    const invoicePage = new InvoiceLinesPageMig(page); // Invoice Lines keyed the same way
    const checks: Check[] = [];
    const order = { total: '', companyTotal: '', reward: '' };
    let invoiceId: number | undefined;
    let invoiceCompanyTotal = '';

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : crm-mig`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signInMig(page, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in on crm-mig as the salesperson');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await createEndCustomerCompanyMig(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - company created');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createOpportunityForCompanyMig(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - opportunity created');
    });

    await test.step(STEP.pre5, async () => {
      console.log(`\n--- ${STEP.pre5} ---`);
      await invoicePage.openCustomerInvoicesList();
      const on = await invoicePage.switchOnListColumn('amount_total_company_signed', 'Total in Company Currency');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 5 - Total in Company Currency column on');
      if (!on) throw new Error('Pre-condition 5: the "Total in Company Currency" column could not be switched on in the Invoices list');
      // back on the opportunity form: Step 1 starts there (DEAL ELEMENT)
      if (!run.urlOpp) throw new Error('Pre-condition 5: the opportunity URL of Pre-condition 3 is unknown');
      await page.goto(run.urlOpp);
      await page.waitForTimeout(CommonUtils.waitTimes.long);
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 6);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,974.00');
      await dealElementPage.setPromotion(DISCOUNT_MIG.dealRegistration, { exact: true });
      await saveDealElement(page, run);
      const qId = await newQuotationMig(page, run);
      await quotationPage.dismissErrorDialogWithRetry();
      order.reward = rewardRows(await quotationPage.getAllOrderLineRows())[0]?.['Subtotal'] ?? '';
      console.log(`  - Quotation id ${qId} | reward line ${order.reward || '(none)'}`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const confirmed = await confirmQuotationOnO12CE(page); // crm-mig: the status bar is read once it has flipped to the Sale Order
      console.log(`  - Sale Order number : ${confirmed.orderNumber || '(not read)'}`);
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
        const line = await invoicePage.openInvoiceLineDialog(DISCOUNT_MIG.dealRegistrationProduct);
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
      await signInMig(page, OPERATIONS);
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
      printVerifyAndAssertMig(checks);
    });
  });
});
