import { test, Page, Browser } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { OpportunityPage } from '@pages';
import { DealElementPageMig, DiscountProgramEditorPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_MIG,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  money,
  newDiscountRun,
  signInMig,
  recordSignedInRoleMig,
  createEndCustomerCompanyMig,
  createOpportunityForCompanyMig,
  openDealElementFromOpportunity,
  saveDealElement,
  recordChecksMig,
  printVerifyAndAssertMig,
  rpcMig,
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_8.2 - Add and then change a program in the Program editor without redeploying anything   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_8.2
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 74, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-27
 * Baseline         : none - no pre-production baseline (REQUIREMENT #8: written from the crm-mig manual TC; the
 *                    baseline set Discount_x.y stops at section 7)
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-SUPP-0002 (no redeployment)
 * Source version   : master row 74 as read 2026-10-27, steps 1 / 3 / 5 reworded to the Kanban path (tester decision (pre-condition order re-synced 2026-10-30)
 *                    2026-10-27, the CRM-12144_5.3 standard; master row 74 updated the same day) - re-check before
 *                    trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE) + Program editor (https://discount-crm-mig.nakivo.site)
 * Run as           : Program editor = users.admin_discount_mig (QA's named account, CRM-12467 row 1.7; "Signed in as"
 *                    asserted); CRM side = Salesperson - Sales / User: Own Documents Only (Thomas Semerich,
 *                    users.sale_ic_thomas_crm_mig; group membership asserted) for the pre-conditions and Step 2;
 *                    Step 4 = Sales / Manager (Max Zaprykutenko, users.manager_max_crm_mig; group membership asserted) -
 *                    tester decision 2026-10-28, see the FINDING below
 *
 * WRITES (tester, 2026-10-27: "QA có quyền tạo Discount program test (rồi teardown). Ko sửa Discount program có sẵn"):
 *   the run creates its OWN program QA-Disc-<timestamp>, limited to its own customer Disc-Cust-<timestamp> (Advanced),
 *   changes that program only, and deletes it - in Step 5 and again in afterEach / afterAll when a step failed before
 *   it. The page object refuses any program whose name does not start with QA-Disc-. Each Save / Delete publishes a new
 *   Discount Service rule version (3 per run). crm-mig keeps its own nakivo.promotion row and discount product for the
 *   program: afterEach removes the ones named after this run's program and created during this run (a deny-list).
 *
 * Expected 5 is scored by TIME (tester, 2026-10-27): the 7.0 % change must reach crm-mig with at most one minute of
 * waiting after the Step 3 Save, without a sync - the run performs only Program-editor and crm-mig UI actions. The
 * timestamps of every Save and of the reward reads are printed.
 * Steps 1 and 3 have NO expected result in the source (REQUIREMENT #1b.4 - reported to the TC author): guards only.
 *
 * FINDING 2026-10-27 (runs 18:21 and 18:41, report 2026-10-27-184147_CRM-12144_8.2_[Worker-1]_Failed - EXPECTED RED, not
 * weakened): Steps 1-3 pass (offered after 0 s of waiting, reward on "5.0% discount on total amount"); in Step 4, picking
 * the program after its 5 -> 7 % change raises, for the salesperson, "Odoo Server Error - Access Error: Sorry, you are
 * not allowed to modify this document. Only users with the following access level are currently allowed to do that:
 * - Sales/Manager (Document model: nakivo.promotion) - (Operation: write, User: 9470)". crm-mig created its
 * nakivo.promotion row (NEW1) when the salesperson first opened the Promotion list, and cannot UPDATE it in the
 * salesperson's session. The
 * spec records Expected 4 and 5 as FAIL with that text and shoots the dialog before OK. No bug filed yet (tester decides).
 * Tester decision 2026-10-28: the error is a missing privilege of the salesperson, so Step 4 now signs in as Max
 * Zaprykutenko, a member of "Sales / Manager" on crm-mig (res.groups 13 = sales_team.group_sale_manager; Max uid 48 is a
 * member, Thomas uid 9470 is not - read 2026-10-28). The error branch stays: if the manager is refused too, it is recorded.
 *
 * Summary
 * -------
 * A 5 % order program QA-Disc-<timestamp> for Disc-Cust-<timestamp> is created in the Program editor and picked on the
 * customer's first Deal Element (reward on "5.0% discount on total amount"); the program is changed to 7 % and picked
 * on a second Deal Element (-7 %, the same discount product renamed "7.0% discount on total amount"), with no sync.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_8\.2:" --project=chromium-headless
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_8.2, master "Migration - Discount" row 74) - verbatim, ASCII
 * ------------------------------------------------------------------------------------------------
 *  Title: Add and then change a program in the Program editor without redeploying anything (IS-CRM-SUPP-0002)
 *  Priority: P2 | Spec Areas: no redeployment
 *
 *  Pre-running conditions:
 *  * Pre-conditions:
 *  Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account (held by the development team)
 *  Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)
 *  Create a new company in Contacts with:
 *  _ Name = Disc-Cust-<timestamp>
 *  _ Type = end customer (no Reseller, no Distributor)
 *  _ Pricelist = Public Pricelist (USD)
 *  Create a new opportunity in CRM > Pipeline with:
 *  _ Name = Disc-Opp-<timestamp>
 *  _ Customer = Disc-Cust-<timestamp>
 *  Create a new opportunity in CRM > Pipeline with:
 *  _ Name = Disc-Opp2-<timestamp>
 *  _ Customer = Disc-Cust-<timestamp>
 *
 *  Executed Steps:
 *  1. In the Program editor, open Discount Programs (Kanban view), click New program and enter Program name =
 *     QA-Disc-<timestamp>, Reward = 5.0 %, Applies to = Whole order and Advanced (customer condition) = customer name
 *     is Disc-Cust-<timestamp>; click Save
 *  2. In crm-mig, without running a sync, Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set
 *     Payment Terms = Immediate Payment, add A2160B with Ordered Qty 1, pick QA-Disc-<timestamp> and click Save
 *  3. In the Program editor, open the card QA-Disc-<timestamp>, click Edit, change Reward to 7.0 % and click Save
 *  4. Open Disc-Opp2-<timestamp>, click DEAL ELEMENT, add A2160B with Ordered Qty 1, pick QA-Disc-<timestamp> and click Save
 *  5. Clean-up: in the Program editor, open the card QA-Disc-<timestamp> on Discount Programs (Kanban view), click
 *     Delete and confirm the deletion
 *
 *  Expected Results:
 *  2. QA-Disc-<timestamp> is offered within one minute; the reward line is on "5.0% discount on total amount"
 *  4. The reward line is 7% of the lines' total, on the discount product renamed to "7.0% discount on total amount"
 *  5. No step needed a code change or a redeployment of the CRM or the Discount Service
 *
 *  Port notes (mechanical only): crm-mig host and *_crm_mig accounts; the crm-mig login is moved ahead of the company
 *  (a company cannot be created without a session; the master listed the login after it until 2026-10-30); company and opportunities
 *  through the Mig helpers; the opportunities are re-opened by URL after the Program-editor steps; "Advanced (customer
 *  condition) = customer name is X" is entered as the rule Payer > Name is X - crm-mig labels the order's customer
 *  "Payer" and the rule's code reads partner_id.name == "X" (read 2026-10-27); no Promo code is typed (the master gives
 *  none; the app numbers it NEW<n>); "offered within one minute" = offered at the first Promotion-list read, or after
 *  waiting one minute and changing the quantity to ask again (same reading as CRM-12144_1.1 step 5).
 * ================================================================================================
 */

