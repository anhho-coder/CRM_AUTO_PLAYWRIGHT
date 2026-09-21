import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653_4.1.1 - Order count per status within the cut-off
 * Test Case ID: CRM-12653_4.1.1
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   The number of sale orders per status created on or before the cut-off is the same
 *   on both servers (pre-production and crm-mig). This spec counts all orders grouped
 *   by state, compares the totals, and verifies the per-status distribution matches.
 *
 * Source manual TC (master tab "CRM-12653 Data Migration - Sales data to Odoo 12 CE", row 4.1.1):
 *   Steps: Open Sales > Orders on both servers, filter by Order Date before (CUTOFF+1 day),
 *   read total and group by Status, compare totals and per-status breakdowns.
 *   Expected: TARGET_ORDERS = SOURCE_ORDERS after subtracting post-cut-off records;
 *   status names identical; per-status counts match; counts add up to totals.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_4\.1\.1:" --project=chromium
 */

async function openSession(
  browser: Browser, url: string, isMig: boolean, username: string, password: string,
): Promise<{ context: BrowserContext; parity: MigDataParityPage }> {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,   // crm-mig serves a self-signed chain
  });
  const page = await context.newPage();
  const loginPage = isMig ? new LoginPageMig(page) : new LoginPage(page);
  await loginPage.navigateTo(url);
  await loginPage.login(username, password);
  return { context, parity: new MigDataParityPage(page) };
}

