import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, DataTablesDashboardPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  CRM-8339 - Pen test findings 5.9 (Vulnerable JS Library - jQuery DataTables)
 *  US4 - Dashboard regression after the 1.10.21 -> 1.13.11 upgrade
 *  Screen 4 - Contractors > Ranking > HR Contractors Ranking Report
 * =============================================================================================
 *  Test Case ID     : CRM-8339_2.4
 *  Jira             : CRM-12630 (Implementation - Dev), parent CRM-8339, spec CRM-11483
 *  Test Repository  : CRM test/Security/CRM-8339_Pen test findings 5.9/US4 Dashboard regression
 *                     after the DataTables upgrade   (NOT YET FILED IN XRAY - see OPEN POINTS)
 *  Target           : pre-production.nakivo.site
 *  Run as           : CRM admin (admin_crm, anh.ho@nakivo.com) - the dashboards are internal
 *                     back-office screens, so a portal account cannot reach them
 *  Automation-Type  : refactored
 *  Automation-Date  : 2026-10-16
 *  Source           : Vitalii Ivanov, comments on CRM-12630 (2026-09-25 and 2026-10-09)
 *  Source version   : CRM-12630 updated 2026-10-09T19:16+0300 - re-check before trusting this spec
 *  Evidence         : one screenshot at the end of each "Steps to reproduce" section, a
 *                     verify-point capture on the rendered table, plus afterEach start/end.
 *
 *  Summary
 *  ---------------------------------------------------------------------------------------------
 *  Runs Vitalii's post-upgrade regression checklist against HR Contractors Ranking Report.
 *
 *  This case used to assert an empty table: the screen opens on "this month", which holds no rows
 *  on pre-production, so sorting, search narrowing and paging were all unexercised and Vitalii
 *  asked on 2026-10-15 for the screen to be seeded. It does not need seeding - the data is there,
 *  just outside the default period. Pre-condition 2 below moves the table to 09/2025, which yields
 *  282 entries, and the full checklist then runs for real.
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
 *  Pre-condition(s):
 *    1. Log in to http://pre-production.nakivo.site/web#home as the CRM admin.
 *    2. Move the table to a month that holds rows: 09/2025.
 *       WHY THIS IS A PRE-CONDITION AND NOT A STEP: it is setup, not what the case verifies. The
 *       screen defaults to "this month" (10/2026 at the time of writing), which holds zero rows on
 *       pre-production. Without this the table renders its empty state and every row-dependent
 *       check below is vacuous.
 *       AUTOMATION: this screen shows ONE MONTH, not a range. Feeding it a start/end pair is
 *       silently ignored - the inputs change, the table never refetches and stays empty, which
 *       reads exactly like a screen that has no data at all. Writing the same month into every
 *       picker does refetch it. The page object then waits for the info line to change rather
 *       than for a fixed delay.
 *
 *  Steps to reproduce #1 - the table renders:
 *    1. Open Contractors > Ranking > HR Contractors Ranking Report.
 *       AUTOMATION: opened by client-action id 2177 (ir.ui.menu 837, read on pre-production
 *       2026-10-13).
 *    2. Check the table renders.
 *       Expected: DataTables has taken over hr_contractors_ranking_table and shows exactly two
 *       columns, in this order: (1) Contractors (2) Mark; the info line reports a non-zero number
 *       of entries.
 *
 *  Steps to reproduce #2 - sorting:
 *    3. Click a column header to sort.
 *       Expected: two clicks produce the two opposite orderings of the Contractors column, and
 *       each rendered order matches the direction the header's own arrow reports.
 *       NOTE: sorting is asserted on the CURRENT PAGE only. DataTables re-sorts the whole data
 *       set and then re-renders page 1, so the ten names on screen are the first ten of the new
 *       order - which is exactly what a user sees and what a broken sort would disturb.
 *    4. Check the sort arrows.
 *       Expected: across the two clicks the header carries sorting_asc once and sorting_desc once.
 *
 *  Steps to reproduce #3 - pagination and search:
 *    5. Use pagination and "Show N entries".
 *       Expected: the length menu offers exactly these values, in this order: 10, 25, 50, 100.
 *       At the default length the info line reports "Showing 1 to 10 of N entries" and Next moves
 *       to a second page whose info line starts at entry 11.
 *    6. Use the search box.
 *       Expected: typing the first row's Contractors value filters the table to only matching rows
 *       and the info line gains "(filtered from N total entries)"; clearing it restores the table.
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
 *  1. RESOLVED 2026-10-15 - Vitalii Ivanov confirmed CSV export comes OFF the checklist: "My error
 *     in the checklist. The control does exist - it belongs to the widgets of the main dashboards,
 *     which is why it shows on the Sales screen's charts - but none of the six screens' templates
 *     carry it. It was never a DataTables feature here, so there is nothing to score."
 *  2. These CRM-8339_2.x cases are not yet filed as Xray Test Cases.
 * =============================================================================================
 */

