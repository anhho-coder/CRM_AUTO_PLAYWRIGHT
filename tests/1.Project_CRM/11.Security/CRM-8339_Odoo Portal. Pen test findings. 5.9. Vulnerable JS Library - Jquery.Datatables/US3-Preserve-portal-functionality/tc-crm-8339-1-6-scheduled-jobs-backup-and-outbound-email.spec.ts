import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, BackOfficeHealthPage, PortalFunctionalityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  CRM-8339 - Pen test findings 5.9 (Vulnerable JS Library - jQuery DataTables)
 *  US3 - Preserve portal functionality
 * =============================================================================================
 *  Test Case ID     : CRM-8339_1.6
 *  Jira             : CRM-11496 (Xray Manual Steps, 5 steps)
 *  Source version   : CRM-11496 updated 2026-07-09T10:37+0300 - re-check before trusting this spec
 *  Test Repository  : /CRM test/Security/CRM-8339_Pen test findings 5.9/US3 Preserve portal functionality
 *  Target           : pre-production.nakivo.site
 *  Run as           : CRM admin (admin_crm) for the back office; the partner (reseller_gold) only
 *                     for the action of step 3, which the case says may be a portal ticket
 *  Automation-Type  : new
 *  Automation-Date  : 2026-10-13
 *  Evidence         : stdout for the scheduled-action and mail-queue reads (RPC, no screen), one
 *                     screenshot at the end of each UI section, plus afterEach start/end.
 *
 *  Summary
 *  ---------------------------------------------------------------------------------------------
 *  Checks that the environment's scheduled jobs still run after the remediation and that an
 *  action which sends a notification completes and notifies. The outbound-mail state and the
 *  backup are reported rather than scored - see the two blocks below for why.
 *
 *  Command to run
 *  ---------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-8339_1\\.6:" --project=chromium
 *
 *  ---------------------------------------------------------------------------------------------
 *  Source manual TC - CRM-11496 (verbatim, in order)
 *  ---------------------------------------------------------------------------------------------
 *  Pre-conditions:
 *    A remediated build is deployed to the test environment (OS upgrade + library remediation)
 *    Log in to the Odoo backend as an administrator:
 *      _ Login    = an admin account
 *      _ Baseline = note the Next Execution time of a known scheduled job before starting
 *
 *  Steps to reproduce #1 - scheduled actions:
 *    1. Log in to the Odoo backend as administrator
 *       Expected: (EMPTY IN JIRA - see OPEN POINTS #1)
 *       AUTOMATION: run as a Pre-condition, because it is the sign-in and not the check.
 *    2. Open Settings > Technical > Scheduled Actions (cron) and check the enabled jobs
 *       Expected: 2. Scheduled actions are active and their Next Execution advances over time
 *       (jobs run, not stuck)
 *
 *  Steps to reproduce #2 - the notification:
 *    3. Trigger an action that sends an email/notification (e.g. submit a portal ticket, or run a
 *       mailing)
 *       Expected: 3. The triggering action completes without error
 *       AUTOMATION: the first of the two the case offers - a portal ticket, submitted as the
 *       partner. The ticket this run creates is archived in teardown.
 *    4. [NOT EXECUTABLE for this trigger - a portal ticket produces no outbound message]
 *       Open Settings > Technical > Email > Emails and check the outgoing message
 *       Expected: 4. The outbound email shows status Sent (not stuck in Outgoing or Failed)
 *
 *  Steps to reproduce #3 - the backup:
 *    5. [MANUAL ONLY - the environment's backup files and logs are outside QA's access] Confirm
 *       the environment's scheduled backup for today completed (backup file / log)
 *       Expected: 5. Today's backup exists and completed successfully
 *
 *  ---------------------------------------------------------------------------------------------
 *  A PORTAL TICKET PRODUCES NO OUTBOUND MESSAGE - READ BEFORE QUOTING THIS CASE AS COVERAGE
 *  ---------------------------------------------------------------------------------------------
 *  Measured on pre-production 2026-10-13. Two tickets were submitted through the portal form, at
 *  12:12 and 12:15 server time. Both were created correctly - team "Customer Support", stage
 *  "Open" - and each carries a chatter notification of subtype "Ticket Created". NEITHER put a
 *  row in the outgoing-mail queue: the newest row in mail.mail at that moment was still 06:51:54
 *  the same morning, hours before the submissions.
 *
 *  The queue itself held sent 1,236,591 | exception 46,849 | cancel 7,454 | outgoing 0. The large
 *  "sent" figure is historical - this database is a restored snapshot - so it says nothing about
 *  whether this environment delivers mail today.
 *
 *  So step 4 has nothing to open and check FOR THIS TRIGGER, and asserting "Sent" would fail the
 *  case for the absence of a message the action never produced. What the spec scores instead is
 *  what the step 3 action demonstrably did produce: the ticket, and a notification on it. The
 *  mail queue is still read and printed - its state counts and the date of its newest row - so a
 *  reader can see for themselves that nothing arrived.
 *
 *  Two readings are possible and the spec does NOT pick one: either pre-production deliberately
 *  does not send outbound mail, or the ticket-created acknowledgement is not configured for this
 *  team. Both are environment / configuration questions rather than anything the remediation
 *  touched, and the case author has to say which applies before step 4 can be scored. Choosing
 *  the other trigger the case offers - "run a mailing" - would exercise a different path and is
 *  the obvious next step if an outbound message is what must be evidenced.
 *
 *  ---------------------------------------------------------------------------------------------
 *  OPEN POINTS raised by this spec (not invented answers)
 *  ---------------------------------------------------------------------------------------------
 *  1. Manual step 1 has an EMPTY Expected Result in Xray.
 *  2. Step 4 expects an outbound message with status "Sent". A portal ticket produces none on
 *     this environment - see above. Either the case names a trigger that does send mail, or
 *     somebody states that pre-production is not expected to deliver outbound mail at all.
 *  3. Step 5 needs access to the environment's backup files or logs, which QA does not have. It is
 *     marked MANUAL ONLY and stays a manual check, as reported under E.2 on CRM-12630 (2026-09-30).
 * =============================================================================================
 */

const TC = 'CRM-8339_1.6';

/** Toggle to true to leave the created ticket on pre-production for inspection. */
const SKIP_CLEANUP_TICKET = false;

/** The submission form used as the "action that sends a notification" of step 3. */
const SUBMIT_PATH = 'helpdesk/1/submit';
/** How long to wait between the two Next Execution reads of step 2. */
const CRON_OBSERVATION_WAIT = CommonUtils.waitTimes.elementAppear / 3;

/**
 * The ticket this run creates, held at module scope so the afterEach teardown can archive it even
 * when an assertion throws. A teardown that lives at the end of the test body never runs on a
 * failure - that is how ticket 428584 was left behind on 2026-10-13.
 */
let createdTicketSubject = '';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Log in to the Odoo backend as administrator (source step 1)',
  s2: 'Step 2: [INTERNAL check, Call API] Open Settings > Technical > Scheduled Actions (cron) and check the enabled jobs',
  s3: 'Step 3: Trigger an action that sends an email/notification (e.g. submit a portal ticket, or run a mailing)',
  s4: 'Step 4: [INTERNAL check, Call API] [NOT EXECUTABLE for this trigger - a portal ticket produces no outbound message] Open Settings > Technical > Email > Emails and check the outgoing message',
  s5: "Step 5: [MANUAL ONLY - the environment's backup files and logs are outside QA's access] Confirm the environment's scheduled backup for today completed (backup file / log)",
  verify: 'Verification',
} as const;

