import { test, expect, Browser, BrowserContext } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';

/**
 * CRM-12653 Section 4 - Sales Orders Data Migration
 * Test Case ID: CRM-12653_4.1.3
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   Every line of a migrated order is present on the target - no line is dropped and none is duplicated.
 *   This test builds a deterministic sample of 5 Deal Elements (DE#####) and 5 Quotations/Sale Orders (SO#####),
 *   each with >= 2 order lines. For each sampled order, it reads the line count, product codes [CODE], and
 *   Ordered Qty from both servers and verifies they match line for line, in the same order.
 *
 * Source manual TC (master sheet CRM-12653, row 4.1.3):
 *   Pre-conditions: SOURCE = pre-production (Odoo 12 Enterprise), TARGET = crm-mig (Odoo 12 Community)
 *   Both logged in; <CUTOFF> established in CRM-12653_1.1.2. Sample reused by CRM-12653_4.2.1, 4.2.2, 4.3.1, 5.3.2.
 *   Steps: (1) Read line count, product codes and qty from 10 sampled orders on SOURCE.
 *          (2) Search each Order Reference on TARGET.
 *          (3) Read the same fields from TARGET.
 *          (4) Compare per order.
 *   Expected: All 10 references found. Line count, codes and qty match line for line.
 *
 * READ-ONLY: No creation, modification or deletion on either server. All reads via MigDataParityPage.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_4\.1\.3:" --project=chromium
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

test.describe('CRM-12653_4.1.3 - Order line count per sampled order', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('\nFAILURE REASON: ' + (testInfo.error?.message?.split('\n')[0] ?? 'unknown'));
    }
  });

  test('CRM-12653_4.1.3: Order line count, product codes and quantities match on sampled orders', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    const targetSession = await openSession(browser, baseUrl_mig, true, users.admin_crm_mig.username, users.admin_crm_mig.password);
    const sourceSession = await openSession(browser, baseUrl, false, users.admin_crm.username, users.admin_crm.password);

    const { context: targetContext, parity: targetParity } = targetSession;
    const { context: sourceContext, parity: sourceParity } = sourceSession;

    const cutoff = await targetParity.resolveCutoffDate();
    console.log(`\n========== CRM-12653_4.1.3 - Order line count and product codes ==========`);
    console.log(`Cut-off date: ${cutoff}`);

    const results = {
      sampledReferences: [] as string[],
      foundOnTarget: 0,
      lineCountMatches: 0,
      productCodesMatches: 0,
      orderedQtyMatches: 0,
      droppedOrDuplicateLines: [] as Array<{ ref: string; issue: string }>,
    };

    const cutoffFilter = MigDataParityPage.onOrBeforeCutoff(cutoff, 'order_date');

    try {
      await test.step('Step 1-2: Build deterministic sample from SOURCE (5 DEs + 5 SOs, each with >= 2 lines)', async () => {
        console.log('\n--- Step 1-2: Build sample of 10 orders (5 DEs + 5 SOs, each with >= 2 lines) from SOURCE ---');

        // Check SOURCE session is authenticated
        const sourceAuth = await sourceParity.isAuthenticatedSession();
        expect(sourceAuth, 'SOURCE session must be authenticated').toBe(true);

        const dealElements = await sourceParity.searchRead<{ name: string; order_line: Array<number> }>(
          'sale.order',
          [
            ...cutoffFilter,
            ['name', 'like', 'DE'],
          ],
          ['name', 'order_line'],
          { limit: 500 },
        );

        const soOrders = await sourceParity.searchRead<{ name: string; order_line: Array<number> }>(
          'sale.order',
          [
            ...cutoffFilter,
            ['name', 'like', 'SO'],
          ],
          ['name', 'order_line'],
          { limit: 500 },
        );

        // Filter to only orders with at least 2 lines, then pick first 5 of each
        const delsWithLines = dealElements.filter(o => (o.order_line?.length ?? 0) >= 2);
        const sosWithLines = soOrders.filter(o => (o.order_line?.length ?? 0) >= 2);

        expect(delsWithLines.length, 'SOURCE must have at least 5 Deal Elements with >= 2 lines').toBeGreaterThanOrEqual(5);
        expect(sosWithLines.length, 'SOURCE must have at least 5 Sale Orders with >= 2 lines').toBeGreaterThanOrEqual(5);

        const selectedDEs = delsWithLines.slice(0, 5).map(o => o.name);
        const selectedSOs = sosWithLines.slice(0, 5).map(o => o.name);
        results.sampledReferences = [...selectedDEs, ...selectedSOs];

        console.log(`  Deal Elements selected (first 5 with >= 2 lines): ${selectedDEs.join(', ')}`);
        console.log(`  Sale Orders selected (first 5 with >= 2 lines): ${selectedSOs.join(', ')}`);
      });

      const sourceLineData: Map<string, { count: number; codes: string[]; qtys: number[] }> = new Map();

      await test.step('Step 1: Read line count, product codes and quantities from SOURCE', async () => {
        console.log('\n--- Step 1: Read order lines from SOURCE ---');

        for (const ref of results.sampledReferences) {
          const orders = await sourceParity.searchRead<{
            id: number;
            name: string;
            order_line: Array<number>;
          }>(
            'sale.order',
            [['name', '=', ref], ...cutoffFilter],
            ['name', 'order_line'],
            { limit: 500 },
          );

          if (!orders.length) {
            console.log(`  ${ref}: order not found on SOURCE`);
            continue;
          }

          const order = orders[0];
          const lineIds = order.order_line as number[];

          const lines = await sourceParity.readIds<{
            id: number;
            product_id: [number, string];
            product_uom_qty: number;
          }>(
            'sale.order.line',
            lineIds,
            ['product_id', 'product_uom_qty'],
          );

          const codes = lines.map(line => {
            const prodName = line.product_id[1] || '';
            const match = prodName.match(/\[([^\]]+)\]/);
            return match ? match[1] : prodName;
          });

          const qtys = lines.map(line => line.product_uom_qty);

          sourceLineData.set(ref, {
            count: lineIds.length,
            codes,
            qtys,
          });

          console.log(`  ${ref}: ${lineIds.length} lines - codes=[${codes.join(', ')}] qtys=[${qtys.join(', ')}]`);
        }
      });

      const targetLineData: Map<string, { count: number; codes: string[]; qtys: number[] }> = new Map();

      await test.step('Step 2-3: Search and read order lines from TARGET', async () => {
        console.log('\n--- Step 2-3: Search and read order lines from TARGET ---');

        // Check TARGET session is authenticated
        const targetAuth = await targetParity.isAuthenticatedSession();
        expect(targetAuth, 'TARGET session must be authenticated').toBe(true);

        // Verify SOURCE data was successfully read
        expect(sourceLineData.size, 'SOURCE data must be populated before TARGET comparison').toBeGreaterThan(0);

        for (const ref of results.sampledReferences) {
          const orders = await targetParity.searchRead<{
            id: number;
            name: string;
            order_line: Array<number>;
          }>(
            'sale.order',
            [['name', '=', ref], ...cutoffFilter],
            ['name', 'order_line'],
            { limit: 500 },
          );

          if (!orders.length) {
            console.log(`  ${ref}: NOT FOUND on TARGET`);
            continue;
          }

          results.foundOnTarget++;
          const order = orders[0];
          const lineIds = order.order_line as number[];

          const lines = await targetParity.readIds<{
            id: number;
            product_id: [number, string];
            product_uom_qty: number;
          }>(
            'sale.order.line',
            lineIds,
            ['product_id', 'product_uom_qty'],
          );

          const codes = lines.map(line => {
            const prodName = line.product_id[1] || '';
            const match = prodName.match(/\[([^\]]+)\]/);
            return match ? match[1] : prodName;
          });

          const qtys = lines.map(line => line.product_uom_qty);

          targetLineData.set(ref, {
            count: lineIds.length,
            codes,
            qtys,
          });

          console.log(`  ${ref}: ${lineIds.length} lines - codes=[${codes.join(', ')}] qtys=[${qtys.join(', ')}]`);
        }
      });

      await test.step('Step 4: Compare order lines per order', async () => {
        console.log('\n--- Step 4: Compare order lines ---');

        for (const ref of results.sampledReferences) {
          const sourceLine = sourceLineData.get(ref);
          const targetLine = targetLineData.get(ref);

          if (!sourceLine) {
            console.log(`  ${ref}: SOURCE data missing`);
            continue;
          }

          if (!targetLine) {
            console.log(`  ${ref}: TARGET data missing`);
            continue;
          }

          // Check line count
          if (sourceLine.count === targetLine.count) {
            results.lineCountMatches++;
            console.log(`  ${ref}: line count matches (${sourceLine.count})`);
          } else {
            results.droppedOrDuplicateLines.push({
              ref,
              issue: `line count mismatch: source=${sourceLine.count} vs target=${targetLine.count}`,
            });
            console.log(`  ${ref}: line count MISMATCH: source=${sourceLine.count} vs target=${targetLine.count}`);
          }

          // Check product codes
          if (JSON.stringify(sourceLine.codes) === JSON.stringify(targetLine.codes)) {
            results.productCodesMatches++;
            console.log(`  ${ref}: product codes match`);
          } else {
            results.droppedOrDuplicateLines.push({
              ref,
              issue: `product codes mismatch: source=[${sourceLine.codes.join(', ')}] vs target=[${targetLine.codes.join(', ')}]`,
            });
            console.log(`  ${ref}: product codes MISMATCH: source=[${sourceLine.codes.join(', ')}] vs target=[${targetLine.codes.join(', ')}]`);
          }

          // Check quantities
          if (JSON.stringify(sourceLine.qtys) === JSON.stringify(targetLine.qtys)) {
            results.orderedQtyMatches++;
            console.log(`  ${ref}: ordered qty matches`);
          } else {
            results.droppedOrDuplicateLines.push({
              ref,
              issue: `ordered qty mismatch: source=[${sourceLine.qtys.join(', ')}] vs target=[${targetLine.qtys.join(', ')}]`,
            });
            console.log(`  ${ref}: ordered qty MISMATCH: source=[${sourceLine.qtys.join(', ')}] vs target=[${targetLine.qtys.join(', ')}]`);
          }
        }
      });

      await test.step('Verification', async () => {
        console.log('\n==================== VERIFY ====================');
        console.log('Expected: All 10 sampled Order References found on TARGET');
        console.log(`Actual  : ${results.foundOnTarget} of 10 found`);
        console.log(`Result  : ${results.foundOnTarget === 10 ? 'PASS' : 'FAIL'}`);

        console.log('\nExpected: Line count matches for every sampled order');
        console.log(`Actual  : ${results.lineCountMatches} of ${results.sampledReferences.length} match`);
        console.log(`Result  : ${results.lineCountMatches === results.sampledReferences.length ? 'PASS' : 'FAIL'}`);

        console.log('\nExpected: Product codes match line for line in the same order');
        console.log(`Actual  : ${results.productCodesMatches} of ${results.sampledReferences.length} match`);
        console.log(`Result  : ${results.productCodesMatches === results.sampledReferences.length ? 'PASS' : 'FAIL'}`);

        console.log('\nExpected: Ordered Qty matches line for line');
        console.log(`Actual  : ${results.orderedQtyMatches} of ${results.sampledReferences.length} match`);
        console.log(`Result  : ${results.orderedQtyMatches === results.sampledReferences.length ? 'PASS' : 'FAIL'}`);

        console.log('\nExpected: No dropped or duplicated lines');
        console.log(`Actual  : ${results.droppedOrDuplicateLines.length} issue(s) found`);
        if (results.droppedOrDuplicateLines.length) {
          results.droppedOrDuplicateLines.forEach(issue => {
            console.log(`  - ${issue.ref}: ${issue.issue}`);
          });
        }
        console.log(`Result  : ${results.droppedOrDuplicateLines.length === 0 ? 'PASS' : 'FAIL'}`);
        console.log('===============================================\n');

        // Assertions (5 expected bullets)
        expect(results.foundOnTarget, 'all 10 sampled Order References must be found on TARGET').toBe(10);
        expect(results.lineCountMatches, 'line count must match on every sampled order').toBe(results.sampledReferences.length);
        expect(results.productCodesMatches, 'product codes must match line for line').toBe(results.sampledReferences.length);
        expect(results.orderedQtyMatches, 'ordered qty must match line for line').toBe(results.sampledReferences.length);
        expect(results.droppedOrDuplicateLines, 'no lines should be dropped or duplicated').toHaveLength(0);
      });

    } finally {
      await targetContext.close();
      await sourceContext.close();
    }
  });
});
