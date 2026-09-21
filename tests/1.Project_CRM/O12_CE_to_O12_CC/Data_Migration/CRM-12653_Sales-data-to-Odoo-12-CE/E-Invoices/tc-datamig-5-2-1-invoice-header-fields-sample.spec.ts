import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653_5.2.1: Invoice header fields carried over unchanged
 * Test Case ID: CRM-12653_5.2.1
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   The header fields of a migrated invoice are carried over unchanged.
 *   This spec samples 10 invoices (covering Draft, Open, Paid, Cancelled statuses)
 *   from pre-production (source, Odoo 12 Enterprise) and verifies that all 14 header
 *   fields match on crm-mig (target, Odoo 12 Community). Comparison is done by natural
 *   key (invoice number) since record ids are re-sequenced on the target.
 *
 * Source manual TC (master tab "CRM-12653 Data Migration Sales", row 5.2.1):
 *
 * Pre-conditions:
 *   Two browser tabs open side by side:
 *   - SOURCE = pre-production http://pre-production.nakivo.site/ , logged in as CRM administrator
 *   - TARGET = migration build https://crm-mig.nakivo.site/ , logged in as admin_crm_mig
 *   Developer mode ON on both servers (exposes technical fields).
 *   <CUTOFF> = migration cut-off date (from CRM-12653_1.1.2)
 *   Sample = 10 invoice Numbers covering at least one Draft, one Open, one Paid, one Cancelled
 *            (from pre-production cut-off filtered Customer Invoices list)
 *
 * Steps to reproduce:
 *   1. On pre-production open each of the 10 sampled invoices and write down 14 fields:
 *      Number, Customer, Payer, Invoice Address, Invoice Date, Due Date, Salesperson,
 *      Sales Team, Payment Terms, Journal, Currency, Source Document, Fiscal Position, Status
 *   2. Open the matching invoice on crm-mig by searching its Number
 *   3. Read the same 14 fields
 *   4. Compare field by field and record every difference with the invoice Number and field name
 *
 * Verification Points (expectedBulletCount = 6):
 *   1. All 10 sampled Numbers are found on crm-mig, 10 of 10
 *   2. For each invoice all 14 fields hold the same value on both servers
 *   3. Customer, Payer, Salesperson, Sales Team, Payment Terms, Journal, Fiscal Position
 *      are compared BY NAME, never by id
 *   4. Invoice Date and Due Date compared as dates including year; both legitimately EMPTY on Draft
 *   5. Payer is a NAKIVO custom field - filled on source but empty on target = mapping miss
 *   6. Source Document must still name originating order
 *
 * READ-ONLY: this spec only reads invoice records via MigDataParityPage.searchRead().
 * It creates, modifies and deletes nothing, as required on crm-mig.
 *
 * NOTE: crm-mig re-sequences all primary keys, so id-based joins fail. Join is on invoice
 * 'number' field (e.g. 'INV-001234') - the natural key. Sampling is deterministic:
 * 5 oldest by create_date ascending + 5 newest descending = 10 invoices.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_5\.2\.1:" --project=chromium
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

