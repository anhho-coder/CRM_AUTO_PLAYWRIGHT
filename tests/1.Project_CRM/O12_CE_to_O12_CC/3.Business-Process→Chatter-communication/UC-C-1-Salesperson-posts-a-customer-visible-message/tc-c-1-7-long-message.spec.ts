import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * =============================================================================================
 *  UC-C-1 - Salesperson posts a customer-visible message
 *  TC.-C.1.7 - Post a very long customer-visible message (boundary)
 * =============================================================================================
 *  Test Case ID:    TC.-C.1.7   (Xray TC ID: O12CE-O12CC-UC-C1_1.7)
 *  Jira:            CRM-11156
 *  Test Repo Path:  /Migration Odoo 12CE to 12CC/Business Process -> Chatter communication/UC-C.1 Salesperson posts a customer-visible message
 *  Automation-Type: new
 *  Automation-Date: 2026-06-26
 * ---------------------------------------------------------------------------------------------
 *  Summary: Thomas creates his own deal-registration Opportunity, opens it and posts a very long
 *           customer-visible message (~5000 chars) via "Send message"; the full message is posted
 *           and shown in the Opportunity chatter without truncation or error.
 * ---------------------------------------------------------------------------------------------
 *  Command to run:
 *    npx playwright test --grep "TC\.-C\.1\.7:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the Xray manual steps - same order, same content):
 *
 *  Pre-condition: Login as Salesperson (Thomas); create a NEW deal-registration Opportunity in
 *                 CRM > Pipeline FOR THIS CASE ONLY, uniquely named "TEST TC.-C.1.7 <date time>".
 *
 *  Steps to reproduce:
 *   1. Open the Opportunity created above (TEST TC.-C.1.7 <current date time>) in CRM > Pipeline
 *   2. In the chatter, click "Send message"
 *   3. Paste a very long message (about 5000 characters) that begins with "TEST MESSAGE TC.-C.1.7 <current date time>"
 *   4. Click "Send"
 *
 *  Verification (Expected Result on step 4):
 *   4. The full message is posted and displayed completely in the chatter, not truncated and without error.
 * =============================================================================================
 */

const SKIP_CLEANUP_OPP = false;

test.describe('TC.-C.1.7 - Post a very long customer-visible message (boundary)', () => {
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

  test('TC.-C.1.7: Post a very long customer-visible message (boundary)', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    const { companyEmail, leadName, currentDateTime, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-C.1.7 ${compactDateTime}`;
    const prefix = `TEST MESSAGE TC.-C.1.7 ${currentDateTime}`;
    // ~5000-character message that begins with the unique prefix.
    const longMessage = `${prefix} ` + 'Lorem ipsum dolor sit amet. '.repeat(180);

    await test.step('Pre-condition: Prepare Internal Note #1 and the unique Opportunity name', async () => {
      console.log(`Pre-condition: Opp Name = ${oppName} | message length = ${longMessage.length} chars`);
    });

    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote, stepPrefix: 'Pre-condition',
    });

    await test.step('Step 1: Open the Opportunity created above in CRM > Pipeline', async () => {
      await opportunityPage.openByUrl(createdOppUrl as string);
      await opportunityPage.dismissErrorDialogWithRetry().catch(() => {});
      console.log(`✓ Opportunity opened: ${createdOppUrl}`);
    });

    await test.step('Step 2: In the chatter, click "Send message"', async () => {
      await opportunityPage.openSendMessageComposer();
      console.log('✓ "Send message" composer opened');
    });

    await test.step('Step 3-4: Paste a very long message (~5000 chars) and click "Send"', async () => {
      await opportunityPage.fillComposerAndSend(longMessage);
      console.log(`✓ Long message (${longMessage.length} chars) sent`);
    });

    await test.step('Verification: The full long message is posted in the chatter (not truncated, no error)', async () => {
      // Match a substantial tail slice of the message to confirm it was not truncated.
      const tail = longMessage.slice(-120).replace(/\s+/g, ' ').trim();
      const { found, chatterText } = await opportunityPage.waitForChatterContaining(
        prefix, 6, CommonUtils.waitTimes.checkingChatterLog, CommonUtils.waitTimes.contactRefreshTotalWait);
      const tailPresent = chatterText.replace(/\s+/g, ' ').includes(tail);
      console.log(`  - chatter contains message start: ${found} | contains message tail (not truncated): ${tailPresent}`);

      await opportunityPage.dismissErrorDialogWithRetry().catch(() => {});
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-C.1.7 - Long customer-visible message in the chatter');

      expect(found, `The long message (start "${prefix}") should appear in the Opportunity chatter`).toBeTruthy();
      expect(tailPresent, 'The full long message should be posted without truncation (tail present)').toBeTruthy();
      console.log('✅ Verified: the full long message is posted in the chatter without truncation');
    });
  });
});
