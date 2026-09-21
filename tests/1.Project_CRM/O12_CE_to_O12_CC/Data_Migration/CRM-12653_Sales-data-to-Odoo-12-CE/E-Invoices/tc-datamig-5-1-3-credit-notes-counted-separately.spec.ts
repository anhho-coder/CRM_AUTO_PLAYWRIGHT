import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653 Part 5.1.3 - Credit notes counted separately from invoices
 * Test Case ID: CRM-12653_5.1.3
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   Customer credit notes are migrated as their own document type (type='out_refund')
 *   and their count matches the source. Credit notes must NOT be counted as part of
 *   the regular invoice total.
 *
 * Source manual TC (master sheet tab "CRM-12653 Data Migration Sales", row 5.1.3):
 *
 * Pre-conditions:
 *   VPN connected; both pre-production (Odoo 12 Enterprise) and crm-mig
 *   (Odoo 12 Community) are reachable.
 *   Login: anh.ho@nakivo.com (admin_crm for source, admin_crm_mig for target).
 *   <CUTOFF> = the migration cut-off date established in CRM-12653_1.1.2
 *
 * Steps to reproduce:
 *   1. On pre-production open Accounting > Customers > Credit Notes, clear default
 *      filters and apply "Created on is before the day after <CUTOFF>" custom filter;
 *      read the pager total
 *   2. Group By > Status and write down the count per status
 *   3. Write down 3 credit note numbers
 *   4. Repeat steps 1-2 on crm-mig under Invoicing > Customers > Credit Notes
 *   5. On crm-mig search each of the 3 credit note numbers
 *
 * Verification Points:
 *   1. Both servers return a credit-note total for the window and the two totals are equal
 *   2. The per-status breakdown matches row for row
 *   3. All 3 credit note numbers are found on crm-mig, one record each
 *
 * READ-ONLY: this spec only reads invoice records via MigDataParityPage. It creates,
 * modifies and deletes nothing, as required on crm-mig.
 *
 * NOTE: Invoice IDs are re-sequenced on crm-mig, so joins use the 'number' field
 * (the natural key). Credit notes are identified by type='out_refund' (sales refund).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_5\.1\.3:" --project=chromium
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

