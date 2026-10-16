import { test, expect } from '@playwright/test';
import { baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { PortalSecurityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  CRM-8336 - Pen test finding 5.3 - Prototype pollution
 *  Client layer - the page's own URL parsers no longer write into the shared object
 * =============================================================================================
 *  Test Case ID     : CRM-8336_US3.12
 *  Jira             : CRM-12609 (Implementation - Dev), parent CRM-8336, baseline on CRM-10919
 *  Test Repository  : CRM test/Security/CRM-8336_Pen test findings 5.3 Prototype pollution/US3 Preserve portal functionality
 *  Target           : pre-production.nakivo.site
 *  Run as           : no account - the check runs on a public page, exactly as a visitor sees it
 *  Automation-Type  : new
 *  Automation-Date  : 2026-10-13
 *  Source           : Vitalii Ivanov, comment on CRM-12609 (2026-09-15) - pass criteria 2, 3 and 4
 *  Source version   : CRM-12609 updated 2026-09-18T19:24+0300 - re-check before trusting this spec
 *  Evidence         : one screenshot at the end of the step section, a verify-point capture, and
 *                     afterEach start/end.
 *
 *  Summary
 *  ---------------------------------------------------------------------------------------------
 *  Asserts the client half of the remediation on a CLEAN page: each of the portal's URL-parsing
 *  entry points is fed a prototype-pollution payload by hand and must leave the shared object
 *  untouched, the page itself must still load healthily, and a hand-set control property must
 *  prove the reads are not blind.
 *
 *  Command to run
 *  ---------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-8336_US3\\.12:" --project=chromium
 *
 *  ---------------------------------------------------------------------------------------------
 *  Source - CRM-12609, Vitalii's pass criteria (2026-09-15)
 *  ---------------------------------------------------------------------------------------------
 *  Pre-condition(s):
 *    _ The check runs on a CLEAN page - https://pre-production.nakivo.site/partners - with no
 *      payload in the URL at all.
 *
 *  Steps to reproduce #1:
 *    1. Open the clean page and read which URL-parsing entry points it exposes.
 *    2. Feed each entry point a prototype-pollution payload and read the probe key back through
 *       a plain object, e.g.  $.deparam('__proto__[zzz]=1');  ({}).zzz
 *    3. Read the page's own health: how many services started, and jQuery's version.
 *    4. Run the control probe - set a property on the shared object, read it, delete it.
 *
 *  Verification - Expected Result:
 *    2. Every parser leaves the probe key undefined - nothing reaches the shared object
 *    3. The page is healthy: services started > 0, jQuery reports a real version (not the
 *       injected value), console errors = 0
 *    4. The control property reads back as "visible" after the set and undefined after the
 *       delete - so an undefined in step 2 is a real clean state and not a blind check
 *
 *  ---------------------------------------------------------------------------------------------
 *  WHY THIS CANNOT REUSE THE ORIGINAL "BEFORE" PROCEDURE
 *  ---------------------------------------------------------------------------------------------
 *  The baseline on CRM-10919 opened the payload URL and inspected the browser console. Since the
 *  server layer landed, that URL answers HTTP 400 and the page never renders, so there is no
 *  console on it to read - and the 400 means the client guard is never exercised by that route at
 *  all. Driving the parsers by hand on a clean page is the only way to test the second layer, and
 *  it is the approach the source explicitly asks for.
 *
 *  Baseline for comparison, measured on pre-production 2026-09-10 and 2026-09-14 (before the fix
 *  / during the regression): all four parsers polluted, and on a polluted page jQuery reported
 *  its version as the injected value "x" instead of 1.11.1 while services dropped from 147 to 79.
 * =============================================================================================
 */

const TC = 'CRM-8336_US3.12';

/** A clean page - no payload at all. The whole point is that the URL is innocent. */
const CLEAN_PATH = 'partners';

/** Payloads, each with the key it tries to inject. Grounded on the CRM-10919 before-state. */
const PAYLOADS: Array<[string, string, string]> = [
  ['plain __proto__', '__proto__[zzz1]=1', 'zzz1'],
  ['constructor/prototype chain', 'constructor[prototype][zzz2]=1', 'zzz2'],
  ['nested __proto__', 'a[__proto__][zzz3]=1', 'zzz3'],
  ['URL-encoded underscores', '%5f%5fproto%5f%5f[zzz4]=1', 'zzz4'],
];

const CONTROL_KEY = '__crm8336probe';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  s1: 'Step 1: Open the clean page https://pre-production.nakivo.site/partners and read which URL-parsing entry points it exposes',
  s2: "Step 2: Feed each entry point a prototype-pollution payload and read the probe key back, e.g. $.deparam('__proto__[zzz]=1') then ({}).zzz",
  s2b:
    'Step 2b: Reach the fragment reader the way an attacker does - load /partners#__proto__[zzzf]=1, ' +
    'which the server never sees, and read the probe key back',
  s3: "Step 3: Read the page's own health - how many services started, and jQuery's version",
  s4: 'Step 4: Run the control probe - set a property on the shared object, read it, delete it',
  verify: 'Verification',
} as const;

test.describe('CRM-8336 Pen test finding 5.3 - Prototype pollution blocked in the page', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - afterEach - start`).catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const reason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (reason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${reason.replace(/\n/g, '\n   ')}`);
      }
    }
    // No teardown: this TC only reads a public page and creates nothing.
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - afterEach - teardown done`).catch(() => {});
  });

  test(`${TC}: The portal's URL parsers do not write into the shared object on a clean page`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const security = new PortalSecurityPage(page);
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(`[console.error] ${m.text()}`);
    });
    page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e.message.split('\n')[0]}`));

    let parsers: string[] = [];
    const results: Array<{ parser: string; payload: string; polluted: boolean; value: string }> = [];
    let serviceCount = -1;
    let jqVersion = '';
    let control = { afterSet: '', afterDelete: '' };
    let fragmentPolluted = false;
    let pushStateObs = { polluted: false, value: '', error: '' };

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await security.openPage(`${baseUrl}${CLEAN_PATH}`);
      parsers = await security.getAvailableParsers();
      console.log(`  - URL              : ${baseUrl}${CLEAN_PATH}`);
      console.log(`  - Entry points     : ${parsers.length ? parsers.join(', ') : '(none found)'}`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      for (const parser of parsers) {
        for (const [label, payload, probeKey] of PAYLOADS) {
          const r = await security.feedParser(parser, payload, probeKey);
          results.push({ parser, payload: label, polluted: r.polluted, value: r.value });
          console.log(
            `    ${(r.polluted ? 'POLLUTED' : 'clean').padEnd(9)} ${parser.padEnd(24)} ${label.padEnd(28)} ({}).${probeKey} = ${r.value}${r.error ? '  [' + r.error + ']' : ''}`
          );
        }
      }
      console.log(`  - Attempts         : ${results.length}`);
    });

    await test.step(STEP.s2b, async () => {
      console.log(`\n--- ${STEP.s2b} ---`);
      const frag = await security.feedFragmentAndRead(`${baseUrl}${CLEAN_PATH}`, '__proto__[zzzf]=1', 'zzzf');
      fragmentPolluted = frag.polluted;
      results.push({ parser: 'fragment on the real URL', payload: 'plain __proto__ after #', polluted: frag.polluted, value: frag.value });
      console.log(`    ${(frag.polluted ? 'POLLUTED' : 'clean').padEnd(9)} /partners#__proto__[zzzf]=1   ({}).zzzf = ${frag.value}`);
      console.log(`      $.bbq.getState() on that URL : ${frag.getState}`);

      pushStateObs = await security.probePushStateWithString('__proto__[zzzp]=1', 'zzzp');
      console.log(`    OBSERVATION (not scored) - $.bbq.pushState("<string>") : polluted=${pushStateObs.polluted}, ({}).zzzp = ${pushStateObs.value}`);
      if (pushStateObs.error) console.log(`      it threw: ${pushStateObs.error}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      serviceCount = await security.getStartedServiceCount();
      jqVersion = await security.getJQueryVersion();
      console.log(`  - Services started : ${serviceCount}`);
      console.log(`  - jQuery version   : ${jqVersion}`);
      console.log(`  - Console errors   : ${consoleErrors.length}`);
      consoleErrors.slice(0, 5).forEach((e) => console.log(`      ${e.slice(0, 140)}`));
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      control = await security.runControlProbe(CONTROL_KEY);
      console.log(`  - after set        : ({}).${CONTROL_KEY} = ${control.afterSet}`);
      console.log(`  - after delete     : ({}).${CONTROL_KEY} = ${control.afterDelete}`);
      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `${TC} - Steps to reproduce I - clean page with the parser checks done`
      );
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);

      const polluted = results.filter((r) => r.polluted);
      const check1 = parsers.length > 0;
      const check2 = polluted.length === 0;
      const check3 = serviceCount > 0 && jqVersion !== '"x"' && consoleErrors.length === 0;
      const check4 = control.afterSet === 'visible' && control.afterDelete === 'undefined';

      console.log('\n==================== VERIFY ====================');
      console.log("  Verify #1 - The page actually exposes URL parsers to test:");
      console.log(`     Expected : at least one entry point (finding none would mean the check ran against nothing and proved nothing, not that the page is safe)`);
      console.log(`     Actual   : ${parsers.length} - ${parsers.join(', ') || '(none)'}`);
      console.log(`     Result   : ${check1 ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #2 - No parser writes the injected key into the shared object:');
      console.log(`     Expected : 0 of ${results.length} attempts pollute (before the fix all four parsers were polluted by all four payload forms - see CRM-10919)`);
      console.log(`     Actual   : ${polluted.length} polluted`);
      polluted.forEach((r) => console.log(`                POLLUTED: ${r.parser} / ${r.payload} -> ${r.value}`));
      console.log(`     Result   : ${check2 ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #3 - The clean page is healthy:');
      console.log(`     Expected : services started > 0, jQuery reports a real version (reading "x" means the page IS polluted), console errors = 0`);
      console.log(`     Actual   : services=${serviceCount}, jQuery=${jqVersion}, console errors=${consoleErrors.length}`);
      console.log(`     Result   : ${check3 ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #4 - Control probe: the reads above are not blind:');
      console.log(`     Expected : after set = visible, after delete = undefined (if the set were invisible too, every "undefined" above would be meaningless)`);
      console.log(`     Actual   : after set = ${control.afterSet}, after delete = ${control.afterDelete}`);
      console.log(`     Result   : ${check4 ? 'PASS' : 'FAIL'}`);

      console.log('  Observation (not scored) - $.bbq.pushState() given a raw STRING:');
      console.log(`     Measured : polluted=${pushStateObs.polluted}, ({}).zzzp = ${pushStateObs.value}${pushStateObs.error ? ', threw ' + pushStateObs.error : ''}`);
      console.log(`     Note     : pushState is a WRITER, not a URL-parsing entry point - the page calls it with`);
      console.log(`                its own data, so an attacker cannot feed it directly, and it is outside the pass`);
      console.log(`                criteria agreed on CRM-12609. Recorded every run so the gap stays visible:`);
      console.log(`                the remediation covers the readers, this writer's string branch is not covered.`);
      console.log('===============================================');

      const overall = check1 && check2 && check3 && check4;
      console.log(
        `OVERALL: ${overall ? 'PASS' : 'FAIL'} - ${results.length - polluted.length}/${results.length} parser attempts left the shared object clean`
      );

      let verifyPassed = false;
      try {
        expect(parsers.length, 'the page should expose at least one URL-parsing entry point').toBeGreaterThan(0);
        expect(
          polluted.map((r) => `${r.parser} / ${r.payload}`),
          'no URL parser may write the injected key into the shared object'
        ).toEqual([]);
        expect(serviceCount, 'the clean page should have started its services').toBeGreaterThan(0);
        expect(jqVersion, 'jQuery must not report the injected value - that would mean the page is polluted').not.toBe('"x"');
        expect(consoleErrors, 'the clean page should load with no console errors').toEqual([]);
        expect(control.afterSet, 'the control property must be visible after being set').toBe('visible');
        expect(control.afterDelete, 'the control property must be gone after delete').toBe('undefined');
        verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - prototype pollution blocked in the page`,
          passed: verifyPassed,
          lines: [
            `Parsers tested   : ${parsers.join(', ')}`,
            `Polluted         : ${polluted.length} of ${results.length}`,
            `Services started : ${serviceCount}`,
            `jQuery version   : ${jqVersion}`,
          ],
        }).catch(() => {});
      }
    });
  });
});
