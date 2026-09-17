import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { MigPlatformPage } from '@pages/mig/MigPlatformPage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ========== CRM-12366_4.5.3 ==========
 * Test Case ID    : CRM-12366_4.5.3
 * Jira            : CRM-12366
 * Test Repository : CRM test/Migration - Setup New CRM/CRM-12366 - Install Nakivo custom modules on the new Odoo 12 CE (QA verify)/4.5 No reference to a removed capability
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE) - READ-ONLY
 * Automation-Type : rewritten
 * Automation-Date : 2026-09-17
 *
 * Summary:
 *   Verify the six modules Dev classified as DELIBERATELY uninstalled are present on the base
 *   and genuinely not installed, and report which of them still owes its IS-CRM-FUNC-0027
 *   leave-out record.
 *
 * WHY THIS WAS REWRITTEN (2026-09-17):
 *   The spec used to be test.skip() because a leave-out record is a DOCUMENTED record - it lives
 *   in the spec reference table (pageId 222530772) and in the Dev answers on CRM-12126, not in an
 *   Odoo model - so there was nothing on the instance to assert. A skipped test is invisible in a
 *   report, which hid the fact that this row is owed anything at all.
 *
 *   It now runs, and splits the case in two:
 *     - the INSTANCE half is SCORED: the six modules exist and are uninstalled;
 *     - the DOCUMENTATION half is REPORTED, never scored, and the test carries a `blocked`
 *       annotation so a green can never be read as "the leave-out records exist".
 *
 * THE SIX, AND WHERE THEIR RECORD STANDS:
 *   Khang Nguyen Thai Duy, CRM-12126 comment 687015 (2026-08-26), item 8 - of the 51 present but
 *   uninstalled modules, 6 are "In the branch, deliberately uninstalled":
 *     nakivo_country_tools, nakivo_contact_bottle_neck, nakivo_kpi_it, plus the three payroll ones.
 *
 *   The three payroll modules DO carry a reason. Aiva Nievierova, CRM-12126 comment 687425
 *   (2026-08-27): "3 payroll modules are dormant per the Production measurements of 2026-08-21,
 *   which is what IS-CRM-FUNC-0024/0025 require to be left out; the file's reasons are their
 *   IS-CRM-FUNC-0027 leave-out records."
 *
 *   The other three do NOT. Khang, comment 687015, closing point 3, verbatim:
 *     "Still owed - the three leave-out records follow once dormancy is measured on Production,
 *      same method as the payroll trio"
 *
 *   So this TC is BLOCKED on the documentation half until those three reasons are supplied. It is
 *   never PASS and never FAIL on that half.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_4\\.5\\.3:" --project=O12
 *
 * Source manual TC (rewritten):
 *   Pre-conditions:
 *     - VPN connected and crm-mig.nakivo.site reachable
 *     - Login as anh.ho@nakivo.com (admin_crm_mig), db nakivoCE
 *     - crm-mig is READ-ONLY for this TC: it creates, modifies and deletes nothing
 *     - A leave-out record is a DOCUMENTED record in the spec reference table and in the
 *       CRM-12126 answers, not an Odoo model. Do not look for it in Technical > Database Structure.
 *
 *   Steps:
 *     1. Use the account of Admin to login successful.
 *     2. Read the module registry and locate the six modules Dev classified as deliberately
 *        uninstalled on CRM-12126 comment 687015 item 8.
 *     3. Confirm each of the six is present on the base and its state is not installed.
 *     4. Print, per module, whether its IS-CRM-FUNC-0027 leave-out record exists in writing.
 *     5. Report the documentation half as BLOCKED while any of the three named modules still
 *        owes its reason, and annotate the test so a green is not misread.
 *
 *   Expected:
 *     - All 6 modules are present in the registry
 *     - All 6 report a state other than installed
 *     - The module registry was really scanned: more than 200 module rows were read
 *     - The documentation half is reported NOT SCORED - it is never counted as a pass
 * Evidence: stdout only - this TC drives no UI, so the auto-captured screenshot would
 *   show an idle page. Every step below is an authenticated JSON-RPC read; the console
 *   output IS the artifact. UI capture is disabled for this spec on purpose.
 */

