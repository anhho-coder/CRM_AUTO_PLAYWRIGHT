import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { MigPlatformPage } from '@pages/mig/MigPlatformPage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ========== CRM-12366_4.5.4 ==========
 * Test Case ID    : CRM-12366_4.5.4
 * Jira            : CRM-12366
 * Test Repository : CRM test/Migration - Setup New CRM/CRM-12366 - Install Nakivo custom modules on the new Odoo 12 CE (QA verify)/4.5 No reference to a removed capability
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE) - READ-ONLY
 * Automation-Type : rewritten
 * Automation-Date : 2026-09-17
 *
 * Summary:
 *   Verify the instance is in the state the Helpdesk leave-out record describes - no module of the
 *   helpdesk family is installed - and report the record itself, which lives in the spec reference
 *   table and in PM's ruling, not in an Odoo model.
 *
 * WHY THIS WAS REWRITTEN (2026-09-17):
 *   The spec used to be test.skip() because the leave-out record IS-CRM-FUNC-0028 asks for is a
 *   DOCUMENTED record - a named owner and the workstream that delivers the capability instead - and
 *   there is nothing on the instance to assert about it. A skipped test is invisible in a report.
 *
 *   It now runs, and splits the case in two:
 *     - the INSTANCE half is SCORED: no module whose name carries "helpdesk" is installed, and the
 *       Enterprise `helpdesk` module itself is present only as uninstallable on this Community base;
 *     - the DOCUMENTATION half is REPORTED, never scored, and the test carries a `blocked`
 *       annotation so a green can never be read as "the leave-out record has been verified".
 *
 * THE RULING THIS ROW RESTS ON:
 *   Aiva Nievierova, CRM-12126 comment 685088 (2026-08-21 07:49 +03:00), answer #4, verbatim:
 *     "Acceptable - absent here, delivered by CRM-11196. Customer support / ticketing is a
 *      capability taken out of the CRM per the spec's reference table, with a named owner as
 *      IS-CRM-FUNC-0028 requires, so the missing Helpdesk does not block acceptance of this ticket.
 *      Two checks still apply here: the leave-out record under IS-CRM-FUNC-0027 for the modules not
 *      carried, and the IS-CRM-FUNC-0014 check that nothing installed still references the absent
 *      capability."
 *
 *   This is the ONLY absence accepted in writing on CRM-12126. The destination workstream is
 *   CRM-11196. Reading the reference table itself is a documentation step and is not automated here.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_4\\.5\\.4:" --project=O12
 *
 * Source manual TC (rewritten):
 *   Pre-conditions:
 *     - VPN connected and crm-mig.nakivo.site reachable
 *     - Login as anh.ho@nakivo.com (admin_crm_mig), db nakivoCE
 *     - crm-mig is READ-ONLY for this TC: it creates, modifies and deletes nothing
 *     - A leave-out record is a DOCUMENTED record in the spec reference table, not an Odoo model
 *
 *   Steps:
 *     1. Use the account of Admin to login successful.
 *     2. Read every module whose technical name carries "helpdesk" and record its state.
 *     3. Confirm none of them is installed.
 *     4. Confirm the Enterprise helpdesk module itself is not installable on this Community base.
 *     5. Print the PM ruling that accepts the absence and names CRM-11196 as the destination, and
 *        mark that half NOT SCORED.
 *
 *   Expected:
 *     - At least one module of the helpdesk family is found, so the query is proved to have run
 *     - Zero modules of the helpdesk family are installed
 *     - The Enterprise helpdesk module is present as uninstallable, not as installed
 *     - The documentation half - owner and destination workstream - is reported NOT SCORED
 * Evidence: stdout only - this TC drives no UI, so the auto-captured screenshot would
 *   show an idle page. Every step below is an authenticated JSON-RPC read; the console
 *   output IS the artifact. UI capture is disabled for this spec on purpose.
 */

// RPC-only spec: no screen is driven, so a screenshot/video would only show an idle page.
test.use({ screenshot: 'off', video: 'off' });

/** The capability's destination, per the spec reference table and PM's ruling. */
const DESTINATION_WORKSTREAM = 'CRM-11196';

/** States that mean the module cannot be running on this base. */
const NOT_RUNNING_STATES = ['uninstalled', 'uninstallable', 'to install'] as const;

interface HelpdeskModule {
  name: string;
  state: string;
  license: string;
}

