import { test, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, OpportunityPage, DealElementPage, QuotationPage, InvoicePage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote, DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * ===========================================================================
 *  UC-B-1  -  Reseller views invoices with multiple products
 * ===========================================================================
 *  Test Case ID    : TC.-B.1.1
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-24
 *
 *  Summary:
 *    As Thomas, create a deal-registration Opportunity, build a Deal Element with 4 DIFFERENT
 *    products sized into the approval band, get the Quotation approved by Max, confirm it, and post a
 *    multi-product Invoice; then as the Reseller open the invoice on the portal and verify the
 *    PAY NOW button, the total, and each product line (quantity + total).
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.1\.1:" --project=chromium
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
 *  Pre-condition #2  (prepare the multi-product Invoice as Thomas, then approved by Max):
 *     1-9. Login as Thomas; CRM > view list > CREATE; enter the Opportunity details, then SAVE and
 *          refresh until Company + Contact populate:
 *          - Opp name                 = ...
 *          - Contact                  = ...
 *          - Company                  = ...
 *          - Email                    = ...
 *          - Country                  = United States
 *          - State                    = Maryland
 *          - IP                       = ...
 *          - Create manually checkbox = FALSE
 *          - Sales Team               = cleared
 *          - Salesperson              = cleared
 *          - CRM Developer Lead form  = NAKIVO deal registration*
 *          - Assigned Partner         = TEST-Reseller#Automation-Jun10
 *          - Internal Note            = Internal Note #1
 *    10. On Opp #1, click "Deal Element" to create a new Deal Element
 *    11. On the Deal Element, set Payment terms = Immediate Payment
 *    12. In Order Lines, add 4 DIFFERENT products (Product#1..#4), each on its own line
 *    13. Read the unit price of each line (UnitPrice#1..#4); keep Quantity = 1 on Product#2/#3/#4
 *    14. Compute Qty#1 so the deal total lands in the approval band (target mid-band 17,500 USD)
 *    15. Set Product#1 line Quantity = Qty#1
 *    16. [GUARD] Verify the Deal Element total is > 15,000 USD AND < 20,000 USD (adjust Qty#1 +/-1 if outside)
 *    17. Click "New Quotation" to create a new Quotation from this deal
 *    18. Wait until the quotation is created completely
 *    19. Click "To Approve"
 *    20. Copy the URL
 *    21. Open another browser and login as Max
 *    22. Paste the URL to open the Quotation
 *    23. As Max, press "APPROVE"
 *    24. Back to Thomas session, refresh the quotation and click "Confirm"
 *    25. Wait for the "Create Invoice" button, then click it
 *    26. In the Invoice Order popup, select the first option "Invoiceable lines"
 *    27. Click "Create and view invoices"
 *    28. Wait until the invoice is created, then click "Validate"
 *    29. Note: Invoice#1 (number), InvoiceTotal#1 (total), ProductTotal#1..#4, ProductQty#1
 *
 *  Steps to reproduce  (view the invoice as the Reseller):
 *     1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *     2. Click "My Invoices"
 *     3. Input Invoice#1 to the search textbox
 *     4. Click Invoice#1 in the result list
 *
 *  Verification Point:
 *     1. Invoice#1 shows in the title of the invoice screen
 *     2. Left side: there is a "PAY NOW" button; the left-side Total = InvoiceTotal#1
 *     3. Right side: Product#1 with Quantity = ProductQty#1 and total = ProductTotal#1;
 *        Product#2 total = ProductTotal#2; Product#3 total = ProductTotal#3; Product#4 total = ProductTotal#4
 * ===========================================================================
 *
 *  IMPLEMENTATION NOTES
 *  - This test creates a financial chain (Opportunity -> Deal Element -> Quotation -> approved
 *    Sales Order -> VALIDATED multi-product Invoice). A validated/posted Invoice cannot be cleanly
 *    deleted, so per the O12 convention cleanup is SKIPPED by default (the records are retained).
 *  - Reseller orders carry an AUTOMATIC ~15% Partner Discount: the line "Subtotal" (Unit Price x Qty)
 *    is GROSS, while the deal/invoice TOTAL is NET (= gross x 0.85). So:
 *      * Qty#1 is computed from each line's EFFECTIVE (post-discount) per-unit value so the NET deal
 *        total lands at the mid-band target (17,500 USD); the raw list Unit Price is also read+logged
 *        per the manual step.
 *      * ProductTotal#N (captured from the invoice line + verified on the portal) is the GROSS line
 *        amount; InvoiceTotal#1 (captured from the invoice total + verified on the portal left side)
 *        is the NET total. They legitimately differ by the Partner Discount.
 */

const SKIP_CLEANUP_OPP = true; // validated Invoice cannot be cleanly deleted -> retain (O12 convention; see TC.-A.8.1)

// 4 DIFFERENT products in Public Pricelist_USD. Product#1 (qty-variable) is the priciest of the four
// so Qty#1 stays a sensible integer; #2/#3/#4 keep Quantity = 1.
const PRODUCTS = ['[A2151B]', '[A2149B]', '[A2150B]', '[A2146B]'];
const BAND_MIN = 15000;
const BAND_MAX = 20000;
const BAND_TARGET = 17500;

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
// Parse the leading numeric quantity (e.g. "72 Socket" / "72.00 Socket" -> 72), tolerant of a UoM suffix.
const qtyNum = (s: string | undefined | null): number => {
  const m = (s || '').replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m ? Math.round(parseFloat(m[0])) : 0;
};

test.describe('TC.-B.1.1 - Reseller views invoices with multiple products', () => {
  let createdOppUrl: string | null = null;
  let managerContext: BrowserContext | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const op = new OpportunityPage(page);
      await op.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    if (managerContext) {
      await managerContext.close().catch(() => {});
      managerContext = null;
    }
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('TC.-B.1.1: Verify Reseller submits a new product registration successful', async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2); // long financial chain + manager approval (second browser)
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const invoicePage = new InvoicePage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    // ── Pre-condition #1: build the deal-registration Internal Note with fresh dynamic values ──
    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.1.1 ${compactDateTime}`;

    // Captured facts (Pre-condition #2, step 29) used by the Reseller verification.
    let invoiceNumber1 = '';                 // Invoice#1
    let invoiceTotal1 = '';                  // InvoiceTotal#1 (NET total)
    let quotationUrl = '';                   // Quotation URL (for Max approval)
    const productQty: Record<string, number> = {};   // ProductQty#N (per code)
    const productTotal: Record<string, number> = {}; // ProductTotal#N (per code, GROSS line amount)

    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1', async () => {
      console.log('Pre-condition #1: Internal Note #1 prepared with dynamic values');
      console.log(`  - Opportunity name: ${oppName}`);
      console.log(`  - Contact name: ${leadName} | Company email: ${companyEmail}`);
      console.log(`  - Assigned Partner: ${DEAL_REGISTRATION.partnerCompanyName}`);
    });

    // ── Pre-condition #2 - Steps 1-9: create the deal-registration Opportunity as Thomas ──
    await test.step('Pre-condition #2 - Steps 1-9: Login as Thomas; CRM > view list > CREATE; enter Opp/Contact/Company/Email, Country = United States, State = Maryland, IP (Create manually = FALSE, Sales Team + Salesperson cleared); CRM Developer Lead form; Assigned Partner; Internal Note #1; SAVE; refresh until Company + Contact populate', async () => {
      createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
        oppName,
        contactName: leadName,
        companyEmail,
        internalNote,
        stepPrefix: 'Create deal-registration Opportunity',
      });
      // Step 9: refresh until the Company + Contact fields populate (async Contact creation).
      const { contactFieldFound, contactValue } = await opportunityPage.waitForContactFieldEquals(leadName);
      console.log(`  - Contact field value: "${contactValue}"`);
      expect(contactFieldFound, 'Step 9: Company + Contact should populate in Opp #1').toBeTruthy();
    });

    await test.step('Pre-condition #2 - Step 10: On Opp #1, click "Deal Element" to create a new Deal Element', async () => {
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      await dealElementPage.dismissErrorDialogWithRetry();
      await dealElementPage.waitForAutoPopulate();
      console.log('✓ Deal Element form opened');
    });

    await test.step('Pre-condition #2 - Step 11: On the Deal Element, set Payment terms = Immediate Payment', async () => {
      // The Deal Element auto-populates Pricelist = Public Pricelist_USD; ensure it (prices depend on it).
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      console.log('✓ Payment terms = Immediate Payment (Pricelist = Public Pricelist_USD)');
    });

    await test.step('Pre-condition #2 - Step 12: In Order Lines, add 4 DIFFERENT products (each on its own line)', async () => {
      for (const code of PRODUCTS) {
        await dealElementPage.dismissErrorDialog();
        await dealElementPage.addProductLine(code, 1); // Quantity defaults to 1 on every line
        await page.waitForTimeout(CommonUtils.waitTimes.long);
      }
      // Commit all rows (the last-added row is still in edit mode) so the readonly cells render for reading.
      await dealElementPage.save(CommonUtils.waitTimes.savingPage);
      console.log(`✓ Added 4 products: ${PRODUCTS.join(', ')}`);
    });

    // Per-line raw list Unit Price (step 13) and EFFECTIVE per-unit value (post Partner Discount).
    const unitPrice: Record<string, number> = {};
    const effUnit: Record<string, number> = {};

    await test.step('Pre-condition #2 - Step 13: Read the unit price of each line (keep Quantity = 1 on Product#2/#3/#4)', async () => {
      for (const code of PRODUCTS) {
        unitPrice[code] = await dealElementPage.getUnitPriceForProduct(code);
        effUnit[code] = await dealElementPage.getSubtotalAfterAllDiscountsForProduct(code); // net value at Qty 1
        console.log(`  - ${code}: UnitPrice (list) = ${unitPrice[code]} | effective per-unit (net) = ${effUnit[code]}`);
      }
      for (const code of PRODUCTS) {
        expect(unitPrice[code], `Unit price for ${code} should be > 0`).toBeGreaterThan(0);
        expect(effUnit[code], `Effective per-unit for ${code} should be > 0`).toBeGreaterThan(0);
      }
    });

    let qty1 = 1;
    const p1 = PRODUCTS[0]; // Product#1 (the quantity-variable line)

    await test.step('Pre-condition #2 - Step 14: Compute Qty#1 so the deal total lands in the approval band (target mid-band 17,500 USD)', async () => {
      // Qty#1 = round( (target - (UnitPrice#2 + UnitPrice#3 + UnitPrice#4)) / UnitPrice#1 ).
      // Computed on the EFFECTIVE (post Partner-Discount) per-unit values so the NET deal total - the
      // amount actually shown as the Deal Element total - lands at the mid-band target.
      const othersEff = PRODUCTS.slice(1).reduce((sum, c) => sum + effUnit[c], 0);
      qty1 = Math.max(1, Math.round((BAND_TARGET - othersEff) / effUnit[p1]));
      console.log(`  - Product#1 = ${p1} | sum(eff #2..#4) = ${othersEff.toFixed(2)} | Qty#1 = ${qty1}`);
      expect(qty1, 'Qty#1 should be a positive integer').toBeGreaterThan(0);
    });

    // Set Product#1's quantity from a readonly state, then SAVE so the computed totals render reliably.
    // (In edit mode the active row's computed cells read 0 and its product cell is an <input> not a
    // <span>, so we always edit -> change -> save -> read in readonly.)
    const setProduct1Qty = async (q: number): Promise<void> => {
      await dealElementPage.clickEdit();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      await dealElementPage.changeQtyInRow(p1, q);
      await dealElementPage.save(CommonUtils.waitTimes.savingPage);
    };
    const readNetTotal = async (): Promise<number> => {
      let total = 0;
      for (const code of PRODUCTS) total += await dealElementPage.getSubtotalAfterAllDiscountsForProduct(code);
      return total;
    };

    await test.step('Pre-condition #2 - Step 15: Set Product#1 line Quantity = Qty#1', async () => {
      await setProduct1Qty(qty1);
      console.log(`✓ Product#1 (${p1}) Quantity set to ${qty1} (deal saved)`);
    });

    await test.step('Pre-condition #2 - Step 16: [GUARD] Verify the Deal Element total is > 15,000 USD AND < 20,000 USD', async () => {
      let netTotal = await readNetTotal(); // read in readonly (deal saved in step 15) -> reliable
      console.log(`  - Deal Element net total: ${netTotal.toFixed(2)} (Qty#1 = ${qty1})`);
      // Adjust Qty#1 by +/-1 until the (net) deal total is inside the band (rare - initial Qty#1 targets mid-band).
      for (let i = 0; i < 12 && (netTotal < BAND_MIN || netTotal > BAND_MAX); i++) {
        if (netTotal < BAND_MIN) qty1 += 1;
        else if (qty1 > 1) qty1 -= 1;
        else break;
        await setProduct1Qty(qty1);
        netTotal = await readNetTotal();
        console.log(`  - Guard adjust #${i + 1}: Qty#1 = ${qty1} -> net total ${netTotal.toFixed(2)}`);
      }
      const grossTotal = PRODUCTS.reduce((sum, c) => sum + unitPrice[c] * (c === p1 ? qty1 : 1), 0);
      console.log(`  - Final Deal Element total: net ${netTotal.toFixed(2)} | gross ${grossTotal.toFixed(2)} | Qty#1 = ${qty1}`);
      expect(netTotal, 'Deal Element total should be > 15,000 USD').toBeGreaterThan(BAND_MIN);
      expect(netTotal, 'Deal Element total should be < 20,000 USD').toBeLessThan(BAND_MAX);
      console.log('✓ Deal Element total inside the approval band (deal saved)');
    });

    await test.step('Pre-condition #2 - Step 17: Click "New Quotation" to create a new Quotation from this deal', async () => {
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      console.log('✓ NEW QUOTATION pressed');
    });

    await test.step('Pre-condition #2 - Step 18: Wait until the quotation is created completely', async () => {
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await quotationPage.dismissErrorDialogWithRetry();
      console.log('✓ Quotation created');
    });

    await test.step('Pre-condition #2 - Step 19: Click "To Approve"', async () => {
      await quotationPage.clickToApprove(CommonUtils.waitTimes.savingDealElement);
      console.log('✓ TO APPROVE pressed (approval requested)');
    });

    await test.step('Pre-condition #2 - Step 20: Copy the URL', async () => {
      quotationUrl = page.url();
      console.log(`  - Quotation URL: ${quotationUrl}`);
      expect(quotationUrl, 'A Quotation URL should be captured after TO APPROVE').toContain('model=sale.order');
    });

    let managerPage: Page;
    await test.step('Pre-condition #2 - Step 21: Open another browser and login as Max', async () => {
      managerContext = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        ...(process.env.CI ? {} : { recordVideo: { dir: 'test-results', size: { width: 1920, height: 1080 } } }),
      });
      managerPage = await managerContext.newPage();
      const managerLogin = new LoginPage(managerPage);
      await managerLogin.navigateTo(baseUrl);
      await managerLogin.login(users.manager_max.username, users.manager_max.password);
      console.log(`✓ Logged in as Max (${users.manager_max.displayName}) in a second browser`);
    });

    await test.step('Pre-condition #2 - Step 22: Paste the URL to open the Quotation', async () => {
      const managerQuotation = new QuotationPage(managerPage);
      await managerPage.goto(quotationUrl);
      await managerQuotation.dismissErrorDialogWithRetry();
      await managerQuotation.waitForFormView(CommonUtils.waitTimes.pageLoad);
      console.log('✓ Quotation opened in Max\'s browser');
    });

    await test.step('Pre-condition #2 - Step 23: As Max, press "APPROVE"', async () => {
      const managerQuotation = new QuotationPage(managerPage);
      const approveMs = await managerQuotation.clickApprove();
      await managerQuotation.dismissErrorDialogWithRetry();
      await managerPage.reload({ waitUntil: 'domcontentloaded' });
      await managerQuotation.dismissErrorDialogWithRetry();
      await managerQuotation.waitForFormView(CommonUtils.waitTimes.pageLoad);
      const result = await managerQuotation.verifyApprovalSuccess();
      await CommonUtils.captureAndAttachScreenshot(managerPage, testInfo, 'TC.-B.1.1 - Quotation approved by Max');
      expect(result.approved, 'Max should approve the Quotation (post-approval action available)').toBeTruthy();
      console.log(`✓ APPROVE pressed by Max (took ${(approveMs / 1000).toFixed(1)}s)`);
    });

    await test.step('Pre-condition #2 - Step 24: Back to Thomas session, refresh the quotation and click "Confirm"', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await quotationPage.dismissErrorDialogWithRetry();
      await quotationPage.waitForFormView(CommonUtils.waitTimes.pageLoad);
      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.dismissErrorDialogWithRetry();
      await quotationPage.waitForConfirmButtonToDisappear(CommonUtils.waitTimes.abnormalWait).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Quotation confirmed to a Sales Order');
    });

    await test.step('Pre-condition #2 - Step 25: Wait for the "Create Invoice" button, then click it', async () => {
      await invoicePage.dismissErrorDialog();
      await invoicePage.clickCreateInvoice(CommonUtils.waitTimes.abnormalWait);
      console.log('✓ CREATE INVOICE pressed (Invoice Order popup opened)');
    });

    await test.step('Pre-condition #2 - Step 26: In the Invoice Order popup, select the first option "Invoiceable lines"', async () => {
      await invoicePage.selectInvoiceableLines();
    });

    await test.step('Pre-condition #2 - Step 27: Click "Create and view invoices"', async () => {
      const ms = await invoicePage.clickCreateAndViewInvoices();
      await invoicePage.dismissErrorDialogWithRetry();
      console.log(`✓ Invoice created and opened (took ${(ms / 1000).toFixed(1)}s)`);
    });

    await test.step('Pre-condition #2 - Step 28: Wait until the invoice is created, then click "Validate"', async () => {
      // The freshly-opened invoice can raise a delayed "Missing Record" popup that intercepts VALIDATE;
      // clickValidateAndWaitPosted dismisses popups, polls the status, and re-clicks VALIDATE if needed.
      const status = await invoicePage.clickValidateAndWaitPosted();
      console.log(`  - Invoice status after VALIDATE: "${status}"`);
      expect(status, 'The Invoice should be posted/validated (Open/Posted/Paid) after VALIDATE').toMatch(/Open|Posted|Paid/i);
      console.log('✓ Invoice validated');
    });

    await test.step('Pre-condition #2 - Step 29: Note Invoice#1, InvoiceTotal#1, ProductTotal#1..#4, ProductQty#1', async () => {
      invoiceNumber1 = await invoicePage.getInvoiceNumber();
      invoiceTotal1 = await invoicePage.getInvoiceTotal();
      for (const code of PRODUCTS) {
        const line = await invoicePage.getInvoiceLineData(code);
        productQty[code] = qtyNum(line.quantity);
        productTotal[code] = money(line.subtotal);
      }
      console.log(`  - Invoice#1 = "${invoiceNumber1}" | InvoiceTotal#1 (net) = "${invoiceTotal1}"`);
      for (const code of PRODUCTS) {
        console.log(`  - ${code}: ProductQty = ${productQty[code]} | ProductTotal (gross) = ${productTotal[code]}`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.1.1 - Validated multi-product Invoice (Invoice#1)');
      expect(invoiceNumber1, 'Invoice#1 should be assigned after VALIDATE').toBeTruthy();
      expect(money(invoiceTotal1), 'InvoiceTotal#1 should be a positive number').toBeGreaterThan(0);
      expect(productQty[p1], 'ProductQty#1 should equal the computed Qty#1').toBe(qty1);
      for (const code of PRODUCTS) {
        expect(productTotal[code], `ProductTotal for ${code} should be > 0`).toBeGreaterThan(0);
      }
    });

    // ─── Steps to reproduce (view the invoice as the Reseller) ──────────────────

    await test.step('Steps to reproduce - Step 1: Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await resellerPortalPage.waitForPortalReady();
      console.log(`✓ Logged in as Reseller_1 (${users.reseller_bronze.displayName})`);
    });

    await test.step('Steps to reproduce - Step 2: Click "My Invoices"', async () => {
      await resellerPortalPage.clickMyInvoices();
      console.log('✓ My Invoices page opened');
    });

    await test.step('Steps to reproduce - Step 3: Input Invoice#1 to the search textbox', async () => {
      await resellerPortalPage.searchInvoices(invoiceNumber1);
      console.log(`✓ Searched My Invoices for "${invoiceNumber1}"`);
    });

    await test.step('Steps to reproduce - Step 4: Click Invoice#1 in the result list', async () => {
      const detailUrl = await resellerPortalPage.openInvoiceByNumber(invoiceNumber1);
      await resellerPortalPage.waitForDetailLineTable();
      console.log(`✓ Invoice detail opened (URL: ${detailUrl})`);
    });

    // ─── Verification Points ────────────────────────────────────────────────────

    await test.step('Verification Point 1: Invoice#1 shows in the title of the invoice screen', async () => {
      const topNumber = await resellerPortalPage.getDetailInvoiceNumber();
      console.log(`  - Invoice number on top of the portal page: "${topNumber}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.1.1 - Reseller portal invoice detail');
      expect(topNumber, `The invoice title should contain Invoice#1 ("${invoiceNumber1}")`).toContain(invoiceNumber1);
    });

    await test.step('Verification Point 2: Left side has a "PAY NOW" button and the left-side Total = InvoiceTotal#1', async () => {
      const hasPayNow = await resellerPortalPage.hasPayNowButton();
      expect(hasPayNow, 'There should be a "PAY NOW" button on the left side of the invoice').toBeTruthy();

      const leftTotal = await resellerPortalPage.getDetailTotalAmount();
      console.log(`  - Portal left-side Total: "${leftTotal}" | InvoiceTotal#1 (net): "${invoiceTotal1}"`);
      expect(money(leftTotal), 'The left-side Total should equal InvoiceTotal#1').toBeCloseTo(money(invoiceTotal1), 2);
    });

    await test.step('Verification Point 3: Right side - each product line shows the expected quantity/total', async () => {
      for (let i = 0; i < PRODUCTS.length; i++) {
        const code = PRODUCTS[i];
        const line = await resellerPortalPage.getDetailProductLine(code);
        expect(line, `Product#${i + 1} (${code}) should appear in the portal product list`).not.toBeNull();
        const portalAmount = money(line!.amount);
        console.log(`  - Product#${i + 1} ${code}: portal qty="${line!.quantity}" amount="${line!.amount}" | expected total=${productTotal[code]}`);
        // All four products: total must equal ProductTotal#N.
        expect(portalAmount, `Product#${i + 1} (${code}) total should equal ProductTotal#${i + 1}`).toBeCloseTo(productTotal[code], 2);
        // Product#1 additionally: Quantity must equal ProductQty#1.
        if (i === 0) {
          const portalQty = qtyNum(line!.quantity);
          console.log(`  - Product#1 quantity on portal = ${portalQty} | ProductQty#1 = ${productQty[code]}`);
          expect(portalQty, 'Product#1 Quantity on the portal should equal ProductQty#1').toBe(productQty[code]);
        }
      }
      console.log('✅ Reseller can view the multi-product invoice on the portal with the expected PAY NOW, total, and product lines');
    });
  });
});
