import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HelpdeskPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  CRM-12540 - Log note / send message fails when the body contains NUL or lone-surrogate chars
 * =============================================================================================
 *  Test Case ID    : CRM-12540_1.5
 *  Jira            : CRM-12540  (Post-EA Support Ticket - reported by Support L1 on ticket #426182)
 *  Automation-Type : new
 *  Automation-Date : 2026-09-01
 *  Actor           : Nam Pham (Support L2 Manager - After-Sales / Manager)
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    The PRECISION case, and the one that would catch an over-eager fix. One message carries all
 *    three unstorable characters (a NUL byte, a lone HIGH surrogate, a lone LOW surrogate) next to
 *    content that must not be touched: a VALID emoji - which is itself a legitimate surrogate PAIR -
 *    plus Vietnamese, Cyrillic and Chinese text.
 *
 *    A sanitiser that simply strips anything in the surrogate range would also destroy the emoji and
 *    pass a laxer test. This case asserts the exact count: three replacement marks, no more, and
 *    every valid character still present.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12540_1.5:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source: CRM-12540 acceptance criteria ("Normal notes/emails (emoji, non-Latin text) are stored
 *          byte-identical") + the QA verification matrix posted on the ticket (comment 689172).
 *          No Master-file row exists for this case.
 *
 *    Pre-condition(s):
 *      I.  Log in as a Support L2 Manager (Nam Pham).
 *      II. A fresh helpdesk ticket owned by this test (unique Subject).
 *    Steps to reproduce:
 *      1. Open the ticket created in pre-condition II.
 *      2. Post one chatter message through the server path whose body carries a NUL byte, a lone high
 *         surrogate, a lone low surrogate, a valid emoji, Vietnamese, Cyrillic and Chinese text.
 *    Verification / Expected Result:
 *      _ The post is accepted - no server error.
 *      _ The stored body carries EXACTLY three replacement marks (U+FFFD) - one per unstorable char.
 *      _ The valid emoji (a legitimate surrogate pair) is still present.
 *      _ The Vietnamese text is still present.
 *      _ The Cyrillic text is still present.
 *      _ The Chinese text is still present.
 * =============================================================================================
 */

const NUL_BYTE = String.fromCharCode(0);
const LONE_HIGH_SURROGATE = '\uD800';
const LONE_LOW_SURROGATE = '\uDC00';
const VALID_EMOJI = '\u{1F389}'; // party popper - a legitimate surrogate PAIR, must survive
const VIETNAMESE_TEXT = 'Xin chào';
const CYRILLIC_TEXT = 'Привет';
const CHINESE_TEXT = '备份';
const REPLACEMENT_MARK = '�';
const EXPECTED_MARKS = 3;
const SKIP_CLEANUP_TICKETS = false; // Toggle to true to keep the created ticket for inspection

/** Count of replacement marks in a stored body - the sanitiser's visible footprint. */
function countReplacementMarks(text: string): number {
  return (text.match(new RegExp(REPLACEMENT_MARK, 'g')) || []).length;
}

test.describe('CRM-12540_1.5 - Only the unstorable characters are replaced; valid emoji and non-Latin text survive', () => {
  let ticketId: string | undefined;
  let ticketSubject: string | undefined;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12540_1.5: Verify a message carrying all three unstorable characters plus a valid emoji and non-Latin text stores exactly three replacement marks and leaves every valid character untouched', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);

    const tcId = 'CRM-12540_1.5';
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
      expect(ticketId, 'The ticket must have a record ID').toMatch(/^\d+$/);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - ticket created').catch(() => {});
    });

    let messageId = 0;
    let serverError = '';

    await test.step('Steps 1-2: Post one message mixing the unstorable characters with valid content', async () => {
      console.log('\n=== STEPS 1-2: Server-path message_post with mixed content ===');
      await helpdeskPage.openTicketById(baseUrl, ticketId as string);
      const body =
        `${tag} nul[${NUL_BYTE}] high[${LONE_HIGH_SURROGATE}] low[${LONE_LOW_SURROGATE}] ` +
        `emoji[${VALID_EMOJI}] vi[${VIETNAMESE_TEXT}] ru[${CYRILLIC_TEXT}] cn[${CHINESE_TEXT}]`;
      try {
        messageId = await helpdeskPage.postMessageViaServerPath(ticketId as string, body);
      } catch (e) {
        serverError = e instanceof Error ? e.message : String(e);
        console.log(`  - Server rejected the post: ${serverError}`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${tcId} - after the server-path post`).catch(() => {});
    });

    await test.step('Verification: exactly three replacement marks and every valid character untouched', async () => {
      const stored = serverError ? '' : await helpdeskPage.getStoredLastMessageText(ticketId as string);
      const marks = countReplacementMarks(stored);
      const emojiKept = stored.includes(VALID_EMOJI);
      const viKept = stored.includes(VIETNAMESE_TEXT);
      const ruKept = stored.includes(CYRILLIC_TEXT);
      const cnKept = stored.includes(CHINESE_TEXT);
      const accepted = !serverError;
      const overall = accepted && messageId > 0 && marks === EXPECTED_MARKS && emojiKept && viKept && ruKept && cnKept;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - the post was accepted:');
      console.log('     Expected : no server error');
      console.log(`     Actual   : ${serverError ? `error="${serverError.slice(0, 220)}"` : `no error, mail.message #${messageId}`}`);
      console.log(`     Result   : ${accepted ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - exactly one replacement mark per unstorable character:');
      console.log(`     Expected : ${EXPECTED_MARKS} replacement marks (U+FFFD) - NUL, lone high, lone low`);
      console.log(`     Actual   : ${marks}`);
      console.log(`     Result   : ${marks === EXPECTED_MARKS ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - the valid emoji (a legitimate surrogate PAIR) survived:');
      console.log(`     Expected : the stored body still contains "${VALID_EMOJI}"`);
      console.log(`     Actual   : ${emojiKept}`);
      console.log(`     Result   : ${emojiKept ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - the Vietnamese text survived:');
      console.log(`     Expected : the stored body still contains "${VIETNAMESE_TEXT}"`);
      console.log(`     Actual   : ${viKept}`);
      console.log(`     Result   : ${viKept ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #5 - the Cyrillic text survived:');
      console.log(`     Expected : the stored body still contains "${CYRILLIC_TEXT}"`);
      console.log(`     Actual   : ${ruKept}`);
      console.log(`     Result   : ${ruKept ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #6 - the Chinese text survived:');
      console.log(`     Expected : the stored body still contains "${CHINESE_TEXT}"`);
      console.log(`     Actual   : ${cnKept}`);
      console.log(`     Result   : ${cnKept ? 'PASS' : 'FAIL'}`);
      console.log(`  Stored body : ${stored.slice(0, 300)}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - the sanitiser ${overall ? 'touches only the unstorable characters' : 'did not behave as required'}`);

      expect(accepted, `The server must accept the post. Error was: "${serverError}"`).toBe(true);
      expect(messageId, 'A mail.message id must come back from message_post').toBeGreaterThan(0);
      expect(marks, `Exactly ${EXPECTED_MARKS} replacement marks are expected. Stored: "${stored}"`).toBe(EXPECTED_MARKS);
      expect(emojiKept, `The valid emoji must survive the sanitiser. Stored: "${stored}"`).toBe(true);
      expect(viKept, `The Vietnamese text must survive the sanitiser. Stored: "${stored}"`).toBe(true);
      expect(ruKept, `The Cyrillic text must survive the sanitiser. Stored: "${stored}"`).toBe(true);
      expect(cnKept, `The Chinese text must survive the sanitiser. Stored: "${stored}"`).toBe(true);
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
