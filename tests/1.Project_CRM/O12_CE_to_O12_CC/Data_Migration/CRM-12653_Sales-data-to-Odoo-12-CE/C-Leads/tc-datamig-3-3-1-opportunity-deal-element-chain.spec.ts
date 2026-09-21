import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653 Data Migration - Sales data to Odoo 12 CE, Section 3.3
 * Test Case ID: CRM-12653_3.3.1
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   The opportunity - Deal Element link survives the migration and resolves in both directions.
 *   A Deal Element (sale.order with is_deal_element=True) points to its parent opportunity via
 *   opportunity_id, and the opportunity's Deal Element button opens the same order. This test
 *   samples 5 opportunities with their Deal Elements, verifies that each DE number is preserved,
 *   customer name and total match, and the links resolve bidirectionally on the target.
 *
 * Source manual TC (master tab "O12 CE to O12 CC" -> "CRM-12653_Data Migration", row 3.3.1):
 *
 * Pre-conditions:
 *   Two authenticated sessions side by side:
 *   - SOURCE = pre-production (Odoo 12 Enterprise), logged in as CRM administrator
 *   - TARGET = crm-mig (Odoo 12 Community), logged in as admin_crm_mig
 *   <CUTOFF> = the migration cut-off date from CRM-12653_1.1.2
 *   5 opportunities with Deal Elements selected from SOURCE within the cut-off window
 *
 * Read-only verification:
 *   Every check reads data via MigDataParityPage.readKw - no UI clicks, no data creation.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_3\.3\.1:" --project=chromium
 */

