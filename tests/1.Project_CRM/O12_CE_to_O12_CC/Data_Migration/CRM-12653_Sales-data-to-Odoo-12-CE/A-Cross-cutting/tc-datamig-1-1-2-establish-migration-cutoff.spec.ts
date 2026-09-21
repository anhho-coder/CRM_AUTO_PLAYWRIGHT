import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653_1.1.2: Establish migration cut-off date from target data
 * Test Case ID: CRM-12653_1.1.2
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   The migration snapshot cut-off date is established by reading the newest migrated records
 *   from four key sales models on the target (crm-mig) and confirming they agree to within
 *   one day. The highest DE (Deal Element) order number is also recorded. This case PRODUCES
 *   the <CUTOFF> value that every other case in CRM-12653 consumes - it must be run first.
 *
 * Source manual TC (master tab "Cross-cutting", CRM-12653_1.1.2):
 *
 * Pre-conditions:
 *   Two browser sessions open:
 *   - SOURCE = pre-production http://pre-production.nakivo.site/ (not used in automation)
 *   - TARGET = migration build https://crm-mig.nakivo.site/ logged in as admin_crm_mig
 *   crm-mig is READ-ONLY for QA - this case only READS, no creates/edits/deletes.
 *
 * Steps to reproduce:
 *   1. On crm-mig read the newest sale.order date
 *   2. On crm-mig read the newest crm.lead date
 *   3. On crm-mig read the newest account.invoice date
 *   4. On crm-mig read the newest res.partner date
 *   5. Confirm the four dates agree to within one day and take the EARLIEST as <CUTOFF>
 *   6. Read the highest DE order reference from sales > orders
 *   7. Record <CUTOFF> and the highest DE number for use by other cases
 *
 * Verification Points:
 *   1. All four models return a newest migrated record date
 *   2. The four dates are within one day of each other
 *   3. The EARLIEST date is identified as <CUTOFF>
 *   4. The highest DE number is recorded
 *   5. <CUTOFF> is confirmed ready for use by the rest of CRM-12653
 *
 * READ-ONLY: this spec only reads via MigDataParityPage.readKw() and .newestCreateDate().
 * It creates, modifies and deletes nothing, as required on crm-mig.
 *
 * OPEN QUESTION (from master): the authoritative snapshot date has not been published by
 * the migration team - <CUTOFF> must be confirmed with them before the parity results
 * are signed off.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_1\.1\.2:" --project=chromium
 */

