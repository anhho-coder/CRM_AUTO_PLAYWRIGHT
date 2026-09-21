import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653_3.2.2 - Stored computed revenue not carried stale
 * Test Case ID: CRM-12653_3.2.2
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   A stored computed revenue field on the lead shows the value implied by the records
 *   that exist on the target, not a value copied from the source. On crm-mig the
 *   "Lifetime Revenue" must equal the sum of invoices that actually exist on crm-mig
 *   for that opportunity, not the source figure.
 *
 * Source manual TC (master tab "CRM-12653 Data Migration - Sales data to Odoo 12 CE", row 317):
 *
 * Pre-conditions:
 *   Two browser tabs open side by side:
 *   - SOURCE = pre-production http://pre-production.nakivo.site/, logged in as CRM admin
 *   - TARGET = migration build https://crm-mig.nakivo.site/, logged in as admin_crm_mig
 *   Developer mode is ON on both servers
 *   <CUTOFF> = the migration cut-off date from CRM-12653_1.1.2
 *   From the CRM-12653_3.2.1 sample, pick the 3 opportunities that have at least one Deal Element
 *
 * Steps to reproduce:
 *   1. On pre-production open each of the 3 opportunities and write down: opportunity name,
 *      "Lifetime Revenue", Deal Element number(s) reached from the "DEAL ELEMENT" button
 *   2. On crm-mig open the same 3 opportunities by name and read "Lifetime Revenue"
 *   3. On crm-mig open each opportunity's Deal Element and then its invoices, and add up
 *      the invoiced amounts that actually exist on crm-mig
 *   4. Compare the crm-mig "Lifetime Revenue" against the sum computed in step 3
 *
 * Verification Points:
 *   1. On crm-mig the "Lifetime Revenue" equals the sum of the invoices that exist ON crm-mig
 *      for that opportunity
 *   2. A target value that equals the SOURCE figure while the target holds fewer invoices
 *      means the stored field was copied instead of recomputed
 *
 * KNOWN DEFECT (2026-08-24 census): stored crm.lead "Lifetime Revenue" was transferred STALE
 * on crm-mig - it carried the source value rather than being recomputed from the migrated children.
 * Re-check it here and, if it still reproduces, record it once in the exception register naming
 * the 3 sampled opportunities and both figures per opportunity.
 *
 * READ-ONLY: this spec only reads from both servers via MigDataParityPage. It creates, modifies
 * or deletes nothing, as required on crm-mig.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_3\.2\.2:" --project=chromium
 */

/** Session helper - opens authenticated page and returns MigDataParityPage. */
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

