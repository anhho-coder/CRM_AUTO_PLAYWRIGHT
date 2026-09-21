import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653 - Data Migration - Sales data to Odoo 12 CE (QA)
 * Test Case ID: CRM-12653_2.1.3
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   Archived partners that were created before the migration cut-off on pre-production
 *   remain archived after migration to crm-mig, and do not appear in active partner lists.
 *
 * Source manual TC (master tab "CRM-12653_Data Migration - Sales data to Odoo 12 CE", row 2.1.3):
 *   Verifies that archived partners migrated correctly and remain archived on the target,
 *   not reverting to active status. Samples 3 archived partners created before the cut-off,
 *   verifies they are found on the target while the Archived filter is active, and verifies
 *   they are NOT found when the Archived filter is removed.
 *
 * Verification Points:
 *   1. Both servers report the same count of archived partners created before the cut-off.
 *   2. All 3 sampled archived partners are found on crm-mig with the Archived filter active.
 *   3. None of the 3 sampled archived partners are found on crm-mig when the Archived filter
 *      is removed - they do not appear in active partner lists.
 *   4. Exception tracking for defects: archived partners appearing as active or missing entirely.
 *
 * READ-ONLY: this spec only reads data via MigDataParityPage.readKw. No creation, modification,
 * deletion, or state changes are made on either server.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_2\.1\.3:" --project=chromium
 */

