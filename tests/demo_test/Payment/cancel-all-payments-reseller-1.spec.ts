import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, PaymentPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';

/**
 * ===========================================================================
 *  DATA-CLEANUP UTILITY  -  Cancel all Payments of Reseller_1
 * ===========================================================================
 *  Test Case ID    : UTIL-CANCEL-PAYMENTS-RESELLER1
 *  Automation-Type : new
 *  Automation-Date : 2026-07-01
 *
 *  Purpose:
 *    Cancel every customer Payment (account.payment) that belongs to Reseller_1
 *    (the reseller partner "TEST-Reseller#Automation-Jun10", used by the O12 deal-registration
 *    flows) so the test data does not accumulate. Runs as Admin via the Invoicing UI.
 *
 *  Command to run:
 *    npx playwright test --grep "UTIL-CANCEL-PAYMENTS-RESELLER1:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Scenario (mirrors the manual steps)
 * ---------------------------------------------------------------------------
 *    1. Login as Admin.
 *    2. Go to the Invoicing module, Customers > Payments list.
 *    3. Filter:  Partner = Reseller_1  AND  Status is not "Cancelled"
 *       (the "Customer Payments" facet is already applied by the action default; two "Add Custom
 *        Filter" operations add "Partner is equal to <name>" and "Status is not Cancelled").
 *    4. Once the results show up, select an item (open a row into its form).
 *    5. Press the "CANCEL" button.
 *    6. Repeat steps 4-5 until no (cancellable) item shows up.
 *
 *  Termination note (important):
 *    With "Status is not Cancelled" applied, a cancelled payment LEAVES the filtered view, so the list
 *    shrinks toward empty as we cancel (and cancelled rows no longer occupy the 80-row page, so page-2+
 *    records surface). Only Posted/Reconciled payments have a CANCEL button; Draft payments have none
 *    (Confirm only) and cannot be cancelled - so if any Draft exists it remains in the view. "Until none
 *    of item show up" therefore means "until no CANCELLABLE (Posted/Reconciled) payment remains". Each
 *    pass this util:
 *      - re-applies the filter FRESH + expands the pager (authoritative current set),
 *      - picks the first Posted/Reconciled row not yet handled,
 *      - opens it (unique CUST.IN key), cross-checks identity + cancellable status, then cancels it.
 *    Draft rows are skipped (no CANCEL button) and logged. The cancellable count strictly decreases, so
 *    termination is reliable.
 *
 *  Verification:
 *    After the loop, re-apply the same filter fresh and assert 0 CANCELLABLE (Posted/Reconciled)
 *    payments remain for Reseller_1 (any remaining Draft rows are tolerated - they can't be cancelled).
 * ===========================================================================
 */

const RESELLER_1_NAME = DEAL_REGISTRATION.partnerCompanyName; // "TEST-Reseller#Automation-Jun10"
// Safety cap on how many payments to cancel in one run (guards against an unexpected loop).
// Override for a small validation run, e.g. CANCEL_MAX=2 npx playwright test ...
const MAX_ITERATIONS = Number(process.env.CANCEL_MAX) || 500;

/** A payment is cancellable (has a CANCEL button) when it is neither Draft nor Cancelled. */
const isCancellable = (status: string): boolean => !!status && !/^(Draft|Cancel)/i.test(status.trim());

