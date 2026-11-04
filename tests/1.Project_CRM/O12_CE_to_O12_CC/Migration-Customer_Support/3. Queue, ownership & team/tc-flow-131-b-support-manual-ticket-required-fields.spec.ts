import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl_support_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { SupportDeskPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { customerSupportBaselineDetails } from '@helpers/customer-support-mig.helper';
import { createSupportContactAsAdmin, deleteSupportProbeAsAdmin } from '@helpers/support-desk-cleanup.helper';

/**
 * ================================================================================================
 *  TC-FLOW-131_B - A ticket created by hand needs the Subject and an e-mail or a contact; the description is optional
 *                  - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-FLOW-131_B   (side A = tc-flow-131-a-preprod-manual-ticket-required-fields.spec.ts = baseline, map in
 *                    helpers/customer-support-mig.baseline-map.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-03
 * Jira             : CRM-14112 (Xray Test, created 2026-11-03; feature CRM-11859)
 * Requirement      : IS-CRM-FUNC-0383 (Confluence 231246777 v9, answer to CRM-13845): "An agent creating a ticket by hand shall
 *                    provide the Subject and either the requester's e-mail address or a contact; the description shall be
 *                    optional, as today. Tickets opened from mail (IS-CRM-FUNC-0253, IS-CRM-FUNC-0255) and migrated tickets
 *                    (IS-CRM-FUNC-0299) are outside this rule."
 * Host / Run as    : support-crm-mig (Frappe Helpdesk, ignoreHTTPSErrors) / L1 agent Giang Le (users.support_l1_giang_support_mig,
 *                    HD Agent Support Level = L1 asserted); set-up and teardown as Administrator over the API
 * Data             : per run: one Contact (Pre-condition 2) and up to two probe tickets (Steps 2 and 3) plus the Contact FF makes
 *                    for Step 2's Raised By - ALL DELETED in afterEach (deny-list by this run's marker); toggle SKIP_CLEANUP_FLOW131
 * Folder           : "3. Queue, ownership & team" = Confluence 231246777 spec area of IS-CRM-FUNC-0383
 *
 * Summary: three New Ticket submissions - no e-mail and no contact (refused), an e-mail without a description (created), a
 * contact without an e-mail (created). Mail intake and migrated tickets are outside the rule and not exercised here.
 * Command to run: npx playwright test tc-flow-131-b-support --grep "TC-FLOW-131_B:" --project=chromium-headless
 *
 *  Source manual TC : written 2026-11-03 from Confluence 231246777 v9 (no CSV row) - Xray CRM-14112; master tab "Migration - Customer Support",
 *                     TC ID CRM-11859_TC-FLOW-131_B; 3 steps
 *  Source version   : Confluence 231246777 v9 - re-check the master row and the Xray steps before trusting this spec
 *  Pre-conditions   : Role: L1 agent. Agent account; a Contact of this run.
 *                     1. Logged in as L1 agent Giang Le on the Support service
 *                     2. [INTERNAL setup, Call API] as Administrator: Contact "QAv9c<runId>" with e-mail contact.<runId>@example.com
 *  Steps to reproduce #1
 *    1. FF: All Tickets > Create:
 *            - Subject           = AUTO-CRM-11859-TC-FLOW-131_B-<runId>-no-requester
 *            - Raised By (Email) = blank
 *            - Contact           = blank
 *            - Description       = Automated check of TC-FLOW-131_B - must be refused.
 *       Submit
 *    2. FF: All Tickets > Create:
 *            - Subject           = AUTO-CRM-11859-TC-FLOW-131_B-<runId>-email-only
 *            - Raised By (Email) = customer.<runId>@example.com
 *            - Contact           = blank
 *            - Description       = blank
 *       Submit
 *    3. FF: All Tickets > Create:
 *            - Subject           = AUTO-CRM-11859-TC-FLOW-131_B-<runId>-contact-only
 *            - Raised By (Email) = blank
 *            - Contact           = QAv9c<runId> (Pre-condition 2)
 *            - Description       = Automated check of TC-FLOW-131_B - contact without e-mail.
 *       Submit
 *  Verification - B expected
 *    1. Refused with the message "Set the customer's e-mail or pick a contact." and no ticket carries the subject.
 *    2. The ticket is created - the description is optional (Submit kept disabled while the description is empty is a FAIL).
 *    3. The ticket is created and its Contact is the chosen one.
 *
 * Evidence: Pre-condition end shot; verify shots Step 1 (the refusal), Step 2 and Step 3 (the form / the new ticket); end of
 *           Steps to reproduce #1; afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true });

const TC = 'TC-FLOW-131_B';
const SKIP_CLEANUP_FLOW131 = false;

const STEP = {
  pre1: 'Pre-condition 1: Agent account - Support service (Frappe Helpdesk) /login as L1 agent Giang Le; [INTERNAL check, Call API] HD Agent Support Level = L1',
  pre2: 'Pre-condition 2: [INTERNAL setup, Call API] as Administrator: a Contact of this run with its own e-mail',
  s1: 'Step 1: FF: All Tickets > Create: Subject and Description, Raised By (Email) = blank, Contact = blank; Submit',
  s2: 'Step 2: FF: All Tickets > Create: Subject and Raised By (Email), Contact = blank, Description = blank; Submit',
  s3: 'Step 3: FF: All Tickets > Create: Subject, Contact = the Pre-condition 2 contact and Description, Raised By (Email) = blank; Submit',
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_support_mig;
const ADMIN = users.admin_support_mig;
const REFUSAL = "Set the customer's e-mail or pick a contact.";
const runId = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
const DATA = {
  contactName: `QAv9c${runId.replace('_', '')}`,
  contactEmail: `contact.${runId}@example.com`,
  raisedBy: `customer.${runId}@example.com`,
  s1Subject: `AUTO-CRM-11859-TC-FLOW-131_B-${runId}-no-requester`,
  s2Subject: `AUTO-CRM-11859-TC-FLOW-131_B-${runId}-email-only`,
  s3Subject: `AUTO-CRM-11859-TC-FLOW-131_B-${runId}-contact-only`,
};
const created: Record<'s1' | 's2' | 's3', string> = { s1: '', s2: '', s3: '' };

/** `difference` = REQUIREMENT #4c conclusion, printed on a FAIL only. */
type Check = { what: string; expected: string; actual: string; passed: boolean; difference?: string };
function bannerLines(c: Check, width = 96): string[] {
  const wrap = (head: string, text: string): string[] => {
    const pad = ' '.repeat(head.length); const out: string[] = []; let cur = head;
    for (const word of text.split(' ')) { if (cur.length + word.length > width && cur.trim().length > head.trim().length) { out.push(cur.trimEnd()); cur = pad; } cur += `${word} `; }
    out.push(cur.trimEnd()); return out;
  };
  return [...wrap('', `${c.what}:`), ...wrap('   Expected : ', c.expected), ...wrap('   Actual   : ', c.actual),
    ...(!c.passed && c.difference ? wrap('   Difference : ', c.difference) : [])];
}
/** Record a step's checks and take their verify-point evidence shot BEFORE any expect() (REQUIREMENT #3b). */
async function recordChecks(page: Page, testInfo: TestInfo, all: Check[], stepChecks: Check[], name: string, highlight: string[], corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'bottom-right'): Promise<void> {
  all.push(...stepChecks);
  for (const c of stepChecks) console.log(`  - ${c.what} : ${c.actual} (${c.passed ? 'PASS' : 'FAIL'})`);
  await CommonUtils.captureVerifyEvidence(page, testInfo, { name, passed: stepChecks.every((c) => c.passed), highlight, lines: stepChecks.flatMap((c) => bannerLines(c)), corner }).catch(() => {});
}
const outcome = (r: { disabled: boolean; name: string; status: number; message: string }): string =>
  r.disabled ? 'Submit stays DISABLED - nothing sent' : r.name ? `created ticket ${r.name}` : `refused (HTTP ${r.status}) "${r.message}"`;

test.describe(`${TC} - Manual ticket required fields on the Support service`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version (REQUIREMENT #7) ---\n  - Source: Confluence 231246777 v9, IS-CRM-FUNC-0383 (no CSV row - nothing to fingerprint)');
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---');
    if (SKIP_CLEANUP_FLOW131) {
      console.log(`  - SKIP_CLEANUP_FLOW131 = true: left tickets ${JSON.stringify(created)} and contact ${DATA.contactEmail}`);
    } else {
      // deny-list: each step's own subject (and number when captured) + the run's own e-mail addresses
      const probes = [
        { ticketName: created.s1 || undefined, subject: DATA.s1Subject },
        { ticketName: created.s2 || undefined, subject: DATA.s2Subject, contactEmail: DATA.raisedBy },
        { ticketName: created.s3 || undefined, subject: DATA.s3Subject, contactEmail: DATA.contactEmail },
      ];
      for (const p of probes) {
        try {
          for (const line of await deleteSupportProbeAsAdmin(baseUrl_support_mig, ADMIN, p)) console.log(`  - ${line}`);
        } catch (e) {
          console.log(`  ! cleanup of "${p.subject}" NOT done: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Manual ticket needs the Subject and an e-mail or a contact, the description is optional - B: Frappe Helpdesk New Ticket`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${AGENT.username} on ${baseUrl_support_mig}`);
      try {
        await desk.login(baseUrl_support_mig, AGENT.username, AGENT.password);
        const agent = await desk.getMyAgentLevel(AGENT.username);
        console.log(`  [INTERNAL check, Call API] support level = ${agent.level || '(empty)'}`);
        expect(agent.level, 'the signed-in agent is an L1 agent').toBe('L1');
      } catch (e) {
        const reason = String((e as Error)?.message ?? e).split('\n')[0];
        console.log(`  SET-UP FAILED : ${reason}`);
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Pre-condition 1 - set-up failed', passed: false, lines: [`SET-UP FAILED - ${STEP.pre1}`, `  error: ${reason}`], corner: 'bottom-right' }).catch(() => {});
        throw e;
      }
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      const name = await createSupportContactAsAdmin(baseUrl_support_mig, ADMIN, { firstName: DATA.contactName, email: DATA.contactEmail });
      console.log(`  - Contact name   : ${DATA.contactName}\n  - Contact e-mail : ${DATA.contactEmail}\n  - Contact record : ${name}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-conditions - signed in, contact created');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await desk.openAllTicketsFromSidebar();
      await desk.openNewTicketForm();
      await desk.fillNewTicketForm({ subject: DATA.s1Subject, description: 'Automated check of TC-FLOW-131_B - must be refused.' });
      const r = await desk.submitNewTicketForm();
      created.s1 = r.name;
      const shown = r.name ? '' : await desk.readVisibleMessage('customer').catch(() => '');
      const marked = await desk.markVisibleMessage('customer').catch(() => false);
      const kept = await desk.countTicketsOverRest([['subject', '=', DATA.s1Subject]]);
      console.log(`  - Outcome          : ${outcome(r)}\n  - Message on screen : "${shown}"\n  [INTERNAL check, Call API] tickets carrying the subject: ${kept}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 the ticket without e-mail and contact is refused with the product message', expected: `refused: "${REFUSAL}"`, actual: outcome(r), passed: !r.name && !r.disabled && r.message.includes(REFUSAL), difference: r.name ? `a ticket (${r.name}) was created` : r.disabled ? 'Submit stayed disabled - the server was never asked' : `message "${r.message}" does not carry "${REFUSAL}"` },
        { what: 'Step 1 no ticket carries the subject', expected: '0 tickets', actual: `${kept} ticket(s)`, passed: kept === 0, difference: `expected 0, got ${kept}` },
      ], `${TC} - Step 1 refused`, marked ? [SupportDeskPageMig.MESSAGE] : [SupportDeskPageMig.SUBMIT], 'top-right');
      await page.keyboard.press('Escape').catch(() => {});
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await desk.openAllTicketsFromSidebar();
      await desk.openNewTicketForm();
      await desk.fillNewTicketForm({ subject: DATA.s2Subject, raisedBy: DATA.raisedBy });
      const r = await desk.submitNewTicketForm();
      created.s2 = r.name;
      console.log(`  - Outcome : ${outcome(r)}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 the ticket with an e-mail and NO description is created', expected: 'a new ticket (the description is optional)', actual: outcome(r), passed: !!r.name, difference: r.disabled ? 'Submit stays disabled while the description is empty - nothing was sent' : `refused (HTTP ${r.status}) "${r.message}"` },
      ], `${TC} - Step 2 e-mail only`, r.name ? ['header'] : [SupportDeskPageMig.SUBMIT], 'bottom-right');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await desk.openAllTicketsFromSidebar();
      await desk.openNewTicketForm();
      await desk.fillNewTicketForm({ subject: DATA.s3Subject, contact: DATA.contactName, description: 'Automated check of TC-FLOW-131_B - contact without e-mail.' });
      const r = await desk.submitNewTicketForm();
      created.s3 = r.name;
      const fields = r.name ? await desk.getTicketFields(r.name) : null;
      console.log(`  - Outcome : ${outcome(r)}${fields ? `\n  [INTERNAL check, Call API] contact = ${fields.contact} | raised_by = ${fields.raisedBy || '(empty)'}` : ''}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 the ticket with a contact and NO e-mail is created', expected: 'a new ticket', actual: outcome(r), passed: !!r.name, difference: r.disabled ? 'Submit stays disabled' : `refused (HTTP ${r.status}) "${r.message}"` },
        { what: 'Step 3 its Contact is the chosen one', expected: DATA.contactName, actual: fields ? fields.contact || '(empty)' : '(no ticket)', passed: !!fields && fields.contact.includes(DATA.contactName), difference: fields ? `expected '${DATA.contactName}', got '${fields.contact}'` : 'no ticket was created' },
      ], `${TC} - Step 3 contact only`, r.name ? ['header'] : [SupportDeskPageMig.SUBMIT], 'bottom-right');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 1 - three submissions done');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference ?? c.what}`).join(' | ')}` : 'OVERALL: PASS - Subject + (e-mail or contact) is required, the description is optional');
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference ? `Difference: ${c.difference}` : `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(failed.map((c) => c.what), 'the manual-ticket rule of IS-CRM-FUNC-0383 holds').toEqual([]);
    });
  });
});
