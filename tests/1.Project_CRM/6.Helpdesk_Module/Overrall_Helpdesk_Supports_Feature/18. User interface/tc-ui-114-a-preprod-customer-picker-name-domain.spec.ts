import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ================================================================================================
 *  TC-UI-114_A - Choosing the customer, found by name or domain - side A: Odoo 12 pre-production (baseline "as today")
 * ================================================================================================
 * Test Case ID     : TC-UI-114_A   (side B = tc-ui-114-b-support-customer-picker-name-domain.spec.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-03
 * Jira             : CRM-14109 (Xray Test, created 2026-11-03; feature CRM-11859)
 * Requirement      : IS-CRM-UI-0017 (Confluence 231246777 v9, answer to CRM-13846); this side records how an agent finds the
 *                    customer today - Odoo's Customer (partner_id) dropdown, which ends with "Search More..."
 * Host / Run as    : pre-production Odoo 12 / L1 agent Giang Le (users.support_l1_giang_preprod, Support Team = l1 asserted)
 * Data             : READ ONLY - the company is an existing customer picked at run time (the newest company with an e-mail behind
 *                    the newest Customer Support tickets); the create form is DISCARDED, nothing is saved
 * Folder           : "18. User interface" = Confluence 231246777 spec area of IS-CRM-UI-0017
 *
 * Summary: Helpdesk > All Tickets > CREATE > Customer: typing the company name offers it; typing the domain of its e-mail
 * offers it too (Odoo also matches the partner e-mail). The form is discarded.
 * Command to run: npx playwright test tc-ui-114-a-preprod --grep "TC-UI-114_A:" --project=chromium-headless
 *
 *  Source manual TC : written 2026-11-03 from Confluence 231246777 v9 (no CSV row) - Xray CRM-14109; master tab "Helpdesk module", TC ID
 *                     CRM-11859_TC-UI-114_A; 2 steps
 *  Source version   : Confluence 231246777 v9 - re-check the master row and the Xray steps before trusting this spec
 *  Pre-conditions   : Role: L1 agent. Agent account; a company partner with an e-mail.
 *                     1. Logged in as L1 agent Giang Le on pre-production
 *                     2. [INTERNAL check, Call API] the company = the newest company with an e-mail behind the newest CS tickets
 *  Steps to reproduce #1
 *    1. Odoo: Helpdesk > All Tickets > CREATE > Customer: type the first word of the company name; read the options
 *    2. Odoo: Customer: type the domain of the company e-mail instead; read the options - then DISCARD
 *  Verification - A expected (today)
 *    1. The company is offered for its name (what each option shows is printed as an observation - today: the name, or
 *       "<company>, <e-mail>" for a contact; "Search More..." is added by Odoo only when more matches exist than it lists).
 *  Trap: Escape in an Odoo form in edit mode asks to DISCARD the record - the dropdown is never closed with Escape here; the
 *  second search retypes the same input, and the form is discarded at the end.
 *    2. The company is offered for its e-mail domain.
 *
 * Evidence: Pre-condition 1 end shot; verify shots Step 1 and Step 2 (the open autocomplete); end of Steps to reproduce #1;
 *           afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-UI-114_A';

const STEP = {
  pre1: 'Pre-condition 1: Agent account - pre-production (Odoo 12 EE) as L1 agent Giang Le; [INTERNAL check, Call API] Support Team = l1',
  pre2: 'Pre-condition 2: [INTERNAL check, Call API] the company = the newest company with an e-mail behind the newest Customer Support tickets',
  s1: 'Step 1: Odoo: Helpdesk > All Tickets > CREATE > Customer: type the first word of the company name; read the options',
  s2: 'Step 2: Odoo: Customer: type the domain of the company e-mail instead; read the options - then DISCARD',
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_preprod;

/** `difference` = REQUIREMENT #4c conclusion, printed on a FAIL only. */
type Check = { what: string; expected: string; actual: string; passed: boolean; difference?: string };
function bannerLines(c: Check, width = 96): string[] {
  const wrap = (head: string, text: string): string[] => {
    const pad = ' '.repeat(head.length); const out: string[] = []; let cur = head;
    for (const word of text.split(' ')) { if (cur.length + word.length > width && cur.trim().length > head.trim().length) { out.push(cur.trimEnd()); cur = pad; } cur += `${word} `; }
    out.push(cur.trimEnd()); return out;
  };
  return [...wrap('', `${c.what}:`), ...wrap('   Expected : ', c.expected), ...wrap('   Actual   : ', c.actual),
    ...(!c.passed && c.difference ? wrap('   Difference : ', c.difference) : [])];
}
/** Record a step's checks and take their verify-point evidence shot BEFORE any expect() (REQUIREMENT #3b). */
async function recordChecks(page: Page, testInfo: TestInfo, all: Check[], stepChecks: Check[], name: string, highlight: string[], corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'bottom-right'): Promise<void> {
  all.push(...stepChecks);
  for (const c of stepChecks) console.log(`  - ${c.what} : ${c.actual} (${c.passed ? 'PASS' : 'FAIL'})`);
  await CommonUtils.captureVerifyEvidence(page, testInfo, { name, passed: stepChecks.every((c) => c.passed), highlight, lines: stepChecks.flatMap((c) => bannerLines(c)), corner }).catch(() => {});
}

test.describe(`${TC} - Customer dropdown on Odoo 12 pre-production`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version (REQUIREMENT #7) ---\n  - Source: Confluence 231246777 v9, IS-CRM-UI-0017 (no CSV row - nothing to fingerprint)');
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---');
    await new HelpdeskPage(page).discardCreateForm().catch(() => {});
    console.log('  - Read-only case: the create form was discarded - nothing saved');
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Customer dropdown finds the company by name and by e-mail domain - A: Odoo 12 Customer field`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const hd = new HelpdeskPage(page);
    const checks: Check[] = [];
    let company = { id: 0, name: '', email: '' };
    let domain = '';

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${AGENT.username} on ${baseUrl}`);
      try {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await loginPage.navigateTo(baseUrl);
        await loginPage.login(AGENT.username, AGENT.password, CommonUtils.waitTimes.pageLoad);
        await loginPage.dismissLocationPermissionDialog();
        const me = await hd.getMyEmployeeSupportTeam();
        console.log(`  [INTERNAL check, Call API] support_team = ${me.supportTeam || '(empty)'}`);
        expect(me.supportTeam, 'the signed-in account is an L1 agent').toBe('l1');
      } catch (e) {
        const reason = String((e as Error)?.message ?? e).split('\n')[0];
        console.log(`  SET-UP FAILED : ${reason}`);
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Pre-condition 1 - set-up failed', passed: false, lines: [`SET-UP FAILED - ${STEP.pre1}`, `  error: ${reason}`], corner: 'bottom-right' }).catch(() => {});
        throw e;
      }
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      company = await hd.findCompanyPartnerOverRpc();
      domain = company.email.split('@')[1] || '';
      console.log(`  - Company : ${company.name} (#${company.id})\n  - E-mail  : ${company.email}\n  - Domain  : ${domain}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-conditions - signed in, company read');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await hd.navigateToHelpdesk();
      await hd.openAllTicketsFromMenu();
      await hd.switchToListView().catch(() => {});
      await hd.openCreateTicketForm();
      const word = company.name.split(/\s+/)[0];
      const options = await hd.getCustomerOptions(word);
      console.log(`  - Typed "${word}" -> ${options.length} option(s): ${JSON.stringify(options)}`);
      const mine = options.find((o) => o.includes(company.name));
      console.log(`  Observation (not scored) - the company's option shows: "${mine || '(none)'}"; Search More... offered: ${options.includes('Search More...')}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 the company is offered for its name', expected: `an option carrying "${company.name}"`, actual: mine ? `"${mine}"` : `not offered (options: ${options.join(' | ') || 'none'})`, passed: !!mine, difference: `'${company.name}' not found` },
      ], `${TC} - Step 1 search by name`, [HelpdeskPage.AUTOCOMPLETE], 'bottom-right');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const options = await hd.getCustomerOptions(domain);
      console.log(`  - Typed "${domain}" -> ${options.length} option(s): ${JSON.stringify(options)}`);
      const mine = options.find((o) => o.includes(company.name));
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 the company is offered for its e-mail domain', expected: `an option carrying "${company.name}" for "${domain}"`, actual: mine ? `"${mine}"` : `not offered (options: ${options.join(' | ') || 'none'})`, passed: !!mine, difference: `'${company.name}' not found for '${domain}'` },
      ], `${TC} - Step 2 search by domain`, [HelpdeskPage.AUTOCOMPLETE], 'bottom-right');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 1 - Customer dropdown searched');
      await hd.discardCreateForm();
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference ?? c.what}`).join(' | ')}` : 'OVERALL: PASS - the company is found by name and by e-mail domain');
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference ? `Difference: ${c.difference}` : `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(failed.map((c) => c.what), 'the Customer dropdown works as today').toEqual([]);
    });
  });
});
