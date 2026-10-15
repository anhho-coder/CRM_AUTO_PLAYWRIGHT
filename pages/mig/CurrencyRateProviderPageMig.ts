import { Page } from '@playwright/test';
import { BasePage } from '@pages/BasePage';
import { CommonUtils } from '@/helpers/common.utils';
import { resolveScreenIds, SCREEN_XMLIDS } from '@helpers/odoo-xmlid.helper';

/** Configuration of a currency rate provider (OCA module res.currency.rate.provider). */
export interface ProviderConfig {
  /** Service name, e.g. "ECB" or "Yahoo" */
  service?: string;
  /** Comma-separated currency codes, e.g. "EUR,GBP,USD" */
  currencies?: string;
  /** Interval unit, e.g. "days" or "hours" */
  intervalType?: string;
  /** How many interval units, e.g. 1 */
  intervalNumber?: string;
  /** Next run date/time, e.g. "08/20/2026 05:15:16" */
  nextRun?: string;
  /** Last successful run date/time, e.g. "2026-10-12" */
  lastSuccessfulRun?: string;
  /** Owning company as the form renders it, e.g. "NAKIVO, Inc.". */
  company?: string;
}

/** A row from the Currency Rate Providers list. */
export interface ProviderRow {
  /** Provider service name */
  service: string;
  /** Update interval, e.g. "Every 1 days" */
  interval: string;
  /** Next scheduled run date/time */
  nextRun: string;
  /** Currencies the provider covers, as the list cell renders them */
  currencies?: string;
}

/**
 * Currency Rate Provider Page Object (OCA module res.currency.rate.provider).
 *
 * The OCA `currency_rate_update` module (installed on crm-mig as version 12.0.1.3.1) provides a UI
 * for configuring automatic currency rate updates from external sources (ECB, Yahoo, etc.). The module
 * adds a scheduled action ("Currency Rates Update (OCA)" cron on model res.currency.rate.provider) that
 * runs the configured providers on their schedules.
 *
 * This page object provides access to the Currency Rate Providers list and form. Navigation is by model
 * and action hash since the screen was not located via menu search in the 2026-10-05 crm-mig exploration.
 *
 * The screen is expected to be a standard Odoo list/form view (model=res.currency.rate.provider).
 */
export class CurrencyRateProviderPageMig extends BasePage {
  // ─── Locators (XPath primary, CSS fallback) ───────────────────────────────
  // Standard Odoo list/form locators - verified on crm-mig 2026-10-05 harvest
  protected readonly listTable = () =>
    this.page.locator('xpath=//table[contains(@class,"o_list_view")]').or(this.page.locator('table.o_list_view')).first();
  protected readonly anyDataRow = () =>
    this.page.locator('xpath=//tr[contains(@class,"o_data_row")]').or(this.page.locator('tr.o_data_row')).first();
  protected readonly emptyStateView = () =>
    this.page.locator('xpath=//div[contains(@class,"o_view_nocontent")]').or(this.page.locator('.o_view_nocontent')).first();
  protected readonly formView = () =>
    this.page.locator('xpath=//div[contains(@class,"o_form_view")]').or(this.page.locator('.o_form_view')).first();
  protected readonly rowByService = (serviceName: string) =>
    this.page.locator(`xpath=//tr[contains(@class,"o_data_row")][td[normalize-space()="${serviceName}"]]`)
      .or(this.page.locator(`tr.o_data_row:has(td:text-is("${serviceName}"))`)).first();
  protected readonly editButton = () =>
    this.page.locator('xpath=//button[contains(@class,"o_form_button_edit")]').or(this.page.locator('button.o_form_button_edit')).first();
  protected readonly saveButton = () =>
    this.page.locator('xpath=//button[contains(@class,"o_form_button_save")]').or(this.page.locator('button.o_form_button_save')).first();
  protected readonly createButton = () =>
    this.page.locator('xpath=//button[contains(text(),"Create")]')
      .or(this.page.locator('button:has-text("Create")')).first();
  protected readonly deleteButton = () =>
    this.page.locator('xpath=//button[contains(@class,"o_form_button_remove")] | //button[contains(normalize-space(),"Delete")]')
      .or(this.page.locator('button:has-text("Delete")')).first();
  // Standard form field locators - field inputs by name
  protected readonly fieldInput = (fieldName: string) =>
    this.page.locator(`xpath=//input[@name="${fieldName}"]`).or(this.page.locator(`input[name="${fieldName}"]`)).first();
  protected readonly fieldSelect = (fieldName: string) =>
    this.page.locator(`xpath=//select[@name="${fieldName}"]`).or(this.page.locator(`select[name="${fieldName}"]`)).first();
  /** The form's chatter panel (the OCA provider form arch carries `<div class="oe_chatter">`). */
  protected readonly chatterArea = () =>
    this.page.locator('xpath=//div[contains(@class,"oe_chatter") or contains(@class,"o_chatter")]')
      .or(this.page.locator('.oe_chatter, .o_chatter')).first();
  protected readonly fieldReadonly = (fieldName: string) =>
    this.page.locator(`xpath=//span[@name="${fieldName}"] | //div[@name="${fieldName}"]`)
      .or(this.page.locator(`span[name="${fieldName}"], div[name="${fieldName}"]`)).first();
  // "Update Rates" action button - text-based since it is an action method button
  protected readonly updateRatesButton = () =>
    this.page.locator('xpath=//button[contains(normalize-space(),"Update Rate") or contains(normalize-space(),"Manually") or contains(normalize-space(),"RUN")]')
      .or(this.page.locator('button:has-text("Update Rates")')).first();

