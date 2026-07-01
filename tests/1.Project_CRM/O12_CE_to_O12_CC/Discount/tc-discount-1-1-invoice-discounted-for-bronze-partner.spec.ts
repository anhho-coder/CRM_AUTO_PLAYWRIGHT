import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, ContactPage, InvoicePage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote, DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createValidatedInvoiceAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-8-invoice.helper';

/**
 * ===========================================================================
 *  Discount  -  Invoice is discounted for a partner-level (Bronze)
 * ===========================================================================
 *  Test Case ID    : Discount-1.1
 *  Jira            : N/A (manual TC provided inline)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-30
 *
 *  Summary:
 *    Read the reseller's partner Level and that level's Discount % as admin, create + validate a
 *    deal-registration Invoice as Thomas, then as the Reseller verify the portal invoice totals show
 *    Partner Discount(<level %>) = Subtotal x <level %>, and Total = Subtotal - discount = the backend Total.
 *
 *  Command to run:
 *    npx playwright test --grep "Discount-1\.1:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition #1  -  get the reseller's Level, then that level's Discount % (as admin anh.ho):
 *    1. Use the admin account anh.ho to login successful
 *    2. Open the reseller TEST-Reseller#Automation-Jun10 directly via its contact URL (hard-configured)
 *    3. Note the partner's Level -> PartnerLevel#1            (e.g. Bronze)
 *    4. Go to "Contacts" > "Configuration" > "Partner program conditions"
 *    5. Open the level PartnerLevel#1 (e.g. Bronze)
 *    6. Note its "Discount %" -> DiscountPercent#1            (Bronze = 15)
 *
 *  Pre-condition #2  -  the reseller deal-registration Internal Note:
 *    1. Have the Internal Note #1 from the deal-registration template, key fields (one per line):
 *         - NAKIVO deal registration*  = <random 4-digit number>
 *         - Name                       = TEST <current date time>
 *         - Email                      = Test@company<compact date time>.com
 *         - Created Date               = <current date time>
 *         - phone                      = <random 9-digit number>
 *         - Company                    = Company Name Lead 1
 *         - Partner Company Name       = TEST-Reseller#Automation-Jun10
 *         - IP                         = 128.183.189.157
 *         - Country                    = United States
 *       (Remaining template lines - Solution used, Edition, License Type, etc. - are static defaults.)
 *    2. Edit the Internal Note #1 at the <...> placeholders (dynamic values, fresh each run).
 *
 *  Pre-condition #3  -  create + validate the invoice for the reseller deal (as Thomas):
 *    1. Use the account of Thomas to login successful
 *    2. Click "CRM" > "view list"
 *    3. On Opp page, click "CREATE"
 *    4. Enter the Opportunity details:
 *         - Opp name      = TEST Discount-1.1 <current date time>
 *         - Contact name  = <Name from Internal Note #1>
 *         - CompanyName   = Company Name Lead 1
 *         - Email         = <Email from Internal Note #1>
 *         - Country       = United States
 *         - State         = Maryland
 *         - IP            = <IP from Internal Note #1>
 *         - Create manually checkbox = FALSE
 *         - Sales Team dropdown      = cleared
 *         - Salesperson dropdown     = cleared
 *    5. "CRM Developer" tab: Lead form textbox = NAKIVO deal registration*
 *    6. "Assigned Partner" tab: Assigned Partner = TEST-Reseller#Automation-Jun10
 *    7. "Internal Notes" tab: paste Internal Note #1 (edited in Pre-condition #2)
 *    8. Press "SAVE"
 *    9. Refresh until Company and Contact are populated in Opp #1 (within ~10s)
 *   10. Click "Deal Element" button to create a new deal element
 *   11. Set Pricelist = Public Pricelist_USD (USD)
 *   12. Set Payment terms = Immediate Payment
 *   13. In Order Lines tab, click "Add a product" -> select ONE product (Product#1), Quantity = 1
 *   14. Click "New Quotation" -> wait until created -> click "Confirm"   (small deal, no approval)
 *   15. Wait until "Create invoice" button appears, then click it
 *   16. In Invoice Order popup, select the first option "Invoiceable lines"
 *   17. Click "Create and view invoices" button
 *   18. Wait until the invoice is created completely, on the invoice screen click "Validate"
 *   19. From the validated invoice in Odoo, note:
 *         - Invoice#1     = Invoice number
 *         - Subtotal#1    = Subtotal value (sum of product line Amounts, before partner discount)
 *         - DiscountAmt#1 = the "Partner Discount(...)" reduction amount
 *         - Total#1       = Total value
 *
 *  Steps to reproduce  (as the reseller TEST-Reseller#Automation-Jun10):
 *    1. Use the account of the reseller TEST-Reseller#Automation-Jun10 to login successful
 *    2. Click "My Invoices"
 *    3. Input Invoice#1 in the search textbox
 *    4. Click on Invoice#1 in the result list to open it
 *
 *  Verification Point  (on Invoice#1 detail screen - Partner Portal):
 *    The totals block has a row "Partner Discount(<X>%)  $ -<amount>". Split into <X> (the percent) and
 *    <amount> (the negative money value). Verify:
 *      1. Subtotal shown = Subtotal#1
 *      2. The percent <X> in "Partner Discount(<X>%)" = DiscountPercent#1 (Bronze = 15)
 *      3. The discount amount <amount> = Subtotal#1 x DiscountPercent#1%   (shown as negative)
 *      4. Total shown = Total#1 (the same Total as on the Odoo back-office invoice), and = Subtotal#1 - <amount>
 * ===========================================================================
 */

