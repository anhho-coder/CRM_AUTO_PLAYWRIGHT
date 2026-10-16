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
 *  Test Case ID     : CRM-8339_1.1
 *  Jira             : CRM-11491 (Xray Manual Steps, 4 steps)
 *  Source version   : CRM-11491 updated 2026-07-09T10:36+0300 - re-check before trusting this spec
 *  Test Repository  : /CRM test/Security/CRM-8339_Pen test findings 5.9/US3 Preserve portal functionality
 *  Target           : pre-production.nakivo.site
 *  Run as           : partner portal user (reseller_gold) - the case is about a PARTNER reaching
 *                     the portal, so it must not run as a CRM admin
 *  Automation-Type  : new
 *  Automation-Date  : 2026-10-13
 *  Evidence         : one screenshot at the end of each "Steps to reproduce" section, a
 *                     verify-point capture on the signed-in portal, plus afterEach start/end.
 *
 *  Summary
 *  ---------------------------------------------------------------------------------------------
 *  Checks that after the remediation a partner can still reach the portal over HTTPS with a
 *  certificate the browser accepts, sign in and sign out again.
 *
 *  Command to run
 *  ---------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-8339_1\\.1:" --project=chromium
 *
 *  ---------------------------------------------------------------------------------------------
 *  Source manual TC - CRM-11491 (verbatim, in order)
 *  ---------------------------------------------------------------------------------------------
 *  Pre-conditions:
 *    A remediated build of the Odoo Portal is deployed to the test environment
 *    Have valid partner portal credentials ready:
 *      _ Portal URL   = the portal address over HTTPS
 *      _ Login email  = an active partner account
 *      _ Password     = the account's current password
 *    AUTOMATION: the environment under test is pre-production, and the partner account comes from
 *    users.config (reseller_gold). The manual case names portal.nakivo.com as an example; that is
 *    PRODUCTION and this spec deliberately does not touch it.
 *
 *  Steps to reproduce #1 - reach the portal over HTTPS:
 *    1. Open the portal URL in a browser
 *       Expected: 1. Portal home page loads over HTTPS with no security warning
 *    2. Check the browser address bar and certificate details
 *       Expected: 2. Certificate is valid (not expired, issued to the portal domain, trusted)
 *       AUTOMATION: read through the navigation response's security details - the same certificate
 *       the padlock in the address bar shows. A certificate the browser rejects fails the
 *       navigation outright, so "readable" is itself part of "trusted".
 *
 *  Steps to reproduce #2 - sign in and out:
 *    3. Enter the partner login email and password and click Log in
 *       Expected: 3. Login succeeds and the partner home/dashboard is shown
 *       AUTOMATION: signed in with loginPortalUser - a partner has no CRM back-office menu, so the
 *       standard login helper's wait would never complete for this account.
 *    4. Log out
 *       Expected: 4. Logout succeeds and returns to the login page
 *
 *  ---------------------------------------------------------------------------------------------
 *  ENVIRONMENT NOTE - 2FA, cleared on 2026-10-13
 *  ---------------------------------------------------------------------------------------------
 *  The six partner test accounts on pre-production had two-factor authentication enabled again
 *  (res.users.is_2fa_enable = true on ids 18149-18154, measured 2026-10-13), which stops any
 *  automated sign-in at the "Authentication Code" screen. It was cleared on 2026-10-13 with the
 *  tester's approval. If this spec ever fails at step 3 with a page titled "2FA | NAKIVO Partner
 *  Portal", 2FA has been switched back on - that is an environment change, not a product defect.
 * =============================================================================================
 */

const TC = 'CRM-8339_1.1';

