import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
// Blocker #1 fix: the native sale.subscription screens do not exist on crm-mig - drive the embed.
import { SubscriptionPageEmbed as SubscriptionPage, SubscriptionPageMig } from '@pages/mig';
import { HomePageMig as HomePage } from '@pages/mig';
import { InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  logVerify,
  todayMMDDYYYY,
  TEMPLATE_MONTHLY_INVOICE_ONLY,
  SKU_O365,
} from '@helpers/crm-11806-subscription.helper';
import {
  loginAsCrmAdminMig,
  createSubscriptionMig,
  deleteSubscriptionOnPeer,
  migRunCustomer,
} from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_3.9 - Cancelling a subscription invoice closes that cycle and leaves the next
 *                      billing date alone
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_3.9
 *  Xray:            CRM-14092
 *  Spec ID:         IS-CRM-FUNC-0195, IS-CRM-FUNC-0146
 *                   Spec text  : cancelling a subscription invoice closes that cycle; no new
 *                                invoice is issued for it and the next billing date stays as it
 *                                is (0195). A cycle closed this way is not a duplicated cycle
 *                                under 0146.
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring Billing)" pageId 222538152 v5 (2026-11-02), which SUPERSEDES the FRD.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v5, 2026-11-02)
 *                   It SUPERSEDES the FRD (pageId 222528736); do not key assertions to the FRD.
 *  Jira:            CRM-13907 (the defect that raised the question) / CRM-11806 (feature)
 *  Automation-Type: new (no pre-production baseline - 0195 is new in spec v5)
 *  Automation-Date: 2026-11-03
 * --------------------------------------------------------------------------------------------
 *  WHY THIS CASE EXISTS
 *  Raised as CRM-13907: on crm-mig, cancelling a subscription invoice made the service re-invoice
 *  the same period automatically. Aiva decided option (B) on 2026-11-02 and added
 *  IS-CRM-FUNC-0195 to spec v5 - the cycle is CLOSED, not re-invoiced - noting that this is how
 *  Production behaves and how duplicate or unwanted invoices are dropped there (SUB1293, Oct 2026,
 *  CRM-7946). Aiva asked for this test case on that ticket.
 *
 *  SO THIS SPEC IS EXPECTED TO GO RED until the crm-mig change is made. That red IS the
 *  deliverable: it is the defect of CRM-13907, measured rather than described. It is NOT marked
 *  `test.fail()` - nobody has yet confirmed the behaviour is still there after spec v5, and
 *  pre-declaring a failure would hide a fix just as effectively as it would hide a defect.
 * --------------------------------------------------------------------------------------------
 *  FIRST RUN, 2026-11-03 10:52 - RED at VP2, which is EARLIER than the defect it was written for.
 *
 *  It never reached VP4. Step 2 cancels the cycle's invoice, and on crm-mig the invoice DID NOT
 *  become Cancelled - it stayed Draft:
 *    - UI   : the header carries exactly "Validate | Preview | Cancel" and the statusbar radio
 *             "Draft" was still [checked] after the click (failure snapshot, run 10:52).
 *    - DB   : account.invoice id 100001695, origin "SUB00291", state = "draft", read directly on
 *             crm-mig minutes afterwards.
 *  The automation clicked the invoice's OWN Cancel button - it sits beside Validate and Preview,
 *  not the form's discard - and the confirmation dialog appeared and was accepted. So this is a
 *  behaviour finding, not a wrong-locator one.
 *
 *  CONSEQUENCE FOR 0195: the requirement "cancelling an invoice closes that cycle" cannot be
 *  tested at all while cancelling does not take effect. VP3/VP4/VP5 are unverified, not passed.
 *  Raise the cancel behaviour first; this case is the reproduction.
 *
 *  LEFTOVER FROM THAT RUN: sale.subscription id 2018 / SUB00291 on pre-sales-crm-mig.nakivo.site
 *  and account.invoice 100001695 on crm-mig - see the teardown note below for why they stayed.
 * --------------------------------------------------------------------------------------------
 *  ONE DOCUMENTED DEVIATION FROM THE MANUAL CASE - read this before trusting a green run.
 *
 *  CRM-14092 says "have the daily billing run process S once (Dev runs 'Subscriptions
 *  management')". crm-mig has no daily billing run yet (CRM-13828), so this spec uses the
 *  "=> Generate Invoice" link instead, exactly as CRM-11806_3.1 / 3.2 / 3.3 do.
 *
 *  The two are NOT equivalent in general - the link bills one cycle on demand and never
 *  re-attempts a declined collection - but for THIS case they ask the same question: after the
 *  cycle's invoice is cancelled, does asking the service to bill again raise a second invoice for
 *  the same period? If the daily run differs from the link here, the link's answer is the weaker
 *  one, so a RED result is trustworthy and a GREEN result still needs the daily run to confirm.
 *  That is stated again in the step-4 log so it reaches the report, not just this header.
 * --------------------------------------------------------------------------------------------
 *  Runs on         : CRM https://crm-mig.nakivo.site (Odoo 12 CE)
 *                    Subscription service https://subscription-crm-mig.nakivo.site (Odoo 19)
 *
 *  DATA IT CREATES, AND HOW IT IS REMOVED: one subscription on the peer, through the order path.
 *  Its peer id is captured from the create call and deleted in afterEach - a deny-list of exactly
 *  what this run made, never a keep-list. Teardown runs whatever the verdict.
 *
 *  BUT THE DELETE IS REFUSED ONCE THE CYCLE HAS BEEN BILLED (measured 2026-11-03, run 1):
 *    [peer teardown] COULD NOT remove SUB00291 (id 2018) - ... violates RESTRICT setting of
 *    foreign key constraint "nakivo_billing_event_su..."
 *  The billing run writes a `nakivo.billing.event` row that points at the subscription, and the
 *  FK is RESTRICT, so the subscription can no longer be unlinked. CRM-11806_3.2 hit the same wall
 *  and recorded it as "a subscription that produced a validated invoice cannot be cleanly
 *  deleted". So this case DOES leave one subscription and one draft invoice behind on every run.
 *  That is a known, reported leftover - not a teardown that was forgotten - and the run log prints
 *  the Reference and peer id needed to find it. Removing it needs the billing event cleared first,
 *  which is a Dev action, not a QA one.
 *
 *  TWO DEVIATIONS FROM THE MANUAL PRE-CONDITION, both the helper's, both recorded here:
 *   - CRM-14092 says Customer = "a new company customer". createSubscriptionMig() cannot create a
 *     partner on the peer from this form (its D5 note) and substitutes the existing shared contact
 *     MIG_TEST_CUSTOMER. So no partner is created and none is deleted. This changes no expected
 *     result - every VP below is about the invoice and the cycle, not about the customer.
 *   - BECAUSE the customer name is substituted, the AUTO-CRM-11806_3.9-<id> marker passed to the
 *     helper does NOT land on the record. If this spec is killed between create and teardown, the
 *     leftover is findable by the subscription Reference and peer id printed in the run log, not
 *     by a name grep. That is weaker than the marker rule wants; it is stated rather than assumed.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors CRM-14092 - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CRM (https://crm-mig.nakivo.site) as Subscription staff Ho Quoc Anh (admin_crm_mig)
 *    Open CRM > Pipeline and create an Opportunity:
 *      - Opportunity = "AUTO-CRM-11806_3.9-<yyyyMMddHHmm>"
 *      - Customer    = a new company customer
 *    Click "Deal Element", set Pricelist = "Public Pricelist_USD (USD)" and add one Order Line:
 *      - Product     = "[CP-NC-O365] Office 365 for CSP - No Commitment" (Subscriptionable)
 *      - Ordered Qty = 10
 *    Click "SAVE", then "New quotation", then "CONFIRM"
 *    Click the "SUBxxxxx Subscription" smart button on the order (subscription S), click "EDIT":
 *      - Subscription Template = "Monthly Sub/Invoice only"
 *      - Date of Next Invoice  = today (D)
 *    Click "SAVE", then "IN PROGRESS".
 *    Have the billing run process S once so one invoice exists for the cycle. Write down the
 *    invoice number as N and the new "Date of Next Invoice" as D2.
 *
 *  Steps to reproduce:
 *   1. Open S, click the "Invoices" smart button and open invoice N
 *   2. Cancel invoice N on the CRM
 *   3. Go back to S and read "Date of Next Invoice"
 *   4. Have the billing run process S once more, then click the "Invoices" smart button and count
 *      the invoices of that cycle
 *   5. Read S's stage bar and its chatter
 *
 *  Verification Points:
 *   VP1. Invoice N is the invoice of the cycle just billed, and S shows "Date of Next Invoice" = D2
 *   VP2. Invoice N reads Cancelled
 *   VP3. "Date of Next Invoice" is still D2 - cancelling the invoice did NOT move it
 *        (IS-CRM-FUNC-0195)
 *   VP4. No new invoice was issued for the cancelled cycle - the cycle is closed, not re-invoiced
 *        (IS-CRM-FUNC-0195). Re-invoicing here is the defect reported in CRM-13907
 *   VP5. S is still In Progress, and the cancelled cycle is NOT counted as a skipped cycle under
 *        IS-CRM-FUNC-0146
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_3\.9:" --project=O12
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_3.9';
const QUANTITY = 10;

/** Leave the created subscription on the peer for inspection instead of deleting it. */
const SKIP_CLEANUP = false;

test.describe(`${TC_ID} - Cancelling a subscription invoice closes that cycle`, () => {
  let peerId: number | null = null;
  let reference = '';

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`❌ TEST FAILED - reason: ${testInfo.error?.message ?? 'unknown'}`);
      await new HomePage(page).waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    // Teardown runs whatever the verdict - a failed assertion must not leave a record behind.
    // Deny-list: the ONE peer id this run created, captured from the create call.
    await deleteSubscriptionOnPeer(new SubscriptionPageMig(page), peerId, reference, SKIP_CLEANUP).catch(() => {});
    peerId = null;
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC_ID}: Cancelling a subscription invoice closes that cycle and leaves the next billing date alone @mig-live`, async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'defect',
      description: 'CRM-13907 - on crm-mig, cancelling a subscription invoice made the service re-invoice the same period automatically. Spec v5 (IS-CRM-FUNC-0195) requires the cycle to be CLOSED instead. VP4 below is exactly that check; it is expected to go red until the crm-mig change is made.',
    });
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);
    const customerName = migRunCustomer(TC_ID);

    let dateAfterFirstRun = '';
    let countAfterFirstRun = -1;
    let subscriptionUrl = '';

    await test.step('Pre-condition: create S and bill its first cycle', async () => {
      await loginAsCrmAdminMig(page);
      const created = await createSubscriptionMig(page, {
        customerName,
        template: TEMPLATE_MONTHLY_INVOICE_ONLY,
        productSku: SKU_O365,
        quantity: QUANTITY,
        nextInvoiceDate: todayMMDDYYYY(),
      });
      peerId = created.peerId;
      reference = created.reference;
      console.log(`✓ Subscription ${reference} created (peer id ${peerId})`);

      const billing = await subscriptionPage.clickGenerateInvoice();
      subscriptionUrl = billing.returnUrl;
      await subscriptionPage.openByUrl(subscriptionUrl);

      countAfterFirstRun = await subscriptionPage.getInvoiceCount();
      dateAfterFirstRun = await subscriptionPage.getDateOfNextInvoice();
      console.log(`✓ First billing run done - invoices = ${countAfterFirstRun}, D2 = "${dateAfterFirstRun}"`);
    });

    await test.step('Step 1: Open S, click the "Invoices" smart button and open invoice N', async () => {
      logVerify(
        'VP1',
        'Invoice N is the invoice of the cycle just billed, and S shows "Date of Next Invoice" = D2',
        `"Invoices" smart button = ${countAfterFirstRun}; "Date of Next Invoice" = "${dateAfterFirstRun}"`,
        countAfterFirstRun === 1 && dateAfterFirstRun !== '',
      );
      expect(countAfterFirstRun, 'VP1: the first billing run should leave exactly one invoice').toBe(1);
      expect(dateAfterFirstRun, 'VP1: "Date of Next Invoice" should be readable after the run').not.toBe('');

      await subscriptionPage.openInvoices();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - the invoice of the billed cycle').catch(() => {});
    });

    await test.step('Step 2: Cancel invoice N on the CRM', async () => {
      await invoicePage.clickCancelInvoice();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const status = await invoicePage.getInvoiceStatus().catch(() => '');

      logVerify('VP2', 'Invoice N reads Cancelled', `invoice status = "${status}"`, /cancel+ed/i.test(status));
      expect(status, 'VP2: the invoice should read Cancelled after Cancel').toMatch(/cancel+ed/i);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - invoice cancelled').catch(() => {});
    });

    await test.step('Step 3: Go back to S and read "Date of Next Invoice"', async () => {
      await subscriptionPage.openByUrl(subscriptionUrl);
      const dateAfterCancel = await subscriptionPage.getDateOfNextInvoice();

      logVerify(
        'VP3',
        `"Date of Next Invoice" is still D2 ("${dateAfterFirstRun}") - cancelling the invoice did NOT move it (IS-CRM-FUNC-0195)`,
        `"Date of Next Invoice" = "${dateAfterCancel}"`,
        dateAfterCancel === dateAfterFirstRun,
      );
      expect(dateAfterCancel, 'VP3: cancelling an invoice must not move the next billing date (IS-CRM-FUNC-0195)').toBe(dateAfterFirstRun);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - next billing date after the cancel').catch(() => {});
    });

    await test.step('Step 4: Bill S once more and count the invoices of that cycle', async () => {
      console.log('NOTE: this step uses the "=> Generate Invoice" link, not the daily billing run');
      console.log('      ("Subscriptions management"), which crm-mig does not have yet - CRM-13828.');
      console.log('      A RED result here is trustworthy; a GREEN one still needs the daily run to confirm.');

      const stillOffered = await subscriptionPage.isGenerateInvoiceVisible();
      console.log(`  - "=> Generate Invoice" still offered: ${stillOffered}`);
      if (stillOffered) {
        const second = await subscriptionPage.clickGenerateInvoice();
        await subscriptionPage.openByUrl(second.returnUrl);
      } else {
        console.log('  - The link is no longer offered, so the cycle cannot even be re-billed by hand');
      }

      const countAfterSecondRun = await subscriptionPage.getInvoiceCount();
      logVerify(
        'VP4',
        'No new invoice was issued for the cancelled cycle - the cycle is CLOSED, not re-invoiced (IS-CRM-FUNC-0195). Re-invoicing here is the defect reported in CRM-13907',
        `"Invoices" smart button = ${countAfterSecondRun} (was ${countAfterFirstRun} before the cancel)`,
        countAfterSecondRun === countAfterFirstRun,
      );
      expect(
        countAfterSecondRun,
        'VP4: the cancelled cycle must not be re-invoiced (IS-CRM-FUNC-0195) - a higher count is CRM-13907',
      ).toBe(countAfterFirstRun);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - invoice count after re-billing').catch(() => {});
    });

    await test.step("Step 5: Read S's stage bar and its chatter", async () => {
      const stage = await subscriptionPage.getState();
      const chatter = await subscriptionPage.getChatterText().catch(() => '');
      const skippedCycleClaim = /skipp?ed\s+cycle/i.test(chatter);

      logVerify(
        'VP5',
        'S is still In Progress, and the cancelled cycle is NOT counted as a skipped cycle under IS-CRM-FUNC-0146',
        `stage = "${stage}"; a "skipped cycle" line in the chatter = ${skippedCycleClaim}`,
        stage === 'In Progress' && !skippedCycleClaim,
      );
      expect(stage, 'VP5: cancelling one invoice should not change the subscription stage').toBe('In Progress');
      expect(skippedCycleClaim, 'VP5: a cycle closed by cancelling its invoice is not a skipped cycle (IS-CRM-FUNC-0146)').toBe(false);

      console.log(`✅ ${TC_ID}: ${reference} - the cancelled cycle closed without re-invoicing`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - stage bar and chatter').catch(() => {});
    });
  });
});