  constructor(page: Page) {
    super(page);
  }

  /**
   * Open Settings > Technical > Modules > res.currency.rate.provider (Currency Rate Providers list).
   *
   * Navigation is by the action the OCA module registers for this model:
   * ir.actions.act_window id 436, name "Currency Rates Providers", res_model
   * res.currency.rate.provider, view_mode tree,form - read from the crm-mig registry on 2026-10-05.
   * The menu search during exploration never reached this screen, so the action hash is used
   * directly rather than a menu walk.
   *
   * On crm-mig, the list renders as an empty-state view (o_view_nocontent) with "Create a new document"
   * text - there are currently zero provider records in the database.
   *
   * @param timeout - max time to wait for the list (default: pageLoad)
   * @returns true when either the list table or empty-state view rendered
   */
  /**
   * Look up the Currency Rates Providers action and menu ids over the session's own JSON-RPC.
   *
   * crm-mig re-sequences these ids on every rebuild, so they are resolved per run rather than
   * pinned. The values measured on 2026-10-13 (menu 300 / action 443) are the fallback, and the
   * ones from 2026-10-05 (295 / 436) are what they replaced - neither is trusted blindly.
   */
  /**
   * The OCA "Currency Rates Providers" screen, resolved by XML ID
   * (`currency_rate_update.action_res_currency_rate_provider`) rather than by a pinned number.
   */
  protected async resolveProvidersScreenIds(): Promise<{ menuId: number; actionId: number }> {
    return resolveScreenIds(this.page, SCREEN_XMLIDS.currencyRateProviders);
  }

