import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.1 - No INSTALLED in-scope module declares an Enterprise dependency
 * Test Case ID: CRM-12326_3.1.1
 * Jira: CRM-12566
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 * Last-revised: 2026-09-16 - manual steps 2, 3 and 4 split back to one test.step each
 *                (they were collapsed into a single "Step 2-4", which read as one opaque
 *                block in the report and hid which action a failure came from)
 *
 * Summary:
 *   Of the 21 modules in the cut-off scope, none that is installed may still name one of the 9 Odoo
 *   Enterprise modules in its manifest. This is the runtime half of acceptance criterion #1: a
 *   declaration on an installed module is a live dependency, not a leftover.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 82):
 *
 * Pre-conditions:
 *   VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable.
 *   Login: anh.ho@nakivo.com (admin_crm_mig).
 *   Cut-off scope agreed on CRM-12125 comment 683452: 21 modules, 9 Enterprise modules.
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Read every ir.module.module.dependency row whose name is one of the 9 Enterprise modules.
 *   3. Resolve the owning module of each row through module_id, and read its install state.
 *   4. Keep only the rows owned by a module inside the 21-module cut-off scope.
 *
 * Verification Points:
 *   1. The check actually ran: the UNFILTERED ir.module.module.dependency count is greater than 0,
 *      which is what proves the query reached the table. (The Enterprise-FILTERED count being 0 is
 *      the PASS condition, not evidence the check was skipped.)
 *   2. 0 installed in-scope modules declare an Enterprise dependency.
 *
 * EVIDENCE: stdout only - this TC drives NO UI. Every step reads over the authenticated JSON-RPC
 * and navigates nowhere, so the screenshot Playwright auto-captures (config `screenshot: 'on'`)
 * shows an idle, still-loading web client and means nothing here. The per-step console.log output
 * IS the artifact. Steps are labelled [INTERNAL check, Call API] so a report reader knows that
 * before wondering whether the blank capture is a failure.
 *
 * READ-ONLY: this spec only reads the module registry. It creates, modifies and deletes nothing,
 * as required on crm-mig.
 *
 * NOTE: ir.module.module.dependency.state is a NON-STORED computed field - it cannot be searched or
 * read reliably, so ownership is resolved through module_id.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_3\.1\.1:" --project=chromium
 */

/** The 9 Odoo Enterprise modules the 21 in-scope modules used to depend on (CRM-12125 comment 683452). */
const ENTERPRISE_MODULES = [
  'helpdesk', 'sale_subscription', 'sale_coupon', 'website_sale_coupon', 'website_crm_score',
  'account_asset', 'sign', 'marketing_automation', 'web_studio',
];

/** The 21 modules in the cut-off scope - 6 installed, 15 left out. */
const CUT_MODULES_ALL = [
  'nakivo_sale', 'ib_subscription_notification', 'utm_constructor', 'nakivo_assets',
  'nakivo_transfer_exhibition', 'jira_connector',
  'nakivo_helpdesk', 'nakivo_support_tickets', 'nakivo_support_page', 'nakivo_helpdesk_followup',
  'nakivo_helpdesk_mail_route', 'nakivo_feature_request', 'nakivo_leaves', 'helpdesk_timer',
  'helpdesk_ticket_crm_lead', 'zoho_connector', 'nakivo_website_crm_score', 'nakivo_email_rating',
  'nakivo_message_approval', 'nakivo_sign', 'marketing_automation_file_template',
];

/**
 * Step labels - declared ONCE and used for BOTH the test.step() label and the stdout banner.
 *
 * Writing the two by hand lets them drift: the report step and the log line then describe the
 * same step with different wording, and a reader cannot line the HTML report up against stdout.
 * Reading both from this constant makes that impossible. The text is the manual TC's wording.
 */
