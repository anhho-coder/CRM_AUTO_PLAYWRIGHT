import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, CurrencyPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  ExchangeRate  -  US7: enable and disable a currency without deleting it
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.7.2
 *  Automation-Type : new
 *  Automation-Date : 2026-08-19
 *
 *  Summary:
 *    Take a currency the business does not transact in, put it into use, then take it back out of use, and
 *    show the record survives both moves. Disabling must not delete: a currency that once appeared on a
 *    historical document has to keep existing, or every figure that referenced it becomes unreadable.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\.7\.2:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Login as a CRM administrator with accounting-configuration rights (e.g. Anh Ho)
 *    - Pick a currency that the business does NOT transact in and that is currently archived - for example
 *      JPY. Confirm it is archived by opening "Filters" > "Inactive" (labelled "Inactive" on this build,
 *      not "Archived") on the Currencies list
 *
 *  Steps to reproduce:
 *    1. Open the Invoicing module > Configuration > Accounting > Currencies, click "Filters" and select
 *       "Inactive" (this Odoo 12 build labels the filter "Inactive", not "Archived"; the default "Active"
 *       facet must be removed first so only the disabled ones are listed)
 *    2. Click the row for the chosen unused currency, then click the archive box in the button box at the
 *       top right (it reads "Activate" while the currency is disabled)
 *    3. Remove the "Inactive" filter by clicking the small x on its tag in the search bar, and read the list
 *    4. Click the row for that currency again and click the archive box once more (it now reads
 *       "Deactivate")
 *    5. Read the list with no filter, then read it again with "Filters" > "Inactive"
 *
 *  Verification Point:
 *    2. The currency is unarchived with no error dialog
 *    3. The currency now appears in the unfiltered list, so the enabled set has grown by exactly 1
 *    4. The currency is archived again
 *    5. It is absent from the unfiltered list, count = 0
 *       _ It is present in the archived list, count = 1
 *       _ The record still exists with its code and symbol intact - it was disabled, not deleted
 *       _ The enabled set is back to the currencies that were in use before
 *
 *  Automation notes:
 *    - The manual steps name "Action" > "Unarchive" / "Archive", but that menu offers only
 *      "Delete | Duplicate" on this build - measured, not assumed. The control that does the job is the
 *      archive box in the form's button box, which the currency form declares in its own arch, so that is
 *      what this drives. The Master steps were updated to match.
 *    - The archive box is a `boolean_button` widget: it shows the ACTION available, not the state. An
 *      in-use record reads "Deactivate" and a disabled one reads "Activate". Reading it as a state label
 *      inverts the answer, which is how the first run of this case mis-reported a successful unarchive
 *      as a failure.
 *    - The "intact" check is made on the code and the Symbol column, both of which the Currencies list
 *      renders in the archived state too. The rate history deliberately is NOT asserted: the "Rates" stat
 *      button is hidden while a currency is archived (its arch carries invisible when active is false), so
 *      there is no way to read the history back once the currency is disabled again. Asserting something
 *      unreadable would only produce a flaky step.
 *    - The enabled set is compared as a SET, not a count, so a currency being swapped for another one
 *      cannot pass as "back to normal".
 *    - HOW THE FILTERS REALLY BEHAVE here, both measured:
 *        Removing every facet does NOT leave "the currencies in use" - it returns enabled and disabled
 *        records mixed together. The enabled set is what the list shows with its OWN default facet, so it
 *        is read by opening the list fresh and touching nothing.
 *        Opening the Currencies list resets the search view to that default, so an archived currency cannot
 *        be reached by re-opening the list: the "Inactive" filter is applied first and the row is then
 *        clicked on the list already on screen.
 *    - The archived currency is found by SEARCHING its code, not by listing the disabled ones. There are
 *      well over a hundred of them and the list renders 80 at a time, so a code late in the alphabet would
 *      simply not be on the page.
 * ===========================================================================
 */

/** Set to true to skip this case without deleting it - it enables and disables a shared currency. */
const SKIP_MUTATING_TESTS = false;

/** A currency the business does not transact in, archived on this environment. */
const UNUSED_CURRENCY = 'JPY';

const describeBlock = SKIP_MUTATING_TESTS ? test.describe.skip : test.describe;

