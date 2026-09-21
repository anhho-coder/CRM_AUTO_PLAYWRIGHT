import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653_5.1.2: Invoice numbers unique and continuous
 * Test Case ID: CRM-12653_5.1.2
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   Invoice numbers survive the migration unchanged, each appearing exactly once on the target.
 *   A number returning 0 results is a migration loss; a number returning 2+ records indicates
 *   the ETL ran twice (corruption).
 *
 * Source manual TC (CRM-12653 master, entry 5.1.2):
 *
 * Pre-conditions:
 *   Two browser tabs open side by side:
 *   - SOURCE = pre-production http://pre-production.nakivo.site/ , logged in as CRM administrator
 *   - TARGET = migration build https://crm-mig.nakivo.site/ , logged in as admin_crm_mig
 *   <CUTOFF> = the migration cut-off date established in CRM-12653_1.1.2
 *
 * Steps:
 *   1. On pre-production open the cut-off filtered Customer Invoices list, sort by "Number" ASCENDING
 *      and write down the first invoice number
 *   2. Sort DESCENDING and write down the last invoice number
 *   3. Write down 5 invoice numbers spread across the window
 *   4. Repeat steps 1-2 on crm-mig and write down its first and last invoice number
 *   5. On crm-mig search each of the 5 invoice numbers in turn and read how many records each search returns
 *
 * Expected Results:
 *   1. The first invoice number in the window is the same on both servers, and so is the last
 *   2. The number is preserved by the migration and is the join key for invoices
 *   3. Each of the 5 searched numbers returns EXACTLY ONE record on crm-mig - not 0 and not 2
 *   4. A number returning 0 results is a migration loss
 *   5. A number returning 2+ records means the ETL ran twice (duplicate exception)
 *
 * READ-ONLY: this spec only reads account.invoice data via MigDataParityPage.searchRead.
 * It creates, modifies, deletes, or sends no messages on either server.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_5\.1\.2:" --project=chromium
 */

