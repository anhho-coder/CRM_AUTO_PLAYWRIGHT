import { Page } from '@playwright/test';
import { CommonUtils } from '@helpers/common.utils';

/**
 * crm-mig form notebooks fold their overflow tabs into a "More (N)" dropdown (NAKIVO header script, measured
 * 2026-10-30 on a new Lead form: 7 tabs inline, 10 folded - "CRM Developer" among them). The folded tabs stay in
 * the DOM as `li[data-nkv-folded] > a.nav-link` (hidden), and the dropdown repeats them as `a.dropdown-item`.
 * A plain click on the hidden tab anchor times out - which is why the pre-production LeadPage.clickCRMDeveloperTab()
 * could not open "CRM Developer" on crm-mig (CRM-12370_9.1.1).
 *
 * Shared by LeadPageMig, OpportunityPageMig and - as the fallback when the inline tab is folded away -
 * the pre-production OpportunityPage, which runs against both hosts.
 */

const tabsHeader = (page: Page) =>
  page.locator('xpath=//div[contains(@class,"o_form_view")]//div[contains(@class,"o_notebook")]/ul[contains(@class,"nav-tabs")]')
    .or(page.locator('.o_form_view .o_notebook > ul.nav-tabs'));

/** Odoo's "The record has been modified, your changes will be discarded. Do you want to proceed?" warning. */
const discardWarning = (page: Page) =>
  page.locator('xpath=//div[contains(@class,"modal") and contains(@class,"show")][.//*[contains(normalize-space(),"has been modified")]]')
    .or(page.locator('.modal.show', { hasText: 'has been modified' })).first();

function exact(caption: string): RegExp {
  return new RegExp(`^\\s*${caption.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

/**
 * Open the notebook tab `caption` - inline when it is drawn, otherwise through "More (N)". Where the form carries the
 * caption twice (Lead form: two "CRM Developer" pages) `pick` chooses the first or the last, like the pre-production
 * page objects do. Throws when the tab could not be opened, naming the caption.
 */
export async function openNotebookTabMig(page: Page, caption: string, pick: 'first' | 'last' = 'first'): Promise<void> {
  const header = tabsHeader(page).first();
  await header.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
  const anchors = header.locator('xpath=./li/a[contains(@class,"nav-link") and not(contains(@class,"dropdown-toggle"))]')
    .filter({ hasText: exact(caption) });
  const count = await anchors.count();
  if (count === 0) throw new Error(`crm-mig notebook: no tab named "${caption}" on this form`);
  const target = pick === 'last' ? anchors.nth(count - 1) : anchors.first();

  if (await target.isVisible().catch(() => false)) {
    await target.click({ timeout: CommonUtils.waitTimes.abnormalWait });
  } else {
    // folded: open "More (N)" and pick the same occurrence in its dropdown
    const more = header.locator('xpath=.//a[contains(@class,"dropdown-toggle")]')
      .or(header.locator('a.dropdown-toggle')).first();
    const items = page.locator('xpath=//div[contains(@class,"dropdown-menu") and contains(@class,"show")]/a[contains(@class,"dropdown-item")]')
      .or(page.locator('.dropdown-menu.show > a.dropdown-item'))
      .filter({ hasText: exact(caption) });
    for (let attempt = 1; ; attempt++) {
      await more.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      const opened = await items.first()
        .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.migNotebookMoreOpen }).then(() => true, () => false);
      if (opened) break;
      // CRM-12370_9.4.2 (2026-10-30): on a new Lead in edit mode the More click raised Odoo's "The record has been
      // modified, your changes will be discarded" warning instead of opening the dropdown (cause not established).
      // Cancel keeps the unsaved input; then More is clicked once more.
      const warning = discardWarning(page);
      if (await warning.isVisible().catch(() => false)) {
        console.log(`  - Notebook    : More raised the "record has been modified" warning - Cancel (keep the input), retry`);
        await warning.locator('xpath=.//button[normalize-space()="Cancel"]').or(warning.locator('button', { hasText: /^\s*Cancel\s*$/ }))
          .first().click({ timeout: CommonUtils.waitTimes.abnormalWait });
      }
      if (attempt >= 2) throw new Error(`crm-mig notebook: More did not list "${caption}" after ${attempt} clicks`);
      await page.waitForTimeout(CommonUtils.waitTimes.long);
    }
    const n = await items.count();
    await (pick === 'last' ? items.nth(n - 1) : items.first()).click({ timeout: CommonUtils.waitTimes.abnormalWait });
    console.log(`  - Notebook    : "${caption}" opened via More (${pick})`);
  }
  await page.waitForTimeout(CommonUtils.waitTimes.standard);
  const active = await target.evaluate((el) => el.classList.contains('active')).catch(() => false);
  if (!active) throw new Error(`crm-mig notebook: "${caption}" (${pick}) did not become the active tab`);
}
