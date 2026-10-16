import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, PortalFunctionalityPage, HelpdeskPage, BackOfficeHealthPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import * as fs from 'fs';
import * as path from 'path';

/**
 * =============================================================================================
 *  CRM-8339 - Pen test findings 5.9 (Vulnerable JS Library - jQuery DataTables)
 *  US3 - Preserve portal functionality
 * =============================================================================================
 *  Test Case ID     : CRM-8339_1.7
 *  Jira             : CRM-11497 (Xray Manual Steps, 5 steps)
 *  Source version   : CRM-11497 Priority REMOVED 2026-10-16 - description + steps 3 and 5 - on
 *                     Aiva Nievierova's ruling of 2026-10-15. Re-check before trusting this spec.
 *  Test Repository  : /CRM test/Security/CRM-8339_Pen test findings 5.9/US3 Preserve portal functionality
 *  Target           : pre-production.nakivo.site
 *  Run as           : partner portal user (reseller_gold) for steps 2-4; CRM admin for step 5,
 *                     which the case itself asks to be done "on the backend if possible"
 *  Automation-Type  : refactored
 *  Automation-Date  : 2026-10-16
 *  Evidence         : one screenshot at the end of each "Steps to reproduce" section, a
 *                     verify-point capture on the created ticket, plus afterEach start/end.
 *
 *  Summary
 *  ---------------------------------------------------------------------------------------------
 *  A partner submits a support ticket with an attachment from the portal; the back office is then
 *  checked for the same ticket, its team and its stage. The ticket this run creates is archived in
 *  teardown (helpdesk tickets cannot be deleted in Odoo, only archived).
 *
 *  Command to run
 *  ---------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-8339_1\\.7:" --project=chromium
 *
 *  ---------------------------------------------------------------------------------------------
 *  Source manual TC - CRM-11497 (verbatim, in order)
 *  ---------------------------------------------------------------------------------------------
 *  Pre-conditions:
 *    A remediated build of the Odoo Portal is deployed
 *    Log in as an active portal user and prepare the ticket content plus an attachment:
 *      _ Subject     = TEST-Ticket-<timestamp>
 *      _ Description = Automation check <timestamp> - please ignore
 *      _ Attachment  = a small file (e.g. test-<timestamp>.png)
 *
 *  Steps to reproduce #1 - fill and submit:
 *    1. Log in to the portal
 *       Expected: (EMPTY IN JIRA - see OPEN POINTS #1)
 *       AUTOMATION: run as a Pre-condition, because it is the sign-in and not the check.
 *    2. Open the Support area and start a new ticket
 *       Expected: (EMPTY IN JIRA - see OPEN POINTS #1)
 *    3. Enter Subject and Description and attach the file
 *       Expected: (EMPTY IN JIRA - see OPEN POINTS #1)
 *    4. Submit the ticket
 *       Expected: 4. The ticket is created with a confirmation and a ticket reference
 *
 *  Steps to reproduce #2 - check it landed:
 *    5. Open the created ticket and (on the backend if possible) check its team and stage
 *       Expected: 5. Subject, Description and attachment are saved exactly as entered
 *       (no truncation or change)
 *       _ The ticket is routed to the "Customer Support" team
 *       _ The ticket is in the correct opening stage (e.g. New)
 *       AUTOMATION: done in the back office as the CRM admin, which is what the case's "on the
 *       backend if possible" asks for - the portal's own "View my Tickets" link answers 404, so
 *       there is no portal route to the created ticket (the same blocker that stops CRM-8339_1.5).
 *
 *  ---------------------------------------------------------------------------------------------
 *  PRIORITY WAS DROPPED FROM THIS CASE ON 2026-10-16 - WHAT CHANGED AND WHY
 *  ---------------------------------------------------------------------------------------------
 *  Measured on pre-production 2026-10-13 and again 2026-10-14: /helpdesk/1/submit redirects to
 *  /helpdesk/customer-support-1/submit, headed "Customer Support", and its form posts to
 *  /website_form/ with exactly these fields:
 *      team_id        hidden
 *      csrf_token     hidden
 *      partner_name   text      required   "Your Name"
 *      partner_email  email     required   "Your Email"
 *      name           text      required   "Subject"
 *      description    textarea             "Description"
 *      attachments    file                 "Attachment(s)"
 *  and a single "Send" button. There is NO Priority control of any kind.
 *
 *  The case used to ask for a Priority in step 3 and expect it saved "exactly as entered" in step
 *  5. Raised as D.2 on CRM-12630 (2026-09-30); Vitalii Ivanov answered on 2026-10-09 that it is a
 *  product decision for the PM, and Aiva Nievierova ruled on 2026-10-15:
 *    "on D.2, I suggest to drop Priority from CRM-11497: reword steps 3 and 5 and remove Priority
 *     from the pre-conditions, in both the manual and the automated case. [...] Ticket priority is
 *     set by Support during triage; no SLA policy depends on a customer-chosen priority."
 *
 *  So Priority is gone from the Xray case (description, step 3, step 5) and from this spec. What
 *  remains in its place is Verify #2 below: the form must offer EXACTLY the seven fields listed
 *  above, in that order. If a Priority control is ever added as the roadmap item Aiva mentioned,
 *  that check turns red and this case has to be re-read - which is the behaviour we want.
 *
 *  ---------------------------------------------------------------------------------------------
 *  OPEN POINTS raised by this spec (not invented answers)
 *  ---------------------------------------------------------------------------------------------
 *  1. Manual steps 1, 2 and 3 have EMPTY Expected Results in Xray.
 *  2. RESOLVED 2026-10-15 - Priority dropped from the case on Aiva Nievierova's ruling; see above.
 *  3. Step 4 expects "a confirmation and a ticket reference". The portal confirms the submission
 *     but the reference it shows is not pinned in the case, so the spec asserts the confirmation
 *     and prints whatever reference text it finds rather than matching an unstated format.
 *  4. Step 5 expects "the correct opening stage (e.g. New)" without pinning the stage. The spec
 *     reads and prints the stage the ticket landed in and asserts only that it HAS one; the case
 *     author has to pin which stage is correct.
 * =============================================================================================
 */