/** The portal path a partner lands on; the case's "portal home page". */
const PORTAL_HOME_PATH = 'my';
/** The host the certificate must be issued to - derived from the environment under test. */
const EXPECTED_HOST = new URL(baseUrl).host;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Have valid partner portal credentials ready for pre-production',
  s1: 'Step 1: Open the portal URL in a browser',
  s2: 'Step 2: Check the browser address bar and certificate details',
  s3: 'Step 3: Enter the partner login email and password and click Log in',
  s4: 'Step 4: Log out',
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
      await CommonUtils.waitForSpinnersToHide(
        page,
        CommonUtils.waitTimes.extraLong,
        CommonUtils.waitTimes.abnormalWait
      ).catch(() => {});
    }
    // No teardown: this TC signs in and out and creates nothing.
    await CommonUtils.captureAndAttachScreenshot(
      page,
      testInfo,
      `${TC} - afterEach - teardown done`
    ).catch(() => {});
  });

  test(`${TC}: Portal is reachable over HTTPS with a valid TLS certificate and partner login works after remediation`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const portalPage = new PortalFunctionalityPage(page);
    const partner = users.reseller_gold;

    let certificate = {
      status: 0,
      url: '',
      protocol: '',
      issuer: '',
      subjectName: '',
      validFrom: 0,
      validTo: 0,
      readable: false,
    };
    let signedIn = false;
    let identityAfterLogin = { url: '', title: '', headings: [] as string[] };
    let urlAfterLogout = '';
    let loginPageShownAfterLogout = false;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Portal URL  : ${baseUrl.replace(/^http:/, 'https:')}${PORTAL_HOME_PATH}`);
      console.log(`  - Login email : ${partner.username}`);
      console.log('  - Password    : (from config/users.secrets.json)');
    });

    // ------------------------------------------------- Steps to reproduce #1
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      certificate = await portalPage.openOverHttpsAndReadCertificate(baseUrl, PORTAL_HOME_PATH);
      console.log(`  - HTTP status : ${certificate.status}`);
      console.log(`  - Landed on   : ${certificate.url}`);
      console.log(`  - Protocol    : ${certificate.protocol}`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const toDate = (seconds: number) =>
        seconds ? new Date(seconds * 1000).toISOString().slice(0, 10) : '(none)';
      console.log(`  - Certificate readable : ${certificate.readable}`);
      console.log(`  - Issued to            : ${certificate.subjectName}`);
      console.log(`  - Issued by            : ${certificate.issuer}`);
      console.log(`  - Valid from           : ${toDate(certificate.validFrom)}`);
      console.log(`  - Valid to             : ${toDate(certificate.validTo)}`);
      console.log(`  - Today                : ${new Date().toISOString().slice(0, 10)}`);

      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `${TC} - Steps to reproduce I - portal reached over HTTPS`
      );
    });

    // ------------------------------------------------- Steps to reproduce #2
    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(partner.username, partner.password);
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      identityAfterLogin = await portalPage.getPageIdentity();
      signedIn = await portalPage.isSignedIn();
      console.log(`  - Account       : ${partner.username}`);
      console.log(`  - Landed on     : ${identityAfterLogin.url}`);
      console.log(`  - Page title    : ${identityAfterLogin.title}`);
      console.log(`  - Headings      : ${JSON.stringify(identityAfterLogin.headings)}`);
      console.log(`  - Account area reachable : ${signedIn}`);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `${TC} - Steps to reproduce II - signed in to the partner portal`
      );

      await loginPage.logout(baseUrl).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      urlAfterLogout = page.url();
      loginPageShownAfterLogout = /\/web\/login/.test(urlAfterLogout);
      console.log(`  - URL after logout     : ${urlAfterLogout}`);
      console.log(`  - Login page reached   : ${loginPageShownAfterLogout}`);
    });

    // ------------------------------------------------------------- Verification
    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);

      const nowSeconds = Math.floor(Date.now() / 1000);
      const httpsOk = certificate.status === 200 && certificate.protocol === 'https:';
      const certReadableOk = certificate.readable;
      const certNotExpiredOk = certificate.validTo > nowSeconds && certificate.validFrom < nowSeconds;
      const certHostOk =
        certificate.subjectName === EXPECTED_HOST ||
        certificate.subjectName.startsWith('*.') &&
          EXPECTED_HOST.endsWith(certificate.subjectName.slice(1));
      const certIssuerOk = certificate.issuer.length > 0;
      const loginOk = signedIn && !/2FA/i.test(identityAfterLogin.title);
      const logoutOk = loginPageShownAfterLogout;

      const toDate = (seconds: number) =>
        seconds ? new Date(seconds * 1000).toISOString().slice(0, 10) : '(none)';
      const verifyLines = [
        `HTTPS status : ${certificate.status} (${certificate.protocol})`,
        `Issued to    : ${certificate.subjectName}`,
        `Issued by    : ${certificate.issuer}`,
        `Valid to     : ${toDate(certificate.validTo)}`,
        `Signed in    : ${signedIn}`,
      ];

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The portal home page loads over HTTPS:');
      console.log(`     Expected : HTTP 200 and the page served on protocol "https:" (an http: landing means the TLS redirect is gone)`);
      console.log(`     Actual   : HTTP ${certificate.status}, protocol ${certificate.protocol}`);
      console.log(`     Result   : ${httpsOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #2 - The browser accepted the certificate (trusted):');
      console.log(`     Expected : certificate details are readable from the navigation - a certificate the browser refuses fails the navigation instead, so an unreadable one here means there was no usable TLS session at all`);
      console.log(`     Actual   : readable=${certificate.readable}`);
      console.log(`     Result   : ${certReadableOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #3 - The certificate is not expired:');
      console.log(`     Expected : valid-from is in the past and valid-to is in the future, measured against today (${new Date().toISOString().slice(0, 10)})`);
      console.log(`     Actual   : ${toDate(certificate.validFrom)} -> ${toDate(certificate.validTo)}`);
      console.log(`     Result   : ${certNotExpiredOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #4 - The certificate is issued to the portal domain:');
      console.log(`     Expected : subject name "${EXPECTED_HOST}", or a wildcard covering it (a certificate for a different host would make the browser warn even while TLS itself works)`);
      console.log(`     Actual   : ${certificate.subjectName}`);
      console.log(`     Result   : ${certHostOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #5 - The certificate names an issuer:');
      console.log(`     Expected : a non-empty issuer`);
      console.log(`     Actual   : ${certificate.issuer || '(empty)'}`);
      console.log(`     Result   : ${certIssuerOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #6 - The partner sign-in succeeds and the account area is shown:');
      console.log(`     Expected : the account area is reachable and the page is NOT the "2FA | NAKIVO Partner Portal" challenge (a 2FA title here means two-factor authentication was switched back on for the test accounts - an environment change, not a product defect)`);
      console.log(`     Actual   : account area reachable=${signedIn}, title="${identityAfterLogin.title}"`);
      console.log(`     Result   : ${loginOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #7 - Logging out returns to the login page:');
      console.log(`     Expected : the browser lands on a /web/login address`);
      console.log(`     Actual   : ${urlAfterLogout}`);
      console.log(`     Result   : ${logoutOk ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');

      const overall =
        httpsOk && certReadableOk && certNotExpiredOk && certHostOk && certIssuerOk && loginOk && logoutOk;
      console.log(
        `OVERALL: ${overall ? 'PASS' : 'FAIL'} - partner portal HTTPS, certificate, sign-in and sign-out on ${EXPECTED_HOST}`
      );

      let verifyPassed = false;
      try {
        expect(certificate.status, 'the portal home page should answer HTTP 200 over HTTPS').toBe(
          200
        );
        expect(certificate.protocol, 'the page should be served over TLS').toBe('https:');
        expect(certificate.readable, 'the browser should have accepted a certificate').toBe(true);
        expect(
          certificate.validTo,
          `the certificate should not be expired (valid to ${toDate(certificate.validTo)})`
        ).toBeGreaterThan(nowSeconds);
        expect(certificate.validFrom, 'the certificate should already be valid').toBeLessThan(
          nowSeconds
        );
        expect(
          certHostOk,
          `the certificate should be issued to ${EXPECTED_HOST}, got "${certificate.subjectName}"`
        ).toBe(true);
        expect(certificate.issuer, 'the certificate should name an issuer').not.toBe('');
        expect(
          identityAfterLogin.title,
          'the sign-in should not stop at the 2FA challenge'
        ).not.toMatch(/2FA/i);
        expect(signedIn, 'the partner account area should be reachable after sign-in').toBe(true);
        expect(loginPageShownAfterLogout, 'logging out should return to the login page').toBe(true);
        verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - portal HTTPS, certificate and sign-in`,
          passed: verifyPassed,
          lines: verifyLines,
        }).catch(() => {});
      }
    });
  });
});
