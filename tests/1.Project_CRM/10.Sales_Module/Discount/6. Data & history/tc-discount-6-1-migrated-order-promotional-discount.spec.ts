import { test } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { QuotationPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_BASELINE,
  DiscountRun,
  Check,
  money,
  newDiscountRun,
  signIn,
  rewardRows,
  recordChecks,
  printVerifyAndAssert,
  teardownDiscountRun,
  ProgramOwner,
} from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  Discount_6.1 - Open a migrated order and invoice that carried a promotional discount
 *                 (pre-production BASELINE, READ-ONLY)
 * ================================================================================================
 * Test Case ID     : Discount_6.1
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Mirrors          : CRM-12144_6.1 (crm-mig manual TC, master "Migration - Discount") - same steps, run on the
 *                    reference system so the crm-mig port can compare the same values
 * Jira             : CRM-13798
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591
 * Source version   : master row CRM-12144_6.1 as read 2026-10-21 - re-check before trusting this spec
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : reference-system login from the development team (users.admin_crm). Thomas Semerich sees
 *                    only his own documents, so he cannot open the migrated orders here.
 *
 * READ-ONLY: this spec only reads existing orders and invoices. It never saves, confirms, edits or deletes them;
 * the run's teardown removes only records this run created (none).
 *
 * Summary
 * -------
 * A migrated sale order with a "10.0% discount on products" line and its invoice are opened and read; each value
 * is printed for the crm-mig comparison. The order must show exactly one "10.0% discount on products" line.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_6\.1:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_6.1, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Title: "Open a migrated order and invoice that carried a promotional discount"
 *  Pre-conditions
 *    1. Login to crm-mig as the salesperson (reference system: users.admin_crm, see above)
 *    2. Find, through the search box / filters (never by record id), a migrated sale order with a
 *       "10.0% discount on products" line and its invoice; do not change it
 *  Steps
 *    1. On crm-mig, open the order and its invoice
 *    2. Open the same order and invoice on the reference system
 *    3. Compare Promotion, the reward line amount, the line amounts, Total and Total in Company Currency
 *  Expected
 *    3. Not comparable on the reference system (the crm-mig port compares). Asserted here: each value was read
 *       (non-empty) and the order shows exactly one "10.0% discount on products" line. Every value is printed.
 * ================================================================================================
 */

const TC = 'Discount_6.1';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to the reference system (Odoo 12 EE, pre-production) as the reference-system login from the development team (users.admin_crm); the crm-mig salesperson login does not exist here',
  pre2: 'Pre-condition 2: Find a migrated sale order with a "10.0% discount on products" line and its invoice through a bounded search (never by record id); do not change it',
  s1: '[NOT ON THE REFERENCE SYSTEM - crm-mig side of the comparison] Step 1: On crm-mig, open the order and its invoice',
  s2: 'Step 2: Open the same order and invoice on the reference system',
  s3: '[REFERENCE SIDE - this run is the reference system] Step 3: Compare Promotion, the reward line amount, the line amounts, Total and Total in Company Currency',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false;
const READER = users.admin_crm;
const REWARD_PRODUCT = DISCOUNT_BASELINE.dealRegistrationProduct;