const TC = 'CRM-12144_8.2';
const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const EDITOR_ACCOUNT = users.admin_discount_mig; // QA's named Program editor account (CRM-12467 row 1.7)
const SALES = users.sale_ic_thomas_crm_mig;
const MANAGER = users.manager_max_crm_mig; // Step 4 only: updating crm-mig's nakivo.promotion row needs Sales / Manager (tester 2026-10-28)
const ONE_MINUTE = CommonUtils.waitTimes.abnormalWait * 2;
const PRODUCT_5 = '5.0% discount on total amount';
const PRODUCT_7 = '7.0% discount on total amount';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account (held by the development team)',
  pre2: 'Pre-condition 2: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)',
  pre3: 'Pre-condition 3: On crm-mig, create a new company in Contacts with: Name = Disc-Cust-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist (USD)',
  pre4: 'Pre-condition 4: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields) with: Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  pre5: 'Pre-condition 5: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields) with: Name = Disc-Opp2-<timestamp>, Customer = Disc-Cust-<timestamp>',
  s1: 'Step 1: In the Program editor, open Discount Programs (Kanban view), click New program and enter Program name = QA-Disc-<timestamp>, Reward = 5.0 %, Applies to = Whole order and Advanced (customer condition) = customer name is Disc-Cust-<timestamp>; click Save [Advanced = the rule Payer > Name is Disc-Cust-<timestamp>: crm-mig labels the order\'s customer "Payer"]',
  s2: 'Step 2: In crm-mig, without running a sync, Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment, add A2160B with Ordered Qty 1, pick QA-Disc-<timestamp> and click Save [not offered yet: wait one minute and change the quantity to ask again]',
  s3: 'Step 3: In the Program editor, open the card QA-Disc-<timestamp>, click Edit, change Reward to 7.0 % and click Save',
  s4: 'Step 4: Open Disc-Opp2-<timestamp>, click DEAL ELEMENT, add A2160B with Ordered Qty 1, pick QA-Disc-<timestamp> and click Save [as Max Zaprykutenko - Sales / Manager (tester 2026-10-28): the salesperson may not update the program\'s nakivo.promotion row]',
  s5: 'Step 5: Clean-up: in the Program editor, open the card QA-Disc-<timestamp> on Discount Programs (Kanban view), click Delete and confirm the deletion',
  verify: 'Verification',
} as const;

