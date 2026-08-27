import { test } from '@playwright/test';
import { config } from '@config/test.config';
import { DealElementPage, OpportunityPage, QuotationPage } from '@pages';
import { LoginPageMig } from '@pages/mig';
import { users, baseUrl_mig } from '@config/users.config';
import { CommonUtils } from '@helpers/common.utils';

/**
 * PROBE (throwaway, not a test case): what does "NEW QUOTATION" do when pressed on an existing
 * Deal Element on crm-mig? Opens the Deal Element the tester pointed at (sale.order id 194673 =
 * DE020087 of opportunity 2049733) and records every observable signal around the click.
 *
 * Command to run:
 *   npx playwright test tests/_explore/probe-new-quotation-from-deal-element.spec.ts --project=chromium-headless
 */
test.describe('PROBE - NEW QUOTATION from the Deal Element screen', () => {

  test('PROBE_NQ: observe what NEW QUOTATION does on DE020087 (id 194673, total 100)', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);

    const DEAL_ELEMENT_URL = `${baseUrl_mig}web?#id=194673&model=sale.order&view_type=form&menu_id=125`;

    await test.step('Login as Admin on crm-mig', async () => {
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in');
    });

    await test.step('Open the Deal Element the tester pointed at', async () => {
      await dealElementPage.goto(DEAL_ELEMENT_URL);
      await dealElementPage.waitForFormOpen();
      console.log(`  URL now       : ${page.url()}`);
      console.log(`  Record id     : ${dealElementPage.getRecordIdFromUrl() || '(none)'}`);
      console.log(`  Payment Term  : "${((await dealElementPage.getPaymentTermValue()) ?? '').trim()}"`);
      console.log(`  Order lines   : ${await dealElementPage.getOrderLineCount()}`);
      console.log(`  Amount total  : ${await dealElementPage.getAmountTotal().catch(() => 'n/a')}`);
    });

    await test.step('Press NEW QUOTATION and record every signal', async () => {
      const hasButton = await opportunityPage.hasNewQuotationButton();
      console.log(`  NEW QUOTATION button present : ${hasButton}`);
      if (!hasButton) {
        console.log('  PROBE RESULT: the button is not on this screen at all');
        return;
      }

      const idBefore = dealElementPage.getRecordIdFromUrl();
      const chatterBefore = (await dealElementPage.getChatterText().catch(() => '')).replace(/\s+/g, ' ').trim();
      console.log(`  id before     : ${idBefore}`);
      console.log(`  chatter before: "${chatterBefore.substring(0, 160)}"`);

      const started = Date.now();
      await opportunityPage.clickNewQuotation();
      console.log('  clicked NEW QUOTATION');

      const idAfter = await dealElementPage.waitForRecordIdChange(idBefore, CommonUtils.waitTimes.savingPage);
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      const errorText = await dealElementPage.getBlockingPopupText().catch(() => '');
      const chatterAfter = (await dealElementPage.getChatterText().catch(() => '')).replace(/\s+/g, ' ').trim();
      const status = await quotationPage.getQuotationStatus().catch(() => '');

      console.log(`  elapsed       : ${elapsed}s`);
      console.log(`  id after      : ${idAfter || '(unchanged)'}`);
      console.log(`  URL after     : ${page.url()}`);
      console.log(`  blocking popup: "${(errorText || '').replace(/\s+/g, ' ').trim().substring(0, 200)}"`);
      console.log(`  status shown  : "${status}"`);
      console.log(`  chatter after : "${chatterAfter.substring(0, 300)}"`);
      console.log(`  PROBE RESULT  : ${idAfter ? 'form switched to record ' + idAfter : 'form did NOT switch record'}`);
    });

    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'PROBE - after NEW QUOTATION on DE020087');
    await page.screenshot({ path: 'D:/Automation_CRM/probe-new-quotation-from-deal-element-2x.png', fullPage: false });
    console.log('  screenshot saved: D:/Automation_CRM/probe-new-quotation-from-deal-element-2x.png');
  });
});
