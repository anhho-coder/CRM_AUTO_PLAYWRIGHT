import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 * CRM-12366_4.1.6 - the apps a user can reach on the new base
 * ===========================================================================
 * Test Case ID    : CRM-12366_4.1.6
 * Jira            : CRM-12366  (board row A6, from CRM-12326 E11)
 * Test Repository : CRM test/Migration - Setup New CRM/CRM-12366 - Install Nakivo custom modules on the new Odoo 12 CE (QA verify)/4.1-Install-completeness
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE) - READ-ONLY
 * Automation-Type : rewritten
 * Automation-Date : 2026-09-16
 * STATUS          : SKIPPED since 2026-10-13 - BLOCKED on CRM-12126 comment 706495. See the skip
 *                   block inside the test for the three root menus and the three open questions.
 * Last-revised    : 2026-10-12 - "Feature Request" is removed from the board's absent list, leaving
 *                   13. Khang Nguyen Thai Duy, CRM-13430 (2026-10-09): "nakivo_feature_request is
 *                   installed on crm-mig on purpose. On 2 October it was brought back because
 *                   Production uses it: it is installed on Production, it carries the Feature
 *                   Request app ... The row 'uninstalled, not mandatory, left out by design' on
 *                   CRM-12125 (comment 685775) predates that decision."
 *                   SCOPE OF THAT RULING: it names ONE app. The other root menus this TC reports as
 *                   deviations - Global Search, Dashboards, Subscriptions - are NOT covered by it and
 *                   are deliberately left on the list below. Removing them would make the TC green
 *                   by deleting the question, not by answering it.
 *
 * Summary:
 *   Reads the ROOT MENUS on the new base - the app list a user actually sees - and checks that the
 *   13 apps the board recorded as absent are still absent. Reports the root-menu count against the
 *   recorded baseline so drift surfaces.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_4\\.1\\.6:" --project=O12
 *
 * ---------------------------------------------------------------------------
 * Source manual TC - CRM-12366 board row A6
 * ---------------------------------------------------------------------------
 * Pre-conditions:
 *   _ VPN connected; crm-mig.nakivo.site reachable
 *   _ Login: anh.ho@nakivo.com (admin_crm_mig), db nakivoCE
 *   _ crm-mig is READ-ONLY: this test creates, modifies and deletes nothing
 *
 * Steps to reproduce:
 *   1. Read every root menu (ir.ui.menu with no parent) - this IS the app list.
 *   2. Check each of the 13 apps the board recorded as absent against that list.
 *   3. Report the root-menu count against the recorded baseline (Production 37, new base 24).
 *
 * Expected Result (board row A6):
 *   _ The 13 apps present on Production are absent here (14 on the original board reading, minus
 *     Feature Request, which CRM-13430 confirmed is installed on purpose since 2026-10-02).
 *   _ The split of those 13 into "covered by a capability workstream" vs "install completeness for
 *     this ticket" is DOCUMENTATION, not instance state - see the note under WHAT THIS TC DOES NOT DO.
 *
 * Evidence: stdout only - this TC drives no UI, so the auto-captured screenshot would show an idle
 *   page. Every step is an authenticated JSON-RPC read; the console output IS the artifact.
 *   UI capture is disabled for this spec on purpose.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SPEC WAS REWRITTEN (2026-09-16)
 * ---------------------------------------------------------------------------
 * The first version invented technical module names for the 14 apps (`support_ticket`,
 * `subscriptions`, `email_marketing`, `exhibition`, `sales_report`, `work_calendar`,
 * `feature_request` ...). Eight of them read "NOT FOUND", which means the NAME was wrong, not that
 * the app was absent - so a wrong name scored as a pass. It also tested ir.module.module state,
 * while row A6 is about ROOT MENUS ("Root menus: Production 37, new base 24"). Both were wrong, and
 * the resulting FAIL was not evidence of anything.
 *
 * The app names below are the board's own wording. They are matched against the root-menu NAMES read
 * live from the instance - no technical module name is guessed anywhere in this spec.
 *
 * WHAT THIS TC DOES NOT DO: it does not classify the 13 into "capability workstream" vs "install
 * completeness". That classification lives in the spec's reference table and the PM rulings, not on
 * the instance, so asserting it here would be faking documentation evidence. Exactly one of the 13 is
 * settled in writing - Helpdesk, per CRM-12126 comment 685088 (Aiva, 2026-08-21 07:49 +03:00):
 * "Acceptable - absent here, delivered by CRM-11196." The rest are reported as OPEN.
 */

/**
 * The 13 apps board row A6 records as present on Production and absent on the new base.
 *
 * The board listed 14. "Feature Request" came off on 2026-10-12: CRM-13430 (Khang, 2026-10-09,
 * resolved "Not a bug") confirmed nakivo_feature_request is installed on crm-mig on purpose since
 * 2026-10-02, so its root menu is expected and is no longer a deviation.
 *
 * Only that one name was removed. Any other app this TC reports as present is still an open
 * deviation against the board reading and must be raised on CRM-12126 - no ruling covers them.
 */
