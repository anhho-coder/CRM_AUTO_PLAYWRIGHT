import { test, Page, Locator } from '@playwright/test';
import * as fs from 'fs';
import { users, baseUrl, baseUrl_support_mig } from '@config/users.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { SupportDeskPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * EXPLORE (kept per the never-delete-explore rule) - 2026-11-05, READ ONLY on both systems.
 * Evidence shots for CRM-14429 (follow-up of helpdesk-ui010-20261105-ticket-field-links-ab): the 5 fields pre-production
 * draws as hyperlinks on ticket 374551 - Assigned to, Customer, Product line, Area, Sub area - outlined on the A form, and
 * the same 5 rows (Assignee, Customer, Product Line, Classification Area, Sub Area) outlined on support-crm-mig ticket 2574.
 */
const OUT = process.env.EXPLORE_OUT || 'test-results/_explore-ui010-field-links';
fs.mkdirSync(OUT, { recursive: true });
const A_FIELDS = ['user_id', 'partner_id', 'product_line_id', 'classification_area_id', 'classification_sub_area_id'];
const B_ROWS = ['Assignee', 'Customer', 'Product Line', 'Classification Area', 'Sub Area'];
async function outline(l: Locator) { await l.evaluate((el) => { (el as HTMLElement).style.outline = '3px solid #e00'; (el as HTMLElement).style.outlineOffset = '2px'; }).catch(() => {}); }
async function shot(page: Page, name: string) { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }).catch(() => {}); }

test('EXPLORE-UI-010 A/B: outline the 5 baseline link fields on both ticket pages (Nam, read only)', async ({ page, browser }) => {
  test.setTimeout(10 * 60_000);
  const lp = new LoginPage(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await lp.navigateTo(baseUrl);
  await lp.login(users.support_l2_manager_nam.username, users.support_l2_manager_nam.password, CommonUtils.waitTimes.pageLoad);
  await lp.dismissLocationPermissionDialog();
  await new HelpdeskPage(page).openTicketById(baseUrl, 374551);
  await page.locator('.o_form_view .o_field_widget[name="partner_id"]').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(CommonUtils.waitTimes.long);
  for (const f of A_FIELDS) await outline(page.locator(`.o_form_view .o_form_sheet .o_field_widget[name="${f}"]`).first());
  await shot(page, 'c-a-links-top');
  await page.locator('.o_form_view .o_field_widget[name="classification_sub_area_id"]').first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(CommonUtils.waitTimes.standard);
  await shot(page, 'c-a-links-classification');

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 } });
  const bp = await ctx.newPage();
  const desk = new SupportDeskPageMig(bp);
  await desk.login(baseUrl_support_mig, users.support_l2_nam_support_mig.username, users.support_l2_nam_support_mig.password);
  await desk.openTicketByLink(baseUrl_support_mig, '2574');
  await desk.waitForSidePanelRowValue('Customer', 'license@nakivo.com (#547004)');
  for (const r of B_ROWS) {
    const cap = bp.locator('span[data-grace-area-trigger]').filter({ hasText: new RegExp(`^\\s*${r}\\s*$`) }).first();
    await outline(cap.locator('xpath=../..'));
  }
  await shot(bp, 'c-b-plain-top');
  await bp.locator('span[data-grace-area-trigger]').filter({ hasText: /^\s*Sub Area\s*$/ }).first().scrollIntoViewIfNeeded().catch(() => {});
  await bp.waitForTimeout(CommonUtils.waitTimes.standard);
  await shot(bp, 'c-b-plain-classification');
  await ctx.close();
});