test.use({ ignoreHTTPSErrors: true, actionTimeout: MIG_ACTION_TIMEOUT }); // the Program editor's certificate chain is self-signed

/** Every run of this file - the afterAll sweep re-finds a run's leftovers by its own marker (never by a keep-list). */
const runs: DiscountRun[] = [];
/** Programs this file created in the Program editor and has not deleted yet - by the exact name the run gave them. */
const editorRows: string[] = [];
/** crm-mig rows that mirror this file's programs: { program name, the UTC time the run started }. */
const mirrored: Array<{ name: string; since: string }> = [];

const forgetEditorRow = (name: string): void => {
  const i = editorRows.indexOf(name);
  if (i >= 0) editorRows.splice(i, 1);
};
const utcNow = (): string => new Date().toISOString().replace('T', ' ').slice(0, 19); // Odoo's create_date format
const at = (ms: number): string => new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

/** Delete the programs this file created in the Program editor and has not deleted (crm-mig rule: the teardown deletes what it made). */
async function removeEditorRows(page: Page): Promise<void> {
  if (!editorRows.length) return;
  const editor = new DiscountProgramEditorPageMig(page);
  await editor.signIn(EDITOR_ACCOUNT);
  for (const name of [...editorRows]) {
    const r = await editor.deleteProgramOnKanban(name);
    if (r.cardsLeft) throw new Error(`Program editor: ${name} is still on Discount Programs after Delete (${r.cardsLeft} card(s))`);
    forgetEditorRow(name);
  }
}

/**
 * crm-mig keeps a nakivo.promotion row and a discount product for a program it has been asked about. Remove the ones
 * named EXACTLY after this file's program and created during the run (a deny-list - never "everything except"); count
 * first and stop on more than one run can make. Needs an administrator session on crm-mig (teardownDiscountRunMig
 * leaves one). Throws when a row survives.
 */
async function removeMirroredPromotionsMig(page: Page): Promise<void> {
  const survivors: string[] = [];
  for (const m of [...mirrored]) {
    type PromoRow = { id: number; code: string; create_date: string; discount_product_id: [number, string] | false };
    const rows: PromoRow[] = await rpcMig(page, 'nakivo.promotion', 'search_read', [[['name', '=', m.name]]], { fields: ['code', 'create_date', 'discount_product_id'], limit: 10 });
    console.log(`  - nakivo.promotion named ${m.name}: ${rows.length} ${JSON.stringify(rows)}`);
    if (rows.length > 2) { survivors.push(`nakivo.promotion x${rows.length} named ${m.name} (more than one run can make - left for review)`); continue; }
    for (const p of rows) {
      if (p.create_date < m.since) { survivors.push(`nakivo.promotion ${p.id} (created ${p.create_date}, before the run - not ours to delete)`); continue; }
      const productId = p.discount_product_id ? p.discount_product_id[0] : undefined;
      await rpcMig(page, 'nakivo.promotion', 'unlink', [[p.id]]);
      const left = await rpcMig(page, 'nakivo.promotion', 'search_count', [[['id', '=', p.id]]]);
      console.log(`  - nakivo.promotion ${p.id} remaining = ${left}`);
      if (left) survivors.push(`nakivo.promotion ${p.id}`);
      if (!productId) continue;
      type ProductRow = { id: number; create_date: string; product_tmpl_id: [number, string] };
      const [product]: ProductRow[] = await rpcMig(page, 'product.product', 'search_read', [[['id', '=', productId], ['active', 'in', [true, false]]]], { fields: ['create_date', 'product_tmpl_id'] });
      if (!product) continue;
      if (product.create_date < m.since) { console.log(`  - product.product ${productId} created ${product.create_date} (before the run) - kept`); continue; }
      const used = await rpcMig(page, 'sale.order.line', 'search_count', [[['product_id', '=', productId]]]);
      if (used) { survivors.push(`product.product ${productId} (still on ${used} order line(s))`); continue; }
      await rpcMig(page, 'product.product', 'unlink', [[productId]]);
      const templateLeft = await rpcMig(page, 'product.template', 'search_count', [[['id', '=', product.product_tmpl_id[0]], ['active', 'in', [true, false]]]]);
      if (templateLeft) await rpcMig(page, 'product.template', 'unlink', [[product.product_tmpl_id[0]]]);
      const productLeft = await rpcMig(page, 'product.product', 'search_count', [[['id', '=', productId], ['active', 'in', [true, false]]]]);
      console.log(`  - product.product ${productId} (${product.product_tmpl_id[1]}) remaining = ${productLeft}`);
      if (productLeft) survivors.push(`product.product ${productId}`);
    }
    if (!survivors.length) mirrored.splice(mirrored.indexOf(m), 1);
  }
  if (survivors.length) throw new Error(`Teardown left crm-mig rows behind: ${survivors.join(', ')}`);
}

