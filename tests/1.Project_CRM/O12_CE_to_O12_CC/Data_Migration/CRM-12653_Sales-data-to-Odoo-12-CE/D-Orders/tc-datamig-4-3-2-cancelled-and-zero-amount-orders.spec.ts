import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653_4.3.2 - Cancelled and zero-amount orders not dropped
 * Test Case ID: CRM-12653_4.3.2
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   Cancelled orders and zero-amount orders are migrated rather than filtered out by the ETL.
 *   This spec verifies that the count of cancelled orders and the count of zero-total orders
 *   on the source match the target, and that sampled cancelled orders remain in Cancelled status
 *   on the target.
 *
 * Source manual TC (master tab "O12 CE to O12 CC", row for 4.3.2):
 *
 * Pre-conditions:
 *   Two authenticated sessions: SOURCE = pre-production (Odoo 12 Enterprise, db nakivo),
 *   TARGET = crm-mig (Odoo 12 Community, db nakivoCE).
 *   Both are read-only: no create, write, unlink, or copy operations.
 *
 * Steps:
 *   1. On pre-production, open Sales > Orders > Orders, clear default filters, apply cut-off filter,
 *      Group By > Status, read the count on the "Cancelled" group.
 *   2. Open the Cancelled group and write down 3 Order References.
 *   3. On pre-production add Filters > Add Custom Filter: Field="Total", Operator="=", Value=0,
 *      and read the pager total.
 *   4. Repeat steps 1 and 3 on crm-mig and read both counts.
 *   5. On crm-mig search each of the 3 cancelled Order References and read the status of the match.
 *
 * Verification Points:
 *   1. The Cancelled count is identical on both servers.
 *   2. The zero-total count is identical on both servers.
 *   3. All 3 cancelled orders are found on crm-mig and each is still in status Cancelled.
 *   4. (Exceptions) Cancelled orders that are revived or missing, or zero-total count that is lower.
 *
 * READ-ONLY: this spec only reads via MigDataParityPage. It creates, modifies and deletes nothing.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_4\.3\.2:" --project=chromium
 */

