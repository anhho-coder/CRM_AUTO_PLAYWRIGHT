import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users } from '@config/users.config';
import { QuotationPage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  addDealElementOnO12CE,
  pressNewQuotationOnO12CE,
  O12ceOpportunity,
  O12ceQuotationResult,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - the Quotation Payer is proposed as a recipient in the "Send by Email" composer
 * Test Case ID: CRM-12325_2.5.6
 * Automation-Type: new
 * Automation-Date: 2026-08-26
 *
 * Summary:
 *   Verify that on the O12 CE Migration server the "Send by Email" composer of a Quotation opens with
 *   the Quotation's Payer already proposed in the "Recipients" row, so the customer receives the
 *   Quotation without the user typing a contact.
 *
 * Verifies bug: CRM-12415 - "crm-mig - Quotation Payer is not auto-filled into Recipients in the Send
 * by Email composer" (raised from CRM-12325_2.5.3; root cause per CRM-12413 = a mail add-on enabled
 * only on the Migration server replaced the recipient list; the add-on is now disabled on crm-mig to
 * match Production). This TC is the REGRESSION GUARD for that fix: CRM-12325_2.5.3 only presses SEND
 * and asserts the "Quotation Sent" state, which stays green even with an EMPTY recipient list - so the
 * defect could not be caught by 2.5.3 and needs its own case.
 *
 * O12 CE notes (grounded on crm-mig, 2026-08-26 via the Odoo RPC):
 *   - Login as the sales IC Thomas Semerich (`users.sale_ic_thomas_crm_mig`) - the same actor as
 *     CRM-12325_2.5.3, the TC this case guards; CRM > Pipeline opened in list view by URL hash.
 *   - The composer is the standard `mail.compose.message` form (view "mail.compose.message.form"):
 *     label "Recipients" + span "Followers of the document and" +
 *     `<field name="partner_ids" widget="many2many_tags_email" placeholder="Add contacts to notify..."/>`,
 *     i.e. every proposed recipient is one tag inside `div[name="partner_ids"]` - an empty row is
 *     exactly the CRM-12415 failure signature.
 *   - The Payer created by the shared chain (company<timestamp>.com) HAS an email, so the composer
 *     does not raise Odoo's "complete customer's information" sub-dialog.
 *   - This TC does NOT send the email (sending is covered by CRM-12325_2.5.3): after reading the
 *     Recipients row it closes the composer with "Cancel", so no mail leaves the Migration server.
 *   - Like CRM-12325_2.5.3 it needs the created Quotation OPEN on screen, so it asserts that
 *     "NEW QUOTATION" navigated to the new Quotation form.
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the sales IC account Thomas Semerich can log in
 *   (CRM-12325_1.1.1).
 *
 * Steps (1-11 = the shared Opportunity + Deal Element chain):
 *   1-7.  Login, open the Opportunities list, CREATE + fill + SAVE the Opportunity, wait for Contact.
 *   8-11. Press "DEAL ELEMENT", select Pricelist + Payment Term, add a product, press "SAVE".
 *  12. Press "NEW QUOTATION" button and wait.
 *
 * Steps run:
 *   1. On the created Quotation form, read the "Payer" value.
 *   2. Press "SEND BY EMAIL" button and wait until the email form window appears completely.
 *   3. Look at the "Recipients" row of the email composer and read the proposed recipients.
 *   4. Close the composer with "Cancel" (nothing is sent).
 *
 * Verification Points:
 *   1. The "Recipients" row of the composer is NOT empty - at least one recipient is proposed.
 *   2. The Quotation's Payer is one of the proposed recipients.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.5\.6:" --project=chromium
 */

const SKIP_CLEANUP_OPP = true; // true = skip teardown-delete (O12 CE convention: keep created records)