/** Session opener for both servers. */
async function openSession(
  browser: Browser,
  url: string,
  isMig: boolean,
  username: string,
  password: string,
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

test.describe('CRM-12653_2.1.3 - Archived partners migration verification', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12653_2.1.3: Archived partners remain archived after migration to Odoo 12 CE', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let targetContext: BrowserContext | null = null;
    let sourceContext: BrowserContext | null = null;
    let cutoffDate = '';
    let sourceArchiveCount = 0;
    let targetArchiveCount = 0;
    const sampledPartnerNames: string[] = [];
    const foundWithArchivedOn: Map<string, boolean> = new Map();
    const foundWithArchivedOff: Map<string, boolean> = new Map();
    const notMigratedPartners: string[] = [];

    try {
      console.log('========== CRM-12653_2.1.3 - Archived partners remain archived after migration ==========');

      await test.step('Pre-condition: Open TARGET session (crm-mig) and resolve cut-off date', async () => {
        console.log('\n--- Pre-condition: Open TARGET session and resolve cut-off date ---');
        const targetSession = await openSession(
          browser,
          baseUrl_mig,
          true,
          users.admin_crm_mig.username,
          users.admin_crm_mig.password,
        );
        if (targetContext) await targetContext.close();
        targetContext = targetSession.context;
        const targetParity = targetSession.parity;

        // Verify authentication
        const isAuthenticated = await targetParity.isAuthenticatedSession();
        console.log(`  Target URL     : ${baseUrl_mig}`);
        console.log(`  Account        : ${users.admin_crm_mig.username}`);
        console.log(`  Authenticated  : ${isAuthenticated ? 'YES' : 'NO'}`);
        expect(isAuthenticated, 'failed to authenticate on crm-mig').toBe(true);

        // Resolve cut-off date from TARGET
        cutoffDate = await targetParity.resolveCutoffDate();
        console.log(`  Cut-off date   : ${cutoffDate}`);
      });

      await test.step('Pre-condition: Open SOURCE session (pre-production)', async () => {
        console.log('\n--- Pre-condition: Open SOURCE session (pre-production) ---');
        const sourceSession = await openSession(
          browser,
          baseUrl,
          false,
          users.admin_crm.username,
          users.admin_crm.password,
        );
        if (sourceContext) await sourceContext.close();
        sourceContext = sourceSession.context;

        // Verify authentication
        const isAuthenticated = await sourceSession.parity.isAuthenticatedSession();
        console.log(`  Source URL     : ${baseUrl}`);
        console.log(`  Account        : ${users.admin_crm.username}`);
        console.log(`  Authenticated  : ${isAuthenticated ? 'YES' : 'NO'}`);
        expect(isAuthenticated, 'failed to authenticate on pre-production').toBe(true);
      });

      await test.step('Step 1: Count archived partners on pre-production before the cut-off', async () => {
        console.log('\n--- Step 1: Count archived partners on pre-production before the cut-off ---');
        const sourceSession = await openSession(
          browser,
          baseUrl,
          false,
          users.admin_crm.username,
          users.admin_crm.password,
        );
        const sourceParity = sourceSession.parity;

        try {
          // Domain: active = False, create_date < cutoff_date + 1 day
          const archivedDomain = MigDataParityPage.onOrBeforeCutoff(cutoffDate, 'create_date');
          archivedDomain.push(['active', '=', false]);

          sourceArchiveCount = await sourceParity.searchCount('res.partner', archivedDomain);
          console.log(`  Archived partners count on pre-production: ${sourceArchiveCount}`);
        } finally {
          await sourceSession.context.close();
        }
      });

      await test.step('Step 2 & 3: Count archived partners on crm-mig and sample 3 names', async () => {
        console.log('\n--- Step 2 & 3: Count archived partners on crm-mig and sample 3 names ---');

        // Reopen target session for data reads
        const targetSession = await openSession(
          browser,
          baseUrl_mig,
          true,
          users.admin_crm_mig.username,
          users.admin_crm_mig.password,
        );
        if (targetContext) await targetContext.close();
        targetContext = targetSession.context;

        const archivedDomain = MigDataParityPage.onOrBeforeCutoff(cutoffDate, 'create_date');
        archivedDomain.push(['active', '=', false]);

        targetArchiveCount = await targetSession.parity.searchCount('res.partner', archivedDomain);
        console.log(`  Archived partners count on crm-mig: ${targetArchiveCount}`);

        // Sample 3 archived partners from SOURCE
        console.log('\n  Sampling 3 archived partners from pre-production...');
        const sourceSession = await openSession(
          browser,
          baseUrl,
          false,
          users.admin_crm.username,
          users.admin_crm.password,
        );

        try {
          const sourceDomain = MigDataParityPage.onOrBeforeCutoff(cutoffDate, 'create_date');
          sourceDomain.push(['active', '=', false]);

          const samples = await sourceSession.parity.searchRead<{ name: string; email: string }>(
            'res.partner',
            sourceDomain,
            ['name', 'email'],
            { limit: 3 },
          );

          for (const sample of samples) {
            sampledPartnerNames.push(sample.name);
            console.log(`    - ${sample.name} (${sample.email})`);
          }
        } finally {
          await sourceSession.context.close();
        }
      });

      await test.step('Step 4: Search sampled partners on crm-mig with Archived filter ON', async () => {
        console.log('\n--- Step 4: Search sampled partners on crm-mig with Archived filter ON ---');

        const targetSession = await openSession(
          browser,
          baseUrl_mig,
          true,
          users.admin_crm_mig.username,
          users.admin_crm_mig.password,
        );
        if (targetContext) await targetContext.close();
        targetContext = targetSession.context;

        for (const partnerName of sampledPartnerNames) {
          // Search with active = False (Archived filter ON)
          const results = await targetSession.parity.searchRead<{ name: string }>(
            'res.partner',
            [['name', '=', partnerName], ['active', '=', false]],
            ['name'],
            { limit: 10 },
          );

          const found = results.length > 0;
          foundWithArchivedOn.set(partnerName, found);
          console.log(`    ${partnerName}: ${found ? 'FOUND' : 'NOT FOUND'} (with Archived=ON)`);

          if (!found) {
            notMigratedPartners.push(partnerName);
          }
        }
      });

      await test.step('Step 5: Search sampled partners on crm-mig with Archived filter OFF', async () => {
        console.log('\n--- Step 5: Search sampled partners on crm-mig with Archived filter OFF ---');

        const targetSession = await openSession(
          browser,
          baseUrl_mig,
          true,
          users.admin_crm_mig.username,
          users.admin_crm_mig.password,
        );
        if (targetContext) await targetContext.close();
        targetContext = targetSession.context;

        for (const partnerName of sampledPartnerNames) {
          // Search without active filter (Archived filter OFF, so only active records)
          // Actually, we search with active = True to exclude archived records
          const results = await targetSession.parity.searchRead<{ name: string; active: boolean }>(
            'res.partner',
            [['name', '=', partnerName], ['active', '=', true]],
            ['name', 'active'],
            { limit: 10 },
          );

          const found = results.length > 0;
          foundWithArchivedOff.set(partnerName, found);
          console.log(`    ${partnerName}: ${found ? 'FOUND (DEFECT - should be archived)' : 'NOT FOUND (correct)'}`);
        }
      });

      await test.step('Verification', async () => {
        console.log('\n==================== VERIFY ====================');

        // Verify #1: Counts are equal
        console.log('  Verify #1 - Archived partner counts are equal on both servers:');
        console.log(`     Expected : ${sourceArchiveCount} (pre-production)`);
        console.log(`     Actual   : ${targetArchiveCount} (crm-mig)`);
        console.log(`     Result   : ${sourceArchiveCount === targetArchiveCount ? 'PASS' : 'FAIL'}`);

        // Verify #2: All 3 sampled partners found with Archived ON
        const foundWithArchivedOnCount = Array.from(foundWithArchivedOn.values()).filter(v => v).length;
        console.log('  Verify #2 - All 3 sampled partners found on crm-mig with Archived filter ON:');
        console.log(`     Expected : 3 partners found`);
        console.log(`     Actual   : ${foundWithArchivedOnCount} partners found`);
        console.log(`     Result   : ${foundWithArchivedOnCount === 3 ? 'PASS' : 'FAIL'}`);

        // Verify #3: No sampled partners found with Archived OFF
        const foundWithArchivedOffCount = Array.from(foundWithArchivedOff.values()).filter(v => v).length;
        console.log('  Verify #3 - Sampled partners NOT found on crm-mig with Archived filter OFF:');
        console.log(`     Expected : 0 partners found (all remain archived)`);
        console.log(`     Actual   : ${foundWithArchivedOffCount} partners found`);
        console.log(`     Result   : ${foundWithArchivedOffCount === 0 ? 'PASS' : 'FAIL'}`);

        // Verify #4: Exception summary
        console.log('  Verify #4 - Defects and exceptions:');
        if (notMigratedPartners.length > 0) {
          console.log(`     NOT MIGRATED: ${notMigratedPartners.join(', ')}`);
        }
        const defectPartners = Array.from(foundWithArchivedOff.entries())
          .filter(([_, found]) => found)
          .map(([name, _]) => name);
        if (defectPartners.length > 0) {
          console.log(`     APPEARS AS ACTIVE (lost archive flag): ${defectPartners.join(', ')}`);
        }
        if (notMigratedPartners.length === 0 && defectPartners.length === 0) {
          console.log('     NONE - all archived partners preserved correctly');
        }

        console.log('===============================================');
        const allPass = sourceArchiveCount === targetArchiveCount &&
                        foundWithArchivedOnCount === 3 &&
                        foundWithArchivedOffCount === 0;
        console.log(`OVERALL: ${allPass ? 'PASS' : 'FAIL'}`);

        // Assertions
        expect(sourceArchiveCount, 'no archived partners found to verify - query returned 0').toBeGreaterThan(0);
        expect(targetArchiveCount, 'archived partner counts do not match between pre-production and crm-mig').toBe(sourceArchiveCount);
        expect(foundWithArchivedOnCount, 'not all 3 sampled partners were found on crm-mig with Archived filter ON').toBe(3);
        expect(foundWithArchivedOffCount, 'sampled partners should not appear in active list - they lost their archived flag on crm-mig').toBe(0);
      });

    } finally {
      if (targetContext) await targetContext.close();
      if (sourceContext) await sourceContext.close();
    }
  });
});
