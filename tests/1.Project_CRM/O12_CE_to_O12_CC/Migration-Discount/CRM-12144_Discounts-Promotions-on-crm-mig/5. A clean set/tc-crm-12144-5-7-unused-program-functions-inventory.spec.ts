import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DiscountProgramEditorPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { Check, recordChecks, printVerifyAndAssertMig, MIG_ACTION_TIMEOUT, baselineDetails } from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_5.7 - Look for the Promotion Program functions the spec does not carry over in the Program editor   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_5.7
 * Jira             : CRM-14438 (master "Migration - Discount" row 61)
 * Automation-Type  : new
 * Automation-Date  : 2026-11-05
 * Origin           : tester 2026-11-05 - every program field needs an A/B pair; field mapping CRM-14435 rows 9-19 and the
 *                    PM question on CRM-13848 (comment 2026-11-05)
 * Spec             : [Migration] Discounts (Promotions) v7, page 222532591 - IS-CRM-FUNC-0089 (coupon codes, next-order,
 *                    free-product and fixed-amount rewards left out), IS-CRM-FUNC-0074-05 (tax-excluded amount),
 *                    IS-CRM-FUNC-0097 (whole order or product scope). Maximum uses, maximum discount amount and company are
 *                    not named in spec v7 (asked on CRM-13848). Free shipping is not a choice on the reference system either
 *                    (Discount_5.7, 2026-11-05), so it is not part of the pair.
 * Baseline         : Discount_5.7 (tests/1.Project_CRM/10.Sales_Module/Discount/5. A clean set/
 *                    tc-discount-5-7-unused-program-functions-inventory.spec.ts) - the reference system HAS these functions
 *                    and no active program uses them
 * Host             : Program editor (https://discount-crm-mig.nakivo.site)
 * Run as           : Program editor = users.admin_discount_mig (QA's named account, CRM-12467 row 1.7)
 *
 * Program-editor writes: none - the New program form is read and discarded; the active version must not move.
 *
 * Summary
 * -------
 * The New program form of the Program editor offers none of the 9 Promotion Program functions the spec does not carry
 * over, and its "Reward" row offers exactly Whole order and Specific products as the scope.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_5\.7:" --project=chromium-headless
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_5.7)
 * ------------------------------------------------------------------------------------------------
 *  Title: Look for the Promotion Program functions the spec does not carry over in the Program editor
 *  Priority: P3 | Spec Areas: 0089 / 0074-05 / 0097 - functions not carried over
 *
 *  Pre-running conditions:
 *  Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account
 *
 *  Executed Steps:
 *  1. Open Discount Programs (Kanban view), note the active version (top bar: Version N / active) and click New program
 *  2. Read every row and control of the form ("When it applies" and "Rewards")
 *  3. Click Discard
 *
 *  Expected Results:
 *  2. The form offers none of: a Tax Included choice for Minimum amount; a "code needed" promo-code setting; a maximum
 *     number of uses (Apply on First); a next-order choice; a free-product reward; a fixed-amount reward; a Cheapest
 *     Product scope (the "Reward" row offers exactly Whole order and Specific products); a maximum discount amount; a
 *     company
 *  3. Nothing is saved: the active version is unchanged
 * ================================================================================================
 */

const TC = 'CRM-12144_5.7';
const EDITOR_ACCOUNT = users.admin_discount_mig;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account',
  s1: 'Step 1: Open Discount Programs (Kanban view), note the active version (top bar: Version N / active) and click New program',
  s2: 'Step 2: Read every row and control of the form ("When it applies" and "Rewards")',
  s3: 'Step 3: Click Discard',
  verify: 'Verification',
} as const;

/** The 9 Pre-production functions (CRM-14435 rows 9-19) and the words that would name them on the form. */
const NOT_CARRIED_OVER: Array<{ fn: string; spec: string; pattern: RegExp }> = [
  { fn: 'Tax Included choice for Minimum amount', spec: 'IS-CRM-FUNC-0074-05', pattern: /tax[ -]?incl/i },
  { fn: '"Code needed" promo-code setting', spec: 'IS-CRM-FUNC-0089', pattern: /code needed|code usage|requires? a code|use a code/i },
  { fn: 'Maximum number of uses (Apply on First)', spec: 'not named', pattern: /apply on first|maximum (number of )?uses|max(imum)? use|usage limit/i },
  { fn: 'Next-order choice', spec: 'IS-CRM-FUNC-0089', pattern: /next order/i },
  { fn: 'Free-product reward', spec: 'IS-CRM-FUNC-0089', pattern: /free product/i },
  { fn: 'Fixed-amount reward', spec: 'IS-CRM-FUNC-0089', pattern: /fixed amount/i },
  { fn: 'Cheapest Product scope', spec: 'IS-CRM-FUNC-0097', pattern: /cheapest/i },
  { fn: 'Maximum discount amount', spec: 'not named', pattern: /max(imum)? discount/i },
  { fn: 'Company', spec: 'not named', pattern: /\bcompany\b/i },
];

test.use({ ignoreHTTPSErrors: true, actionTimeout: MIG_ACTION_TIMEOUT }); // the Program editor's certificate chain is self-signed

test.describe(`${TC} - Look for the Promotion Program functions the spec does not carry over in the Program editor (crm-mig)`, () => {
  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    // nothing to clean up: the form is discarded (Step 3); the active version is checked there
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Look for the Promotion Program functions the spec does not carry over in the Program editor`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const editor = new DiscountProgramEditorPageMig(page);
    const checks: Check[] = [];
    let versionBefore = NaN;
    let form: Awaited<ReturnType<DiscountProgramEditorPageMig['readNewProgramForm']>> = { text: '', rows: [] };

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
      form = await editor.readNewProgramForm();
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      for (const r of form.rows) console.log(`  - row "${r.label}"${r.hint ? ` (${r.hint})` : ''}: ${r.controls.join(' | ') || '(input)'}${r.disabled.length ? `   [disabled: ${r.disabled.join(', ')}]` : ''}`);
      // the scope buttons sit in the "Reward" row (read 2026-11-05: Reward = Whole order | Specific products)
      const appliesTo = form.rows.find((r) => r.controls.includes('Whole order'))?.controls ?? [];
      const found = (p: RegExp) => (form.text.match(new RegExp(`.{0,40}${p.source}.{0,40}`, 'i')) || [])[0];
      await recordChecks(page, testInfo, checks, [
        ...NOT_CARRIED_OVER.map((f) => {
          const hit = found(f.pattern);
          return { what: `Step 2 - the form offers no ${f.fn} (${f.spec})`, expected: 'absent', actual: hit ? `found: "${hit}"` : 'absent', passed: !hit };
        }),
        { what: 'Step 2 - the "Reward" row offers exactly Whole order and Specific products as the scope', expected: 'Whole order | Specific products', actual: appliesTo.join(' | ') || '(row not found)', passed: appliesTo.join('|') === 'Whole order|Specific products' },
      ], `${TC} - Step 2 New program form`, [DiscountProgramEditorPageMig.EDITING_FORM]);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await editor.discardProgramForm();
      await editor.openProgramsKanban();
      const versionAfter = await editor.getActiveVersionNumber();
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - nothing is saved: the active version is unchanged', expected: `Version ${versionBefore} / active`, actual: Number.isFinite(versionAfter) ? `Version ${versionAfter} / active` : '(not shown)', passed: versionAfter === versionBefore },
      ], `${TC} - Step 3 version unchanged`, [DiscountProgramEditorPageMig.VERSION_CHIP]);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
