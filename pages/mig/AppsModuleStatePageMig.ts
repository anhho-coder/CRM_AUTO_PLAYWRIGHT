import { Locator, Page } from '@playwright/test';
import { BasePage } from '@pages/BasePage';
import { CommonUtils } from '@helpers/common.utils';

/** One module card of the Apps kanban. */
export interface AppModuleCard {
  /** the technical name shown in <code> on the card (developer mode) */
  technicalName: string;
  /** the module's display name */
  title: string;
  /** 'Installed' (the card's menu offers Uninstall), 'Not installed' (the card shows Install), or 'unknown' */
  state: 'Installed' | 'Not installed' | 'unknown';
}

/**
 * crm-mig: Apps (ir.module.module kanban) - read-only, SEVERAL searches in a row, each card's technical name and
 * installed state. Added 2026-10-26 for CRM-12144_8.1 (BC-06). AppsPageMig (CRM-11857_9.1) answers a single search
 * with a card count and removes the "Apps" facet inside every search, so it cannot run the three searches of 8.1
 * nor tell an installed card from an uninstalled one - hence this separate reader.
 *
 * Measured on crm-mig 2026-10-26 (tests/_explore/discount-mig-batchB-probe-20261026):
 *  - Apps = action base.open_module_tree, kanban by default, opened with the facet "Apps" (filter application = True);
 *  - typing in the search box + Enter makes a "Module" facet (summary / shortdesc / technical name ilike the text);
 *  - in developer mode each card shows the technical name in `h4.o_kanban_record_title code`;
 *  - an INSTALLED card's menu carries Upgrade + Uninstall (data-name="button_uninstall_wizard"); a card that is not
 *    installed carries the Install button (name / data-name "button_immediate_install").
 * Nothing on this screen is clicked except the facet (x) and the search box: never Install / Uninstall.
 */
export class AppsModuleStatePageMig extends BasePage {
  static readonly APPS_ACTION_XMLID = 'base.open_module_tree';
  static readonly APPS_MENU_XMLID = 'base.menu_management';

  // ─── Locators (XPath primary, CSS fallback) ───────────────────────────────
  readonly kanbanCss = '.o_kanban_view';
  /** The search box with its facets - outlined with the result so a shot names the search it answers. */
  readonly searchViewCss = '.o_searchview';
  private readonly msKanbanView = (): Locator =>
    this.page.locator('xpath=//div[contains(@class,"o_kanban_view")]').or(this.page.locator(this.kanbanCss)).first();
  private readonly msSearchInput = (): Locator =>
    this.page.locator('xpath=//div[contains(@class,"o_searchview")]//input').or(this.page.locator('.o_searchview input')).first();
  private readonly msFacets = (): Locator =>
    this.page.locator('xpath=//div[contains(@class,"o_searchview_facet")]').or(this.page.locator('.o_searchview_facet'));
  private readonly msFacetRemoveOf = (text: string): Locator =>
    this.page.locator(`xpath=//div[contains(@class,"o_searchview_facet")][contains(normalize-space(.),"${text}")]//*[contains(@class,"o_facet_remove")]`)
      .or(this.page.locator('.o_searchview_facet').filter({ hasText: text }).locator('.o_facet_remove')).first();
  private readonly msAnyFacetRemove = (): Locator =>
    this.page.locator('xpath=//div[contains(@class,"o_searchview_facet")]//*[contains(@class,"o_facet_remove")]')
      .or(this.page.locator('.o_searchview_facet .o_facet_remove')).first();
  private readonly msCards = (): Locator =>
    this.page.locator('xpath=//div[contains(@class,"o_kanban_view")]//div[contains(@class,"o_kanban_record") and not(contains(@class,"o_kanban_ghost"))]')
      .or(this.page.locator('.o_kanban_view .o_kanban_record:not(.o_kanban_ghost)'));

  constructor(page: Page) {
    super(page);
  }

