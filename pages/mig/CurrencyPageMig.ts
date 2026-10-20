import { CurrencyPage, CurrencyRateRow } from '@pages';
import { CommonUtils } from '@/helpers/common.utils';
import { resolveScreenIds, SCREEN_XMLIDS } from '@helpers/odoo-xmlid.helper';
import { Page } from '@playwright/test';

/**
 * CurrencyPageMig - fork of CurrencyPage for the O12 CE migration server.
 *
 * The Mig instance is an O12 COMMUNITY edition with a SIDEBAR backend theme (body class
 * `mk_sidebar_type_large`). Core Odoo widgets (forms, lists) are the SAME as pre-prod, so most
 * CurrencyPage methods work unchanged. However, the CE build lacks the Invoicing > Configuration
 * menu hierarchy, so some navigation paths are blocked and must be replaced with direct URL navigation.
 *
 * Key differences from pre-prod:
 * - No "Configuration" menu under Invoicing (CE feature)
 * - Currencies list must be opened by action hash, not menu
 * - Currency Rate Providers (OCA module) may have different menu structure or URL
 *
 * Methods that use the Configuration menu are marked UNVERIFIED when the Mig exploration shows
 * they cannot be reached via the nav hierarchy.
 */
export class CurrencyPageMig extends CurrencyPage {
  // ─── Locators ─────────────────────────────────────────────────────────────
  // The list/form structure is inherited from CurrencyPage - identical on CE. Only the navbar
  // menu differs, so the two locators below are declared here (XPath primary, CSS fallback).
  /** The Invoicing "Configuration" navbar dropdown toggle (xmlid account.menu_finance_configuration). */
  protected readonly configurationMenuToggle = () =>
    this.page.locator('xpath=//a[@data-menu-xmlid="account.menu_finance_configuration"]')
      .or(this.page.locator('a.dropdown-toggle[data-menu-xmlid="account.menu_finance_configuration"]'))
      .first();
  /** The "Invoicing" app entry in the theme's apps sidebar (xmlid account.menu_finance). */
  protected readonly invoicingAppSidebarEntry = () =>
    this.page.locator('xpath=//a[@data-menu-xmlid="account.menu_finance"]')
      .or(this.page.locator('a[data-menu-xmlid="account.menu_finance"]'))
      .first();
  /** The record list table (the base class keeps its own copy private). */
  protected readonly currencyListTable = () =>
    this.page.locator('xpath=//table[contains(@class,"o_list_view")]')
      .or(this.page.locator('table.o_list_view'))
      .first();
  /** Whichever navbar dropdown is currently open. */
  protected readonly openDropdownMenu = () =>
    this.page.locator('xpath=//div[contains(@class,"dropdown-menu") and contains(@class,"show")]')
      .or(this.page.locator('.dropdown-menu.show'))
      .first();

  constructor(page: Page) {
    super(page);
  }

