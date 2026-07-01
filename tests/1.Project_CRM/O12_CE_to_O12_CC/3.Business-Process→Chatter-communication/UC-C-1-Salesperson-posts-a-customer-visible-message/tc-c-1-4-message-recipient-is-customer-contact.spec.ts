import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote, DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * =============================================================================================
 *  UC-C-1 - Salesperson posts a customer-visible message
 *  TC.-C.1.4 - Customer-visible message lists the customer's email contact as the suggested recipient
 * =============================================================================================
 *  Test Case ID:    TC.-C.1.4   (Xray TC ID: O12CE-O12CC-UC-C1_1.4)
 *  Jira:            CRM-11153
 *  Test Repo Path:  /Migration Odoo 12CE to 12CC/Business Process -> Chatter communication/UC-C.1 Salesperson posts a customer-visible message
 *  Automation-Type: new
 *  Automation-Date: 2026-06-29
 * ---------------------------------------------------------------------------------------------
 *  Summary: Thomas opens the "Send message" composer on his own Opportunity and observes the
 *           recipients: the message goes "To: Followers" and the auto-listed suggested recipient is
 *           the customer's email contact (reason "Customer Email") - the Reseller is NOT auto-listed.
 * ---------------------------------------------------------------------------------------------
 *  Command to run:
 *    npx playwright test --grep "TC\.-C\.1\.4:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the Xray manual steps - same order, same content):
 *
 *  Pre-condition: Login as Salesperson (Thomas); create a NEW deal-registration Opportunity in
 *                 CRM > Pipeline FOR THIS CASE ONLY, uniquely named "TEST TC.-C.1.4 <date time>",
 *                 Assigned Partner = Reseller, fresh unique Email.
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
 *   1. Open CRM module and go to Pipeline
 *   2. Open the Opportunity created above (TEST TC.-C.1.4 <current date time>)
 *   3. In the chatter, click "Send message"
 *   4. Observe the recipients shown under the message body, then type "TEST MESSAGE TC.-C.1.4 <current date time>" and click "Send"
 *
 *  Verification (Expected Result on step 4):
 *   4. The message is sent "To: Followers" of the Opportunity, and the auto-listed suggested recipient
 *      is the customer's email contact (the partner created from the Opportunity's Email), shown with
 *      the reason "Customer Email". The Reseller is NOT auto-listed as a named recipient; the Reseller
 *      receives the message only as a follower of the Opportunity.
 * =============================================================================================
 */

const SKIP_CLEANUP_OPP = false;

test.describe('TC.-C.1.4 - Customer-visible message lists the customer email contact as the suggested recipient', () => {
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

  test("TC.-C.1.4: Customer-visible message lists the customer's email contact as the suggested recipient", async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    const { companyEmail, leadName, currentDateTime, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-C.1.4 ${compactDateTime}`;
    const messageText = `TEST MESSAGE TC.-C.1.4 ${currentDateTime}`;
    const resellerName = DEAL_REGISTRATION.partnerCompanyName; // the Assigned Partner (Reseller)
    let recipientsText = '';

    await test.step('Pre-condition: Prepare Internal Note #1 and the unique Opportunity name', async () => {
      console.log(`Pre-condition: Opp Name = ${oppName} | customer Email = ${companyEmail} | Reseller = ${resellerName}`);
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

    await test.step('Step 4: Observe the recipients shown under the message body, then type the message and click "Send"', async () => {
      recipientsText = await opportunityPage.getComposerRecipientsText();
      console.log(`Step 4: composer recipients = "${recipientsText}"`);
      await opportunityPage.fillComposerAndSend(messageText);
      console.log('✓ Message sent');
    });

    await test.step('Verification: suggested recipient is the customer email contact (reason Customer Email); the Reseller is not a named recipient', async () => {
      const lc = recipientsText.toLowerCase();
      const customerListed = lc.includes(companyEmail.toLowerCase());
      const toFollowers = lc.includes('followers');
      const resellerListed = lc.includes(resellerName.toLowerCase());
      console.log(`  - To: Followers shown: ${toFollowers} | customer email listed as recipient: ${customerListed} | Reseller listed as a named recipient: ${resellerListed}`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-C.1.4 - Send-message recipients (customer email contact)');

      expect(customerListed, `The customer's email contact ("${companyEmail}") should be the auto-listed suggested recipient`).toBeTruthy();
      expect(resellerListed, `The Reseller ("${resellerName}") should NOT be auto-listed as a named recipient`).toBeFalsy();
      console.log('✅ Verified: the suggested recipient is the customer email contact; the Reseller is not a named recipient');
    });
  });
});