async function openSession(
  browser: Browser,
  url: string,
  isMig: boolean,
  username: string,
  password: string,
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

test.describe('CRM-12653_4.3.2 - Cancelled and zero-amount orders', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('\nFAILURE REASON: ' + (testInfo.error?.message?.split('\n')[0] ?? 'unknown'));
    }
  });

  test('CRM-12653_4.3.2: Cancelled and zero-amount orders are migrated, not filtered out', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let targetSession: { context: BrowserContext; parity: MigDataParityPage } | null = null;
    let sourceSession: { context: BrowserContext; parity: MigDataParityPage } | null = null;

    try {
      console.log('========== CRM-12653_4.3.2 - Cancelled and zero-amount orders ==========');

      await test.step('Pre-condition: Open authenticated sessions on both servers', async () => {
        console.log('\n--- Pre-condition: Open authenticated sessions on both servers ---');
        console.log(`  TARGET: ${baseUrl_mig}`);
        console.log(`  SOURCE: ${baseUrl}`);

        targetSession = await openSession(browser, baseUrl_mig, true, users.admin_crm_mig.username, users.admin_crm_mig.password);
        sourceSession = await openSession(browser, baseUrl, false, users.admin_crm.username, users.admin_crm.password);

        const targetAuth = await targetSession.parity.isAuthenticatedSession();
        const sourceAuth = await sourceSession.parity.isAuthenticatedSession();

        expect(targetAuth, 'TARGET session is not authenticated').toBe(true);
        expect(sourceAuth, 'SOURCE session is not authenticated').toBe(true);
        console.log('  OK - both sessions authenticated');
      });

      let cutoff = '';
      let sourceCancelledCount = 0;
      let sourceZeroCount = 0;
      let targetCancelledCount = 0;
      let targetZeroCount = 0;
      const sampleOrders: Array<{ name: string; status: string }> = [];
      const targetSampleResults: Array<{ name: string; found: boolean; status: string }> = [];

      await test.step('Step 1-4: Count cancelled and zero-amount orders on both servers', async () => {
        console.log('\n--- Step 1-4: Count cancelled and zero-amount orders on both servers ---');

        cutoff = await targetSession!.parity.resolveCutoffDate();
        console.log(`  Cut-off date: ${cutoff}`);

        const onOrBeforeCutoff = MigDataParityPage.onOrBeforeCutoff(cutoff, 'order_date');

        // Count cancelled orders on source
        sourceCancelledCount = await sourceSession!.parity.searchCount(
          'sale.order',
          [...onOrBeforeCutoff, ['state', '=', 'cancel']],
        );
        console.log(`  SOURCE - Cancelled orders: ${sourceCancelledCount}`);

        // Count zero-amount orders on source
        sourceZeroCount = await sourceSession!.parity.searchCount(
          'sale.order',
          [...onOrBeforeCutoff, ['amount_total', '=', 0]],
        );
        console.log(`  SOURCE - Zero-amount orders: ${sourceZeroCount}`);

        // Count cancelled orders on target
        targetCancelledCount = await targetSession!.parity.searchCount(
          'sale.order',
          [...onOrBeforeCutoff, ['state', '=', 'cancel']],
        );
        console.log(`  TARGET - Cancelled orders: ${targetCancelledCount}`);

        // Count zero-amount orders on target
        targetZeroCount = await targetSession!.parity.searchCount(
          'sale.order',
          [...onOrBeforeCutoff, ['amount_total', '=', 0]],
        );
        console.log(`  TARGET - Zero-amount orders: ${targetZeroCount}`);

        // Guard: Source must have test data to verify migration
        expect(
          sourceCancelledCount > 0,
          'SOURCE has no cancelled orders - cannot verify migration (test data missing)',
        ).toBe(true);

        expect(
          sourceZeroCount > 0,
          'SOURCE has no zero-amount orders - cannot verify migration (test data missing)',
        ).toBe(true);
      });

      await test.step('Step 2: Sample 3 cancelled Order References from source', async () => {
        console.log('\n--- Step 2: Sample 3 cancelled Order References from source ---');

        const onOrBeforeCutoff = MigDataParityPage.onOrBeforeCutoff(cutoff, 'order_date');
        const cancelled: Array<{ name: string; state: string }> = await sourceSession!.parity.searchRead(
          'sale.order',
          [...onOrBeforeCutoff, ['state', '=', 'cancel']],
          ['name', 'state'],
          { limit: 3 },
        );

        console.log(`  Found ${cancelled.length} cancelled orders:`);
        for (const order of cancelled) {
          sampleOrders.push({ name: order.name, status: order.state });
          console.log(`    - ${order.name} (${order.state})`);
        }
      });

      await test.step('Step 5: Verify sampled orders exist on target and remain Cancelled', async () => {
        console.log('\n--- Step 5: Verify sampled orders exist on target and remain Cancelled ---');

        for (const order of sampleOrders) {
          const matches = await targetSession!.parity.searchRead(
            'sale.order',
            [['name', '=', order.name]],
            ['name', 'state'],
            { limit: 1 },
          );

          const found = matches.length > 0;
          const status = found ? matches[0].state : 'NOT_FOUND';
          targetSampleResults.push({ name: order.name, found, status });

          console.log(`    ${order.name}: found=${found}, status=${status}`);
        }
      });

      await test.step('Verification', async () => {
        console.log('\n==================== VERIFY ====================');

        console.log('  Verify #1 - Cancelled order count identical on both servers:');
        console.log(`     Expected : ${sourceCancelledCount}`);
        console.log(`     Actual   : ${targetCancelledCount}`);
        console.log(`     Result   : ${sourceCancelledCount === targetCancelledCount ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #2 - Zero-amount order count identical on both servers:');
        console.log(`     Expected : ${sourceZeroCount}`);
        console.log(`     Actual   : ${targetZeroCount}`);
        console.log(`     Result   : ${sourceZeroCount === targetZeroCount ? 'PASS' : 'FAIL'}`);

        let allSampleFound = true;
        let allSampleCancelled = true;
        for (const result of targetSampleResults) {
          if (!result.found) allSampleFound = false;
          if (result.found && result.status !== 'cancel') allSampleCancelled = false;
        }

        console.log('  Verify #3 - Sampled cancelled orders found and still Cancelled on target:');
        const sampleSummary = targetSampleResults
          .map((r) => `${r.name}=${r.found && r.status === 'cancel' ? 'OK' : 'FAIL'}`)
          .join(', ');
        console.log(`     Expected : all 3 found and Cancelled`);
        console.log(`     Actual   : ${sampleSummary}`);
        console.log(`     Result   : ${allSampleFound && allSampleCancelled ? 'PASS' : 'FAIL'}`);

        console.log('===============================================');
        const overallPass = sourceCancelledCount === targetCancelledCount
          && sourceZeroCount === targetZeroCount
          && allSampleFound
          && allSampleCancelled;
        console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - cancelled and zero-amount orders migrated correctly`);

        // Assertions for the 4 expected bullet points
        expect(
          sourceCancelledCount === targetCancelledCount,
          `Cancelled order count mismatch: source=${sourceCancelledCount}, target=${targetCancelledCount}`,
        ).toBe(true);

        expect(
          sourceZeroCount === targetZeroCount,
          `Zero-amount order count mismatch: source=${sourceZeroCount}, target=${targetZeroCount}`,
        ).toBe(true);

        expect(
          allSampleFound,
          `Some cancelled orders not found on target: ${targetSampleResults.filter((r) => !r.found).map((r) => r.name).join(', ')}`,
        ).toBe(true);

        expect(
          allSampleCancelled,
          `Some cancelled orders revived on target: ${targetSampleResults.filter((r) => r.found && r.status !== 'cancel').map((r) => `${r.name}=${r.status}`).join(', ')}`,
        ).toBe(true);
      });

    } finally {
      if (sourceSession) await sourceSession.context.close();
      if (targetSession) await targetSession.context.close();
    }
  });

});