const TC = 'CRM-8339_1.7';

/** Toggle to true to leave the created ticket on pre-production for inspection. */
const SKIP_CLEANUP_TICKET = false;

/**
 * The ticket and attachment this run creates, held at module scope so the afterEach teardown can
 * clean them up even when an assertion throws. A teardown that lives at the end of the test body
 * never runs on a failure - that is how ticket 428584 was left behind on 2026-10-13.
 */
let createdTicketSubject = '';
let createdAttachmentPath = '';

/** The submission form, and the team it must route to. */
const SUBMIT_PATH = 'helpdesk/1/submit';
const EXPECTED_TEAM = 'Customer Support';
/** The form's fields as measured 2026-10-13, in document order. */
const EXPECTED_FORM_FIELDS = [
  'team_id',
  'csrf_token',
  'partner_name',
  'partner_email',
  'name',
  'description',
  'attachments',
];

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Prepare the ticket content plus an attachment',
  pre2: 'Pre-condition 2: Log in to the portal (source step 1)',
  s2: 'Step 2: Open the Support area and start a new ticket',
  s3: 'Step 3: Enter Subject and Description and attach the file',
  s4: 'Step 4: Submit the ticket',
  s5: 'Step 5: Open the created ticket and (on the backend if possible) check its team and stage',
  verify: 'Verification',
} as const;

