import { test } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { QuotationPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  DiscountRun,
  Check,
  money,
  newDiscountRun,
  signIn,
  recordChecks,
  printVerifyAndAssert,
  teardownDiscountRun,
  ProgramOwner,
} from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  Discount_6.4 - Open a migrated order with a manual line discount   (pre-production BASELINE, READ-ONLY)
 * ================================================================================================
 * Test Case ID     : Discount_6.4
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Mirrors          : CRM-12144_6.4 (crm-mig manual TC, master "Migration - Discount") - same steps, run on the
 *                    reference system so the crm-mig port can compare the same values
 * Jira             : CRM-13802
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591
 * Source version   : master row CRM-12144_6.4 as read 2026-10-21 - re-check before trusting this spec
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : reference-system login from the development team (users.admin_crm)
 *
 * READ-ONLY: only an existing order and its invoice are read; nothing is saved, confirmed, edited or deleted.
 *
 * Summary
 * -------
 * A migrated order with a line Discount (%) above 0 and its invoice are opened and read; the line Discount (%),
 * line Subtotal, Total and Total in Company Currency are printed for the crm-mig comparison.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_6\.4:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_6.4, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Title: "Open a migrated order with a manual line discount"
 *  Pre-conditions: crm-mig salesperson login (reference system: users.admin_crm); a migrated sale order with a line
 *                  Discount (%) > 0 and its invoice, found through a bounded search (never by record id); not changed.
 *  Steps
 *    1. On crm-mig, open the order and its invoice
 *    2. Open the same order and invoice on the reference system
 *    3. Compare Discount (%) on the line, the line Subtotal, Total and Total in Company Currency
 *  Expected
 *    3. Not comparable on the reference system (the crm-mig port compares). Asserted here: the order has a line with
 *       Discount (%) above 0 and a Subtotal, and each total was read. Every value is printed.
 * ================================================================================================
 */

const TC = 'Discount_6.4';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to the reference system (Odoo 12 EE, pre-production) as the reference-system login from the development team (users.admin_crm); the crm-mig salesperson login does not exist here',
  pre2: 'Pre-condition 2: Find a migrated sale order with a line Discount (%) above 0 and its invoice, through a bounded search (never by record id); do not change it',
  s1: '[NOT ON THE REFERENCE SYSTEM - crm-mig side of the comparison] Step 1: On crm-mig, open the order and its invoice',
  s2: 'Step 2: Open the same order and invoice on the reference system',
  s3: '[REFERENCE SIDE - this run is the reference system] Step 3: Compare Discount (%) on the line, the line Subtotal, Total and Total in Company Currency',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false;
const READER = users.admin_crm;

test.describe(`${TC} - Migrated order with a manual line discount (pre-prod baseline, read-only)`, () => {
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

  test(`${TC}: Open a migrated order with a manual line discount`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const quotationPage = new QuotationPage(page);
    const invoicePage = new InvoicePage(page);
    const checks: Check[] = [];
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
      const owner = await ProgramOwner.open();
      try {
        const orders: Array<{ id: number; name: string; invoice_ids: number[] }> = await owner.call('sale.order', 'search_read', [[
          ['state', 'in', ['sale', 'done']],
          ['invoice_ids', '!=', false],
          ['order_line.discount', '>', 0],
        ]], { fields: ['name', 'invoice_ids'], limit: 1, order: 'id desc' });
        const o = orders[0];
        if (!o) throw new Error('No confirmed sale order with a line Discount (%) above 0 and an invoice was found');
        orderId = o.id;
        orderName = o.name;
        invoiceId = Math.max(...o.invoice_ids);
        console.log(`  - Order to open (crm-mig finds it by this NAME): ${orderName}   (id ${orderId}, read only)`);
        console.log(`  - Invoice: id ${invoiceId}`);
      } finally {
        await owner.close();
      }
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
      await quotationPage.openRecordFormById(baseUrl, 'sale.order', orderId ?? 0);
      await quotationPage.dismissErrorDialogWithRetry();
      const rows = await quotationPage.getAllOrderLineRows();
      // the line's Discount (%) is sale.order.line.discount; the sale order form relabels it "Special Discount(%)"
      // (view nakivo_sale.sale_view_inherit_custom, read 2026-10-21) while the Deal Element shows "Discount (%)"
      const discKey = Object.keys(rows[0] ?? {}).find((k) => /^(Special )?Discount ?\(%\)$/.test(k)) ?? 'Discount (%)';
      console.log(`  - order line columns: ${JSON.stringify(Object.keys(rows[0] ?? {}))} -> line discount column = "${discKey}"`);
      const discounted = rows.filter((r) => money(r[discKey] ?? '') > 0);
      const total = await quotationPage.getFieldDisplayValue('amount_total');
      const companyTotal = await quotationPage.getFieldDisplayValue('amount_total_company_signed');
      console.log(`  ORDER ${orderName}`);
      for (const r of rows) console.log(`    - line ${r['Product'] ?? '?'} | ${discKey} ${r[discKey] ?? '(empty)'} | Subtotal ${r['Subtotal'] ?? '(empty)'}`);
      console.log(`    - Total                     : ${total}`);
      console.log(`    - Total in Company Currency : ${companyTotal}`);

      await invoicePage.openInvoiceById(invoiceId ?? 0);
      await invoicePage.dismissErrorDialogWithRetry();
      const invTotal = await invoicePage.getFieldDisplayValue('amount_total');
      const listed = await invoicePage.getTotalInCompanyCurrencyForInvoiceId(invoiceId ?? 0);
      console.log(`  INVOICE id ${invoiceId}`);
      console.log(`    - Total                     : ${invTotal}`);
      console.log(`    - Total in Company Currency : ${listed.value || '(empty)'}`);

      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - the order has a line with Discount (%) above 0', expected: '>= 1 line', actual: `${discounted.length} line(s)`, passed: discounted.length >= 1 },
        { what: 'Step 3 - that line shows a Subtotal', expected: 'a non-empty amount', actual: discounted[0]?.['Subtotal'] || '(empty)', passed: !!discounted[0]?.['Subtotal'] },
        { what: 'Step 3 - order Total was read', expected: 'a non-empty amount', actual: total || '(empty)', passed: !!total },
        { what: 'Step 3 - order Total in Company Currency was read', expected: 'a non-empty amount', actual: companyTotal || '(empty)', passed: !!companyTotal },
        { what: 'Step 3 - invoice Total in Company Currency was read', expected: 'a non-empty amount', actual: listed.value || '(empty)', passed: !!listed.value },
      ], `${TC} - Step 3 manual line discount`, ['.o_form_sheet table.o_list_view', '.oe_subtotal_footer']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - values read from the reference system');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log('  Observation (not scored): the line Discount (%), Subtotal and Total are compared on crm-mig, not here.');
      printVerifyAndAssert(checks);
    });
  });
});
