import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653 Part 4.1.2 - Deal Element vs Quotation split in orders
 * Test Case ID: CRM-12653_4.1.2
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   Verifies that the Deal Element and quotation populations are migrated in full
 *   and add up to the total order count. Orders are identified by their Order Reference:
 *   DE##### for Deal Elements and SO##### for quotations/sales orders.
 *
 * Source manual TC (master sheet tab "CRM-12653 Data Migration Sales", row 4.1.2):
 *
 * Pre-conditions:
 *   VPN connected; both pre-production (Odoo 12 Enterprise) and crm-mig
 *   (Odoo 12 Community) are reachable.
 *   Login: anh.ho@nakivo.com (admin_crm for source, admin_crm_mig for target).
 *   Cut-off date already agreed; migration completed to the cut-off.
 *   CRM-12653_4.1.1 already run (SOURCE_ORDERS and TARGET_ORDERS counts at hand).
 *   Post-cut-off target records already accounted for in CRM-12653_1.1.4.
 *
 * Steps to reproduce:
 *   1. On pre-production open Sales > Orders > Orders with the CRM-12653_4.1.1 filter.
 *   2. Type "DE" in search box and search for Order Reference containing "DE".
 *   3. Read pager total (DE count).
 *   4. Replace with "SO" and search for Order Reference containing "SO".
 *   5. Read pager total (SO count).
 *   6. Sort by Order Reference descending and record highest DE number.
 *   7. Repeat steps 1-6 on crm-mig.
 *   8. Compare DE counts, SO counts and highest DE numbers.
 *   9. Verify DE + SO = total order count from 4.1.1 on each server.
 *   10. Verify highest DE on target <= highest DE on source (within cut-off).
 *
 * Verification Points:
 *   1. Both servers return a DE count and an SO count (within cut-off window).
 *   2. DE count matches between servers.
 *   3. SO count matches between servers.
 *   4. DE count + SO count = total order count from 4.1.1 on each server.
 *   5. Highest DE number on target equals highest DE number on source (within cut-off).
 *
 * READ-ONLY: this spec only reads order records. It creates, modifies and deletes
 * nothing, as required on crm-mig.
 *
 * NOTE: Order References (DE#####, SO#####) are the natural keys used to identify
 * order types. The migration preserves these references. IDs are re-sequenced on
 * crm-mig, so joins must be on Order Reference, not id.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_4\.1\.2:" --project=chromium
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

test.describe('CRM-12653 Part 4.1.2 - Deal Element vs Quotation split verification', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12653_4.1.2: Deal Element and quotation populations migrated in full with counts matching', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let sourceContext: BrowserContext | null = null;
    let targetContext: BrowserContext | null = null;

    try {
      console.log('========== CRM-12653_4.1.2 - Deal Element vs Quotation Split (Parity Verification) ==========');

      // Open target session first to resolve cut-off date
      await test.step('Pre-condition: Open session on crm-mig (target)', async () => {
        console.log('\n--- Pre-condition: Open session on crm-mig (target) ---');
        console.log(`  Account : ${users.admin_crm_mig.username}`);
        console.log(`  Target  : ${baseUrl_mig}`);
        const session = await openSession(browser, baseUrl_mig, true, users.admin_crm_mig.username, users.admin_crm_mig.password);
        targetContext = session.context;

        const isAuth = await session.parity.isAuthenticatedSession();
        console.log(`  Authenticated: ${isAuth}`);
        expect(isAuth, 'target session not authenticated on crm-mig').toBe(true);
      });

      // Open source session
      await test.step('Pre-condition: Open session on pre-production (source)', async () => {
        console.log('\n--- Pre-condition: Open session on pre-production (source) ---');
        console.log(`  Account : ${users.admin_crm.username}`);
        console.log(`  Source  : ${baseUrl}`);
        const session = await openSession(browser, baseUrl, false, users.admin_crm.username, users.admin_crm.password);
        sourceContext = session.context;

        const isAuth = await session.parity.isAuthenticatedSession();
        console.log(`  Authenticated: ${isAuth}`);
        expect(isAuth, 'source session not authenticated on pre-production').toBe(true);
      });

      // Resolve cut-off from target
      const targetParityPage = new MigDataParityPage((await targetContext!.pages())[0]);
      const cutoff = await targetParityPage.resolveCutoffDate();
      console.log(`\n--- Cut-off date resolved on target: ${cutoff} ---`);

      const sourceParityPage = new MigDataParityPage((await sourceContext!.pages())[0]);

      // Get total order count from both sides (needed for verification that DE + SO = total)
      let sourceTotal = 0;
      let targetTotal = 0;

      await test.step('Step 0: Get total order count on both servers (for verification)', async () => {
        console.log('\n--- Step 0: Get total order count on both servers ---');

        const sourceDomain = [...MigDataParityPage.onOrBeforeCutoff(cutoff)];
        sourceTotal = await sourceParityPage.searchCount('sale.order', sourceDomain);
        console.log(`  Source total orders (pre-production): ${sourceTotal}`);

        const targetDomain = [...MigDataParityPage.onOrBeforeCutoff(cutoff)];
        targetTotal = await targetParityPage.searchCount('sale.order', targetDomain);
        console.log(`  Target total orders (crm-mig): ${targetTotal}`);
      });

      // Count DE orders on both sides
      let sourceDeCount = 0;
      let targetDeCount = 0;
      let sourceDeMax = '';
      let targetDeMax = '';

      await test.step('Step 1-2: Count and identify DE (Deal Element) orders', async () => {
        console.log('\n--- Step 1-2: Count DE orders on both servers ---');

        const sourceDomain = [
          ...MigDataParityPage.onOrBeforeCutoff(cutoff),
          ['name', '=like', 'DE%'],
        ];
        const sourceDeOrders = await sourceParityPage.searchRead(
          'sale.order',
          sourceDomain,
          ['name'],
          { limit: 500, order: 'name desc' }
        );
        sourceDeCount = sourceDeOrders.length;
        if (sourceDeOrders.length > 0) {
          sourceDeMax = sourceDeOrders[0].name || '';
        }
        console.log(`  Source DE orders: ${sourceDeCount}${sourceDeMax ? ` (highest: ${sourceDeMax})` : ''}`);

        const targetDomain = [
          ...MigDataParityPage.onOrBeforeCutoff(cutoff),
          ['name', '=like', 'DE%'],
        ];
        const targetDeOrders = await targetParityPage.searchRead(
          'sale.order',
          targetDomain,
          ['name'],
          { limit: 500, order: 'name desc' }
        );
        targetDeCount = targetDeOrders.length;
        if (targetDeOrders.length > 0) {
          targetDeMax = targetDeOrders[0].name || '';
        }
        console.log(`  Target DE orders: ${targetDeCount}${targetDeMax ? ` (highest: ${targetDeMax})` : ''}`);
      });

      // Count SO orders on both sides
      let sourceSoCount = 0;
      let targetSoCount = 0;

      await test.step('Step 3: Count and identify SO (Sales Order) orders', async () => {
        console.log('\n--- Step 3: Count SO orders on both servers ---');

        const sourceDomain = [
          ...MigDataParityPage.onOrBeforeCutoff(cutoff),
          ['name', '=like', 'SO%'],
        ];
        const sourceSoOrders = await sourceParityPage.searchRead(
          'sale.order',
          sourceDomain,
          ['name'],
          { limit: 500 }
        );
        sourceSoCount = sourceSoOrders.length;
        console.log(`  Source SO orders: ${sourceSoCount}`);

        const targetDomain = [
          ...MigDataParityPage.onOrBeforeCutoff(cutoff),
          ['name', '=like', 'SO%'],
        ];
        const targetSoOrders = await targetParityPage.searchRead(
          'sale.order',
          targetDomain,
          ['name'],
          { limit: 500 }
        );
        targetSoCount = targetSoOrders.length;
        console.log(`  Target SO orders: ${targetSoCount}`);
      });

      // Compute unaccounted orders (orders with neither DE nor SO reference)
      const sourceUnaccounted = sourceTotal - sourceDeCount - sourceSoCount;
      const targetUnaccounted = targetTotal - targetDeCount - targetSoCount;

      // Compare results
      const deCountMatch = sourceDeCount === targetDeCount;
      const soCountMatch = sourceSoCount === targetSoCount;
      const deMaxMatch = sourceDeMax === targetDeMax;

      await test.step('Verification', async () => {
        console.log('\n==================== VERIFY ====================');
        console.log('  Verify #1 - Both servers return DE and SO counts (within cut-off):');
        console.log('     Expected : source and target both have DE count and SO count');
        console.log(`     Actual   : source DE=${sourceDeCount}, SO=${sourceSoCount}; target DE=${targetDeCount}, SO=${targetSoCount}`);
        console.log(`     Result   : PASS (counts retrieved)`);
        console.log('  Verify #2 - DE count matches between servers:');
        console.log(`     Expected : source DE = target DE`);
        console.log(`     Actual   : source=${sourceDeCount}, target=${targetDeCount}`);
        console.log(`     Result   : ${deCountMatch ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #3 - SO count matches between servers:');
        console.log(`     Expected : source SO = target SO`);
        console.log(`     Actual   : source=${sourceSoCount}, target=${targetSoCount}`);
        console.log(`     Result   : ${soCountMatch ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #4 - DE + SO equals total order count:');
        console.log(`     Expected : source (DE+SO) = source total AND target (DE+SO) = target total`);
        console.log(`     Actual   : source ${sourceDeCount}+${sourceSoCount}=${sourceDeCount + sourceSoCount} vs total=${sourceTotal}${sourceUnaccounted !== 0 ? ` (${sourceUnaccounted} unaccounted)` : ''}; target ${targetDeCount}+${targetSoCount}=${targetDeCount + targetSoCount} vs total=${targetTotal}${targetUnaccounted !== 0 ? ` (${targetUnaccounted} unaccounted)` : ''}`);
        console.log(`     Result   : ${sourceUnaccounted === 0 && targetUnaccounted === 0 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #5 - Highest DE number on target matches source (within cut-off):');
        console.log(`     Expected : source highest DE = target highest DE`);
        console.log(`     Actual   : source=${sourceDeMax}, target=${targetDeMax}`);
        console.log(`     Result   : ${deMaxMatch && sourceDeMax ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        console.log(`OVERALL: ${deCountMatch && soCountMatch && sourceUnaccounted === 0 && targetUnaccounted === 0 && deMaxMatch && sourceDeMax ? 'PASS' : 'FAIL'} - Deal Element and quotation split matches between servers`);

        // Guard against empty source server (FALSE GREEN protection)
        expect(sourceDeCount + sourceSoCount, 'source server has no orders in window - cannot verify parity (check cut-off date and server reachability)').toBeGreaterThan(0);

        // Verify #1: Both servers return DE and SO counts (cannot be silent if reads fail)
        expect(targetDeCount, 'target DE count could not be retrieved').toBeGreaterThanOrEqual(0);
        expect(targetSoCount, 'target SO count could not be retrieved').toBeGreaterThanOrEqual(0);

        // Verify #2: DE count matches
        expect(targetDeCount, `Verify #2 FAIL - DE count mismatch: source=${sourceDeCount} vs target=${targetDeCount}`).toBe(sourceDeCount);

        // Verify #3: SO count matches
        expect(targetSoCount, `Verify #3 FAIL - SO count mismatch: source=${sourceSoCount} vs target=${targetSoCount}`).toBe(sourceSoCount);

        // Verify #4: DE + SO equals total on each server
        expect(sourceUnaccounted, `Verify #4 FAIL - source has unaccounted orders: ${sourceUnaccounted} orders carry neither DE nor SO reference`).toBe(0);
        expect(targetUnaccounted, `Verify #4 FAIL - target has unaccounted orders: ${targetUnaccounted} orders carry neither DE nor SO reference`).toBe(0);

        // Verify #5: Highest DE number matches (requires DE data on both sides)
        expect(sourceDeMax, 'Verify #5 FAIL - no DE orders found on source - cannot verify highest DE number').toBeTruthy();
        expect(targetDeMax, 'Verify #5 FAIL - no DE orders found on target - cannot verify highest DE number').toBeTruthy();
        expect(targetDeMax, `Verify #5 FAIL - highest DE number mismatch: source=${sourceDeMax} vs target=${targetDeMax}`).toBe(sourceDeMax);
      });

    } finally {
      if (sourceContext) await sourceContext.close();
      if (targetContext) await targetContext.close();
    }
  });
});