  async openProvidersList(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<boolean> {
    const origin = new URL(this.page.url()).origin;
    console.log('  - Opening Currency Rate Providers list');
    // menu 295 = "Currency Rates Providers" under Invoicing/Configuration/Accounting, action 436
    // (both read from the crm-mig registry on 2026-10-05). The menu_id MUST be in the hash: the bare
    // `#action=436&model=...&view_type=list` form hung for 60s in the 2026-10-05 smoke run.
    // The reload is REQUIRED: a goto that only changes the hash does not re-route the web client, so
    // without it the page stays on whatever action was loaded (the 2026-10-05 run landed on Discuss,
    // action 124, and the empty-state check then passed against the WRONG screen).
    // Routing here is RACY. `goto(<hash>)` followed immediately by `reload()` sometimes reloads
    // before the web client has consumed the hash, and Odoo then restores its default action and
    // rewrites the URL - measured 2026-10-13, the page ended on Discuss
    // (#action=124&active_id=mailbox_inbox&menu_id=98) while the DB had the provider all along.
    // So: navigate, settle, CHECK the url, and only re-drive the route if it did not take.
    // A provider FORM is the SAME action 436 with `&id=<n>&view_type=form`, so "the URL contains
    // action=436" is NOT evidence that the LIST is on screen. Coming back from a saved form, that
    // check passed on attempt 1, the route was never re-driven, the form stayed up and the list
    // lookup then reported "did not open" - which is what cost CRM-11857_5.1 and 5.2 their runs on
    // 2026-10-13, and, worse, made 5.2's teardown skip the restore it owed the base.
    // So the route is only "taken" when the hash asks for the LIST view and is not showing a form.
    // RESOLVE the ids instead of hard-coding them. A crm-mig rebuild RE-SEQUENCES menu and action
    // ids (it happened twice in two weeks: the provider screen was menu 295 / action 436 on
    // 2026-10-05 and is menu 300 / action 443 after the 2026-10-13 rebuild). Hard-coded ids made 11
    // of the 26 failures in the 2026-10-14 full run - every one of them reported "the provider form
    // should open" on a base where the provider record was present and healthy.
    const ids = await this.resolveProvidersScreenIds();
    const HASH = `#menu_id=${ids.menuId}&action=${ids.actionId}&model=res.currency.rate.provider&view_type=list`;
    const onList = (): boolean => {
      const u = this.page.url();
      return u.includes(`action=${ids.actionId}`) && !u.includes('view_type=form') && !/[?&#]id=\d/.test(u);
    };
    const target = `${origin}/web${HASH}`;
    for (let attempt = 1; attempt <= 3; attempt++) {
      // Leaving a form that is still dirty raises Odoo's discard dialog, which silently swallows the
      // navigation; clear it before asking for the list.
      await this.dismissDiscardChangesDialog().catch(() => {});
      if (attempt === 1) {
        await this.page.goto(target, { waitUntil: 'domcontentloaded' }).catch(() => {});
      } else {
        // a hash change on an already-loaded client: set it, then tell the router about it
        await this.page.evaluate((hash) => {
          window.location.hash = hash;
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        }, HASH).catch(() => {});
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      }
      await this.wait(CommonUtils.waitTimes.long);
      if (onList()) break;
      console.log(`  - route did not take (attempt ${attempt}); now on ${this.page.url()}`);
    }
    await this.dismissErrorDialogWithRetry().catch(() => {});

    // The list renders EITHER as a table (records exist) OR as the empty-state view (none do), so wait
    // for whichever comes first. Waiting for the table alone and only then checking the empty state
    // costs the full pageLoad timeout on an empty base - measured at 253s on 2026-10-05.
    await this.listTable().or(this.emptyStateView()).first()
      .waitFor({ state: 'visible', timeout }).catch(() => {});
    const tableVisible = await this.listTable().isVisible().catch(() => false);
    const emptyState = await this.emptyStateView().isVisible().catch(() => false);

    if (!tableVisible && !emptyState) {
      console.log('  ! Currency Rate Providers list did not open');
      return false;
    }

    // Guard against a false positive: Odoo falls back to its default action when the route is not
    // applied, and that fallback screen has its own empty state. Only action 436 counts as open.
    const landedOn = this.page.url();
    if (!onList()) {
      console.log(`  ! Not on the Currency Rate Providers LIST - landed on ${landedOn}`);
      return false;
    }

    const hasRows = tableVisible ?
      await this.anyDataRow().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.medium })
        .then(() => true).catch(() => false) : false;
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  ✓ Currency Rate Providers list opened (table: ${tableVisible}, empty-state: ${emptyState}, rows: ${hasRows})`);
    return true;
  }

  /**
   * Read all rows from the open Currency Rate Providers list as {service, interval, nextRun}.
   *
   * VERIFIED on crm-mig 2026-10-05: Form fields exist; column headers and cell structure match the form.
   * The harvest showed zero provider records (empty-state screen); this method is ready for use when
   * provider records are created.
   *
   * @param timeout - max time to wait for the list (default: abnormalWait)
   * @returns the provider rows currently visible
   */
  async getProviderRows(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<ProviderRow[]> {
    await this.listTable().waitFor({ state: 'visible', timeout }).catch(() => {});
    const rows = await this.page.evaluate(() => {
      const table = document.querySelector('table.o_list_view') || document.querySelector('.o_list_view table');
      if (!table) return [] as ProviderRow[];

      const headers = Array.from(table.querySelectorAll('thead th'))
        .map((h) => (h.textContent || '').trim())
        .filter((t) => !!t);

      // Map by HEADER NAME, not by position. The first <td> of an Odoo list row is the record
      // checkbox, so cells[0] is always blank - reading `service` from it yielded '' and the
      // `filter(r => r.service)` below then dropped every row, reporting "0 providers" while the
      // database held one. (The old comment claimed the order was "verified on crm-mig 2026-10-05";
      // the list was EMPTY that day, so nothing had been verified at all.)
      // Real headers, read 2026-10-13:
      //   Source Service | Company | Update Schedule | Currencies | Next scheduled update | Created by
      const allTh = Array.from(table.querySelectorAll('thead th')).map((h) => (h.textContent || '').trim());
      const col = (name: string) => allTh.findIndex((h) => h.toLowerCase().includes(name));
      const iService = col('source service');
      const iSchedule = col('update schedule');
      const iCurrencies = col('currencies');
      const iNext = col('next scheduled');
      const txt = (cells: Element[], i: number) =>
        i >= 0 && cells[i] ? (cells[i].textContent || '').replace(/\s+/g, ' ').trim() : '';

      return Array.from(table.querySelectorAll('tbody tr.o_data_row')).map((row) => {
        const cells = Array.from(row.querySelectorAll('td'));
        return {
          service: txt(cells, iService),
          interval: txt(cells, iSchedule),
          nextRun: txt(cells, iNext),
          currencies: txt(cells, iCurrencies),
        };
      }).filter((r) => !!r.service);
    }).catch(() => [] as ProviderRow[]);

    console.log(`  ✓ Currency Rate Provider rows loaded: ${rows.length}`);
    return rows;
  }

  /**
   * Open the Currency Rate Providers list and open ONE provider's form by service name.
   *
   * Ready when provider records exist on crm-mig (currently zero as of 2026-10-05). The empty-state
   * screen and form structure (service select, etc.) have been verified. Row click behavior is standard
   * Odoo form navigation.
   *
   * @param serviceName - the provider service name, e.g. "ECB"
   * @param timeout - max time to wait for the form (default: pageLoad)
   * @returns true when the form opened
   */
  async openProviderForm(serviceName: string, timeout: number = CommonUtils.waitTimes.pageLoad): Promise<boolean> {
    const listOpened = await this.openProvidersList(timeout);
    if (!listOpened) {
      console.log('  ! Currency Rate Providers list did not open');
      return false;
    }

    console.log(`  - Opening the "${serviceName}" provider form`);
    const row = this.rowByService(serviceName);
    const found = await row.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true).catch(() => false);
    if (!found) {
      console.log(`  ! No provider with service name "${serviceName}" found on the list`);
      return false;
    }
    await row.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.dismissErrorDialogWithRetry().catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);

    const formVisible = await this.formView().waitFor({ state: 'visible', timeout })
      .then(() => true).catch(() => false);
    console.log(`  ${formVisible ? '✓' : '!'} Provider "${serviceName}" form opened`);
    return formVisible;
  }

  /**
   * Create a new Currency Rate Provider with the given configuration.
   *
   * VERIFIED on crm-mig 2026-10-05: Form fields are service (select ECB only), interval_type, interval_number,
   * next_run, last_successful_run, currency_ids, available_currency_ids, company_id, active toggle.
   * The form opens with a populated default service (ECB) and next_run date.
   *
   * @param config - provider configuration
   * @returns true when the provider was created and saved
   */
  async createProvider(config: ProviderConfig): Promise<boolean> {
    console.log(`  - Creating a new Currency Rate Provider: ${config.service}`);
    const create = this.createButton();
    const canCreate = await create.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false);
    if (!canCreate) {
      console.log('  ! No "CREATE" button on the list');
      return false;
    }
    await create.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.dismissErrorDialogWithRetry().catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);

    const formVisible = await this.formView().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad })
      .then(() => true).catch(() => false);
    if (!formVisible) {
      console.log('  ! Provider form did not open after CREATE');
      return false;
    }
    await this.wait(CommonUtils.waitTimes.long);

    // Put the form into edit mode
    const edit = this.editButton();
    const canEdit = await edit.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false);
    if (canEdit) {
      await edit.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.wait(CommonUtils.waitTimes.long);
    }

    // VERIFIED - field names confirmed on crm-mig 2026-10-05
    if (config.service) {
      const serviceSelect = this.fieldSelect('service');
      const visible = await serviceSelect.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
        .then(() => true).catch(() => false);
      if (visible) {
        // `service` is a selection field whose ONLY option is ["ECB", "European Central Bank"]
        // (read from the crm-mig registry 2026-10-08). Playwright's selectOption(string) matches by
        // VALUE, so passing the human label "European Central Bank" matches nothing - and because the
        // call carried no timeout it inherited the 15-minute TEST timeout and hung there. That single
        // mistake killed all four block-1 specs on the 2026-10-07 run.
        // Try the label first, fall back to the raw value, and always bound the call.
        const t = { timeout: CommonUtils.waitTimes.savingPage };
        const chosen = await serviceSelect.selectOption({ label: config.service }, t)
          .then(() => `label="${config.service}"`)
          .catch(async () => serviceSelect.selectOption(config.service as string, t)
            .then(() => `value="${config.service}"`)
            .catch(() => ''));
        if (!chosen) {
          const opts = await serviceSelect.locator('option').allInnerTexts().catch(() => [] as string[]);
          console.log(`  ! Could not select service "${config.service}". Options offered: ${opts.join(' | ') || '(none)'}`);
          return false;
        }
        console.log(`  - Source Service selected by ${chosen}`);
        await this.wait(CommonUtils.waitTimes.medium);
      }
    }

    if (config.currencies) {
      const currencyInput = this.fieldInput('currency_ids');
      const visible = await currencyInput.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
        .then(() => true).catch(() => false);
      if (visible) {
        await currencyInput.fill(config.currencies);
        await this.wait(CommonUtils.waitTimes.medium);
      }
    }

    if (config.intervalType) {
      const typeSelect = this.fieldSelect('interval_type');
      const visible = await typeSelect.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
        .then(() => true).catch(() => false);
      if (visible) {
        // Bounded, and label-then-value like `service` above: interval_type's options are
        // [days|weeks|months] with labels Day(s)/Week(s)/Month(s), so a caller may pass either.
        const t2 = { timeout: CommonUtils.waitTimes.savingPage };
        await typeSelect.selectOption(config.intervalType as string, t2)
          .catch(async () => { await typeSelect.selectOption({ label: config.intervalType }, t2).catch(() => {}); });
        await this.wait(CommonUtils.waitTimes.medium);
      }
    }

    if (config.intervalNumber) {
      const numberInput = this.fieldInput('interval_number');
      const visible = await numberInput.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
        .then(() => true).catch(() => false);
      if (visible) {
        await numberInput.fill(config.intervalNumber);
        await this.wait(CommonUtils.waitTimes.medium);
      }
    }

    // Save the form
    const save = this.saveButton();
    const canSave = await save.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false);
    if (!canSave) {
      console.log('  ! No "SAVE" button on the form');
      return false;
    }
    await save.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.dismissErrorDialogWithRetry().catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  ✓ Currency Rate Provider "${config.service}" created and saved`);
    return true;
  }

  /**
   * Read the fields of an open Currency Rate Provider form.
   *
   * VERIFIED on crm-mig 2026-10-05: Form fields are service (select), interval_type, interval_number,
   * next_run (date), currency_ids, available_currency_ids, company_id, last_successful_run, active toggle.
   *
   * @param timeout - max time to wait (default: abnormalWait)
   * @returns the provider configuration as read from the form
   */
  async readProviderFields(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<ProviderConfig> {
    const readField = async (name: string): Promise<string> => {
      const input = this.fieldInput(name);
      const asInput = await input.isVisible({ timeout }).catch(() => false);
      if (asInput) return ((await input.inputValue({ timeout }).catch(() => '')) || '').trim();
      const span = this.fieldReadonly(name);
      return ((await span.innerText({ timeout }).catch(() => '')) || '').trim();
    };

    // VERIFIED - field names confirmed on crm-mig 2026-10-05
    const service = await readField('service');
    const currencies = await readField('currency_ids');
    const intervalType = await readField('interval_type');
    const intervalNumber = await readField('interval_number');
    const nextRun = await readField('next_run');
    const lastSuccessfulRun = await readField('last_successful_run');
    // `company_id` sits inside `<group groups="base.group_multi_company">` in the OCA form arch, so it
    // is rendered ONLY for a user in the Multi-Company group. An empty string therefore means "not on
    // screen for this user", never "no company" - the caller has to tell the two apart.
    const company = await readField('company_id');

    const result: ProviderConfig = { service, currencies, intervalType, intervalNumber, nextRun, lastSuccessfulRun, company };
    console.log(`  ✓ Provider form fields read: service="${service}"`);
    return result;
  }

  /**
   * Set "Last successful update" and/or "Next scheduled update" on an open provider form and save.
   *
   * Both fields are plain `date` fields on `res.currency.rate.provider` (confirmed against the crm-mig
   * registry 2026-10-13), so the value is a bare `MM/DD/YYYY` with NO time part - passing a datetime
   * string leaves the picker open and the save silently keeps the old value.
   *
   * The typing pattern (click, Ctrl+A, Backspace, type, Tab) is the one proven on
   * {@link ScheduledActionPage.setNextExecutionDate}: Tab commits the typed value and closes the date
   * picker, while Escape would abandon the edit and lose what was typed.
   *
   * @param dates - the values to write; omit a key to leave that field untouched
   * @returns true when the form saved and left edit mode
   */
  async setProviderDates(dates: { lastSuccessfulRun?: string; nextRun?: string }): Promise<boolean> {
    const edit = this.editButton();
    if (await edit.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false)) {
      await edit.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.standard);
    }

    const typeInto = async (fieldName: string, value: string): Promise<boolean> => {
      const input = this.fieldInput(fieldName);
      const editable = await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
        .then(() => true).catch(() => false);
      if (!editable) {
        console.log(`  ! The "${fieldName}" field did not become editable`);
        return false;
      }
      await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await input.press('Control+a').catch(() => {});
      await input.press('Backspace').catch(() => {});
      await this.page.keyboard.type(value, { delay: 30 });
      await this.page.keyboard.press('Tab').catch(() => {});
      await this.wait(CommonUtils.waitTimes.standard);
      console.log(`  - "${fieldName}" typed as "${value}"`);
      return true;
    };

    if (dates.lastSuccessfulRun !== undefined) {
      if (!(await typeInto('last_successful_run', dates.lastSuccessfulRun))) return false;
    }
    if (dates.nextRun !== undefined) {
      if (!(await typeInto('next_run', dates.nextRun))) return false;
    }

    const save = this.saveButton();
    const canSave = await save.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false);
    if (!canSave) {
      console.log('  ! No "SAVE" button on the provider form');
      return false;
    }
    await save.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.waitForFormSaved(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  ✓ Provider dates saved');
    return true;
  }

  /**
   * Whether the provider form's chatter panel is on screen.
   *
   * The OCA form arch carries `<div class="oe_chatter">` (read from the crm-mig registry 2026-10-13),
   * so this must be true before any "no failure message in the chatter" check is believed. Without
   * this guard a chatter that simply never rendered reads exactly like a clean one, and the negative
   * check passes vacuously.
   *
   * @param timeout - how long to wait for the panel (default: abnormalWait)
   * @returns true when the chatter panel is visible
   */
  async isChatterRendered(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    return this.chatterArea().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  }

  /**
   * Trigger an immediate manual rate update from an open provider form.
   *
   * VERIFIED on crm-mig 2026-10-05: There is NO "Update Rates" button on the provider CREATE/EDIT form.
   * The OCA module `currency_rate_update` 12.0.1.3.1 on this build does not expose a manual fetch button
   * on the form UI. To trigger a rate update on this build:
   * - Use {@link ScheduledActionPageMig.clickRunManually} on the "Currency Rates Update (OCA) daily" cron
   *   (action 11, ir.cron)
   * - Or check the Action dropdown if ir.actions.server methods have been added to the OCA module version
   *
   * This method throws an error to prevent caller confusion.
   *
   * @throws Error - always, as the button does not exist on this build
   */
  async clickUpdateRates(): Promise<boolean> {
    throw new Error(
      'clickUpdateRates() is not available on crm-mig (OCA currency_rate_update 12.0.1.3.1). ' +
      'The provider form has no "Update Rates" button. ' +
      'To update rates manually, use ScheduledActionPageMig.clickRunManually() on the "Currency Rates Update (OCA) daily" cron (action 11), ' +
      'or check if the Action dropdown or ir.actions.server expose a manual fetch method on this build.'
    );
  }

  /**
   * Delete an open provider by clicking the "Delete" button and confirming.
   *
   * VERIFIED on crm-mig 2026-10-05: Form structure is confirmed. Delete behavior is standard Odoo
   * form deletion with confirmation dialog. The button and dialog patterns follow Odoo conventions.
   *
   * @returns true when the provider was deleted
   */
  async deleteProvider(): Promise<boolean> {
    console.log('  - Deleting the open provider');
    const btn = this.deleteButton();
    const visible = await btn.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false);
    if (!visible) {
      console.log('  ! "Delete" button not found');
      return false;
    }
    await btn.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long);

    // Look for a confirmation dialog and click OK
    const confirmOk = this.page.locator('xpath=//div[contains(@class,"modal")]//button[normalize-space()="Ok" or normalize-space()="OK"]')
      .or(this.page.locator('.modal-footer button.btn-primary')).first();
    const confirmVisible = await confirmOk.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    if (confirmVisible) {
      await confirmOk.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.wait(CommonUtils.waitTimes.long);
    }
    console.log('  ✓ Provider deleted');
    return true;
  }

  /**
   * Read the option labels offered by the "Source Service" dropdown on the OPEN provider form.
   *
   * CRM-13405 step 2 expects the dropdown to list the available rate services, European Central Bank
   * among them. The form must already be in EDIT mode for the <select> to be reachable; this method
   * puts it there when it is not.
   *
   * @returns the option labels in the order the dropdown offers them ([] when the field is absent)
   */
  async getServiceOptions(): Promise<string[]> {
    console.log('  - Reading the "Source Service" dropdown options');
    await this.enterEditMode();
    const serviceSelect = this.fieldSelect('service');
    const visible = await serviceSelect
      .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true)
      .catch(() => false);
    if (!visible) {
      console.log('  ! The "service" field is not on the form');
      return [];
    }
    const labels = await serviceSelect.locator('option').allInnerTexts().catch(() => [] as string[]);
    return labels.map((l) => l.trim()).filter((l) => l.length > 0);
  }

  /**
   * Change "Source Service" and/or the scheduled update interval on the OPEN provider form, then SAVE.
   *
   * This is the EDIT counterpart of `createProvider` - CRM-13405 changes the source and the frequency
   * of the provider that already exists instead of creating one. Selection fields are set
   * label-first then value, and every call is bounded, for the reason recorded in `createProvider`:
   * an unbounded `selectOption` inherits the 15-minute test timeout and hangs there.
   *
   * @param config - any of service / intervalNumber / intervalType; omitted fields are left alone
   * @returns true when the form saved
   */
  async setServiceAndInterval(config: {
    service?: string;
    intervalNumber?: string;
    intervalType?: string;
  }): Promise<boolean> {
    console.log('  - Changing the provider source / interval');
    await this.enterEditMode();
    const bounded = { timeout: CommonUtils.waitTimes.savingPage };

    if (config.service) {
      const serviceSelect = this.fieldSelect('service');
      const visible = await serviceSelect
        .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
        .then(() => true)
        .catch(() => false);
      if (!visible) {
        console.log('  ! The "service" field is not on the form');
        return false;
      }
      const chosen = await serviceSelect
        .selectOption({ label: config.service }, bounded)
        .then(() => `label="${config.service}"`)
        .catch(async () =>
          serviceSelect
            .selectOption(config.service as string, bounded)
            .then(() => `value="${config.service}"`)
            .catch(() => '')
        );
      if (!chosen) {
        const opts = await serviceSelect.locator('option').allInnerTexts().catch(() => [] as string[]);
        console.log(`  ! Could not select service "${config.service}". Options offered: ${opts.join(' | ') || '(none)'}`);
        return false;
      }
      console.log(`  - Source Service selected by ${chosen}`);
      await this.wait(CommonUtils.waitTimes.medium);
    }

    if (config.intervalType) {
      const typeSelect = this.fieldSelect('interval_type');
      const visible = await typeSelect
        .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
        .then(() => true)
        .catch(() => false);
      if (visible) {
        await typeSelect
          .selectOption(config.intervalType as string, bounded)
          .catch(async () => {
            await typeSelect.selectOption({ label: config.intervalType }, bounded).catch(() => {});
          });
        await this.wait(CommonUtils.waitTimes.medium);
      }
    }

    if (config.intervalNumber) {
      const numberInput = this.fieldInput('interval_number');
      const visible = await numberInput
        .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
        .then(() => true)
        .catch(() => false);
      if (visible) {
        await numberInput.fill(config.intervalNumber, { timeout: CommonUtils.waitTimes.abnormalWait });
        await this.wait(CommonUtils.waitTimes.medium);
      }
    }

    return this.saveOpenForm();
  }

  /**
   * Add a currency to the provider's "Currencies" many2many on the OPEN provider form, then SAVE.
   *
   * `currency_ids` renders as a tags widget: typing into its input filters, Enter commits the
   * highlighted suggestion. The method verifies the tag really landed before saving, so a silently
   * ignored keystroke cannot be reported as success.
   *
   * @param currencyCode - e.g. "INR"
   * @returns true when the tag is present after the save
   */
  async addCurrencyToProvider(currencyCode: string): Promise<boolean> {
    console.log(`  - Adding "${currencyCode}" to the provider's Currencies`);
    await this.enterEditMode();
    const input = this.fieldInput('currency_ids');
    const visible = await input
      .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true)
      .catch(() => false);
    if (!visible) {
      console.log('  ! The "currency_ids" field is not on the form');
      return false;
    }
    await input.fill(currencyCode, { timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long);
    await this.page.keyboard.press('Enter');
    await this.wait(CommonUtils.waitTimes.long);

    const landed = await this.currencyTag(currencyCode)
      .isVisible({ timeout: CommonUtils.waitTimes.elementVisibility })
      .catch(() => false);
    if (!landed) {
      console.log(`  ! "${currencyCode}" did not become a tag - nothing is saved`);
      await this.page.keyboard.press('Escape').catch(() => {});
      return false;
    }
    return this.saveOpenForm();
  }

  /**
   * Remove a currency from the provider's "Currencies" many2many on the OPEN provider form, then SAVE.
   *
   * @param currencyCode - e.g. "INR"
   * @returns true when the tag is gone after the save
   */
  async removeCurrencyFromProvider(currencyCode: string): Promise<boolean> {
    console.log(`  - Removing "${currencyCode}" from the provider's Currencies`);
    await this.enterEditMode();
    const remove = this.currencyTagRemove(currencyCode);
    const visible = await remove
      .isVisible({ timeout: CommonUtils.waitTimes.elementVisibility })
      .catch(() => false);
    if (!visible) {
      console.log(`  ! No removable "${currencyCode}" tag on the form`);
      return false;
    }
    await remove.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long);
    return this.saveOpenForm();
  }

  /** One tag of the `currency_ids` widget, matched on its visible code. */
  protected readonly currencyTag = (currencyCode: string) =>
    this.page
      .locator(`xpath=//div[@name="currency_ids"]//span[contains(@class,"badge")][contains(normalize-space(),"${currencyCode}")]`)
      .or(this.page.locator(`div[name="currency_ids"] .badge:has-text("${currencyCode}")`))
      .first();

  /** The "x" that drops one tag of the `currency_ids` widget. */
  protected readonly currencyTagRemove = (currencyCode: string) =>
    this.page
      .locator(`xpath=//div[@name="currency_ids"]//span[contains(@class,"badge")][contains(normalize-space(),"${currencyCode}")]//span[contains(@class,"o_delete")]`)
      .or(this.page.locator(`div[name="currency_ids"] .badge:has-text("${currencyCode}") .o_delete`))
      .first();

  /** Put the open provider form into EDIT mode when it is not already there. */
  protected async enterEditMode(): Promise<void> {
    const edit = this.editButton();
    const editable = await edit.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false);
    if (editable) {
      await edit.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.wait(CommonUtils.waitTimes.long);
    }
  }

  /** Press SAVE on the open provider form and report whether it went through. */
  protected async saveOpenForm(): Promise<boolean> {
    const save = this.saveButton();
    const canSave = await save.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false);
    if (!canSave) {
      console.log('  ! No "SAVE" button on the form');
      return false;
    }
    await save.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.dismissErrorDialogWithRetry().catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    return true;
  }
}