  /** Open Apps in developer mode (the cards then show the technical name). @returns true when the kanban is on screen */
  async openAppsDebug(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<boolean> {
    const action = await this.xmlId(AppsModuleStatePageMig.APPS_ACTION_XMLID);
    const menu = await this.xmlId(AppsModuleStatePageMig.APPS_MENU_XMLID);
    const origin = new URL(this.page.url()).origin;
    console.log(`  - Opening Apps (action ${action}) in developer mode`);
    await this.page.goto(`${origin}/web?debug=1#action=${action}&model=ir.module.module&view_type=kanban&menu_id=${menu}`, { waitUntil: 'domcontentloaded', timeout });
    await this.page.reload({ waitUntil: 'domcontentloaded', timeout }).catch(() => {});
    await this.dismissErrorDialogWithRetry().catch(() => {});
    const ok = await this.msKanbanView().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    await this.wait(CommonUtils.waitTimes.extraLong);
    console.log(`  ${ok ? 'OK' : '!'} Apps kanban on screen: ${ok}; facets: ${(await this.getFacetTexts()).join(' | ') || '(none)'}`);
    return ok;
  }

  /** The text of every search facet, whitespace-collapsed. */
  async getFacetTexts(): Promise<string[]> {
    return (await this.msFacets().allInnerTexts().catch(() => [] as string[])).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  /** Remove the facet whose text contains `text` (e.g. "Apps"). @returns true when no such facet is left */
  async removeFacet(text: string): Promise<boolean> {
    const remove = this.msFacetRemoveOf(text);
    if (await remove.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false)) {
      await remove.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.waitForLoadingOverlayHidden(CommonUtils.waitTimes.abnormalWait).catch(() => {});
      await this.wait(CommonUtils.waitTimes.extraLong);
    }
    const left = (await this.getFacetTexts()).filter((f) => f.includes(text));
    console.log(`  - facet "${text}" removed: ${left.length === 0}`);
    return left.length === 0;
  }

  /**
   * Type `term` in the search box (real key events + Enter, so Odoo builds the "Module" facet), then read every card.
   * Any facet left by an earlier search is removed first, so the result answers this term alone.
   */
  async searchModules(term: string): Promise<AppModuleCard[]> {
    for (let i = 0; i < 5 && (await this.msFacets().count().catch(() => 0)) > 0; i++) {
      await this.msAnyFacetRemove().click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.long);
    }
    const input = this.msSearchInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.keyboard.type(term, { delay: 30 });
    await this.wait(CommonUtils.waitTimes.long);
    await this.page.keyboard.press('Enter');
    await this.waitForLoadingOverlayHidden(CommonUtils.waitTimes.abnormalWait).catch(() => {});
    await this.wait(CommonUtils.waitTimes.extraLong * 2);
    const cards = await this.readCards();
    console.log(`  - Apps search "${term}" (facets: ${(await this.getFacetTexts()).join(' | ')}) -> ${cards.length} card(s)`);
    for (const c of cards) console.log(`      - ${c.technicalName.padEnd(28)} | ${c.state.padEnd(13)} | ${c.title}`);
    return cards;
  }

  /** Every module card on screen: technical name, title, installed state. */
  async readCards(): Promise<AppModuleCard[]> {
    const n = await this.msCards().count().catch(() => 0);
    const out: AppModuleCard[] = [];
    for (let i = 0; i < n; i++) {
      const info = await this.msCards().nth(i).evaluate((el: HTMLElement) => {
        const norm = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim();
        const code = norm(el.querySelector('code')?.textContent);
        const titleEl = el.querySelector('h4.o_kanban_record_title > span, h4 > span, h4');
        const install = el.querySelector('[name="button_immediate_install"], [data-name="button_immediate_install"]');
        const uninstall = el.querySelector('[name="button_uninstall_wizard"], [data-name="button_uninstall_wizard"]');
        return { code, title: norm(titleEl?.textContent), install: !!install, uninstall: !!uninstall };
      }, undefined, { timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => ({ code: '', title: '', install: false, uninstall: false }));
      out.push({
        technicalName: info.code,
        title: info.title,
        state: info.uninstall && !info.install ? 'Installed' : info.install && !info.uninstall ? 'Not installed' : 'unknown',
      });
    }
    return out;
  }
}
