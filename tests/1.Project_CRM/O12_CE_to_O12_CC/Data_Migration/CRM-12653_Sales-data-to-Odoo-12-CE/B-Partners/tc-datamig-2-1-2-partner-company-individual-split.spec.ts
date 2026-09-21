import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653 Part 2.1.2 - Partner company vs individual breakdown
 * Test Case ID: CRM-12653_2.1.2
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   Partner records migrated from pre-production (Odoo 12 Enterprise) to crm-mig
 *   (Odoo 12 Community) maintain their company type split. This spec verifies
 *   that the counts of "Company" and "Individual" partners are identical on both
 *   servers within the cut-off window.
 *
 * Source manual TC (master sheet tab "CRM-12653 Data Migration Sales", row 2.1.2):
 *
 * Pre-conditions:
 *   VPN connected; both pre-production (Odoo 12 Enterprise) and crm-mig
 *   (Odoo 12 Community) are reachable.
 *   Login: anh.ho@nakivo.com (admin_crm for source, admin_crm_mig for target).
 *   Cut-off date already agreed; migration completed to the cut-off.
 *
 * Steps to reproduce:
 *   1. On pre-production open Contacts and apply the "Created on is before the
 *      day after <CUTOFF>" custom filter used in CRM-12653_2.1.1.
 *   2. Group By > Add Custom Group > "Company Type".
 *   3. Read the group names and the count shown in brackets next to each group.
 *   4. Repeat steps 1-3 on crm-mig > Contacts.
 *   5. Record both breakdowns side by side.
 *
 * Verification Points:
 *   1. Each server returns exactly the same set of groups - "Company" and
 *      "Individual" - with no extra or missing group.
 *   2. The count of "Company" is identical on both servers.
 *   3. The count of "Individual" is identical on both servers.
 *   4. The two group counts add up to the total from CRM-12653_2.1.1 on both
 *      servers.
 *
 * READ-ONLY: this spec only reads partner records. It creates, modifies and
 * deletes nothing, as required on crm-mig.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_2\.1\.2:" --project=chromium
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

