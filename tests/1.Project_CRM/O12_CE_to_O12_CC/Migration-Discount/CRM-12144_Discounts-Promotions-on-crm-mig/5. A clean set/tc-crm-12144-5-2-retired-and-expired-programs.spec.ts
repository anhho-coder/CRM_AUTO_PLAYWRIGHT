import { Page, test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPageMig, DiscountProgramEditorPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_MIG,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  newDiscountRun,
  recordChecksMig,
  printVerifyAndAssertMig,
  signInMig,
  createEndCustomerCompanyMig,
  createOpportunityForCompanyMig,
  openDealElementFromOpportunity,
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
  baselineDetails,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_5.2 - Look for retired and expired programs on a new order and in the Program editor   (crm-mig + Program editor)
 * ================================================================================================
 * Test Case ID     : CRM-12144_5.2
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 56, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Revised          : 2026-10-27 - the Program editor is read on Discount Programs in the KANBAN view (every card of every
 *                    column) instead of the List view - the CRM-12144_5.3 standard (tester 2026-10-27: "khi nói về
 *                    program editor thì phải dùng trên Kanban view")
 * Baseline         : Discount_5.2 (Jira CRM-13795; tests/1.Project_CRM/10.Sales_Module/Discount/5. A clean set/
 *                    tc-discount-5-2-retired-and-expired-programs.spec.ts) - pre-production; its API read of the
 *                    programs is replaced by the Program editor (no sale.coupon.program on crm-mig)
 * Spec             : [Migration] Discounts (Promotions) v6 - IS-CRM-FUNC-0086
 * Source version   : master row 56 (CRM-12144_5.2) as reworded to the Kanban path 2026-10-27 - re-check before
 *                    trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE) and the Program editor of crm-mig
 *                    (Discount Service, https://discount-crm-mig.nakivo.site)
 * Run as           : crm-mig - salesperson Thomas Semerich (users.sale_ic_thomas_crm_mig);
 *                    Program editor - QA's named account users.admin_discount_mig (CRM-12467 row 1.7)
 *
 * BLOCKED (not scored): Step 1 expected result 1 ("no row exists for a program the audit retired") - the migration
 * audit is not delivered yet (CRM-12467 row 2.3). The Program editor's Kanban cards are read and printed, not judged against it.
 *
 * Summary
 * -------
 * Every card of the Program editor's Kanban (active version) is read. On a new order of A2144B x 5 on crm-mig, "Trade-in
 * Promotion 5%" must not be listed, and every listed program must have a Kanban card outside the Ended column.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_5\.2:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_5.2, master "Migration - Discount")
 * ------------------------------------------------------------------------------------------------
 *  Title: Look for retired and expired programs on a new order and in the Program editor (IS-CRM-FUNC-0086)
 *  Priority: P3 | Spec Areas: 0086 - expired not offered
 *  Pre-conditions
 *    1. Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account
 *       (held by the development team)
 *    2. Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only
 *       (e.g. Thomas Semerich)
 *    3. Create a new company in Contacts with:
 *         - Name        = Disc-Cust-<timestamp>
 *         - Type        = end customer (no Reseller, no Distributor)
 *         - Pricelist   = Public Pricelist (USD)          (crm-mig label: Public Pricelist_USD)
 *    4. Create a new opportunity in CRM > Pipeline with:
 *         - Name        = Disc-Opp-<timestamp>
 *         - Customer    = Disc-Cust-<timestamp>
 *    5. Have the migration audit from the development team
 *  Executed Steps
 *    1. In the Program editor, open Discount Programs (Kanban view) of the active version (top bar: Version N / active)
 *    2. In crm-mig, Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms =
 *       Immediate Payment, add A2144B with Ordered Qty 5 and open the Promotion list
 *  Expected Results
 *    1. No card exists for a program the audit retired
 *    2. No retired program is listed, and no program past its validity end date (e.g. "Trade-in Promotion 5%", valid
 *       to 2026-09-30)
 *
 *  Port notes (mechanical only): crm-mig host and *_crm_mig accounts. The Program editor is read on its own tab of the
 *  same browser context (ignoreHTTPSErrors, 1920x1080), so the crm-mig session is not disturbed. The baseline's
 *  JSON-RPC read of rule_date_to has no crm-mig equivalent: "ends in the future" is judged from the Program editor's
 *  Kanban - the cards are grouped by status from Valid from / Valid to (Active / Scheduled / Ended / Needs the table),
 *  so a program listed on the Promotion list must have a card (matched by exact name) outside the Ended column; its date
 *  chip is printed. The Program editor is read only (getKanbanCards); no card is opened, nothing is saved. Teardown
 *  deletes the run's records; afterAll sweeps by run marker.
 *  Revision 2026-10-27: Step 1 read the List view (getListRows) and judged Valid to / Status cells - replaced by the
 *  Kanban; the "ends in the future" evidence is now shot on the Program editor (the cards outlined), not on crm-mig.
 * ================================================================================================
 */

const TC = 'CRM-12144_5.2';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account (held by the development team) - QA account users.admin_discount_mig',
  pre2: 'Pre-condition 2: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)',
  pre3: 'Pre-condition 3: Create a new company in Contacts with Name = Disc-Cust-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist_USD',
  pre4: 'Pre-condition 4: Create a new opportunity in CRM > Pipeline with Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  pre5: '[NOT AVAILABLE - the migration audit is not delivered yet, CRM-12467 row 2.3] Pre-condition 5: Have the migration audit from the development team',
  s1: 'Step 1: In the Program editor, open Discount Programs (Kanban view) of the active version (top bar: Version N / active) [every card of every column is read - read only]',
  s2: 'Step 2: In crm-mig, Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment, add A2144B with Ordered Qty 5 and open the Promotion list',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const EDITOR_ACCOUNT = users.admin_discount_mig;
const SALES = users.sale_ic_thomas_crm_mig;
const EXPIRED_PROGRAM = 'Trade-in Promotion 5%';
/** The Kanban column of the programs past their validity end date (cards are grouped by status from Valid from / Valid to). */
const ENDED_COLUMN = 'Ended';
const runs: DiscountRun[] = []; // every crm-mig run of this file - the afterAll sweep re-checks them

/** Card text as ASCII for stdout and the evidence banner (date chips carry an en dash, names an em dash). */
const ascii = (s: string): string => s.replace(/[–—]/g, '-');

test.use({ ignoreHTTPSErrors: true, actionTimeout: MIG_ACTION_TIMEOUT }); // the Discount Service certificate chain is self-signed

test.describe(`${TC} - Retired and expired programs (crm-mig + Program editor)`, () => {
  let created: DiscountRun[] = [];
  let editorPage: Page | undefined;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    created = [];
    editorPage = undefined;
  });

  test.afterEach(async ({ page }, testInfo) => {
    await editorPage?.close().catch(() => {});
    editorPage = undefined;
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (!SKIP_CLEANUP) {
      const errors: string[] = [];
      for (const run of created) await teardownDiscountRunMig(page, run, testInfo).catch((e: Error) => errors.push(e.message));
      if (errors.length) throw new Error(errors.join(' | '));
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.afterAll(async ({ browser }) => {
    if (!SKIP_CLEANUP) await sweepDiscountRunsMig(browser, runs);
  });

  test(`${TC}: Retired and expired programs on a new order and in the Program editor`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const checks: Check[] = [];
    const newRun = (): DiscountRun => {
      const run = newDiscountRun();
      created.push(run);
      runs.push(run);
      return run;
    };
    const run = newRun();
    let editor: DiscountProgramEditorPageMig | undefined;
    let cards: Awaited<ReturnType<DiscountProgramEditorPageMig['getKanbanCards']>> = [];

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Login : ${EDITOR_ACCOUNT.username} (Program editor, own tab of the same browser context)`);
      editorPage = await page.context().newPage();
      await editorPage.setViewportSize({ width: 1920, height: 1080 });
      editor = new DiscountProgramEditorPageMig(editorPage);
      await editor.signIn(EDITOR_ACCOUNT);
      // the ROLE the TC names: a NAMED Program editor account - the account menu must say who is signed in
      const who = await editor.getSignedInAs({ keepOpen: true });
      await recordChecksMig(editorPage, testInfo, checks, [
        {
          what: 'Pre-condition 1 - the Program editor session belongs to the named account (a FAIL means the run did not use the account the TC names)',
          expected: `"Signed in as" ${EDITOR_ACCOUNT.username}`,
          actual: who ? `"Signed in as" ${who}` : '(empty)',
          passed: who === EDITOR_ACCOUNT.username,
        },
      ], `${TC} - Pre-condition 1 Signed in as`, [DiscountProgramEditorPageMig.ACCOUNT_DROPDOWN], 'bottom-right');
      await editor.closeAccountMenu();
      await CommonUtils.captureAndAttachScreenshot(editorPage, testInfo, 'Pre-condition 1 - signed in on the Program editor');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName}) on crm-mig`);
      await signInMig(page, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - signed in on crm-mig as the salesperson');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createEndCustomerCompanyMig(page, run, SALES, DISCOUNT_MIG.pricelistUsd);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - USD company created on crm-mig');
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      await createOpportunityForCompanyMig(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - opportunity created on crm-mig');
    });

    await test.step(STEP.pre5, async () => {
      console.log(`\n--- ${STEP.pre5} ---`);
      console.log('  NOT AVAILABLE: the migration audit of the programs is not delivered by the development team yet (CRM-12467 row 2.3).');
      console.log('  Dependent expectation: Step 1 expected result 1 is BLOCKED (not scored).');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      if (!editor || !editorPage) throw new Error('The Program editor was not opened at Pre-condition 1');
      await editor.openProgramsKanban();
      const version = await editor.getActiveVersionNumber();
      cards = await editor.getKanbanCards();
      console.log(`  - Screen         : Discount Programs (Kanban view)`);
      console.log(`  - Active version : ${Number.isFinite(version) ? version : '(not shown)'}`);
      console.log(`  - Program cards  : ${cards.length}`);
      for (const c of cards) {
        console.log(`    - ${c.column.padEnd(16)} | ${c.code.padEnd(24)} | ${ascii(c.name).padEnd(70)} | ${ascii(c.tags.join(' | ')) || '(no chips)'}`);
      }
      await recordChecksMig(editorPage, testInfo, checks, [
        {
          what: 'Step 1 - (guard) the Program editor shows an active rule version',
          expected: '"Version N / active" in the top bar, N a number',
          actual: Number.isFinite(version) ? `Version ${version} / active` : '(not shown)',
          passed: Number.isFinite(version),
        },
      ], `${TC} - Step 1 Kanban of the active version`, [DiscountProgramEditorPageMig.VERSION_CHIP], 'bottom-right');
      console.log('  BLOCKED (not scored) - expected result 1 "No card exists for a program the audit retired": the migration audit is not delivered yet (CRM-12467 row 2.3).');
      await CommonUtils.captureAndAttachScreenshot(editorPage, testInfo, 'Step 1 - Program editor Kanban of the active version');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 5);
      await dealElementPage.blurForm();
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      console.log(`  - Promotion list (${options.length}): ${options.join(' | ') || '(empty)'}`);

      // (a) "Trade-in Promotion 5%" - owned by the Promotion list on crm-mig
      await recordChecksMig(page, testInfo, checks, [
        {
          what: `Step 2 - "${EXPIRED_PROGRAM}" is not listed`,
          expected: 'not listed (valid to 2026-09-30, past its validity end date)',
          actual: options.includes(EXPIRED_PROGRAM) ? 'listed' : `not listed - the list holds ${options.length}: ${options.join(' | ') || '(empty)'}`,
          passed: !options.includes(EXPIRED_PROGRAM),
        },
      ], `${TC} - Step 2 Promotion list`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList], 'bottom-right');
      await dealElementPage.closePromotionList();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Promotion list open on crm-mig');

      // (b) "no program past its validity end date" - judged on the Program editor's Kanban (cards grouped by status from
      // Valid from / Valid to): every listed program must have a card, matched by exact name, outside the Ended column
      if (!editor || !editorPage) throw new Error('The Program editor was not opened at Pre-condition 1');
      cards = await editor.getKanbanCards(); // read again right before the shot: re-tags the cards (data-pw-card)
      const judged = options.map((name) => {
        const card = cards.find((c) => c.name.trim() === name.trim());
        return {
          name,
          card,
          valid: !!card && card.column !== ENDED_COLUMN,
          text: card ? `card ${card.code} in ${card.column} (${ascii(card.tags.join(' | ')) || 'no chips'})` : 'no Kanban card with that name',
        };
      });
      judged.forEach((j) => console.log(`    - ${ascii(j.name)} : ${j.text}`));
      const shown = judged.filter((j) => j.card).map((j) => DiscountProgramEditorPageMig.kanbanCardSelector(j.card!.code));
      await recordChecksMig(editorPage, testInfo, checks, [
        {
          what: 'Step 2 - no listed program is past its validity end date (Program editor Kanban, by exact name)',
          expected: `a non-empty Promotion list, every listed program on a Kanban card outside the "${ENDED_COLUMN}" column (a program in ${ENDED_COLUMN}, or with no card, is a FAIL - it is offered past its validity end date)`,
          actual: !options.length
            ? 'empty Promotion list'
            : judged.filter((j) => !j.valid).map((j) => `${ascii(j.name)}: ${j.text}`).join(' | ') || judged.map((j) => `${ascii(j.name)}: ${j.text}`).join(' | '),
          passed: options.length > 0 && judged.every((j) => j.valid),
        },
      ], `${TC} - Step 2 listed programs on the Kanban`, shown.length ? shown : [DiscountProgramEditorPageMig.KANBAN_CARDS], 'bottom-right');
      await CommonUtils.captureAndAttachScreenshot(editorPage, testInfo, 'Step 2 - listed programs on the Program editor Kanban');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log('  BLOCKED (not scored): Step 1 expected result 1 - the migration audit is not delivered yet (CRM-12467 row 2.3).');
      printVerifyAndAssertMig(checks);
    });
  });
});
