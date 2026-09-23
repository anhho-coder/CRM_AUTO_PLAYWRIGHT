import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HelpdeskPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  CRM-12540 - Log note / send message fails when the body contains NUL or lone-surrogate chars
 * =============================================================================================
 *  Test Case ID    : CRM-12540_1.2
 *  Jira            : CRM-12540  (Post-EA Support Ticket - reported by Support L1 on ticket #426182)
 *  Automation-Type : new
 *  Automation-Date : 2026-09-01
 *  Actor           : Nam Pham (Support L2 Manager - After-Sales / Manager)
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    The NUL byte HALF of the report, exercised from the screen. A NUL byte is pasted into the Log
 *    note composer together with the product-log excerpt.
 *    The finding this case locks in: the composer really does hold the NUL, but the Odoo web client
 *    STRIPS it before the request is built, so a NUL can never reach the database from the chatter
 *    screen. The note therefore saves normally and the stored body carries no NUL at all.
 *    That is why the reported failure on #426182 was caused by the lone half-character, not the NUL -
 *    and why the NUL branch has to be exercised through the server path instead (see CRM-12540_1.3).
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12540_1.2:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source: CRM-12540 acceptance criteria + the QA verification matrix posted on the ticket
 *          (comment 689172). No Master-file row exists for this case.
 *
 *    Pre-condition(s):
 *      I.  Log in as a Support L2 Manager (Nam Pham).
 *      II. A fresh helpdesk ticket owned by this test (unique Subject).
 *    Steps to reproduce:
 *      1. Open the ticket created in pre-condition II.
 *      2. Click Log note.
 *      3. Paste a product-log excerpt whose body carries a NUL byte.
 *      4. Click Log.
 *    Verification / Expected Result:
 *      _ The composer holds the NUL byte before sending (otherwise the case proves nothing).
 *      _ The note saves - the chatter grows by one message.
 *      _ No "Connection lost" toast and no server-error dialog appears.
 *      _ The note is visible in the chatter.
 *      _ The stored body contains NO NUL byte - the web client dropped it before the request.
 * =============================================================================================
 */

const NUL_BYTE = String.fromCharCode(0);
const CONNECTION_LOST_RE = /connection lost|odoo (client|server) error|internal server error/i;

const LOG_EXCERPT =
  '2026-08-31 09:12:44.331 [ERROR] [transporter-3] com.nakivo.backup.TransporterService - ' +
  'Backup job "Weekly VM Backup" failed: java.io.IOException: Connection reset by peer / ' +
  'at com.nakivo.transport.Channel.read(Channel.java:214) / ' +
  '2026-08-31 09:12:44.902 [WARN ] [scheduler-1] Retry 1 of 3 scheduled in 30s';

const SKIP_CLEANUP_TICKETS = false; // Toggle to true to keep the created ticket for inspection

test.describe('CRM-12540_1.2 - A NUL byte pasted into the composer never reaches the database', () => {
  let ticketId: string | undefined;
  let ticketSubject: string | undefined;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12540_1.2: Verify a Log note pasted with a NUL byte saves normally and that the NUL is dropped by the web client before it reaches the database', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);

    const tcId = 'CRM-12540_1.2';
    const tag = `[${tcId} ${CommonUtils.generateUniqueId()}]`;
    ticketSubject = `ZZ ${tcId} unstorable-chars ${CommonUtils.generateUniqueId()}`;

    await test.step('Pre-condition I: Login as Nam Pham (Support L2 Manager)', async () => {
      console.log(`\n=== PRE-CONDITION I: Login as ${users.support_l2_manager_nam.displayName} ===`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.support_l2_manager_nam.username, users.support_l2_manager_nam.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log('  ✓ Logged in');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - logged in as Support L2 Manager').catch(() => {});
    });

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

    let posted = false;
    let notification = '';
    let nulHeld = false;

    await test.step('Steps 1-4: Log note a product-log excerpt carrying a NUL byte', async () => {
      console.log('\n=== STEPS 1-4: Log note with a NUL byte ===');
      await helpdeskPage.openTicketById(baseUrl, ticketId as string);
      const body = `${tag} ${LOG_EXCERPT} nul-byte[${NUL_BYTE}] end`;
      const res = await helpdeskPage.pasteAndPostLogNote(body);
      posted = res.posted;
      notification = res.notification;
      nulHeld = res.nulHeld;
      console.log(`  - Composer actually held the NUL byte : ${nulHeld}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${tcId} - after posting the log note`).catch(() => {});
    });

    await test.step('Verification: the note saved and no NUL reached the database', async () => {
      const visible = await helpdeskPage.isChatterMessageVisible(tag);
      const stored = await helpdeskPage.getStoredLastMessageText(ticketId as string);
      const nulInDatabase = stored.indexOf(NUL_BYTE) >= 0;
      const noError = !CONNECTION_LOST_RE.test(notification);
      const overall = nulHeld && posted && noError && visible && !nulInDatabase;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #0 - the payload really carried a NUL byte:');
      console.log('     Expected : the composer holds a NUL byte before sending');
      console.log(`     Actual   : ${nulHeld}`);
      console.log(`     Result   : ${nulHeld ? 'PASS' : 'FAIL'}`);
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
      console.log('  Verify #4 - no NUL byte reached the database:');
      console.log('     Expected : the stored body contains no NUL byte (the web client drops it)');
      console.log(`     Actual   : nul_in_database=${nulInDatabase}`);
      console.log(`     Result   : ${!nulInDatabase ? 'PASS' : 'FAIL'}`);
      console.log(`  Stored body : ${stored.slice(0, 300)}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - a NUL byte pasted into the chatter ${overall ? 'is dropped client-side and the note saves' : 'did not behave as required'}`);

      expect(nulHeld, 'The composer must actually hold a NUL byte, otherwise this case proves nothing').toBe(true);
      expect(posted, `The log note must save. Notification was: "${notification}"`).toBe(true);
      expect(noError, `No "Connection lost" / server error must appear. Notification was: "${notification}"`).toBe(true);
      expect(visible, `The posted note must be visible in the chatter (looked for "${tag}")`).toBe(true);
      expect(nulInDatabase, `No NUL byte may reach the database from the chatter screen. Stored: "${stored}"`).toBe(false);
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) {
      console.log(`\n!! FAILURE REASON: ${testInfo.error.message ?? testInfo.error}`);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});

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
