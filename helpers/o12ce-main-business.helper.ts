import { Page, test, expect } from '@playwright/test';
import { OpportunityPage, DealElementPage, QuotationPage, InvoicePage, LicensePage } from '@pages';
import { LoginPageMig, HomePageMig } from '@pages/mig';
import { users, baseUrl_mig } from '@config/users.config';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Shared main-business chain for the O12 CE Migration server (crm-mig.nakivo.site) - section II
 * "Smoked Test Main Business Work On O12CE".
 *
 * It is the O12 CE port of the pre-production chain that every TC.Performance.1.1.x spec repeats:
 *   login -> CRM -> Opp list -> CREATE -> fill Opp -> SAVE -> wait Company/Contact
 *   -> DEAL ELEMENT (Pricelist + Payment Term + product) -> SAVE
 *   -> NEW QUOTATION -> CONFIRM (Sale Order) -> CREATE INVOICE -> CREATE AND VIEW INVOICES -> VALIDATE
 *   -> CREATE LICENSE
 *
 * Differences vs pre-production, all grounded on crm-mig on 2026-08-21:
 *  - Login uses `users.admin_crm_mig` - the only account provisioned on the Migration server.
 *  - Navigation is by URL hash (`HomePageMig`): the Mig sidebar theme hides the navbar and the CRM
 *    sub-menu dropdown that the base HomePage clicks.
 *  - "Lead Form" EXISTS on O12 CE, but behind a DIFFERENT field name: pre-prod renders the Studio
 *    fields `x_studio_lead_sorce` / `x_lead_form`, the Migration server the module field `lead_form`
 *    (char, label "Lead Form", inside the CRM Developer tab of both the lead form view 6270 and the
 *    opportunity form view 6271). `LeadPage` / `OpportunityPage` accept both names, so the step is
 *    entered and asserted like any other scenario value.
 *  - Everything else the chain needs IS present on crm-mig: the "CRM Developer" tab (views
 *    6270/6271), sale.order `is_deal_element` + `pending_approval`/`approved` states, the invoice
 *    CREATE LICENSE view, pricelist "Public Pricelist_USD", payment terms "Immediate Payment" /
 *    "15 Days", and the states "Connecticut (US)" / "CA (US)".
 *
 * Every function emits one `test.step` per manual step (traceability) and ASSERTS its own outcome, so
 * a chain that cannot be built fails at the step that broke instead of in a later verification.
 */

/** Test data shared by the section-II specs - identical values to the pre-prod performance suite. */
export const O12CE_DATA = {
  country: 'United States',
  state: 'Connecticut',
  stateEdited: 'CA (US)',
  pricelist: 'Public Pricelist_USD',
  paymentTerm: 'Immediate Payment',
  paymentTermEdited: '15 Days',
  product: 'NAKIVO Backup',
  forMonitoring: 'sockets',
  supportType: '24/7',
  leadForm: 'License',
} as const;

export interface O12ceOpportunity {
  /** Opportunity name (unique per run). */
  oppName: string;
  /** Contact name entered on the Opp form (Contact_name#1). */
  contactName: string;
  /** Company email entered on the Opp form. */
  email: string;
  /** Saved Opportunity form URL. */
  oppUrl: string;
  /** crm.lead record id parsed from the saved form URL. */
  oppId: string;
  /** Company value after the async partner creation. */
  companyValue: string;
  /** Contact value after the async partner creation. */
  contactValue: string;
  /** "Lead Form" value read back from the saved record (CRM Developer tab). */
  leadForm: string;
}

/** Step 1 - log in to the O12 CE Migration server as Admin. */
export async function loginToO12CE(page: Page): Promise<void> {
  await test.step('Step 1: Use the account of Admin to login successful (O12 CE Migration server)', async () => {
    const loginPage = new LoginPageMig(page);
    console.log('\n--- Step 1: Login to the O12 CE Migration server ---');
    console.log(`  Target  : ${baseUrl_mig}`);
    console.log(`  Account : ${users.admin_crm_mig.username}`);
    await loginPage.navigateTo(baseUrl_mig);
    await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
    console.log('  OK - logged in on the O12 CE Migration server');
  });
}

