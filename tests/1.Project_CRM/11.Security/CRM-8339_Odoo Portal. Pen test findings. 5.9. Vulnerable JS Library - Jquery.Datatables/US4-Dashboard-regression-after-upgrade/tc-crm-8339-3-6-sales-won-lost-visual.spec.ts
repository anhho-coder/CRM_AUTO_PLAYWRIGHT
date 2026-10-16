import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, DataTablesDashboardPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  CRM-8339 - Pen test findings 5.9 (Vulnerable JS Library - jQuery DataTables)
 *  US4 - Dashboard regression after the 1.10.21 -> 1.13.11 upgrade
 *  D.4 - VISUAL integrity, screen 6 of 6 - Reports > Sales Won/Lost
 * =============================================================================================
 *  Test Case ID     : CRM-8339_3.6
 *  Jira             : CRM-12630 (Implementation - Dev), parent CRM-8339, spec CRM-11483
 *  Test Repository  : CRM test/Security/CRM-8339_Pen test findings 5.9/US4 Dashboard regression
 *                     after the DataTables upgrade   (NOT YET FILED IN XRAY)
 *  Target           : pre-production.nakivo.site
 *  Run as           : CRM admin (admin_crm, anh.ho@nakivo.com)
 *  Automation-Type  : new
 *  Automation-Date  : 2026-10-14
 *  Source           : Vitalii Ivanov on CRM-12630 - D.4, confirmed open on 2026-10-09
 *  Source version   : CRM-12630 updated 2026-10-09T19:16+0300 - re-check before trusting this spec
 *  Evidence         : one screenshot at the end of each "Steps to reproduce" section, a
 *                     verify-point capture framing the table, plus afterEach start/end.
 *
 *  Summary
 *  ---------------------------------------------------------------------------------------------
 *  Closes the measurable half of D.4: the styling the upgrade could have broken is asserted as
 *  concrete CSS and layout facts - the arrows the library draws with pseudo-element content, the
 *  four control regions, the header and cell typography, and the absence of horizontal overflow.
 *
 *  Command to run
 *  ---------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-8339_3\\.6:" --project=chromium
 *
 *  ---------------------------------------------------------------------------------------------
 *  Source - what D.4 actually is (CRM-12630, verbatim)
 *  ---------------------------------------------------------------------------------------------
 *  Vitalii Ivanov, 2026-09-25, his own test case 3:
 *    "Version 1.13 of the library ships a newer style syntax, so the Bootstrap 4 stylesheet is now
 *     declared as plain CSS instead of being run through the style compiler; styling and behaviour
 *     are unchanged."
 *  and in the same comment:
 *    "The Bootstrap 4 stylesheet grew substantially between the two versions, so visual differences
 *     are the most likely form of regression."
 *
 *  Vitalii Ivanov, 2026-10-09, accepting D.4:
 *    "My test case 3 measures the byte sizes of the stylesheet bundles, which proves only that they
 *     compile and are served. [...] The visual check is still genuinely open, and it is exactly
 *     your E.1 - your dashboard regression run is what closes it."
 *
 *  Pre-condition(s):
 *    1. Log in to http://pre-production.nakivo.site/web#home as the CRM admin.
 *
 *  Steps to reproduce #1 - the stylesheet is really applied:
 *    1. Open Reports > Sales Won/Lost.
 *    2. Confirm the DataTables stylesheet rules are loaded.
 *       Expected: at least one CSS rule carrying a .dataTables_wrapper / table.dataTable selector
 *       is readable in the page, and NO stylesheet was blocked from being read - a blocked sheet
 *       would make the count an undercount and the check meaningless.
 *
 *  Steps to reproduce #2 - what the library draws with CSS, not with markup:
 *    3. Check the sort arrows are drawn.
 *       Expected: the sortable column header carries pseudo-element content on both sides -
 *       "▲" before and "▼" after - and a pointer cursor.
 *    4. Check the four control regions are laid out around the table.
 *       Expected: the length menu and the search box sit on ONE row above the table, search to the
 *       right of the length menu; the info line and the paginator sit on ONE row below it,
 *       paginator to the right of the info line.
 *
 *  Steps to reproduce #3 - typography and fit:
 *    5. Check the table header and cell styling.
 *       Expected: the header rule is 2px and its text is weight 700; body cells are 13px in the
 *       Roboto family.
 *    6. Check the table does not overflow horizontally.
 *       Expected: the table fits its container and the page has no horizontal scrollbar.
 *
 *  ---------------------------------------------------------------------------------------------
 *  WHY MEASURED PROPERTIES AND NOT A SCREENSHOT DIFF - READ BEFORE QUOTING THIS AS COVERAGE
 *  ---------------------------------------------------------------------------------------------
 *  A true before/after visual diff is NO LONGER POSSIBLE on pre-production: the fix was deployed
 *  there on 2026-09-25, so the 1.10.21 appearance is gone. A baseline captured today would only
 *  catch drift from today onwards and would not answer Vitalii's question at all. Production still
 *  serves 1.10.21 until the release and is the only remaining "before", but this suite does not
 *  touch Production.
 *
 *  So this case does the next best thing, and arguably the more useful one: instead of comparing
 *  pictures it pins the STYLING FACTS that a lost stylesheet rule would change. Each one fails
 *  silently in every other check - the table still renders, still sorts, still paginates, and the
 *  CRM-8339_2.x cases all stay green - while the screen looks wrong. The sort arrows are the
 *  clearest example: they are pseudo-element content, so losing that rule removes the arrows
 *  completely while leaving the sort itself working.
 *
 *  What it does NOT cover: colour, spacing and alignment judgements a person makes by looking.
 *  The screenshots attached to each section are the artifact for that, and a human still has to
 *  look at them before D.4 is called closed.
 *
 *  Baseline values below were measured on pre-production 2026-10-14 against 1.13.11.
 * =============================================================================================
 */