// A validated/posted Invoice (+ its Opp/Quotation/SO chain) cannot be cleanly deleted in Odoo -> retain
// the records and report their URLs (matches the UC-B / UC-A-8 invoice-flow convention).
const SKIP_CLEANUP_OPP = true;

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
// Parse the percent inside "Partner Discount(15.0%)" -> 15.0
const parsePercentInLabel = (label: string | undefined | null): number => {
  const m = (label || '').match(/\(\s*([\d.]+)\s*%\s*\)/);
  return m ? parseFloat(m[1]) : NaN;
};
// The reseller's hard-configured backend contact URL (res.partner form), built from the configured baseUrl.
const RESELLER_CONTACT_URL = `${baseUrl}web#id=${DEAL_REGISTRATION.partnerContactId}&model=res.partner&view_type=form`;

test.describe('Discount-1.1 - Invoice is discounted for a bronze partner', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const rp = new ResellerPortalPage(page);
      await rp.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    // Boundary screenshot (REQUIREMENT #3): end of afterEach, guarded so it never throws on a closing page.
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('Discount-1.1: Invoice is discounted for a bronze partner', async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2); // admin lookup + full invoice chain + portal verification
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const contactPage = new ContactPage(page);
    const invoicePage = new InvoicePage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    // Pre-condition #2 data: the deal-registration Internal Note (fresh, unique values each run).
    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST Discount-1.1 ${compactDateTime}`;

    let partnerLevel = '';
    let discountPercent = NaN; // DiscountPercent#1 (e.g. 15.0)
    let invoiceNumber = '';
    let subtotal1 = 0;   // Subtotal#1   (gross, before partner discount)
    let discountAmt1 = 0; // DiscountAmt#1 (the Partner Discount reduction)
    let total1 = 0;      // Total#1      (net amount_total)

    // ===================== Pre-condition #1 =====================
    await test.step('Pre-condition #1 - Step 1: Use the admin account anh.ho to login successful', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as admin (${users.admin_crm.displayName})`);
    });

    await test.step('Pre-condition #1 - Step 2: Open the reseller TEST-Reseller#Automation-Jun10 directly via its contact URL', async () => {
      console.log(`  - Reseller contact URL: ${RESELLER_CONTACT_URL}`);
      await contactPage.openContactByUrl(RESELLER_CONTACT_URL);
    });

    await test.step('Pre-condition #1 - Step 3: Note the partner\'s Level -> PartnerLevel#1', async () => {
      partnerLevel = await contactPage.getPartnerLevel();
      console.log(`  - PartnerLevel#1 = "${partnerLevel}"`);
      expect(partnerLevel, 'The reseller should have a partner Level set').toBeTruthy();
    });

    await test.step('Pre-condition #1 - Step 4: Go to "Contacts" > "Configuration" > "Partner program conditions"', async () => {
      await contactPage.openPartnerProgramConditions();
    });

    await test.step(`Pre-condition #1 - Step 5: Open the level PartnerLevel#1 (${partnerLevel || 'Bronze'})`, async () => {
      await contactPage.openPartnerProgramLevel(partnerLevel || 'Bronze');
    });

    await test.step('Pre-condition #1 - Step 6: Note its "Discount %" -> DiscountPercent#1', async () => {
      const discountText = await contactPage.getProgramDiscountPercent();
      discountPercent = parseFloat((discountText || '').replace(/[^0-9.]/g, ''));
      console.log(`  - DiscountPercent#1 = "${discountText}" -> ${discountPercent}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Pre-condition I - Level ${partnerLevel} Discount ${discountPercent}%`);
      expect(discountPercent, 'DiscountPercent#1 should be a positive percent').toBeGreaterThan(0);
    });

    // ===================== Pre-condition #2 =====================
    await test.step('Pre-condition #2: Build the deal-registration Internal Note #1 (fresh dynamic values)', async () => {
      console.log('  - Internal Note #1 key fields:');
      console.log(`    - Name                 : ${leadName}`);
      console.log(`    - Email                : ${companyEmail}`);
      console.log(`    - Company              : ${DEAL_REGISTRATION.companyName}`);
      console.log(`    - Partner Company Name : ${DEAL_REGISTRATION.partnerCompanyName}`);
      console.log(`    - IP                   : ${DEAL_REGISTRATION.ip}`);
      console.log(`    - Country              : ${DEAL_REGISTRATION.country}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - Internal Note built').catch(() => {});
    });

    // ===================== Pre-condition #3 =====================
    // Switch session from admin -> Thomas (the helper's Step 1 logs in as Thomas; logout admin first so
    // the login lands on the login page, not the admin home).
    await loginPage.logout(baseUrl);
    await page.context().clearCookies();

    // Steps 1-19: create the deal-registration Opportunity, Deal Element (1 product, Qty 1), Quotation,
    // Sales Order, and the validated Invoice as Thomas (shared, proven helper).
    const invoice = await createValidatedInvoiceAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
      stepPrefix: 'Pre-condition #3',
    });
    createdOppUrl = invoice.oppUrl;

    await test.step('Pre-condition #3 - Step 19: From the validated invoice, note Invoice#1 / Subtotal#1 / DiscountAmt#1 / Total#1', async () => {
      invoiceNumber = invoice.invoiceNumber || (await invoicePage.getInvoiceNumber().catch(() => ''));
      const totalText = await invoicePage.getInvoiceTotal();
      const subtotalText = await invoicePage.getFirstInvoiceLineSubtotal();
      total1 = money(totalText);            // net amount_total (after the partner discount)
      subtotal1 = money(subtotalText);      // gross line Amount = Subtotal (single product line)
      discountAmt1 = subtotal1 - total1;    // the Partner Discount reduction
      console.log(`  - Invoice#1     = "${invoiceNumber}"`);
      console.log(`  - Subtotal#1    = ${subtotal1} (gross, before partner discount)`);
      console.log(`  - DiscountAmt#1 = ${discountAmt1.toFixed(2)} (Subtotal#1 - Total#1)`);
      console.log(`  - Total#1       = ${total1} (net)`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition III - Invoice#1 validated');
      expect(invoiceNumber, 'Invoice#1 should be assigned after VALIDATE').toBeTruthy();
      expect(subtotal1, 'Subtotal#1 should be > 0').toBeGreaterThan(0);
      expect(total1, 'Total#1 should be > 0').toBeGreaterThan(0);
    });

    // ===================== Steps to reproduce (as the Reseller) =====================
    await test.step('Steps to reproduce - Step 1: Use the account of the reseller TEST-Reseller#Automation-Jun10 to login successful', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_1.username, users.reseller_1.password);
      await resellerPortalPage.waitForPortalReady();
      console.log(`✓ Logged in as the reseller (${users.reseller_1.displayName})`);
    });

    await test.step('Steps to reproduce - Step 2: Click "My Invoices"', async () => {
      await resellerPortalPage.clickMyInvoices();
      console.log('✓ My Invoices opened');
    });

    await test.step('Steps to reproduce - Step 3: Input Invoice#1 in the search textbox', async () => {
      await resellerPortalPage.searchInvoices(invoiceNumber);
      console.log(`✓ Searched My Invoices for "${invoiceNumber}"`);
    });

    await test.step('Steps to reproduce - Step 4: Click on Invoice#1 in the result list to open it', async () => {
      await resellerPortalPage.openInvoiceByNumber(invoiceNumber);
      await resellerPortalPage.waitForDetailLineTable();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Invoice#1 opened on portal');
      console.log('✓ Invoice#1 opened on the Partner Portal');
    });

    // ===================== Verification Point =====================
    await test.step('Verification Point: Subtotal / Partner Discount(<X>%) / Total on the portal invoice', async () => {
      const rows = await resellerPortalPage.getDetailTotalsBreakdown();
      const find = (re: RegExp) => rows.find((r) => re.test(r.label));
      const subtotalRow = find(/^Subtotal/i);
      const discountRow = find(/Partner Discount/i);
      const totalRow = rows.filter((r) => /^Total$/i.test(r.label)).pop() || find(/^Total/i);

      const portalSubtotal = money(subtotalRow?.amount);
      const portalDiscount = money(discountRow?.amount); // absolute value of the negative reduction
      const portalTotal = money(totalRow?.amount);
      const portalPercent = parsePercentInLabel(discountRow?.label);
      const expectedDiscount = subtotal1 * (discountPercent / 100);

      console.log('  - Portal totals block:');
      console.log(`    - Subtotal                 : "${subtotalRow?.amount}" -> ${portalSubtotal}`);
      console.log(`    - Partner Discount label   : "${discountRow?.label}" -> X = ${portalPercent}%`);
      console.log(`    - Partner Discount amount  : "${discountRow?.amount}" -> ${portalDiscount} (negative)`);
      console.log(`    - Total                    : "${totalRow?.amount}" -> ${portalTotal}`);
      console.log('  - Backend references:');
      console.log(`    - Subtotal#1=${subtotal1} | DiscountPercent#1=${discountPercent}% | DiscountAmt#1=${discountAmt1.toFixed(2)} | Total#1=${total1}`);
      console.log(`    - Subtotal#1 x DiscountPercent#1% = ${expectedDiscount.toFixed(2)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Portal invoice totals block');

      expect(subtotalRow, 'A Subtotal row should be shown').toBeTruthy();
      expect(discountRow, 'A Partner Discount row should be shown').toBeTruthy();
      expect(totalRow, 'A Total row should be shown').toBeTruthy();

      // 1. Subtotal shown = Subtotal#1
      expect(portalSubtotal, 'Verification 1: portal Subtotal should equal Subtotal#1').toBeCloseTo(subtotal1, 1);
      // 2. The percent <X> in "Partner Discount(<X>%)" = DiscountPercent#1
      expect(portalPercent, 'Verification 2: the Partner Discount percent should equal DiscountPercent#1').toBeCloseTo(discountPercent, 1);
      // 3. The discount amount = Subtotal#1 x DiscountPercent#1% (shown negative)
      expect(discountRow?.amount || '', 'Verification 3: the Partner Discount amount should be shown as negative').toMatch(/-/);
      expect(portalDiscount, 'Verification 3: the Partner Discount amount should equal Subtotal#1 x DiscountPercent#1%').toBeCloseTo(expectedDiscount, 1);
      // 4. Total shown = Total#1 AND = Subtotal#1 - <amount>
      expect(portalTotal, 'Verification 4: portal Total should equal the backend Total#1').toBeCloseTo(total1, 1);
      expect(portalTotal, 'Verification 4: portal Total should equal Subtotal#1 - Partner Discount amount').toBeCloseTo(subtotal1 - portalDiscount, 1);
      console.log(`✅ Discount-1.1 verified: ${partnerLevel} partner gets ${discountPercent}% off (Subtotal ${subtotal1} -> Total ${total1})`);
    });
  });
});