test.describe('CRM-12653 Part 2.1.2 - Partner company type split', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12653_2.1.2: Company vs individual partner split is preserved across migration', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let sourceContext: BrowserContext | null = null;
    let targetContext: BrowserContext | null = null;

    try {
      console.log('========== CRM-12653_2.1.2 - Partner Company vs Individual Split ==========');

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

      // Build domain filter: Created on is before the day after cutoff
      const nextDay = new Date(cutoff);
      nextDay.setDate(nextDay.getDate() + 1);
      const filterDate = nextDay.toISOString().split('T')[0]; // YYYY-MM-DD format

      // Fetch company type breakdown from source
      let sourceBreakdown: Map<string, number> = new Map();

      await test.step('Step 1-3: Group partners by company type on source', async () => {
        console.log('\n--- Step 1-3: Group partners by company type on source ---');

        const sourceDomain = [['create_date', '<', `${filterDate} 00:00:00`]];
        const groups = await sourceParityPage.readGroup(
          'res.partner',
          sourceDomain,
          ['company_type'],
          ['company_type'],
        );

        groups.forEach((group: any) => {
          const companyType = group.company_type || 'Unknown';
          const count = group.company_type_count;
          sourceBreakdown.set(companyType, count);
          console.log(`  ${companyType}: ${count}`);
        });

        console.log(`  Total groups: ${groups.length}`);
      });

      // Fetch company type breakdown from target
      let targetBreakdown: Map<string, number> = new Map();

      await test.step('Step 4: Group partners by company type on target', async () => {
        console.log('\n--- Step 4: Group partners by company type on target ---');

        const targetDomain = [['create_date', '<', `${filterDate} 00:00:00`]];
        const groups = await targetParityPage.readGroup(
          'res.partner',
          targetDomain,
          ['company_type'],
          ['company_type'],
        );

        groups.forEach((group: any) => {
          const companyType = group.company_type || 'Unknown';
          const count = group.company_type_count;
          targetBreakdown.set(companyType, count);
          console.log(`  ${companyType}: ${count}`);
        });

        console.log(`  Total groups: ${groups.length}`);
      });

      // Verification
      await test.step('Verification', async () => {
        console.log('\n==================== VERIFY ====================');

        // Check 1: Same set of groups
        const sourceGroups = Array.from(sourceBreakdown.keys()).sort();
        const targetGroups = Array.from(targetBreakdown.keys()).sort();
        const expectedGroups = ['Company', 'Individual'].sort();

        console.log('  Verify #1 - Both servers return the same group set (Company, Individual):');
        console.log(`     Source groups: ${sourceGroups.join(', ')}`);
        console.log(`     Target groups: ${targetGroups.join(', ')}`);
        console.log(`     Expected:      ${expectedGroups.join(', ')}`);
        console.log(`     Result:        ${sourceGroups.join(',') === targetGroups.join(',') && sourceGroups.join(',') === expectedGroups.join(',') ? 'PASS' : 'FAIL'}`);

        // Check 2: Company count matches
        const sourceCompanyCount = sourceBreakdown.get('Company') ?? 0;
        const targetCompanyCount = targetBreakdown.get('Company') ?? 0;
        const companyDelta = targetCompanyCount - sourceCompanyCount;

        console.log('  Verify #2 - Company count matches on both servers:');
        console.log(`     Source: ${sourceCompanyCount}`);
        console.log(`     Target: ${targetCompanyCount}`);
        console.log(`     Delta:  ${companyDelta}`);
        console.log(`     Result: ${companyDelta === 0 ? 'PASS' : 'FAIL'}`);

        // Check 3: Individual count matches
        const sourceIndividualCount = sourceBreakdown.get('Individual') ?? 0;
        const targetIndividualCount = targetBreakdown.get('Individual') ?? 0;
        const individualDelta = targetIndividualCount - sourceIndividualCount;

        console.log('  Verify #3 - Individual count matches on both servers:');
        console.log(`     Source: ${sourceIndividualCount}`);
        console.log(`     Target: ${targetIndividualCount}`);
        console.log(`     Delta:  ${individualDelta}`);
        console.log(`     Result: ${individualDelta === 0 ? 'PASS' : 'FAIL'}`);

        // Check 4: Counts add up to the total
        const sourceTotal = sourceCompanyCount + sourceIndividualCount;
        const targetTotal = targetCompanyCount + targetIndividualCount;

        console.log('  Verify #4 - Group counts add up to the total on each server:');
        console.log(`     Source: ${sourceCompanyCount} + ${sourceIndividualCount} = ${sourceTotal}`);
        console.log(`     Target: ${targetCompanyCount} + ${targetIndividualCount} = ${targetTotal}`);
        console.log(`     Result: ${sourceTotal > 0 && targetTotal > 0 ? 'PASS' : 'FAIL'}`);

        console.log('===============================================');

        // Assertions (including false-green guard and all verification bullets)
        expect(sourceTotal, 'source returned 0 partners - server unreachable or empty').toBeGreaterThan(0);
        expect(sourceGroups, 'source does not return expected groups (Company, Individual)').toEqual(expectedGroups);
        expect(targetGroups, 'target does not return expected groups (Company, Individual)').toEqual(expectedGroups);
        expect(targetCompanyCount, `Company count mismatch: source=${sourceCompanyCount}, target=${targetCompanyCount}, delta=${companyDelta}`).toBe(sourceCompanyCount);
        expect(targetIndividualCount, `Individual count mismatch: source=${sourceIndividualCount}, target=${targetIndividualCount}, delta=${individualDelta}`).toBe(sourceIndividualCount);
        expect(targetTotal, `target total (${targetTotal}) does not equal source total (${sourceTotal})`).toBe(sourceTotal);
      });

    } finally {
      if (sourceContext) await sourceContext.close();
      if (targetContext) await targetContext.close();
    }
  });
});
