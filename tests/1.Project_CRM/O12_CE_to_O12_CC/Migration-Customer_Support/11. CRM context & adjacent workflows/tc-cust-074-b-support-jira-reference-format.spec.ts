import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl_support_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { SupportDeskPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_B, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';
import { customerSupportBaselineDetails } from '@helpers/customer-support-mig.helper';
import { createSupportTicketAsAdmin, assignSupportTicketAsAdmin, deleteSupportProbeAsAdmin } from '@helpers/support-desk-cleanup.helper';

/**
 * ================================================================================================
 *  TC-CUST-074_B - Jira reference accepts only a /browse/ URL and opens the issue - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-CUST-074_B   (side A = tc-cust-074-a-preprod-jira-reference-format.spec.ts = reference, map in
 *                    helpers/customer-support-mig.baseline-map.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-04
 * Jira             : CRM-14005 (Xray Test, feature CRM-11859)
 * Host / Run as    : support-crm-mig (Frappe Helpdesk, ignoreHTTPSErrors) / L2 engineer Nam Pham (users.support_l2_nam_support_mig,
 *                    HD Agent Support Level = L2 asserted)
 * Data             : one probe ticket of this run (Administrator create + delete, deny-list). The test Jira host
 *                    (jira.example.com) is answered by a stub page of the run, so no Jira call is made
 * Folder           : "11. CRM context & adjacent workflows" (master divider)
 *
 * Summary: side panel Jira reference = a bare key or a non-/browse/ URL must be refused with the format message in a dialog
 * 'Jira reference'; a /browse/ URL must be saved with key ITSM-123; the ticket action 'Jira ITSM-123' must open the issue in a
 * new tab.
 *
 * Command to run: npx playwright test tc-cust-074-b-support --grep "TC-CUST-074_B:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, row TC-CUST-074; Comparison = same. Xray CRM-14005: 4 steps
 *  Source version   : fingerprint 0a9a563d5b31b4a6 of Preconditions + Steps + B expected + Test data (beforeEach)
 *  Pre-conditions (master, verbatim)
 *    Role: L2 engineer. A probe ticket. No Jira call is made by these steps. Test data: ITSM-123 (test project key).
 *    1. Logged in as L2 engineer Nam Pham on the Support service
 *    2. [INTERNAL setup, Call API] as Administrator, the probe ticket of this run, assigned to Nam Pham:
 *         Subject   = AUTO-CRM-11859-TC-CUST-074_B-<runId>
 *         Raised By = qa.cust074.<runId>@example.com
 *       <test jira host> = jira.example.com (author's choice; the run answers it with a stub page)
 *  Steps to reproduce (ticket page, side panel row "Jira reference" - FF saves it when the box is left with Tab)
 *    1. Set Jira reference = 'ITSM-123' (bare key) and Save.
 *    2. Set Jira reference = 'https://jira.example.com/issues/ITSM-123' and Save.
 *    3. Set Jira reference = 'https://<test jira host>/browse/ITSM-123' and Save.
 *    4. B: click the ticket action 'Jira ITSM-123'.
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    The same message for steps 1-2 (dialog 'Jira reference'); step 3 saved, key ITSM-123 stored; the 'Jira ITSM-123' action
 *    opens the issue in a new tab.
 *
 *  How it is compared: steps 1-2 - two checks each: the message (A's text, whitespace-normalised) is shown and nothing is
 *  stored; the message comes in a dialog titled 'Jira reference'. Step 3 - stored custom_jira_url = the typed URL and
 *  custom_jira_key = ITSM-123. Step 4 - an action named 'Jira ITSM-123' is offered (header Actions menu or any visible
 *  link / button) and its click opens a tab on the stored URL.
 *
 * Evidence: Pre-condition 1 + 2 end shots; Steps 1-2 verify shots (the message as drawn); Step 3 verify shot (the row);
 *           Step 4 verify shot (the header); afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true });

const TC = 'TC-CUST-074_B';
const SOURCE_ROW = 'TC-CUST-074';
const SOURCE_FINGERPRINT = '0a9a563d5b31b4a6';
const SKIP_CLEANUP = false; // true keeps the probe ticket for inspection

const STEP = {
  pre1: 'Pre-condition 1: Logged in as L2 engineer Nam Pham on the Support service (Frappe Helpdesk) /login; [INTERNAL check, Call API] HD Agent Support Level = L2',
  pre2: 'Pre-condition 2: [INTERNAL setup, Call API] A probe ticket of this run (as Administrator), assigned to Nam Pham; the test Jira host jira.example.com is answered by a stub page (no Jira call)',
  s1: "Step 1: Set Jira reference = 'ITSM-123' (bare key) and Save. (side panel row Jira reference; FF saves when the box is left with Tab)",
  s2: "Step 2: Set Jira reference = 'https://jira.example.com/issues/ITSM-123' and Save.",
  s3: "Step 3: Set Jira reference = 'https://<test jira host>/browse/ITSM-123' and Save. (<test jira host> = jira.example.com)",
  s4: "Step 4: B: click the ticket action 'Jira ITSM-123'.",
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_nam_support_mig;
const ADMIN = users.admin_support_mig;
const MESSAGE = 'Wrong format, please check url, it must be in format - connection protocol://address:port/browse/target-name.';
const GOOD = 'https://jira.example.com/browse/ITSM-123';
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const SUBJECT = `AUTO-CRM-11859-${TC}-${RUN}`;
const EMAIL = `qa.cust074.${RUN}@example.com`;

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
async function recordChecks(page: Page, testInfo: TestInfo, all: Check[], stepChecks: Check[], name: string, highlight: string[] = [], corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'top-right'): Promise<void> {
  all.push(...stepChecks);
  for (const c of stepChecks) console.log(`  - ${c.what} : ${c.actual} (${c.passed ? 'PASS' : 'FAIL'})`);
  await CommonUtils.captureVerifyEvidence(page, testInfo, { name, passed: stepChecks.every((c) => c.passed), highlight, lines: stepChecks.flatMap((c) => bannerLines(c)), corner }).catch(() => {});
}
const sp = (s: string): string => (s || '').replace(/\s+/g, ' ').trim();

test.describe(`${TC} - Jira reference format on the Support service`, () => {
  const probe = { name: '', since: '' };

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
    if (probe.name && !SKIP_CLEANUP) {
      const log = await deleteSupportProbeAsAdmin(baseUrl_support_mig, ADMIN, { ticketName: probe.name, subject: SUBJECT, contactEmail: EMAIL, since: probe.since }).catch((e) => [`CLEANUP FAILED ${String(e).split('\n')[0]}`]);
      for (const l of log) console.log(`  - ${l}`);
    } else if (probe.name) console.log(`  - SKIP_CLEANUP: probe ${probe.name} kept`);
    probe.name = '';
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Jira reference accepts only a /browse/ URL and opens the issue - B: Frappe Helpdesk refuses a bare key and an /issues/ URL, keeps a /browse/ URL, and offers the Jira action`, customerSupportBaselineDetails(TC), async ({ page, context }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    // the test Jira host answers a stub page from the run itself - no request leaves the browser (no Jira call)
    await context.route(/jira\.example\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>stub Jira page of the automation run</body></html>' }));
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${ENGINEER.username} on ${baseUrl_support_mig}`);
      await desk.login(baseUrl_support_mig, ENGINEER.username, ENGINEER.password);
      const agent = await desk.getMyAgentLevel(ENGINEER.username);
      console.log(`  [INTERNAL check, Call API] support level = ${agent.level || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Nam Pham');
      expect(agent.level, 'the signed-in agent is an L2 engineer').toBe('L2');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      try {
        const t = await createSupportTicketAsAdmin(baseUrl_support_mig, ADMIN, { subject: SUBJECT, raisedBy: EMAIL, description: `<p>Automated probe for CRM-11859 ${TC}. Not a real customer.</p>` });
        Object.assign(probe, { name: t.name, since: t.creation });
        const assigned = await assignSupportTicketAsAdmin(baseUrl_support_mig, ADMIN, t.name, SUBJECT, ENGINEER.username);
        console.log(`  - probe ${t.name}:\n       Subject   = ${SUBJECT}\n       Raised By = ${EMAIL}\n       _assign   = ${assigned}`);
        await desk.openTicketByLink(baseUrl_support_mig, t.name);
      } catch (e) {
        const reason = String((e as Error)?.message ?? e).split('\n')[0];
        console.log(`  SET-UP FAILED : ${reason}`);
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Pre-condition 2 - set-up failed', passed: false, lines: [`SET-UP FAILED - ${STEP.pre2}`, `  error: ${reason}`], corner: 'bottom-right' }).catch(() => {});
        throw e;
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - probe ticket open');
    });

    for (const [label, value] of [[STEP.s1, 'ITSM-123'], [STEP.s2, 'https://jira.example.com/issues/ITSM-123']] as const) {
      await test.step(label, async () => {
        console.log(`\n--- ${label} ---`);
        const r = await desk.setSidePanelTextAndBlur('Jira reference', value);
        const shown = r.toasts.map(sp).find((t) => t.includes(MESSAGE)) || '';
        const tag = label.split(':')[0];
        // shot at once - a toast fades within seconds
        await recordChecks(page, testInfo, checks, [
          { what: `${tag} "${value}" refused with the format message`, expected: `"${MESSAGE}"`, actual: shown ? `shown "${shown}"` : `not shown (toasts ${JSON.stringify(r.toasts)})`, passed: !!shown, difference: 'the message is not shown' },
        ], `${tag} - message`, [SupportDeskPageMig.MESSAGE]);
        const dialog = sp(await desk.getShownDialogTextFF().catch(() => ''));
        const stored = (await desk.listTicketsOverRest([['name', '=', probe.name]], ['custom_jira_url', 'custom_jira_key'], 1))[0] || {};
        console.log(`  [INTERNAL check, Call API] stored ${JSON.stringify(stored)}`);
        checks.push({ what: `${tag} [INTERNAL check, Call API] nothing stored`, expected: 'custom_jira_url empty', actual: `custom_jira_url ${JSON.stringify(stored.custom_jira_url ?? null)}`, passed: !stored.custom_jira_url, difference: `stored "${stored.custom_jira_url}"` });
        await desk.markPanelRows(['Jira reference']);
        await recordChecks(page, testInfo, checks, [
          { what: `${tag} the message comes in a dialog 'Jira reference'`, expected: "a dialog titled 'Jira reference'", actual: dialog ? `dialog "${dialog}"` : `no dialog - ${r.toasts.length ? 'a toast' : 'nothing'} drawn`,
            passed: /^Jira reference/.test(dialog), difference: dialog ? `dialog "${dialog}"` : 'shown as a toast, not as a dialog' },
        ], `${tag} - dialog`, [SupportDeskPageMig.PANEL_ROW]);
        await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      });
    }

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const r = await desk.setSidePanelTextAndBlur('Jira reference', GOOD);
      const stored = (await desk.listTicketsOverRest([['name', '=', probe.name]], ['custom_jira_url', 'custom_jira_key'], 1))[0] || {};
      console.log(`  [INTERNAL check, Call API] stored ${JSON.stringify(stored)}`);
      await desk.markPanelRows(['Jira reference']);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 saved, key ITSM-123 stored', expected: `custom_jira_url "${GOOD}", custom_jira_key "ITSM-123"`, actual: `custom_jira_url "${stored.custom_jira_url ?? ''}", custom_jira_key "${stored.custom_jira_key ?? ''}" (box "${r.value}", toasts ${JSON.stringify(r.toasts)})`,
          passed: stored.custom_jira_url === GOOD && stored.custom_jira_key === 'ITSM-123', difference: `stored url "${stored.custom_jira_url ?? ''}", key "${stored.custom_jira_key ?? ''}"` },
      ], `${TC} - Step 3 saved`, [SupportDeskPageMig.PANEL_ROW]);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await desk.reloadPage();
      const action = await desk.findTicketAction('Jira ITSM-123');
      console.log(`  - header Actions menu: ${JSON.stringify(action.menuItems)}; elements named 'Jira ITSM-123': ${action.found}`);
      await recordChecks(page, testInfo, checks, [
        { what: "Step 4 the ticket action 'Jira ITSM-123' is offered", expected: "an action 'Jira ITSM-123' (header or Actions menu)", actual: action.found ? `${action.found} found` : `none - Actions menu ${JSON.stringify(action.menuItems)}`,
          passed: action.found > 0, difference: `no action 'Jira ITSM-123' on the ticket page (Actions menu: ${action.menuItems.join(', ') || 'none'})` },
      ], `${TC} - Step 4 Jira action`, ['header']);
      if (action.found) {
        const opened = await desk.clickTicketActionForNewTab('Jira ITSM-123');
        await recordChecks(page, testInfo, checks, [
          { what: "Step 4 the 'Jira ITSM-123' action opens the issue in a new tab", expected: `a new tab on ${GOOD}`, actual: opened ? `new tab on ${opened}` : 'no new tab', passed: opened === GOOD, difference: opened ? `opened ${opened}` : 'no tab opened' },
        ], `${TC} - Step 4 Jira action opened`, ['header']);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Jira reference set');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference}`).join(' | ')}` : "OVERALL: PASS - only a /browse/ URL is kept and the Jira action opens it");
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference || `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(failed.map((c) => c.what), 'the Jira reference format rule holds').toEqual([]);
    });
  });
});
