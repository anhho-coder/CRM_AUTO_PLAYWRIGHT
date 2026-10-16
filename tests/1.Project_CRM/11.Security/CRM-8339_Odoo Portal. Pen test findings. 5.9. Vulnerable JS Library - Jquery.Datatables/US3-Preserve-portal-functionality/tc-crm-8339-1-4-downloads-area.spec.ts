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
 *  Test Case ID     : CRM-8339_1.4
 *  Jira             : CRM-11494 (Xray Manual Steps, 3 steps)
 *  Source version   : CRM-11494 updated 2026-07-09T10:37+0300 - re-check before trusting this spec
 *  Test Repository  : /CRM test/Security/CRM-8339_Pen test findings 5.9/US3 Preserve portal functionality
 *  Target           : pre-production.nakivo.site
 *  Run as           : partner portal user (reseller_gold)
 *  Automation-Type  : new
 *  Automation-Date  : 2026-10-13
 *  Evidence         : one screenshot at the end of each "Steps to reproduce" section, a
 *                     verify-point capture on the Downloads area, plus afterEach start/end.
 *
 *  Summary
 *  ---------------------------------------------------------------------------------------------
 *  Checks that a partner can still reach the Downloads area after the remediation. The download
 *  itself is marked manual: that file is served by the public www.nakivo.com site embedded in the
 *  page, not by the system under test.
 *
 *  Command to run
 *  ---------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-8339_1\\.4:" --project=chromium
 *
 *  ---------------------------------------------------------------------------------------------
 *  Source manual TC - CRM-11494 (verbatim, in order)
 *  ---------------------------------------------------------------------------------------------
 *  Pre-conditions:
 *    A remediated build of the Odoo Portal is deployed
 *    Log in as an active partner:
 *      _ Login = an active partner
 *
 *  Steps to reproduce #1:
 *    1. Log in to the portal
 *       Expected: (EMPTY IN JIRA - see OPEN POINTS #1)
 *       AUTOMATION: run as a Pre-condition, because it is the sign-in and not the check.
 *    2. Open the Downloads area
 *       Expected: 2. Downloads page lists the available products / versions
 *       AUTOMATION: reached by its navigation entry "Download Trial" under Resources, which points
 *       at /download. The product listing itself is rendered inside an embedded frame - see below.
 *    3. Select a product / version and start a download
 *       Expected: 3. The download starts and completes; the file is the expected type/size (not
 *       empty or corrupt)
 *       [MANUAL ONLY - the file is served by the public www.nakivo.com site embedded in the page,
 *       not by the system under test]
 *
 *  ---------------------------------------------------------------------------------------------
 *  WHY STEP 3 IS MANUAL, AND WHAT STEP 2 CAN ACTUALLY CHECK
 *  ---------------------------------------------------------------------------------------------
 *  Measured on pre-production 2026-10-13, signed in as a partner: /download is a NAKIVO page whose
 *  body embeds a single iframe pointing at
 *      https://www.nakivo.com/resources/download/partner-portal-direct/partner-trial-download
 *  The products, the versions and the download links all live inside that frame, on NAKIVO's
 *  public production website.
 *
 *  So step 3 would mean starting a real download from a third-party production site on every run.
 *  That is outside the system this suite tests and outside what the pen-test remediation touched,
 *  so it is marked [MANUAL ONLY] rather than automated. What step 2 CAN establish, and does here,
 *  is that the Downloads area is reachable from the navigation and that the frame which provides
 *  the listing is embedded and points at the expected provider.
 *
 *  Note on the address: the case does NOT name one - step 2 says only "Open the Downloads area".
 *  The area a partner actually reaches is "Download Trial" at /download, from the Resources menu,
 *  and that is what this spec opens. (An earlier note of mine on CRM-12630, 2026-09-30, said the
 *  case "names an address that does not exist"; re-read on 2026-10-14, it names no address at all.
 *  Correcting it here so the wrong version does not travel further.)
 *
 *  ---------------------------------------------------------------------------------------------
 *  OPEN POINTS raised by this spec (for the case author, not invented answers)
 *  ---------------------------------------------------------------------------------------------
 *  1. Manual step 1 has an EMPTY Expected Result in Xray.
 *  2. Step 3's expected result says "the expected type/size" without naming either. Nothing here
 *     can be checked against an unnamed expectation; the case author has to pin them.
 *  3. Step 2 says only "Open the Downloads area" without naming one, so which screen the case
 *     means is inferred from the navigation rather than stated. Worth pinning in the case.
 * =============================================================================================
 */

const TC = 'CRM-8339_1.4';

/** The real Downloads area and the navigation entry that leads to it. */
const DOWNLOADS_PATH = 'download';
const DOWNLOADS_NAV_LABEL = 'Download Trial';
/** The provider the embedded listing frame must point at. */
const EXPECTED_FRAME_HOST = 'www.nakivo.com';
const EXPECTED_FRAME_PATH = '/resources/download/partner-portal-direct/partner-trial-download';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Log in to the portal as an active partner (source step 1)',
  s2: 'Step 2: Open the Downloads area',
  s3: 'Step 3: [MANUAL ONLY - the file is served by the public www.nakivo.com site embedded in the page, not by the system under test] Select a product / version and start a download',
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
    // No teardown: this TC only browses the Downloads area and creates nothing.
    await CommonUtils.captureAndAttachScreenshot(
      page,
      testInfo,
      `${TC} - afterEach - teardown done`
    ).catch(() => {});
  });

  test(`${TC}: Partner can browse and download software from the portal Downloads area after remediation`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const portalPage = new PortalFunctionalityPage(page);
    const partner = users.reseller_gold;

    let navLinkFound = false;
    let downloadsStatus = 0;
    let identity = { url: '', title: '', headings: [] as string[] };
    let frameSources: string[] = [];

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log('  NOTE: manual step 1 has an EMPTY Expected Result in Xray - nothing is');
      console.log('        asserted for it here. See OPEN POINTS #1 in the header.');
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(partner.username, partner.password);
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      console.log(`  - Account   : ${partner.username}`);
      console.log(`  - Landed on : ${page.url()}`);
    });

    // ------------------------------------------------- Steps to reproduce #1
    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const navLinks = await portalPage.getNavigationLinks();
      const match = navLinks.find((l) => l.text === DOWNLOADS_NAV_LABEL);
      navLinkFound = !!match;
      console.log(`  - Navigation entry "${DOWNLOADS_NAV_LABEL}" : ${navLinkFound ? `found -> ${match?.href}` : 'NOT FOUND'}`);

      downloadsStatus = await portalPage.openPortalPath(baseUrl, DOWNLOADS_PATH);
      identity = await portalPage.getPageIdentity();
      frameSources = await portalPage.getEmbeddedFrameSources();
      console.log(`  - /${DOWNLOADS_PATH} : HTTP ${downloadsStatus}`);
      console.log(`  - Page title        : ${identity.title}`);
      console.log(`  - Embedded frames   : ${frameSources.length}`);
      frameSources.forEach((s) => console.log(`      ${s}`));

      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `${TC} - Steps to reproduce I - the Downloads area open`
      );
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log('  - The products, versions and download links are rendered inside the embedded');
      console.log(`    frame listed above, which is served by ${EXPECTED_FRAME_HOST} - a public`);
      console.log('    production website, not the system under test. Starting a real download');
      console.log('    from it on every run is out of scope for this suite, so the step is');
      console.log('    reported as MANUAL ONLY and nothing is scored for it.');
      console.log('  - Its expected result also names "the expected type/size" without saying');
      console.log('    what either should be - see OPEN POINTS #2.');
    });

    // ------------------------------------------------------------- Verification
    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);

      const navOk = navLinkFound;
      const pageOk = downloadsStatus === 200;
      const titleOk = /download/i.test(identity.title);
      const listingFrame = frameSources.find((s) => s.includes(EXPECTED_FRAME_PATH));
      const frameOk = !!listingFrame && listingFrame.includes(EXPECTED_FRAME_HOST);

      const verifyLines = [
        `Nav entry   : ${DOWNLOADS_NAV_LABEL} ${navLinkFound ? 'found' : 'MISSING'}`,
        `/${DOWNLOADS_PATH}    : HTTP ${downloadsStatus}`,
        `Title       : ${identity.title}`,
        `Frames      : ${frameSources.length}`,
      ];

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The Downloads area is reachable from the portal navigation:');
      console.log(`     Expected : a navigation entry "${DOWNLOADS_NAV_LABEL}" exists (the case names no address - step 2 says only "Open the Downloads area" - so the navigation is what identifies the screen a partner actually follows)`);
      console.log(`     Actual   : ${navLinkFound ? 'found' : 'NOT FOUND'}`);
      console.log(`     Result   : ${navOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #2 - The Downloads page loads:');
      console.log(`     Expected : HTTP 200 for /${DOWNLOADS_PATH}`);
      console.log(`     Actual   : HTTP ${downloadsStatus}`);
      console.log(`     Result   : ${pageOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #3 - The page identifies itself as the Downloads area:');
      console.log(`     Expected : the page title mentions "download"`);
      console.log(`     Actual   : ${identity.title}`);
      console.log(`     Result   : ${titleOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #4 - The product listing frame is embedded and points at its provider:');
      console.log(`     Expected : an iframe whose src contains ${EXPECTED_FRAME_PATH} on ${EXPECTED_FRAME_HOST} - this frame IS the products / versions listing of step 2, so a missing or repointed frame means the partner sees an empty Downloads page`);
      console.log(`     Actual   : ${listingFrame ?? '(no matching frame)'}`);
      console.log(`     Result   : ${frameOk ? 'PASS' : 'FAIL'}`);

      console.log('');
      console.log('  Observation (not scored) - step 3, the download itself : MANUAL ONLY');
      console.log('     The file is served by the public www.nakivo.com site inside the frame');
      console.log('     above, not by the system under test, so it is not started here.');
      console.log('===============================================');

      const overall = navOk && pageOk && titleOk && frameOk;
      console.log(
        `OVERALL: ${overall ? 'PASS' : 'FAIL'} - the Downloads area is reachable and embeds its product listing; the download itself stays manual`
      );

      let verifyPassed = false;
      try {
        expect(navLinkFound, `the portal should offer a "${DOWNLOADS_NAV_LABEL}" entry`).toBe(true);
        expect(downloadsStatus, `/${DOWNLOADS_PATH} should load`).toBe(200);
        expect(identity.title, 'the page should identify itself as the Downloads area').toMatch(
          /download/i
        );
        expect(
          frameOk,
          `the product listing frame should point at ${EXPECTED_FRAME_HOST}${EXPECTED_FRAME_PATH}, got ${JSON.stringify(frameSources)}`
        ).toBe(true);
        verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - Downloads area`,
          passed: verifyPassed,
          lines: verifyLines,
        }).catch(() => {});
      }
    });
  });
});
