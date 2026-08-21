import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, SubscriptionPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { logVerify } from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_1.1.1 - A subscription that reaches its next invoice date produces exactly one
 *                    recurring invoice
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.1.1
 *  Spec ID:         US1 (No billing gap)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: refactored
 *  Automation-Date: 2026-08-19
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to pre-production as a CRM administrator (e.g. Anh Ho)
 *    Open Subscriptions > Subscriptions and click "CREATE"
 *    Fill the new subscription form with:
 *      - Customer              = "Cust-OneInv-<unique>"
 *      - Pricelist             = "Public Pricelist_USD (USD)"
 *      - Subscription Template = "Monthly Sub/Invoice only"
 *      - Start Date            = today
 *      - Subscription Reminder = leave unticked (keeps "Remind Before Days" and
 *                                "Auto set subscription to draft" hidden and switched off)
 *    On the "Subscription Lines" tab click "Add a line" and fill:
 *      - Product  = "[CP-NC-PM-ENT] min 50Ent Machines, 1Month Subscription"
 *      - Quantity = 50
 *    Click "SAVE" and note the Reference shown at the top (e.g. SUB1425)
 *    NOTE: while the subscription is in DRAFT the form has no "Date of Next Invoice" field and no
 *          "=> Generate Invoice" link - both appear only after the subscription is set to IN PROGRESS
 *
 *  Steps to reproduce:
 *   1. Click "IN PROGRESS" on the status bar at the top right of the form
 *   2. Look at the right-hand column of the form for the field "Date of Next Invoice"
 *   3. Click "EDIT", set "Date of Next Invoice" = today, then click "SAVE"
 *   4. Read the number on the "Invoices" smart button at the top of the form
 *   5. Click the "=> Generate Invoice" link shown directly under "Date of Next Invoice"
 *   6. Read the "Invoices" smart button again, then click it and open the listed invoice
 *
 *  Verification Points:
 *   1. The status bar highlights IN PROGRESS
 *   2. "Date of Next Invoice" is now visible, with the "=> Generate Invoice" link under it
 *   3. (pre-condition check) while in DRAFT neither the field nor the link is rendered
 *   4. The "Invoices" smart button reads 0
 *   5. The "Invoices" smart button reads exactly 1 - not 0 and not 2
 *   6. "Date of Next Invoice" has moved forward by one month
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_1\.1\.1:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.1.1';
const ADMIN = users.admin_crm;
const TEMPLATE = 'Monthly Sub/Invoice only';
const PRICELIST = 'Public Pricelist_USD (USD)';
const PRODUCT_SKU = 'CP-NC-PM-ENT';
const QUANTITY = 50;
const NEXT_DATE_TOLERANCE_DAYS = 2;

/** Parse a displayed "MM/DD/YYYY" date into a Date (local midnight). Returns null if unparseable. */
function parseMMDDYYYY(raw: string): Date | null {
  const m = (raw || '').trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
}

/** Whole-day difference between two dates (a - b), ignoring time. */
function dayDiff(a: Date, b: Date): number {
  const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((da - db) / 86_400_000);
}

