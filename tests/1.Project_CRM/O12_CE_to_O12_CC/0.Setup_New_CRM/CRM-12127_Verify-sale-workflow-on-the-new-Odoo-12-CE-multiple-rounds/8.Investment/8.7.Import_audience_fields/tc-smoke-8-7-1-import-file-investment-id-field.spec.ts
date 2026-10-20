import { test, expect, Browser } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '@config/test.config';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { InvestmentPageMig } from '@pages/mig/InvestmentPageMig';
import { CommonUtils } from '@helpers/common.utils';
import {
  resetMigCreatedRecords,
  teardownMigRecords,
} from '@helpers/o12ce-main-business.helper';

/**
 * ==========================================================================================
 *  CRM-12370_8.7.1 - Verify the import file includes "Investment ID" field (O12 CE Migration server)
 * ==========================================================================================
 *  Test Case ID    : CRM-12370_8.7.1
 *  Automation-Type : ported
 *  Automation-Date : 2026-10-19
 *  Run as          : Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *  Jira            : none - ported from a pre-production spec (no Xray manual steps)
 *
 *  Source TC (pre-production) : CRM-3374_1.1
 *  Source spec                : tests/1.Project_CRM/4.Investments/CRM-3374_Improvement-Importing_audience_need_to_support_importing_fields/1.Important-fields-on-import-file/tc-crm-3374-1-1-Verify-the-import-file-includes-Investment_ID-field.spec.ts
 *  Source version             : 74dc5b6 2026-05-18 (no uncommitted edits) - re-check before trusting this spec
 *
 * ------------------------------------------------------------------------------------------
 *  Summary
 * ------------------------------------------------------------------------------------------
 *  Opens the Audience tab of an unsaved Investment CREATE form, downloads the import template
 *  and checks that the template header row contains the "Investment ID" column.
 *  NOTE (2026-10-19): a grounding pass found no "Download template" link in the crm-mig Investment
 *  form arch. If the link is absent the spec is red at Pre-condition I.5 - that is a crm-mig
 *  difference to report, not a reason to fetch the template another way.
 *
 * ------------------------------------------------------------------------------------------
 *  Command to run
 * ------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_8\.7\.1:" --project=MigSmoke
 *
 * ------------------------------------------------------------------------------------------
 *  O12 CE deviations (mechanical only - BASELINE RULE: every source assertion is kept unchanged)
 * ------------------------------------------------------------------------------------------
 *  - Login users.admin_crm_mig on baseUrl_mig; navigation by XML-id URL hash (InvestmentPageMig).
 *  - Pre-condition I.1 (source: login + Investments app tile): login only, as in the ported 8.3.5 template;
 *    the Investments list is opened by the XML-id hash in Pre-condition I.2.
 *  - No Investment is saved in this case (the CREATE form stays unsaved), so no record is created.
 *  - The template is saved into test-data/investment-module/download-<tc>/ (TC-unique) and removed in afterEach.
 *  - Source Tear Down (delete the downloaded file) runs in afterEach, not as a test.step.
 *
 * ------------------------------------------------------------------------------------------
 *  Source manual TC (verbatim from the source spec header)
 * ------------------------------------------------------------------------------------------
 * Pre-condition:
 * I. Download template:
 * 1. After login successful, click at "Investments" button
 * 2. On "Investments" page, on menu on top of page, select "Investment" item
 * 3. Press "CREATE" button and wait
 * 4. Click at "Audience" tab
 * 5. Click "Download template" hyperlink
 * 6. Once the "Downloads" popup displays, click at "Keep" button
 * 7. Wait for the download complete
 * 8. Open the downloaded xlsx file and verify:
 *
 * Steps to reproduce:
 * 1. The "Investment ID" field exist in the xlsx file
 *
 * Tear down (Clean up test data):
 * 1. Delete the downloaded xlsx file
 * ==========================================================================================
 */

const TC = 'CRM-12370_8.7.1';

