import { test, expect } from '@playwright/test';
import { baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  CRM-8336 - Pen test findings (Security) - jQuery DataTables library version
 *  Check 1 - the version of the library the server hands to a visitor with no session
 * =============================================================================================
 *  Test Case ID     : CRM-8336_US3.9
 *  Jira             : CRM-12630 (Implementation - Dev), parent CRM-8336, spec CRM-11483
 *  Test Repository  : CRM test/Security/CRM-8336_Pen test findings 5.3 Prototype pollution/US3 Preserve portal functionality
 *  Target           : pre-production.nakivo.site
 *  Run as           : no account at all - the request must carry no session
 *  Automation-Type  : refactored
 *  Automation-Date  : 2026-09-30
 *  Source           : Vitalii Ivanov, comment on CRM-12630 (2026-09-23, edited 2026-09-24) - "Check 1"
 *  Source version   : CRM-12630 updated 2026-09-25T20:37+0300 - re-check before trusting this spec
 *  Evidence         : stdout only - this TC drives no UI, so there is no screen to capture.
 *
 *  Summary
 *  ---------------------------------------------------------------------------------------------
 *  Asserts the acceptance criterion of CRM-12630 on the library file the server hands to an
 *  unauthenticated request: the version it reports must be at least 1.13.11, and the version the
 *  pen test flagged (1.10.21, affected by CVE-2020-28458 and CVE-2021-23445) must not appear.
 *  This address is stable across asset rebuilds, so it is the reliable handle for the check.
 *
 *  Command to run
 *  ---------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-8336_US3\\.9:" --project=chromium
 *
 *  ---------------------------------------------------------------------------------------------
 *  Source manual TC - CRM-12630 comment, "Check 1 - the shortest one: ask the server for the
 *  library file directly" (verbatim, in order)
 *  ---------------------------------------------------------------------------------------------
 *  Pre-condition(s):
 *    _ No session at all - the request is made the way a private/incognito window makes it.
 *      The browser context is created fresh and its cookies are cleared before the request, so
 *      nothing identifies the caller.
 *
 *  Steps to reproduce #1:
 *    1. Open this address in a private/incognito window, i.e. with no session at all:
 *       http://pre-production.nakivo.site/nakivo_dashboard/static/lib/DataTables/datatables.min.js
 *
 *  Verification - Expected Result on step 1:
 *    _ The request returns HTTP 200
 *    _ The file header reports a DataTables version GREATER THAN OR EQUAL TO 1.13.11
 *    _ There is no occurrence of 1.10.21 anywhere in the file
 *    _ The request carries 0 cookies, which proves the file really is served without a session
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
 *  (Note for CRM-11483: that spec records the minimum as 1.11.0, which is wrong - 1.11.0/.1/.2
 *  satisfy the written spec while remaining vulnerable to CVE-2021-23445. Raised on CRM-12630.)
 *
 *  History: before the CRM-12630 deploy on 2026-09-25 this address served 84 975 bytes reporting
 *  dt/dt-1.10.21. It now serves 88 194 bytes reporting dt/dt-1.13.11. The byte count is recorded
 *  as an observation only - it changes with every version and is not an acceptance criterion.
 * =============================================================================================
 */

const TC = 'CRM-8336_US3.9';

/** The stable address - it carries no internal id, so an asset rebuild does not change it. */
const LIBRARY_PATH = 'nakivo_dashboard/static/lib/DataTables/datatables.min.js';

const EXPECTED_STATUS = 200;
/** The floor the served library must meet or beat. See the header for why this is a floor. */
const MIN_VERSION = '1.13.11';
/** The version the pen test flagged. It must not appear anywhere in the file. */
const VULNERABLE_VERSION = '1.10.21';

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
  s1:
    'Step 1: [INTERNAL check, HTTP request] Open ' +
    'http://pre-production.nakivo.site/nakivo_dashboard/static/lib/DataTables/datatables.min.js ' +
    'in a private/incognito window, i.e. with no session at all',
  verify: 'Verification',
} as const;

