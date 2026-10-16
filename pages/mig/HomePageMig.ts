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
    await this.goto(await new MigPlatformPage(this.page).appUrlFor('crm'));
    await this.waitForURL(HomePageMig.CRM_KANBAN_URL_RE, CommonUtils.waitTimes.pageLoad);
    await this.dismissErrorDialog();
  }

  /**
   * Back to the applications home - the Mig equivalent of the base object's apps-menu click.
   *
   * `HomePage.returnToHome()` clicks `applicationMenuLink()`. The Mig sidebar theme keeps that
   * link out of the layout, exactly as it does for the navbar CRM link, so the click never
   * resolves and the caller sits there until the test times out - 15 minutes on
   * CRM-12370_7.5.1, which spends them before reaching its first assertion.
   * Open the apps action by its URL hash instead: theme-agnostic, and the same trick
   * `navigateToCRM()` already uses here.
   */
  async returnToHome() {
    await this.goto(await new MigPlatformPage(this.page).appUrlFor('apps'));
    await this.waitForURL(/\/web[?#]/, CommonUtils.waitTimes.pageLoad);
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.dismissErrorDialog();
    await this.wait(CommonUtils.waitTimes.long);
  }

  /**
   * The applications home is "loaded" on Mig when the app links EXIST, not when they are visible.
   *
   * `HomePage.waitForHomePageLoad()` waits for `crmLink()` to be *visible*. On the Mig sidebar
   * theme that anchor is rendered as a `dropdown-item o_app` inside a collapsed menu, so it stays
   * `hidden` and the wait burns its whole timeout - 122 resolutions to the same hidden element on
   * CRM-12370_7.5.1. The element being ATTACHED is the real "the apps home has rendered" signal
   * here, and every Mig navigation goes by URL hash afterwards anyway.
   */
  async waitForHomePageLoad(timeout: number = CommonUtils.waitTimes.pageLoad) {
    await this.waitForLoadingSpinnerToHide(timeout).catch(() => {});
    await this.page
      .locator('xpath=//a[contains(@data-menu-xmlid, "crm.crm_menu_root")]')
      .first()
      .waitFor({ state: 'attached', timeout });
    await this.wait(CommonUtils.waitTimes.standard);
  }

  /**
   * Open an action by its Mig URL hash and wait until its records view has rendered.
   *
   * TWO ATTEMPTS, AND A NAMED FAILURE (2026-10-16). A single `goto` + one long `waitFor` was not
   * enough: on 2026-10-16 CRM-11806_1.1 sat here for the full 240 s and the page snapshot showed
   * **Discuss / Inbox**, not the Opportunities list - while CRM-11806_1.2 and 1.3 opened the same
   * action from the same hash minutes later in the same run. So the hash is right (the log records
   * `#menu_id=482&action=864&model=crm.lead&view_type=list`, the form that renders) and the screen
   * is reachable; what happens is that the client sometimes finishes booting on the session's last
   * action before it applies the fragment, and then nothing ever re-applies it.
   *
   * Re-applying the hash and RELOADING is the fix already proven for the embed menus
   * (`SubscriptionPageMig.openEmbedMenu`): a hash-only change does not reload, so the client has to
   * boot WITH the fragment in place. The first wait is therefore short enough to leave the retry a
   * budget, and a run that still lands elsewhere says WHERE it landed - a bare
   * `locator.waitFor: Timeout 240000ms exceeded` sent the last session looking for a selector
   * problem that was never there.
   */
  private async openListByHash(appKey: string) {
    const url = await new MigPlatformPage(this.page).appUrlFor(appKey);

    for (let attempt = 1; attempt <= 2; attempt++) {
      if (attempt === 1) {
        await this.goto(url);
      } else {
        console.log(`  - "${appKey}" did not render a records view; re-applying the hash and reloading once`);
        await this.goto(url);
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      }
      await this.waitForURL(/\/web[?#]/, CommonUtils.waitTimes.pageLoad).catch(() => {});
      await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.pageLoad).catch(() => {});
      await this.dismissErrorDialog();

      const rendered = await this.recordsViewRoot()
        .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
        .then(() => true).catch(() => false);
      if (rendered) {
        await this.wait(CommonUtils.waitTimes.long);
        return;
      }
    }

    // Say what IS on screen. "Discuss" here is the client having booted on the wrong action, which
    // is a different problem from the action not existing or the list being slow.
    const heading = (await this.page.locator('.breadcrumb-item.active, .o_control_panel h1, h1')
      .first().textContent({ timeout: CommonUtils.waitTimes.long }).catch(() => '') || '').trim();
    throw new Error(
      `"${appKey}" never rendered a records view, twice. URL = ${this.page.url()}; the screen reads ` +
      `"${heading || '(no heading)'}". If that is Discuss/Inbox the client booted on the session's ` +
      'last action instead of the hash - that is this navigation, not a slow list and not a wrong selector.',
    );
  }

  /** CRM > Leads (list view) - replaces the navbar/dropdown click of the base object. */
  async navigateToLeads() {
    await this.openListByHash('leads');
  }

  /** Contacts (list view) - replaces the sidebar-menu click of the base object. */
  async navigateToContacts() {
    await this.openListByHash('contactsList');
  }

  /**
   * CRM > Pipeline opened directly in its LIST view - the Mig equivalent of the pre-prod
   * "click at CRM, then click at view list" pair of steps.
   */
  async navigateToOpportunitiesList() {
    await this.openListByHash('opportunitiesList');
  }

  /**
   * Search the Apps Kanban view for a module by its name.
   *
   * On Mig, the Apps screen uses a Kanban layout. This method:
   * 1. Opens the Apps screen
   * 2. Looks for a search input and clears any existing filter
   * 3. Searches for the module name
   * 4. Returns true if the module card is found, false if not (empty state or not listed)
   *
   * @param moduleName - the name to search for, e.g. "Live Currency Exchange Rate"
   * @returns true when the module is found in the search results
   */
  async searchAppsForModule(moduleName: string): Promise<boolean> {
    console.log(`  - Searching Apps for module: "${moduleName}"`);
    await this.returnToHome();

    // Wait for the Apps Kanban to load
    await this.waitForHomePageLoad(CommonUtils.waitTimes.pageLoad);
    await this.wait(CommonUtils.waitTimes.long);

    // Look for the search input on the Apps Kanban (selector: input[type="text"] - the Apps search box)
    const searchInput = this.page.locator('input[type="text"]').first();
    const searchVisible = await searchInput.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false);
    if (!searchVisible) {
      console.log('  ! Apps search input not found');
      return false;
    }

    // Clear the search input and type the module name
    await searchInput.click().catch(() => {});
    await searchInput.press('Control+a').catch(() => {});
    await searchInput.press('Backspace').catch(() => {});
    await this.wait(CommonUtils.waitTimes.medium);

    // Type the search term
    await searchInput.type(moduleName, { delay: 50 });
    await this.wait(CommonUtils.waitTimes.long);

    // Check if the module card is found or if we get the "no results" message
    // Look for a module card with the name (usually in a .o_kanban_record or similar)
    const moduleCard = this.page.locator('xpath=//div[contains(@class,"o_kanban_record")] | //div[contains(@class,"oe_kanban_card")]')
      .filter({ hasText: new RegExp(moduleName, 'i') })
      .first();

    const found = await moduleCard.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    console.log(`  ${found ? '✓' : '!'} Module "${moduleName}" search result: ${found ? 'FOUND' : 'NOT FOUND'}`);
    return found;
  }
}
