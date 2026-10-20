import { test, expect, Browser, Page } from '@playwright/test';
import { config } from '@config/test.config';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';
import { InvestmentPageMig } from '@pages/mig/InvestmentPageMig';
import { CommonUtils } from '@helpers/common.utils';
import {
  resetMigCreatedRecords,
  registerMigRecord,
  teardownMigRecords,
  listMigCreatedRecords,
} from '@helpers/o12ce-main-business.helper';

/**
 * ============================================================================================
 *  CRM-12370_8.1.1 - Investments > Configuration > Activity Type: create (O12 CE Migration server)
 * ============================================================================================
 *  Test Case ID    : CRM-12370_8.1.1
 *  Automation-Type : ported
 *  Automation-Date : 2026-10-19
 *  Run as          : Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *
 *  Source TC (pre-production) : CRM-2482_1.1.1
 *  Source spec                : tests/1.Project_CRM/4.Investments/CRM-2482_Investments_module-General_fields/
 *                               1.Configuration/1.1.Activity_Type/tc-crm-2482-1-1-1-create-edit-activity-type.spec.ts
 *  Source version             : commit 59f3273 (2026-05-25) - re-check before trusting this spec
 *
 * --------------------------------------------------------------------------------------------
 *  Summary
 * --------------------------------------------------------------------------------------------
 *  Creates an Activity Type (Name + Code) on crm-mig and verifies the saved Name and Code are
 *  shown in the list - the pre-production assertion, unchanged.
 *
 * --------------------------------------------------------------------------------------------
 *  Command to run
 * --------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_8\.1\.1:" --project=MigSmoke
 *
 * --------------------------------------------------------------------------------------------
 *  O12 CE deviations (mechanical only - BASELINE RULE: the assertion is copied unchanged)
 * --------------------------------------------------------------------------------------------
 *  - Login account users.admin_crm_mig on baseUrl_mig, via LoginPageMig.
 *  - Navigation by XML id (InvestmentPageMig.navigateToActivityType) instead of menu clicks.
 *  - The Activity Type Name carries the run marker "TEST CRM-12370_8.1.1 ..." so the afterAll
 *    sweep can find a leftover by name.
 *  - Clean-up: the source's UI teardown (tick the row, Action > Delete) is replaced by the cleanup
 *    ledger. The record id is read over RPC after SAVE and registered; afterEach deletes it through
 *    teardownMigRecords; afterAll sweeps nakivo.investment.activity.type named "TEST CRM-12370_8.1.1"
 *    (count first, DENY-list by marker - no keep-list, stops if more than 5 match).
 *
 * --------------------------------------------------------------------------------------------
 *  Source manual TC
 * --------------------------------------------------------------------------------------------
 *  Pre-condition(s):
 *    1. After login successful, click at "Investments" button
 *    2. On "Investments" page, on menu on top of page, select "Configuration" item then "Activity Type" sub-item
 *  Steps to reproduce:
 *    1. Press "CREATE" button and wait
 *    2. In the bottom of page, enter value at:
 *         - "Name" field = TEST (with template Name_Test_company + current date + current time.com)
 *         - "Code" field = test_to_test (with template Code_Test_company + current date + current time.com)
 *    3. Press "SAVE" button and wait
 *    4. Verify In the bottom of page, enter value at:
 *         - "Name" field = Activity_Type_Name#1
 *         - "Code" field = Activity_Type_Code#1
 *  Tear down: delete the created Activity Type (ledger, see above)
 * ============================================================================================
 */

const TC = 'CRM-12370_8.1.1';
const MODEL = 'nakivo.investment.activity.type';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1-2: Login as Admin on crm-mig, open Investments > Configuration > Activity Type (list)',
  s1: 'Step 1: Press "CREATE" button and wait',
  s2: 'Step 2: In the bottom of page, enter Name and Code (Name carries the TEST run marker)',
  s3: 'Step 3: Press "SAVE" button and wait',
  s4: 'Step 4: Verify In the bottom of page, the saved Name and Code are shown',
} as const;

/** Per-test state the afterEach needs. */
let activityTypeId = 0;

