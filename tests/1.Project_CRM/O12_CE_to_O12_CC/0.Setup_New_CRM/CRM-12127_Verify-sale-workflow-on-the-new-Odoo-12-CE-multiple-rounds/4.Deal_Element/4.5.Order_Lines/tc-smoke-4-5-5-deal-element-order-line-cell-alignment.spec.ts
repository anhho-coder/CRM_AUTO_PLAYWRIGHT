import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { DealElementPage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  addDealElementOnO12CE,
  registerMigRecordFromUrl,
  O12ceOpportunity,
  teardownMigRecords,
  sweepMigLeftoversAfterAll,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Order Lines cell alignment
 * Test Case ID: CRM-12370_4.5.5
 * Automation-Type: new
 * Automation-Date: 2026-10-01
 *
 * Summary:
 *   Verify every data cell of an Order Lines item row is CENTER-aligned - the computed
 *   text-align of each of the 16 named columns' cells reads "center".
 *
 * Source:
 *   Tester observation by anh.ho on 2026-10-01, with a screenshot of Deal Element DE038882
 *   (crm-mig id 242173): the items in the "Order Lines" tab are not center-aligned. Seven
 *   columns were boxed on that screenshot - Unit Price, Subtotal before discount, Special
 *   Discount Amount, Promo Discount Amount, Partner Discount, Partner Discount Amount and
 *   Subtotal After All Discounts - and the tester scoped the expectation to the WHOLE item
 *   row (all 16 named columns) on the same day.
 *   There is NO Xray manual TC behind this spec yet; when one is created, pin its key and
 *   fields.updated here (REQUIREMENT #7).
 *
 * OPEN QUESTION - the expected value is NOT yet grounded on pre-production:
 *   "center" is the alignment the TESTER stated as expected on 2026-10-01. It was not read
 *   off the pre-production Deal Element form (there is no pre-prod MCP, and this suite runs
 *   on crm-mig only). Before this spec's red is quoted as an O12 CE drift, somebody must
 *   open the same tab on pre-production and confirm the baseline there.
 *   What IS grounded, over XML-RPC on crm-mig (2026-10-01, uid 9685): form view 2140
 *   sale.order.deal.element.view.form declares NO alignment attribute on any order_line
 *   field, and every amount column is float/monetary on sale.order.line
 *   (price_unit, subtotal_before_discount, discount, special_discount_amount,
 *   promo_discount_amount, partner_discount, partner_discount_amount,
 *   subtotal_after_all_discounts = float; price_subtotal = monetary). Alignment therefore
 *   comes entirely from the stylesheet, not from the view - which is why this check reads
 *   the COMPUTED style rather than the arch.
 *
 * O12 CE notes:
 *   - The column captions render UPPERCASE on O12 CE where pre-production renders title case
 *     (see CRM-12370_4.5.1). This spec therefore walks the columns AS READ, in order, and
 *     never looks a column up by its pre-production caption - a casing difference must fail
 *     4.5.1, not silently empty this one.
 *   - Header alignment is printed as an un-scored observation. The tester scoped the
 *     expectation to the data cells, so scoring the header would assert something nobody asked for.
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the Admin account can log in (CRM-12325_1.1.1).
 *
 * Steps:
 *   1. Use the account of Admin to login successful.
 *   2. Open "CRM" and switch to the Opportunities list view.
 *   3. On the "Opp" page, click at "CREATE" button.
 *   4. Enter the opportunity information (Country = United States, State = Connecticut, Sales Team and
 *      Salesperson cleared, "Create manually" FALSE).
 *   5. Click at "CRM Developer" tab at the bottom of page (Lead form = License).
 *   6. Press "SAVE" button.
 *   7. Refresh page to see the "Contact" field is entered.
 *   8. Create "DEAL ELEMENT" - press the "DEAL ELEMENT" button.
 *   9. On the "Deal Element" screen select Pricelist = Public Pricelist_USD and
 *      Payment Term = Immediate Payment.
 *  10. At "Order Lines" section - press "Add a product" and select the NAKIVO Backup product.
 *  11. Press "SAVE" button on the top page and wait for the saved (readonly) form.
 *  12. Open the "Order Lines" tab of the saved Deal Element and read the computed horizontal
 *      alignment of the item row's cells.
 *
 * Verification Points:
 *   1. The Order Lines list renders exactly 1 item row (the one this test added) - so the
 *      alignment checks below cannot pass against an empty list.
 *   2. The item row is read across exactly 16 named columns.
 *   3. Each of those 16 cells is center-aligned: computed text-align = "center".
 *      A cell reading "left" or "right" is the defect this TC exists for - the value then sits
 *      off-centre under its header, which is what the 2026-10-01 screenshot shows.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_4\.5\.5:" --project=MigSmoke
 */

const TC = 'CRM-12370_4.5.5';

/** The alignment every Order Lines data cell must carry. */
const EXPECTED_CELL_ALIGNMENT = 'center';

/**
 * The number of NAMED columns the Order Lines list renders on a draft Deal Element.
 * Delivered Quantity / Invoiced Quantity carry column_invisible: parent.state not in
 * ('sale','done'), so a draft does not render them - the same 16 CRM-12370_4.5.1 asserts.
 */
const EXPECTED_NAMED_COLUMN_COUNT = 16;

/** The item row this test adds - exactly one, so an empty list cannot pass vacuously. */
const EXPECTED_ITEM_ROW_COUNT = 1;

const SKIP_CLEANUP_OPP = process.env.SKIP_CLEANUP_OPP === 'true'; // default false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken chain for hand-debugging - the 16:00 leftover-data check then reports it.

test.describe(`${TC} - Order Lines cell alignment`, () => {

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
      const homePage = new HomePageMig(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await teardownMigRecords(page, SKIP_CLEANUP_OPP);
  });

  // CLAUDE.md crm-mig rule: the afterAll sweep also removes what a dying test created but never
  // got to register. Opens its own session, so it costs one extra login per spec file.
  test.afterAll(async ({ browser }) => {
    if (SKIP_CLEANUP_OPP) {
      console.log('[mig-sweep] SKIPPED by SKIP_CLEANUP_OPP=true - records KEPT on O12 CE for hand-inspection.');
      return;
    }
    await sweepMigLeftoversAfterAll(browser, TC);
  });

  test(`${TC}: Verify the items of the Order Lines list are center-aligned`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const dealElementPage = new DealElementPage(page);

    let opp: O12ceOpportunity | null = null;
    let dealElementUrl = '';

    // The VERIFY block printed before the expect()s, so a failing check still reaches stdout.
    const CHECKS: Array<{ what: string; expected: string; actual: string; pass: boolean }> = [];
    const OBSERVATIONS: string[] = [];
    const record = (what: string, expected: unknown, actual: unknown, pass?: boolean) => {
      const expectedText = String(expected);
      const actualText = String(actual);
      CHECKS.push({
        what,
        expected: expectedText,
        actual: actualText,
        pass: pass === undefined ? expectedText === actualText : pass,
      });
    };
    const verifyLines = (): string[] => {
      const lines: string[] = ['==================== VERIFY ===================='];
      CHECKS.forEach((c, i) => {
        lines.push(`  Verify #${i + 1} - ${c.what}:`);
        lines.push(`     Expected : ${c.expected}`);
        lines.push(`     Actual   : ${c.actual}`);
        lines.push(`     Result   : ${c.pass ? 'PASS' : 'FAIL'}`);
      });
      OBSERVATIONS.forEach((o) => lines.push(`  Observation (not scored) - ${o}`));
      lines.push('===============================================');
      const passed = CHECKS.filter((c) => c.pass).length;
      lines.push(
        `OVERALL: ${passed === CHECKS.length ? 'PASS' : 'FAIL'} - ${passed}/${CHECKS.length} checks matched`
      );
      return lines;
    };
    const printVerify = () => verifyLines().forEach((l) => console.log(l));

    await loginToO12CE(page);
    await openOpportunitiesListOnO12CE(page);
    opp = await createOpportunityOnO12CE(page, TC);

    await addDealElementOnO12CE(page);
    dealElementUrl = page.url();
    registerMigRecordFromUrl(dealElementUrl, `Deal Element ${TC}`, 'sale.order');
    console.log(`  Opportunity         : ${opp.oppName}`);
    console.log(`  Deal Element saved  : ${dealElementUrl}`);

    await test.step('Verification', async () => {
      await dealElementPage.clickOrderLinesTab();

      const rowCount = await dealElementPage.getOrderLineRowCount();
      const alignments = await dealElementPage.getOrderLineCellAlignments(0);
      const columns = Object.keys(alignments);

      console.log('  Order Lines alignment read from the saved Deal Element:');
      columns.forEach((caption) => {
        const pad = caption.length >= 32 ? caption : caption + ' '.repeat(32 - caption.length);
        console.log(`  - ${pad} header = ${alignments[caption].header} / cell = ${alignments[caption].cell}`);
      });

      record('Number of item rows in the Order Lines list', EXPECTED_ITEM_ROW_COUNT, rowCount);
      record('Number of named columns read on the item row', EXPECTED_NAMED_COLUMN_COUNT, columns.length);
      columns.forEach((caption) => {
        record(
          `Cell alignment - "${caption}" (a value that is not centred sits off-centre under its header)`,
          EXPECTED_CELL_ALIGNMENT,
          alignments[caption].cell
        );
      });
      columns.forEach((caption) => {
        OBSERVATIONS.push(`header alignment - "${caption}" : ${alignments[caption].header}`);
      });

      printVerify();

      const misaligned = columns.filter((c) => alignments[c].cell !== EXPECTED_CELL_ALIGNMENT);
      const allPassed = CHECKS.every((c) => c.pass);

      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Order Lines cell alignment`,
        passed: allPassed,
        highlight: '.o_notebook .tab-pane.active table.o_list_view',
        lines: verifyLines(),
      }).catch(() => {});

      expect(rowCount, 'the Order Lines list must carry the item this test added').toBe(
        EXPECTED_ITEM_ROW_COUNT
      );
      expect(columns.length, 'the item row must be read across all 16 named columns').toBe(
        EXPECTED_NAMED_COLUMN_COUNT
      );
      expect(
        misaligned,
        `every Order Lines cell must be ${EXPECTED_CELL_ALIGNMENT}-aligned - these are not: ` +
          misaligned.map((c) => `${c} = ${alignments[c].cell}`).join(', ')
      ).toEqual([]);
    });
  });
});
