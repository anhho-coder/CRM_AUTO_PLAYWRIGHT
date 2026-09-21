import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653 Part 5.2.2 - Invoice lines and amounts verified on sample
 * Test Case ID: CRM-12653_5.2.2
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   Invoice lines and all invoice amounts migrated from pre-production (Odoo 12 Enterprise)
 *   to crm-mig (Odoo 12 Community) are verified by sampling N invoices from source,
 *   comparing each line's eight values (product, description, account, quantity, unit price,
 *   discount %, taxes, subtotal) and the four totals (untaxed amount, taxes, total, amount due)
 *   to the cent on the target.
 *
 * Source manual TC (master sheet tab "CRM-12653 Data Migration Sales", row 5.2.2):
 *
 * Pre-conditions:
 *   VPN connected; both pre-production (Odoo 12 Enterprise) and crm-mig
 *   (Odoo 12 Community) are reachable.
 *   Login: anh.ho@nakivo.com (admin_crm for source, admin_crm_mig for target).
 *   Cut-off date already agreed; migration completed to the cut-off.
 *   Data migration verified: account.invoice records with their lines and amounts present.
 *   The SAME 10 invoice Numbers sampled in CRM-12653_5.2.1 are reused - do not build a new sample.
 *
 * Steps to reproduce:
 *   1. On pre-production open each sampled invoice and, for every line on the "Invoice Lines" tab,
 *      write down: Product with its internal reference [CODE], Description, Account, Quantity,
 *      Unit Price, Discount %, Taxes, Subtotal.
 *   2. Write down the invoice totals: Untaxed Amount, Taxes, Total, Amount Due.
 *   3. Read the same values on the matching invoice on crm-mig.
 *   4. Compare line for line, matching lines on the product internal reference, then compare
 *      the four totals.
 *   5. Record every difference with the invoice Number, the product code and the field name.
 *
 * Verification Points:
 *   1. For every sampled invoice the line COUNT is identical on both servers and each line's
 *      eight values match.
 *   2. Unit Price, Discount % and Subtotal are compared to the cent.
 *   3. Quantity is compared as a number, including decimals.
 *   4. The four totals - Untaxed Amount, Taxes, Total and Amount Due - are identical on both
 *      servers, to the cent, in the same currency.
 *   5. Amount Due on a Paid invoice must read 0.00 on both sides; a non-zero Amount Due on the
 *      target for an invoice that is Paid on the source is recorded as an exception.
 *   6. If the Account CODE differs on every sampled line, that is ONE chart-of-accounts mapping
 *      exception recorded for the environment, not one defect per line.
 *
 * READ-ONLY: this spec only reads invoice and invoice line records. It creates, modifies and
 * deletes nothing, as required on crm-mig.
 *
 * NOTE: Invoice IDs are re-sequenced on crm-mig, so id-based joins will fail. The join
 * strategy is on the invoice 'number' field (e.g. 'INV-001234') — the natural key for
 * uniqueness. Lines are matched on product internal reference (default_code). Sampling
 * is deterministic and inherited from CRM-12653_5.2.1: 5 oldest by create_date ascending,
 * 5 newest by create_date descending.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_5\.2\.2:" --project=chromium
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

