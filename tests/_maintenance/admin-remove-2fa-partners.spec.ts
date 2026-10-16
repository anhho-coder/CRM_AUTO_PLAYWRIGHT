import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ADMIN MAINTENANCE ACTION - not a test case.
 *
 * Turns OFF "2FA Status" (res.users.is_2fa_enable) for the 6 partner portal accounts on
 * PRE-PRODUCTION, through Settings > Users & Companies > Users, signed in as anh.ho@nakivo.com.
 *
 * Requested by the tester on 2026-10-14. The same six were cleared on 2026-10-13 and 2FA was back
 * by 20:30 that evening (the QR image on user 18152 carries unique=10132026203044), so this is
 * expected to recur.
 *
 * Per user: open the form by id -> open the "Two Factor Authentication" tab -> EDIT -> untick
 * "2FA Status" -> SAVE -> read the field back to confirm it stuck.
 */

const PARTNERS = [
  { id: 18149, login: 'Test-Reseller@Reseller-company-automation-basic.com' },
  { id: 18150, login: 'Test-Reseller-Automation-Jun10@Reseller-company2026-05-22-220038.com' },
  { id: 18151, login: 'Test-Reseller@Reseller-company-automation-silver.com' },
  { id: 18152, login: 'Test-Reseller@Reseller-company-automation-gold.com' },
  { id: 18153, login: 'Test-Distributor@Distributor-company.com' },
  { id: 18154, login: 'Test-MSP@MSP-company.com' },
];

/** Settings > Users & Companies > Users (base.action_res_users), read on pre-production. */
const USERS_ACTION_ID = 68;
const TAB_LABEL = 'Two Factor Authentication';

/**
 * This file WRITES to six shared accounts, so it must never run as part of an ordinary suite
 * execution - and `playwright.config.ts` collects the whole `tests` tree, with no testIgnore.
 * It therefore only runs when asked for explicitly:
 *
 *   RUN_2FA_FIX=1 npx playwright test tests/_maintenance/admin-remove-2fa-partners.spec.ts --project=chromium-headless
 */
const ENABLED = process.env.RUN_2FA_FIX === '1';
const maintenanceTest = ENABLED ? test : test.skip;

maintenanceTest('ADMIN: remove 2FA from the 6 partner portal accounts', async ({ page }) => {
  test.setTimeout(config.timeouts.test);
  await page.setViewportSize({ width: 1920, height: 1080 });

  const loginPage = new LoginPage(page);
  await loginPage.navigateTo(baseUrl);
  await loginPage.login(users.admin_crm.username, users.admin_crm.password);
  await loginPage.dismissLocationPermissionDialog();
  console.log(`Signed in as ${users.admin_crm.username}`);

  /** Read is_2fa_enable straight from the record, so the result is not a UI impression. */
  const readFlag = async (id: number): Promise<boolean | string> =>
    page.evaluate(async (userId: number) => {
      const res = await fetch('/web/dataset/call_kw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'res.users',
            method: 'read',
            args: [[userId], ['is_2fa_enable']],
            kwargs: {},
          },
        }),
      });
      const j = await res.json();
      if (j.error) return `RPC error: ${j.error.data?.message || j.error.message}`;
      return j.result[0].is_2fa_enable;
    }, id);

  const results: { id: number; login: string; before: any; after: any; action: string }[] = [];

  for (const p of PARTNERS) {
    console.log(`\n=============== ${p.id} - ${p.login} ===============`);
    const before = await readFlag(p.id);
    console.log(`  2FA Status before : ${before}`);

    if (before === false) {
      console.log('  -> already off, nothing to change.');
      results.push({ ...p, before, after: before, action: 'already off' });
      continue;
    }

    await page.goto(
      `${baseUrl}web#id=${p.id}&action=${USERS_ACTION_ID}&model=res.users&view_type=form`,
      { waitUntil: 'domcontentloaded', timeout: CommonUtils.waitTimes.pageLoad }
    );
    await CommonUtils.waitForSpinnersToHide(
      page,
      CommonUtils.waitTimes.extraLong,
      CommonUtils.waitTimes.pageLoad
    ).catch(() => {});
    await page.waitForTimeout(CommonUtils.waitTimes.long);

    const breadcrumb = await page
      .locator('.breadcrumb')
      .first()
      .innerText({ timeout: CommonUtils.waitTimes.abnormalWait })
      .catch(() => '');
    console.log(`  Opened            : ${breadcrumb.replace(/\s+/g, ' ').trim()}`);

    // open the Two Factor Authentication tab
    const tab = page.locator('.o_notebook .nav-link', { hasText: TAB_LABEL }).first();
    await tab.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await tab.click();
    await page.waitForTimeout(CommonUtils.waitTimes.medium);
    console.log(`  Tab opened        : ${TAB_LABEL}`);

    // EDIT
    const editBtn = page.locator('.o_form_button_edit').first();
    if (await editBtn.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false)) {
      await editBtn.click();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('  EDIT clicked');
    }

    // untick "2FA Status" - the Bootstrap custom checkbox is driven through its label
    const wrapper = page.locator('div[name="is_2fa_enable"]').first();
    const input = wrapper.locator('input[type="checkbox"]');
    await input.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });
    console.log(`  Checkbox checked  : ${await input.isChecked()}`);

    // the field sits low on a long form, so bring it into view first
    await wrapper.scrollIntoViewIfNeeded({ timeout: CommonUtils.waitTimes.abnormalWait });
    await page.waitForTimeout(CommonUtils.waitTimes.short);

    // Bootstrap renders this as a custom-checkbox: the real <input> is visually hidden behind the
    // label's pseudo-element, so a Playwright click on either lands on nothing. A native
    // HTMLInputElement.click() fires the real click + change the Odoo widget listens for.
    if (await input.isChecked()) {
      await page.evaluate(() => {
        const el = document
          .querySelector('div[name="is_2fa_enable"]')
          ?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
        el?.click();
      });
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
    }
    console.log(`  Checkbox now      : ${await input.isChecked()}`);

    // SAVE
    const saveBtn = page.locator('.o_form_button_save').first();
    await saveBtn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await saveBtn.click();
    await CommonUtils.waitForSpinnersToHide(
      page,
      CommonUtils.waitTimes.extraLong,
      CommonUtils.waitTimes.savingPage
    ).catch(() => {});
    await page.waitForTimeout(CommonUtils.waitTimes.long);
    console.log('  SAVE clicked');

    const after = await readFlag(p.id);
    console.log(`  2FA Status after  : ${after}`);
    results.push({ ...p, before, after, action: 'edited in Settings' });
  }

  console.log('\n==================== RESULT ====================');
  results.forEach((r) =>
    console.log(
      `  [${r.id}] ${r.login.slice(0, 56).padEnd(58)} ${String(r.before)} -> ${String(r.after)}   (${r.action})`
    )
  );
  const stillOn = results.filter((r) => r.after !== false);
  console.log(`\n  Still ON after the run : ${stillOn.length}`);
  stillOn.forEach((r) => console.log(`     [${r.id}] ${r.login}`));
  console.log('===============================================');

  for (const r of results) {
    expect(r.after, `2FA should be off for ${r.login} (id ${r.id})`).toBe(false);
  }
});