test.describe(`${TC} - Activity Type create`, () => {
  test.beforeEach(async ({ context, page }) => {
    activityTypeId = 0;
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
    // Evidence: the URL of every record this test created, printed before teardown removes (or keeps) them.
    await new InvestmentPageMig(page).logRecordUrls(TC, listMigCreatedRecords()).catch(() => {});
    await teardownMigRecords(page, false);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.afterAll(async ({ browser }) => {
    await sweepActivityTypesAfterAll(browser);
  });

  test(`${TC}: Verify the authorised user can create/edit an Activity type`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];
    const activityTypeName = `TEST ${TC} Name_Test_company_${timestamp}`;
    const activityTypeCode = `Code_Test_company_${timestamp}`;

    const loginPage = new LoginPageMig(page);
    const investmentPage = new InvestmentPageMig(page);

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      resetMigCreatedRecords();
      console.log(`  - Host    : ${baseUrl_mig}`);
      console.log(`  - Account : ${users.admin_crm_mig.username}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await investmentPage.navigateToActivityType();
      console.log('  OK - Activity Type list is open');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await investmentPage.clickCreateButton();
      console.log('  OK - Create form is open');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log(`  - Name: ${activityTypeName}`);
      console.log(`  - Code: ${activityTypeCode}`);
      await investmentPage.fillActivityTypeForm(activityTypeName, activityTypeCode);
      console.log('  OK - Activity Type information entered');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await investmentPage.clickSaveButton();
      activityTypeId = await findActivityTypeIdByName(page, activityTypeName);
      expect(activityTypeId, `the Activity Type "${activityTypeName}" must exist after SAVE`).toBeGreaterThan(0);
      registerMigRecord(MODEL, activityTypeId, 'Activity Type');
      InvestmentPageMig.logRecordUrl('Activity Type', MODEL, activityTypeId);
      console.log(`  OK - Activity Type saved (id ${activityTypeId})`);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #4.1 - Activity Type row shows the entered Name and Code in the list:');
      console.log(`     Expected : Name "${activityTypeName}" and Code "${activityTypeCode}" listed`);

      let __verifyPassed = false;
      try {
        await investmentPage.verifyActivityTypeInList(activityTypeName, activityTypeCode);
        __verifyPassed = true;
        console.log('     Result   : PASS');
      } catch (err) {
        console.log('     Result   : FAIL');
        throw err;
      } finally {
        console.log('===============================================');
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - Activity Type in list`,
          passed: __verifyPassed,
        }).catch(() => {});
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Activity Type verified');
    });
  });
});

/** Id of the Activity Type named exactly `name` (0 when none) - a read, bounded to 2 rows. */
async function findActivityTypeIdByName(page: Page, name: string): Promise<number> {
  const rows = await new MigPlatformPage(page).callKw<Array<{ id: number }>>(
    MODEL, 'search_read', [[['name', '=', name]], ['id']], { limit: 2, context: { active_test: false } },
  );
  if (rows.length > 1) throw new Error(`findActivityTypeIdByName: "${name}" is not unique (${rows.length} rows)`);
  return rows[0]?.id ?? 0;
}

/**
 * afterAll safety net (own admin session - afterAll gets no `page`): delete Activity Types whose
 * NAME carries this spec's marker ("TEST <tcId> ..."). Counts first; more than 5 matches means the
 * marker is wrong, so it STOPS and deletes nothing. Never throws.
 */
async function sweepActivityTypesAfterAll(browser: Browser): Promise<void> {
  test.setTimeout(120_000);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const loginPage = new LoginPageMig(page);
    await loginPage.navigateTo(baseUrl_mig);
    await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
    const platform = new MigPlatformPage(page);
    const marker = [['name', 'like', TC], ['name', 'like', 'TEST']];
    const count = await platform.callKw<number>(MODEL, 'search_count', [marker], { context: { active_test: false } });
    if (count === 0) {
      console.log(`[mig-sweep] activity types clean - nothing named "TEST ${TC} ..." is left`);
      return;
    }
    if (count > 5) {
      console.log(`[mig-sweep] STOPPED - ${count} activity types match "${TC}", more than a run creates. Nothing deleted.`);
      return;
    }
    const rows = await platform.callKw<Array<{ id: number; name: string }>>(
      MODEL, 'search_read', [marker, ['id', 'name']], { limit: 5, context: { active_test: false } },
    );
    console.log(`\n[mig-sweep] ${rows.length} activity type(s) match "${TC}" - deleting`);
    for (const r of rows) {
      try {
        await platform.callKw(MODEL, 'unlink', [[r.id]]);
        console.log(`  deleted   ${MODEL}#${r.id} (${r.name})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
        console.log(`  FAILED    ${MODEL}#${r.id} (${r.name}) - ${msg}`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
    console.log(`[mig-sweep] activity types sweep SKIPPED - ${msg}`);
  } finally {
    await context.close().catch(() => {});
  }
}
