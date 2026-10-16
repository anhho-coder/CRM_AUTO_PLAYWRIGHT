import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, DataTablesDashboardPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  CRM-8336 - Pen test findings (Security) - jQuery DataTables library version
 *  Check 2 - the version that actually executes in the browser
 * =============================================================================================
 *  Test Case ID     : CRM-8336_US3.10
 *  Jira             : CRM-12630 (Implementation - Dev), parent CRM-8336, spec CRM-11483
 *  Test Repository  : CRM test/Security/CRM-8336_Pen test findings 5.3 Prototype pollution/US3 Preserve portal functionality
 *  Target           : pre-production.nakivo.site
 *  Run as           : CRM admin (admin_crm, anh.ho@nakivo.com) - the dashboards are internal
 *                     back-office screens, so a portal account cannot reach them
 *  Automation-Type  : refactored
 *  Automation-Date  : 2026-09-30
 *  Source           : Vitalii Ivanov, comment on CRM-12630 (2026-09-23, edited 2026-09-24) - "Check 2"
 *  Source version   : CRM-12630 updated 2026-09-25T20:37+0300 - re-check before trusting this spec
 *  Evidence         : one screenshot at the end of the dashboard step, a verify-point capture on
 *                     the rendered table, plus afterEach start/end.
 *
 *  Summary
 *  ---------------------------------------------------------------------------------------------
 *  Asserts the acceptance criterion of CRM-12630 from inside the running application: on a
 *  back-office dashboard that renders a DataTables table, the browser must execute a version at
 *  or above 1.13.11, and the library must be demonstrably in real use on that page rather than
 *  merely bundled.
 *
 *  Command to run
 *  ---------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-8336_US3\\.10:" --project=chromium
 *
 *  ---------------------------------------------------------------------------------------------
 *  Source manual TC - CRM-12630 comment, "Check 2 - the version that actually executes in the
 *  browser" (verbatim, in order)
 *  ---------------------------------------------------------------------------------------------
 *  Pre-condition(s):
 *    1. Log in to http://pre-production.nakivo.site/web#home - this is also where the fix will be
 *       deployed afterwards.
 *       (source step 1; run here as a pre-condition because it is the sign-in, not the check)
 *
 *  Steps to reproduce #1:
 *    2. Open a dashboard that contains a table - for example Helpdesk > Reporting > Tickets per
 *       product line, or Reports > Sales.
 *       AUTOMATION: opened by client-action id 2311, which is what the menu entry
 *       "Helpdesk > Reporting > Tickets per product line" opens. The dashboard fetches its rows
 *       over RPC after the view renders, so the spec waits for the wrapper DataTables injects
 *       rather than for the bare <table> tag.
 *    3. Open browser DevTools (F12) > Console and run $.fn.dataTable.version.
 *       AUTOMATION: read through the page object, which evaluates the same expression in the
 *       page - there is no DevTools panel to drive in Playwright.
 *
 *  Verification - Expected Result on step 3:
 *    _ $.fn.dataTable.version returns a version GREATER THAN OR EQUAL TO 1.13.11
 *    _ $.fn.dataTable.ext.builder returns a builder tag at or above the same floor
 *    _ The library is in real use on the page: DataTables has taken over the dashboard table and
 *      the wrapper, search box and pagination it injects are all on screen
 *
 *  ---------------------------------------------------------------------------------------------
 *  WHY THE EXPECTED VERSION IS A FLOOR, NOT AN EXACT MATCH
 *  ---------------------------------------------------------------------------------------------
 *  An exact-version assertion goes stale the next time anybody bumps the library: a perfectly good
 *  1.13.12 would turn the suite red and somebody would "fix" it by editing the expected value.
 *  A floor keeps working - it passes on 1.13.11 and on anything newer, and it fails on a
 *  downgrade or on the vulnerable version coming back, which are the two things worth catching.
 *
 *  The floor is 1.13.11, the version shipped by CRM-12630 - deliberately stricter than the CVE
 *  minimum. CVE-2020-28458 is fixed in 1.10.23 and CVE-2021-23445 only in 1.11.3, so 1.11.3 is
 *  the security floor; holding the line at what actually shipped also catches a silent downgrade
 *  to a still-CVE-clean but older build.
 *
 *  ---------------------------------------------------------------------------------------------
 *  NOTE ON $.fn.dataTable.ext.builder - the check changed direction after the deploy
 *  ---------------------------------------------------------------------------------------------
 *  On 1.10.21 this property did NOT exist - the console answered undefined - so before the fix it
 *  could not evidence anything, and this spec asserted its absence. Vitalii accepted that
 *  correction on CRM-12630 (2026-09-25). Since the deploy the property exists and reports the
 *  builder tag, so it is now a second, independent read of the same version and is asserted
 *  against the same floor.
 * =============================================================================================
 */

