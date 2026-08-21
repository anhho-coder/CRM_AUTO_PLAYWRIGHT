import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, SubscriptionTemplatePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { loginAsCrmAdmin, logVerify } from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_1.1.3 - All subscription templates in use are available with their exact billing
 *                    settings
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.1.3
 *  Spec ID:         US2 (A clean set)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: new
 *  Automation-Date: 2026-08-18
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to pre-production as a CRM administrator (e.g. Anh Ho)
 *    No test data is created - this case only reads the delivered configuration
 *
 *  Steps to reproduce:
 *   1. Open Subscriptions > Configuration > Subscription Templates
 *   2. Count the templates listed and read their names
 *   3. Open each template in turn and read "Recurrence", "Repeat Every", "Payment Mode",
 *      "Automatic closing limit" and "Invoice Email Template"
 *
 *  Verification Points:
 *   1. The list contains exactly five templates (set equality, count = 5):
 *        Daily(test) | Monthly Subscription | Monthly Sub/Invoice only |
 *        Quarterly Subscription | Yearly Subscription
 *   2. Each template carries exactly these settings:
 *        Monthly Subscription     = Month(s), 1, "Invoice & try to charge", closing limit 0
 *        Monthly Sub/Invoice only = Month(s), 1, "Invoice",                 closing limit 0
 *        Quarterly Subscription   = Month(s), 3, "Invoice & try to charge", closing limit 15
 *        Yearly Subscription      = Year(s),  1, "Draft invoice",           closing limit 15,
 *                                   Invoice Email Template EMPTY
 *        Daily(test)              = Day(s),   1, "Invoice & try to charge", closing limit 15
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_1\.1\.3:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.1.3';

interface TemplateExpectation {
  name: string;
  recurrence: string;
  repeatEvery: number;
  paymentMode: string;
  closingLimit: number;
  invoiceMailEmpty?: boolean;
}

const EXPECTED_TEMPLATES: TemplateExpectation[] = [
  { name: 'Monthly Subscription', recurrence: 'Month(s)', repeatEvery: 1, paymentMode: 'Invoice & try to charge', closingLimit: 0 },
  { name: 'Monthly Sub/Invoice only', recurrence: 'Month(s)', repeatEvery: 1, paymentMode: 'Invoice', closingLimit: 0 },
  { name: 'Quarterly Subscription', recurrence: 'Month(s)', repeatEvery: 3, paymentMode: 'Invoice & try to charge', closingLimit: 15 },
  { name: 'Yearly Subscription', recurrence: 'Year(s)', repeatEvery: 1, paymentMode: 'Draft invoice', closingLimit: 15, invoiceMailEmpty: true },
  { name: 'Daily(test)', recurrence: 'Day(s)', repeatEvery: 1, paymentMode: 'Invoice & try to charge', closingLimit: 15 },
];

test.describe('CRM-11806_1.1.3 - The five subscription templates carry their exact billing settings', () => {

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`❌ TEST FAILED - reason: ${testInfo.error?.message ?? 'unknown'}`);
      await new HomePage(page).waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    // Read-only case - nothing was created, so there is nothing to clean up.
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-11806_1.1.3: All subscription templates in use are available with their exact billing settings', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const templatePage = new SubscriptionTemplatePage(page);

    await loginAsCrmAdmin(page);

    await test.step('Step 1-2: Open Subscriptions > Configuration > Subscription Templates and read the names', async () => {
      console.log('Step 1-2: Opening the Subscription Templates list');
      await templatePage.openList();
      const listedNames = await templatePage.getListNames();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Subscription Templates list').catch(() => {});

      const expectedNames = EXPECTED_TEMPLATES.map(t => t.name).sort();
      const actualNames = [...listedNames].sort();

      logVerify(
        'VP1',
        `the list contains exactly these 5 templates: ${expectedNames.join(' | ')}`,
        `${actualNames.length} template(s): ${actualNames.join(' | ')}`,
        JSON.stringify(actualNames) === JSON.stringify(expectedNames),
      );

      expect(actualNames, 'VP1: the Subscription Templates list should equal exactly the five templates in use').toEqual(expectedNames);
    });

    for (const expected of EXPECTED_TEMPLATES) {
      await test.step(`Step 3: Open "${expected.name}" and read its billing settings`, async () => {
        await templatePage.openList();
        await templatePage.openByName(expected.name);
        const settings = await templatePage.getSettings();

        const settingsOk =
          settings.recurrence === expected.recurrence &&
          settings.repeatEvery === expected.repeatEvery &&
          settings.paymentMode === expected.paymentMode &&
          settings.closingLimit === expected.closingLimit &&
          (!expected.invoiceMailEmpty || settings.invoiceMailTemplate === '');

        logVerify(
          `VP2 - ${expected.name}`,
          `Recurrence "${expected.recurrence}", Repeat Every ${expected.repeatEvery}, Payment Mode "${expected.paymentMode}", Automatic closing limit ${expected.closingLimit}${expected.invoiceMailEmpty ? ', Invoice Email Template EMPTY' : ''}`,
          `Recurrence "${settings.recurrence}", Repeat Every ${settings.repeatEvery}, Payment Mode "${settings.paymentMode}", Automatic closing limit ${settings.closingLimit}, Invoice Email Template "${settings.invoiceMailTemplate}"`,
          settingsOk,
        );

        expect(settings.recurrence, `VP2: "${expected.name}" Recurrence`).toBe(expected.recurrence);
        expect(settings.repeatEvery, `VP2: "${expected.name}" Repeat Every`).toBe(expected.repeatEvery);
        expect(settings.paymentMode, `VP2: "${expected.name}" Payment Mode`).toBe(expected.paymentMode);
        expect(settings.closingLimit, `VP2: "${expected.name}" Automatic closing limit`).toBe(expected.closingLimit);
        if (expected.invoiceMailEmpty) {
          expect(settings.invoiceMailTemplate, `VP2: "${expected.name}" should have NO Invoice Email Template - nothing is sent for this template`).toBe('');
        }
      });
    }

    console.log(`✅ ${TC_ID}: all five templates present and each carries its exact billing settings`);
  });
});
