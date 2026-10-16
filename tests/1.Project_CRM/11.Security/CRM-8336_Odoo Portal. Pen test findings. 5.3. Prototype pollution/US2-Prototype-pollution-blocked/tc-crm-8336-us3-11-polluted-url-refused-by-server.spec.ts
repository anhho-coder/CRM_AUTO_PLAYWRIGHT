import { test, expect } from '@playwright/test';
import { baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  CRM-8336 - Pen test finding 5.3 - Prototype pollution
 *  Server layer - a URL carrying a dangerous parameter name is refused before the page is built
 * =============================================================================================
 *  Test Case ID     : CRM-8336_US3.11
 *  Jira             : CRM-12609 (Implementation - Dev), parent CRM-8336, baseline on CRM-10919
 *  Test Repository  : CRM test/Security/CRM-8336_Pen test findings 5.3 Prototype pollution/US3 Preserve portal functionality
 *  Target           : pre-production.nakivo.site
 *  Run as           : no account at all - the server layer must answer before any session exists
 *  Automation-Type  : new
 *  Automation-Date  : 2026-10-13
 *  Source           : Vitalii Ivanov, comment on CRM-12609 (2026-09-15) - pass criterion 1
 *  Source version   : CRM-12609 updated 2026-09-18T19:24+0300 - re-check before trusting this spec
 *  Evidence         : stdout only - this TC drives no UI, so there is no screen to capture.
 *
 *  Summary
 *  ---------------------------------------------------------------------------------------------
 *  Asserts the server half of the remediation: a URL whose parameter NAME is __proto__,
 *  constructor or prototype is refused with HTTP 400 and never renders, on every portal route -
 *  while ordinary URLs, including a legitimate nested parameter, still return 200.
 *
 *  Command to run
 *  ---------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-8336_US3\\.11:" --project=chromium
 *
 *  ---------------------------------------------------------------------------------------------
 *  Source - CRM-12609, Vitalii's pass criteria (2026-09-15)
 *  ---------------------------------------------------------------------------------------------
 *  Pre-condition(s):
 *    _ No session at all. The check needs no login and no console: it is one request per URL.
 *
 *  Steps to reproduce #1:
 *    1. Request each payload URL and each control URL with no session, and read the HTTP status.
 *
 *  Verification - Expected Result on step 1:
 *    _ Every payload URL returns HTTP 400 and does not render the page
 *    _ Every control URL returns HTTP 200 - the guard must not over-block
 *    _ Quoting the source: "A 200 means the add-on is not active on that environment, whatever
 *      else is reported."
 *
 *  ---------------------------------------------------------------------------------------------
 *  WHY THIS CHECK MATTERS MORE THAN IT LOOKS
 *  ---------------------------------------------------------------------------------------------
 *  The remediation lives in a separate add-on (nakivo_portal_security). On 2026-09-14 this exact
 *  check went from 400 to 200 on every route: a restore of the Pre-production database from a
 *  Production copy had reset the add-on to "not installed", and nothing anywhere reported it.
 *  The vulnerability was live again and silent. One request per route is what catches that, which
 *  is why the source proposes running it as a post-release check on Production too.
 *
 *  The guard matches the parameter NAME exactly, not as a substring: `prototype=1` is refused
 *  while `prototype_id=1` passes. Both are asserted below so a future blanket filter would fail
 *  this test rather than silently break unrelated URLs.
 * =============================================================================================
 */

const TC = 'CRM-8336_US3.11';

/** URLs that MUST be refused - the pen-test payload plus the variants that reach the same sink. */
const MUST_BE_REFUSED: Array<[string, string]> = [
  ['the pen-test payload on /partners', 'partners?__proto__[jquery]=x'],
  ['the srcdoc payload from the report', 'helpdesk/?__proto__[srcdoc][]=y'],
  ['constructor/prototype chain', 'partners?constructor[prototype][j]=x'],
  ['nested __proto__', 'partners?a[__proto__][j]=x'],
  ['URL-encoded underscores', 'partners?%5f%5fproto%5f%5f[j]=x'],
  ['a bare parameter named prototype', 'partners?prototype=1'],
  ['another route - /shop/cart', 'shop/cart?__proto__[jquery]=x'],
  ['another route - /my', 'my?__proto__[a]=1'],
  ['another route - /web/login', 'web/login?__proto__[j]=x'],
];

/** URLs that MUST still work - proof the guard does not over-block. */
const MUST_BE_ALLOWED: Array<[string, string]> = [
  ['the clean page', 'partners'],
  ['an ordinary parameter', 'partners?debug=1'],
  ['a legitimate nested parameter', 'partners?debug=1&a[b]=2'],
  ['a name that merely CONTAINS prototype', 'partners?prototype_id=1'],
];

const REFUSED_STATUS = 400;
const ALLOWED_STATUS = 200;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  s1:
    'Step 1: [INTERNAL check, HTTP request] Request each payload URL and each control URL on ' +
    'pre-production with no session, and read the HTTP status',
  verify: 'Verification',
} as const;

