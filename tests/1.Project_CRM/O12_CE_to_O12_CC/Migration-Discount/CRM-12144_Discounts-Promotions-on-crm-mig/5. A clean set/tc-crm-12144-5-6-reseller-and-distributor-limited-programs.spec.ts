import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DiscountProgramEditorPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { Check, recordChecks, printVerifyAndAssertMig, MIG_ACTION_TIMEOUT, baselineDetails } from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_5.6 - Try to limit a program to reseller or distributor orders in the Program editor   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_5.6
 * Jira             : CRM-14436 (master "Migration - Discount" row 60)
 * Automation-Type  : new
 * Automation-Date  : 2026-11-05
 * Origin           : tester 2026-11-05 - every program field needs an A/B pair (pre-production / crm-mig); field mapping
 *                    CRM-14435 row 5 ("For Reseller / For Distributor")
 * Spec             : [Migration] Discounts (Promotions) v7, page 222532591 - IS-CRM-FUNC-0087: "NAKIVO-specific condition
 *                    kinds not in use shall be left out rather than carried over: the Reseller / Distributor eligibility
 *                    condition" (Aiva, 2026-08-12)
 * Baseline         : Discount_5.6 (tests/1.Project_CRM/10.Sales_Module/Discount/5. A clean set/
 *                    tc-discount-5-6-reseller-and-distributor-limited-programs.spec.ts) - the reference system offers a
 *                    program only to reseller / distributor orders when For Reseller / For Distributor is ticked (PASS
 *                    2026-11-05). This side checks that crm-mig does not let the condition be set, as the spec intends.
 * Revised          : 2026-11-05 - first draft created two programs with For reseller / For distributor ticked; the run of
 *                    2026-11-05 found both check boxes DISABLED on New program, so the case now checks that they cannot
 *                    be ticked
 * Host             : Program editor (https://discount-crm-mig.nakivo.site)
 * Run as           : Program editor = users.admin_discount_mig (QA's named account, CRM-12467 row 1.7)
 *
 * Program-editor writes: none - the New program form is discarded; the active version must not move.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_5\.6:" --project=chromium-headless
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_5.6)
 * ------------------------------------------------------------------------------------------------
 *  Title: Try to limit a program to reseller or distributor orders in the Program editor (For reseller / For distributor)
 *  Priority: P3 | Spec Areas: 0087 - Reseller / Distributor eligibility left out
 *
 *  Pre-running conditions:
 *  Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account
 *
 *  Executed Steps:
 *  1. Open Discount Programs (Kanban view), note the active version (top bar: Version N / active) and click New program
 *  2. Tick For reseller ("Only orders with a reseller")
 *  3. Tick For distributor ("Only orders with a distributor")
 *  4. Click Discard
 *
 *  Expected Results:
 *  1. The New program form opens in edit mode
 *  2. The For reseller check box is disabled and stays unticked: a program cannot be limited to reseller orders
 *     (IS-CRM-FUNC-0087)
 *  3. The For distributor check box is disabled and stays unticked: a program cannot be limited to distributor orders
 *     (IS-CRM-FUNC-0087)
 *  4. Nothing is saved: the active version is unchanged
 * ================================================================================================
 */

const TC = 'CRM-12144_5.6';
const EDITOR_ACCOUNT = users.admin_discount_mig;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account',
  s1: 'Step 1: Open Discount Programs (Kanban view), note the active version (top bar: Version N / active) and click New program',
  s2: 'Step 2: Tick For reseller ("Only orders with a reseller")',
  s3: 'Step 3: Tick For distributor ("Only orders with a distributor")',
  s4: 'Step 4: Click Discard',
  verify: 'Verification',
} as const;

test.use({ ignoreHTTPSErrors: true, actionTimeout: MIG_ACTION_TIMEOUT }); // the Program editor's certificate chain is self-signed

test.describe(`${TC} - Try to limit a program to reseller or distributor orders in the Program editor (crm-mig)`, () => {
  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    // nothing to clean up: the form is discarded (Step 4); the active version is checked there
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Try to limit a program to reseller or distributor orders in the Program editor`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const editor = new DiscountProgramEditorPageMig(page);
    const checks: Check[] = [];
    let versionBefore = NaN;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Program editor : ${EDITOR_ACCOUNT.username} (QA's named account, CRM-12467 row 1.7)`);
      await editor.signIn(EDITOR_ACCOUNT);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in on the Program editor');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await editor.openProgramsKanban();
      versionBefore = await editor.getActiveVersionNumber();
      console.log(`  - Active version : ${versionBefore}`);
      const form = await editor.readNewProgramForm();
      const labels = form.rows.map((r) => r.label);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 - the New program form opens in edit mode with the For reseller and For distributor rows', expected: 'For reseller | For distributor', actual: labels.filter((l) => /^For (reseller|distributor)$/.test(l)).join(' | ') || `(rows: ${labels.join(', ')})`, passed: labels.includes('For reseller') && labels.includes('For distributor') },
      ], `${TC} - Step 1 New program form`, [DiscountProgramEditorPageMig.EDITING_FORM]);
    });

    for (const [step, label, kind] of [[STEP.s2, 'For reseller', 'reseller'], [STEP.s3, 'For distributor', 'distributor']] as const) {
      await test.step(step, async () => {
        console.log(`\n--- ${step} ---`);
        const box = await editor.tryTickConditionRow(label);
        console.log(`  - ${label} : found = ${box.found}, disabled = ${box.disabled}, ticked = ${box.checked}, row reads "${box.text}"`);
        await recordChecks(page, testInfo, checks, [
          { what: `${step.split(':')[0]} - the ${label} check box is disabled and stays unticked: a program cannot be limited to ${kind} orders (IS-CRM-FUNC-0087)`, expected: 'disabled, not ticked', actual: box.found ? `${box.disabled ? 'disabled' : 'ENABLED'}, ${box.checked ? 'TICKED' : 'not ticked'}` : '(row not found)', passed: box.found && box.disabled && !box.checked },
        ], `${TC} - ${step.split(':')[0]} ${label}`, [DiscountProgramEditorPageMig.EDITING_FORM]);
      });
    }

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await editor.discardProgramForm();
      await editor.openProgramsKanban();
      const versionAfter = await editor.getActiveVersionNumber();
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 - nothing is saved: the active version is unchanged', expected: `Version ${versionBefore} / active`, actual: Number.isFinite(versionAfter) ? `Version ${versionAfter} / active` : '(not shown)', passed: versionAfter === versionBefore },
      ], `${TC} - Step 4 version unchanged`, [DiscountProgramEditorPageMig.VERSION_CHIP]);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
