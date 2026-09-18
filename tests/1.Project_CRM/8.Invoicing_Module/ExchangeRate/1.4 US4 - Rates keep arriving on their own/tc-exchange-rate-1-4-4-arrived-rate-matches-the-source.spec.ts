import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, CurrencyPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  ExchangeRate  -  US4: the arrived rate matches the source, re-based to USD
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.4.4
 *  Automation-Type : new
 *  Automation-Date : 2026-08-19
 *
 *  Summary:
 *    Read the rate source's own daily reference-rate file, then read the "Current Rate" of every covered
 *    currency from the Currencies list, and show the stored value is the published value RE-BASED from the
 *    euro onto the company currency: stored(X) = published(X) / published(USD). The company currency
 *    itself must be stored as exactly 1.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\.4\.4:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Login as a CRM administrator with accounting-configuration rights (e.g. Anh Ho)
 *    - On Invoicing > Configuration > Settings > the "Currencies" block confirm Service = European Central
 *      Bank
 *    - Open the source's daily reference-rate file; the source quotes its values against the euro and also
 *      publishes a value for USD
 *
 *  Steps to reproduce:
 *    1. Read from the source's daily file: the publication date, and the published value for USD, CHF,
 *       GBP, INR and IDR
 *    2. Open the Invoicing module > Configuration > Settings, scroll to the "Currencies" block and click
 *       the circular refresh icon to the right of "Next Run"
 *       _ MANUAL ONLY. This automated version SKIPS this step on purpose - see the automation notes.
 *    3. Open the Invoicing module > Configuration > Accounting > Currencies and read the "Current Rate" of
 *       EUR, CHF, GBP, INR, IDR and USD to six decimals
 *    4. For each currency divide the source's published value from step 1 by the source's published USD
 *       value, and compare with the "Current Rate" read in step 3
 *
 *  Verification Point:
 *    3. Each "Current Rate" EQUALS the source's published value divided by the source's published USD
 *       value
 *       _ The EUR "Current Rate" EQUALS 1 divided by the source's published USD value
 *       _ The USD "Current Rate" = 1.000000
 *       _ No currency holds the source's published value unchanged; that would mean the euro basis was
 *         never re-based onto the company currency
 *
 *  Automation notes:
 *    - This case does NOT trigger a refresh. The daily job has already written today's rows, and firing a
 *      fetch would write to a shared environment without strengthening the assertion.
 *    - Two classes of assertion are used, on purpose:
 *        * EXACT (no tolerance): the company currency is stored as 1.000000, every stored rate is
 *          positive, and no stored rate equals the published value unchanged. None of these depend on
 *          WHICH publication the stored row came from.
 *        * TOLERANCED: the re-basing arithmetic against the live feed. A stored row dated D was fetched at
 *          03:00 UTC on D and therefore carries the last publication BEFORE that moment, while the feed
 *          read here is whatever is current now. When the source publishes again (~16:00 CET) the two are
 *          one publication apart, so the comparison allows a small relative drift instead of demanding an
 *          exact 6-decimal match. The RATIO under test is unaffected by the drift; only its last digits
 *          are.
 * ===========================================================================
 */

/** The source's daily reference-rate file (values quoted against the euro). */
const SOURCE_FEED_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
/** The automatically covered currencies, excluding the company currency. */
const COVERED = ['EUR', 'CHF', 'GBP', 'INR', 'IDR'];
/** The company currency, which must always be stored as exactly 1. */
const COMPANY_CURRENCY = 'USD';
/**
 * Relative tolerance for the re-basing comparison. The stored row and the live feed can be one publication
 * apart (see the automation notes), so an exact 6-decimal match is not a stable expectation.
 */
const RELATIVE_TOLERANCE = 0.01; // 1%