const STEP = {
  pre1:    'Pre-condition 1: Login as Admin on the O12 Migration server',
  // Manual steps 2, 3 and 4 are the SUBSTANCE of this TC, not setup, so they stay 1:1 with the Xray
  // manual steps. They were previously collapsed into a single "Step 2-4: Read the Enterprise
  // dependency rows and resolve their owners", which read as one opaque block in the report: a
  // reader could not tell which of the three actions a failure came from. Grouping is only allowed
  // for a contiguous run of pure SETUP steps.
  s2:      'Step 2: [INTERNAL check, Call API] Read every ir.module.module.dependency row whose name is one of the 9 Enterprise modules',
  s3:      'Step 3: [INTERNAL check, Call API] Resolve the owning module of each row through module_id, and read its install state',
  s4:      'Step 4: [INTERNAL check, Call API] Keep only the rows owned by a module inside the 21-module cut-off scope',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.1 - Enterprise dependency declarations', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12326_3.1.1: [Part2-3.1] No installed module in the 21-module cut-off scope declares an Odoo Enterprise dependency', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    const offenders: Array<{ module: string; declares: string }> = [];
    let rowsRead = 0;

    console.log('========== CRM-12326_3.1.1 - No installed in-scope module declares Enterprise ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in on the Migration server');
    });

    // Carried between steps 2 -> 3 -> 4, so each manual step owns exactly one action.
    let deps: Array<{ name: string; module_id: [number, string] }> = [];
    let ownersById = new Map<number, { id: number; name: string; state: string }>();

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log('  The 9 Enterprise modules being searched for:');
      ENTERPRISE_MODULES.forEach((m) => console.log(`    - ${m}`));

      // Guard first: count ALL dependency rows (unfiltered). This is what proves the query reached
      // the table. Guarding on the FILTERED count instead would fail on a correct result, because
      // 0 Enterprise dependency rows is exactly the outcome this TC wants.
      const totalDeps = await platform.callKw(
        'ir.module.module.dependency', 'search_count',
        [[]],
        // NO `limit` here: Odoo 12's search_count(domain) takes no limit kwarg and raises
        // "search_count() got an unexpected keyword argument 'limit'". A count is already a
        // single number, so there is nothing to bound - the bounding rule applies to search_read.
        {},
      );
      rowsRead = totalDeps;
      console.log(`\n  Total ir.module.module.dependency rows (unfiltered) : ${totalDeps}`);

      deps = await platform.callKw(
        'ir.module.module.dependency', 'search_read',
        [[['name', 'in', ENTERPRISE_MODULES]], ['name', 'module_id']],
        { limit: 500 },
      );
      console.log(`  Rows naming one of the 9 Enterprise modules          : ${deps.length}`);
      if (deps.length === 0) {
        console.log('  -> none found, which is the expected state after the cut-off');
      }
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      const ownerIds = [...new Set(deps.map((d) => d.module_id[0]))];
      console.log(`  Distinct owning modules to resolve : ${ownerIds.length}`);

      const owners: Array<{ id: number; name: string; state: string }> = ownerIds.length
        ? await platform.callKw('ir.module.module', 'read', [ownerIds, ['name', 'state']], {})
        : [];
      ownersById = new Map(owners.map((o) => [o.id, o]));

      if (owners.length === 0) {
        console.log('  (no owners to resolve - no dependency row named an Enterprise module)');
      } else {
        console.log('  Owning module and its install state:');
        owners.forEach((o) => console.log(`    - ${o.name.padEnd(36)} state = ${o.state}`));
      }
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      console.log(`  Cut-off scope size : ${CUT_MODULES_ALL.length} modules`);

      let inScopeRows = 0;
      for (const d of deps) {
        const owner = ownersById.get(d.module_id[0]);
        if (!owner) continue;
        const inScope = CUT_MODULES_ALL.includes(owner.name);
        console.log(
          `  ${owner.name.padEnd(36)} declares ${d.name.padEnd(22)} state=${String(owner.state).padEnd(14)}`
          + `${inScope ? '[IN SCOPE]' : '[out of scope - not this TC]'}`,
        );
        if (!inScope) continue;
        inScopeRows++;
        // An offender is an IN-SCOPE owner that is also INSTALLED: a declaration on an installed
        // module is a live dependency, not a leftover metadata row.
        if (owner.state === 'installed') {
          offenders.push({ module: owner.name, declares: d.name });
        }
      }
      console.log(`\n  Rows kept (owner inside the cut-off scope) : ${inScopeRows}`);
      console.log(`  Of those, owner is INSTALLED (offenders)   : ${offenders.length}`);
    });

    await test.step(STEP.verify, async () => {
      const offenderList = offenders.map((o) => `${o.module} -> ${o.declares}`).join(', ');
      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - the check actually ran (dependency table was queried):');
      console.log('     Expected : at least 1 row in ir.module.module.dependency');
      console.log(`     Actual   : ${rowsRead}`);
      console.log(`     Result   : ${rowsRead > 0 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - no installed in-scope module declares an Enterprise dependency:');
      console.log('     Expected : 0 offenders');
      console.log(`     Actual   : ${offenders.length}${offenders.length ? ` - [${offenderList}]` : ''}`);
      console.log(`     Result   : ${offenders.length === 0 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${rowsRead > 0 && offenders.length === 0 ? 'PASS' : 'FAIL'} - installed in-scope modules carry no Enterprise dependency`);

      expect(rowsRead, 'ir.module.module.dependency table is empty - the query returned nothing, so nothing was actually verified').toBeGreaterThan(0);
      expect(offenders, `an installed in-scope module still declares an Enterprise dependency: ${offenderList}`).toHaveLength(0);
    });
  });
});