const TC = 'CRM-8336_US3.10';

/**
 * Helpdesk > Reporting > Tickets per product line.
 * Client-action id read from ir.ui.menu on pre-production (2026-09-25).
 */
const DASHBOARD_MENU_PATH = 'Helpdesk > Reporting > Tickets per product line';
const DASHBOARD_ACTION_ID = 2311;

/** The floor the executing library must meet or beat. See the header for why this is a floor. */
const MIN_VERSION = '1.13.11';
/** The version the pen test flagged. Reading it again means the fix was lost. */
const VULNERABLE_VERSION = '1.10.21';
/** The table this dashboard hands to DataTables, read off pre-production on 2026-09-25. */
const EXPECTED_TABLE_ID = 'tickets_per_product_line_table';

/**
 * Compare two dotted numeric versions.
 * @returns a negative number when a < b, 0 when equal, a positive number when a > b.
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1:
    'Pre-condition 1: Log in to http://pre-production.nakivo.site/web#home - this is also where ' +
    'the fix will be deployed afterwards',
  s2:
    'Step 2: Open a dashboard that contains a table - on pre-production open ' +
    'Helpdesk > Reporting > Tickets per product line',
  s3: 'Step 3: Open browser DevTools (F12) > Console and run $.fn.dataTable.version',
  verify: 'Verification',
} as const;

test.describe('CRM-8336 Security - DataTables library version (US3 - version verification)', () => {
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

  test(`${TC}: The DataTables library executing on a back-office dashboard reports a version at or above ${MIN_VERSION}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const dashboardPage = new DataTablesDashboardPage(page);

    let renderedTableId = '';
    let initialisedTableCount = 0;
    let controls = { wrapper: false, searchBox: false, pagination: false };
    let actualVersion = '';
    let actualBuilderTag = '';
    let builderVersion = '';

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`  - Account   : ${users.admin_crm.username}`);
      console.log(`  - Landed on : ${page.url()}`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await dashboardPage.openDashboardByActionId(baseUrl, DASHBOARD_ACTION_ID);
      await dashboardPage.waitForDataTableToRender();

      renderedTableId = await dashboardPage.getRenderedDataTableId();
      initialisedTableCount = await dashboardPage.getInitialisedTableCount();
      controls = await dashboardPage.areTableControlsVisible();

      console.log(`  - Dashboard          : ${DASHBOARD_MENU_PATH}`);
      console.log(`  - Client action id   : ${DASHBOARD_ACTION_ID}`);
      console.log(`  - Table taken over   : ${renderedTableId}`);
      console.log(`  - Tables initialised : ${initialisedTableCount}`);
      console.log(`  - Wrapper visible    : ${controls.wrapper}`);
      console.log(`  - Search box visible : ${controls.searchBox}`);
      console.log(`  - Pagination visible : ${controls.pagination}`);

      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `${TC} - Steps to reproduce I - dashboard open with the DataTables table rendered`
      );
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      actualVersion = await dashboardPage.getDataTableVersion();
      actualBuilderTag = await dashboardPage.getDataTableBuilderTag();
      builderVersion = /\d+\.\d+\.\d+/.test(actualBuilderTag)
        ? (actualBuilderTag.match(/\d+\.\d+\.\d+/) as RegExpMatchArray)[0]
        : '';
      console.log(`  - $.fn.dataTable.version     : ${actualVersion}`);
      console.log(`  - $.fn.dataTable.ext.builder : ${actualBuilderTag}`);
      console.log(`  - version read from builder  : ${builderVersion || '(no version in the tag)'}`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);

      const versionOk =
        /^\d+\.\d+\.\d+$/.test(actualVersion) && compareVersions(actualVersion, MIN_VERSION) >= 0;
      const notVulnerable = actualVersion !== VULNERABLE_VERSION;
      const tableOk = renderedTableId === EXPECTED_TABLE_ID;
      const controlsOk = controls.wrapper && controls.searchBox && controls.pagination;
      const builderOk = builderVersion !== '' && compareVersions(builderVersion, MIN_VERSION) >= 0;

      const verifyLines = [
        `Expected version : >= ${MIN_VERSION}`,
        `Actual version   : ${actualVersion}`,
        `Builder tag      : ${actualBuilderTag}`,
        `Table taken over : ${renderedTableId}`,
      ];

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The version executing in the browser is at or above the accepted floor:');
      console.log(`     Expected : $.fn.dataTable.version >= ${MIN_VERSION} (a LOWER version means the module was downgraded or the fix was lost in a redeploy)`);
      console.log(`     Actual   : ${actualVersion}`);
      console.log(`     Result   : ${versionOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #2 - The version the pen test flagged is not back:');
      console.log(`     Expected : version is not ${VULNERABLE_VERSION}`);
      console.log(`     Actual   : ${actualVersion}`);
      console.log(`     Result   : ${notVulnerable ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #3 - The builder tag agrees with the version, as an independent read:');
      console.log(`     Expected : $.fn.dataTable.ext.builder reports >= ${MIN_VERSION} (on 1.10.21 this property did not exist at all - see the header note)`);
      console.log(`     Actual   : ${actualBuilderTag}`);
      console.log(`     Result   : ${builderOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #4 - The dashboard really hands a table to the library:');
      console.log(`     Expected : DataTables took over the table ${EXPECTED_TABLE_ID} (a different id means the dashboard changed - re-ground the spec before trusting the version above)`);
      console.log(`     Actual   : ${renderedTableId} (${initialisedTableCount} table(s) initialised)`);
      console.log(`     Result   : ${tableOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #5 - The library is in real use on the page, not merely bundled:');
      console.log(`     Expected : the wrapper, the search box and the pagination DataTables injects are all visible (if they are absent the version read above describes a library nothing on screen uses)`);
      console.log(`     Actual   : wrapper=${controls.wrapper}, searchBox=${controls.searchBox}, pagination=${controls.pagination}`);
      console.log(`     Result   : ${controlsOk ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');

      const overall = versionOk && notVulnerable && builderOk && tableOk && controlsOk;
      console.log(
        `OVERALL: ${overall ? 'PASS' : 'FAIL'} - ${DASHBOARD_MENU_PATH} runs DataTables ${actualVersion} (floor ${MIN_VERSION})`
      );

      let verifyPassed = false;
      try {
        expect(actualVersion, 'a DataTables version should be readable in the browser').toMatch(
          /^\d+\.\d+\.\d+$/
        );
        expect(
          compareVersions(actualVersion, MIN_VERSION),
          `the dashboard should run DataTables >= ${MIN_VERSION}, got ${actualVersion}`
        ).toBeGreaterThanOrEqual(0);
        expect(
          actualVersion,
          `${VULNERABLE_VERSION} is the version CVE-2020-28458 and CVE-2021-23445 apply to - reading it means the fix was lost`
        ).not.toBe(VULNERABLE_VERSION);
        expect(
          compareVersions(builderVersion, MIN_VERSION),
          `the builder tag should report >= ${MIN_VERSION}, got "${actualBuilderTag}"`
        ).toBeGreaterThanOrEqual(0);
        expect(renderedTableId, 'DataTables should have taken over the dashboard table').toBe(
          EXPECTED_TABLE_ID
        );
        expect(controls.wrapper, 'the DataTables wrapper should be on screen').toBe(true);
        expect(controls.searchBox, 'the DataTables search box should be on screen').toBe(true);
        expect(controls.pagination, 'the DataTables pagination should be on screen').toBe(true);
        verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - DataTables version on ${DASHBOARD_MENU_PATH}`,
          passed: verifyPassed,
          highlight: [DataTablesDashboardPage.WRAPPER_SELECTOR],
          lines: verifyLines,
        }).catch(() => {});
      }
    });
  });
});