test.describe('CRM-12653 Part 4.1 - Sales Orders data migration', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12653_4.1.1: Order count per status within the cut-off', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let sourceContext: BrowserContext | null = null;
    let targetContext: BrowserContext | null = null;

    try {
      console.log('========== CRM-12653_4.1.1 - Order count per status within the cut-off ==========');

      let targetParity: MigDataParityPage;
      let sourceParity: MigDataParityPage;
      let cutoff: string;

      // Step 1: Open target session (crm-mig) and resolve cut-off
      await test.step('Step 1: Open authenticated session on crm-mig (target) and resolve cut-off date', async () => {
        console.log('\n--- Step 1: Open authenticated session on crm-mig (target) ---');
        console.log(`  Account : ${users.admin_crm_mig.username}`);
        console.log(`  Target  : ${baseUrl_mig}`);
        const session = await openSession(browser, baseUrl_mig, true, users.admin_crm_mig.username, users.admin_crm_mig.password);
        targetContext = session.context;
        targetParity = session.parity;

        const isAuth = await targetParity.isAuthenticatedSession();
        console.log(`  OK - authenticated: ${isAuth}`);
        expect(isAuth, 'target session not authenticated on crm-mig').toBe(true);

        cutoff = await targetParity.resolveCutoffDate();
        console.log(`  Cut-off date resolved: ${cutoff}`);
      });

      // Step 2: Open source session (pre-production)
      await test.step('Step 2: Open authenticated session on pre-production (source)', async () => {
        console.log('\n--- Step 2: Open authenticated session on pre-production (source) ---');
        console.log(`  Account : ${users.admin_crm.username}`);
        console.log(`  Source  : ${baseUrl}`);
        const session = await openSession(browser, baseUrl, false, users.admin_crm.username, users.admin_crm.password);
        sourceContext = session.context;
        sourceParity = session.parity;

        const isAuth = await sourceParity.isAuthenticatedSession();
        console.log(`  OK - authenticated: ${isAuth}`);
        expect(isAuth, 'source session not authenticated on pre-production').toBe(true);
      });

      // Step 3: Count orders on source within cut-off, grouped by state
      let sourceTotal: number = 0;
      const sourceByStatus = new Map<string, number>();

      await test.step('Step 3: Read SOURCE order count by state (on or before cut-off)', async () => {
        console.log('\n--- Step 3: Read SOURCE order count by state (on or before cut-off) ---');
        const domain = MigDataParityPage.onOrBeforeCutoff(cutoff, 'date_order');
        console.log(`  Domain: ${JSON.stringify(domain)}`);

        sourceTotal = await sourceParity.searchCount('sale.order', domain);
        console.log(`  Total SOURCE orders: ${sourceTotal}`);

        const groups = await sourceParity.countByField('sale.order', domain, 'state');
        for (const [status, count] of groups.entries()) {
          sourceByStatus.set(status, count);
          console.log(`    ${status}: ${count}`);
        }
      });

      // Step 4: Count orders on target within cut-off, grouped by state
      let targetBeforeCutoff: number = 0;
      const targetByStatus = new Map<string, number>();

      await test.step('Step 4: Read TARGET order count by state (on or before cut-off)', async () => {
        console.log('\n--- Step 4: Read TARGET order count by state (on or before cut-off) ---');
        const domain = MigDataParityPage.onOrBeforeCutoff(cutoff, 'date_order');
        console.log(`  Domain: ${JSON.stringify(domain)}`);

        targetBeforeCutoff = await targetParity.searchCount('sale.order', domain);
        console.log(`  Total TARGET orders (on or before cut-off): ${targetBeforeCutoff}`);

        const groups = await targetParity.countByField('sale.order', domain, 'state');
        for (const [status, count] of groups.entries()) {
          targetByStatus.set(status, count);
          console.log(`    ${status}: ${count}`);
        }
      });

      // Step 5: Count post-cut-off orders on target and calculate adjusted total
      let targetPostCutoff: number = 0;
      let targetTotal: number = 0;
      let targetAdjusted: number = 0;

      await test.step('Step 5: Count post-cut-off orders on target and calculate adjusted total', async () => {
        console.log('\n--- Step 5: Count post-cut-off orders on target ---');
        const postCutoffDomain = MigDataParityPage.afterCutoff(cutoff, 'date_order');
        console.log(`  Domain: ${JSON.stringify(postCutoffDomain)}`);

        targetPostCutoff = await targetParity.searchCount('sale.order', postCutoffDomain);
        console.log(`  Post-cut-off orders on target: ${targetPostCutoff}`);

        targetTotal = targetBeforeCutoff + targetPostCutoff;
        console.log(`  TARGET total (all orders): ${targetTotal} (${targetBeforeCutoff} + ${targetPostCutoff})`);

        targetAdjusted = targetTotal - targetPostCutoff;
        console.log(`  TARGET adjusted total (migrated only): ${targetAdjusted} (${targetTotal} - ${targetPostCutoff})`);
      });

      // Step 6: Verify the counts match
      await test.step('Step 6: Verification - Compare counts and per-status distribution', async () => {
        console.log('\n==================== VERIFY ====================');

        // Verify #1: Both servers return data
        console.log('  Verify #1 - Both servers return a total and per-status breakdown:');
        console.log(`     Expected : sourceTotal > 0 AND targetTotal > 0`);
        console.log(`     Actual   : sourceTotal=${sourceTotal}, targetTotal=${targetTotal}`);
        console.log(`     Result   : ${sourceTotal > 0 && targetTotal > 0 ? 'PASS' : 'FAIL'}`);

        // Verify #2: Adjusted target equals source
        const diff = targetAdjusted - sourceTotal;
        const diffPercent = sourceTotal > 0 ? ((diff / sourceTotal) * 100).toFixed(2) : '0';
        console.log('  Verify #2 - TARGET_ORDERS (adjusted) equals SOURCE_ORDERS:');
        console.log(`     Expected : targetAdjusted = sourceTotal, diff = 0`);
        console.log(`     Actual   : targetAdjusted=${targetAdjusted}, sourceTotal=${sourceTotal}, diff=${diff} (${diffPercent}%)`);
        console.log(`     Result   : ${diff === 0 ? 'PASS' : 'FAIL'}`);

        // Verify #3: Status names are identical
        const sourceStatuses = Array.from(sourceByStatus.keys()).sort();
        const targetStatuses = Array.from(targetByStatus.keys()).sort();
        const statusesMatch = sourceStatuses.length === targetStatuses.length &&
          sourceStatuses.every((s, i) => s === targetStatuses[i]);
        console.log('  Verify #3 - Status names are identical on both servers:');
        console.log(`     Expected : ${JSON.stringify(sourceStatuses)}`);
        console.log(`     Actual   : ${JSON.stringify(targetStatuses)}`);
        console.log(`     Result   : ${statusesMatch ? 'PASS' : 'FAIL'}`);

        // Verify #4: Per-status counts add up to totals
        let sourceSumCheck = 0;
        let targetSumCheck = 0;
        for (const count of sourceByStatus.values()) sourceSumCheck += count;
        for (const count of targetByStatus.values()) targetSumCheck += count;
        const sourceAddsUp = sourceSumCheck === sourceTotal;
        const targetAddsUp = targetSumCheck === targetTotal;
        console.log('  Verify #4 - Per-status counts add up to totals:');
        console.log(`     Expected : sourceSum === sourceTotal AND targetSum === targetTotal`);
        console.log(`     Actual   : sourceSum=${sourceSumCheck}, sourceTotal=${sourceTotal}; targetSum=${targetSumCheck}, targetTotal=${targetTotal}`);
        console.log(`     Result   : ${sourceAddsUp && targetAddsUp ? 'PASS' : 'FAIL'}`);

        // Verify #5: Record any non-zero deltas by status
        const deltas: Array<{ status: string; delta: number; percent: string }> = [];
        const allStatuses = new Set([...sourceByStatus.keys(), ...targetByStatus.keys()]);
        for (const status of allStatuses) {
          const srcCount = sourceByStatus.get(status) || 0;
          const tgtCount = targetByStatus.get(status) || 0;
          const delta = tgtCount - srcCount;
          if (delta !== 0) {
            const pct = srcCount > 0 ? ((delta / srcCount) * 100).toFixed(2) : '0';
            deltas.push({ status, delta, percent: pct });
          }
        }
        console.log('  Verify #5 - Non-zero deltas by status:');
        if (deltas.length === 0) {
          console.log(`     Result   : PASS - no per-status deltas`);
        } else {
          console.log(`     Result   : FAIL - deltas found:`);
          for (const d of deltas) {
            console.log(`       ${d.status}: ${d.delta > 0 ? '+' : ''}${d.delta} (${d.percent}%)`);
          }
        }

        console.log('===============================================');
        console.log(`OVERALL: ${diff === 0 && statusesMatch && sourceAddsUp && targetAddsUp && deltas.length === 0 ? 'PASS' : 'FAIL'}`);
      });

      // Assertions based on the 5 expected bullets
      expect(sourceTotal, 'source server did not return orders - query returned no data').toBeGreaterThan(0);
      expect(targetTotal, 'target server did not return orders - query returned no data').toBeGreaterThan(0);

      expect(targetAdjusted, `TARGET_ORDERS (${targetAdjusted}) should equal SOURCE_ORDERS (${sourceTotal}), but diff = ${targetAdjusted - sourceTotal}`).toBe(sourceTotal);

      const sourceStatuses = Array.from(sourceByStatus.keys()).sort();
      const targetStatuses = Array.from(targetByStatus.keys()).sort();
      expect(targetStatuses, `target status names ${JSON.stringify(targetStatuses)} do not match source ${JSON.stringify(sourceStatuses)}`).toEqual(sourceStatuses);

      for (const status of sourceStatuses) {
        const srcCount = sourceByStatus.get(status) || 0;
        const tgtCount = targetByStatus.get(status) || 0;
        expect(tgtCount, `status "${status}": target count (${tgtCount}) does not match source (${srcCount})`).toBe(srcCount);
      }

      let sourceSumCheck = 0;
      for (const count of sourceByStatus.values()) sourceSumCheck += count;
      expect(sourceSumCheck, `source per-status sum (${sourceSumCheck}) does not equal total (${sourceTotal})`).toBe(sourceTotal);

      let targetSumCheck = 0;
      for (const count of targetByStatus.values()) targetSumCheck += count;
      expect(targetSumCheck, `target per-status sum (${targetSumCheck}) does not equal total (${targetTotal})`).toBe(targetTotal);

    } finally {
      if (sourceContext) await sourceContext.close();
      if (targetContext) await targetContext.close();
    }
  });
});
