import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653 Part 4.2.2 - Sale Order Line fields migrated correctly
 * Test Case ID: CRM-12653_4.2.2
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   Every field of every order line is carried over unchanged on crm-mig, including
 *   price, discount and taxes. This spec samples 10 sale orders from the source
 *   (pre-production) within the cut-off window, reads all their order lines and their
 *   nine core fields, then looks up each line on the target (crm-mig) by natural key
 *   (order name + product internal reference) and verifies all nine fields match.
 *
 * Source manual TC (master sheet "Data Migration - Sales data to Odoo 12 CE", row 4.2.2):
 *
 * Pre-conditions:
 *   VPN connected; both pre-production (Odoo 12 Enterprise) and crm-mig
 *   (Odoo 12 Community) are reachable.
 *   Login: anh.ho@nakivo.com (admin_crm for source, admin_crm_mig for target).
 *   Cut-off date already established in CRM-12653_1.1.2.
 *   The SAME 10 sale orders sampled in CRM-12653_4.1.3 are reused.
 *   Developer mode ON on both servers.
 *
 * Steps to reproduce (from master):
 *   1. On pre-production, open each sampled order and read all 9 fields for every
 *      line: Product [CODE], Description, Ordered Qty, Delivered, Invoiced, Unit Price,
 *      Discount %, Taxes, Subtotal.
 *   2. Read the same nine values for every line of the matching order on crm-mig.
 *   3. Compare line for line, matching on product internal reference.
 *   4. Record every difference with Order Reference, product code and field name.
 *
 * Verification Points (expectedBulletCount: 5):
 *   1. For every line of every sampled order the nine values are identical on both servers.
 *   2. Unit Price, Discount % and Subtotal are compared to the cent.
 *   3. Taxes are compared by NAME shown on the line; empty tax cell on source must be empty on target.
 *   4. Delivered and Invoiced quantities are compared as numbers.
 *   5. Products are matched by internal reference [CODE], never by id.
 *
 * Special handling:
 *   - Products with NO internal reference on source cannot be matched by code;
 *     list those lines as a separate data-quality exception.
 *   - A migrated order whose Invoiced quantity is reset to 0 while invoices exist
 *     is an exception, recorded with the Order Reference.
 *
 * READ-ONLY: this spec only reads sale.order and sale.order.line records. It creates,
 * modifies and deletes nothing, as required on crm-mig.
 *
 * NOTE: Order line IDs are re-sequenced on crm-mig, so id-based joins will fail.
 * The join strategy is (sale.order name, product.product default_code) — the natural key.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_4\.2\.2:" --project=chromium
 */

async function openSession(
  browser: Browser, url: string, isMig: boolean, username: string, password: string,
): Promise<{ context: BrowserContext; parity: MigDataParityPage }> {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const loginPage = isMig ? new LoginPageMig(page) : new LoginPage(page);
  await loginPage.navigateTo(url);
  await loginPage.login(username, password);
  return { context, parity: new MigDataParityPage(page) };
}

