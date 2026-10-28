import { CurrencyPage, CurrencyRateRow } from '@pages';
import { CommonUtils } from '@/helpers/common.utils';
import { resolveScreenIds, SCREEN_XMLIDS } from '@helpers/odoo-xmlid.helper';
import { Page } from '@playwright/test';
import { ControlPanelFiltersMig } from '@pages/mig/ControlPanelFiltersMig';

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

  // ─── Added 2026-10-26 (CRM-11857 group R: 5.3 / 6.2 / 7.1) ─────────────────
  /** One top-level navbar section of an app ("Customers", "Configuration", ...), as a sidebar-theme session renders it. */
  protected readonly menuSectionsRoot = () =>
    this.page.locator('xpath=//*[contains(@class,"o_menu_sections")]').or(this.page.locator('.o_menu_sections')).first();
  protected readonly menuSectionTopLevel = () =>
    this.page.locator('xpath=//*[contains(@class,"o_menu_sections")]//a[contains(@class,"o_menu_header_lvl_1") or contains(@class,"o_menu_entry_lvl_1")]')
      .or(this.page.locator('.o_menu_sections a.o_menu_header_lvl_1, .o_menu_sections a.o_menu_entry_lvl_1'));
  /** Every "Invoicing" app anchor - the DOM holds a hidden apps-menu copy AND the visible sidebar one (no .first()). */
  protected readonly invoicingAppEntries = () =>
    this.page.locator('xpath=//a[@data-menu-xmlid="account.menu_finance"]')
      .or(this.page.locator('a[data-menu-xmlid="account.menu_finance"]'));
  /** A field wrapper on the open form by its technical name (the `name` attribute sits on the wrapper). */
  protected readonly formFieldByName = (name: string) =>
    this.page.locator(`xpath=//div[contains(@class,"o_form_view")]//*[@name="${name}" and contains(@class,"o_field_widget")]`)
      .or(this.page.locator(`.o_form_view .o_field_widget[name="${name}"]`)).first();
  /** The archive (Active / Inactive) stat button at the top right of the currency form. */
  protected readonly activeToggleButton = () =>
    this.page.locator('xpath=//div[contains(@class,"o_form_view")]//button[@name="toggle_active"]')
      .or(this.page.locator('.o_form_view button[name="toggle_active"]')).first();

  /**
   * Read the "Currency" (name) and "Symbol" fields of the currency FORM currently open.
   * Added 2026-10-26 for CRM-11857_5.3 step 5 ("Currency = JPY and Symbol are unchanged").
   * @throws when either field is not on the form - an unread field must not look like an unchanged one
   */
  async readCurrencyFormFields(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<{ currency: string; symbol: string }> {
    // The wrapper is ATTACHED as soon as the form renders; the visible copy is picked in the page, because the
    // DOM can also hold a hidden copy of the same field (measured 2026-10-26: waiting for `.first()` to become
    // visible timed out on a form whose "Currency" field was on screen).
    await this.formFieldByName('name').waitFor({ state: 'attached', timeout });
    const read = async (name: string): Promise<string> => {
      const text = await this.page.evaluate((n: string) => {
        const nodes = Array.from(document.querySelectorAll(`.o_form_view .o_field_widget[name="${n}"]`)) as HTMLElement[];
        const shown = nodes.find((el) => el.offsetParent !== null) || null;
        if (!shown) return null;
        const input = shown.matches('input') ? (shown as HTMLInputElement) : shown.querySelector('input');
        return input ? (input as HTMLInputElement).value : (shown.textContent || '');
      }, name);
      if (text === null) throw new Error(`Currency form field "${name}" is not visible on ${this.page.url()} - it was not read`);
      return text.replace(/\s+/g, ' ').trim();
    };
    const visibleNow = async (n: string) => this.page.evaluate((f: string) =>
      (Array.from(document.querySelectorAll(`.o_form_view .o_field_widget[name="${f}"]`)) as HTMLElement[])
        .some((el) => el.offsetParent !== null), n);
    if (!(await visibleNow('symbol'))) {
      // Odoo 12's base res.currency form puts Symbol in its "Display" group with groups="base.group_no_one", so
      // it renders only in developer mode - for every user, on crm-mig and on pre-production alike (same base
      // view). A human reads it with ?debug=1; so does this method. Same record, same form, only the mode differs.
      const url = new URL(this.page.url());
      const debugUrl = `${url.origin}/web?debug=1${url.hash}`;
      console.log('  - Symbol is a developer-mode field on the currency form; re-opening the same form with ?debug=1');
      await this.page.goto(debugUrl, { waitUntil: 'domcontentloaded', timeout });
      await this.formFieldByName('symbol').waitFor({ state: 'attached', timeout });
      await this.wait(CommonUtils.waitTimes.long);
    }
    const currency = await read('name');
    const symbol = await read('symbol');
    console.log(`  - Currency form: Currency = "${currency}", Symbol = "${symbol}"`);
    return { currency, symbol };
  }

  /**
   * Read the archive stat button's label with the mouse OFF the button.
   *
   * Odoo 12's boolean_button shows the STATE ("Active" / "Inactive") at rest and swaps to the ACTION
   * ("Deactivate" / "Activate") while hovered - and right after a click the pointer still sits on it. The TC
   * reads "The button shows Active / Inactive", i.e. the label at rest, so the pointer is moved away first.
   * Added 2026-10-26 for CRM-11857_5.3 steps 3 and 5.
   * @returns the label exactly as rendered, e.g. "Active"; '' when the button is not on screen
   */
  async readActiveButtonLabelAtRest(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<string> {
    const btn = this.activeToggleButton();
    if (!(await btn.isVisible({ timeout }).catch(() => false))) return '';
    // Park the pointer in the bottom-left corner of the CURRENT viewport (not a fixed 1080p coordinate).
    const vp = this.page.viewportSize() || { width: 1280, height: 720 };
    await this.page.mouse.move(5, Math.max(0, vp.height - 5));
    await this.wait(CommonUtils.waitTimes.medium);
    const label = ((await btn.innerText({ timeout }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    console.log(`  - Archive button label (at rest): "${label}"`);
    return label;
  }

  /**
   * Open each top-level menu of the Invoicing app and read what it offers, as the signed-in user sees it.
   *
   * On crm-mig's sidebar theme the app's navbar sections are drawn only once the app is ENTERED from the
   * sidebar (a hash navigation leaves `.o_menu_sections` empty - the 2026-10-13 "menus do not render" note).
   * Measured 2026-10-26 (EXPLORE-20261026_31) as faye: after clicking the Invoicing sidebar entry the navbar
   * holds 7 sections - Overview, Customers, Vendors, Accounting, Export Transaction File, Reporting,
   * Configuration - each a dropdown of .dropdown-header (group) + .dropdown-item (entry) nodes.
   * Added 2026-10-26 for CRM-11857_6.2 step 4.
   *
   * @returns one entry per top-level section: its label and the labels it offers (headers prefixed "## ")
   */
  async readInvoicingModuleMenus(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<Array<{ section: string; entries: string[] }>> {
    await this.invoicingAppEntries().filter({ visible: true }).first().click({ timeout });
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await this.menuSectionTopLevel().first().waitFor({ state: 'visible', timeout });
    await this.wait(CommonUtils.waitTimes.long);
    const count = await this.menuSectionTopLevel().count();
    const result: Array<{ section: string; entries: string[] }> = [];
    for (let i = 0; i < count; i++) {
      const top = this.menuSectionTopLevel().nth(i);
      const section = ((await top.innerText({ timeout }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      const isDropdown = ((await top.getAttribute('class', { timeout }).catch(() => '')) || '').includes('dropdown-toggle');
      let entries: string[] = [];
      if (isDropdown) {
        await top.click({ timeout });
        await this.openDropdownMenu().waitFor({ state: 'visible', timeout }).catch(() => {});
        entries = await this.openDropdownMenu().evaluate((menu) =>
          Array.from(menu.querySelectorAll('.dropdown-header, .dropdown-item')).map((n) => {
            const text = (n.textContent || '').replace(/\s+/g, ' ').trim();
            return n.classList.contains('dropdown-header') ? `## ${text}` : text;
          }).filter((t) => t && t !== '##'), undefined, { timeout });
        // No .catch(() => []): a dropdown that could not be read must fail loudly, not look like an empty menu.
        if (entries.length === 0) throw new Error(`Invoicing > ${section}: the dropdown opened but no entry could be read`);
        await this.page.keyboard.press('Escape');
        if (await this.openDropdownMenu().isVisible().catch(() => false)) await top.click({ timeout }).catch(() => {});
        await this.wait(CommonUtils.waitTimes.short);
      }
      console.log(`  - Invoicing > ${section}${isDropdown ? ` (${entries.length}): ${entries.join(' | ')}` : ' (direct link)'}`);
      result.push({ section, entries });
    }
    return result;
  }

  /**
   * Click a column header of the open list exactly ONCE (the TC's "click the Date column header") and wait for the
   * rows to re-render. The resulting order is for the caller to verify - this method does not retry towards a
   * wanted direction. Added 2026-10-26 for CRM-11857_6.2 step 3.
   * @throws when the header is not on the list
   */
  async clickListColumnHeaderOnce(label: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<void> {
    const header = this.page.locator(`xpath=//table[contains(@class,"o_list_view")]//thead//th[normalize-space(.)="${label.replace(/"/g, '')}"]`)
      .or(this.page.locator('table.o_list_view thead th').filter({ hasText: new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }))
      .first();
    await header.click({ timeout });
    await this.waitForLoadingOverlayHidden(timeout).catch(() => {});
    await this.currencyListTable().locator('tbody tr.o_data_row').first().waitFor({ state: 'visible', timeout });
    await this.wait(CommonUtils.waitTimes.extraLong);
    console.log(`  - Clicked the "${label}" column header once`);
  }

  /**
   * The Invoicing menu tree exactly as the web client loads it for the signed-in user (`ir.ui.menu.load_menus`,
   * already filtered by the user's groups), each leaf with the model its window action opens.
   * Added 2026-10-26 for CRM-11857_6.2 step 4 - the cross-check that no entry opens res.currency.rate.
   * @returns leaves as "path" + "resModel" ('' for a non-window action)
   */
  async readInvoicingMenuLeavesAsUser(): Promise<Array<{ path: string; resModel: string }>> {
    return this.page.evaluate(async () => {
      const call = async (model: string, method: string, args: any[], kwargs: any = {}) => {
        const r = await fetch('/web/dataset/call_kw', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } }) });
        const j = await r.json();
        if (j.error) throw new Error(String((j.error.data || {}).message || j.error.message));
        return j.result;
      };
      const tree = await call('ir.ui.menu', 'load_menus', [false]);
      const inv = (tree.children || []).find((c: any) => c.xmlid === 'account.menu_finance');
      const leaves: Array<{ path: string; action: string }> = [];
      const walk = (n: any, p: string) => {
        const path = p ? `${p} > ${n.name}` : n.name;
        if (n.action) leaves.push({ path, action: n.action });
        (n.children || []).forEach((c: any) => walk(c, path));
      };
      if (inv) walk(inv, '');
      const windowIds = leaves.filter((l) => l.action.startsWith('ir.actions.act_window,')).map((l) => Number(l.action.split(',')[1]));
      const acts: Array<{ id: number; res_model: string }> = windowIds.length
        ? await call('ir.actions.act_window', 'read', [windowIds, ['res_model']]) : [];
      const modelOf = new Map(acts.map((a) => [a.id, a.res_model]));
      return leaves.map((l) => ({
        path: l.path,
        resModel: l.action.startsWith('ir.actions.act_window,') ? (modelOf.get(Number(l.action.split(',')[1])) || '') : '',
      }));
    });
  }

  /**
   * On the open Currency Rates list: Filters > Add Custom Filter > <field> <operator> <value> > Apply.
   * Added 2026-10-26 for CRM-11857_7.1 step 2 (Date is less than or equal to 08/25/2026).
   * @returns the facet texts after Apply
   */
  async addRateListCustomFilter(fieldLabel: string, operatorLabel: string | { value: string }, value: string): Promise<string[]> {
    const facets = await new ControlPanelFiltersMig(this.page).addCustomFilter(fieldLabel, operatorLabel, value);
    await this.currencyListTable().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    return facets;
  }

  /**
   * Remove the search facet whose text contains `text` from the open list (e.g. the custom "Date" filter).
   * Added 2026-10-26 for CRM-11857_7.1 step 3.
   * @returns true when no facet with that text is left
   */
  async removeListFacetContaining(text: string): Promise<boolean> {
    const removed = await new ControlPanelFiltersMig(this.page).removeFacetContaining(text);
    await this.currencyListTable().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    return removed;
  }

  /** The facet chips currently applied on the open list (evidence for the log). */
  async getListFacetTexts(): Promise<string[]> {
    return new ControlPanelFiltersMig(this.page).getFacetTexts();
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
