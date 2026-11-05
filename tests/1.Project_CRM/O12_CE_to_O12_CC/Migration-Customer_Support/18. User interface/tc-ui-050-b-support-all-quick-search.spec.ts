import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl_support_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { SupportDeskPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_B, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';
import { customerSupportBaselineDetails } from '@helpers/customer-support-mig.helper';
import { createSupportTicketAsAdmin, deleteSupportProbeAsAdmin } from '@helpers/support-desk-cleanup.helper';

/**
 * ================================================================================================
 *  TC-UI-050_B - 'All' quick search by subject word - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-UI-050_B   (side A = tc-ui-050-a-preprod-all-quick-search.spec.ts = reference, map in
 *                    helpers/customer-support-mig.baseline-map.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-04
 * Jira             : CRM-14028 (Xray Test, feature CRM-11859)
 * Host / Run as    : support-crm-mig (Frappe Helpdesk, ignoreHTTPSErrors) / L1 agent Giang Le (users.support_l1_giang_support_mig,
 *                    HD Agent Support Level = L1 asserted)
 * Data             : 3 probe tickets of this run, created and deleted as Administrator (deny-list). The quick search is SAVED
 *                    by FF in Giang's own default view - it is snapshotted in Pre-condition 3 and restored in afterEach
 * Folder           : "18. User interface" (master divider)
 *
 * Summary: All Tickets > 'Search (All)' = QA-UI + Enter (keyboard only) must apply the search and list the 3 probes;
 * emptying the box again must bring the list back to what it showed before.
 *
 * Command to run: npx playwright test tc-ui-050-b-support --grep "TC-UI-050_B:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 269 = row TC-UI-050; Comparison = same. Xray CRM-14028: 1 step
 *  Source version   : fingerprint 4ab690ee0ad59519 of Preconditions + Steps + B expected + Test data (beforeEach)
 *  Pre-conditions (master, verbatim)
 *    Role: L1 agent. QA probe tickets created for this run in both systems: Subject = 'QA-UI probe <n>', Requester =
 *    qa.ui<n>@example.com, Customer = 'ACME Test Ltd' when it exists. Archive or delete them after the run. Probe subjects
 *    contain the word 'QA-UI'.
 *    1. Logged in as L1 agent Giang Le on the Support service
 *    2. [INTERNAL setup, Call API] as Administrator, the 3 probe tickets:
 *         Subject   = QA-UI probe <n> AUTO-CRM-11859-TC-UI-050_B-<runId>
 *         Raised By = qa.ui<n>.<runId>@example.com (a run-unique address keeps the teardown's Contact delete on this run's own)
 *         Customer  = blank (the Administrator create call takes no customer)
 *    3. FF: sidebar All Tickets; Giang's saved list state is snapshotted; note the counter (the list before the search)
 *  Steps to reproduce
 *    1. FF: All Tickets: type 'QA-UI' in 'Search (All)' and press Enter (keyboard only).
 *       (the box is focused, the word typed, Enter pressed; then the box is emptied with Ctrl+A, Delete, Enter - the
 *       expected result's "clearing the box")
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    Pressing Enter applies the search; the probe tickets are listed; clearing the box restores the list.
 *
 *  How it is compared: (1) after Enter the counter changes to the search result and every listed row's subject contains
 *  QA-UI; (2) the 3 probes are among the listed rows; (3) after emptying the box the counter equals the one noted in
 *  Pre-condition 3.
 *
 * Evidence: Pre-condition 1-3 end shots; Step 1 verify shots (search applied: box + counter + rows; box cleared: counter);
 *           afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true });

const TC = 'TC-UI-050_B';
const SOURCE_ROW = 'TC-UI-050';
const SOURCE_FINGERPRINT = '4ab690ee0ad59519';
const SKIP_CLEANUP = false; // true keeps the probe tickets for inspection

const STEP = {
  pre1: 'Pre-condition 1: Agent account - Support service (Frappe Helpdesk) /login as L1 agent Giang Le; [INTERNAL check, Call API] HD Agent Support Level = L1',
  pre2: "Pre-condition 2: [INTERNAL setup, Call API] QA probe tickets of this run (as Administrator): Subject = 'QA-UI probe <n>' + run marker, Raised By = qa.ui<n> address",
  pre3: "Pre-condition 3: FF: sidebar All Tickets; snapshot Giang's saved list state; note the counter before the search",
  s1: "Step 1: FF: All Tickets: type 'QA-UI' in 'Search (All)' and press Enter (keyboard only). (then empty the box with Ctrl+A, Delete, Enter)",
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_support_mig;
const ADMIN = users.admin_support_mig;
const WORD = 'QA-UI';
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const subjectOf = (n: number) => `${WORD} probe ${n} AUTO-CRM-11859-${TC}-${RUN}`;

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

test.describe(`${TC} - 'All' quick search by subject word on the Support service`, () => {
  const probes: Array<{ name: string; subject: string; email: string; since: string }> = [];
  let desk: SupportDeskPageMig | null = null;
  let savedView: Awaited<ReturnType<SupportDeskPageMig['readMyDefaultTicketView']>> = null;

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
    let restored = '';
    if (desk && savedView) {
      await page.goto(`${baseUrl_support_mig.replace(/\/$/, '')}/helpdesk/tickets`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      restored = await desk.restoreMyDefaultTicketView(AGENT.username, savedView).catch((e) => `RESTORE FAILED: ${e}`);
      console.log(`  - ${restored}`);
    }
    for (const p of probes.splice(0)) {
      if (SKIP_CLEANUP) { console.log(`  - SKIP_CLEANUP: probe ${p.name} kept`); continue; }
      const log = await deleteSupportProbeAsAdmin(baseUrl_support_mig, ADMIN, { ticketName: p.name, subject: p.subject, contactEmail: p.email, since: p.since }).catch((e) => [`CLEANUP FAILED ${String(e).split('\n')[0]}`]);
      for (const l of log) console.log(`  - probe ${p.name}: ${l}`);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    desk = null; savedView = null;
    if (restored.startsWith('RESTORE FAILED')) throw new Error(`Teardown: Giang's saved list state was NOT restored - ${restored}`);
  });

  test(`${TC}: 'All' quick search by subject word - B: Enter applies the search, the probes are listed and clearing the box restores the list`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    desk = new SupportDeskPageMig(page);
    const d = desk;
    const checks: Check[] = [];
    let before = { shown: -1, total: -1, text: '' };

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${AGENT.username} on ${baseUrl_support_mig}`);
      await d.login(baseUrl_support_mig, AGENT.username, AGENT.password);
      const agent = await d.getMyAgentLevel(AGENT.username);
      console.log(`  [INTERNAL check, Call API] support level = ${agent.level || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Giang Le');
      expect(agent.level, 'the signed-in agent is an L1 agent').toBe('L1');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      try {
        for (const n of [1, 2, 3]) {
          const subject = subjectOf(n);
          const email = `qa.ui${n}.${RUN}@example.com`;
          const t = await createSupportTicketAsAdmin(baseUrl_support_mig, ADMIN, { subject, raisedBy: email, description: `<p>Automated probe for CRM-11859 ${TC}. Not a real customer.</p>` });
          probes.push({ name: t.name, subject, email, since: t.creation });
          console.log(`  - probe ${n} ${t.name}:\n       Subject   = ${subject}\n       Raised By = ${email}`);
        }
      } catch (e) {
        const reason = String((e as Error)?.message ?? e).split('\n')[0];
        console.log(`  SET-UP FAILED : ${reason}`);
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Pre-condition 2 - set-up failed', passed: false, lines: [`SET-UP FAILED - ${STEP.pre2}`, `  error: ${reason}`], corner: 'bottom-right' }).catch(() => {});
        throw e;
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - probe tickets created');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await d.openAllTicketsFromSidebar();
      savedView = await d.readMyDefaultTicketView(AGENT.username);
      console.log(`  [INTERNAL check, Call API] saved list state snapshot: ${JSON.stringify(savedView)}`);
      before = await d.getListCounter();
      console.log(`  - counter before the search: "${before.text}" (box "${await d.getListAllBoxValue()}")`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - list before the search');
      expect(before.total, 'the list draws its counter before the search').toBeGreaterThan(0);
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await d.searchListAll(WORD);
      const after = await d.getListCounter();
      const names = await d.getListTicketNamesOrNone(20);
      const rows = names.length ? await d.listTicketsOverRest([['name', 'in', names]], ['name', 'subject'], 20) : [];
      const offWord = rows.filter((r) => !String(r.subject || '').toUpperCase().includes(WORD)).map((r) => `${r.name} "${r.subject}"`);
      const probeNames = probes.map((p) => p.name);
      const missing = probeNames.filter((n) => !names.includes(n));
      for (const r of rows) console.log(`  - listed ${r.name}: ${r.subject}`);
      await d.markListCounter();
      await d.markListRows(names);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 pressing Enter applies the search', expected: `counter changes from "${before.text}" to the search result, every listed subject contains ${WORD}`, actual: `counter "${after.text}", ${rows.length} rows, ${offWord.length} without ${WORD}`,
          passed: after.total > 0 && after.total !== before.total && offWord.length === 0, difference: [after.total === before.total ? `counter still "${after.text}"` : '', offWord.length ? `rows without ${WORD}: ${offWord.join(', ')}` : '', after.total <= 0 ? 'no rows listed' : ''].filter(Boolean).join('; ') },
        { what: 'Step 1 the probe tickets are listed', expected: `the 3 probes ${probeNames.join(', ')}`, actual: `${probeNames.length - missing.length} of 3 listed`, passed: missing.length === 0, difference: `not listed: ${missing.join(', ')}` },
      ], `${TC} - Step 1 search applied`, [SupportDeskPageMig.LIST_COUNTER, SupportDeskPageMig.LIST_ROW, 'input[placeholder="All"]']);

      await d.clearListAllBox();
      const cleared = await d.getListCounter();
      await d.markListCounter();
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 clearing the box restores the list', expected: `counter "${before.text}" again, box empty`, actual: `counter "${cleared.text}", box "${await d.getListAllBoxValue()}"`, passed: cleared.total === before.total, difference: `expected total ${before.total}, got ${cleared.total}` },
      ], `${TC} - Step 1 box cleared`, [SupportDeskPageMig.LIST_COUNTER, 'input[placeholder="All"]']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - search applied and cleared');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference}`).join(' | ')}` : 'OVERALL: PASS - Enter applies the search, the probes are listed, clearing the box restores the list');
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference || `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(failed.map((c) => c.what), 'the All quick search works').toEqual([]);
    });
  });
});
