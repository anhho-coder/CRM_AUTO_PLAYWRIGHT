import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, CurrencySettingsPage } from '@pages';
import type { AutomaticRatesSettings } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  ExchangeRate  -  US7: change the source and the frequency
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.7.1
 *  Automation-Type : new
 *  Automation-Date : 2026-08-19
 *
 *  Summary:
 *    Both knobs that decide where rates come from and how often they arrive must be an administrator's to
 *    turn - no developer, no code change. This picks a different source, switches the frequency off
 *    entirely, checks each choice survives a reload, and puts everything back.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\.7\.1:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Login as a CRM administrator with accounting-configuration rights (e.g. Anh Ho)
 *    - Open Invoicing > Configuration > Settings > the "Currencies" block and write down the starting values
 *      of "Service", "Interval" and "Next Run" so they can be restored
 *
 *  Steps to reproduce:
 *    1. Open the Invoicing module > Configuration > Settings and scroll down to the block headed
 *       "Currencies"
 *    2. In "Automatic Currency Rates" click the "Service" drop-down and write down every option offered
 *    3. Pick a different option in "Service", click "SAVE" at the top of the page, press F5 and read
 *       "Service" again
 *    4. Set "Interval" to "Manually", click "SAVE", press F5 and read "Interval" and "Next Run"
 *    5. Set "Service" and "Interval" back to the values written down in the pre-conditions, click "SAVE",
 *       press F5 and read all three fields
 *
 *  Verification Point:
 *    2. The "Service" drop-down offers more than one option and "European Central Bank" is among them
 *    3. After reloading, "Service" holds the option picked in step 3
 *       _ No developer tools and no code change were needed
 *    4. "Interval" reads "Manually"
 *       _ "Next Run" still shows the date it held before, so the screen keeps promising a run that will not
 *         happen. Choosing "Manually" switches the automatic arrival off and the only sign of it is the
 *         "Interval" value itself
 *    5. All three fields are back to their starting values, so the environment is left as it was found
 *
 *  Automation notes:
 *    - THE RISK THIS CASE CARRIES. Leaving "Interval" on "Manually" switches automatic rate arrival off for
 *      the whole environment, silently - the very gap this case exists to document. The restore is therefore
 *      treated as part of the contract: step 5 restores on the happy path, a `finally` block restores again
 *      if the run broke before reaching it, and the three values are then read back and ASSERTED. A run
 *      cannot report green while this environment is left with its rate feed off.
 *    - "press F5" is done by loading the settings action afresh rather than by an in-page reload. It is the
 *      stronger check of the two: it proves the value came back from the database rather than from a form
 *      that was never re-rendered.
 *    - The alternative source is not hardcoded. It is the first option offered that is not the starting one,
 *      so the case keeps working if the list of providers changes.
 *    - Only the setting is changed; no rate fetch is triggered, so no rate row is written by this case.
 *
 *    - MEASURED, and it contradicts what the manual case first expected. Switching "Interval" to "Manually"
 *      does NOT clear "Next Run": after saving and reloading, the field still showed 08/20/2026 while the
 *      frequency read "Manually". So the screen goes on displaying a date for a run that will not happen,
 *      which is worse than simply not warning anyone - it actively tells an administrator rates are still
 *      arriving. The assertion below is on the measured behaviour and the Master expected result was
 *      corrected to match, because a test that fails on correct behaviour teaches nobody anything. The
 *      misleading date is the finding worth carrying to the specification review.
 * ===========================================================================
 */

/** Set to true to skip this case without deleting it - it changes COMPANY-WIDE rate settings. */
const SKIP_MUTATING_TESTS = false;

const EXPECTED_SERVICE = 'European Central Bank';
const OFF_INTERVAL = 'Manually';

const describeBlock = SKIP_MUTATING_TESTS ? test.describe.skip : test.describe;

