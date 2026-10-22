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
  recordChecks,
  printVerifyAndAssert,
  teardownDiscountRun,
  ProgramOwner,
} from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  Discount_6.2 - Open migrated orders priced by partner grade   (pre-production BASELINE, READ-ONLY)
 * ================================================================================================
 * Test Case ID     : Discount_6.2
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Mirrors          : CRM-12144_6.2 (crm-mig manual TC, master "Migration - Discount") - same steps, run on the
 *                    reference system so the crm-mig port can compare the same values
 * Jira             : CRM-13799
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591
 * Source version   : master row CRM-12144_6.2 as read 2026-10-21 - re-check before trusting this spec
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : reference-system login from the development team (users.admin_crm)
 *
 * READ-ONLY: only existing orders and invoices are read; nothing is saved, confirmed, edited or deleted.
 *
 * Summary
 * -------
 * One migrated order per partner grade in use (Gold, Bronze, Basic) and one with a distributor, each with its
 * invoice. Reseller Discount (%), Distributor Discount (%), Total and Total in Company Currency are read and printed.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_6\.2:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_6.2, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Title: "Open migrated orders priced by partner grade"
 *  Pre-conditions: crm-mig salesperson login (reference system: users.admin_crm); the orders are found through
 *                  a bounded search, never by record id; one order per grade in use + one with a distributor, each
 *                  with its invoice; none is changed.
 *  Steps
 *    1. On crm-mig, open the orders and their invoices
 *    2. Open the same orders and invoices on the reference system
 *    3. Compare Reseller Discount (%), Distributor Discount (%), Partner Discount, Total, Total in Company Currency
 *  Expected
 *    3. Not comparable on the reference system (the crm-mig port compares). Asserted here: each value was read, the
 *       reseller / distributor percentages are read where the order names one. Every value is printed.
 * ================================================================================================
 */

const TC = 'Discount_6.2';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to the reference system (Odoo 12 EE, pre-production) as the reference-system login from the development team (users.admin_crm); the crm-mig salesperson login does not exist here',
  pre2: 'Pre-condition 2: Find one migrated sale order per partner grade in use (Gold, Bronze, Basic) and one with a distributor, each with its invoice, through bounded searches (never by record id); do not change them',
  s1: '[NOT ON THE REFERENCE SYSTEM - crm-mig side of the comparison] Step 1: On crm-mig, open the orders and their invoices',
  s2: 'Step 2: Open the same orders and invoices on the reference system',
  s3: '[REFERENCE SIDE - this run is the reference system] Step 3: Compare Reseller Discount (%), Distributor Discount (%), Partner Discount, Total, Total in Company Currency',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false;
const READER = users.admin_crm;
const GRADES = ['Gold', 'Bronze', 'Basic'] as const;
const ORDER_FIELDS = ['name', 'partner_id', 'reseller_id', 'distributor_id', 'invoice_ids', 'amount_total'];

interface Picked { label: string; id: number; name: string; invoiceId: number }

