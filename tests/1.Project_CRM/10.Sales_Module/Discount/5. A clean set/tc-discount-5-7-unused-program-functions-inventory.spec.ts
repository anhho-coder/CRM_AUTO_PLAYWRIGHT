import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';
import { Check, signIn, recordChecks, printVerifyAndAssert, ProgramOwner } from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  Discount_5.7 - Read which Promotion Program functions the active programs use   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_5.7
 * Automation-Type  : new
 * Automation-Date  : 2026-11-05
 * Mirrors          : CRM-12144_5.7 (crm-mig manual TC, master "Migration - Discount") - the A side of the pair: the
 *                    reference system HAS the 9 functions the crm-mig Program editor does not offer (CRM-14435 rows 9-19);
 *                    this case shows no active program uses them, so leaving them out loses no setting in use
 * Jira             : CRM-14439 (master "Sales module" row 156)
 * Spec             : [Migration] Discounts (Promotions) v7, page 222532591 - IS-CRM-FUNC-0089, IS-CRM-FUNC-0074-05,
 *                    IS-CRM-FUNC-0097; maximum uses, maximum discount amount and company not named (CRM-13848)
 * Revised          : 2026-11-05 - Free Shipping removed: Reward offers only Discount and Free Product on the reference system
 *                    (fields_get read by the first run of this spec)
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : CRM administrator (users.admin_crm) - the Promotion Programs menu is a Sales / Manager screen
 *
 * Adaptations to the reference system (reason)
 *   - Step 2 reads the choices of each selection field with fields_get over JSON-RPC (ProgramOwner, read only): the form
 *     shows only the value that is set, not the other choices.
 *   - Step 3 reads the 9 settings of every active program with search_read (read only); programs whose name starts with
 *     AUTO- or KEEP- are QA test programs and are left out.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_5\.7:" --project=chromium-headless
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (Discount_5.7)
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Login to pre-production as the CRM administrator
 *  Steps
 *    1. Open Sales > Products > Promotion Programs and open "Deal registration promotion, 10% on Product, Support Services
 *       do not qualify"
 *    2. Read the program form
 *         -> Expected: the form shows Minimum Purchase Of, Promo Code Usage, Apply on First, Applicability, Reward, Apply
 *            Discount, Discount Apply On, Max Discount Amount and Company; their choices include Tax Included, a code
 *            needed, the next order, Free Product, Fixed Amount and Cheapest Product
 *    3. Back on Promotion Programs, read those settings on every active program
 *         -> Expected: no active program uses Tax Included, a code, a maximum number of uses, the next order, a free
 *            product, a fixed amount, the cheapest product or a maximum discount amount; every program
 *            belongs to NAKIVO, Inc.
 * ================================================================================================
 */

const TC = 'Discount_5.7';
const ADMIN = users.admin_crm;
const DEAL_REGISTRATION_ID = 1; // "Deal registration promotion, 10% on Product, Support Services do not qualify" (pre-prod, read 2026-11-05)
const PROGRAMS_URL = '/web#action=800&menu_id=499&model=sale.coupon.program&view_type=list'; // Sales > Products > Promotion Programs

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to pre-production as the CRM administrator',
  s1: 'Step 1: Open Sales > Products > Promotion Programs and open "Deal registration promotion, 10% on Product, Support Services do not qualify"',
  s2: 'Step 2: Read the program form',
  s3: 'Step 3: Back on Promotion Programs, read those settings on every active program',
  verify: 'Verification',
} as const;

/** The 9 form labels (CRM-14435 rows 9-19, Pre-production names). */
const LABELS = ['Minimum Purchase Of', 'Promo Code Usage', 'Apply on First', 'Applicability', 'Reward', 'Apply Discount', 'Discount Apply On', 'Max Discount Amount', 'Company'];
/** field -> the choice the crm-mig Program editor does not offer */
const CHOICES: Array<[string, string, string]> = [
  ['rule_minimum_amount_tax_inclusion', 'tax_included', 'Tax Included'],
  ['promo_code_usage', 'code_needed', 'a code needed'],
  ['promo_applicability', 'on_next_order', 'the next order'],
  ['reward_type', 'product', 'Free Product'],
  ['discount_type', 'fixed_amount', 'Fixed Amount'],
  ['discount_apply_on', 'cheapest_product', 'Cheapest Product'],
];

