import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, DataTablesDashboardPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  CRM-8339 - Pen test findings 5.9 (Vulnerable JS Library - jQuery DataTables)
 *  US4 - Dashboard regression after the 1.10.21 -> 1.13.11 upgrade
 *  Screen 4 of 6 - Contractors > Ranking > HR Contractors Ranking Report
 * =============================================================================================
 *  Test Case ID     : CRM-8339_2.4
 *  Jira             : CRM-12630 (Implementation - Dev), parent CRM-8339, spec CRM-11483
 *  Test Repository  : CRM test/Security/CRM-8339_Pen test findings 5.9/US4 Dashboard regression
 *                     after the DataTables upgrade   (NOT YET FILED IN XRAY - see OPEN POINTS)
 *  Target           : pre-production.nakivo.site
 *  Run as           : CRM admin (admin_crm, anh.ho@nakivo.com) - the dashboards are internal
 *                     back-office screens, so a portal account cannot reach them
 *  Automation-Type  : new
 *  Automation-Date  : 2026-10-13
 *  Source           : Vitalii Ivanov, comments on CRM-12630 (2026-09-25 and 2026-10-09)
 *  Source version   : CRM-12630 updated 2026-10-09T19:16+0300 - re-check before trusting this spec
 *  Evidence         : one screenshot at the end of each "Steps to reproduce" section, a
 *                     verify-point capture on the rendered table, plus afterEach start/end.
 *
 *  Summary
 *  ---------------------------------------------------------------------------------------------
 *  Runs Vitalii's post-upgrade regression checklist against HR Contractors Ranking Report. This
 *  dashboard holds NO ROWS on pre-production, so the spec verifies everything that does not need
 *  data - the columns, the empty state, the sort arrows, the controls - and reports the
 *  row-dependent items as unexercised rather than claiming a pass it did not earn.
 *
 *  Command to run
 *  ---------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-8339_2\\.4:" --project=chromium
 *
 *  ---------------------------------------------------------------------------------------------
 *  Source manual TC - CRM-12630, Vitalii Ivanov 2026-09-25 "Next step" #2 (verbatim, in order)
 *  ---------------------------------------------------------------------------------------------
 *  "Then the regression on the 6 reachable dashboard screens: [...] Contractors > Ranking > HR
 *   Contractors Ranking Report, [...]. Look at: table renders, sorting by column header, sort
 *   arrows, pagination and "Show N entries", the search box, CSV export, general appearance."
 *
 *  ---------------------------------------------------------------------------------------------
 *  WHY THIS CASE SCORES LESS THAN ITS SIBLINGS - READ BEFORE QUOTING IT AS COVERAGE
 *  ---------------------------------------------------------------------------------------------
 *  Measured on pre-production 2026-10-13: hr_contractors_ranking_table renders with its two column
 *  headers, the DataTables controls and the cell "No data available in table" - and ZERO rows.
 *  With no rows:
 *    - sorting cannot be shown to re-order anything (there is nothing to re-order),
 *    - the search box cannot be shown to filter anything down,
 *    - the paginator cannot be shown to reach a second page.
 *  Those three are therefore reported as OBSERVATIONS, not scored. What IS scored is everything
 *  the upgrade could still have broken without data: the table initialises, the columns are
 *  unchanged, the empty state is the library's own, the sort arrows still toggle on a header
 *  click, the length menu offers its values and all four injected controls are on screen.
 *  A green run of this case does NOT establish that sorting, searching and paging work here - it
 *  establishes that the library still drives the screen. Seeding rows is what would close it.
 *
 *  Pre-condition(s):
 *    1. Log in to http://pre-production.nakivo.site/web#home as the CRM admin.
 *
 *  Steps to reproduce #1 - the table renders:
 *    1. Open Contractors > Ranking > HR Contractors Ranking Report.
 *       AUTOMATION: opened by client-action id 2177 (ir.ui.menu 837, read on pre-production
 *       2026-10-13).
 *    2. Check the table renders.
 *       Expected: DataTables has taken over hr_contractors_ranking_table and shows exactly two
 *       columns, in this order: (1) Contractors (2) Mark.
 *       With no data the body holds the library's own empty cell reading exactly "No data
 *       available in table" and the info line reads exactly "Showing 0 to 0 of 0 entries".
 *
 *  Steps to reproduce #2 - sorting:
 *    3. Click a column header to sort.
 *       Expected: the click is accepted and the table stays in its empty state - no error, and the
 *       empty cell and info line are unchanged. (The ORDER cannot be checked: there are no rows.)
 *    4. Check the sort arrows.
 *       Expected: across two clicks the header carries sorting_asc once and sorting_desc once -
 *       the arrow is drawn from that class, so this still verifies the sort UI after the upgrade
 *       even with no data behind it.
 *
 *  Steps to reproduce #3 - pagination and search:
 *    5. Use pagination and "Show N entries".
 *       Expected: the length menu offers exactly these values, in this order: 10, 25, 50, 100, and
 *       the paginator is on screen. With 0 entries Next does not advance and the info line stays
 *       "Showing 0 to 0 of 0 entries".
 *    6. Use the search box.
 *       Expected: the box holds the text that was typed and the table stays empty, with the info
 *       line unchanged at "Showing 0 to 0 of 0 entries"; clearing the box empties it again.
 *       MEASURED 2026-10-13: with 0 records DataTables omits its "(filtered from N total entries)"
 *       clause altogether, so its ABSENCE here is correct behaviour and not a defect. The input's
 *       own value is therefore what evidences that the search box still works.
 *
 *  Steps to reproduce #4 - export and appearance:
 *    7. CSV export.
 *       [NOT EXECUTABLE - this dashboard offers no export control at all] Measured on
 *       pre-production 2026-10-13. Reported as an OBSERVATION, not scored - see OPEN POINTS.
 *    8. General appearance.
 *       Expected: all four controls DataTables injects are on screen - the length menu, the search
 *       box, the info line and the paginator. The screenshot attached to this step is the artifact
 *       for the human visual judgement, which no assertion can replace.
 *
 *  ---------------------------------------------------------------------------------------------
 *  OPEN POINTS raised by this spec (for CRM-12630, not invented answers)
 *  ---------------------------------------------------------------------------------------------
 *  1. This screen has no rows on pre-production, so sorting, searching and paging are unexercised
 *     here. Vitalii has to say whether that is acceptable coverage for the upgrade or whether the
 *     screen should be seeded before sign-off.
 *  2. RESOLVED 2026-10-15 - Vitalii Ivanov confirmed CSV export comes OFF the checklist: "My error
 *     in the checklist. The control does exist - it belongs to the widgets of the main dashboards,
 *     which is why it shows on the Sales screen's charts - but none of the six screens' templates
 *     carry it. It was never a DataTables feature here, so there is nothing to score."
 *  3. These CRM-8339_2.x cases are not yet filed as Xray Test Cases.
 * =============================================================================================
 */

