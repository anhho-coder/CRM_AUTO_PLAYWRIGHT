import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { SubscriptionTemplatePage } from '@pages';
// Blocker #1 fix: the native sale.subscription screens do not exist on crm-mig - drive the embed.
import { SubscriptionPageEmbed as SubscriptionPage } from '@pages/mig';
import { HomePageMig as HomePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  logVerify,
} from '@helpers/crm-11806-subscription.helper';
import { loginAsCrmAdminMig as loginAsCrmAdmin } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_2.2 - A subscription template that has been switched off cannot be picked on a
 *                    new subscription
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_2.2
 *  Spec ID:         IS-CRM-FUNC-0142 / SC-04
 *                   Spec text  : a template is disable-able without deletion and a disabled one stops being offered
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring Billing)" pageId 222538152 v4 (2026-09-07), which SUPERSEDES the FRD.
 *                   Was        : "US2 (A clean set)" - an FRD user story, replaced 2026-10-19.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v4, 2026-09-07)
 *                   It SUPERSEDES the FRD (pageId 222528736); do not key assertions to the FRD.
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/2.Templates-a-clean-set/tc-subscription-2-2-archived-template-cannot-be-selected.spec.ts
 *  Baseline TC ID  : subscription-2.2  (assertions below are the baseline's, copied verbatim)
 *  QA card         : SC-04  - "Subscription Test Cases" (CRM-12140, Nathan)
 *  Runs on         : CRM https://crm-mig.nakivo.site (Odoo 12 CE)
 *                    Subscription service https://subscription-crm-mig.nakivo.site (Odoo 19)
 *                    Customer portal https://subscription-crm-mig.nakivo.site/my
 *  Mechanical deviations from the baseline (and ONLY these):
 *    - baseUrl            -> baseUrl_mig
 *    - users.admin_crm    -> users.admin_crm_mig
 *    - LoginPage/HomePage -> LoginPageMig/HomePageMig (the sidebar theme hides the navbar)
 *    - TC id / file name  -> CRM-11806_x.y.z
 *  No expected value, count or string was changed. Where crm-mig behaves differently the
 *  assertion is meant to go RED - that red is the migration finding.
 * --------------------------------------------------------------------------------------------
 *  BLOCKED on crm-mig - B1 cleared 2026-10-08; B2 still open, so this spec stays skipped:
 *   B1. Rights   : CLEARED 2026-10-08. res.groups 115 "Subscriptions / See Subscriptions" and 116
 *                  "Subscriptions / Manage Subscriptions" now both hold uid 9685
 *                  (anh.ho@nakivo.com), and all ten Subscriptions menus render for it
 *                  (1436 root, 1475/1437/1476/1477, 1478/1479/1480/1481/1482).
 *                  Still denied to that account even so: nakivo.subscription.config (992) and
 *                  nakivo.embed.host (991) - assert through the UI or the Odoo 19 service, never
 *                  on the embed plumbing.
 *   B2. Platform : crm-mig carries NO sale.subscription model (ir.model holds only nakivo.subscription.config and nakivo.subscription.client; sale_subscription is state=uninstallable). The subscription itself lives on the Odoo 19 service subscription-crm-mig.nakivo.site and the CRM renders its screens as an EMBED, so the baseline's "Subscriptions > CREATE a subscription" path does not exist here - on crm-mig a subscription is born only by confirming a quotation that carries a Subscriptionable product.
 *                  -> the creation steps need a SubscriptionPageMig that drives the order path
 *                     on the CRM and reads the Odoo 19 service over its own authenticated
 *                     JSON-RPC (the MigPreSalePage pattern). The Subscriptions screens ARE now
 *                     reachable for that exploration since B1 was cleared.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CRM (crm-mig.nakivo.site) as a CRM administrator (e.g. Anh Ho)
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
 *    npx playwright test --grep "CRM-11806_2\.2:" --project=chromium
 * ============================================================================================
 */

/**
 * NOTE 2026-10-12 - the "blocked-create" tag was REMOVED. It is no longer a blocker.
 *
 * The baseline's `Subscriptions > CREATE` does not exist on crm-mig, but the tester's instruction
 * is to use **Subscriptions > New** instead, and that stand-in is built and proven:
 * `createSubscriptionViaEmbed()` in helpers/crm-11806-mig-subscription.helper.ts drives
 * New -> fill -> cloud save, green in CRM-11806_11.2 and CRM-11806_11.1.
 * Whatever still keeps this spec skipped is named in its remaining @blocked-* tag, if any.
 */
const TC_ID = 'CRM-11806_2.2';
const LIVE_TEMPLATES = [
  'Daily(test)',
  'Monthly Sub/Invoice only',
  'Monthly Subscription',
  'Quarterly Subscription',
  'Yearly Subscription',
];

test.describe('CRM-11806_2.2 - An archived subscription template cannot be selected', () => {

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

  test.skip('CRM-11806_2.2: A subscription template that has been switched off cannot be picked on a new subscription @blocked-mail', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const templatePage = new SubscriptionTemplatePage(page);
    const archivedName = `Tmpl-Off-${CommonUtils.generateUniqueId()}`;

    await loginAsCrmAdmin(page);

    await test.step(`Pre-condition: Create the subscription template "${archivedName}" and archive it`, async () => {
      // Housekeeping first: a run that failed before its archive step leaves an ACTIVE
      // "Tmpl-Off-*" behind, which then breaks subscription-2.2 ("the list holds exactly the five
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
      const matched = filtered.filter((t: any) => t === archivedName);

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
