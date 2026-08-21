import { HomePage } from '@pages';
import { MigPlatformPage } from './MigPlatformPage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * HomePage variant for the O12 Migration server (crm-mig.nakivo.site).
 *
 * The base `navigateToCRM()` clicks the navbar CRM link, which the sidebar theme keeps hidden, so
 * open CRM by its kanban URL instead - theme-agnostic and immune to the sidebar-vs-navbar layout.
 * (CRM lead kanban action id 185 / menu_id 125 taken from the Mig instance; these are DB-specific
 * and belong in a Mig page object.)
 *
 * Same reason for the list-view openers below: the base `navigateToLeads()` / `navigateToContacts()`
 * click the navbar + its sub-menu dropdown, both hidden by the sidebar theme, so the Mig variants
 * open the same action by its URL hash (registry: `MigPlatformPage.HASH`) and wait for the list to
 * render. Used by the section-II "main business work on O12 CE" smoke suite.
 */
export class HomePageMig extends HomePage {
  private static readonly CRM_KANBAN_URL_RE = /\/web[?#].*view_type=kanban/;

  // Locators - XPath primary, CSS fallback. A records view = list OR kanban: Odoo 12 honours
  // `view_type` only on the `action=<id>&model=<model>` hash form, so an action opened by
  // `action_id=` lands on its own default view - accept either instead of hanging on one.
  private readonly recordsViewRoot = () =>
    this.page.locator('xpath=//div[contains(@class,"o_list_view")] | //table[contains(@class,"o_list_table")] | //div[contains(@class,"o_kanban_view")]')
      .or(this.page.locator('.o_list_view, table.o_list_table, .o_kanban_view'))
      .first();

  async navigateToCRM() {
    await this.goto(MigPlatformPage.appUrl(MigPlatformPage.HASH.crm));
    await this.waitForURL(HomePageMig.CRM_KANBAN_URL_RE, CommonUtils.waitTimes.pageLoad);
    await this.dismissErrorDialog();
  }

  /** Open an action by its Mig URL hash and wait until its LIST view has rendered. */
  private async openListByHash(hash: string) {
    await this.goto(MigPlatformPage.appUrl(hash));
    await this.waitForURL(/\/web[?#]/, CommonUtils.waitTimes.pageLoad);
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.dismissErrorDialog();
    await this.recordsViewRoot().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.wait(CommonUtils.waitTimes.long);
  }

  /** CRM > Leads (list view) - replaces the navbar/dropdown click of the base object. */
  async navigateToLeads() {
    await this.openListByHash(MigPlatformPage.HASH.leads);
  }

  /** Contacts (list view) - replaces the sidebar-menu click of the base object. */
  async navigateToContacts() {
    await this.openListByHash(MigPlatformPage.HASH.contactsList);
  }

  /**
   * CRM > Pipeline opened directly in its LIST view - the Mig equivalent of the pre-prod
   * "click at CRM, then click at view list" pair of steps.
   */
  async navigateToOpportunitiesList() {
    await this.openListByHash(MigPlatformPage.HASH.opportunitiesList);
  }
}
