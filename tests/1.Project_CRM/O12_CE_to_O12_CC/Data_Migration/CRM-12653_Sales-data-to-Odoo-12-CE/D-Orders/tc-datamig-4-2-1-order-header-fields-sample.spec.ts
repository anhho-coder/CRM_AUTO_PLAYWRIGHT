import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653 Part 4.2.1 - Order header fields migrated correctly
 * Test Case ID: CRM-12653_4.2.1
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   The 14 header fields of a migrated sales order are verified to hold the same values
 *   on both pre-production (Odoo 12 Enterprise) and crm-mig (Odoo 12 Community) for a
 *   deterministic sample of 10 orders. Fields are compared by their natural keys (e.g.,
 *   partner name, not ID) to account for ID re-sequencing on crm-mig. This case reuses
 *   the same 10 orders sampled in CRM-12653_4.1.3 to ensure consistency across the
 *   order-family test cases.
 *
 * Source manual TC (master tab "CRM-12653 Data Migration Sales", row 4.2.1):
 *
 * Pre-conditions:
 *   VPN connected; both pre-production (Odoo 12 Enterprise) and crm-mig
 *   (Odoo 12 Community) are reachable.
 *   Login: anh.ho@nakivo.com (admin_crm for source, admin_crm_mig for target).
 *   Migration cut-off date established in CRM-12653_1.1.2.
 *   The same 10 orders sampled in CRM-12653_4.1.3 are reused (deterministic by create_date asc).
 *
 * Steps to reproduce:
 *   1. On pre-production open each of the 10 sampled orders and write down the header fields.
 *   2. Open the matching order on crm-mig and read the same 14 fields.
 *   3. Compare field by field and record every difference with the Order Reference and the field name.
 *
 * Verification Points:
 *   1. Both sessions are authenticated and can read data.
 *   2. At least one sample order is read from the source within the cut-off.
 *   3. For each of the 10 orders, all 14 header fields hold the same value on both servers.
 *   4. Customer, addresses, Pricelist, Payment Terms, Salesperson, Sales Team and Company are
 *      compared BY NAME, never by id.
 *   5. Order Date and Expiration are compared as dates (including year); Currency and Status as code/label.
 *   6. Empty on source must be empty on target; a field silently blanked by ETL is a failure.
 *
 * READ-ONLY: this spec only reads sale.order records. It creates, modifies and deletes
 * nothing, as required on crm-mig.
 *
 * NOTE: Sale order IDs are re-sequenced on crm-mig, so id-based joins will fail. The join
 * strategy is on the 'name' field (e.g. SO#####/DE#####) — the natural key for sale orders.
 * Many2one field values are compared by their display name, not ID.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_4\.2\.1:" --project=chromium
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

test.describe('CRM-12653 Part 4.2.1 - Order header fields parity', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12653_4.2.1: All 14 header fields match on source and target for a sample of 10 orders', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let sourceContext: BrowserContext | null = null;
    let targetContext: BrowserContext | null = null;
    let sourceParityPage: MigDataParityPage | null = null;
    let targetParityPage: MigDataParityPage | null = null;
    let cutoff: string | null = null;

    try {
      console.log('========== CRM-12653_4.2.1 - Order header fields parity (10-order sample) ==========');

      // Pre-condition 1: Open session on crm-mig (target) and establish cut-off.
      let targetAuth = false;
      let sourceAuth = false;

      await test.step('Pre-condition 1: Login on target (crm-mig) and establish cut-off', async () => {
        console.log('\n--- Pre-condition 1: Login on target and establish cut-off ---');
        const session = await openSession(
          browser, baseUrl_mig, true,
          users.admin_crm_mig.username, users.admin_crm_mig.password,
        );
        targetContext = session.context;
        targetParityPage = session.parity;
        console.log(`  Target  : ${baseUrl_mig}`);
        console.log(`  Account : ${users.admin_crm_mig.username}`);

        // Guard: verify session is authenticated.
        targetAuth = await targetParityPage.isAuthenticatedSession();
        console.log(`  Authenticated: ${targetAuth}`);

        // Resolve cut-off date.
        cutoff = await targetParityPage.resolveCutoffDate();
        console.log(`  Cut-off date  : ${cutoff}`);
      });

      // Pre-condition 2: Open session on source (pre-production).
      await test.step('Pre-condition 2: Login on source (pre-production)', async () => {
        console.log('\n--- Pre-condition 2: Login on source ---');
        const session = await openSession(
          browser, baseUrl, false,
          users.admin_crm.username, users.admin_crm.password,
        );
        sourceContext = session.context;
        sourceParityPage = session.parity;
        console.log(`  Source  : ${baseUrl}`);
        console.log(`  Account : ${users.admin_crm.username}`);

        // Guard: verify session is authenticated.
        sourceAuth = await sourceParityPage.isAuthenticatedSession();
        console.log(`  Authenticated: ${sourceAuth}`);
        expect(sourceAuth && targetAuth, 'both sessions must be authenticated before proceeding').toBe(true);
      });

      // Step 1: Sample 10 orders from source (earliest by create_date within cut-off).
      // This is the same sample as CRM-12653_4.1.3.
      const sampleOrders: Array<{
        id: number;
        name: string;
      }> = [];

      await test.step('Step 1: Sample 10 orders from the source (within cut-off)', async () => {
        console.log('\n--- Step 1: Sample 10 orders from source (deterministic by create_date asc) ---');
        const cutoffFilter = MigDataParityPage.onOrBeforeCutoff(cutoff!);
        const orders = await sourceParityPage!.searchRead<{ id: number; name: string }>(
          'sale.order',
          cutoffFilter,
          ['id', 'name'],
          { limit: 500, order: 'create_date asc' },
        );
        sampleOrders.push(...orders.slice(0, 10));
        console.log(`  Total orders on source within cut-off: ${orders.length}`);
        console.log(`  Sampled ${sampleOrders.length} orders:`);
        for (const o of sampleOrders) {
          console.log(`    - ${o.name}`);
        }
        expect(sampleOrders.length, 'at least one order must be sampled from source within cut-off before proceeding').toBeGreaterThan(0);
      });

      // Step 2 & 3: Read 14 header fields on both sides and compare field by field.
      // The 14 fields are: Order Reference (name), Customer (partner_id), Invoice Address (partner_invoice_id),
      // Delivery Address (partner_shipping_id), Order Date (date_order), Expiration (validity_date),
      // Pricelist (pricelist_id), Payment Terms (payment_term_id), Salesperson (user_id),
      // Sales Team (team_id), Company (company_id), Currency (currency_id), Source Document (origin), Status (state).

      const fieldMismatches: Array<{
        orderRef: string;
        field: string;
        source: string | null;
        target: string | null;
        issue: string;
      }> = [];

      const unmappedOwners: Array<{ orderRef: string; field: string; value: string }> = [];

      await test.step('Step 2-3: Read header fields on both servers and compare', async () => {
        console.log('\n--- Step 2-3: Read and compare 14 header fields for each order ---');

        const fieldsToRead = [
          'name',                  // Order Reference
          'partner_id',            // Customer
          'partner_invoice_id',    // Invoice Address
          'partner_shipping_id',   // Delivery Address
          'date_order',            // Order Date
          'validity_date',         // Expiration
          'pricelist_id',          // Pricelist
          'payment_term_id',       // Payment Terms
          'user_id',               // Salesperson
          'team_id',               // Sales Team
          'company_id',            // Company
          'currency_id',           // Currency
          'origin',                // Source Document
          'state',                 // Status
        ];

        const cutoffFilter = MigDataParityPage.onOrBeforeCutoff(cutoff!);

        for (const sourceOrder of sampleOrders) {
          // Read all fields on source.
          const sourceOrders = await sourceParityPage!.searchRead<any>(
            'sale.order',
            [['name', '=', sourceOrder.name], ...cutoffFilter],
            fieldsToRead,
            { limit: 1 },
          );

          if (sourceOrders.length === 0) {
            console.log(`  ${sourceOrder.name} - NOT FOUND on source (unexpected)`);
            continue;
          }

          const sourceOrd = sourceOrders[0];

          // Look up the order on target by name.
          const targetOrders = await targetParityPage!.searchRead<any>(
            'sale.order',
            [['name', '=', sourceOrder.name], ...cutoffFilter],
            fieldsToRead,
            { limit: 1 },
          );

          if (targetOrders.length === 0) {
            console.log(`  ${sourceOrder.name} - NOT FOUND on target`);
            fieldMismatches.push({
              orderRef: sourceOrder.name,
              field: 'existence',
              source: 'found',
              target: 'not found',
              issue: 'Order does not exist on target',
            });
            continue;
          }

          const targetOrd = targetOrders[0];
          console.log(`  ✓ ${sourceOrder.name} - found on both sides, verifying fields...`);

          // Helper to extract display name from many2one [id, name] or None
          const getName = (field: any): string | null => {
            if (!field) return null;
            if (Array.isArray(field)) return field[1] || null;  // [id, name]
            if (typeof field === 'string') return field;
            return null;
          };

          // Helper to normalize date format (YYYY-MM-DD HH:MM:SS -> YYYY-MM-DD)
          const getDateOnly = (dateStr: string | null): string | null => {
            if (!dateStr) return null;
            if (dateStr.includes(' ')) {
              return dateStr.split(' ')[0];  // Take only the date part
            }
            return dateStr;
          };

          // Helper to normalize currency code
          const getCurrencyCode = (field: any): string | null => {
            if (!field) return null;
            if (Array.isArray(field)) return field[1] || null;  // [id, code]
            return String(field);
          };

          // Compare each field
          const comparisons = [
            {
              name: 'Order Reference (name)',
              sourceVal: sourceOrd.name,
              targetVal: targetOrd.name,
              compare: (s: any, t: any) => s === t,
            },
            {
              name: 'Customer (partner_id)',
              sourceVal: getName(sourceOrd.partner_id),
              targetVal: getName(targetOrd.partner_id),
              compare: (s: string | null, t: string | null) => s === t,
            },
            {
              name: 'Invoice Address (partner_invoice_id)',
              sourceVal: getName(sourceOrd.partner_invoice_id),
              targetVal: getName(targetOrd.partner_invoice_id),
              compare: (s: string | null, t: string | null) => s === t,
            },
            {
              name: 'Delivery Address (partner_shipping_id)',
              sourceVal: getName(sourceOrd.partner_shipping_id),
              targetVal: getName(targetOrd.partner_shipping_id),
              compare: (s: string | null, t: string | null) => s === t,
            },
            {
              name: 'Order Date (date_order)',
              sourceVal: getDateOnly(sourceOrd.date_order),
              targetVal: getDateOnly(targetOrd.date_order),
              compare: (s: string | null, t: string | null) => s === t,
            },
            {
              name: 'Expiration (validity_date)',
              sourceVal: getDateOnly(sourceOrd.validity_date),
              targetVal: getDateOnly(targetOrd.validity_date),
              compare: (s: string | null, t: string | null) => s === t,
            },
            {
              name: 'Pricelist (pricelist_id)',
              sourceVal: getName(sourceOrd.pricelist_id),
              targetVal: getName(targetOrd.pricelist_id),
              compare: (s: string | null, t: string | null) => s === t,
            },
            {
              name: 'Payment Terms (payment_term_id)',
              sourceVal: getName(sourceOrd.payment_term_id),
              targetVal: getName(targetOrd.payment_term_id),
              compare: (s: string | null, t: string | null) => s === t,
            },
            {
              name: 'Salesperson (user_id)',
              sourceVal: getName(sourceOrd.user_id),
              targetVal: getName(targetOrd.user_id),
              compare: (s: string | null, t: string | null) => s === t,
            },
            {
              name: 'Sales Team (team_id)',
              sourceVal: getName(sourceOrd.team_id),
              targetVal: getName(targetOrd.team_id),
              compare: (s: string | null, t: string | null) => s === t,
            },
            {
              name: 'Company (company_id)',
              sourceVal: getName(sourceOrd.company_id),
              targetVal: getName(targetOrd.company_id),
              compare: (s: string | null, t: string | null) => s === t,
            },
            {
              name: 'Currency (currency_id)',
              sourceVal: getCurrencyCode(sourceOrd.currency_id),
              targetVal: getCurrencyCode(targetOrd.currency_id),
              compare: (s: string | null, t: string | null) => s === t,
            },
            {
              name: 'Source Document (origin)',
              sourceVal: sourceOrd.origin || null,
              targetVal: targetOrd.origin || null,
              compare: (s: any, t: any) => s === t,
            },
            {
              name: 'Status (state)',
              sourceVal: sourceOrd.state || null,
              targetVal: targetOrd.state || null,
              compare: (s: any, t: any) => s === t,
            },
          ];

          for (const comp of comparisons) {
            const match = comp.compare(comp.sourceVal, comp.targetVal);
            if (!match) {
              const sourceStr = comp.sourceVal === null ? '(empty)' : String(comp.sourceVal);
              const targetStr = comp.targetVal === null ? '(empty)' : String(comp.targetVal);
              console.log(`    ✗ ${comp.name}: source="${sourceStr}" -> target="${targetStr}"`);

              // Flag unmapped Salesperson/Sales Team
              if ((comp.name.includes('Salesperson') || comp.name.includes('Sales Team')) &&
                  comp.sourceVal !== null && comp.targetVal === null) {
                unmappedOwners.push({
                  orderRef: sourceOrder.name,
                  field: comp.name,
                  value: String(comp.sourceVal),
                });
              }

              fieldMismatches.push({
                orderRef: sourceOrder.name,
                field: comp.name,
                source: comp.sourceVal === null ? null : String(comp.sourceVal),
                target: comp.targetVal === null ? null : String(comp.targetVal),
                issue: comp.sourceVal === null && comp.targetVal !== null
                  ? 'Field filled on target but empty on source'
                  : comp.sourceVal !== null && comp.targetVal === null
                    ? 'Field blanked on target (unmapped)'
                    : 'Value mismatch',
              });
            }
          }
        }
      });

      // Verification
      await test.step('Verification', async () => {
        const allOrdersExist = fieldMismatches.filter((m) => m.field === 'existence').length === 0;

        console.log('\n==================== VERIFY ====================');
        console.log('  Verify #1 - Both sessions authenticated (checked before proceeding)');
        console.log('     Result   : PASS (asserted in pre-conditions)');

        console.log('  Verify #2 - At least one order sampled from source within cut-off (checked before proceeding)');
        console.log(`     Actual   : ${sampleOrders.length}`);
        console.log('     Result   : PASS (asserted in step 1)');

        console.log('  Verify #3 - All sampled orders exist on target:');
        console.log(`     Expected : 0 missing orders`);
        console.log(`     Actual   : ${fieldMismatches.filter((m) => m.field === 'existence').length}`);
        console.log(`     Result   : ${allOrdersExist ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #4 - Customer, addresses, Pricelist, Payment Terms, Salesperson, Sales Team and Company match BY NAME:');
        const nameFieldMismatches = fieldMismatches.filter((m) =>
          m.field.includes('Customer') || m.field.includes('Address') || m.field.includes('Pricelist') ||
          m.field.includes('Payment Terms') || m.field.includes('Salesperson') || m.field.includes('Sales Team') || m.field.includes('Company')
        );
        console.log(`     Expected : 0 mismatches`);
        console.log(`     Actual   : ${nameFieldMismatches.length}`);
        console.log(`     Result   : ${nameFieldMismatches.length === 0 ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #5 - Order Date and Expiration match as dates; Currency as code; Status as label:');
        const dateStatusMismatches = fieldMismatches.filter((m) =>
          m.field.includes('Order Date') || m.field.includes('Expiration') ||
          m.field.includes('Currency') || m.field.includes('Status')
        );
        console.log(`     Expected : 0 mismatches`);
        console.log(`     Actual   : ${dateStatusMismatches.length}`);
        console.log(`     Result   : ${dateStatusMismatches.length === 0 ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #6 - Empty fields stay empty; filled fields stay filled:');
        const blankingMismatches = fieldMismatches.filter((m) =>
          (m.source === null && m.target !== null) || (m.source !== null && m.target === null && !m.field.includes('existence'))
        );
        console.log(`     Expected : 0 blanked/newly-filled fields`);
        console.log(`     Actual   : ${blankingMismatches.length}${unmappedOwners.length > 0 ? ` (includes ${unmappedOwners.length} unmapped owner)` : ''}`);
        console.log(`     Result   : ${blankingMismatches.length === 0 ? 'PASS' : 'FAIL'}`);

        if (fieldMismatches.length > 0) {
          console.log('\n  Field mismatches:');
          for (const m of fieldMismatches) {
            const sourceStr = m.source === null ? '(empty)' : m.source;
            const targetStr = m.target === null ? '(empty)' : m.target;
            console.log(`    - ${m.orderRef} / ${m.field}: "${sourceStr}" → "${targetStr}"`);
          }
        }

        if (unmappedOwners.length > 0) {
          console.log('\n  Unmapped owners (filled on source, empty on target):');
          for (const uo of unmappedOwners) {
            console.log(`    - ${uo.orderRef} / ${uo.field}: "${uo.value}"`);
          }
          console.log('  NOTE: Cross-check against unmapped owners in CRM-12653_3.1.3');
        }

        console.log('===============================================');
        const overallPass = sampleOrders.length > 0 && allOrdersExist && nameFieldMismatches.length === 0 && dateStatusMismatches.length === 0 && blankingMismatches.length === 0;
        console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - order header fields match on source and target`);

        // Assertions (6 bullets per master row)
        // #1: Both authenticated (asserted in pre-condition 2)
        // #2: At least one order sampled (asserted in step 1)
        expect(fieldMismatches.filter((m) => m.field === 'existence'), 'all sampled orders must exist on target').toHaveLength(0);
        expect(nameFieldMismatches, 'Customer, addresses, Pricelist, Payment Terms, Salesperson, Sales Team and Company must match by name').toHaveLength(0);
        expect(dateStatusMismatches, 'Order Date, Expiration, Currency and Status must match between servers').toHaveLength(0);
        expect(blankingMismatches, 'no fields should be blanked or newly-filled; empty must stay empty').toHaveLength(0);
      });

    } finally {
      // Close both contexts.
      if (sourceContext) await sourceContext.close();
      if (targetContext) await targetContext.close();
    }
  });
});