// RPC-only spec: no screen is driven, so a screenshot/video would only show an idle page.
test.use({ screenshot: 'off', video: 'off' });

/**
 * The six modules Dev classified as deliberately uninstalled - CRM-12126 comment 687015 item 8.
 * `recordInWriting` is whether an IS-CRM-FUNC-0027 leave-out reason exists TODAY, per the ticket.
 */
const DELIBERATELY_UNINSTALLED = [
  { name: 'nakivo_sales_payroll_automation', recordInWriting: true, source: 'CRM-12126_mandatory_modules_revised.txt, confirmed by Aiva comment 687425' },
  { name: 'nakivo_sales_payroll_logging', recordInWriting: true, source: 'CRM-12126_mandatory_modules_revised.txt, confirmed by Aiva comment 687425' },
  { name: 'nakivo_sales_payroll_v2', recordInWriting: true, source: 'CRM-12126_mandatory_modules_revised.txt, confirmed by Aiva comment 687425' },
  { name: 'nakivo_country_tools', recordInWriting: false, source: 'Khang comment 687015: "Still owed"' },
  { name: 'nakivo_contact_bottle_neck', recordInWriting: false, source: 'Khang comment 687015: "Still owed"' },
  { name: 'nakivo_kpi_it', recordInWriting: false, source: 'Khang comment 687015: "Still owed"' },
] as const;

/** Proves the registry query reached the table rather than returning an empty page. */
const MODULE_SCAN_FLOOR = 200;

interface ModuleState {
  name: string;
  present: boolean;
  state: string;
  shortdesc: string;
  recordInWriting: boolean;
  source: string;
}