/**
 * Helper to open an authenticated session on either server (source or target).
 * Handles LoginPage vs LoginPageMig based on isMig flag.
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

test.describe('CRM-12653 Section 5 - Invoices', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('\nFAILURE REASON: ' + (testInfo.error?.message?.split('\n')[0] ?? 'unknown'));
    }
  });

  test('CRM-12653_5.1.2: Invoice numbers unique and continuous', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let sourceSession: { context: BrowserContext; parity: MigDataParityPage } | null = null;
    let targetSession: { context: BrowserContext; parity: MigDataParityPage } | null = null;

    try {
      console.log('========== CRM-12653_5.1.2 - Invoice numbers unique and continuous ==========');

      // Open target (crm-mig) session first to establish the cut-off
      await test.step('Pre-condition: Open target (crm-mig) session and establish cut-off date', async () => {
        console.log('\n--- Pre-condition: Open target (crm-mig) session ---');
        console.log(`  Account : ${users.admin_crm_mig.username}`);
        console.log(`  Target  : ${baseUrl_mig}`);
        targetSession = await openSession(
          browser, baseUrl_mig, true,
          users.admin_crm_mig.username, users.admin_crm_mig.password,
        );
        const isAuthTarget = await targetSession.parity.isAuthenticatedSession();
        expect(isAuthTarget, 'target (crm-mig) session is authenticated').toBe(true);
        console.log('  OK - logged in on crm-mig');
      });

      let cutoff = '';
      await test.step('Step 1: Resolve the migration cut-off date from target data', async () => {
        console.log('\n--- Step 1: Resolve cut-off date from target (crm-mig) ---');
        cutoff = await targetSession!.parity.resolveCutoffDate();
        console.log(`  Cut-off date resolved: ${cutoff}`);
      });

      // Open source (pre-production) session
      await test.step('Step 2: Open source (pre-production) session', async () => {
        console.log('\n--- Step 2: Open source (pre-production) session ---');
        console.log(`  Account : ${users.admin_crm.username}`);
        console.log(`  Source  : ${baseUrl}`);
        sourceSession = await openSession(
          browser, baseUrl, false,
          users.admin_crm.username, users.admin_crm.password,
        );
        const isAuthSource = await sourceSession.parity.isAuthenticatedSession();
        expect(isAuthSource, 'source (pre-production) session is authenticated').toBe(true);
        console.log('  OK - logged in on pre-production');
      });

      // Build the cut-off domain (uses create_date by default, the migration snapshot point)
      const cutoffDomain = MigDataParityPage.onOrBeforeCutoff(cutoff);

      // Step 3: Read first and last invoice numbers on source
      let sourceFirstNumber: string | null = null;
      let sourceLastNumber: string | null = null;

      await test.step('Step 3: Read first and last invoice numbers on source (pre-production)', async () => {
        console.log('\n--- Step 3: Read first invoice number on source (ascending) ---');
        const firstInvoices = await sourceSession!.parity.searchRead<{ number: string }>(
          'account.invoice',
          cutoffDomain,
          ['number'],
          { limit: 1, order: 'number asc' },
        );
        sourceFirstNumber = firstInvoices.length > 0 ? firstInvoices[0].number : null;
        console.log(`  First invoice number (source): ${sourceFirstNumber || '(none)'}`);
        expect(sourceFirstNumber, 'source (pre-production) has at least one invoice within cut-off').toBeTruthy();

        console.log('\n--- Step 3b: Read last invoice number on source (descending) ---');
        const lastInvoices = await sourceSession!.parity.searchRead<{ number: string }>(
          'account.invoice',
          cutoffDomain,
          ['number'],
          { limit: 1, order: 'number desc' },
        );
        sourceLastNumber = lastInvoices.length > 0 ? lastInvoices[0].number : null;
        console.log(`  Last invoice number (source): ${sourceLastNumber || '(none)'}`);
        expect(sourceLastNumber, 'source (pre-production) reads last invoice number successfully').toBeTruthy();
      });

      // Step 4: Read first and last invoice numbers on target
      let targetFirstNumber: string | null = null;
      let targetLastNumber: string | null = null;

      await test.step('Step 4: Read first and last invoice numbers on target (crm-mig)', async () => {
        console.log('\n--- Step 4: Read first invoice number on target (ascending) ---');
        const firstInvoices = await targetSession!.parity.searchRead<{ number: string }>(
          'account.invoice',
          cutoffDomain,
          ['number'],
          { limit: 1, order: 'number asc' },
        );
        targetFirstNumber = firstInvoices.length > 0 ? firstInvoices[0].number : null;
        console.log(`  First invoice number (target): ${targetFirstNumber || '(none)'}`);

        console.log('\n--- Step 4b: Read last invoice number on target (descending) ---');
        const lastInvoices = await targetSession!.parity.searchRead<{ number: string }>(
          'account.invoice',
          cutoffDomain,
          ['number'],
          { limit: 1, order: 'number desc' },
        );
        targetLastNumber = lastInvoices.length > 0 ? lastInvoices[0].number : null;
        console.log(`  Last invoice number (target): ${targetLastNumber || '(none)'}`);
      });

      // Step 5: Sample 5 invoice numbers spread across the window
      let sampleNumbers: string[] = [];

      await test.step('Step 5: Build deterministic sample of 5 invoice numbers', async () => {
        console.log('\n--- Step 5: Build sample of 5 invoice numbers (3 earliest + 2 latest) ---');
        // Get first 3 by ascending order
        const first3 = await sourceSession!.parity.searchRead<{ number: string }>(
          'account.invoice',
          cutoffDomain,
          ['number'],
          { limit: 3, order: 'number asc' },
        );
        const first3Numbers = first3.map((r) => r.number);

        // Get last 2 by descending order
        const last2 = await sourceSession!.parity.searchRead<{ number: string }>(
          'account.invoice',
          cutoffDomain,
          ['number'],
          { limit: 2, order: 'number desc' },
        );
        const last2Numbers = last2.map((r) => r.number);

        sampleNumbers = [...first3Numbers, ...last2Numbers];
        console.log(`  Sample invoice numbers: ${sampleNumbers.join(', ')}`);
      });

      // Step 6: Verify each sample number returns exactly 1 record on target
      const duplicateNumbers: { number: string; count: number }[] = [];
      const missingNumbers: string[] = [];
      const uniqueNumbers: string[] = [];

      await test.step('Step 6: Search each sample number on target and verify count', async () => {
        console.log('\n--- Step 6: Search each sample number on target (crm-mig) ---');
        for (const invNumber of sampleNumbers) {
          const results = await targetSession!.parity.searchRead<{ number: string }>(
            'account.invoice',
            [['number', '=', invNumber]],
            ['number'],
            { limit: MigDataParityPage.MAX_LIMIT },
          );
          const count = results.length;
          console.log(`  Invoice ${invNumber}: ${count} record(s)`);

          if (count === 0) {
            missingNumbers.push(invNumber);
          } else if (count === 1) {
            uniqueNumbers.push(invNumber);
          } else if (count > 1) {
            duplicateNumbers.push({ number: invNumber, count });
          }
        }
      });

      // Verification block
      await test.step('Verification', async () => {
        console.log('\n==================== VERIFY ====================');
        console.log('  Verify #1 - First invoice number matches:');
        console.log(`     Expected : ${sourceFirstNumber}`);
        console.log(`     Actual   : ${targetFirstNumber}`);
        console.log(`     Result   : ${sourceFirstNumber === targetFirstNumber ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #2 - Last invoice number matches:');
        console.log(`     Expected : ${sourceLastNumber}`);
        console.log(`     Actual   : ${targetLastNumber}`);
        console.log(`     Result   : ${sourceLastNumber === targetLastNumber ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #3 - 5 sampled numbers each return exactly 1 record:');
        console.log(`     Expected : 5 of 5 unique (count = 1)`);
        console.log(`     Actual   : ${uniqueNumbers.length} unique, ${missingNumbers.length} missing, ${duplicateNumbers.length} duplicates`);
        console.log(`     Result   : ${uniqueNumbers.length === 5 && missingNumbers.length === 0 && duplicateNumbers.length === 0 ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #4 - No migration losses (0 results):');
        console.log(`     Expected : 0 missing`);
        console.log(`     Actual   : ${missingNumbers.length}${missingNumbers.length > 0 ? ` - [${missingNumbers.join(', ')}]` : ''}`);
        console.log(`     Result   : ${missingNumbers.length === 0 ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #5 - No duplicate ETL runs (2+ results):');
        console.log(`     Expected : 0 duplicates`);
        const dupList = duplicateNumbers.map((d) => `${d.number}(${d.count})`).join(', ');
        console.log(`     Actual   : ${duplicateNumbers.length}${duplicateNumbers.length > 0 ? ` - [${dupList}]` : ''}`);
        console.log(`     Result   : ${duplicateNumbers.length === 0 ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');

        // Expectations - one per bullet from expectedBulletCount = 5
        // (source readability already guarded at point of read)
        expect(targetFirstNumber, 'first invoice number on target matches source').toBe(sourceFirstNumber);
        expect(targetLastNumber, 'last invoice number on target matches source').toBe(sourceLastNumber);
        expect(uniqueNumbers, 'all 5 sampled invoice numbers return exactly 1 record each on target').toHaveLength(5);
        expect(missingNumbers, 'no sampled invoice numbers return 0 results (no losses)').toHaveLength(0);
        expect(duplicateNumbers, 'no sampled invoice numbers return 2+ results (no duplicates)').toHaveLength(0);
      });

    } finally {
      // Close both sessions
      if (sourceSession) await sourceSession.context.close();
      if (targetSession) await targetSession.context.close();
    }
  });
});
