import { test, expect, Page } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, SubscriptionPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { logVerifyBlock, readOdooNotice } from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  subscription-3.9 - Cancelling a subscription invoice closes that cycle and leaves the next
 *                     billing date alone
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    subscription-3.9
 *  Spec ID:         IS-CRM-FUNC-0195, IS-CRM-FUNC-0146
 *  Spec:            [Migration] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v5, 2026-11-02)
 *  Jira:            CRM-13907 (the defect this answers) / CRM-11806 (feature)
 *  Automation-Type: new
 *  Automation-Date: 2026-11-03
 * --------------------------------------------------------------------------------------------
 *  WHY THIS CASE EXISTS - it is the REFERENCE READING for CRM-11806_3.9 on crm-mig.
 *
 *  CRM-11806_3.9 (Xray CRM-14092) goes red at VP4 on crm-mig: after the cycle's invoice is
 *  cancelled, billing again raises a SECOND invoice for the same cancelled cycle. Whether that is
 *  a migration REGRESSION or simply how the product has always behaved cannot be told from the
 *  crm-mig run alone, and the pre-production suite had nothing to compare it with - section
 *  "3.Recurring-invoicing" held 3.1-3.4 only, and IS-CRM-FUNC-0195 is new in spec v5.
 *
 *  So this case exists to answer exactly one question, with the SAME four verification points as
 *  CRM-11806_3.9 so the two runs line up:
 *     VP4 differs between the two -> crm-mig differs from pre-production, a migration regression.
 *     VP4 the same on both        -> the behaviour is not new in the migration.
 *  Neither outcome is assumed, and this header must not be edited to prefer one.
 *
 *  MEASURED 2026-11-04 - the same on both. Two runs on pre-production, subscriptions SUB1869 and
 *  the one before it, both: 1 invoice for the cycle, the invoice reads CANCELLED (read off the
 *  status bar, not inferred), "Date of Next Invoice" still 12/04/2026, and billing again leaves
 *  the smart button on 2. crm-mig run 2026-11-03-151248 measured the same four readings on
 *  SUB00302. So the behaviour is NOT new in the migration.
 * --------------------------------------------------------------------------------------------
 *  VP4's EXPECTED RESULT IS 2, BY DESIGN - and that is a QA ruling, not a quote from the spec.
 *
 *  Set 2026-11-04 by the tester: after the second billing run the subscription is expected to show
 *  TWO invoices, because the system is designed to keep the cancelled invoice on record rather
 *  than remove it. The smart button is a total, so it counts the cancelled one plus the one the
 *  second run produced. VP4 asserts exactly that, and it is green on both servers.
 *
 *  OPEN QUESTION - not resolved here, and not to be closed by editing this file.
 *  Spec v5 IS-CRM-FUNC-0195 reads, verbatim: "When a recurring invoice is cancelled in the CRM,
 *  the subscription service shall treat that cycle as closed: it shall issue no further invoice
 *  for that cycle and shall leave the subscription's next billing date unchanged. A cycle closed
 *  this way does not count as a skipped cycle under IS-CRM-FUNC-0146. (CRM-13907)"
 *  Retaining the cancelled invoice and issuing no further invoice for the cycle are two different
 *  statements, and the second one is the one 0195 makes. An expected count of 2 means one further
 *  invoice WAS issued after the cancel. Either 0195 needs rewording, or CRM-13907 stands against
 *  behaviour the spec still forbids. That is for the spec's author (Aiva Nievierova) to settle -
 *  this case records the designed behaviour in the meantime and does NOT claim 0195 is satisfied.
 *
 *  VP3 is unaffected: "leave the next billing date unchanged" is the half of 0195 both servers do
 *  meet, and VP3 still asserts it against IS-CRM-FUNC-0195 by name.
 *
 *  It is NOT a statement about Production: pre-production is a 22-Jan snapshot of it.
 * --------------------------------------------------------------------------------------------
 *  ONE DOCUMENTED DEVIATION - read it before trusting a green run.
 *
 *  Pre-condition 4 fills two required fields on the invoice: `partner_end_user_id` ("End User")
 *  and `payment_term_id` ("Payment Terms"). A partner this test creates inline carries neither, so
 *  Odoo refuses the Cancel and the invoice silently stays Draft - measured 2026-11-03, when a
 *  first attempt at this case reported "2 invoices after re-billing" that in truth only measured
 *  billing twice without a cancel in between.
 *
 *  The refusal arrives as a transient notification reading
 *      "The following fields are invalid: End User Payment Terms"
 *  which is Odoo CONCATENATING the two labels, not the name of a single field. The DOM shows four
 *  `o_field_invalid` nodes: two labels and two empty required widgets.
 *
 *  A real customer carries both fields, so filling them restores realistic data rather than
 *  working around a product rule. It is still a deviation, and it is logged at run time too.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to pre-production as a CRM administrator (e.g. Anh Ho)
 *    Open Subscriptions > Subscriptions and click "CREATE"; fill Customer / Pricelist /
 *      Subscription Template "Monthly Sub/Invoice only" / Start Date = today, add one
 *      subscription line, SAVE, then click "IN PROGRESS" and set "Date of Next Invoice" = today
 *    Click "=> Generate Invoice" once so the cycle has its invoice N
 *    On invoice N fill "End User" and "Payment Terms" (see the deviation above) and SAVE
 *
 *  Steps to reproduce:
 *   1. Read the "Invoices" smart button and "Date of Next Invoice" (D2) on subscription S
 *   2. Open invoice N and click "CANCEL"
 *   3. Go back to S and read "Date of Next Invoice" again
 *   4. Click "=> Generate Invoice" once more and read the "Invoices" smart button
 *   5. Read S's status bar
 *
 *  Verification Points:
 *   1. The cycle produced exactly one invoice, and D2 is readable
 *   2. Invoice N reads Cancelled
 *   3. "Date of Next Invoice" is still D2 - the cancel did not move it (IS-CRM-FUNC-0195)
 *   4. The "Invoices" smart button reads 2 - the cancelled invoice is kept on record by design,
 *      and the second billing run is recorded next to it (see the OPEN QUESTION above)
 *   5. S is still In Progress
 *
 *  DATA IT CREATES: one subscription with a uniquely-named Customer. A subscription that has
 *  produced an invoice cannot be cleanly deleted, so it is left behind on purpose - the same
 *  convention as its neighbour subscription-3.1 - and the unique name keeps re-runs from
 *  colliding.
 *
 *  Command to run:
 *    npx playwright test --grep "subscription-3\.9:" --project=chromium-headless
 * ============================================================================================
 */