test.describe('CRM-8336 Pen test finding 5.3 - Prototype pollution blocked at the server', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const reason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (reason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${reason.replace(/\n/g, '\n   ')}`);
      }
      await page.waitForTimeout(CommonUtils.waitTimes.long);
    }
    // No teardown: this TC only makes GET requests and creates nothing.
  });

  test(`${TC}: A URL carrying a dangerous parameter name is refused with HTTP ${REFUSED_STATUS} on every portal route`, async ({
    page,
  }) => {
    test.setTimeout(config.timeouts.test);

    const refused: Array<{ label: string; url: string; status: number; ok: boolean }> = [];
    const allowed: Array<{ label: string; url: string; status: number; ok: boolean }> = [];
    let cookieCount = 0;

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      cookieCount = (await page.context().cookies()).length;
      console.log(`  - Cookies on the requests : ${cookieCount} (0 = no session, as required)`);

      console.log('\n  URLs that MUST be refused:');
      for (const [label, path] of MUST_BE_REFUSED) {
        const url = `${baseUrl}${path}`;
        const r = await page.request.get(url, { timeout: CommonUtils.waitTimes.pageLoad });
        const status = r.status();
        refused.push({ label, url, status, ok: status === REFUSED_STATUS });
        console.log(`    ${String(status).padEnd(4)} ${label}`);
        console.log(`         ${url}`);
      }

      console.log('\n  URLs that MUST still work:');
      for (const [label, path] of MUST_BE_ALLOWED) {
        const url = `${baseUrl}${path}`;
        const r = await page.request.get(url, { timeout: CommonUtils.waitTimes.pageLoad });
        const status = r.status();
        allowed.push({ label, url, status, ok: status === ALLOWED_STATUS });
        console.log(`    ${String(status).padEnd(4)} ${label}`);
        console.log(`         ${url}`);
      }
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);

      const notRefused = refused.filter((r) => !r.ok);
      const notAllowed = allowed.filter((r) => !r.ok);
      const check1 = cookieCount === 0;
      const check2 = notRefused.length === 0;
      const check3 = notAllowed.length === 0;

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The requests really carried no session:');
      console.log(`     Expected : 0 cookies (a session would make the server-layer result meaningless)`);
      console.log(`     Actual   : ${cookieCount} cookies`);
      console.log(`     Result   : ${check1 ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #2 - Every dangerous parameter name is refused before the page is built:');
      console.log(`     Expected : all ${refused.length} payload URLs return HTTP ${REFUSED_STATUS} (a 200 on ANY of them means the remediation add-on is not active on this environment - that is exactly how the 2026-09-14 regression showed up)`);
      console.log(`     Actual   : ${refused.length - notRefused.length}/${refused.length} refused`);
      notRefused.forEach((r) => console.log(`                NOT REFUSED (${r.status}): ${r.url}`));
      console.log(`     Result   : ${check2 ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #3 - The guard does not over-block ordinary URLs:');
      console.log(`     Expected : all ${allowed.length} control URLs return HTTP ${ALLOWED_STATUS}, including a nested a[b]=2 and a name that merely CONTAINS "prototype" (a 400 here would mean the guard turned into a blanket filter and is breaking real traffic)`);
      console.log(`     Actual   : ${allowed.length - notAllowed.length}/${allowed.length} allowed`);
      notAllowed.forEach((r) => console.log(`                WRONGLY BLOCKED (${r.status}): ${r.url}`));
      console.log(`     Result   : ${check3 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');

      const overall = check1 && check2 && check3;
      console.log(
        `OVERALL: ${overall ? 'PASS' : 'FAIL'} - ${refused.length - notRefused.length}/${refused.length} refused, ` +
          `${allowed.length - notAllowed.length}/${allowed.length} allowed`
      );

      expect(cookieCount, 'the requests must carry no session').toBe(0);
      expect(
        notRefused.map((r) => `${r.status} ${r.url}`),
        `every dangerous parameter name must be refused with HTTP ${REFUSED_STATUS}`
      ).toEqual([]);
      expect(
        notAllowed.map((r) => `${r.status} ${r.url}`),
        `ordinary URLs must still return HTTP ${ALLOWED_STATUS} - the guard must not over-block`
      ).toEqual([]);
    });
  });
});