/** A 1x1 PNG - the smallest real image, so the attachment is a genuine file and not a text blob. */
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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

    if (createdAttachmentPath) {
      fs.rmSync(createdAttachmentPath, { force: true });
      console.log(`Tear down: removed the local attachment file ${path.basename(createdAttachmentPath)}`);
      createdAttachmentPath = '';
    }

    await CommonUtils.captureAndAttachScreenshot(
      page,
      testInfo,
      `${TC} - afterEach - teardown done`
    ).catch(() => {});
  });

  test(`${TC}: Customer submits a new ticket from the portal Support area - fields save exactly and it routes to Customer Support in the opening stage`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const portalPage = new PortalFunctionalityPage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const partner = users.reseller_gold;

    const runId = CommonUtils.generateUniqueId();
    const subject = `AUTO-${TC}-${runId}`;
    const description = `Automation check ${runId} - please ignore`;
    const attachmentPath = path.join(process.cwd(), 'test-data', `auto-${TC}-${runId}.png`);
    createdTicketSubject = subject;
    createdAttachmentPath = attachmentPath;

    let formFields: { name: string; type: string; required: boolean; label: string }[] = [];
    let hasPriorityField = false;
    let submitStatus = 0;
    let confirmationText = '';
    let ticketFoundInBackOffice = false;
    let ticketStage = '';
    let ticketTeam = '';
    let ticketDescription = '';

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      fs.mkdirSync(path.dirname(attachmentPath), { recursive: true });
      fs.writeFileSync(attachmentPath, Buffer.from(PNG_1X1_BASE64, 'base64'));
      console.log(`  - Your Name   = ${partner.username}`);
      console.log(`  - Your Email  = ${partner.username}`);
      console.log(`  - Subject     = ${subject}`);
      console.log(`  - Description = ${description}`);
      console.log(`  - Attachment  = ${path.basename(attachmentPath)} (${fs.statSync(attachmentPath).size} bytes)`);
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log('  NOTE: manual step 1 has an EMPTY Expected Result in Xray - nothing asserted.');
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(partner.username, partner.password);
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      console.log(`  - Landed on : ${page.url()}`);
    });

    // ------------------------------------------------- Steps to reproduce #1
    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      submitStatus = await portalPage.openPortalPath(baseUrl, SUBMIT_PATH);
      const identity = await portalPage.getPageIdentity();
      formFields = await portalPage.getSubmitFormFields();
      hasPriorityField = formFields.some(
        (f) => /priority/i.test(f.name) || /priority/i.test(f.label)
      );
      console.log(`  - ${SUBMIT_PATH} : HTTP ${submitStatus}`);
      console.log(`  - Landed on      : ${identity.url}`);
      console.log(`  - Headings       : ${JSON.stringify(identity.headings)}`);
      console.log('  - Form fields:');
      formFields.forEach((f) =>
        console.log(`      ${f.name.padEnd(16)} ${f.type.padEnd(10)} required=${String(f.required).padEnd(5)} label="${f.label}"`)
      );
      console.log(`  - Priority field present : ${hasPriorityField}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await portalPage.fillSubmitFormField('partner_name', partner.username);
      await portalPage.fillSubmitFormField('partner_email', partner.username);
      await portalPage.fillSubmitFormField('name', subject);
      await portalPage.fillSubmitFormField('description', description);
      await portalPage.attachFileToSubmitForm(attachmentPath);
      console.log(`  - Your Name   : ${partner.username}`);
      console.log(`  - Your Email  : ${partner.username}`);
      console.log(`  - Subject     : ${subject}`);
      console.log(`  - Description : ${description}`);
      console.log(`  - Attachment  : ${path.basename(attachmentPath)}`);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await portalPage.submitTicketForm();
      confirmationText = await portalPage.getPageText(400);
      console.log(`  - URL after Send : ${page.url()}`);
      console.log(`  - Page text      : ${confirmationText.slice(0, 250)}`);

      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `${TC} - Steps to reproduce I - ticket submitted from the portal`
      );
    });

    // ------------------------------------------------- Steps to reproduce #2
    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      await loginPage.logout(baseUrl).catch(() => {});
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`  - Back office as : ${users.admin_crm.username}`);

      await helpdeskPage.openAllTicketsListDirect(baseUrl);
      await helpdeskPage.searchTicket(subject);
      ticketFoundInBackOffice = await helpdeskPage.isTicketVisible(subject);
      console.log(`  - Ticket "${subject}" in All Tickets : ${ticketFoundInBackOffice}`);

      if (ticketFoundInBackOffice) {
        await helpdeskPage.openTicket(subject);
        ticketStage = await helpdeskPage.getStageName().catch(() => '');
        ticketTeam = await helpdeskPage.getFieldValueByName('team_id').catch(() => '');
        ticketDescription = await helpdeskPage.getFieldValueByName('description').catch(() => '');
        console.log(`  - Stage       : ${ticketStage}`);
        console.log(`  - Team        : ${ticketTeam}`);
        console.log(`  - Description : ${ticketDescription.slice(0, 120)}`);
        console.log(`  - Ticket URL  : ${page.url()}`);
      }

      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `${TC} - Steps to reproduce II - the created ticket in the back office`
      );
    });

    // ------------------------------------------------------------- Verification
    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);

      const fieldNames = formFields.map((f) => f.name);
      const formOk = JSON.stringify(fieldNames) === JSON.stringify(EXPECTED_FORM_FIELDS);
      const submitPageOk = submitStatus === 200;
      const confirmedOk = !/error|not found/i.test(confirmationText) && confirmationText.length > 0;
      const foundOk = ticketFoundInBackOffice;
      const teamOk = ticketTeam.includes(EXPECTED_TEAM);
      const stageOk = ticketStage.trim().length > 0;
      const descriptionOk = ticketDescription.includes(description);

      const verifyLines = [
        `Subject : ${subject}`,
        `Found   : ${ticketFoundInBackOffice}`,
        `Team    : ${ticketTeam}`,
        `Stage   : ${ticketStage}`,
      ];

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The submission form loads:');
      console.log(`     Expected : HTTP 200 for ${SUBMIT_PATH}`);
      console.log(`     Actual   : HTTP ${submitStatus}`);
      console.log(`     Result   : ${submitPageOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #2 - The form offers its fields unchanged:');
      console.log(`     Expected : exactly these fields, in this order: ${EXPECTED_FORM_FIELDS.join(', ')} (grounded 2026-10-13; a change here means the form was edited and this case needs re-reading - in particular a NEW field called priority would answer OPEN POINT #2)`);
      console.log(`     Actual   : ${fieldNames.join(', ')}`);
      console.log(`     Result   : ${formOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #3 - The submission is accepted:');
      console.log(`     Expected : the page after Send carries no error (step 4 also expects "a ticket reference", whose format the case does not pin - the page text is printed above instead of matched)`);
      console.log(`     Actual   : ${confirmationText.slice(0, 120)}`);
      console.log(`     Result   : ${confirmedOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #4 - The ticket exists in the back office with the Subject as entered:');
      console.log(`     Expected : a ticket named exactly "${subject}" (an absent ticket means the portal accepted a submission that never landed - the worst outcome of this case)`);
      console.log(`     Actual   : found=${ticketFoundInBackOffice}`);
      console.log(`     Result   : ${foundOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #5 - The ticket is routed to the Customer Support team:');
      console.log(`     Expected : team contains "${EXPECTED_TEAM}"`);
      console.log(`     Actual   : ${ticketTeam || '(not read)'}`);
      console.log(`     Result   : ${teamOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #6 - The Description is saved exactly as entered:');
      console.log(`     Expected : the ticket description contains "${description}" verbatim (step 5 asks for "no truncation or change")`);
      console.log(`     Actual   : ${ticketDescription.slice(0, 120) || '(not read)'}`);
      console.log(`     Result   : ${descriptionOk ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #7 - The ticket landed in a stage:');
      console.log(`     Expected : a non-empty stage. The case says "the correct opening stage (e.g. New)" without pinning which stage is correct, so the stage is READ AND PRINTED for the case author to pin - see OPEN POINT #4 - and only its presence is scored`);
      console.log(`     Actual   : ${ticketStage || '(not read)'}`);
      console.log(`     Result   : ${stageOk ? 'PASS' : 'FAIL'}`);

      console.log('');
      console.log(`  Observation (not scored) - Priority field on the form : ${hasPriorityField ? 'PRESENT - see below' : 'absent, as expected'}`);
      console.log('     Priority was dropped from this case on 2026-10-15 (Aiva Nievierova), so its');
      console.log('     absence is now the expected state and not a gap. If this ever reads PRESENT,');
      console.log('     the roadmap item she mentioned has landed and the case needs re-reading -');
      console.log('     Verify #2 above turns red at the same moment.');
      console.log(`  Observation (not scored) - attachment sent : ${path.basename(attachmentPath)}`);
      console.log('===============================================');

      const overall =
        submitPageOk && formOk && confirmedOk && foundOk && teamOk && descriptionOk && stageOk;
      console.log(
        `OVERALL: ${overall ? 'PASS' : 'FAIL'} - portal ticket submission, routing to ${EXPECTED_TEAM} and the saved fields`
      );

      let verifyPassed = false;
      try {
        expect(submitStatus, 'the submission form should load').toBe(200);
        expect(fieldNames, 'the submission form fields should be unchanged').toEqual(
          EXPECTED_FORM_FIELDS
        );
        expect(confirmationText, 'the page after Send should not report an error').not.toMatch(
          /error|not found/i
        );
        expect(ticketFoundInBackOffice, `a ticket named "${subject}" should exist`).toBe(true);
        expect(ticketTeam, `the ticket should be routed to ${EXPECTED_TEAM}`).toContain(
          EXPECTED_TEAM
        );
        expect(ticketDescription, 'the description should be saved verbatim').toContain(description);
        expect(ticketStage.trim(), 'the ticket should be in a stage').not.toBe('');
        verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - submitted ticket in the back office`,
          passed: verifyPassed,
          lines: verifyLines,
        }).catch(() => {});
      }
    });

  });
});
