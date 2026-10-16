import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, PortalFunctionalityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  CRM-8339 - Pen test findings 5.9 (Vulnerable JS Library - jQuery DataTables)
 *  US3 - Preserve portal functionality
 * =============================================================================================
 *  Test Case ID     : CRM-8339_1.2
 *  Jira             : CRM-11492 (Xray Manual Steps, 5 steps)
 *  Source version   : CRM-11492 step 3 REWRITTEN 2026-10-14 (see below). NOTE: the issue's
 *                     fields.updated still reads 2026-07-09T10:37+0300 - an Xray step edit made
 *                     through the raven API does NOT bump it, so the usual "is the source newer
 *                     than the spec" check cannot see a step rewrite. Compare the STEP TEXT.
 *  Test Repository  : /CRM test/Security/CRM-8339_Pen test findings 5.9/US3 Preserve portal functionality
 *  Target           : pre-production.nakivo.site
 *  Run as           : partner portal user (reseller_bronze) - see PRE-CONDITION DATA below
 *  Automation-Type  : refactored
 *  Automation-Date  : 2026-10-14
 *  Evidence         : one screenshot at the end of each "Steps to reproduce" section, a
 *                     verify-point capture on the list table, plus afterEach start/end.
 *
 *  Summary
 *  ---------------------------------------------------------------------------------------------
 *  Checks that a partner-facing list still renders, sorts, searches and paginates after the
 *  remediation. Sorting is driven through the list's own sort dropdown, which is what this portal
 *  offers - the manual case was reworded on 2026-10-14 to say so.
 *
 *  Command to run
 *  ---------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-8339_1\\.2:" --project=chromium
 *
 *  ---------------------------------------------------------------------------------------------
 *  Source manual TC - CRM-11492 (verbatim, in order)
 *  ---------------------------------------------------------------------------------------------
 *  Pre-conditions:
 *    A remediated build of the Odoo Portal is deployed
 *    Log in as an active partner with enough data to fill a table over more than one page:
 *      _ Login = an active partner
 *      _ Data  = the partner has at least 15 rows in a portal list (e.g. Licenses or Support
 *                tickets) so pagination appears
 *
 *  Steps to reproduce #1 - open a list:
 *    1. Log in to the portal
 *       Expected: (EMPTY IN JIRA - see OPEN POINTS #1)
 *       AUTOMATION: run as a Pre-condition, because it is the sign-in and not the check.
 *    2. Open a portal page that shows an interactive table (e.g. the Licenses list)
 *       Expected: 2. Table renders fully with headers, rows and controls (search box, pagination,
 *       page-size)
 *
 *  Steps to reproduce #2 - sort, search, paginate:
 *    3. Open the sort dropdown above the table - top right, next to the search box - and choose a
 *       different sort field.
 *       NOTE: these partner lists render NO clickable column headers. The column titles are
 *       rendered as the first row of the table body, so sorting is offered only through this
 *       dropdown.
 *       Expected: 3. On My Orders the dropdown offers exactly three fields, in this order:
 *       (1) Order Date (2) Reference (3) Stage.
 *       Choosing one of them puts ?sortby=<field> in the address, the dropdown title changes to the
 *       chosen field, and the rows re-order - the column no longer reads in the sequence it had
 *       before.
 *    4. Type a value in the table's search box
 *       Expected: 4. Table filters to only the matching rows as you type
 *    5. Move to page 2 using the pagination control
 *       Expected: 5. Pagination moves between pages and shows the correct rows, with no
 *       JavaScript / console error
 *
 *  ---------------------------------------------------------------------------------------------
 *  PRE-CONDITION DATA - why reseller_bronze and why My Orders
 *  ---------------------------------------------------------------------------------------------
 *  The case needs a partner with at least 15 rows in a list. Counted on pre-production 2026-10-13
 *  across the six partner test accounts: only two hold data at all - reseller_bronze (83 Sales
 *  Orders, 58 Invoices, 73 Opportunities on its portal) and distributor_partner (31 orders).
 *  reseller_gold, reseller_basic, reseller_silver and msp_partner hold zero of everything, so a
 *  run as any of those would exercise an empty list and pass vacuously.
 *
 *  The case names the Licenses list as its example. There is NO licences area on this portal -
 *  /my/licenses answers HTTP 404 (measured 2026-10-13) - so the check is repointed to My Orders,
 *  which is a partner-facing list of the same kind and holds enough rows to paginate. The repoint
 *  is stated here rather than hidden, and belongs in the manual case too.
 *
 *  ---------------------------------------------------------------------------------------------
 *  STEP 3 WAS REWORDED ON 2026-10-14 - WHAT CHANGED AND WHY
 *  ---------------------------------------------------------------------------------------------
 *  The case used to read "Click a column header to sort", which has no target on this portal:
 *  the partner lists render their table with ZERO <thead> header cells, and the column titles
 *  ("ORDER #", "ORDER DATE", "TOTAL") are rendered as the first <tbody> row. That was reported as
 *  D.3 on CRM-12630 on 2026-09-30, and Vitalii Ivanov answered on 2026-10-09: "The case needs
 *  rewording. Those portal lists are not the dashboard tables this library drives; on those
 *  screens sorting is offered as a separate control, so 'click the column header' was never
 *  achievable there."
 *
 *  Measured on pre-production 2026-10-14, the control that IS offered: a dropdown above the table,
 *  top right beside the search box, whose title shows the current sort field and whose items are
 *  links carrying ?sortby=<field>. On My Orders it offers Order Date (sortby=date), Reference
 *  (sortby=name) and Stage (sortby=stage); on My Invoices, Order Date, Due Date, Reference and
 *  Status. Its list carries the `hidden` attribute until the title is clicked.
 *
 *  Xray step 132977 on CRM-11492 was rewritten to match, and this spec now EXERCISES step 3
 *  instead of skipping it. The header-cell count is still measured and printed, because it is the
 *  fact that makes the old wording impossible and it is what would change if the product ever
 *  gains real column headers.
 *
 *  Note that step 2 still expects the table to render "with headers" and a "page-size" control.
 *  The column titles ARE rendered - just not as header cells - and there is no page-size control
 *  at all. Those two are left alone here: only step 3 was in scope for the rewording.
 *
 *  ---------------------------------------------------------------------------------------------
 *  OPEN POINTS raised by this spec (for CRM-12630 / the case author, not invented answers)
 *  ---------------------------------------------------------------------------------------------
 *  1. Manual step 1 has an EMPTY Expected Result in Xray. Nothing is asserted for it here; the
 *     case author has to fill it in.
 *  2. Step 2 expects a "page-size" control. The partner lists offer a search box and a pager but
 *     no page-size selector (measured 2026-10-13). The spec reports what it found and does not
 *     score that part.
 *  3. The case names the Licenses list, which does not exist (/my/licenses -> 404).
 * =============================================================================================
 */

const TC = 'CRM-8339_1.2';

/** The list the check is repointed to - see PRE-CONDITION DATA. */
const LIST_PATH = 'my/orders';
const LIST_LABEL = 'My Orders';
/** The list the manual case names, kept so the 404 is reported rather than quietly dropped. */
const LIST_PATH_FROM_CASE = 'my/licenses';
/** Column titles as this list renders them, grounded on pre-production 2026-10-13. */
const EXPECTED_COLUMN_TITLES = ['ORDER #', 'ORDER DATE', 'TOTAL'];
/** The sort fields this list offers, in the order the dropdown lists them (measured 2026-10-14). */
const EXPECTED_SORT_OPTIONS = ['Order Date', 'Reference', 'Stage'];
/** The field step 3 switches to, and the value it puts in the address. */
const SORT_CHOICE = 'Reference';
const SORT_CHOICE_PARAM = 'sortby=name';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Use a partner that has at least 15 rows in a portal list',
  pre2: 'Pre-condition 2: Log in to the portal (source step 1)',
  s2: 'Step 2: Open a portal page that shows an interactive table (e.g. the Licenses list)',
  s3: 'Step 3: Open the sort dropdown above the table and choose a different sort field',
  s4: "Step 4: Type a value in the table's search box",
  s5: 'Step 5: Move to page 2 using the pagination control',
  verify: 'Verification',
} as const;