const STEP = {
  pre1: 'Pre-condition I.1: Login and navigate to Investments module',
  pre2: 'Pre-condition I.2: Select "Investment" from top menu',
  pre3: 'Pre-condition I.3: Press CREATE button and wait',
  pre4: 'Pre-condition I.4: Click "Audience" tab',
  pre5: 'Pre-condition I.5: Click "Download template" hyperlink and wait for download',
  s1: 'Step 1: Verify the "Investment ID" field exists in the downloaded xlsx file',
} as const;

/** Per-test state the afterEach needs. */
let downloadDir = '';
let downloadedFilePath = '';

test.describe('CRM-12370_8.7.1 - Verify the import file includes "Investment ID" field', () => {
  test.beforeEach(async ({ context, page }) => {
    downloadDir = '';
    downloadedFilePath = '';
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
    }
    // No Investment is saved in this case (the CREATE form is never saved), so there is no ledger entry.
    await teardownMigRecords(page, false);
    if (downloadDir && fs.existsSync(downloadDir)) {
      fs.rmSync(downloadDir, { recursive: true, force: true });
      console.log(`  deleted   folder ${downloadDir}`);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.afterAll(async ({ browser }) => {
    await sweepInvestmentsAfterAll(browser, TC);
  });

  test('CRM-12370_8.7.1: Verify the import file includes "Investment ID" field', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const investmentPage = new InvestmentPageMig(page);

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      resetMigCreatedRecords();
      console.log(`  - Host    : ${baseUrl_mig}`);
      console.log(`  - Account : ${users.admin_crm_mig.username}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await investmentPage.navigateToInvestment();
      console.log('  OK - Investments list is open');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await investmentPage.clickCreateButton();
      investmentPage.logUnsavedFormUrl('Investment');
      console.log('  OK - CREATE form is open');
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      await investmentPage.clickAudienceTab();
      console.log('  OK - Audience tab is open (no Investment is saved in this case)');
    });

    await test.step(STEP.pre5, async () => {
      console.log(`\n--- ${STEP.pre5} ---`);
      downloadDir = path.join(process.cwd(), 'test-data', 'investment-module', `download-${TC}`);
      fs.mkdirSync(downloadDir, { recursive: true });
      downloadedFilePath = await investmentPage.downloadAudienceTemplate(downloadDir);
      console.log(`  OK - template saved: ${downloadedFilePath}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Audience template downloaded');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const headers = investmentPage.getXlsxColumnHeaders(downloadedFilePath);
      console.log(`  Column headers found: ${JSON.stringify(headers)}`);
      const colIndex = headers.findIndex((h) => h.toLowerCase() === 'investment id');
      const found = colIndex !== -1;
      const expectedText = '"Investment ID" column in the header row of the downloaded template';

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - "Investment ID" field in the downloaded template:');
      console.log(`     Expected : ${expectedText}`);
      console.log(`     Actual   : ${JSON.stringify(headers)}`);
      console.log(`     Result   : ${found ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${found ? 'PASS' : 'FAIL'} - "Investment ID" column present in the template`);

      expect(found, 'Step 1: The downloaded xlsx template should contain "Investment ID" column').toBe(true);
      console.log('  OK - "Investment ID" field exists in the xlsx file - verified');
    });
  });
});

function formatMDY(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * afterAll safety net (own admin session - afterAll gets no `page`): delete Investments still named
 * "TEST <tcId> ..." and the Leads linked to them. Bounded hook budget; never throws.
 */
async function sweepInvestmentsAfterAll(browser: Browser, tcId: string): Promise<void> {
  test.setTimeout(120_000);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const loginPage = new LoginPageMig(page);
    await loginPage.navigateTo(baseUrl_mig);
    await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
    await new InvestmentPageMig(page).sweepInvestmentLeftovers(tcId);
  } catch (err) {
    console.log(`[mig-sweep] SKIPPED - could not open a sweep session: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
  } finally {
    await context.close().catch(() => {});
  }
}
