import { test } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { QuotationPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_BASELINE,
  DiscountRun,
  Check,
  newDiscountRun,
  signIn,
  recordChecks,
  printVerifyAndAssert,
  teardownDiscountRun,
  ProgramOwner,
} from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  Discount_6.3 - Open migrated orders priced through each pricelist   (pre-production BASELINE, READ-ONLY)
 * ================================================================================================
 * Test Case ID     : Discount_6.3
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Mirrors          : CRM-12144_6.3 (crm-mig manual TC, master "Migration - Discount") - same steps, run on the
 *                    reference system so the crm-mig port can compare the same values
 * Jira             : CRM-13801
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591
 * Source version   : master row CRM-12144_6.3 as read 2026-10-21 - re-check before trusting this spec
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : reference-system login from the development team (users.admin_crm)
 *
 * READ-ONLY: only existing orders and invoices are read; nothing is saved, confirmed, edited or deleted.
 *
 * Summary
 * -------
 * One migrated order per pricelist currency (USD, EUR, GBP, CHF), each with its invoice. Pricelist, every
 * Unit Price, Total and Total in Company Currency are read and printed.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_6\.3:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_6.3, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Title: "Open migrated orders priced through each pricelist"
 *  Pre-conditions: crm-mig salesperson login (reference system: users.admin_crm); one order per pricelist currency
 *                  USD, EUR, GBP, CHF with its invoice, found through a bounded search (never by record id); none changed.
 *  Steps
 *    1. On crm-mig, open the orders and their invoices
 *    2. Open the same orders and invoices on the reference system
 *    3. Compare Pricelist, every Unit Price, Total, Total in Company Currency
 *  Expected
 *    3. Not comparable on the reference system (the crm-mig port compares). Asserted here: each value was read
 *       (non-empty) and every order line shows a Unit Price. Every value is printed.
 * ================================================================================================
 */

const TC = 'Discount_6.3';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to the reference system (Odoo 12 EE, pre-production) as the reference-system login from the development team (users.admin_crm); the crm-mig salesperson login does not exist here',
  pre2: 'Pre-condition 2: Find one migrated sale order per pricelist currency (USD, EUR, GBP, CHF) with its invoice, through bounded searches (never by record id); do not change them',
  s1: '[NOT ON THE REFERENCE SYSTEM - crm-mig side of the comparison] Step 1: On crm-mig, open the orders and their invoices',
  s2: 'Step 2: Open the same orders and invoices on the reference system',
  s3: '[REFERENCE SIDE - this run is the reference system] Step 3: Compare Pricelist, every Unit Price, Total, Total in Company Currency',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false;
const READER = users.admin_crm;
const PRICELISTS: Array<{ currency: string; pricelist: string }> = [
  { currency: 'USD', pricelist: DISCOUNT_BASELINE.pricelistUsd },
  { currency: 'EUR', pricelist: DISCOUNT_BASELINE.pricelistEur },
  { currency: 'GBP', pricelist: DISCOUNT_BASELINE.pricelistGbp },
  { currency: 'CHF', pricelist: DISCOUNT_BASELINE.pricelistChf },
];

interface Picked { currency: string; pricelist: string; id: number; name: string; invoiceId: number }

