import { Page } from '@playwright/test';
import { CommonUtils } from '@helpers/common.utils';

/**
 * crm-mig form notebooks fold their overflow tabs into a "More (N)" dropdown (NAKIVO header script, measured
 * 2026-10-30 on a new Lead form: 7 tabs inline, 10 folded - "CRM Developer" among them). The folded tabs stay in
 * the DOM as `li[data-nkv-folded] > a.nav-link` (hidden), and the dropdown repeats them as `a.dropdown-item`.
 * A plain click on the hidden tab anchor times out - which is why the pre-production LeadPage.clickCRMDeveloperTab()
 * could not open "CRM Developer" on crm-mig (CRM-12370_9.1.1).
 *
 * Shared by LeadPageMig and OpportunityPageMig.
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
 * Every notebook tab caption in screen order, folded tabs included and "More (N)" itself left out. The pre-production
 * getNotebookTabs() keeps only drawn anchors, so on crm-mig it returned the 7 inline tabs + "More (10)"
 * (CRM-12370_3.4.3, 2026-11-03). Tabs Odoo hides (`o_invisible_modifier`) stay out, as on pre-production.
 */
export async function readNotebookTabsMig(page: Page): Promise<string[]> {
  const header = tabsHeader(page).first();
  await header.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
  return await header
    .evaluate((ul: HTMLElement) =>
      Array.from(ul.children)
        .filter((li) => li.tagName === 'LI' && !li.classList.contains('o_invisible_modifier'))
        .map((li) => ({ li, a: li.querySelector(':scope > a.nav-link:not(.dropdown-toggle)') as HTMLElement | null }))
        .filter(({ li, a }) => !!a && (li.hasAttribute('data-nkv-folded') || !!(a.offsetParent || a.getClientRects().length)))
        .map(({ a }) => (a!.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((t) => t.length > 0)
    )
    .catch(() => [] as string[]);
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
    let opened = false;
    for (let attempt = 1; attempt <= 2 && !opened; attempt++) {
      await more.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      opened = await items.first()
        .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.migNotebookMoreOpen }).then(() => true, () => false);
      if (opened) break;
      // CRM-12370_9.4.2 (2026-10-30) and 9.3.3 (LM-b1, 2026-11-02, twice in a row): on a new Lead in edit mode the More
      // click raised Odoo's "The record has been modified, your changes will be discarded" warning instead of opening
      // the dropdown (cause not established; not reproduced on 2026-11-03, 3 of 3 clicks opened it).
      // Cancel keeps the unsaved input.
      const warning = discardWarning(page);
      if (await warning.isVisible().catch(() => false)) {
        console.log(`  - Notebook    : More raised the "record has been modified" warning - Cancel (keep the input)`);
        await warning.locator('xpath=.//button[normalize-space()="Cancel"]').or(warning.locator('button', { hasText: /^\s*Cancel\s*$/ }))
          .first().click({ timeout: CommonUtils.waitTimes.abnormalWait });
      }
      if (attempt < 2) await page.waitForTimeout(CommonUtils.waitTimes.long);
    }
    if (opened) {
      const n = await items.count();
      await (pick === 'last' ? items.nth(n - 1) : items.first()).click({ timeout: CommonUtils.waitTimes.abnormalWait });
      console.log(`  - Notebook    : "${caption}" opened via More (${pick})`);
    } else {
      // More did not open twice: the folded anchor is still a Bootstrap tab (data-toggle="tab", href="#notebook_page_N"),
      // so a click event on it shows the page without the dropdown and without touching the URL hash (measured
      // 2026-11-03 on a new Lead: tab active, page shown, no hashchange, no warning).
      await target.dispatchEvent('click');
      console.log(`  - Notebook    : More did not open twice - "${caption}" (${pick}) shown by a click on its folded tab`);
    }
  }
  await page.waitForTimeout(CommonUtils.waitTimes.standard);
  const active = await target.evaluate((el) => el.classList.contains('active')).catch(() => false);
  if (!active) throw new Error(`crm-mig notebook: "${caption}" (${pick}) did not become the active tab`);
}