const BOARD_ABSENT_APPS = [
  'Helpdesk',
  'Support Ticket Bundle',
  'Subscriptions',
  'Leaves',
  'Email Marketing',
  'Global Search',
  'Dashboards',
  'Exhibitions',
  'Old Sales Report',
  'Work Calendar',
  'Sales payroll',
  'Project',
  'Country Tools',
];

/** Root-menu counts the board recorded on 2026-08-20. Reported as drift, never asserted: the
 *  Production figure cannot be re-measured from here (Production is not this spec's target). */
const BOARD_ROOT_MENU_BASELINE = { production: 37, newBase: 24 };

/** The only one of the 13 whose absence is settled in writing. */
const SETTLED_ABSENCE = {
  Helpdesk: 'ACCEPTED - CRM-12126 comment 685088 (Aiva, 2026-08-21): delivered by CRM-11196',
};

const STEP = {
  pre1:   'Pre-condition: log in on the Migration server',
  s1:     'Step 1: [INTERNAL check, Call API] Read every root menu (ir.ui.menu with no parent) - the app list',
  s2:     'Step 2: [INTERNAL check, Call API] Check each of the 13 board-recorded absent apps against that list',
  s3:     'Step 3: [INTERNAL check, Call API] Report the root-menu count against the recorded baseline',
  verify: 'Verification',
} as const;

// RPC-only spec: no screen is driven, so a screenshot/video would only show an idle page.
test.use({ screenshot: 'off', video: 'off' });

interface RootMenu { id: number; name: string; sequence: number; active: boolean }

/** lowercase words of a menu name, trailing plural stripped, so "Dashboards" and "My Dashboard"
 *  share the token "dashboard". Used ONLY to surface a pair for a human to confirm - never to
 *  decide that two differently-named apps are the same app. */
function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
}