const TC = 'CRM-8339_2.4';

/** Contractors > Ranking > HR Contractors Ranking Report - ir.ui.menu 837. */
const DASHBOARD_MENU_PATH = 'Contractors > Ranking > HR Contractors Ranking Report';
const DASHBOARD_ACTION_ID = 2177;
/**
 * The month the table is moved to in Pre-condition 2. The screen opens on "this month", which holds
 * no rows on pre-production; 09/2025 held 282 entries when measured on 2026-10-16.
 */
const TARGET_MONTH = '09/2025';

/** Grounded on pre-production 2026-10-13. */
const EXPECTED_TABLE_ID = 'hr_contractors_ranking_table';
const EXPECTED_HEADERS = ['Contractors', 'Mark'];
const EXPECTED_LENGTH_OPTIONS = ['10', '25', '50', '100'];
/** The column the sort check drives - a text column, so ordering is unambiguous. */
const SORT_COLUMN_INDEX = 0;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Log in to http://pre-production.nakivo.site/web#home as the CRM admin',
  pre2: "Pre-condition 2: Move the table to 09/2025, a month that holds rows",
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

/**
 * Ascending compare the way DataTables itself orders a text column: its built-in "string" type
 * lower-cases each value and compares with plain < / >, i.e. by code unit.
 *
 * It deliberately does NOT use localeCompare. Locale collation files an accented name next to its
 * unaccented neighbour ("Aland Islands" beside "Albania") while the library files it after "Zimbabwe",
 * so a locale comparator reports a perfectly good sort as broken. Measured on 2026-10-13 against the
 * 175 country rows of Outside and Inside CM team.
 */
const ascending = (values: string[]): string[] =>
  [...values].sort((a, b) => {
    const x = a.toLowerCase();
    const y = b.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });

/** Which way the header's own arrow says the column is sorted. */
const directionOf = (headerClass: string): 'ascending' | 'descending' | 'none' => {
  if (headerClass.includes('sorting_asc')) return 'ascending';
  if (headerClass.includes('sorting_desc')) return 'descending';
  return 'none';
};

/**
 * Whether the rendered order agrees with the arrow the header is drawing. Holding the rows to the
 * ARROW rather than to a fixed direction means a change of the table's default sort is not
 * misreported as a sorting regression.
 */
