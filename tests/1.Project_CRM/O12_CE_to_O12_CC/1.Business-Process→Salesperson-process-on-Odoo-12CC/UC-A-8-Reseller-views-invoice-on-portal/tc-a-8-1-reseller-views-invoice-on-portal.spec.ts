import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, DealElementPage, QuotationPage, InvoicePage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote, DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';

/**
 * ===========================================================================
 *  UC-A-8  -  Reseller views invoice on portal
 * ===========================================================================
 *  Test Case ID    : TC.-A.8.1
 *  Automation-Type : new
 *  Automation-Date : 2026-06-23
 *
 *  Summary:
 *    Verify Reseller views invoice on portal successful. As Thomas, create a
 *    deal-registration Opportunity and a validated Invoice (Invoice Number #1);
 *    then as the Reseller open "My invoices" and verify the invoice's
 *    top-of-page number equals Invoice Number #1.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-A\.8\.1:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-condition #1:
 *    Build the deal-registration Internal Note #1 from the template, filling the <...> placeholders
 *    with fresh dynamic values each run (key fields, one per line):
 *      - NAKIVO deal registration*  = <random 4-digit number>
 *      - Name                       = TEST <current date time>
 *      - Email                      = Test@company<compact date time>.com
 *      - Created Date               = <current date time>
 *      - phone                      = <random 9-digit number>
 *      - Company                    = Company Name Lead 1
 *      - Partner Company Name       = TEST-Reseller#Automation-Jun10
 *      - IP                         = 128.183.189.157
 *      - Country                    = United States
 *    (Remaining template lines - Solution used, Edition, License Type, etc. - are static defaults.)
 *
 *  Steps to reproduce #1  -  create the invoice as Thomas:
 *     1. Use the account of Thomas to login successful
 *     2. After login successful, click at "CRM" button; on "CRM" page, click at "view list" button
 *     3. On "Opp" page, click at "CREATE" button
 *     4. Enter the following information:
 *          - Opp name textbox         = TEST + Test Case ID + current date time
 *          - Contact name             = Internal Note #1 "Name" (TEST + current date time)
 *          - Company Name             = Internal Note #1 "Company" (Company Name Lead 1)
 *          - Email                    = Internal Note #1 "Email" (Test@company<date><time>.com)
 *          - Country                  = United States
 *          - State                    = Maryland
 *          - IP                       = Internal Note #1 "IP"
 *          - Create manually checkbox = FALSE
 *          - Sales Team dropdown      = cleared
 *          - Salesperson dropdown     = cleared
 *     5. Click at "CRM Developer" tab at the bottom of page; Lead form textbox = NAKIVO deal registration*
 *     6. Click at "Assigned Partner" tab: Set "Assigned Partner" = TEST-Reseller#Automation-Jun10
 *     7. Click at "Internal Notes" tab then enter the value at Internal Note #1 edited in pre-condition Step #2
 *     8. Press "SAVE" button
 *     9. Save the URL of Opp Name #1 call Opp URL #1
 *    10. Refresh page to see the "Contact" field is entered equal to value of Contact_name #1
 *    11. Create "DEAL ELEMENT": press "DEAL ELEMENT" button
 *    12. Once the "Deal Element" screen shows up select the following:
 *          - Pricelist    = Public Pricelist_USD (USD)
 *          - Payment Term = Immidiate Payment
 *    13. At "Order Lines" section: press "Add a product" link, when the dropdown displays, select the first one
 *    14. Finally, press "SAVE" button on the top page and wait
 *    15. Press "NEW QUOTATION" button and wait
 *    16. Press "CONFIRM" button and wait to create a Sales Order
 *    17. On "Sales Order" screen, press "CREATE INVOICE" button and wait
 *    18. On "Invoice Order" window, press "CREATE AND VIEW INVOICES" button and wait
 *    19. Remember the Invoice number called Invoice Number #1
 *    19. Press "VALIDATE" button and wait
 *
 *  Steps to reproduce #2  -  view the invoice as the Reseller:
 *     1. Use the account of Reseller_1 (name: TEST-Reseller#1_Automation_Test) to login successful
 *     2. After login successful, click at "My invoices" button
 *     3. On "My invoices" page, select the Invoice number with Invoice Number #1 created previously and wait
 *
 *  Verification #1:
 *     1. The value of Invoice number on top of page = value of Invoice Number #1
 * ===========================================================================
 */