/** Step 2 - open CRM and land on the Opportunities LIST view (pre-prod: "click at view list"). */
export async function openOpportunitiesListOnO12CE(page: Page): Promise<void> {
  await test.step('Step 2: After login successful, open "CRM" and switch to the Opportunities list view', async () => {
    const homePage = new HomePageMig(page);
    console.log('\n--- Step 2: Open CRM > Pipeline (list view) ---');
    await homePage.navigateToOpportunitiesList();
    console.log('  OK - Opportunities list view opened');
  });
}

/**
 * Steps 3-7 - create one Opportunity with the pre-prod test data and wait for the async
 * Company/Contact creation. Asserts the record was saved and both partner fields are populated
 * (required before the Deal Element opens - an empty End User blocks its save).
 */
export async function createOpportunityOnO12CE(page: Page, tcId: string): Promise<O12ceOpportunity> {
  const opportunityPage = new OpportunityPage(page);
  const result: O12ceOpportunity = {
    oppName: '', contactName: '', email: '', oppUrl: '', oppId: '',
    companyValue: '', contactValue: '', leadForm: '',
  };

  await test.step('Step 3: On the "Opp" page, click at "CREATE" button', async () => {
    console.log('\n--- Step 3: Click CREATE ---');
    await opportunityPage.clickCreate();
    console.log('  OK - Opportunity creation form opened');
  });

  await test.step('Step 4: Enter the opportunity information', async () => {
    result.oppName = opportunityPage.generateOpportunityName(`TEST ${tcId} `);
    result.contactName = opportunityPage.generateOpportunityName(`TEST ${tcId} `);
    result.email = opportunityPage.generateEmail('Test@company');
    console.log('\n--- Step 4: Enter the opportunity information ---');
    console.log(`  Opp name     : ${result.oppName}`);
    console.log(`  Contact name : ${result.contactName}`);
    console.log(`  Email        : ${result.email}`);
    console.log(`  Country      : ${O12CE_DATA.country}`);
    console.log(`  State        : ${O12CE_DATA.state}`);

    await opportunityPage.fillOpportunityName(result.oppName);
    const contactFilled = await opportunityPage.fillContactName(result.contactName);
    console.log(`  Contact name field filled : ${contactFilled}`);
    await opportunityPage.fillEmail(result.email);
    await opportunityPage.selectCountry(O12CE_DATA.country);
    await opportunityPage.selectState(O12CE_DATA.state);
    const teamCleared = await opportunityPage.clearSalesTeam();
    console.log(`  Sales Team cleared        : ${teamCleared}`);
    const salespersonCleared = await opportunityPage.clearSalesperson();
    console.log(`  Salesperson cleared       : ${salespersonCleared}`);
    const createdManuallyUnchecked = await opportunityPage.uncheckCreatedManually();
    console.log(`  "Create manually" FALSE   : ${createdManuallyUnchecked}`);
  });

  await test.step('Step 5: Click at "CRM Developer" tab at the bottom of page (Lead form = License)', async () => {
    console.log('\n--- Step 5: CRM Developer tab ---');
    await opportunityPage.clickCRMDeveloperTab();
    const leadFormFilled = await opportunityPage.fillLeadForm(O12CE_DATA.leadForm);
    console.log(`  Lead Form : ${O12CE_DATA.leadForm} (field found and filled: ${leadFormFilled})`);
    expect(
      leadFormFilled,
      'the "Lead Form" field must be present in the CRM Developer tab on O12 CE (module field `lead_form`) so the scenario data can be entered'
    ).toBeTruthy();
  });

  await test.step('Step 6: Press "SAVE" button', async () => {
    console.log('\n--- Step 6: Save the Opportunity ---');
    await opportunityPage.saveAndWaitForCompletion();
    result.oppUrl = page.url();
    result.oppId = await opportunityPage.waitForIdInUrlAndExtract(CommonUtils.waitTimes.savingPage);
    console.log(`  Opp URL : ${result.oppUrl}`);
    console.log(`  Opp id  : ${result.oppId}`);
    expect(
      Number(result.oppId),
      'the Opportunity must be saved on O12 CE (a record id appears in the form URL)'
    ).toBeGreaterThan(0);
  });

  await test.step('Step 7: Refresh page to see the "Contact" field is entered', async () => {
    console.log('\n--- Step 7: Wait for the async Company/Contact creation ---');
    const { populated, companyValue, contactValue } = await opportunityPage.waitForCompanyAndContactPopulated();
    result.companyValue = companyValue;
    result.contactValue = contactValue;
    result.leadForm = await opportunityPage.getLeadFormValue().catch(() => '');
    console.log(`  Company   : "${companyValue}"`);
    console.log(`  Contact   : "${contactValue}"`);
    console.log(`  Lead Form : "${result.leadForm}" (read back from the saved record)`);
    expect(
      populated,
      'the async Company/Contact partner creation must complete on O12 CE before the Deal Element is opened (an empty End User blocks the Deal Element save)'
    ).toBeTruthy();
  });

  return result;
}