test.describe('CRM-12325_2.5.6 - O12 CE smoke: Quotation Payer is proposed as email recipient', () => {

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
      const homePage = new HomePageMig(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    console.log(`Teardown: SKIP_CLEANUP_OPP=${SKIP_CLEANUP_OPP} - the created records are kept on O12 CE`);
  });

  test('CRM-12325_2.5.6: Verify the Quotation Payer is auto-filled as a recipient in the "Send by Email" composer on the O12 CE Migration server', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);

    const TC_ID = 'CRM-12325_2.5.6';
    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let payerName = '';
    let recipients: string[] = [];
    let subject = '';
    let composerClosed = false;

    await loginToO12CE(page, users.sale_ic_thomas_crm_mig);
    await openOpportunitiesListOnO12CE(page);
    opp = await createOpportunityOnO12CE(page, TC_ID);
    await addDealElementOnO12CE(page);

    await test.step('Step 12: Press "NEW QUOTATION" button and wait', async () => {
      console.log('\n--- Step 12: Press NEW QUOTATION ---');
      quotation = await pressNewQuotationOnO12CE(page);
      expect(
        quotation.navigated,
        `the "NEW QUOTATION" action must open the created Quotation form so its email composer can be inspected (O12 CE created it in place instead - chatter: "${(quotation.chatterText || '').substring(0, 200)}")`
      ).toBeTruthy();
    });

    await test.step('Steps run - Step 1: On the created Quotation form, read the "Payer" value', async () => {
      console.log('\n--- Steps run - Step 1: Read the Quotation Payer ---');
      payerName = await quotationPage.getPayerName();
      expect(
        payerName,
        'the created Quotation must carry a Payer - without it there is no expected recipient to compare the composer against (setup problem, not the CRM-12415 defect)'
      ).not.toBe('');
      console.log(`  Payer on the Quotation: "${payerName}"`);
    });

    await test.step('Steps run - Step 2: Press "SEND BY EMAIL" button and wait for the email form window', async () => {
      console.log('\n--- Steps run - Step 2: Press SEND BY EMAIL ---');
      await quotationPage.clickSendByEmail(CommonUtils.waitTimes.abnormalWait);
      await quotationPage.waitForEmailDialog(CommonUtils.waitTimes.abnormalWait);
      console.log('  OK - the email composer is open');
    });

    await test.step('Steps run - Step 3: Look at the "Recipients" row of the email composer', async () => {
      console.log('\n--- Steps run - Step 3: Read the Recipients row ---');
      recipients = await quotationPage.getEmailRecipients(CommonUtils.waitTimes.abnormalWait);
      subject = await quotationPage.getEmailSubject();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Send by Email composer Recipients row`);
    });

    await test.step('Steps run - Step 4: Close the composer with "Cancel" (nothing is sent)', async () => {
      console.log('\n--- Steps run - Step 4: Cancel the composer ---');
      composerClosed = await quotationPage.cancelEmailDialog(CommonUtils.waitTimes.savingPage);
    });

    await test.step('Verification', async () => {
      const recipientsNotEmpty = recipients.length > 0;
      const normalizedPayer = payerName.toLowerCase();
      const payerMatch = recipients.find(r => r.toLowerCase().includes(normalizedPayer));
      const payerProposed = Boolean(payerMatch);
      const recipientList = recipients.length ? recipients.map(r => `"${r}"`).join(', ') : 'none';

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The composer "Recipients" row is NOT empty:');
      console.log('     Expected : at least 1 recipient proposed');
      console.log(`     Actual   : ${recipients.length} recipient(s) - ${recipients.length ? recipientList : 'EMPTY ("Add contacts to notify..." placeholder only)'}`);
      console.log(`     Result   : ${recipientsNotEmpty ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - The Quotation Payer is one of the proposed recipients:');
      console.log(`     Expected : a recipient containing "${payerName}"`);
      console.log(`     Actual   : ${payerProposed ? `matched by "${payerMatch}"` : 'the Payer is NOT among the proposed recipients'}`);
      console.log(`     Result   : ${payerProposed ? 'PASS' : 'FAIL'}`);
      console.log(`  Info - Opportunity      : id=${opp?.oppId}`);
      console.log(`  Info - Quotation        : sale.order id=${quotation?.quotationId || 'n/a'}`);
      console.log(`  Info - Composer Subject : "${subject}" (filled from the mail template - stays filled even when Recipients is empty, see CRM-12415)`);
      console.log(`  Info - Composer closed  : ${composerClosed} (Cancel - no email was sent)`);
      console.log('===============================================');
      console.log(`OVERALL: ${recipientsNotEmpty && payerProposed ? 'PASS' : 'FAIL'} - Quotation Payer auto-filled into the "Send by Email" Recipients row on the O12 CE Migration server (CRM-12415)`);

      expect(
        recipientsNotEmpty,
        'the "Send by Email" composer must propose at least one recipient on O12 CE - an empty "Recipients" row is the CRM-12415 defect (the customer would receive nothing unless the user types a contact)'
      ).toBeTruthy();
      expect(
        payerProposed,
        `the Quotation Payer "${payerName}" must be proposed as a recipient in the composer on O12 CE (recipients read back: ${recipientList}) - CRM-12415`
      ).toBeTruthy();
    });
  });
});