const TC_ID = 'subscription-3.9';
const ADMIN = users.admin_crm;
const TEMPLATE = 'Monthly Sub/Invoice only';
const PRICELIST = 'Public Pricelist_USD (USD)';
const PRODUCT_SKU = 'CP-NC-PM-ENT';
const QUANTITY = 50;

/** Step labels - ONE source of truth for the `test.step()` label and the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to pre-production as a CRM administrator',
  pre2: 'Pre-condition 2: Create subscription S, set it IN PROGRESS and make the cycle due today',
  pre3: 'Pre-condition 3: Click "=> Generate Invoice" once so the cycle has its invoice N',
  pre4: 'Pre-condition 4: On invoice N fill "End User" and "Payment Terms", then SAVE',
  s1: 'Step 1: Read the "Invoices" smart button and "Date of Next Invoice" (D2) on S',
  s2: 'Step 2: Open invoice N and click "CANCEL"',
  s3: 'Step 3: Go back to S and read "Date of Next Invoice" again',
  s4: 'Step 4: Click "=> Generate Invoice" once more and read the "Invoices" smart button',
  s5: "Step 5: Read S's status bar",
} as const;

/** What each verification screenshot outlines. Pre-production is one document - no iframe. */
const INVOICES_SMART_BUTTON = 'button[name="action_subscription_invoice"]';
const NEXT_INVOICE_DATE = 'span[name="recurring_next_date"]';
const SUBSCRIPTION_STAGE = 'div[name="stage_id"]';
const INVOICE_STATUSBAR = '.o_statusbar_status';

