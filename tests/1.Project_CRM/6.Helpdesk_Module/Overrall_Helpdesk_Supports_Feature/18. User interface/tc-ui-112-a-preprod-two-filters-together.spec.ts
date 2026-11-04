import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ================================================================================================
 *  TC-UI-112_A - Several ticket-list filters together (Open Tickets + Review needed) - side A: Odoo 12 pre-production
 *                (baseline "as today")
 * ================================================================================================
 * Test Case ID     : TC-UI-112_A   (side B = tc-ui-112-b-support-two-filters-together.spec.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-03 (reworked 2026-11-04: the spec's own pair Open + Review needed)
 * Jira             : CRM-14105 (Xray Test, created 2026-11-03; feature CRM-11859)
 * Requirement      : IS-CRM-UI-0014-1 (Confluence 231246777 v9, answer to CRM-13842) - "... several ticket-list filters together
 *                    (e.g. Open Tickets + Review needed), as today"; this side records the "today" the requirement refers to.
 * Review needed    : Filters > Review needed = [('review_needed','=',True)] (view 3247, module nakivo_message_approval). Approval rule
 *                    139 "L1 support review" (measured 2026-11-04): every public message an L1 engineer sends to the customer is
 *                    held until ANOTHER L1 approves it - meanwhile the ticket is Review needed. The composer requires a Stage.
 * Host / Run as    : pre-production Odoo 12 / L1 agent Giang Le (users.support_l1_giang_preprod, Support Team = l1 asserted)
 * Data             : per run ONE probe ticket (Subject = AUTO-CRM-11859-TC-UI-112_A-<runId>) and Giang's message on it (pre-production
 *                    sends no e-mail). afterEach deletes the held approval and archives the ticket. Toggle SKIP_CLEANUP_UI112A.
 * Folder           : "18. User interface" = Confluence 231246777 spec area of IS-CRM-UI-0014-1
 *
 * Summary: Giang's message to the customer is held for review and the probe enters Review needed; Filters Open Tickets + Review
 * needed stay active together and the pager equals search_count of both domains, the probe listed.
 * Command to run: npx playwright test tc-ui-112-a-preprod --grep "TC-UI-112_A:" --project=chromium-headless
 *
 *  Source manual TC : written 2026-11-03 from Confluence 231246777 v9 (no CSV row), reworked 2026-11-04 - Xray CRM-14105; master tab
 *                     "Helpdesk module", TC ID CRM-11859_TC-UI-112_A; 3 steps
 *  Source version   : Confluence 231246777 v9 - re-check the master row and the Xray steps before trusting this spec
 *  Pre-conditions   : Role: L1 agent. A probe ticket of this run.
 *                     1. Logged in as L1 agent Giang Le on pre-production
 *                     2. Helpdesk > All Tickets > CREATE: Subject = AUTO-CRM-11859-TC-UI-112_A-<runId>; SAVE
 *  Steps to reproduce #1
 *    1. Odoo: on the probe ticket: Send message to the customer, Stage = On Customer; SEND
 *    2. Odoo: Helpdesk > All Tickets; remove the search facets; Filters > Open Tickets
 *    3. Odoo: Filters > Review needed (Open Tickets is not cleared first); read the search facets, the pager total and whether
 *       the probe is listed
 *  Verification - A expected
 *    1. The message is held for another L1's review (shown with Approve / Reject) and the ticket is Review needed.
 *    2. One facet "Open Tickets"; the pager total equals search_count of the Open Tickets domain.
 *    3. Facets "Open Tickets" and "Review needed" together; the pager total equals search_count of BOTH domains (Odoo ANDs
 *       filters of different groups); the probe is listed.
 *  Filter domains (read 2026-11-03/04): Open Tickets = [('stage_id.is_close','=',False)], Review needed = [('review_needed','=',True)].
 *  Own default: Giang's own default saved search on All Tickets ("All Tickets222") is applied again by Odoo when a filter is
 *  chosen after the facets were removed (measured 2026-11-04) - it is expected among the facets and its domain is part of the
 *  expected counts; any OTHER extra facet is a FAIL.
 *
 * Evidence: Pre-condition end shot; verify shots Steps 1-3; end of Steps to reproduce #1; afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-UI-112_A';
const SKIP_CLEANUP_UI112A = false;

const STEP = {
  pre1: 'Pre-condition 1: Agent account - pre-production (Odoo 12 EE) as L1 agent Giang Le; [INTERNAL check, Call API] Support Team = l1',
  pre2: 'Pre-condition 2: Helpdesk > All Tickets > CREATE: Subject = AUTO-CRM-11859-TC-UI-112_A-<runId>; SAVE',
  s1: 'Step 1: Odoo: on the probe ticket: Send message to the customer, Stage = On Customer; SEND',
  s2: 'Step 2: Odoo: Helpdesk > All Tickets; remove the search facets; Filters > Open Tickets',
  s3: 'Step 3: Odoo: Filters > Review needed (Open Tickets is not cleared first); read the search facets, the pager total and whether the probe is listed',
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_preprod;
const OPEN = { label: 'Open Tickets', domain: [['stage_id.is_close', '=', false]] };
const REVIEW = { label: 'Review needed', domain: [['review_needed', '=', true]] };
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const SUBJECT = `AUTO-CRM-11859-TC-UI-112_A-${RUN}`;
const EVIDENCE = [HelpdeskPage.SEARCH_FACETS, '.o_pager_counter'];
let probeId = '';
/** The agent's own default saved search when Odoo re-applies it, and its domain (part of every expected count). */
const own = { facet: '', domain: [] as unknown[] };

/** `difference` = REQUIREMENT #4c conclusion, printed on a FAIL only. */
type Check = { what: string; expected: string; actual: string; passed: boolean; difference?: string };
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
const countCheck = (what: string, expectedN: number, total: number, meaning: string): Check => ({
  what, expected: `pager total = ${expectedN} (${meaning})`, actual: String(total), passed: total === expectedN,
  difference: `expected ${expectedN}, got ${total} (${total - expectedN >= 0 ? '+' : ''}${total - expectedN})`,
});

test.describe(`${TC} - Several ticket-list filters together on Odoo 12 pre-production`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version (REQUIREMENT #7) ---\n  - Source: Confluence 231246777 v9, IS-CRM-UI-0014-1 (no CSV row - nothing to fingerprint)');
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach: the probe\'s held approval deleted, the probe archived ---');
    if (SKIP_CLEANUP_UI112A || !probeId) {
      console.log(`  - skipped (${SKIP_CLEANUP_UI112A ? 'SKIP_CLEANUP_UI112A' : 'no probe created'})`);
    } else {
      const hd = new HelpdeskPage(page);
      try {
        const appr = await hd.readTicketApprovalsOverRpc(probeId);
        const left = await hd.deleteTicketApprovalsOverRpc(appr.map((a) => a.id));
        console.log(`  - approvals on #${probeId}: ${JSON.stringify(appr.map((a) => a.id))} deleted, ${left} left`);
      } catch (e) { console.log(`  - approvals NOT deleted: ${String(e).split('\n')[0]}`); }
      console.log(`  - probe #${probeId} archived = ${await hd.archiveTicketByIdOverRpc(probeId, SUBJECT).catch((e) => `FAILED ${String(e).split('\n')[0]}`)}`);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Several ticket-list filters together - A: an L1 message puts the ticket into Review needed, and Open Tickets + Review needed stay active together`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const hd = new HelpdeskPage(page);
    const checks: Check[] = [];

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
      try {
        probeId = await hd.createTicket(baseUrl, SUBJECT);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-conditions - probe ticket created');
      } catch (e) {
        const reason = String((e as Error)?.message ?? e).split('\n')[0];
        console.log(`  SET-UP FAILED : ${reason}`);
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Pre-condition 2 - set-up failed', passed: false, lines: [`SET-UP FAILED - ${STEP.pre2}`, `  error: ${reason}`], corner: 'bottom-right' }).catch(() => {});
        throw e;
      }
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await hd.openTicketById(baseUrl, probeId);
      await hd.sendMessageWithStage(`Hello, this is an automated probe message ${RUN} (CRM-11859 TC-UI-112_A). Not a real customer.`, 'On Customer');
      const shown = await hd.markNewestChatterMessage();
      const t = await hd.readTicketOverRpc(probeId, ['review_needed', 'stage_id']);
      const appr = await hd.readTicketApprovalsOverRpc(probeId);
      console.log(`  [INTERNAL check, Call API] #${probeId}: review_needed = ${t.review_needed}; stage = ${JSON.stringify(t.stage_id)}; approvals ${JSON.stringify(appr)}`);
      const heldOnScreen = /Approve/.test(shown) && /Reject/.test(shown);
      await recordChecks(page, testInfo, checks, [{
        what: 'Step 1 the L1 message is held for review and the ticket is Review needed',
        expected: 'the message shows Approve / Reject; review_needed = true; an approval waits on other L1s',
        actual: `message "${shown.slice(0, 90)}"; review_needed = ${t.review_needed}; approvals waiting on ${appr.map((a) => a.waitingOn).join('/') || 'none'}`,
        passed: heldOnScreen && t.review_needed === true && appr.some((a) => a.waitingOn > 0),
        difference: 'the message was not held for another L1, so the ticket is not Review needed',
      }], `${TC} - Step 1 message held for review`, [HelpdeskPage.CHATTER_MESSAGE], 'top-left');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      // the probe's form was opened by its URL, so no app menu bar is drawn: open the All Tickets menu's own action
      await hd.openAllTicketsListDirect(baseUrl);
      // a default favorite can be applied after the list draws - clear, then clear again once it has settled
      await hd.clearSearchFacets();
      await hd.clearSearchFacets();
      await hd.chooseSearchFilter(OPEN.label);
      const facets = await hd.getSearchFacets();
      const total = await hd.getPagerTotal();
      const defaults = await hd.readAllTicketsDefaults();
      if (defaults.myDefaultFavorite && facets.includes(defaults.myDefaultFavorite)) {
        own.facet = defaults.myDefaultFavorite;
        own.domain = await hd.readSavedFilterDomain(own.facet);
        console.log(`  - Odoo applied my own default saved search "${own.facet}" again (domain ${JSON.stringify(own.domain)}) - expected among the facets and in the counts`);
      }
      const expectedN = await hd.countTicketsOverRpc([...OPEN.domain, ...own.domain]);
      console.log(`  [INTERNAL check, Call API] search_count ${JSON.stringify([...OPEN.domain, ...own.domain])} = ${expectedN}`);
      const want = [...(own.facet ? [own.facet] : []), OPEN.label];
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 the search facets', expected: want.join(', '), actual: facets.join(', ') || '(none)', passed: JSON.stringify(facets) === JSON.stringify(want), difference: listDifference(want, facets) },
        countCheck('Step 2 the list holds the open tickets', expectedN, total, `search_count of ${want.join(' + ')}`),
      ], `${TC} - Step 2 Open Tickets`, EVIDENCE, 'bottom-right');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await hd.chooseSearchFilter(REVIEW.label);
      const facets = await hd.getSearchFacets();
      const total = await hd.getPagerTotal();
      const both = [...OPEN.domain, ...REVIEW.domain, ...own.domain];
      const expectedN = await hd.countTicketsOverRpc(both);
      const reviewOnly = await hd.countTicketsOverRpc([...REVIEW.domain, ...own.domain]);
      const listed = await hd.countListRowsContaining(SUBJECT);
      console.log(`  [INTERNAL check, Call API] search_count ${JSON.stringify(both)} = ${expectedN}`);
      console.log(`  Observation (not scored) - ${REVIEW.label} alone -> search_count ${reviewOnly}`);
      const want = [...(own.facet ? [own.facet] : []), OPEN.label, REVIEW.label];
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 both filters are active facets', expected: want.join(', '), actual: facets.join(', ') || '(none)', passed: want.every((w) => facets.includes(w)) && facets.length === want.length, difference: listDifference(want, facets) },
        countCheck('Step 3 the list holds the tickets that are open AND need review', expectedN, total, `search_count of both domains; ${REVIEW.label} alone = ${reviewOnly}`),
        { what: 'Step 3 the probe ticket is listed', expected: `#${probeId} "${SUBJECT}" listed once`, actual: `${listed} row(s)`, passed: listed === 1, difference: `the probe shows in ${listed} rows` },
      ], `${TC} - Step 3 two filters`, EVIDENCE, 'bottom-right');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 1 - two filters chosen');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference ?? c.what}`).join(' | ')}` : 'OVERALL: PASS - the L1 message put the ticket into Review needed and Open Tickets + Review needed list it together');
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference ? `Difference: ${c.difference}` : `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(failed.map((c) => c.what), 'Review needed and two filters work together').toEqual([]);
    });
  });
});
