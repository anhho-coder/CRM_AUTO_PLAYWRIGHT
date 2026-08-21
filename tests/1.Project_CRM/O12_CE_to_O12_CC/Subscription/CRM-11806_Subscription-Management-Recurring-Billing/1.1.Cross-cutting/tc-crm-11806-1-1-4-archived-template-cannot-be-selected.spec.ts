import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, SubscriptionPage, SubscriptionTemplatePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { loginAsCrmAdmin, logVerify } from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_1.1.4 - A subscription template that has been switched off cannot be picked on a
 *                    new subscription
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.1.4
 *  Spec ID:         US2 (A clean set)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: refactored
 *  Automation-Date: 2026-08-19
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to pre-production as a CRM administrator (e.g. Anh Ho)
 *    Open Subscriptions > Configuration > Subscription Templates and click "CREATE"
 *    Fill the new template form with:
 *      - Name                   = "Tmpl-Off-<unique>"
 *      - Invoice period         = Every 1 Month(s)
 *      - Duration               = Forever
 *      - Payment Mode           = "Invoice"   (this is a RADIO BUTTON list, not a dropdown)
 *      - Invoice Email Template = "Subscription Invoice: Send by email"
 *    NOTE: "Invoice Email Template" is REQUIRED as soon as a sending Payment Mode is chosen -
 *          saving without it is rejected with "The following fields are invalid: Invoice Email
 *          Template".
 *    Click "SAVE"
 *    With the saved template still open, click the "Active" smart button in the button box at
 *    the top right to archive it.
 *    NOTE: there is NO "Archive" entry in the "Action" menu on this screen - that menu only
 *          offers Delete and Duplicate. Archiving is the "Active" smart-button toggle.
 *
 *  Steps to reproduce:
 *   1. Open Subscriptions > Subscriptions and click "CREATE"
 *   2. Click the "Subscription Template" dropdown on the right-hand column
 *   3. Type "Tmpl-Off-<unique>" in the dropdown search box
 *   4. Clear the search box and read the full dropdown list
 *
 *  Verification Points:
 *   1. The dropdown opens showing the templates that are switched on
 *   2. No result is returned for "Tmpl-Off-<unique>" - the archived template cannot be picked
 *   3. The dropdown list equals exactly the five live templates (set equality, count = 5)
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_1\.1\.4:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.1.4';
const LIVE_TEMPLATES = [
  'Daily(test)',
  'Monthly Sub/Invoice only',
  'Monthly Subscription',
  'Quarterly Subscription',
  'Yearly Subscription',
];

test.describe('CRM-11806_1.1.4 - An archived subscription template cannot be selected', () => {

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
    // The archived template is left behind on purpose: being archived it is invisible to every
    // other test, and each run creates its own uniquely-named one.
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-11806_1.1.4: A subscription template that has been switched off cannot be picked on a new subscription', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const templatePage = new SubscriptionTemplatePage(page);
    const archivedName = `Tmpl-Off-${CommonUtils.generateUniqueId()}`;

    await loginAsCrmAdmin(page);

    await test.step(`Pre-condition: Create the subscription template "${archivedName}" and archive it`, async () => {
      // Housekeeping first: a run that failed before its archive step leaves an ACTIVE
      // "Tmpl-Off-*" behind, which then breaks CRM-11806_1.1.3 ("the list holds exactly the five
      // templates in use") on a leftover rather than on a real defect.
      await templatePage.archiveTemplatesByNamePrefix('Tmpl-Off-');

      console.log(`Pre-condition: Creating the template "${archivedName}"`);
      await templatePage.openList();
      await templatePage.createTemplate(archivedName, 'Invoice');
      console.log('Pre-condition: Archiving it with the "Active" smart button');
      await templatePage.archiveCurrent();
      console.log(`✓ Template "${archivedName}" archived`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - template archived').catch(() => {});
    });

    await test.step('Step 1: Open Subscriptions > Subscriptions and click "CREATE"', async () => {
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clickCreate();
      console.log('✓ New subscription form opened');
    });

    await test.step('Step 2-3: Open the "Subscription Template" dropdown and search the archived name', async () => {
      const filtered = await subscriptionPage.getMany2OneDropdownOptions('template_id', archivedName);
      const matched = filtered.filter(t => t === archivedName);

      logVerify(
        'VP2',
        `no suggestion equals the archived template name "${archivedName}"`,
        `${matched.length} exact match(es) among ${filtered.length} suggestion(s): ${filtered.join(' | ') || '(none)'}`,
        matched.length === 0,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - archived template not offered').catch(() => {});
      expect(matched.length, `VP2: the archived template "${archivedName}" must not be selectable`).toBe(0);
    });

    await test.step('Step 4: Clear the search box and read the full dropdown list', async () => {
      const all = await subscriptionPage.getMany2OneDropdownOptions('template_id');
      const actual = [...all].sort();
      const expected = [...LIVE_TEMPLATES].sort();

      logVerify(
        'VP1 + VP3',
        `the dropdown lists exactly the 5 live templates: ${expected.join(' | ')}`,
        `${actual.length} template(s): ${actual.join(' | ')}`,
        JSON.stringify(actual) === JSON.stringify(expected),
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - full template dropdown').catch(() => {});
      expect(actual, 'VP3: only the templates that are switched on should be selectable').toEqual(expected);

      console.log(`✅ ${TC_ID}: the archived template is not offered; only the five live templates are selectable`);
    });
  });
});
