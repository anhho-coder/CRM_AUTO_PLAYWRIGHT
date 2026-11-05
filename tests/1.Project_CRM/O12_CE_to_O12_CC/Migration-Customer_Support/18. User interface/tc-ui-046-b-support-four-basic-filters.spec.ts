import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl_support_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { SupportDeskPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_B, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';
import { customerSupportBaselineDetails } from '@helpers/customer-support-mig.helper';
import { createSupportTicketAsAdmin, updateSupportTicketAsAdmin, assignSupportTicketAsAdmin, deleteSupportProbeAsAdmin } from '@helpers/support-desk-cleanup.helper';

/**
 * ================================================================================================
 *  TC-UI-046_B - My Tickets, Unassigned, Open and Closed filters - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-UI-046_B   (side A = tc-ui-046-a-preprod-four-basic-filters.spec.ts = reference, map in
 *                    helpers/customer-support-mig.baseline-map.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-04
 * Jira             : CRM-14027 (Xray Test, feature CRM-11859)
 * Host / Run as    : support-crm-mig (Frappe Helpdesk, ignoreHTTPSErrors) / L1 agent Giang Le (users.support_l1_giang_support_mig,
 *                    HD Agent Support Level = L1 asserted)
 * Data             : 3 probe tickets of this run, created and deleted as Administrator (deny-list: the numbers captured at
 *                    creation + their run-made ToDo / notification rows). The Filters entries are preset views - they do not
 *                    change Giang's own saved list state (measured 2026-10-28)
 * Folder           : "18. User interface" (master divider)
 *
 * Summary: each of the Filters entries My Tickets, Unassigned Tickets, Open Tickets, Closed Tickets must list only rows of its
 * rule (assignee = me / none / not Closed / Closed), its counter must equal the rule's count, and each probe must land in the
 * right lists.
 *
 * Command to run: npx playwright test tc-ui-046-b-support --grep "TC-UI-046_B:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 265 = row TC-UI-046; Comparison = same. Xray CRM-14027: 1 step
 *  Source version   : fingerprint e65290e3879c9d9e of Preconditions + Steps + B expected + Test data (beforeEach)
 *  Pre-conditions (master, verbatim)
 *    Role: L1 agent. QA probe tickets created for this run in both systems: Subject = 'QA-UI probe <n>', Requester =
 *    qa.ui<n>@example.com, Customer = 'ACME Test Ltd' when it exists. Archive or delete them after the run. One probe assigned
 *    to you, one unassigned, one closed.
 *    1. Logged in as L1 agent Giang Le on the Support service
 *    2. [INTERNAL setup, Call API] as Administrator, the 3 probe tickets:
 *         Subject   = QA-UI probe <n> AUTO-CRM-11859-TC-UI-046_B-<runId>
 *         Raised By = qa.ui<n>.<runId>@example.com (FF makes a Contact per address; a run-unique address keeps the teardown's
 *                     Contact delete on this run's own Contact)
 *         Customer  = blank (no HD Customer 'ACME Test Ltd' on the Support service - checked each run)
 *       probe 1: assigned to Giang Le; probe 2: unassigned; probe 3: assigned to Giang Le, the close-gate fields copied from
 *       migrated closed ticket 2586 (Severity 3, Bug Report / FCR / Wrongly escalated = No, Support Requests, Core, None,
 *       None, Install/Update, texts of this run), then Status = Closed (FF refuses to close without them)
 *  Steps to reproduce
 *    1. FF: apply the same four entries from Filters; note the counts and check 5 rows of each.
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    Same rules: every row of My Tickets has you as assignee, Unassigned rows have none, Open has no Closed ticket, Closed only
 *    Closed; the probe tickets land in the right lists.
 *
 *  How it is compared: per entry (a) the counter's total equals the REST count of the entry's rule at the same moment
 *  (My Tickets _assign contains me, Unassigned _assign empty, Open status != Closed, Closed status = Closed; archived
 *  tickets left out - FF lists hide them), (b) the first 5
 *  rows obey the rule (their _assign / status are read and printed), (c) each probe is in the entries of its kind and not in
 *  the others: assigned -> My Tickets + Open; unassigned -> Unassigned + Open; closed -> Closed + My Tickets (it is assigned
 *  to me). (c) is read over REST - a list shows 20 rows, so a probe can sit on a later page.
 *
 * Evidence: Pre-condition 1 + 2 end shots; Step 1 verify shot per entry (counter + list rows); afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true });

const TC = 'TC-UI-046_B';
const SOURCE_ROW = 'TC-UI-046';
const SOURCE_FINGERPRINT = 'e65290e3879c9d9e';
const SKIP_CLEANUP = false; // true keeps the probe tickets for inspection

const STEP = {
  pre1: 'Pre-condition 1: Agent account - Support service (Frappe Helpdesk) /login as L1 agent Giang Le; [INTERNAL check, Call API] HD Agent Support Level = L1',
  pre2: "Pre-condition 2: [INTERNAL setup, Call API] QA probe tickets of this run (as Administrator): Subject = 'QA-UI probe <n>' + run marker, Raised By = qa.ui<n> address; one assigned to me, one unassigned, one closed",
  s1: 'Step 1: FF: apply the same four entries from Filters; note the counts and check 5 rows of each. (All Tickets > Filters > My Tickets / Unassigned Tickets / Open Tickets / Closed Tickets)',
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_support_mig;
const ADMIN = users.admin_support_mig;
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const subjectOf = (n: number) => `QA-UI probe ${n} AUTO-CRM-11859-${TC}-${RUN}`;
/** The close-gate fields of the closed probe - the values of migrated closed ticket 2586 (Odoo #374641), the texts this run's own. */
const CLOSE_FIELDS = (subject: string): Record<string, unknown> => ({
  custom_severity_level: 'Severity 3', custom_bug_report: 'No', custom_fcr: 'No', custom_wrongly_escalated_to_l2: 'No',
  custom_class_ticket_type: 'Support Requests', custom_product_line: 'Core', custom_classification_area: 'None', custom_sub_area: 'None',
  custom_issue_type: 'Install/Update', custom_class_description: `${subject} description`, custom_root_cause: `${subject} root cause`, custom_resolution: `${subject} resolution`,
});

type Check = { what: string; expected: string; actual: string; passed: boolean; difference?: string };
function bannerLines(c: Check, width = 96): string[] {
  const wrap = (head: string, text: string): string[] => {
    const pad = ' '.repeat(head.length); const out: string[] = []; let cur = head;
    for (const word of text.split(' ')) { if (cur.length + word.length > width && cur.trim().length > head.trim().length) { out.push(cur.trimEnd()); cur = pad; } cur += `${word} `; }
    out.push(cur.trimEnd()); return out;
  };
  return [...wrap('', `${c.what}:`), ...wrap('   Expected : ', c.expected), ...wrap('   Actual   : ', c.actual), ...(!c.passed && c.difference ? wrap('   Difference : ', c.difference) : [])];
}
/** Record a step's checks and take their verify-point evidence shot BEFORE any expect() (REQUIREMENT #3b). */
async function recordChecks(page: Page, testInfo: TestInfo, all: Check[], stepChecks: Check[], name: string, highlight: string[] = [], corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'bottom-right'): Promise<void> {
  all.push(...stepChecks);
  for (const c of stepChecks) console.log(`  - ${c.what} : ${c.actual} (${c.passed ? 'PASS' : 'FAIL'})`);
  await CommonUtils.captureVerifyEvidence(page, testInfo, { name, passed: stepChecks.every((c) => c.passed), highlight, lines: stepChecks.flatMap((c) => bannerLines(c)), corner }).catch(() => {});
}

test.describe(`${TC} - The four basic ticket filters on the Support service`, () => {
  const probes: Array<{ name: string; subject: string; email: string; since: string; kind: string }> = [];

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_B, SOURCE_FINGERPRINT);
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---');
    for (const p of probes.splice(0)) {
      if (SKIP_CLEANUP) { console.log(`  - SKIP_CLEANUP: probe ${p.name} kept`); continue; }
      const log = await deleteSupportProbeAsAdmin(baseUrl_support_mig, ADMIN, { ticketName: p.name, subject: p.subject, contactEmail: p.email, since: p.since }).catch((e) => [`CLEANUP FAILED ${String(e).split('\n')[0]}`]);
      for (const l of log) console.log(`  - probe ${p.name}: ${l}`);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: My Tickets, Unassigned, Open and Closed filters - B: each Filters entry lists only rows of its rule, its count matches and the probes land in the right lists`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${AGENT.username} on ${baseUrl_support_mig}`);
      await desk.login(baseUrl_support_mig, AGENT.username, AGENT.password);
      const agent = await desk.getMyAgentLevel(AGENT.username);
      console.log(`  [INTERNAL check, Call API] support level = ${agent.level || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Giang Le');
      expect(agent.level, 'the signed-in agent is an L1 agent').toBe('L1');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      try {
        console.log(`  [INTERNAL check, Call API] HD Customer 'ACME Test Ltd' exists: ${await desk.hdCustomerExists('ACME Test Ltd')} (Customer left blank either way - the Administrator create call takes no customer)`);
        for (const n of [1, 2, 3]) {
          const kind = ['assigned to me', 'unassigned', 'closed'][n - 1];
          const subject = subjectOf(n);
          const email = `qa.ui${n}.${RUN}@example.com`;
          const t = await createSupportTicketAsAdmin(baseUrl_support_mig, ADMIN, { subject, raisedBy: email, description: `<p>Automated probe for CRM-11859 ${TC} (${kind}). Not a real customer.</p>` });
          probes.push({ name: t.name, subject, email, since: t.creation, kind });
          if (n !== 2) console.log(`  - probe ${n} _assign = ${await assignSupportTicketAsAdmin(baseUrl_support_mig, ADMIN, t.name, subject, AGENT.username)}`);
          if (n === 3) {
            // the FF close gate refuses a ticket without these (HTTP 417 "Please fill in next to close the ticket", measured 2026-11-04)
            console.log(`  - probe 3 close fields = ${JSON.stringify(await updateSupportTicketAsAdmin(baseUrl_support_mig, ADMIN, t.name, subject, CLOSE_FIELDS(subject)))}`);
            console.log(`  - probe 3 stored = ${JSON.stringify(await updateSupportTicketAsAdmin(baseUrl_support_mig, ADMIN, t.name, subject, { status: 'Closed' }))}`);
          }
          const back = (await desk.listTicketsOverRest([['name', '=', t.name]], ['name', 'subject', 'raised_by', '_assign', 'status'], 1))[0] || {};
          console.log(`  - probe ${n} ${t.name} (${kind}):`);
          console.log(`       Subject   = ${back.subject}`);
          console.log(`       Raised By = ${back.raised_by}`);
          console.log(`       _assign   = ${back._assign || '(none)'}`);
          console.log(`       Status    = ${back.status}`);
        }
      } catch (e) {
        const reason = String((e as Error)?.message ?? e).split('\n')[0];
        console.log(`  SET-UP FAILED : ${reason}`);
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Pre-condition 2 - set-up failed', passed: false, lines: [`SET-UP FAILED - ${STEP.pre2}`, `  error: ${reason}`], corner: 'bottom-right' }).catch(() => {});
        throw e;
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - probe tickets created');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const me = AGENT.username;
      const ENTRIES: Array<{ label: string; rule: string; filters: unknown[]; holds: string[] }> = [
        { label: 'My Tickets', rule: 'you as assignee', filters: [['_assign', 'like', `%${me}%`]], holds: ['assigned to me', 'closed'] },
        { label: 'Unassigned Tickets', rule: 'no assignee', filters: [['_assign', 'in', ['', '[]']]], holds: ['unassigned'] },
        { label: 'Open Tickets', rule: 'not Closed', filters: [['status', '!=', 'Closed']], holds: ['assigned to me', 'unassigned'] },
        { label: 'Closed Tickets', rule: 'Closed', filters: [['status', '=', 'Closed']], holds: ['closed'] },
      ];
      await desk.openAllTicketsFromSidebar();
      for (const e of ENTRIES) {
        await desk.chooseFiltersMenuEntry(e.label);
        const counter = await desk.getListCounter();
        // FF lists hide archived tickets (custom_archived = 1); Frappe's "in ['', '[]']" also matches an empty (null) _assign
        const expectedCount = await desk.countTicketsOverRest([...e.filters, ['custom_archived', '=', 0]]);
        const five = await desk.getListTicketNamesOrNone(5);
        const rows = five.length ? await desk.listTicketsOverRest([['name', 'in', five]], ['name', '_assign', 'status'], 5) : [];
        const obeys = (r: Record<string, unknown>) => {
          const a = String(r._assign || ''); const st = String(r.status || '');
          return e.label === 'My Tickets' ? a.includes(me) : e.label === 'Unassigned Tickets' ? (a === '' || a === '[]') : e.label === 'Open Tickets' ? st !== 'Closed' : st === 'Closed';
        };
        for (const r of rows) console.log(`  - ${e.label} row ${r.name}: _assign = ${r._assign || '(none)'}, status = ${r.status}`);
        const placed: string[] = []; const wrong: string[] = [];
        for (const p of probes) {
          const inIt = (await desk.countTicketsOverRest([['name', '=', p.name], ...(e.label === 'Unassigned Tickets' ? [] : e.filters)])) > 0
            && (e.label !== 'Unassigned Tickets' || (await desk.listTicketsOverRest([['name', '=', p.name]], ['_assign'], 1)).every((r) => !r._assign || r._assign === '[]'));
          placed.push(`${p.kind} ${p.name}: ${inIt ? 'in' : 'not in'}`);
          if (inIt !== e.holds.includes(p.kind)) wrong.push(`${p.kind} ${p.name} ${inIt ? 'listed but must not be' : 'missing'}`);
        }
        await desk.markListCounter();
        await desk.markListRows(five);
        await recordChecks(page, testInfo, checks, [
          { what: `${e.label} count`, expected: `counter total ${expectedCount} (tickets with ${e.rule}, REST count)`, actual: `counter "${counter.text}"`, passed: counter.total === expectedCount, difference: `expected ${expectedCount}, got ${counter.total} (${counter.total - expectedCount >= 0 ? '+' : ''}${counter.total - expectedCount})` },
          { what: `${e.label} first 5 rows have ${e.rule}`, expected: `${Math.min(5, expectedCount)} rows, all with ${e.rule}`, actual: `${rows.length} rows, ${rows.filter(obeys).length} with ${e.rule}`, passed: rows.length === Math.min(5, expectedCount) && rows.every(obeys), difference: `${rows.filter((r) => !obeys(r)).map((r) => r.name).join(', ') || 'rows missing'} break the rule` },
          { what: `${e.label} the probes land in the right lists`, expected: `in: ${e.holds.join(', ')}; the other probes not`, actual: placed.join('; '), passed: wrong.length === 0, difference: wrong.join('; ') },
        ], `${TC} - Step 1 ${e.label}`, [SupportDeskPageMig.LIST_COUNTER, SupportDeskPageMig.LIST_ROW]);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - four entries applied');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference}`).join(' | ')}` : 'OVERALL: PASS - each entry lists only rows of its rule, its count matches and the probes land in the right lists');
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference || `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(checks.length, 'checks were recorded for the 4 entries').toBe(12);
      expect(failed.map((c) => c.what), 'the four Filters entries obey their rules').toEqual([]);
    });
  });
});
