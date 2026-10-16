import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users, baseUrl } from '@config/users.config';
import { HomePage, LoginPage, OpportunityPage, HelpdeskPage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas } from '@helpers/uc-a-2-deal-registration.helper';
import { deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';
import { presalesRunId, printVerify, raiseSERequestFromOpportunity, verifyCaption, waitForRaiseLogNote, VerifyLine } from '@helpers/uc-presales-7x.helper';

/**
 * ============================================================================================
 *  pre-sale-7.14.1.1 - A customer/reseller portal user cannot access internal SE Support requests.
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:     pre-sale-7.14.1.1
 *  Jira:             CRM-12232
 *  Automation-Type:  new
 *  Automation-Date:  2026-10-15
 *  Run as:           reseller PORTAL user (users.reseller_bronze, a portal contact of
 *                    TEST-Reseller#Automation-Jun10); the request is raised by Thomas Semerich -
 *                    on PRE-PRODUCTION
 *  Source manual TC: CRM-12232 (Xray Manual Steps, 3 steps)
 *  Source version:   updated 2026-09-18T10:26:06+0300 - re-check before trusting this spec
 *  Xray path:        /CRM test/CRM module/Pre-sales SE support/7.14 Security & access
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    The reseller opens his Opportunity on the portal: no Tickets / SE-request element is offered, and
 *    the request's backend URL refuses him (no Subject, messages or assignee shown).
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.14\.1\.1:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (same order, same content):
 *
 *  Pre-condition 1:
 *    A request exists on the Sales Engineers team (Subject = "Internal only <unique>") linked to an
 *    Opportunity in a Reseller's account.
 *      Built here: Thomas creates a deal-registration Opportunity assigned to the reseller
 *      TEST-Reseller#Automation-Jun10 (so it is listed under the reseller's My Opportunities) and
 *      raises the request; the request's backend URL is captured.
 *  Pre-condition 2:
 *    Log in to the customer/reseller PORTAL as a portal user (a portal contact of that Reseller partner).
 *      Pre-production note: the partner portal accounts sometimes have 2FA switched back on - run
 *      tests/_maintenance/admin-remove-2fa-partners.spec.ts (RUN_2FA_FIX=1) first if the sign-in stops
 *      at "Authentication Code".
 *
 *  Steps to reproduce:
 *    1. Log in to the reseller PORTAL as a portal user; open "My Opportunities" and the Opportunity
 *       linked to "Internal only <unique>".                          Expected: (EMPTY in Jira)
 *    2. Inspect the portal page for any SE-request widget/link.
 *         Expected: No "Tickets" / SE-request element is present on the portal page (assert absent).
 *    3. Attempt to open the request's backend URL directly while in the portal session.
 *         Expected: Direct access to the request URL is refused (assert HTTP 403 / redirect to portal
 *                   home); request content, messages and assignee are NOT visible.
 *         Pre-production (verbatim, pinned 2026-10-15): the URL is kept and an "Odoo Server Error - Access
 *         Error" dialog reads "Sorry, you are not allowed to access this document. Only users with the
 *         following access level are currently allowed to do that: - User types/Internal User ..." -
 *         no redirect. Jira proposal: accept the Access Error as the refusal in step 3.
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Thomas creates a deal-registration Opportunity assigned to the Reseller and raises the request "Internal only <unique>"; the request backend URL is captured',
  s1: 'Step 1: Log in to the reseller PORTAL as a portal user; open "My Opportunities" and the Opportunity linked to "Internal only <unique>"',
  s2: 'Step 2: Inspect the portal page for any SE-request widget/link',
  s3: "Step 3: Attempt to open the request's backend URL directly while in the portal session",
  verify: 'Verification',
} as const;

const TC = 'pre-sale-7.14.1.1';
// Pinned 2026-10-15: the backend refuses the portal session with this Access Error (the URL itself stays).
const ACCESS_REFUSAL = 'Sorry, you are not allowed to access this document.';
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

test.describe(`${TC} - Portal user cannot access internal SE Support requests`, () => {
  let createdOppUrl: string | null = null;
  let createdTicketSubject: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      await new HomePage(page).waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    await deleteCreatedSESupportTicketAndOppAsAdmin(page, { ticketSubject: createdTicketSubject, oppUrl: createdOppUrl }, { ticket: SKIP_CLEANUP_TICKET, opp: SKIP_CLEANUP_OPP }, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: A customer/reseller portal user cannot access internal SE Support requests.`, async ({ page }, testInfo) => {
    // Deal-registration create + raise + Tickets lookup + portal session: wider SE-flow budget. (At 15 min the
    // test timed out inside step 3 and the teardown's admin page was read as the portal result.)
    test.setTimeout(config.timeouts.seMeetingTest);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const opportunityPage = new OpportunityPage(page);
    const helpdesk = new HelpdeskPage(page);
    const portal = new ResellerPortalPage(page);
    const unique = presalesRunId();
    const subject = `Internal only ${unique}`;
    const { companyEmail, leadName, note } = generateDealRegistrationNote();
    const oppName = `SE Internal Only ${unique}`;
    let ticketUrl = '';

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, { oppName, contactName: leadName, companyEmail, internalNote: note, stepPrefix: 'Pre-condition 1' });
      await opportunityPage.openByUrl(createdOppUrl);
      await opportunityPage.waitForCompanyAndContactPopulated();
      createdTicketSubject = subject;
      await raiseSERequestFromOpportunity(page, createdOppUrl, { subject, description: 'Internal only check', supportType: 'Online deployment session' });
      await waitForRaiseLogNote(page, createdOppUrl, subject);
      await opportunityPage.openLinkedTickets();
      if (await helpdesk.isTicketVisible(subject)) await helpdesk.openTicket(subject);
      const ticketId = await helpdesk.waitForIdInUrlAndExtract(CommonUtils.waitTimes.abnormalWait).catch(() => '');
      ticketUrl = `${baseUrl.replace(/\/$/, '')}/web#id=${ticketId}&model=helpdesk.ticket&view_type=form`;
      console.log(`  - Opportunity        : ${oppName}`);
      console.log(`  - Request            : ${subject}`);
      console.log(`  - Request backend URL: ${ticketUrl}`);
      expect(ticketId, 'Pre-condition 1: the request id should be captured').not.toBe('');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - request raised').catch(() => {});
    });

    let openedOpp = '';
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await loginPage.logout(baseUrl).catch(() => {});
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await portal.waitForPortalReady();
      console.log(`  - Signed in with users.reseller_bronze (${users.reseller_bronze.username})`);
      // Pre-condition 2 guard: the TC is about a PORTAL user - an internal account could never prove the portal
      // restriction, so stop here with the reason if the configured account ever stops being portal-only.
      const probe = await portal.probeBackendAccess();
      expect(probe.portalOnly, `Pre-condition 2: users.reseller_bronze must be a PORTAL-only user, but it opened the backend (${probe.landedOn}) as "${probe.topbarUser}" - fix the test account`).toBeTruthy();
      await portal.gotoPortalHome();
      await portal.clickMyOpportunities();
      openedOpp = await portal.openOpportunityByName(oppName);
      console.log(`  - Opportunity opened on the portal : ${openedOpp || '(not found)'}`);
      expect(openedOpp, 'Step 1: the reseller should open the linked Opportunity on the portal').not.toBe('');
    });

    let seElements: string[] = [];
    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      seElements = await portal.getSERequestElementLabels();
      console.log(`  - SE-request / Tickets elements on the portal page : ${seElements.length ? seElements.join(' | ') : 'none'}`);
      let ok2 = false;
      try {
        expect(seElements, 'Step 2: no Tickets / SE-request element on the portal page').toEqual([]);
        ok2 = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - portal Opportunity page`, passed: ok2, highlight: ['main'], lines: [`SE elements: ${seElements.join(' | ') || 'none'}`] }).catch(() => {});
      }
    });

    let direct = { finalUrl: '', excerpt: '', probeVisible: true };
    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      direct = await portal.tryOpenBackendRecord(ticketUrl, subject);
      console.log(`  - Landed on            : ${direct.finalUrl}`);
      console.log(`  - Page shows           : ${direct.excerpt}`);
      console.log(`  - Request Subject shown: ${direct.probeVisible}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - backend URL tried from the portal').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const redirected = !/model=helpdesk\.ticket/.test(direct.finalUrl) || /\/web\/login|\/my/.test(direct.finalUrl);
      const accessError = direct.excerpt.includes(ACCESS_REFUSAL);
      const refused = redirected || accessError;
      const lines: VerifyLine[] = [
        { what: 'No Tickets / SE-request element on the portal Opportunity page', expected: 'absent', actual: seElements.length ? seElements.join(' | ') : 'absent', pass: seElements.length === 0 },
        { what: 'Direct access to the request URL is refused', expected: `redirect to the portal / login, or the Access Error "${ACCESS_REFUSAL}"`, actual: accessError ? `Access Error shown (URL kept: ${direct.finalUrl})` : redirected ? `redirected to ${direct.finalUrl}` : `NOT refused - ${direct.finalUrl}`, pass: refused },
        { what: 'Request content NOT visible to the portal user', expected: `"${subject}" not shown (shown = internal request leaked)`, actual: direct.probeVisible ? 'SHOWN' : 'not shown', pass: !direct.probeVisible },
      ];
      const ok = printVerify(lines, 'the portal user cannot see or open the internal SE request');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - backend URL refused`, passed: ok, highlight: ['body'], lines: verifyCaption(lines) }).catch(() => {});
      expect(seElements, 'no SE-request element on the portal').toEqual([]);
      expect(refused, 'direct backend access must be refused').toBeTruthy();
      expect(direct.probeVisible, 'the request Subject must not be visible').toBeFalsy();
    });
  });
});
