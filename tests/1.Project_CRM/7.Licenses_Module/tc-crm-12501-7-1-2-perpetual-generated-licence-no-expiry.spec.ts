import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { LoginPage, HomePage, OpportunityPage, DealElementPage, QuotationPage, InvoicePage, LicensePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =================================================================================================
 *  CRM-12501 - Perpetual licences stamped with a 365-day expiry
 *  TC 7.1.2 - MANUAL License Manager path: a perpetual order no longer stamps an expiry (regression)
 * =================================================================================================
 *  Test Case ID    : CRM-12501_7.1.2
 *  Jira            : CRM-12501
 *  Automation-Type : refactored
 *  Automation-Date : 2026-09-10
 *
 *  SCOPE - this is NOT the ticket's main case.
 *    CRM-12501 was reported against licence #146359, which the WebShop path generated automatically
 *    when the order was paid (`generated_by_odoo = true`, `create_uid = 1`). The reporter rejected
 *    this manual-button evidence on 2026-09-07 15:02 for exactly that reason, and the dev then
 *    extended the fix to BOTH paths (comment of 2026-09-07 17:56). The WebShop case is Test case 4
 *    and is the declared main focus; it CANNOT be automated black-box on pre-production - see the
 *    "WebShop path not automatable" note at the bottom of this header.
 *    This spec therefore stands as the REGRESSION GUARD for the manual License Manager button.
 *
 *  Summary:
 *    Builds its own validated invoice for the perpetual SKU [A2144B], presses CREATE LICENSE as a
 *    License Manager, and asserts the generated licence carries no expiry at all - Perpetual,
 *    Expires = never, Expire Mode = none, no expiry field on screen - while the SKU's 1 year of
 *    support still lands in the maintenance fields.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12501_7\.1\.2:" --project=chromium
 *
 * -------------------------------------------------------------------------------------------------
 *  Source manual TC - CRM-12501, dev comment of 2026-09-07 10:38 (+03:00),
 *                     Test case 2 "generating a new licence from a perpetual order no longer
 *                     stamps an expiry" - the MANUAL License Manager button path.
 * -------------------------------------------------------------------------------------------------
 *  Pre-condition(s)
 *    1. Login to Pre-production as admin CRM (a License Manager account - the CREATE LICENSE button
 *       is restricted to group license_management.group_license_manager).
 *    2-15. Build a validated invoice for a PERPETUAL product:
 *       CRM > view list > CREATE;
 *       enter Opportunity details;
 *       SAVE; wait for the async Contact/Company;
 *       DEAL ELEMENT > Pricelist + Payment Term > add the perpetual product > SAVE;
 *       NEW QUOTATION; CONFIRM (Sales Order); CREATE INVOICE; CREATE AND VIEW INVOICES; VALIDATE.
 *
 *       Opportunity fields entered:
 *         - Opp name      = TEST CRM-12501_7.1.2 <timestamp>
 *         - Email         = Test@company<timestamp>.com
 *         - Country       = United States
 *         - State         = Connecticut
 *         - Sales Team    = (cleared)
 *         - Salesperson   = (cleared)
 *         - Lead form     = License          (CRM Developer tab)
 *       Deal Element fields entered:
 *         - Pricelist     = Public Pricelist_USD
 *         - Payment Term  = Immediate Payment
 *         - Product       = [A2144B]         (licensing = perpetual, template 8276)
 *
 *  Steps to reproduce #1
 *    1. From a perpetual-product invoice, generate a licence with Create License, acting as a
 *       License Manager user.
 *
 *  Verification
 *    - The generated licence is Perpetual with Expires = never and expiration days = 0.
 *
 * -------------------------------------------------------------------------------------------------
 *  UI grounding (pre-prod, form view 2441 + product/template data, read 2026-09-07)
 * -------------------------------------------------------------------------------------------------
 *  | Point                 | Manual TC says          | What the UI / data actually does            |
 *  |-----------------------|-------------------------|---------------------------------------------|
 *  | "expiration days = 0" | a 0 shown on the form   | the field is NOT rendered: attrs invisible  |
 *  |                       |                         | when expires != 'in'. Asserted both ways.   |
 *  | Expire Mode           | not mentioned           | licence template 8276 (the one product 216  |
 *  |                       |                         | [A2144B] points at) carries                 |
 *  |                       |                         | expire_mode = PER_LICENSE, and the form     |
 *  |                       |                         | makes `expiration_end_date` REQUIRED        |
 *  |                       |                         | whenever expire_mode = PER_LICENSE. So a    |
 *  |                       |                         | fix that clears `expires`/`expiration_days` |
 *  |                       |                         | but leaves expire_mode = available still    |
 *  |                       |                         | demands an expiry date. Measured 2026-09-07:|
 *  |                       |                         | a GENERATED perpetual licence leaves Expire |
 *  |                       |                         | Mode UNSET (blank option), while the        |
 *  |                       |                         | bulk-corrected #146359 stores NONE. Both    |
 *  |                       |                         | keep the expiry fields hidden, so the check |
 *  |                       |                         | is "not available / PER_LICENSE", not one   |
 *  |                       |                         | literal string.                             |
 *  Resolution: keep the manual TC's two checks and add the Expire-Mode / expiry-date checks that
 *  the ticket's own "Suggested order of work" #1 demands ("expiration dates left empty").
 *
 * -------------------------------------------------------------------------------------------------
 *  Data & cleanup
 * -------------------------------------------------------------------------------------------------
 *  Fresh, uniquely timestamped Opportunity + Contact/Company every run (REQUIREMENT #2), so two
 *  back-to-back runs both pass with no manual setup.
 *
 *  No licence record is created: CREATE LICENSE opens a NEW, UNSAVED licence form pre-filled by the
 *  generation code, and nothing is written until SAVE is pressed (verified 2026-09-07). This TC
 *  reads that pre-filled state - exactly what the manual TC checks - and never saves, so there is
 *  no licence to delete. Verifying the STORED record would need an extra SAVE step (the form also
 *  wants "for monitoring" first) and is deliberately out of this TC's scope.
 *
 *  The chain the TC does create (Opportunity, Deal Element, Quotation, Sales Order and the POSTED
 *  invoice) is left in place on purpose: a validated invoice cannot be removed without a CANCEL +
 *  SET TO DRAFT pass that would distort accounting data on the shared pre-prod. Their ids are
 *  printed at the end of the run so they can be removed on request.
 *
 * -------------------------------------------------------------------------------------------------
 *  WebShop path (Test case 4) NOT automatable on pre-production - grounded 2026-09-10
 * -------------------------------------------------------------------------------------------------
 *  The automatic path has exactly one trigger: scheduled action id 37 "License Manager: Website
 *  Invoice to License" -> `model._cron_create_website_license()`, every 15 minutes. On pre-production
 *  that cron is DISABLED (`active = false`, `nextcall` frozen at 2026-01-22), and its server action
 *  id 984 carries `binding_model_id = false`, so it is not bound to the invoice Action menu either -
 *  no end user can trigger it from the UI. Driving it from the backend would break the repo's
 *  black-box rule.
 *  Evidence that the cron IS the trigger: on Production the reported chain ran invoice 15:12:06 ->
 *  licence 15:27:49, a 15m43s gap = one cron tick. The dev's evidence licences #149605 and #149606
 *  were both created in the SAME second (2026-09-07 14:49:57), i.e. by running that generation by
 *  hand, not by a WebShop purchase.
 *  To automate Test case 4, a dev must enable cron 37 on pre-production; the spec would then place a
 *  paid perpetual order on the portal and wait up to ~15 minutes for the generated licence.
 */

// --- Test data ------------------------------------------------------------------------------------
const TC_ID = 'CRM-12501_7.1.2';
const PERPETUAL_SKU = '[A2144B]';        // product 216, licensing = perpetual, template 8276
const PRICELIST = 'Public Pricelist_USD';
const PAYMENT_TERM = 'Immediate Payment';
const COUNTRY = 'United States';
const STATE = 'Connecticut';
const LEAD_FORM = 'License';
const LICENSE_MODEL = 'license_management.license';

// --- Expected generated state (perpetual => nothing expires) --------------------------------------
const EXPECTED_LICENSING = 'Perpetual';
const EXPECTED_EXPIRES = 'never';
// A freshly GENERATED perpetual licence leaves Expire Mode UNSET (the blank option is selected),
// whereas the bulk-corrected #146359 carries it explicitly as "none" (stored NONE). Both mean the
// same thing - anything other than available / PER_LICENSE keeps every expiry field hidden - so the
// check is "not an expiring mode" rather than one literal string (grounded on the 2026-09-07 run).
const EXPIRING_EXPIRE_MODE = /available|PER_LICENSE/i;
const EXPECTED_EXPIRE_MODE_TEXT = 'none or (unset)';

// --- Cleanup toggles (true = skip, false = run) ---------------------------------------------------
const SKIP_CLEANUP_LICENSE = false; // delete the licence this TC generated
const SKIP_CLEANUP_CHAIN = true;    // Opp / Deal Element / Quotation / SO / posted invoice: see header

test.describe('CRM-12501_7.1 - Perpetual licence must not carry an expiry', () => {
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

  test('CRM-12501_7.1.2: Verify a licence generated from a perpetual order carries no expiry', async ({ page }, testInfo) => {
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
    let expirationDaysShown = true;
    let expirationDays = '';
    let expireStartDateShown = true;
    let expirationEndDateShown = true;
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
    // Pre-condition #2 - grouped setup: build a validated invoice for the perpetual SKU
    // -------------------------------------------------------------------------------------------
    await test.step(`Pre-condition 2-15: Build a validated invoice for the perpetual product ${PERPETUAL_SKU}`, async () => {
      const oppName = opportunityPage.generateOpportunityName(`TEST ${TC_ID}`);
      const emailAddress = opportunityPage.generateEmail('Test@company');

      console.log('Pre-condition 2-15: Building the perpetual order chain');

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

      // The PERPETUAL product - the whole point of this TC, so it is asserted, not logged.
      const productAdded = await dealElementPage.addProduct(PERPETUAL_SKU);
      expect(productAdded, `The perpetual product ${PERPETUAL_SKU} must be added to the Deal Element order lines`)
        .toBe(true);
      console.log(`  - Product       : ${PERPETUAL_SKU} (perpetual)`);

      await dealElementPage.save(CommonUtils.waitTimes.savingPage);
      console.log('  - Deal Element saved');

      // Assert the SKU AFTER the save. While the row is still being edited its product cell is an
      // <input>, which carries no textContent, so a hasText row filter cannot see it - the
      // 2026-09-07 run read false even though the page snapshot showed the [A2144B] row present.
      const productInLines = await dealElementPage.isProductInOrderLines(PERPETUAL_SKU);
      expect(productInLines, `The saved order line must hold ${PERPETUAL_SKU} - a different SKU would test a different billing type`)
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
        `Pre-condition II - invoice ${invoiceNumber} validated (${PERPETUAL_SKU})`
      );
    });

    // -------------------------------------------------------------------------------------------
    // Steps to reproduce #1
    // -------------------------------------------------------------------------------------------
    await test.step('Step 1: From a perpetual-product invoice, generate a licence with Create License, acting as a License Manager user', async () => {
      await invoicePage.clickCreateLicense(CommonUtils.waitTimes.savingPage);
      await licensePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);

      // CREATE LICENSE opens a NEW, UNSAVED licence form pre-filled by the generation code: the URL
      // carries no record id and nothing is written to the database until SAVE is pressed (verified
      // on the 2026-09-07 run). That pre-filled state IS what this TC verifies, so the id is
      // optional and no licence record is left behind.
      licenseId = licensePage.getRecordIdFromUrl();
      licenseUrl = licenseId
        ? `${baseUrl.replace(/\/$/, '')}/web#id=${licenseId}&model=${LICENSE_MODEL}&view_type=form`
        : '';
      console.log(`  - Licence form opened ${licenseId ? `on saved record #${licenseId}` : 'as a NEW unsaved record (nothing written yet)'}`);

      licenseName = await licensePage.getLicenseNameValue();
      licensing = await licensePage.getLicensingValue();
      expires = await licensePage.getExpiresValue();
      expireMode = await licensePage.getExpireModeValue();
      expirationDaysShown = await licensePage.isFieldDisplayed('expiration_days');
      expirationDays = await licensePage.getExpirationDaysValue();
      expireStartDateShown = await licensePage.isFieldDisplayed('expire_start_date');
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
    await test.step('Verification: the generated licence is Perpetual with Expires = never and expiration days = 0', async () => {
      const expirationDaysNumeric = parseInt((expirationDays || '0').replace(/[^\d-]/g, '') || '0', 10);
      const expirationDaysIsZero = expirationDays === '' || expirationDaysNumeric === 0;
      const maintenanceDaysNumeric = parseInt((maintenanceDays || '0').replace(/[^\d-]/g, '') || '0', 10);
      const expireModeIsExpiring = EXPIRING_EXPIRE_MODE.test(expireMode);

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - Licensing on the generated licence:');
      console.log(`     Expected : ${EXPECTED_LICENSING}`);
      console.log(`     Actual   : ${licensing}`);
      console.log(`     Result   : ${licensing === EXPECTED_LICENSING ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - Expires:');
      console.log(`     Expected : ${EXPECTED_EXPIRES}`);
      console.log(`     Actual   : ${expires}`);
      console.log(`     Result   : ${expires === EXPECTED_EXPIRES ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - Expiration Days value (365 = the reported defect):');
      console.log('     Expected : empty or 0');
      console.log(`     Actual   : ${expirationDays === '' ? '(not rendered)' : expirationDays}`);
      console.log(`     Result   : ${expirationDaysIsZero ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - "Expiration Days" field displayed (Odoo hides it when Expires != in):');
      console.log('     Expected : NOT DISPLAYED');
      console.log(`     Actual   : ${expirationDaysShown ? 'DISPLAYED' : 'NOT DISPLAYED'}`);
      console.log(`     Result   : ${expirationDaysShown === false ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #5 - Expire Mode (template 8276 ships PER_LICENSE - the fix must reset it):');
      console.log(`     Expected : ${EXPECTED_EXPIRE_MODE_TEXT}`);
      console.log(`     Actual   : ${expireMode === '' ? '(unset)' : expireMode}`);
      console.log(`     Result   : ${expireModeIsExpiring === false ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #6 - "Expire Start Date" field displayed:');
      console.log('     Expected : NOT DISPLAYED');
      console.log(`     Actual   : ${expireStartDateShown ? 'DISPLAYED' : 'NOT DISPLAYED'}`);
      console.log(`     Result   : ${expireStartDateShown === false ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #7 - "Expiration End Date" field displayed:');
      console.log('     Expected : NOT DISPLAYED');
      console.log(`     Actual   : ${expirationEndDateShown ? 'DISPLAYED' : 'NOT DISPLAYED'}`);
      console.log(`     Result   : ${expirationEndDateShown === false ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #8 - Expiration End Date value:');
      console.log('     Expected : empty');
      console.log(`     Actual   : ${expirationEndDate === '' ? '(empty)' : expirationEndDate}`);
      console.log(`     Result   : ${expirationEndDate === '' ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #9 - Maintenance Days (the SKU support days must land HERE, not in expiry):');
      console.log('     Expected : greater than 0');
      console.log(`     Actual   : ${maintenanceDays === '' ? '(not rendered)' : maintenanceDays}`);
      console.log(`     Result   : ${maintenanceDaysNumeric > 0 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: licence #${licenseId} generated from ${PERPETUAL_SKU} - perpetual, no expiry stamped`);

      expect(licensing, `The generated licence must be "${EXPECTED_LICENSING}" - ${PERPETUAL_SKU} is a perpetual SKU`)
        .toBe(EXPECTED_LICENSING);
      expect(expires, `Expires must be "${EXPECTED_EXPIRES}" on a licence generated from a perpetual order`)
        .toBe(EXPECTED_EXPIRES);
      expect(expirationDaysIsZero, `Expiration Days must be empty or 0, read "${expirationDays}" (365 = the reported defect)`)
        .toBe(true);
      expect(expirationDaysShown, 'The "Expiration Days" field must NOT be displayed while Expires = never')
        .toBe(false);
      expect(expireModeIsExpiring, `Expire Mode must not be an expiring mode (expected ${EXPECTED_EXPIRE_MODE_TEXT}, read "${expireMode}") - licence template 8276 ships PER_LICENSE, so the generation code has to reset it`)
        .toBe(false);
      expect(expireStartDateShown, 'The "Expire Start Date" field must NOT be displayed while Expire Mode = none')
        .toBe(false);
      expect(expirationEndDateShown, 'The "Expiration End Date" field must NOT be displayed while Expire Mode = none')
        .toBe(false);
      expect(expirationEndDate, 'Expiration End Date must stay empty on a perpetual licence')
        .toBe('');
      expect(maintenanceDaysNumeric, `Maintenance Days must be greater than 0 - the SKU's support window belongs in the maintenance fields, read "${maintenanceDays}"`)
        .toBeGreaterThan(0);
    });
  });
});