test.describe(`${TC} - Read which Promotion Program functions the active programs use (pre-prod baseline of CRM-12144_5.7)`, () => {
  let openedOwner: ProgramOwner | undefined;

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (openedOwner) await openedOwner.close().catch(() => {});
    openedOwner = undefined;
    // nothing to clean up: read only
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Read which Promotion Program functions the active programs use`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const checks: Check[] = [];
    const owner = await ProgramOwner.open();
    openedOwner = owner;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Login : ${ADMIN.username} (${ADMIN.displayName})`);
      await signIn(page, ADMIN);
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await page.goto(`${new URL(page.url()).origin}/web#id=${DEAL_REGISTRATION_ID}&action=800&menu_id=499&model=sale.coupon.program&view_type=form`, { waitUntil: 'domcontentloaded' });
      await page.locator('.o_form_view').first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
      console.log(`  - Form : ${((await page.locator('.o_form_view h1, .o_form_view .oe_title').first().innerText().catch(() => '')) || '').trim()}`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const shown = (await page.locator('.o_form_view label.o_form_label').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
      const missing = LABELS.filter((l) => !shown.includes(l));
      // automation aid (read only): the choices of each selection field - the form shows only the value set
      const meta: Record<string, { selection?: Array<[string, string]> }> = await owner.call('sale.coupon.program', 'fields_get', [CHOICES.map((c) => c[0])], { attributes: ['selection'] });
      const choiceRows = CHOICES.map(([field, key, label]) => {
        const sel = meta[field]?.selection ?? [];
        const hit = sel.find(([k]) => k === key);
        return { label, ok: !!hit, shown: hit ? `${field} = ${key} ("${hit[1]}")` : `${field}: ${sel.map(([k]) => k).join(', ') || '(no selection)'}` };
      });
      for (const c of choiceRows) console.log(`  - choice ${c.label}: ${c.shown}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - the form shows the 9 labels', expected: LABELS.join(' | '), actual: missing.length ? `missing: ${missing.join(', ')}` : LABELS.join(' | '), passed: !missing.length },
        { what: 'Step 2 - the choices include Tax Included, a code needed, the next order, Free Product, Fixed Amount and Cheapest Product', expected: CHOICES.map((c) => c[2]).join(' | '), actual: choiceRows.map((c) => `${c.label}: ${c.ok ? 'offered' : 'NOT offered'}`).join(' | '), passed: choiceRows.every((c) => c.ok) },
      ], `${TC} - Step 2 program form`, ['.o_form_view .o_form_sheet']);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await page.goto(`${new URL(page.url()).origin}${PROGRAMS_URL}`, { waitUntil: 'domcontentloaded' });
      await page.locator('.o_list_view').first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
      // automation aid (read only): the 9 settings of every active business program
      const rows: Array<Record<string, any>> = await owner.call('sale.coupon.program', 'search_read',
        [[['active', '=', true], ['name', 'not ilike', 'AUTO-'], ['name', 'not ilike', 'KEEP-']]],
        { fields: ['name', 'rule_minimum_amount_tax_inclusion', 'promo_code_usage', 'maximum_use_number', 'promo_applicability', 'reward_type', 'discount_type', 'discount_apply_on', 'discount_max_amount', 'company_id'], limit: 100 });
      console.log(`  - Active programs : ${rows.length}`);
      const using = (pred: (r: Record<string, any>) => boolean) => rows.filter(pred).map((r) => r.name);
      const uses: Array<[string, string[]]> = [
        ['Tax Included', using((r) => r.rule_minimum_amount_tax_inclusion === 'tax_included')],
        ['a code needed', using((r) => r.promo_code_usage === 'code_needed')],
        ['a maximum number of uses (Apply on First > 0)', using((r) => (r.maximum_use_number || 0) > 0)],
        ['the next order', using((r) => r.promo_applicability === 'on_next_order')],
        ['a free product', using((r) => r.reward_type !== 'discount')],
        ['a fixed amount', using((r) => r.discount_type === 'fixed_amount')],
        ['the cheapest product', using((r) => r.discount_apply_on === 'cheapest_product')],
        ['a maximum discount amount (> 0)', using((r) => (r.discount_max_amount || 0) > 0)],
      ];
      const companies = [...new Set(rows.map((r) => (Array.isArray(r.company_id) ? r.company_id[1] : String(r.company_id))))];
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - there are active business programs to read', expected: '> 0', actual: String(rows.length), passed: rows.length > 0 },
        ...uses.map(([fn, names]) => ({ what: `Step 3 - no active program uses ${fn}`, expected: '0 programs', actual: `${names.length} programs${names.length ? `: ${names.join(', ')}` : ''}`, passed: names.length === 0 })),
        { what: 'Step 3 - every active program belongs to NAKIVO, Inc.', expected: 'NAKIVO, Inc.', actual: companies.join(' | ') || '(none)', passed: companies.length === 1 && companies[0] === 'NAKIVO, Inc.' },
      ], `${TC} - Step 3 active programs`, ['.o_list_view']);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