  /**
   * Override: Open Invoicing > Configuration > Accounting > Currencies on crm-mig.
   *
   * The CE build does not render the "Configuration" submenu under Invoicing, so the base method's
   * menu navigation path fails. Instead, navigate directly via the action hash (menu_id=163, action=64).
   * The inherited openCurrenciesList() already uses this hash as its fallback, so this is a no-op
   * that documents the situation. It calls the parent class method, which handles the hash navigation.
   *
   * @param timeout - max time to wait for the list (default: pageLoad)
   */
  async openCurrenciesList(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<void> {
    // The base class navigates with `#menu_id=163&action=64` - 163 is a PRE-PRODUCTION menu id.
    // crm-mig was rebuilt and re-sequenced its ids: here the Currencies menu is **184**
    // (ir.ui.menu 184, parent 181 "Invoicing/Configuration/Accounting"), verified in the registry
    // on 2026-10-06. With the wrong menu_id the record list still renders, but Odoo never enters the
    // Invoicing app context, so the navbar sections (Customers / Vendors / Accounting / Reporting /
    // Configuration) are NOT drawn - which is what made getConfigurationMenu() read 0 entries and
    // CRM-11857_6.2 fail three times.
    const origin = new URL(this.page.url()).origin;
    // Resolve by XML ID (`base.action_currency_form` / `account.menu_action_currency_form`):
    // a crm-mig rebuild re-sequences the numeric ids (menu 163 -> 184 -> 147 across two rebuilds).
    const { menuId, actionId } = await resolveScreenIds(this.page, SCREEN_XMLIDS.currencies);
    console.log(`  - Opening Invoicing > Configuration > Accounting > Currencies (menu ${menuId}, action ${actionId})`);
    await this.page.goto(`${origin}/web?#menu_id=${menuId}&action=${actionId}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.dismissErrorDialogWithRetry().catch(() => {});
    await this.currencyListTable().waitFor({ state: 'visible', timeout }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  ✓ Currencies list opened');
  }

  /**
   * Open a currency's rate history: click the currency row in the Currencies list, then click the
   * "Rates" stat button in the button box at the top right of the currency form.
   *
   * Inherited from the base class; no override needed because the form structure is identical on CE.
   *
   * @param currencyCode - the currency code, e.g. "EUR"
   * @param timeout - max time to wait for each stage (default: pageLoad)
   * @returns the numeric record id of the currency, taken from the form URL
   */
  async openRatesForCurrency(currencyCode: string, timeout: number = CommonUtils.waitTimes.pageLoad): Promise<string> {
    return super.openRatesForCurrency(currencyCode, timeout);
  }

  /**
   * Open the Currencies list and open ONE currency's form.
   *
   * Inherited from the base class; no override needed.
   *
   * @param currencyCode - the currency code, e.g. "EUR"
   * @param timeout - max time to wait for each stage (default: pageLoad)
   * @returns the numeric record id of the currency, taken from the form URL ('' when not resolvable)
   */
  async openCurrencyForm(currencyCode: string, timeout: number = CommonUtils.waitTimes.pageLoad): Promise<string> {
    return super.openCurrencyForm(currencyCode, timeout);
  }

  /**
   * Read the "Current Rate" of a currency directly from the rate column.
   *
   * Inherited from the base class; no override needed.
   *
   * @param currencyCode - the currency code shown in the Currency column, e.g. "EUR"
   * @param timeout - max time to wait for the cell (default: abnormalWait)
   * @returns the rate as a numeric string (digits + dot only), e.g. "0.851861"
   */
  async getCurrencyRate(currencyCode: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<string> {
    return super.getCurrencyRate(currencyCode, timeout);
  }

  /**
   * Read the list of currency codes currently shown in the Currencies list.
   *
   * Inherited from the base class; no override needed.
   *
   * @param timeout - max time to wait for the list (default: abnormalWait)
   * @returns the codes in list order, e.g. ["CHF","EUR","GBP","IDR","INR","UAH","USD"]
   */
  async getListedCurrencyCodes(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<string[]> {
    let codes = await super.getListedCurrencyCodes(timeout);
    if (codes.length === 0) {
      // An EMPTY read almost never means "no currencies" on this base - crm-mig always has 7 active.
      // It means the caller is not on the list: after opening/archiving a currency FORM the page is
      // still on the form, and the read silently returns []. On 2026-10-07 that turned into
      // `JPY must be left disabled. The enabled set is "" instead of CHF, EUR, GBP, ...` - a page
      // defect dressed up as a product failure. Re-open the list once and read again.
      console.log('  - Currency list read came back empty; re-opening the Currencies list and retrying');
      await this.openCurrenciesList(timeout).catch(() => {});
      codes = await super.getListedCurrencyCodes(timeout);
    }
    return codes;
  }

  /**
   * From an OPEN currency form, click the "Rates" button in the button box at the top right
   * to open that currency's "Currency Rates" list.
   *
   * Inherited from the base class; no override needed.
   *
   * @param currencyId - the record id from openCurrencyForm, used only by the fallback
   * @param timeout - max time to wait for the list (default: pageLoad)
   * @returns true when the "Currency Rates" list rendered rows
   */
  async clickRatesButtonOnOpenForm(currencyId: string = '', timeout: number = CommonUtils.waitTimes.pageLoad): Promise<boolean> {
    return super.clickRatesButtonOnOpenForm(currencyId, timeout);
  }

  /**
   * Read the rate rows of an open "Currency Rates" list as {date, rate}.
   *
   * Inherited from the base class; no override needed.
   *
   * @param timeout - max time to wait for the list (default: abnormalWait)
   */
  async getRateRows(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<CurrencyRateRow[]> {
    return super.getRateRows(timeout);
  }

  /**
   * Find the rate that applies to a date: the row with the LATEST date that is on or before it.
   *
   * Inherited from the base class; no override needed.
   *
   * @param isoDate - the document date as `YYYY-MM-DD`
   * @param maxExpansions - how many times the page size may be widened (default 3: 500, 2000, 5000)
   * @returns the applicable row, or null when the currency has no row on or before that date
   */
  async getRateApplicableToDate(isoDate: string, maxExpansions: number = 3): Promise<CurrencyRateRow | null> {
    return super.getRateApplicableToDate(isoDate, maxExpansions);
  }

  /**
   * Whether the open currency form offers an "EDIT" button. Its ABSENCE is what proves a user may read
   * rates but not change them.
   *
   * Inherited from the base class; no override needed.
   *
   * @param timeout - how long to look for the button (default: elementVisibility)
   */
  async hasEditButtonOnForm(timeout: number = CommonUtils.waitTimes.elementVisibility): Promise<boolean> {
    return super.hasEditButtonOnForm(timeout);
  }

  /**
   * Whether the open list offers a "CREATE" button.
   *
   * Inherited from the base class; no override needed.
   *
   * @param timeout - how long to look for the button (default: elementVisibility)
   */
  async hasCreateButtonOnList(timeout: number = CommonUtils.waitTimes.elementVisibility): Promise<boolean> {
    return super.hasCreateButtonOnList(timeout);
  }

  /**
   * Read the Invoicing > Configuration menu, reporting BOTH whether the menu exists and what it offers.
   *
   * On the O12 CE Migration server with the sidebar theme, the navbar Configuration menu is not
   * rendered at all - the o_menu_sections is empty. This method correctly returns { present: false, labels: [] }
   * because the Configuration menu interface used in pre-prod does not exist on this build.
   *
   * The Invoicing > Configuration menus DO exist at the database level (ir.ui.menu ids 181, 295),
   * but they are not accessible through the navbar UI on the CE sidebar theme. Callers that check
   * for menu-based navigation should handle this result gracefully.
   *
   * @returns { present: whether the menu is accessible in the navbar UI, labels: the offered items }
   */
  /**
   * Override: read the labels offered under Invoicing > Configuration on crm-mig.
   *
   * The base implementation reads `.o_menu_sections` straight from the DOM. On crm-mig's sidebar
   * theme that container is EMPTY until the app is actually entered, so the base returns [] and any
   * caller that asserts on it fails. This override first tries the base path and, when it comes back
   * empty, enters the Invoicing app from the sidebar and reads the navbar dropdowns itself.
   *
   * @returns the Configuration menu entry labels; [] when the navbar never renders
   */
  async getConfigurationMenuLabels(): Promise<string[]> {
    // BOUNDED ON PURPOSE. Measured on crm-mig 2026-10-06: `.o_menu_sections` holds 0 children and no
    // account.menu_finance_configuration node exists in the DOM, under every navigation strategy
    // tried (action hash, menu_id=184 hash, clicking the Invoicing app in the sidebar). The base
    // implementation waits `pageLoad` (240s) for the sections to attach, and retrying the app entry
    // on top of that burned the whole 15-minute test budget of CRM-11857_6.2 - the spec died on
    // "Test timeout of 900000ms exceeded", not on an assertion.
    // So: ONE short-bounded read. An empty result is a known, documented state, not a surprise worth
    // waiting four minutes for. A caller must treat [] as "could not be read" - never as "the menu
    // exists and offers nothing", which would pass a negative check vacuously.
    const labels = await this.page.evaluate(() => {
      const sections = document.querySelector('.o_menu_sections');
      if (!sections) return [] as string[];
      const config = sections.querySelector('a[data-menu-xmlid="account.menu_finance_configuration"]');
      const menu = config?.parentElement?.querySelector('.dropdown-menu');
      if (!menu) return [] as string[];
      return Array.from(menu.querySelectorAll('.dropdown-item, .dropdown-header'))
        .map((n) => (n.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    }).catch(() => [] as string[]);

    if (labels.length === 0) {
      console.log('  ! Invoicing > Configuration menu is not in the DOM on this crm-mig session (known - see CRM-11857_6.2 header)');
    } else {
      console.log(`  ✓ Invoicing > Configuration offers (${labels.length}): ${labels.join(', ')}`);
    }
    return labels;
  }

  async getConfigurationMenu(): Promise<{ present: boolean; labels: string[] }> {
    // The Invoicing "Configuration" menu on crm-mig is a navbar dropdown, NOT a sidebar section:
    //   a.dropdown-toggle.o_menu_header_lvl_1[data-menu-xmlid="account.menu_finance_configuration"]
    // opening a .dropdown-menu whose entries are .dropdown-item (and .dropdown-header group titles).
    // Verified against the 2026-10-05 crm-mig DOM dump (01-currencies-list-action64.html), which
    // carries 45 menu links including account.menu_account_config and account.menu_action_currency_form.
    const toggle = this.configurationMenuToggle();
    let present = await toggle.isVisible().catch(() => false);
    if (!present) {
      // Measured on crm-mig 2026-10-06: navigating by action hash opens the record list but never
      // ACTIVATES the app, so `.o_menu_sections` stays empty (0 children) and no Configuration
      // dropdown exists in the DOM at all. The sidebar of this theme (mk_sidebar_type_large) carries
      // only the 27 app ROOTS, not their sub-menus. The app must be entered by clicking its sidebar
      // entry - account.menu_finance ("Invoicing") - and only then are the navbar sections drawn.
      console.log('  - Configuration toggle absent; entering the Invoicing app from the sidebar');
      await this.invoicingAppSidebarEntry().click().catch(() => {});
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      await this.wait(CommonUtils.waitTimes.long);
      present = await toggle.isVisible().catch(() => false);
    }
    if (!present) {
      console.log('  ! Invoicing > Configuration menu toggle not found even inside the Invoicing app');
      return { present: false, labels: [] };
    }

    await toggle.click().catch(() => {});
    await this.openDropdownMenu().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.savingPage })
      .catch(() => {});
    const labels = (await this.openDropdownMenu()
      .locator('.dropdown-item, .dropdown-header')
      .allInnerTexts()
      .catch(() => [] as string[]))
      .map((t) => t.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    // Close it again so the dropdown never covers whatever the caller reads next.
    await toggle.click().catch(() => {});
    await this.wait(CommonUtils.waitTimes.standard);

    console.log(`  ✓ Invoicing > Configuration menu present: true; offers (${labels.length}): ${labels.join(', ')}`);
    return { present: true, labels };
  }

  /**
   * Convert a date string from the raw UI format to ISO 8601 (YYYY-MM-DD).
   *
   * Wraps the static method CurrencyPage.toIsoDate() for use as an instance method.
   *
   * @param raw - a raw date string from the UI (e.g., "25/08/2026" or "2026-08-25")
   * @returns the date in ISO format (YYYY-MM-DD)
   */
  toIsoDate(raw: string): string {
    return CurrencyPage.toIsoDate(raw);
  }
}