test.describe('CRM-8339 Security - preserve portal functionality (US3)', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - afterEach - start`).catch(
      () => {}
    );
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const reason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (reason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${reason.replace(/\n/g, '\n   ')}`);
      }
    }
    // No teardown: this TC only reads partner-facing lists and creates nothing.
    await CommonUtils.captureAndAttachScreenshot(
      page,
      testInfo,
      `${TC} - afterEach - teardown done`
    ).catch(() => {});
  });

  test(`${TC}: Interactive tables on the portal still render, sort, search and paginate after the JS library remediation`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const portalPage = new PortalFunctionalityPage(page);
    const partner = users.reseller_bronze;

    // Step 5 expects "no JavaScript / console error" - collect them for the whole run.
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
    });
    page.on('pageerror', (err) => pageErrors.push(String(err.message).slice(0, 200)));

    let licensesStatus = 0;
    let listStatus = 0;
    let summary = await portalPage.getPortalListSummary();
    let sortAffordance = { clickableHeaders: 0, sortByLinks: [] as string[] };
    let sortDropdownBefore = { title: '', options: [] as { text: string; sortBy: string }[] };
    let sortDropdownAfter = { title: '', options: [] as { text: string; sortBy: string }[] };
    let orderColumnBeforeSort: string[] = [];
    let orderColumnAfterSort: string[] = [];
    let sortChosen = false;
    let urlAfterSort = '';
    let rowsBeforeSearch: string[] = [];
    let searchTerm = '';
    let rowsWhileFiltered: string[] = [];
    let summaryWhileFiltered = summary;
    let movedToPageTwo = false;
    let rowsOnPageTwo: string[] = [];
    let urlOnPageTwo = '';

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Account : ${partner.username}`);
      console.log('  - Chosen because it is one of only two partner test accounts on');
      console.log('    pre-production that hold portal data at all (83 Sales Orders on 2026-10-13).');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log('  NOTE: manual step 1 has an EMPTY Expected Result in Xray - nothing is');
      console.log('        asserted for it here. See OPEN POINTS #1 in the header.');
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(partner.username, partner.password);
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      console.log(`  - Landed on : ${page.url()}`);
    });

    // ------------------------------------------------- Steps to reproduce #1
    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      licensesStatus = await portalPage.openPortalPath(baseUrl, LIST_PATH_FROM_CASE);
      console.log(`  - ${LIST_PATH_FROM_CASE} (the list the case names) : HTTP ${licensesStatus}`);
      if (licensesStatus === 404) {
        console.log('    -> no licences area exists on this portal; repointing to the list below.');
      }

      listStatus = await portalPage.openPortalPath(baseUrl, LIST_PATH);
      summary = await portalPage.getPortalListSummary();
      rowsBeforeSearch = await portalPage.getPortalListRowTexts();
      console.log(`  - ${LIST_PATH} (${LIST_LABEL}) : HTTP ${listStatus}`);
      console.log(`  - Table class        : ${summary.cssClass}`);
      console.log(`  - <thead> cells      : ${summary.theadCells}`);
      console.log(`  - Column titles      : ${JSON.stringify(summary.columnTitles)}`);
      console.log(`  - Rows in the table  : ${summary.bodyRows}`);
      console.log(`  - Search box present : ${summary.hasSearchBox}`);
      console.log(`  - Pager              : "${summary.pagerText}"`);
      console.log(`  - Pager links        : ${JSON.stringify(summary.pagerLinks.map((l) => l.text))}`);

      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `${TC} - Steps to reproduce I - ${LIST_LABEL} list rendered`
      );
    });

    // ------------------------------------------------- Steps to reproduce #2
    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      sortAffordance = await portalPage.getSortAffordance();
      sortDropdownBefore = await portalPage.getSortDropdown();
      orderColumnBeforeSort = await portalPage.getPortalListRowTexts();
      console.log(`  - <thead> header cells to click : ${summary.theadCells}`);
      console.log(`  - Clickable sortable headers    : ${sortAffordance.clickableHeaders}`);
      console.log(`  - Sort dropdown title           : ${sortDropdownBefore.title}`);
      console.log('  - Sort dropdown offers:');
      sortDropdownBefore.options.forEach((o, i) =>
        console.log(`      (${i + 1}) ${o.text.padEnd(14)} -> sortby=${o.sortBy}`)
      );

      sortChosen = await portalPage.chooseSortOption(SORT_CHOICE);
      urlAfterSort = page.url();
      sortDropdownAfter = await portalPage.getSortDropdown();
      orderColumnAfterSort = await portalPage.getPortalListRowTexts();
      console.log(`  - Chose "${SORT_CHOICE}"            : ${sortChosen}`);
      console.log(`  - URL after sorting             : ${urlAfterSort}`);
      console.log(`  - Dropdown title after          : ${sortDropdownAfter.title}`);
      console.log(`  - First row before              : ${(orderColumnBeforeSort[1] ?? '').slice(0, 70)}`);
      console.log(`  - First row after               : ${(orderColumnAfterSort[1] ?? '').slice(0, 70)}`);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      // search for the order reference of the first real data row (row 0 holds the column titles)
      const firstDataRow = rowsBeforeSearch.find(
        (r) => r && !EXPECTED_COLUMN_TITLES.every((t) => r.includes(t))
      );
      searchTerm = (firstDataRow ?? '').split(' ')[0] ?? '';
      console.log(`  - First data row  : ${firstDataRow}`);
      console.log(`  - Searching for   : "${searchTerm}"`);

      await portalPage.searchInPortalList(searchTerm);
      summaryWhileFiltered = await portalPage.getPortalListSummary();
      rowsWhileFiltered = await portalPage.getPortalListRowTexts();
      console.log(`  - Rows after the search : ${summaryWhileFiltered.bodyRows}`);
      rowsWhileFiltered.forEach((r) => console.log(`      ${r.slice(0, 90)}`));
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      await portalPage.openPortalPath(baseUrl, LIST_PATH);
      movedToPageTwo = await portalPage.clickPagerLink('2');
      urlOnPageTwo = page.url();
      rowsOnPageTwo = await portalPage.getPortalListRowTexts();
      console.log(`  - Clicked pager link "2" : ${movedToPageTwo}`);
      console.log(`  - URL on page 2          : ${urlOnPageTwo}`);
      console.log(`  - Rows on page 2         : ${rowsOnPageTwo.length}`);
      console.log(`  - Console errors so far  : ${consoleErrors.length}`);
      consoleErrors.slice(0, 5).forEach((e) => console.log(`      ${e}`));
      console.log(`  - Uncaught page errors   : ${pageErrors.length}`);
      pageErrors.slice(0, 5).forEach((e) => console.log(`      ${e}`));

      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `${TC} - Steps to reproduce II - search and pagination exercised`
      );
    });

    // ------------------------------------------------------------- Verification
    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);

      const listLoadedOk = listStatus === 200;
      const titlesOk =
        JSON.stringify(summary.columnTitles) === JSON.stringify(EXPECTED_COLUMN_TITLES);
      const rowsOk = summary.bodyRows > EXPECTED_COLUMN_TITLES.length - EXPECTED_COLUMN_TITLES.length + 1;
      const controlsOk = summary.hasSearchBox && summary.pagerLinks.length > 0;
      const sortOptionsOk =
        JSON.stringify(sortDropdownBefore.options.map((o) => o.text)) ===
        JSON.stringify(EXPECTED_SORT_OPTIONS);
      const sortAppliedOk =
        sortChosen &&
        urlAfterSort.includes(SORT_CHOICE_PARAM) &&
        sortDropdownAfter.title === SORT_CHOICE;
      const sortReorderedOk =
        orderColumnBeforeSort.length > 1 &&
        JSON.stringify(orderColumnAfterSort) !== JSON.stringify(orderColumnBeforeSort);
      const searchNarrowedOk =
        searchTerm !== '' &&
        summaryWhileFiltered.bodyRows < summary.bodyRows &&
        rowsWhileFiltered.some((r) => r.includes(searchTerm));
      const paginationOk =
        movedToPageTwo && /\/page\/2/.test(urlOnPageTwo) && rowsOnPageTwo.length > 1;
      const differentRowsOk =
        JSON.stringify(rowsOnPageTwo) !== JSON.stringify(rowsBeforeSearch);
      const noJsErrorsOk = pageErrors.length === 0;

      const verifyLines = [
        `List        : ${LIST_LABEL} (HTTP ${listStatus})`,
        `thead cells : ${summary.theadCells}`,
        `Rows        : ${summary.bodyRows}`,
        `Sort        : ${sortDropdownBefore.title} -> ${sortDropdownAfter.title}`,
        `Search      : ${summary.bodyRows} -> ${summaryWhileFiltered.bodyRows}`,
        `Page 2 URL  : ${urlOnPageTwo.replace(baseUrl, '/')}`,
      ];

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The portal list page loads:');
      console.log(`     Expected : HTTP 200 for ${LIST_PATH}`);
      console.log(`     Actual   : HTTP ${listStatus}`);
      console.log(`     Result   : ${listLoadedOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #2 - The table renders its column titles:');
      console.log(`     Expected : exactly ${EXPECTED_COLUMN_TITLES.length} titles, in this order: ${EXPECTED_COLUMN_TITLES.join(', ')}`);
      console.log(`     Actual   : ${summary.columnTitles.join(', ')}`);
      console.log(`     Result   : ${titlesOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #3 - The table renders data rows:');
      console.log(`     Expected : more than one row - the first row holds the column titles, so a table with only that row is an empty list and this case would be passing vacuously`);
      console.log(`     Actual   : ${summary.bodyRows} rows`);
      console.log(`     Result   : ${rowsOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #4 - The list offers its controls:');
      console.log(`     Expected : a search box and a pager with page links`);
      console.log(`     Actual   : search=${summary.hasSearchBox}, pager="${summary.pagerText}"`);
      console.log(`     Result   : ${controlsOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #5 - The sort dropdown offers its fields unchanged:');
      console.log(`     Expected : exactly ${EXPECTED_SORT_OPTIONS.length} fields, in this order: ${EXPECTED_SORT_OPTIONS.join(', ')} (this dropdown is the ONLY sort control these lists have - there are no clickable column headers, which is why the manual case was reworded on 2026-10-14)`);
      console.log(`     Actual   : ${sortDropdownBefore.options.map((o) => o.text).join(', ') || '(none)'}`);
      console.log(`     Result   : ${sortOptionsOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #6 - Choosing a field applies it:');
      console.log(`     Expected : the address gains "${SORT_CHOICE_PARAM}" and the dropdown title becomes "${SORT_CHOICE}" (a title still showing the old field means the click reached the link but the list did not re-render)`);
      console.log(`     Actual   : chosen=${sortChosen}, url="${urlAfterSort}", title="${sortDropdownAfter.title}"`);
      console.log(`     Result   : ${sortAppliedOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #7 - The rows actually re-order:');
      console.log(`     Expected : the rendered rows are NOT in the sequence they had under the default sort - an unchanged sequence means the sort parameter was accepted and ignored, which no check on the URL alone would catch`);
      console.log(`     Actual   : first row "${(orderColumnBeforeSort[1] ?? '').slice(0, 40)}" -> "${(orderColumnAfterSort[1] ?? '').slice(0, 40)}"`);
      console.log(`     Result   : ${sortReorderedOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #8 - The search box narrows the list to matching rows:');
      console.log(`     Expected : searching "${searchTerm}" leaves fewer rows than the ${summary.bodyRows} shown before, and a remaining row contains the term (an unchanged row count means the search did not run)`);
      console.log(`     Actual   : ${summaryWhileFiltered.bodyRows} rows remain`);
      console.log(`     Result   : ${searchNarrowedOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #9 - Pagination moves to page 2:');
      console.log(`     Expected : the pager link "2" is clickable, the address becomes a /page/2 address, and rows render there`);
      console.log(`     Actual   : clicked=${movedToPageTwo}, url="${urlOnPageTwo}", rows=${rowsOnPageTwo.length}`);
      console.log(`     Result   : ${paginationOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #10 - Page 2 shows different rows from page 1:');
      console.log(`     Expected : the rows on page 2 are not the page-1 rows repeated (a pager that changes the address but not the content is the classic broken-pagination symptom)`);
      console.log(`     Actual   : ${differentRowsOk ? 'different' : 'IDENTICAL to page 1'}`);
      console.log(`     Result   : ${differentRowsOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #11 - No uncaught JavaScript error during the run:');
      console.log(`     Expected : 0 uncaught page errors (step 5 asks for "no JavaScript / console error"; an uncaught error is the part that is unambiguous - console noise is reported separately below and not scored, because this portal logs unrelated warnings as errors)`);
      console.log(`     Actual   : ${pageErrors.length} uncaught error(s)`);
      console.log(`     Result   : ${noJsErrorsOk ? 'PASS' : 'FAIL'}`);

      console.log('');
      console.log(`  Observation (not scored) - <thead> header cells on this list : ${summary.theadCells}`);
      console.log('     Zero, which is what made the old wording of step 3 ("click a column header")');
      console.log('     impossible. Kept as an observation because it is the fact that would change');
      console.log('     if the product ever gains real column headers - at which point the reworded');
      console.log('     step 3 should be revisited.');
      console.log(`     Sort links offered on this list : ${JSON.stringify(sortAffordance.sortByLinks)}`);
      console.log(`  Observation (not scored) - console messages of type "error" : ${consoleErrors.length}`);
      console.log(`  Observation (not scored) - ${LIST_PATH_FROM_CASE}, the list the case names : HTTP ${licensesStatus}`);
      console.log('===============================================');

      const overall =
        listLoadedOk &&
        titlesOk &&
        rowsOk &&
        controlsOk &&
        sortOptionsOk &&
        sortAppliedOk &&
        sortReorderedOk &&
        searchNarrowedOk &&
        paginationOk &&
        differentRowsOk &&
        noJsErrorsOk;
      console.log(
        `OVERALL: ${overall ? 'PASS' : 'FAIL'} - ${LIST_LABEL} renders, sorts through its dropdown, searches and paginates`
      );

      let verifyPassed = false;
      try {
        expect(listStatus, `${LIST_PATH} should load`).toBe(200);
        expect(summary.columnTitles, 'the list should render its column titles').toEqual(
          EXPECTED_COLUMN_TITLES
        );
        expect(
          summary.bodyRows,
          'the list should hold data rows, not only the title row'
        ).toBeGreaterThan(1);
        expect(summary.hasSearchBox, 'the list should offer a search box').toBe(true);
        expect(summary.pagerLinks.length, 'the list should offer a pager').toBeGreaterThan(0);
        expect(
          sortDropdownBefore.options.map((o) => o.text),
          'the sort dropdown should offer its fields unchanged'
        ).toEqual(EXPECTED_SORT_OPTIONS);
        expect(sortChosen, `the sort dropdown should offer "${SORT_CHOICE}"`).toBe(true);
        expect(urlAfterSort, `the address should carry ${SORT_CHOICE_PARAM}`).toContain(
          SORT_CHOICE_PARAM
        );
        expect(sortDropdownAfter.title, 'the dropdown should show the chosen field').toBe(
          SORT_CHOICE
        );
        expect(
          sortReorderedOk,
          'the rows should be in a different sequence after sorting by a different field'
        ).toBe(true);
        expect(searchTerm, 'a search term should have been taken from the first data row').not.toBe(
          ''
        );
        expect(
          summaryWhileFiltered.bodyRows,
          `the search should narrow the list below the ${summary.bodyRows} rows shown before it`
        ).toBeLessThan(summary.bodyRows);
        expect(
          rowsWhileFiltered.some((r) => r.includes(searchTerm)),
          'a remaining row should contain the searched term'
        ).toBe(true);
        expect(movedToPageTwo, 'the pager link "2" should be clickable').toBe(true);
        expect(urlOnPageTwo, 'the address should become a /page/2 address').toMatch(/\/page\/2/);
        expect(rowsOnPageTwo.length, 'page 2 should render rows').toBeGreaterThan(1);
        expect(
          JSON.stringify(rowsOnPageTwo),
          'page 2 should not repeat the page-1 rows'
        ).not.toBe(JSON.stringify(rowsBeforeSearch));
        expect(
          pageErrors,
          `the run should raise no uncaught JavaScript error, got: ${pageErrors.join(' | ')}`
        ).toHaveLength(0);
        verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - ${LIST_LABEL} list behaviour`,
          passed: verifyPassed,
          lines: verifyLines,
        }).catch(() => {});
      }
    });
  });
});
