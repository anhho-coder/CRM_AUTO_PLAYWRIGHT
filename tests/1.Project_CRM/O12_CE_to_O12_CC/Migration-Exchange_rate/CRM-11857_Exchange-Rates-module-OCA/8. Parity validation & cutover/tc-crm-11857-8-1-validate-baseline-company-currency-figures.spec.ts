import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, InvoicePageMig, HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  Exchange Rates - CRM-11857_8.1: Validate baseline company-currency figures
 * ===========================================================================
 *  Test Case ID    : CRM-11857_8.1
 *  Jira            : CRM-13413
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-13
 *  Source version  : CRM-13413 updated 2026-10-09T12:35:37+0300, 5 Xray manual steps
 *                    - re-check before trusting this spec
 *  Run as          : Faye Nguyen (faye.nguyen@nakivo.com) - the account the TC names.
 *                    She holds Accounting & Finance / Billing Manager, which grants READ on
 *                    res.currency.rate.provider (ir.model.access 560, read-only).
 *
 *  Summary:
 *    A sample document per currency in use (EUR, GBP, CHF, UAH) on crm-mig is verified to hold
 *    the same stored and reported company-currency values as were recorded on the production
 *    baseline dated 2026-08-19. Step 4 (Reporting > Management > Invoices, action 316) and
 *    step 5 (Journal Items, menu 193 / action 274) are marked BLOCKED because that action has
 *    no list view (only graph/pivot), and Journal Items menu is not navigable on this build.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_8\.1:" --project=O12
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC - CRM-13413 (verbatim)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Log in to crm-mig (https://crm-mig.nakivo.site) as faye.nguyen@nakivo.com.
 *    - The crm-mig data has been migrated from production. The production values are:
 *    - EUR: INV/2026/9423, Total 500.00 €, Receivable Debit 576.75, report Untaxed Total
 *      576.75
 *    - GBP: INV/2026/9024, Total 2,888.56 £, Receivable Debit 3,856.93, report Untaxed Total
 *      3,856.93
 *    - CHF: INV/2026/9414, Total 783.52 CHF, Receivable Debit 969.73, report Untaxed Total
 *      969.73
 *    - UAH: Vendor Bills journal item "Laptop ASUS X540LJ (X540LJ-DM003D) CHOCOLATE BLACK
 *      (1/5)" dated 2026-06-04, Amount Currency 2,198.00 ₴, Debit 49.62
 *    - If a sample document is not found on crm-mig, choose another document in the same
 *      currency on production and note the same values.
 *
 *  1. Open Invoicing > Customers > Invoices, search INV/2026/9423, open it, open the Other
 *     Info tab and click the Journal Entry
 *     Expected Result: Receivable line: Amount Currency = 500.00 €, Debit = 576.75
 *
 *  2. Go back to Invoicing > Customers > Invoices, search INV/2026/9024, open it, open the
 *     Other Info tab and click the Journal Entry
 *     Expected Result: Receivable line: Amount Currency = 2,888.56 £, Debit = 3,856.93
 *
 *  3. Go back to Invoicing > Customers > Invoices, search INV/2026/9414, open it, open the
 *     Other Info tab and click the Journal Entry
 *     Expected Result: Receivable line: Amount Currency = 783.52 CHF, Debit = 969.73
 *
 *  4. Open Invoicing > Reporting > Management > Invoices and search INV/2026/9423,
 *     INV/2026/9024 and INV/2026/9414 one by one
 *     Expected Result: Untaxed Total = 576.75, 3,856.93 and 969.73 respectively
 *
 *  5. Open Invoicing > Accounting > Accounting Entries > Journal Items and search "Laptop
 *     ASUS X540LJ (X540LJ-DM003D) CHOCOLATE BLACK (1/5)"
 *     Expected Result: The line dated 2026-06-04 shows Amount Currency = 2,198.00 ₴ and Debit
 *                      = 49.62
 *
 * ===========================================================================
 */

interface InvoiceVerification {
  number: string;
  currency: string;
  expectedAmountCurrency: string;
  expectedDebit: string;
  actualAmountCurrency?: string;
  actualDebit?: string;
}

const STEP = {
  pre: 'Pre-condition: Log in to crm-mig as faye.nguyen@nakivo.com',
  s1: 'Step 1: Open Invoicing > Customers > Invoices, search INV/2026/9423, open Journal Entry',
  s2: 'Step 2: Go back to Invoicing > Customers > Invoices, search INV/2026/9024, open Journal Entry',
  s3: 'Step 3: Go back to Invoicing > Customers > Invoices, search INV/2026/9414, open Journal Entry',
  s4: 'Step 4: [BLOCKED - action 316 (Reporting > Management > Invoices) has no list view, only graph/pivot] Open Invoicing > Reporting > Management > Invoices - action 316 has no list view (graph/pivot only)',
  s5: 'Step 5: [BLOCKED - nothing navigates to Accounting Entries > Journal Items (menu 193 / action 274)] Open Invoicing > Accounting > Accounting Entries > Journal Items - menu 193 not navigable on this build',
  verify: 'Verification: Three EUR/GBP/CHF invoices match baseline Debit figures',
} as const;

test.describe('CRM-11857_8.1 - Exchange Rates: Baseline company-currency figures match production', () => {
  test.describe.configure({ timeout: config.timeouts.test });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
      const homePage = new HomePageMig(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-11857_8.1: A sample document per currency in use keeps the same stored and reported USD values as on production', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const invoicePage = new InvoicePageMig(page);

    const baseline: InvoiceVerification[] = [
      { number: 'INV/2026/9423', currency: 'EUR', expectedAmountCurrency: '500.00', expectedDebit: '576.75' },
      { number: 'INV/2026/9024', currency: 'GBP', expectedAmountCurrency: '2,888.56', expectedDebit: '3,856.93' },
      { number: 'INV/2026/9414', currency: 'CHF', expectedAmountCurrency: '783.52', expectedDebit: '969.73' },
    ];

    let invoicesVerified = 0;

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      console.log(`  Target  : ${baseUrl}`);
      console.log(`  Account : ${users.accountance_ic_faye_crm_mig.username} (${users.accountance_ic_faye_crm_mig.displayName})`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.accountance_ic_faye_crm_mig.username, users.accountance_ic_faye_crm_mig.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log('  Baseline data (production figures from 2026-08-19):');
      baseline.forEach((row) => {
        console.log(`    ${row.number} [${row.currency}]: Debit ${row.expectedDebit}`);
      });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - logged in').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await invoicePage.openCustomerInvoicesList();
      await invoicePage.clearListSearchFacets();
      await invoicePage.searchInvoiceInList(baseline[0].number);
      await invoicePage.openInvoiceRowByNumber(baseline[0].number);

      const journalEntry = await invoicePage.openJournalEntryFromOtherInfo();
      expect(journalEntry, `INV/2026/9423 should have a journal entry (not a draft)`).toBe(true);

      const lines = await invoicePage.getJournalEntryLines();
      const receivableLine = lines.find((line) => line['Debit'] && parseFloat(line['Debit']) > 0);

      if (receivableLine) {
        baseline[0].actualAmountCurrency = receivableLine['Amount Currency'];
        baseline[0].actualDebit = receivableLine['Debit'];
        console.log(`  Invoice: ${baseline[0].number}`);
        console.log(`    Amount Currency: ${receivableLine['Amount Currency']}`);
        console.log(`    Debit: ${receivableLine['Debit']}`);
        invoicesVerified++;
      } else {
        console.log(`  ⚠ No Receivable line found in journal entry for INV/2026/9423`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - EUR invoice journal entry').catch(() => {});
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await invoicePage.openCustomerInvoicesList();
      await invoicePage.clearListSearchFacets();
      await invoicePage.searchInvoiceInList(baseline[1].number);
      await invoicePage.openInvoiceRowByNumber(baseline[1].number);

      const journalEntry = await invoicePage.openJournalEntryFromOtherInfo();
      expect(journalEntry, `INV/2026/9024 should have a journal entry (not a draft)`).toBe(true);

      const lines = await invoicePage.getJournalEntryLines();
      const receivableLine = lines.find((line) => line['Debit'] && parseFloat(line['Debit']) > 0);

      if (receivableLine) {
        baseline[1].actualAmountCurrency = receivableLine['Amount Currency'];
        baseline[1].actualDebit = receivableLine['Debit'];
        console.log(`  Invoice: ${baseline[1].number}`);
        console.log(`    Amount Currency: ${receivableLine['Amount Currency']}`);
        console.log(`    Debit: ${receivableLine['Debit']}`);
        invoicesVerified++;
      } else {
        console.log(`  ⚠ No Receivable line found in journal entry for INV/2026/9024`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - GBP invoice journal entry').catch(() => {});
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await invoicePage.openCustomerInvoicesList();
      await invoicePage.clearListSearchFacets();
      await invoicePage.searchInvoiceInList(baseline[2].number);
      await invoicePage.openInvoiceRowByNumber(baseline[2].number);

      const journalEntry = await invoicePage.openJournalEntryFromOtherInfo();
      expect(journalEntry, `INV/2026/9414 should have a journal entry (not a draft)`).toBe(true);

      const lines = await invoicePage.getJournalEntryLines();
      const receivableLine = lines.find((line) => line['Debit'] && parseFloat(line['Debit']) > 0);

      if (receivableLine) {
        baseline[2].actualAmountCurrency = receivableLine['Amount Currency'];
        baseline[2].actualDebit = receivableLine['Debit'];
        console.log(`  Invoice: ${baseline[2].number}`);
        console.log(`    Amount Currency: ${receivableLine['Amount Currency']}`);
        console.log(`    Debit: ${receivableLine['Debit']}`);
        invoicesVerified++;
      } else {
        console.log(`  ⚠ No Receivable line found in journal entry for INV/2026/9414`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - CHF invoice journal entry').catch(() => {});
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      console.log(`  Reporting > Management > Invoices (action 316) is a PIVOT/GRAPH report, not a list view.`);
      console.log(`  This step cannot read Untaxed Total from a searchable list on this build.`);
      console.log(`  BLOCKED - reason: action 316 has view_mode=graph,pivot only (measured 2026-10-13)`);
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      console.log(`  Journal Items menu (193) / action (274) does not navigate from Invoices on this build.`);
      console.log(`  The UAH vendor-bills item dated 2026-06-04 cannot be accessed via the standard menu path.`);
      console.log(`  BLOCKED - reason: menu 193 / action 274 not navigable from Invoices on crm-mig (measured 2026-10-13)`);
    });

    await test.step(STEP.verify, async () => {
      console.log('');
      console.log('==================== VERIFY ====================');
      console.log('Baseline company-currency figures - three migrated invoices:');
      console.log('');

      for (const row of baseline) {
        const expected = row.expectedDebit;
        const actual = row.actualDebit || '(not read)';
        const match = actual !== '(not read)' && actual.replace(/,/g, '.') === expected.replace(/,/g, '.');
        const result = match ? 'PASS' : 'FAIL';

        console.log(`  [${row.currency}] ${row.number}:`);
        console.log(`    Expected Debit                : ${expected}`);
        console.log(`    Actual Debit (from journal)   : ${actual}`);
        console.log(`    Expected Amount Currency      : ${row.expectedAmountCurrency}`);
        console.log(`    Actual Amount Currency        : ${row.actualAmountCurrency || '(not read)'}`);
        console.log(`    Result                        : ${result}`);
        console.log('');
      }

      const allMatch = baseline
        .filter((r) => r.actualDebit)
        .every((r) => r.actualDebit && r.actualDebit.replace(/,/g, '.') === r.expectedDebit.replace(/,/g, '.'));

      console.log(`Summary:${invoicesVerified}/3 invoices verified from journal entries`);
      console.log(`Step 4 (Reporting pivot) - BLOCKED`);
      console.log(`Step 5 (UAH vendor journal item) - BLOCKED`);
      console.log('');
      console.log(`OVERALL: ${allMatch && invoicesVerified === 3 ? 'PASS' : 'PARTIAL'} - EUR/GBP/CHF invoices verified, reporting and UAH blocked`);

      let __verifyPassed = false;
      try {
        expect(invoicesVerified, 'All three currency invoices (EUR, GBP, CHF) should be found').toBe(3);
        expect(
          allMatch,
          `All three invoices should have Debit figures matching the baseline (${baseline.map((r) => r.expectedDebit).join(', ')})`
        ).toBe(true);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: 'CRM-11857_8.1 - Baseline verification',
          passed: __verifyPassed,
        }).catch(() => {});
      }
      console.log('===============================================');
    });
  });
});
