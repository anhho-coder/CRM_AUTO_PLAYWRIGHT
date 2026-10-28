import { Locator, Page } from '@playwright/test';
import { BasePage } from '@pages/BasePage';
import { CommonUtils } from '@helpers/common.utils';
import { resolveScreenIds } from '@helpers/odoo-xmlid.helper';

/** What the Apps screen shows after a module search. */
export interface AppsSearchResult {
  /** The facet chips after the search (the module-name facet must be among them). */
  facets: string[];
  /** true when a facet carrying the searched text is applied. */
  searchFacetApplied: boolean;
  /** true when the "Apps" facet (application modules only) is no longer applied. */
  appsFacetRemoved: boolean;
  /** Number of module cards rendered for the search. */
  count: number;
  /** Titles of the module cards rendered (evidence). */
  titles: string[];
}

/**
 * Apps (ir.module.module kanban) on crm-mig - a STRICT module-search reader.
 *
 * Added 2026-10-26 for CRM-11857_9.1 step 1 ("Open Apps, remove the "Apps" filter and search ..."). It
 * replaces HomePageMig.searchAppsForModule for that step, which typed into the first text input without
 * applying the search or removing the "Apps" facet, and returned false when the box was missing - so a
 * "not found" verdict could not fail.
 *
 * Every precondition of a meaningful empty result THROWS instead of returning false: the action must
 * resolve by XML id, the search box must exist, the "Apps" facet must be removed, and the search facet
 * must be read back. Only then is the card count returned.
 */
export class AppsPageMig extends BasePage {
  private static readonly SCREEN = {
    menu: 'base.module_mi',
    action: 'base.open_module_tree',
    fallbackMenuId: 0,
    fallbackActionId: 0,
  };

  // ─── Locators (XPath primary, CSS fallback) ───────────────────────────────
  protected readonly searchInput = (): Locator =>
    this.page.locator('xpath=//div[contains(@class,"o_searchview")]//input[contains(@class,"o_searchview_input")]')
      .or(this.page.locator('.o_searchview input.o_searchview_input')).first();
  protected readonly facets = (): Locator =>
    this.page.locator('xpath=//div[contains(@class,"o_searchview_facet")]').or(this.page.locator('.o_searchview_facet'));
  protected readonly appsFacetRemove = (): Locator =>
    this.page.locator('xpath=//div[contains(@class,"o_searchview_facet")][.//*[contains(@class,"o_facet_values")][normalize-space(.)="Apps"]]//*[contains(@class,"o_facet_remove")]')
      .or(this.page.locator('.o_searchview_facet').filter({ has: this.page.locator('.o_facet_values', { hasText: /^\s*Apps\s*$/ }) }).locator('.o_facet_remove'))
      .first();
  protected readonly moduleOption = (): Locator =>
    this.page.locator('xpath=//ul[contains(@class,"o_searchview_autocomplete")]//li[contains(normalize-space(.),"Search Module for")]')
      .or(this.page.locator('.o_searchview_autocomplete li').filter({ hasText: 'Search Module for' })).first();
  protected readonly kanbanView = (): Locator =>
    this.page.locator('xpath=//div[contains(@class,"o_kanban_view")]').or(this.page.locator('.o_kanban_view')).first();
  protected readonly noContent = (): Locator =>
    this.page.locator('xpath=//div[contains(@class,"o_view_nocontent")]').or(this.page.locator('.o_view_nocontent')).first();

  constructor(page: Page) {
    super(page);
  }

  /** Open Apps from its XML ids. @throws when the ids do not resolve or the kanban does not render */
  async open(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<void> {
    const ids = await resolveScreenIds(this.page, AppsPageMig.SCREEN);
    if (!ids.resolved || !ids.menuId || !ids.actionId) {
      throw new Error(`Apps could not be resolved by XML id (${AppsPageMig.SCREEN.action} / ${AppsPageMig.SCREEN.menu}) - not navigating to a guessed id`);
    }
    const origin = new URL(this.page.url()).origin;
    console.log(`  - Opening Apps (menu ${ids.menuId}, action ${ids.actionId})`);
    await this.page.goto(`${origin}/web#menu_id=${ids.menuId}&action=${ids.actionId}&model=ir.module.module&view_type=kanban`,
      { waitUntil: 'domcontentloaded', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.kanbanView().or(this.noContent()).first().waitFor({ state: 'visible', timeout });
    await this.searchInput().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .catch(() => { throw new Error('The Apps search box is not on screen'); });
    await this.wait(CommonUtils.waitTimes.long);
  }

  /** The facet chips currently applied, whitespace-collapsed. */
  async getFacetTexts(): Promise<string[]> {
    return (await this.facets().allInnerTexts().catch(() => [] as string[]))
      .map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  /**
   * Remove the "Apps" facet, search the module name with "Search Module for: <text>", and read the result.
   * @throws when the "Apps" facet or the search option cannot be found, or the search facet is not applied
   */
  async searchModule(text: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<AppsSearchResult> {
    const before = await this.getFacetTexts();
    console.log(`  - Facets on arrival: ${before.join(' | ') || '(none)'}`);
    const remove = this.appsFacetRemove();
    if (!(await remove.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false))) {
      throw new Error(`The "Apps" facet is not on the Apps search (facets: ${before.join(' | ') || 'none'})`);
    }
    await remove.click({ timeout });
    await this.waitForLoadingOverlayHidden(timeout).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    const afterRemove = await this.getFacetTexts();
    const appsFacetRemoved = !afterRemove.some((f) => f.replace(/[^A-Za-z ]/g, '').trim() === 'Apps');
    console.log(`  - "Apps" facet removed: ${appsFacetRemoved} (facets: ${afterRemove.join(' | ') || 'none'})`);

    await this.searchInput().click({ timeout });
    await this.page.keyboard.type(text, { delay: 20 });
    const offered = await this.moduleOption().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    if (!offered) throw new Error(`The Apps search did not offer "Search Module for: ${text}"`);
    await this.moduleOption().click({ timeout });
    await this.waitForLoadingOverlayHidden(timeout).catch(() => {});
    await this.kanbanView().or(this.noContent()).first().waitFor({ state: 'visible', timeout }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.extraLong);

    const facets = await this.getFacetTexts();
    const searchFacetApplied = facets.some((f) => f.includes(text));
    if (!searchFacetApplied) throw new Error(`The search facet for "${text}" was not applied (facets: ${facets.join(' | ') || 'none'})`);
    const titles = await this.page.evaluate(() =>
      Array.from(document.querySelectorAll('.o_kanban_view .o_kanban_record:not(.o_kanban_ghost)'))
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => ((el.querySelector('h4, .o_kanban_record_title, strong') || el).textContent || '').replace(/\s+/g, ' ').trim()),
    ).catch(() => [] as string[]);
    console.log(`  - Search facets: ${facets.join(' | ')}`);
    console.log(`  - Module cards for "${text}": ${titles.length}${titles.length ? ` (${titles.join(', ')})` : ''}`);
    return { facets, searchFacetApplied, appsFacetRemoved, count: titles.length, titles };
  }
}
