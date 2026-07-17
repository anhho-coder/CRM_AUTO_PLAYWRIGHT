import { test } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/** THROWAWAY - inspect reseller partner 627556: name, archived?, invoice smart-buttons. Delete after use. */
test('PROBE: partner 627556', async ({ page }) => {
  test.setTimeout(config.timeouts.test);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const loginPage = new LoginPage(page);
  await loginPage.navigateTo(baseUrl);
  await loginPage.login(users.admin_crm.username, users.admin_crm.password);
  await loginPage.dismissLocationPermissionDialog().catch(() => {});
  const origin = new URL(page.url()).origin;

  await page.goto(`${origin}/web?#id=627556&model=res.partner&view_type=form`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
  const info = await page.evaluate(() => {
    const nameInput = document.querySelector('input[name="name"]') as HTMLInputElement | null;
    const nameSpan = document.querySelector('span[name="name"], h1 input[name="name"]') as HTMLElement | null;
    const archivedBanner = document.body.innerText.match(/Archived/i) ? true : false;
    const statButtons = Array.from(document.querySelectorAll('.oe_stat_button, button.oe_stat_button, .o_stat_info'))
      .map((b) => (b as HTMLElement).innerText.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const breadcrumb = (document.querySelector('.breadcrumb-item.active') as HTMLElement | null)?.innerText?.replace(/\s+/g, ' ').trim() || '';
    return {
      nameInput: nameInput ? nameInput.value : '',
      nameSpan: nameSpan ? (nameSpan.innerText || '').trim() : '',
      archivedBanner,
      statButtons,
      breadcrumb,
    };
  });
  console.log('\n===== PARTNER 627556 =====');
  console.log(JSON.stringify(info, null, 2));
});
