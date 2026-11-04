import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ================================================================================================
 *  TC-CUST-100_A - The support meeting report stays on the ticket - side A: Odoo 12 pre-production (baseline "as today")
 * ================================================================================================
 * Test Case ID     : TC-CUST-100_A   (side B = tc-cust-100-b-support-meeting-report-on-ticket.spec.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-03
 * Jira             : CRM-14115 (Xray Test, created 2026-11-03; feature CRM-11859)
 * Requirement      : IS-CRM-FUNC-0289-2 (Confluence 231246777 v9, answer to CRM-13843): "The report an agent records on completing
 *                    a support meeting - its start and end time, whether it was a bonus or a cancelled meeting, the issue and the
 *                    solution - shall be kept on the ticket, as today." Today = the ticket's "Ticket Meetings" smart button,
 *                    which opens the meeting reports (gtm.info: Start Date, End Date, Bonus Meeting, Canceled meeting, Feedback -
 *                    the issue and the solution are written in Feedback).
 * Host / Run as    : pre-production Odoo 12 / L1 agent Giang Le (users.support_l1_giang_preprod, Support Team = l1 asserted)
 * Data             : READ ONLY - an existing meeting report picked at run time (the newest gtm.info on a ticket with feedback)
 * Folder           : "11. CRM context & adjacent workflows" = Confluence 231246777 spec area of IS-CRM-FUNC-0289
 *
 * Summary: open the ticket of the newest meeting report; its Ticket Meetings button shows the number of reports; the report it
 * opens draws Start, End, Bonus, Canceled and Feedback exactly as stored.
 * Command to run: npx playwright test tc-cust-100-a-preprod --grep "TC-CUST-100_A:" --project=chromium-headless
 *
 *  Source manual TC : written 2026-11-03 from Confluence 231246777 v9 (no CSV row) - Xray CRM-14115; master tab "Helpdesk module", TC ID
 *                     CRM-11859_TC-CUST-100_A; 2 steps
 *  Source version   : Confluence 231246777 v9 - re-check the master row and the Xray steps before trusting this spec
 *  Pre-conditions   : Role: L1 agent. A ticket with a recorded meeting report.
 *                     1. Logged in as L1 agent Giang Le on pre-production
 *                     2. [INTERNAL check, Call API] the newest meeting report (gtm.info) on a ticket that carries feedback
 *  Steps to reproduce #1
 *    1. Odoo: open the ticket of that report; read the "Ticket Meetings" smart button
 *    2. Odoo: click Ticket Meetings; open the first meeting report; read Start Date, End Date, Bonus Meeting, Canceled meeting,
 *       Feedback
 *  Verification - A expected (today)
 *    1. The button shows the number of meeting reports the ticket holds.
 *    2. The opened report draws Start / End (the stored UTC values in the browser's zone), Bonus / Canceled and Feedback exactly
 *       as stored for that report.
 *
 * Evidence: Pre-condition end shot; verify shots Step 1 (the smart button) and Step 2 (the report fields); end of Steps to
 *           reproduce #1; afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-CUST-100_A';

const STEP = {
  pre1: 'Pre-condition 1: Agent account - pre-production (Odoo 12 EE) as L1 agent Giang Le; [INTERNAL check, Call API] Support Team = l1',
  pre2: 'Pre-condition 2: [INTERNAL check, Call API] the newest meeting report (gtm.info) on a ticket that carries feedback',
  s1: 'Step 1: Odoo: open the ticket of that report; read the "Ticket Meetings" smart button',
  s2: 'Step 2: Odoo: click Ticket Meetings; open the first meeting report; read Start Date, End Date, Bonus Meeting, Canceled meeting, Feedback',
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_preprod;
const norm = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim();

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

test.describe(`${TC} - Meeting report on the ticket on Odoo 12 pre-production`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version (REQUIREMENT #7) ---\n  - Source: Confluence 231246777 v9, IS-CRM-FUNC-0289-2 (no CSV row - nothing to fingerprint)');
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---\n  - Read-only case: nothing to clean up');
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: The support meeting report stays on the ticket - A: Odoo 12 Ticket Meetings opens the report`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const hd = new HelpdeskPage(page);
    const checks: Check[] = [];
    let ticketId = 0;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${AGENT.username} on ${baseUrl}`);
      try {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await loginPage.navigateTo(baseUrl);
        await loginPage.login(AGENT.username, AGENT.password, CommonUtils.waitTimes.pageLoad);
        await loginPage.dismissLocationPermissionDialog();
        const me = await hd.getMyEmployeeSupportTeam();
        console.log(`  [INTERNAL check, Call API] support_team = ${me.supportTeam || '(empty)'}`);
        expect(me.supportTeam, 'the signed-in account is an L1 agent').toBe('l1');
      } catch (e) {
        const reason = String((e as Error)?.message ?? e).split('\n')[0];
        console.log(`  SET-UP FAILED : ${reason}`);
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Pre-condition 1 - set-up failed', passed: false, lines: [`SET-UP FAILED - ${STEP.pre1}`, `  error: ${reason}`], corner: 'bottom-right' }).catch(() => {});
        throw e;
      }
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      const r = await hd.findMeetingReportOverRpc();
      ticketId = (r.ticket_id as [number, string])[0];
      console.log(`  - Report #${r.id} on ticket #${ticketId} | start ${r.start_date} UTC | end ${r.end_date} UTC | bonus ${r.bonus_meeting} | canceled ${r.canceled_meeting}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-conditions - signed in, report read');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await hd.openTicketById(baseUrl, ticketId);
      const shown = await hd.getTicketMeetingsButtonCount();
      const stored = await hd.countMeetingReportsOverRpc(ticketId);
      console.log(`  - Ticket Meetings button : ${shown}\n  [INTERNAL check, Call API] gtm.info on the ticket = ${stored}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 the Ticket Meetings button shows the ticket\'s meeting reports', expected: `${stored} (the reports the ticket holds)`, actual: shown < 0 ? 'no Ticket Meetings button' : String(shown), passed: shown === stored && stored > 0, difference: shown < 0 ? 'the button is not drawn' : `expected ${stored}, got ${shown}` },
      ], `${TC} - Step 1 Ticket Meetings button`, [HelpdeskPage.MEETINGS_BUTTON], 'bottom-right');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await hd.openTicketMeetings();
      const id = await hd.openListRowAndGetId();
      const stored = await hd.readMeetingReportOverRpc(id, ['start_date', 'end_date', 'bonus_meeting', 'canceled_meeting', 'feedback']);
      const drawn = await hd.readFormFieldsByName(['start_date', 'end_date', 'feedback']);
      const boxes = await hd.readFormCheckboxes(['bonus_meeting', 'canceled_meeting']);
      const want = {
        start_date: stored.start_date ? await hd.formatUtcAsOdooDatetime(String(stored.start_date)) : '',
        end_date: stored.end_date ? await hd.formatUtcAsOdooDatetime(String(stored.end_date)) : '',
        bonus_meeting: stored.bonus_meeting ? 'Yes' : 'No',
        canceled_meeting: stored.canceled_meeting ? 'Yes' : 'No',
        feedback: norm(stored.feedback),
      };
      const got = { start_date: drawn.start_date, end_date: drawn.end_date, bonus_meeting: boxes.bonus_meeting, canceled_meeting: boxes.canceled_meeting, feedback: norm(drawn.feedback) };
      for (const k of Object.keys(want) as Array<keyof typeof want>) console.log(`  - ${k.padEnd(16)} : drawn "${got[k].slice(0, 80)}" | stored "${want[k].slice(0, 80)}"`);
      const diff = (Object.keys(want) as Array<keyof typeof want>).filter((k) => got[k] !== want[k]);
      await recordChecks(page, testInfo, checks, [
        { what: `Step 2 meeting report #${id} draws its stored Start, End, Bonus, Canceled and Feedback`, expected: `start ${want.start_date} | end ${want.end_date} | bonus ${want.bonus_meeting} | canceled ${want.canceled_meeting} | feedback "${want.feedback.slice(0, 60)}..."`, actual: `start ${got.start_date} | end ${got.end_date} | bonus ${got.bonus_meeting} | canceled ${got.canceled_meeting} | feedback "${got.feedback.slice(0, 60)}..."`, passed: diff.length === 0, difference: diff.map((k) => `${k}: drawn '${got[k].slice(0, 40)}', stored '${want[k].slice(0, 40)}'`).join('; ') },
      ], `${TC} - Step 2 meeting report`, [HelpdeskPage.FORM_FIELD], 'bottom-right');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 1 - meeting report read');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference ?? c.what}`).join(' | ')}` : 'OVERALL: PASS - the ticket opens its meeting report with the stored values');
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference ? `Difference: ${c.difference}` : `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(failed.map((c) => c.what), 'the meeting report is kept on the ticket').toEqual([]);
    });
  });
});