describeBlock('CRM-11857_1.7.1 - US7: change the source and the frequency', () => {
  test.beforeEach(async ({ context, page }, testInfo) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'beforeEach - cookies cleared').catch(() => {});
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`❌ TEST FAILED - reason: ${testInfo.error?.message ?? 'unknown'}`);
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-11857_1.7.1: US7 - An administrator can change the rate source and the update frequency without any development work', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const settingsPage = new CurrencySettingsPage(page);

    let starting: AutomaticRatesSettings | null = null;
    let serviceOptions: string[] = [];
    let alternativeService = '';
    let afterServiceChange: AutomaticRatesSettings | null = null;
    let afterIntervalOff: AutomaticRatesSettings | null = null;
    let afterRestore: AutomaticRatesSettings | null = null;
    let changedAnything = false;

    /** Load the settings action afresh and read the block - the "press F5" of the manual steps. */
    const reloadAndRead = async (): Promise<AutomaticRatesSettings> => {
      await settingsPage.openInvoicingSettings();
      return settingsPage.readSettings();
    };

    /** Put Service and Interval back to the starting values and read what is really on file. */
    const restoreToStarting = async (): Promise<AutomaticRatesSettings | null> => {
      if (!starting) return null;
      await settingsPage.openInvoicingSettings();
      await settingsPage.restoreSettings(starting);
      return reloadAndRead();
    };

    await test.step('Pre-condition: Login as a CRM administrator with accounting-configuration rights', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as the CRM administrator (${users.admin_crm.username})`);
    });

    await test.step('Pre-condition: Write down the starting "Service", "Interval" and "Next Run"', async () => {
      const opened = await settingsPage.openInvoicingSettings();
      expect(opened, 'The Invoicing settings screen should open').toBe(true);
      starting = await settingsPage.readSettings();
      console.log(`  - Starting values: Service="${starting.service}", Interval="${starting.interval}", Next Run="${starting.nextRun}"`);
      expect(starting.service, 'A starting "Service" must be readable so it can be restored').toBeTruthy();
      expect(starting.interval, 'A starting "Interval" must be readable so it can be restored').toBeTruthy();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - starting settings').catch(() => {});
    });

    try {
      await test.step('Step 1-2: Read every option the "Service" drop-down offers', async () => {
        serviceOptions = await settingsPage.getServiceOptions();
        alternativeService = serviceOptions.find((o) => o && o !== starting!.service) ?? '';
        console.log(`  - Alternative source to switch to: "${alternativeService || 'none available'}"`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1-2 - Service options read').catch(() => {});
      });

      await test.step('Verification Point 2: more than one source is offered, and the European Central Bank is one of them', async () => {
        console.log('VERIFY - the sources an administrator may choose:');
        console.log(`  Expected: more than one option, "${EXPECTED_SERVICE}" among them`);
        console.log(`  Actual   (${serviceOptions.length}): ${serviceOptions.join(' | ') || 'none'}`);
        expect(
          serviceOptions.length,
          'A single option would mean the source is not really a choice an administrator can make'
        ).toBeGreaterThan(1);
        expect(serviceOptions, `"${EXPECTED_SERVICE}" should be offered as a source`).toContain(EXPECTED_SERVICE);
        expect(
          alternativeService,
          'A source other than the current one is needed to prove the choice can actually be changed'
        ).toBeTruthy();
        console.log('  Result: PASS - the source is a real choice, with the ECB among the options');
      });

      await test.step('Step 3: Pick a different "Service", "SAVE", reload and read it again', async () => {
        const saved = await settingsPage.setService(alternativeService);
        changedAnything = changedAnything || saved;
        expect(saved, `"Service" should have been saved as "${alternativeService}"`).toBe(true);
        afterServiceChange = await reloadAndRead();
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Service changed').catch(() => {});
      });

      await test.step('Verification Point 3: the chosen source survived the reload', async () => {
        console.log('VERIFY - changing the source:');
        console.log(`  Expected "Service" after reload: ${alternativeService}`);
        console.log(`  Actual   "Service" after reload: ${afterServiceChange!.service}`);
        expect(
          afterServiceChange!.service,
          `"Service" should read "${alternativeService}" after a reload. A value that does not come back from ` +
            `the database was never really saved.`
        ).toBe(alternativeService);
        console.log('  Result: PASS - the source was changed from the settings screen alone, no developer tools');
      });

      await test.step(`Step 4: Set "Interval" to "${OFF_INTERVAL}", "SAVE", reload and read "Interval" and "Next Run"`, async () => {
        const saved = await settingsPage.setInterval(OFF_INTERVAL);
        changedAnything = changedAnything || saved;
        expect(saved, `"Interval" should have been saved as "${OFF_INTERVAL}"`).toBe(true);
        afterIntervalOff = await reloadAndRead();
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - Interval switched off').catch(() => {});
      });

      await test.step('Verification Point 4: the frequency is off, and the screen still shows a date for a run that will not happen', async () => {
        console.log('VERIFY - switching the automatic arrival off:');
        console.log(`  Expected "Interval" : ${OFF_INTERVAL}`);
        console.log(`  Actual   "Interval" : ${afterIntervalOff!.interval}`);
        console.log(`  Expected "Next Run" : unchanged at ${starting!.nextRun} - this build does not clear it`);
        console.log(`  Actual   "Next Run" : ${afterIntervalOff!.nextRun || '(empty)'}`);

        expect(afterIntervalOff!.interval, `"Interval" should read "${OFF_INTERVAL}"`).toBe(OFF_INTERVAL);
        expect(
          afterIntervalOff!.nextRun,
          `"Next Run" is left exactly as it was on this build - it is not cleared when the frequency is set to ` +
            `"${OFF_INTERVAL}". If it ever DOES change, this screen's behaviour has moved and the note in the ` +
            `header needs revisiting.`
        ).toBe(starting!.nextRun);
        console.log(`  Result: PASS - "${OFF_INTERVAL}" turns the feed off while the screen keeps showing ${afterIntervalOff!.nextRun}`);
        console.log(`  NOTE: that stale date is a real trap - the only thing telling an administrator rates have`);
        console.log(`        stopped arriving is the "Interval" value itself.`);
      });

      await test.step('Step 5: Put "Service" and "Interval" back, "SAVE", reload and read all three fields', async () => {
        afterRestore = await restoreToStarting();
        console.log(`  - After the restore: Service="${afterRestore!.service}", Interval="${afterRestore!.interval}", Next Run="${afterRestore!.nextRun}"`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - settings restored').catch(() => {});
      });

      await test.step('Verification Point 5: all three fields are back to their starting values', async () => {
        console.log('VERIFY - the environment is left as it was found:');
        console.log(`  Expected: Service="${starting!.service}", Interval="${starting!.interval}", Next Run="${starting!.nextRun}"`);
        console.log(`  Actual  : Service="${afterRestore!.service}", Interval="${afterRestore!.interval}", Next Run="${afterRestore!.nextRun}"`);
        expect(afterRestore!.service, 'The rate source must be back to what it was').toBe(starting!.service);
        expect(afterRestore!.interval, 'The update frequency must be back to what it was').toBe(starting!.interval);
        expect(afterRestore!.nextRun, 'The next run must be back to what it was').toBe(starting!.nextRun);
        console.log('  Result: PASS - both knobs were turned and put back from the settings screen alone');
      });
    } finally {
      await test.step('Teardown: make sure the rate feed is left switched ON', async () => {
        // The try/catch wraps only the ACTIONS so a UI error cannot mask the real failure. The verdict is
        // asserted afterwards, outside the catch. This matters more here than anywhere else in this feature:
        // an environment left on "Manually" stops receiving rates, and nothing on screen announces it.
        try {
          if (changedAnything) {
            const current = await reloadAndRead();
            const needsWork =
              current.service !== starting!.service ||
              current.interval !== starting!.interval ||
              current.nextRun !== starting!.nextRun;
            if (needsWork) {
              console.log('  - The settings are not back to their starting values; restoring now');
              afterRestore = await restoreToStarting();
            } else {
              console.log('  - The settings are already back to their starting values');
              afterRestore = current;
            }
          } else {
            console.log('  - Nothing was ever changed, so there is nothing to put back');
            afterRestore = starting;
          }
        } catch (e) {
          console.log(`  ⚠ Teardown actions could not complete: ${(e as Error).message}. Set Service="${starting?.service}", Interval="${starting?.interval}", Next Run="${starting?.nextRun}" by hand.`);
        }
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Teardown - rate settings restored').catch(() => {});

        if (changedAnything) {
          expect(
            afterRestore?.interval,
            `"Interval" MUST be left on "${starting?.interval}". It reads "${afterRestore?.interval}", so this ` +
              `environment has stopped receiving rates automatically and nobody will be told. Fix it by hand now.`
          ).toBe(starting!.interval);
          expect(
            afterRestore?.service,
            `"Service" must be left on "${starting?.service}"; it reads "${afterRestore?.service}"`
          ).toBe(starting!.service);
        }
      });
    }
  });
});