test.describe('CRM-12653 Part 5.1.3 - Credit notes counted separately', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12653_5.1.3: Customer credit notes counted separately; counts and status breakdown match source', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let sourceContext: BrowserContext | null = null;
    let targetContext: BrowserContext | null = null;

    try {
      console.log('========== CRM-12653_5.1.3 - Credit Notes Counted Separately ==========');

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

      // Track results
      let sourceCreditNotesTotal = 0;
      let targetCreditNotesTotal = 0;
      const sourceStatusCounts = new Map<string, number>();
      const targetStatusCounts = new Map<string, number>();
      const sampledNumbers: string[] = [];
      const notFoundOnTarget: string[] = [];

      // Step 1-2: Count and group by status on source
      await test.step('Step 1-2: On source count credit notes and group by status', async () => {
        console.log('\n--- Step 1-2: Count credit notes on source and group by status ---');

        const creditNoteDomain = [
          ...MigDataParityPage.onOrBeforeCutoff(cutoff),
          ['type', '=', 'out_refund'],
        ];

        // Count total
        sourceCreditNotesTotal = await sourceParityPage.searchCount('account.invoice', creditNoteDomain);
        console.log(`  Source credit notes total (on/before ${cutoff}): ${sourceCreditNotesTotal}`);
        expect(sourceCreditNotesTotal, 'source has no credit notes to compare against - either the filter is wrong or the source session failed silently').toBeGreaterThan(0);

        // Group by state
        const statusGroups = await sourceParityPage.countByField('account.invoice', creditNoteDomain, 'state');
        statusGroups.forEach((count, status) => {
          sourceStatusCounts.set(status, count);
          console.log(`    - Status "${status}": ${count}`);
        });
      });

      // Step 3: Sample 3 credit note numbers from source
      await test.step('Step 3: Sample 3 credit note numbers from source', async () => {
        console.log('\n--- Step 3: Sample 3 credit note numbers from source ---');

        const creditNoteDomain = [
          ...MigDataParityPage.onOrBeforeCutoff(cutoff),
          ['type', '=', 'out_refund'],
        ];

        // Get 3 credit notes by create_date ascending
        const sample = await sourceParityPage.searchRead(
          'account.invoice',
          creditNoteDomain,
          ['number'],
          { limit: 3, order: 'create_date asc' }
        );

        sample.forEach((cn: any) => {
          sampledNumbers.push(cn.number);
        });

        console.log(`  Sampled ${sampledNumbers.length} credit note numbers from source:`);
        sampledNumbers.forEach((num, i) => {
          console.log(`    [${i + 1}] ${num}`);
        });
      });

      // Step 4: Count and group by status on target
      await test.step('Step 4: On target count credit notes and group by status', async () => {
        console.log('\n--- Step 4: Count credit notes on target and group by status ---');

        const creditNoteDomain = [
          ...MigDataParityPage.onOrBeforeCutoff(cutoff),
          ['type', '=', 'out_refund'],
        ];

        // Count total
        targetCreditNotesTotal = await targetParityPage.searchCount('account.invoice', creditNoteDomain);
        console.log(`  Target credit notes total (on/before ${cutoff}): ${targetCreditNotesTotal}`);

        // Group by state
        const statusGroups = await targetParityPage.countByField('account.invoice', creditNoteDomain, 'state');
        statusGroups.forEach((count, status) => {
          targetStatusCounts.set(status, count);
          console.log(`    - Status "${status}": ${count}`);
        });
      });

      // Step 5: Search each sampled credit note number on target
      await test.step('Step 5: Search each sampled credit note number on target', async () => {
        console.log('\n--- Step 5: Search each sampled credit note number on target ---');

        for (const creditNoteNumber of sampledNumbers) {
          const creditNoteDomain = [
            ...MigDataParityPage.onOrBeforeCutoff(cutoff),
            ['type', '=', 'out_refund'],
            ['number', '=', creditNoteNumber],
          ];

          const results = await targetParityPage.searchRead(
            'account.invoice',
            creditNoteDomain,
            ['number'],
            { limit: 1 }
          );

          if (results.length === 0) {
            console.log(`  ✗ Not found on target: ${creditNoteNumber}`);
            notFoundOnTarget.push(creditNoteNumber);
          } else {
            console.log(`  ✓ Found on target: ${creditNoteNumber}`);
          }
        }
      });

      // Verification
      await test.step('Verification', async () => {
        const statusMismatches: string[] = [];

        // Check if all statuses match
        const allSourceStatuses = new Set(sourceStatusCounts.keys());
        const allTargetStatuses = new Set(targetStatusCounts.keys());

        allSourceStatuses.forEach((status) => {
          if (!allTargetStatuses.has(status)) {
            statusMismatches.push(`Status "${status}" on source missing on target`);
          } else if (sourceStatusCounts.get(status) !== targetStatusCounts.get(status)) {
            statusMismatches.push(`Status "${status}": source=${sourceStatusCounts.get(status)}, target=${targetStatusCounts.get(status)}`);
          }
        });

        allTargetStatuses.forEach((status) => {
          if (!allSourceStatuses.has(status)) {
            statusMismatches.push(`Status "${status}" on target missing on source`);
          }
        });

        console.log('\n==================== VERIFY ====================');
        console.log('  Verify #1 - Total credit note counts match:');
        console.log(`     Expected : source total = target total`);
        console.log(`     Actual   : source=${sourceCreditNotesTotal}, target=${targetCreditNotesTotal}`);
        console.log(`     Result   : ${sourceCreditNotesTotal === targetCreditNotesTotal ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #2 - Per-status breakdown matches:');
        console.log(`     Expected : identical status counts on both servers`);
        if (statusMismatches.length === 0) {
          console.log(`     Actual   : all statuses match`);
          console.log(`     Result   : PASS`);
        } else {
          console.log(`     Actual   : ${statusMismatches.join('; ')}`);
          console.log(`     Result   : FAIL`);
        }

        console.log('  Verify #3 - All sampled credit note numbers found on target:');
        console.log(`     Expected : all 3 sampled numbers found on target`);
        console.log(`     Actual   : ${sampledNumbers.length - notFoundOnTarget.length}/${sampledNumbers.length} found${notFoundOnTarget.length > 0 ? ` (missing: ${notFoundOnTarget.join(', ')})` : ''}`);
        console.log(`     Result   : ${notFoundOnTarget.length === 0 ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');

        const overallPass = sourceCreditNotesTotal === targetCreditNotesTotal && statusMismatches.length === 0 && notFoundOnTarget.length === 0;
        console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - credit notes counted separately with matching counts and status breakdown`);

        // Assert on the three verification points
        expect(sourceCreditNotesTotal, `credit note count mismatch: source=${sourceCreditNotesTotal}, target=${targetCreditNotesTotal}`).toBe(targetCreditNotesTotal);
        expect(statusMismatches, `per-status breakdown mismatch: ${statusMismatches.join('; ')}`).toHaveLength(0);
        expect(notFoundOnTarget, `sampled credit notes not found on target: ${notFoundOnTarget.join(', ')}`).toHaveLength(0);
      });

    } finally {
      if (sourceContext) await sourceContext.close();
      if (targetContext) await targetContext.close();
    }
  });
});