/**
 * The Payment Term this test sets on the invoice. Any of the 7 the field offers would do - the
 * verifications below never read it back; it is set only because Odoo refuses the Cancel while
 * the field is empty. Measured on pre-production 2026-11-04, the field offers: Immediate Payment,
 * 15 Days, 30 Net Days, 45 Days, 2 Months, Prianto Ltd, Technical.
 */
const PAYMENT_TERM = 'Immediate Payment';

/**
 * Open an INVOICE by its own URL.
 *
 * Deliberately NOT `SubscriptionPage.openByUrl()`: that one ends in `waitForLoaded()`, which waits
 * for subscription markers an invoice form never renders, so it spends the whole `pageLoad` budget
 * (240 s) on every call before carrying on. That is what made the 2026-11-03 run of this spec blow
 * its 15-minute test timeout. Measured 2026-11-04 on pre-production invoice 208803, the plain goto
 * below reaches a rendered invoice form in 14 s.
 */
async function openInvoiceByUrl(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // Wait for the INVOICE form, not for "a form". Odoo swaps controllers in place, so for a moment
  // after the hash changes the PREVIOUS record's form is still in the DOM - and a bare
  // `.o_form_view` wait is satisfied instantly by the subscription we came from, so the next click
  // lands on that instead. Measured 2026-11-04: a run that waited on `.o_form_view` clicked EDIT on
  // `o_form_view o_subscription_form o_form_readonly` and then reported both invoice fields
  // missing, which read exactly like a product difference. The invoice form carries
  // `o_invoice_form`; waiting on that cannot be satisfied by the wrong record.
  await page.locator('.o_form_view.o_invoice_form').first()
    .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
  await page.waitForTimeout(CommonUtils.waitTimes.standard);
}

/**
 * Put the invoice form into edit mode, and prove it got there before anything is typed.
 *
 * In read-only mode an Odoo 12 many2one renders its label and an EMPTY cell - no `<input>` at all
 * - so a fill that runs while the form is still read-only reports "not rendered on the visible
 * part of the form" and reads exactly like a field that does not exist. Measured 2026-11-04: that
 * is what failed the first run of this spec, on a form the page snapshot shows carrying both
 * "End User" and "Payment Terms" rows.
 *
 * `InvoicePage.clickEdit()` returns 2 s after the click whether or not it took, so this re-reads
 * the form's own class list - the state Odoo actually publishes - and says what it found. The
 * class names are measured, not assumed: on pre-production an invoice form is
 * `o_form_view o_invoice_form o_form_readonly` and becomes `... o_form_editable`.
 */
async function enterInvoiceEditMode(page: Page, invoicePage: InvoicePage): Promise<void> {
  const form = page.locator('.o_form_view').first();
  for (let attempt = 1; attempt <= 3; attempt++) {
    const cls = (await form.getAttribute('class').catch(() => '')) || '';
    const buttons = await page.locator('.o_form_button_edit').count().catch(() => 0);
    const modals = await page.locator('.modal.show').count().catch(() => 0);
    console.log(`  - edit attempt ${attempt}: class "${cls}", ${buttons} EDIT button(s), ${modals} open modal(s)`);
    if (cls.includes('o_form_editable')) {
      console.log('  - the form is already editable');
      return;
    }
    await invoicePage.clickEdit();
    const editable = await page.locator('.o_form_view.o_form_editable').first()
      .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true).catch(() => false);
    if (editable) {
      console.log(`  - the form became editable on attempt ${attempt}`);
      return;
    }
  }
  const finalClass = (await form.getAttribute('class').catch(() => '')) || '';
  throw new Error(
    `The invoice form never entered edit mode after 3 EDIT clicks - its class is still "${finalClass}". ` +
    'Read the attempt dumps above before treating this as a product finding.',
  );
}

