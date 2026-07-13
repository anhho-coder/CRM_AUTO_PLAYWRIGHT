import { test } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, PaymentPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';

/**
 * ===========================================================================
 *  DIAGNOSTIC (not a TC) - Why won't CUST.IN/2026/1216 and /1200 cancel?
 * ===========================================================================
 *  For each stubborn payment: open it, read its reconciliation / invoice linkage,
 *  then press CANCEL once and capture the exact outcome (full "See details" text
 *  or a silent no-op) + the status afterwards. Pure investigation - no cleanup.
 *
 *  Command to run:
 *    npx playwright test --grep "INVESTIGATE-UNCANCELLABLE-PAYMENTS:" --project=chromium
 * ===========================================================================
 */

const RESELLER_1_NAME = DEAL_REGISTRATION.partnerCompanyName; // "TEST-Reseller#Automation-Jun10"
const TARGETS = (process.env.PAY_KEYS || 'CUST.IN/2026/1216,CUST.IN/2026/1200').split(',').map((s) => s.trim()).filter(Boolean);

test.describe('INVESTIGATE-UNCANCELLABLE-PAYMENTS', () => {

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test('INVESTIGATE-UNCANCELLABLE-PAYMENTS: inspect state + probe CANCEL for stubborn payments', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 4);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const paymentPage = new PaymentPage(page);

    const filterFresh = async () => {
      await paymentPage.openCustomerPaymentsListFresh();
      await paymentPage.filterPaymentsByPartnerNotCancelled(RESELLER_1_NAME);
      await paymentPage.expandPagerToShowAll();
    };

    await test.step('Login as Admin', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
    });

    for (const key of TARGETS) {
      await test.step(`Investigate ${key}`, async () => {
        await filterFresh();
        const opened = await paymentPage.openPaymentRowByKey(key);
        if (!opened) {
          console.log(`\n### ${key}: NOT FOUND in the "Status is not Cancelled" view (already cancelled or missing).`);
          return;
        }
        await paymentPage.dismissErrorDialogWithRetry();

        const status = await paymentPage.getStatus().catch(() => '');
        const linkage = await paymentPage.readPaymentLinkage();
        console.log(`\n### ${key}`);
        console.log(`    status         = "${status}"`);
        console.log(`    reconciled     = ${linkage.reconciled} (Payment Matching button ${linkage.reconciled ? 'ABSENT' : 'present'})`);
        console.log(`    invoicesCount  = ${linkage.invoicesCount} (Invoices smart button)`);
        console.log(`    hasJournalItems= ${linkage.hasJournalItems}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${key} - form before CANCEL`).catch(() => {});

        const probe = await paymentPage.probeCancelOutcome();
        console.log(`    CANCEL probe   : clicked=${probe.clicked}, statusAfter="${probe.statusAfter}"`);
        if (probe.dialogText) {
          console.log(`    CANCEL dialog  : ${probe.dialogText.slice(0, 1200)}`);
        } else {
          console.log(`    CANCEL dialog  : (none - ${/cancel/i.test(probe.statusAfter) ? 'CANCELLED' : 'SILENT NO-OP, still ' + probe.statusAfter})`);
        }
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${key} - after CANCEL probe`).catch(() => {});
      });
    }

    console.log('\n=== Investigation complete ===');
  });
});
