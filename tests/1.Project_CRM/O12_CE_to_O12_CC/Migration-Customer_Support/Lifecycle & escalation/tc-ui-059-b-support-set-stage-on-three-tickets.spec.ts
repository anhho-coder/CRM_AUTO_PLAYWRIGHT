import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl_support_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { SupportDeskPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_B, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';
import { deleteSupportProbeAsAdmin, SupportProbe } from '@helpers/support-desk-cleanup.helper';
import { customerSupportBaselineDetails } from '@helpers/customer-support-mig.helper';

/**
 * ================================================================================================
 *  TC-UI-059_B - Set status on several tickets - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-UI-059_B   (side B of the A/B row TC-UI-059; side A = tc-ui-059-a-preprod-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-23
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : Support service (https://support-crm-mig.nakivo.site, Frappe Helpdesk - NOT Odoo; self-signed
 *                    certificate chain, hence ignoreHTTPSErrors)
 * Run as           : L1 agent - Giang Le (giang.le@nakivo.com; HD Agent Support Level = L1, asserted in Pre-condition 1;
 *                    users.support_l1_giang_support_mig). Teardown only: Administrator over the API.
 * Data             : three probe tickets (and their Raised By Contacts) created per run, DELETED in afterEach as Administrator
 *                    (toggles SKIP_CLEANUP_TICKETS / SKIP_CLEANUP_CONTACTS)
 * Folder           : tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support / "Lifecycle & escalation" =
 *                    the Spec area (h2) of Confluence page 231246777 "[Migration] Customer Support (Helpdesk Ticketing)"
 *                    whose requirement this case verifies - IS-CRM-FUNC-0268 (stage moves); the TC-to-requirement mapping is
 *                    the automation author's, the CSV carries no link to that page
 * Baseline         : TC-UI-059_A (Jira: not imported to Xray yet; tests/1.Project_CRM/6.Helpdesk_Module/
 *                    Overrall_Helpdesk_Supports_Feature/Lifecycle & escalation/tc-ui-059-a-preprod-set-stage-on-three-tickets.spec.ts)
 *                    map: helpers/customer-support-mig.baseline-map.ts
 *
 * Summary
 * -------
 * As an L1 agent, tick three probe tickets in the All Tickets list, choose Set status > Pending (L1) > Apply to 3 tickets,
 * reload the list; the toast must read 3 ticket(s) changed and the three probes must show Pending (L1), each with a status
 * history row.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-ui-059-b-support --grep "TC-UI-059_B:" --project=chromium-headless
 *   (both sides: npx playwright test tc-ui-059- --grep "TC-UI-059_" --project=chromium-headless)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 278 = row TC-UI-059 (Area Ticket screens, lists & search,
 *                   Feature "Set status on several tickets", High, happy, L1 agent, refs E35, UI-060) - 3 steps
 *  Source version : fingerprint be2f2cd2e5cb4d2b = sha256 (16 hex) of the row's Preconditions + Steps + B expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the B column (Frappe Helpdesk) - step 2 is the FF half; step 1 is the Odoo half (side A); step 3 is shared
 *
 *  Pre-conditions (CSV, verbatim: "Three probe tickets in status Open.")
 *    1. Logged in as an L1 agent - here the Support service; the L1 tier is read from the HD Agent record
 *    2. Three probe tickets in status Open - CREATED by this run: All Tickets > Create, Raised By = qa.customer.<runId>.<n>@example.com,
 *       Subject = QA FLOW probe TC-UI-059_B <runId> #1 / #2 / #3, Description, Submit. The CSV's 'QA-UI probe <n>' subject and
 *       requester are replaced by this run's unique values, per the batch data rules.
 *  Steps to reproduce #1 (CSV, verbatim - arrows written ">")
 *    1. Odoo: select the 3 probes > Action > Mass Editing (Stage) > Pending (L1) > Apply.
 *    2. FF: tick the 3 probes > 'Set status' > Status 'Pending (L1)' > 'Apply to 3 tickets'.
 *    3. Reload the list.
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    Toast '3 ticket(s) changed'; the 3 probes show Pending (L1) after reload, each with a status history row.
 *
 *  Environment traps (also in the step text):
 *   - The rows are selected ONLY through their row checkboxes. The header "Archived" control is a different checkbox: a click
 *     there adds an "Archived is Yes" filter that is saved for the user. The row checkboxes are located inside their own row.
 *   - The bulk actions sit in the selection bar that appears at the bottom ("3 rows selected"), behind its menu button.
 *   - The list keeps its filters per user on the server; this spec changes no filter.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 verify shot and end shot; verify-point shots in Step 2 (selection and the
 * toast) and Step 3 (outlined green = PASS, red = FAIL); end-of-section shots after Step 2 and Step 3; afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true }); // the Support service serves a self-signed certificate chain

const TC = 'TC-UI-059_B';
const SOURCE_ROW = 'TC-UI-059';
const SOURCE_FINGERPRINT = 'be2f2cd2e5cb4d2b';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe tickets (otherwise deleted as Administrator in afterEach)
const SKIP_CLEANUP_CONTACTS = false; // true keeps the Contacts Frappe created for the probes' Raised By addresses

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L1 agent - Support service (Frappe Helpdesk) /login as Giang Le; [INTERNAL check, Call API] the HD Agent of this account reads Support Level = L1',
  pre2: 'Pre-condition 2: Three probe tickets in status Open - created by this run: All Tickets > Create, Subject = QA FLOW probe TC-UI-059_B <runId> #1 / #2 / #3, Raised By = qa.customer.<runId>.<n>@example.com, Submit',
  s1: 'Step 1: [N/A on Frappe Helpdesk - the Odoo half of this step runs on side A, TC-UI-059_A] Odoo: select the 3 probes > Action > Mass Editing (Stage) > Pending (L1) > Apply.',
  s2: "Step 2: FF: tick the 3 probes > 'Set status' > Status 'Pending (L1)' > 'Apply to 3 tickets' (row checkboxes only; the bar's menu > Set status).",
  s3: 'Step 3: Reload the list.',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l1_giang_support_mig;
const ADMIN = users.admin_support_mig;
const STATUS_OPEN = 'Open';
const STATUS_PENDING = 'Pending (L1)';
const PROBES = 3;
const TOAST = `${PROBES} ticket(s) changed`;

type Check = { what: string; expected: string; actual: string; passed: boolean };

/** One check as banner lines - what / Expected / Actual, wrapped at word boundaries so no value runs off the image. */
function bannerLines(c: Check, width = 96): string[] {
  const wrap = (head: string, text: string): string[] => {
    const pad = ' '.repeat(head.length);
    const out: string[] = [];
    let cur = head;
    for (const word of text.split(' ')) {
      if (cur.length + word.length > width && cur.trim().length > head.trim().length) {
        out.push(cur.trimEnd());
        cur = pad;
      }
      cur += `${word} `;
    }
    out.push(cur.trimEnd());
    return out;
  };
  return [...wrap('', `${c.what}:`), ...wrap('   Expected : ', c.expected), ...wrap('   Actual   : ', c.actual)];
}

/**
 * Record a step's checks and take their verify-point evidence shot BEFORE any expect() (REQUIREMENT #3b).
 * One call per OWNING element: `highlight` is the element the checks read (the dialog, the stage bar, the list), and it
 * must still be on screen - a dialog / toast value is shot before the dialog is closed or the toast fades. The outline
 * colour is the verdict of THESE checks only. `corner` keeps the banner off the outlined element.
 */
async function recordChecks(
  page: Page,
  testInfo: TestInfo,
  all: Check[],
  stepChecks: Check[],
  name: string,
  highlight: string[] = [],
  corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'top-right'
): Promise<void> {
  all.push(...stepChecks);
  for (const c of stepChecks) console.log(`  - ${c.what} : ${c.actual} (${c.passed ? 'PASS' : 'FAIL'})`);
  await CommonUtils.captureVerifyEvidence(page, testInfo, {
    name,
    passed: stepChecks.every((c) => c.passed),
    highlight,
    lines: stepChecks.flatMap((c) => bannerLines(c)),
    corner,
  }).catch(() => {});
}

test.describe(`${TC} - Set the status of three tickets on the Support service`, () => {
  let probes: SupportProbe[] = [];

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    probes = [];
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_B, SOURCE_FINGERPRINT);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---');
    const problems: string[] = [];
    if (SKIP_CLEANUP_TICKETS) {
      console.log('  - SKIP_CLEANUP_TICKETS = true: probe tickets kept');
    } else if (!probes.length) {
      console.log('  - No probe ticket was created by this run - nothing to clean up');
    } else {
      console.log(`  - Deleting this run's data as ${ADMIN.username} (API, deny-list by this run's markers):`);
      for (const p of probes) {
        try {
          const lines = await deleteSupportProbeAsAdmin(baseUrl_support_mig, ADMIN, {
            ticketName: p.ticketName,
            subject: p.subject,
            contactEmail: SKIP_CLEANUP_CONTACTS ? undefined : p.contactEmail,
          });
          for (const l of lines) console.log(`  - ${l}`);
        } catch (e) {
          problems.push(`"${p.subject}": ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (problems.length) throw new Error(`afterEach cleanup: ${problems.join('; ')}`);
  });

  test(`${TC}: Set the status of three selected tickets (Set status, Pending (L1)) - B: Frappe Helpdesk toast, status and history`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const marker = `TC-UI-059_B ${runId}`;
    const subjects = Array.from({ length: PROBES }, (_, i) => `QA FLOW probe ${marker} #${i + 1}`);

    let toast = '';
    let selectedCount = 0;
    let statusesAfter: string[] = [];
    let historyCounts: number[] = [];
    let rowTexts: string[] = [];

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : Support service (${baseUrl_support_mig})`);
      console.log(`  - Login : ${ENGINEER.username} (${ENGINEER.displayName})`);
      await desk.login(baseUrl_support_mig, ENGINEER.username, ENGINEER.password);
      const who = await desk.getLoggedUser();
      const agent = await desk.getMyAgentLevel(ENGINEER.username);
      console.log('  [INTERNAL check, Call API] frappe.auth.get_logged_user + GET HD Agent/<user>, as Giang Le:');
      console.log(`     session user  = ${who}`);
      console.log(`     support level = ${agent.level || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Giang Le');
      expect(who.toLowerCase(), 'the session belongs to the L1 agent').toBe(ENGINEER.username.toLowerCase());
      expect(agent.level, 'the signed-in agent is an L1 agent (HD Agent Support Level = L1)').toBe('L1');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      const statuses: string[] = [];
      for (let n = 0; n < PROBES; n++) {
        const subject = subjects[n];
        const raisedBy = `qa.customer.${runId}.${n + 1}@example.com`;
        await desk.openAllTicketsFromSidebar();
        const ticketName = await desk.createTicketFromList({ raisedBy, subject, description: `Automated check of ${TC} (set status on several tickets) - created and deleted by this run.` });
        probes.push({ ticketName, subject, contactEmail: raisedBy });
        statuses.push((await desk.getTicketFields(ticketName)).status);
      }
      console.log('  Read back:');
      probes.forEach((p, i) => console.log(`     ${p.ticketName} status = ${statuses[i]}   "${p.subject}"`));
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Pre-condition 2 three probes Open`,
        passed: statuses.every((s) => s === STATUS_OPEN),
        highlight: ['header'],
        lines: [`statuses: expected all ${STATUS_OPEN} | actual ${statuses.join(', ')}`],
      }).catch(() => {});
      expect(statuses, 'the three probes are created in status Open').toEqual(Array(PROBES).fill(STATUS_OPEN));
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - three probes Open');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      console.log('  - Not run on Frappe Helpdesk: the Odoo half of this step is executed by TC-UI-059_A (Odoo 12).');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await desk.openAllTicketsFromSidebar();
      selectedCount = await desk.selectListRowsBySubjects(subjects);
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Step 2 three rows selected`,
        passed: selectedCount === PROBES,
        highlight: ['header'],
        lines: [`rows selected (selection bar): expected ${PROBES} | actual ${selectedCount}`],
      }).catch(() => {});
      expect(selectedCount, 'the selection bar reads three rows selected').toBe(PROBES);
      const toastCheck = (text: string): Check => ({ what: 'Toast after Apply', expected: `'${TOAST}'`, actual: text ? `'${text}'` : '(none)', passed: text === TOAST });
      let toastShot = false;
      toast = await desk.bulkSetStatus(STATUS_PENDING, PROBES, {
        // The toast fades: shot the moment it is drawn (the page object tagged it).
        onToast: async (text) => {
          toastShot = true;
          await recordChecks(page, testInfo, checks, [toastCheck(text)], `${TC} - Step 2 toast`, [SupportDeskPageMig.MESSAGE], 'top-right');
        },
      });
      console.log(`  - Toast: ${toast || '(none)'}`);
      // No toast was drawn: the check is still recorded (FAIL), on the list header.
      if (!toastShot) await recordChecks(page, testInfo, checks, [toastCheck(toast)], `${TC} - Step 2 toast`, ['header']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - status applied');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await desk.reloadPage();
      await desk.wait(CommonUtils.waitTimes.long);
      statusesAfter = [];
      historyCounts = [];
      for (const p of probes) {
        statusesAfter.push((await desk.getTicketFields(p.ticketName ?? '')).status);
        const actions = await desk.getTicketHistoryActions(p.ticketName ?? '');
        historyCounts.push(actions.filter((a) => /status/i.test(a) && a.includes(STATUS_PENDING)).length);
      }
      rowTexts = [];
      for (const p of probes) rowTexts.push(await desk.readListRowText(p.subject));
      probes.forEach((p, i) => console.log(`  - ${p.ticketName}: status ${statusesAfter[i]} | status history rows "${STATUS_PENDING}": ${historyCounts[i]} | list row shows "${STATUS_PENDING}": ${rowTexts[i].includes(STATUS_PENDING)}`));
      await recordChecks(page, testInfo, checks, [
        ...probes.map((p, i) => ({
          what: `Probe ${p.ticketName} status after reload`,
          expected: STATUS_PENDING,
          actual: statusesAfter[i] || '(none)',
          passed: statusesAfter[i] === STATUS_PENDING,
        })),
        ...probes.map((p, i) => ({
          what: `Probe ${p.ticketName} has a status history row to ${STATUS_PENDING}`,
          expected: '>= 1 history row "set status to Pending (L1)"',
          actual: `${historyCounts[i]} row(s)`,
          passed: historyCounts[i] >= 1,
        })),
      ], `${TC} - Step 3 status and history after reload`, ['header']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - reloaded');
    });

    // ================= Verification =================
    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log('==================== VERIFY ====================');
      checks.forEach((c, i) => {
        console.log(`  Verify #${i + 1} - ${c.what}:`);
        console.log(`     Expected : ${c.expected}`);
        console.log(`     Actual   : ${c.actual}`);
        console.log(`     Result   : ${c.passed ? 'PASS' : 'FAIL'}`);
      });
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length
        ? `OVERALL: FAIL - ${failed.length} of ${checks.length} checks failed: ${failed.map((c) => c.what).join('; ')}`
        : `OVERALL: PASS - toast "${TOAST}"; the three probes read ${STATUS_PENDING} with a status history row each`);

      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(toast, 'the toast reads 3 ticket(s) changed').toBe(TOAST);
      expect(statusesAfter, 'the three probes read Pending (L1) after the reload').toEqual(Array(PROBES).fill(STATUS_PENDING));
      expect(historyCounts.every((c) => c >= 1), 'each probe has a status history row').toBe(true);
    });
  });
});