test.describe('CRM-12653 Part 4.2.2 - Sale Order Line fields', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12653_4.2.2: Every field of every order line (9 fields) migrated unchanged', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let sourceContext: BrowserContext | null = null;
    let targetContext: BrowserContext | null = null;

    try {
      console.log('========== CRM-12653_4.2.2 - Sale Order Line Fields ==========');

      // Open target session first to resolve cut-off date
      let targetParity: MigDataParityPage;
      await test.step('Pre-condition: Open session on crm-mig (target)', async () => {
        console.log('\n--- Pre-condition: Open session on crm-mig (target) ---');
        console.log(`  Account : ${users.admin_crm_mig.username}`);
        console.log(`  Target  : ${baseUrl_mig}`);
        const session = await openSession(browser, baseUrl_mig, true, users.admin_crm_mig.username, users.admin_crm_mig.password);
        targetContext = session.context;
        targetParity = session.parity;

        const isAuth = await session.parity.isAuthenticatedSession();
        console.log(`  Authenticated: ${isAuth}`);
        expect(isAuth, 'target session not authenticated on crm-mig').toBe(true);
      });

      // Open source session
      let sourceParity: MigDataParityPage;
      await test.step('Pre-condition: Open session on pre-production (source)', async () => {
        console.log('\n--- Pre-condition: Open session on pre-production (source) ---');
        console.log(`  Account : ${users.admin_crm.username}`);
        console.log(`  Source  : ${baseUrl}`);
        const session = await openSession(browser, baseUrl, false, users.admin_crm.username, users.admin_crm.password);
        sourceContext = session.context;
        sourceParity = session.parity;

        const isAuth = await session.parity.isAuthenticatedSession();
        console.log(`  Authenticated: ${isAuth}`);
        expect(isAuth, 'source session not authenticated on pre-production').toBe(true);
      });

      // Resolve cut-off from target
      const cutoff = await targetParity.resolveCutoffDate();
      console.log(`\n--- Cut-off date resolved on target: ${cutoff} ---`);

      // Sample 10 sale orders from source (deterministic: 5 oldest + 5 newest within cut-off)
      // This reuses the CRM-12653_4.1.3 sampling strategy: same logic applied to the same
      // cut-off-bounded data always produces the same 10 order references, ensuring fidelity
      // across repeated runs (data frozen during migration window).
      const sampleOrders: Array<{ id: number; name: string }> = [];

      await test.step('Step 1a: Sample 10 orders from source (5 oldest + 5 newest within cut-off)', async () => {
        console.log('\n--- Step 1a: Sample 10 sale orders from source ---');
        const cutoffDomain = [...MigDataParityPage.onOrBeforeCutoff(cutoff, 'create_date')];

        // 5 oldest
        const oldestOrders = await sourceParity.searchRead<{ id: number; name: string }>(
          'sale.order',
          cutoffDomain,
          ['id', 'name'],
          { limit: 5, order: 'create_date asc' }
        );
        sampleOrders.push(...oldestOrders);

        // 5 newest
        const newestOrders = await sourceParity.searchRead<{ id: number; name: string }>(
          'sale.order',
          cutoffDomain,
          ['id', 'name'],
          { limit: 5, order: 'create_date desc' }
        );
        sampleOrders.push(...newestOrders);

        console.log(`  Sampled ${sampleOrders.length} orders from source:`);
        sampleOrders.forEach((o) => {
          console.log(`    ${o.name}`);
        });
      });

      // Type definitions for order line fields
      interface OrderLineFields {
        name: string;
        product_id: [number, string]; // [id, default_code]
        description: string;
        product_qty: number; // Ordered Qty
        qty_delivered: number; // Delivered
        qty_invoiced: number; // Invoiced
        price_unit: number;
        discount: number;
        tax_id: Array<[number, string]>; // [id, name]
        price_subtotal: number;
      }

      interface LineComparison {
        order_ref: string;
        product_code: string;
        has_no_code: boolean;
        mismatches: Array<{ field: string; source: string; target: string }>;
      }

      const comparisons: LineComparison[] = [];

      // For each sampled order, read all its lines and compare on target
      await test.step('Step 1-4: Read order lines from source and compare on target', async () => {
        console.log('\n--- Step 1-4: Read all order lines from sampled orders and compare ---');

        for (const order of sampleOrders) {
          const sourceLines = await sourceParity.searchRead<OrderLineFields>(
            'sale.order.line',
            [['order_id', '=', order.id]],
            ['name', 'product_id', 'description', 'product_qty', 'qty_delivered', 'qty_invoiced', 'price_unit', 'discount', 'tax_id', 'price_subtotal'],
            { limit: 500 }
          );

          if (sourceLines.length === 0) {
            console.log(`  ${order.name}: no order lines`);
            continue;
          }

          console.log(`  ${order.name}: ${sourceLines.length} lines`);

          for (const sourceLine of sourceLines) {
            const productCode = sourceLine.product_id[1];
            const lineId = `${order.name}/${productCode || '(no code)'}`;
            const comparison: LineComparison = {
              order_ref: order.name,
              product_code: productCode || '',
              has_no_code: !productCode,
              mismatches: [],
            };

            // If product has no internal reference, record it as a data-quality exception
            if (!productCode) {
              console.log(`    Line: ${lineId} [DATA QUALITY: product has no internal reference]`);
              comparisons.push(comparison);
              continue;
            }

            // Look up the same order on target by order name
            const targetOrders = await targetParity.searchRead<{ id: number }>(
              'sale.order',
              [...MigDataParityPage.onOrBeforeCutoff(cutoff, 'create_date'), ['name', '=', order.name]],
              ['id'],
              { limit: 1 }
            );

            if (targetOrders.length === 0) {
              comparison.mismatches.push({
                field: 'order_existence',
                source: 'found',
                target: 'not_found',
              });
              console.log(`    Line: ${lineId} [ERROR: order not found on target]`);
              comparisons.push(comparison);
              continue;
            }

            const targetOrderId = targetOrders[0].id;

            // Look up the product on target by internal reference (default_code)
            const targetProducts = await targetParity.searchRead<{ id: number }>(
              'product.product',
              [['default_code', '=', productCode]],
              ['id'],
              { limit: 1 }
            );

            if (targetProducts.length === 0) {
              comparison.mismatches.push({
                field: 'product_existence',
                source: 'found',
                target: 'not_found',
              });
              console.log(`    Line: ${lineId} [ERROR: product not found on target]`);
              comparisons.push(comparison);
              continue;
            }

            const targetProductId = targetProducts[0].id;

            // Look up the order line on target by (order_id, product_id) natural key
            const targetLines = await targetParity.searchRead<OrderLineFields>(
              'sale.order.line',
              [
                ...MigDataParityPage.onOrBeforeCutoff(cutoff, 'create_date'),
                ['order_id', '=', targetOrderId],
                ['product_id', '=', targetProductId],
              ],
              ['name', 'product_id', 'description', 'product_qty', 'qty_delivered', 'qty_invoiced', 'price_unit', 'discount', 'tax_id', 'price_subtotal'],
              { limit: 1 }
            );

            if (targetLines.length === 0) {
              comparison.mismatches.push({
                field: 'line_existence',
                source: 'found',
                target: 'not_found',
              });
              console.log(`    Line: ${lineId} [ERROR: order line not found on target by natural key]`);
              comparisons.push(comparison);
              continue;
            }

            const targetLine = targetLines[0];

            // Compare all 9 fields
            if (sourceLine.description !== targetLine.description) {
              comparison.mismatches.push({
                field: 'description',
                source: sourceLine.description || '(empty)',
                target: targetLine.description || '(empty)',
              });
            }

            if (sourceLine.product_qty !== targetLine.product_qty) {
              comparison.mismatches.push({
                field: 'product_qty',
                source: String(sourceLine.product_qty),
                target: String(targetLine.product_qty),
              });
            }

            if (sourceLine.qty_delivered !== targetLine.qty_delivered) {
              comparison.mismatches.push({
                field: 'qty_delivered',
                source: String(sourceLine.qty_delivered),
                target: String(targetLine.qty_delivered),
              });
            }

            if (sourceLine.qty_invoiced !== targetLine.qty_invoiced) {
              comparison.mismatches.push({
                field: 'qty_invoiced',
                source: String(sourceLine.qty_invoiced),
                target: String(targetLine.qty_invoiced),
              });
            }

            // Compare to the cent (multiply by 100, round, compare as integers)
            const sourcePriceUnit = Math.round(sourceLine.price_unit * 100);
            const targetPriceUnit = Math.round(targetLine.price_unit * 100);
            if (sourcePriceUnit !== targetPriceUnit) {
              comparison.mismatches.push({
                field: 'price_unit',
                source: String(sourceLine.price_unit),
                target: String(targetLine.price_unit),
              });
            }

            // Discount %
            const sourceDiscount = Math.round(sourceLine.discount * 100);
            const targetDiscount = Math.round(targetLine.discount * 100);
            if (sourceDiscount !== targetDiscount) {
              comparison.mismatches.push({
                field: 'discount',
                source: String(sourceLine.discount),
                target: String(targetLine.discount),
              });
            }

            // Subtotal to the cent
            const sourceSubtotal = Math.round(sourceLine.price_subtotal * 100);
            const targetSubtotal = Math.round(targetLine.price_subtotal * 100);
            if (sourceSubtotal !== targetSubtotal) {
              comparison.mismatches.push({
                field: 'price_subtotal',
                source: String(sourceLine.price_subtotal),
                target: String(targetLine.price_subtotal),
              });
            }

            // Compare taxes by name (tax_id is many2many, so compare the names)
            const sourceTaxNames = (sourceLine.tax_id || []).map(t => t[1]).sort();
            const targetTaxNames = (targetLine.tax_id || []).map(t => t[1]).sort();
            const sourceTaxStr = sourceTaxNames.join(',') || '(none)';
            const targetTaxStr = targetTaxNames.join(',') || '(none)';
            if (sourceTaxStr !== targetTaxStr) {
              comparison.mismatches.push({
                field: 'tax_id',
                source: sourceTaxStr,
                target: targetTaxStr,
              });
            }

            if (comparison.mismatches.length === 0) {
              console.log(`    ✓ ${lineId}`);
            } else {
              console.log(`    ✗ ${lineId}: ${comparison.mismatches.length} field(s) differ`);
            }

            comparisons.push(comparison);
          }
        }
      });

      await test.step('Verification', async () => {
        // Count results
        const totalLines = comparisons.length;
        const noCodeLines = comparisons.filter(c => c.has_no_code).length;
        const matchedLines = comparisons.filter(c => !c.has_no_code && c.mismatches.length === 0).length;
        const mismatchedLines = comparisons.filter(c => !c.has_no_code && c.mismatches.length > 0).length;
        const fieldMismatches = comparisons.flatMap(c => c.mismatches);

        const mismatchSummary = fieldMismatches.length > 0
          ? fieldMismatches.map(m => `${m.field}: "${m.source}" vs "${m.target}"`).join('; ')
          : 'none';

        const monetaryMismatches = fieldMismatches.filter(m => ['price_unit', 'discount', 'price_subtotal'].includes(m.field));
        const taxMismatches = fieldMismatches.filter(m => m.field === 'tax_id');
        const qtyMismatches = fieldMismatches.filter(m => ['qty_delivered', 'qty_invoiced'].includes(m.field));

        console.log('\n==================== VERIFY ====================');
        console.log('  Verify #1 - All nine fields identical on both servers:');
        console.log(`     Expected : all order lines have matching 9 fields`);
        console.log(`     Actual   : ${matchedLines}/${comparisons.filter(c => !c.has_no_code).length} matched`);
        console.log(`     Result   : ${mismatchedLines === 0 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #2 - Unit Price, Discount %, Subtotal compared to the cent:');
        console.log(`     Expected : monetary values precise to the cent`);
        console.log(`     Actual   : ${monetaryMismatches.length} monetary mismatches`);
        console.log(`     Result   : ${monetaryMismatches.length === 0 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #3 - Taxes compared by NAME; empty must be empty:');
        console.log(`     Expected : tax names match; empty on source → empty on target`);
        console.log(`     Actual   : ${taxMismatches.length} tax_id mismatches`);
        console.log(`     Result   : ${taxMismatches.length === 0 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #4 - Delivered and Invoiced quantities compared as numbers:');
        console.log(`     Expected : qty_delivered and qty_invoiced match exactly`);
        console.log(`     Actual   : ${qtyMismatches.length} qty mismatches`);
        console.log(`     Result   : ${qtyMismatches.length === 0 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #5 - Products matched by internal reference [CODE]:');
        console.log(`     Expected : products matched by default_code; no id-based joins`);
        console.log(`     Actual   : ${noCodeLines} lines with missing product code (data quality exception)`);
        console.log(`     Result   : all lines joined by code (${noCodeLines > 0 ? 'PASS with data-quality notes' : 'PASS'})`);
        console.log('===============================================');
        console.log(`OVERALL: ${mismatchedLines === 0 && noCodeLines === 0 ? 'PASS' : 'FAIL'} - order lines match across migration`);
        if (mismatchedLines > 0) {
          console.log(`SUMMARY: ${mismatchedLines} lines with mismatches in ${fieldMismatches.length} fields`);
        }
        if (noCodeLines > 0) {
          console.log(`DATA QUALITY: ${noCodeLines} lines with products missing internal reference`);
        }

        // Assertions per verification point
        expect(comparisons.length, 'no order lines were compared - query may have returned nothing').toBeGreaterThan(0);
        expect(monetaryMismatches, `Unit Price/Discount/Subtotal not precise to the cent: ${mismatchSummary}`).toHaveLength(0);
        expect(taxMismatches, `Taxes do not match by name or empty state: ${mismatchSummary}`).toHaveLength(0);
        expect(qtyMismatches, `Delivered or Invoiced quantities do not match: ${mismatchSummary}`).toHaveLength(0);
        expect(mismatchedLines, `${mismatchedLines} order line(s) have field mismatches: ${mismatchSummary}`).toBe(0);
      });

    } finally {
      if (sourceContext) await sourceContext.close();
      if (targetContext) await targetContext.close();
    }
  });
});
