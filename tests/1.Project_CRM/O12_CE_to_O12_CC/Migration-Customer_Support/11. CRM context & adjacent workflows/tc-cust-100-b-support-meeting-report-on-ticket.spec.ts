import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl_support_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { SupportDeskPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { customerSupportBaselineDetails } from '@helpers/customer-support-mig.helper';

/**
 * ================================================================================================
 *  TC-CUST-100_B - The support meeting report stays on the ticket - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-CUST-100_B   (side A = tc-cust-100-a-preprod-meeting-report-on-ticket.spec.ts = baseline, map in
 *                    helpers/customer-support-mig.baseline-map.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-03
 * Jira             : CRM-14116 (Xray Test, created 2026-11-03; feature CRM-11859)
 * Requirement      : IS-CRM-FUNC-0289-2 (Confluence 231246777 v9, answer to CRM-13843): "The report an agent records on completing
 *                    a support meeting - its start and end time, whether it was a bonus or a cancelled meeting, the issue and the
 *                    solution - shall be kept on the ticket, as today." On FF the report is NK Meeting's log fields (Start Date,
 *                    End Date, Bonus Meeting, Canceled meeting, Feedback); Aiva: meetings belong to the Meetings menu.
 * Host / Run as    : support-crm-mig (Frappe Helpdesk, ignoreHTTPSErrors) / L2 agent Nam Pham (users.support_l2_nam_support_mig,
 *                    HD Agent Support Level = L2 asserted)
 * Data             : READ ONLY - an existing (migrated) meeting report picked at run time: the newest logged NK Meeting with feedback
 * Folder           : "11. CRM context & adjacent workflows" = Confluence 231246777 spec area of IS-CRM-FUNC-0289
 *
 * Summary: open the meeting's ticket - from the ticket the agent must reach the meeting report (as Odoo's Ticket Meetings button
 * does); then open the meeting from Meetings - its form must draw the stored Start, End, Bonus, Canceled and Feedback.
 * Command to run: npx playwright test tc-cust-100-b-support --grep "TC-CUST-100_B:" --project=chromium-headless
 *
 *  Source manual TC : written 2026-11-03 from Confluence 231246777 v9 (no CSV row) - Xray CRM-14116; master tab "Migration - Customer Support",
 *                     TC ID CRM-11859_TC-CUST-100_B; 2 steps
 *  Source version   : Confluence 231246777 v9 - re-check the master row and the Xray steps before trusting this spec
 *  Pre-conditions   : Role: L2 agent. A ticket with a recorded meeting report.
 *                     1. Logged in as L2 agent Nam Pham on the Support service
 *                     2. [INTERNAL check, Call API] the newest logged NK Meeting with feedback - its ticket and its stored report
 *  Steps to reproduce #1
 *    1. FF: open the meeting's ticket (All Tickets > the ticket); read what the ticket shows of its meetings
 *    2. FF: sidebar Meetings > open that meeting (NK Meeting form); read Start Date, End Date, Bonus Meeting, Canceled meeting,
 *       Feedback
 *  Verification - B expected
 *    1. From the ticket the agent reaches the meeting report: the ticket shows the meeting's report, or links to the meeting
 *       (a read-only meeting COUNT with no way to the report is a FAIL - "kept on the ticket, as today": in Odoo the ticket's
 *       Ticket Meetings button opens the reports). "Kept on the ticket" = the report can be opened from the ticket - confirmed
 *       by the tester 2026-11-04.
 *    2. The meeting form draws Start Date, End Date, Bonus Meeting, Canceled meeting and Feedback as stored.
 *
 * Evidence: Pre-condition end shot; verify shots Step 1 (the ticket's Meetings row) and Step 2 (the Meetings drawer); end of
 *           Steps to reproduce #1; afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true });

const TC = 'TC-CUST-100_B';

const STEP = {
  pre1: 'Pre-condition 1: Agent account - Support service (Frappe Helpdesk) /login as L2 agent Nam Pham; [INTERNAL check, Call API] HD Agent Support Level = L2',
  pre2: 'Pre-condition 2: [INTERNAL check, Call API] the newest logged NK Meeting with feedback - its ticket and its stored report',
  s1: "Step 1: FF: open the meeting's ticket (All Tickets > the ticket); read what the ticket shows of its meetings",
  s2: 'Step 2: FF: sidebar Meetings > open that meeting (NK Meeting form); read Start Date, End Date, Bonus Meeting, Canceled meeting, Feedback',
  verify: 'Verification',
} as const;

const AGENT = users.support_l2_nam_support_mig;
/** Text as a person reads it: HTML entities decoded, whitespace collapsed. */
const plain = (s: unknown): string => String(s ?? '').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
/** 'YYYY-MM-DD HH:mm:ss' as the Desk form draws it: 'DD-MM-YYYY HH:mm:ss' (same zone - FF stores and draws Asia/Ho_Chi_Minh). */
const deskDate = (s: string): string => { const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2}:\d{2})/); return m ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}` : s; };

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

test.describe(`${TC} - Meeting report on the ticket on the Support service`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version (REQUIREMENT #7) ---\n  - Source: Confluence 231246777 v9, IS-CRM-FUNC-0289-2 (no CSV row - nothing to fingerprint)');
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---\n  - Read-only case: nothing saved - nothing to clean up');
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: The support meeting report stays on the ticket - B: Frappe Helpdesk ticket and NK Meeting form`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    let report: Record<string, string> = {};

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${AGENT.username} on ${baseUrl_support_mig}`);
      try {
        await desk.login(baseUrl_support_mig, AGENT.username, AGENT.password);
        const agent = await desk.getMyAgentLevel(AGENT.username);
        console.log(`  [INTERNAL check, Call API] support level = ${agent.level || '(empty)'}`);
        expect(agent.level, 'the signed-in agent is an L2 agent').toBe('L2');
      } catch (e) {
        const reason = String((e as Error)?.message ?? e).split('\n')[0];
        console.log(`  SET-UP FAILED : ${reason}`);
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Pre-condition 1 - set-up failed', passed: false, lines: [`SET-UP FAILED - ${STEP.pre1}`, `  error: ${reason}`], corner: 'bottom-right' }).catch(() => {});
        throw e;
      }
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      report = await desk.findLoggedMeetingWithReport();
      console.log(`  - NK Meeting ${report.name} on ticket ${report.ticket}\n  - Start Date : ${report.log_start}\n  - End Date   : ${report.log_end}\n  - Bonus      : ${report.bonus_meeting}\n  - Canceled   : ${report.canceled_meeting}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-conditions - signed in, report read');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await desk.openTicketByLink(baseUrl_support_mig, report.ticket);
      const firstLine = plain(report.log_feedback).slice(0, 40);
      const seen = await desk.readTicketMeetingsShown(report.name, firstLine);
      console.log(`  - Side-panel Meetings : "${seen.panelValue}" (${seen.panelReadOnly ? 'read-only box' : 'editable'})\n  - Link to ${report.name} on the page : ${seen.linksToMeeting}\n  - Report text on the page : ${seen.reportShown}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 from the ticket the agent reaches the meeting report', expected: `the ticket shows the report of ${report.name}, or links to it`, actual: `Meetings = "${seen.panelValue}"${seen.panelReadOnly ? ' (read-only count)' : ''}; link to the meeting: ${seen.linksToMeeting ? 'yes' : 'no'}; report text drawn: ${seen.reportShown ? 'yes' : 'no'}`, passed: seen.linksToMeeting || seen.reportShown, difference: 'the ticket draws only a meeting count - no report and no link to it' },
      ], `${TC} - Step 1 ticket meetings`, [SupportDeskPageMig.PANEL_ROW], 'bottom-left');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await desk.openMeetingsList();
      const drawn = await desk.openMeetingAndReadFields(baseUrl_support_mig, report.name, ['log_start', 'log_end', 'bonus_meeting', 'canceled_meeting', 'log_feedback', 'ticket']);
      const want = { log_start: deskDate(report.log_start), log_end: deskDate(report.log_end), bonus_meeting: report.bonus_meeting === '1' ? 'Yes' : 'No', canceled_meeting: report.canceled_meeting === '1' ? 'Yes' : 'No', log_feedback: plain(report.log_feedback) };
      const got = { log_start: drawn.log_start, log_end: drawn.log_end, bonus_meeting: drawn.bonus_meeting, canceled_meeting: drawn.canceled_meeting, log_feedback: plain(drawn.log_feedback) };
      for (const k of Object.keys(want) as Array<keyof typeof want>) console.log(`  - ${k.padEnd(16)} : drawn "${got[k].slice(0, 70)}" | stored "${want[k].slice(0, 70)}"`);
      console.log(`  Observation (not scored) - the form's Ticket field : "${drawn.ticket}"`);
      const diff = (Object.keys(want) as Array<keyof typeof want>).filter((k) => (k === 'log_start' || k === 'log_end') ? !got[k].startsWith(want[k]) : got[k] !== want[k]);
      // the drawer is a frame: outline the report fields INSIDE it
      await desk.outlineInMeetingsFrame(['log_start', 'log_end', 'bonus_meeting', 'canceled_meeting', 'log_feedback'].map((f) => `.frappe-control[data-fieldname="${f}"]`), diff.length === 0);
      await recordChecks(page, testInfo, checks, [
        { what: `Step 2 NK Meeting ${report.name} draws its stored report`, expected: `start ${want.log_start} | end ${want.log_end} | bonus ${want.bonus_meeting} | canceled ${want.canceled_meeting} | feedback "${want.log_feedback.slice(0, 50)}..."`, actual: `start ${got.log_start} | end ${got.log_end} | bonus ${got.bonus_meeting} | canceled ${got.canceled_meeting} | feedback "${got.log_feedback.slice(0, 50)}..."`, passed: diff.length === 0, difference: diff.map((k) => `${k}: drawn '${got[k].slice(0, 40)}', stored '${want[k].slice(0, 40)}'`).join('; ') },
      ], `${TC} - Step 2 meeting form`, [SupportDeskPageMig.MEETINGS_FRAME], 'bottom-left');
      await desk.clearMeetingsFrameOutline();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 1 - meeting report read');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference ?? c.what}`).join(' | ')}` : 'OVERALL: PASS - the meeting report is reached from the ticket and drawn as stored');
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference ? `Difference: ${c.difference}` : `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(failed.map((c) => c.what), 'the meeting report is kept on the ticket').toEqual([]);
    });
  });
});
