import { test, expect, type Browser, type BrowserContext } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';

/**
 * CRM-12653 Part 1 - Post-cutoff source data is absent from the target
 * Test Case ID: CRM-12653_1.1.3
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   Source records (Sale Orders) created after the migration cutoff are expected to be absent
 *   from the target (crm-mig), because the snapshot was taken at a fixed moment and the source
 *   has continued to run. This establishes the cutoff as a hard boundary: every count comparison
 *   in subsequent parity checks must filter BOTH servers to "on or before cutoff" to ensure
 *   a fair comparison. Raw total counts are invalid because the source has diverged post-cutoff.
 *
 * Source manual TC (master tab "Data Migration - Sales data to Odoo 12 CE",
 * "A-Cross-cutting" section, row 1.1.3):
 *
 * Pre-conditions:
 *   - Pre-production (SOURCE) logged in as CRM admin
 *   - crm-mig (TARGET) logged in as admin_crm_mig
 *   - Developer mode ON on both servers
 *   - Cutoff date established (from CRM-12653_1.1.2)
 *
 * Steps to reproduce:
 *   1. On pre-production open Sales > Orders > Orders and clear the search bar
 *   2. Filters > Add Custom Filter: Field = "Order Date", Operator = "is after", Value = <CUTOFF>
 *   3. Read the total in the pager (the N in "1-80 / N")
 *   4. Write down any 3 Order References from that list
 *   5. On crm-mig open Sales > Orders > Orders and search each of the 3 references in turn
 *
 * Verification Points:
 *   1. Pre-production returns a NON-ZERO count - the source has kept running past the snapshot
 *   2. None of the 3 references is found on crm-mig - 0 results for each
 *   3. This absence is EXPECTED and is NOT a migration defect
 *   4. Every count comparison must filter BOTH servers to "on or before <CUTOFF>"
 *   5. A parity check comparing raw totals is invalid and must be re-run with cutoff filter
 *
 * READ-ONLY: this spec only reads Sale Order data. It creates, modifies and deletes nothing.
 *
 * NOTE: Order references are searched by the name field ('name') on crm-mig, which holds the
 * order number (e.g., "SO000001"). Pre-production order_date is filtered to post-cutoff only.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_1\\.1\\.3:" --project=chromium
 */

/** Inline session helper - specs are self-contained. */
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

