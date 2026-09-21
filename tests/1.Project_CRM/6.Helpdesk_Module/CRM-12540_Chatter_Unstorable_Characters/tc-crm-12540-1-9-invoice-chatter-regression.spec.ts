import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  CRM-12540 - Log note / send message fails when the body contains NUL or lone-surrogate chars
 * =============================================================================================
 *  Test Case ID    : CRM-12540_1.9
 *  Jira            : CRM-12540  (Post-EA Support Ticket - reported by Support L1 on ticket #426182)
 *  Automation-Type : new
 *  Automation-Date : 2026-09-01
 *  Actor           : Faye Nguyen (Accountant)
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    CROSS-MODEL REGRESSION, third model. The fix sits on mail.message, so it changes chatter on every
 *    model at once; the acceptance criteria name leads, tickets AND invoices. Tickets are covered by
 *    CRM-12540_1.1 to _1.7, a lead by _1.8, and an INVOICE here.
 *
 *    An invoice is the most sensitive of the three to a chatter change: its chatter carries the audit
 *    trail an accountant reads back later, so a message that silently fails to save on an invoice is
 *    worse than one that fails on a lead.
 *
 *    Both directions are exercised on the same invoice: the screen path with a lone half-character
 *    (which does travel through the browser) and the server path with a NUL byte (which cannot).
 *
 *    Actor: an Accountant, not the Support L2 Manager - an invoice is an accountant's screen, and the
 *    Support role only reaches invoices under "Own Documents Only".
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12540_1.9:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source: CRM-12540 acceptance criteria + the QA verification matrix posted on the ticket
 *          (comment 689172). No Master-file row exists for this case.
 *
 *  DATA NOTE - deliberate, same reasoning as CRM-12540_1.8:
 *    This case does NOT create its own invoice - InvoicePage has no create helper, and building one
 *    (partner, product lines, taxes) for a regression check would add far more risk than the check is
 *    worth. It posts UNIQUELY TAGGED messages on an existing DRAFT invoice and asserts only on those
 *    tags, so repeat and parallel runs cannot collide. A draft invoice is chosen on purpose: it is not
 *    posted to the ledger, so nothing accounting-relevant is touched. Nothing is deleted afterwards -
 *    a chatter message is additive.
 *
 *    Pre-condition(s):
 *      I.  Log in as an Accountant (Faye).
 *      II. A DRAFT invoice this actor can open (Odoo's own record rules decide which).
 *    Steps to reproduce:
 *      1. Open that invoice.
 *      2. Log note a body carrying a lone UTF-16 surrogate, through the chatter composer.
 *      3. Post a second message on the same invoice through the server path, with a raw NUL byte.
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
const MODEL = 'account.invoice';
const DRAFT_ONLY = [['state', '=', 'draft']];

/** Count of replacement marks in a stored body - the sanitiser's visible footprint. */
function countReplacementMarks(text: string): number {
  return (text.match(new RegExp(REPLACEMENT_MARK, 'g')) || []).length;
}

test.describe('CRM-12540_1.9 - Chatter on an Invoice is unchanged by the fix (screen and server paths)', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12540_1.9: Verify chatter posting on a draft Invoice still works after the fix - a screen note with a lone surrogate and a server-path post with a NUL byte both save and are sanitised', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);

    const tcId = 'CRM-12540_1.9';
    const uiTag = `[${tcId} ui ${CommonUtils.generateUniqueId()}]`;
    const serverTag = `[${tcId} server ${CommonUtils.generateUniqueId()}]`;
    let invoiceId = 0;

    await test.step('Pre-condition I: Login as Faye (Accountant)', async () => {
      console.log(`\n=== PRE-CONDITION I: Login as ${users.accountance_ic_faye.displayName} ===`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.accountance_ic_faye.username, users.accountance_ic_faye.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log('  ✓ Logged in');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - logged in as Faye').catch(() => {});
    });

    await test.step('Pre-condition II: Resolve a draft invoice this actor can open', async () => {
      console.log('\n=== PRE-CONDITION II: A reachable DRAFT invoice ===');
      invoiceId = await invoicePage.findFirstRecordId(MODEL, DRAFT_ONLY);
      console.log(`  - ${MODEL} id : ${invoiceId} (state = draft)`);
      expect(invoiceId, `This actor must be able to reach at least one draft ${MODEL} record`).toBeGreaterThan(0);
    });

    let posted = false;
    let notification = '';
    let surrogateHeld = false;
    let uiStored = '';
    let serverMessageId = 0;
    let serverError = '';
    let serverStored = '';

    await test.step('Steps 1-2: Log note a body carrying a lone half-character (screen path)', async () => {
      console.log('\n=== STEPS 1-2: Invoice chatter, screen path with a lone half-character ===');
      await invoicePage.openRecordFormById(baseUrl, MODEL, invoiceId);
      const res = await invoicePage.pasteAndPostLogNote(`${uiTag} invoice chatter, lone-surrogate[${LONE_HIGH_SURROGATE}] end`);
      posted = res.posted;
      notification = res.notification;
      surrogateHeld = res.surrogateHeld;
      console.log(`  - Composer actually held the lone half-character : ${surrogateHeld}`);
      uiStored = await invoicePage.getStoredChatterMessageText(MODEL, invoiceId);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${tcId} - after the screen-path note on the invoice`).catch(() => {});
    });

    await test.step('Step 3: Post a second message on the same invoice through the server path with a NUL byte', async () => {
      console.log('\n=== STEP 3: Invoice chatter, server path with a raw NUL byte ===');
      try {
        serverMessageId = await invoicePage.postChatterMessageViaServerPath(MODEL, invoiceId, `${serverTag} server NUL [${NUL_BYTE}] end`);
      } catch (e) {
        serverError = e instanceof Error ? e.message : String(e);
        console.log(`  - Server rejected the post: ${serverError}`);
      }
      if (!serverError) serverStored = await invoicePage.getStoredChatterMessageText(MODEL, invoiceId);
    });

    await test.step('Verification: both paths posted on the invoice and both bad characters were sanitised', async () => {
      const visible = await invoicePage.isChatterMessageVisible(uiTag);
      const noError = !CONNECTION_LOST_RE.test(notification);
      const uiMarks = countReplacementMarks(uiStored);
      const serverMarks = countReplacementMarks(serverStored);
      const overall = surrogateHeld && posted && noError && visible && uiMarks === 1 && !serverError && serverMarks === 1;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #0 - the screen payload really carried the unstorable character:');
      console.log('     Expected : the composer holds a lone UTF-16 surrogate before sending');
      console.log(`     Actual   : ${surrogateHeld}`);
      console.log(`     Result   : ${surrogateHeld ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #1 - the screen note posted on the invoice with no error:');
      console.log('     Expected : the chatter grows by one message, no "Connection lost" / server error');
      console.log(`     Actual   : posted=${posted} visible=${visible} notification="${notification}"`);
      console.log(`     Result   : ${posted && visible && noError ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - the screen note stored the bad character as the replacement mark:');
      console.log('     Expected : exactly 1 replacement mark (U+FFFD)');
      console.log(`     Actual   : ${uiMarks}`);
      console.log(`     Result   : ${uiMarks === 1 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - the server-path post was accepted on the invoice:');
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
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - chatter on an Invoice ${overall ? 'is unaffected by the fix and sanitises both character kinds' : 'did not behave as required'}`);

      expect(surrogateHeld, 'The composer must actually hold a lone UTF-16 surrogate, otherwise this case proves nothing').toBe(true);
      expect(posted, `The screen note must save on the invoice. Notification was: "${notification}"`).toBe(true);
      expect(noError, `No "Connection lost" / server error must appear. Notification was: "${notification}"`).toBe(true);
      expect(visible, `The posted note must be visible in the invoice's chatter (looked for "${uiTag}")`).toBe(true);
      expect(uiMarks, `The screen note's bad character must become exactly one replacement mark. Stored: "${uiStored}"`).toBe(1);
      expect(serverError, `The server-path post must be accepted on an invoice. Error was: "${serverError}"`).toBe('');
      expect(serverMarks, `The server-path NUL must become exactly one replacement mark. Stored: "${serverStored}"`).toBe(1);
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) {
      console.log(`\n!! FAILURE REASON: ${testInfo.error.message ?? testInfo.error}`);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    // No teardown: this case creates no record, only two uniquely-tagged chatter messages on an
    // existing DRAFT invoice. Chatter is additive - there is nothing to put back.
  });
});