/**
 * An opportunity whose Save hung on crm-mig can still land server-side with no id captured (run 2026-10-27 18:34:
 * crm.lead 100004007 "Disc-Opp-0089643524" was left behind). Re-find the run's opportunities by their EXACT names -
 * one match each, or nothing is assumed - so teardownDiscountRunMig deletes them. Needs an administrator session.
 */
async function resolveUncapturedOpportunitiesMig(page: Page, r: DiscountRun): Promise<string[]> {
  const notes: string[] = [];
  const wanted: Array<{ name: string; captured: boolean; main: boolean }> = [
    { name: r.opp, captured: !!r.leadId, main: true },
    { name: `Disc-Opp2-${r.ts}`, captured: r.extraLeadIds.length > 0, main: false },
  ];
  for (const w of wanted.filter((x) => !x.captured)) {
    const ids: number[] = await rpcMig(page, 'crm.lead', 'search', [[['name', '=', w.name], ['active', 'in', [true, false]]]], { limit: 5 });
    if (ids.length === 1) {
      if (w.main) r.leadId = ids[0]; else r.extraLeadIds.push(ids[0]);
      console.log(`  - crm.lead ${ids[0]} "${w.name}" was saved server-side without its id reaching the test - added to the teardown`);
    } else if (ids.length > 1) {
      notes.push(`crm.lead x${ids.length} named ${w.name} (more than one run can make - left for review)`);
    }
  }
  return notes;
}

async function cleanUp(page: Page): Promise<void> {
  const errors: string[] = [];
  await removeEditorRows(page).catch((e: Error) => errors.push(e.message));
  if (!SKIP_CLEANUP) {
    if (process.env.SKIP_CLEANUP_MIG !== '1') {
      await signInMig(page, users.admin_crm_mig).catch((e: Error) => errors.push(e.message));
      for (const r of runs) errors.push(...await resolveUncapturedOpportunitiesMig(page, r).catch((e: Error) => [e.message]));
    }
    for (const r of runs) await teardownDiscountRunMig(page, r).catch((e: Error) => errors.push(e.message));
    if (process.env.SKIP_CLEANUP_MIG !== '1' && mirrored.length) {
      await signInMig(page, users.admin_crm_mig);
      await removeMirroredPromotionsMig(page).catch((e: Error) => errors.push(e.message));
    }
  }
  if (errors.length) throw new Error(errors.join(' | '));
}

async function sweep(browser: Browser): Promise<void> {
  if (!SKIP_CLEANUP) await sweepDiscountRunsMig(browser, runs);
  if (!editorRows.length && !mirrored.length) return;
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true });
  try {
    const page = await context.newPage();
    await removeEditorRows(page);
    if (!SKIP_CLEANUP && process.env.SKIP_CLEANUP_MIG !== '1' && mirrored.length) {
      await signInMig(page, users.admin_crm_mig);
      await removeMirroredPromotionsMig(page);
    }
  } finally {
    await context.close().catch(() => {});
  }
}