const TC = 'CRM-8339_2.4';

/** Contractors > Ranking > HR Contractors Ranking Report - ir.ui.menu 837. */
const DASHBOARD_MENU_PATH = 'Contractors > Ranking > HR Contractors Ranking Report';
const DASHBOARD_ACTION_ID = 2177;

/** Grounded on pre-production 2026-10-13. */
const EXPECTED_TABLE_ID = 'hr_contractors_ranking_table';
const EXPECTED_HEADERS = ['Contractors', 'Mark'];
const EXPECTED_LENGTH_OPTIONS = ['10', '25', '50', '100'];
/** The library's own empty-state text and info line, asserted verbatim. */
const EXPECTED_EMPTY_MESSAGE = 'No data available in table';
const EXPECTED_EMPTY_INFO = 'Showing 0 to 0 of 0 entries';
/** The column the sort-arrow check drives. */
const SORT_COLUMN_INDEX = 0;
/** Any string - with no rows the point is that the box accepts input and nothing breaks. */
const SEARCH_TERM = 'zzz-no-such-row';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Log in to http://pre-production.nakivo.site/web#home as the CRM admin',
  s1: 'Step 1: Open Contractors > Ranking > HR Contractors Ranking Report',
  s2: 'Step 2: Check the table renders',
  s3: 'Step 3: Click a column header to sort',
  s4: 'Step 4: Check the sort arrows',
  s5: 'Step 5: Use pagination and "Show N entries"',
  s6: 'Step 6: Use the search box',
  s7: 'Step 7: [NOT EXECUTABLE - this dashboard offers no export control at all] CSV export',
  s8: 'Step 8: General appearance',
  verify: 'Verification',
} as const;