test.describe('CRM-8339 Security - preserve portal functionality (US3)', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - afterEach - start`).catch(
      () => {}
    );
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const reason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (reason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${reason.replace(/\n/g, '\n   ')}`);
      }
    }
    // ---------------------------------------------------------------- teardown
    // Runs HERE, in afterEach, and not at the end of the test body: a teardown placed after the
    // verification never runs when an assertion throws, and the record it was meant to remove is
    // left on the shared environment. That is exactly how ticket 428584 survived the failed run of
    // 2026-10-13.
    if (!SKIP_CLEANUP_TICKET && createdTicketSubject) {
      const subjectToClean = createdTicketSubject;
      createdTicketSubject = '';
      try {
        const loginPage = new LoginPage(page);
        const backOffice = new BackOfficeHealthPage(page);
        await page.context().clearCookies();
        await loginPage.navigateTo(baseUrl);
        await loginPage.login(users.admin_crm.username, users.admin_crm.password);
        await loginPage.dismissLocationPermissionDialog();
        const archived = await backOffice.archiveTicketByName(subjectToClean);
        console.log(`Tear down: archived "${subjectToClean}" : ${archived}`);
        console.log('   (Odoo helpdesk tickets cannot be deleted, only archived.)');
      } catch (e: any) {
        console.log(`Tear down FAILED for "${subjectToClean}": ${String(e?.message).split('\n')[0]}`);
        console.log(`   Leftover to remove by hand: "${subjectToClean}"`);
      }
    }

    await CommonUtils.captureAndAttachScreenshot(
      page,
      testInfo,
      `${TC} - afterEach - teardown done`
    ).catch(() => {});
  });

  test(`${TC}: Scheduled jobs, backups and outbound email/notifications still run after the OS/library remediation`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const backOffice = new BackOfficeHealthPage(page);
    const portalPage = new PortalFunctionalityPage(page);
    const partner = users.reseller_gold;

    const runId = CommonUtils.generateUniqueId();
    const subject = `AUTO-${TC}-${runId}`;

    let cronCounts = { total: 0, enabled: 0 };
    let cronBefore: { id: number; name: string; nextcall: string }[] = [];
    let cronAfter: Record<number, string> = {};
    let advanced: { name: string; before: string; after: string }[] = [];
    let triggerCompleted = false;
    let pageTextAfterSubmit = '';
    let notifications: { ticketId: number; messages: { id: number; type: string; subtype: string }[] } = {
      ticketId: 0,
      messages: [],
    };
    let newestMailRow = '';
    let queueCounts = { outgoing: 0, sent: 0, exception: 0, cancel: 0, other: {} as Record<string, number> };

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log('  NOTE: manual step 1 has an EMPTY Expected Result in Xray - nothing asserted.');
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`  - Account   : ${users.admin_crm.username}`);
      console.log(`  - Landed on : ${page.url()}`);
    });

    // ------------------------------------------------- Steps to reproduce #1
    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      cronCounts = await backOffice.getScheduledActionCounts();
      cronBefore = await backOffice.getEnabledScheduledActions(8);
      console.log(`  - Scheduled actions, total   : ${cronCounts.total}`);
      console.log(`  - Scheduled actions, enabled : ${cronCounts.enabled}`);
      console.log('  - Next Execution BEFORE the wait:');
      cronBefore.forEach((c) => console.log(`      [${c.id}] ${c.name.padEnd(44)} ${c.nextcall}`));

      console.log(`  - Waiting ${CRON_OBSERVATION_WAIT / 1000}s and reading Next Execution again...`);
      await page.waitForTimeout(CRON_OBSERVATION_WAIT);

      cronAfter = await backOffice.getNextExecutionTimes(cronBefore.map((c) => c.id));
      console.log('  - Next Execution AFTER the wait:');
      cronBefore.forEach((c) =>
        console.log(`      [${c.id}] ${c.name.padEnd(44)} ${cronAfter[c.id]}`)
      );

      advanced = cronBefore
        .filter((c) => cronAfter[c.id] && cronAfter[c.id] > c.nextcall)
        .map((c) => ({ name: c.name, before: c.nextcall, after: cronAfter[c.id] }));
      console.log(`  - Jobs whose Next Execution moved forward : ${advanced.length} of ${cronBefore.length}`);
      advanced.forEach((a) => console.log(`      ${a.name}: ${a.before} -> ${a.after}`));
    });

    // ------------------------------------------------- Steps to reproduce #2
    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await loginPage.logout(baseUrl).catch(() => {});
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(partner.username, partner.password);
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);

      await portalPage.openPortalPath(baseUrl, SUBMIT_PATH);
      await portalPage.fillSubmitFormField('partner_name', partner.username);
      await portalPage.fillSubmitFormField('partner_email', partner.username);
      await portalPage.fillSubmitFormField('name', subject);
      await portalPage.fillSubmitFormField(
        'description',
        `Automation check ${runId} - triggers a notification. Please ignore.`
      );
      createdTicketSubject = subject;
      console.log(`  - Action    : submit a portal ticket as ${partner.username}`);
      console.log(`  - Subject   : ${subject}`);

      await portalPage.submitTicketForm();
      pageTextAfterSubmit = await portalPage.getPageText(300);
      triggerCompleted = !/error|not found/i.test(pageTextAfterSubmit);
      console.log(`  - URL after Send : ${page.url()}`);
      console.log(`  - Page text      : ${pageTextAfterSubmit.slice(0, 200)}`);
      console.log(`  - Completed without error : ${triggerCompleted}`);

      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `${TC} - Steps to reproduce II - the triggering action completed`
      );
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await loginPage.logout(baseUrl).catch(() => {});
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();

      // give the mail queue manager a moment to pick the message up
      await page.waitForTimeout(CommonUtils.waitTimes.elementAppear / 6);

      queueCounts = await backOffice.getMailQueueCounts();
      newestMailRow = await backOffice.getNewestMailDate();
      notifications = await backOffice.getTicketNotifications(subject);
      console.log('  - Outgoing-mail queue, by state:');
      console.log(`      outgoing  : ${queueCounts.outgoing}`);
      console.log(`      sent      : ${queueCounts.sent}`);
      console.log(`      exception : ${queueCounts.exception}`);
      console.log(`      cancel    : ${queueCounts.cancel}`);
      Object.entries(queueCounts.other).forEach(([k, v]) => console.log(`      ${k.padEnd(10)}: ${v}`));
      console.log(`  - Newest row in the queue : ${newestMailRow}`);
      console.log('    -> compare that date with the submission above: if it is older, the action');
      console.log('       reached the ticket but never reached the mail queue.');
      console.log(`  - Ticket created by step 3 : id ${notifications.ticketId || '(not found)'}`);
      console.log(`  - Notifications on it      : ${notifications.messages.length}`);
      notifications.messages.forEach((m) =>
        console.log(`      [${m.id}] type=${m.type.padEnd(13)} subtype="${m.subtype}"`)
      );
    });

    // ------------------------------------------------- Steps to reproduce #3
    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      console.log("  - The environment's scheduled backup writes files and logs on the host, which");
      console.log('    QA has no access to from the application. Nothing here can read them, so');
      console.log('    this step stays a manual check and is scored neither way.');
      console.log('  - Reported under E.2 on CRM-12630 (2026-09-30).');
    });

    // ------------------------------------------------------------- Verification
    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);

      const cronsExistOk = cronCounts.total > 0;
      const cronsEnabledOk = cronCounts.enabled === cronCounts.total && cronCounts.enabled > 0;
      const cronsAdvancedOk = advanced.length > 0;
      const triggerOk = triggerCompleted;
      const ticketCreatedOk = notifications.ticketId > 0;
      const notifiedOk = notifications.messages.length > 0;
      const subtypes = Array.from(
        new Set(notifications.messages.map((m) => m.subtype).filter(Boolean))
      );

      const verifyLines = [
        `Crons enabled : ${cronCounts.enabled}/${cronCounts.total}`,
        `Advanced      : ${advanced.length}/${cronBefore.length}`,
        `Trigger       : ${triggerCompleted}`,
        `Ticket        : ${notifications.ticketId || 'not found'}`,
        `Notifications : ${notifications.messages.length} (${subtypes.join(', ') || 'none'})`,
      ];

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The environment has scheduled actions:');
      console.log(`     Expected : more than zero scheduled actions exist (none at all would mean the whole scheduler is gone, not merely stuck)`);
      console.log(`     Actual   : ${cronCounts.total}`);
      console.log(`     Result   : ${cronsExistOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #2 - Every scheduled action is enabled:');
      console.log(`     Expected : enabled == total (a disabled job is one that will never run, which is what step 2's "are active" asks about)`);
      console.log(`     Actual   : ${cronCounts.enabled} enabled of ${cronCounts.total}`);
      console.log(`     Result   : ${cronsEnabledOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #3 - Next Execution advances over time (the jobs RUN, not merely exist):');
      console.log(`     Expected : at least one of the ${cronBefore.length} soonest-due jobs has a LATER Next Execution after a ${CRON_OBSERVATION_WAIT / 1000}s wait. A frozen Next Execution across all of them is exactly the "stuck scheduler" this step is written to catch - and it reads as healthy on any check that only counts enabled jobs`);
      console.log(`     Actual   : ${advanced.length} of ${cronBefore.length} advanced`);
      console.log(`     Result   : ${cronsAdvancedOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #4 - The triggering action completes without error:');
      console.log(`     Expected : the portal accepts the submission and the page afterwards reports no error`);
      console.log(`     Actual   : ${pageTextAfterSubmit.slice(0, 120)}`);
      console.log(`     Result   : ${triggerOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #5 - The triggering action created the record it was supposed to:');
      console.log(`     Expected : a helpdesk ticket named "${subject}" exists (an action that reports success while creating nothing is the worst outcome of step 3)`);
      console.log(`     Actual   : ticket id ${notifications.ticketId || '(not found)'}`);
      console.log(`     Result   : ${ticketCreatedOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #6 - The action notified somebody:');
      console.log(`     Expected : at least one chatter notification on that ticket. Step 3 asks for an action "that sends an email/notification"; on this environment a portal ticket notifies through the ticket's chatter and puts nothing in the outgoing-mail queue, so the notification is where that step's effect is visible`);
      console.log(`     Actual   : ${notifications.messages.length} notification(s), subtypes: ${subtypes.join(', ') || '(none)'}`);
      console.log(`     Result   : ${notifiedOk ? 'PASS' : 'FAIL'}`);

      console.log('');
      console.log('  Observation (not scored) - the outgoing-mail queue after the action:');
      console.log(`     outgoing=${queueCounts.outgoing} sent=${queueCounts.sent} exception=${queueCounts.exception} cancel=${queueCounts.cancel}`);
      console.log(`     newest row : ${newestMailRow}`);
      console.log('     Step 4 expects an outbound message with status "Sent". This trigger');
      console.log('     produced none at all, so there is nothing to open and check and nothing');
      console.log('     is scored either way. See the header and OPEN POINT #2.');
      console.log(`  Observation (not scored) - step 5, the backup : MANUAL ONLY, outside QA's access`);
      console.log('===============================================');

      const overall =
        cronsExistOk && cronsEnabledOk && cronsAdvancedOk && triggerOk && ticketCreatedOk && notifiedOk;
      console.log(
        `OVERALL: ${overall ? 'PASS' : 'FAIL'} - scheduled actions run and the notification was produced; the delivery state and the backup are reported, not scored`
      );

      let verifyPassed = false;
      try {
        expect(cronCounts.total, 'the environment should have scheduled actions').toBeGreaterThan(0);
        expect(cronCounts.enabled, 'every scheduled action should be enabled').toBe(cronCounts.total);
        expect(
          advanced.length,
          `at least one scheduled action's Next Execution should advance - none did, which is a stuck scheduler`
        ).toBeGreaterThan(0);
        expect(triggerCompleted, 'the triggering action should complete without error').toBe(true);
        expect(
          notifications.ticketId,
          `the action should create a helpdesk ticket named "${subject}"`
        ).toBeGreaterThan(0);
        expect(
          notifications.messages.length,
          'the action should raise at least one notification on the ticket it created'
        ).toBeGreaterThan(0);
        verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - scheduled actions and the outbound message`,
          passed: verifyPassed,
          lines: verifyLines,
        }).catch(() => {});
      }
    });

  });
});