/**
 * Steps 8-11 - open the Deal Element from the Opportunity, set Pricelist + Payment Term, add one
 * product line and save it. Asserts the Deal Element form saved (Edit button back = readonly form).
 */
export async function addDealElementOnO12CE(
  page: Page,
  opts: { productQty?: number; paymentTerm?: string } = {}
): Promise<{ productName: string; paymentTerm: string }> {
  const opportunityPage = new OpportunityPage(page);
  const dealElementPage = new DealElementPage(page);
  const paymentTerm = opts.paymentTerm ?? O12CE_DATA.paymentTerm;
  let productName = '';

  await test.step('Step 8: Create "DEAL ELEMENT" - press the "DEAL ELEMENT" button', async () => {
    console.log('\n--- Step 8: Open the Deal Element ---');
    await opportunityPage.clickDealElement();
    await dealElementPage.waitForFormOpen();
    console.log('  OK - Deal Element (sale.order) form opened');
  });

  await test.step('Step 9: On the "Deal Element" screen - select Pricelist and Payment Term', async () => {
    console.log('\n--- Step 9: Pricelist + Payment Term ---');
    await dealElementPage.waitForAutoPopulate();
    const pricelistSet = await dealElementPage.selectPricelist(O12CE_DATA.pricelist);
    console.log(`  Pricelist    : ${O12CE_DATA.pricelist} (set=${pricelistSet})`);
    const paymentTermSet = await dealElementPage.selectPaymentTerm(paymentTerm);
    console.log(`  Payment Term : ${paymentTerm} (set=${paymentTermSet})`);
    expect(
      pricelistSet,
      `the Pricelist "${O12CE_DATA.pricelist}" must be selectable on the O12 CE Deal Element`
    ).toBeTruthy();
    expect(
      paymentTermSet,
      `the Payment Term "${paymentTerm}" must be selectable on the O12 CE Deal Element`
    ).toBeTruthy();
  });

  await test.step('Step 10: At "Order Lines" section - add a product and set the Ordered Qty', async () => {
    console.log('\n--- Step 10: Order Lines ---');
    const added = await dealElementPage.addProduct(O12CE_DATA.product);
    expect(
      added,
      `a product line ("${O12CE_DATA.product}") must be addable on the O12 CE Deal Element`
    ).toBeTruthy();
    if (opts.productQty && opts.productQty !== 1) {
      await dealElementPage.setProductQuantity(opts.productQty, CommonUtils.waitTimes.long);
      console.log(`  Ordered Qty  : ${opts.productQty}`);
    }
    productName = await dealElementPage.getFirstProductName();
    console.log(`  Product line : "${productName}"`);
  });

  await test.step('Step 11: Finally, press "SAVE" button on the top page and wait', async () => {
    console.log('\n--- Step 11: Save the Deal Element ---');
    await dealElementPage.save(CommonUtils.waitTimes.savingPage);
    await dealElementPage.waitForEditButton(CommonUtils.waitTimes.savingPage);
    console.log('  OK - Deal Element saved (form back in readonly mode)');
  });

  return { productName, paymentTerm };
}

export interface O12ceQuotationResult {
  /** Elapsed time (ms) of the NEW QUOTATION operation - recorded, not asserted. */
  elapsedMs: number;
  /** True when the action navigated to the created Quotation form (the pre-prod behaviour). */
  navigated: boolean;
  /** True when the Deal Element chatter logged the creation instead of navigating. */
  chatterFound: boolean;
  /** Chatter text read when the action did not navigate ("" otherwise). */
  chatterText: string;
  /** sale.order record id the form switched to ('' when it did not switch). */
  quotationId: string;
}

