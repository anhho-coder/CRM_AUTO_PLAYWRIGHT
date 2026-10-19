import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { OpportunityPage, DealElementPage, QuotationPage } from '@pages';
// Blocker #1 fix: the native sale.subscription screens do not exist on crm-mig - drive the embed.
import { SubscriptionPageEmbed as SubscriptionPage } from '@pages/mig';
import { HomePageMig as HomePage, LoginPageMig as LoginPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';
import { assertOnMigHost } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_1.4 - A reseller deal-registration order creates a subscription that matches
 *                     the confirmed quotation
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.4
 *  Spec ID:         IS-CRM-FUNC-0135 / SC-01
 *                   Spec text  : same requirement as 1.1 - the spec never mentions deal registration; this is one way of raising the quote
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring Billing)" pageId 222538152 v4 (2026-09-07), which SUPERSEDES the FRD.
 *                   Was        : "US3 (Subscription creation)" - an FRD user story, replaced 2026-10-19.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v4, 2026-09-07)
 *                   It SUPERSEDES the FRD (pageId 222528736); do not key assertions to the FRD.
 *  Jira:            CRM-11806 (feature) / CRM-12188 (FRD review)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/1.Subscription-creation-from-the-CRM/tc-subscription-1-4-reseller-deal-registration-creates-a-matching-subscription.spec.ts
 *  Baseline TC ID  : subscription-1.4  (assertions below are the baseline's, copied verbatim)
 *  QA card         : SC-01  - "Subscription Test Cases" (CRM-12140, Nathan)
 *  Runs on         : CRM https://crm-mig.nakivo.site (Odoo 12 CE)
 *                    Subscription service https://subscription-crm-mig.nakivo.site (Odoo 19)
 *                    Customer portal https://subscription-crm-mig.nakivo.site/my
 *  Mechanical deviations from the baseline (and ONLY these):
 *    - baseUrl            -> baseUrl_mig
 *    - users.admin_crm    -> users.admin_crm_mig
 *    - LoginPage/HomePage -> LoginPageMig/HomePageMig (the sidebar theme hides the navbar)
 *    - TC id / file name  -> CRM-11806_x.y.z
 *  No expected value, count or string was changed. Where crm-mig behaves differently the
 *  assertion is meant to go RED - that red is the migration finding.
 * --------------------------------------------------------------------------------------------
 *  BLOCKED on crm-mig - B1 cleared 2026-10-08; B2 still open, so this spec stays skipped:
 *   B1. Rights   : CLEARED 2026-10-08. res.groups 115 "Subscriptions / See Subscriptions" and 116
 *                  "Subscriptions / Manage Subscriptions" now both hold uid 9685
 *                  (anh.ho@nakivo.com), and all ten Subscriptions menus render for it
 *                  (1436 root, 1475/1437/1476/1477, 1478/1479/1480/1481/1482).
 *                  Still denied to that account even so: nakivo.subscription.config (992) and
 *                  nakivo.embed.host (991) - assert through the UI or the Odoo 19 service, never
 *                  on the embed plumbing.
 *   B2. Platform : crm-mig carries NO sale.subscription model (ir.model holds only nakivo.subscription.config and nakivo.subscription.client; sale_subscription is state=uninstallable). The subscription itself lives on the Odoo 19 service subscription-crm-mig.nakivo.site and the CRM renders its screens as an EMBED, so the baseline's "Subscriptions > CREATE a subscription" path does not exist here - on crm-mig a subscription is born only by confirming a quotation that carries a Subscriptionable product.
 *                  -> the creation steps need a SubscriptionPageMig that drives the order path
 *                     on the CRM and reads the Odoo 19 service over its own authenticated
 *                     JSON-RPC (the MigPreSalePage pattern). The Subscriptions screens ARE now
 *                     reachable for that exploration since B1 was cleared.
 * --------------------------------------------------------------------------------------------
 *  Not a duplicate of subscription-1.4. That TC confirms a plain Sales > Quotations order and checks
 *  that exactly one subscription appears. This one takes the RESELLER deal-registration path
 *  (Opportunity -> Deal Element -> New Quotation) and checks what that path carries onto the
 *  subscription: Payer, partner discount %, Unit Price, Sub Total, Recurring Price = quotation
 *  Total, Name "SUBxxx - Payer", Subscription Template, Date of Next Invoice, To Renew,
 *  Subscription Reminder and UoM - none of which any other CRM-11806 spec asserts.
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    As the Salesperson Thomas, create a deal-registration Opportunity (Assigned Partner = Reseller),
 *    build a Deal Element with the subscription SKU "CP-NC-PM-ENP" (Qty 50), create + Confirm the
 *    Quotation, then open the "Subscriptions" smart button and verify the auto-created subscription
 *    (state, name, customer, pricelist, dates, template, salesperson, flags, lines, recurring price)
 *    matches the confirmed quotation.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_1\.4:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-condition #1 - the deal-registration Internal Note #1:
 *    Build Internal Note #1 from the deal-registration template, filling the <...> placeholders with
 *    fresh dynamic values each run (key fields, one per line):
 *      - NAKIVO deal registration*  = <random 4-digit number>
 *      - Name                       = TEST <current date time>
 *      - Email                      = Test@company<compact date time>.com
 *      - Created Date               = <current date time>
 *      - phone                      = <random 9-digit number>
 *      - Company                    = Company Name Lead 1
 *      - IP                         = 128.183.189.157
 *      - Partner Company Name       = TEST-Reseller#Automation-Jun10
 *      - Country                    = United States
 *    (Remaining template lines - Solution used, Edition, License Type, etc. - are static defaults.)
 *
 *  Pre-condition #2 - create the Opp (logged in as the salesperson Thomas):
 *   1-9. Login as Thomas; CRM > view list > CREATE; enter the Opportunity details:
 *          - Opp name                 = TEST CRM-11806_1.4 <current date time>
 *          - Contact name             = Name from Internal Note #1
 *          - CompanyName              = Company Name Lead 1
 *          - Email                    = Email from Internal Note #1
 *          - Country                  = United States
 *          - State                    = Maryland
 *          - IP                       = 128.183.189.157
 *          - Create manually checkbox = FALSE
 *          - Sales Team               = cleared
 *          - Salesperson              = cleared
 *        then CRM Developer Lead form = NAKIVO deal registration*; Assigned Partner = TEST-Reseller#Automation-Jun10;
 *        Internal Notes = Internal Note #1; SAVE; capture Opp URL #1;
 *   9.   Refresh until Company and Contact are populated in Opp #1 (within ~10s).
 *
 *  Steps to reproduce (still logged in as Thomas):
 *   1. Open Opp #1
 *   2. Click "Deal Element" button to create a new deal element
 *   3. Set Pricelist     = Public Pricelist_USD (USD)
 *   4. Set Payment terms = Immediate Payment
 *   5. In Order Lines tab, click "Add a product"; search by SKU "CP-NC-PM-ENP" (Product#1); set Quantity = 50
 *   6. Click "New Quotation" button -> wait until the quotation is created, then note from the quotation:
 *        - QuotationPayer#1  = the quotation Payer (the reseller when a reseller is assigned)
 *        - QuotationTotal#1  = the quotation Total
 *        - PriceList#1       = the quotation Pricelist
 *        - Salesperson#1     = the quotation Salesperson
 *        - LineDiscount#1    = the partner discount % on the quotation line
 *   7. Click "Confirm"
 *   8. On the confirmed quotation screen, click the "Subscriptions" smart button to open the subscription detail
 *
 *  Verification Point (on the subscription detail screen):
 *   1.  State                 = In Progress
 *   2.  Name                  = format "SUBxxx - QuotationPayer#1" (subscription code + payer name)
 *   3.  Customer              = QuotationPayer#1
 *   4.  Pricelist             = PriceList#1
 *   5.  Start Date            = today
 *   6.  Subscription Template = Monthly Subscription
 *   7.  Salesperson           = Salesperson#1
 *   8.  Date of Next Invoice  = this day next month (today + 1 month)
 *   9.  To Renew              = False (by default)
 *   10. Subscription Reminder = False (by default)
 *   11. Subscription Lines:
 *        - Product        = Product#1 (CP-NC-PM-ENP - min 50EntPlus Machines, 1Month Subscription)
 *        - Quantity       = 50
 *        - Unit of Measure = Machine
 *        - Unit Price     = the quotation line Unit Price
 *        - Discount       = LineDiscount#1 (the partner discount % of the quotation)
 *        - Sub Total      = the quotation line Sub Total
 *   12. Recurring Price       = QuotationTotal#1 (the Total of the quotation)
 */

// Cleanup toggle: best-effort delete of the created Opportunity on teardown (true = skip).
// The confirmed Sales Order + auto-created Subscription cannot be cleanly deleted (confirmed records);
// they are left as leftovers - each run creates its own fresh data, so re-runs are unaffected.
/**
 * >>> TEARDOWN OFF - TEMPORARY, at the tester's request 2026-10-16. <<<
 *
 * The tester needs the records this run creates to STAY on crm-mig and on the peer so they can be
 * verified by hand against the PW report. While this flag is true the spec leaves behind everything
 * it made - the Opportunity / Deal Element / Sale Order on crm-mig and the subscription on the peer.
 *
 * Consequences, stated so nobody is surprised:
 *  - the 16:00 leftover-data check WILL report these records; that is expected, not a teardown bug.
 *  - this overrides the crm-mig rule "a spec MUST remove everything it created". It is a deliberate
 *    tester decision for a verification window, not a new default.
 *
 * TURN IT BACK ON with one command from the suite root:
 *   grep -rln "SKIP_CLEANUP\(_OPP\)\? = true" --include='*.spec.ts' .
 * and set each back to false.
 */
const SKIP_CLEANUP_OPP = true;

const TC_ID = 'CRM-11806_1.4';
const PRODUCT_SKU = 'CP-NC-PM-ENP';
const EXPECTED_UOM = 'Machine';
const EXPECTED_TEMPLATE = 'Monthly Subscription';
const EXPECTED_QTY = 50;
const RECURRING_PRICE_TOLERANCE = 0.02; // 1-cent per-line vs per-order rounding difference is acceptable
const START_DATE_TOLERANCE_DAYS = 1;    // pre-prod server timezone can shift the displayed date by a day
const NEXT_INVOICE_TOLERANCE_DAYS = 2;

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

test.describe(`${TC_ID} - A reseller deal-registration order creates a matching subscription`, () => {

  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo, {
      baseUrlOverride: baseUrl,
      adminAccount: users.admin_crm_mig,
    });
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  /**
   * RE-SKIPPED 2026-10-12, and the reason is NOT the mail queue.
   *
   * This spec was un-skipped once to see what it does. It ran against **PRE-PRODUCTION**, not
   * crm-mig, and passed there - creating a real Opportunity (crm.lead 1099978), a Deal Element, a
   * confirmed Sales Order and the subscription **SUB1732** (sale.subscription 1623) on
   * pre-production.nakivo.site. The teardown removed only the Opportunity.
   *
   * The file imports `baseUrl_mig as baseUrl` and the Mig login/home page objects, so it LOOKS
   * like a crm-mig spec - but `createDealRegistrationOpportunityAsThomas()`
   * (helpers/uc-a-2-deal-registration.helper.ts) carries the pre-production baseUrl inside it, the
   * same way `loginAsCrmAdmin()` does. Checking a spec for `loginAsCrmAdmin` is NOT enough; the
   * helpers it calls have to be checked too.
   *
   * Do not un-skip this again until the deal-registration helper is pointed at crm-mig AND a peer
   * teardown is added for the subscription it causes to be created.
   */
  test.skip(`${TC_ID}: A reseller deal-registration order creates a subscription that matches the confirmed quotation @blocked-mail`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const subscriptionPage = new SubscriptionPage(page);

    // Fresh, unique deal-registration data each run (REQUIREMENT #2).
    const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST ${TC_ID} ${compactDateTime}`;

    // Captured-from-the-quotation values (Step 6).
    let quotationPayer = '';
    let quotationTotal = 0;
    let quotationPricelist = '';
    let quotationSalesperson = '';
    let lineDiscount = 0;
    let lineUnitPrice = 0;
    let lineSubTotal = 0;

    // ===================== Pre-condition #1: build Internal Note #1 =====================
    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1 (edit the <...> placeholders)', async () => {
      console.log('Pre-condition #1: Internal Note #1 prepared with fresh dynamic values');
      console.log(`  - Opp name      : ${oppName}`);
      console.log(`  - Name          : ${leadName}`);
      console.log(`  - Email         : ${companyEmail}`);
      console.log(`  - Company       : Company Name Lead 1`);
      console.log(`  - IP            : 128.183.189.157`);
      console.log(`  - Partner       : TEST-Reseller#Automation-Jun10`);
      console.log(`  - Country       : United States`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Internal Note prepared').catch(() => {});
    });

    // ============ Pre-condition #2 - Steps 1-8 (+ capture Opp URL #1): create the Opp as Thomas ============
    // Grouped via the shared helper (the contiguous create block is setup, not what this TC verifies).
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
      stepPrefix: 'Pre-condition #2',
      // The host lives INSIDE the helper and defaults to PRE-PRODUCTION. Without these two the
      // spec runs there, whatever its own imports say - see the note on the test below.
      baseUrlOverride: baseUrl,
      thomasAccount: users.sale_ic_thomas_crm_mig,
    });
    await assertOnMigHost(page);

    // Pre-condition #2 - Step 9: refresh until Company AND Contact populate (async partner creation).
    // MUST happen before opening the Deal Element, otherwise the Deal Element auto-populates an empty
    // End User and the save fails (form stays "New").
    await test.step('Pre-condition #2 - Step 9: Refresh until Company and Contact are populated in Opp #1', async () => {
      console.log('Pre-condition #2 - Step 9: Waiting for the async Company and Contact to populate on Opp #1');
      await opportunityPage.openByUrl(createdOppUrl as string);
      const populated = await opportunityPage.waitForCompanyAndContactPopulated();
      console.log(`  - Company: "${populated.companyValue}" | Contact: "${populated.contactValue}"`);
      let __verifyPassed = false;
      try {
        expect(populated.populated, 'Company and Contact should both be populated on Opp #1 before opening the Deal Element').toBeTruthy();
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Pre-condition II - Opp#1 created (Company + Contact populated)', passed: __verifyPassed }).catch(() => {});
      }
    });

    // ===================== Steps to reproduce =====================
    await test.step('Step 1: Open Opp #1', async () => {
      console.log(`Step 1: Opening Opp #1 = ${createdOppUrl}`);
      await opportunityPage.openByUrl(createdOppUrl as string);
      console.log('✓ Opp #1 opened');
    });

    await test.step('Step 2: Click "Deal Element" button to create a new deal element', async () => {
      console.log('Step 2: Clicking DEAL ELEMENT');
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      await dealElementPage.waitForAutoPopulate();
      console.log('✓ Deal Element form opened');
    });

    await test.step('Step 3: Set Pricelist = Public Pricelist_USD (USD)', async () => {
      console.log('Step 3: Setting Pricelist');
      console.log('  - Pricelist     : Public Pricelist_USD');
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      console.log('✓ Pricelist set');
    });

    await test.step('Step 4: Set Payment terms = Immediate Payment', async () => {
      console.log('Step 4: Setting Payment terms');
      console.log('  - Payment terms : Immediate Payment');
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      console.log('✓ Payment terms set');
    });

    await test.step(`Step 5: In Order Lines, add product by SKU "${PRODUCT_SKU}" (Product#1) and set Quantity = 50`, async () => {
      console.log('Step 5: Adding the subscription product line');
      console.log(`  - Product (SKU) : ${PRODUCT_SKU}`);
      console.log(`  - Quantity      : ${EXPECTED_QTY}`);
      await dealElementPage.addProductLine(PRODUCT_SKU, EXPECTED_QTY);
      // Save the Deal Element (mechanical completion of step 5 - "New Quotation" needs a saved Deal Element).
      await dealElementPage.save(CommonUtils.waitTimes.savingDealElement);
      const added = await dealElementPage.isProductInOrderLines(PRODUCT_SKU);
      expect(added, `The order line for "${PRODUCT_SKU}" (Product#1) should be present`).toBeTruthy();
      console.log('✓ Product#1 added (Qty 50) and Deal Element saved');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Deal Element with subscription product saved').catch(() => {});
    });

    await test.step('Step 6: Click "New Quotation" and note QuotationPayer#1 / Total#1 / PriceList#1 / Salesperson#1 / LineDiscount#1', async () => {
      console.log('Step 6: Creating the Quotation (New Quotation) and reading its values');
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await quotationPage.waitForEditButton(CommonUtils.waitTimes.pageLoad).catch(() => {});
      await quotationPage.dismissErrorDialogWithRetry().catch(() => {});

      quotationPayer = await quotationPage.getPayerName();
      quotationTotal = await quotationPage.getQuotationTotal();
      quotationPricelist = await quotationPage.getPricelistName();
      quotationSalesperson = await quotationPage.getSalespersonName();
      lineDiscount = await quotationPage.getLinePartnerDiscount(PRODUCT_SKU);
      lineUnitPrice = await quotationPage.getLineUnitPrice(PRODUCT_SKU);
      lineSubTotal = await quotationPage.getLineSubtotalAfterAllDiscounts(PRODUCT_SKU);

      console.log('  Captured from the quotation:');
      console.log(`  - QuotationPayer#1  : ${quotationPayer}`);
      console.log(`  - QuotationTotal#1  : ${quotationTotal}`);
      console.log(`  - PriceList#1       : ${quotationPricelist}`);
      console.log(`  - Salesperson#1     : ${quotationSalesperson}`);
      console.log(`  - LineDiscount#1    : ${lineDiscount}`);
      console.log(`  - line Unit Price   : ${lineUnitPrice}`);
      console.log(`  - line Sub Total    : ${lineSubTotal}`);

      let __verifyPassed = false;
      try {
        expect(quotationPayer, 'QuotationPayer#1 should be captured (the Reseller)').toBeTruthy();
        expect(quotationTotal, 'QuotationTotal#1 should be a positive amount').toBeGreaterThan(0);
        expect(quotationPricelist, 'PriceList#1 should be captured').toBeTruthy();
        expect(quotationSalesperson, 'Salesperson#1 should be captured').toBeTruthy();
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Steps to reproduce - Quotation created (values captured)', passed: __verifyPassed }).catch(() => {});
      }
    });

    await test.step('Step 7: Click "Confirm"', async () => {
      console.log('Step 7: Confirming the Quotation to a Sales Order');
      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingPage);
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      await quotationPage.dismissErrorDialogWithRetry().catch(() => {});
      await page.reload({ waitUntil: 'domcontentloaded' });
      await quotationPage.dismissErrorDialogWithRetry().catch(() => {});
      await quotationPage.waitForFormView(CommonUtils.waitTimes.pageLoad);
      console.log('✓ Quotation confirmed');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Quotation confirmed').catch(() => {});
    });

    await test.step('Step 8: Click the "Subscriptions" smart button to open the subscription detail', async () => {
      console.log('Step 8: Opening the Subscriptions smart button');
      let __verifyPassed = false;
      try {
        const hasButton = await quotationPage.hasSubscriptionsSmartButton(CommonUtils.waitTimes.pageLoad);
        expect(hasButton, 'A "Subscriptions" smart button should appear on the confirmed Sales Order').toBeTruthy();
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Verification - Subscriptions smart button exists', passed: __verifyPassed }).catch(() => {});
      }
      await quotationPage.clickSubscriptionsSmartButton(CommonUtils.waitTimes.pageLoad);
      await subscriptionPage.waitForLoaded(CommonUtils.waitTimes.pageLoad);
      console.log('✓ Subscription detail opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Subscription detail opened').catch(() => {});
    });

    // ===================== Verification Point (1-12) =====================
    await test.step('Verification Point: the auto-created subscription matches the confirmed quotation', async () => {
      const state = await subscriptionPage.getState();
      const name = await subscriptionPage.getName();
      const code = await subscriptionPage.getCode();
      const customer = await subscriptionPage.getCustomer();
      const pricelist = await subscriptionPage.getPricelist();
      const startDateRaw = await subscriptionPage.getStartDate();
      const template = await subscriptionPage.getSubscriptionTemplate();
      const salesperson = await subscriptionPage.getSalesperson();
      const nextInvoiceRaw = await subscriptionPage.getDateOfNextInvoice();
      const toRenew = await subscriptionPage.getToRenew();
      const reminder = await subscriptionPage.getSubscriptionReminder();
      const recurringPrice = await subscriptionPage.getRecurringPrice();

      const lineProduct = await subscriptionPage.getLineProduct();
      const lineQty = await subscriptionPage.getLineQuantity();
      const lineUoM = await subscriptionPage.getLineUoM();
      const subLineUnitPrice = await subscriptionPage.getLineUnitPrice();
      const subLineDiscount = await subscriptionPage.getLineDiscount();
      const subLineSubTotal = await subscriptionPage.getLineSubTotal();

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Subscription detail');

      // 1. State = In Progress
      expect(state, 'VP1: subscription State should be "In Progress"').toBe('In Progress');

      // 2. Name = "SUBxxx - QuotationPayer#1"
      expect(name, 'VP2: Name should start with the subscription code "SUBxxx"').toMatch(/^SUB\d+\s*-\s*/i);
      expect(name, `VP2: Name should contain the subscription code "${code}"`).toContain(code);
      expect(name, `VP2: Name should contain QuotationPayer#1 ("${quotationPayer}")`).toContain(quotationPayer);

      // 3. Customer = QuotationPayer#1
      expect(customer, `VP3: Customer should equal QuotationPayer#1 ("${quotationPayer}")`).toBe(quotationPayer);

      // 4. Pricelist = PriceList#1
      expect(pricelist, `VP4: Pricelist should equal PriceList#1 ("${quotationPricelist}")`).toBe(quotationPricelist);

      // 5. Start Date = today (tolerant of pre-prod server timezone shifting the displayed date by a day)
      const today = new Date();
      const startDate = parseMMDDYYYY(startDateRaw);
      expect(startDate, `VP5: Start Date should be parseable (got "${startDateRaw}")`).not.toBeNull();
      const startDiff = startDate ? Math.abs(dayDiff(startDate, today)) : 999;
      console.log(`  VP5: Start Date "${startDateRaw}" vs today "${today.toLocaleDateString('en-US')}" -> diff ${startDiff} day(s)`);
      expect(startDiff, `VP5: Start Date ("${startDateRaw}") should be within ${START_DATE_TOLERANCE_DAYS} day of today`).toBeLessThanOrEqual(START_DATE_TOLERANCE_DAYS);

      // 6. Subscription Template = Monthly Subscription
      expect(template, `VP6: Subscription Template should be "${EXPECTED_TEMPLATE}"`).toBe(EXPECTED_TEMPLATE);

      // 7. Salesperson = Salesperson#1
      expect(salesperson, `VP7: Salesperson should equal Salesperson#1 ("${quotationSalesperson}")`).toBe(quotationSalesperson);

      // 8. Date of Next Invoice = today + 1 month
      const expectedNext = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
      const nextInvoice = parseMMDDYYYY(nextInvoiceRaw);
      expect(nextInvoice, `VP8: Date of Next Invoice should be parseable (got "${nextInvoiceRaw}")`).not.toBeNull();
      const nextDiff = nextInvoice ? Math.abs(dayDiff(nextInvoice, expectedNext)) : 999;
      console.log(`  VP8: Next Invoice "${nextInvoiceRaw}" vs today+1month "${expectedNext.toLocaleDateString('en-US')}" -> diff ${nextDiff} day(s)`);
      expect(nextDiff, `VP8: Date of Next Invoice ("${nextInvoiceRaw}") should be within ${NEXT_INVOICE_TOLERANCE_DAYS} days of today + 1 month`).toBeLessThanOrEqual(NEXT_INVOICE_TOLERANCE_DAYS);

      // 9. To Renew = False
      expect(toRenew, 'VP9: To Renew should be False by default').toBe(false);

      // 10. Subscription Reminder = False
      expect(reminder, 'VP10: Subscription Reminder should be False by default').toBe(false);

      // 11. Subscription Lines
      expect(lineProduct, `VP11: line Product should contain the SKU "${PRODUCT_SKU}"`).toContain(PRODUCT_SKU);
      expect(lineQty, 'VP11: line Quantity should be 50').toBe(EXPECTED_QTY);
      expect(lineUoM, `VP11: line Unit of Measure should be "${EXPECTED_UOM}"`).toBe(EXPECTED_UOM);
      expect(subLineUnitPrice, `VP11: line Unit Price (${subLineUnitPrice}) should equal the quotation line Unit Price (${lineUnitPrice})`).toBeCloseTo(lineUnitPrice, 2);
      expect(subLineDiscount, `VP11: line Discount (${subLineDiscount}) should equal LineDiscount#1 (${lineDiscount})`).toBeCloseTo(lineDiscount, 2);
      expect(subLineSubTotal, `VP11: line Sub Total (${subLineSubTotal}) should equal the quotation line Sub Total (${lineSubTotal})`).toBeCloseTo(lineSubTotal, 2);

      // 12. Recurring Price = QuotationTotal#1 (allow a 1-cent per-line vs per-order rounding difference)
      const priceDiff = Math.abs(recurringPrice - quotationTotal);
      console.log(`  VP12: Recurring Price ${recurringPrice} vs QuotationTotal#1 ${quotationTotal} -> diff ${priceDiff.toFixed(2)}`);
      expect(priceDiff, `VP12: Recurring Price (${recurringPrice}) should equal QuotationTotal#1 (${quotationTotal}) within $${RECURRING_PRICE_TOLERANCE}`).toBeLessThanOrEqual(RECURRING_PRICE_TOLERANCE);

      console.log('✅ Subscription auto-created and verified against the confirmed quotation');
    });
  });
});