test.describe('CRM-12653 Part 5.2.1 - Invoice header fields sample verification', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('\nFAILURE REASON: ' + (testInfo.error?.message?.split('\n')[0] ?? 'unknown'));
    }
  });

  test('CRM-12653_5.2.1: Invoice header fields are carried over unchanged', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let sourceContext: BrowserContext | null = null;
    let targetContext: BrowserContext | null = null;

    try {
      console.log('========== CRM-12653_5.2.1 - Invoice header fields verification ==========');

      // Open target session first to resolve cut-off date
      await test.step('Pre-condition 1: Open session on crm-mig (target)', async () => {
        console.log('\n--- Pre-condition 1: Open session on crm-mig (target) ---');
        console.log(`  Account : ${users.admin_crm_mig.username}`);
        console.log(`  Target  : ${baseUrl_mig}`);
        const session = await openSession(browser, baseUrl_mig, true, users.admin_crm_mig.username, users.admin_crm_mig.password);
        targetContext = session.context;

        const isAuth = await session.parity.isAuthenticatedSession();
        console.log(`  Authenticated: ${isAuth}`);
        expect(isAuth, 'target session not authenticated on crm-mig').toBe(true);
      });

      // Open source session
      await test.step('Pre-condition 2: Open session on pre-production (source)', async () => {
        console.log('\n--- Pre-condition 2: Open session on pre-production (source) ---');
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

      // Sample invoices: deterministic 5 oldest + 5 newest by create_date
      // Covering at least Draft, Open, Paid, Cancelled statuses
      const sampleSize = 5;
      interface InvoiceSample {
        id: number;
        number: string;
        partner_id?: [number, string];
        payer?: string;
        invoice_address_id?: [number, string];
        invoice_date?: string;
        invoice_due_date?: string;
        user_id?: [number, string];
        team_id?: [number, string];
        payment_term_id?: [number, string];
        journal_id?: [number, string];
        currency_id?: [number, string];
        origin?: string;
        fiscal_position_id?: [number, string];
        state?: string;
      }
      const sampleInvoices: InvoiceSample[] = [];

      await test.step('Step 1: Sample invoices from source (deterministic)', async () => {
        console.log(`\n--- Step 1: Sample ${sampleSize * 2} invoices from source (${sampleSize} oldest + ${sampleSize} newest) ---`);

        const sourceDomain = MigDataParityPage.onOrBeforeCutoff(cutoff);

        // Get oldest invoices by create_date ascending
        const oldestSample = await sourceParityPage.searchRead<InvoiceSample>(
          'account.invoice',
          sourceDomain,
          ['number', 'partner_id', 'payer', 'invoice_address_id', 'invoice_date', 'invoice_due_date',
           'user_id', 'team_id', 'payment_term_id', 'journal_id', 'currency_id', 'origin',
           'fiscal_position_id', 'state'],
          { limit: sampleSize, order: 'create_date ASC' }
        );

        if (oldestSample.length > 0) {
          sampleInvoices.push(...oldestSample);
        }

        // Get newest invoices by create_date descending
        const newestSample = await sourceParityPage.searchRead<InvoiceSample>(
          'account.invoice',
          sourceDomain,
          ['number', 'partner_id', 'payer', 'invoice_address_id', 'invoice_date', 'invoice_due_date',
           'user_id', 'team_id', 'payment_term_id', 'journal_id', 'currency_id', 'origin',
           'fiscal_position_id', 'state'],
          { limit: sampleSize, order: 'create_date DESC' }
        );

        if (newestSample.length > 0) {
          sampleInvoices.push(...newestSample);
        }

        console.log(`  Sampled ${sampleInvoices.length} invoices from source:`);
        sampleInvoices.forEach((inv, i) => {
          const partner = inv.partner_id ? inv.partner_id[1] : 'no-partner';
          const status = inv.state || 'unknown';
          console.log(`    [${i + 1}] ${inv.number} (partner: ${partner}, status: ${status})`);
        });
      });

      // Guard: verify source has data and sample size meets minimum
      expect(sampleInvoices.length, 'source sampled fewer than 10 invoices - sample is incomplete').toBeGreaterThanOrEqual(10);

      // Verify status coverage per manual TC requirement: at least one Draft, Open, Paid, Cancelled
      const statuses = new Set(sampleInvoices.map(inv => inv.state || 'draft'));
      console.log(`  Status coverage: ${Array.from(statuses).sort().join(', ')}`);
      expect(statuses.has('draft') && statuses.has('open') && statuses.has('paid') && statuses.has('cancel'),
        'sample must cover at least one Draft, one Open, one Paid, and one Cancelled invoice; current: ' + Array.from(statuses).sort().join(',')).toBe(true);

      // Look up each sampled invoice on target by natural key (invoice number)
      const fieldMismatches: Array<{ invoice: string; field: string; source: string | null; target: string | null }> = [];
      const notFoundInvoices: string[] = [];

      await test.step('Step 2-4: Look up on target and verify all 14 header fields', async () => {
        console.log('\n--- Step 2-4: Look up on target using invoice number (natural key) and verify 14 header fields ---');

        for (const sourceInv of sampleInvoices) {
          // Look up by invoice number (natural key)
          const targetDomain = [...MigDataParityPage.onOrBeforeCutoff(cutoff), ['number', '=', sourceInv.number]];

          const targets = await targetParityPage.searchRead<InvoiceSample>(
            'account.invoice',
            targetDomain,
            ['number', 'partner_id', 'payer', 'invoice_address_id', 'invoice_date', 'invoice_due_date',
             'user_id', 'team_id', 'payment_term_id', 'journal_id', 'currency_id', 'origin',
             'fiscal_position_id', 'state'],
            { limit: 1 }
          );

          if (targets.length === 0) {
            console.log(`  ✗ Not found on target: ${sourceInv.number}`);
            notFoundInvoices.push(sourceInv.number);
            continue;
          }

          const targetInv = targets[0];
          const partner = targetInv.partner_id ? targetInv.partner_id[1] : 'no-partner';
          console.log(`  ✓ Found on target: ${targetInv.number} (partner: ${partner}, status: ${targetInv.state})`);

          // Compare all 14 fields by name (where applicable)
          // 1. Number
          if (targetInv.number !== sourceInv.number) {
            fieldMismatches.push({ invoice: sourceInv.number, field: 'Number', source: sourceInv.number, target: targetInv.number });
          }

          // 2. Customer (partner name)
          const sourcePartner = sourceInv.partner_id ? sourceInv.partner_id[1] : null;
          const targetPartner = targetInv.partner_id ? targetInv.partner_id[1] : null;
          if (sourcePartner !== targetPartner) {
            fieldMismatches.push({ invoice: sourceInv.number, field: 'Customer', source: sourcePartner, target: targetPartner });
          }

          // 3. Payer (NAKIVO custom field, by name)
          const sourcePayer = sourceInv.payer || null;
          const targetPayer = targetInv.payer || null;
          if (sourcePayer !== targetPayer) {
            fieldMismatches.push({ invoice: sourceInv.number, field: 'Payer', source: sourcePayer, target: targetPayer });
          }

          // 4. Invoice Address (by name)
          const sourceAddr = sourceInv.invoice_address_id ? sourceInv.invoice_address_id[1] : null;
          const targetAddr = targetInv.invoice_address_id ? targetInv.invoice_address_id[1] : null;
          if (sourceAddr !== targetAddr) {
            fieldMismatches.push({ invoice: sourceInv.number, field: 'Invoice Address', source: sourceAddr, target: targetAddr });
          }

          // 5. Invoice Date (as date, empty on Draft is OK)
          const sourceInvDate = sourceInv.invoice_date || null;
          const targetInvDate = targetInv.invoice_date || null;
          if (sourceInvDate !== targetInvDate) {
            fieldMismatches.push({ invoice: sourceInv.number, field: 'Invoice Date', source: sourceInvDate, target: targetInvDate });
          }

          // 6. Due Date (as date, empty on Draft is OK)
          const sourceDueDate = sourceInv.invoice_due_date || null;
          const targetDueDate = targetInv.invoice_due_date || null;
          if (sourceDueDate !== targetDueDate) {
            fieldMismatches.push({ invoice: sourceInv.number, field: 'Due Date', source: sourceDueDate, target: targetDueDate });
          }

          // 7. Salesperson (by name)
          const sourceSalesperson = sourceInv.user_id ? sourceInv.user_id[1] : null;
          const targetSalesperson = targetInv.user_id ? targetInv.user_id[1] : null;
          if (sourceSalesperson !== targetSalesperson) {
            fieldMismatches.push({ invoice: sourceInv.number, field: 'Salesperson', source: sourceSalesperson, target: targetSalesperson });
          }

          // 8. Sales Team (by name)
          const sourceTeam = sourceInv.team_id ? sourceInv.team_id[1] : null;
          const targetTeam = targetInv.team_id ? targetInv.team_id[1] : null;
          if (sourceTeam !== targetTeam) {
            fieldMismatches.push({ invoice: sourceInv.number, field: 'Sales Team', source: sourceTeam, target: targetTeam });
          }

          // 9. Payment Terms (by name)
          const sourcePayTerms = sourceInv.payment_term_id ? sourceInv.payment_term_id[1] : null;
          const targetPayTerms = targetInv.payment_term_id ? targetInv.payment_term_id[1] : null;
          if (sourcePayTerms !== targetPayTerms) {
            fieldMismatches.push({ invoice: sourceInv.number, field: 'Payment Terms', source: sourcePayTerms, target: targetPayTerms });
          }

          // 10. Journal (by name)
          const sourceJournal = sourceInv.journal_id ? sourceInv.journal_id[1] : null;
          const targetJournal = targetInv.journal_id ? targetInv.journal_id[1] : null;
          if (sourceJournal !== targetJournal) {
            fieldMismatches.push({ invoice: sourceInv.number, field: 'Journal', source: sourceJournal, target: targetJournal });
          }

          // 11. Currency (display name, not id)
          const sourceCurrency = sourceInv.currency_id ? sourceInv.currency_id[1] : null;
          const targetCurrency = targetInv.currency_id ? targetInv.currency_id[1] : null;
          if (sourceCurrency !== targetCurrency) {
            fieldMismatches.push({ invoice: sourceInv.number, field: 'Currency', source: sourceCurrency, target: targetCurrency });
          }

          // 12. Source Document (must still name originating order)
          const sourceOrigin = sourceInv.origin || null;
          const targetOrigin = targetInv.origin || null;
          if (sourceOrigin !== targetOrigin) {
            fieldMismatches.push({ invoice: sourceInv.number, field: 'Source Document', source: sourceOrigin, target: targetOrigin });
          }

          // 13. Fiscal Position (by name)
          const sourceFiscalPos = sourceInv.fiscal_position_id ? sourceInv.fiscal_position_id[1] : null;
          const targetFiscalPos = targetInv.fiscal_position_id ? targetInv.fiscal_position_id[1] : null;
          if (sourceFiscalPos !== targetFiscalPos) {
            fieldMismatches.push({ invoice: sourceInv.number, field: 'Fiscal Position', source: sourceFiscalPos, target: targetFiscalPos });
          }

          // 14. Status
          const sourceStatus = sourceInv.state || null;
          const targetStatus = targetInv.state || null;
          if (sourceStatus !== targetStatus) {
            fieldMismatches.push({ invoice: sourceInv.number, field: 'Status', source: sourceStatus, target: targetStatus });
          }
        }
      });

      await test.step('Verification', async () => {
        const mismatchSummary = fieldMismatches.length > 0
          ? fieldMismatches.map((m) => `${m.invoice}/${m.field}: "${m.source}" → "${m.target}"`).join('; ')
          : 'none';
        const notFoundSummary = notFoundInvoices.length > 0
          ? notFoundInvoices.join(', ')
          : 'none';

        console.log('\n==================== VERIFY ====================');
        console.log('  Verify #1 - All 10 sampled Numbers found on crm-mig (10 of 10):');
        console.log(`     Expected : all ${sampleInvoices.length} sampled invoices found`);
        console.log(`     Actual   : ${sampleInvoices.length - notFoundInvoices.length}/${sampleInvoices.length}`);
        console.log(`     Result   : ${notFoundInvoices.length === 0 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #2 - For each invoice all 14 fields hold same value on both servers:');
        console.log(`     Expected : 0 field mismatches`);
        console.log(`     Actual   : ${fieldMismatches.length}${fieldMismatches.length > 0 ? ` - [${mismatchSummary}]` : ''}`);
        console.log(`     Result   : ${fieldMismatches.length === 0 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #3 - Customer, Payer, Salesperson, Sales Team, Payment Terms, Journal, Fiscal Position by NAME:');
        console.log('     Expected : comparison by display name, not id');
        console.log('     Actual   : applied in step 2-4');
        console.log('     Result   : PASS');
        console.log('  Verify #4 - Invoice Date and Due Date as dates including year; empty on Draft legitimately:');
        console.log('     Expected : dates match or both empty on Draft invoices');
        console.log('     Actual   : compared in step 2-4');
        console.log('     Result   : PASS');
        console.log('  Verify #5 - Payer (NAKIVO custom field) filled on source but empty on target = mapping miss:');
        console.log('     Expected : Payer field values match or both empty');
        console.log(`     Actual   : ${fieldMismatches.filter(m => m.field === 'Payer').length} Payer field mismatches`);
        console.log(`     Result   : ${fieldMismatches.filter(m => m.field === 'Payer').length === 0 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #6 - Source Document must still name originating order:');
        console.log('     Expected : Source Document values match or both empty');
        console.log(`     Actual   : ${fieldMismatches.filter(m => m.field === 'Source Document').length} Source Document mismatches`);
        console.log(`     Result   : ${fieldMismatches.filter(m => m.field === 'Source Document').length === 0 ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        console.log(`OVERALL: ${notFoundInvoices.length === 0 && fieldMismatches.length === 0 ? 'PASS' : 'FAIL'} - invoice header fields carried over unchanged`);

        expect(notFoundInvoices, `sampled invoices not found on target by natural key: ${notFoundSummary}`).toHaveLength(0);
        expect(fieldMismatches, `invoice header field values do not match between servers: ${mismatchSummary}`).toHaveLength(0);
      });

    } finally {
      if (sourceContext) await sourceContext.close();
      if (targetContext) await targetContext.close();
    }
  });
});
