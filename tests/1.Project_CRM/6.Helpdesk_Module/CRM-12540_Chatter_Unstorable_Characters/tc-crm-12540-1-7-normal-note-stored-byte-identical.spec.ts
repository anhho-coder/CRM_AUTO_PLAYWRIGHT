import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HelpdeskPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  CRM-12540 - Log note / send message fails when the body contains NUL or lone-surrogate chars
 * =============================================================================================
 *  Test Case ID    : CRM-12540_1.7
 *  Jira            : CRM-12540  (Post-EA Support Ticket - reported by Support L1 on ticket #426182)
 *  Automation-Type : new
 *  Automation-Date : 2026-09-01
 *  Actor           : Nam Pham (Support L2 Manager - After-Sales / Manager)
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    THE REGRESSION GUARD, and the reason this suite is worth keeping. The fix rewrites every string
 *    on the way into a chatter message, which is exactly the kind of change that quietly damages
 *    ordinary content - a stripped accent, a mangled emoji, an escaped quote.
 *    This case posts a note with NO unstorable character in it and asserts the stored body comes back
 *    BYTE-IDENTICAL to what was typed: plain text, two emoji, Vietnamese diacritics, Cyrillic,
 *    Chinese, and the HTML-special characters & " '.
 *
 *    Note on scope: the assertion compares the stored body after tag-stripping and entity-decoding,
 *    because Odoo legitimately wraps a note in <p> and escapes & " ' on the way in. What must not
 *    change is the TEXT - and no replacement mark may appear anywhere.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12540_1.7:" --project=chromium
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
 *      2. Log note a body of ordinary content only - plain text, emoji, Vietnamese, Cyrillic,
 *         Chinese and the characters & " '.
 *    Verification / Expected Result:
 *      _ The note saves and is visible in the chatter.
 *      _ NO replacement mark (U+FFFD) appears anywhere in the stored body.
 *      _ The stored text is identical to what was typed.
 *      _ Each individual alphabet is still present (emoji, Vietnamese, Cyrillic, Chinese).
 * =============================================================================================
 */

const VALID_EMOJI_1 = '\u{1F389}'; // party popper - a legitimate surrogate PAIR
const VALID_EMOJI_2 = '\u{1F680}'; // rocket - a second legitimate surrogate PAIR
const VIETNAMESE_TEXT = 'Xin chào anh';
const CYRILLIC_TEXT = 'Привет';
const CHINESE_TEXT = '备份';
const HTML_SPECIALS = '&"\'';
const REPLACEMENT_MARK = '�';
const SKIP_CLEANUP_TICKETS = false; // Toggle to true to keep the created ticket for inspection

/** Count of replacement marks in a stored body - the sanitiser's visible footprint. */
function countReplacementMarks(text: string): number {
  return (text.match(new RegExp(REPLACEMENT_MARK, 'g')) || []).length;
}

/** Whitespace-normalised compare - Odoo's <p> wrapper turns a newline into markup, not into text. */
function sameText(a: string, b: string): boolean {
  return a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();
}

test.describe('CRM-12540_1.7 - A normal note is stored byte-identical; the sanitiser leaves it alone', () => {
  let ticketId: string | undefined;
  let ticketSubject: string | undefined;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12540_1.7: Verify a note of ordinary content - emoji, Vietnamese, Cyrillic, Chinese and HTML-special characters - is stored byte-identical with no replacement mark introduced', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);

    const tcId = 'CRM-12540_1.7';
    const tag = `[${tcId} ${CommonUtils.generateUniqueId()}]`;
    ticketSubject = `ZZ ${tcId} unstorable-chars ${CommonUtils.generateUniqueId()}`;
    const cleanBody =
      `${tag} plain text, emoji ${VALID_EMOJI_1}${VALID_EMOJI_2}, Vietnamese: ${VIETNAMESE_TEXT}, ` +
      `Cyrillic: ${CYRILLIC_TEXT}, Chinese: ${CHINESE_TEXT}, symbols: ${HTML_SPECIALS}`;

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

    await test.step('Steps 1-2: Log note a body of ordinary content only', async () => {
      console.log('\n=== STEPS 1-2: Log note with ordinary content only ===');
      console.log(`  - Body : ${cleanBody}`);
      await helpdeskPage.openTicketById(baseUrl, ticketId as string);
      const res = await helpdeskPage.pasteAndPostLogNote(cleanBody);
      posted = res.posted;
      notification = res.notification;
      let __verifyPassed = false;
      try {
        expect(res.nulHeld, 'This case must carry NO NUL byte - it is the clean-content regression').toBe(false);
        expect(res.surrogateHeld, 'This case must carry NO lone surrogate - it is the clean-content regression').toBe(false);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${tcId} - after posting the clean note`, passed: __verifyPassed }).catch(() => {});
      }
    });

    await test.step('Verification: the stored body is byte-identical and carries no replacement mark', async () => {
      const visible = await helpdeskPage.isChatterMessageVisible(tag);
      const stored = await helpdeskPage.getStoredLastMessageText(ticketId as string);
      const marks = countReplacementMarks(stored);
      const identical = sameText(stored, cleanBody);
      const emojiKept = stored.includes(VALID_EMOJI_1) && stored.includes(VALID_EMOJI_2);
      const viKept = stored.includes(VIETNAMESE_TEXT);
      const ruKept = stored.includes(CYRILLIC_TEXT);
      const cnKept = stored.includes(CHINESE_TEXT);
      const overall = posted && visible && marks === 0 && identical && emojiKept && viKept && ruKept && cnKept;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - the note saved and is visible:');
      console.log(`     Expected : the note posts and a chatter message contains "${tag}"`);
      console.log(`     Actual   : posted=${posted} visible=${visible} notification="${notification}"`);
      console.log(`     Result   : ${posted && visible ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - the sanitiser introduced nothing:');
      console.log('     Expected : 0 replacement marks (U+FFFD) in the stored body');
      console.log(`     Actual   : ${marks}`);
      console.log(`     Result   : ${marks === 0 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - the stored text is identical to what was typed:');
      console.log('     Expected : stored text == typed text');
      console.log(`     Actual   : byte_identical=${identical}`);
      console.log(`     Result   : ${identical ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - every alphabet survived:');
      console.log('     Expected : both emoji, the Vietnamese, the Cyrillic and the Chinese text are all present');
      console.log(`     Actual   : emoji=${emojiKept} vi=${viKept} ru=${ruKept} cn=${cnKept}`);
      console.log(`     Result   : ${emojiKept && viKept && ruKept && cnKept ? 'PASS' : 'FAIL'}`);
      console.log(`  Typed  body : ${cleanBody}`);
      console.log(`  Stored body : ${stored}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - ordinary chatter content ${overall ? 'is stored untouched by the fix' : 'was altered and that is a regression'}`);

      expect(posted, `The note must save. Notification was: "${notification}"`).toBe(true);
      expect(visible, `The posted note must be visible in the chatter (looked for "${tag}")`).toBe(true);
      expect(marks, `No replacement mark may be introduced into clean content. Stored: "${stored}"`).toBe(0);
      expect(identical, `The stored text must equal the typed text.\n  typed : "${cleanBody}"\n  stored: "${stored}"`).toBe(true);
      expect(emojiKept, `Both emoji must survive. Stored: "${stored}"`).toBe(true);
      expect(viKept, `The Vietnamese text must survive. Stored: "${stored}"`).toBe(true);
      expect(ruKept, `The Cyrillic text must survive. Stored: "${stored}"`).toBe(true);
      expect(cnKept, `The Chinese text must survive. Stored: "${stored}"`).toBe(true);
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