/**
 * Press "NEW QUOTATION" on the saved Deal Element and resolve the outcome.
 *
 * Two behaviours have been observed on pre-production for this button: it either navigates to the
 * newly created Quotation (the performance-suite behaviour) or creates the Sale Order in place and
 * logs it in the Deal Element chatter (TC.-A.5.1). Both count as "the Quotation was created"; the
 * caller gets `navigated` so a chained spec can report which variant O12 CE took.
 *
 * "Navigated" is decided by the form's RECORD ID changing, not by the URL model: a Deal Element is
 * itself a `sale.order`, so a model-only URL wait would match before anything happened.
 */
export async function pressNewQuotationOnO12CE(page: Page): Promise<O12ceQuotationResult> {
  const opportunityPage = new OpportunityPage(page);
  const dealElementPage = new DealElementPage(page);
  const quotationPage = new QuotationPage(page);
  const outcome: O12ceQuotationResult = {
    elapsedMs: 0, navigated: false, chatterFound: false, chatterText: '', quotationId: '',
  };

  const hasButton = await opportunityPage.hasNewQuotationButton();
  expect(
    hasButton,
    'the "NEW QUOTATION" button must be available after the O12 CE Deal Element is saved'
  ).toBeTruthy();

  // The Deal Element is itself a sale.order, so a "model=sale.order" URL wait would match instantly
  // and report a navigation that never happened. Detect the switch by the record id changing instead.
  const dealElementId = quotationPage.getRecordIdFromUrl();
  const start = Date.now();
  await opportunityPage.clickNewQuotation();
  const quotationId = await quotationPage.waitForRecordIdChange(dealElementId, CommonUtils.waitTimes.savingPage);
  outcome.navigated = quotationId !== '' && quotationId !== dealElementId;
  outcome.quotationId = quotationId;
  console.log(`  Deal Element record id : ${dealElementId || '(none)'}`);
  console.log(`  Record id after click  : ${quotationId || '(unchanged)'}`);

  if (outcome.navigated) {
    await quotationPage.waitForFormView(CommonUtils.waitTimes.savingPage);
    await quotationPage.waitForEditButton(CommonUtils.waitTimes.savingPage);
  } else {
    const chatter = await dealElementPage.waitForQuotationCreatedInChatter(CommonUtils.waitTimes.savingPage);
    outcome.chatterFound = chatter.found;
    outcome.chatterText = chatter.chatterText;
  }
  outcome.elapsedMs = Date.now() - start;

  console.log(`  NEW QUOTATION elapsed : ${(outcome.elapsedMs / 1000).toFixed(2)}s`);
  console.log(`  Navigated to the Quotation form : ${outcome.navigated}`);
  console.log(`  Creation logged in the Deal Element chatter : ${outcome.chatterFound}`);
  return outcome;
}

/** Press "CONFIRM" on the Quotation and read back the resulting Sale Order status/number. */
export async function confirmQuotationOnO12CE(page: Page): Promise<{ status: string; orderNumber: string }> {
  const quotationPage = new QuotationPage(page);
  let status = '';
  let orderNumber = '';
  await test.step('Press "CONFIRM" button and wait to create a Sales Order', async () => {
    console.log('\n--- Press CONFIRM (Quotation -> Sale Order) ---');
    await quotationPage.clickConfirm(CommonUtils.waitTimes.savingPage);

    // clickConfirm() returns as soon as the click lands, so the statusbar still reads "Quotation"
    // for a moment while the server writes state=sale. Poll until it flips instead of reading once
    // (a single read came back "Quotation" 330ms after the click, while the record was already
    // state=sale server-side). Bounded, so a quotation that genuinely never confirms still fails.
    const confirmDeadline = Date.now() + CommonUtils.waitTimes.reAssignationWait;
    do {
      status = await quotationPage.getQuotationStatus();
      if (/sale|order/i.test(status)) break;
      await page.waitForTimeout(CommonUtils.waitTimes.long);
    } while (Date.now() < confirmDeadline);

    orderNumber = await quotationPage.getSalesOrderNumber(CommonUtils.waitTimes.abnormalWait).catch(() => '');
    console.log(`  Quotation status after CONFIRM : "${status}"`);
    console.log(`  Sale Order number              : "${orderNumber}"`);
  });
  return { status, orderNumber };
}