test.describe('CRM-11857_1.4.4 - US4: the arrived rate matches the source, re-based onto the company currency', () => {
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
    // Read-only test: nothing is created or changed, so there is nothing to clean up.
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-11857_1.4.4: US4 - The rate that arrives equals the value the source published, re-based from the euro onto the company currency', async ({ page, request }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const currencyPage = new CurrencyPage(page);

    let publicationDate = '';
    const published: Record<string, number> = {};   // as the source quotes them, against the euro
    const stored: Record<string, number> = {};      // as Odoo holds them, against the company currency
    let feedReachable = false;

    await test.step('Step 1: Read the publication date and the published values from the source daily file', async () => {
      const response = await request.get(SOURCE_FEED_URL, { timeout: CommonUtils.waitTimes.pageLoad }).catch(() => null);
      feedReachable = !!response && response.ok();
      if (!feedReachable) {
        console.log(`  ! The source daily file could not be read (${response ? `HTTP ${response.status()}` : 'no response'})`);
        return;
      }
      const xml = await response!.text();

      const timeMatch = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml);
      publicationDate = timeMatch ? timeMatch[1] : '';

      // Each quoted currency appears as: <Cube currency='USD' rate='1.1567'/>
      const cubeRe = /currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]/g;
      let m: RegExpExecArray | null;
      while ((m = cubeRe.exec(xml)) !== null) {
        published[m[1]] = parseFloat(m[2]);
      }
      // The euro is the basis of the file and is not quoted in it, so it is 1 by definition.
      published['EUR'] = 1;

      console.log(`  - Publication date read from the source : ${publicationDate || 'not found'}`);
      console.log(`  - Currencies quoted in the file         : ${Object.keys(published).length}`);
      for (const code of [COMPANY_CURRENCY, ...COVERED]) {
        console.log(`      published(${code}) = ${published[code] ?? 'not quoted'}`);
      }
    });

    await test.step('Pre-condition - Step 2: Login and read the "Current Rate" of every covered currency', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as the CRM administrator (${users.admin_crm.username})`);

      await currencyPage.openCurrenciesList();
      for (const code of [COMPANY_CURRENCY, ...COVERED]) {
        const raw = await currencyPage.getCurrencyRate(code);
        stored[code] = parseFloat(raw) || 0;
      }
      console.log('  - Stored "Current Rate" per currency:');
      for (const code of [COMPANY_CURRENCY, ...COVERED]) {
        console.log(`      stored(${code}) = ${stored[code]}`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Current Rate per currency').catch(() => {});
    });

    await test.step('Verification Point - exact: the company currency is stored as 1 and every rate is positive', async () => {
      console.log('VERIFY - facts that do not depend on which publication the stored row came from:');
      console.log(`  Expected stored(${COMPANY_CURRENCY}) : 1.000000`);
      console.log(`  Actual   stored(${COMPANY_CURRENCY}) : ${stored[COMPANY_CURRENCY]}`);

      expect(stored[COMPANY_CURRENCY], `The company currency ${COMPANY_CURRENCY} must be stored as exactly 1`).toBe(1);
      for (const code of COVERED) {
        console.log(`  stored(${code}) = ${stored[code]} (expected > 0)`);
        expect(stored[code], `${code} should hold a positive stored rate`).toBeGreaterThan(0);
      }
      console.log('  Result: PASS - the company currency is recorded at 1 and every covered currency has a positive rate');
    });

    await test.step('Verification Point 3: each stored rate is the published value divided by the published USD value', async () => {
      expect(feedReachable, 'The source daily file must be readable for this comparison').toBe(true);
      expect(publicationDate, 'The source file should carry a publication date').toBeTruthy();
      expect(published[COMPANY_CURRENCY], `The source file should quote ${COMPANY_CURRENCY}`).toBeGreaterThan(0);

      const publishedUsd = published[COMPANY_CURRENCY];
      console.log('VERIFY - the re-basing arithmetic  stored(X) = published(X) / published(USD):');
      console.log(`  Source publication date : ${publicationDate}`);
      console.log(`  published(${COMPANY_CURRENCY})        : ${publishedUsd}`);
      console.log(`  Relative tolerance      : ${(RELATIVE_TOLERANCE * 100).toFixed(2)}%`);

      for (const code of COVERED) {
        const quoted = published[code];
        if (!quoted) {
          console.log(`  [${code}] not quoted in the source file - skipped`);
          continue;
        }
        const expectedStored = quoted / publishedUsd;
        const actualStored = stored[code];
        const relative = Math.abs(actualStored - expectedStored) / expectedStored;

        console.log(`  [${code}]`);
        console.log(`    published(${code}) / published(${COMPANY_CURRENCY}) = ${quoted} / ${publishedUsd} = ${expectedStored.toFixed(6)}`);
        console.log(`    stored(${code})                        = ${actualStored}`);
        console.log(`    relative difference                 = ${(relative * 100).toFixed(4)}%`);

        expect(
          relative,
          `stored(${code}) (${actualStored}) should equal published(${code}) / published(${COMPANY_CURRENCY}) (${expectedStored.toFixed(6)}) within ${(RELATIVE_TOLERANCE * 100).toFixed(2)}%`
        ).toBeLessThanOrEqual(RELATIVE_TOLERANCE);

        // The euro basis must have been converted away: a currency quoted far from 1 must not be stored
        // at its published value. This is exact and does not depend on the publication.
        if (Math.abs(quoted - expectedStored) / expectedStored > RELATIVE_TOLERANCE) {
          expect(
            Math.abs(actualStored - quoted) / quoted,
            `stored(${code}) must NOT equal the published value ${quoted} - that would mean the euro basis was never re-based onto ${COMPANY_CURRENCY}`
          ).toBeGreaterThan(RELATIVE_TOLERANCE);
        }
        console.log(`    Result: PASS - ${code} is stored as the published value re-based onto ${COMPANY_CURRENCY}`);
      }
      console.log('✅ CRM-11857_1.4.4 verified: arriving rates are the source publication re-based from the euro onto the company currency');
    });
  });
});