const TC = 'CRM-8339_3.6';

/** Reports > Sales Won/Lost - ir.ui.menu 841. */
const DASHBOARD_MENU_PATH = 'Reports > Sales Won/Lost';
const DASHBOARD_ACTION_ID = 2235;
const EXPECTED_TABLE_ID = 'lead_table';

/** The arrows DataTables draws as pseudo-element content. Escaped, so no encoding can mangle them. */
const GLYPH_UP = '▲';
const GLYPH_DOWN = '▼';
/** Grounded on pre-production 2026-10-14. */
const EXPECTED_HEADER_BORDER = '2px';
const EXPECTED_HEADER_WEIGHT = '700';
const EXPECTED_CELL_FONT_SIZE = '13px';
const EXPECTED_CELL_FONT_FAMILY = 'Roboto';
/** How far apart two controls may sit vertically and still count as "on one row". */
const SAME_ROW_TOLERANCE_PX = 6;
/** Slack on the fit check, for sub-pixel rounding. */
const FIT_TOLERANCE_PX = 2;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Log in to http://pre-production.nakivo.site/web#home as the CRM admin',
  s1: 'Step 1: Open Reports > Sales Won/Lost',
  s2: 'Step 2: Confirm the DataTables stylesheet rules are loaded',
  s3: 'Step 3: Check the sort arrows are drawn',
  s4: 'Step 4: Check the four control regions are laid out around the table',
  s5: 'Step 5: Check the table header and cell styling',
  s6: 'Step 6: Check the table does not overflow horizontally',
  verify: 'Verification',
} as const;

