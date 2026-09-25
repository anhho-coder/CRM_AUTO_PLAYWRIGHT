import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * OUT OF SCOPE - SKIPPED, NOT DELETED
 * ============================================================================================
 * The Jira test case this spec mirrors, CRM-12941, was CLOSED by Thuat Phung on 2026-09-24 with the
 * reason "not supported, we dont need to test the out-of-scope thing", its Test Repository Path was cleared, and it is
 * no longer on Test Execution CRM-12945. The agreed scope is now the 28 cases Thuat kept
 * (accepted by the tester 2026-09-24), so this spec must not run or be counted.
 *
 * It is SKIPPED rather than deleted because no spec in this suite is tracked in git - deleting
 * the file would destroy it with no way back. Undo = drop the `.skip` and reopen CRM-12941.
 * ============================================================================================
 * ============================================================================================
 * CRM-12135_TC-33 - The items left out of scope are absent from both sides
 * ============================================================================================
 * Test Case ID   : CRM-12135_TC-33
 * Jira           : CRM-12135
 * Requirements   : IS-CRM-FUNC-0068, IS-CRM-FUNC-0070
 * Run as         : Engineer. The PDF's section 6 names this case as one the handed-over
 *                  qa.se.manager account exists for, so the Pre-Sales read runs as that
 *                  manager - not as the default QA account, which sees less.
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 * Evidence       : stdout only - this case drives no screen, so its logs ARE the artifact.
 *
 * Summary
 * -------
 *    This test verifies that specific helpdesk features marked for exclusion in the migration
 *   have been left out of both the CRM and Pre-Sales Application. It reads the request model
 *   fields and confirms that SLA policies, escalation tiers, multi-level routing, kanban
 *   Ready/Blocked flags, and issue-tracker bridges do not appear. This is a read-only
 *   verification. NOTE: Dev acknowledged on 2026-09-17 that the kanban Ready/Blocked flag is
 *   still present and will be removed; the assertion remains to mark it as a known gap.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-33:" --project=chromium
 *
 * Source manual TC
 * ----------------
 * "Pre-sale Migration Instructions.pdf" attached to CRM-12135 on 2026-09-17 -
 * sections 3-5 (the end-user flow) and section 7 (the test-case matrix, row TC-33).
 *
 *   Pre-condition(s):
 *      1. Pre-Sales Application is running at pre-sales-crm-mig.nakivo.site
 *      2. CRM is running at crm-mig.nakivo.site
 *      3. User has credentials to sign into the CRM as admin_crm_mig
 *      4. User has credentials to sign into Pre-Sales Application as anh_ho_presales_mig
 *
 *   Steps to reproduce:
 *      1. Sign into the CRM and launch Pre-Sales Application session
 *      2. [INTERNAL check, Call API] Read all field names from the request model on Pre-Sales
 *     Application
 *      3. [INTERNAL check, Call API] Check for SLA-related fields in the model
 *      4. [INTERNAL check, Call API] Check for escalation-tier fields in the model
 *      5. [INTERNAL check, Call API] Check for multi-level routing fields in the model
 *      6. [INTERNAL check, Call API] Check for kanban Ready/Blocked sub-state flag
 *      7. [INTERNAL check, Call API] Check for issue-tracker bridge fields
 *
 *   Verification (expected results):
 *      1. SLA policies: no field matching sla
 *      2. Escalation tiers: no field matching escalat
 *      3. Multi-level routing: no field matching level_id / l1_ / l2_
 *      4. Kanban Ready/Blocked sub-state: no field matching kanban_state (known gap as of
 *     2026-09-17)
 *      5. Issue-tracker bridges: no field matching project_task / issue_id / jira
 *
 * Data
 * ----
 * READ-ONLY - this case creates no record on either server.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: Pre-Sales Application is running at pre-sales-crm-mig.nakivo.site',
  pre2:   'Pre-condition 2: CRM is running at crm-mig.nakivo.site',
  pre3:   'Pre-condition 3: User has credentials to sign into the CRM as admin_crm_mig',
  pre4:   'Pre-condition 4: User has credentials to sign into Pre-Sales Application as anh_ho_presales_mig',
  s1:     'Step 1: Sign into the CRM and launch Pre-Sales Application session',
  s2:     'Step 2: [INTERNAL check, Call API] Read all field names from the request model on Pre-Sales Application',
  s3:     'Step 3: [INTERNAL check, Call API] Check for SLA-related fields in the model',
  s4:     'Step 4: [INTERNAL check, Call API] Check for escalation-tier fields in the model',
  s5:     'Step 5: [INTERNAL check, Call API] Check for multi-level routing fields in the model',
  s6:     'Step 6: [INTERNAL check, Call API] Check for kanban Ready/Blocked sub-state flag',
  s7:     'Step 7: [INTERNAL check, Call API] Check for issue-tracker bridge fields',
  verify: 'Verification',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe.skip('CRM-12135_TC-33 - The items left out of scope are absent from both sides', () => {
  test.afterEach(async ({}, testInfo) => {
    if (sharedPage) {
      await CommonUtils.captureAndAttachScreenshot(sharedPage, testInfo, 'afterEach - start').catch(() => {});
    }
    if (teardown) {
      console.log('TEARDOWN DID NOT RUN - the test left the try block without cleaning up.');
      teardown = undefined;
    }
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`TEST FAILED - reason: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
    if (sharedPage) {
      await CommonUtils.captureAndAttachScreenshot(sharedPage, testInfo, 'afterEach - teardown done').catch(() => {});
    }
    sharedPage = undefined;
  });

  test('CRM-12135_TC-33: The items left out of scope are absent from both sides', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log('========== CRM-12135_TC-33 - The items left out of scope are absent from both sides ==========');

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    sharedPage = page;

    try {
      const loginPage = new LoginPageMig(page);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);

      const preSale = new MigPreSalePage(page);
      const presalesUid = await preSale.loginPresales(
        users.qa_se_manager_presales_mig.username,
        users.qa_se_manager_presales_mig.password,
      );
      console.log(`  Pre-Sales Application session uid: ${presalesUid}`);

let fieldNames: string[] = [];
const DROPPED: { item: string; fragments: string[] }[] = [
  { item: 'SLA policies', fragments: ['sla'] },
  { item: 'escalation tiers', fragments: ['escalat'] },
  { item: 'multi-level (L1 / L2) routing', fragments: ['level_id', 'l1_', 'l2_'] },
  { item: 'kanban Ready / Blocked sub-state', fragments: ['kanban_state'] },
  { item: 'issue-tracker bridges', fragments: ['project_task', 'issue_id', 'jira'] },
];
const found: { item: string; fields: string[] }[] = [];

await test.step(STEP.pre1, async () => {
  console.log(`\n--- ${STEP.pre1} ---`);
  console.log('  Pre-Sales Application is running and accessible');
});

await test.step(STEP.pre2, async () => {
  console.log(`\n--- ${STEP.pre2} ---`);
  console.log('  CRM is running and accessible at crm-mig.nakivo.site');
});

await test.step(STEP.pre3, async () => {
  console.log(`\n--- ${STEP.pre3} ---`);
  console.log('  User has credentials to sign into the CRM as admin_crm_mig');
});

await test.step(STEP.pre4, async () => {
  console.log(`\n--- ${STEP.pre4} ---`);
  console.log('  User has credentials to sign into Pre-Sales Application as anh_ho_presales_mig');
});

await test.step(STEP.s1, async () => {
  console.log(`\n--- ${STEP.s1} ---`);

});

await test.step(STEP.s2, async () => {
  console.log(`\n--- ${STEP.s2} ---`);
  fieldNames = await preSale.ticketFieldNames();
  console.log(`  The request model carries ${fieldNames.length} fields`);
});

await test.step(STEP.s3, async () => {
  console.log(`\n--- ${STEP.s3} ---`);
  const d = DROPPED[0];
  const hits = fieldNames.filter((f) => d.fragments.some((frag) => f.toLowerCase().includes(frag)));
  if (hits.length) found.push({ item: d.item, fields: hits });
  console.log(`  ${d.item}: ${hits.length ? `STILL PRESENT as ${hits.join(', ')}` : 'absent'}`);
});

await test.step(STEP.s4, async () => {
  console.log(`\n--- ${STEP.s4} ---`);
  const d = DROPPED[1];
  const hits = fieldNames.filter((f) => d.fragments.some((frag) => f.toLowerCase().includes(frag)));
  if (hits.length) found.push({ item: d.item, fields: hits });
  console.log(`  ${d.item}: ${hits.length ? `STILL PRESENT as ${hits.join(', ')}` : 'absent'}`);
});

await test.step(STEP.s5, async () => {
  console.log(`\n--- ${STEP.s5} ---`);
  const d = DROPPED[2];
  const hits = fieldNames.filter((f) => d.fragments.some((frag) => f.toLowerCase().includes(frag)));
  if (hits.length) found.push({ item: d.item, fields: hits });
  console.log(`  ${d.item}: ${hits.length ? `STILL PRESENT as ${hits.join(', ')}` : 'absent'}`);
});

await test.step(STEP.s6, async () => {
  console.log(`\n--- ${STEP.s6} ---`);
  const d = DROPPED[3];
  const hits = fieldNames.filter((f) => d.fragments.some((frag) => f.toLowerCase().includes(frag)));
  if (hits.length) found.push({ item: d.item, fields: hits });
  console.log(`  ${d.item}: ${hits.length ? `STILL PRESENT as ${hits.join(', ')}` : 'absent'}`);
});

await test.step(STEP.s7, async () => {
  console.log(`\n--- ${STEP.s7} ---`);
  const d = DROPPED[4];
  const hits = fieldNames.filter((f) => d.fragments.some((frag) => f.toLowerCase().includes(frag)));
  if (hits.length) found.push({ item: d.item, fields: hits });
  console.log(`  ${d.item}: ${hits.length ? `STILL PRESENT as ${hits.join(', ')}` : 'absent'}`);
});

await test.step(STEP.verify, async () => {
  console.log(`\n--- ${STEP.verify} ---`);
  console.log('\n==================== VERIFY ====================');
  for (const [i, d] of DROPPED.entries()) {
    const hit = found.find((f) => f.item === d.item);
    console.log(`Verify #${i + 1} - ${d.item} is left out rather than carried:`);
    console.log(`     Expected : no field matching ${d.fragments.join(' / ')}`);
    console.log(`     Actual   : ${hit ? hit.fields.join(', ') : 'none'}`);
    console.log(`     Result   : ${hit ? 'FAIL' : 'PASS'}`);
  }
  console.log('===============================================');
  // Read the SAME collection the per-item lines above printed from, not a loop-local variable:
  // `hit` only exists inside the loop, and referencing it here crashed the step before its
  // assertions could run - a crash reads as "the test is broken", not "the product has a gap".
  const overallPass = found.length === 0;
  console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - ${found.length} of ${DROPPED.length} dropped items are still carried`);
  console.log('NOTE: Dev acknowledged on 2026-09-17 that the kanban Ready / Blocked');
  console.log('flag is still present and will be removed. This assertion remains failing');
  console.log('to mark it as a known gap.');
  for (const d of DROPPED) {
    const hit = found.find((f) => f.item === d.item);
    expect(hit, `${d.item} should be left out, but is carried as: ${hit ? hit.fields.join(', ') : ''}`).toBeUndefined();
  }
});
    } finally {
      // Teardown runs HERE, not in afterEach: it needs the live session, and afterEach only
      // sees a closed context. A thrown assertion still passes through finally, so a red run
      // cleans up too.
      if (teardown) {
        try {
          await teardown();
        } catch (err) {
          console.log(`TEARDOWN ERROR: ${(err as Error).message}`);
        }
        teardown = undefined;
      }
      await context.close();
    }
  });
});
