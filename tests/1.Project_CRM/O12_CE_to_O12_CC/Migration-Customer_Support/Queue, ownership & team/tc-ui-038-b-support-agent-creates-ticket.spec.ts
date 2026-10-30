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
 *  TC-UI-038_B - Agent creates a ticket - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-UI-038_B   (side B of the A/B row TC-UI-038; side A = tc-ui-038-a-preprod-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-28
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : Support service (https://support-crm-mig.nakivo.site, Frappe Helpdesk - NOT Odoo; ignoreHTTPSErrors)
 * Run as           : L1 agent - Giang Le (giang.le@nakivo.com; HD Agent Support Level = L1, asserted in Pre-condition 1;
 *                    users.support_l1_giang_support_mig). Teardown only: Administrator over the API.
 * Data             : the ticket this case creates (Step 2) and the Contact FF may create for its Raised By address are
 *                    DELETED in afterEach as Administrator (toggles SKIP_CLEANUP_TICKETS / SKIP_CLEANUP_CONTACTS)
 * Folder           : tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support / "Queue, ownership & team" = the Spec
 *                    area (h2) of Confluence page 231246777 whose requirement this case verifies - IS-CRM-FUNC-0265; the
 *                    TC-to-requirement mapping is the automation author's, the CSV carries no link to that page
 * Baseline         : TC-UI-038_A (Jira: not imported to Xray yet; tests/1.Project_CRM/6.Helpdesk_Module/
 *                    Overrall_Helpdesk_Supports_Feature/Queue, ownership & team/tc-ui-038-a-preprod-agent-creates-ticket.spec.ts)
 *                    - same create and the same read-back (CSV Comparison = same); map: helpers/customer-support-mig.baseline-map.ts
 *
 * Summary
 * -------
 * An L1 agent creates a ticket from the New Ticket form with Raised By, priority High and himself as assignee; the ticket
 * must open on its own page with that requester (not the agent), priority, team NAKIVO Customer Support and one assignee.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-ui-038-b-support --grep "TC-UI-038_B:" --project=chromium-headless
 *   (both sides: npx playwright test tc-ui-038- --grep "TC-UI-038_" --project=chromium-headless; --grep @baseline-preprod)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 257 = row TC-UI-038 (Area Ticket screens, lists & search,
 *                   Feature "Agent creates a ticket", High, happy, L1 agent, refs E34, UI-080) - 3 steps
 *  Source version : fingerprint f44d12e93bccc38c = sha256 (16 hex) of the row's Preconditions + Steps + B expected
 *                   + Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the B column (Frappe Helpdesk) - step 2 ("FF:") and step 3; step 1 is the Odoo form (side A)
 *
 *  Pre-conditions (CSV, verbatim: "Agent account; requester address qa.ui1@example.com; test customer 'ACME Test Ltd' if it
 *  exists.")
 *    1. Logged in as an agent - L1 agent Giang Le on the Support service; the L1 tier is read from the HD Agent record
 *    2. [INTERNAL check, Call API] whether the HD Customer 'ACME Test Ltd' exists (it did NOT on 2026-10-28 - then Customer is
 *       left blank, as "if it exists" allows)
 *    Test data deviation: requester qa.ui1.<runId>@example.com and Subject "QA-UI probe 1 <runId>" (run-unique).
 *  Steps to reproduce #1 (CSV, verbatim)
 *    1. Odoo: All Tickets > Create: ... - N/A on side B (the Odoo form - TC-UI-038_A)
 *    2. FF: All Tickets > Create (new ticket form): Subject 'QA-UI probe 1', Raised By qa.ui1@example.com, Customer 'ACME Test
 *       Ltd', Priority High, Assigned to yourself, a short description; create.
 *            - Subject           = QA-UI probe 1 <runId>
 *            - Raised By (Email) = qa.ui1.<runId>@example.com
 *            - Customer          = ACME Test Ltd when it exists, else blank
 *            - Priority          = High
 *            - Assigned to       = Giang Le (yourself)
 *            - Description       = Automated check of TC-UI-038_B (agent creates a ticket) - created and deleted by this run.
 *    3. Open the new ticket and read requester, customer, priority, team and assignee.
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    Ticket created with Raised By = qa.ui1@example.com (not the agent), the chosen customer and priority, team NAKIVO Customer
 *    Support and exactly one assignee (you); it opens on its ticket page. Known minor: with an unknown requester the Contact
 *    stays empty.
 *
 *  "Known minor" is a remark, not an expected result: the Contact is printed as an Observation (batch 1 measured that FF
 *  CREATES a Contact for a new Raised By address).
 *
 * Evidence: Pre-condition 1 end shot; Step 2 end shot; Step 3 verify shot (the side panel); afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true }); // the Support service serves a self-signed certificate chain

const TC = 'TC-UI-038_B';
const SOURCE_ROW = 'TC-UI-038';
const SOURCE_FINGERPRINT = 'f44d12e93bccc38c';
const SKIP_CLEANUP_TICKETS = false; // true keeps the created ticket (otherwise deleted as Administrator in afterEach)
const SKIP_CLEANUP_CONTACTS = false; // true keeps the Contact FF created for the Raised By address

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Agent account - Support service (Frappe Helpdesk) /login as L1 agent Giang Le; [INTERNAL check, Call API] the HD Agent of this account reads Support Level = L1',
  pre2: "Pre-condition 2: [INTERNAL check, Call API] test customer 'ACME Test Ltd' if it exists (HD Customer lookup)",
  s1: 'Step 1: [N/A on side B - the Odoo create form belongs to TC-UI-038_A] Odoo: All Tickets > Create ...; Save.',
  s2: "Step 2: FF: All Tickets > Create (new ticket form): Subject 'QA-UI probe 1', Raised By qa.ui1@example.com, Customer 'ACME Test Ltd', Priority High, Assigned to yourself, a short description; create. (run-unique subject and e-mail; Customer only when it exists)",
  s3: 'Step 3: Open the new ticket and read requester, customer, priority, team and assignee.',
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_support_mig;
const ADMIN = users.admin_support_mig;
const CS_TEAM = 'NAKIVO Customer Support';
const ACME = 'ACME Test Ltd';

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
 * One call per OWNING element: `highlight` is the element the checks read; the outline colour is the verdict of THESE
 * checks only. `corner` keeps the banner off the outlined element.
 */
async function recordChecks(
  page: Page,
  testInfo: TestInfo,
  all: Check[],
  stepChecks: Check[],
  name: string,
  highlight: string[] = [],
  corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'top-left'
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

test.describe(`${TC} - Agent creates a ticket on the Support service`, () => {
  let probe: SupportProbe | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    probe = null;
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_B, SOURCE_FINGERPRINT);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---');
    let cleanupError = '';
    try {
      if (!probe) {
        console.log('  - No ticket was created by this run - nothing to clean up');
      } else if (SKIP_CLEANUP_TICKETS) {
        console.log(`  - SKIP_CLEANUP_TICKETS = true: ticket kept - ${probe.ticketName ?? '?'} "${probe.subject}"`);
      } else {
        console.log(`  - Deleting this run's data as ${ADMIN.username} (API, deny-list by this run's markers):`);
        const lines = await deleteSupportProbeAsAdmin(baseUrl_support_mig, ADMIN, {
          ticketName: probe.ticketName,
          subject: probe.subject,
          contactEmail: SKIP_CLEANUP_CONTACTS ? undefined : probe.contactEmail,
        });
        for (const l of lines) console.log(`  - ${l}`);
      }
    } catch (e) {
      cleanupError = e instanceof Error ? e.message : String(e);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (cleanupError) throw new Error(`afterEach cleanup: ${cleanupError}`);
  });

  test(`${TC}: Agent creates a ticket - B: Frappe Helpdesk keeps the requester, priority, team CS and one assignee, and opens the ticket`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA-UI probe 1 ${runId}`;
    const raisedBy = `qa.ui1.${runId}@example.com`;
    const description = `Automated check of ${TC} (agent creates a ticket) - created and deleted by this run.`;
    let acmeExists = false;
    let ticketName = '';
    let landedOn = '';

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : Support service (${baseUrl_support_mig})`);
      console.log(`  - Login : ${AGENT.username} (${AGENT.displayName})`);
      await desk.login(baseUrl_support_mig, AGENT.username, AGENT.password);
      const agent = await desk.getMyAgentLevel(AGENT.username);
      console.log(`  [INTERNAL check, Call API] support level = ${agent.level || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Giang Le');
      expect(agent.level, 'the signed-in agent is an L1 agent (HD Agent Support Level = L1)').toBe('L1');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      acmeExists = await desk.hdCustomerExists(ACME);
      console.log(`  - HD Customer "${ACME}" exists : ${acmeExists} -> Customer ${acmeExists ? `= ${ACME}` : 'left blank'}`);
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      console.log('  - N/A on side B: the Odoo form is driven by TC-UI-038_A');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log('  New ticket data:');
      console.log(`     Subject           = ${subject}`);
      console.log(`     Raised By (Email) = ${raisedBy}`);
      console.log(`     Customer          = ${acmeExists ? ACME : 'blank (no such HD Customer)'}`);
      console.log('     Priority          = High');
      console.log(`     Assigned to       = ${AGENT.displayName} (yourself)`);
      console.log(`     Description       = ${description}`);
      probe = { subject, contactEmail: raisedBy };
      await desk.openAllTicketsFromSidebar();
      ticketName = await desk.createTicketFromList({ raisedBy, subject, description, priority: 'High', assignedTo: AGENT.displayName, customer: acmeExists ? ACME : undefined });
      probe.ticketName = ticketName;
      landedOn = new URL(page.url()).pathname;
      console.log(`  - Created ${ticketName}; the browser is on ${landedOn}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - Step 2 ticket created');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const doc = await desk.readTicketDocument(ticketName);
      const who = await desk.getAssigneeInfo(ticketName);
      const rows = await desk.getSidePanelRows();
      const row = (l: string) => rows.find((r) => r.label === l)?.value ?? '(row not shown)';
      const assignees = new Set<string>([
        ...String(who.assignField || '').replace(/[[\]"]/g, '').split(',').map((s) => s.trim()).filter(Boolean),
        ...who.openTodos.map((t) => t.split(':')[0]),
      ]);
      console.log('  Read on the ticket (side panel | stored):');
      console.log(`     requester (Raised By) = ${String(doc.raised_by || '(empty)')}`);
      console.log(`     customer              = ${row('Customer')} | ${String(doc.customer || '(empty)')}`);
      console.log(`     priority              = ${row('Priority')} | ${String(doc.priority || '')}`);
      console.log(`     team                  = ${row('Team')} | ${String(doc.agent_group || '')}`);
      console.log(`     assignee(s)           = ${row('Assignee')} | ${[...assignees].join(', ') || '(none)'}`);
      console.log(`  Observation (not scored) - Contact: "${String(doc.contact || '')}" (the CSV's "known minor": empty for an unknown requester)`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 it opens on its ticket page', expected: `/helpdesk/tickets/${ticketName}`, actual: landedOn, passed: landedOn === `/helpdesk/tickets/${ticketName}` },
        { what: 'Step 3 requester', expected: `Raised By = ${raisedBy} (not the agent ${AGENT.username})`, actual: String(doc.raised_by || '(empty)'), passed: doc.raised_by === raisedBy },
        { what: 'Step 3 customer', expected: acmeExists ? ACME : 'empty (no customer was chosen - ACME Test Ltd does not exist)', actual: String(doc.customer || '(empty)'), passed: acmeExists ? doc.customer === ACME : !doc.customer },
        { what: 'Step 3 priority', expected: 'High', actual: String(doc.priority || ''), passed: doc.priority === 'High' },
        { what: 'Step 3 team', expected: CS_TEAM, actual: String(doc.agent_group || '(empty)'), passed: doc.agent_group === CS_TEAM },
        { what: 'Step 3 exactly one assignee (you)', expected: AGENT.username, actual: [...assignees].join(', ') || '(none)', passed: assignees.size === 1 && assignees.has(AGENT.username) },
      ], `${TC} - Step 3 ticket fields`, ['body']);
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
        : 'OVERALL: PASS - the ticket opens on its page with the requester, priority High, team NAKIVO Customer Support and one assignee (you)');
      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(failed.map((c) => c.what), 'the created ticket carries the requester, priority, team and one assignee').toEqual([]);
    });
  });
});