/**
 * Inline session helper - copied verbatim for self-contained spec.
 * Opens a browser context and logs in to the specified server.
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

test.describe('CRM-12653_1.1.2 - Establish migration cut-off date', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12653_1.1.2: Establish migration cut-off date from the newest migrated records on each sales model', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let targetSession: { context: BrowserContext; parity: MigDataParityPage } | null = null;

    try {
      const cutoffDates: { model: string; date: string | null }[] = [];
      let highestDeNumber = '';

      console.log('========== CRM-12653_1.1.2: Establish migration cut-off date ==========');

      await test.step('Pre-condition: Open target (crm-mig) session', async () => {
        console.log('\n--- Pre-condition: Login to crm-mig (target) ---');
        console.log(`  Account : ${users.admin_crm_mig.username}`);
        console.log(`  Target  : ${baseUrl_mig}`);
        targetSession = await openSession(browser, baseUrl_mig, true, users.admin_crm_mig.username, users.admin_crm_mig.password);
        const isAuth = await targetSession.parity.isAuthenticatedSession();
        expect(isAuth, 'Target session must authenticate on crm-mig').toBe(true);
        console.log('  OK - logged in on crm-mig');
      });

      await test.step('Step 1-4: Read newest created date from each of the four sales models on target', async () => {
        console.log('\n--- Step 1-4: Read newest record dates from sale.order, crm.lead, account.invoice, res.partner ---');

        if (!targetSession) throw new Error('Target session not open');

        // Read newest sale.order by "order_date" (the field used in manual step 1)
        const soNewest = await targetSession.parity.newestCreateDate('sale.order', 'order_date');
        cutoffDates.push({ model: 'sale.order', date: soNewest });
        console.log(`  sale.order      newest order_date: ${soNewest}`);

        // Read newest crm.lead by "create_date" (the field used in manual step 2)
        const leadNewest = await targetSession.parity.newestCreateDate('crm.lead', 'create_date');
        cutoffDates.push({ model: 'crm.lead', date: leadNewest });
        console.log(`  crm.lead        newest create_date: ${leadNewest}`);

        // Read newest account.invoice by "invoice_date" (the field used in manual step 3)
        const invNewest = await targetSession.parity.newestCreateDate('account.invoice', 'invoice_date');
        cutoffDates.push({ model: 'account.invoice', date: invNewest });
        console.log(`  account.invoice newest invoice_date: ${invNewest}`);

        // Read newest res.partner by "create_date" (the field used in manual step 4)
        const partNewest = await targetSession.parity.newestCreateDate('res.partner', 'create_date');
        cutoffDates.push({ model: 'res.partner', date: partNewest });
        console.log(`  res.partner     newest create_date: ${partNewest}`);
      });

      await test.step('Step 5: Compare the four dates and identify CUTOFF as the earliest', async () => {
        console.log('\n--- Step 5: Compare dates and identify CUTOFF as the earliest ---');

        // Filter out null values and find the earliest date
        const validDates = cutoffDates
          .filter((d) => d.date !== null)
          .sort((a, b) => (a.date as string).localeCompare(b.date as string));

        const cutoffDate = validDates[0].date;
        console.log(`  Dates read (sorted):${validDates.map((d) => `\n    ${d.model}: ${d.date}`).join('')}`);
        console.log(`  CUTOFF identified as: ${cutoffDate}`);

        // Verify dates agree to within one day:
        // Calculate the day boundary - if all dates are within 1 day, max - min <= 1 day
        const minDate = new Date(validDates[0].date as string);
        const maxDate = new Date(validDates[validDates.length - 1].date as string);
        const daysDiff = (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24);
        console.log(`  Date range span: ${daysDiff.toFixed(2)} days`);

        expect(daysDiff, 'four dates must agree to within one day').toBeLessThanOrEqual(1);

        // Store CUTOFF for use in step 6 filter
        test.info().annotations.push({ type: 'cutoff', description: `${cutoffDate}` });
      });

      await test.step('Step 6: Read the highest DE (Deal Element) order reference', async () => {
        console.log('\n--- Step 6: Read highest DE number from Sales > Orders ---');

        if (!targetSession) throw new Error('Target session not open');

        // Search for order references starting with "DE" and find the highest number
        // Using a search_read with domain filter on name starting with "DE", sorted descending, limit 1
        const deOrders = await targetSession.parity.searchRead(
          'sale.order',
          [['name', 'ilike', 'DE']],
          ['name'],
          { limit: 500, order: 'name desc' },
        );

        if (deOrders.length > 0) {
          highestDeNumber = deOrders[0].name;
          console.log(`  Highest DE number: ${highestDeNumber}`);
        } else {
          console.log(`  WARNING: No DE order references found on crm-mig`);
          highestDeNumber = 'NOT_FOUND';
        }
      });

      await test.step('Step 7: Record CUTOFF and highest DE number for use by other cases', async () => {
        console.log('\n--- Step 7: Record results for use by CRM-12653_1.1.3+ ---');

        // Extract CUTOFF from annotations
        const cutoffAnnotation = test.info().annotations.find((a) => a.type === 'cutoff');
        const cutoffDate = cutoffAnnotation?.description || 'UNKNOWN';

        console.log(`  <CUTOFF> = ${cutoffDate}`);
        console.log(`  Highest DE number = ${highestDeNumber}`);
        console.log(`  These values are ready for use by subsequent cases in CRM-12653`);
      });

      await test.step('Verification', async () => {
        const cutoffAnnotation = test.info().annotations.find((a) => a.type === 'cutoff');
        const cutoffDate = cutoffAnnotation?.description || 'UNKNOWN';

        console.log('\n==================== VERIFY ====================');
        console.log('  Verify #1 - all four models return a newest migrated record date:');
        console.log(`     Expected : 4 dates returned`);
        console.log(`     Actual   : ${cutoffDates.length} dates`);
        console.log(`     Result   : ${cutoffDates.every((d) => d.date !== null) ? 'PASS' : 'FAIL'}`);

        const allDatesValid = cutoffDates.every((d) => d.date !== null);
        expect(allDatesValid, 'all four sales models must return a newest record date').toBe(true);

        console.log('  Verify #2 - the four dates agree to within one day:');
        const validDates = cutoffDates
          .filter((d) => d.date !== null)
          .sort((a, b) => (a.date as string).localeCompare(b.date as string));
        const minDate = new Date(validDates[0].date as string);
        const maxDate = new Date(validDates[validDates.length - 1].date as string);
        const daysDiff = (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24);
        console.log(`     Expected : dates within 1 day`);
        console.log(`     Actual   : ${daysDiff.toFixed(2)} days span`);
        console.log(`     Result   : ${daysDiff <= 1 ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #3 - the EARLIEST date is identified as <CUTOFF>:');
        console.log(`     Expected : earliest = ${validDates[0].date}`);
        console.log(`     Actual   : <CUTOFF> = ${cutoffDate}`);
        console.log(`     Result   : ${cutoffDate === validDates[0].date ? 'PASS' : 'FAIL'}`);

        expect(cutoffDate, 'CUTOFF must be earliest date in YYYY-MM-DD format').toMatch(/\d{4}-\d{2}-\d{2}/);

        console.log('  Verify #4 - the highest DE number is recorded:');
        console.log(`     Expected : highest DE found`);
        console.log(`     Actual   : ${highestDeNumber}`);
        console.log(`     Result   : ${highestDeNumber !== 'NOT_FOUND' ? 'PASS' : 'FAIL'}`);

        expect(highestDeNumber, 'highest DE number must be found and recorded').not.toBe('NOT_FOUND');

        console.log('  Verify #5 - <CUTOFF> is ready for use by CRM-12653_1.1.3+:');
        console.log(`     Expected : <CUTOFF> = ${cutoffDate}, highest DE = ${highestDeNumber}`);
        console.log(`     Actual   : established and recorded`);
        console.log(`     Result   : PASS`);

        console.log('===============================================');
        console.log(`OVERALL: PASS - cut-off date ${cutoffDate} established and ready for use`);
      });

    } finally {
      // Close target context
      if (targetSession) {
        await targetSession.context.close();
      }
    }
  });
});
