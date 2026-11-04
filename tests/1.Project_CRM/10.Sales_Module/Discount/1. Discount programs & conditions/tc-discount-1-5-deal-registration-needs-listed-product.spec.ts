import { test, BrowserContext, Page } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_BASELINE,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  money,
  newDiscountRun,
  signIn,
  createEndCustomerCompany,
  createOpportunityForCompany,
  openDealElementFromOpportunity,
  recordChecks,
  printVerifyAndAssert,
  teardownDiscountRun,
  ProgramOwner,
} from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  Discount_1.5 - Offer Deal registration only when a product from its list is on the order   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_1.5
 * Automation-Type  : new
 * Automation-Date  : 2026-10-20
 * Mirrors          : CRM-12144_1.5 (crm-mig manual TC, master "Migration - Discount" row 22) - same steps,
 *                    same expected results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : CRM-13768
 * Revised          : 2026-11-04 - spec v7 IS-CRM-FUNC-0074-03 ("A product qualifies only while it is offered for sale",
 *                    CRM-13848 A2): steps 6-7 read Deal registration's "Based on Products" condition and the Can be
 *                    Sold flag of the products it lets qualify - mirrors CRM-12144_1.5 steps 6-7 (re-synced 2026-11-03)
 * Spec             : [Migration] Discounts (Promotions) v7, page 222532591 - IS-CRM-FUNC-0074-03
 * Source version   : master "Sales module" row 124 / Jira CRM-13768 as updated on 2026-11-04 - re-check before trusting this spec
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas), steps 1-5;
 *                    CRM administrator (users.admin_crm, Sales / Manager) in a second browser session + JSON-RPC, steps 6-7
 *
 * Adaptations to the reference system (reason)
 *   - Step 6: crm-mig reads PROG1's "Products" row in the Program editor; here the program is the sale.coupon.program
 *     "Deal registration ..." and its condition is the "Based on Products" field (Sales > Configuration > Promotion
 *     Programs), opened as the CRM administrator.
 *   - Step 7: on crm-mig the codes ARE the condition, so every listed product must be for sale. Here the condition is a
 *     domain ("Can be Sold is set" AND "Internal Reference in" the codes), so the products it lets QUALIFY are counted -
 *     the code list itself holds A5044B / A5045B (Can be Sold = No), which the domain leaves out. [INTERNAL check, Call
 *     API]: product.product over JSON-RPC (the code list, archived included; then the program's own domain).
 *
 * Summary
 * -------
 * On a fresh end-customer Deal Element, a Support Services line alone (A2165B x 10, above 1,400.00) leaves Deal
 * registration out of the Promotion list; adding the listed product A2144B x 5 brings it in. Deal registration's
 * products condition lets no product qualify that is not offered for sale.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_1\.5:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.5, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Login to pre-production as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)
 *    2. Contacts > Create a new company:
 *         - Name        = Disc-Cust-<timestamp>
 *         - Type        = Company - end customer (no Reseller, no Distributor)
 *         - Email       = disc.cust.<timestamp>@d<timestamp>.discautotest.com
 *         - Country     = United States
 *         - State       = Maryland
 *         - Sales Team  = BDEU
 *         - Salesperson = Thomas Semerich
 *         - Pricelist   = Public Pricelist_USD   (crm-mig: "Public Pricelist (USD)")
 *    3. CRM > Pipeline > Create a new opportunity (switch the pipeline to LIST view first - the kanban
 *       quick-create card does not carry these fields):
 *         - Name         = Disc-Opp-<timestamp>
 *         - Email        = the company's e-mail (this is what links Company = Disc-Cust-<timestamp>)
 *         - Company Name = Disc-Cust-<timestamp>
 *         - Street       = 123 street
 *         - Country      = United States
 *         - State        = Maryland
 *         - Sales Team   = BDEU
 *         - Salesperson  = Thomas Semerich
 *         - Lead Form    = Download Free Trial
 *         - Stage        = New
 *    4. Login to pre-production as the CRM administrator (Sales / Manager) in a second browser session (step 6 reads
 *       the program's configuration)
 *  Steps
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment
 *    2. On Order Lines, add A2165B (a Support Services product) with Ordered Qty 10
 *    3. Open the Promotion list
 *         -> Expected: the list does not contain Deal registration, although the Total is above 1,400.00
 *            (on the reference system an empty list reads "No results to show...")
 *    4. Add A2144B with Ordered Qty 5
 *    5. Open the Promotion list
 *         -> Expected: the list contains "Deal registration promotion, 10% on Product, Support Services do not qualify"
 *    6. As the CRM administrator, open Sales > Configuration > Promotion Programs > "Deal registration promotion, 10% on
 *       Product, Support Services do not qualify" and read its "Based on Products" condition
 *         -> Expected: "Based on Products" reads "Can be Sold is set" and "Internal Reference in" followed by the
 *            qualifying product codes
 *    7. Open Sales > Products and look up the products the condition read in step 6 lets qualify: is "Can be Sold"
 *       ticked on each?
 *         -> Expected: every product the condition lets qualify has "Can be Sold" ticked: a product that is not offered
 *            for sale does not qualify for Deal registration (IS-CRM-FUNC-0074-03) - A5044B and A5045B are in the code
 *            list but have Can be Sold = No, so they do not qualify
 * ================================================================================================
 */

const TC = 'Discount_1.5';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to pre-production (Odoo 12 EE, the reference system) as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre2: 'Pre-condition 2: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_USD',
  pre3: 'Pre-condition 3: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  pre4: 'Pre-condition 4: Login to pre-production as the CRM administrator (Sales / Manager) in a second browser session (step 6 reads the program\'s configuration)',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s2: 'Step 2: On Order Lines, add A2165B (a Support Services product) with Ordered Qty 10',
  s3: 'Step 3: Open the Promotion list',
  s4: 'Step 4: Add A2144B with Ordered Qty 5',
  s5: 'Step 5: Open the Promotion list',
  s6: 'Step 6: As the CRM administrator, open Sales > Configuration > Promotion Programs > "Deal registration promotion, 10% on Product, Support Services do not qualify" and read its "Based on Products" condition',
  s7: 'Step 7: [INTERNAL check, Call API] Open Sales > Products and look up the products the condition read in step 6 lets qualify: is "Can be Sold" ticked on each?',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const SALES = users.sale_ic_thomas;
const ADMIN = users.admin_crm;
/** Products with Can be Sold = No that sit in Deal registration's code list (read 2026-11-04) - named in the check. */
const NOT_FOR_SALE_IN_LIST = ['A5044B', 'A5045B'];
const PRODUCTS_FIELD = "div[name='rule_products_domain']";

/** sale.coupon.program stores its domain as Python literal text - turned into JSON for JSON-RPC. */
const pyDomainToJson = (s: string): unknown[] =>
  JSON.parse(s.replace(/'/g, '"').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null'));

test.describe(`${TC} - Offer Deal registration only when a product from its list is on the order (pre-prod baseline of CRM-12144_1.5)`, () => {
  let run: DiscountRun;
  let adminContext: BrowserContext | undefined;
  let owner: ProgramOwner | undefined;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    run = newDiscountRun();
    adminContext = undefined;
    owner = undefined;
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    await adminContext?.close().catch(() => {});
    await owner?.close().catch(() => {});
    if (!SKIP_CLEANUP) await teardownDiscountRun(page, run, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Offer Deal registration only when a product from its list is on the order`, async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPage(page);
    const checks: Check[] = [];

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : pre-production`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signIn(page, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as the salesperson');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await createEndCustomerCompany(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - company created');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createOpportunityForCompany(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - opportunity created');
    });

    let adminPage: Page | undefined;
    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      console.log(`  - Login : ${ADMIN.username} (${ADMIN.displayName}) - own browser context, the salesperson session stays as it is`);
      adminContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 } });
      adminPage = await adminContext.newPage();
      await signIn(adminPage, ADMIN);
      owner = await ProgramOwner.open();
      await CommonUtils.captureAndAttachScreenshot(adminPage, testInfo, 'Pre-condition 4 - signed in as the CRM administrator');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await openDealElementFromOpportunity(page);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.supportProduct, 10);
      const subtotal = await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '4,450.00');
      console.log(`  - A2165B line Subtotal : ${subtotal}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const total = await dealElementPage.getSubtotalFooterValue('amount_total');
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - the order Total is above 1,400.00', expected: '> 1,400.00', actual: total, passed: money(total) > 1400 },
        {
          what: 'Step 3 - the Promotion list does not contain Deal registration',
          expected: `not listed: ${DISCOUNT_BASELINE.dealRegistration}`,
          actual: options.length ? options.join(' | ') : '(empty list)',
          passed: !options.includes(DISCOUNT_BASELINE.dealRegistration),
        },
      ], `${TC} - Step 3 Promotion list with A2165B only`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList, DISCOUNT_HIGHLIGHT.totals]);
      await dealElementPage.closePromotionList();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-3 - A2165B x 10, no Deal registration offered');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.listedProduct, 5);
      const rows = await dealElementPage.getAllOrderLineRows();
      for (const r of rows) console.log(`  - line: ${(r['Product'] ?? '').slice(0, 40)} | qty ${r['Ordered Qty']} | ${r['Subtotal']}`);
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      await dealElementPage.blurForm();
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 5 - the Promotion list contains Deal registration',
          expected: DISCOUNT_BASELINE.dealRegistration,
          actual: options.length ? options.join(' | ') : '(empty list)',
          passed: options.includes(DISCOUNT_BASELINE.dealRegistration),
        },
      ], `${TC} - Step 5 Promotion list with A2144B added`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 4-5 - A2144B added, Deal registration offered');
    });

    let qualifyingDomain: unknown[] = [];
    let listedCodes: string[] = [];
    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      const programs = await owner!.call('sale.coupon.program', 'search_read', [[['name', '=', DISCOUNT_BASELINE.dealRegistration]]], { fields: ['name', 'rule_products_domain'], limit: 5 });
      console.log(`  - Programs named "${DISCOUNT_BASELINE.dealRegistration}" : ${programs.length} (id ${programs[0]?.id})`);
      if (programs.length !== 1) throw new Error(`Step 6: expected exactly 1 Deal registration program, found ${programs.length}`);
      qualifyingDomain = pyDomainToJson(programs[0].rule_products_domain);
      const codeLeaf = qualifyingDomain.find((d) => Array.isArray(d) && d[0] === 'default_code') as [string, string, string[]] | undefined;
      listedCodes = codeLeaf ? codeLeaf[2] : [];
      await adminPage!.goto(`${baseUrl.replace(/\/$/, '')}/web#id=${programs[0].id}&model=sale.coupon.program&view_type=form`, { waitUntil: 'domcontentloaded' });
      await adminPage!.locator(PRODUCTS_FIELD).first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
      const shown = ((await adminPage!.locator(PRODUCTS_FIELD).first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      console.log(`  - Based on Products (screen) : ${shown.slice(0, 160)}...`);
      await recordChecks(adminPage!, testInfo, checks, [
        {
          what: 'Step 6 - "Based on Products" reads "Can be Sold is set" and "Internal Reference in" followed by the qualifying product codes',
          expected: '"Can be Sold is set" + "Internal Reference in" + at least 1 code',
          actual: `Can be Sold is set = ${shown.includes('Can be Sold is set')}, Internal Reference in = ${shown.includes('Internal Reference in')}, ${listedCodes.length} codes`,
          passed: shown.includes('Can be Sold is set') && shown.includes('Internal Reference in') && listedCodes.length > 0,
        },
      ], `${TC} - Step 6 Deal registration Based on Products`, [PRODUCTS_FIELD]);
      await CommonUtils.captureAndAttachScreenshot(adminPage!, testInfo, 'Step 6 - Deal registration Based on Products read');
    });

    await test.step(STEP.s7, async () => {
      console.log(`\n--- ${STEP.s7} ---`);
      const listed = await owner!.call('product.product', 'search_read', [[['default_code', 'in', listedCodes]]], { fields: ['default_code', 'name', 'sale_ok'], context: { active_test: false }, limit: 500 });
      const qualifying = await owner!.call('product.product', 'search_read', [qualifyingDomain], { fields: ['default_code', 'sale_ok'], limit: 500 });
      const qualifyingCodes = new Set<string>(qualifying.map((p: any) => p.default_code));
      const qualifyingNotSold: string[] = qualifying.filter((p: any) => !p.sale_ok).map((p: any) => p.default_code);
      console.log(`  - Codes in the condition              : ${listedCodes.length}`);
      console.log(`  - Products found by those codes       : ${listed.length}, Can be Sold = No: ${listed.filter((p: any) => !p.sale_ok).map((p: any) => `${p.default_code} "${p.name}"`).join(', ') || '(none)'}`);
      console.log(`  - Products the condition lets qualify : ${qualifying.length}`);
      await recordChecks(adminPage!, testInfo, checks, [
        {
          what: 'Step 7 - every product the condition lets qualify has "Can be Sold" ticked',
          expected: '0 qualifying products with Can be Sold = No',
          actual: `${qualifyingNotSold.length} of ${qualifying.length}${qualifyingNotSold.length ? `: ${qualifyingNotSold.join(', ')}` : ''}`,
          passed: qualifying.length > 0 && qualifyingNotSold.length === 0,
        },
        ...NOT_FOR_SALE_IN_LIST.map((c): Check => ({
          what: `Step 7 - ${c} (in the code list, Can be Sold = No) does not qualify for Deal registration`,
          expected: `${c} not among the qualifying products`,
          actual: `${c}: in the code list = ${listedCodes.includes(c)}, qualifies = ${qualifyingCodes.has(c)}`,
          passed: !qualifyingCodes.has(c),
        })),
      ], `${TC} - Step 7 Can be Sold of the qualifying products`, [PRODUCTS_FIELD]);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
