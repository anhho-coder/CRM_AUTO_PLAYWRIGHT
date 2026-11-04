import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
// Blocker #1 fix: the native sale.subscription screens do not exist on crm-mig - drive the embed.
import { SubscriptionPageEmbed as SubscriptionPage, SubscriptionPageMig } from '@pages/mig';
import { HomePageMig as HomePage } from '@pages/mig';
import { InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  logVerifyBlock,
  readOdooNotice,
  todayMMDDYYYY,
  TEMPLATE_MONTHLY_INVOICE_ONLY,
  SKU_O365,
} from '@helpers/crm-11806-subscription.helper';
import {
  loginAsCrmAdminMig,
  createSubscriptionMig,
  deleteSubscriptionOnPeer,
  migRunCustomer,
  readMigBillingEvents,
  cancelledCycleEvent,
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
 *  SUPERSEDED 2026-11-04 - VP4's EXPECTED RESULT IS NOW 2, AND THIS CASE IS EXPECTED TO BE GREEN.
 *
 *  Two things happened on 2026-11-04, and they are separate:
 *
 *  CORRECTED 2026-11-04, LATER THE SAME DAY - (1) below was read too generously, and VP4 has been
 *  extended because of it. The invoice COUNT cannot test IS-CRM-FUNC-0195: "no further invoice for
 *  THAT cycle" is about one cycle, while the smart button totals all of them. The second invoice
 *  this case raises is the NEXT period's, not a re-issue - read off `nakivo.billing.event` on the
 *  peer for SUB00296 / SUB00300 / SUB00302 / SUB00303, where the second event's `period_date` is
 *  one month after the first. `origin` does not separate them either; it carries the subscription
 *  reference, not the period.
 *
 *  What those four subscriptions DO show is that the cancelled cycle's event goes back to
 *  `state = "pending"` with its `remote_document_id` cleared and a "Cancelled on the CRM" history
 *  line - the period is queued to be invoiced again, which is behaviour (A), not the (B) Aiva
 *  decided. No third invoice appeared during the runs only because the peer's scheduled action did
 *  not fire in the test window. So CRM-13907 is NOT fixed, and VP4b now asserts that cycle state
 *  directly instead of inferring it from a count. Expect this case to be RED on VP4b until the
 *  crm-mig change is made.
 *
 *  (1) MEASURED, and now qualified by the paragraph above. The pre-production baseline for this case
 *      (tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/3.Recurring-invoicing/
 *       tc-subscription-3-9-cancelling-an-invoice-closes-that-cycle.spec.ts, run
 *      2026-11-04-100833, subscription SUB1869) produced the SAME four readings as this spec's
 *      crm-mig run 2026-11-03-151248 on SUB00302: one invoice for the cycle, the invoice reads
 *      Cancelled, the next billing date does not move, and billing again leaves the smart button
 *      on 2. Pre-production re-invoices a cancelled cycle exactly as crm-mig does, so this is NOT
 *      a migration regression - the behaviour is not new.
 *
 *  (2) RULED, by the tester. After the second billing run the expected count is 2, because the
 *      system is designed to KEEP the cancelled invoice on record rather than remove it; the
 *      smart button is a total, so it counts the cancelled one plus the one the second run
 *      produced. VP4 asserts that. This is a QA ruling, not a quote from the spec.
 *
 *  OPEN QUESTION - not resolved here, and not to be closed by editing this file.
 *  Spec v5 IS-CRM-FUNC-0195 reads, verbatim: "When a recurring invoice is cancelled in the CRM,
 *  the subscription service shall treat that cycle as closed: it shall issue no further invoice
 *  for that cycle and shall leave the subscription's next billing date unchanged. A cycle closed
 *  this way does not count as a skipped cycle under IS-CRM-FUNC-0146. (CRM-13907)"
 *  Keeping the cancelled invoice on record and issuing no further invoice for the cycle are two
 *  different statements, and the second is the one 0195 makes. An expected count of 2 means one
 *  further invoice WAS issued after the cancel. Either 0195 needs rewording, or CRM-13907 stands
 *  against behaviour the spec still forbids. That is for Aiva Nievierova to settle; this case
 *  records the designed behaviour in the meantime and does NOT claim 0195 is satisfied.
 *
 *  VP3 is unaffected: "leave the next billing date unchanged" is the half of 0195 that both
 *  servers do meet, and VP3 still asserts it against IS-CRM-FUNC-0195 by name.
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
 *   VP4a. The "Invoices" smart button reads 2 - the cancelled invoice is kept on record by design,
 *         and the second billing run is recorded next to it (see the OPEN QUESTION above)
 *   VP4b. The cancelled cycle is CLOSED: its `nakivo.billing.event` on the peer is not back in
 *         state "pending" (IS-CRM-FUNC-0195). A "pending" here is the defect of CRM-13907
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

/**
 * Step labels - ONE source of truth for the `test.step()` label and the stdout banner, so the
 * report's step tree and the log line up character for character.
 */
const STEP = {
  pre: 'Pre-condition: create S and bill its first cycle',
  s1: 'Step 1: Open S, click the "Invoices" smart button and open invoice N',
  s2: 'Step 2: Cancel invoice N on the CRM',
  s3: 'Step 3: Go back to S and read "Date of Next Invoice"',
  s4: 'Step 4: Bill S once more and count the invoices of that cycle',
  s5: "Step 5: Read S's stage bar and its chatter",
} as const;

/**
 * What to outline in the verify screenshots.
 *
 * The subscription lives on the Odoo 19 peer INSIDE the embed iframe, and
 * `captureVerifyEvidence` marks the top-level document only - it cannot reach into a frame. So a
 * check read on the subscription outlines the EMBED that holds it, not the field itself; that is a
 * real limitation of the evidence helper on this screen, not a shortcut. The invoice form, by
 * contrast, is a plain top-level CRM page, so VP2 outlines the statusbar itself.
 *
 * The selector list form matches whichever of the two the page carries (CSS de-duplicates, so a
 * page with both still gets exactly one outline).
 */
const EMBED = 'iframe.o_nakivo_embed_frame, iframe';
const INVOICE_STATUSBAR = '.o_statusbar_status';

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
      description: 'CRM-13907 - on crm-mig, cancelling a subscription invoice made the service re-invoice the same period automatically. Measured 2026-11-04: pre-production does the same (baseline subscription-3.9, run 2026-11-04-100833), so this is not a migration regression. VP4 now expects 2 invoices - the cancelled one is kept on record by design, plus the one the second billing run produced - a tester ruling of 2026-11-04. Spec v5 IS-CRM-FUNC-0195 still says the service "shall issue no further invoice for that cycle"; that wording and this expected result disagree, and the spec header carries the open question.',
    });
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);
    const customerName = migRunCustomer(TC_ID);

    let dateAfterFirstRun = '';
    let countAfterFirstRun = -1;
    let subscriptionUrl = '';

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
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

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const countOk = countAfterFirstRun === 1;
      const dateOk = dateAfterFirstRun !== '';
      const lines = logVerifyBlock(
        [
          {
            what: 'the first billing run left exactly one invoice on S',
            expected: '"Invoices" smart button = 1',
            actual: `"Invoices" smart button = ${countAfterFirstRun}`,
            pass: countOk,
            difference: `expected 1 invoice, got ${countAfterFirstRun}`,
          },
          {
            what: 'S shows a readable "Date of Next Invoice" (D2) after the run',
            expected: 'a non-blank date',
            actual: `"Date of Next Invoice" = "${dateAfterFirstRun}"`,
            pass: dateOk,
            difference: '"Date of Next Invoice" came back blank',
          },
        ],
        'the cycle billed once and D2 is readable',
      );
      // Shot taken on the screen that OWNS the values - the subscription - and BEFORE the
      // assertions, so a red VP1 still has its picture. openInvoiceFormOnCrm() below leaves
      // this screen, so capturing after it would photograph the wrong page.
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC_ID} - VP1 - one invoice for the billed cycle`,
        passed: countOk && dateOk,
        highlight: EMBED,
        lines,
      }).catch(() => {});
      expect(countAfterFirstRun, 'VP1: the first billing run should leave exactly one invoice').toBe(1);
      expect(dateAfterFirstRun, 'VP1: "Date of Next Invoice" should be readable after the run').not.toBe('');

      // Re-open as a fresh CRM form: clicks on the SPA-routed form were silently ignored on
      // 2026-11-03 (three runs, invoice stayed `draft` in the DB). See openInvoiceFormOnCrm().
      const invoiceId = await subscriptionPage.openInvoiceFormOnCrm();
      console.log(`  - cycle invoice id = ${invoiceId}`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await invoicePage.clickCancelInvoice();
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      // Read any notification BEFORE judging the status. A Cancel that silently does nothing is
      // usually Odoo refusing it through a transient notification naming the required fields that
      // are still empty - measured on pre-production 2026-11-03: "The following fields are
      // invalid: End User Payment Terms", which is TWO fields (`partner_end_user_id` and
      // `payment_term_id`) printed with nothing between their labels, not one. Every earlier probe
      // dismissed that unread and reported "the button does nothing".
      // readOdooNotice() is bounded on purpose - see its own comment.
      const notice = await readOdooNotice(page);
      if (notice) console.log(`  - notification on screen after Cancel: "${notice.slice(0, 300)}"`);

      const status = await invoicePage.getInvoiceStatus().catch(() => '');
      const ok = /cancel+ed/i.test(status);
      const lines = logVerifyBlock(
        [
          {
            what: 'invoice N reads Cancelled after the Cancel action',
            expected: 'invoice status = "Cancelled"',
            actual: `invoice status = "${status}"${notice ? ` (notification: "${notice.slice(0, 120)}")` : ''}`,
            pass: ok,
            difference: `expected "Cancelled", got "${status}"${notice ? ` - Odoo raised: "${notice.slice(0, 160)}"` : ''}`,
          },
        ],
        'the cycle invoice is cancelled',
      );
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC_ID} - VP2 - invoice cancelled`,
        passed: ok,
        highlight: INVOICE_STATUSBAR,
        lines,
      }).catch(() => {});
      expect(status, 'VP2: the invoice should read Cancelled after Cancel').toMatch(/cancel+ed/i);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await subscriptionPage.openByUrl(subscriptionUrl);
      const dateAfterCancel = await subscriptionPage.getDateOfNextInvoice();
      const ok = dateAfterCancel === dateAfterFirstRun;

      const lines = logVerifyBlock(
        [
          {
            what: 'cancelling the invoice did NOT move the next billing date (IS-CRM-FUNC-0195)',
            expected: `"Date of Next Invoice" still D2 = "${dateAfterFirstRun}"`,
            actual: `"Date of Next Invoice" = "${dateAfterCancel}"`,
            pass: ok,
            difference: `the date moved from "${dateAfterFirstRun}" to "${dateAfterCancel}"`,
          },
        ],
        'the next billing date is untouched by the cancel',
      );
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC_ID} - VP3 - next billing date after the cancel`,
        passed: ok,
        highlight: EMBED,
        lines,
      }).catch(() => {});
      expect(dateAfterCancel, 'VP3: cancelling an invoice must not move the next billing date (IS-CRM-FUNC-0195)').toBe(dateAfterFirstRun);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
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
      const expectedCount = countAfterFirstRun + 1;
      const ok = countAfterSecondRun === expectedCount;

      // The count alone cannot test IS-CRM-FUNC-0195 - see readMigBillingEvents() for the four
      // subscriptions that proved it. The service's own record of the cycle is what carries the
      // answer, so it is read here rather than inferred from how many invoices exist.
      // No peer id means the fixture never told us which subscription to read, so the check cannot
      // run - VP4b then reports "could not be identified", which is a miss, not a pass.
      const events = peerId ? await readMigBillingEvents(page, peerId) : [];
      const cancelled = cancelledCycleEvent(events);
      const cycleClosed = !!cancelled && cancelled.state !== 'pending';
      const cycleActual = cancelled
        ? `the cycle of ${cancelled.period_date} is state="${cancelled.state}"` +
          (cancelled.remote_document_id ? ` (invoice ${cancelled.remote_document_id})` : ' with its invoice reference cleared')
        : 'no billing event on the peer carries a "Cancelled on the CRM" history line';

      const lines = logVerifyBlock(
        [
          {
            what: 'the cancelled invoice is kept and the re-billing is recorded next to it',
            expected: `"Invoices" smart button = ${expectedCount} (the cancelled invoice stays on record, plus the one the second billing run produced)`,
            actual: `"Invoices" smart button = ${countAfterSecondRun} (was ${countAfterFirstRun} before the cancel)`,
            pass: ok,
            difference:
              `expected ${expectedCount} invoice(s) after the second billing run, got ${countAfterSecondRun} ` +
              `(${countAfterFirstRun} before the cancel)`,
          },
          {
            what: 'the cancelled cycle is CLOSED, not queued to be invoiced again (IS-CRM-FUNC-0195)',
            expected: 'the billing event of the cancelled cycle is not back in state "pending"',
            actual: cycleActual,
            pass: cycleClosed,
            difference: cancelled
              ? `the cycle of ${cancelled.period_date} went back to state "${cancelled.state}" - the period is owed again ` +
                'and the peer will invoice it once its scheduled action runs. This is the defect reported in CRM-13907'
              : 'the cancelled cycle could not be identified on the peer, so this check proves nothing - treat it as not run',
          },
        ],
        'the cancelled invoice is retained, the next cycle is billed, and the cancelled cycle is closed',
      );
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC_ID} - VP4 - the cancelled cycle after re-billing`,
        passed: ok && cycleClosed,
        highlight: EMBED,
        lines,
      }).catch(() => {});
      expect(
        countAfterSecondRun,
        'VP4a: the cancelled invoice is kept on record and the second billing run adds one next to it',
      ).toBe(expectedCount);
      expect(
        cancelled ? cancelled.state : '(no cancelled cycle found on the peer)',
        'VP4b: the cancelled cycle must be closed, not queued to be invoiced again (IS-CRM-FUNC-0195) - ' +
          'a "pending" here is CRM-13907',
      ).not.toBe('pending');
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      const stage = await subscriptionPage.getState();
      const chatter = await subscriptionPage.getChatterText().catch(() => '');
      const skippedCycleClaim = /skipp?ed\s+cycle/i.test(chatter);
      const stageOk = stage === 'In Progress';
      const notSkipped = !skippedCycleClaim;

      const lines = logVerifyBlock(
        [
          {
            what: 'cancelling one invoice did not change the subscription stage',
            expected: 'stage = "In Progress"',
            actual: `stage = "${stage}"`,
            pass: stageOk,
            difference: `stage is "${stage}", not "In Progress"`,
          },
          {
            what: 'the cancelled cycle is NOT counted as a skipped cycle (IS-CRM-FUNC-0146)',
            expected: 'no "skipped cycle" line in the chatter',
            actual: `a "skipped cycle" line in the chatter = ${skippedCycleClaim}`,
            pass: notSkipped,
            difference: 'the chatter records the cancelled cycle as a skipped cycle',
          },
        ],
        `${reference} - the cancel left S running and its cancelled invoice on record`,
      );
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC_ID} - VP5 - stage bar and chatter`,
        passed: stageOk && notSkipped,
        highlight: EMBED,
        lines,
      }).catch(() => {});
      expect(stage, 'VP5: cancelling one invoice should not change the subscription stage').toBe('In Progress');
      expect(skippedCycleClaim, 'VP5: a cycle closed by cancelling its invoice is not a skipped cycle (IS-CRM-FUNC-0146)').toBe(false);
    });
  });
});
