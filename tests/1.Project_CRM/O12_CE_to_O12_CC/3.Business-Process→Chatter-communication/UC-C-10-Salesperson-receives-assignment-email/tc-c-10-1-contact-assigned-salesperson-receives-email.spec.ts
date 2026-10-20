import { test, expect } from '@playwright/test';
import { baseUrl_mig, baseUrl_mailpit_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { ContactPage } from '@pages';
import { HomePageMig, MailpitPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { MailpitClient, MailpitMessage } from '@helpers/mailpit.helper';
import {
  loginToO12CE,
  teardownMigRecords,
  sweepMigLeftoversAfterAll,
  registerMigRecord,
} from '@helpers/o12ce-main-business.helper';

/**
 * =====================================================================================================
 *  UC-C-10 - Salesperson receives the assignment email - Contact assigned to Bear Lin (crm-mig)
 * =====================================================================================================
 *  Test Case ID    : TC.-C.10.1
 *  Jira            : - (no manual TC yet - scenario agreed with the tester in session, 2026-10-20)
 *  Automation-Type : new
 *  Automation-Date : 2026-10-20
 *  Run as          : Administrator (users.admin_crm_mig - anh.ho@nakivo.com), tester's choice
 *  Server          : CRM = crm-mig.nakivo.site (db nakivoCE)  |  Mailbox = crm-mig.nakivo.site/mailpit/
 *
 *  Summary:
 *    Creates a fresh Individual Contact on crm-mig with Salesperson = Bear Lin and checks that the CRM
 *    sends Bear Lin the same "You have been assigned to <contact>" email the real contact 100001720
 *    (vinchin.com, Amelia Luo) produced on 2026-10-20 - read from the Mailpit test mailbox.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-C\.10\.1:" --project=chromium
 *
 *  Source manual TC (authored from the session - mirrors the steps below, same order):
 *  -----------------------------------------------------------------------------------------------------
 *  Pre-condition(s):
 *    _ crm-mig sends all email to the Mailpit sink (ir.mail_server "Mailpit crm-mig (QA sink)",
 *      127.0.0.1:1025, active; every other mail server inactive; Mailpit relay disabled) - nothing
 *      leaves the server, so the email to bear.lin@nakivo.com is safe to trigger.
 *    _ Bear Lin = res.users 62 on crm-mig, active, notification_type = email.
 *    _ Reference email: Mailpit message 4nuvdsRSajqFykECWlywik, Subject "You have been assigned to
 *      vinchin.com, Amelia Luo", To Bear Lin <bear.lin@nakivo.com>.
 *
 *  Steps:
 *    1. Use the account of Admin to login successful (O12 CE Migration server).
 *    2. [INTERNAL check, Call API] On Mailpit count the emails whose Subject is
 *       "You have been assigned to <contact name>" and note it as N.
 *         Expected: N is read (0 for a fresh name).
 *    3. On the CRM open Contacts (sidebar Contacts), click CREATE and enter the contact information:
 *         - Company Type = Individual
 *         - Name         = TEST TC.-C.10.1 <timestamp>
 *         - Email        = blank (left empty on purpose - an email domain can spawn a Company partner
 *                          this spec would not own)
 *         - Street       = 123street
 *         - Country      = United States
 *         - State        = Connecticut
 *         - Salesperson  = Bear Lin
 *         Expected: the Salesperson field reads "Bear Lin".
 *    4. Press SAVE and note the new Contact id.
 *         Expected: the form leaves edit mode and the URL carries the record id.
 *    5. Read the chatter of the saved Contact.
 *         Expected: a message reading exactly "Contact created".
 *    6. [INTERNAL check, Call API] On Mailpit wait (up to 3 min) until the emails with that Subject
 *       reach N + 1, and read the new one.
 *         Expected: exactly N + 1 (one new email, no duplicate).
 *    7. On Mailpit open the new email in the web UI (crm-mig.nakivo.site/mailpit/view/<id>).
 *         Expected: the Subject is shown on screen.
 *
 *  Verification:
 *    #1 Salesperson on the saved Contact = "Bear Lin"
 *    #2 Chatter holds a message reading exactly "Contact created"
 *    #3 Emails with Subject "You have been assigned to <contact name>" = N + 1
 *    #4 To = exactly one recipient, bear.lin@nakivo.com
 *    #5 Subject = "You have been assigned to <contact name>" (verbatim)
 *    #6 Body contains "Dear Bear Lin,"
 *    #7 Body contains "You have been assigned to the Contact <contact name>."
 *    #8 "View Contact" link = https://crm-mig.nakivo.site/mail/view?model=res.partner&res_id=<new id>
 *    #9 The Mailpit web UI shows the Subject
 *    Observation (not scored) - From: the reference email came from "NAKIVO, Inc." <odoobot@nakivo.com>
 *      because that contact was created by the system user (uid 1). Who the sender is when a human
 *      creates the contact is not pinned yet - printed, not asserted.
 *
 *  Cleanup (crm-mig house rule): the Contact carries the marker "TEST TC.-C.10.1 <timestamp>", is
 *  deleted in afterEach (RPC unlink as Admin, which also removes its chatter) and swept again in
 *  afterAll. The Mailpit email is KEPT on purpose - it is the evidence, and Mailpit is a mail sink, not
 *  migrated data.
 * =====================================================================================================
 */

const TC = 'TC.-C.10.1';
const SALESPERSON = { name: 'Bear Lin', email: 'bear.lin@nakivo.com' };

const SKIP_CLEANUP_CONTACT = false; // false = delete the Contact this test created (crm-mig house rule).

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  // Step 1 is opened and printed by loginToO12CE().
  s2: 'Step 2: [INTERNAL check, Call API] On Mailpit count the emails whose Subject is "You have been assigned to <contact name>" and note it as N',
  s3: 'Step 3: On the CRM open Contacts (sidebar Contacts), click CREATE and enter the contact information',
  s4: 'Step 4: Press SAVE and note the new Contact id',
  s5: 'Step 5: Read the chatter of the saved Contact',
  s6: 'Step 6: [INTERNAL check, Call API] On Mailpit wait (up to 3 min) until the emails with that Subject reach N + 1, and read the new one',
  s7: 'Step 7: On Mailpit open the new email in the web UI',
  verify: 'Verification',
} as const;

const htmlToText = (html: string): string =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

const viewLinkOf = (html: string): string => {
  const m = html.match(/href="([^"]*\/mail\/view\?[^"]*)"[^>]*>\s*View Contact\s*</i);
  return m ? m[1].replace(/&amp;/g, '&') : '';
};

test.describe(`${TC} - Contact assigned to ${SALESPERSON.name} sends the assignment email`, () => {
  let contactUrl = '';
  let mailpit: MailpitClient | undefined;

  test.beforeEach(async ({ context, page }) => {
    contactUrl = '';
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const reason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (reason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${reason.replace(/\n/g, '\n   ')}`);
      }
    }
    // The spec may die on the Mailpit page: drop the auth route and return to Odoo before the RPC unlink.
    await new MailpitPageMig(page).closeMailbox(contactUrl || baseUrl_mig).catch(() => {});
    await mailpit?.dispose().catch(() => {});
    mailpit = undefined;
    if (contactUrl) console.log(`Contact created by this run: ${contactUrl}`);
    await teardownMigRecords(page, SKIP_CLEANUP_CONTACT);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  // crm-mig rule: the afterAll sweep removes what a dying test created but never got to register.
  test.afterAll(async ({ browser }) => {
    await sweepMigLeftoversAfterAll(browser, TC);
  });

  test(`${TC}: Verify assigning a new Contact to ${SALESPERSON.name} sends him the "You have been assigned to" email (crm-mig, Mailpit)`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const homePage = new HomePageMig(page);
    const contactPage = new ContactPage(page);
    const mailpitPage = new MailpitPageMig(page);

    const unique = `${Date.now()}`;
    const DATA = {
      name: `TEST ${TC} ${unique}`,
      street: '123street',
      country: 'United States',
      state: 'Connecticut',
      salesperson: SALESPERSON.name,
    };
    const SUBJECT = `You have been assigned to ${DATA.name}`;

    let baselineN = -1;
    let individual = false;
    let salespersonOnForm = '';
    let contactId = '';
    let createdNote: string | null = null;
    let chatter: string[] = [];
    let afterCount = -1;
    let waitedMs = 0;
    let mail: MailpitMessage | undefined;
    let shownInUi = false;

    // Step 1 - loginToO12CE opens its own test.step.
    await loginToO12CE(page);

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      mailpit = await MailpitClient.open();
      baselineN = (await mailpit.findBySubject(SUBJECT)).length;
      console.log(`  Mailbox  : ${baseUrl_mailpit_mig}`);
      console.log(`  Subject  : ${SUBJECT}`);
      console.log(`  N        : ${baselineN}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await homePage.navigateToContacts();
      await contactPage.clickCreate();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      individual = await contactPage.selectIndividualType();
      await contactPage.fillContactName(DATA.name);
      await contactPage.fillStreet(DATA.street);
      await contactPage.selectCountry(DATA.country);
      await contactPage.selectState(DATA.state);
      await contactPage.selectSalesperson(DATA.salesperson);
      salespersonOnForm = await contactPage.getFieldPartnerName('user_id');
      console.log(`  - Company Type : Individual (selected: ${individual})`);
      console.log(`  - Name         : ${DATA.name}`);
      console.log(`  - Email        : blank`);
      console.log(`  - Street       : ${DATA.street}`);
      console.log(`  - Country      : ${DATA.country}`);
      console.log(`  - State        : ${DATA.state}`);
      console.log(`  - Salesperson  : ${DATA.salesperson} (form reads "${salespersonOnForm}")`);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await contactPage.clickSave();
      await contactPage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage);
      contactId = await contactPage.waitForIdInUrlAndExtract(CommonUtils.waitTimes.savingPage);
      registerMigRecord('res.partner', contactId, `Contact ${TC}`);
      contactUrl = page.url();
      salespersonOnForm = await contactPage.getFieldPartnerName('user_id');
      console.log(`  Contact id   : ${contactId}`);
      console.log(`  Contact URL  : ${contactUrl}`);
      console.log(`  Salesperson  : ${salespersonOnForm}`);
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      createdNote = await contactPage.waitForChatterMessage(/^Contact created$/);
      chatter = await contactPage.getChatterMessages();
      console.log(`  Chatter messages (${chatter.length}, newest first):`);
      chatter.forEach((m, i) => console.log(`    ${i + 1}. ${m.replace(/\s+/g, ' ').slice(0, 160)}`));
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Contact saved, Salesperson Bear Lin, chatter read`);
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      const res = await mailpit!.waitForSubject(SUBJECT, baselineN + 1);
      afterCount = res.messages.length;
      waitedMs = res.waitedMs;
      console.log(`  Emails with that Subject : ${afterCount} (N = ${baselineN}) after ${Math.round(waitedMs / 1000)} s, ${res.polls} poll(s)`);
      if (res.messages.length > 0) {
        mail = await mailpit!.getMessage(res.messages[0].ID);
        console.log(`  Mailpit id : ${mail.ID}`);
        console.log(`  Date       : ${mail.Date}`);
        console.log(`  From       : ${mail.From?.Name} <${mail.From?.Address}>`);
        console.log(`  To         : ${(mail.To || []).map(t => `${t.Name} <${t.Address}>`).join(', ')}`);
        console.log(`  Subject    : ${mail.Subject}`);
        console.log(`  Body       : ${htmlToText(mail.HTML).slice(0, 300)}`);
      }
    });

    await test.step(STEP.s7, async () => {
      console.log(`\n--- ${STEP.s7} ---`);
      if (!mail) {
        console.log('  no email to open - skipped (Verification reports why)');
        return;
      }
      shownInUi = await mailpitPage.openMessage(mail.ID, SUBJECT);
      console.log(`  ${baseUrl_mailpit_mig}view/${mail.ID} -> Subject on screen: ${shownInUi}`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const expectedLink = `${baseUrl_mig}mail/view?model=res.partner&res_id=${contactId}`;
      const body = mail ? htmlToText(mail.HTML) : '';
      const to = (mail?.To || []).map(t => t.Address.toLowerCase());
      const link = mail ? viewLinkOf(mail.HTML) : '';
      const checks = [
        { what: 'Salesperson on the saved Contact', expected: SALESPERSON.name, actual: salespersonOnForm, ok: salespersonOnForm === SALESPERSON.name },
        { what: 'Chatter message reading exactly "Contact created"', expected: 'FOUND', actual: createdNote ? 'FOUND' : 'NOT FOUND', ok: !!createdNote },
        { what: 'Emails with the assignment Subject', expected: `${baselineN + 1} (N + 1 - more means a duplicate send, fewer means no email)`, actual: `${afterCount}`, ok: afterCount === baselineN + 1 },
        { what: 'To', expected: SALESPERSON.email, actual: to.join(', ') || '(none)', ok: to.length === 1 && to[0] === SALESPERSON.email },
        { what: 'Subject (verbatim)', expected: SUBJECT, actual: mail?.Subject ?? '(no email)', ok: mail?.Subject === SUBJECT },
        { what: 'Body greeting', expected: `Dear ${SALESPERSON.name},`, actual: body.includes(`Dear ${SALESPERSON.name},`) ? 'FOUND' : 'NOT FOUND', ok: body.includes(`Dear ${SALESPERSON.name},`) },
        { what: 'Body assignment sentence', expected: `You have been assigned to the Contact ${DATA.name}.`, actual: body.includes(`You have been assigned to the Contact ${DATA.name}.`) ? 'FOUND' : 'NOT FOUND', ok: body.includes(`You have been assigned to the Contact ${DATA.name}.`) },
        { what: '"View Contact" link', expected: expectedLink, actual: link || '(not found)', ok: link === expectedLink },
        { what: 'Mailpit web UI shows the Subject', expected: 'true', actual: `${shownInUi}`, ok: shownInUi },
      ];

      const lines: string[] = [];
      console.log('==================== VERIFY ====================');
      checks.forEach((c, i) => {
        console.log(`  Verify #${i + 1} - ${c.what}:`);
        console.log(`     Expected : ${c.expected}`);
        console.log(`     Actual   : ${c.actual}`);
        console.log(`     Result   : ${c.ok ? 'PASS' : 'FAIL'}`);
        lines.push(`#${i + 1} ${c.what}: ${c.ok ? 'PASS' : 'FAIL'}`);
      });
      console.log(`  Observation (not scored) - From              : ${mail ? `${mail.From?.Name} <${mail.From?.Address}>` : '(no email)'} (reference: "NAKIVO, Inc." <odoobot@nakivo.com>, system-created contact)`);
      console.log(`  Observation (not scored) - arrival wait      : ${Math.round(waitedMs / 1000)} s`);
      console.log(`  Observation (not scored) - Individual radio  : ${individual}`);
      console.log('===============================================');
      const allOk = checks.every(c => c.ok);
      console.log(`OVERALL: ${allOk ? 'PASS' : 'FAIL'} - ${allOk ? `Bear Lin received "${SUBJECT}"` : `${checks.filter(c => !c.ok).length} of ${checks.length} checks failed`}`);

      let __verifyPassed = false;
      try {
        expect(salespersonOnForm, 'Verify #1 - Salesperson on the saved Contact').toBe(SALESPERSON.name);
        expect(createdNote, 'Verify #2 - chatter message "Contact created"').toBeTruthy();
        expect(afterCount, 'Verify #3 - emails with the assignment Subject = N + 1').toBe(baselineN + 1);
        expect(to, 'Verify #4 - To').toEqual([SALESPERSON.email]);
        expect(mail?.Subject, 'Verify #5 - Subject').toBe(SUBJECT);
        expect(body, 'Verify #6 - body greeting').toContain(`Dear ${SALESPERSON.name},`);
        expect(body, 'Verify #7 - body assignment sentence').toContain(`You have been assigned to the Contact ${DATA.name}.`);
        expect(link, 'Verify #8 - View Contact link').toBe(expectedLink);
        expect(shownInUi, 'Verify #9 - Mailpit web UI shows the Subject').toBe(true);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - assignment email in Mailpit`, passed: __verifyPassed, lines }).catch(() => {});
      }
    });
  });
});
