import { test, Page } from '@playwright/test';
import * as fs from 'fs';
import { users, baseUrl } from '@config/users.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * EXPLORE (kept per the never-delete-explore rule) - 2026-11-05, pre-production, READ ONLY.
 * TC-UI-010_A baseline for the Customer-link bug of TC-UI-010_B: on the ticket form of pre-production ticket 374551 (the
 * ticket UI-010_B picked on 2026-11-05) - is Customer a hyperlink, where does it point, and does its click open the
 * Contact form. Shots: the ticket form with Customer outlined; the Contact form the click lands on.
 */
const OUT = process.env.EXPLORE_OUT || 'test-results/_explore-ui010a-customer-link';
fs.mkdirSync(OUT, { recursive: true });
const TICKET = 374551;
async function shot(page: Page, name: string) { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }).catch(() => {}); }

test('EXPLORE-UI-010_A: the ticket Customer is a link that opens its Contact (Nam, read only)', async ({ page }) => {
  test.setTimeout(8 * 60_000);
  const lp = new LoginPage(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await lp.navigateTo(baseUrl);
  await lp.login(users.support_l2_manager_nam.username, users.support_l2_manager_nam.password, CommonUtils.waitTimes.pageLoad);
  await lp.dismissLocationPermissionDialog();
  await new HelpdeskPage(page).openTicketById(baseUrl, TICKET);
  await page.locator('.o_form_view').first().waitFor({ timeout: 60_000 });
  const field = page.locator('.o_form_view .o_field_widget[name="partner_id"]').first();
  await field.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(CommonUtils.waitTimes.long);
  const info = await field.evaluate((el) => {
    const a = (el.tagName === 'A' ? el : el.querySelector('a')) as HTMLAnchorElement | null;
    return { tag: el.tagName, cls: el.className, text: (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim(), link: a ? { href: a.getAttribute('href'), cls: a.className } : null };
  });
  console.log(`TICKET ${TICKET} url ${page.url()}`);
  console.log('CUSTOMER FIELD', JSON.stringify(info));
  await field.evaluate((el) => { (el as HTMLElement).style.outline = '3px solid #e00'; (el as HTMLElement).style.outlineOffset = '2px'; });
  await shot(page, 'a-ticket-form-customer-link');
  const link = page.locator('.o_form_view a.o_form_uri[name="partner_id"], .o_form_view .o_field_widget[name="partner_id"] a, .o_form_view a.o_field_widget[name="partner_id"]').first();
  if (!(await link.count())) { console.log('NO LINK on Customer'); return; }
  await link.click();
  await page.waitForURL(/model=res\.partner/, { timeout: 60_000 }).catch(() => {});
  await page.locator('.o_form_view').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(CommonUtils.waitTimes.long);
  const name = await page.locator('.o_form_view .oe_title h1, .o_form_view .o_field_widget[name="name"]').first().innerText().catch(() => '');
  const crumbs = await page.locator('.breadcrumb li, .o_control_panel .breadcrumb-item').allInnerTexts().catch(() => [] as string[]);
  console.log(`LANDED ${page.url()}`);
  console.log(`CONTACT FORM name "${name.replace(/\s+/g, ' ').trim()}" breadcrumbs ${JSON.stringify(crumbs)}`);
  await shot(page, 'b-contact-form-after-click');
});
