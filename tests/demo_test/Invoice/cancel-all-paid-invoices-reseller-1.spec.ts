import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';

/**
 * ===========================================================================
 *  DATA-CLEANUP UTILITY  -  Cancel all Paid Invoices AND Credit Notes of Reseller_1
 * ===========================================================================
 *  Test Case ID    : UTIL-CANCEL-PAID-RESELLER1
 *  Automation-Type : refactored
 *  Automation-Date : 2026-07-01
 *
 *  Purpose:
 *    Cancel every "Paid" record - both customer Invoices (INV/...) AND Credit Notes (CN/..., a.k.a.
 *    Refunds) - that belongs to Reseller_1 (the reseller partner "TEST-Reseller#Automation-Jun10",
 *    used by the O12 deal-registration flows) so the test data does not accumulate. Runs as Admin
 *    via the Invoicing UI. Both Invoices and Credit Notes are account.invoice records (out_invoice /
 *    out_refund) and appear together in the same Invoices list (action=289), so ONE filter
 *    (Reseller + Status = Paid) returns both and the SAME CANCEL -> OK flow cancels either.
 *
 *  Command to run:
 *    npx playwright test --grep "UTIL-CANCEL-PAID-RESELLER1:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Scenario (mirrors the manual steps)
 * ---------------------------------------------------------------------------
 *    1. Login as Admin.
 *    2. Go to the Invoicing module (Customers > Invoices list).
 *    3. Filter:  Reseller = Reseller_1   AND   Status = Paid
 *       (two "Add Custom Filter" facets: "Reseller is equal to <name>" + "Status is Paid").
 *       This returns BOTH Paid Invoices (INV/...) and Paid Credit Notes (CN/...).
 *    4. Once the results show up, select an item (open a row into its form).
 *    5. Press the "CANCEL" button (present on both Invoice and Credit Note forms).
 *    6. Press "OK" on the "Are you sure you want to cancel this invoice?" confirmation.
 *    7. Repeat steps 4-6 until no item shows up (the filtered Paid list is empty).
 *
 *  Verification:
 *    After the loop, re-apply the same filter fresh and assert 0 Paid records (Invoices or Credit
 *    Notes) remain for Reseller_1.
 *
 *  Implementation notes:
 *    - Every cancel is guarded: the opened record's Reseller must equal Reseller_1 AND its status
 *      must be "Paid" before CANCEL is pressed - so a stale/mis-navigated list can never cause a
 *      wrong record to be cancelled. This guard is type-agnostic (Invoice or Credit Note).
 *    - The loop RE-APPLIES the filter FRESH every pass (openList + both custom filters) and opens the
 *      first not-yet-handled record by its Number. Cancelled records drop out of the Paid filter, so
 *      the set strictly shrinks and termination is reliable regardless of list-cache/breadcrumb state.
 *      A record that cannot be cancelled is skipped (marked handled), not retried forever.
 *    - A cancelled Invoice/Credit Note cannot be cleanly deleted (financial chain) - CANCEL only
 *      (no delete), matching the manual scenario.
 * ===========================================================================
 */

const RESELLER_1_NAME = DEAL_REGISTRATION.partnerCompanyName; // "TEST-Reseller#Automation-Jun10"
// Safety cap on how many records to cancel in one run (guards against an unexpected loop).
// Override for a small validation run, e.g. CANCEL_MAX=2 npx playwright test ...
const MAX_ITERATIONS = Number(process.env.CANCEL_MAX) || 500;

// Extra account.invoice ids to cancel by DIRECT navigation, for reseller_1 Paid records that the
// reseller-name filter CANNOT surface. Reason: reseller_1's data on pre-prod includes a duplicate
// partner (id 627556) that shares the display name "TEST-Reseller#Automation-Jun10" but is NOT
// returned by name search (its own name differs), so no Reseller/Payer/Commercial-Entity name filter
// reaches its records. Its Paid Credit Notes are therefore cancelled by id. Override via
// CANCEL_EXTRA_IDS="196722,196716". Each is still guarded (must be a Paid reseller_1 record).
const EXTRA_IDS: string[] = (process.env.CANCEL_EXTRA_IDS || '196722,196716')
  .split(',').map((s) => s.trim()).filter(Boolean);

/** Classify a record by its Number: "CN/..." = Credit Note, "INV/..." = Invoice. */
const recordKind = (num: string): string =>
  /^CN\b|^CN\//i.test(num) ? 'Credit Note' : /^INV\b|^INV\//i.test(num) ? 'Invoice' : 'record';

