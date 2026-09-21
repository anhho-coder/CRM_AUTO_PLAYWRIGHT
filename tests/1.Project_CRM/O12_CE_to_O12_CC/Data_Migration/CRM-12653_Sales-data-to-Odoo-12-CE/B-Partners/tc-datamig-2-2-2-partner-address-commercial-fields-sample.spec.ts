import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653_2.2.2 - Partner address and commercial fields on the same sample
 * Test Case ID: CRM-12653_2.2.2
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   The address, sales and accounting fields of a sampled partner are carried over unchanged
 *   during migration from Odoo 12 Enterprise (pre-production) to Odoo 12 Community (crm-mig).
 *   The test builds the same 10-partner sample as CRM-12653_2.2.1 (deterministically: 5 oldest +
 *   5 newest by create_date on SOURCE within the cut-off) and verifies address block, Sales &
 *   Purchases tab, and Accounting tab fields via JSON-RPC reads.
 *
 * Source manual TC (CRM-12653 master tab, row 2.2.2):
 *   - Uses the same 10-partner sample as CRM-12653_2.2.1 (5 oldest + 5 newest by create_date
 *     within the cut-off window). Automation rebuilds deterministically; not reused from 2.2.1 run.
 *   - Reads address, sales/purchases, and accounting fields from both servers
 *   - Compares by name for many2one fields (Salesperson, Pricelist, Payment Terms, accounts)
 *   - Accounts for chart-of-accounts code differences as environment-level exceptions
 *
 * Expected Bullets (expectedBulletCount: 5):
 *   1. Every listed field is readable on both servers for all 10 partners
 *   2. Each field holds the same value on both servers
 *   3. Salesperson, Pricelist, Payment Terms compared by name, never by id
 *   4. A Salesperson filled on source and empty on target is an unmapped user exception
 *   5. If accounting accounts differ by CODE on every sampled partner = one COA exception
 *
 * READ-ONLY: this spec only reads res.partner via MigDataParityPage.searchRead and .readIds.
 *   It creates, modifies and deletes nothing on either server.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_2\.2\.2:" --project=chromium
 */

/** Inline session helper to open authenticated sessions on both servers */
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

