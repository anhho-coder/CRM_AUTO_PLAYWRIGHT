import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage, DealElementPage, QuotationPage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';
import {
  SKU_O365,
  TEMPLATE_MONTHLY_AUTOCHARGE,
  TEMPLATE_QUARTERLY,
  dayDiff,
  parseMMDDYYYY,
  toMMDDYYYY,
  logVerify,
} from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  subscription-blocked-1.1 - First billing date = End Date on the Order Line, else Start Date + 1 interval
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    subscription-blocked-1.1
 *  Spec ID:         SC-03 / FUNC-0003
 *  Automation-Type: refactored
 *  Automation-Date: 2026-10-19
 *  Run as:          Salesperson (Thomas Semerich) for steps 1-4; Administrator (admin_crm) for step 5
 *
 *  Summary:
 *  Builds two deal-registration Opportunities, each with its own Deal Element and one
 *  Subscriptionable order line. The first carries an "End Date" two months out, the second none.
 *  Verifies the first subscription bills on exactly that End Date, the second on Start Date plus
 *  one Monthly interval, and that switching the template to Quarterly recomputes the date to
 *  Start Date plus three months without creating a second subscription.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC ("Test cases - Master file", tab "CRM module", row subscription-blocked-1.1):
 *
 *  Pre-conditions:
 *    Login as a Salesperson with the "See Subscriptions" right (e.g. Anh Ho) on pre-production
 *      (pre-production.nakivo.site)
 *    Create a new Contact in Contacts with:
 *      - Name        = "Cust-FirstBill-<unique>"
 *    Create two new Opportunities in CRM for that contact; on each click "Deal Element" and add
 *      one Order Line with:
 *      - Product     = "[CP-NC-O365] Office 365 for CSP - No Commitment" (flagged Subscriptionable)
 *      - Ordered Qty = 1
 *    NOTE: the default Subscription Template for a new subscription is "Monthly Subscription"
 *      (interval 1 month)
 *
 *  Steps to reproduce:
 *   1. On the first Deal Element, set "End Date" on the Order Line to a date two months from
 *      today, click "SAVE", click "New quotation", then click "Confirm"
 *   2. Click the "Subscription" smart button and read "Date of Next Invoice"
 *   3. On the second Deal Element, leave "End Date" empty, click "SAVE", click "New quotation",
 *      then click "Confirm"
 *   4. Click the "Subscription" smart button and read "Start date", "Subscription Template" and
 *      "Date of Next Invoice"
 *   5. Ask a user with the "Manage Subscriptions" right to click "EDIT", change "Subscription
 *      Template" to "Quarterly Subscription", click "SAVE", then read "Date of Next Invoice" again
 *
 *  Expected Results (verbatim from the master row):
 *   2. "Date of Next Invoice" equals exactly the "End Date" set on the Order Line in step 1
 *   4. "Date of Next Invoice" equals "Start date" plus one interval of "Monthly Subscription" -
 *      that is one month
 *   5. "Date of Next Invoice" recomputes to "Start date" plus three months
 *      - No second subscription is created by the template change
 * --------------------------------------------------------------------------------------------
 *  HOW THE PRE-CONDITIONS ARE BUILT, AND WHY NOT LITERALLY
 *
 *  The master row says "create a Contact, then two Opportunities". On pre-production a Deal
 *  Element created from a hand-made Opportunity cannot be saved, so every working spec in this
 *  suite (1.1, 1.2, 1.3, 1.4, 10.1) builds its Opportunity through the deal-registration flow
 *  instead - `createDealRegistrationOpportunityAsThomas`, which creates the lead/company contact
 *  as part of that flow. This spec does the same. The verified behaviour is unchanged; only the
 *  way the fixture is produced differs, and it is the only way that produces a saveable record.
 *
 *  Three fields are REQUIRED on the Deal Element and none of them auto-fills:
 *    - Pricelist      - set to "Public Pricelist_USD"
 *    - Payment Terms  - set to "Immediate Payment". Measured 2026-10-16: with this field empty
 *                       SAVE is refused silently - the form stays on "New" with only a red label,
 *                       no dialog and nothing in the log.
 *    - End User       - set to "Company Name Lead 1" (CRM-4383 gotcha).
 *
 *  Step 5 runs as `admin_crm`: the account the first four steps use holds "See Subscriptions"
 *  only, and the template change needs "Manage Subscriptions". The spec re-logs-in inside the
 *  SAME browser context, so the video splits into one file per session (expected).
 *
 *  MEASURED ON PRE-PRODUCTION 2026-10-16 (run 15:33-15:42, subscriptions SUB1759 / SUB1761):
 *    Verify #1 (step 2) FAIL - Order Line End Date 12/16/2026, "Date of Next Invoice" read
 *                              11/16/2026. The subscription billed Start date + one template
 *                              interval and ignored the Order Line End Date.
 *    Verify #2 (step 4) PASS - Start date 10/16/2026, template "Monthly Subscription",
 *                              "Date of Next Invoice" 11/16/2026 - 0 days off Start + 1 month.
 *    Verify #3 (step 5) FAIL - the template change DID apply and persist (read back as
 *                              "Quarterly Subscription"), but "Date of Next Invoice" stayed
 *                              11/16/2026 where Start + 3 months is 01/16/2027 - 61 days off.
 *    Verify #4 (step 5) PASS - same record throughout, Reference SUB1761 before and after.
 *  Verify #2 and #4 prove the spec reads and computes dates correctly, so #1 and #3 are
 *  observations about the product, not about the automation. Neither is a confirmed defect yet.
 *
 *
 *  SKIPPED - the two expected results it verifies are not what the product does.
 *
 *  MOVED to the blocked tree on 2026-10-19 by the tester's decision. Measured on pre-production
 *  2026-10-16 (subscriptions SUB1759 / SUB1761), and both numbers are reproducible:
 *    - the Order Line "End Date" does NOT become the first billing date. 12/16/2026 was set on the
 *      line; "Date of Next Invoice" read 11/16/2026, i.e. Start date plus one template interval.
 *    - changing the template from "Monthly Subscription" to "Quarterly Subscription" does NOT
 *      recompute "Date of Next Invoice". The change applied and persisted (read back as
 *      "Quarterly Subscription") but the date stayed 11/16/2026 where Start + 3 months is
 *      01/16/2027 - 61 days out.
 *  The other two verification points PASS (Start date + 1 month, and no second subscription is
 *  created), which is what shows the spec reads and computes dates correctly - so these two are
 *  observations about the product, not automation errors.
 *
 *  TO UNBLOCK: the spec owner decides which side is wrong - the product, or expected results 2
 *  and 5 of the master row. Softening the assertions would hide exactly what this case exists to
 *  catch, so the case waits for that decision instead.
 *
 *  Command to run:
 *    npx playwright test --project=CRM_Module tests/1.Project_CRM/Blocked-test-cases/Pre-production/Subscriptions/1.Subscription-creation-from-the-CRM/tc-subscription-blocked-1-1-first-billing-date-end-date-else-one-interval.spec.ts --workers=1
 * ============================================================================================
 */

