import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HelpdeskPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  CRM-12540 - Log note / send message fails when the body contains NUL or lone-surrogate chars
 * =============================================================================================
 *  Test Case ID    : CRM-12540_1.6
 *  Jira            : CRM-12540  (Post-EA Support Ticket - reported by Support L1 on ticket #426182)
 *  Automation-Type : new
 *  Automation-Date : 2026-09-01
 *  Actor           : Nam Pham (Support L2 Manager - After-Sales / Manager)
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    The CUSTOMER-VISIBLE path. The report named both "log note" and "send message", and they are
 *    different code paths: Send message posts a comment on the Discussions subtype and notifies the
 *    followers, Log note is internal. CRM-12540_1.1 proves the internal one; this proves the one the
 *    customer would have seen.
 *
 *    Pre-production sends no mail at all (every outgoing server is off), so nothing leaves the box.
 *    The page object also unchecks every auto-added suggested recipient before sending - with the
 *    customer-email recipient left checked, Send is a silent no-op.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12540_1.6:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source: CRM-12540 acceptance criteria + the QA verification matrix posted on the ticket
 *          (comment 689172). No Master-file row exists for this case.
 *
 *  DATA NOTE - why this case does NOT create its own ticket (unlike CRM-12540_1.1 to _1.5):
 *    Measured on pre-production 2026-09-01: on a ticket with NO Customer and no follower, Send message
 *    is a client-side no-op - the composer stays open and the browser fires NO message_post request at
 *    all (0 requests captured), because there is nobody to send to. Verified side by side: the same
 *    click on a ticket that HAS a Customer fires exactly 1 message_post and posts.
 *    That is product behaviour, not the fix, but it means a self-created blank ticket cannot exercise
 *    this path. So the case posts a UNIQUELY TAGGED message on an existing ticket that HAS a Customer -
 *    which is also the real reported scenario, #426182 being a customer's ticket - and asserts only on
 *    that tag, so repeat and parallel runs cannot collide. Nothing is deleted afterwards: a chatter
 *    message is additive.
 *
 *    Pre-condition(s):
 *      I.  Log in as a Support L2 Manager (Nam Pham).
 *      II. A helpdesk ticket that HAS a Customer and that this actor can open (Odoo's own record rules
 *          decide which, so the ticket is guaranteed reachable).
 *    Steps to reproduce:
 *      1. Open that ticket.
 *      2. Click Send message.
 *      3. Paste a body carrying a lone UTF-16 surrogate.
 *      4. Send.
 *    Verification / Expected Result:
 *      _ The composer holds the lone surrogate before sending (otherwise the case proves nothing).
 *      _ The message posts - the chatter grows by one message.
 *      _ No "Connection lost" toast and no server-error dialog appears.
 *      _ The message is visible in the chatter.
 *      _ The stored body carries exactly one replacement mark (U+FFFD).
 * =============================================================================================
 */

const LONE_HIGH_SURROGATE = '\uD800';
const REPLACEMENT_MARK = '�';
const CONNECTION_LOST_RE = /connection lost|odoo (client|server) error|internal server error/i;
const MODEL = 'helpdesk.ticket';
// Send message needs a recipient, so the ticket must carry a Customer - see the DATA NOTE above.
const TICKET_WITH_CUSTOMER = [['partner_id', '!=', false]];

/** Count of replacement marks in a stored body - the sanitiser's visible footprint. */
function countReplacementMarks(text: string): number {
  return (text.match(new RegExp(REPLACEMENT_MARK, 'g')) || []).length;
}

test.describe('CRM-12540_1.6 - Send message carrying a lone half-character posts instead of failing', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12540_1.6: Verify a customer-visible Send message whose body carries a lone UTF-16 surrogate posts with no "Connection lost" and stores the bad character as the replacement mark', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);

    const tcId = 'CRM-12540_1.6';
    const tag = `[${tcId} ${CommonUtils.generateUniqueId()}]`;
    let ticketId = 0;

    await test.step('Pre-condition I: Login as Nam Pham (Support L2 Manager)', async () => {
      console.log(`\n=== PRE-CONDITION I: Login as ${users.support_l2_manager_nam.displayName} ===`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.support_l2_manager_nam.username, users.support_l2_manager_nam.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log('  ✓ Logged in');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - logged in as Support L2 Manager').catch(() => {});
    });

    await test.step('Pre-condition II: Resolve a ticket that HAS a Customer', async () => {
      console.log('\n=== PRE-CONDITION II: A reachable ticket WITH a Customer ===');
      ticketId = await helpdeskPage.findFirstRecordId(MODEL, TICKET_WITH_CUSTOMER);
      console.log(`  - ${MODEL} id : ${ticketId} (partner_id set)`);
      expect(ticketId, 'This actor must be able to reach at least one ticket that has a Customer').toBeGreaterThan(0);
    });

    let posted = false;
    let notification = '';
    let surrogateHeld = false;

    await test.step('Steps 1-4: Send message a body carrying a lone half-character', async () => {
      console.log('\n=== STEPS 1-4: Send message with a lone half-character ===');
      await helpdeskPage.openTicketById(baseUrl, ticketId);
      const body = `${tag} customer-visible message, lone-surrogate[${LONE_HIGH_SURROGATE}] end`;
      const res = await helpdeskPage.pasteAndSendMessage(body);
      posted = res.posted;
      notification = res.notification;
      surrogateHeld = res.surrogateHeld;
      console.log(`  - Composer actually held the lone half-character : ${surrogateHeld}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${tcId} - after sending the message`).catch(() => {});
    });

    await test.step('Verification: the message posted, no error surfaced, and the bad character was sanitised', async () => {
      const visible = await helpdeskPage.isChatterMessageVisible(tag);
      const stored = await helpdeskPage.getStoredLastMessageText(ticketId);
      const marks = countReplacementMarks(stored);
      const noError = !CONNECTION_LOST_RE.test(notification);
      const overall = surrogateHeld && posted && noError && visible && marks === 1;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #0 - the payload really carried the unstorable character:');
      console.log('     Expected : the composer holds a lone UTF-16 surrogate before sending');
      console.log(`     Actual   : ${surrogateHeld}`);
      console.log(`     Result   : ${surrogateHeld ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #1 - the message posted:');
      console.log('     Expected : the chatter grows by one message');
      console.log(`     Actual   : posted=${posted}`);
      console.log(`     Result   : ${posted ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - no "Connection lost" / server error:');
      console.log('     Expected : no notification matching /connection lost|odoo client|server error/i');
      console.log(`     Actual   : ${notification ? `notification="${notification.slice(0, 180)}"` : 'no notification'}`);
      console.log(`     Result   : ${noError ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - the message is visible in the chatter:');
      console.log(`     Expected : a chatter message containing "${tag}"`);
      console.log(`     Actual   : ${visible}`);
      console.log(`     Result   : ${visible ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - the bad character was stored as the replacement mark:');
      console.log('     Expected : exactly 1 replacement mark (U+FFFD) in the stored body');
      console.log(`     Actual   : ${marks}`);
      console.log(`     Result   : ${marks === 1 ? 'PASS' : 'FAIL'}`);
      console.log(`  Stored body : ${stored.slice(0, 300)}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - a customer-visible message carrying a lone half-character ${overall ? 'posts and is sanitised' : 'did not behave as required'}`);

      expect(surrogateHeld, 'The composer must actually hold a lone UTF-16 surrogate, otherwise this case proves nothing').toBe(true);
      expect(posted, `The message must post. Notification was: "${notification}"`).toBe(true);
      expect(noError, `No "Connection lost" / server error must appear. Notification was: "${notification}"`).toBe(true);
      expect(visible, `The posted message must be visible in the chatter (looked for "${tag}")`).toBe(true);
      expect(marks, `The lone half-character must be stored as exactly one replacement mark. Stored: "${stored}"`).toBe(1);
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) {
      console.log(`\n!! FAILURE REASON: ${testInfo.error.message ?? testInfo.error}`);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    // No teardown: this case creates no record, only one uniquely-tagged chatter message on an
    // existing ticket. Chatter is additive - there is nothing to put back.
  });
});