/** Today's date as MM/DD/YYYY, the format the Odoo date input expects. */
function todayMMDDYYYY(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

test.describe('CRM-11806_1.1.1 - One due cycle produces exactly one recurring invoice', () => {

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
    // A subscription that has produced a validated invoice cannot be cleanly deleted, so it is left
    // behind on purpose. Every run creates its own uniquely-named Customer, so re-runs never collide.
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-11806_1.1.1: A subscription that reaches its next invoice date produces exactly one recurring invoice', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const subscriptionPage = new SubscriptionPage(page);

    const unique = CommonUtils.generateUniqueId();
    const customerName = `Cust-OneInv-${unique}`;
    let reference = '';
    let draftFieldVisible = true;
    let draftLinkVisible = true;

    // ===================== Pre-conditions =====================
    await test.step('Pre-condition 1: Login to pre-production as a CRM administrator (Anh Ho)', async () => {
      console.log(`Pre-condition 1: Logging in as ${ADMIN.username}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(ADMIN.username, ADMIN.password, CommonUtils.waitTimes.login);
      console.log('✓ Logged in');
    });

    await test.step('Pre-condition 2: Open Subscriptions > Subscriptions and click "CREATE"', async () => {
      console.log('Pre-condition 2: Opening the Subscriptions list and creating a new subscription');
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clickCreate();
      console.log('✓ New subscription form opened');
    });

    await test.step('Pre-condition 3: Fill the new subscription form (Customer / Pricelist / Template / Start Date)', async () => {
      console.log('Pre-condition 3: Filling the subscription header');
      console.log(`  - Customer              : ${customerName}`);
      console.log(`  - Pricelist             : ${PRICELIST}`);
      console.log(`  - Subscription Template : ${TEMPLATE}`);
      console.log(`  - Start Date            : ${todayMMDDYYYY()}`);
      await subscriptionPage.fillMany2One('partner_id', customerName, true);
      await subscriptionPage.fillMany2One('pricelist_id', PRICELIST);
      await subscriptionPage.fillMany2One('template_id', TEMPLATE);
      await subscriptionPage.setDateField('date_start', todayMMDDYYYY());
      console.log('✓ Subscription header filled ("Subscription Reminder" left unticked)');
    });

    await test.step(`Pre-condition 4: On "Subscription Lines" click "Add a line" - Product ${PRODUCT_SKU}, Quantity ${QUANTITY}`, async () => {
      console.log(`Pre-condition 4: Adding the subscription line "${PRODUCT_SKU}" x ${QUANTITY}`);
      await subscriptionPage.addSubscriptionLine(PRODUCT_SKU, QUANTITY);
      console.log('✓ Subscription line added');
    });

    await test.step('Pre-condition 5: Click "SAVE" and note the Reference', async () => {
      await subscriptionPage.save();
      await subscriptionPage.waitForLoaded();
      reference = await subscriptionPage.getCode();
      console.log(`✓ Subscription saved - Reference = "${reference}"`);
      expect(reference, 'Pre-condition: the saved subscription should have a Reference (SUBxxx)').toMatch(/SUB\d+/i);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - subscription saved in DRAFT').catch(() => {});
    });

    await test.step('Pre-condition 6 (NOTE check): while in DRAFT, "Date of Next Invoice" and "=> Generate Invoice" are not rendered', async () => {
      const state = await subscriptionPage.getState();
      draftFieldVisible = await subscriptionPage.isDateOfNextInvoiceVisible();
      draftLinkVisible = await subscriptionPage.isGenerateInvoiceVisible();
      console.log('VERIFY (pre-condition NOTE):');
      console.log(`  Expected: State = "Draft", "Date of Next Invoice" hidden, "=> Generate Invoice" hidden`);
      console.log(`  Actual  : State = "${state}", field visible = ${draftFieldVisible}, link visible = ${draftLinkVisible}`);
      console.log(`  Result  : ${state === 'Draft' && !draftFieldVisible && !draftLinkVisible ? 'PASS' : 'FAIL'}`);
    });

    // ===================== Steps to reproduce =====================
    await test.step('Step 1: Click "IN PROGRESS" on the status bar', async () => {
      console.log('Step 1: Clicking IN PROGRESS on the status bar');
      await subscriptionPage.setStage('In Progress');
      console.log('✓ Stage clicked');
    });

    await test.step('Step 2: Look for the field "Date of Next Invoice"', async () => {
      console.log('Step 2: Checking that "Date of Next Invoice" is now rendered');
      const state = await subscriptionPage.getState();
      const fieldVisible = await subscriptionPage.isDateOfNextInvoiceVisible();
      const linkVisible = await subscriptionPage.isGenerateInvoiceVisible();

      console.log('VERIFY (VP1 + VP2 + VP3):');
      console.log(`  Expected: State = "In Progress"; "Date of Next Invoice" visible = true; "=> Generate Invoice" visible = true; and hidden while in Draft`);
      console.log(`  Actual  : State = "${state}"; field visible = ${fieldVisible}; link visible = ${linkVisible}; in Draft field was ${draftFieldVisible} / link was ${draftLinkVisible}`);
      console.log(`  Result  : ${state === 'In Progress' && fieldVisible && linkVisible && !draftFieldVisible && !draftLinkVisible ? 'PASS' : 'FAIL'}`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - IN PROGRESS, Date of Next Invoice visible').catch(() => {});

      expect(state, 'VP1: the status bar should highlight "In Progress"').toBe('In Progress');
      expect(fieldVisible, 'VP2: "Date of Next Invoice" should be visible once the subscription is In Progress').toBeTruthy();
      expect(linkVisible, 'VP2: the "=> Generate Invoice" link should be visible once the subscription is In Progress').toBeTruthy();
      expect(draftFieldVisible, 'VP3: "Date of Next Invoice" should NOT be rendered while the subscription is in Draft').toBeFalsy();
      expect(draftLinkVisible, 'VP3: the "=> Generate Invoice" link should NOT be rendered while the subscription is in Draft').toBeFalsy();
    });

    await test.step('Step 3: Click "EDIT", set "Date of Next Invoice" = today, click "SAVE"', async () => {
      console.log(`Step 3: Setting "Date of Next Invoice" to today (${todayMMDDYYYY()})`);
      await subscriptionPage.clickEdit();
      await subscriptionPage.setDateOfNextInvoice(todayMMDDYYYY());
      await subscriptionPage.save();
      await subscriptionPage.waitForLoaded();
      const nextDate = await subscriptionPage.getDateOfNextInvoice();
      console.log(`✓ "Date of Next Invoice" is now "${nextDate}" - the cycle is due today`);
    });

    let invoiceCountBefore = -1;
    await test.step('Step 4: Read the "Invoices" smart button', async () => {
      invoiceCountBefore = await subscriptionPage.getInvoiceCount();

      console.log('VERIFY (VP4):');
      console.log('  Expected: "Invoices" smart button = 0 (nothing billed yet)');
      console.log(`  Actual  : "Invoices" smart button = ${invoiceCountBefore}`);
      console.log(`  Result  : ${invoiceCountBefore === 0 ? 'PASS' : 'FAIL'}`);

      expect(invoiceCountBefore, 'VP4: the "Invoices" smart button should read 0 before the cycle is billed').toBe(0);
    });

    await test.step('Step 5: Click the "=> Generate Invoice" link', async () => {
      console.log('Step 5: Clicking "=> Generate Invoice"');
      const billing = await subscriptionPage.clickGenerateInvoice();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - the invoice the link opened').catch(() => {});
      console.log(`  - The link navigated to the created invoice: ${billing.navigatedToInvoice}`);
      // The link opens the invoice it just created, so come back to the subscription before
      // reading its smart button and next billing date.
      await subscriptionPage.openByUrl(billing.returnUrl);
      console.log('✓ Billing action completed, back on the subscription');
    });

    await test.step('Step 6: Read the "Invoices" smart button again and check the next billing date', async () => {
      const invoiceCountAfter = await subscriptionPage.getInvoiceCount();
      const nextDateRaw = await subscriptionPage.getDateOfNextInvoice();
      const nextDate = parseMMDDYYYY(nextDateRaw);
      const today = new Date();
      const expectedNext = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
      const diff = nextDate ? Math.abs(dayDiff(nextDate, expectedNext)) : 999;

      logVerify(
        'VP5 + VP6',
        `"Invoices" smart button = 1 (exactly one invoice for the cycle); "Date of Next Invoice" = today + 1 month (${expectedNext.toLocaleDateString('en-US')})`,
        `"Invoices" smart button = ${invoiceCountAfter}; "Date of Next Invoice" = "${nextDateRaw}" (diff ${diff} day(s))`,
        invoiceCountAfter === 1 && diff <= NEXT_DATE_TOLERANCE_DAYS,
      );

      expect(invoiceCountAfter, 'VP5: exactly ONE invoice should exist for the cycle - not 0 and not 2').toBe(1);
      expect(nextDate, `VP6: "Date of Next Invoice" should be parseable (got "${nextDateRaw}")`).not.toBeNull();
      expect(diff, `VP6: "Date of Next Invoice" ("${nextDateRaw}") should be one month after today (${expectedNext.toLocaleDateString('en-US')})`).toBeLessThanOrEqual(NEXT_DATE_TOLERANCE_DAYS);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 6 - one invoice, next date advanced').catch(() => {});
    });

    await test.step('Step 6 (continued): Click the "Invoices" smart button and verify the invoice details', async () => {
      const invoicePage = new InvoicePage(page);

      // Read the Recurring Price while we are STILL on the subscription - "recurring_total" is a
      // subscription field and does not exist on the invoice form, so reading it after navigating
      // would wait for an element that never appears.
      const recurringPriceNumeric = await subscriptionPage.getRecurringPrice();

      // Open the invoices list behind the smart button
      console.log('Step 6 (continued): Opening the Invoices list');
      await subscriptionPage.openInvoices();

      // Count the invoice rows in the list view
      const invoiceRowCount = await invoicePage.getInvoiceListRowCount();

      logVerify(
        'VP from Master step 6 (invoice list)',
        'Exactly one invoice is listed in the Invoices list',
        `Invoice list contains ${invoiceRowCount} invoice(s)`,
        invoiceRowCount === 1,
      );

      // Open the first (and only) invoice row
      await invoicePage.openFirstInvoiceRow();
      console.log('✓ Invoice detail page opened');

      // Read the invoice properties. "Source Document" (origin) lives on the "Other Info" tab and
      // Odoo keeps inactive notebook pages in the DOM but HIDDEN - without opening the tab the
      // reader resolves the span and then times out waiting for it to be visible.
      const invoiceTotalRaw = await invoicePage.getInvoiceTotal();
      await invoicePage.openOtherInfoTab();
      const invoiceSourceDoc = await invoicePage.getSourceDocument();

      // Parse amounts for numeric comparison (normalize by removing currency symbols, spaces, and thousands separators)
      const parseAmount = (raw: string): number => {
        return parseFloat((raw || '').replace(/ /g, ' ').replace(/[^0-9.,-]/g, '').replace(/,/g, '')) || 0;
      };

      const invoiceTotalNumeric = parseAmount(invoiceTotalRaw);

      logVerify(
        'VP from Master step 6 (Source Document)',
        `The invoice's Source Document equals the subscription Reference "${reference}"`,
        `Invoice Source Document = "${invoiceSourceDoc}"`,
        invoiceSourceDoc.includes(reference),
      );

      logVerify(
        'VP from Master step 6 (invoice total)',
        `The invoice's total equals the Recurring Price (${recurringPriceNumeric})`,
        `Invoice Total = ${invoiceTotalNumeric} (raw: "${invoiceTotalRaw}")`,
        invoiceTotalNumeric === recurringPriceNumeric,
      );

      expect(invoiceRowCount, 'Exactly one invoice should be listed in the Invoices list').toBe(1);
      expect(invoiceSourceDoc, `The invoice's Source Document should equal the subscription Reference "${reference}"`).toContain(reference);
      expect(invoiceTotalNumeric, `The invoice's total should equal the Recurring Price (${recurringPriceNumeric})`).toBe(recurringPriceNumeric);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 6 - invoice detail page, Source Document and Total verified').catch(() => {});

      console.log(`✅ ${TC_ID}: one due cycle produced exactly one invoice, with correct Source Document and Total`);
    });
  });
});