const orderMatchesArrow = (values: string[], headerClass: string): boolean => {
  const dir = directionOf(headerClass);
  if (dir === 'none' || values.length === 0) return false;
  const asc = ascending(values);
  const expected = dir === 'ascending' ? asc : [...asc].reverse();
  return JSON.stringify(values) === JSON.stringify(expected);
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

  test(`${TC}: ${DASHBOARD_MENU_PATH} still renders, sorts, paginates and searches after the DataTables upgrade`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const dashboardPage = new DataTablesDashboardPage(page);

    let summary = await dashboardPage.getTableSummary();
    let valuesBeforeSort: string[] = [];
    let valuesAfterFirstClick: string[] = [];
    let valuesAfterSecondClick: string[] = [];
    let classAfterFirstClick = '';
    let classAfterSecondClick = '';
    let infoDefault = '';
    let infoOnPageTwo = '';
    let movedToPageTwo = false;
    let searchTerm = '';
    let infoWhileFiltered = '';
    let filteredRows = 0;
    let infoAfterClearing = '';
    let exportControls: string[] = [];
    let dateInputsBefore: string[] = [];
    let dateInputsAfter: string[] = [];
    let periodApplied = false;

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

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      dateInputsBefore = await dashboardPage.getTableDateRangeInputs();
      const emptyBefore = await dashboardPage.getTableSummary();
      console.log(`  - Table date inputs as the screen opens : ${JSON.stringify(dateInputsBefore)}`);
      console.log(`  - Info line on that default period      : ${emptyBefore.infoText}`);
      console.log(`  - Rows on that default period           : ${emptyBefore.renderedRows}`);

      periodApplied = await dashboardPage.setTableMonth(TARGET_MONTH);
      dateInputsAfter = await dashboardPage.getTableDateRangeInputs();
      const afterWiden = await dashboardPage.getTableSummary();
      console.log(`  - Moved to month                        : ${TARGET_MONTH}`);
      console.log(`  - Table date inputs now                 : ${JSON.stringify(dateInputsAfter)}`);
      console.log(`  - Info line now                         : ${afterWiden.infoText}`);
      console.log(`  - Rows now                              : ${afterWiden.renderedRows}`);
      console.log(`  - Dashboard refetched                   : ${periodApplied}`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      summary = await dashboardPage.getTableSummary();
      infoDefault = summary.infoText;
      console.log(`  - Table taken over : ${summary.id}`);
      console.log(`  - Column count     : ${summary.headers.length}`);
      summary.headers.forEach((h, i) => console.log(`      (${i + 1}) ${h}`));
      console.log(`  - Rendered rows    : ${summary.renderedRows}`);
      console.log(`  - Info line        : ${summary.infoText}`);

      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `${TC} - Steps to reproduce I - dashboard open with the table rendered`
      );
    });

    // ------------------------------------------------- Steps to reproduce #2
    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      valuesBeforeSort = await dashboardPage.getColumnValues(SORT_COLUMN_INDEX);
      console.log(`  - Sorting by column : "${EXPECTED_HEADERS[SORT_COLUMN_INDEX]}"`);
      console.log(`  - Order before      : ${JSON.stringify(valuesBeforeSort)}`);

      await dashboardPage.clickColumnHeader(SORT_COLUMN_INDEX);
      valuesAfterFirstClick = await dashboardPage.getColumnValues(SORT_COLUMN_INDEX);
      classAfterFirstClick =
        (await dashboardPage.getTableSummary()).headerSortClasses[SORT_COLUMN_INDEX] ?? '';
      console.log(`  - Order after 1 click : ${JSON.stringify(valuesAfterFirstClick)}`);
      console.log(`  - Header class        : ${classAfterFirstClick}`);

      await dashboardPage.clickColumnHeader(SORT_COLUMN_INDEX);
      valuesAfterSecondClick = await dashboardPage.getColumnValues(SORT_COLUMN_INDEX);
      classAfterSecondClick =
        (await dashboardPage.getTableSummary()).headerSortClasses[SORT_COLUMN_INDEX] ?? '';
      console.log(`  - Order after 2 clicks: ${JSON.stringify(valuesAfterSecondClick)}`);
      console.log(`  - Header class        : ${classAfterSecondClick}`);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      console.log(`  - Header class after click 1 : ${classAfterFirstClick}`);
      console.log(`  - Header class after click 2 : ${classAfterSecondClick}`);
      console.log(
        `  - Directions seen            : ${directionOf(classAfterFirstClick)} then ${directionOf(classAfterSecondClick)}`
      );

      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `${TC} - Steps to reproduce II - column sorted and the sort arrow shown`
      );
    });

    // ------------------------------------------------- Steps to reproduce #3
    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      console.log(`  - "Show N entries" offers : ${JSON.stringify(summary.lengthOptions)}`);
      console.log(`  - Info line at default    : ${infoDefault}`);

      movedToPageTwo = await dashboardPage.goToNextPage();
      infoOnPageTwo = (await dashboardPage.getTableSummary()).infoText;
      console.log(`  - Next clicked            : ${movedToPageTwo}`);
      console.log(`  - Info line on page 2     : ${infoOnPageTwo}`);
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      searchTerm = valuesAfterSecondClick[0] ?? '';
      await dashboardPage.searchInTable(searchTerm);
      const filtered = await dashboardPage.getTableSummary();
      infoWhileFiltered = filtered.infoText;
      filteredRows = filtered.renderedRows;
      console.log(`  - Searched for          : "${searchTerm}"`);
      console.log(`  - Rows while filtered   : ${filteredRows}`);
      console.log(`  - Values while filtered : ${JSON.stringify(await dashboardPage.getColumnValues(SORT_COLUMN_INDEX))}`);
      console.log(`  - Info while filtered   : ${infoWhileFiltered}`);

      await dashboardPage.clearTableSearch();
      infoAfterClearing = (await dashboardPage.getTableSummary()).infoText;
      console.log(`  - Info after clearing   : ${infoAfterClearing}`);

      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `${TC} - Steps to reproduce III - pagination and search exercised`
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
        console.log('       Reported as an observation; see OPEN POINTS in the header.');
      }
    });

    await test.step(STEP.s8, async () => {
      console.log(`\n--- ${STEP.s8} ---`);
      const current = await dashboardPage.getTableSummary();
      console.log(`  - Length menu on screen : ${current.hasLengthMenu}`);
      console.log(`  - Search box on screen  : ${current.hasSearchBox}`);
      console.log(`  - Info line on screen   : ${current.hasInfoLine}`);
      console.log(`  - Paginator on screen   : ${current.hasPagination}`);
      console.log(`  - Page buttons          : ${JSON.stringify(current.pageButtons)}`);
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

      const periodOk =
        periodApplied && dateInputsAfter.every((v) => v === TARGET_MONTH);
      const dir1 = directionOf(classAfterFirstClick);
      const dir2 = directionOf(classAfterSecondClick);
      const tableOk = summary.id === EXPECTED_TABLE_ID;
      const headersOk = JSON.stringify(summary.headers) === JSON.stringify(EXPECTED_HEADERS);
      const hadRows = valuesBeforeSort.length > 0;
      const sort1Ok = hadRows && orderMatchesArrow(valuesAfterFirstClick, classAfterFirstClick);
      const sort2Ok = hadRows && orderMatchesArrow(valuesAfterSecondClick, classAfterSecondClick);
      const arrowsOk = dir1 !== 'none' && dir2 !== 'none' && dir1 !== dir2;
      const lengthOptionsOk =
        JSON.stringify(summary.lengthOptions) === JSON.stringify(EXPECTED_LENGTH_OPTIONS);
      const paginationOk = movedToPageTwo && /Showing 11 to/.test(infoOnPageTwo);
      const searchOk = filteredRows > 0 && /filtered from/.test(infoWhileFiltered);
      const searchClearedOk = !/filtered from/.test(infoAfterClearing);
      const controlsOk =
        summary.hasLengthMenu && summary.hasSearchBox && summary.hasInfoLine && summary.hasPagination;

      const verifyLines = [
        `Period           : ${dateInputsAfter.join(' .. ')}`,
        `Table            : ${summary.id}`,
        `Columns          : ${summary.headers.length}`,
        `Sort c1 / c2     : ${dir1} / ${dir2}`,
        `Pagination       : ${infoOnPageTwo}`,
        `Search           : ${infoWhileFiltered}`,
      ];

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #0 - The pre-condition took: the table is showing a period that has rows:');
      console.log(`     Expected : the month pickers read ${TARGET_MONTH} and the dashboard refetched. Without this the screen sits on its default month, which holds ZERO rows on pre-production - every row-dependent check below would pass vacuously against an empty table, which is exactly what this case used to do. Note a start/end PAIR is silently ignored on this screen; one month written into every picker is what refetches it`);
      console.log(`     Actual   : inputs ${JSON.stringify(dateInputsBefore)} -> ${JSON.stringify(dateInputsAfter)}, refetched=${periodApplied}`);
      console.log(`     Result   : ${periodOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #1 - DataTables still drives this dashboard table:');
      console.log(`     Expected : the library takes over ${EXPECTED_TABLE_ID} (a different id means the dashboard changed - re-ground this spec before reading anything below it)`);
      console.log(`     Actual   : ${summary.id}`);
      console.log(`     Result   : ${tableOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #2 - The table renders its columns unchanged by the upgrade:');
      console.log(`     Expected : exactly ${EXPECTED_HEADERS.length} columns, in this order: ${EXPECTED_HEADERS.join(', ')}`);
      console.log(`     Actual   : ${summary.headers.join(', ')}`);
      console.log(`     Result   : ${headersOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #3 - The first header click re-orders the rows to match its arrow:');
      console.log(`     Expected : the "${EXPECTED_HEADERS[SORT_COLUMN_INDEX]}" column on the current page is in ${dir1} order, because that is what the header's arrow reports after click 1`);
      console.log(`     Actual   : ${JSON.stringify(valuesAfterFirstClick)}`);
      console.log(`     Result   : ${sort1Ok ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #4 - The second click re-orders them the other way, again matching its arrow:');
      console.log(`     Expected : the same column in ${dir2} order`);
      console.log(`     Actual   : ${JSON.stringify(valuesAfterSecondClick)}`);
      console.log(`     Result   : ${sort2Ok ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #5 - The sort arrows show both directions across the two clicks:');
      console.log(`     Expected : one click draws sorting_asc and the other sorting_desc - that class is what draws the arrow, so "none" on either click means the arrow is gone even if the rows moved`);
      console.log(`     Actual   : click 1 = ${dir1} ("${classAfterFirstClick}"), click 2 = ${dir2} ("${classAfterSecondClick}")`);
      console.log(`     Result   : ${arrowsOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #6 - "Show N entries" offers its values unchanged:');
      console.log(`     Expected : exactly these values, in this order: ${EXPECTED_LENGTH_OPTIONS.join(', ')}`);
      console.log(`     Actual   : ${summary.lengthOptions.join(', ')}`);
      console.log(`     Result   : ${lengthOptionsOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #7 - Pagination moves to the second page:');
      console.log(`     Expected : Next reaches a page whose info line starts at entry 11 (this is the only one of the six screens whose own data paginates, so a broken paginator shows here first)`);
      console.log(`     Actual   : Next clicked=${movedToPageTwo}, info="${infoOnPageTwo}"`);
      console.log(`     Result   : ${paginationOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #8 - The search box filters the table:');
      console.log(`     Expected : searching "${searchTerm}" leaves at least one row and the info line reports "(filtered from N total entries)"`);
      console.log(`     Actual   : ${filteredRows} row(s), info="${infoWhileFiltered}"`);
      console.log(`     Result   : ${searchOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #9 - Clearing the search restores the table:');
      console.log(`     Expected : the info line no longer reports a filter`);
      console.log(`     Actual   : ${infoAfterClearing}`);
      console.log(`     Result   : ${searchClearedOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #10 - Every control the library injects is on screen:');
      console.log(`     Expected : the length menu, the search box, the info line and the paginator are all present (the Bootstrap 4 stylesheet is now plain CSS instead of compiled - a control that vanished is how that would show)`);
      console.log(`     Actual   : length=${summary.hasLengthMenu}, search=${summary.hasSearchBox}, info=${summary.hasInfoLine}, paginate=${summary.hasPagination}`);
      console.log(`     Result   : ${controlsOk ? 'PASS' : 'FAIL'}`);

      console.log(`  Observation (not scored) - export controls offered on this dashboard : ${exportControls.length === 0 ? 'none' : exportControls.join(', ')}`);
      console.log('===============================================');

      const overall =
        periodOk &&
        tableOk &&
        headersOk &&
        sort1Ok &&
        sort2Ok &&
        arrowsOk &&
        lengthOptionsOk &&
        paginationOk &&
        searchOk &&
        searchClearedOk &&
        controlsOk;
      console.log(
        `OVERALL: ${overall ? 'PASS' : 'FAIL'} - ${DASHBOARD_MENU_PATH} after the DataTables 1.13.11 upgrade`
      );

      let verifyPassed = false;
      try {
        expect(
          dateInputsAfter,
          'the pre-condition should have moved the table to a month that holds rows'
        ).toEqual(dateInputsAfter.map(() => TARGET_MONTH));
        expect(periodApplied, 'the dashboard should have refetched after the period changed').toBe(
          true
        );
        expect(summary.id, 'DataTables should still drive the dashboard table').toBe(
          EXPECTED_TABLE_ID
        );
        expect(summary.headers, 'the column headers should be unchanged by the upgrade').toEqual(
          EXPECTED_HEADERS
        );
        expect(valuesBeforeSort.length, 'the dashboard should have rows to sort').toBeGreaterThan(0);
        expect(
          sort1Ok,
          `after click 1 the header's arrow reported "${dir1}" but the rows read ${JSON.stringify(valuesAfterFirstClick)}`
        ).toBe(true);
        expect(
          sort2Ok,
          `after click 2 the header's arrow reported "${dir2}" but the rows read ${JSON.stringify(valuesAfterSecondClick)}`
        ).toBe(true);
        expect([dir1, dir2].sort(), 'the two clicks should draw the two opposite sort arrows').toEqual([
          'ascending',
          'descending',
        ]);
        expect(summary.lengthOptions, 'the "Show N entries" values should be unchanged').toEqual(
          EXPECTED_LENGTH_OPTIONS
        );
        expect(movedToPageTwo, 'Next should move to a second page').toBe(true);
        expect(infoOnPageTwo, 'page 2 should start at entry 11').toMatch(/Showing 11 to/);
        expect(filteredRows, 'the search should leave at least one matching row').toBeGreaterThan(0);
        expect(infoWhileFiltered, 'the info line should report the filtering').toContain(
          'filtered from'
        );
        expect(infoAfterClearing, 'clearing the search should restore the table').not.toContain(
          'filtered from'
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