const TC_ID = 'subscription-blocked-1.1';
const PRICELIST = 'Public Pricelist_USD';
const PAYMENT_TERM = 'Immediate Payment';
/** The deal-registration lead's company - the end customer behind the reseller's registration. */
const END_USER = 'Company Name Lead 1';
const ADMIN = users.admin_crm;
const QUANTITY = 1;
/** Date reads are compared exactly; the tolerance only absorbs a month-end clamp (e.g. 31 -> 30). */
const DATE_TOLERANCE_DAYS = 2;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login as a Salesperson with the "See Subscriptions" right (e.g. Anh Ho) on pre-production (pre-production.nakivo.site)',
  pre2: 'Pre-condition 2: Create a new Contact in Contacts with: Name = "Cust-FirstBill-<unique>"',
  pre3: 'Pre-condition 3: Create two new Opportunities in CRM for that contact; on each click "Deal Element" and add one Order Line with: Product = "[CP-NC-O365] Office 365 for CSP - No Commitment" (flagged Subscriptionable), Ordered Qty = 1',
  s1: 'Step 1: On the first Deal Element, set "End Date" on the Order Line to a date two months from today, click "SAVE", click "New quotation", then click "Confirm"',
  s2: 'Step 2: Click the "Subscription" smart button and read "Date of Next Invoice"',
  s3: 'Step 3: On the second Deal Element, leave "End Date" empty, click "SAVE", click "New quotation", then click "Confirm"',
  s4: 'Step 4: Click the "Subscription" smart button and read "Start date", "Subscription Template" and "Date of Next Invoice"',
  s5: 'Step 5: Ask a user with the "Manage Subscriptions" right to click "EDIT", change "Subscription Template" to "Quarterly Subscription", click "SAVE", then read "Date of Next Invoice" again',
  verify: 'Verification',
} as const;

