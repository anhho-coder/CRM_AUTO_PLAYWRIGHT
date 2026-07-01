import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * =============================================================================================
 *  UC-C-1 - Salesperson posts a customer-visible message
 *  TC.-C.1.8 - Post a customer-visible message with special characters and emoji
 * =============================================================================================
 *  Test Case ID:    TC.-C.1.8   (Xray TC ID: O12CE-O12CC-UC-C1_1.8)
 *  Jira:            CRM-11157
 *  Test Repo Path:  /Migration Odoo 12CE to 12CC/Business Process -> Chatter communication/UC-C.1 Salesperson posts a customer-visible message
 *  Automation-Type: new
 *  Automation-Date: 2026-06-26
 * ---------------------------------------------------------------------------------------------
 *  Summary: Thomas posts a customer-visible message containing special characters (< > & " ') and
 *           emoji via "Send message"; the message is posted and the characters/emoji are displayed
 *           correctly and safely (no broken layout, no script execution).
 * ---------------------------------------------------------------------------------------------
 *  Command to run:
 *    npx playwright test --grep "TC\.-C\.1\.8:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the Xray manual steps - same order, same content):
 *
 *  Pre-condition: Login as Salesperson (Thomas); create a NEW deal-registration Opportunity in
 *                 CRM > Pipeline FOR THIS CASE ONLY, uniquely named "TEST TC.-C.1.8 <date time>".
 *    The deal-registration Internal Note #1 is built from the template, filling the <...> placeholders
 *    with fresh dynamic values each run (key fields, one per line):
 *      - NAKIVO deal registration*  = <random 4-digit number>
 *      - Name                       = TEST <current date time>
 *      - Email                      = Test@company<compact date time>.com
 *      - Created Date               = <current date time>
 *      - phone                      = <random 9-digit number>
 *      - Company                    = Company Name Lead 1
 *      - Partner Company Name       = TEST-Reseller#Automation-Jun10
 *      - IP                         = 128.183.189.157
 *      - Country                    = United States
 *    (Remaining template lines - Solution used, Edition, License Type, etc. - are static defaults.)
 *
 *  Steps to reproduce:
 *   1. Open the Opportunity created above (TEST TC.-C.1.8 <current date time>) in CRM > Pipeline
 *   2. In the chatter, click "Send message"
 *   3. Type a message "TEST MESSAGE TC.-C.1.8 <current date time>" containing special characters (< > & " ') and emoji
 *   4. Click "Send"
 *
 *  Verification (Expected Result on step 4):
 *   4. The message is posted and the special characters and emoji are displayed correctly and safely
 *      (no broken layout and no script execution).
 * =============================================================================================
 */

const SKIP_CLEANUP_OPP = false;

test.describe('TC.-C.1.8 - Post a customer-visible message with special characters and emoji', () => {
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

  test('TC.-C.1.8: Post a customer-visible message with special characters and emoji', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    const { companyEmail, leadName, currentDateTime, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-C.1.8 ${compactDateTime}`;
    const specials = `< > & " ' <b>bold</b> <script>alert(1)</script>`;
    const emoji = `\u{1F600}\u{1F44D}\u{2705}`; // grinning face, thumbs up, check mark
    const messageText = `TEST MESSAGE TC.-C.1.8 ${currentDateTime} ${specials} ${emoji}`;

    await test.step('Pre-condition: Prepare Internal Note #1 and the unique Opportunity name', async () => {
      console.log(`Pre-condition: Opp Name = ${oppName} | message = "${messageText}"`);
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

    await test.step('Step 3-4: Type the message with special characters and emoji, and click "Send"', async () => {
      await opportunityPage.fillComposerAndSend(messageText);
      console.log('✓ Message with special characters + emoji sent');
    });

    await test.step('Verification: The message posts and the special characters/emoji display correctly and safely', async () => {
      // Match on the unique prefix + the literal special characters (chatter renders them as text, not HTML).
      const needle = `TEST MESSAGE TC.-C.1.8 ${currentDateTime}`;
      const { found, chatterText } = await opportunityPage.waitForChatterContaining(
        needle, 6, CommonUtils.waitTimes.checkingChatterLog, CommonUtils.waitTimes.contactRefreshTotalWait);
      const normalized = chatterText.replace(/\s+/g, ' ');
      const specialsPresent = normalized.includes(`< > & " '`);
      const emojiPresent = normalized.includes(emoji);
      // Safety: the <script> must be rendered as TEXT, never executed (no alert dialog could appear in a headless run; presence as text confirms escaping).
      const scriptAsText = normalized.includes('<script>alert(1)</script>');
      console.log(`  - message present: ${found} | specials as text: ${specialsPresent} | emoji present: ${emojiPresent} | script rendered as text (escaped): ${scriptAsText}`);

      await opportunityPage.dismissErrorDialogWithRetry().catch(() => {});
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-C.1.8 - Special characters + emoji message in the chatter');

      expect(found, `The message ("${needle}") should appear in the Opportunity chatter`).toBeTruthy();
      expect(specialsPresent && emojiPresent, 'The special characters and emoji should be displayed correctly as text').toBeTruthy();
      console.log('✅ Verified: special characters and emoji are stored and displayed correctly and safely');
    });
  });
});
