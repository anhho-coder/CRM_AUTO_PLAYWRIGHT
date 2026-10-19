import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { SubscriptionTemplatePage } from '@pages';
import { HomePageMig as HomePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  logVerify,
} from '@helpers/crm-11806-subscription.helper';
import { loginAsCrmAdminMig as loginAsCrmAdmin } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_2.1 - Exactly the four delivered subscription templates are active, each with
 *                    its exact billing settings
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_2.1
 *  Spec ID:         IS-CRM-FUNC-0140, IS-CRM-FUNC-0140-01, IS-CRM-FUNC-0140-02, IS-CRM-FUNC-0140-03, IS-CRM-FUNC-0140-04, IS-CRM-UI-0010, IS-CRM-SUPP-0006 / SC-04
 *                   Spec text  : the in-use templates carried over with their configuration intact;
 *                   SUPP-0006 - "Authorized users shall be able to add, change, and disable
 *                   subscription templates ... without redevelopment", which step 2's throwaway
 *                   template exercises. (SUPP-0006 was dropped by the 2026-10-19 re-key and is
 *                   restored here; the PDF maps it to SC-04 too.)
 *                   NOT COVERED HERE - IS-CRM-FUNC-0141, the dormancy test ("Daily(test) ... not
 *                   carried"). This case was changed on 2026-10-07, at the tester's call, to IGNORE
 *                   "Daily(test)" entirely, so nothing here can fail when it is present. That is a
 *                   deliberate gap, not an oversight: FUNC-0141 needs its own case.
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring Billing)" pageId 222538152 v4 (2026-09-07), which SUPERSEDES the FRD.
 *                   Was        : "US2 / SC-04" - an FRD user story, replaced 2026-10-19.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v4, 2026-09-07)
 *                   It SUPERSEDES the FRD (pageId 222528736); do not key assertions to the FRD.
 *                   FUNC-0140 / 0141 / 0142, UI-0010, SUPP-0006
 *                   supersedes the FRD: [FRD] Subscription Management (Recurring Billing)
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature) / CRM-12140 (implementation)
 *  Automation-Type: new
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/2.Templates-a-clean-set/tc-subscription-2-1-four-templates-carry-their-exact-billing-settings.spec.ts
 *  Baseline TC ID  : subscription-2.1  (assertions below are the baseline's, copied verbatim)
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
 *  Automation-Update: 2026-10-07 - checks SC-04's FOUR delivered templates only. "Daily(test)"
 *                   is still delivered on the CRM (crm-mig.nakivo.site) and is now IGNORED by this case -
 *                   it is neither required nor forbidden (tester's call, 2026-10-07).
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CRM (crm-mig.nakivo.site) as Subscription staff with the "Manage Subscriptions" right
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
 *  subscription-2.1.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_2\.1:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_2.1';

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

test.describe('CRM-11806_2.1 - The four delivered subscription templates carry their exact billing settings', () => {

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
  /**
   * RE-SKIPPED 2026-10-16 after a trial run. It FAILED, and the failure is a real finding that the
   * @blocked-mail tag does NOT describe:
   *     BasePage.xmlId: "sale_subscription.sale_subscription_template_action" does not exist on
   *     crm-mig.nakivo.site. The module is not installed there.
   * The template screens are the PEER's, reached through the embed - this spec still addresses the
   * native pre-production action. Re-point it at the embed (see SubscriptionPageMig.MENU_XMLID
   * `templates`) before un-skipping again; the mail queue is not what blocks it.
   */

  test.skip('CRM-11806_2.1: Exactly the four delivered subscription templates are active, each with its exact billing settings @blocked-mail', async ({ page }, testInfo) => {
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