/** Today's date as MM/DD/YYYY, the format the Odoo date input expects. */
function todayMMDDYYYY(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

test.describe(`${TC_ID} - Cancelling a subscription invoice closes that cycle`, () => {

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
    // A subscription that has produced an invoice cannot be cleanly deleted, so it is left behind
    // on purpose; every run creates its own uniquely-named Customer, so re-runs never collide.
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC_ID}: Cancelling a subscription invoice closes that cycle and leaves the next billing date alone`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);

    const customerName = `Cust-Cancel39-${CommonUtils.generateUniqueId()}`;
    let reference = '';
    let subscriptionUrl = '';
    let invoiceUrl = '';
    let countAfterFirstRun = -1;
    let dateAfterFirstRun = '';

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(ADMIN.username, ADMIN.password, CommonUtils.waitTimes.login);
      console.log(`  - logged in as ${ADMIN.username}`);
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clickCreate();
      await subscriptionPage.fillMany2One('partner_id', customerName, true);
      await subscriptionPage.setPricelist(PRICELIST);
      await subscriptionPage.fillMany2One('template_id', TEMPLATE);
      await subscriptionPage.setDateField('date_start', todayMMDDYYYY());
      await subscriptionPage.addSubscriptionLine(PRODUCT_SKU, QUANTITY);
      await subscriptionPage.save();
      await subscriptionPage.waitForLoaded();
      reference = await subscriptionPage.getCode();

      await subscriptionPage.setStage('In Progress');
      await subscriptionPage.clickEdit();
      await subscriptionPage.setDateOfNextInvoice(todayMMDDYYYY());
      await subscriptionPage.save();
      await subscriptionPage.waitForLoaded();
      subscriptionUrl = page.url();
      console.log(`  - subscription ${reference} is In Progress and due today`);
      expect(reference, 'Pre-condition: the saved subscription should have a Reference (SUBxxx)').toMatch(/SUB\d+/i);
      expect(await subscriptionPage.getInvoiceCount(), 'Pre-condition: nothing is billed yet').toBe(0);
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      const billing = await subscriptionPage.clickGenerateInvoice();
      invoiceUrl = billing.invoiceUrl;
      if (billing.dialogText) console.log(`  - dialog raised by the billing: "${billing.dialogText}"`);
      // Every later step opens the invoice through this URL. If the billing did not land on one,
      // that URL is still the subscription, and the steps that follow would quietly read and click
      // the wrong record instead of failing.
      expect(billing.navigatedToInvoice,
        `Pre-condition: "=> Generate Invoice" should land on the new invoice; it landed on ${invoiceUrl}`)
        .toBe(true);
      await subscriptionPage.openByUrl(subscriptionUrl);
      countAfterFirstRun = await subscriptionPage.getInvoiceCount();
      dateAfterFirstRun = await subscriptionPage.getDateOfNextInvoice();
      console.log(`  - invoices = ${countAfterFirstRun}, D2 = "${dateAfterFirstRun}"`);
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      console.log('  DEVIATION: a partner created by this test carries neither "End User" nor');
      console.log('  "Payment Terms", and Odoo refuses the Cancel while they are empty - the');
      console.log('  invoice then stays Draft with only a transient notification to say why.');
      console.log('  A real customer carries both, so filling them restores realistic data.');
      await openInvoiceByUrl(page, invoiceUrl);
      await enterInvoiceEditMode(page, invoicePage);
      // "End User" is taken from whatever the field offers: measured 2026-11-04, every option in
      // that list renders as the literal text "Unnamed", so there is nothing to match the new
      // customer's name against. Which end user it carries does not matter to any verification
      // below - only that the field is no longer empty.
      const endUser = await invoicePage.setMany2OneByName('partner_end_user_id');
      const terms = await invoicePage.setMany2OneByName('payment_term_id', PAYMENT_TERM);
      await invoicePage.clickSaveAndWaitForCompletion().catch(() => 0);
      const refusal = await readOdooNotice(page);
      console.log(`  - End User = "${endUser}", Payment Terms = "${terms}"`);
      if (refusal) console.log(`  - Odoo said, verbatim: "${refusal}"`);
      // The whole point of this pre-condition is that the SAVE goes through. If it did not, the
      // Cancel in Step 2 cannot work either, and the run would report a product finding that is
      // really a test-data problem - so it stops here instead, quoting what Odoo said.
      expect(endUser, 'Pre-condition: "End User" must end up filled').not.toBe('');
      expect(terms, 'Pre-condition: "Payment Terms" must end up filled').not.toBe('');
      expect(refusal, `Pre-condition: Odoo must accept the save. It said: "${refusal}"`).toBe('');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await subscriptionPage.openByUrl(subscriptionUrl);
      const countOk = countAfterFirstRun === 1;
      const dateOk = dateAfterFirstRun !== '';
      const lines = logVerifyBlock(
        [
          {
            what: 'the cycle produced exactly one invoice',
            expected: '"Invoices" smart button = 1',
            actual: `"Invoices" smart button = ${countAfterFirstRun}`,
            pass: countOk,
            difference: `expected 1 invoice, got ${countAfterFirstRun}`,
          },
          {
            what: 'S shows a readable "Date of Next Invoice" (D2)',
            expected: 'a non-blank date',
            actual: `"Date of Next Invoice" = "${dateAfterFirstRun}"`,
            pass: dateOk,
            difference: '"Date of Next Invoice" came back blank',
          },
        ],
        'the cycle billed once and D2 is readable',
      );
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC_ID} - VP1 - one invoice for the billed cycle`,
        passed: countOk && dateOk,
        outlines: [
          { selector: INVOICES_SMART_BUTTON, passed: countOk },
          { selector: NEXT_INVOICE_DATE, passed: dateOk },
        ],
        lines,
      }).catch(() => {});
      expect(countAfterFirstRun, 'VP1: the first billing run should leave exactly one invoice').toBe(1);
      expect(dateAfterFirstRun, 'VP1: "Date of Next Invoice" should be readable after the run').not.toBe('');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await openInvoiceByUrl(page, invoiceUrl);
      await invoicePage.clickCancelInvoice();
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      // Read any refusal BEFORE judging the status - a Cancel that appears to do nothing is
      // normally Odoo refusing it through a notification, not a broken button.
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
        highlight: NEXT_INVOICE_DATE,
        lines,
      }).catch(() => {});
      expect(dateAfterCancel, 'VP3: cancelling an invoice must not move the next billing date (IS-CRM-FUNC-0195)').toBe(dateAfterFirstRun);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      const stillOffered = await subscriptionPage.isGenerateInvoiceVisible();
      console.log(`  - "=> Generate Invoice" still offered: ${stillOffered}`);
      if (stillOffered) {
        const second = await subscriptionPage.clickGenerateInvoice();
        if (second.dialogText) console.log(`  - dialog raised by the second billing: "${second.dialogText}"`);
        await subscriptionPage.openByUrl(subscriptionUrl);
      } else {
        console.log('  - the link is no longer offered, so the cycle cannot even be re-billed by hand');
      }

      const countAfterSecondRun = await subscriptionPage.getInvoiceCount();
      const expectedCount = countAfterFirstRun + 1;
      const ok = countAfterSecondRun === expectedCount;
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
        ],
        'the cancelled invoice is retained and the second billing run is recorded',
      );
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC_ID} - VP4 - invoice count after re-billing`,
        passed: ok,
        highlight: INVOICES_SMART_BUTTON,
        lines,
      }).catch(() => {});
      expect(
        countAfterSecondRun,
        'VP4: the cancelled invoice is kept on record and the second billing run adds one next to it',
      ).toBe(expectedCount);
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      const stage = await subscriptionPage.getState();
      const ok = stage === 'In Progress';
      const lines = logVerifyBlock(
        [
          {
            what: 'cancelling one invoice did not change the subscription stage',
            expected: 'stage = "In Progress"',
            actual: `stage = "${stage}"`,
            pass: ok,
            difference: `stage is "${stage}", not "In Progress"`,
          },
        ],
        `${reference} - the cancel left S running and its cancelled invoice on record`,
      );
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC_ID} - VP5 - subscription status bar`,
        passed: ok,
        highlight: SUBSCRIPTION_STAGE,
        lines,
      }).catch(() => {});
      expect(stage, 'VP5: cancelling one invoice should not change the subscription stage').toBe('In Progress');
    });
  });
});