test.describe('CRM-12653_3.2.2 - Stored computed revenue not carried stale', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('\nFAILURE REASON: ' + (testInfo.error?.message?.split('\n')[0] ?? 'unknown'));
    }
  });

  test('CRM-12653_3.2.2: Stored computed Lifetime Revenue is recomputed from target invoices, not copied from source', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let targetContext: BrowserContext | null = null;
    let sourceContext: BrowserContext | null = null;
    let targetParity: MigDataParityPage;
    let sourceParity: MigDataParityPage;

    try {
      console.log('========== CRM-12653_3.2.2 - Stored revenue not stale ==========');

      // Open TARGET session first to resolve cut-off
      const targetSession = await openSession(
        browser, baseUrl_mig, true,
        users.admin_crm_mig.username, users.admin_crm_mig.password,
      );
      targetContext = targetSession.context;
      targetParity = targetSession.parity;

      // Open SOURCE session
      const sourceSession = await openSession(
        browser, baseUrl, false,
        users.admin_crm.username, users.admin_crm.password,
      );
      sourceContext = sourceSession.context;
      sourceParity = sourceSession.parity;

      // Verify authentication
      const targetAuth = await targetParity.isAuthenticatedSession();
      const sourceAuth = await sourceParity.isAuthenticatedSession();

      console.log('\n--- Pre-condition 1: Verify sessions authenticated ---');
      console.log(`  Target (${baseUrl_mig}): ${targetAuth ? 'OK' : 'FAILED'}`);
      console.log(`  Source (${baseUrl}): ${sourceAuth ? 'OK' : 'FAILED'}`);

      if (!targetAuth || !sourceAuth) {
        throw new Error('One or both sessions not authenticated');
      }

      // Resolve cut-off from target
      const cutoff = await targetParity.resolveCutoffDate();
      console.log(`  Cut-off date: ${cutoff}`);

      // Sample 3 opportunities with Deal Elements from source
      await test.step('Step 1: Sample 3 opportunities with Deal Elements from source', async () => {
        console.log('\n--- Step 1: Sample 3 opportunities with Deal Elements from source ---');

        // Get first 5 opportunities (ascending by created on)
        const oppsAsc = await sourceParity.searchRead<any>(
          'crm.lead',
          MigDataParityPage.onOrBeforeCutoff(cutoff),
          ['id', 'name', 'lifetime_revenue'],
          { limit: 5 },
        );

        // Get first 5 opportunities (descending by created on) to form a diverse sample
        const oppsDesc = await sourceParity.searchRead<any>(
          'crm.lead',
          MigDataParityPage.onOrBeforeCutoff(cutoff),
          ['id', 'name', 'lifetime_revenue'],
          { limit: 5, order: 'create_date desc' },
        );

        // Combine and remove duplicates to form sample pool
        const samplePool = [...new Map(
          [...oppsAsc, ...oppsDesc].map(o => [o.id, o])
        ).values()];

        console.log(`  Sample pool: ${samplePool.length} opportunities`);

        // Find 3 that have linked Deal Elements (sale orders with name starting with DE)
        const oppsWithDELinks = [];
        for (const opp of samplePool) {
          const dealElements = await sourceParity.searchRead<any>(
            'sale.order',
            [['opportunity_id', '=', opp.id], ['name', 'like', 'DE'], MigDataParityPage.onOrBeforeCutoff(cutoff)],
            ['name'],
            { limit: 1 },
          );

          if (dealElements.length > 0) {
            oppsWithDELinks.push({
              id: opp.id,
              name: opp.name,
              lifetime_revenue: opp.lifetime_revenue,
              de_reference: dealElements[0].name,
            });
          }

          if (oppsWithDELinks.length >= 3) break;
        }

        if (oppsWithDELinks.length < 3) {
          throw new Error(`Could not find 3 opportunities with Deal Elements in sample; found ${oppsWithDELinks.length}`);
        }

        console.log(`  Sampled 3 opportunities with Deal Elements:`);
        for (const opp of oppsWithDELinks.slice(0, 3)) {
          console.log(`    - ${opp.name.padEnd(40)} DE: ${opp.de_reference.padEnd(10)} Revenue: ${opp.lifetime_revenue}`);
        }

        // Store sample for later verification
        (test as any).sourceOppsSample = oppsWithDELinks.slice(0, 3);
      });

      await test.step('Step 2-3: Read Lifetime Revenue on target and compute sum from invoices', async () => {
        console.log('\n--- Step 2-3: Read target Lifetime Revenue and compute invoice sum ---');

        const sample = (test as any).sourceOppsSample;
        const revenueComparison: Array<{
          name: string;
          sourceRevenue: number;
          targetRevenue: number;
          targetInvoiceSum: number;
          defect: boolean;
        }> = [];

        for (const sourceOpp of sample) {
          // Find same opportunity on target by name
          const targetOpps = await targetParity.searchRead<any>(
            'crm.lead',
            [['name', '=', sourceOpp.name]],
            ['name', 'lifetime_revenue'],
            { limit: 1 },
          );

          if (targetOpps.length === 0) {
            console.log(`    WARNING: Opportunity "${sourceOpp.name}" not found on target`);
            continue;
          }

          const targetOpp = targetOpps[0];

          // Find Deal Element on target by name (DE reference is preserved)
          const targetDE = await targetParity.searchRead<any>(
            'sale.order',
            [['name', '=', sourceOpp.de_reference]],
            ['name', 'id'],
            { limit: 1 },
          );

          if (targetDE.length === 0) {
            console.log(`    WARNING: Deal Element "${sourceOpp.de_reference}" not found on target`);
            continue;
          }

          // Get all invoices linked to this Deal Element on target
          const targetInvoices = await targetParity.searchRead<any>(
            'account.invoice',
            [['origin', '=', sourceOpp.de_reference]],
            ['number', 'amount_total'],
            { limit: 500 },
          );

          // Sum the invoice amounts
          const invoiceSum = targetInvoices.reduce((sum, inv) => sum + (inv.amount_total || 0), 0);

          const isDefect = targetOpp.lifetime_revenue === sourceOpp.lifetime_revenue &&
                          targetOpp.lifetime_revenue !== invoiceSum &&
                          invoiceSum > 0;

          revenueComparison.push({
            name: sourceOpp.name,
            sourceRevenue: sourceOpp.lifetime_revenue,
            targetRevenue: targetOpp.lifetime_revenue,
            targetInvoiceSum: invoiceSum,
            defect: isDefect,
          });

          console.log(`    ${sourceOpp.name.padEnd(30)}`);
          console.log(`      Source LT Revenue: ${sourceOpp.lifetime_revenue}`);
          console.log(`      Target LT Revenue: ${targetOpp.lifetime_revenue}`);
          console.log(`      Target Invoice Sum: ${invoiceSum} (${targetInvoices.length} invoices)`);
          console.log(`      Match: ${targetOpp.lifetime_revenue === invoiceSum ? 'YES' : 'NO'}${isDefect ? ' [DEFECT]' : ''}`);
        }

        (test as any).revenueComparison = revenueComparison;
      });

      await test.step('Verification', async () => {
        const comparison = (test as any).revenueComparison;

        console.log('\n==================== VERIFY ====================');
        console.log('Verify #1 - Lifetime Revenue matches actual invoices on target:');

        let correctCount = 0;

        for (const item of comparison) {
          const matches = item.targetRevenue === item.targetInvoiceSum;
          if (matches) correctCount++;

          console.log(`  ${item.name.padEnd(35)}`);
          console.log(`    Expected : target Lifetime Revenue = sum of target invoices`);
          console.log(`    Actual   : target=${item.targetRevenue}, sum of ${item.targetInvoiceSum}`);
          console.log(`    Result   : ${matches ? 'PASS' : 'FAIL'}`);
        }

        console.log('\nVerify #2 - Revenue not copied stale from source:');
        let staleCopyCount = 0;

        for (const item of comparison) {
          const isStaleCopy = item.targetRevenue === item.sourceRevenue &&
                             item.targetRevenue !== item.targetInvoiceSum &&
                             item.targetInvoiceSum > 0;
          if (isStaleCopy) staleCopyCount++;

          console.log(`  ${item.name.padEnd(35)}`);
          console.log(`    Expected : target revenue matches target invoices (not source)`);
          console.log(`    Actual   : source=${item.sourceRevenue}, target=${item.targetRevenue}, invoices=${item.targetInvoiceSum}`);
          console.log(`    Result   : ${!isStaleCopy ? 'PASS' : 'FAIL'}`);
        }
        console.log('===============================================');
        console.log(`OVERALL: ${correctCount}/${comparison.length} with correct revenue, ${staleCopyCount} stale copies`);

        // Assertion 1: Lifetime Revenue should equal the sum of actual invoices on target
        expect(correctCount, `Target Lifetime Revenue should match the sum of invoices that exist on crm-mig for that opportunity. Matches: ${correctCount}/${comparison.length}`).toBe(comparison.length);

        // Assertion 2: The stored field should not be a stale copy from source when invoices differ
        expect(staleCopyCount, `Lifetime Revenue field should be recomputed from target invoices, not copied from source. Stale copies found: ${staleCopyCount}`).toBe(0);
      });

    } finally {
      // Close both contexts
      if (sourceContext) await sourceContext.close();
      if (targetContext) await targetContext.close();
    }
  });
});
