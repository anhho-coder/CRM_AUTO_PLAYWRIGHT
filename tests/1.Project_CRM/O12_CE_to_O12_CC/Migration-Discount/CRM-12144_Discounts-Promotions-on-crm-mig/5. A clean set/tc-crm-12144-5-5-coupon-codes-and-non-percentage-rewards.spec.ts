import { Page, test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPageMig, DiscountProgramEditorPageMig, QuotationPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_MIG,
  DiscountRun,
  Check,
  newDiscountRun,
  recordChecksMig,
  printVerifyAndAssertMig,
  signInMig,
  createEndCustomerCompanyMig,
  createOpportunityForCompanyMig,
  openDealElementFromOpportunity,
  saveDealElement,
  newQuotationMig,
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
  baselineDetails,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_5.5 - Look for coupon codes and non-percentage rewards   (crm-mig + Program editor)
 * ================================================================================================
 * Test Case ID     : CRM-12144_5.5
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 59, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Revised          : 2026-10-27 - the Program editor is read on Discount Programs in the KANBAN view (every card's reward
 *                    and scope) and on a program page, instead of the decision table (Graph > Edit Table) - the
 *                    CRM-12144_5.3 standard (tester 2026-10-27: "khi nói về program editor thì phải dùng trên Kanban view")
 * Baseline         : Discount_5.5 (Jira CRM-13796; tests/1.Project_CRM/10.Sales_Module/Discount/5. A clean set/
 *                    tc-discount-5-5-coupon-codes-and-non-percentage-rewards.spec.ts) - pre-production; its
 *                    sale.coupon.program counts have no crm-mig equivalent and are replaced by the decision table
 * Spec             : [Migration] Discounts (Promotions) v6 - IS-CRM-FUNC-0089
 * Source version   : master row 59 (CRM-12144_5.5) as reworded to the Kanban path 2026-10-27 - re-check before
 *                    trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE) and the Program editor of crm-mig
 *                    (Discount Service, https://discount-crm-mig.nakivo.site)
 * Run as           : crm-mig - salesperson Thomas Semerich (users.sale_ic_thomas_crm_mig);
 *                    Program editor - QA's named account users.admin_discount_mig (CRM-12467 row 1.7)
 *
 * Summary
 * -------
 * The quotation created from a saved Deal Element of A2144B x 5 has no code box, no coupon or promo-code button. On the
 * Program editor's Kanban every card's reward is a percentage and its scope is Whole order or Specific products; a
 * program page's Rewards section offers no free-product, fixed-amount or next-order reward.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_5\.5:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_5.5, master "Migration - Discount")
 * ------------------------------------------------------------------------------------------------
 *  Title: Look for coupon codes and non-percentage rewards (IS-CRM-FUNC-0089)
 *  Priority: P3 | Spec Areas: 0089 - no coupons
 *  Pre-conditions
 *    1. Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only
 *       (e.g. Thomas Semerich)
 *    2. Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account
 *       (held by the development team)
 *    3. Create a new company in Contacts with:
 *         - Name        = Disc-Cust-<timestamp>
 *         - Type        = end customer (no Reseller, no Distributor)
 *         - Pricelist   = Public Pricelist (USD)
 *    4. Create a new opportunity in CRM > Pipeline with:
 *         - Name        = Disc-Opp-<timestamp>
 *         - Customer    = Disc-Cust-<timestamp>
 *  Executed Steps
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment,
 *       add A2144B with Ordered Qty 5, click Save, then New quotation
 *    2. In the Program editor, open Discount Programs (Kanban view) and read the reward and the scope of every card;
 *       then open a card in the Active column and read its Rewards
 *  Expected Results
 *    1. The quotation has no Promotion Code field and no other box to enter a code
 *    2. Rewards are percentages only; Applies to is only Whole order (order) or Specific products (specific_products)
 *       - no free product, fixed amount or next-order reward
 *
 *  Port notes (mechanical only): crm-mig host and *_crm_mig accounts; the quotation is opened by newQuotationMig (crm-mig
 *  creates it in place, ~45 s later). The Program editor is read on its own tab of the same browser context
 *  (ignoreHTTPSErrors, 1920x1080). Step 2 = Discount Programs in the Kanban view of the active version (getKanbanCards):
 *  each card shows the program's reward ("-10%") and scope label ("Specific products" = specific_products, "Whole
 *  order" = order - the editor's own labels, read 2026-10-27); then the first card of the Active column is opened and
 *  its "Rewards" section read (readProgramRewards). The program count is printed and not asserted; the baseline's
 *  old-program count (16) and its JSON-RPC reads have no crm-mig equivalent. Zero cards fails the step (no vacuous
 *  pass). Teardown deletes the run's records; afterAll sweeps by run marker.
 *  Revision 2026-10-27: Step 2 read the decision table (Graph > Edit Table, Reward percent / Scope cells, and "the
 *  result columns are exactly Promo code, Name, Reward percent, Scope, Target product codes") - replaced by the Kanban
 *  cards and the program page's Rewards rows; its evidence was shot on the crm-mig tab - now on the Program editor.
 * ================================================================================================
 */

const TC = 'CRM-12144_5.5';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)',
  pre2: 'Pre-condition 2: Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account (held by the development team) - QA account users.admin_discount_mig',
  pre3: 'Pre-condition 3: Create a new company in Contacts with Name = Disc-Cust-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist_USD',
  pre4: 'Pre-condition 4: Create a new opportunity in CRM > Pipeline with Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment, add A2144B with Ordered Qty 5, click Save, then New quotation',
  s2: 'Step 2: In the Program editor, open Discount Programs (Kanban view) and read the reward and the scope of every card; then open a card in the Active column and read its Rewards [the first card of the Active column - read only]',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const EDITOR_ACCOUNT = users.admin_discount_mig;
const SALES = users.sale_ic_thomas_crm_mig;
/** The two scopes the TC allows, as the Program editor labels them (its own mapping, read 2026-10-27). */
const SCOPE_LABELS: Record<string, string> = { 'Whole order': 'order', 'Specific products': 'specific_products' };
const ALLOWED_SCOPES = new Set(Object.keys(SCOPE_LABELS));
/** A card's reward as shown on the Kanban ("-10%"): a percentage, nothing else. */
const CARD_PERCENT = /^-?\d+(\.\d+)?\s*%$/;
/** The Reward row of a program page ("10.00 % Applies to Specific products"). */
const ROW_PERCENT = /^\s*-?\d+(\.\d+)?\s*%/;
/** A Rewards row that would offer a non-percentage reward. */
const OTHER_REWARD = /free|fixed|next[\s-]*order|coupon|gift/i;
const runs: DiscountRun[] = []; // every crm-mig run of this file - the afterAll sweep re-checks them

/** Card / row text as ASCII for stdout and the evidence banner. */
const ascii = (s: string): string => s.replace(/[–—]/g, '-').replace(/›/g, '>');

test.use({ ignoreHTTPSErrors: true, actionTimeout: MIG_ACTION_TIMEOUT }); // the Discount Service certificate chain is self-signed

test.describe(`${TC} - Coupon codes and non-percentage rewards (crm-mig + Program editor)`, () => {
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

  test(`${TC}: Coupon codes and non-percentage rewards`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const quotationPage = new QuotationPageMig(page);
    const checks: Check[] = [];
    const newRun = (): DiscountRun => {
      const run = newDiscountRun();
      created.push(run);
      runs.push(run);
      return run;
    };
    const run = newRun();
    let editor: DiscountProgramEditorPageMig | undefined;

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : crm-mig`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signInMig(page, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in on crm-mig as the salesperson');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log(`  - Login : ${EDITOR_ACCOUNT.username} (Program editor, own tab of the same browser context)`);
      editorPage = await page.context().newPage();
      await editorPage.setViewportSize({ width: 1920, height: 1080 });
      editor = new DiscountProgramEditorPageMig(editorPage);
      await editor.signIn(EDITOR_ACCOUNT);
      // the ROLE the TC names: a NAMED Program editor account - the account menu must say who is signed in
      const who = await editor.getSignedInAs({ keepOpen: true });
      await recordChecksMig(editorPage, testInfo, checks, [
        {
          what: 'Pre-condition 2 - the Program editor session belongs to the named account (a FAIL means the run did not use the account the TC names)',
          expected: `"Signed in as" ${EDITOR_ACCOUNT.username}`,
          actual: who ? `"Signed in as" ${who}` : '(empty)',
          passed: who === EDITOR_ACCOUNT.username,
        },
      ], `${TC} - Pre-condition 2 Signed in as`, [DiscountProgramEditorPageMig.ACCOUNT_DROPDOWN], 'bottom-right');
      await editor.closeAccountMenu();
      await CommonUtils.captureAndAttachScreenshot(editorPage, testInfo, 'Pre-condition 2 - signed in on the Program editor');
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

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 5);
      await dealElementPage.blurForm();
      await saveDealElement(page, run);
      const qId = await newQuotationMig(page, run);
      console.log(`  - Quotation id : ${qId}`);

      const labels = await quotationPage.getVisibleFieldLabels();
      const buttons = await quotationPage.getStatusbarButtonMap();
      const codeLabels = labels.filter((l) => /code|coupon/i.test(l));
      const couponButtons = buttons.filter((b) => /coupon|promo/i.test(b.label));
      // the "Promotion" field (promotion_id) is a program picker, not a code box: only a promo CODE label counts
      const promoVisible = labels.some((l) => /promo\s*code|promo_code|coupon/i.test(l));
      console.log(`  - Visible field labels : ${labels.join(' | ')}`);
      console.log(`  - Header buttons       : ${buttons.map((b) => b.label).join(' | ')}`);
      // evidence per owning element (review 2026-10-27: the old shot outlined div[name='promotion_id'], which the crm-mig
      // quotation does not show - "highlight matched NOTHING"): the field labels live in the form sheet, the buttons in
      // the status bar - the same two places getVisibleFieldLabels() / getStatusbarButtonMap() read
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 1 - no visible field labelled Code / Coupon on the quotation', expected: '(none)', actual: codeLabels.join(' | ') || '(none)', passed: codeLabels.length === 0 },
        { what: 'Step 1 - promo_code field is not visible on the quotation', expected: 'not visible', actual: promoVisible ? 'a Promotion-related label is visible' : 'not visible', passed: !promoVisible },
      ], `${TC} - Step 1 quotation has no code box`, ['.o_form_sheet'], 'bottom-right');
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 1 - no header button mentions coupon or promo code', expected: '(none)', actual: couponButtons.map((b) => b.label).join(' | ') || '(none)', passed: couponButtons.length === 0 },
      ], `${TC} - Step 1 quotation header buttons`, ['.o_statusbar_buttons'], 'bottom-right');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - quotation without a code box');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      if (!editor || !editorPage) throw new Error('The Program editor was not opened at Pre-condition 2');
      await editorPage.bringToFront().catch(() => {});
      await editor.openProgramsKanban();
      const version = await editor.getActiveVersionNumber();
      const cards = await editor.getKanbanCards();
      console.log(`  - Screen         : Discount Programs (Kanban view), Version ${Number.isFinite(version) ? version : '(not shown)'} / active`);
      console.log(`  - Program cards (printed, not asserted) : ${cards.length}`);
      for (const c of cards) console.log(`    - ${c.column.padEnd(16)} | ${c.code.padEnd(24)} | reward ${c.reward.padEnd(6)} | ${c.scope.padEnd(18)} | ${ascii(c.name)}`);
      const badReward = cards.filter((c) => !CARD_PERCENT.test(c.reward));
      const badScope = cards.filter((c) => !ALLOWED_SCOPES.has(c.scope));
      const bad = [...new Set([...badReward, ...badScope])];

      // (a) every program's reward and scope - owned by the Kanban cards
      await recordChecksMig(editorPage, testInfo, checks, [
        {
          what: 'Step 2 - the Kanban has program cards (a count is not asserted)',
          expected: 'at least 1 card',
          actual: `${cards.length} card(s)`,
          passed: cards.length > 0,
        },
        {
          what: 'Step 2 - every program\'s reward is a percentage (Kanban card)',
          expected: 'a percentage on every card, e.g. "-10%" (a free product, a fixed amount or a next-order reward is a FAIL)',
          actual: badReward.length ? badReward.map((c) => `${c.code} = ${c.reward || '(empty)'}`).join(' | ') : `${cards.length} of ${cards.length} percentages (${[...new Set(cards.map((c) => c.reward))].join(', ')})`,
          passed: cards.length > 0 && badReward.length === 0,
        },
        {
          what: 'Step 2 - every program\'s scope is order or specific_products (Kanban card)',
          expected: `${Object.entries(SCOPE_LABELS).map(([label, scope]) => `"${label}" (${scope})`).join(' or ')} on every card`,
          actual: badScope.length ? badScope.map((c) => `${c.code} = ${c.scope || '(empty)'}`).join(' | ') : `${cards.length} of ${cards.length} in scope (${[...new Set(cards.map((c) => c.scope))].join(', ')})`,
          passed: cards.length > 0 && badScope.length === 0,
        },
      ], `${TC} - Step 2 rewards and scopes on the Kanban`,
      bad.length ? bad.map((c) => DiscountProgramEditorPageMig.kanbanCardSelector(c.code)) : [DiscountProgramEditorPageMig.KANBAN_CARDS], 'bottom-right');

      // (b) what a program page offers as a reward - owned by its Rewards rows
      const first = cards.find((c) => c.column === 'Active');
      if (!first) throw new Error('Step 2: the Kanban has no card in the Active column to open');
      const opened = await editor.openProgramByCode(first.code);
      const rewards = await editor.readProgramRewards();
      console.log(`  - Program page   : ${first.code} - ${ascii(opened)}`);
      rewards.rows.forEach((r, i) => console.log(`    ${String(i + 1).padStart(2)}. ${r.label}${r.hint ? ` (${r.hint})` : ''} = ${ascii(r.value) || '(empty)'}`));
      const reward = rewards.rows.find((r) => r.label === 'Reward');
      const scope = reward && /Applies to/.test(reward.value) ? reward.value.replace(/^.*Applies to\s*/, '').trim() : '';
      const other = rewards.rows.filter((r) => OTHER_REWARD.test(`${r.label} ${r.hint}`));
      await recordChecksMig(editorPage, testInfo, checks, [
        {
          what: `Step 2 - the program page of ${first.code} gives the reward as a percentage with a scope`,
          expected: `row "Reward" = "<number> %" and Applies to ${Object.keys(SCOPE_LABELS).map((l) => `"${l}"`).join(' or ')}`,
          actual: reward ? `"Reward" = ${reward.value}` : `(no Reward row among: ${rewards.rows.map((r) => r.label).join(', ')})`,
          passed: !!reward && ROW_PERCENT.test(reward.value) && ALLOWED_SCOPES.has(scope),
        },
        {
          what: `Step 2 - the program page of ${first.code} offers no free-product, fixed-amount or next-order reward`,
          expected: 'no row under "Rewards" naming a free product, a fixed amount, a next order, a coupon or a gift',
          actual: other.length ? other.map((r) => `"${r.label}"`).join(', ') : `none - the ${rewards.rows.length} rows are: ${rewards.rows.map((r) => r.label).join(', ')}`,
          passed: rewards.sectionFound && rewards.rows.length > 0 && other.length === 0,
        },
      ], `${TC} - Step 2 Rewards of ${first.code}`, [DiscountProgramEditorPageMig.PROGRAM_REWARD_ROWS], 'bottom-right');
      await CommonUtils.captureAndAttachScreenshot(editorPage, testInfo, `Step 2 - Program editor Kanban and the Rewards of ${first.code} read`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
