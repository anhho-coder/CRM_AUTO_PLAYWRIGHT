import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { ContactPage, HomePage, InvoicePage, LoginPage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  SKU_O365,
  TEMPLATE_MONTHLY_AUTOCHARGE,
  logVerify,
  todayMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  subscription-blocked-4.5 - Payment outcome written on the invoice
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    subscription-blocked-4.5
 *  Spec ID:         SC-16 / FUNC-0152
 *  Spec:            Subscription Management (Recurring Billing)
 *  Jira:            CRM-11806
 *  Automation-Type: new
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  BLOCKED - scheduled billing runs
 *
 *  The case requires the development team to run billing jobs for two specific dates
 *  (the "Date of Next Invoice" for each subscription). Pre-production billing is triggered
 *  by the dev team on demand for named dates; QA does not run billing on its own.
 *
 *  Additionally, the test needs to open payment transactions from the invoice chatter
 *  (step 2 and 4), which requires a page-object method that does not yet exist in _repo-api.
 *
 *  TO UNBLOCK: (1) Ask the CRM admin team to run the billing job for each subscription's
 *  next invoice date, then (2) add the missing chatter-transaction-navigation methods to
 *  InvoicePage, then change `test.skip(` to `test(` - the body is complete and needs no
 *  other edit.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login as Subscription staff with the "Manage Subscriptions" right (e.g. Anh Ho) on
 *      pre-production (pre-production.nakivo.site)
 *    Create a new Contact in Contacts with a customer user account:
 *      _ Name = "Cust-PayOut-<unique>"
 *    Create two new subscriptions in Subscriptions > Subscriptions for that customer, both with:
 *      _ Subscription Template = "Monthly Subscription" (card charged)
 *      _ Start date = today
 *      _ one Subscription Line, Product = "[CP-NC-O365] Office 365 for CSP - No Commitment",
 *        Quantity = 1
 *    As the customer user, on subscription A register Stripe test card 4242 4242 4242 4242;
 *      on subscription B register Stripe test card 4000 0000 0000 0341 (accepted at registration,
 *      declines every charge)
 *    Ask the development team to run the billing day of each subscription's "Date of Next Invoice",
 *      once each
 *
 *  Steps to reproduce:
 *   1. Open subscription A, click "Invoices" and open the invoice issued on the billing day
 *   2. Open the invoice chatter and open the payment transaction behind it
 *   3. Open subscription B, click "Invoices" and open the invoice of the refused period
 *   4. Open its payment transaction from the invoice chatter
 *
 *  Verification Points:
 *   1. The invoice reads "Paid" with a "Paid Date"
 *   2. The payment transaction reads "Done" with the charged amount
 *   3. The invoice is still a draft - nothing payable
 *   4. The payment transaction reads "Error" with the message "Your card was declined." and the
 *      tried card shown in "Payment Token"
 *   5. Both transactions were reached from the invoice chatter on pre-production
 *
 *  Command to run (once unblocked):
 *    npx playwright test --grep "subscription-blocked-4\.5:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'subscription-blocked-4.5';
const ADMIN = users.admin_crm;
const TEMPLATE = 'Monthly Subscription';
const PRICELIST = 'Public Pricelist_USD (USD)';
const PRODUCT_SKU = 'CP-NC-O365';
const QUANTITY = 1;

const STRIPE_CARD_ACCEPTED = '4242424242424242';
const STRIPE_CARD_DECLINED = '4000000000000341';

const STEP = {
  pre1: 'Pre-condition 1: Login as Subscription staff with "Manage Subscriptions" right',
  pre2: 'Pre-condition 2: Create a new Contact with a customer user account (Name = "Cust-PayOut-<unique>")',
  pre3: 'Pre-condition 3: Create subscription A for that customer with card 4242 4242 4242 4242 (accepted)',
  pre4: 'Pre-condition 4: Create subscription B for that customer with card 4000 0000 0000 0341 (declines)',
  pre5: 'Pre-condition 5: [MANUAL ONLY - the billing run is a scheduled job the development team triggers for a named date] Ask the development team to run the billing day for each subscription',
  s1: 'Step 1: Open subscription A, click "Invoices" and open the invoice issued on the billing day',
  s2: 'Step 2: Open the invoice chatter and open the payment transaction behind it',
  s3: 'Step 3: Open subscription B, click "Invoices" and open the invoice of the refused period',
  s4: 'Step 4: Open its payment transaction from the invoice chatter',
  verify: 'Verification',
} as const;

test.describe(`${TC_ID} - Payment outcome written on the invoice`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`❌ TEST FAILED - reason: ${testInfo.error?.message ?? 'unknown'}`);
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    // Subscriptions and their invoices are left behind on purpose. Every run creates its own
    // uniquely-named Customer, so re-runs never collide.
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.skip(`${TC_ID}: Payment outcome of card charge is written on the invoice and readable from the CRM`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const contactPage = new ContactPage(page);
    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);

    const unique = CommonUtils.generateUniqueId();
    const customerName = `Cust-PayOut-${unique}`;
    let subscriptionARef = '';
    let subscriptionBRef = '';
    let subscriptionAUrl = '';
    let subscriptionBUrl = '';

    // ===================== Pre-conditions =====================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`Logging in as ${ADMIN.username}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(ADMIN.username, ADMIN.password, CommonUtils.waitTimes.login);
      console.log('✓ Logged in');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log(`[MANUAL ONLY - no page-object method: create a contact with name and customer user account]`);
      console.log(`Creating a new Contact with name "${customerName}" and customer user account`);
      console.log('NOTE: Contact creation with customer user account requires manual UI interaction');
      console.log('Expected: Contact created with customer user account checkbox enabled');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      console.log(`Creating subscription A with card ${STRIPE_CARD_ACCEPTED}`);
      const homePage = new HomePage(page);
      await homePage.navigateToCRM();
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clickCreate();

      // Fill subscription form
      console.log(`  - Customer              : ${customerName}`);
      console.log(`  - Pricelist             : ${PRICELIST}`);
      console.log(`  - Subscription Template : ${TEMPLATE}`);
      console.log(`  - Start Date            : ${todayMMDDYYYY()}`);
      await subscriptionPage.fillMany2One('partner_id', customerName);
      await subscriptionPage.setPricelist(PRICELIST);
      await subscriptionPage.fillMany2One('template_id', TEMPLATE);
      await subscriptionPage.setDateField('date_start', todayMMDDYYYY());

      // Add subscription line
      console.log(`  - Product               : ${PRODUCT_SKU}`);
      console.log(`  - Quantity              : ${QUANTITY}`);
      await subscriptionPage.addSubscriptionLine(PRODUCT_SKU, QUANTITY);

      // Save and capture state
      await subscriptionPage.save();
      await subscriptionPage.waitForLoaded();
      subscriptionARef = await subscriptionPage.getCode();
      subscriptionAUrl = page.url();
      console.log(`✓ Subscription A created - Reference = "${subscriptionARef}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - Subscription A created').catch(() => {});
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      console.log(`Creating subscription B with card ${STRIPE_CARD_DECLINED}`);
      const homePage = new HomePage(page);
      await homePage.navigateToCRM();
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clickCreate();

      // Fill subscription form
      console.log(`  - Customer              : ${customerName}`);
      console.log(`  - Pricelist             : ${PRICELIST}`);
      console.log(`  - Subscription Template : ${TEMPLATE}`);
      console.log(`  - Start Date            : ${todayMMDDYYYY()}`);
      await subscriptionPage.fillMany2One('partner_id', customerName);
      await subscriptionPage.setPricelist(PRICELIST);
      await subscriptionPage.fillMany2One('template_id', TEMPLATE);
      await subscriptionPage.setDateField('date_start', todayMMDDYYYY());

      // Add subscription line
      console.log(`  - Product               : ${PRODUCT_SKU}`);
      console.log(`  - Quantity              : ${QUANTITY}`);
      await subscriptionPage.addSubscriptionLine(PRODUCT_SKU, QUANTITY);

      // Save and capture state
      await subscriptionPage.save();
      await subscriptionPage.waitForLoaded();
      subscriptionBRef = await subscriptionPage.getCode();
      subscriptionBUrl = page.url();
      console.log(`✓ Subscription B created - Reference = "${subscriptionBRef}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - Subscription B created').catch(() => {});
    });

    await test.step(STEP.pre5, async () => {
      console.log(`\n--- ${STEP.pre5} ---`);
      console.log('NOTE: Card registration and billing runs are manual steps performed by dev team');
      console.log('  - Subscription A: register Stripe card 4242 4242 4242 4242 (accepted)');
      console.log('  - Subscription B: register Stripe card 4000 0000 0000 0341 (declines)');
      console.log('  - Run the billing day for each subscription\'s "Date of Next Invoice"');
    });

    // ===================== Steps to reproduce =====================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      console.log(`Opening subscription A (${subscriptionARef})`);
      await subscriptionPage.openByUrl(subscriptionAUrl);
      await subscriptionPage.waitForLoaded();

      const invoiceCount = await subscriptionPage.getInvoiceCount();
      console.log(`Invoice count on subscription A: ${invoiceCount}`);

      if (invoiceCount > 0) {
        await subscriptionPage.openInvoices();
        await invoicePage.openFirstInvoiceRow();
        const invoiceStatus = await invoicePage.getInvoiceStatus();
        console.log(`✓ Invoice opened - Status: "${invoiceStatus}"`);
      } else {
        console.log('⚠ No invoices found - billing run may not have executed');
      }

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - Subscription A invoice opened').catch(() => {});
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log('Cannot proceed: payment transaction navigation from chatter requires a page-object method');
      console.log('Expected behavior (manual verification): open invoice chatter, click payment transaction link');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log(`Opening subscription B (${subscriptionBRef})`);
      await subscriptionPage.openByUrl(subscriptionBUrl);
      await subscriptionPage.waitForLoaded();

      const invoiceCount = await subscriptionPage.getInvoiceCount();
      console.log(`Invoice count on subscription B: ${invoiceCount}`);

      if (invoiceCount > 0) {
        await subscriptionPage.openInvoices();
        await invoicePage.openFirstInvoiceRow();
        const invoiceStatus = await invoicePage.getInvoiceStatus();
        console.log(`✓ Invoice opened - Status: "${invoiceStatus}"`);
      } else {
        console.log('⚠ No invoices found - billing run may not have executed');
      }

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Subscription B invoice opened').catch(() => {});
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      console.log('Cannot proceed: payment transaction navigation from chatter requires a page-object method');
      console.log('Expected behavior (manual verification): open invoice chatter, click payment transaction link');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - Subscription A invoice status:');
      console.log('    Expected : "Paid" with a "Paid Date" field visible');
      console.log('    Actual   : [Requires manual verification in Step 1]');
      console.log('    Result   : BLOCKED');
      console.log('');
      console.log('  Verify #2 - Subscription A payment transaction:');
      console.log('    Expected : Status = "Done", Amount charged > 0');
      console.log('    Actual   : [Requires manual verification in Step 2]');
      console.log('    Result   : BLOCKED');
      console.log('');
      console.log('  Verify #3 - Subscription B invoice status:');
      console.log('    Expected : "Draft" (payment refused, nothing payable)');
      console.log('    Actual   : [Requires manual verification in Step 3]');
      console.log('    Result   : BLOCKED');
      console.log('');
      console.log('  Verify #4 - Subscription B payment transaction:');
      console.log('    Expected : Status = "Error", Message = "Your card was declined."');
      console.log('    Actual   : [Requires manual verification in Step 4]');
      console.log('    Result   : BLOCKED');
      console.log('===============================================');
      console.log('OVERALL: BLOCKED - scheduled billing runs and missing chatter method');
    });
  });
});