describeBlock('CRM-11857_1.7.2 - US7: enable and disable a currency without deleting it', () => {
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

  test('CRM-11857_1.7.2: US7 - An administrator can take a currency out of use and put it back without deleting it', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const currencyPage = new CurrencyPage(page);

    let enabledBefore: string[] = [];
    let enabledAfterUnarchive: string[] = [];
    let enabledAfterArchive: string[] = [];
    let archivedListAtStart: string[] = [];
    let archivedListAtEnd: string[] = [];
    let symbolWhileEnabled = '';
    let symbolWhileArchived = '';
    let symbolAtEnd = '';
    let unarchived = false;
    let archivedAgain = false;

    /** Read the Currencies list currently on screen as a code -> Symbol map. */
    const readCodesAndSymbols = async (): Promise<Map<string, string>> => {
      const codes = await currencyPage.getListedCurrencyCodes();
      const symbols = await currencyPage.getColumnValues('Symbol');
      const map = new Map<string, string>();
      codes.forEach((code, i) => map.set(code, symbols[i] ?? ''));
      return map;
    };

    /** The currencies in use: the list opened fresh, with its own default filter left alone. */
    const readEnabledSet = async (): Promise<string[]> => {
      await currencyPage.openCurrenciesList();
      return (await currencyPage.getListedCurrencyCodes()).sort();
    };

    /** Find the chosen currency among the DISABLED ones and return its row, searched by code. */
    const findArchived = async (): Promise<Map<string, string>> => {
      await currencyPage.openCurrenciesList();
      await currencyPage.applyInactiveFilter();
      await currencyPage.searchOpenListFor(UNUSED_CURRENCY);
      return readCodesAndSymbols();
    };

    await test.step('Pre-condition: Login as a CRM administrator with accounting-configuration rights', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as the CRM administrator (${users.admin_crm.username})`);
    });

    await test.step('Pre-condition: Record the currencies currently in use', async () => {
      enabledBefore = await readEnabledSet();
      console.log(`  - Currencies in use before anything is changed (${enabledBefore.length}): ${enabledBefore.join(', ')}`);
      expect(
        enabledBefore,
        `${UNUSED_CURRENCY} must start OUT of use for this case to mean anything; the enabled list already holds it`
      ).not.toContain(UNUSED_CURRENCY);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - currencies in use').catch(() => {});
    });

    try {
      await test.step(`Step 1: Apply "Filters" > "Inactive" and confirm ${UNUSED_CURRENCY} is listed as disabled`, async () => {
        const found = await findArchived();
        archivedListAtStart = [...found.keys()].sort();
        symbolWhileArchived = found.get(UNUSED_CURRENCY) ?? '';
        console.log(`  - Disabled currencies matching "${UNUSED_CURRENCY}" (${archivedListAtStart.length}): ${archivedListAtStart.join(', ') || 'none'}`);
        console.log(`  - ${UNUSED_CURRENCY} Symbol while disabled: "${symbolWhileArchived}"`);
        expect(
          archivedListAtStart,
          `${UNUSED_CURRENCY} should be in the disabled list at the start`
        ).toContain(UNUSED_CURRENCY);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - Inactive filter applied').catch(() => {});
      });

      await test.step(`Step 2: Open ${UNUSED_CURRENCY} and click the archive box to put it into use`, async () => {
        // The row is clicked on the list ALREADY filtered to the disabled ones - re-opening the list would
        // reset the search view to its default and put this currency out of reach.
        await currencyPage.openCurrencyFormFromOpenList(UNUSED_CURRENCY);
        unarchived = await currencyPage.setCurrencyArchivedFromForm(false);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - currency unarchived').catch(() => {});
      });

      await test.step('Verification Point 2: the currency was unarchived with no error dialog', async () => {
        console.log('VERIFY - putting an unused currency into use:');
        // The archive box shows the ACTION available, so "Deactivate" is what an IN-USE record reads.
        console.log(`  Expected: ${UNUSED_CURRENCY} is in use after the unarchive (its archive box offers "Deactivate")`);
        console.log(`  Actual  : archive box reads "${await currencyPage.readActiveMarker()}"`);
        expect(unarchived, `${UNUSED_CURRENCY} should have been unarchived`).toBe(true);
        console.log('  Result: PASS - the currency was put into use');
      });

      await test.step('Step 3: Read the list of currencies in use', async () => {
        // Opened fresh so the list applies its own default filter. Clearing the facets instead would return
        // the disabled records as well, and the comparison below would be meaningless.
        await currencyPage.openCurrenciesList();
        const map = await readCodesAndSymbols();
        enabledAfterUnarchive = [...map.keys()].sort();
        symbolWhileEnabled = map.get(UNUSED_CURRENCY) ?? '';
        console.log(`  - Currencies in use now (${enabledAfterUnarchive.length}): ${enabledAfterUnarchive.join(', ')}`);
        console.log(`  - ${UNUSED_CURRENCY} Symbol while in use: "${symbolWhileEnabled}"`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - currency now in use').catch(() => {});
      });

      await test.step('Verification Point 3: the enabled set has grown by exactly one', async () => {
        const expectedSet = [...enabledBefore, UNUSED_CURRENCY].sort();
        console.log('VERIFY - the enabled set after the unarchive:');
        console.log(`  Expected (${expectedSet.length}): ${expectedSet.join(', ')}`);
        console.log(`  Actual   (${enabledAfterUnarchive.length}): ${enabledAfterUnarchive.join(', ')}`);
        expect(
          enabledAfterUnarchive,
          `Unarchiving one currency must add exactly that one to the enabled set and touch nothing else`
        ).toEqual(expectedSet);
        expect(symbolWhileEnabled, `${UNUSED_CURRENCY} should show its symbol on the list`).toBeTruthy();
        console.log('  Result: PASS - the enabled set grew by exactly 1');
      });

      await test.step(`Step 4: Open ${UNUSED_CURRENCY} again and click the archive box to take it out of use`, async () => {
        // In use by now, so the list's default filter shows it and openCurrencyForm can be used directly.
        await currencyPage.openCurrencyForm(UNUSED_CURRENCY);
        archivedAgain = await currencyPage.setCurrencyArchivedFromForm(true);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - currency archived again').catch(() => {});
      });

      await test.step('Step 5: Read the list unfiltered, then read it again with "Filters" > "Inactive"', async () => {
        enabledAfterArchive = await readEnabledSet();
        console.log(`  - Currencies in use after re-archiving (${enabledAfterArchive.length}): ${enabledAfterArchive.join(', ')}`);

        const archivedMap = await findArchived();
        archivedListAtEnd = [...archivedMap.keys()].sort();
        symbolAtEnd = archivedMap.get(UNUSED_CURRENCY) ?? '';
        console.log(`  - ${UNUSED_CURRENCY} Symbol while disabled again: "${symbolAtEnd}"`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - currency disabled again').catch(() => {});
      });

      await test.step('Verification Point 4-5: the currency is out of use again and the record survived', async () => {
        console.log('VERIFY - taking the currency back out of use:');
        console.log(`  Expected ${UNUSED_CURRENCY} in the unfiltered list : absent, count = 0`);
        console.log(`  Actual   ${UNUSED_CURRENCY} in the unfiltered list : ${enabledAfterArchive.includes(UNUSED_CURRENCY) ? 'present' : 'absent'}`);
        console.log(`  Expected ${UNUSED_CURRENCY} in the disabled list   : present, count = 1`);
        console.log(`  Actual   ${UNUSED_CURRENCY} in the disabled list   : ${archivedListAtEnd.filter((c) => c === UNUSED_CURRENCY).length}`);
        console.log(`  Expected Symbol still         : "${symbolWhileEnabled}"`);
        console.log(`  Actual   Symbol while disabled: "${symbolAtEnd}"`);
        console.log(`  Expected enabled set (${enabledBefore.length}): ${enabledBefore.join(', ')}`);
        console.log(`  Actual   enabled set (${enabledAfterArchive.length}): ${enabledAfterArchive.join(', ')}`);

        expect(archivedAgain, `${UNUSED_CURRENCY} should have been archived again`).toBe(true);
        expect(
          enabledAfterArchive.filter((c) => c === UNUSED_CURRENCY).length,
          `${UNUSED_CURRENCY} must be gone from the currencies in use`
        ).toBe(0);
        expect(
          archivedListAtEnd.filter((c) => c === UNUSED_CURRENCY).length,
          `${UNUSED_CURRENCY} must still EXIST in the disabled list. If it is missing there too, disabling has ` +
            `deleted the record, and every historical document that referenced it loses its currency.`
        ).toBe(1);
        expect(
          symbolAtEnd,
          `${UNUSED_CURRENCY} must keep its symbol while disabled - the record was taken out of use, not emptied`
        ).toBe(symbolWhileEnabled);
        expect(
          enabledAfterArchive,
          'The set of currencies in use must be exactly what it was before this case ran'
        ).toEqual(enabledBefore);
        console.log('  Result: PASS - the currency was disabled, not deleted, and the enabled set is back as found');
      });
    } finally {
      await test.step(`Teardown: make sure ${UNUSED_CURRENCY} is out of use again`, async () => {
        // The try/catch wraps only the ACTIONS so a UI error cannot mask the real failure. The verdict is
        // asserted afterwards, outside the catch: leaving an unused currency enabled would quietly change
        // what every other case on this environment sees as "the currencies in use".
        try {
          const enabledNow = await readEnabledSet();
          if (enabledNow.includes(UNUSED_CURRENCY)) {
            console.log(`  - ${UNUSED_CURRENCY} is still in use; taking it back out`);
            await currencyPage.openCurrencyFormFromOpenList(UNUSED_CURRENCY);
            await currencyPage.setCurrencyArchivedFromForm(true);
          } else {
            console.log(`  - ${UNUSED_CURRENCY} is already out of use, nothing to undo`);
          }
          enabledAfterArchive = await readEnabledSet();
          console.log(`  - Currencies in use at the end (${enabledAfterArchive.length}): ${enabledAfterArchive.join(', ')}`);
        } catch (e) {
          console.log(`  ⚠ Teardown actions could not complete: ${(e as Error).message}. Archive ${UNUSED_CURRENCY} by hand.`);
        }
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Teardown - enabled set restored').catch(() => {});

        expect(
          enabledAfterArchive,
          `${UNUSED_CURRENCY} must be left out of use. The currencies in use are now ` +
            `{${enabledAfterArchive.join(', ')}} instead of {${enabledBefore.join(', ')}}. Archive it by hand.`
        ).toEqual(enabledBefore);
      });
    }
  });
});
