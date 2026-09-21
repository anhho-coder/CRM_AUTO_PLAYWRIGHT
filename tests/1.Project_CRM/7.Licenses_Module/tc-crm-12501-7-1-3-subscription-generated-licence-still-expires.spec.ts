import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { LoginPage, HomePage, OpportunityPage, DealElementPage, QuotationPage, InvoicePage, LicensePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =================================================================================================
 *  CRM-12501 - Perpetual licences stamped with a 365-day expiry
 *  TC 7.1.3 - MANUAL License Manager path: subscription licences still expire (regression check)
 * =================================================================================================
 *  Test Case ID    : CRM-12501_7.1.3
 *  Jira            : CRM-12501
 *  Automation-Type : new
 *  Automation-Date : 2026-09-10
 *
 *  SCOPE - the mirror of TC 7.1.2, on the same MANUAL License Manager button path. The ticket's own
 *  regression case moved to Test case 6 (the WebShop path, dev comment of 2026-09-07 17:56, licence
 *  #149606), which cannot be automated black-box on pre-production - see the note in the 7.1.2
 *  header. This spec guards the manual path.
 *
 *  Summary:
 *    The mirror of TC 7.1.2. Builds its own validated invoice for the subscription SKU
 *    [PM-ENT-SUB-2Y], presses CREATE LICENSE as a License Manager, and asserts the branch-on-
 *    billing-type fix did not break the other side: the generated licence still expires -
 *    Subscription, Expires = in, Expiration Days greater than 0, expiry dates filled.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12501_7\.1\.3:" --project=chromium
 *
 * -------------------------------------------------------------------------------------------------
 *  Source manual TC - CRM-12501, comment "Executed test cases (run on Preproduction, 2026-09-07)",
 *                     Test case 3 "subscription licences still expire (regression check)"
 * -------------------------------------------------------------------------------------------------
 *  Pre-condition(s)
 *    1. Login to Pre-production as admin CRM (a License Manager account - the CREATE LICENSE button
 *       is restricted to group license_management.group_license_manager).
 *    2-15. Build a validated invoice for a SUBSCRIPTION product:
 *       CRM > view list > CREATE;
 *       enter Opportunity details;
 *       SAVE; wait for the async Contact/Company;
 *       DEAL ELEMENT > Pricelist + Payment Term > add the subscription product > SAVE;
 *       NEW QUOTATION; CONFIRM (Sales Order); CREATE INVOICE; CREATE AND VIEW INVOICES; VALIDATE.
 *
 *       Opportunity fields entered:
 *         - Opp name      = TEST CRM-12501_7.1.3 <timestamp>
 *         - Email         = Test@company<timestamp>.com
 *         - Country       = United States
 *         - State         = Connecticut
 *         - Sales Team    = (cleared)
 *         - Salesperson   = (cleared)
 *         - Lead form     = License          (CRM Developer tab)
 *       Deal Element fields entered:
 *         - Pricelist     = Public Pricelist_USD
 *         - Payment Term  = Immediate Payment
 *         - Product       = [PM-ENT-SUB-2Y]  (licensing = subscription, template 8303)
 *
 *  Steps to reproduce #1
 *    1. From a subscription-product invoice, generate a licence the same way.
 *
 *  Verification
 *    - The generated licence still has Expires = in with expiration days greater than 0.
 *
 * -------------------------------------------------------------------------------------------------
 *  UI / data grounding (pre-prod, form view 2441 + live subscription licences, read 2026-09-07)
 * -------------------------------------------------------------------------------------------------
 *  A correctly generated subscription licence on pre-prod (e.g. #149436, #149433) carries:
 *    expires = in | expire_mode = PER_LICENSE ("available") | expiration_days > 0 |
 *    expire_start_date filled | expiration_end_date filled | maintenance_days > 0
 *  Form view 2441 shows `expiration_days` only when expires = 'in', and `expire_start_date` /
 *  `expiration_end_date` only when expire_mode = 'PER_LICENSE' (where the end date is REQUIRED).
 *  So on this side of the branch all three expiry fields MUST be on screen and filled - the exact
 *  opposite of TC 7.1.2. Expiration Days is asserted as "greater than 0" (the manual TC's bar), not
 *  as a fixed 730: the value is computed from the order dates, so it moves with the run date.
 *  TIMING (the trap this spec was rewritten for on 2026-09-10): none of those expiry values exist on
 *  the pre-save form - they are written when the record is created. The assertions therefore run
 *  AFTER SAVE. Reading the pre-save form is what made the 2026-09-07 run report a false defect.
 *
 *  This TC is also the guard for the ticket's second, mirror defect - "96 live subscription licences
 *  that never expire" (Suggested order of work #2, inverse guard).
 *
 * -------------------------------------------------------------------------------------------------
 *  Data & cleanup
 * -------------------------------------------------------------------------------------------------
 *  Fresh, uniquely timestamped Opportunity + Contact/Company every run (REQUIREMENT #2), so two
 *  back-to-back runs both pass with no manual setup.
 *
 *  This TC DOES create one licence record. CREATE LICENSE only opens an unsaved, pre-filled form,
 *  and on the subscription branch the expiry values are computed at create time - so the TC sets
 *  "for monitoring", presses SAVE, and asserts the STORED record. That licence is deleted in
 *  afterEach (it stays in Draft, so it deletes cleanly); if the delete fails, its id is printed.
 *
 *  The chain the TC does create (Opportunity, Deal Element, Quotation, Sales Order and the POSTED
 *  invoice) is left in place on purpose: a validated invoice cannot be removed without a CANCEL +
 *  SET TO DRAFT pass that would distort accounting data on the shared pre-prod. Their ids are
 *  printed at the end of the run so they can be removed on request.
 */

// --- Test data ------------------------------------------------------------------------------------
const TC_ID = 'CRM-12501_7.1.3';
const SUBSCRIPTION_SKU = '[PM-ENT-SUB-2Y]'; // product 459, licensing = subscription, template 8303
const PRICELIST = 'Public Pricelist_USD';
const PAYMENT_TERM = 'Immediate Payment';
const COUNTRY = 'United States';
const STATE = 'Connecticut';
const LEAD_FORM = 'License';
const LICENSE_MODEL = 'license_management.license';
// The generated licence form needs "for monitoring" before it will save (same value the
// TC.Performance.1.1.7.1 chain uses).
const FOR_MONITORING = 'sockets';

// --- Expected generated state (subscription => it must expire) ------------------------------------
const EXPECTED_LICENSING = 'Subscription';
const EXPECTED_EXPIRES = 'in';
const EXPECTED_EXPIRE_MODE = 'available';

// --- Cleanup toggles (true = skip, false = run) ---------------------------------------------------
const SKIP_CLEANUP_LICENSE = false; // delete the licence this TC generated
const SKIP_CLEANUP_CHAIN = true;    // Opp / Deal Element / Quotation / SO / posted invoice: see header

test.describe('CRM-12501_7.1 - Subscription licence must still expire', () => {
  let licenseUrl = '';
  let licenseId = '';
  let opportunityUrl = '';
  let invoiceNumber = '';

  test.beforeEach(async ({ context }) => {
    // Clear cookies to ensure a fresh session. No screenshot here: the page is still about:blank.
    await context.clearCookies();
    await CommonUtils.wait(CommonUtils.waitTimes.medium);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});

    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
      await CommonUtils.waitForSpinnersToHide(
        page,
        CommonUtils.waitTimes.extraLong,
        CommonUtils.waitTimes.abnormalWait
      ).catch(() => {});
    }

    console.log('--- Records created by this run ---');
    console.log(`  - Licence      : ${licenseId ? `#${licenseId} - ${licenseUrl}` : '(not created)'}`);
    console.log(`  - Opportunity  : ${opportunityUrl || '(not created)'}`);
    console.log(`  - Invoice      : ${invoiceNumber || '(not created)'}`);

    if (!SKIP_CLEANUP_LICENSE && licenseUrl) {
      try {
        await CommonUtils.deleteRecordByUrl(page, licenseUrl, testInfo);
      } catch (error) {
        // Never fail a green test in teardown - report the leftover id instead (shared pre-prod).
        console.log(`  - Could not delete licence #${licenseId}: ${error instanceof Error ? error.message : String(error)}`);
        console.log(`  - LEFTOVER licence to remove manually: #${licenseId} - ${licenseUrl}`);
      }
    } else if (SKIP_CLEANUP_LICENSE) {
      console.log('  - Licence cleanup SKIPPED (SKIP_CLEANUP_LICENSE = true)');
    }

    if (SKIP_CLEANUP_CHAIN) {
      console.log('  - Chain cleanup SKIPPED (SKIP_CLEANUP_CHAIN = true) - posted invoice cannot be deleted cleanly');
    }

    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-12501_7.1.3: Verify a licence generated from a subscription order still expires', async ({ page }, testInfo) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const invoicePage = new InvoicePage(page);
    const licensePage = new LicensePage(page);

    let licenseName = '';
    let licensing = '';
    let expires = '';
    let expireMode = '';
    let expirationDaysShown = false;
    let expirationDays = '';
    let expireStartDateShown = false;
    let expireStartDate = '';
    let expirationEndDateShown = false;
    let expirationEndDate = '';
    let maintenanceDays = '';

    // -------------------------------------------------------------------------------------------
    // Pre-condition #1 - login as a License Manager
    // -------------------------------------------------------------------------------------------
    await test.step('Pre-condition 1: Login to Pre-production as admin CRM (a License Manager account)', async () => {
      console.log(`Pre-condition 1: Logging in as ${users.admin_crm.username}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log('  - Login successful');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - logged in as admin CRM');
    });

    // -------------------------------------------------------------------------------------------
    // Pre-condition #2 - grouped setup: build a validated invoice for the subscription SKU
    // -------------------------------------------------------------------------------------------
    await test.step(`Pre-condition 2-15: Build a validated invoice for the subscription product ${SUBSCRIPTION_SKU}`, async () => {
      const oppName = opportunityPage.generateOpportunityName(`TEST ${TC_ID}`);
      const emailAddress = opportunityPage.generateEmail('Test@company');

      console.log('Pre-condition 2-15: Building the subscription order chain');

      // CRM > Opportunities list > CREATE
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      await opportunityPage.switchToListView();
      await opportunityPage.clickCreate();
      console.log('  - Opportunity create form opened');

      // Opportunity details - one field per line
      await opportunityPage.fillOpportunityName(oppName);
      console.log(`  - Opp name      : ${oppName}`);
      await opportunityPage.fillEmail(emailAddress);
      console.log(`  - Email         : ${emailAddress}`);
      await opportunityPage.selectCountry(COUNTRY);
      console.log(`  - Country       : ${COUNTRY}`);
      await opportunityPage.selectState(STATE);
      console.log(`  - State         : ${STATE}`);
      await opportunityPage.clearSalesTeam();
      console.log('  - Sales Team    : (cleared)');
      await opportunityPage.clearSalesperson();
      console.log('  - Salesperson   : (cleared)');

      // CRM Developer tab > Lead form
      await opportunityPage.clickCRMDeveloperTab();
      const leadFormFilled = await opportunityPage.fillLeadForm(LEAD_FORM);
      console.log(`  - Lead form     : ${LEAD_FORM}${leadFormFilled ? '' : ' (field not present)'}`);

      // SAVE + wait for the async Contact/Company creation
      await opportunityPage.saveAndWaitForCompletion();
      const oppId = opportunityPage.getRecordIdFromUrl();
      expect(oppId, 'The Opportunity must be saved (a record id must appear in the form URL)').not.toBe('');
      opportunityUrl = `${baseUrl.replace(/\/$/, '')}/web#id=${oppId}&model=crm.lead&view_type=form`;
      console.log(`  - Opportunity saved: ${opportunityUrl}`);
      // Wait on the email DOMAIN, not "test": Odoo fills Company from the domain part
      // (Test@company<ts>.com -> company<ts>.com), so waiting for "test" never matches and burns
      // the helper's whole 5-minute budget (measured on the 2026-09-07 run).
      const companyDomain = emailAddress.split('@')[1];
      await opportunityPage.waitForContactFieldPopulated(companyDomain);

      // DEAL ELEMENT
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      await dealElementPage.waitForAutoPopulate();
      await dealElementPage.selectPricelist(PRICELIST);
      console.log(`  - Pricelist     : ${PRICELIST}`);
      await dealElementPage.selectPaymentTerm(PAYMENT_TERM);
      console.log(`  - Payment Term  : ${PAYMENT_TERM}`);

      // The SUBSCRIPTION product - the whole point of this TC, so it is asserted, not logged.
      const productAdded = await dealElementPage.addProduct(SUBSCRIPTION_SKU);
      expect(productAdded, `The subscription product ${SUBSCRIPTION_SKU} must be added to the Deal Element order lines`)
        .toBe(true);
      console.log(`  - Product       : ${SUBSCRIPTION_SKU} (subscription)`);

      await dealElementPage.save(CommonUtils.waitTimes.savingPage);
      console.log('  - Deal Element saved');

      // Assert the SKU AFTER the save. While the row is still being edited its product cell is an
      // <input>, which carries no textContent, so a hasText row filter cannot see it - the
      // 2026-09-07 run read false even though the page snapshot showed the SKU row present.
      const productInLines = await dealElementPage.isProductInOrderLines(SUBSCRIPTION_SKU);
      expect(productInLines, `The saved order line must hold ${SUBSCRIPTION_SKU} - a different SKU would test a different billing type`)
        .toBe(true);

      // NEW QUOTATION > CONFIRM > CREATE INVOICE > CREATE AND VIEW INVOICES > VALIDATE
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      console.log('  - Quotation created');

      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingDealElement);
      await CommonUtils.wait(CommonUtils.waitTimes.long);
      console.log('  - Quotation confirmed - Sales Order created');

      await invoicePage.clickCreateInvoice(CommonUtils.waitTimes.abnormalWait);
      await invoicePage.clickCreateAndViewInvoices();
      console.log('  - Invoice created (still Draft)');

      const invoiceStatus = await invoicePage.clickValidateAndWaitPosted();
      expect(invoiceStatus, `The invoice must be posted before CREATE LICENSE appears - status read "${invoiceStatus}"`)
        .toMatch(/Open|Posted|Paid/i);
      console.log(`  - Invoice status: ${invoiceStatus}`);

      // Read the number only AFTER the post: Odoo assigns `number` on VALIDATE, so on a Draft
      // invoice the field is empty and rendered with o_invisible_modifier - getInvoiceNumber()
      // then waits for a hidden span and times out (measured on the 2026-09-07 re-run).
      invoiceNumber = await invoicePage.getInvoiceNumber();
      console.log(`  - Invoice number: ${invoiceNumber}`);

      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `Pre-condition II - invoice ${invoiceNumber} validated (${SUBSCRIPTION_SKU})`
      );
    });

    // -------------------------------------------------------------------------------------------
    // Steps to reproduce #1
    // -------------------------------------------------------------------------------------------
    await test.step('Step 1: From a subscription-product invoice, generate a licence the same way', async () => {
      await invoicePage.clickCreateLicense(CommonUtils.waitTimes.savingPage);
      await licensePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);

      // CREATE LICENSE opens a NEW, UNSAVED licence form pre-filled by the generation code. On the
      // SUBSCRIPTION branch the expiry values are NOT in that pre-fill - they are computed when the
      // record is created - so the pre-save form shows Expiration Days 0 with the dates hidden.
      // Reading there produced a false FAIL on 2026-09-07; the stored record from that same invoice
      // (#149602) holds expires = in, expire_mode = PER_LICENSE, expiration_days = 365,
      // expiration_end_date = 2027-09-07. So log the pre-save state as evidence, then SAVE and
      // assert the STORED record - that is what ActiveCampaign and the customer actually see.
      const preSaveExpirationDays = await licensePage.getExpirationDaysValue();
      const preSaveExpireMode = await licensePage.getExpireModeValue();
      console.log('  - Pre-save form (generation pre-fill, not the assertion target):');
      console.log(`     Expiration Days : ${preSaveExpirationDays === '' ? '(not rendered)' : preSaveExpirationDays}`);
      console.log(`     Expire Mode     : ${preSaveExpireMode === '' ? '(unset)' : preSaveExpireMode}`);

      await licensePage.selectForMonitoring(FOR_MONITORING, CommonUtils.waitTimes.abnormalWait);
      console.log(`  - for monitoring  : ${FOR_MONITORING}`);
      const saveMs = await licensePage.clickSaveAndWaitForCompletion(CommonUtils.waitTimes.savingPage);
      console.log(`  - Licence SAVED in ${(saveMs / 1000).toFixed(2)}s`);

      licenseId = licensePage.getRecordIdFromUrl();
      expect(licenseId, 'Saving the generated licence must produce a record id in the form URL')
        .not.toBe('');
      licenseUrl = `${baseUrl.replace(/\/$/, '')}/web#id=${licenseId}&model=${LICENSE_MODEL}&view_type=form`;

      licenseName = await licensePage.getLicenseNameValue();
      licensing = await licensePage.getLicensingValue();
      expires = await licensePage.getExpiresValue();
      expireMode = await licensePage.getExpireModeValue();
      expirationDaysShown = await licensePage.isFieldDisplayed('expiration_days');
      expirationDays = await licensePage.getExpirationDaysValue();
      expireStartDateShown = await licensePage.isFieldDisplayed('expire_start_date');
      expireStartDate = await licensePage.getExpireStartDateValue();
      expirationEndDateShown = await licensePage.isFieldDisplayed('expiration_end_date');
      expirationEndDate = await licensePage.getExpirationEndDateValue();
      maintenanceDays = await licensePage.getMaintenanceDaysValue();

      console.log(`  - Licence generated: ${licenseId ? `#${licenseId} - ${licenseUrl}` : '(unsaved form)'}`);
      console.log(`  - Name                 : ${licenseName}`);
      console.log(`  - Licensing            : ${licensing}`);
      console.log(`  - Expires              : ${expires}`);
      console.log(`  - Expire Mode          : ${expireMode}`);
      console.log(`  - Expiration Days shown: ${expirationDaysShown}`);
      console.log(`  - Expiration Days      : ${expirationDays === '' ? '(not rendered)' : expirationDays}`);
      console.log(`  - Expire Start shown   : ${expireStartDateShown}`);
      console.log(`  - Expire Start Date    : ${expireStartDate === '' ? '(empty)' : expireStartDate}`);
      console.log(`  - Expiration End shown : ${expirationEndDateShown}`);
      console.log(`  - Expiration End Date  : ${expirationEndDate === '' ? '(empty)' : expirationEndDate}`);
      console.log(`  - Maintenance Days     : ${maintenanceDays}`);

      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `Steps to reproduce I - licence ${licenseId} generated`
      );
    });

    // -------------------------------------------------------------------------------------------
    // Verification
    // -------------------------------------------------------------------------------------------
    await test.step('Verification: the generated licence still has Expires = in with expiration days greater than 0', async () => {
      const expirationDaysNumeric = parseInt((expirationDays || '0').replace(/[^\d-]/g, '') || '0', 10);
      const maintenanceDaysNumeric = parseInt((maintenanceDays || '0').replace(/[^\d-]/g, '') || '0', 10);

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - Licensing on the generated licence:');
      console.log(`     Expected : ${EXPECTED_LICENSING}`);
      console.log(`     Actual   : ${licensing}`);
      console.log(`     Result   : ${licensing === EXPECTED_LICENSING ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - Expires:');
      console.log(`     Expected : ${EXPECTED_EXPIRES}`);
      console.log(`     Actual   : ${expires}`);
      console.log(`     Result   : ${expires === EXPECTED_EXPIRES ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - Expiration Days value (the inverse-guard bar: 96 subscriptions never expired):');
      console.log('     Expected : greater than 0');
      console.log(`     Actual   : ${expirationDays === '' ? '(not rendered)' : expirationDays}`);
      console.log(`     Result   : ${expirationDaysNumeric > 0 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - "Expiration Days" field displayed (Odoo shows it only when Expires = in):');
      console.log('     Expected : DISPLAYED');
      console.log(`     Actual   : ${expirationDaysShown ? 'DISPLAYED' : 'NOT DISPLAYED'}`);
      console.log(`     Result   : ${expirationDaysShown === true ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #5 - Expire Mode:');
      console.log(`     Expected : ${EXPECTED_EXPIRE_MODE}`);
      console.log(`     Actual   : ${expireMode}`);
      console.log(`     Result   : ${expireMode === EXPECTED_EXPIRE_MODE ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #6 - "Expire Start Date" displayed and filled:');
      console.log('     Expected : DISPLAYED and not empty');
      console.log(`     Actual   : ${expireStartDateShown ? 'DISPLAYED' : 'NOT DISPLAYED'} / ${expireStartDate === '' ? '(empty)' : expireStartDate}`);
      console.log(`     Result   : ${expireStartDateShown === true && expireStartDate !== '' ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #7 - "Expiration End Date" displayed and filled:');
      console.log('     Expected : DISPLAYED and not empty');
      console.log(`     Actual   : ${expirationEndDateShown ? 'DISPLAYED' : 'NOT DISPLAYED'} / ${expirationEndDate === '' ? '(empty)' : expirationEndDate}`);
      console.log(`     Result   : ${expirationEndDateShown === true && expirationEndDate !== '' ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #8 - Maintenance Days (support window must still be written too):');
      console.log('     Expected : greater than 0');
      console.log(`     Actual   : ${maintenanceDays === '' ? '(not rendered)' : maintenanceDays}`);
      console.log(`     Result   : ${maintenanceDaysNumeric > 0 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: licence #${licenseId} generated from ${SUBSCRIPTION_SKU} - subscription, expiry still stamped`);

      expect(licensing, `The generated licence must be "${EXPECTED_LICENSING}" - ${SUBSCRIPTION_SKU} is a subscription SKU`)
        .toBe(EXPECTED_LICENSING);
      expect(expires, `Expires must be "${EXPECTED_EXPIRES}" - a subscription licence has to expire`)
        .toBe(EXPECTED_EXPIRES);
      expect(expirationDaysNumeric, `Expiration Days must be greater than 0, read "${expirationDays}" (0 = the mirror defect: 96 live subscription licences that never expire)`)
        .toBeGreaterThan(0);
      expect(expirationDaysShown, 'The "Expiration Days" field must be displayed while Expires = in')
        .toBe(true);
      expect(expireMode, `Expire Mode must be "${EXPECTED_EXPIRE_MODE}" on a subscription licence`)
        .toBe(EXPECTED_EXPIRE_MODE);
      expect(expireStartDateShown, 'The "Expire Start Date" field must be displayed while Expire Mode = available')
        .toBe(true);
      expect(expireStartDate, 'Expire Start Date must be filled on a subscription licence')
        .not.toBe('');
      expect(expirationEndDateShown, 'The "Expiration End Date" field must be displayed while Expire Mode = available')
        .toBe(true);
      expect(expirationEndDate, 'Expiration End Date must be filled on a subscription licence (the form makes it required)')
        .not.toBe('');
      expect(maintenanceDaysNumeric, `Maintenance Days must be greater than 0, read "${maintenanceDays}"`)
        .toBeGreaterThan(0);
    });
  });
});
