import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { MigPlatformPage } from '@pages/mig/MigPlatformPage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-12366 section 4.5.4 - Helpdesk leave-out record
 * Test Case ID    : CRM-12366_4.5.4
 * Jira            : CRM-12366
 * Test Repository : CRM test/Migration - Setup New CRM/CRM-12366 - Install Nakivo custom modules on the new Odoo 12 CE (QA verify)/4.5 No reference to a removed capability
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE) - READ-ONLY
 * Automation-Type : new
 * Automation-Date : 2026-09-15
 *
 * Summary:
 *   Verify the absence of Helpdesk carries the leave-out record IS-CRM-FUNC-0028 requires - a named
 *   owner and the workstream that delivers the capability instead - so the absence is an accepted
 *   decision and not an install defect. The evidence is DOCUMENTED in the spec reference table, not
 *   in an Odoo model. This test case is NOT FULLY AUTOMATABLE because verification of the leave-out
 *   record must be done manually by reading the spec reference table and confirming the documented
 *   fields (owner, destination workstream).
 *
 *   Automation Coverage: This spec can verify that the helpdesk module is not installed on the
 *   instance. However, verification of the leave-out record (owner, destination workstream) requires
 *   manual inspection of the spec reference table. Therefore, this test is marked test.skip().
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_4\\.5\\.4:" --project=chromium
 *
 * Source manual TC:
 *   Pre-conditions:
 *     VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable
 *     Login: anh.ho@nakivo.com (admin_crm_mig), db nakivoCE
 *     crm-mig is READ-ONLY for QA: this test case creates, modifies and deletes nothing
 *     A leave-out record is a DOCUMENTED record in the spec reference table, not an Odoo model
 *     PM ruled on 21/08/2026 that the absence of Helpdesk is accepted; customer support is
 *       delivered by CRM-11196
 *     Source of truth: the spec New CRM Platform Foundation (Custom Functionality),
 *       pageId 222530772
 *
 *   Steps:
 *     1. Use the account of Admin to login successful.
 *     2. Open the spec reference table and find the entry for the customer-support capability.
 *     3. Read the owner recorded against it.
 *     4. Read the destination workstream recorded against it.
 *     5. In Apps on the instance, confirm the helpdesk module is not installed, which is the state
 *        the record is describing.
 *
 *   Expected:
 *     A leave-out record for the customer-support capability exists in the spec reference table.
 *     Its owner field names a person, not a team placeholder and not an empty value.
 *     Its destination workstream is CRM-11196.
 *     helpdesk is not installed on the instance.
 *     The record is quoted in the evidence, so a missing table row cannot be read as a pass.
 * Evidence: stdout only - this TC drives no UI, so the auto-captured screenshot would
 *   show an idle page. Every step below is an authenticated JSON-RPC read; the console
 *   output IS the artifact. UI capture is disabled for this spec on purpose.
 */

interface ModuleCheckResult {
  helpdesk_installed: boolean;
  helpdesk_module: any;
  all_modules_count: number;
}

const STEP = {
  pre1: 'Pre-condition: log in on the Migration server',
  s1: 'Step 1: [INTERNAL check, Call API] log in to the instance',
  s2: 'Step 2-4: [INTERNAL check, Call API] manual verification required - check spec reference table for leave-out record',
  s3: 'Step 5: [INTERNAL check, Call API] in Apps, confirm helpdesk module is not installed',
  verify: 'Verification: helpdesk absence is documented and accepted',
} as const;

// RPC-only spec: no screen is driven, so a screenshot/video would only show an idle page.
test.use({ screenshot: 'off', video: 'off' });

test.describe('CRM-12366_4.5.4 - Helpdesk leave-out record', () => {

  test.skip(
    'CRM-12366_4.5.4: Verify helpdesk absence carries a documented leave-out record',
    async ({ page }) => {
      test.setTimeout(15 * 60 * 1000);
      await page.setViewportSize({ width: 1600, height: 900 });

      const loginPage = new LoginPageMig(page);
      const platformPage = new MigPlatformPage(page);

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

      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        console.log('  Admin login completed');
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        console.log('  SKIPPED - Evidence is documentation (spec reference table), not instance state');
        console.log('  Manual verification required:');
        console.log('    1. Check spec: New CRM Platform Foundation (Custom Functionality), pageId 222530772');
        console.log('    2. Find entry for customer-support capability (linked to Helpdesk)');
        console.log('    3. Verify owner field is filled with a person name (not team placeholder, not empty)');
        console.log('    4. Verify destination workstream = CRM-11196');
        console.log('    5. Confirm PM decision on 21/08/2026 accepting absence of Helpdesk');
      });

      const moduleResult: ModuleCheckResult = await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        return await page.evaluate(async () => {
          async function callKw(model: string, method: string, args: any[], kwargs: any = {}) {
            const r = await fetch('/web/dataset/call_kw', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } }),
            });
            const j = await r.json();
            if (j.error) {
              const d = j.error.data || {};
              throw new Error(String(d.message || j.error.message || 'rpc error').slice(0, 300));
            }
            return j.result;
          }

          // Search for helpdesk module
          const helpdesk: any[] = await callKw('ir.module.module', 'search_read',
            [[['name', '=', 'helpdesk']], ['name', 'state', 'id']],
            { limit: 100 });

          // Get all modules count for reference
          const allModules: any[] = await callKw('ir.module.module', 'search_read',
            [[], ['id']],
            { limit: 2000 });

          const helpdesk_installed = helpdesk.length > 0 && helpdesk[0].state === 'installed';
          console.log(`  Helpdesk module installed: ${helpdesk_installed}`);
          if (helpdesk.length > 0) {
            console.log(`  Helpdesk state: ${helpdesk[0].state}`);
          }

          return {
            helpdesk_installed,
            helpdesk_module: helpdesk.length > 0 ? helpdesk[0] : null,
            all_modules_count: allModules.length,
          };
        });
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        console.log('\n==================== VERIFY ====================');
        console.log('Test case marked SKIP - not fully automatable');
        console.log('Evidence source: Documentation (spec reference table)');
        console.log('Instance state verification:');
        console.log(`  Helpdesk module installed: ${moduleResult.helpdesk_installed}`);
        console.log(`  Expected: false (module should not be installed)`);
        console.log(`  Result: ${!moduleResult.helpdesk_installed ? 'PASS' : 'FAIL'}`);
        console.log('\nDocumentation verification: MANUAL - must check spec reference table');
        console.log('  Required fields:');
        console.log('    - Owner: a person name (not team placeholder)');
        console.log('    - Destination workstream: CRM-11196');
        console.log('    - PM approval: 21/08/2026');
        console.log('===============================================');
      });
    }
  );
});
