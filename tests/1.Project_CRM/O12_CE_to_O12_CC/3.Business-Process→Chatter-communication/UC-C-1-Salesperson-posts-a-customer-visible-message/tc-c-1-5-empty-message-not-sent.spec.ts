import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * =============================================================================================
 *  UC-C-1 - Salesperson posts a customer-visible message
 *  TC.-C.1.5 - Salesperson tries to send an empty customer-visible message
 * =============================================================================================
 *  Test Case ID:    TC.-C.1.5   (Xray TC ID: O12CE-O12CC-UC-C1_1.5)
 *  Jira:            CRM-11154
 *  Test Repo Path:  /Migration Odoo 12CE to 12CC/Business Process -> Chatter communication/UC-C.1 Salesperson posts a customer-visible message
 *  Automation-Type: new
 *  Automation-Date: 2026-06-26
 * ---------------------------------------------------------------------------------------------
 *  Summary: Thomas opens the "Send message" composer on his own Opportunity, leaves the body empty
 *           and presses "Send"; the empty message cannot be sent - nothing is posted and the
 *           composer stays open (a successful send would close it).
 * ---------------------------------------------------------------------------------------------
 *  Command to run:
 *    npx playwright test --grep "TC\.-C\.1\.5:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the Xray manual steps - same order, same content):
 *
 *  Pre-condition: Login as Salesperson (Thomas); create a NEW deal-registration Opportunity in
 *                 CRM > Pipeline FOR THIS CASE ONLY, uniquely named "TEST TC.-C.1.5 <date time>".
 *
 *  Steps to reproduce:
 *   1. Open CRM module and go to Pipeline
 *   2. Open the Opportunity created above (TEST TC.-C.1.5 <current date time>)
 *   3. In the chatter, click "Send message"
 *   4. Leave the message body empty and try to click "Send"
 *
 *  Verification (Expected Result on step 4):
 *   4. The empty message cannot be sent; no message is posted to the Opportunity chatter.
 * =============================================================================================
 */

const SKIP_CLEANUP_OPP = false;

test.describe('TC.-C.1.5 - Salesperson tries to send an empty customer-visible message', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      await new HomePage(page).waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('TC.-C.1.5: Salesperson tries to send an empty customer-visible message', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-C.1.5 ${compactDateTime}`;

    await test.step('Pre-condition: Prepare Internal Note #1 and the unique Opportunity name', async () => {
      console.log(`Pre-condition: Opp Name = ${oppName}`);
    });

    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote, stepPrefix: 'Pre-condition',
    });

    await test.step('Step 1-2: Open CRM, go to Pipeline and open the Opportunity created above', async () => {
      await opportunityPage.openByUrl(createdOppUrl as string);
      await opportunityPage.dismissErrorDialogWithRetry().catch(() => {});
      console.log(`✓ Opportunity opened: ${createdOppUrl}`);
    });

    await test.step('Step 3: In the chatter, click "Send message"', async () => {
      await opportunityPage.openSendMessageComposer();
      console.log('✓ "Send message" composer opened');
    });

    await test.step('Step 4: Leave the message body empty and try to click "Send"', async () => {
      const body = await opportunityPage.getComposerBodyValue();
      console.log(`Step 4: composer body is empty: ${body.trim().length === 0}`);
      await opportunityPage.clickComposerSend();
      console.log('✓ Pressed "Send" with an empty body');
    });

    await test.step('Verification: The empty message cannot be sent; nothing is posted', async () => {
      // A successful send collapses the composer; an empty send must NOT post, so the composer stays open.
      const stillOpen = await opportunityPage.isComposerOpen();
      console.log(`  - composer still open after empty Send (= nothing was sent): ${stillOpen}`);

      await opportunityPage.dismissErrorDialogWithRetry().catch(() => {});
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-C.1.5 - Empty message not sent (composer stays open)');

      expect(stillOpen, 'An empty customer-visible message must not be sent (the composer should remain open)').toBeTruthy();
      console.log('✅ Verified: the empty message cannot be sent; nothing is posted to the chatter');
    });
  });
});
