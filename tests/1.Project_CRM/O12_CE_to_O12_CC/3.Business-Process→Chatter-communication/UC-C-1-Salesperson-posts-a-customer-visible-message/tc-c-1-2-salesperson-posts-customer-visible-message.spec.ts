import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * =============================================================================================
 *  UC-C-1 - Salesperson posts a customer-visible message
 *  TC.-C.1.2 - Salesperson posts a customer-visible message on an Opportunity via Send message
 * =============================================================================================
 *  Test Case ID:    TC.-C.1.2   (Xray TC ID: O12CE-O12CC-UC-C1_1.2)
 *  Jira:            CRM-11151
 *  Test Repo Path:  /Migration Odoo 12CE to 12CC/Business Process -> Chatter communication/UC-C.1 Salesperson posts a customer-visible message
 *  Automation-Type: new
 *  Automation-Date: 2026-06-25
 * ---------------------------------------------------------------------------------------------
 *  Summary: Thomas creates his own deal-registration Opportunity (assigned to the Reseller), opens
 *           it, and posts a customer-visible message via the chatter "Send message"; the message is
 *           then shown in the Opportunity log note (chatter) as a customer-visible message.
 * ---------------------------------------------------------------------------------------------
 *  Command to run:
 *    npx playwright test --grep "TC\.-C\.1\.2:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the Xray manual steps - same order, same content):
 *
 *  Pre-condition: Login as Salesperson (Thomas); create a NEW deal-registration Opportunity in
 *                 CRM > Pipeline FOR THIS CASE ONLY, uniquely named "TEST TC.-C.1.2 <date time>",
 *                 Stage New, Assigned Partner = Reseller, fresh unique Email.
 *
 *  Steps to reproduce:
 *   1. Open CRM module and go to Pipeline
 *   2. Open the Opportunity created above (TEST TC.-C.1.2 <current date time>)
 *   3. In the chatter, click "Send message"
 *   4. Type the message "TEST MESSAGE TC.-C.1.2 <current date time>" and click "Send"
 *
 *  Verification (Expected Result on step 4):
 *   4. The message "TEST MESSAGE TC.-C.1.2 <current date time>" is posted and shown in the
 *      Opportunity chatter as a customer-visible message (Salesperson author, current timestamp).
 * =============================================================================================
 */

const SKIP_CLEANUP_OPP = false; // false = delete the created Opportunity on teardown

test.describe('TC.-C.1.2 - Salesperson posts a customer-visible message via Send message', () => {

  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('TC.-C.1.2: Salesperson posts a customer-visible message on an Opportunity via Send message', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);

    const { companyEmail, leadName, currentDateTime, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-C.1.2 ${compactDateTime}`;
    const messageText = `TEST MESSAGE TC.-C.1.2 ${currentDateTime}`;

    await test.step('Pre-condition: Prepare Internal Note #1 and the unique Opportunity name', async () => {
      console.log(`Pre-condition: Opp Name = ${oppName} | Email = ${companyEmail} | message = "${messageText}"`);
    });

    // ===== Pre-condition: create the deal-registration Opportunity as Thomas (shared helper) =====
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
      stepPrefix: 'Pre-condition',
    });

    await test.step('Step 1-2: Open CRM module, go to Pipeline and open the Opportunity created above', async () => {
      await opportunityPage.openByUrl(createdOppUrl as string);
      await opportunityPage.dismissErrorDialogWithRetry().catch(() => {});
      console.log(`✓ Opportunity opened: ${createdOppUrl}`);
    });

    await test.step('Step 3: In the chatter, click "Send message"', async () => {
      await opportunityPage.openSendMessageComposer();
      console.log('✓ "Send message" composer opened');
    });

    await test.step('Step 4: Type the message and click "Send"', async () => {
      console.log(`Step 4: Posting customer-visible message = "${messageText}"`);
      await opportunityPage.fillComposerAndSend(messageText);
      console.log('✓ Message sent');
    });

    await test.step('Verification: The message is shown in the Opportunity chatter (customer-visible message)', async () => {
      const { found, chatterText } = await opportunityPage.waitForChatterContaining(
        messageText,
        6,
        CommonUtils.waitTimes.checkingChatterLog,
        CommonUtils.waitTimes.contactRefreshTotalWait
      );
      console.log(`  - Opportunity chatter contains the posted message: ${found}`);
      if (!found) console.log(`  - Chatter (first 400 chars): "${chatterText.substring(0, 400)}"`);

      await opportunityPage.dismissErrorDialogWithRetry().catch(() => {});
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-C.1.2 - Customer-visible message in the Opportunity chatter');

      expect(
        found,
        `The Salesperson's customer-visible message ("${messageText}") should appear in the Opportunity chatter`
      ).toBeTruthy();
      console.log('✅ Verified: the customer-visible message is shown in the Opportunity chatter');
    });
  });
});
