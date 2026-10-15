import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, SubscriptionTemplatePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { loginAsCrmAdmin, logVerify } from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  subscription-2.1 - Exactly the four delivered subscription templates are active, each with
 *                    its exact billing settings
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    subscription-2.1
 *  Spec ID:         US2 / SC-04
 *  Spec:            Subscription Test Cases (CRM-12140) - SC-04
 *                   FUNC-0140 / 0141 / 0142, UI-0010, SUPP-0006
 *                   supersedes the FRD: [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature) / CRM-12140 (implementation)
 *  Automation-Type: new
 *  Automation-Date: 2026-08-18
 *  Automation-Update: 2026-10-07 - checks SC-04's FOUR delivered templates only. "Daily(test)"
 *                   is still delivered on pre-production and is now IGNORED by this case -
 *                   it is neither required nor forbidden (tester's call, 2026-10-07).
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to pre-production as Subscription staff with the "Manage Subscriptions" right
 *    (e.g. Anh Ho)
 *    No test data is created - this case only reads the delivered configuration
 *
 *  Steps to reproduce:
 *   1. Open Subscriptions > Configuration > Subscription Templates
 *   2. Read the names of the templates listed, ignoring "Daily(test)"
 *   3. Open each template in turn and read "Recurrence", "Repeat Every", "Payment Mode",
 *      "Automatic closing limit" and "Invoice Email Template"
 *
 *  Verification Points:
 *   1. Ignoring "Daily(test)", the list contains exactly these four templates
 *      (set equality, count = 4):
 *        Monthly Sub/Invoice only | Monthly Subscription |
 *        Quarterly Subscription   | Yearly Subscription
 *   2. Each template carries exactly these settings:
 *        Monthly Subscription     = Month(s), 1, "Invoice & try to charge", closing limit 0
 *        Monthly Sub/Invoice only = Month(s), 1, "Invoice",                 closing limit 0
 *        Quarterly Subscription   = Month(s), 3, "Invoice & try to charge", closing limit 15
 *        Yearly Subscription      = Year(s),  1, "Draft invoice",           closing limit 15,
 *                                   Invoice Email Template EMPTY
 *
 *  NOT automated here: anything about "Daily(test)" - active or archived. It is out of this
 *  case's scope and stays on the manual card. The archive/unselectable path is covered by
 *  subscription-2.2.
 *
 *  Command to run:
 *    npx playwright test --grep "subscription-2\.1:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'subscription-2.1';

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
];

/**
 * Environment-only templates that this case does not judge: they are filtered out of the listed
 * names before the set comparison, so their presence or absence can never pass or fail the case.
 */
const IGNORED_TEMPLATES = ['Daily(test)'];

test.describe('subscription-2.1 - The four delivered subscription templates carry their exact billing settings', () => {

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

  test('subscription-2.1: Exactly the four delivered subscription templates are active, each with its exact billing settings', async ({ page }, testInfo) => {
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
      const ignored = listedNames.filter(name => IGNORED_TEMPLATES.includes(name));
      const actualNames = listedNames.filter(name => !IGNORED_TEMPLATES.includes(name)).sort();

      if (ignored.length) {
        console.log(`ℹ️  Ignored - out of scope for this case: ${ignored.join(' | ')}`);
      }

      logVerify(
        'VP1',
        `ignoring "${IGNORED_TEMPLATES.join('", "')}", the list contains exactly these 4 templates: ${expectedNames.join(' | ')}`,
        `${actualNames.length} template(s) after ignoring: ${actualNames.join(' | ')}`,
        JSON.stringify(actualNames) === JSON.stringify(expectedNames),
      );

      expect(actualNames, 'VP1: once the ignored templates are left out, the Subscription Templates list should equal exactly the four delivered templates').toEqual(expectedNames);
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

    console.log(`✅ ${TC_ID}: ignoring "${IGNORED_TEMPLATES.join('", "')}", exactly the four delivered templates are active and each carries its exact billing settings`);
  });
});
