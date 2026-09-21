import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653 Part 5.1.1 - Customer invoice count per status within the cut-off
 * Test Case ID: CRM-12653_5.1.1
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   The number of customer invoices per status created on or before the cut-off
 *   is the same on both servers (pre-production and crm-mig). Both Draft, Open,
 *   Paid and Cancelled statuses are verified.
 *
 * Source manual TC (master sheet tab "CRM-12653 Data Migration Sales", row 5.1.1):
 *   Component: The number of customer invoices per status created on or before
 *   the cut-off is the same on both servers.
 *
 * Pre-conditions:
 *   Two browser tabs open side by side:
 *   _ SOURCE = pre-production http://pre-production.nakivo.site/ , logged in as
 *     a CRM administrator (e.g. Anh Ho)
 *   _ TARGET = migration build https://crm-mig.nakivo.site/ , logged in as
 *     the migration QA administrator (admin_crm_mig)
 *   Developer mode is ON on both servers so "Add Custom Filter" and "Add Custom
 *   Group" expose technical fields
 *   <CUTOFF> = the migration cut-off date established in CRM-12653_1.1.2
 *   The post-cut-off target count for account.invoice from CRM-12653_1.1.4 is
 *   at hand
 *   NOTE: the Accounting app is called "Invoicing" on crm-mig (Odoo 12 Community)
 *   and "Accounting" on pre-production (Odoo 12 Enterprise) - the Customer
 *   Invoices list behind both is the same model.
 *   NOTE: crm-mig is READ-ONLY for QA - this case only READS. Do not create,
 *   edit, delete, log a note, send a message or upload a file on either server.
 *
 * Steps to reproduce:
 *   1. On pre-production open Accounting > Customers > Invoices and REMOVE every
 *      default filter so that draft, open, paid and cancelled invoices are all
 *      listed
 *   2. Filters > Add Custom Filter and set:
 *      _ Field = "Created on"
 *      _ Operator = "is before"
 *      _ Value = the day AFTER <CUTOFF>
 *      click "APPLY"
 *   3. Read the pager total and write it down as SOURCE_INVOICES
 *   4. Group By > Status and write down every status name with its count
 *   5. Repeat steps 1-4 on crm-mig under Invoicing > Customers > Invoices
 *   6. TARGET_INVOICES = the target total minus the post-cut-off invoices
 *      counted in CRM-12653_1.1.4
 *   7. Compare the totals and the per-status breakdowns
 *
 * Verification Points (expectedBulletCount: 6):
 *   1. Both servers return a total and a per-status breakdown; neither pager is
 *      blank
 *   2. TARGET_INVOICES equals SOURCE_INVOICES, difference = 0
 *   3. The set of status names is identical on both servers and the count
 *      matches for every status - Draft, Open, Paid and Cancelled are each
 *      compared on their own row
 *   4. The per-status counts add up to the total on their own server
 *   5. "Created on" is used rather than "Invoice Date" because a draft invoice
 *      has no invoice date - using the invoice date would silently drop every
 *      draft from one side of the comparison
 *   6. Any non-zero delta is recorded as an exception with the status it sits
 *      in, the absolute value and the percentage of SOURCE_INVOICES
 *
 * READ-ONLY: this spec only reads invoice records. It creates, modifies and
 * deletes nothing, as required on crm-mig.
 *
 * NOTE: Invoice IDs are re-sequenced on crm-mig, so id-based joins will fail.
 * The join strategy is on natural keys such as invoice number - but this spec
 * focuses on count aggregation by status, not individual record lookup.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_5\.1\.1:" --project=chromium
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