test.describe('UTIL-CANCEL-PAYMENTS-RESELLER1 - Cancel all Payments of Reseller_1', () => {

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const paymentPage = new PaymentPage(page);
      await paymentPage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - final state').catch(() => {});
  });

  test('UTIL-CANCEL-PAYMENTS-RESELLER1: Cancel every Payment of Reseller_1 until none remain', async ({ page }, testInfo) => {
    // Cancelling can be many payments (each pass re-filters fresh); give the run a very generous budget.
    test.setTimeout(config.timeouts.test * 14);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const paymentPage = new PaymentPage(page);

    // Re-open the Payments list, re-apply BOTH facets (Partner = Reseller_1 AND Status is not
    // Cancelled), and expand the pager so ALL rows load (belt-and-suspenders in case >80 non-cancelled
    // remain). Excluding Cancelled makes the filtered set shrink as we cancel. Authoritative set.
    const filterFresh = async () => {
      await paymentPage.openCustomerPaymentsListFresh();
      await paymentPage.filterPaymentsByPartnerNotCancelled(RESELLER_1_NAME);
      await paymentPage.expandPagerToShowAll();
    };

    await test.step('Step 1: Login as Admin', async () => {
      console.log(`Step 1: Logging in as Admin (${users.admin_crm.displayName})`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log('✓ Logged in as Admin');
    });

    await test.step('Step 2: Go to Invoicing > Customers > Payments', async () => {
      await paymentPage.openCustomerPaymentsListFresh();
      console.log('✓ Customer Payments list opened');
    });

    await test.step('Step 3: Filter Partner = Reseller_1 AND Status is not Cancelled', async () => {
      console.log(`Step 3: Filtering Partner = "${RESELLER_1_NAME}" AND Status is not "Cancelled"`);
      await paymentPage.filterPaymentsByPartnerNotCancelled(RESELLER_1_NAME);
      await paymentPage.expandPagerToShowAll();
      const rows = await paymentPage.getPaymentRows();
      const cancellable = rows.filter((r) => isCancellable(r.status));
      console.log(`  - Payments for Reseller_1 in view: ${rows.length} (cancellable: ${cancellable.length})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - filtered payments').catch(() => {});
    });

    let cancelled = 0;
    const processedKeys = new Set<string>(); // payment names (CUST.IN/...) already handled (cancelled OR skipped/failed)
    const failedToCancel = new Set<string>(); // cancellable payments whose CANCEL errored / did not take effect

    await test.step('Steps 4-6: Cancel each Payment (open -> CANCEL) until none remain', async () => {
      for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        // Re-apply the filter FRESH every pass (deterministic: cancelled payments leave the cancellable
        // set, so the cancellable count strictly shrinks; no reliance on list-cache/breadcrumb state).
        await filterFresh();
        const rows = await paymentPage.getPaymentRows();
        const cancellable = rows.filter((r) => isCancellable(r.status));

        // Pick the first cancellable payment NOT yet handled (a stuck one is skipped, not retried forever).
        const target = cancellable.find((r) => r.key && !processedKeys.has(r.key));
        if (!target) {
          const draftCount = rows.filter((r) => !isCancellable(r.status) && !/^Cancel/i.test(r.status.trim())).length;
          console.log(`✓ No more cancellable Payments for Reseller_1 - stopping (rows shown: ${rows.length}, non-cancellable draft rows left: ${draftCount})`);
          break;
        }

        console.log(`\n[Iteration ${iter + 1}] ${cancellable.length} cancellable payment(s); opening "${target.key}" (Invoice="${target.invoice}", Status="${target.status}")`);

        // --- Step 4: open the item ---
        const opened = await paymentPage.openPaymentRowByKey(target.key);
        if (!opened) {
          console.warn(`  ⚠ Could not open payment "${target.key}" - marking handled and continuing`);
          processedKeys.add(target.key);
          continue;
        }
        await paymentPage.dismissErrorDialogWithRetry();

        const openName = await paymentPage.getOpenPaymentName().catch(() => '');
        const partner = await paymentPage.getPartnerName().catch(() => '');
        const status = await paymentPage.getStatus().catch(() => '');

        // --- SAFETY GUARD ---
        //   (a) we must have opened the intended payment (name cross-check, when the form shows it);
        //   (b) it must be in a cancellable state (Posted/Reconciled - never a Draft/Cancelled);
        //   (c) partner must be Reseller_1 when readable (the list is already filtered to Reseller_1 and
        //       the key is unique, so an empty/unreadable partner is tolerated with a warning).
        if (openName && openName !== target.key) {
          console.warn(`  ⚠ SKIP "${target.key}": opened form shows "${openName}" - identity mismatch, not cancelling.`);
          processedKeys.add(target.key);
          continue;
        }
        if (!isCancellable(status)) {
          console.warn(`  ⚠ SKIP "${target.key}": Status="${status}" - not cancellable.`);
          processedKeys.add(target.key);
          continue;
        }
        if (partner && !partner.includes(RESELLER_1_NAME)) {
          console.warn(`  ⚠ SKIP "${target.key}": Partner="${partner}" - not Reseller_1.`);
          processedKeys.add(target.key);
          continue;
        }
        if (!partner) {
          console.warn(`  ⚠ "${target.key}": Partner not readable from the form - proceeding (list is filtered to Reseller_1, key is unique).`);
        }

        // --- Step 5: press CANCEL ---
        console.log(`  - Cancelling payment "${target.key}" (Partner="${partner}", Status="${status}")`);
        const clicked = await paymentPage.clickCancelPayment();
        processedKeys.add(target.key);
        if (!clicked) {
          failedToCancel.add(target.key);
          console.warn(`  ⚠ "${target.key}" could NOT be cancelled (CANCEL errored or unavailable) - recorded, skipping`);
          continue;
        }

        const afterStatus = await paymentPage.waitForPaymentStatus('Cancel');
        if (/Cancel/i.test(afterStatus)) {
          cancelled++;
          console.log(`  ✓ payment "${target.key}" Cancelled (${cancelled} total)`);
        } else {
          failedToCancel.add(target.key);
          console.warn(`  ⚠ "${target.key}" still "${afterStatus}" after CANCEL - recorded as not-cancellable`);
        }
        // Step 6: loop -> the next pass re-filters fresh.
      }
      console.log(`\nCancel loop finished: ${cancelled} payment(s) cancelled for Reseller_1`);
    });

    await test.step('Verification: no cancellable Payments remain for Reseller_1', async () => {
      await filterFresh();
      const rows = await paymentPage.getPaymentRows();
      const remaining = rows.filter((r) => isCancellable(r.status));
      // The only acceptable leftovers are payments we explicitly TRIED and whose CANCEL errored
      // (a server-side block, not something this util can force). Anything else is a real miss.
      const unexpected = remaining.filter((r) => !failedToCancel.has(r.key));
      console.log(`  - Cancelled ${cancelled} payment(s). Rows shown: ${rows.length}. Cancellable remaining: ${remaining.length} (errored-on-cancel: ${failedToCancel.size}, unexpected: ${unexpected.length})`);
      if (failedToCancel.size) {
        console.warn(`  ⚠ Could NOT be cancelled (CANCEL errored server-side - investigate): ${JSON.stringify([...failedToCancel])}`);
      }
      if (unexpected.length) {
        console.warn(`  ⚠ Unexpectedly still cancellable: ${JSON.stringify(unexpected.map((r) => ({ key: r.key, invoice: r.invoice, status: r.status })))}`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - no cancellable payments remain').catch(() => {});
      expect(unexpected.length, `Every cancellable payment for Reseller_1 ("${RESELLER_1_NAME}") should be cancelled or recorded as errored-on-cancel`).toBe(0);
      console.log(`✅ All cancellable Payments of Reseller_1 handled (${cancelled} cancelled, ${failedToCancel.size} errored-on-cancel)`);
    });
  });
});