test.describe(`${TC} - Add and then change a program in the Program editor without redeploying anything (crm-mig)`, () => {
  let run: DiscountRun;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    run = newDiscountRun();
    runs.length = 0;
    runs.push(run);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    await cleanUp(page);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.afterAll(async ({ browser }) => {
    await sweep(browser);
  });

  test(`${TC}: Add and then change a program in the Program editor without redeploying anything`, {
    tag: ['@no-preprod-baseline'],
    annotation: [
      { type: 'manual-tc', description: `${TC} (master "Migration - Discount" row 74, steps 1 / 3 / 5 on the Kanban path - tester 2026-10-27)` },
      { type: 'requirement', description: 'IS-CRM-SUPP-0002 (no redeployment)' },
    ],
  }, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const editor = new DiscountProgramEditorPageMig(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const checks: Check[] = [];
    const programName = `${DiscountProgramEditorPageMig.TEST_PROGRAM_PREFIX}${run.ts}`;
    const opp2 = `Disc-Opp2-${run.ts}`;
    const since = utcNow();
    let opp2Url = '';
    let de1Id: number | undefined;
    let de2Id: number | undefined;
    const time: Record<string, number> = {};
    let waitedStep2 = 0;
    let waitedStep4 = 0;
    let blocked4 = ''; // the error dialog picking the changed program raised in Step 4, if any

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : Program editor (Discount Service of crm-mig)`);
      console.log(`  - Login : ${EDITOR_ACCOUNT.username} (QA's named account, CRM-12467 row 1.7)`);
      await editor.signIn(EDITOR_ACCOUNT);
      const who = await editor.getSignedInAs({ keepOpen: true });
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Pre-condition 1 - the Program editor session belongs to the named account (a FAIL means the run did not use the account the TC names)', expected: `"Signed in as" ${EDITOR_ACCOUNT.username}`, actual: `"Signed in as" ${who || '(none)'}`, passed: who === EDITOR_ACCOUNT.username },
      ], `${TC} - Pre-condition 1 Signed in as`, [DiscountProgramEditorPageMig.ACCOUNT_DROPDOWN]);
      await editor.closeAccountMenu();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in on the Program editor');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log(`  - Host  : crm-mig`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signInMig(page, SALES);
      // [INTERNAL check, Call API] the ROLE the TC names (tester decision 2026-10-26), with its own evidence shot
      await recordSignedInRoleMig(page, testInfo, checks, SALES, 'Sales / User: Own Documents Only', 'Pre-condition 2', `${TC} - Pre-condition 2 role of the salesperson`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - signed in on crm-mig as the salesperson');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createEndCustomerCompanyMig(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - company created');
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      await createOpportunityForCompanyMig(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - opportunity created');
    });

    await test.step(STEP.pre5, async () => {
      console.log(`\n--- ${STEP.pre5} ---`);
      opp2Url = await createOpportunityForCompanyMig(page, run, SALES, { name: opp2 });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 5 - second opportunity created');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      editorRows.push(programName); // before the create call: a Save that lands and then throws is still cleaned up
      mirrored.push({ name: programName, since });
      const created = await editor.createProgramOnKanban({
        'Program name': programName,
        Reward: '5.0',
        'Applies to': 'Whole order',
        Advanced: `customer name is ${run.company}`,
      });
      time.save1 = Date.now();
      console.log(`  - Step 1 Save done at : ${at(time.save1)}`);
      const card = (await editor.getKanbanCards()).find((c) => c.name === programName);
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 1 - (guard) Save made the next version the active one (top bar: Version N / active)', expected: `Version ${created.versionBefore + 1} / active`, actual: Number.isFinite(created.versionAfter) ? `Version ${created.versionAfter} / active` : '(not shown)', passed: created.versionAfter === created.versionBefore + 1 },
        { what: 'Step 1 - (guard) the card QA-Disc-<timestamp> is in the Active column with reward -5% on the whole order and an Advanced condition', expected: `Active | ${programName} | Whole order | -5% | Advanced condition`, actual: card ? `${card.column} | ${card.name} | ${card.scope} | ${card.reward} | ${card.tags.join(', ')}` : '(no card)', passed: !!card && card.column === 'Active' && card.scope === 'Whole order' && card.reward === '-5%' && card.tags.includes('Advanced condition') },
      ], `${TC} - Step 1 program created`, card ? [DiscountProgramEditorPageMig.kanbanCardSelector(card.code), DiscountProgramEditorPageMig.VERSION_CHIP] : [DiscountProgramEditorPageMig.VERSION_CHIP]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - QA-Disc program saved (Kanban)');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await opportunityPage.openByUrlReloaded(run.urlOpp!); // the editor step left the page on the Program editor
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.noProgramProduct, 1);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '21.00');
      time.list2First = Date.now();
      let options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      console.log(`  - Promotion list at ${at(time.list2First)} (${Math.round((time.list2First - time.save1) / 1000)} s after the Step 1 Save): ${options.join(' | ') || '(empty)'}`);
      if (!options.includes(programName)) {
        await dealElementPage.closePromotionList();
        console.log('  - Program not offered yet: waiting one minute, then changing the quantity 1 -> 2 -> 1');
        await page.waitForTimeout(ONE_MINUTE);
        await dealElementPage.changeQtyInRow(DISCOUNT_MIG.noProgramProduct, 2);
        await dealElementPage.changeQtyInRow(DISCOUNT_MIG.noProgramProduct, 1);
        await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '21.00');
        waitedStep2 = ONE_MINUTE;
        options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
        console.log(`  - Promotion list after the wait: ${options.join(' | ') || '(empty)'}`);
      }
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 2 - QA-Disc-<timestamp> is offered within one minute (no sync run)', expected: `${programName} in the Promotion list, at most one minute of waiting`, actual: `${options.includes(programName) ? 'offered' : 'NOT offered'} after ${waitedStep2 / 1000} s of waiting - list: ${options.join(' | ') || '(empty)'}`, passed: options.includes(programName) },
      ], `${TC} - Step 2 Promotion list`, [DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
      await dealElementPage.setPromotion(programName, { exact: true });
      const pickError = await dealElementPage.readErrorDialog();
      if (pickError) {
        console.log(`  ✗ picking ${programName} raised: ${pickError.title}: ${pickError.message}`);
        await recordChecksMig(page, testInfo, checks, [
          { what: 'Step 2 - the reward line is on "5.0% discount on total amount"', expected: `1 reward line, Product = ${PRODUCT_5}`, actual: `(no reward line - picking the program raised "${pickError.title}: ${pickError.message}")`, passed: false },
        ], `${TC} - Step 2 picking the new program`, [DealElementPageMig.ERROR_DIALOG_BOX], 'bottom-right');
        await dealElementPage.dismissErrorDialog();
        throw new Error(`Step 2: picking ${programName} raised "${pickError.title}" - the later steps need Deal Element #1`);
      }
      de1Id = await saveDealElement(page, run);
      time.reward2 = Date.now();
      const rows = await dealElementPage.getAllOrderLineRows();
      const reward = rows.filter((r) => (r['Description'] ?? '').trim() === programName);
      console.log(`  - Deal Element #1 id ${de1Id}; lines with Description = ${programName}: ${reward.length}; reward read at ${at(time.reward2)}`);
      console.log(`  - Observation (not scored) - reward amount on Deal Element #1 : ${reward[0]?.['Unit Price'] ?? '(none)'} (5 % of 21.00 = -1.05)`);
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 2 - the reward line is on "5.0% discount on total amount"', expected: `1 reward line, Product = ${PRODUCT_5}`, actual: reward.length ? `${reward.length} line(s), Product = ${(reward[0]['Product'] ?? '').trim()}` : '(no reward line)', passed: reward.length === 1 && (reward[0]['Product'] ?? '').trim() === PRODUCT_5 },
      ], `${TC} - Step 2 reward line`, [DISCOUNT_HIGHLIGHT.orderLines]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Deal Element #1 saved with QA-Disc (5 %)');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const edited = await editor.editProgramRewardOnKanban(programName, '7.0');
      time.save3 = Date.now();
      console.log(`  - Step 3 Save done at : ${at(time.save3)}`);
      const rewards = await editor.readProgramRewards();
      const reward = rewards.rows.find((r) => r.label === 'Reward');
      const product = rewards.rows.find((r) => r.label === 'Reward line product');
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 3 - (guard) Save made the next version the active one', expected: `Version ${edited.versionBefore + 1} / active`, actual: Number.isFinite(edited.versionAfter) ? `Version ${edited.versionAfter} / active` : '(not shown)', passed: edited.versionAfter === edited.versionBefore + 1 },
        { what: 'Step 3 - (guard) the program page shows the new reward', expected: 'Reward = 7.00 % Applies to Whole order; Reward line product = 7.0 % discount on total amount', actual: `Reward = ${reward?.value ?? '(none)'}; Reward line product = ${product?.value ?? '(none)'}`, passed: (reward?.value ?? '').startsWith('7.00 %') && (product?.value ?? '').replace(/\s+%/, '%') === PRODUCT_7 },
      ], `${TC} - Step 3 reward changed`, [DiscountProgramEditorPageMig.rewardRowSelector('Reward'), DiscountProgramEditorPageMig.rewardRowSelector('Reward line product')], 'bottom-right');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - QA-Disc program changed to 7 %');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      // run 2026-10-27 18:21: as the salesperson, picking the CHANGED program raised "Access Error ... Sales/Manager
      // (Document model: nakivo.promotion) - (Operation: write, User: 9470)" - tester 2026-10-28: Step 4 runs as Max
      console.log(`  - Login : ${MANAGER.username} (${MANAGER.displayName})`);
      await signInMig(page, MANAGER);
      await recordSignedInRoleMig(page, testInfo, checks, MANAGER, 'Sales / Manager', 'Step 4', `${TC} - Step 4 role of the manager`);
      await opportunityPage.openByUrlReloaded(opp2Url);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.noProgramProduct, 1);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '21.00');
      await dealElementPage.setPromotion(programName, { exact: true });
      // if the manager is refused as well, record what it said, shoot it BEFORE OK, skip the Save
      const pickError = await dealElementPage.readErrorDialog();
      if (pickError) {
        blocked4 = `${pickError.title}: ${pickError.message}`;
        time.reward4First = time.reward4 = Date.now();
        console.log(`  ✗ picking ${programName} raised: ${blocked4}`);
        await recordChecksMig(page, testInfo, checks, [
          { what: 'Step 4 - the reward line is 7% of the lines\' total (A2160B x 1 = 21.00)', expected: '-1.47', actual: `(no reward line - picking the program raised "${blocked4}")`, passed: false },
          { what: 'Step 4 - the reward line is on the discount product renamed to "7.0% discount on total amount"', expected: PRODUCT_7, actual: `(no reward line - ${pickError.title})`, passed: false },
        ], `${TC} - Step 4 picking the changed program`, [DealElementPageMig.ERROR_DIALOG_BOX], 'bottom-right');
        await dealElementPage.dismissErrorDialog(); // logs the dialog's details (and traceback, if any) before OK
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - picking QA-Disc raised an error, Deal Element #2 not saved');
        return; // no Save can reach a reward line now - Step 5 still deletes the program, the VERIFY block reports it
      }
      de2Id = await saveDealElement(page, run);
      const readReward = async (): Promise<Record<string, string> | undefined> =>
        (await dealElementPage.getAllOrderLineRows()).filter((r) => (r['Description'] ?? '').trim() === programName)[0];
      let line = await readReward();
      time.reward4First = Date.now();
      const isSeven = (l?: Record<string, string>): boolean => money(l?.['Unit Price'] ?? '') === -1.47 && (l?.['Product'] ?? '').trim() === PRODUCT_7;
      console.log(`  - Deal Element #2 id ${de2Id}; first reward read at ${at(time.reward4First)}: ${line ? `${line['Product']} ${line['Unit Price']}` : '(none)'}`);
      if (!isSeven(line)) {
        console.log('  - Not 7 % yet: waiting one minute, then changing the quantity 1 -> 2 -> 1 and saving again');
        await page.waitForTimeout(ONE_MINUTE);
        waitedStep4 = ONE_MINUTE;
        await dealElementPage.clickEdit();
        await dealElementPage.changeQtyInRow(DISCOUNT_MIG.noProgramProduct, 2);
        await dealElementPage.changeQtyInRow(DISCOUNT_MIG.noProgramProduct, 1);
        await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '21.00');
        await saveDealElement(page, run);
        line = await readReward();
        console.log(`  - reward after the wait: ${line ? `${line['Product']} ${line['Unit Price']}` : '(none)'}`);
      }
      time.reward4 = Date.now();
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 4 - the reward line is 7% of the lines\' total (A2160B x 1 = 21.00)', expected: '-1.47', actual: line?.['Unit Price'] ?? '(no reward line)', passed: money(line?.['Unit Price'] ?? '') === -1.47 },
        { what: 'Step 4 - the reward line is on the discount product renamed to "7.0% discount on total amount"', expected: PRODUCT_7, actual: (line?.['Product'] ?? '(no reward line)').trim(), passed: (line?.['Product'] ?? '').trim() === PRODUCT_7 },
      ], `${TC} - Step 4 reward line`, [DISCOUNT_HIGHLIGHT.orderLines]);
      // [INTERNAL check, Call API] "renamed": the SAME product record carries both reward lines, now under the 7 % name
      type LineRow = { order_id: [number, string]; product_id: [number, string] };
      const lines: LineRow[] = de1Id && de2Id
        ? await rpcMig(page, 'sale.order.line', 'search_read', [[['order_id', 'in', [de1Id, de2Id]], ['is_reward_line', '=', true]]], { fields: ['order_id', 'product_id'] })
        : [];
      const p1 = lines.find((l) => l.order_id[0] === de1Id)?.product_id;
      const p2 = lines.find((l) => l.order_id[0] === de2Id)?.product_id;
      console.log(`  - reward line products : Deal Element #1 ${JSON.stringify(p1 ?? null)} | Deal Element #2 ${JSON.stringify(p2 ?? null)}`);
      checks.push({ what: 'Step 4 - [INTERNAL check, Call API] the discount product is RENAMED, not replaced: both Deal Elements\' reward lines are on the same product record, now "7.0% discount on total amount" (two ids would mean a second product)', expected: `one product id, name ${PRODUCT_7}`, actual: p1 && p2 ? `#1 ${p1[0]} "${p1[1]}" | #2 ${p2[0]} "${p2[1]}"` : '(reward line missing)', passed: !!p1 && !!p2 && p1[0] === p2[0] && p2[1] === PRODUCT_7 });
      console.log(`  - ${checks[checks.length - 1].what} : ${checks[checks.length - 1].actual} (${checks[checks.length - 1].passed ? 'PASS' : 'FAIL'})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - Deal Element #2 saved with QA-Disc (7 %)');
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      const deleted = await editor.deleteProgramOnKanban(programName);
      if (!deleted.cardsLeft) forgetEditorRow(programName);
      console.log(`  - delete dialog : ${deleted.dialogText}`);
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 5 - (guard) the card QA-Disc-<timestamp> is gone from Discount Programs after Delete', expected: '0 cards', actual: `${deleted.cardsLeft} card(s); version ${deleted.versionBefore} -> ${deleted.versionAfter}`, passed: deleted.cardsLeft === 0 },
      ], `${TC} - Step 5 program deleted`, [DiscountProgramEditorPageMig.VERSION_CHIP]);
      // Expected 5, scored by time (tester 2026-10-27): no step waited for a deploy - the change reached crm-mig with at
      // most one minute of waiting after its Save, and the run ran no sync; every Save time is printed
      console.log('  Timeline (UTC):');
      console.log(`    - Step 1 Save (5 %)            : ${at(time.save1)}`);
      console.log(`    - Step 2 first Promotion list  : ${at(time.list2First)}  (+${Math.round((time.list2First - time.save1) / 1000)} s, waited ${waitedStep2 / 1000} s)`);
      console.log(`    - Step 2 reward read           : ${at(time.reward2)}`);
      console.log(`    - Step 3 Save (7 %)            : ${at(time.save3)}`);
      console.log(`    - Step 4 first reward read     : ${at(time.reward4First)}  (+${Math.round((time.reward4First - time.save3) / 1000)} s, includes opening Disc-Opp2 and its Deal Element)`);
      console.log(`    - Step 4 7 % reward read       : ${at(time.reward4)}  (waited ${waitedStep4 / 1000} s)`);
      const sevenSeen = checks.some((c) => c.what.startsWith('Step 4 - the reward line is 7%') && c.passed);
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 5 - no step needed a code change or a redeployment of the CRM or the Discount Service (scored by time: each program change reached crm-mig with at most one minute of waiting after its Save, no sync run)', expected: 'Step 2: offered after <= 60 s of waiting; Step 4: 7 % applied after <= 60 s of waiting', actual: `Step 2 waited ${waitedStep2 / 1000} s (${checks.find((c) => c.what.startsWith('Step 2 - QA-Disc'))?.passed ? 'offered' : 'NOT offered'}); Step 4 waited ${waitedStep4 / 1000} s (${sevenSeen ? '7 % applied' : `7 % NOT applied${blocked4 ? ` - ${blocked4}` : ''}`});${Math.round((time.reward4 - time.save3) / 1000)} s from the Step 3 Save to the 7 % reward line`, passed: waitedStep2 <= ONE_MINUTE && waitedStep4 <= ONE_MINUTE && sevenSeen && !!checks.find((c) => c.what.startsWith('Step 2 - QA-Disc'))?.passed },
      ], `${TC} - Step 5 no redeployment (timeline)`, []);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - QA-Disc program deleted');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