test.describe('CRM-12653_2.2.2 - Partner address and commercial fields', () => {
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12653_2.2.2: Partner address and commercial fields on the same sample', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let sourceSession: { context: BrowserContext; parity: MigDataParityPage } | null = null;
    let targetSession: { context: BrowserContext; parity: MigDataParityPage } | null = null;

    try {
      // ===== Step 1: Establish cut-off and authenticate on both servers =====
      await test.step('Pre-condition 1: Open authenticated sessions on both servers', async () => {
        console.log('\n--- Pre-condition 1: Authenticate on SOURCE and TARGET ---');
        console.log(`  Source : ${baseUrl}`);
        console.log(`  Target : ${baseUrl_mig}`);

        targetSession = await openSession(browser, baseUrl_mig, true, users.admin_crm_mig.username, users.admin_crm_mig.password);
        console.log('  OK - logged in on the Migration server (TARGET)');

        sourceSession = await openSession(browser, baseUrl, false, users.admin_crm.username, users.admin_crm.password);
        console.log('  OK - logged in on the Pre-production server (SOURCE)');
      });

      const targetParity = targetSession!.parity;
      const sourceParity = sourceSession!.parity;

      let cutoff: string;

      await test.step('Pre-condition 2: Resolve cut-off date from target', async () => {
        console.log('\n--- Pre-condition 2: Resolve cut-off from TARGET ---');
        cutoff = await targetParity.resolveCutoffDate();
        console.log(`  Cut-off: ${cutoff}`);
      });

      // Verify authentication
      let targetAuth = false;
      let sourceAuth = false;

      await test.step('Pre-condition 3: Verify both sessions are authenticated', async () => {
        console.log('\n--- Pre-condition 3: Verify authentication on both servers ---');
        targetAuth = await targetParity.isAuthenticatedSession();
        sourceAuth = await sourceParity.isAuthenticatedSession();
        console.log(`  Target authenticated: ${targetAuth}`);
        console.log(`  Source authenticated: ${sourceAuth}`);
      });

      expect(targetAuth, 'Target session is not authenticated').toBe(true);
      expect(sourceAuth, 'Source session is not authenticated').toBe(true);

      // ===== Step 2: Build the 10-partner sample (5 oldest + 5 newest) from SOURCE =====
      const samplePartnerNames: string[] = [];

      await test.step('Step 1: Build the 10-partner sample from SOURCE (same deterministic approach as CRM-12653_2.2.1)', async () => {
        console.log('\n--- Step 1: Build sample of 5 oldest + 5 newest partners on SOURCE (by create_date) ---');

        const cutoffFilter = MigDataParityPage.onOrBeforeCutoff(cutoff);

        // Get 5 oldest partners (by create_date ascending)
        const oldest = await sourceParity.searchRead<{ id: number; name: string }>(
          'res.partner',
          cutoffFilter,
          ['name', 'create_date'],
          { limit: 5, order: 'create_date asc' },
        );
        samplePartnerNames.push(...oldest.map((p) => p.name));

        // Get 5 newest partners (by create_date descending)
        const newest = await sourceParity.searchRead<{ id: number; name: string }>(
          'res.partner',
          cutoffFilter,
          ['name', 'create_date'],
          { limit: 5, order: 'create_date desc' },
        );
        samplePartnerNames.push(...newest.map((p) => p.name));

        console.log(`  Sample built: ${samplePartnerNames.length} partners`);
        samplePartnerNames.forEach((name) => console.log(`    - ${name}`));

        // Guard: SOURCE must have at least 10 partners or sample is insufficient
        if (samplePartnerNames.length !== 10) {
          console.log(`  WARNING: Expected 10 partners in sample, got ${samplePartnerNames.length}`);
        }
      });

      // ===== Step 3: For each partner, read address + sales/purchases + accounting fields =====
      const differences: Array<{
        partner: string;
        field: string;
        source: string;
        target: string;
      }> = [];
      const unmappedUsers: Set<string> = new Set();
      const coaExceptions: Map<string, Array<{ partner: string; source: string; target: string }>> = new Map();
      let readableCount = 0;

      await test.step('Step 2-5: Read address, sales, and accounting fields for each partner', async () => {
        console.log('\n--- Step 2-5: Read fields on SOURCE and TARGET by partner name ---');

        for (const partnerName of samplePartnerNames) {
          // Search on SOURCE
          const sourceMatches = await sourceParity.searchRead<any>(
            'res.partner',
            [['name', '=', partnerName], ...MigDataParityPage.onOrBeforeCutoff(cutoff)],
            [
              // Address block
              'street', 'street2', 'city', 'state_id', 'zip', 'country_id', 'vat',
              // Sales & Purchases tab
              'user_id', 'property_product_pricelist', 'property_payment_term_id',
              'customer_rank', 'supplier_rank',
              // Accounting tab
              'property_account_receivable_id', 'property_account_payable_id',
            ],
            { limit: 1 },
          );

          if (sourceMatches.length === 0) {
            console.log(`    [LOSS] ${partnerName} - not found on SOURCE`);
            // Mark as un-readable on source
            continue;
          }

          const sourceRecord = sourceMatches[0];

          // Search on TARGET by name
          const targetMatches = await targetParity.searchRead<any>(
            'res.partner',
            [['name', '=', partnerName], ...MigDataParityPage.onOrBeforeCutoff(cutoff)],
            [
              'street', 'street2', 'city', 'state_id', 'zip', 'country_id', 'vat',
              'user_id', 'property_product_pricelist', 'property_payment_term_id',
              'customer_rank', 'supplier_rank',
              'property_account_receivable_id', 'property_account_payable_id',
            ],
            { limit: 1 },
          );

          if (targetMatches.length === 0) {
            console.log(`    [LOSS] ${partnerName} - not found on TARGET`);
            continue;
          }

          const targetRecord = targetMatches[0];
          readableCount++;

          // Compare address block
          const addressFields = ['street', 'street2', 'city', 'zip'];
          for (const field of addressFields) {
            const srcVal = sourceRecord[field] || '';
            const tgtVal = targetRecord[field] || '';
            if (srcVal !== tgtVal) {
              differences.push({ partner: partnerName, field, source: srcVal, target: tgtVal });
            }
          }

          // Compare state and country (many2one - compare by name)
          const srcState = sourceRecord.state_id?.[1] || '';
          const tgtState = targetRecord.state_id?.[1] || '';
          if (srcState !== tgtState) {
            differences.push({ partner: partnerName, field: 'State', source: srcState, target: tgtState });
          }

          const srcCountry = sourceRecord.country_id?.[1] || '';
          const tgtCountry = targetRecord.country_id?.[1] || '';
          if (srcCountry !== tgtCountry) {
            differences.push({ partner: partnerName, field: 'Country', source: srcCountry, target: tgtCountry });
          }

          // Compare VAT
          const srcVat = sourceRecord.vat || '';
          const tgtVat = targetRecord.vat || '';
          if (srcVat !== tgtVat) {
            differences.push({ partner: partnerName, field: 'VAT', source: srcVat, target: tgtVat });
          }

          // Compare Sales & Purchases fields (many2one by name, boolean as-is)
          const srcSalesperson = sourceRecord.user_id?.[1] || '';
          const tgtSalesperson = targetRecord.user_id?.[1] || '';
          if (srcSalesperson !== tgtSalesperson) {
            differences.push({ partner: partnerName, field: 'Salesperson', source: srcSalesperson, target: tgtSalesperson });
            // Track unmapped users (filled on source, empty on target)
            if (srcSalesperson && !tgtSalesperson) {
              unmappedUsers.add(srcSalesperson);
            }
          }

          const srcPricelist = sourceRecord.property_product_pricelist?.[1] || '';
          const tgtPricelist = targetRecord.property_product_pricelist?.[1] || '';
          if (srcPricelist !== tgtPricelist) {
            differences.push({ partner: partnerName, field: 'Pricelist', source: srcPricelist, target: tgtPricelist });
          }

          const srcPaymentTerms = sourceRecord.property_payment_term_id?.[1] || '';
          const tgtPaymentTerms = targetRecord.property_payment_term_id?.[1] || '';
          if (srcPaymentTerms !== tgtPaymentTerms) {
            differences.push({ partner: partnerName, field: 'Payment Terms', source: srcPaymentTerms, target: tgtPaymentTerms });
          }

          const srcCustomer = sourceRecord.customer_rank || 0;
          const tgtCustomer = targetRecord.customer_rank || 0;
          if (srcCustomer !== tgtCustomer) {
            differences.push({ partner: partnerName, field: 'Customer flag', source: String(srcCustomer), target: String(tgtCustomer) });
          }

          const srcVendor = sourceRecord.supplier_rank || 0;
          const tgtVendor = targetRecord.supplier_rank || 0;
          if (srcVendor !== tgtVendor) {
            differences.push({ partner: partnerName, field: 'Vendor flag', source: String(srcVendor), target: String(tgtVendor) });
          }

          // Compare Accounting tab fields (by code, not by id)
          const srcReceivable = sourceRecord.property_account_receivable_id?.[1] || '';
          const tgtReceivable = targetRecord.property_account_receivable_id?.[1] || '';
          if (srcReceivable !== tgtReceivable) {
            if (!coaExceptions.has('Account Receivable')) {
              coaExceptions.set('Account Receivable', []);
            }
            coaExceptions.get('Account Receivable')!.push({
              partner: partnerName,
              source: srcReceivable,
              target: tgtReceivable,
            });
          }

          const srcPayable = sourceRecord.property_account_payable_id?.[1] || '';
          const tgtPayable = targetRecord.property_account_payable_id?.[1] || '';
          if (srcPayable !== tgtPayable) {
            if (!coaExceptions.has('Account Payable')) {
              coaExceptions.set('Account Payable', []);
            }
            coaExceptions.get('Account Payable')!.push({
              partner: partnerName,
              source: srcPayable,
              target: tgtPayable,
            });
          }
        }

        console.log(`  Readable on both servers: ${readableCount} of ${samplePartnerNames.length}`);
      });

      // ===== Step 6: Verification block with assertions =====
      await test.step('Verification and assertions', async () => {
        console.log('\n==================== VERIFY ====================');

        console.log('Verify #1 - Every listed field is readable on both servers for all 10 partners:');
        console.log(`  Expected : 10 readable partners`);
        console.log(`  Actual   : ${readableCount}`);
        console.log(`  Result   : ${readableCount === 10 ? 'PASS' : 'FAIL'}`);

        console.log('Verify #2 - Each field holds the same value on both servers:');
        console.log(`  Expected : 0 differences`);
        console.log(`  Actual   : ${differences.length}`);
        if (differences.length > 0) {
          differences.slice(0, 5).forEach((d) => {
            console.log(`    - ${d.partner}.${d.field}: '${d.source}' vs '${d.target}'`);
          });
          if (differences.length > 5) {
            console.log(`    ... and ${differences.length - 5} more`);
          }
        }
        console.log(`  Result   : ${differences.length === 0 ? 'PASS' : 'FAIL'}`);

        console.log('Verify #3 - Salesperson, Pricelist, Payment Terms compared by name (not by id):');
        const nameComparedFields = differences.filter((d) => ['Salesperson', 'Pricelist', 'Payment Terms'].includes(d.field));
        console.log(`  Expected : values compared by name`);
        console.log(`  Actual   : name-based comparison applied`);
        console.log(`  Result   : PASS (applied in compare logic)`);

        console.log('Verify #4 - Unmapped users (filled on source, empty on target):');
        console.log(`  Expected : 0 unmapped users`);
        console.log(`  Actual   : ${unmappedUsers.size}`);
        if (unmappedUsers.size > 0) {
          Array.from(unmappedUsers).forEach((user) => {
            console.log(`    - unmapped user: ${user}`);
          });
        }
        console.log(`  Result   : ${unmappedUsers.size === 0 ? 'PASS' : 'FAIL'}`);

        console.log('Verify #5 - Chart-of-accounts mapping exceptions (code differences on all sampled partners):');
        let coaExceptionCount = 0;
        for (const [accountType, exceptions] of coaExceptions) {
          if (exceptions.length === readableCount) {
            // All sampled partners have a difference in this account
            console.log(`  ${accountType}: all ${readableCount} partners differ - ONE COA exception`);
            coaExceptionCount++;
          } else {
            // Some but not all partners differ - report as individual defects
            exceptions.forEach((e) => {
              console.log(`  ${accountType} (${e.partner}): '${e.source}' vs '${e.target}'`);
            });
          }
        }
        console.log(`  Result   : ${coaExceptionCount > 0 || coaExceptions.size === 0 ? 'PASS' : 'FAIL'}`);

        console.log('===============================================');
        const overallPass = readableCount === 10 && differences.length === 0 && unmappedUsers.size === 0;
        console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - address and commercial fields match`);

        // Bullet 1: Every listed field is readable on both servers for all 10 partners
        expect(readableCount, 'Bullet 1 FAILED: Not all 10 partners were readable on both servers').toBe(10);

        // Bullet 2: Each field holds the same value on both servers
        expect(differences, `Bullet 2 FAILED: Field differences found between servers: ${differences.length} differences`).toHaveLength(0);

        // Bullet 4: Unmapped users (filled on source, empty on target)
        expect(unmappedUsers, `Bullet 4 FAILED: Unmapped users (filled on source, empty on target) found: ${Array.from(unmappedUsers).join(', ')}`).toHaveSize(0);

        // Bullet 5: COA exceptions are environment-level (uniform across all sampled partners) and do NOT fail.
        // Non-uniform COA differences are defects and FAIL the spec.
        for (const [accountType, exceptions] of coaExceptions) {
          if (exceptions.length < readableCount) {
            expect.fail(`Bullet 5 FAILED: Chart-of-accounts ${accountType} differs on ${exceptions.length}/${readableCount} partners (not uniform - would be 10 defects if uniform)`);
          }
        }
      });
    } finally {
      // Cleanup: close both contexts
      if (sourceSession?.context) {
        await sourceSession.context.close();
      }
      if (targetSession?.context) {
        await targetSession.context.close();
      }
    }
  });
});