test.describe(`${TC} - Migrated orders priced by partner grade (pre-prod baseline, read-only)`, () => {
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

  test(`${TC}: Open migrated orders priced by partner grade`, async ({ page }, testInfo) => {
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
        // the partner's grade = res.partner.grade_id ("Level" on the Partner Assignation tab: Basic / Bronze / Silver /
        // Gold / Distributor). NOT projected_level - that field is the forecast for the next review.
        const levelField = 'grade_id';
        console.log(`  - res.partner grade field: ${levelField} (Level)`);
        const targets: Array<{ label: string; domain: unknown[] }> = [
          ...GRADES.map((g) => ({ label: `grade ${g}`, domain: [[`reseller_id.${levelField}.name`, '=', g]] })),
          { label: 'distributor', domain: [['distributor_id', '!=', false]] },
        ];
        for (const t of targets) {
          const orders: Array<{ id: number; name: string; invoice_ids: number[] }> = await owner.call('sale.order', 'search_read', [[
            ['state', 'in', ['sale', 'done']],
            ['invoice_ids', '!=', false],
            ...(t.domain as unknown[][]),
          ]], { fields: ORDER_FIELDS, limit: 1, order: 'id desc' });
          const o = orders[0];
          if (!o) {
            console.log(`  - ${t.label}: NO confirmed order with an invoice found`);
            continue;
          }
          picked.push({ label: t.label, id: o.id, name: o.name, invoiceId: Math.max(...o.invoice_ids) });
          console.log(`  - ${t.label}: order ${o.name} (id ${o.id}, read only) | invoice id ${Math.max(...o.invoice_ids)}`);
        }
      } finally {
        await owner.close();
      }
      await recordChecks(page, testInfo, checks, [
        { what: 'Pre-condition 2 - an order was found for every grade and for the distributor', expected: `${GRADES.length + 1} orders`, actual: `${picked.length} orders`, passed: picked.length === GRADES.length + 1 },
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
        console.log(`  - opened ${p.label}: ${p.name} and invoice ${p.invoiceId}`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - migrated invoices opened read-only');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      for (const p of picked) {
        await quotationPage.openRecordFormById(baseUrl, 'sale.order', p.id);
        await quotationPage.dismissErrorDialogWithRetry();
        const resellerPct = await quotationPage.getFieldDisplayValue('reseller_discount');
        const distributorPct = await quotationPage.getFieldDisplayValue('distributor_discount');
        const reseller = await quotationPage.getFieldDisplayValue('reseller_id');
        const distributor = await quotationPage.getFieldDisplayValue('distributor_id');
        const total = await quotationPage.getFieldDisplayValue('amount_total');
        const companyTotal = await quotationPage.getFieldDisplayValue('amount_total_company_signed');
        console.log(`  ORDER ${p.label} - ${p.name}`);
        console.log(`    - Reseller                  : ${reseller || '(empty)'}`);
        console.log(`    - Reseller Discount (%)     : ${resellerPct || '(empty)'}`);
        console.log(`    - Distributor               : ${distributor || '(empty)'}`);
        console.log(`    - Distributor Discount (%)  : ${distributorPct || '(empty)'}`);
        console.log(`    - Total                     : ${total}`);
        console.log(`    - Total in Company Currency : ${companyTotal}`);
        console.log('    - Observation (not scored): Partner Discount is not read - its field is not in the repo POMs; the crm-mig port compares it.');

        await invoicePage.openInvoiceById(p.invoiceId);
        await invoicePage.dismissErrorDialogWithRetry();
        const invTotal = await invoicePage.getFieldDisplayValue('amount_total');
        const listed = await invoicePage.getTotalInCompanyCurrencyForInvoiceId(p.invoiceId);
        console.log(`    - Invoice Total             : ${invTotal}`);
        console.log(`    - Invoice Total in Company Currency : ${listed.value || '(empty)'}`);

        await recordChecks(page, testInfo, checks, [
          { what: `Step 3 - ${p.label}: Total was read`, expected: 'a non-empty amount', actual: total || '(empty)', passed: !!total },
          { what: `Step 3 - ${p.label}: Total in Company Currency was read`, expected: 'a non-empty amount', actual: companyTotal || '(empty)', passed: !!companyTotal },
          { what: `Step 3 - ${p.label}: invoice Total in Company Currency was read`, expected: 'a non-empty amount', actual: listed.value || '(empty)', passed: !!listed.value },
          ...(reseller ? [{ what: `Step 3 - ${p.label}: Reseller Discount (%) was read`, expected: 'a number', actual: resellerPct || '(empty)', passed: !Number.isNaN(money(resellerPct)) }] : []),
          ...(distributor ? [{ what: `Step 3 - ${p.label}: Distributor Discount (%) was read`, expected: 'a number', actual: distributorPct || '(empty)', passed: !Number.isNaN(money(distributorPct)) }] : []),
        ], `${TC} - Step 3 ${p.label}`, ['.oe_subtotal_footer']);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - values read from the reference system');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