test.describe(`${TC} - Migrated order and invoice with a promotional discount (pre-prod baseline, read-only)`, () => {
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

  test(`${TC}: Open a migrated order and invoice that carried a promotional discount`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const quotationPage = new QuotationPage(page);
    const invoicePage = new InvoicePage(page);
    const checks: Check[] = [];
    let owner: ProgramOwner | undefined;
    let orderId: number | undefined;
    let orderName = '';
    let invoiceId: number | undefined;

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Login : ${READER.username} (${READER.displayName})`);
      await signIn(page, READER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as the reference reader');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      owner = await ProgramOwner.open();
      const orders: Array<{ id: number; name: string; partner_id: [number, string] | false; invoice_ids: number[] }> = await owner.call(
        'sale.order',
        'search_read',
        [[
          ['state', 'in', ['sale', 'done']],
          ['order_line.product_id.name', '=', REWARD_PRODUCT],
          ['invoice_ids', '!=', false],
        ]],
        { fields: ['name', 'partner_id', 'invoice_ids'], limit: 1, order: 'id desc' }
      );
      const order = orders[0];
      if (!order) throw new Error(`No confirmed sale order with a "${REWARD_PRODUCT}" line and an invoice was found`);
      orderId = order.id;
      orderName = order.name;
      invoiceId = Math.max(...order.invoice_ids);
      console.log(`  - Order to open (crm-mig finds it by this NAME): ${orderName}   (id ${orderId}, read only)`);
      console.log(`  - Customer : ${Array.isArray(order.partner_id) ? order.partner_id[1] : '-'}`);
      console.log(`  - Invoice  : id ${invoiceId} (newest of ${order.invoice_ids.length})`);
      await owner.close();
      owner = undefined;
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      console.log('  Not run here: crm-mig is the other side of the comparison.');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await quotationPage.openRecordFormById(baseUrl, 'sale.order', orderId ?? 0);
      await quotationPage.dismissErrorDialogWithRetry();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - migrated order opened read-only');
      await invoicePage.openInvoiceById(invoiceId ?? 0);
      await invoicePage.dismissErrorDialogWithRetry();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - migrated invoice opened read-only');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      // ---- order (read only) ----
      await quotationPage.openRecordFormById(baseUrl, 'sale.order', orderId ?? 0);
      await quotationPage.dismissErrorDialogWithRetry();
      const promotion = await quotationPage.getFieldDisplayValue('promotion_id');
      const rows = await quotationPage.getAllOrderLineRows();
      const rewards = rewardRows(rows, REWARD_PRODUCT);
      const total = await quotationPage.getFieldDisplayValue('amount_total');
      const companyTotal = await quotationPage.getFieldDisplayValue('amount_total_company_signed');
      console.log(`  ORDER ${orderName}`);
      console.log(`    - Promotion                 : ${promotion || '(empty)'}`);
      console.log(`    - Total                     : ${total}`);
      console.log(`    - Total in Company Currency : ${companyTotal}`);
      console.log(`    - Order lines (${rows.length}):`);
      for (const r of rows) console.log(`        ${JSON.stringify(r)}`);
      console.log(`    - "${REWARD_PRODUCT}" lines : ${rewards.length}`);
      rewards.forEach((r) => console.log(`        reward line Unit Price ${r['Unit Price'] ?? ''} | Subtotal ${r['Subtotal'] ?? ''}`));

      // ---- invoice (read only) ----
      await invoicePage.openInvoiceById(invoiceId ?? 0);
      await invoicePage.dismissErrorDialogWithRetry();
      const invUntaxed = await invoicePage.getFieldDisplayValue('amount_untaxed');
      const invTotal = await invoicePage.getFieldDisplayValue('amount_total');
      const invLineCount = await invoicePage.getInvoiceLineRowCount();
      console.log(`  INVOICE id ${invoiceId}`);
      console.log(`    - Untaxed Amount : ${invUntaxed}`);
      console.log(`    - Total          : ${invTotal}`);
      console.log(`    - Invoice lines  : ${invLineCount}`);
      for (let i = 0; i < invLineCount; i++) console.log(`        ${JSON.stringify(await invoicePage.getInvoiceLineRowCells(i))}`);
      const listed = await invoicePage.getTotalInCompanyCurrencyForInvoiceId(invoiceId ?? 0);
      console.log(`    - Total in Company Currency (Invoices list, ID filter) : ${listed.value || '(empty)'}`);

      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - order shows exactly one "10.0% discount on products" line', expected: '1', actual: String(rewards.length), passed: rewards.length === 1 },
        { what: 'Step 3 - order Total was read', expected: 'a non-empty amount', actual: total || '(empty)', passed: !!total },
        { what: 'Step 3 - order Total in Company Currency was read', expected: 'a non-empty amount', actual: companyTotal || '(empty)', passed: !!companyTotal },
        { what: 'Step 3 - invoice Total was read', expected: 'a non-empty amount', actual: invTotal || '(empty)', passed: !!invTotal },
        { what: 'Step 3 - invoice Total in Company Currency was read', expected: 'a non-empty amount', actual: listed.value || '(empty)', passed: !!listed.value },
      ], `${TC} - Step 3 values read`, ['.o_form_sheet table.o_list_view']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - values read from the reference system');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log('  Observation (not scored): Promotion, the line amounts, Total and Total in Company Currency are compared on crm-mig, not here.');
      printVerifyAndAssert(checks);
    });
  });
});