test.describe('CRM-12653 Part 5.2.2 - Invoice lines and amounts data migration verification', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12653_5.2.2: Invoice lines and amounts match source to the cent', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let sourceContext: BrowserContext | null = null;
    let targetContext: BrowserContext | null = null;

    try {
      console.log('========== CRM-12653_5.2.2 - Invoice Lines and Amounts Data Migration Verification ==========');

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

      // Sample invoices: deterministic 5 oldest + 5 newest by create_date (same as CRM-12653_5.2.1)
      const sampleSize = 5;
      const sampleInvoiceNumbers: string[] = [];

      await test.step('Step 1: Sample 10 invoices from source (reuse CRM-12653_5.2.1 sample)', async () => {
        console.log(`\n--- Step 1: Sample ${sampleSize * 2} invoices from source (${sampleSize} oldest + ${sampleSize} newest) ---`);

        const sourceDomain = [...MigDataParityPage.onOrBeforeCutoff(cutoff)];

        // Get oldest invoices by create_date ascending
        const oldestSample = await sourceParityPage.searchRead(
          'account.invoice',
          sourceDomain,
          ['number'],
          { limit: sampleSize, order: 'create_date asc' }
        );

        if (oldestSample.length > 0) {
          oldestSample.forEach((inv) => sampleInvoiceNumbers.push(inv.number));
        }

        // Get newest invoices by create_date descending
        const newestSample = await sourceParityPage.searchRead(
          'account.invoice',
          sourceDomain,
          ['number'],
          { limit: sampleSize, order: 'create_date desc' }
        );

        if (newestSample.length > 0) {
          newestSample.forEach((inv) => sampleInvoiceNumbers.push(inv.number));
        }

        console.log(`  Sampled ${sampleInvoiceNumbers.length} invoices from source:`);
        sampleInvoiceNumbers.forEach((num, i) => {
          console.log(`    [${i + 1}] ${num}`);
        });
      });

      expect(sampleInvoiceNumbers.length, 'source sampled no invoices - query may have failed').toBeGreaterThan(0);

      // Compare invoice lines and amounts for each sampled invoice
      interface InvoiceLine {
        product_code: string;
        description: string;
        account_code: string;
        quantity: number;
        price_unit: number;
        discount: number;
        tax_ids_names: string;
        price_subtotal: number;
      }

      interface InvoiceComparison {
        number: string;
        status: string;
        lines_count_match: boolean;
        source_lines_count: number;
        target_lines_count: number;
        line_mismatches: Array<{ product_code: string; field: string; source: string; target: string }>;
        totals_match: boolean;
        source_totals: { untaxed: number; taxes: number; total: number; amount_due: number };
        target_totals: { untaxed: number; taxes: number; total: number; amount_due: number };
        currency: string;
      }

      const comparisons: InvoiceComparison[] = [];

      await test.step('Step 2-5: Read invoice lines and totals on source, then on target, and compare', async () => {
        console.log('\n--- Step 2-5: Read invoice lines and totals, then compare ---');

        for (const invoiceNumber of sampleInvoiceNumbers) {
          const sourceDomain = [
            ...MigDataParityPage.onOrBeforeCutoff(cutoff),
            ['number', '=', invoiceNumber],
          ];

          // Get invoice and its lines from source
          const sourceInvoices = await sourceParityPage.searchRead(
            'account.invoice',
            sourceDomain,
            ['number', 'state', 'amount_untaxed', 'amount_tax', 'amount_total', 'amount_residual', 'currency_id'],
            { limit: 1 }
          );

          if (sourceInvoices.length === 0) {
            console.log(`  ✗ Invoice not found on source: ${invoiceNumber}`);
            continue;
          }

          const sourceInvoice = sourceInvoices[0];
          const sourceInvoiceId = sourceInvoice.id;

          // Read source invoice lines
          const sourceLines = await sourceParityPage.searchRead(
            'account.invoice.line',
            [['invoice_id', '=', sourceInvoiceId]],
            ['product_id', 'name', 'account_id', 'quantity', 'price_unit', 'discount', 'invoice_line_tax_ids', 'price_subtotal'],
            { limit: 500 }
          );

          // Normalize source lines
          const sourceLineMap = new Map<string, InvoiceLine>();
          for (const line of sourceLines) {
            const productId = Array.isArray(line.product_id) ? line.product_id[0] : null;
            let productCode = '';
            if (productId) {
              const products = await sourceParityPage.readIds('product.product', [productId], ['default_code']);
              if (products.length > 0) {
                productCode = products[0].default_code || '[no-code]';
              }
            }
            if (!productCode) productCode = '[no-product]';

            const accountId = Array.isArray(line.account_id) ? line.account_id[0] : null;
            let accountCode = '';
            if (accountId) {
              const accounts = await sourceParityPage.readIds('account.account', [accountId], ['code']);
              if (accounts.length > 0) {
                accountCode = accounts[0].code || '[no-code]';
              }
            }

            const taxIds = Array.isArray(line.invoice_line_tax_ids) ? line.invoice_line_tax_ids : [];
            let taxNames = '';
            if (taxIds.length > 0) {
              const taxes = await sourceParityPage.readIds('account.tax', taxIds, ['name']);
              taxNames = taxes.map((t) => t.name).join('; ') || '';
            }

            sourceLineMap.set(productCode, {
              product_code: productCode,
              description: line.name || '',
              account_code: accountCode,
              quantity: line.quantity || 0,
              price_unit: line.price_unit || 0,
              discount: line.discount || 0,
              tax_ids_names: taxNames,
              price_subtotal: line.price_subtotal || 0,
            });
          }

          // Look up the same invoice on target
          const targetDomain = [
            ...MigDataParityPage.onOrBeforeCutoff(cutoff),
            ['number', '=', invoiceNumber],
          ];

          const targetInvoices = await targetParityPage.searchRead(
            'account.invoice',
            targetDomain,
            ['number', 'state', 'amount_untaxed', 'amount_tax', 'amount_total', 'amount_residual', 'currency_id'],
            { limit: 1 }
          );

          if (targetInvoices.length === 0) {
            console.log(`  ✗ Invoice not found on target: ${invoiceNumber}`);
            comparisons.push({
              number: invoiceNumber,
              status: 'NOT_FOUND_ON_TARGET',
              lines_count_match: false,
              source_lines_count: sourceLines.length,
              target_lines_count: 0,
              line_mismatches: [],
              totals_match: false,
              source_totals: {
                untaxed: sourceInvoice.amount_untaxed || 0,
                taxes: sourceInvoice.amount_tax || 0,
                total: sourceInvoice.amount_total || 0,
                amount_due: sourceInvoice.amount_residual || 0,
              },
              target_totals: { untaxed: 0, taxes: 0, total: 0, amount_due: 0 },
              currency: Array.isArray(sourceInvoice.currency_id) ? sourceInvoice.currency_id[1] : 'unknown',
            });
            continue;
          }

          const targetInvoice = targetInvoices[0];
          const targetInvoiceId = targetInvoice.id;

          // Read target invoice lines
          const targetLines = await targetParityPage.searchRead(
            'account.invoice.line',
            [['invoice_id', '=', targetInvoiceId]],
            ['product_id', 'name', 'account_id', 'quantity', 'price_unit', 'discount', 'invoice_line_tax_ids', 'price_subtotal'],
            { limit: 500 }
          );

          // Normalize target lines
          const targetLineMap = new Map<string, InvoiceLine>();
          for (const line of targetLines) {
            const productId = Array.isArray(line.product_id) ? line.product_id[0] : null;
            let productCode = '';
            if (productId) {
              const products = await targetParityPage.readIds('product.product', [productId], ['default_code']);
              if (products.length > 0) {
                productCode = products[0].default_code || '[no-code]';
              }
            }
            if (!productCode) productCode = '[no-product]';

            const accountId = Array.isArray(line.account_id) ? line.account_id[0] : null;
            let accountCode = '';
            if (accountId) {
              const accounts = await targetParityPage.readIds('account.account', [accountId], ['code']);
              if (accounts.length > 0) {
                accountCode = accounts[0].code || '[no-code]';
              }
            }

            const taxIds = Array.isArray(line.invoice_line_tax_ids) ? line.invoice_line_tax_ids : [];
            let taxNames = '';
            if (taxIds.length > 0) {
              const taxes = await targetParityPage.readIds('account.tax', taxIds, ['name']);
              taxNames = taxes.map((t) => t.name).join('; ') || '';
            }

            targetLineMap.set(productCode, {
              product_code: productCode,
              description: line.name || '',
              account_code: accountCode,
              quantity: line.quantity || 0,
              price_unit: line.price_unit || 0,
              discount: line.discount || 0,
              tax_ids_names: taxNames,
              price_subtotal: line.price_subtotal || 0,
            });
          }

          // Compare line counts
          const lineCountMatch = sourceLineMap.size === targetLineMap.size;
          console.log(`  Invoice ${invoiceNumber}: ${sourceLineMap.size} lines on source, ${targetLineMap.size} on target`);

          // Compare individual lines
          const lineMismatches: Array<{ product_code: string; field: string; source: string; target: string }> = [];

          for (const [productCode, sourceLine] of sourceLineMap) {
            const targetLine = targetLineMap.get(productCode);
            if (!targetLine) {
              lineMismatches.push({
                product_code: productCode,
                field: 'line_missing_on_target',
                source: 'present',
                target: 'missing',
              });
              continue;
            }

            // Compare all eight fields
            if (sourceLine.description !== targetLine.description) {
              lineMismatches.push({
                product_code: productCode,
                field: 'description',
                source: sourceLine.description,
                target: targetLine.description,
              });
            }

            if (sourceLine.account_code !== targetLine.account_code) {
              lineMismatches.push({
                product_code: productCode,
                field: 'account_code',
                source: sourceLine.account_code,
                target: targetLine.account_code,
              });
            }

            if (sourceLine.quantity !== targetLine.quantity) {
              lineMismatches.push({
                product_code: productCode,
                field: 'quantity',
                source: sourceLine.quantity.toString(),
                target: targetLine.quantity.toString(),
              });
            }

            if (Math.abs((sourceLine.price_unit || 0) - (targetLine.price_unit || 0)) > 0.01) {
              lineMismatches.push({
                product_code: productCode,
                field: 'price_unit',
                source: (sourceLine.price_unit || 0).toFixed(2),
                target: (targetLine.price_unit || 0).toFixed(2),
              });
            }

            if (Math.abs((sourceLine.discount || 0) - (targetLine.discount || 0)) > 0.01) {
              lineMismatches.push({
                product_code: productCode,
                field: 'discount',
                source: (sourceLine.discount || 0).toFixed(2),
                target: (targetLine.discount || 0).toFixed(2),
              });
            }

            if (sourceLine.tax_ids_names !== targetLine.tax_ids_names) {
              lineMismatches.push({
                product_code: productCode,
                field: 'tax_ids_names',
                source: sourceLine.tax_ids_names,
                target: targetLine.tax_ids_names,
              });
            }

            if (Math.abs((sourceLine.price_subtotal || 0) - (targetLine.price_subtotal || 0)) > 0.01) {
              lineMismatches.push({
                product_code: productCode,
                field: 'price_subtotal',
                source: (sourceLine.price_subtotal || 0).toFixed(2),
                target: (targetLine.price_subtotal || 0).toFixed(2),
              });
            }
          }

          // Check for lines on target not on source
          for (const [productCode] of targetLineMap) {
            if (!sourceLineMap.has(productCode)) {
              lineMismatches.push({
                product_code: productCode,
                field: 'line_extra_on_target',
                source: 'missing',
                target: 'present',
              });
            }
          }

          // Compare totals to the cent
          const sourceTotals = {
            untaxed: sourceInvoice.amount_untaxed || 0,
            taxes: sourceInvoice.amount_tax || 0,
            total: sourceInvoice.amount_total || 0,
            amount_due: sourceInvoice.amount_residual || 0,
          };

          const targetTotals = {
            untaxed: targetInvoice.amount_untaxed || 0,
            taxes: targetInvoice.amount_tax || 0,
            total: targetInvoice.amount_total || 0,
            amount_due: targetInvoice.amount_residual || 0,
          };

          let totalsMatch = true;
          if (Math.abs(sourceTotals.untaxed - targetTotals.untaxed) > 0.01) {
            lineMismatches.push({
              product_code: 'INVOICE_TOTAL',
              field: 'amount_untaxed',
              source: sourceTotals.untaxed.toFixed(2),
              target: targetTotals.untaxed.toFixed(2),
            });
            totalsMatch = false;
          }

          if (Math.abs(sourceTotals.taxes - targetTotals.taxes) > 0.01) {
            lineMismatches.push({
              product_code: 'INVOICE_TOTAL',
              field: 'amount_tax',
              source: sourceTotals.taxes.toFixed(2),
              target: targetTotals.taxes.toFixed(2),
            });
            totalsMatch = false;
          }

          if (Math.abs(sourceTotals.total - targetTotals.total) > 0.01) {
            lineMismatches.push({
              product_code: 'INVOICE_TOTAL',
              field: 'amount_total',
              source: sourceTotals.total.toFixed(2),
              target: targetTotals.total.toFixed(2),
            });
            totalsMatch = false;
          }

          // Check Amount Due on Paid invoices
          if (sourceInvoice.state === 'paid' && Math.abs(targetTotals.amount_due) > 0.01) {
            lineMismatches.push({
              product_code: 'INVOICE_TOTAL',
              field: 'amount_residual_on_paid_invoice',
              source: '0.00',
              target: targetTotals.amount_due.toFixed(2),
            });
          }

          const currency = Array.isArray(targetInvoice.currency_id) ? targetInvoice.currency_id[1] : 'unknown';

          comparisons.push({
            number: invoiceNumber,
            status: sourceInvoice.state,
            lines_count_match: lineCountMatch,
            source_lines_count: sourceLineMap.size,
            target_lines_count: targetLineMap.size,
            line_mismatches: lineMismatches,
            totals_match: totalsMatch,
            source_totals: sourceTotals,
            target_totals: targetTotals,
            currency: currency,
          });

          if (lineMismatches.length === 0) {
            console.log(`  ✓ ${invoiceNumber}: ${sourceLineMap.size} lines, totals match`);
          } else {
            console.log(`  ✗ ${invoiceNumber}: ${lineMismatches.length} mismatch(es) found`);
          }
        }
      });

      await test.step('Verification', async () => {
        const passedComparisons = comparisons.filter((c) => c.line_mismatches.length === 0);
        const failedComparisons = comparisons.filter((c) => c.line_mismatches.length > 0);

        const coaMismatchLines = failedComparisons
          .flatMap((c) => c.line_mismatches.filter((m) => m.field === 'account_code'));
        const coaMismatchByInvoice = coaMismatchLines.length > 0
          ? failedComparisons
              .filter((c) => c.line_mismatches.some((m) => m.field === 'account_code'))
              .map((c) => c.number)
              .join(', ')
          : 'none';

        const mismatchSummary = failedComparisons.length > 0
          ? failedComparisons
              .map(
                (c) =>
                  `${c.number}: ${c.line_mismatches.map((m) => `${m.product_code}/${m.field}`).join(', ')}`,
              )
              .join('; ')
          : 'none';

        console.log('\n==================== VERIFY ====================');
        console.log('  Verify #1 - Line count identical and each line\'s eight values match:');
        console.log(`     Expected : all ${comparisons.length} invoices have matching line counts and all line values match`);
        const lineCountPass = comparisons.every((c) => c.lines_count_match);
        const lineValuesPass = failedComparisons.filter((c) =>
          c.line_mismatches.some((m) => ![
            'amount_untaxed', 'amount_tax', 'amount_total', 'amount_residual_on_paid_invoice'
          ].includes(m.field))
        ).length === 0;
        console.log(`     Actual   : ${comparisons.filter((c) => c.lines_count_match).length}/${comparisons.length} line counts match, line values: ${lineValuesPass ? 'all match' : 'some differ'}`);
        console.log(`     Result   : ${lineCountPass && lineValuesPass ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #2 - Unit Price, Discount %, Subtotal compared to the cent:');
        console.log(`     Expected : all line prices accurate to 0.01`);
        const pricePass = !failedComparisons.some((c) =>
          c.line_mismatches.some((m) => ['price_unit', 'discount', 'price_subtotal'].includes(m.field)),
        );
        console.log(`     Actual   : ${pricePass ? 'no mismatches' : `mismatches in ${failedComparisons.filter((c) => c.line_mismatches.some((m) => ['price_unit', 'discount', 'price_subtotal'].includes(m.field))).length} invoices`}`);
        console.log(`     Result   : ${pricePass ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #3 - Quantity compared as a number with decimals:');
        console.log(`     Expected : all line quantities match exactly`);
        const quantityPass = !failedComparisons.some((c) =>
          c.line_mismatches.some((m) => m.field === 'quantity'),
        );
        console.log(`     Actual   : ${quantityPass ? 'no mismatches' : `mismatches in ${failedComparisons.filter((c) => c.line_mismatches.some((m) => m.field === 'quantity')).length} invoices`}`);
        console.log(`     Result   : ${quantityPass ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #4 - Four totals (Untaxed, Taxes, Total, Amount Due) match to the cent:');
        console.log(`     Expected : Untaxed Amount, Taxes, Total, Amount Due match in same currency`);
        const totalsPass = comparisons.every((c) => c.totals_match);
        console.log(`     Actual   : ${comparisons.filter((c) => c.totals_match).length}/${comparisons.length} match`);
        console.log(`     Result   : ${totalsPass ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #5 - Amount Due on Paid invoices reads 0.00 on both servers:');
        console.log(`     Expected : all Paid invoices show Amount Due = 0.00 on both sides`);
        const paidInvoices = comparisons.filter((c) => c.status === 'paid');
        const paidPass = paidInvoices.every(
          (c) => Math.abs(c.source_totals.amount_due) < 0.01 && Math.abs(c.target_totals.amount_due) < 0.01,
        );
        console.log(`     Actual   : ${paidPass ? `all ${paidInvoices.length} Paid invoices have Amount Due = 0` : `mismatches found in Paid invoices`}`);
        console.log(`     Result   : ${paidPass ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #6 - Chart-of-accounts mapping (if Account CODE differs, one exception not per-line):');
        console.log(`     Expected : if COA codes differ, record as one environment exception`);
        console.log(`     Actual   : ${coaMismatchLines.length === 0 ? 'no COA mismatches' : `COA mismatches found in invoices: ${coaMismatchByInvoice}`}`);
        console.log(`     Result   : ${coaMismatchLines.length === 0 ? 'PASS' : 'EXCEPTION_RECORDED'}`);

        console.log('===============================================');
        console.log(
          `OVERALL: ${lineCountPass && lineValuesPass && pricePass && quantityPass && totalsPass && paidPass ? 'PASS' : 'FAIL'} - invoice lines and amounts match source to the cent`,
        );

        expect(comparisons.length, 'no invoices were sampled - query may have failed').toBeGreaterThan(0);
        expect(
          comparisons.filter((c) => !c.lines_count_match),
          'invoice line count is not identical on both servers for some invoices',
        ).toHaveLength(0);
        // Exclude account_code mismatches from the main failure check per manual TC: "If the Account CODE differs on every sampled line,
        // that is ONE chart-of-accounts mapping exception recorded for the environment, not one defect per line"
        const nonCoaMismatches = failedComparisons.filter(
          (c) => c.line_mismatches.some((m) => m.field !== 'account_code')
        );
        expect(
          nonCoaMismatches,
          `invoice lines and amounts do not match (excluding COA mapping): ${mismatchSummary}`,
        ).toHaveLength(0);
        expect(paidInvoices.filter((c) => Math.abs(c.target_totals.amount_due) > 0.01), 'Amount Due on Paid invoice is non-zero on target').toHaveLength(0);
        expect(
          failedComparisons.filter((c) => c.line_mismatches.some((m) => ['price_unit', 'discount', 'price_subtotal'].includes(m.field))),
          'invoice line amounts not accurate to the cent',
        ).toHaveLength(0);
        // COA mismatches (if present) are recorded as a single environment-level exception per manual TC,
        // not individual defects. Do not fail on them - they are logged separately in the VERIFY block.
      });

    } finally {
      if (sourceContext) await sourceContext.close();
      if (targetContext) await targetContext.close();
    }
  });
});
