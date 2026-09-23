import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HelpdeskPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  CRM-12540 - Log note / send message fails when the body contains NUL or lone-surrogate chars
 * =============================================================================================
 *  Test Case ID    : CRM-12540_1.1
 *  Jira            : CRM-12540  (Post-EA Support Ticket - reported by Support L1 on ticket #426182)
 *  Automation-Type : new
 *  Automation-Date : 2026-09-01
 *  Actor           : Nam Pham (Support L2 Manager - After-Sales / Manager)
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    THE REPORTED FAILURE. Support pasted a raw product-log excerpt into a Log note; the body
 *    carried a lone UTF-16 surrogate (a broken half-character, the usual artifact of copying out of
 *    a log viewer whose file is not valid UTF-8), the write died before saving and the UI showed
 *    repeated "Connection lost" toasts.
 *    This case posts exactly that shape of content and asserts the note now SAVES, is visible in the
 *    chatter, raises no "Connection lost" / server error, and that the unstorable character was
 *    stored as the replacement mark U+FFFD while the rest of the log excerpt survived intact.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12540_1.1:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source: CRM-12540 acceptance criteria + the QA verification matrix posted on the ticket
 *          (comment 689172). There is no Master-file row for this case - it is derived from the
 *          ticket's own acceptance criteria, which is stated here rather than implied.
 *
 *    Pre-condition(s):
 *      I.  Log in as a Support L2 Manager (Nam Pham).
 *      II. A fresh helpdesk ticket owned by this test (unique Subject), so the case never depends on
 *          or disturbs a real customer ticket.
 *    Steps to reproduce:
 *      1. Open the ticket created in pre-condition II.
 *      2. Click Log note.
 *      3. Paste a product-log excerpt whose body carries a lone UTF-16 surrogate.
 *      4. Click Log.
 *    Verification / Expected Result:
 *      _ The note saves - the chatter grows by one message.
 *      _ No "Connection lost" toast and no server-error dialog appears.
 *      _ The note is visible in the chatter.
 *      _ The stored body carries exactly one replacement mark (U+FFFD) in place of the bad character.
 *      _ The log excerpt's own text is still present in the stored body.
 * =============================================================================================
 */

// Characters PostgreSQL cannot store. Written as escapes so the file stays reviewable; they are real
// characters at runtime, and HelpdeskPage delivers them as code points (fill() would drop them).
const LONE_HIGH_SURROGATE = '\uD800';
const REPLACEMENT_MARK = '�';

// The shape of content Support pasted: a raw NAKIVO product-log excerpt.
const LOG_EXCERPT =
  '2026-08-31 09:12:44.331 [ERROR] [transporter-3] com.nakivo.backup.TransporterService - ' +
  'Backup job "Weekly VM Backup" failed: java.io.IOException: Connection reset by peer / ' +
  'at com.nakivo.transport.Channel.read(Channel.java:214) / ' +
  '2026-08-31 09:12:44.902 [WARN ] [scheduler-1] Retry 1 of 3 scheduled in 30s';

const CONNECTION_LOST_RE = /connection lost|odoo (client|server) error|internal server error/i;
const SKIP_CLEANUP_TICKETS = false; // Toggle to true to keep the created ticket for inspection

/** Count of replacement marks in a stored body - the sanitiser's visible footprint. */
function countReplacementMarks(text: string): number {
  return (text.match(new RegExp(REPLACEMENT_MARK, 'g')) || []).length;
}

test.describe('CRM-12540_1.1 - Log note carrying a lone half-character saves instead of failing', () => {
  let ticketId: string | undefined;
  let ticketSubject: string | undefined;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12540_1.1: Verify a Log note whose body carries a lone UTF-16 surrogate saves with no "Connection lost" and stores the bad character as the replacement mark', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);

    const tcId = 'CRM-12540_1.1';
    const tag = `[${tcId} ${CommonUtils.generateUniqueId()}]`;
    ticketSubject = `ZZ ${tcId} unstorable-chars ${CommonUtils.generateUniqueId()}`;

    // ----------------------------------------------------------------------------------------
    // Pre-condition I: Login as the Support L2 Manager
    // ----------------------------------------------------------------------------------------
    await test.step('Pre-condition I: Login as Nam Pham (Support L2 Manager)', async () => {
      console.log(`\n=== PRE-CONDITION I: Login as ${users.support_l2_manager_nam.displayName} ===`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.support_l2_manager_nam.username, users.support_l2_manager_nam.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log('  ✓ Logged in');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - logged in as Support L2 Manager').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Pre-condition II: This case's own helpdesk ticket
    // ----------------------------------------------------------------------------------------
    await test.step('Pre-condition II: Create a fresh helpdesk ticket owned by this test', async () => {
      console.log('\n=== PRE-CONDITION II: Fresh helpdesk ticket ===');
      console.log(`  - Subject : ${ticketSubject}`);
      ticketId = await helpdeskPage.createTicket(baseUrl, ticketSubject as string);
      let __verifyPassed = false;
      try {
        expect(ticketId, 'The ticket must have a record ID').toMatch(/^\d+$/);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Pre-condition II - ticket created', passed: __verifyPassed }).catch(() => {});
      }
    });

    // ----------------------------------------------------------------------------------------
    // Steps to reproduce
    // ----------------------------------------------------------------------------------------
    let posted = false;
    let notification = '';
    let surrogateHeld = false;

    await test.step('Steps 1-4: Log note a product-log excerpt carrying a lone half-character', async () => {
      console.log('\n=== STEPS 1-4: Log note with a lone half-character ===');
      await helpdeskPage.openTicketById(baseUrl, ticketId as string);
      const body = `${tag} ${LOG_EXCERPT} lone-surrogate[${LONE_HIGH_SURROGATE}] end`;
      const res = await helpdeskPage.pasteAndPostLogNote(body);
      posted = res.posted;
      notification = res.notification;
      surrogateHeld = res.surrogateHeld;
      console.log(`  - Composer actually held the lone half-character : ${surrogateHeld}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${tcId} - after posting the log note`).catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Verification
    // ----------------------------------------------------------------------------------------
    await test.step('Verification: the note saved, no error surfaced, and the bad character was sanitised', async () => {
      const visible = await helpdeskPage.isChatterMessageVisible(tag);
      const stored = await helpdeskPage.getStoredLastMessageText(ticketId as string);
      const marks = countReplacementMarks(stored);
      const noError = !CONNECTION_LOST_RE.test(notification);
      const excerptKept = stored.includes('com.nakivo.backup.TransporterService');
      const overall = surrogateHeld && posted && noError && visible && marks === 1 && excerptKept;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #0 - the payload really carried the unstorable character:');
      console.log('     Expected : the composer holds a lone UTF-16 surrogate before sending');
      console.log(`     Actual   : ${surrogateHeld}`);
      console.log(`     Result   : ${surrogateHeld ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #1 - the note saved:');
      console.log('     Expected : the chatter grows by one message');
      console.log(`     Actual   : posted=${posted}`);
      console.log(`     Result   : ${posted ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - no "Connection lost" / server error:');
      console.log('     Expected : no notification matching /connection lost|odoo client|server error/i');
      console.log(`     Actual   : ${notification ? `notification="${notification.slice(0, 180)}"` : 'no notification'}`);
      console.log(`     Result   : ${noError ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - the note is visible in the chatter:');
      console.log(`     Expected : a chatter message containing "${tag}"`);
      console.log(`     Actual   : ${visible}`);
      console.log(`     Result   : ${visible ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - the bad character was stored as the replacement mark:');
      console.log('     Expected : exactly 1 replacement mark (U+FFFD) in the stored body');
      console.log(`     Actual   : ${marks}`);
      console.log(`     Result   : ${marks === 1 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #5 - the log excerpt itself survived:');
      console.log('     Expected : the stored body still contains "com.nakivo.backup.TransporterService"');
      console.log(`     Actual   : ${excerptKept}`);
      console.log(`     Result   : ${excerptKept ? 'PASS' : 'FAIL'}`);
      console.log(`  Stored body : ${stored.slice(0, 300)}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - a log note carrying a lone half-character ${overall ? 'saves and is sanitised' : 'did not behave as required'}`);

      expect(surrogateHeld, 'The composer must actually hold a lone UTF-16 surrogate, otherwise this case proves nothing').toBe(true);
      expect(posted, `The log note must save. Notification was: "${notification}"`).toBe(true);
      expect(noError, `No "Connection lost" / server error must appear. Notification was: "${notification}"`).toBe(true);
      expect(visible, `The posted note must be visible in the chatter (looked for "${tag}")`).toBe(true);
      expect(marks, `The lone half-character must be stored as exactly one replacement mark. Stored: "${stored}"`).toBe(1);
      expect(excerptKept, `The log excerpt must survive the sanitiser. Stored: "${stored}"`).toBe(true);
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    // Surface the real reason a failing run failed - the assertion message, not just a red tick.
    if (testInfo.error) {
      console.log(`\n!! FAILURE REASON: ${testInfo.error.message ?? testInfo.error}`);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});

    // Helpdesk tickets cannot be deleted (no unlink right for the After-Sales groups) - archive.
    // Guard on ticketId, not ticketSubject: the subject is assigned before the ticket exists, so a
    // failure BEFORE creation (a rejected login, for one) must not spend the rest of the test budget
    // hunting a ticket that was never created.
    if (!SKIP_CLEANUP_TICKETS && ticketId && ticketSubject) {
      try {
        const helpdeskPage = new HelpdeskPage(page);
        await helpdeskPage.openAllTicketsListDirect(baseUrl);
        await helpdeskPage.searchTicket(ticketSubject);
        const archived = await helpdeskPage.archiveTicketFromListBySubject(ticketSubject);
        console.log(archived ? `  ✓ Archived ticket ${ticketId}` : `  ⚠ Ticket ${ticketId} was not archived`);
      } catch (e) {
        console.log(`  ⚠ Cleanup skipped/failed for ticket ${ticketId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    ticketId = undefined;
    ticketSubject = undefined;
  });
});