test.describe('CRM-12366_4.5.3 - Leave-out records for the deliberately uninstalled modules', () => {
  const STEP = {
    pre1: 'Pre-condition: log in on the Migration server',
    s1: 'Step 2-3: [INTERNAL check, Call API] Locate the six deliberately uninstalled modules and read their state',
    s2: 'Step 4-5: [INTERNAL check, Call API] Report the IS-CRM-FUNC-0027 leave-out record of each - documentation, NOT scored',
    verify: 'Verification',
  } as const;

  test('CRM-12366_4.5.3: Verify the deliberately uninstalled modules are uninstalled and report their leave-out records', async ({ page }, testInfo) => {
    test.setTimeout(15 * 60 * 1000);
    await page.setViewportSize({ width: 1600, height: 900 });

    const loginPage = new LoginPageMig(page);
    const migPlatform = new MigPlatformPage(page);

    console.log('========== CRM-12366_4.5.3 ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
      console.log('  OK - logged in');
    });

    const scan = await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);

      const scanned: number = await migPlatform.callKw('ir.module.module', 'search_count', [[]], {});
      console.log(`  module rows on the instance : ${scanned}`);

      const rows: Array<{ name: string; state: string; shortdesc: string }> = await migPlatform.callKw(
        'ir.module.module',
        'search_read',
        [[['name', 'in', DELIBERATELY_UNINSTALLED.map((m) => m.name)]]],
        { fields: ['name', 'state', 'shortdesc'], limit: 50 },
      );
      const byName = new Map(rows.map((r) => [r.name, r]));

      const states: ModuleState[] = DELIBERATELY_UNINSTALLED.map((m) => {
        const row = byName.get(m.name);
        return {
          name: m.name,
          present: Boolean(row),
          state: row ? row.state : '(not present)',
          shortdesc: row ? row.shortdesc : '',
          recordInWriting: m.recordInWriting,
          source: m.source,
        };
      });

      states.forEach((s) =>
        console.log(`    ${s.name.padEnd(34)} ${s.present ? `state=${s.state}` : 'NOT PRESENT on the instance'}  ${s.shortdesc}`),
      );

      const missing = states.filter((s) => !s.present).map((s) => s.name);
      const installed = states.filter((s) => s.present && s.state === 'installed').map((s) => s.name);
      console.log(`  present : ${states.length - missing.length} of ${states.length}`);
      console.log(`  wrongly installed : ${installed.length}`);

      return { scanned, states, missing, installed };
    });

    const docs = await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log('  A leave-out record is a DOCUMENTED record - spec reference table pageId 222530772');
      console.log('  plus the CRM-12126 answers. It is NOT an Odoo model, so nothing below is scored.\n');

      scan.states.forEach((s) => {
        console.log(`    ${s.name.padEnd(34)} record in writing: ${s.recordInWriting ? 'YES' : 'NO '}   ${s.source}`);
      });

      const owed = scan.states.filter((s) => !s.recordInWriting).map((s) => s.name);
      console.log(`\n  Leave-out records still owed : ${owed.length} -> ${owed.join(', ') || 'none'}`);
      console.log('  Khang Nguyen Thai Duy, CRM-12126 comment 687015 (2026-08-26), closing point 3, verbatim:');
      console.log('    "Still owed - the three leave-out records follow once dormancy is measured on');
      console.log('     Production, same method as the payroll trio"');

      return { owed };
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log(`\n==================== VERIFY ====================`);

      console.log(`Verify #1 - the module registry was really scanned:`);
      console.log(`   Expected : > ${MODULE_SCAN_FLOOR} module rows`);
      console.log(`   Actual   : ${scan.scanned}`);
      console.log(`   Result   : ${scan.scanned > MODULE_SCAN_FLOOR ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #2 - all six deliberately uninstalled modules are present on the base:`);
      console.log(`   Expected : ${DELIBERATELY_UNINSTALLED.length} present`);
      console.log(`   Actual   : ${DELIBERATELY_UNINSTALLED.length - scan.missing.length}${scan.missing.length ? ' - missing: ' + scan.missing.join(', ') : ''}`);
      console.log(`   Result   : ${scan.missing.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #3 - none of the six is installed:`);
      console.log(`   Expected : 0 installed`);
      console.log(`   Actual   : ${scan.installed.length}${scan.installed.length ? ' -> ' + scan.installed.join(', ') : ''}`);
      console.log(`   Result   : ${scan.installed.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #4 - IS-CRM-FUNC-0027 leave-out records:`);
      console.log(`   Expected : a recorded reason for all ${DELIBERATELY_UNINSTALLED.length}`);
      console.log(`   Actual   : ${DELIBERATELY_UNINSTALLED.length - docs.owed.length} recorded, ${docs.owed.length} still owed`);
      console.log(`   Result   : ${docs.owed.length === 0 ? 'documented' : 'BLOCKED'} - NOT SCORED, the evidence is documentation, not instance state`);

      console.log(`\nNOTE: the instance half above is scored. The leave-out records themselves are NOT.`);
      console.log(`      While any of the three is still owed, IS-CRM-FUNC-0027 stays BLOCKED for this`);
      console.log(`      row - never PASS and never FAIL. A green run means only that the six modules`);
      console.log(`      are where Dev said they are.`);
      console.log(`===============================================`);

      const instanceHalf = scan.scanned > MODULE_SCAN_FLOOR && scan.missing.length === 0 && scan.installed.length === 0;
      console.log(
        `OVERALL: ${instanceHalf ? 'PASS' : 'FAIL'} (instance half) - documentation half is ${docs.owed.length === 0 ? 'documented' : 'BLOCKED'}`,
      );

      if (docs.owed.length > 0) {
        testInfo.annotations.push({
          type: 'blocked',
          description:
            'IS-CRM-FUNC-0027 is BLOCKED, not passed - ' +
            `${docs.owed.length} leave-out record(s) are still owed (${docs.owed.join(', ')}). ` +
            'Khang wrote "Still owed" on CRM-12126 comment 687015 (2026-08-26). A green run here means ' +
            'only that the six modules are present and uninstalled on the base; it does NOT mean the ' +
            'leave-out records exist.',
        });
      }

      expect(scan.scanned, 'the module registry was not really scanned').toBeGreaterThan(MODULE_SCAN_FLOOR);
      expect(scan.missing, 'a module Dev classified as deliberately uninstalled is not on the base').toEqual([]);
      expect(scan.installed, 'a module Dev classified as deliberately uninstalled is actually installed').toEqual([]);
    });
  });
});