/** Which way the header's own arrow says the column is sorted. */
const directionOf = (headerClass: string): 'ascending' | 'descending' | 'none' => {
  if (headerClass.includes('sorting_asc')) return 'ascending';
  if (headerClass.includes('sorting_desc')) return 'descending';
  return 'none';
};

test.describe('CRM-8339 Security - DataTables dashboard regression (US4)', () => {
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
      await CommonUtils.waitForSpinnersToHide(
        page,
        CommonUtils.waitTimes.extraLong,
        CommonUtils.waitTimes.abnormalWait
      ).catch(() => {});
    }
    // No teardown: this TC only reads a dashboard and creates nothing.
    await CommonUtils.captureAndAttachScreenshot(
      page,
      testInfo,
      `${TC} - afterEach - teardown done`
    ).catch(() => {});
  });

  test(`${TC}: ${DASHBOARD_MENU_PATH} still renders its columns, empty state and sort controls after the DataTables upgrade`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const dashboardPage = new DataTablesDashboardPage(page);

    let summary = await dashboardPage.getTableSummary();
    let classAfterFirstClick = '';
    let classAfterSecondClick = '';
    let emptyMessageAfterSort = '';
    let infoAfterSort = '';
    let infoDefault = '';
    let movedToPageTwo = false;
    let infoAfterNext = '';
    let infoWhileFiltered = '';
    let rowsWhileFiltered = 0;
    let searchBoxWhileFiltered = '';
    let searchBoxAfterClearing = '';
    let infoAfterClearing = '';
    let exportControls: string[] = [];

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`  - Account   : ${users.admin_crm.username}`);
      console.log(`  - Landed on : ${page.url()}`);
    });

    // ------------------------------------------------- Steps to reproduce #1
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await dashboardPage.openDashboardByActionId(baseUrl, DASHBOARD_ACTION_ID);
      await dashboardPage.waitForDataTableToRender();
      console.log(`  - Dashboard        : ${DASHBOARD_MENU_PATH}`);
      console.log(`  - Client action id : ${DASHBOARD_ACTION_ID}`);
      console.log(`  - URL              : ${page.url()}`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      summary = await dashboardPage.getTableSummary();
      infoDefault = summary.infoText;
      console.log(`  - Table taken over : ${summary.id}`);
      console.log(`  - Column count     : ${summary.headers.length}`);
      summary.headers.forEach((h, i) => console.log(`      (${i + 1}) ${h}`));
      console.log(`  - Rendered rows    : ${summary.renderedRows}`);
      console.log(`  - Empty message    : ${summary.emptyMessage}`);
      console.log(`  - Info line        : ${summary.infoText}`);

      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `${TC} - Steps to reproduce I - dashboard open with the empty table rendered`
      );
    });

    // ------------------------------------------------- Steps to reproduce #2
    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log(`  - Sorting by column : "${EXPECTED_HEADERS[SORT_COLUMN_INDEX]}"`);
      console.log('  - NOTE: 0 rows on this dashboard, so only the sort UI can be checked here.');

      await dashboardPage.clickColumnHeader(SORT_COLUMN_INDEX);
      const afterFirst = await dashboardPage.getTableSummary();
      classAfterFirstClick = afterFirst.headerSortClasses[SORT_COLUMN_INDEX] ?? '';
      console.log(`  - Header class after click 1 : ${classAfterFirstClick}`);

      await dashboardPage.clickColumnHeader(SORT_COLUMN_INDEX);
      const afterSecond = await dashboardPage.getTableSummary();
      classAfterSecondClick = afterSecond.headerSortClasses[SORT_COLUMN_INDEX] ?? '';
      emptyMessageAfterSort = afterSecond.emptyMessage;
      infoAfterSort = afterSecond.infoText;
      console.log(`  - Header class after click 2 : ${classAfterSecondClick}`);
      console.log(`  - Empty message after sorting: ${emptyMessageAfterSort}`);
      console.log(`  - Info line after sorting    : ${infoAfterSort}`);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      console.log(`  - Direction after click 1 : ${directionOf(classAfterFirstClick)}`);
      console.log(`  - Direction after click 2 : ${directionOf(classAfterSecondClick)}`);

      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `${TC} - Steps to reproduce II - sort arrow drawn on the empty table`
      );
    });

    // ------------------------------------------------- Steps to reproduce #3
    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      console.log(`  - "Show N entries" offers : ${JSON.stringify(summary.lengthOptions)}`);
      console.log(`  - Info line at default    : ${infoDefault}`);
      console.log(`  - Page buttons            : ${JSON.stringify(summary.pageButtons)}`);

      movedToPageTwo = await dashboardPage.goToNextPage();
      infoAfterNext = (await dashboardPage.getTableSummary()).infoText;
      console.log(`  - Next advanced the page  : ${movedToPageTwo}`);
      console.log(`  - Info line after Next    : ${infoAfterNext}`);
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      await dashboardPage.searchInTable(SEARCH_TERM);
      const filtered = await dashboardPage.getTableSummary();
      infoWhileFiltered = filtered.infoText;
      rowsWhileFiltered = filtered.renderedRows;
      searchBoxWhileFiltered = await dashboardPage.getSearchBoxValue();
      console.log(`  - Searched for         : "${SEARCH_TERM}"`);
      console.log(`  - Search box holds     : "${searchBoxWhileFiltered}"`);
      console.log(`  - Rows while filtered  : ${rowsWhileFiltered}`);
      console.log(`  - Info while filtered  : ${infoWhileFiltered}`);

      await dashboardPage.clearTableSearch();
      infoAfterClearing = (await dashboardPage.getTableSummary()).infoText;
      searchBoxAfterClearing = await dashboardPage.getSearchBoxValue();
      console.log(`  - Search box after clearing : "${searchBoxAfterClearing}"`);
      console.log(`  - Info after clearing       : ${infoAfterClearing}`);

      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `${TC} - Steps to reproduce III - pagination and search exercised on the empty table`
      );
    });

    // ------------------------------------------------- Steps to reproduce #4
    await test.step(STEP.s7, async () => {
      console.log(`\n--- ${STEP.s7} ---`);
      exportControls = await dashboardPage.getExportControls();
      console.log(`  - Export / CSV controls found : ${exportControls.length}`);
      exportControls.forEach((c) => console.log(`      - ${c}`));
      if (exportControls.length === 0) {
        console.log('    -> none. The checklist item cannot be executed on this screen.');
      }
    });

    await test.step(STEP.s8, async () => {
      console.log(`\n--- ${STEP.s8} ---`);
      const current = await dashboardPage.getTableSummary();
      console.log(`  - Length menu on screen : ${current.hasLengthMenu}`);
      console.log(`  - Search box on screen  : ${current.hasSearchBox}`);
      console.log(`  - Info line on screen   : ${current.hasInfoLine}`);
      console.log(`  - Paginator on screen   : ${current.hasPagination}`);
      summary = current;

      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `${TC} - Steps to reproduce IV - full dashboard for the visual check`
      );
    });

    // ------------------------------------------------------------- Verification
    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);

      const dir1 = directionOf(classAfterFirstClick);
      const dir2 = directionOf(classAfterSecondClick);
      const tableOk = summary.id === EXPECTED_TABLE_ID;
      const headersOk = JSON.stringify(summary.headers) === JSON.stringify(EXPECTED_HEADERS);
      const emptyStateOk =
        summary.renderedRows === 0 &&
        summary.emptyMessage === EXPECTED_EMPTY_MESSAGE &&
        infoDefault === EXPECTED_EMPTY_INFO;
      const sortSurvivedOk =
        emptyMessageAfterSort === EXPECTED_EMPTY_MESSAGE && infoAfterSort === EXPECTED_EMPTY_INFO;
      const arrowsOk = dir1 !== 'none' && dir2 !== 'none' && dir1 !== dir2;
      const lengthOptionsOk =
        JSON.stringify(summary.lengthOptions) === JSON.stringify(EXPECTED_LENGTH_OPTIONS);
      const paginationOk = movedToPageTwo === false && infoAfterNext === EXPECTED_EMPTY_INFO;
      const searchOk =
        searchBoxWhileFiltered === SEARCH_TERM &&
        rowsWhileFiltered === 0 &&
        infoWhileFiltered === EXPECTED_EMPTY_INFO;
      const searchClearedOk =
        searchBoxAfterClearing === '' && infoAfterClearing === EXPECTED_EMPTY_INFO;
      const controlsOk =
        summary.hasLengthMenu && summary.hasSearchBox && summary.hasInfoLine && summary.hasPagination;

      const verifyLines = [
        `Table        : ${summary.id}`,
        `Columns      : ${summary.headers.length}`,
        `Rows         : ${summary.renderedRows} (empty on pre-production)`,
        `Sort arrows  : ${dir1} / ${dir2}`,
        `Info         : ${summary.infoText}`,
      ];

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - DataTables still drives this dashboard table:');
      console.log(`     Expected : the library takes over ${EXPECTED_TABLE_ID} (a different id means the dashboard changed - re-ground this spec before reading anything below it)`);
      console.log(`     Actual   : ${summary.id}`);
      console.log(`     Result   : ${tableOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #2 - The table renders its columns unchanged by the upgrade:');
      console.log(`     Expected : exactly ${EXPECTED_HEADERS.length} columns, in this order: ${EXPECTED_HEADERS.join(', ')}`);
      console.log(`     Actual   : ${summary.headers.join(', ')}`);
      console.log(`     Result   : ${headersOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #3 - The empty state is the library\'s own, drawn verbatim:');
      console.log(`     Expected : 0 rows, the cell "${EXPECTED_EMPTY_MESSAGE}" and the info line "${EXPECTED_EMPTY_INFO}" (this text comes from DataTables itself, so a change to it is a change in the library's rendering - which is exactly what this upgrade could have broken)`);
      console.log(`     Actual   : ${summary.renderedRows} rows, "${summary.emptyMessage}", "${infoDefault}"`);
      console.log(`     Result   : ${emptyStateOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #4 - Sorting an empty table leaves it intact:');
      console.log(`     Expected : after two header clicks the empty cell and info line are unchanged (a blank body or a JS error here would mean the sort path breaks on an empty data set)`);
      console.log(`     Actual   : "${emptyMessageAfterSort}", "${infoAfterSort}"`);
      console.log(`     Result   : ${sortSurvivedOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #5 - The sort arrows show both directions across the two clicks:');
      console.log(`     Expected : one click draws sorting_asc and the other sorting_desc - with no rows to re-order, this class is the ONLY evidence left that the sort UI survived the upgrade`);
      console.log(`     Actual   : click 1 = ${dir1} ("${classAfterFirstClick}"), click 2 = ${dir2} ("${classAfterSecondClick}")`);
      console.log(`     Result   : ${arrowsOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #6 - "Show N entries" offers its values unchanged:');
      console.log(`     Expected : exactly these values, in this order: ${EXPECTED_LENGTH_OPTIONS.join(', ')}`);
      console.log(`     Actual   : ${summary.lengthOptions.join(', ')}`);
      console.log(`     Result   : ${lengthOptionsOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #7 - The paginator does not advance past an empty page:');
      console.log(`     Expected : Next is disabled and the info line stays "${EXPECTED_EMPTY_INFO}" (if Next DID advance, the paginator is drawing pages that hold no data)`);
      console.log(`     Actual   : Next advanced=${movedToPageTwo}, info="${infoAfterNext}"`);
      console.log(`     Result   : ${paginationOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #8 - The search box takes the typed text and the empty table is undisturbed:');
      console.log(`     Expected : the input holds "${SEARCH_TERM}", the table still shows 0 rows and the info line is unchanged at "${EXPECTED_EMPTY_INFO}". NOTE: with 0 records DataTables omits its "(filtered from N total entries)" clause, so looking for that clause here would fail against correct behaviour - the input's own value is the evidence instead`);
      console.log(`     Actual   : input="${searchBoxWhileFiltered}", ${rowsWhileFiltered} row(s), info="${infoWhileFiltered}"`);
      console.log(`     Result   : ${searchOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #9 - Clearing the search empties the box and leaves the table intact:');
      console.log(`     Expected : the input is empty and the info line is still "${EXPECTED_EMPTY_INFO}" (a box that cannot be cleared would strand the dashboard on a filter)`);
      console.log(`     Actual   : input="${searchBoxAfterClearing}", info="${infoAfterClearing}"`);
      console.log(`     Result   : ${searchClearedOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #10 - Every control the library injects is on screen:');
      console.log(`     Expected : the length menu, the search box, the info line and the paginator are all present (the Bootstrap 4 stylesheet is now plain CSS instead of compiled - a control that vanished is how that would show)`);
      console.log(`     Actual   : length=${summary.hasLengthMenu}, search=${summary.hasSearchBox}, info=${summary.hasInfoLine}, paginate=${summary.hasPagination}`);
      console.log(`     Result   : ${controlsOk ? 'PASS' : 'FAIL'}`);

      console.log('  Observation (not scored) - rows on this dashboard : 0');
      console.log('     With no rows, three of Vitalii\'s checklist items are UNEXERCISED here:');
      console.log('     row re-ordering by a column header, the search narrowing a result set, and');
      console.log('     the paginator reaching a second page. A green run of this case does NOT');
      console.log('     establish them - see the header note.');
      console.log(`  Observation (not scored) - export controls offered on this dashboard : ${exportControls.length === 0 ? 'none' : exportControls.join(', ')}`);
      console.log('===============================================');

      const overall =
        tableOk &&
        headersOk &&
        emptyStateOk &&
        sortSurvivedOk &&
        arrowsOk &&
        lengthOptionsOk &&
        paginationOk &&
        searchOk &&
        searchClearedOk &&
        controlsOk;
      console.log(
        `OVERALL: ${overall ? 'PASS' : 'FAIL'} - ${DASHBOARD_MENU_PATH} after the DataTables 1.13.11 upgrade (no rows - partial coverage by design)`
      );

      let verifyPassed = false;
      try {
        expect(summary.id, 'DataTables should still drive the dashboard table').toBe(
          EXPECTED_TABLE_ID
        );
        expect(summary.headers, 'the column headers should be unchanged by the upgrade').toEqual(
          EXPECTED_HEADERS
        );
        expect(summary.renderedRows, 'this dashboard holds no rows on pre-production').toBe(0);
        expect(summary.emptyMessage, 'the library should draw its own empty-state text').toBe(
          EXPECTED_EMPTY_MESSAGE
        );
        expect(infoDefault, 'the info line should report an empty data set').toBe(
          EXPECTED_EMPTY_INFO
        );
        expect(emptyMessageAfterSort, 'sorting should leave the empty state intact').toBe(
          EXPECTED_EMPTY_MESSAGE
        );
        expect(infoAfterSort, 'sorting should leave the info line intact').toBe(EXPECTED_EMPTY_INFO);
        expect([dir1, dir2].sort(), 'the two clicks should draw the two opposite sort arrows').toEqual([
          'ascending',
          'descending',
        ]);
        expect(summary.lengthOptions, 'the "Show N entries" values should be unchanged').toEqual(
          EXPECTED_LENGTH_OPTIONS
        );
        expect(movedToPageTwo, 'Next should not advance past an empty page').toBe(false);
        expect(infoAfterNext, 'the info line should stay on the empty page').toBe(
          EXPECTED_EMPTY_INFO
        );
        expect(searchBoxWhileFiltered, 'the search box should hold the typed text').toBe(
          SEARCH_TERM
        );
        expect(rowsWhileFiltered, 'the filtered table should hold no rows').toBe(0);
        expect(infoWhileFiltered, 'the info line should stay on the empty data set').toBe(
          EXPECTED_EMPTY_INFO
        );
        expect(searchBoxAfterClearing, 'clearing should empty the search box').toBe('');
        expect(infoAfterClearing, 'clearing the search should restore the info line').toBe(
          EXPECTED_EMPTY_INFO
        );
        expect(summary.hasLengthMenu, 'the length menu should be on screen').toBe(true);
        expect(summary.hasSearchBox, 'the search box should be on screen').toBe(true);
        expect(summary.hasInfoLine, 'the info line should be on screen').toBe(true);
        expect(summary.hasPagination, 'the paginator should be on screen').toBe(true);
        verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - ${DASHBOARD_MENU_PATH} regression`,
          passed: verifyPassed,
          lines: verifyLines,
        }).catch(() => {});
      }
    });
  });
});