test.describe('CRM-12366_4.1 - Install completeness', () => {

  test('CRM-12366_4.1.6: the 13 apps recorded as absent are absent from the app list', async ({ page }, testInfo) => {
    // ---------------------------------------------------------------------------------------------
    // SKIPPED 2026-10-13, by the tester's decision.
    //
    // Three root menus the board recorded as ABSENT are present on crm-mig, and NO ruling covers
    // any of them, so this case can only report a red that nobody owns:
    //
    //   Subscriptions  id 1436  <- nakivo_subscription_integration
    //   Global Search  id 1438  <- sync_global_search
    //   Dashboards     id 1     <- base / menu_board_root   (core Odoo, on every Odoo 12 instance)
    //
    // Raised as three questions on CRM-12126 comment 706495 (2026-10-13), to Khang Nguyen Thai Duy:
    //   1. does CRM-13431's "sync_global_search is installed on purpose" ruling also cover the app
    //      list in row A6? Its named next step was 4.4.2, not this case.
    //   2. is the Subscriptions app expected on the new base? CRM-13432 is about the client error
    //      that screen raises, not about whether the app belongs in the list.
    //   3. was row A6's "Dashboards" meant to be the core base menu, or "My Dashboard" (id 447,
    //      ks_dashboard_ninja)?
    //
    // NOT skipped because the check is wrong - the check is right and the deviation is real. The
    // board reading it compares against is what cannot be trusted until those three are answered.
    //
    // Undo: when CRM-12126 answers, remove this skip and edit BOARD_ABSENT_APPS to match the
    // answer - do not simply delete the names to get a green.
    // ---------------------------------------------------------------------------------------------
    test.skip(true, 'BLOCKED by an unanswered board question - 3 root menus the board recorded as ABSENT '
      + 'are present on crm-mig (Subscriptions 1436, Global Search 1438, Dashboards 1) and no ruling '
      + 'covers any of them. Asked on CRM-12126 comment 706495 (2026-10-13). Re-enable once answered.');

    test.setTimeout(15 * 60 * 1000);
    await page.setViewportSize({ width: 1600, height: 900 });

    const loginPage = new LoginPageMig(page);
    let roots: RootMenu[] = [];
    let totalMenus = 0;

    console.log('========== CRM-12366_4.1.6 ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
      console.log('  OK - logged in');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const out = await page.evaluate(async () => {
        async function callKw(model: string, method: string, args: any[], kwargs: any = {}) {
          const r = await fetch('/web/dataset/call_kw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } }),
          });
          const j = await r.json();
          if (j.error) throw new Error(String(j.error.data?.message || j.error.message).slice(0, 300));
          return j.result;
        }
        const rows = await callKw('ir.ui.menu', 'search_read',
          [[['parent_id', '=', false]], ['id', 'name', 'sequence', 'active']],
          { limit: 500, context: { ir_ui_menu_full_list: true } });
        const total = await callKw('ir.ui.menu', 'search_count', [[]], {});
        return { rows, total };
      });
      roots = out.rows;
      totalMenus = out.total;

      console.log(`  ir.ui.menu rows in total : ${totalMenus}`);
      console.log(`  Root menus (the app list): ${roots.length}`);
      for (const m of [...roots].sort((a, b) => a.name.localeCompare(b.name))) {
        console.log(`    - ${m.name}  (id ${m.id}, sequence ${m.sequence}, active ${m.active})`);
      }
    });

    const present: string[] = [];
    const similar: Array<{ app: string; looksLike: string }> = [];

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log(`  Checking ${BOARD_ABSENT_APPS.length} apps (board listed 14; "Feature Request" removed by CRM-13430).`);
      const names = roots.map((m) => m.name);
      const lower = names.map((n) => n.toLowerCase());

      for (const app of BOARD_ABSENT_APPS) {
        const exact = lower.indexOf(app.toLowerCase());
        if (exact >= 0) {
          present.push(app);
          console.log(`    ${app}`);
          console.log(`        expected : absent`);
          console.log(`        actual   : PRESENT as root menu "${names[exact]}" (id ${roots[exact].id})`);
          console.log(`        verdict  : DEVIATION from the board reading`);
          continue;
        }
        // Report a near-name rather than deciding it is the same app - e.g. the board says
        // "Dashboards" while the instance carries "My Dashboard". Those may or may not be the
        // same thing; that is a question for Dev, not something this spec should rule on.
        //
        // Match on a SHARED WORD of 5+ characters, after lowercasing and stripping a trailing
        // plural. A naive substring test is useless here: it pairs "Old Sales Report" with "Sales"
        // and "Sales payroll" with "Sales" (noise on the common word "sales") while MISSING
        // "Dashboards" vs "My Dashboard", which is the one pair actually worth a human look.
        const near = names.find((n) => tokens(app).some((t) => t.length >= 5 && tokens(n).includes(t)));
        if (near) {
          similar.push({ app, looksLike: near });
          console.log(`    ${app}`);
          console.log(`        expected : absent`);
          console.log(`        actual   : absent under that exact name, but "${near}" exists - NOT scored, needs confirmation`);
          console.log(`        verdict  : OPEN QUESTION`);
        } else {
          console.log(`    ${app}`);
          console.log(`        expected : absent`);
          console.log(`        actual   : absent`);
          console.log(`        verdict  : matches the board reading`);
        }
      }
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log(`  Board reading 2026-08-20 : Production ${BOARD_ROOT_MENU_BASELINE.production} root menus, new base ${BOARD_ROOT_MENU_BASELINE.newBase}`);
      console.log(`  Measured now             : new base ${roots.length} root menus`);
      const drift = roots.length - BOARD_ROOT_MENU_BASELINE.newBase;
      console.log(`  Drift vs the recorded new-base figure : ${drift > 0 ? '+' : ''}${drift}`);
      console.log(`  NOTE: the Production figure is NOT re-measured here - Production is not this spec's`);
      console.log(`        target and reading it needs its own dev-approved task. It is quoted from the board.`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log('\n==================== VERIFY ====================');

      console.log('Verify #1 - the menu query actually ran:');
      console.log(`  Expected : > 0 root menus read`);
      console.log(`  Actual   : ${roots.length} root menus, ${totalMenus} menu rows in total`);
      console.log(`  Result   : ${roots.length > 0 ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #2 - the ${BOARD_ABSENT_APPS.length} apps the board recorded as absent are absent:`);
      console.log(`  Expected : 0 of the ${BOARD_ABSENT_APPS.length} present as a root menu`);
      console.log(`  Actual   : ${present.length}${present.length ? ' -> ' + present.join(', ') : ''}`);
      console.log(`  Result   : ${present.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #3 - classification of the ${BOARD_ABSENT_APPS.length} (documentation, reported not scored):`);
      for (const app of BOARD_ABSENT_APPS) {
        const settled = (SETTLED_ABSENCE as Record<string, string>)[app];
        console.log(`  ${app.padEnd(24)} : ${settled || 'OPEN - no workstream recorded in writing on CRM-12126'}`);
      }

      if (similar.length) {
        console.log('\n  Near-name matches that need Dev confirmation (NOT scored):');
        for (const s of similar) {
          console.log(`    board "${s.app}"  vs  instance "${s.looksLike}"`);
        }
      }

      console.log('===============================================');
      console.log(
        `OVERALL: ${roots.length > 0 && present.length === 0 ? 'PASS' : 'FAIL'}` +
        ` - ${present.length} of the ${BOARD_ABSENT_APPS.length} board-absent apps are present on the new base`,
      );

      testInfo.annotations.push({
        type: 'partial-coverage',
        description:
          'Only the ABSENCE half of board row A6 is automated. Splitting the 13 apps into ' +
          '"covered by a capability workstream" vs "install completeness" is documentation ' +
          '(spec reference table + PM rulings); only Helpdesk is settled in writing so far.',
      });

      expect(roots.length, 'no root menu was read - the query did not run').toBeGreaterThan(0);
      expect(
        present,
        `app(s) the board recorded as ABSENT are present as root menus on the new base: ${present.join(', ')}. ` +
        'Either the board reading is out of date or something was installed since - raise it on CRM-12126.',
      ).toEqual([]);
    });
  });
});
