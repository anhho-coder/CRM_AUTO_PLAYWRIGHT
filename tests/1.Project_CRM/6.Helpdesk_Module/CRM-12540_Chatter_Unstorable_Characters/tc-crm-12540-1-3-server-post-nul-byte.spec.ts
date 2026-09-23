import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HelpdeskPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  CRM-12540 - Log note / send message fails when the body contains NUL or lone-surrogate chars
 * =============================================================================================
 *  Test Case ID    : CRM-12540_1.3
 *  Jira            : CRM-12540  (Post-EA Support Ticket - reported by Support L1 on ticket #426182)
 *  Automation-Type : new
 *  Automation-Date : 2026-09-01
 *  Actor           : Nam Pham (Support L2 Manager - After-Sales / Manager)
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    The NUL byte reaching the message through the SERVER, which is the crash named in the report:
 *    ValueError "A string literal cannot contain NUL (0x00) characters".
 *
 *    Why this case does not use the screen: CRM-12540_1.2 proves the Odoo web client strips a NUL
 *    before the request is built, so the chatter screen physically cannot deliver one. A NUL only
 *    ever arrives through a non-browser path - the mail gateway, the API, an import - and that is the
 *    path the fix guards. Posting through message_post as the logged-in Support L2 Manager is
 *    therefore the scenario under test, not a shortcut around the UI.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12540_1.3:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source: CRM-12540 acceptance criteria + the QA verification matrix posted on the ticket
 *          (comment 689172). No Master-file row exists for this case.
 *
 *    Pre-condition(s):
 *      I.  Log in as a Support L2 Manager (Nam Pham).
 *      II. A fresh helpdesk ticket owned by this test (unique Subject).
 *    Steps to reproduce:
 *      1. Open the ticket created in pre-condition II.
 *      2. Post a chatter message on it through the server path, with a raw NUL byte in the body.
 *    Verification / Expected Result:
 *      _ The post is accepted - no ValueError "A string literal cannot contain NUL (0x00) characters".
 *      _ A message record is created (a message id comes back).
 *      _ The stored body carries exactly one replacement mark (U+FFFD) in place of the NUL.
 *      _ The stored body contains no NUL byte.
 *      _ The surrounding text of the body is unchanged.
 * =============================================================================================
 */

const NUL_BYTE = String.fromCharCode(0);
const REPLACEMENT_MARK = '�';
const SKIP_CLEANUP_TICKETS = false; // Toggle to true to keep the created ticket for inspection

/** Count of replacement marks in a stored body - the sanitiser's visible footprint. */
function countReplacementMarks(text: string): number {
  return (text.match(new RegExp(REPLACEMENT_MARK, 'g')) || []).length;
}

test.describe('CRM-12540_1.3 - A NUL byte reaching the message through the server is sanitised, not fatal', () => {
  let ticketId: string | undefined;
  let ticketSubject: string | undefined;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12540_1.3: Verify a chatter message posted through the server with a raw NUL byte is created without the "cannot contain NUL" error and stores the NUL as the replacement mark', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);

    const tcId = 'CRM-12540_1.3';
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

    let messageId = 0;
    let serverError = '';

    await test.step('Steps 1-2: Post a chatter message through the server path with a raw NUL byte', async () => {
      console.log('\n=== STEPS 1-2: Server-path message_post with a raw NUL byte ===');
      await helpdeskPage.openTicketById(baseUrl, ticketId as string);
      const body = `${tag} raw NUL here [${NUL_BYTE}] end`;
      try {
        messageId = await helpdeskPage.postMessageViaServerPath(ticketId as string, body);
      } catch (e) {
        serverError = e instanceof Error ? e.message : String(e);
        console.log(`  - Server rejected the post: ${serverError}`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${tcId} - after the server-path post`).catch(() => {});
    });

    await test.step('Verification: the post was accepted and the NUL was stored as the replacement mark', async () => {
      const stored = serverError ? '' : await helpdeskPage.getStoredLastMessageText(ticketId as string);
      const marks = countReplacementMarks(stored);
      const nulInDatabase = stored.indexOf(NUL_BYTE) >= 0;
      const textKept = stored.includes('raw NUL here');
      const accepted = !serverError;
      const created = messageId > 0;
      const overall = accepted && created && marks === 1 && !nulInDatabase && textKept;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - the post was accepted:');
      console.log('     Expected : no ValueError "A string literal cannot contain NUL (0x00) characters"');
      console.log(`     Actual   : ${serverError ? `error="${serverError.slice(0, 220)}"` : 'no error'}`);
      console.log(`     Result   : ${accepted ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - a message record was created:');
      console.log('     Expected : a mail.message id comes back');
      console.log(`     Actual   : ${created ? `mail.message #${messageId}` : 'no id'}`);
      console.log(`     Result   : ${created ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - the NUL was stored as the replacement mark:');
      console.log('     Expected : exactly 1 replacement mark (U+FFFD) in the stored body');
      console.log(`     Actual   : ${marks}`);
      console.log(`     Result   : ${marks === 1 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - no NUL byte survived into the database:');
      console.log('     Expected : the stored body contains no NUL byte');
      console.log(`     Actual   : nul_in_database=${nulInDatabase}`);
      console.log(`     Result   : ${!nulInDatabase ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #5 - the surrounding text is unchanged:');
      console.log('     Expected : the stored body still contains "raw NUL here"');
      console.log(`     Actual   : ${textKept}`);
      console.log(`     Result   : ${textKept ? 'PASS' : 'FAIL'}`);
      console.log(`  Stored body : ${stored.slice(0, 300)}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - a NUL byte reaching the message through the server ${overall ? 'is sanitised instead of killing the write' : 'did not behave as required'}`);

      expect(accepted, `The server must accept the post. Error was: "${serverError}"`).toBe(true);
      expect(created, 'A mail.message id must come back from message_post').toBe(true);
      expect(marks, `The NUL must be stored as exactly one replacement mark. Stored: "${stored}"`).toBe(1);
      expect(nulInDatabase, `No NUL byte may survive into the database. Stored: "${stored}"`).toBe(false);
      expect(textKept, `The surrounding text must be unchanged. Stored: "${stored}"`).toBe(true);
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
