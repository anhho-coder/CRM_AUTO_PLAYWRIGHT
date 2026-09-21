import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653 Section 5.3 - Paid invoices stay paid with their payment
 * Test Case ID: CRM-12653_5.3.1
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   A paid invoice arrives on the target still paid, with the same payment amount and date
 *   and a zero balance. The source paid-invoice count matches the target's, and a sample
 *   of 3 paid invoices carry their complete payment records and status intact.
 *
 * Source manual TC reference:
 *   Master sheet "CRM-12653_Data Migration - Sales data", row 5.3.1
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_5\.3\.1:" --project=chromium
 */

/** Inline session opener for both servers. */
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

test.describe('CRM-12653 Section 5.3 - Paid invoices parity', () => {
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('\nFAILURE REASON: ' + (testInfo.error?.message?.split('\n')[0] ?? 'unknown'));
    }
  });

  test('CRM-12653_5.3.1: Paid invoices remain paid on the target with payment amount, date and zero balance', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let sourceContext: BrowserContext | null = null;
    let targetContext: BrowserContext | null = null;

    try {
      const targetSession = await openSession(browser, baseUrl_mig, true, users.admin_crm_mig.username, users.admin_crm_mig.password);
      targetContext = targetSession.context;
      const target = targetSession.parity;

      const sourceSession = await openSession(browser, baseUrl, false, users.admin_crm.username, users.admin_crm.password);
      sourceContext = sourceSession.context;
      const source = sourceSession.parity;

      console.log('========== CRM-12653_5.3.1 - Paid invoices stay paid ==========');

      const targetAuth = await target.isAuthenticatedSession();
      const sourceAuth = await source.isAuthenticatedSession();
      console.log(`Target authenticated: ${targetAuth}`);
      console.log(`Source authenticated: ${sourceAuth}`);

      let cutoff = '';
      let sourcePaidCount = 0;
      let targetPaidCount = 0;
      const sampleInvoices: Array<{
        number: string;
        total: number;
        amountDue: number;
        paymentAmount: number;
        paymentDate: string;
      }> = [];
      const targetPaidInvoices: Array<{
        number: string;
        total: number;
        amountDue: number;
        paymentAmount: number;
        paymentDate: string;
        state: string;
      }> = [];

      await test.step('Pre-condition: Resolve migration cut-off date from target', async () => {
        console.log('\n--- Pre-condition: Establish cut-off date ---');
        cutoff = await target.resolveCutoffDate();
        console.log(`  Cut-off date: ${cutoff}`);
      });

      await test.step('Step 1-2: Get source paid-invoice count and sample 3 paid invoices', async () => {
        console.log('\n--- Step 1-2: Source paid invoices ---');
        const domain = [
          ...MigDataParityPage.onOrBeforeCutoff(cutoff, 'invoice_date'),
          ['state', '=', 'paid'],
        ];

        sourcePaidCount = await source.searchCount('account.invoice', domain);
        console.log(`  Paid invoices (source, on/before cutoff): ${sourcePaidCount}`);

        const paid = await source.searchRead<any>(
          'account.invoice',
          domain,
          ['number', 'amount_total', 'residual', 'state', 'payment_ids'],
          { limit: 3 },
        );

        // Fetch payment details separately for sampled invoices
        for (const inv of paid) {
          let paymentAmount = 0;
          let paymentDate = '';

          if (inv.payment_ids && Array.isArray(inv.payment_ids) && inv.payment_ids.length > 0) {
            // payment_ids contains IDs; fetch the payment records to get amount/date
            const payments = await source.readIds<any>('account.payment', inv.payment_ids.slice(0, 1), ['amount', 'date']);
            if (payments.length > 0) {
              paymentAmount = payments[0].amount || 0;
              paymentDate = payments[0].date || '';
            }
          }

          sampleInvoices.push({
            number: inv.number,
            total: inv.amount_total,
            amountDue: inv.residual,
            paymentAmount,
            paymentDate,
          });
          console.log(`    Sampled invoice ${inv.number}: Total=${inv.amount_total}, AmountDue=${inv.residual}`);
        }
      });

      await test.step('Step 3: Get target paid-invoice count with same filter', async () => {
        console.log('\n--- Step 3: Target paid invoices ---');
        const domain = [
          ...MigDataParityPage.onOrBeforeCutoff(cutoff, 'invoice_date'),
          ['state', '=', 'paid'],
        ];

        targetPaidCount = await target.searchCount('account.invoice', domain);
        console.log(`  Paid invoices (target, on/before cutoff): ${targetPaidCount}`);
      });

      await test.step('Step 4: Look up sampled invoices on target and verify payment data', async () => {
        console.log('\n--- Step 4: Verify sampled invoices on target ---');
        for (const srcInv of sampleInvoices) {
          const domain = [
            ['number', '=', srcInv.number],
          ];
          const found = await target.searchRead<any>(
            'account.invoice',
            domain,
            ['number', 'amount_total', 'residual', 'state', 'payment_ids'],
            { limit: 1 },
          );

          if (found.length === 0) {
            console.log(`    ERROR: Invoice ${srcInv.number} not found on target`);
            continue;
          }

          const tgtInv = found[0];
          let tgtPaymentAmount = 0;
          let tgtPaymentDate = '';

          // Fetch payment details separately since payment_ids contains IDs
          if (tgtInv.payment_ids && Array.isArray(tgtInv.payment_ids) && tgtInv.payment_ids.length > 0) {
            const payments = await target.readIds<any>('account.payment', tgtInv.payment_ids.slice(0, 1), ['amount', 'date']);
            if (payments.length > 0) {
              tgtPaymentAmount = payments[0].amount || 0;
              tgtPaymentDate = payments[0].date || '';
            }
          }

          targetPaidInvoices.push({
            number: tgtInv.number,
            total: tgtInv.amount_total,
            amountDue: tgtInv.residual,
            paymentAmount: tgtPaymentAmount,
            paymentDate: tgtPaymentDate,
            state: tgtInv.state,
          });

          console.log(`    Invoice ${srcInv.number}:`);
          console.log(`      Status: ${tgtInv.state}`);
          console.log(`      Total: ${tgtInv.amount_total}`);
          console.log(`      Amount Due: ${tgtInv.residual}`);
          console.log(`      Payment: ${tgtPaymentAmount || 'none'} on ${tgtPaymentDate || 'N/A'}`);
        }
      });

      await test.step('Verification', async () => {
        console.log('\n==================== VERIFY ====================');

        console.log('  Verify #1 - Paid invoice count matches (on/before cutoff):');
        console.log(`     Expected : ${sourcePaidCount}`);
        console.log(`     Actual   : ${targetPaidCount}`);
        console.log(`     Result   : ${sourcePaidCount === targetPaidCount ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #2-7 - Sample invoices found and payment data matches:');
        for (let i = 0; i < sampleInvoices.length && i < targetPaidInvoices.length; i++) {
          const src = sampleInvoices[i];
          const tgt = targetPaidInvoices[i];
          const totalMatch = src.total === tgt.total;
          const amountDueMatch = Math.abs(src.amountDue - tgt.amountDue) < 0.01;
          const paymentMatch = Math.abs(src.paymentAmount - tgt.paymentAmount) < 0.01
            && src.paymentDate === tgt.paymentDate;

          console.log(`    Invoice ${src.number}:`);
          console.log(`      Total match: ${totalMatch ? 'PASS' : 'FAIL'} (${src.total} vs ${tgt.total})`);
          console.log(`      Amount Due = 0: ${amountDueMatch ? 'PASS' : 'FAIL'} (${tgt.amountDue})`);
          console.log(`      Payment match: ${paymentMatch ? 'PASS' : 'FAIL'} (${src.paymentAmount}/${src.paymentDate} vs ${tgt.paymentAmount}/${tgt.paymentDate})`);
        }

        console.log('===============================================');

        // Assert source has data to verify (no false green on empty source)
        expect(sourcePaidCount, 'Source has paid invoices to verify').toBeGreaterThan(0);
        // Assert target has data (no false green on empty target)
        expect(targetPaidCount, 'Target has paid invoices to verify').toBeGreaterThan(0);
        // Assert counts match
        expect(targetPaidCount, 'Target paid invoice count matches source').toBe(sourcePaidCount);

        // Verify each sampled invoice
        for (let i = 0; i < sampleInvoices.length && i < targetPaidInvoices.length; i++) {
          const src = sampleInvoices[i];
          const tgt = targetPaidInvoices[i];

          expect(tgt.state, `Invoice ${src.number}: Status is PAID on target`).toBe('paid');
          expect(tgt.total, `Invoice ${src.number}: Total matches source`).toBe(src.total);
          expect(Math.abs(tgt.amountDue), `Invoice ${src.number}: Amount Due is 0.00`).toBeLessThan(0.01);
          expect(tgt.paymentAmount, `Invoice ${src.number}: Payment amount matches source`).toBe(src.paymentAmount);
          expect(tgt.paymentDate, `Invoice ${src.number}: Payment date matches source`).toBe(src.paymentDate);
        }

        // Verify all found invoices carry the PAID status
        expect(sampleInvoices.length, 'Sample has the expected count of source invoices').toBeGreaterThan(0);
        expect(targetPaidInvoices.length, 'All sampled invoices found on target').toBe(sampleInvoices.length);

        console.log(`OVERALL: ${sourcePaidCount === targetPaidCount && targetPaidInvoices.length >= 1 ? 'PASS' : 'FAIL'} - Paid invoices remain paid with correct payment data`);
      });
    } finally {
      if (sourceContext) await sourceContext.close();
      if (targetContext) await targetContext.close();
    }
  });
});