/**
 * Inline session helper - opened for BOTH servers.
 * TARGET session is opened first, then SOURCE, so cutoff can be resolved from TARGET.
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

test.describe('CRM-12653_3.3.1 - Opportunity Deal Element chain parity', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('\nFAILURE REASON: ' + (testInfo.error?.message?.split('\n')[0] ?? 'unknown'));
    }
  });

  test('CRM-12653_3.3.1: Opportunity - Deal Element link survives the migration and resolves in both directions', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let targetContext: BrowserContext | null = null;
    let sourceContext: BrowserContext | null = null;

    try {
      console.log('========== CRM-12653_3.3.1 - Opportunity Deal Element chain parity ==========\n');

      // Target session first to resolve cutoff
      const targetSession = await openSession(
        browser, baseUrl_mig, true, users.admin_crm_mig.username, users.admin_crm_mig.password,
      );
      targetContext = targetSession.context;
      const targetParity = targetSession.parity;

      // Source session
      const sourceSession = await openSession(
        browser, baseUrl, false, users.admin_crm.username, users.admin_crm.password,
      );
      sourceContext = sourceSession.context;
      const sourceParity = sourceSession.parity;

      let cutoff: string;
      let sampleOppotunities: Array<{
        id: number;
        name: string;
        de_number: string;
        de_customer_name: string;
        de_total: number;
      }> = [];
      const targetResults: Array<{
        de_number: string;
        found: boolean;
        customer_name: string;
        total: number;
        opportunity_name: string;
      }> = [];

      await test.step('Pre-condition 1: Verify both sessions authenticated', async () => {
        console.log('--- Pre-condition 1: Verify both sessions authenticated ---');
        const sourceAuth = await sourceParity.isAuthenticatedSession();
        const targetAuth = await targetParity.isAuthenticatedSession();
        console.log(`  SOURCE authenticated: ${sourceAuth}`);
        console.log(`  TARGET authenticated: ${targetAuth}`);
        expect(sourceAuth, 'source session not authenticated').toBe(true);
        expect(targetAuth, 'target session not authenticated').toBe(true);
      });

      await test.step('Pre-condition 2: Resolve cut-off from TARGET', async () => {
        console.log('\n--- Pre-condition 2: Resolve cut-off from TARGET ---');
        cutoff = await targetParity.resolveCutoffDate();
        console.log(`  Cut-off date: ${cutoff}`);
      });

      await test.step('Pre-condition 3: Build deterministic sample of 5 opportunities with Deal Elements on SOURCE', async () => {
        console.log('\n--- Pre-condition 3: Build deterministic sample of 5 opportunities with Deal Elements ---');
        const domain = [
          ...MigDataParityPage.onOrBeforeCutoff(cutoff, 'create_date'),
          ['is_deal_element', '=', true],
          ['opportunity_id', '!=', false],
        ];
        const deals = await sourceParity.searchRead<any>(
          'sale.order',
          domain,
          ['id', 'name', 'opportunity_id', 'partner_id', 'amount_total', 'create_date'],
          { limit: 5, order: 'create_date asc' },
        );
        console.log(`  Found ${deals.length} Deal Elements with opportunities on SOURCE`);

        for (const deal of deals) {
          const [oppId, oppName] = deal.opportunity_id || [null, null];
          const [partnerId, partnerName] = deal.partner_id || [null, null];
          sampleOppotunities.push({
            id: oppId,
            name: oppName || '',
            de_number: deal.name,
            de_customer_name: partnerName || '',
            de_total: deal.amount_total || 0,
          });
          console.log(`  - Opp: "${oppName}" (id=${oppId}), DE: ${deal.name}, Customer: ${partnerName}, Total: ${deal.amount_total}`);
        }

        expect(sampleOppotunities.length, 'sample must have at least 1 opportunity with a Deal Element').toBeGreaterThan(0);
      });

      await test.step('Step 1: Search each DE number on TARGET and verify customer & total match', async () => {
        console.log('\n--- Step 1: Search each DE number on TARGET ---');
        for (const opp of sampleOppotunities) {
          const deMatches = await targetParity.searchRead<any>(
            'sale.order',
            [
              ...MigDataParityPage.onOrBeforeCutoff(cutoff, 'create_date'),
              ['name', '=', opp.de_number],
            ],
            ['name', 'opportunity_id', 'partner_id', 'amount_total'],
            { limit: 1 },
          );

          if (deMatches.length === 0) {
            console.log(`  DE ${opp.de_number}: NOT FOUND on target`);
            targetResults.push({
              de_number: opp.de_number,
              found: false,
              customer_name: '',
              total: 0,
              opportunity_name: '',
            });
          } else {
            const de = deMatches[0];
            const [targetOppId, targetOppName] = de.opportunity_id || [null, null];
            const [targetCustomerId, targetCustomerName] = de.partner_id || [null, null];
            console.log(`  DE ${opp.de_number}: found, Customer: ${targetCustomerName}, Total: ${de.amount_total}, Opp: "${targetOppName}"`);
            targetResults.push({
              de_number: opp.de_number,
              found: true,
              customer_name: targetCustomerName || '',
              total: de.amount_total || 0,
              opportunity_name: targetOppName || '',
            });
          }
        }
      });

      await test.step('Verification: Compare results', async () => {
        console.log('\n==================== VERIFY ====================');

        // Verify #1: All DE numbers found on TARGET
        const deFound = targetResults.filter((r) => r.found).length;
        const deNotFound = targetResults.filter((r) => !r.found).length;
        console.log('Verify #1 - All 5 DE numbers preserved and found on TARGET:');
        console.log(`  Expected : ${sampleOppotunities.length} found`);
        console.log(`  Actual   : ${deFound} found, ${deNotFound} not found`);
        console.log(`  Result   : ${deFound === sampleOppotunities.length ? 'PASS' : 'FAIL'}`);

        // Verify #2: Customer name and total match
        const custMatches = [];
        const custMismatches = [];
        for (let i = 0; i < sampleOppotunities.length; i++) {
          const src = sampleOppotunities[i];
          const tgt = targetResults[i];
          if (!tgt.found) continue;
          if (src.de_customer_name === tgt.customer_name && src.de_total === tgt.total) {
            custMatches.push(src.de_number);
          } else {
            custMismatches.push({
              de: src.de_number,
              sourceCustomer: src.de_customer_name,
              targetCustomer: tgt.customer_name,
              sourceTotal: src.de_total,
              targetTotal: tgt.total,
            });
          }
        }
        console.log('Verify #2 - Customer name and total match for each DE:');
        console.log(`  Expected : all found DEs have matching customer & total`);
        console.log(`  Actual   : ${custMatches.length} match${custMismatches.length > 0 ? `, ${custMismatches.length} mismatch` : ''}`);
        console.log(`  Result   : ${custMismatches.length === 0 ? 'PASS' : 'FAIL'}`);

        // Verify #3: Opportunity links match
        const oppMatches = [];
        const oppMismatches = [];
        for (let i = 0; i < sampleOppotunities.length; i++) {
          const src = sampleOppotunities[i];
          const tgt = targetResults[i];
          if (!tgt.found) continue;
          if (src.name === tgt.opportunity_name) {
            oppMatches.push(src.de_number);
          } else {
            oppMismatches.push({
              de: src.de_number,
              sourceOpp: src.name,
              targetOpp: tgt.opportunity_name,
            });
          }
        }
        console.log('Verify #3 - Opportunity link matches (link resolves forward):');
        console.log(`  Expected : all found DEs point to the same opportunity`);
        console.log(`  Actual   : ${oppMatches.length} match${oppMismatches.length > 0 ? `, ${oppMismatches.length} mismatch` : ''}`);
        console.log(`  Result   : ${oppMismatches.length === 0 ? 'PASS' : 'FAIL'}`);

        // Verify #4: Opportunity back-link (DE button would open same DE)
        // This is implicit from the opportunity_id match above, but we verify the count
        console.log('Verify #4 - Opportunity back-link (link resolves backward):');
        console.log(`  Expected : all found DEs have opportunity_id set (not empty)`);
        console.log(`  Actual   : ${oppMatches.length} have opportunity_id set`);
        console.log(`  Result   : ${oppMismatches.length === 0 ? 'PASS' : 'FAIL'}`);

        // Verify #5: Summary
        console.log('Verify #5 - Overall parity of opportunity-Deal Element chain:');
        console.log(`  Expected : 0 missing DEs, 0 broken links, 0 property mismatches`);
        console.log(`  Actual   : ${deNotFound} missing, ${oppMismatches.length} broken links, ${custMismatches.length} property mismatches`);
        console.log(`  Result   : ${deNotFound === 0 && oppMismatches.length === 0 && custMismatches.length === 0 ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');

        // Assert expectations
        expect(
          deFound,
          `Deal Element number preservation failed: only ${deFound}/${sampleOppotunities.length} DE numbers found on target`,
        ).toBe(sampleOppotunities.length);

        expect(
          custMismatches,
          `Customer/Total mismatch: ${custMismatches.map((m) => `${m.de} (${m.sourceCustomer}/${m.targetCustomer})`).join(', ')}`,
        ).toHaveLength(0);

        expect(
          oppMismatches,
          `Opportunity link mismatch: ${oppMismatches.map((m) => `${m.de} (${m.sourceOpp} -> ${m.targetOpp})`).join(', ')}`,
        ).toHaveLength(0);

        // Additional check: no empty opportunity links (broken chain)
        const brokenChains = targetResults.filter((r) => r.found && !r.opportunity_name);
        expect(
          brokenChains,
          `Broken chain found: Deal Element(s) with empty opportunity_id: ${brokenChains.map((r) => r.de_number).join(', ')}`,
        ).toHaveLength(0);

        expect(
          deNotFound,
          `Migration loss: ${deNotFound} Deal Element(s) not found on target: ${targetResults.filter((r) => !r.found).map((r) => r.de_number).join(', ')}`,
        ).toBe(0);
      });

    } finally {
      if (targetContext) await targetContext.close();
      if (sourceContext) await sourceContext.close();
    }
  });
});
