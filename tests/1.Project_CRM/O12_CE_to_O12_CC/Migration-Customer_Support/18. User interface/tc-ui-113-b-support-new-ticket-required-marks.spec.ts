import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl_support_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { SupportDeskPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { customerSupportBaselineDetails } from '@helpers/customer-support-mig.helper';

/**
 * ================================================================================================
 *  TC-UI-113_B - New Ticket form marks the required fields - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-UI-113_B   (side A = tc-ui-113-a-preprod-new-ticket-required-marks.spec.ts = baseline, map in
 *                    helpers/customer-support-mig.baseline-map.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-03
 * Jira             : CRM-14108 (Xray Test, created 2026-11-03; feature CRM-11859)
 * Requirement      : IS-CRM-UI-0016 (Confluence 231246777 v9, answer to CRM-13845): "The New Ticket form shall mark each field
 *                    required by IS-CRM-FUNC-0383 as required before the agent submits it." IS-CRM-FUNC-0383: "An agent creating
 *                    a ticket by hand shall provide the Subject and either the requester's e-mail address or a contact; the
 *                    description shall be optional, as today."
 * Host / Run as    : support-crm-mig (Frappe Helpdesk, ignoreHTTPSErrors) / L1 agent Giang Le (users.support_l1_giang_support_mig,
 *                    HD Agent Support Level = L1 asserted)
 * Data             : READ ONLY - the New Ticket form is opened and left without typing or submitting anything
 * Folder           : "18. User interface" = Confluence 231246777 spec area of IS-CRM-UI-0016
 *
 * Summary: All Tickets > Create; before anything is typed, the form must mark exactly Subject, Raised By (Email) and Contact with
 * the red required mark - the fields IS-CRM-FUNC-0383 requires - and no other field.
 * Command to run: npx playwright test tc-ui-113-b-support --grep "TC-UI-113_B:" --project=chromium-headless
 *
 *  Source manual TC : written 2026-11-03 from Confluence 231246777 v9 (no CSV row) - Xray CRM-14108; master tab "Migration - Customer Support",
 *                     TC ID CRM-11859_TC-UI-113_B; 1 step
 *  Source version   : Confluence 231246777 v9 - re-check the master row and the Xray steps before trusting this spec
 *  Pre-conditions   : Role: L1 agent. Agent account.
 *                     1. Logged in as L1 agent Giang Le on the Support service
 *  Steps to reproduce #1
 *    1. FF: All Tickets > Create (the New Ticket form): read which field labels carry the red required mark '*' - nothing is
 *       typed or submitted
 *  Verification - B expected
 *    1. Exactly three labels carry the red '*', in screen order: Subject, Raised By (Email), Contact (FUNC-0383: Subject + an
 *       e-mail OR a contact; marking only Subject is a FAIL - the agent learns about the e-mail / contact rule only from the
 *       refusal after Submit). The description carries no label and is optional, so it is not marked.
 *
 * Evidence: Pre-condition 1 end shot; Step 1 verify shot (the three field rows outlined); end of Steps to reproduce #1;
 *           afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true });

const TC = 'TC-UI-113_B';

const STEP = {
  pre1: 'Pre-condition 1: Agent account - Support service (Frappe Helpdesk) /login as L1 agent Giang Le; [INTERNAL check, Call API] HD Agent Support Level = L1',
  s1: "Step 1: FF: All Tickets > Create (the New Ticket form): read which field labels carry the red required mark '*' - nothing is typed or submitted",
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_support_mig;
const EXPECTED_MARKED = ['Subject', 'Raised By (Email)', 'Contact'];

/** `difference` = REQUIREMENT #4c conclusion, printed on a FAIL only. */
type Check = { what: string; expected: string; actual: string; passed: boolean; difference?: string };
function listDifference(expected: string[], actual: string[]): string {
  const parts: string[] = [];
  const extra = actual.filter((e) => !expected.includes(e));
  const missing = expected.filter((e) => !actual.includes(e));
  if (actual.length !== expected.length) parts.push(`count ${actual.length}, expected ${expected.length} (${actual.length > expected.length ? '+' : ''}${actual.length - expected.length})`);
  if (extra.length) parts.push(`marked but not expected: ${extra.map((e) => `'${e}'`).join(', ')}`);
  if (missing.length) parts.push(`expected but NOT marked: ${missing.map((e) => `'${e}'`).join(', ')}`);
  const shared = actual.filter((e) => expected.includes(e));
  const want = expected.filter((e) => actual.includes(e));
  const k = shared.findIndex((e, i) => e !== want[i]);
  if (k >= 0) parts.push(`order differs from '${want[k]}'`);
  return parts.join('; ') || 'none';
}
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

test.describe(`${TC} - New Ticket form marks the required fields on the Support service`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version (REQUIREMENT #7) ---\n  - Source: Confluence 231246777 v9, IS-CRM-UI-0016 + IS-CRM-FUNC-0383 (no CSV row - nothing to fingerprint)');
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---\n  - Read-only case: the form was never submitted - nothing to clean up');
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: New Ticket form marks the required fields - B: Frappe Helpdesk marks Subject, Raised By (Email) and Contact before Submit`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${AGENT.username} on ${baseUrl_support_mig}`);
      try {
        await desk.login(baseUrl_support_mig, AGENT.username, AGENT.password);
        const agent = await desk.getMyAgentLevel(AGENT.username);
        console.log(`  [INTERNAL check, Call API] support level = ${agent.level || '(empty)'}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Giang Le');
        expect(agent.level, 'the signed-in agent is an L1 agent').toBe('L1');
      } catch (e) {
        const reason = String((e as Error)?.message ?? e).split('\n')[0];
        console.log(`  SET-UP FAILED : ${reason}`);
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Pre-condition 1 - set-up failed', passed: false, lines: [`SET-UP FAILED - ${STEP.pre1}`, `  error: ${reason}`], corner: 'bottom-right' }).catch(() => {});
        throw e;
      }
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await desk.openAllTicketsFromSidebar();
      await desk.openNewTicketForm();
      const marks = await desk.getNewTicketFieldMarks(EXPECTED_MARKED);
      for (const m of marks) console.log(`  - ${m.label.padEnd(22)} : ${m.required ? "marked '*'" : 'not marked'}`);
      const marked = marks.filter((m) => m.required).map((m) => m.label);
      await recordChecks(page, testInfo, checks, [
        { what: "Step 1 the fields carrying the red required mark '*'", expected: `exactly ${EXPECTED_MARKED.join(', ')} (in screen order)`, actual: marked.join(', ') || '(none)', passed: JSON.stringify(marked) === JSON.stringify(EXPECTED_MARKED), difference: listDifference(EXPECTED_MARKED, marked) },
      ], `${TC} - Step 1 required marks`, [SupportDeskPageMig.REQ_ROW], 'bottom-left');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 1 - New Ticket form read');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference ?? c.what}`).join(' | ')}` : 'OVERALL: PASS - Subject, Raised By (Email) and Contact are marked required before Submit');
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference ? `Difference: ${c.difference}` : `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(failed.map((c) => c.what), 'the required fields are marked').toEqual([]);
    });
  });
});