/**
 * "CREATE INVOICE" -> "CREATE AND VIEW INVOICES" on the confirmed Sale Order.
 * Returns the elapsed time of the CREATE AND VIEW INVOICES action plus the invoice facts.
 */
export async function createInvoiceOnO12CE(
  page: Page
): Promise<{ elapsedMs: number; invoiceNumber: string; status: string; invoiceUrl: string }> {
  const invoicePage = new InvoicePage(page);
  let elapsedMs = 0;
  let invoiceNumber = '';
  let status = '';
  let invoiceUrl = '';

  await test.step('On the "Sales Order" screen, press "CREATE INVOICE" button and wait', async () => {
    console.log('\n--- Press CREATE INVOICE ---');
    await invoicePage.clickCreateInvoice(CommonUtils.waitTimes.savingPage);
    console.log('  OK - the "Invoice Order" wizard is open');
  });

  await test.step('On the "Invoice Order" window, press "CREATE AND VIEW INVOICES" button', async () => {
    console.log('\n--- Press CREATE AND VIEW INVOICES ---');
    elapsedMs = await invoicePage.clickCreateAndViewInvoices();
    invoiceUrl = page.url();
    invoiceNumber = await invoicePage.getInvoiceNumber(CommonUtils.waitTimes.abnormalWait).catch(() => '');
    status = await invoicePage.getInvoiceStatus(CommonUtils.waitTimes.abnormalWait).catch(() => '');
    console.log(`  Elapsed        : ${(elapsedMs / 1000).toFixed(2)}s`);
    console.log(`  Invoice URL    : ${invoiceUrl}`);
    console.log(`  Invoice number : "${invoiceNumber}"`);
    console.log(`  Invoice status : "${status}"`);
  });

  return { elapsedMs, invoiceNumber, status, invoiceUrl };
}

/**
 * Press "CREATE LICENSE" on the validated invoice, wait for the License form and select the
 * "for monitoring" mode ("sockets"). The caller presses SAVE, so the save can be measured/asserted
 * by the TC that owns it.
 */
export async function openLicenseFromInvoiceOnO12CE(page: Page): Promise<{ licenseUrl: string }> {
  const invoicePage = new InvoicePage(page);
  const licensePage = new LicensePage(page);
  let licenseUrl = '';

  await test.step('Press "CREATE LICENSE" button and wait', async () => {
    console.log('\n--- Press CREATE LICENSE ---');
    await invoicePage.clickCreateLicense(CommonUtils.waitTimes.savingPage);
    await licensePage.waitForPageLoad(CommonUtils.waitTimes.savingPage);
    licenseUrl = page.url();
    console.log(`  License form URL : ${licenseUrl}`);
  });

  await test.step(`Once the "License" screen appears, select "${O12CE_DATA.forMonitoring}" in the "for monitoring" dropdown`, async () => {
    console.log('\n--- Select the "for monitoring" mode ---');
    await licensePage.selectForMonitoring(O12CE_DATA.forMonitoring, CommonUtils.waitTimes.savingPage);
    console.log(`  for monitoring : ${O12CE_DATA.forMonitoring}`);
  });

  return { licenseUrl };
}

/** Press "VALIDATE" on the draft invoice and return the posted status/number. */
export async function validateInvoiceOnO12CE(page: Page): Promise<{ status: string; invoiceNumber: string }> {
  const invoicePage = new InvoicePage(page);
  let status = '';
  let invoiceNumber = '';
  await test.step('Press "VALIDATE" button and wait', async () => {
    console.log('\n--- Press VALIDATE ---');
    await invoicePage.clickValidate(CommonUtils.waitTimes.savingPage);
    status = await invoicePage
      .waitForInvoiceStatus('Open')
      .catch(async () => await invoicePage.getInvoiceStatus(CommonUtils.waitTimes.abnormalWait));
    invoiceNumber = await invoicePage.getInvoiceNumber(CommonUtils.waitTimes.abnormalWait).catch(() => '');
    console.log(`  Invoice status after VALIDATE : "${status}"`);
    console.log(`  Invoice number               : "${invoiceNumber}"`);
  });
  return { status, invoiceNumber };
}
