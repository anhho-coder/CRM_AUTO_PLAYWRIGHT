import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_6.4 - A portal account sees no request and no team
 * ============================================================================================
 * Test Case ID   : CRM-12135_6.4
 * Jira           : CRM-12135
 * Requirements   : IS-CRM-SEC-0008, IS-CRM-SEC-0009
 * Run as         : Portal (qa_portal account)
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 * Evidence       : stdout only - this case drives no screen, so its logs ARE the artifact.
 *
 * Summary
 * -------
 *    This test verifies that pre-sale requests are internal and not visible to portal accounts.
 *   It signs in as a portal user and attempts to read both the helpdesk.ticket and
 *   helpdesk.ticket.team models. The test is read-only, querying for visibility without
 *   creating or modifying records. Pass conditions are: either the read is refused outright, or
 *   zero records are returned.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-39:" --project=chromium
 *
 * Source manual TC
 * ----------------
 * Jira CRM-12944 from the CRM-12135 Pre-sales SE support suite.
 *
 *   Pre-condition(s):
 *      Portal user account qa.portal@yopmail.com with portal role on Pre-Sales Application
 *
 *   Steps to reproduce:
 *      1. In a private browser window open https://pre-sales-crm-mig.nakivo.site/web/login and sign in
 *         as qa.portal@yopmail.com
 *      2. In the same window open link L
 *
 *   Verification (expected results):
 *      1. The portal My account page opens, not the Pre-sale tickets backend
 *      2. The request does not open; the portal My account page is shown
 *
 * Data
 * ----
 * READ-ONLY - this case creates no record on either server.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1: 'Pre-condition: Portal user account qa.portal@yopmail.com with portal role on Pre-Sales Application',
  s1:   'Step 1: In a private browser window open https://pre-sales-crm-mig.nakivo.site/web/login and sign in as qa.portal@yopmail.com',
  s2:   'Step 2: In the same window open link L',
  verify: 'Verification',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe('CRM-12135_6.4 - A portal account sees no request and no team', () => {
  test.afterEach(async ({ browser }, testInfo) => {
    if (sharedPage) {
      await CommonUtils.captureAndAttachScreenshot(sharedPage, testInfo, 'afterEach - start').catch(() => {});
    }
    if (teardown) {
      // The test left the try block without cleaning up - a TIMEOUT skips finally. Sweep from here
      // on a fresh session instead of only reporting it; a timeout used to leave records behind.
      console.log('TEARDOWN DID NOT RUN in the test body - sweeping from afterEach on a fresh session.');
      const swept = await MigPreSalePage.sweepLeftovers(browser);
      console.log(`  afterEach SWEEP: removed requests [${swept.requests.join(', ')}] and `
        + `opportunities [${swept.opportunities.join(', ')}]`
        + (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
      teardown = undefined;
    }
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`TEST FAILED - reason: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
    if (sharedPage) {
      await CommonUtils.captureAndAttachScreenshot(sharedPage, testInfo, 'afterEach - teardown done').catch(() => {});
    }
    sharedPage = undefined;
  });

  test('CRM-12135_6.4: Signing in as a portal user, or opening a request link, stays on the portal My account page', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log('========== CRM-12135_6.4 - Portal account stays on My account page ==========');

    // This case cannot be automated today, and it must SAY SO rather than pass.
    // Until 2026-09-25 the spec ended with `expect(true, 'RE-SYNC GAP: ...').toBe(true)` - an
    // assertion that cannot fail. It reported PASS on every run while verifying nothing, which is
    // worse than a red test: a reader of the report counted it as coverage that did not exist.
    // ONE thing is missing, and it is ours to write, not anyone else's to supply:
    //   a page-object method to sign in to the Pre-Sales portal through its login FORM.
    // Undo: implement it, then restore the assertions kept in the backup copy of this file
    // (`noRequests` / `noTeams`, spec_backup_before_thuat_rewrite_20260924, lines 206-207).
    test.skip(true, 'BLOCKED - needs a portal UI login helper for the Pre-Sales Application');

    // CORRECTION 2026-10-07: an earlier note here claimed "link L" was named but never defined by
    // CRM-12944, and that claim travelled into the CRM-12456 description. It is WRONG. The manual
    // TC defines L in its pre-conditions: "create one request ... Then copy the browser URL of that
    // request as L." This spec creates that request itself, so it holds the id and can build L.
    const linkL = ''; // derive from the request this spec creates once the portal login helper exists

    const incognitoContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
      // recordVideo must be passed HERE: `video: 'on'` in playwright.config.ts only reaches
      // contexts Playwright creates itself, never one built by hand with browser.newContext().
      recordVideo: { dir: testInfo.outputDir, size: { width: 1920, height: 1080 } },
    });
    const page = await incognitoContext.newPage();
    sharedPage = page;

    try {
      let portalLoginSuccess = false;
      let myAccountPageVisible = false;
      let requestLinkBlockedByPortal = false;

      await test.step(STEP.pre1, async () => {
        console.log(`\n--- ${STEP.pre1} ---`);
        console.log(`  Portal account: qa.portal@yopmail.com (portal role on Pre-Sales Application)`);
      });

      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        await page.goto('https://pre-sales-crm-mig.nakivo.site/web/login', { waitUntil: 'domcontentloaded' });

        // Fill login form - note: actual credentials from users.config should be used here
        // but they are not loaded in this spec. This is a gap - see blocked section.
        console.log(`  Navigated to Pre-Sales login page`);

        // BLOCKED: The page object does not have a method to handle portal-specific login.
        // The existing loginPresales() method is designed for backend logins via RPC.
        // Portal login would require: finding the login form, filling email field,
        // filling password field, and clicking submit - all via UI selectors not in MigPreSalePage.

        const loginFormVisible = await page.locator('input[name="login"]').count() > 0;
        if (loginFormVisible) {
          console.log(`  Login form is visible`);
          console.log(`  BLOCKED: Portal login via UI form is not implemented in page object`);
        } else {
          console.log(`  Login form not found - possible redirect already in progress`);
        }
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        if (!linkL) {
          console.log(`  BLOCKED: portal login via UI not implemented, so L was never built`);
          console.log(`  L is defined by CRM-12944: the browser URL of the request created in pre-condition 1`);
        } else {
          console.log(`  Attempting to open: ${linkL}`);
          await page.goto(linkL, { waitUntil: 'domcontentloaded' });
          const pageTitle = await page.title();
          console.log(`  Page title after opening link: ${pageTitle}`);
        }
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        console.log('\n==================== VERIFY ====================');
        console.log('Verify #1 - The portal My account page opens, not the Pre-sale tickets backend:');
        console.log(`     Status: BLOCKED - portal login via UI not implemented`);
        console.log('Verify #2 - The request does not open; the portal My account page is shown:');
        console.log(`     Status: BLOCKED - portal login via UI not implemented`);
        console.log('===============================================');

        // No assertion here on purpose - the test skips before reaching this point (see the
        // test.skip at the top). A vacuous expect(true).toBe(true) used to sit here.
      });

    } finally {
      // Evidence FIRST, while the page is still alive. afterEach runs after this block, so its
      // screenshots could only ever find a closed page - which is why every run logged
      // "Screenshot skipped ... has been closed". A thrown assertion also passes through
      // finally, so a red run is captured the same way.
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Final state before teardown')
        .catch(() => {});

      // Teardown runs HERE, not in afterEach: it needs the live session, and afterEach only
      // sees a closed context. A thrown assertion still passes through finally, so a red run
      // cleans up too.
      if (teardown) {
        try {
          await teardown();
        } catch (err) {
          console.log(`TEARDOWN ERROR: ${(err as Error).message}`);
        }
        teardown = undefined;
      }
      // The Video handle must be taken BEFORE close; the file is only written on close, and
      // path() resolves once it is. A hand-made context does not attach it to the report
      // either, so attach it explicitly.
      const video = page.video();
      await incognitoContext.close();
      if (video) {
        try {
          await testInfo.attach('video', { path: await video.path(), contentType: 'video/webm' });
          console.log('\u{1F3A5} Video attached');
        } catch (err) {
          console.log(`Video not attached: ${(err as Error).message.split('\n')[0]}`);
        }
      }
      // afterEach must not chase a page this block has just closed.
      sharedPage = undefined;
    }
  });
});