test.describe('CRM-12366_4.5.4 - Helpdesk leave-out record', () => {
  const STEP = {
    pre1: 'Pre-condition: log in on the Migration server',
    s1: 'Step 2-3: [INTERNAL check, Call API] Read every module of the helpdesk family and its state',
    s2: 'Step 4: [INTERNAL check, Call API] Confirm the Enterprise helpdesk module is not installable on this CE base',
    s3: 'Step 5: [INTERNAL check, Call API] Report the accepted-absence ruling - documentation, NOT scored',
    verify: 'Verification',
  } as const;

  test('CRM-12366_4.5.4: Verify the instance matches the Helpdesk leave-out record and report the record', async ({ page }, testInfo) => {
    test.setTimeout(15 * 60 * 1000);
    await page.setViewportSize({ width: 1600, height: 900 });

    const loginPage = new LoginPageMig(page);
    const migPlatform = new MigPlatformPage(page);

    console.log('========== CRM-12366_4.5.4 ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
      console.log('  OK - logged in');
    });

    const family = await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);

      const rows: HelpdeskModule[] = await migPlatform.callKw(
        'ir.module.module',
        'search_read',
        [[['name', 'like', 'helpdesk']]],
        { fields: ['name', 'state', 'license'], limit: 200, order: 'name asc' },
      );

      console.log(`  modules whose technical name carries "helpdesk" : ${rows.length}`);
      rows.forEach((r) => console.log(`    ${r.name.padEnd(38)} ${r.state.padEnd(14)} ${r.license}`));

      const installed = rows.filter((r) => r.state === 'installed').map((r) => r.name);
      console.log(`  installed : ${installed.length}${installed.length ? ' -> ' + installed.join(', ') : ''}`);

      return { rows, installed };
    });

    const core = await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);

      const row = family.rows.find((r) => r.name === 'helpdesk');
      if (!row) {
        console.log('  the Enterprise helpdesk module row is NOT present on this base');
        return { present: false, state: '(not present)', license: '', notRunning: true };
      }

      const notRunning = (NOT_RUNNING_STATES as readonly string[]).includes(row.state);
      console.log(`  helpdesk : state=${row.state}  license=${row.license}`);
      console.log(`  not runnable on this base : ${notRunning}`);
      if (row.state === 'uninstallable') {
        console.log('  NOTE: "uninstallable" is stronger than "not installed" - the module cannot be');
        console.log('        installed on a Community base at all, which is the reason Dev gave on');
        console.log('        CRM-12126 comment 685484 for dropping the helpdesk-dependent modules.');
      }
      return { present: true, state: row.state, license: row.license, notRunning };
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log('  The leave-out record IS-CRM-FUNC-0028 asks for is a DOCUMENTED record in the spec');
      console.log('  reference table (pageId 222530772). It is NOT an Odoo model, so nothing below is scored.\n');
      console.log('  Aiva Nievierova, CRM-12126 comment 685088 (2026-08-21 07:49 +03:00), answer #4, verbatim:');
      console.log('    "Acceptable - absent here, delivered by CRM-11196. Customer support / ticketing is a');
      console.log("     capability taken out of the CRM per the spec's reference table, with a named owner as");
      console.log('     IS-CRM-FUNC-0028 requires, so the missing Helpdesk does not block acceptance of this');
      console.log('     ticket."');
      console.log(`\n  Destination workstream recorded : ${DESTINATION_WORKSTREAM}`);
      console.log('  Owner named in the reference table : NOT READ BY THIS TC - documentation step');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log(`\n==================== VERIFY ====================`);

      console.log(`Verify #1 - the query actually found the helpdesk family:`);
      console.log(`   Expected : >= 1 module whose name carries "helpdesk"`);
      console.log(`   Actual   : ${family.rows.length}`);
      console.log(`   Result   : ${family.rows.length >= 1 ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #2 - no module of the helpdesk family is installed:`);
      console.log(`   Expected : 0 installed`);
      console.log(`   Actual   : ${family.installed.length}${family.installed.length ? ' -> ' + family.installed.join(', ') : ''}`);
      console.log(`   Result   : ${family.installed.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #3 - the Enterprise helpdesk module cannot run on this CE base:`);
      console.log(`   Expected : a state in ${NOT_RUNNING_STATES.join(' / ')}, or absent`);
      console.log(`   Actual   : ${core.state}${core.license ? ' (' + core.license + ')' : ''}`);
      console.log(`   Result   : ${core.notRunning ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #4 - the leave-out record itself:`);
      console.log(`   Expected : a named owner and the destination workstream in the spec reference table`);
      console.log(`   Actual   : destination ${DESTINATION_WORKSTREAM} is named in CRM-12126 comment 685088;`);
      console.log(`              the owner field is in the reference table and is not read here`);
      console.log(`   Result   : NOT SCORED - the evidence is documentation, not instance state`);

      console.log(`\nNOTE: the instance half above is scored. The record itself is NOT. A green run means`);
      console.log(`      only that the instance is in the state the record describes - it does not verify`);
      console.log(`      that the record exists or that it names an owner. This is the ONLY absence`);
      console.log(`      accepted in writing on CRM-12126.`);
      console.log(`===============================================`);

      const instanceHalf = family.rows.length >= 1 && family.installed.length === 0 && core.notRunning;
      console.log(`OVERALL: ${instanceHalf ? 'PASS' : 'FAIL'} (instance half) - documentation half is NOT SCORED`);

      testInfo.annotations.push({
        type: 'blocked',
        description:
          'IS-CRM-FUNC-0028 is NOT SCORED here - the leave-out record is a documented record in the spec ' +
          'reference table (pageId 222530772), not instance state, and its owner field is not read by this ' +
          'test. A green run means only that no helpdesk module is installed, which is the state the record ' +
          `describes. The destination workstream is ${DESTINATION_WORKSTREAM}, per CRM-12126 comment 685088.`,
      });

      expect(family.rows.length, 'no helpdesk-family module was found - the query did not really run').toBeGreaterThanOrEqual(1);
      expect(family.installed, 'a module of the helpdesk family is installed on the new base').toEqual([]);
      expect(core.notRunning, 'the Enterprise helpdesk module is in a state that can run on this base').toBe(true);
    });
  });
});
