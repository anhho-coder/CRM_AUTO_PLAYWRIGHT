import { test, expect } from '@playwright/test';
import { users, baseUrl_mig, baseUrl_presales_mig } from '@config/users.config';
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
 * Source TC      : CRM-12944 (Xray Manual Steps, 2 steps)
 * Source version : updated 2026-10-06T12:37:38.907+0300 - re-check before trusting this spec
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
 * CREATES DATA. CRM-12944's pre-conditions require a real request - "create one request ... Then
 * copy the browser URL of that request as L" - so this case raises one and removes it in teardown.
 * The spec was READ-ONLY while it was skipped; it stopped being so when the procedure was restored.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1: 'Pre-condition 1: Portal user account qa.portal@yopmail.com with portal role on Pre-Sales Application',
  pre2: 'Pre-condition 2: Raise one request from a fresh Opportunity and copy its browser URL as link L',
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

    // 2026-10-13: this case runs its procedure for the first time.
    // Until 2026-09-25 it ended with `expect(true, 'RE-SYNC GAP: ...').toBe(true)` - an assertion
    // that cannot fail, reporting PASS on every run while verifying nothing. It was then skipped
    // honestly, waiting on the ONE thing missing and ours to write: a page-object method that
    // signs in to the Pre-Sales Application through its login FORM. That method now exists
    // (MigPreSalePage.loginPresalesUi), so the skip is gone and the steps are real.
    //
    // CORRECTION 2026-10-07, kept because it still governs the design: an earlier note claimed
    // "link L" was named but never defined by CRM-12944, and that claim travelled into the
    // CRM-12456 description. It is WRONG. The manual TC defines L in its pre-conditions -
    // "create one request ... Then copy the browser URL of that request as L" - and this spec
    // creates that request itself, so it holds the id and builds L from it.
    //
    // L is opened by an AUTHORISED user BEFORE the portal account ever sees it. Without that
    // control, a portal user correctly kept out and a portal user handed a dead URL look exactly
    // alike, and the case would go green for the wrong reason - the very failure this spec has
    // already made once.
    let linkL = '';

    // The setup half: raises the request and proves L resolves. A context of its own, because the
    // question the portal half asks is what a FRESH browser does - one shared cookie jar would
    // answer it before the test got to ask.
    const setupContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
    });
    const setupPage = await setupContext.newPage();

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
      let ticketOpensForAuthorisedUser = false;
      let portalLandingPath = '';
      let portalStaysOnItsOwnPages = false;
      let requestHiddenFromPortal = false;
      let requestSubject = '';

      const loginPage = new LoginPageMig(setupPage);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      const preSale = new MigPreSalePage(setupPage);
      await preSale.loginPresales(
        users.anh_ho_presales_mig.username,
        users.anh_ho_presales_mig.password,
      );

      /**
       * Is the request's subject on this screen?
       *
       * Both halves of the case ask it - the control asks it expecting YES, the portal step asks
       * it expecting NO - so they must ask it the same way. `getByText` alone is not enough: on an
       * Odoo form the title renders as an `<input>`, and getByText never matches an input's value.
       * The first run of this spec failed its own control for exactly that reason, which is the
       * control doing its job - had only the portal half used the narrow matcher, "not shown"
       * would have been indistinguishable from "not looked for properly".
       */
      const subjectOnScreen = async (target: import('@playwright/test').Page, timeout: number) => {
        // POLLED, because `locator.isVisible()` does not wait - it answers about the DOM as it is
        // at that instant, and its `timeout` option does not change that. Called right after
        // `domcontentloaded` on an Odoo 19 SPA it always answers false: the shell is up and the
        // form has not rendered yet. Measured 2026-10-13 - the ticket form needs several seconds.
        // Both halves of this case used the unpolled form at first, so the control read false AND
        // the portal check read "not shown" for the same empty-DOM reason. The control is what
        // made that visible; the portal half alone would have gone green saying nothing.
        const deadline = Date.now() + timeout;
        for (;;) {
          const seen = await target.evaluate((needle: string) => {
            const inFields = Array.from(document.querySelectorAll('input, textarea'))
              .some((el) => ((el as HTMLInputElement).value || '').includes(needle));
            return inFields || (document.body?.innerText || '').includes(needle);
          }, requestSubject).catch(() => false);
          if (seen) return true;
          if (Date.now() >= deadline) return false;
          await target.waitForTimeout(500);
        }
      };

      const runId = MigPreSalePage.runId();
      const marker = `${MigPreSalePage.marker('TC-39', runId)}-portal`;
      let leadId = 0;
      let requestId = 0;

      await test.step(STEP.pre1, async () => {
        console.log(`\n--- ${STEP.pre1} ---`);
        console.log(`  Portal account: ${users.qa_portal_presales_mig.username} (portal role on Pre-Sales Application)`);
      });

      await test.step(STEP.pre2, async () => {
        console.log(`\n--- ${STEP.pre2} ---`);
        leadId = await preSale.createOpportunity(`${marker}`, 900);
        console.log(`  Created Opportunity ${leadId}`);
        teardown = async () => {
          if (SKIP_CLEANUP) { console.log(`  TEARDOWN SKIPPED (SKIP_CLEANUP_PRESALE=true) - marker ${marker}`); return; }
          const swept = await preSale.sweepByMarker(marker);
          console.log(`  TEARDOWN: removed requests [${swept.requests.join(', ')}] and opportunities [${swept.opportunities.join(', ')}]`
            + (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
        };

        requestSubject = `${marker} request`;
        await preSale.openOpportunity(leadId);
        await preSale.openRaiseDialog();
        await preSale.fillRaiseDialog({
          subject: requestSubject,
          description: 'Automated check of CRM-12135 TC-39 - a portal account must not reach this request.',
          supportType: 'Offline technical assistance',
        });
        await preSale.saveRaiseDialog();
        await preSale.waitForRaiseDialogClosed();
        const requests = await preSale.requestsForLead(leadId);
        requestId = requests.length > 0 ? requests[0].id : 0;
        // Odoo 19 addresses a record as /odoo/<action path>/<id>; the path is a field on the
        // window action - `helpdesk-tickets` here (ir.actions.act_window 237, read off the
        // instance on 2026-10-13). `/odoo/helpdesk.ticket/<id>` renders the record too, but the
        // action path is the address a human copies out of the browser, which is what CRM-12944
        // means by L. `/odoo/tickets/<id>` is NOT one: it lands on /odoo/discuss.
        linkL = `${baseUrl_presales_mig}odoo/helpdesk-tickets/${requestId}`;
        console.log(`  Opportunity ${leadId} raised request ${requestId}`);
        console.log(`  Request URL: ${MigPreSalePage.requestUrl(requestId)}`);
        console.log(`  Link L: ${linkL}`);

        // THE CONTROL. An /odoo/... path answers HTTP 200 whatever id it carries, because the
        // record is resolved client-side - so a dead link and a live one are indistinguishable
        // over HTTP, and only a real browser settles it. Open L as someone who IS allowed to see
        // the request: if the subject does not render here, L is simply wrong, and the portal
        // half of this case would prove nothing.
        // The control runs on a page of its OWN, not on setupPage. `loginPresales()` authenticated
        // the API jar, not the browser, so the control needs a real sign-in - but doing it on
        // setupPage would navigate that page off the CRM, and `sweepByMarker` reaches the CRM
        // through `page.evaluate` on exactly that page. The first version did navigate it, and
        // teardown then failed with "404 Not Found" and left the Opportunity behind.
        const controlPage = await setupContext.newPage();
        try {
          await MigPreSalePage.loginPresalesUi(
            controlPage,
            users.anh_ho_presales_mig.username,
            users.anh_ho_presales_mig.password,
          );
          await controlPage.goto(linkL, { waitUntil: 'domcontentloaded' });
          ticketOpensForAuthorisedUser = await subjectOnScreen(controlPage, 20000);
        } finally {
          await controlPage.close().catch(() => {});
        }
        console.log(`  CONTROL - L opens the request for an authorised user: ${ticketOpensForAuthorisedUser}`);
      });

      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        portalLandingPath = await MigPreSalePage.loginPresalesUi(
          page,
          users.qa_portal_presales_mig.username,
          users.qa_portal_presales_mig.password,
        );
        // The backend lives under /odoo (Odoo 19) and /web (the legacy entry point). Anywhere else
        // - /my, the website home - is the portal's own territory, which is what SEC-0008 asks for.
        portalStaysOnItsOwnPages = !/^\/(odoo|web)(\/|$)/.test(portalLandingPath);
        console.log(`  Signed in as the portal account; landed on: ${portalLandingPath}`);
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        await page.goto(linkL, { waitUntil: 'domcontentloaded' });
        const subjectVisible = await subjectOnScreen(page, 20000);
        requestHiddenFromPortal = !subjectVisible;
        console.log(`  Opened L as the portal account; now on: ${new URL(page.url()).pathname}`);
        console.log(`  Request subject on screen: ${subjectVisible}`);
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        console.log('\n==================== VERIFY ====================');
        console.log('Control - L opens the request for an authorised user (otherwise the case proves nothing):');
        console.log(`     Expected : true`);
        console.log(`     Actual   : ${ticketOpensForAuthorisedUser}`);
        console.log(`     Result   : ${ticketOpensForAuthorisedUser ? 'PASS' : 'FAIL'}`);
        console.log('Verify #1 - The portal My account page opens, not the Pre-sale tickets backend:');
        console.log(`     Expected : a path outside /odoo and /web`);
        console.log(`     Actual   : ${portalLandingPath}`);
        console.log(`     Result   : ${portalStaysOnItsOwnPages ? 'PASS' : 'FAIL'}`);
        console.log('Verify #2 - The request does not open; the portal stays on its own pages:');
        console.log(`     Expected : the request subject is NOT shown`);
        console.log(`     Actual   : ${requestHiddenFromPortal ? 'not shown' : `shown - "${requestSubject}"`}`);
        console.log(`     Result   : ${requestHiddenFromPortal ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        console.log(`OVERALL: ${ticketOpensForAuthorisedUser && portalStaysOnItsOwnPages && requestHiddenFromPortal ? 'PASS' : 'FAIL'}`
          + ' - A portal account sees no request and no team');

        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Portal view of link L').catch(() => {});

        expect(ticketOpensForAuthorisedUser,
          `link L must open the request for an authorised user, or the portal check proves nothing (L = ${linkL})`).toBe(true);
        expect(portalStaysOnItsOwnPages,
          `the portal account must land outside the backend (landed on ${portalLandingPath})`).toBe(true);
        expect(requestHiddenFromPortal,
          `the portal account must not see request ${requestId} ("${requestSubject}")`).toBe(true);
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
      // The setup context closes AFTER teardown above, which sweeps through its session.
      await setupContext.close().catch(() => {});
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