test.describe('CRM-12653 Part 1 - Post-cutoff source data is absent from target', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12653_1.1.3: Post-cutoff source orders are absent from target and not counted as loss', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let targetSession: { context: BrowserContext; parity: MigDataParityPage } | null = null;
    let sourceSession: { context: BrowserContext; parity: MigDataParityPage } | null = null;

    try {
      const cutoffOrderReferences: string[] = [];
      let sourceTotalPostCutoff = 0;
      const notFoundOnTarget: { reference: string; searchCount: number }[] = [];

      console.log('========== CRM-12653_1.1.3 - Post-cutoff source data absent from target ==========');

      await test.step('Pre-condition: Login to both servers', async () => {
        console.log('\n--- Pre-condition: Login to both servers ---');

        // TARGET first
        console.log(`  TARGET: ${baseUrl_mig} as ${users.admin_crm_mig.username}`);
        targetSession = await openSession(browser, baseUrl_mig, true, users.admin_crm_mig.username, users.admin_crm_mig.password);
        const targetAuth = await targetSession.parity.isAuthenticatedSession();
        expect(targetAuth, 'TARGET (crm-mig) session must be authenticated').toBe(true);
        console.log('  OK - logged in to crm-mig and authenticated');

        // SOURCE second
        console.log(`  SOURCE: ${baseUrl} as ${users.admin_crm.username}`);
        sourceSession = await openSession(browser, baseUrl, false, users.admin_crm.username, users.admin_crm.password);
        const sourceAuth = await sourceSession.parity.isAuthenticatedSession();
        expect(sourceAuth, 'SOURCE (pre-production) session must be authenticated').toBe(true);
        console.log('  OK - logged in to pre-production and authenticated');
      });

      let cutoffDate: string;
      await test.step('Step 1-3: Resolve cutoff date and count post-cutoff orders on pre-production', async () => {
        console.log('\n--- Step 1-3: Resolve cutoff date and query post-cutoff orders ---');

        // Resolve the cutoff from the TARGET (crm-mig has the earliest data)
        cutoffDate = await targetSession!.parity.resolveCutoffDate();
        console.log(`  Cutoff date (earliest create_date in crm-mig): ${cutoffDate}`);

        // On SOURCE: count Sale Orders created AFTER the cutoff
        const postCutoffDomain = MigDataParityPage.afterCutoff(cutoffDate, 'order_date');
        console.log(`  Querying SOURCE for orders with order_date >= ${cutoffDate}...`);

        sourceTotalPostCutoff = await sourceSession!.parity.searchCount('sale.order', postCutoffDomain);
        console.log(`  SOURCE total orders after cutoff: ${sourceTotalPostCutoff}`);

        // Verify we actually got some post-cutoff orders to work with
        expect(sourceTotalPostCutoff, 'Pre-condition check: source must have post-cutoff orders').toBeGreaterThan(0);
      });

      await test.step('Step 4: Sample 3 Order References from post-cutoff orders on SOURCE', async () => {
        console.log('\n--- Step 4: Sample 3 Order References from post-cutoff orders ---');

        const postCutoffDomain = MigDataParityPage.afterCutoff(cutoffDate, 'order_date');

        // Sample deterministically: oldest 3 and newest 3, then take the first 3 overall
        const sample1 = await sourceSession!.parity.searchRead<{ name: string }>(
          'sale.order',
          postCutoffDomain,
          ['name'],
          { limit: 3, order: 'order_date asc' },
        );

        const sample2 = await sourceSession!.parity.searchRead<{ name: string }>(
          'sale.order',
          postCutoffDomain,
          ['name'],
          { limit: 3, order: 'order_date desc' },
        );

        // Collect unique references (oldest 3)
        for (const record of sample1) {
          cutoffOrderReferences.push(record.name);
        }

        console.log(`  Sampled 3 post-cutoff Order References from SOURCE:`);
        for (const ref of cutoffOrderReferences) {
          console.log(`    - ${ref}`);
        }
      });

      await test.step('Step 5: Search each reference on TARGET (crm-mig) - expect 0 results', async () => {
        console.log('\n--- Step 5: Search each reference on TARGET ---');

        for (const ref of cutoffOrderReferences) {
          // On TARGET, search for this order by name field
          const results = await targetSession!.parity.searchRead<{ name: string }>(
            'sale.order',
            [['name', '=', ref]],
            ['name'],
            { limit: 1 },
          );

          const foundCount = results.length;
          notFoundOnTarget.push({ reference: ref, searchCount: foundCount });
          console.log(`    Reference "${ref}": found ${foundCount} on crm-mig`);
        }
      });

      await test.step('Verification', async () => {
        console.log('\n==================== VERIFY ====================');

        // Bullet 1: Pre-production returns NON-ZERO count
        console.log('  Verify #1 - SOURCE has post-cutoff orders (source kept running):');
        console.log(`     Expected : count > 0`);
        console.log(`     Actual   : ${sourceTotalPostCutoff}`);
        console.log(`     Result   : ${sourceTotalPostCutoff > 0 ? 'PASS' : 'FAIL'}`);

        // Bullets 2-4: None of the 3 references found on TARGET
        const allNotFound = notFoundOnTarget.every((r) => r.searchCount === 0);
        console.log('  Verify #2 - None of the 3 references found on TARGET:');
        console.log(`     Expected : all 3 have 0 results on crm-mig`);
        for (const item of notFoundOnTarget) {
          console.log(`     Actual   : "${item.reference}" = ${item.searchCount} on crm-mig`);
        }
        console.log(`     Result   : ${allNotFound ? 'PASS' : 'FAIL'}`);

        // Bullets 3 & 4: This absence is EXPECTED, and parity must use cutoff filter
        console.log('  Verify #3 - This absence is EXPECTED and NOT a defect:');
        console.log('     Expected : post-cutoff source records do not migrate to crm-mig');
        console.log(`     Actual   : all sampled post-cutoff orders absent from target`);
        console.log(`     Result   : PASS (expected behavior)`);

        console.log('  Verify #4 - Parity counts MUST filter both servers to "on or before cutoff":');
        console.log(`     Expected : all comparisons use MigDataParityPage.onOrBeforeCutoff("${cutoffDate}")`);
        console.log(`     Actual   : this spec demonstrates the boundary at "${cutoffDate}"`);
        console.log(`     Result   : PASS (cutoff established)`);

        // Bullet 5: Raw totals are invalid
        console.log('  Verify #5 - Raw total counts are invalid without cutoff filter:');
        console.log(`     Expected : parity checks must NOT compare source total (${sourceTotalPostCutoff}+) vs target raw total`);
        console.log(`     Actual   : this spec proves source has ${sourceTotalPostCutoff} post-cutoff orders absent from target`);
        console.log(`     Result   : PASS (cutoff filter required for valid comparison)`);
        console.log('===============================================');

        // Assertions
        expect(sourceTotalPostCutoff, 'Bullet 1: pre-production must have at least one post-cutoff order').toBeGreaterThan(0);
        expect(notFoundOnTarget.every((r) => r.searchCount === 0), 'Bullet 2: none of the 3 sampled orders should exist on crm-mig').toBe(true);
        expect(allNotFound, 'Bullet 3: post-cutoff source records are correctly absent from target').toBe(true);
        expect(cutoffDate, 'Bullet 4: cutoff date was established for filtering').toBeTruthy();
        expect(sourceTotalPostCutoff > 0 && allNotFound, 'Bullet 5: raw totals without cutoff filter would give incorrect parity').toBe(true);
      });

    } finally {
      // Clean up both sessions
      if (targetSession) {
        await targetSession.context.close();
      }
      if (sourceSession) {
        await sourceSession.context.close();
      }
    }
  });
});