test.describe('CRM-12653 Part 5.1.1 - Invoice count per status', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12653_5.1.1: Customer invoice count per status matches source and target within cut-off', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let sourceContext: BrowserContext | null = null;
    let targetContext: BrowserContext | null = null;

    try {
      console.log('========== CRM-12653_5.1.1 - Customer Invoice Count per Status ==========');

      // Open target session first to resolve cut-off date
      let targetParityPage: MigDataParityPage | null = null;
      await test.step('Pre-condition: Open session on crm-mig (target)', async () => {
        console.log('\n--- Pre-condition: Open session on crm-mig (target) ---');
        console.log(`  Account : ${users.admin_crm_mig.username}`);
        console.log(`  Target  : ${baseUrl_mig}`);
        const session = await openSession(browser, baseUrl_mig, true, users.admin_crm_mig.username, users.admin_crm_mig.password);
        targetContext = session.context;
        targetParityPage = session.parity;

        const isAuth = await session.parity.isAuthenticatedSession();
        console.log(`  Authenticated: ${isAuth}`);
        expect(isAuth, 'target session not authenticated on crm-mig').toBe(true);
      });

      // Resolve cut-off from target
      const cutoff = await targetParityPage!.resolveCutoffDate();
      console.log(`\n--- Cut-off date resolved on target: ${cutoff} ---`);

      // Open source session
      let sourceParityPage: MigDataParityPage | null = null;
      await test.step('Pre-condition: Open session on pre-production (source)', async () => {
        console.log('\n--- Pre-condition: Open session on pre-production (source) ---');
        console.log(`  Account : ${users.admin_crm.username}`);
        console.log(`  Source  : ${baseUrl}`);
        const session = await openSession(browser, baseUrl, false, users.admin_crm.username, users.admin_crm.password);
        sourceContext = session.context;
        sourceParityPage = session.parity;

        const isAuth = await session.parity.isAuthenticatedSession();
        console.log(`  Authenticated: ${isAuth}`);
        expect(isAuth, 'source session not authenticated on pre-production').toBe(true);
      });

      // Step 1-3: Count total invoices on source (on or before cut-off)
      let sourceTotalCount = 0;
      let sourceByStatus: Map<string, number> = new Map();

      await test.step('Step 1-3: Read total invoice count on source (on or before cut-off)', async () => {
        console.log('\n--- Step 1-3: Count invoices on source within cut-off ---');

        const sourceDomain = MigDataParityPage.onOrBeforeCutoff(cutoff);
        sourceTotalCount = await sourceParityPage!.searchCount('account.invoice', sourceDomain);
        console.log(`  SOURCE_INVOICES (pre-production, on/before ${cutoff}): ${sourceTotalCount}`);
      });

      // Step 4: Get status distribution on source
      await test.step('Step 4: Read invoice status distribution on source', async () => {
        console.log('\n--- Step 4: Group by Status on source ---');

        const sourceDomain = MigDataParityPage.onOrBeforeCutoff(cutoff);
        sourceByStatus = await sourceParityPage!.countByField('account.invoice', sourceDomain, 'state');

        console.log('  Source invoice count by status:');
        sourceByStatus.forEach((count, status) => {
          console.log(`    ${status.padEnd(15)}: ${count}`);
        });
      });

      // Step 5: Count total invoices on target (on or before cut-off)
      let targetTotalCountRaw = 0;
      let targetByStatus: Map<string, number> = new Map();

      await test.step('Step 5: Read total invoice count on target (on or before cut-off)', async () => {
        console.log('\n--- Step 5: Count invoices on target within cut-off ---');

        const targetDomain = MigDataParityPage.onOrBeforeCutoff(cutoff);
        targetTotalCountRaw = await targetParityPage!.searchCount('account.invoice', targetDomain);
        console.log(`  TARGET_INVOICES_RAW (crm-mig, on/before ${cutoff}): ${targetTotalCountRaw}`);
      });

      // Step 5 (continued): Get status distribution on target
      await test.step('Step 5: Read invoice status distribution on target', async () => {
        console.log('\n--- Step 5 (continued): Group by Status on target ---');

        const targetDomain = MigDataParityPage.onOrBeforeCutoff(cutoff);
        targetByStatus = await targetParityPage!.countByField('account.invoice', targetDomain, 'state');

        console.log('  Target invoice count by status:');
        targetByStatus.forEach((count, status) => {
          console.log(`    ${status.padEnd(15)}: ${count}`);
        });
      });

      // Step 6: account for the post-cut-off records created locally on the migration build.
      // The manual TC subtracts them because a tester reads the RAW list total off the pager.
      // Here targetTotalCountRaw was ALREADY taken with onOrBeforeCutoff(), so those records are
      // excluded by construction - subtracting again would double-count. Instead, count them and
      // PROVE the exclusion, which is what step 6 is actually protecting against.
      let postCutoffInvoiceCount = 0;
      await test.step('Step 6: Account for post-cut-off invoices created on the migration build', async () => {
        console.log('\n--- Step 6: post-cut-off invoices on the target ---');
        postCutoffInvoiceCount = await targetParityPage!.searchCount(
          'account.invoice',
          MigDataParityPage.afterCutoff(cutoff),
        );
        const targetUnfiltered = await targetParityPage!.searchCount('account.invoice', [['id', '>', 0]]);
        console.log(`  Invoices created AFTER ${cutoff} on crm-mig : ${postCutoffInvoiceCount}`);
        console.log(`  Unfiltered target total                     : ${targetUnfiltered}`);
        console.log(`  Cut-off filtered total (used for parity)    : ${targetTotalCountRaw}`);
        console.log('  No subtraction is applied - the cut-off domain already excludes them.');
        // If these do not add up, the cut-off filter is not doing what the whole comparison assumes.
        expect(
          targetTotalCountRaw + postCutoffInvoiceCount,
          `cut-off filter is leaking: filtered (${targetTotalCountRaw}) + post-cut-off ` +
          `(${postCutoffInvoiceCount}) != unfiltered target total (${targetUnfiltered}). ` +
          'Every count comparison in CRM-12653 depends on this partition being exact.',
        ).toBe(targetUnfiltered);
      });
      const targetTotalCount = targetTotalCountRaw;

      // Step 7: Compare totals and per-status breakdown
      const statusMismatches: Array<{ status: string; source: number; target: number; delta: number; percentage: string }> = [];
      const allStatuses = new Set([...sourceByStatus.keys(), ...targetByStatus.keys()]);

      for (const status of allStatuses) {
        const srcCount = sourceByStatus.get(status) || 0;
        const tgtCount = targetByStatus.get(status) || 0;
        if (srcCount !== tgtCount) {
          const delta = Math.abs(tgtCount - srcCount);
          const percentage = sourceTotalCount > 0 ? ((delta / sourceTotalCount) * 100).toFixed(2) : '0.00';
          statusMismatches.push({
            status,
            source: srcCount,
            target: tgtCount,
            delta,
            percentage: `${percentage}%`,
          });
        }
      }

      // Verification step
      await test.step('Verification', async () => {
        const totalMatch = sourceTotalCount === targetTotalCount;
        const statusMatch = statusMismatches.length === 0;

        const statusSummary = Array.from(sourceByStatus.entries())
          .map(([status, count]) => `${status}(src:${count}/tgt:${targetByStatus.get(status) || 0})`)
          .join(', ');

        const mismatchSummary = statusMismatches.length > 0
          ? statusMismatches.map((m) => `${m.status}: src=${m.source} tgt=${m.target} delta=${m.delta}(${m.percentage})`).join('; ')
          : 'none';

        console.log('\n==================== VERIFY ====================');
        console.log('  Verify #1 - Both servers return total and per-status breakdown:');
        console.log(`     Expected : source total > 0 AND target total > 0 with status distribution`);
        console.log(`     Actual   : source=${sourceTotalCount}, target=${targetTotalCount}, statuses=${Array.from(sourceByStatus.keys()).join(',')}`);
        console.log(`     Result   : ${sourceTotalCount > 0 && targetTotalCount > 0 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #2 - Total invoice count matches (on/before cut-off):');
        console.log(`     Expected : TARGET_INVOICES = SOURCE_INVOICES (difference = 0)`);
        console.log(`     Actual   : source=${sourceTotalCount}, target=${targetTotalCount}, diff=${Math.abs(sourceTotalCount - targetTotalCount)}`);
        console.log(`     Result   : ${totalMatch ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #3 - Status names and counts identical on both servers:');
        console.log(`     Expected : same statuses (Draft, Open, Paid, Cancelled) with matching counts`);
        console.log(`     Actual   : ${statusSummary}`);
        const statusSetsMatch = sourceByStatus.size > 0 && targetByStatus.size > 0 && statusMismatches.length === 0;
        console.log(`     Result   : ${statusSetsMatch ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #4 - Per-status counts add up to total on own server:');
        const sourceSumStatus = Array.from(sourceByStatus.values()).reduce((a, b) => a + b, 0);
        const targetSumStatus = Array.from(targetByStatus.values()).reduce((a, b) => a + b, 0);
        console.log(`     Expected : source status sum = source total AND target status sum = target total`);
        console.log(`     Actual   : source=${sourceSumStatus} vs total=${sourceTotalCount}, target=${targetSumStatus} vs total=${targetTotalCount}`);
        console.log(`     Result   : ${sourceSumStatus === sourceTotalCount && targetSumStatus === targetTotalCount ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #5 - "Created on" filter used (not "Invoice Date"):');
        console.log(`     Expected : drafts included in count (they have no invoice date)`);
        console.log(`     Actual   : query uses create_date filter, domain: ${JSON.stringify(MigDataParityPage.onOrBeforeCutoff(cutoff))}`);
        console.log(`     Result   : PASS (by design - MigDataParityPage uses create_date)`);
        console.log('  Verify #6 - Non-zero deltas recorded as exceptions:');
        console.log(`     Expected : no mismatches or all mismatches documented`);
        console.log(`     Actual   : ${mismatchSummary}`);
        console.log(`     Result   : ${statusMismatches.length === 0 ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        const allChecksPassed = totalMatch && statusMatch && sourceTotalCount > 0 && targetTotalCount > 0 && sourceByStatus.size > 0 && targetByStatus.size > 0;
        console.log(`OVERALL: ${allChecksPassed ? 'PASS' : 'FAIL'} - customer invoice counts by status match source and target`);

        // Assertions corresponding to the 6 expected bullets
        expect(sourceTotalCount, 'source returned no invoices - check cut-off date').toBeGreaterThan(0);
        expect(targetTotalCount, 'target returned no invoices').toBeGreaterThan(0);
        expect(targetTotalCount, `total invoice count mismatch: source=${sourceTotalCount} vs target=${targetTotalCount}`).toBe(sourceTotalCount);
        expect(sourceByStatus.size, 'source returned no status groups').toBeGreaterThan(0);
        expect(targetByStatus.size, 'target returned no status groups').toBeGreaterThan(0);
        expect(statusMismatches.length, `per-status counts differ or status names do not match: ${mismatchSummary}`).toBe(0);
        expect(sourceSumStatus, 'source status counts do not add up to total').toBe(sourceTotalCount);
        expect(targetSumStatus, 'target status counts do not add up to total').toBe(targetTotalCount);
      });

    } finally {
      if (sourceContext) await sourceContext.close();
      if (targetContext) await targetContext.close();
    }
  });
});
