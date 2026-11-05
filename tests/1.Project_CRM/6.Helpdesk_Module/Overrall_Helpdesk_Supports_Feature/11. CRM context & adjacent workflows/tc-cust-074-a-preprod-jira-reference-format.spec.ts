import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-CUST-074_A - Jira reference accepts only a /browse/ URL and opens the issue - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-CUST-074_A   (side B = tc-cust-074-b-support-jira-reference-format.spec.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-04
 * Jira             : CRM-13955 (Xray Test, feature CRM-11859)
 * Host / Run as    : pre-production Odoo 12 / L2 engineer Nam Pham (users.support_l2_manager_nam, Support Team = l2 asserted)
 * Data             : one probe ticket of this run, archived in afterEach. The test Jira host (jira.example.com) is answered by a stub page of
 *                    the run, so no Jira call is made (the TC: "No Jira call is made by these steps")
 * Folder           : "11. CRM context & adjacent workflows" (master divider)
 *
 * Summary: Jira reference = a bare key or a non-/browse/ URL must be refused with the format message; a /browse/ URL must
 * be saved, drawn as the key, and its click must open that URL in a new tab.
 *
 * Command to run: npx playwright test tc-cust-074-a-preprod --grep "TC-CUST-074_A:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, row TC-CUST-074; Comparison = same. Xray CRM-13955: 4 steps
 *  Source version   : fingerprint eb992e354d7ece62 of Preconditions + Steps + A expected + Test data (beforeEach)
 *  Pre-conditions (master, verbatim)
 *    Role: L2 engineer. A probe ticket. No Jira call is made by these steps. Test data: ITSM-123 (test project key).
 *    1. Logged in as L2 engineer Nam Pham on pre-production
 *    2. [INTERNAL setup, Call API] the probe ticket of this run:
 *         Subject     = AUTO-CRM-11859-TC-CUST-074_A-<runId>
 *         Team        = Customer Support
 *         Assigned to = Nam Pham
 *         Requester   = qa.cust074@example.com
 *       <test jira host> = jira.example.com (author's choice - a reserved name; the run answers it with a stub page)
 *  Steps to reproduce (Odoo form: EDIT, field Jira reference, SAVE)
 *    1. Set Jira reference = 'ITSM-123' (bare key) and Save.
 *    2. Set Jira reference = 'https://jira.example.com/issues/ITSM-123' and Save.
 *    3. Set Jira reference = 'https://<test jira host>/browse/ITSM-123' and Save.
 *    4. A: click the URL widget.
 *  Verification - A expected (Odoo 12), verbatim
 *    Steps 1-2 refused 'Wrong format, please check url, it must be in format - connection protocol://address:port/browse/target-name.';
 *    step 3 saved and shown as the key; the click opens the issue.
 *
 *  How it is compared: steps 1-2 - the dialog holds the message verbatim and nothing is stored (the edit is discarded after
 *  the dialog is closed); step 3 - stored URL = the typed one, the widget draws "ITSM-123"; step 4 - the tab it opens has that
 *  URL ("opens the issue"; the address is answered by a stub page).
 *
 * Evidence: Pre-condition 1 + 2 end shots; Steps 1-2 verify shots (the refusal dialog, before it is closed); Step 3 + 4 verify
 *           shots (the Jira reference row); afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-CUST-074_A';
const SOURCE_ROW = 'TC-CUST-074';
const SOURCE_FINGERPRINT = 'eb992e354d7ece62';
const SKIP_CLEANUP = false; // true keeps the probe ticket for inspection

const STEP = {
  pre1: 'Pre-condition 1: Logged in as L2 engineer Nam Pham on pre-production (Odoo 12 EE); [INTERNAL check, Call API] Support Team = l2',
  pre2: 'Pre-condition 2: [INTERNAL setup, Call API] A probe ticket of this run (Customer Support, assigned to Nam Pham); the test Jira host jira.example.com is answered by a stub page (no Jira call)',
  s1: "Step 1: Set Jira reference = 'ITSM-123' (bare key) and Save. (Odoo form: EDIT, Jira reference, SAVE - Odoo already refuses when the field is left, before SAVE)",
  s2: "Step 2: Set Jira reference = 'https://jira.example.com/issues/ITSM-123' and Save.",
  s3: "Step 3: Set Jira reference = 'https://<test jira host>/browse/ITSM-123' and Save. (<test jira host> = jira.example.com)",
  s4: 'Step 4: A: click the URL widget.',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_manager_nam;
const FIELD = 'jira_edit_mode_field';
const MESSAGE = 'Wrong format, please check url, it must be in format - connection protocol://address:port/browse/target-name.';
const GOOD = 'https://jira.example.com/browse/ITSM-123';
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const SUBJECT = `AUTO-CRM-11859-${TC}-${RUN}`;

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
const sp = (s: string): string => (s || '').replace(/\s+/g, ' ').trim();

test.describe(`${TC} - Jira reference format on Odoo 12 pre-production`, () => {
  const probe = { id: 0 };

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_A, SOURCE_FINGERPRINT);
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---');
    if (probe.id && !SKIP_CLEANUP) console.log(`  - probe #${probe.id} archived: ${await new HelpdeskPage(page).archiveTicketByIdOverRpc(probe.id, SUBJECT).catch((e) => `NOT ARCHIVED ${String(e).split('\n')[0]}`)}`);
    else if (probe.id) console.log(`  - SKIP_CLEANUP: probe #${probe.id} kept`);
    probe.id = 0;
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Jira reference accepts only a /browse/ URL and opens the issue - A: Odoo 12 refuses a bare key and an /issues/ URL, keeps a /browse/ URL drawn as the key`, async ({ page, context }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    // the test Jira host answers a stub page from the run itself - no request leaves the browser (no Jira call)
    await context.route(/jira\.example\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>stub Jira page of the automation run</body></html>' }));
    const loginPage = new LoginPage(page);
    const hp = new HelpdeskPage(page);
    const checks: Check[] = [];

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${ENGINEER.username} on ${baseUrl}`);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(ENGINEER.username, ENGINEER.password, CommonUtils.waitTimes.pageLoad);
      await loginPage.dismissLocationPermissionDialog();
      const me = await hp.getMyEmployeeSupportTeam();
      console.log(`  [INTERNAL check, Call API] support_team = ${me.supportTeam || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Nam Pham');
      expect(me.supportTeam, 'the signed-in account is an L2 engineer').toBe('l2');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      try {
        const team = (await hp.searchIdsOverRpc('helpdesk.team', [['name', '=', 'Customer Support']], 1))[0];
        const uid = (await hp.searchIdsOverRpc('res.users', [['login', '=', ENGINEER.username]], 1))[0];
        probe.id = await hp.createTicketOverRpc({ name: SUBJECT, team_id: team, user_id: uid, partner_email: 'qa.cust074@example.com' });
        console.log(`  - probe #${probe.id}:\n       Subject     = ${SUBJECT}\n       Team        = Customer Support\n       Assigned to = Nam Pham\n       Requester   = qa.cust074@example.com`);
        await hp.openTicketById(baseUrl, String(probe.id));
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
        await hp.clickEditTicket();
        await hp.setFormInputByName(FIELD, value);
        // Odoo checks the format as soon as the field is left (onchange) - the refusal dialog can already cover SAVE
        let dlg = sp(await hp.getShownDialogText());
        if (!dlg) { await hp.clickSaveTicket().catch((e) => console.log(`  - SAVE: ${String(e).split('\n')[0]}`)); dlg = sp(await hp.getShownDialogText()); }
        const stored = await hp.readTicketOverRpc(probe.id, [FIELD]);
        console.log(`  - dialog: "${dlg}"\n  - [INTERNAL check, Call API] stored ${FIELD} = ${JSON.stringify(stored[FIELD])}`);
        await recordChecks(page, testInfo, checks, [
          { what: `${label.split(':')[0]} "${value}" refused with the format message`, expected: `"${MESSAGE}", nothing stored`, actual: `dialog "${dlg || '(none)'}", stored ${JSON.stringify(stored[FIELD])}`,
            passed: dlg.includes(MESSAGE) && !stored[FIELD], difference: [dlg.includes(MESSAGE) ? '' : `message not shown (dialog "${dlg || 'none'}")`, stored[FIELD] ? `stored "${stored[FIELD]}"` : ''].filter(Boolean).join('; ') },
        ], `${TC} - ${label.split(':')[0]} refused`, ['.modal.show .modal-content']);
        if (dlg) await hp.closeShownDialog();
        await hp.discardTicketEdits().catch(() => {});
      });
    }

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await hp.clickEditTicket();
      await hp.setFormInputByName(FIELD, GOOD);
      const saved = await hp.clickSaveTicket();
      const dlg = sp(await hp.getShownDialogText());
      const stored = await hp.readTicketOverRpc(probe.id, [FIELD, 'jira_save_mode_field']);
      const link = await hp.readFieldLink(FIELD);
      console.log(`  - saved ${saved}, dialog "${dlg || '(none)'}"; widget "${link.text}" -> ${link.href} (target ${link.target}); [INTERNAL check, Call API] stored ${JSON.stringify(stored)}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 saved and shown as the key', expected: `stored "${GOOD}", drawn "ITSM-123"`, actual: `stored "${stored[FIELD]}", drawn "${link.text}"${dlg ? `, dialog "${dlg}"` : ''}`,
          passed: stored[FIELD] === GOOD && link.text === 'ITSM-123' && !dlg, difference: `stored "${stored[FIELD]}", drawn "${link.text}"${dlg ? `, dialog "${dlg}"` : ''}` },
      ], `${TC} - Step 3 saved`, [HelpdeskPage.FORM_FIELD]);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      const opened = await hp.clickFieldLinkForNewTab(FIELD);
      await hp.readFieldLink(FIELD);
      console.log(`  - new tab: ${opened || '(none)'}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 the click opens the issue', expected: `a new tab on ${GOOD}`, actual: opened ? `new tab on ${opened}` : 'no new tab', passed: opened === GOOD, difference: opened ? `opened ${opened}` : 'no tab opened' },
      ], `${TC} - Step 4 link opened`, [HelpdeskPage.FORM_FIELD]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Jira reference set and opened');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference}`).join(' | ')}` : 'OVERALL: PASS - only a /browse/ URL is kept, drawn as the key, and it opens');
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference || `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(failed.map((c) => c.what), 'the Jira reference format rule holds').toEqual([]);
    });
  });
});