/** Set to true only to keep the created Opportunities on pre-production for a bug report. */
const SKIP_CLEANUP_OPP = false;

test.describe(`${TC_ID} - First billing date = End Date, else +1 interval`, () => {
  let oppUrlA: string | null = null;
  let oppUrlB: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`❌ TEST FAILED - reason: ${testInfo.error?.message ?? 'unknown'}`);
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    // Teardown removes only the Opportunities this run created. The Sale Orders and the
    // subscriptions behind them are left in place, as in every deal-registration spec here.
    await deleteCreatedOpportunityAsAdmin(page, oppUrlA, SKIP_CLEANUP_OPP, testInfo).catch(() => {});
    await deleteCreatedOpportunityAsAdmin(page, oppUrlB, SKIP_CLEANUP_OPP, testInfo).catch(() => {});
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.skip(`${TC_ID}: First billing date equals End Date on Order Line, or Start Date plus one interval`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const subscriptionPage = new SubscriptionPage(page);

    // "two months from today", computed at run time - never a hard-coded date.
    const endDateTarget = new Date();
    endDateTarget.setMonth(endDateTarget.getMonth() + 2);
    const END_DATE = toMMDDYYYY(endDateTarget);

    let subUrlA = '';
    let subUrlB = '';
    let nextInvoiceA = '';
    let startDateB = '';
    let templateB = '';
    let nextInvoiceB = '';
    let nextInvoiceAfterQuarterly = '';
    let referenceBefore = '';
    let referenceAfter = '';

    /** Build one deal-registration Opportunity + its Deal Element, optionally with an End Date. */
    const buildDealElement = async (label: string): Promise<string> => {
      const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
      const oppName = `TEST ${TC_ID} ${label} ${compactDateTime}`;
      console.log(`  - Opportunity name : ${oppName}`);
      console.log(`  - Contact name     : ${leadName}`);
      console.log(`  - Company email    : ${companyEmail}`);
      const oppUrl = await createDealRegistrationOpportunityAsThomas(page, {
        oppName,
        contactName: leadName,
        companyEmail,
        internalNote,
        stepPrefix: `Pre-condition 3 (${label})`,
      });

      await opportunityPage.openByUrl(oppUrl);
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      await dealElementPage.waitForAutoPopulate();

      await dealElementPage.selectPricelist(PRICELIST);
      await dealElementPage.selectPaymentTerm(PAYMENT_TERM);
      const endUser = await dealElementPage.setEndUser(END_USER);
      await dealElementPage.addProductLine(SKU_O365, QUANTITY);
      console.log(`  - Pricelist        : ${PRICELIST}`);
      console.log(`  - Payment Terms    : ${PAYMENT_TERM}`);
      console.log(`  - End User         : ${endUser}`);
      console.log(`  - Product          : ${SKU_O365}`);
      console.log(`  - Ordered Qty      : ${QUANTITY}`);

      // SAVE here so the Deal Element survives the re-login between A and B. The End Date is set
      // later, in Step 1, because that is where the manual TC puts it.
      await dealElementPage.save();
      console.log(`  - Deal Element     : saved`);
      return oppUrl;
    };

    /** From a saved Deal Element: SAVE -> New quotation -> Confirm -> open the subscription. */
    const confirmAndOpenSubscription = async (label: string): Promise<string> => {
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await quotationPage.waitForEditButton(CommonUtils.waitTimes.pageLoad).catch(() => {});
      await quotationPage.dismissErrorDialogWithRetry().catch(() => {});

      const orderNumber = await quotationPage.getSalesOrderNumber();
      console.log(`  - Quotation number : ${orderNumber}`);
      expect(
        orderNumber,
        `${label}: the quotation must be SAVED before CONFIRM - a record still reading "New" was never written to the server`
      ).toMatch(/\w/);

      // NOTE: use clickConfirm(), NOT saveQuotation() (which was called confirmQuotation until
      // 2026-10-16). saveQuotation only does Edit -> Save, so the order stays a Quotation and the
      // failure surfaces 240s later on the hidden "Subscriptions" smart button - measured on
      // SO221484. The status and smart-button assertions below make that fail immediately instead.
      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingPage);
      await quotationPage.dismissErrorDialogWithRetry().catch(() => {});
      await quotationPage.dismissErrorDialogWithRetry().catch(() => {});
      await quotationPage.waitForFormView(CommonUtils.waitTimes.pageLoad);

      const status = await quotationPage.getQuotationStatus();
      console.log(`  - Status after CONFIRM : ${status}`);
      expect(
        status,
        `${label}: the order must leave the "Quotation" state after CONFIRM - it still reads "${status}"`
      ).not.toMatch(/^\s*quotation\s*$/i);

      const hasButton = await quotationPage.hasSubscriptionsSmartButton();
      console.log(`  - "Subscriptions" smart button present : ${hasButton}`);
      expect(
        hasButton,
        `${label}: the confirmed order should offer a "Subscriptions" smart button - a hidden button means no subscription was created`
      ).toBeTruthy();

      await quotationPage.clickSubscriptionsSmartButton(CommonUtils.waitTimes.pageLoad);
      await subscriptionPage.waitForLoaded(CommonUtils.waitTimes.pageLoad);
      const url = page.url();
      console.log(`  - Subscription URL : ${url}`);
      return url;
    };

    // ===================== Pre-conditions =====================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      // createDealRegistrationOpportunityAsThomas performs its OWN login as the Salesperson -
      // signing in here first leaves the session authenticated and its waitForURL('**web/login*')
      // then hangs the whole timeout.
      console.log('  - the deal-registration helper signs in as the Salesperson itself');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log('  - the contact is created by the deal-registration flow (see the header note)');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      console.log('Opportunity A - the one that will carry an End Date:');
      oppUrlA = await buildDealElement('A');
      // createDealRegistrationOpportunityAsThomas signs in ITSELF and waits for the login page.
      // Called a second time on a still-authenticated session it waits 240s for a login screen
      // that never comes - measured 2026-10-16. Sign out first so its own login can run.
      console.log('  - signing out so the helper can sign in again for Opportunity B');
      await loginPage.logout(baseUrl);
      console.log('Opportunity B - the one that will NOT carry an End Date:');
      oppUrlB = await buildDealElement('B');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - both Deal Elements built').catch(() => {});
    });

    // ===================== Steps to reproduce =====================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      // Opportunity B's Deal Element is the one on screen after pre-condition 3, so re-open A.
      await opportunityPage.openByUrl(oppUrlA as string);
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      await dealElementPage.clickEdit();
      const written = await dealElementPage.setLastRowEndDate(END_DATE);
      expect(written, `Step 1: the Order Line "End Date" should hold ${END_DATE} before SAVE`).toBe(END_DATE);
      await dealElementPage.save();
      const endDateOnRow = await dealElementPage.getLastRowEndDate();
      console.log(`  - End Date on the Order Line after SAVE: ${endDateOnRow}`);
      expect(endDateOnRow, `Step 1: the saved Order Line should still read End Date = ${END_DATE}`).toBe(END_DATE);
      subUrlA = await confirmAndOpenSubscription('Opportunity A');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 1 - order A confirmed').catch(() => {});
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await subscriptionPage.openByUrl(subUrlA);
      nextInvoiceA = await subscriptionPage.getDateOfNextInvoice();
      console.log(`  - End Date set in Step 1   : ${END_DATE}`);
      console.log(`  - Date of Next Invoice     : ${nextInvoiceA}`);

      let __verifyPassed = false;
      try {
        logVerify(
          'VP2',
          '"Date of Next Invoice" equals exactly the "End Date" set on the Order Line in step 1',
          `End Date = ${END_DATE}, Date of Next Invoice = ${nextInvoiceA}`,
          nextInvoiceA === END_DATE
        );
        // expect.soft BY DECISION (tester, 2026-10-16): a soft assertion still FAILS the test but
        // does not abort it, so every run keeps measuring VP4 and Verify #3 / #4 instead of
        // stopping here. Do NOT "fix" this to a hard expect - the red is intentional and the
        // remaining verification points are the reason it is soft.
        expect.soft(
          nextInvoiceA,
          `VP2: the first billing date should be exactly the Order Line End Date ${END_DATE}`
        ).toBe(END_DATE);
        __verifyPassed = nextInvoiceA === END_DATE;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC_ID} - Step 2 first subscription billing date`,
          passed: __verifyPassed,
        }).catch(() => {});
      }
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await opportunityPage.openByUrl(oppUrlB as string);
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      const endDateOnRow = await dealElementPage.getLastRowEndDate();
      console.log(`  - End Date on the Order Line: "${endDateOnRow}" (must be empty)`);
      expect(endDateOnRow, 'Step 3: Opportunity B\'s Order Line must carry no End Date').toBe('');
      subUrlB = await confirmAndOpenSubscription('Opportunity B');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 3 - order B confirmed').catch(() => {});
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await subscriptionPage.openByUrl(subUrlB);
      startDateB = await subscriptionPage.getStartDate();
      templateB = await subscriptionPage.getSubscriptionTemplate();
      nextInvoiceB = await subscriptionPage.getDateOfNextInvoice();
      referenceBefore = await subscriptionPage.getCode();

      const startParsed = parseMMDDYYYY(startDateB);
      const expectedNext = startParsed
        ? new Date(startParsed.getFullYear(), startParsed.getMonth() + 1, startParsed.getDate())
        : null;
      const expectedNextStr = expectedNext ? toMMDDYYYY(expectedNext) : '';
      const actualParsed = parseMMDDYYYY(nextInvoiceB);
      const diffDays = actualParsed && expectedNext ? Math.abs(dayDiff(actualParsed, expectedNext)) : 999;

      console.log(`  - Reference            : ${referenceBefore}`);
      console.log(`  - Start date           : ${startDateB}`);
      console.log(`  - Subscription Template: ${templateB}`);
      console.log(`  - Date of Next Invoice : ${nextInvoiceB}`);
      console.log(`  - Start date + 1 month : ${expectedNextStr} (difference ${diffDays} day(s))`);

      let __verifyPassed = false;
      try {
        logVerify(
          'VP4',
          '"Date of Next Invoice" equals "Start date" plus one interval of "Monthly Subscription" - that is one month',
          `Template = ${templateB}, Start date = ${startDateB}, expected ${expectedNextStr}, read ${nextInvoiceB}`,
          diffDays <= DATE_TOLERANCE_DAYS && templateB === TEMPLATE_MONTHLY_AUTOCHARGE
        );
        expect(templateB, `VP4: the default template should be "${TEMPLATE_MONTHLY_AUTOCHARGE}"`).toBe(TEMPLATE_MONTHLY_AUTOCHARGE);
        expect(actualParsed, `VP4: "Date of Next Invoice" should be parseable (got "${nextInvoiceB}")`).not.toBeNull();
        expect(diffDays, `VP4: "Date of Next Invoice" should be Start Date plus one month (${expectedNextStr})`).toBeLessThanOrEqual(DATE_TOLERANCE_DAYS);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC_ID} - Step 4 second subscription billing date`,
          passed: __verifyPassed,
        }).catch(() => {});
      }
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      // "See Subscriptions" cannot change a template - re-login as the Administrator in the SAME
      // context. Chromium starts a new video file at the logout/login boundary; that is expected.
      console.log(`  - re-signing in as ${ADMIN.username} ("Manage Subscriptions")`);
      // ALWAYS log out before logging in: LoginPage.login() waits for "**web/login*", and on a
      // still-authenticated session that URL never comes - it burns the full 240s instead. Same
      // trap as the one between Opportunity A and B in Pre-condition 3 (measured 2026-10-16).
      await loginPage.logout(baseUrl);
      await loginPage.login(ADMIN.username, ADMIN.password, CommonUtils.waitTimes.login);
      await subscriptionPage.openByUrl(subUrlB);

      await subscriptionPage.clickEdit();
      await subscriptionPage.fillMany2One('template_id', TEMPLATE_QUARTERLY);
      await subscriptionPage.save();
      await subscriptionPage.waitForLoaded(CommonUtils.waitTimes.pageLoad);

      nextInvoiceAfterQuarterly = await subscriptionPage.getDateOfNextInvoice();
      referenceAfter = await subscriptionPage.getCode();
      console.log(`  - Subscription Template: ${await subscriptionPage.getSubscriptionTemplate()}`);
      console.log(`  - Reference            : ${referenceAfter}`);
      console.log(`  - Date of Next Invoice : ${nextInvoiceAfterQuarterly}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 5 - template changed to Quarterly').catch(() => {});
    });

    // ===================== Verification =====================
    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);

      const startParsed = parseMMDDYYYY(startDateB);
      const expectedQuarterly = startParsed
        ? new Date(startParsed.getFullYear(), startParsed.getMonth() + 3, startParsed.getDate())
        : null;
      const expectedQuarterlyStr = expectedQuarterly ? toMMDDYYYY(expectedQuarterly) : '';
      const actualQuarterly = parseMMDDYYYY(nextInvoiceAfterQuarterly);
      const diffQuarterly = actualQuarterly && expectedQuarterly ? Math.abs(dayDiff(actualQuarterly, expectedQuarterly)) : 999;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - "Date of Next Invoice" equals exactly the "End Date" set on the Order Line in step 1:');
      console.log(`     Expected : ${END_DATE}`);
      console.log(`     Actual   : ${nextInvoiceA}`);
      console.log(`     Result   : ${nextInvoiceA === END_DATE ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - "Date of Next Invoice" equals "Start date" plus one month of "Monthly Subscription":');
      console.log(`     Expected : Start date ${startDateB} + 1 month, template "${TEMPLATE_MONTHLY_AUTOCHARGE}"`);
      console.log(`     Actual   : ${nextInvoiceB}, template "${templateB}"`);
      console.log(`     Result   : ${templateB === TEMPLATE_MONTHLY_AUTOCHARGE ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - "Date of Next Invoice" recomputes to "Start date" plus three months:');
      console.log(`     Expected : ${expectedQuarterlyStr} (a value still reading ${nextInvoiceB} is a FAIL - the`);
      console.log('                template change would not have recomputed the cycle at all)');
      console.log(`     Actual   : ${nextInvoiceAfterQuarterly} (difference ${diffQuarterly} day(s))`);
      console.log(`     Result   : ${diffQuarterly <= DATE_TOLERANCE_DAYS ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - No second subscription is created by the template change:');
      console.log(`     Expected : the SAME subscription record - Reference still ${referenceBefore} (a different or`);
      console.log('                empty Reference means the template change spawned another subscription)');
      console.log(`     Actual   : Reference ${referenceAfter} on ${subUrlB}`);
      console.log(`     Result   : ${referenceAfter === referenceBefore && referenceAfter !== '' ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');

      let __verifyPassed = false;
      try {
        expect(
          actualQuarterly,
          `Verify #3: "Date of Next Invoice" should be parseable (got "${nextInvoiceAfterQuarterly}")`
        ).not.toBeNull();
        expect(
          diffQuarterly,
          `Verify #3: changing the template to "${TEMPLATE_QUARTERLY}" should recompute "Date of Next Invoice" to Start date plus three months (${expectedQuarterlyStr})`
        ).toBeLessThanOrEqual(DATE_TOLERANCE_DAYS);
        expect(
          referenceAfter,
          `Verify #4: the template change must not create a second subscription - the record must still be ${referenceBefore}`
        ).toBe(referenceBefore);
        expect(referenceAfter, 'Verify #4: the subscription Reference must be readable, not empty').not.toBe('');
        __verifyPassed = true;
        console.log(`OVERALL: PASS - ${TC_ID}: the first billing date follows the Order Line End Date, falls back to one Monthly interval, and recomputes to three months on a Quarterly template`);
      } finally {
        if (!__verifyPassed) {
          console.log(`OVERALL: FAIL - ${TC_ID}: see the failing Verify entry above`);
        }
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC_ID} - Verification quarterly recompute`,
          passed: __verifyPassed,
        }).catch(() => {});
      }
    });
  });
});
