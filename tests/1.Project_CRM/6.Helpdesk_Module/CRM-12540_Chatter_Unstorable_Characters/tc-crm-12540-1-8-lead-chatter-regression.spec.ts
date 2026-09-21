import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  CRM-12540 - Log note / send message fails when the body contains NUL or lone-surrogate chars
 * =============================================================================================
 *  Test Case ID    : CRM-12540_1.8
 *  Jira            : CRM-12540  (Post-EA Support Ticket - reported by Support L1 on ticket #426182)
 *  Automation-Type : new
 *  Automation-Date : 2026-09-01
 *  Actor           : Thomas Semerich (Sales IC)
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    CROSS-MODEL REGRESSION. The fix sits on mail.message, not on the helpdesk module, so it changes
 *    chatter on EVERY model at once. The acceptance criteria call this out: "Regression: chatter
 *    posting unchanged on leads, tickets, invoices". CRM-12540_1.1 to _1.7 cover tickets; this covers
 *    a LEAD, and CRM-12540_1.9 covers an invoice.
 *
 *    Both directions are exercised on the same lead: the screen path with a lone half-character (which
 *    does travel through the browser) and the server path with a NUL byte (which cannot).
 *
 *    Actor: a Sales IC, not the Support L2 Manager - a lead is a salesperson's screen, and the Support
 *    role only reaches leads under "Own Documents Only", which would make the case depend on who
 *    happens to own a record.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12540_1.8:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source: CRM-12540 acceptance criteria + the QA verification matrix posted on the ticket
 *          (comment 689172). No Master-file row exists for this case.
 *
 *  DATA NOTE - deliberate, and different from CRM-12540_1.1 to _1.7:
 *    This case does NOT create its own lead. LeadPage.createLead is dead code in this repo (no spec
 *    calls it, so its flow is unproven), and building a create+delete flow for a lead would add far
 *    more risk than a regression check is worth. Instead the case posts a UNIQUELY TAGGED message on
 *    an existing lead the actor can reach and asserts only on that tag - so repeat and parallel runs
 *    cannot collide. Nothing is deleted afterwards: a chatter message is additive, it leaves no record
 *    in a broken state.
 *
 *    Pre-condition(s):
 *      I.  Log in as a Sales IC (Thomas).
 *      II. A lead this actor can open (Odoo's own record rules decide which - so the lead is
 *          guaranteed reachable, unlike "click the first row").
 *    Steps to reproduce:
 *      1. Open that lead.
 *      2. Log note a body carrying a lone UTF-16 surrogate, through the chatter composer.
 *      3. Post a second message on the same lead through the server path, with a raw NUL byte.
 *    Verification / Expected Result:
 *      _ The screen note posts, is visible, and no "Connection lost" / server error appears.
 *      _ The screen note's stored body carries exactly one replacement mark (U+FFFD).
 *      _ The server-path post is accepted - no ValueError about NUL.
 *      _ The server-path stored body carries exactly one replacement mark (U+FFFD).
 * =============================================================================================
 */

const NUL_BYTE = String.fromCharCode(0);
const LONE_HIGH_SURROGATE = '\uD800';
const REPLACEMENT_MARK = '�';
const CONNECTION_LOST_RE = /connection lost|odoo (client|server) error|internal server error/i;
const MODEL = 'crm.lead';

/** Count of replacement marks in a stored body - the sanitiser's visible footprint. */
function countReplacementMarks(text: string): number {
  return (text.match(new RegExp(REPLACEMENT_MARK, 'g')) || []).length;
}

test.describe('CRM-12540_1.8 - Chatter on a Lead is unchanged by the fix (screen and server paths)', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12540_1.8: Verify chatter posting on a Lead still works after the fix - a screen note with a lone surrogate and a server-path post with a NUL byte both save and are sanitised', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const leadPage = new LeadPage(page);

    const tcId = 'CRM-12540_1.8';
    const uiTag = `[${tcId} ui ${CommonUtils.generateUniqueId()}]`;
    const serverTag = `[${tcId} server ${CommonUtils.generateUniqueId()}]`;
    let leadId = 0;

    await test.step('Pre-condition I: Login as Thomas (Sales IC)', async () => {
      console.log(`\n=== PRE-CONDITION I: Login as ${users.sale_ic_thomas.displayName} ===`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.sale_ic_thomas.username, users.sale_ic_thomas.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log('  ✓ Logged in');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - logged in as Thomas').catch(() => {});
    });

    await test.step('Pre-condition II: Resolve a lead this actor can open', async () => {
      console.log('\n=== PRE-CONDITION II: A reachable lead ===');
      leadId = await leadPage.findFirstRecordId(MODEL, []);
      console.log(`  - ${MODEL} id : ${leadId}`);
      expect(leadId, `This actor must be able to reach at least one ${MODEL} record`).toBeGreaterThan(0);
    });

    let posted = false;
    let notification = '';
    let surrogateHeld = false;
    let uiStored = '';
    let serverMessageId = 0;
    let serverError = '';
    let serverStored = '';

    await test.step('Steps 1-2: Log note a body carrying a lone half-character (screen path)', async () => {
      console.log('\n=== STEPS 1-2: Lead chatter, screen path with a lone half-character ===');
      await leadPage.openRecordFormById(baseUrl, MODEL, leadId);
      const res = await leadPage.pasteAndPostLogNote(`${uiTag} lead chatter, lone-surrogate[${LONE_HIGH_SURROGATE}] end`);
      posted = res.posted;
      notification = res.notification;
      surrogateHeld = res.surrogateHeld;
      console.log(`  - Composer actually held the lone half-character : ${surrogateHeld}`);
      uiStored = await leadPage.getStoredChatterMessageText(MODEL, leadId);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${tcId} - after the screen-path note on the lead`).catch(() => {});
    });

    await test.step('Step 3: Post a second message on the same lead through the server path with a NUL byte', async () => {
      console.log('\n=== STEP 3: Lead chatter, server path with a raw NUL byte ===');
      try {
        serverMessageId = await leadPage.postChatterMessageViaServerPath(MODEL, leadId, `${serverTag} server NUL [${NUL_BYTE}] end`);
      } catch (e) {
        serverError = e instanceof Error ? e.message : String(e);
        console.log(`  - Server rejected the post: ${serverError}`);
      }
      if (!serverError) serverStored = await leadPage.getStoredChatterMessageText(MODEL, leadId);
    });

    await test.step('Verification: both paths posted on the lead and both bad characters were sanitised', async () => {
      const visible = await leadPage.isChatterMessageVisible(uiTag);
      const noError = !CONNECTION_LOST_RE.test(notification);
      const uiMarks = countReplacementMarks(uiStored);
      const serverMarks = countReplacementMarks(serverStored);
      const overall = surrogateHeld && posted && noError && visible && uiMarks === 1 && !serverError && serverMarks === 1;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #0 - the screen payload really carried the unstorable character:');
      console.log('     Expected : the composer holds a lone UTF-16 surrogate before sending');
      console.log(`     Actual   : ${surrogateHeld}`);
      console.log(`     Result   : ${surrogateHeld ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #1 - the screen note posted on the lead with no error:');
      console.log('     Expected : the chatter grows by one message, no "Connection lost" / server error');
      console.log(`     Actual   : posted=${posted} visible=${visible} notification="${notification}"`);
      console.log(`     Result   : ${posted && visible && noError ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - the screen note stored the bad character as the replacement mark:');
      console.log('     Expected : exactly 1 replacement mark (U+FFFD)');
      console.log(`     Actual   : ${uiMarks}`);
      console.log(`     Result   : ${uiMarks === 1 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - the server-path post was accepted on the lead:');
      console.log('     Expected : no ValueError "A string literal cannot contain NUL (0x00) characters"');
      console.log(`     Actual   : ${serverError ? `error="${serverError.slice(0, 200)}"` : `no error, mail.message #${serverMessageId}`}`);
      console.log(`     Result   : ${!serverError ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - the server-path post stored the NUL as the replacement mark:');
      console.log('     Expected : exactly 1 replacement mark (U+FFFD)');
      console.log(`     Actual   : ${serverMarks}`);
      console.log(`     Result   : ${serverMarks === 1 ? 'PASS' : 'FAIL'}`);
      console.log(`  Screen-path stored body : ${uiStored.slice(0, 200)}`);
      console.log(`  Server-path stored body : ${serverStored.slice(0, 200)}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - chatter on a Lead ${overall ? 'is unaffected by the fix and sanitises both character kinds' : 'did not behave as required'}`);

      expect(surrogateHeld, 'The composer must actually hold a lone UTF-16 surrogate, otherwise this case proves nothing').toBe(true);
      expect(posted, `The screen note must save on the lead. Notification was: "${notification}"`).toBe(true);
      expect(noError, `No "Connection lost" / server error must appear. Notification was: "${notification}"`).toBe(true);
      expect(visible, `The posted note must be visible in the lead's chatter (looked for "${uiTag}")`).toBe(true);
      expect(uiMarks, `The screen note's bad character must become exactly one replacement mark. Stored: "${uiStored}"`).toBe(1);
      expect(serverError, `The server-path post must be accepted on a lead. Error was: "${serverError}"`).toBe('');
      expect(serverMarks, `The server-path NUL must become exactly one replacement mark. Stored: "${serverStored}"`).toBe(1);
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) {
      console.log(`\n!! FAILURE REASON: ${testInfo.error.message ?? testInfo.error}`);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    // No teardown: this case creates no record, only two uniquely-tagged chatter messages on an
    // existing lead. Chatter is additive - there is nothing to put back.
  });
});