test.describe(`${TC} - Migrated orders priced through each pricelist (pre-prod baseline, read-only)`, () => {
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

  test(`${TC}: Open migrated orders priced through each pricelist`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const quotationPage = new QuotationPage(page);
    const invoicePage = new InvoicePage(page);
    const checks: Check[] = [];
    const picked: Picked[] = [];

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
        for (const pl of PRICELISTS) {
          const orders: Array<{ id: number; name: string; invoice_ids: number[] }> = await owner.call('sale.order', 'search_read', [[
            ['state', 'in', ['sale', 'done']],
            ['invoice_ids', '!=', false],
            ['pricelist_id.name', '=', pl.pricelist],
          ]], { fields: ['name', 'invoice_ids'], limit: 1, order: 'id desc' });
          const o = orders[0];
          if (!o) {
            console.log(`  - ${pl.currency} (${pl.pricelist}): NO confirmed order with an invoice found`);
            continue;
          }
          picked.push({ currency: pl.currency, pricelist: pl.pricelist, id: o.id, name: o.name, invoiceId: Math.max(...o.invoice_ids) });
          console.log(`  - ${pl.currency} (${pl.pricelist}): order ${o.name} (id ${o.id}, read only) | invoice id ${Math.max(...o.invoice_ids)}`);
        }
      } finally {
        await owner.close();
      }
      await recordChecks(page, testInfo, checks, [
        { what: 'Pre-condition 2 - an order with an invoice was found for every pricelist', expected: `${PRICELISTS.length} orders`, actual: `${picked.length} orders`, passed: picked.length === PRICELISTS.length },
      ], `${TC} - Pre-condition 2 orders found`, []);
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      console.log('  Not run here: crm-mig is the other side of the comparison.');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      for (const p of picked) {
        await quotationPage.openRecordFormById(baseUrl, 'sale.order', p.id);
        await quotationPage.dismissErrorDialogWithRetry();
        await invoicePage.openInvoiceById(p.invoiceId);
        await invoicePage.dismissErrorDialogWithRetry();
        console.log(`  - opened ${p.currency}: ${p.name} and invoice ${p.invoiceId}`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - migrated invoices opened read-only');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      for (const p of picked) {
        await quotationPage.openRecordFormById(baseUrl, 'sale.order', p.id);
        await quotationPage.dismissErrorDialogWithRetry();
        const pricelist = await quotationPage.getFieldDisplayValue('pricelist_id');
        const rows = await quotationPage.getAllOrderLineRows();
        const total = await quotationPage.getFieldDisplayValue('amount_total');
        const companyTotal = await quotationPage.getFieldDisplayValue('amount_total_company_signed');
        console.log(`  ORDER ${p.currency} - ${p.name}`);
        console.log(`    - Pricelist                 : ${pricelist || '(empty)'}`);
        for (const r of rows) console.log(`    - line ${r['Product'] ?? '?'} | Unit Price ${r['Unit Price'] ?? '(empty)'}`);
        console.log(`    - Total                     : ${total}`);
        console.log(`    - Total in Company Currency : ${companyTotal}`);

        await invoicePage.openInvoiceById(p.invoiceId);
        await invoicePage.dismissErrorDialogWithRetry();
        const invTotal = await invoicePage.getFieldDisplayValue('amount_total');
        const listed = await invoicePage.getTotalInCompanyCurrencyForInvoiceId(p.invoiceId);
        console.log(`    - Invoice Total             : ${invTotal}`);
        console.log(`    - Invoice Total in Company Currency : ${listed.value || '(empty)'}`);

        await recordChecks(page, testInfo, checks, [
          { what: `Step 3 - ${p.currency}: Pricelist was read`, expected: 'a non-empty value', actual: pricelist || '(empty)', passed: !!pricelist },
          { what: `Step 3 - ${p.currency}: every order line shows a Unit Price`, expected: `${rows.length} lines with a Unit Price`, actual: `${rows.filter((r) => !!r['Unit Price']).length} of ${rows.length}`, passed: rows.length > 0 && rows.every((r) => !!r['Unit Price']) },
          { what: `Step 3 - ${p.currency}: Total was read`, expected: 'a non-empty amount', actual: total || '(empty)', passed: !!total },
          { what: `Step 3 - ${p.currency}: Total in Company Currency was read`, expected: 'a non-empty amount', actual: companyTotal || '(empty)', passed: !!companyTotal },
          { what: `Step 3 - ${p.currency}: invoice Total in Company Currency was read`, expected: 'a non-empty amount', actual: listed.value || '(empty)', passed: !!listed.value },
        ], `${TC} - Step 3 ${p.currency}`, ['.oe_subtotal_footer']);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - values read from the reference system');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