test.describe('CRM-8336 Security - DataTables library version (US3 - version verification)', () => {
  test.beforeEach(async ({ context }) => {
    // "No session at all": drop anything the context might carry before the request is made.
    await context.clearCookies();
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const reason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (reason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${reason.replace(/\n/g, '\n   ')}`);
      }
      await page.waitForTimeout(CommonUtils.waitTimes.long);
    }
    // No teardown: this TC reads a static file and creates nothing.
  });

  test(`${TC}: The DataTables library served without a session reports a version at or above ${MIN_VERSION}`, async ({
    page,
  }) => {
    test.setTimeout(config.timeouts.test);

    const libraryUrl = `${baseUrl}${LIBRARY_PATH}`;

    let statusCode = 0;
    let byteLength = 0;
    let builderTags: string[] = [];
    let servedVersion = '';
    let containsVulnerableVersion = false;
    let cookieCountOnRequest = 0;

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);

      // Proof the caller really is anonymous: an empty jar means no session travelled with it.
      cookieCountOnRequest = (await page.context().cookies()).length;

      const response = await page.request.get(libraryUrl, {
        timeout: CommonUtils.waitTimes.pageLoad,
      });
      statusCode = response.status();
      const body = await response.text();
      byteLength = Buffer.byteLength(body, 'utf8');

      builderTags = Array.from(new Set(body.match(/dt\/dt-\d+\.\d+\.\d+/g) ?? []));
      servedVersion = builderTags.length ? builderTags[0].replace('dt/dt-', '') : '';
      containsVulnerableVersion = body.includes(VULNERABLE_VERSION);

      console.log(`  - URL                 : ${libraryUrl}`);
      console.log(`  - Cookies sent        : ${cookieCountOnRequest} (0 = no session, as required)`);
      console.log(`  - HTTP status         : ${statusCode}`);
      console.log(`  - Content-Type        : ${response.headers()['content-type'] ?? '(none)'}`);
      console.log(`  - Builder tags found  : ${builderTags.length ? builderTags.join(', ') : '(none)'}`);
      console.log(`  - Version served      : ${servedVersion || '(could not be read)'}`);
      console.log(`  - Contains ${VULNERABLE_VERSION}    : ${containsVulnerableVersion}`);
      console.log(`  - Bytes returned      : ${byteLength}  (observation only - changes with every version)`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);

      const check1 = statusCode === EXPECTED_STATUS;
      const check2 = cookieCountOnRequest === 0;
      const check3 = servedVersion !== '' && compareVersions(servedVersion, MIN_VERSION) >= 0;
      const check4 = !containsVulnerableVersion;

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The library file is served to a request carrying no session:');
      console.log(`     Expected : HTTP ${EXPECTED_STATUS}`);
      console.log(`     Actual   : HTTP ${statusCode}`);
      console.log(`     Result   : ${check1 ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #2 - The request really was anonymous:');
      console.log(`     Expected : 0 cookies on the request (a non-zero count would mean the check ran with a session and proves nothing about anonymous access)`);
      console.log(`     Actual   : ${cookieCountOnRequest} cookies`);
      console.log(`     Result   : ${check2 ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #3 - The served library is at or above the accepted floor:');
      console.log(`     Expected : version >= ${MIN_VERSION} (a LOWER version means the vulnerable library is back or the module was downgraded; an empty value means the builder tag could not be read and the check proved nothing)`);
      console.log(`     Actual   : ${servedVersion || '(no builder tag found)'}`);
      console.log(`     Result   : ${check3 ? 'PASS' : 'FAIL'}`);

      console.log(`  Verify #4 - The version the pen test flagged is absent:`);
      console.log(`     Expected : no occurrence of ${VULNERABLE_VERSION} anywhere in the file`);
      console.log(`     Actual   : ${containsVulnerableVersion ? `${VULNERABLE_VERSION} FOUND` : 'not present'}`);
      console.log(`     Result   : ${check4 ? 'PASS' : 'FAIL'}`);

      console.log(`  Observation (not scored) - bytes served : ${byteLength}`);
      console.log('===============================================');

      const overall = check1 && check2 && check3 && check4;
      console.log(
        `OVERALL: ${overall ? 'PASS' : 'FAIL'} - the anonymous request is served DataTables ` +
          `${servedVersion || '(unknown)'} (floor ${MIN_VERSION})`
      );

      expect(statusCode, `the library should be served anonymously with HTTP ${EXPECTED_STATUS}`).toBe(
        EXPECTED_STATUS
      );
      expect(cookieCountOnRequest, 'the request must carry no session for this check to mean anything').toBe(0);
      expect(servedVersion, 'a DataTables builder tag should be readable in the served file').not.toBe('');
      expect(
        compareVersions(servedVersion, MIN_VERSION),
        `the served library should be >= ${MIN_VERSION}, got ${servedVersion}`
      ).toBeGreaterThanOrEqual(0);
      expect(
        containsVulnerableVersion,
        `${VULNERABLE_VERSION} must not appear anywhere in the served file - it is the version CVE-2020-28458 and CVE-2021-23445 apply to`
      ).toBe(false);
    });
  });
});