test.describe('UTIL-CANCEL-PAID-RESELLER1 - Cancel all Paid Invoices & Credit Notes of Reseller_1', () => {

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const invoicePage = new InvoicePage(page);
      await invoicePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - final state').catch(() => {});
  });

  test('UTIL-CANCEL-PAID-RESELLER1: Cancel every Paid Invoice and Credit Note of Reseller_1 until none remain', async ({ page }, testInfo) => {
    // Cancelling can be many records; give the run a generous budget.
    test.setTimeout(config.timeouts.test * 6);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);

    // Re-open the Invoices list and re-apply BOTH facets from scratch (authoritative current set).
    const filterFresh = async () => {
      await invoicePage.openCustomerInvoicesList();
      await invoicePage.filterInvoicesByResellerAndStatus(RESELLER_1_NAME, 'Paid');
    };

    await test.step('Step 1: Login as Admin', async () => {
      console.log(`Step 1: Logging in as Admin (${users.admin_crm.displayName})`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log('✓ Logged in as Admin');
    });

    await test.step('Step 2: Go to the Invoicing module (Customers > Invoices)', async () => {
      await invoicePage.openCustomerInvoicesList();
      console.log('✓ Invoices list opened');
    });

    await test.step('Step 3: Filter Reseller = Reseller_1 AND Status = Paid', async () => {
      console.log(`Step 3: Filtering Reseller = "${RESELLER_1_NAME}" AND Status = "Paid"`);
      await invoicePage.filterInvoicesByResellerAndStatus(RESELLER_1_NAME, 'Paid');
      const initialCount = await invoicePage.getInvoiceListRowCount();
      const initialNums = await invoicePage.getAllRowInvoiceNumbers();
      console.log(`  - Paid records for Reseller_1 in view: ${initialCount} (Invoices + Credit Notes): ${JSON.stringify(initialNums)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - filtered Paid records').catch(() => {});
    });

    let cancelled = 0;
    let cancelledInvoices = 0;
    let cancelledCreditNotes = 0;
    const processedNums = new Set<string>(); // records already handled (cancelled OR skipped/failed)

    await test.step('Steps 4-7: Cancel each Paid Invoice/Credit Note (CANCEL -> OK) until none remain', async () => {
      for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        // --- Re-apply the filter FRESH every pass (deterministic: cancelled invoices drop out, so the
        //     count strictly shrinks; no reliance on breadcrumb/list-cache state). ---
        await filterFresh();
        const count = await invoicePage.getInvoiceListRowCount();
        if (count === 0) {
          console.log('✓ No more Paid records (Invoices/Credit Notes) for Reseller_1 - stopping');
          break;
        }

        // Pick the first record NOT yet handled (so an un-cancellable one is skipped, not retried).
        const numbers = await invoicePage.getAllRowInvoiceNumbers();
        const target = numbers.find((n) => n && !processedNums.has(n));
        if (!target) {
          console.warn(`  ⚠ ${count} row(s) shown but all are already handled (numbers=${JSON.stringify(numbers)}) - stopping to avoid a loop`);
          break;
        }
        const kind = recordKind(target);

        console.log(`\n[Iteration ${iter + 1}] ${count} Paid record(s) shown; opening ${kind} "${target}"`);

        // --- Step 4: open the item (Invoice or Credit Note) ---
        const opened = await invoicePage.openInvoiceRowByNumber(target);
        if (!opened) {
          console.warn(`  ⚠ Could not open "${target}" - marking handled and continuing`);
          processedNums.add(target);
          continue;
        }
        await invoicePage.dismissErrorDialogWithRetry();

        const num = (await invoicePage.getInvoiceNumber().catch(() => '')) || target;
        const reseller = await invoicePage.getReseller().catch(() => '');
        const status = await invoicePage.getInvoiceStatus().catch(() => '');

        // --- SAFETY GUARD (type-agnostic): only cancel a Paid record that belongs to Reseller_1 ---
        if (!reseller.includes(RESELLER_1_NAME) || !/Paid/i.test(status)) {
          console.warn(`  ⚠ SKIP "${num}": Reseller="${reseller}", Status="${status}" - not a Reseller_1 Paid record.`);
          processedNums.add(target);
          if (num) processedNums.add(num);
          continue;
        }

        // --- Step 5 + 6: CANCEL then OK on the confirmation (same button on Invoice and Credit Note) ---
        console.log(`  - Cancelling ${kind} "${num}" (Reseller="${reseller}", Status="${status}")`);
        await invoicePage.clickCancelInvoice();
        await invoicePage.dismissErrorDialogWithRetry();

        const afterStatus = await invoicePage.waitForInvoiceStatus('Cancel');
        processedNums.add(target);
        if (num) processedNums.add(num);
        if (/Cancel/i.test(afterStatus)) {
          cancelled++;
          if (kind === 'Credit Note') cancelledCreditNotes++; else if (kind === 'Invoice') cancelledInvoices++;
          console.log(`  ✓ ${kind} "${num}" Cancelled (${cancelled} total: ${cancelledInvoices} Invoice(s), ${cancelledCreditNotes} Credit Note(s))`);
        } else {
          console.warn(`  ⚠ ${kind} "${num}" not Cancelled (status="${afterStatus}") - it will surface in the final check`);
        }
        // Step 7: loop -> the next pass re-filters fresh.
      }
      console.log(`\nCancel loop finished: ${cancelled} record(s) cancelled for Reseller_1 (${cancelledInvoices} Invoice(s), ${cancelledCreditNotes} Credit Note(s))`);
    });

    const extraNotCancelled: string[] = [];
    await test.step('Steps 4-6 (by id): Cancel reseller_1 Paid records not reachable by the name filter', async () => {
      if (EXTRA_IDS.length === 0) { console.log('  - No EXTRA_IDS to process'); return; }
      console.log(`Processing ${EXTRA_IDS.length} extra id(s) by direct navigation: ${JSON.stringify(EXTRA_IDS)}`);
      for (const id of EXTRA_IDS) {
        await invoicePage.openInvoiceById(id);
        await invoicePage.dismissErrorDialogWithRetry();
        const num = await invoicePage.getInvoiceNumber().catch(() => `id=${id}`);
        const reseller = await invoicePage.getReseller().catch(() => '');
        const status = await invoicePage.getInvoiceStatus().catch(() => '');
        const kind = recordKind(num);
        // GUARD: only cancel a Paid record belonging to Reseller_1.
        if (!reseller.includes(RESELLER_1_NAME) || !/Paid/i.test(status)) {
          if (/Cancel/i.test(status)) { console.log(`  - id=${id} "${num}" already ${status} - skipping`); continue; }
          console.warn(`  ⚠ SKIP id=${id} "${num}": Reseller="${reseller}", Status="${status}" - not a Reseller_1 Paid record.`);
          continue;
        }
        console.log(`  - Cancelling ${kind} "${num}" (id=${id}, Reseller="${reseller}", Status="${status}")`);
        await invoicePage.clickCancelInvoice();
        await invoicePage.dismissErrorDialogWithRetry();
        const afterStatus = await invoicePage.waitForInvoiceStatus('Cancel');
        if (/Cancel/i.test(afterStatus)) {
          cancelled++;
          if (kind === 'Credit Note') cancelledCreditNotes++; else if (kind === 'Invoice') cancelledInvoices++;
          console.log(`  ✓ ${kind} "${num}" Cancelled (${cancelled} total)`);
        } else {
          extraNotCancelled.push(`${num} (id=${id}) status="${afterStatus}"`);
          console.warn(`  ⚠ ${kind} "${num}" not Cancelled (status="${afterStatus}")`);
        }
      }
    });

    await test.step('Verification: no Paid Invoices or Credit Notes remain for Reseller_1', async () => {
      await filterFresh();
      const remaining = await invoicePage.getInvoiceListRowCount();
      const remainingNums = await invoicePage.getAllRowInvoiceNumbers();
      console.log(`  - Cancelled ${cancelled} record(s) (${cancelledInvoices} Invoice(s), ${cancelledCreditNotes} Credit Note(s)). Remaining Paid for Reseller_1 (name filter): ${remaining} ${JSON.stringify(remainingNums)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - no Paid records remain').catch(() => {});
      expect(remaining, `No Paid Invoices/Credit Notes should remain for Reseller_1 ("${RESELLER_1_NAME}") via the name filter`).toBe(0);
      expect(extraNotCancelled, `All EXTRA_IDS should be cancelled (still Paid: ${JSON.stringify(extraNotCancelled)})`).toEqual([]);
      console.log('✅ All Paid Invoices and Credit Notes of Reseller_1 cancelled');
    });
  });
});