// This test creates a financial chain (Opportunity -> Deal Element -> Quotation -> Sales Order ->
// VALIDATED Invoice). A validated/posted invoice cannot be cleanly deleted, and per the O12 teardown
// convention these records are retained for later verification - so cleanup is SKIPPED by default.
// Flip to false to attempt deleting the created Opportunity (re-login as admin); note this will NOT
// remove the Sales Order / validated Invoice, which must be cleaned up manually if required.
const SKIP_CLEANUP_OPP = true; // true = keep the created records (default); false = delete the Opportunity on teardown

// Sourced from the deal-registration test data (single source of truth).
const ASSIGNED_PARTNER = DEAL_REGISTRATION.partnerCompanyName; // TEST-Reseller#Automation-Jun10
const LEAD_FORM_VALUE = DEAL_REGISTRATION.leadFormMarker;      // NAKIVO deal registration*

test.describe('TC.-A.8.1 - Reseller views invoice on portal', () => {

  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - stabilizing page before screenshot...');
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    if (!SKIP_CLEANUP_OPP && createdOppUrl) {
      // The test ends logged in as the Reseller (portal user) who cannot delete a backend record.
      // Re-login as an admin (delete rights) first, then delete the created Opportunity by URL.
      console.log('Tear down: deleting created Opportunity (re-login as admin with delete rights)');
      try {
        const loginPage = new LoginPage(page);
        await loginPage.logout(baseUrl);
        await page.context().clearCookies();
        await loginPage.navigateTo(baseUrl);
        await loginPage.login(users.admin_crm.username, users.admin_crm.password);
        await loginPage.dismissLocationPermissionDialog().catch(() => {});
        await CommonUtils.deleteRecordByUrl(page, createdOppUrl, testInfo);
        console.log('✓ Created Opportunity deleted (Sales Order / validated Invoice are retained)');
      } catch (e) {
        console.log(`⚠ Tear down (delete Opportunity) failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  });

  test('TC.-A.8.1: Verify Reseller views invoice on portal successful', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const invoicePage = new InvoicePage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    // --- Pre-condition #1: build the deal-registration Internal Note with dynamic values ---
    // The note template + builder live in test-data/CRM-deal_registration/deal-registration.note.ts.
    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.8.1 ${compactDateTime}`;
    // Invoice Number #1 - captured from the backend Invoice (post-VALIDATE, the posted number the
    // portal shows). Read in step 19 and finalised right after VALIDATE.
    let invoiceNumber1 = '';

    await test.step('Pre-condition 1: Prepare the deal-registration Internal Note', async () => {
      console.log('Pre-condition 1: Internal Note prepared with dynamic values');
      console.log(`  - Opportunity name (Opp Name #1): ${oppName}`);
      console.log(`  - Contact name (Contact_name #1): ${leadName}`);
      console.log(`  - Company email: ${companyEmail}`);
      console.log(`  - Assigned Partner: ${ASSIGNED_PARTNER}`);
    });

    // ─── Steps to reproduce #1 (create the invoice as Thomas) ───────────────────

    await test.step('Steps to reproduce #1 - Step 1: Use the account of Thomas to login successful', async () => {
      console.log('Step 1: Logging in as Thomas');
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.sale_ic_thomas.username, users.sale_ic_thomas.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log('✓ Logged in as Thomas');
    });

    await test.step('Steps to reproduce #1 - Step 2: Click "CRM" button; on "CRM" page, click at "view list" button', async () => {
      console.log('Step 2: Opening CRM and switching to list view');
      await homePage.navigateToCRM();
      await opportunityPage.switchToListView();
      console.log('✓ CRM opened in list view');
    });

    await test.step('Steps to reproduce #1 - Step 3: On "Opp" page, click at "CREATE" button', async () => {
      console.log('Step 3: Clicking CREATE button');
      await opportunityPage.clickCreate();
      console.log('✓ Opportunity creation form opened');
    });

    await test.step('Steps to reproduce #1 - Step 4: Enter Opp name, Contact/Company/Email, Country/State, IP; Create manually = FALSE; clear Sales Team and Salesperson', async () => {
      console.log('Step 4: Entering Opportunity details');
      await opportunityPage.fillOpportunityName(oppName);
      // Customer fields taken from Internal Note #1 (Name / Company / Email / IP) + Country/State.
      await opportunityPage.fillContactName(leadName);                  // Contact name = Internal Note "Name"
      await opportunityPage.fillCompanyName(DEAL_REGISTRATION.companyName);
      await opportunityPage.fillEmail(companyEmail);                    // Email = Internal Note "Email"
      await opportunityPage.selectCountry(DEAL_REGISTRATION.country);   // United States
      await opportunityPage.selectState(DEAL_REGISTRATION.state);       // Maryland
      await opportunityPage.fillIP(DEAL_REGISTRATION.ip);              // IP = Internal Note "IP"
      // "Create manually" is hidden (o_invisible_modifier) on a fresh Opp; set it FALSE via the
      // widget (JS-set + dispatch), which persists through save.
      const setFalse = await opportunityPage.setCreatedManually(false);
      console.log(`  - Contact: "${leadName}" | Company: "${DEAL_REGISTRATION.companyName}" | Email: "${companyEmail}"`);
      console.log(`  - Country: "${DEAL_REGISTRATION.country}" | State: "${DEAL_REGISTRATION.state}" | IP: "${DEAL_REGISTRATION.ip}"`);
      console.log(`  - Create manually set to FALSE: ${setFalse}`);
      await opportunityPage.clearSalesTeam();
      await opportunityPage.clearSalesperson();
      console.log('✓ Opportunity details entered; Create manually = FALSE; Sales Team and Salesperson cleared');
    });

    await test.step('Steps to reproduce #1 - Step 5: Click "CRM Developer" tab; set Lead form = NAKIVO deal registration*', async () => {
      console.log('Step 5: Setting Lead form on the CRM Developer tab');
      await opportunityPage.clickCRMDeveloperTab();
      await opportunityPage.fillLeadForm(LEAD_FORM_VALUE);
      console.log(`✓ Lead form set to "${LEAD_FORM_VALUE}"`);
    });

    await test.step('Steps to reproduce #1 - Step 6: Click "Assigned Partner" tab; set Assigned Partner = TEST-Reseller#Automation-Jun10', async () => {
      console.log('Step 6: Setting Assigned Partner');
      await opportunityPage.clickAssignedPartnerTab();
      await opportunityPage.setAssignedPartner(ASSIGNED_PARTNER);
      console.log(`✓ Assigned Partner set to "${ASSIGNED_PARTNER}"`);
    });

    await test.step('Steps to reproduce #1 - Step 7: Click "Internal Notes" tab; enter the Internal Note #1', async () => {
      console.log('Step 7: Entering the deal-registration Internal Note');
      await opportunityPage.clickInternalNotesTab();
      await opportunityPage.fillInternalNotes(internalNote);
      console.log('✓ Internal Note entered');
    });

    await test.step('Steps to reproduce #1 - Step 8: Press "SAVE" button', async () => {
      console.log('Step 8: Saving the Opportunity');
      // Re-ensure "Create manually" is still FALSE right before save (Odoo can auto-re-default it).
      await opportunityPage.setCreatedManually(false);
      await opportunityPage.saveAndWaitForCompletion();
      console.log('✓ Opportunity saved');
    });

    await test.step('Steps to reproduce #1 - Step 9: Save the URL of Opp Name #1 (Opp URL #1)', async () => {
      createdOppUrl = page.url();
      console.log(`Step 9: Opp URL #1 captured: ${createdOppUrl}`);
      const hasRecordId = /[#?&]id=\d+/.test(createdOppUrl ?? '');
      expect(hasRecordId, 'The Opportunity should be saved (Opp URL #1 should contain a record id)').toBeTruthy();
    });

    await test.step('Steps to reproduce #1 - Step 10: Refresh page to see the "Contact" field equals Contact_name #1', async () => {
      console.log('Step 10: Refreshing and verifying the Contact field equals Contact_name #1');
      console.log(`  - Expected Contact (Contact_name #1): "${leadName}"`);
      const { contactFieldFound, contactValue } = await opportunityPage.waitForContactFieldEquals(leadName);
      console.log(`  - Contact field value: "${contactValue}"`);
      expect(
        contactFieldFound,
        `The "Contact" field should equal Contact_name #1 ("${leadName}") after the async Contact creation`
      ).toBeTruthy();
      console.log('✓ Contact field equals Contact_name #1');
    });

    await test.step('Steps to reproduce #1 - Step 11: Create "DEAL ELEMENT" - press "DEAL ELEMENT" button', async () => {
      console.log('Step 11: Clicking DEAL ELEMENT button');
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      console.log('✓ Deal Element form opened');
    });

    await test.step('Steps to reproduce #1 - Step 12: On the Deal Element, set Pricelist = Public Pricelist_USD (USD) and Payment Term = Immediate Payment', async () => {
      console.log('Step 12: Filling Deal Element information');
      // The Deal Element chatter can raise an "Odoo Server Error - Missing Record" (mail.followers)
      // popup on load that intercepts clicks - clear it (retry for the delayed appearance) first.
      await dealElementPage.dismissErrorDialogWithRetry();
      await dealElementPage.waitForAutoPopulate();
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      console.log('  - Pricelist: Public Pricelist_USD (USD)');
      // The manual TC text reads "Immidiate Payment" (typo); the real option label is "Immediate Payment".
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      console.log('  - Payment Term: Immediate Payment');
    });

    await test.step('Steps to reproduce #1 - Step 13: At "Order Lines", press "Add a product" and select the first product', async () => {
      console.log('Step 13: Adding the first product in Order Lines');
      await dealElementPage.dismissErrorDialog();
      // Empty product name -> the "Add a product" dropdown is opened and the first option is selected.
      // Qty defaults to 1 (under the $4k threshold), so the Quotation needs no Sales Manager approval.
      const added = await dealElementPage.addProduct('');
      console.log(added ? '  - First product selected' : '  - Could not add a product');
    });

    await test.step('Steps to reproduce #1 - Step 14: Press "SAVE" button on the Deal Element and wait', async () => {
      console.log('Step 14: Saving the Deal Element');
      await dealElementPage.save(CommonUtils.waitTimes.savingPage);
      console.log('✓ Deal Element saved');
    });

    await test.step('Steps to reproduce #1 - Step 15: Press "NEW QUOTATION" button and wait', async () => {
      console.log('Step 15: Clicking NEW QUOTATION');
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      console.log('✓ Quotation created');
    });

    await test.step('Steps to reproduce #1 - Step 16: Press "CONFIRM" button and wait to create a Sales Order', async () => {
      console.log('Step 16: Clicking CONFIRM (Quotation -> Sales Order)');
      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingDealElement);
      // The Sales Order re-renders its chatter on confirm - clear any "Missing Record" / client-error popup.
      await quotationPage.dismissErrorDialogWithRetry();
      await quotationPage.waitForConfirmButtonToDisappear(CommonUtils.waitTimes.abnormalWait).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Sales Order created');
    });

    await test.step('Steps to reproduce #1 - Step 17: On the "Sales Order" screen, press "CREATE INVOICE" button and wait', async () => {
      console.log('Step 17: Clicking CREATE INVOICE');
      await invoicePage.dismissErrorDialog();
      await invoicePage.clickCreateInvoice();
      console.log('✓ CREATE INVOICE pressed (Invoice Order window opened)');
    });

    await test.step('Steps to reproduce #1 - Step 18: On the "Invoice Order" window, press "CREATE AND VIEW INVOICES" button and wait', async () => {
      console.log('Step 18: Clicking CREATE AND VIEW INVOICES');
      const invoiceCreationMs = await invoicePage.clickCreateAndViewInvoices();
      // The newly opened Invoice loads its own chatter - clear any "Missing Record" / client-error popup.
      await invoicePage.dismissErrorDialogWithRetry();
      console.log(`✓ Invoice created and opened (took ${(invoiceCreationMs / 1000).toFixed(1)}s)`);
    });

    await test.step('Steps to reproduce #1 - Step 19: Remember the Invoice number called Invoice Number #1', async () => {
      console.log('Step 19: Reading the Invoice number (Invoice Number #1)');
      // Before VALIDATE an O12 invoice may still show a draft placeholder; capture what is shown and
      // log it. The authoritative Invoice Number #1 (the posted number the portal shows) is finalised
      // right after VALIDATE in the next step.
      try {
        invoiceNumber1 = await invoicePage.getInvoiceNumber();
      } catch {
        console.log('  ⚠ Could not read the Invoice number yet (likely a draft placeholder before VALIDATE)');
      }
      console.log(`  - Invoice Number #1 (pre-VALIDATE read): "${invoiceNumber1}"`);
    });

    await test.step('Steps to reproduce #1 - Step 19: Press "VALIDATE" button and wait', async () => {
      console.log('Step 19 (cont.): Clicking VALIDATE (posts the Invoice)');
      await invoicePage.dismissErrorDialog();
      await invoicePage.clickValidate();
      // After posting, the invoice number is finalised - re-read it as the authoritative Invoice Number #1.
      const postedNumber = await invoicePage.getInvoiceNumber();
      const status = await invoicePage.getInvoiceStatus().catch(() => '');
      if (postedNumber && postedNumber !== invoiceNumber1) {
        console.log(`  - Invoice number after VALIDATE updated: "${invoiceNumber1}" -> "${postedNumber}"`);
      }
      invoiceNumber1 = postedNumber || invoiceNumber1;
      console.log(`  - Invoice Number #1 (posted): "${invoiceNumber1}" | status: "${status}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.8.1 - Validated Invoice (Invoice Number #1)');
      expect(invoiceNumber1, 'Invoice Number #1 should be assigned after the Invoice is validated/posted').toBeTruthy();
      expect(status, 'The Invoice should be posted/validated (e.g. "Open" or "Posted") after VALIDATE').toMatch(/Open|Posted|Paid/i);
      console.log('✓ Invoice validated; Invoice Number #1 captured');
    });

    // ─── Steps to reproduce #2 (view the invoice as the Reseller) ───────────────

    await test.step('Steps to reproduce #2 - Step 1: Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful', async () => {
      console.log('Step 1: Switching session and logging in as Reseller_1');
      // Deterministically end Thomas's session first (clearing cookies alone is racy), then log in as
      // the Reseller (partner-portal user -> lands on "/my").
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_1.username, users.reseller_1.password);
      await resellerPortalPage.waitForPortalReady();
      console.log(`✓ Logged in as Reseller_1 (${users.reseller_1.displayName})`);
    });

    await test.step('Steps to reproduce #2 - Step 2: After login successful, click at "My invoices" button', async () => {
      console.log('Step 2: Clicking "My invoices"');
      await resellerPortalPage.clickMyInvoices();
      const listed = await resellerPortalPage.getListedInvoiceNumbers();
      console.log(`  - Invoices listed on My Invoices (first page): ${JSON.stringify(listed)}`);
      console.log('✓ My invoices page opened');
    });

    await test.step('Steps to reproduce #2 - Step 3: On "My invoices", select the Invoice with Invoice Number #1 and wait', async () => {
      console.log(`Step 3: Opening the invoice with Invoice Number #1 ("${invoiceNumber1}")`);
      const detailUrl = await resellerPortalPage.openInvoiceByNumber(invoiceNumber1);
      console.log(`✓ Invoice detail opened (URL: ${detailUrl})`);
    });

    await test.step('Verification #1: The Invoice number on top of page = Invoice Number #1', async () => {
      console.log(`Verification #1: confirming the top-of-page Invoice number equals Invoice Number #1 ("${invoiceNumber1}")`);
      const topNumber = await resellerPortalPage.getDetailInvoiceNumber();
      console.log(`  - Invoice number on top of the portal page: "${topNumber}"`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.8.1 - Reseller portal Invoice detail (top-of-page number)');

      expect(
        topNumber,
        `The Invoice number on top of the portal page should equal Invoice Number #1 ("${invoiceNumber1}")`
      ).toContain(invoiceNumber1);
      console.log('✅ Reseller can view the invoice on the portal - the top-of-page number matches Invoice Number #1');
    });
  });
});