test.describe('CRM-8339 Security - DataTables dashboard visual integrity (US4 / D.4)', () => {
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

  test(`${TC}: ${DASHBOARD_MENU_PATH} keeps its DataTables styling after the upgrade - arrows, control layout, typography and fit`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const dashboardPage = new DataTablesDashboardPage(page);

    let styling = await dashboardPage.getStylingFacts();

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
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      styling = await dashboardPage.getStylingFacts();
      console.log(`  - Table under test        : ${styling.tableId}`);
      console.log(`  - Table classes           : ${styling.tableClass}`);
      console.log(`  - Stylesheets readable    : ${styling.stylesheetsRead}`);
      console.log(`  - Stylesheets blocked     : ${styling.stylesheetsBlocked}`);
      console.log(`  - DataTables CSS rules    : ${styling.cssRulesForDataTables}`);

      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `${TC} - Steps to reproduce I - dashboard rendered with its stylesheet applied`
      );
    });

    // ------------------------------------------------- Steps to reproduce #2
    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log(`  - Header class   : ${styling.sortGlyph.thClass}`);
      console.log(`  - ::before content : ${styling.sortGlyph.beforeContent}`);
      console.log(`  - ::after content  : ${styling.sortGlyph.afterContent}`);
      console.log(`  - Cursor           : ${styling.sortGlyph.cursor}`);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      const { length, filter, info, paginate } = styling.regions;
      const show = (name: string, r: typeof length) =>
        console.log(`  - ${name.padEnd(12)}: ${r ? `x=${r.x} y=${r.y} w=${r.w} h=${r.h}` : 'MISSING'}`);
      show('length menu', length);
      show('search box', filter);
      show('info line', info);
      show('paginator', paginate);

      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `${TC} - Steps to reproduce II - sort arrows and the four control regions`
      );
    });

    // ------------------------------------------------- Steps to reproduce #3
    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      console.log(`  - Header border-bottom : ${styling.header.borderBottomWidth}`);
      console.log(`  - Header font-weight   : ${styling.header.fontWeight}`);
      console.log(`  - Header padding-top   : ${styling.header.paddingTop}`);
      console.log(`  - Cell font-size       : ${styling.cell.fontSize}`);
      console.log(`  - Cell font-family     : ${styling.cell.fontFamily}`);
      console.log(`  - Cell padding-top     : ${styling.cell.paddingTop}`);
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      const o = styling.overflow;
      console.log(`  - Table scrollWidth    : ${o.tableScrollWidth}`);
      console.log(`  - Container clientWidth: ${o.parentClientWidth}`);
      console.log(`  - Document scrollWidth : ${o.docScrollWidth}`);
      console.log(`  - Document clientWidth : ${o.docClientWidth}`);

      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `${TC} - Steps to reproduce III - full dashboard for the human visual check`
      );
    });

    // ------------------------------------------------------------- Verification
    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);

      const { length, filter, info, paginate } = styling.regions;
      const tableOk = styling.tableId === EXPECTED_TABLE_ID;
      const cssLoadedOk = styling.cssRulesForDataTables > 0 && styling.stylesheetsBlocked === 0;
      const glyphsOk =
        styling.sortGlyph.beforeContent.includes(GLYPH_UP) &&
        styling.sortGlyph.afterContent.includes(GLYPH_DOWN);
      const cursorOk = styling.sortGlyph.cursor === 'pointer';
      const regionsPresentOk = !!length && !!filter && !!info && !!paginate;
      const topRowOk =
        !!length &&
        !!filter &&
        filter.x > length.x &&
        Math.abs(filter.y - length.y) <= SAME_ROW_TOLERANCE_PX;
      const bottomRowOk =
        !!info &&
        !!paginate &&
        paginate.x > info.x &&
        Math.abs(paginate.y - info.y) <= SAME_ROW_TOLERANCE_PX;
      const controlsStraddleTableOk = !!length && !!info && info.y > length.y;
      const headerOk =
        styling.header.borderBottomWidth === EXPECTED_HEADER_BORDER &&
        styling.header.fontWeight === EXPECTED_HEADER_WEIGHT;
      const cellOk =
        styling.cell.fontSize === EXPECTED_CELL_FONT_SIZE &&
        styling.cell.fontFamily.includes(EXPECTED_CELL_FONT_FAMILY);
      const fitsContainerOk =
        styling.overflow.tableScrollWidth <= styling.overflow.parentClientWidth + FIT_TOLERANCE_PX;
      const noPageScrollbarOk =
        styling.overflow.docScrollWidth <= styling.overflow.docClientWidth + FIT_TOLERANCE_PX;

      const verifyLines = [
        `Table      : ${styling.tableId}`,
        `DT CSS     : ${styling.cssRulesForDataTables} rules`,
        `Arrows     : ${styling.sortGlyph.beforeContent} / ${styling.sortGlyph.afterContent}`,
        `Header     : ${styling.header.borderBottomWidth} / ${styling.header.fontWeight}`,
        `Fit        : ${styling.overflow.tableScrollWidth} <= ${styling.overflow.parentClientWidth}`,
      ];

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The screen under test is the one this case was grounded on:');
      console.log(`     Expected : the table is ${EXPECTED_TABLE_ID} (a different id means the dashboard changed - re-ground this case before reading anything below it)`);
      console.log(`     Actual   : ${styling.tableId}`);
      console.log(`     Result   : ${tableOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #2 - The DataTables stylesheet is really applied, not merely served:');
      console.log(`     Expected : at least 1 CSS rule with a .dataTables_wrapper / table.dataTable selector is readable, and 0 stylesheets blocked from reading. Vitalii's own TC3 measured the stylesheet BYTE SIZE, which proves it compiled and was served - it cannot show whether the rules reached the page. Blocked sheets would make this an undercount, which is why zero blocked is part of the expectation`);
      console.log(`     Actual   : ${styling.cssRulesForDataTables} rules, ${styling.stylesheetsBlocked} blocked of ${styling.stylesheetsRead + styling.stylesheetsBlocked}`);
      console.log(`     Result   : ${cssLoadedOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #3 - The sort arrows are drawn:');
      console.log(`     Expected : the sortable header carries "${GLYPH_UP}" as ::before content and "${GLYPH_DOWN}" as ::after. These arrows are PURE CSS - losing that rule removes them from the screen while sorting keeps working, so every other check in CRM-8339_2.x stays green and only the look is broken. This is the single most likely form of the regression D.4 is about`);
      console.log(`     Actual   : before=${styling.sortGlyph.beforeContent}, after=${styling.sortGlyph.afterContent}`);
      console.log(`     Result   : ${glyphsOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #4 - The sortable header still looks clickable:');
      console.log(`     Expected : cursor "pointer" on the header (a header that sorts but shows the default cursor tells the user it is not clickable)`);
      console.log(`     Actual   : ${styling.sortGlyph.cursor}`);
      console.log(`     Result   : ${cursorOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #5 - All four injected control regions are on screen:');
      console.log(`     Expected : the length menu, the search box, the info line and the paginator each have a box on screen`);
      console.log(`     Actual   : length=${!!length}, filter=${!!filter}, info=${!!info}, paginate=${!!paginate}`);
      console.log(`     Result   : ${regionsPresentOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #6 - The length menu and the search box share one row, search on the right:');
      console.log(`     Expected : same y within ${SAME_ROW_TOLERANCE_PX}px and filter.x > length.x. A dropped layout rule stacks them vertically - the controls are all still present, so a presence check would pass while the header of the table has visibly fallen apart`);
      console.log(`     Actual   : length=(${length?.x},${length?.y}) filter=(${filter?.x},${filter?.y})`);
      console.log(`     Result   : ${topRowOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #7 - The info line and the paginator share one row, paginator on the right:');
      console.log(`     Expected : same y within ${SAME_ROW_TOLERANCE_PX}px and paginate.x > info.x`);
      console.log(`     Actual   : info=(${info?.x},${info?.y}) paginate=(${paginate?.x},${paginate?.y})`);
      console.log(`     Result   : ${bottomRowOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #8 - The controls straddle the table rather than bunching together:');
      console.log(`     Expected : the info line sits BELOW the length menu, i.e. the table is between the two control rows`);
      console.log(`     Actual   : length.y=${length?.y}, info.y=${info?.y}`);
      console.log(`     Result   : ${controlsStraddleTableOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #9 - The header keeps its rule and its weight:');
      console.log(`     Expected : border-bottom ${EXPECTED_HEADER_BORDER} and font-weight ${EXPECTED_HEADER_WEIGHT} (the 2px rule under the header row is what separates it from the data; losing it makes the header read as another data row)`);
      console.log(`     Actual   : ${styling.header.borderBottomWidth} / ${styling.header.fontWeight}`);
      console.log(`     Result   : ${headerOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #10 - Body cells keep their typography:');
      console.log(`     Expected : font-size ${EXPECTED_CELL_FONT_SIZE} in a family containing "${EXPECTED_CELL_FONT_FAMILY}" (a fallback font changes every column width on the screen at once)`);
      console.log(`     Actual   : ${styling.cell.fontSize} / ${styling.cell.fontFamily}`);
      console.log(`     Result   : ${cellOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #11 - The table fits its container:');
      console.log(`     Expected : table scrollWidth <= container clientWidth + ${FIT_TOLERANCE_PX}px (a wider table is the classic symptom of a lost width rule, and it clips the right-hand columns)`);
      console.log(`     Actual   : ${styling.overflow.tableScrollWidth} vs ${styling.overflow.parentClientWidth}`);
      console.log(`     Result   : ${fitsContainerOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #12 - The page has no horizontal scrollbar:');
      console.log(`     Expected : document scrollWidth <= clientWidth + ${FIT_TOLERANCE_PX}px`);
      console.log(`     Actual   : ${styling.overflow.docScrollWidth} vs ${styling.overflow.docClientWidth}`);
      console.log(`     Result   : ${noPageScrollbarOk ? 'PASS' : 'FAIL'}`);

      console.log('');
      console.log('  Observation (not scored) - colour, spacing and alignment by eye:');
      console.log('     No assertion replaces a person looking at the screen. The screenshots');
      console.log('     attached to the three sections above are the artifact for that, and D.4');
      console.log('     is not closed until somebody has looked at them. A before/after diff is');
      console.log('     no longer possible on pre-production: the fix landed there 2026-09-25.');
      console.log('===============================================');

      const overall =
        tableOk &&
        cssLoadedOk &&
        glyphsOk &&
        cursorOk &&
        regionsPresentOk &&
        topRowOk &&
        bottomRowOk &&
        controlsStraddleTableOk &&
        headerOk &&
        cellOk &&
        fitsContainerOk &&
        noPageScrollbarOk;
      console.log(
        `OVERALL: ${overall ? 'PASS' : 'FAIL'} - ${DASHBOARD_MENU_PATH} styling after the DataTables 1.13.11 upgrade`
      );

      let verifyPassed = false;
      try {
        expect(styling.tableId, 'the dashboard table should be the grounded one').toBe(
          EXPECTED_TABLE_ID
        );
        expect(
          styling.cssRulesForDataTables,
          'DataTables CSS rules should be readable in the page'
        ).toBeGreaterThan(0);
        expect(
          styling.stylesheetsBlocked,
          'no stylesheet should be unreadable, or the rule count above is an undercount'
        ).toBe(0);
        expect(
          styling.sortGlyph.beforeContent,
          'the ascending sort arrow should be drawn as pseudo-element content'
        ).toContain(GLYPH_UP);
        expect(
          styling.sortGlyph.afterContent,
          'the descending sort arrow should be drawn as pseudo-element content'
        ).toContain(GLYPH_DOWN);
        expect(styling.sortGlyph.cursor, 'the sortable header should show a pointer cursor').toBe(
          'pointer'
        );
        expect(length, 'the length menu should have a box on screen').not.toBeNull();
        expect(filter, 'the search box should have a box on screen').not.toBeNull();
        expect(info, 'the info line should have a box on screen').not.toBeNull();
        expect(paginate, 'the paginator should have a box on screen').not.toBeNull();
        expect(topRowOk, 'the length menu and search box should share one row, search right').toBe(
          true
        );
        expect(bottomRowOk, 'the info line and paginator should share one row, paginator right').toBe(
          true
        );
        expect(controlsStraddleTableOk, 'the table should sit between the two control rows').toBe(
          true
        );
        expect(styling.header.borderBottomWidth, 'the header rule should be kept').toBe(
          EXPECTED_HEADER_BORDER
        );
        expect(styling.header.fontWeight, 'the header should stay bold').toBe(
          EXPECTED_HEADER_WEIGHT
        );
        expect(styling.cell.fontSize, 'body cells should keep their font size').toBe(
          EXPECTED_CELL_FONT_SIZE
        );
        expect(styling.cell.fontFamily, 'body cells should keep their font family').toContain(
          EXPECTED_CELL_FONT_FAMILY
        );
        expect(fitsContainerOk, 'the table should fit its container').toBe(true);
        expect(noPageScrollbarOk, 'the page should have no horizontal scrollbar').toBe(true);
        verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - ${DASHBOARD_MENU_PATH} styling`,
          passed: verifyPassed,
          highlight: [DataTablesDashboardPage.WRAPPER_SELECTOR],
          lines: verifyLines,
        }).catch(() => {});
      }
    });
  });
});
