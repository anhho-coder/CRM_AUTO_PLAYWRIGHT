import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl_support_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { SupportDeskPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { customerSupportBaselineDetails } from '@helpers/customer-support-mig.helper';
import { createSupportTicketAsAdmin, deleteSupportProbeAsAdmin, readTicketReviewStateAsAdmin } from '@helpers/support-desk-cleanup.helper';

/**
 * ================================================================================================
 *  TC-UI-112_B - Several ticket-list filters together (Open Tickets + Review needed) - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-UI-112_B   (side A = tc-ui-112-a-preprod-two-filters-together.spec.ts = baseline, map in
 *                    helpers/customer-support-mig.baseline-map.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-03 (reworked 2026-11-04: the spec's own pair Open + Review needed)
 * Jira             : CRM-14106 (Xray Test, created 2026-11-03; feature CRM-11859)
 * Requirement      : IS-CRM-UI-0014-1 (Confluence 231246777 v9, answer to CRM-13842) - "... several ticket-list filters together
 *                    (e.g. Open Tickets + Review needed), as today".
 * Review needed    : tester 2026-11-04 - find on pre-production what puts a ticket into Review needed and create that data here.
 *                    Pre-production (measured): approval rule 139 "L1 support review" holds every public message an L1 engineer
 *                    sends to the customer until ANOTHER L1 approves it; meanwhile the ticket is Review needed. FF: the entry
 *                    Review needed = NK-VIEW-REVIEW-NEEDED {"custom_review_needed": 1}; a held reply carries Approval Status
 *                    "Pending Approval".
 * Host / Run as    : support-crm-mig (Frappe Helpdesk, ignoreHTTPSErrors) / L1 agent Giang Le (users.support_l1_giang_support_mig,
 *                    HD Agent Support Level = L1 asserted) - the L1 whose message pre-production holds for review
 * Data             : per run ONE probe ticket created by Administrator (Subject = AUTO-CRM-11859-TC-UI-112_B-<runId>, Raised By =
 *                    qa.customer.ui112.<runId>@example.com); Giang's reply to it. FF mail goes to Mailpit (smtp mailpit:1025).
 *                    afterEach deletes the run's Communications / Email Queue rows, the ticket and the contact (deny-list).
 * Folder           : "18. User interface" = Confluence 231246777 spec area of IS-CRM-UI-0014-1
 *
 * Summary: an L1 reply to the customer must put the probe into Review needed; then Filters Open Tickets + Review needed must
 * stay ticked together and list the tickets that are open AND need review - the probe among them.
 * Command to run: npx playwright test tc-ui-112-b-support --grep "TC-UI-112_B:" --project=chromium-headless
 *
 *  Source manual TC : written 2026-11-03 from Confluence 231246777 v9 (no CSV row), reworked 2026-11-04 - Xray CRM-14106; master tab
 *                     "Migration - Customer Support", TC ID CRM-11859_TC-UI-112_B; 3 steps
 *  Source version   : Confluence 231246777 v9 - re-check the master row and the Xray steps before trusting this spec
 *  Pre-conditions   : Role: L1 agent. A probe ticket of this run.
 *                     1. Logged in as L1 agent Giang Le on the Support service
 *                     2. [INTERNAL setup, Call API] as Administrator: HD Ticket Subject = AUTO-CRM-11859-TC-UI-112_B-<runId>,
 *                        Raised By = qa.customer.ui112.<runId>@example.com
 *  Steps to reproduce #1
 *    1. FF: open the probe ticket; Reply to the customer, Stage = On Customer; Send
 *    2. FF: All Tickets > 'Filters' > Open Tickets
 *    3. FF: 'Filters' > Review needed (Open Tickets is not cleared first); read the ticked entries, the ticket count and
 *       whether the probe is listed
 *  Verification - B expected
 *    1. The reply is held for another L1's review (Approval Status = Pending Approval) and the ticket is Review needed
 *       (custom_review_needed = 1) - as on pre-production (rule 139). A reply sent at once is a FAIL.
 *    2. Only Open Tickets is ticked; the counter equals get_count of the Open Tickets view filters.
 *    3. Open Tickets AND Review needed are both ticked; the counter equals get_count of BOTH views' filters together; the probe
 *       is listed.
 *
 * Evidence: Pre-condition end shot; verify shots Steps 1-3; end of Steps to reproduce #1; afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true });

const TC = 'TC-UI-112_B';

const STEP = {
  pre1: 'Pre-condition 1: Agent account - Support service (Frappe Helpdesk) /login as L1 agent Giang Le; [INTERNAL check, Call API] HD Agent Support Level = L1',
  pre2: 'Pre-condition 2: [INTERNAL setup, Call API] as Administrator: probe HD Ticket Subject = AUTO-CRM-11859-TC-UI-112_B-<runId>, Raised By = qa.customer.ui112.<runId>@example.com',
  s1: 'Step 1: FF: open the probe ticket; Reply to the customer, Stage = On Customer; Send',
  s2: "Step 2: FF: All Tickets > 'Filters' > Open Tickets",
  s3: "Step 3: FF: 'Filters' > Review needed (Open Tickets is not cleared first); read the ticked entries, the ticket count and whether the probe is listed",
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_support_mig;
const ADMIN = users.admin_support_mig;
const FIRST = { label: 'Open Tickets', view: 'NK-VIEW-OPEN-TICKETS' };
const SECOND = { label: 'Review needed', view: 'NK-VIEW-REVIEW-NEEDED' };
/** The list never shows archived tickets (own "Archived" entry) - measured 2026-11-03: get_count was 1 above the counter. */
const NOT_ARCHIVED = ['custom_archived', '!=', 1];
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const SUBJECT = `AUTO-CRM-11859-TC-UI-112_B-${RUN}`;
const RAISED_BY = `qa.customer.ui112.${RUN}@example.com`;
const probe = { ticket: '', since: '' };

/** `difference` = REQUIREMENT #4c conclusion, printed on a FAIL only. */
type Check = { what: string; expected: string; actual: string; passed: boolean; difference?: string };
/** REQUIREMENT #4c - the FAIL conclusion of an ordered-list check, built from the asserted values. */
function listDifference(expected: string[], actual: string[]): string {
  const parts: string[] = [];
  const extra = actual.filter((e) => !expected.includes(e));
  const missing = expected.filter((e) => !actual.includes(e));
  if (actual.length !== expected.length) parts.push(`count ${actual.length}, expected ${expected.length} (${actual.length > expected.length ? '+' : ''}${actual.length - expected.length})`);
  if (extra.length) parts.push(`not expected but shown: ${extra.map((e) => `'${e}'`).join(', ')}`);
  if (missing.length) parts.push(`expected but missing: ${missing.map((e) => `'${e}'`).join(', ')}`);
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
/** A preset view's filters as the list applies them for the signed-in user: '@me' = that user's login. */
const viewFilters = (f: unknown[][]): unknown[][] => JSON.parse(JSON.stringify(f).replace(/@me/g, AGENT.username));
const countCheck = (what: string, expectedN: number, counter: { total: number; text: string }, meaning: string): Check => ({
  what, expected: `counter total = ${expectedN} (${meaning})`, actual: `"${counter.text}" -> ${counter.total}`, passed: counter.total === expectedN,
  difference: `expected ${expectedN}, got ${counter.total} (${counter.total - expectedN >= 0 ? '+' : ''}${counter.total - expectedN})`,
});

test.describe(`${TC} - Several ticket-list filters together on the Support service`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version (REQUIREMENT #7) ---\n  - Source: Confluence 231246777 v9, IS-CRM-UI-0014-1 (no CSV row - nothing to fingerprint)');
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach: delete this run\'s probe (deny-list: captured ticket number + run subject + rows since its creation) ---');
    const lines = await deleteSupportProbeAsAdmin(baseUrl_support_mig, ADMIN, { ticketName: probe.ticket || undefined, subject: SUBJECT, contactEmail: RAISED_BY, since: probe.since || undefined })
      .catch((e) => [`TEARDOWN FAILED: ${String(e).slice(0, 300)}`]);
    for (const l of lines) console.log(`  - ${l}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Several ticket-list filters together - B: an L1 reply puts the ticket into Review needed, and Open Tickets + Review needed stay active together`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
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
      try {
        const t = await createSupportTicketAsAdmin(baseUrl_support_mig, ADMIN, { subject: SUBJECT, raisedBy: RAISED_BY, description: '<p>Automated probe for CRM-11859 TC-UI-112_B (Review needed). Not a real customer.</p>' });
        Object.assign(probe, { ticket: t.name, since: t.creation });
        console.log(`  - Probe ticket ${t.name} "${SUBJECT}" created ${t.creation} (Raised By ${RAISED_BY})`);
        expect(t.name, 'the probe ticket was created').toMatch(/^\d+$/);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-conditions - signed in, probe ticket created');
      } catch (e) {
        const reason = String((e as Error)?.message ?? e).split('\n')[0];
        console.log(`  SET-UP FAILED : ${reason}`);
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Pre-condition 2 - set-up failed', passed: false, lines: [`SET-UP FAILED - ${STEP.pre2}`, `  error: ${reason}`], corner: 'bottom-right' }).catch(() => {});
        throw e;
      }
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await desk.openTicketByLink(baseUrl_support_mig, probe.ticket);
      const refusal = await desk.replyToCustomer(`Hello, this is an automated probe reply ${RUN} (CRM-11859 TC-UI-112_B). Not a real customer.`, 'On Customer');
      // an agent's REST read of Communication comes back empty - the stored reply is read as Administrator (read only)
      const st = await readTicketReviewStateAsAdmin(baseUrl_support_mig, ADMIN, probe.ticket, probe.since);
      const reply = st.replies[0];
      console.log(`  [INTERNAL check, Call API] ticket ${probe.ticket}: custom_review_needed = ${st.reviewNeeded}, review for "${st.reviewAuthor}"; replies sent since the probe: ${JSON.stringify(st.replies)}`);
      const held = !!reply && reply.approval === 'Pending Approval' && st.reviewNeeded === 1;
      // the reply's card as the conversation draws it: its sender line (the body itself is drawn inside a frame)
      await desk.markVisibleMessage(AGENT.username).catch(() => false);
      const toast = await desk.readVisibleMessage('Cannot read').catch(() => '');
      if (toast) console.log(`  Observation (not scored) - a toast showed after Send: "${toast}"`);
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 1 the L1 reply is held for review and the ticket is Review needed',
          expected: 'reply Approval Status = Pending Approval; ticket custom_review_needed = 1 (pre-production rule 139 holds an L1 message until another L1 approves it)',
          actual: `${refusal ? `composer refused: "${refusal.slice(0, 80)}"; ` : ''}reply ${reply ? reply.name : '(not stored)'} Approval Status = "${reply ? reply.approval || '(empty)' : '-'}"; custom_review_needed = ${st.reviewNeeded}`,
          passed: held,
          difference: reply ? 'the reply was sent at once - nothing held it for another L1, so the ticket never entered Review needed' : 'no reply was stored',
        },
      ], `${TC} - Step 1 reply held for review`, [SupportDeskPageMig.MESSAGE], 'top-right');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await desk.openAllTicketsFromSidebar();
      await desk.chooseFiltersMenuEntry(FIRST.label);
      const filters = [...viewFilters(await desk.readHdViewFilterList(FIRST.view)), NOT_ARCHIVED];
      const expectedN = await desk.countTicketsOverRest(filters);
      const counter = await desk.getListCounter();
      const ticked = await desk.getActiveFilterViews();
      console.log(`  [INTERNAL check, Call API] ${FIRST.view} filters ${JSON.stringify(filters)} -> get_count ${expectedN}`);
      console.log(`  - Views in the URL : ${JSON.stringify(ticked)}`);
      await desk.markListCounter();
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 the active preset view', expected: FIRST.view, actual: ticked.join(', ') || '(none)', passed: JSON.stringify(ticked) === JSON.stringify([FIRST.view]), difference: listDifference([FIRST.view], ticked) },
        countCheck('Step 2 the list holds the open tickets', expectedN, counter, `get_count of ${FIRST.label}`),
      ], `${TC} - Step 2 Open Tickets`, [SupportDeskPageMig.LIST_COUNTER], 'top-right');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await desk.chooseFiltersMenuEntry(SECOND.label);
      const ticked = await desk.getTickedFiltersMenuEntries();
      console.log(`  - Ticked entries : ${JSON.stringify(ticked)}`);
      const wantTicked = [FIRST.label, SECOND.label];
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 both Filters entries are ticked', expected: wantTicked.join(', '), actual: ticked.join(', ') || '(none)', passed: wantTicked.every((t) => ticked.includes(t)) && ticked.length === wantTicked.length, difference: listDifference(wantTicked, ticked) },
      ], `${TC} - Step 3 Filters menu`, [SupportDeskPageMig.MENU], 'top-right');
      await desk.closeOpenMenu();
      const both = [...viewFilters(await desk.readHdViewFilterList(FIRST.view)), ...viewFilters(await desk.readHdViewFilterList(SECOND.view)), NOT_ARCHIVED];
      const expectedN = await desk.countTicketsOverRest(both);
      const secondOnly = await desk.countTicketsOverRest([...viewFilters(await desk.readHdViewFilterList(SECOND.view)), NOT_ARCHIVED]);
      // an empty list draws "No tickets found" and no counter - that is a total of 0
      let counter = await desk.getListCounter().catch(() => ({ shown: 0, total: -1, text: '' }));
      if (counter.total < 0 && (await desk.getListTicketNamesOrNone(1).catch(() => ['?'])).length === 0) counter = { shown: 0, total: 0, text: 'No tickets found' };
      const views = await desk.getActiveFilterViews();
      const listed = await desk.revealListRow(probe.ticket, SUBJECT).catch(() => false);
      console.log(`  [INTERNAL check, Call API] both views' filters ${JSON.stringify(both)} -> get_count ${expectedN}`);
      console.log(`  Observation (not scored) - ${SECOND.label} alone -> get_count ${secondOnly}`);
      console.log(`  - Views in the URL : ${JSON.stringify(views)}; probe ${probe.ticket} listed = ${listed}`);
      await desk.markListResult(SUBJECT); // the probe's row, else the "No tickets found" message (clears older tags - counter after)
      await desk.markListCounter();
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 both preset views are active', expected: `${FIRST.view}, ${SECOND.view}`, actual: views.join(', ') || '(none)', passed: [FIRST.view, SECOND.view].every((v) => views.includes(v)), difference: listDifference([FIRST.view, SECOND.view], views) },
        countCheck('Step 3 the list holds the tickets that are open AND need review', expectedN, counter, `get_count of ${FIRST.label} + ${SECOND.label}; ${SECOND.label} alone = ${secondOnly}`),
        { what: 'Step 3 the probe ticket is listed', expected: `ticket ${probe.ticket} "${SUBJECT}" listed`, actual: listed ? 'listed' : 'not listed', passed: listed, difference: `ticket ${probe.ticket} is not in the list (it never entered Review needed - Step 1)` },
      ], `${TC} - Step 3 list`, counter.total > 0 ? [SupportDeskPageMig.LIST_COUNTER, SupportDeskPageMig.LIST_HIT] : [SupportDeskPageMig.LIST_HIT], 'top-right');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 1 - two Filters entries chosen');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference ?? c.what}`).join(' | ')}` : 'OVERALL: PASS - the L1 reply put the ticket into Review needed and Open Tickets + Review needed list it together');
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference ? `Difference: ${c.difference}` : `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(failed.map((c) => c.what), 'Review needed and two Filters entries work together').toEqual([]);
    });
  });
});
