import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * =============================================================================================
 *  UC-C-1 - Salesperson posts a customer-visible message
 *  TC.-C.1.6 - Post a customer-visible multi-line plain-text message (composer has no rich-text)
 * =============================================================================================
 *  Test Case ID:    TC.-C.1.6   (Xray TC ID: O12CE-O12CC-UC-C1_1.6)
 *  Jira:            CRM-11155
 *  Test Repo Path:  /Migration Odoo 12CE to 12CC/Business Process -> Chatter communication/UC-C.1 Salesperson posts a customer-visible message
 *  Automation-Type: new
 *  Automation-Date: 2026-06-29
 * ---------------------------------------------------------------------------------------------
 *  Summary: Thomas posts a multi-line customer-visible message via "Send message"; the chatter
 *           composer is a plain-text box (no bold/italic/list controls) and the multi-line message
 *           is posted with its content and line breaks preserved.
 * ---------------------------------------------------------------------------------------------
 *  Command to run:
 *    npx playwright test --grep "TC\.-C\.1\.6:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the Xray manual steps - same order, same content):
 *
 *  Pre-condition: Login as Salesperson (Thomas); create a NEW deal-registration Opportunity in
 *                 CRM > Pipeline FOR THIS CASE ONLY, uniquely named "TEST TC.-C.1.6 <date time>".
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
 *   1. Open the Opportunity created above (TEST TC.-C.1.6 <current date time>) in CRM > Pipeline
 *   2. In the chatter, click "Send message"
 *   3. Type a multi-line message that starts with "TEST MESSAGE TC.-C.1.6 <current date time>" (the chatter composer is a plain-text box - it offers no rich-text formatting such as bold, italic, or bulleted lists)
 *   4. Click "Send"
 *
 *  Verification (Expected Result on step 4):
 *   4. The multi-line plain-text message is posted and shown in the chatter with its content and line
 *      breaks preserved. The composer provides no rich-text formatting controls (bold / italic / list);
 *      the message is stored and displayed as plain text.
 * =============================================================================================
 */

const SKIP_CLEANUP_OPP = false;

test.describe('TC.-C.1.6 - Post a customer-visible multi-line plain-text message', () => {
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

  test('TC.-C.1.6: Post a customer-visible multi-line plain-text message (composer has no rich-text formatting)', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    const { companyEmail, leadName, currentDateTime, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-C.1.6 ${compactDateTime}`;
    const line1 = `TEST MESSAGE TC.-C.1.6 ${currentDateTime}`;
    const line2 = 'Second line of plain text.';
    const line3 = 'Third line of plain text.';
    const messageText = `${line1}\n${line2}\n${line3}`;
    let hasRichText = true;

    await test.step('Pre-condition: Prepare Internal Note #1 and the unique Opportunity name', async () => {
      console.log(`Pre-condition: Opp Name = ${oppName} | multi-line message starts with "${line1}"`);
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
      hasRichText = await opportunityPage.composerHasRichText();
      console.log(`✓ "Send message" composer opened | rich-text controls present: ${hasRichText}`);
    });

    await test.step('Step 3-4: Type the multi-line plain-text message and click "Send"', async () => {
      await opportunityPage.fillComposerAndSend(messageText);
      console.log('✓ Multi-line plain-text message sent');
    });

    await test.step('Verification: composer is plain text (no rich-text controls) and the multi-line message is posted with its content preserved', async () => {
      const { found, chatterText } = await opportunityPage.waitForChatterContaining(
        line1, 6, CommonUtils.waitTimes.checkingChatterLog, CommonUtils.waitTimes.contactRefreshTotalWait);
      const normalized = chatterText.replace(/\s+/g, ' ');
      const line2Present = normalized.includes(line2);
      const line3Present = normalized.includes(line3);
      console.log(`  - composer rich-text controls: ${hasRichText} (expected false) | line1: ${found} | line2: ${line2Present} | line3: ${line3Present}`);

      await opportunityPage.dismissErrorDialogWithRetry().catch(() => {});
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-C.1.6 - Multi-line plain-text message in the chatter');

      expect(hasRichText, 'The chatter composer should be plain text (no rich-text formatting controls)').toBeFalsy();
      expect(found && line2Present && line3Present, 'The full multi-line plain-text message (all lines) should be posted in the chatter').toBeTruthy();
      console.log('✅ Verified: plain-text composer; the multi-line message is posted with all lines preserved');
    });
  });
});
