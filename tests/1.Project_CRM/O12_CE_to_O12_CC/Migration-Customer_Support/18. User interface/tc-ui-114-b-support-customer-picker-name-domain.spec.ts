import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl_support_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { SupportDeskPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { customerSupportBaselineDetails } from '@helpers/customer-support-mig.helper';

/**
 * ================================================================================================
 *  TC-UI-114_B - Choosing the customer: name, domain and country, found by name or domain - side B: Support service
 * ================================================================================================
 * Test Case ID     : TC-UI-114_B   (side A = tc-ui-114-a-preprod-customer-picker-name-domain.spec.ts = baseline, map in
 *                    helpers/customer-support-mig.baseline-map.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-03
 * Jira             : CRM-14110 (Xray Test, created 2026-11-03; feature CRM-11859)
 * Requirement      : IS-CRM-UI-0017 (Confluence 231246777 v9, answer to CRM-13846): "When choosing the customer on a ticket, an
 *                    agent shall see each company's name, domain and country, and shall be able to find the company by name or
 *                    domain." (Aiva: a separate "Search More" window is not required.)
 * Host / Run as    : support-crm-mig (Frappe Helpdesk, ignoreHTTPSErrors) / L1 agent Giang Le (users.support_l1_giang_support_mig,
 *                    HD Agent Support Level = L1 asserted)
 * Data             : READ ONLY - the company searched for is an existing HD Customer picked at run time (the newest one whose
 *                    domain and country are filled); the New Ticket form is never submitted
 * Folder           : "18. User interface" = Confluence 231246777 spec area of IS-CRM-UI-0017
 *
 * Summary: All Tickets > Create > Customer: typing the company's name must offer it with its name, domain and country; typing
 * its domain must offer it too.
 * Command to run: npx playwright test tc-ui-114-b-support --grep "TC-UI-114_B:" --project=chromium-headless
 *
 *  Source manual TC : written 2026-11-03 from Confluence 231246777 v9 (no CSV row) - Xray CRM-14110; master tab "Migration - Customer Support",
 *                     TC ID CRM-11859_TC-UI-114_B; 2 steps
 *  Source version   : Confluence 231246777 v9 - re-check the master row and the Xray steps before trusting this spec
 *  Pre-conditions   : Role: L1 agent. Agent account; a company (HD Customer) whose domain and country are filled.
 *                     1. Logged in as L1 agent Giang Le on the Support service
 *                     2. [INTERNAL check, Call API] the company = the newest HD Customer with a domain and a country
 *  Steps to reproduce #1
 *    1. FF: All Tickets > Create > Customer: type the first word of the company's name; read the options
 *    2. FF: Customer: type the company's domain instead; read the options
 *  Verification - B expected
 *    1. The company is offered, and its option shows its name, its domain and its country (an option showing the name only
 *       is a FAIL - the agent cannot tell two companies of the same name apart).
 *    2. The company is offered for its domain (no option, or only other companies, is a FAIL).
 *
 * Evidence: Pre-condition 1 end shot; verify shots Step 1 and Step 2 (the open option list); end of Steps to reproduce #1;
 *           afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true });

const TC = 'TC-UI-114_B';

const STEP = {
  pre1: 'Pre-condition 1: Agent account - Support service (Frappe Helpdesk) /login as L1 agent Giang Le; [INTERNAL check, Call API] HD Agent Support Level = L1',
  pre2: 'Pre-condition 2: [INTERNAL check, Call API] the company = the newest HD Customer whose domain and country are filled',
  s1: "Step 1: FF: All Tickets > Create > Customer: type the first word of the company's name; read the options",
  s2: "Step 2: FF: Customer: type the company's domain instead; read the options",
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_support_mig;

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

test.describe(`${TC} - Customer picker on the Support service`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version (REQUIREMENT #7) ---\n  - Source: Confluence 231246777 v9, IS-CRM-UI-0017 (no CSV row - nothing to fingerprint)');
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---\n  - Read-only case: the New Ticket form was never submitted - nothing to clean up');
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Customer picker shows name, domain and country and finds by domain - B: Frappe Helpdesk New Ticket > Customer`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    let company = { name: '', domain: '', country: '' };

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${AGENT.username} on ${baseUrl_support_mig}`);
      try {
        await desk.login(baseUrl_support_mig, AGENT.username, AGENT.password);
        const agent = await desk.getMyAgentLevel(AGENT.username);
        console.log(`  [INTERNAL check, Call API] support level = ${agent.level || '(empty)'}`);
        expect(agent.level, 'the signed-in agent is an L1 agent').toBe('L1');
      } catch (e) {
        const reason = String((e as Error)?.message ?? e).split('\n')[0];
        console.log(`  SET-UP FAILED : ${reason}`);
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Pre-condition 1 - set-up failed', passed: false, lines: [`SET-UP FAILED - ${STEP.pre1}`, `  error: ${reason}`], corner: 'bottom-right' }).catch(() => {});
        throw e;
      }
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      company = await desk.findCustomerWithDomainAndCountry();
      console.log(`  - Company : ${company.name}\n  - Domain  : ${company.domain}\n  - Country : ${company.country}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-conditions - signed in, company read');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await desk.openAllTicketsFromSidebar();
      await desk.openNewTicketForm();
      const word = company.name.split(/\s+/)[0];
      const options = await desk.searchNewTicketCustomer(word);
      console.log(`  - Typed "${word}" -> ${options.length} option(s): ${JSON.stringify(options)}`);
      const mine = options.find((o) => o.includes(company.name));
      const shows = mine ? { domain: mine.includes(company.domain), country: mine.includes(company.country) } : { domain: false, country: false };
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 the company is offered for its name', expected: `an option carrying "${company.name}"`, actual: mine ? `"${mine}"` : `not offered (options: ${options.join(' | ') || 'none'})`, passed: !!mine, difference: `'${company.name}' not found` },
        { what: 'Step 1 the option shows the name, the domain and the country', expected: `"${company.name}" with "${company.domain}" and "${company.country}"`, actual: mine ? `"${mine}"` : '(no option)', passed: !!mine && shows.domain && shows.country, difference: [!mine ? 'no option for the company' : '', mine && !shows.domain ? `domain '${company.domain}' not shown` : '', mine && !shows.country ? `country '${company.country}' not shown` : ''].filter(Boolean).join('; ') },
      ], `${TC} - Step 1 search by name`, [SupportDeskPageMig.MENU], 'bottom-right');
      await desk.closeOpenMenu();
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const options = await desk.searchNewTicketCustomer(company.domain);
      console.log(`  - Typed "${company.domain}" -> ${options.length} option(s): ${JSON.stringify(options)}`);
      const mine = options.find((o) => o.includes(company.name));
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 the company is offered for its domain', expected: `an option carrying "${company.name}" for "${company.domain}"`, actual: mine ? `"${mine}"` : `not offered (options: ${options.join(' | ') || 'none'})`, passed: !!mine, difference: `'${company.name}' not found for its domain '${company.domain}'` },
      ], `${TC} - Step 2 search by domain`, options.length ? [SupportDeskPageMig.MENU] : ['input[placeholder="Customer company"]'], 'bottom-right');
      await desk.closeOpenMenu();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 1 - Customer picker searched');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference ?? c.what}`).join(' | ')}` : 'OVERALL: PASS - the company is shown with its name, domain and country, and found by name and by domain');
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference ? `Difference: ${c.difference}` : `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(failed.map((c) => c.what), 'the Customer picker meets IS-CRM-UI-0017').toEqual([]);
    });
  });
});
