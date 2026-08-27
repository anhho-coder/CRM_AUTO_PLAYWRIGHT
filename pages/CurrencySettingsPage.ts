import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@/helpers/common.utils';

/** The "Automatic Currency Rates" settings the exchange-rate cases read or restore. */
export interface AutomaticRatesSettings {
  /** Whether the "Automatic Currency Rates" checkbox is ticked. */
  enabled: boolean;
  /** "Service" as rendered, e.g. "European Central Bank". */
  service: string;
  /** "Interval" as rendered, e.g. "Daily" / "Manually". */
  interval: string;
  /** "Next Run" as rendered, e.g. "08/19/2026" ('' when the field is empty). */
  nextRun: string;
  /**
   * "Last Sync Date" as rendered, e.g. "08/19/2026 05:15:47" ('' when nothing has synced yet).
   *
   * This field is NOT part of standard Odoo 12 and is not mentioned in the specification: it comes from the
   * live-rate module on this build, and its label is hidden while the value is empty. It is the most direct
   * answer to "when did rates last actually arrive", which makes it the cleanest proof that a refresh did
   * real work rather than returning quietly.
   */
  lastSync: string;
}

/**
 * Currency settings Page Object (Invoicing > Configuration > Settings, the "Currencies" block).
 *
 * The rate source, the update frequency and the next run live here - three fields stored on the company
 * and surfaced ONLY through this settings view (they are not on the Company form). The block also holds
 * the small circular refresh control next to "Next Run" which fetches rates immediately, ignoring the
 * schedule.
 *
 * ── Shared-environment safety ────────────────────────────────────────────────────────────────────
 * These settings are company-wide. Any case that changes them must capture the starting values with
 * {@link readSettings} and put them back with {@link restoreSettings} inside a `finally`. Leaving
 * "Interval" on "Manually" silently switches automatic rate arrival off for everyone.
 */
export class CurrencySettingsPage extends BasePage {
  // ─── Locators (XPath primary, CSS fallback) ───────────────────────────────
  private readonly settingsForm      = () =>
    this.page.locator('xpath=//div[contains(@class,"o_form_view")]//div[contains(@class,"app_settings_block")] | //div[contains(@class,"o_form_view")]')
      .or(this.page.locator('.o_form_view')).first();
  // A res.config.settings page does NOT use o_form_button_save: its SAVE is the control-panel button
  // named "execute" (and Discard is "cancel"). The old locator matched neither, so every save was skipped
  // silently and the page was left dirty, which then blocked navigation away from it.
  // Scoped tightly to name="execute" / name="cancel" and to what is VISIBLE, and deliberately WITHOUT an
  // .or() chain. The page also carries the ordinary form buttons (o_form_button_save / o_form_button_cancel)
  // which sit EARLIER in the DOM and are hidden here; an .or() chain closed with .first() resolves in DOM
  // order, so it kept picking the hidden one and every save timed out while the real control sat on screen.
  private readonly saveButton        = () => this.page.locator('button[name="execute"]:visible').first();
  private readonly settingsDiscardButton = () => this.page.locator('button[name="cancel"]:visible').first();
  // The "Currencies" settings block, anchored on its heading so the fields inside can be scoped to it.
  private readonly currenciesBlock   = () =>
    this.page.locator('xpath=//div[contains(@class,"app_settings_block")][.//h2[contains(normalize-space(.),"Currencies")]]')
      .or(this.page.locator('.app_settings_block:has(h2:has-text("Currencies"))')).first();
  private readonly automaticRatesBox = () =>
    this.page.locator('xpath=//input[@type="checkbox"][@name="group_multi_currency" or @name="module_currency_rate_live"] | //label[contains(normalize-space(.),"Automatic Currency Rates")]/preceding::input[@type="checkbox"][1]')
      .or(this.page.locator('input[type="checkbox"][name="module_currency_rate_live"]')).first();
  private readonly serviceSelect     = () =>
    this.page.locator('xpath=//select[@name="currency_provider"]').or(this.page.locator('select[name="currency_provider"]')).first();
  private readonly intervalSelect    = () =>
    this.page.locator('xpath=//select[@name="currency_interval_unit"]').or(this.page.locator('select[name="currency_interval_unit"]')).first();
  private readonly nextRunInput      = () =>
    this.page.locator('xpath=//input[@name="currency_next_execution_date"]').or(this.page.locator('input[name="currency_next_execution_date"]')).first();
  // Scoped to what is VISIBLE and without an .or() chain. A chain closed with .first() resolves in DOM
  // order, so it can settle on a hidden copy of the field and read back an empty string - which is exactly
  // what happened here: the value on file was 2026-08-19 while this read returned "".
  private readonly lastSyncField     = () =>
    this.page.locator('[name="last_currency_sync_date"]:visible').first();
  // The circular refresh control immediately to the right of "Next Run" (fetches rates right away).
  private readonly refreshRatesBtn   = () =>
    this.page.locator('xpath=//button[@name="update_currency_rates_manually"] | //button[contains(@class,"fa-refresh")] | //button[.//i[contains(@class,"fa-refresh")]]')
      .or(this.page.locator('button[name="update_currency_rates_manually"]')).first();

  constructor(page: Page) {
    super(page);
  }

  /**
   * Open Invoicing > Configuration > Settings and scroll the "Currencies" block into view.
   * @param timeout - max time to wait for the settings form (default: pageLoad)
   * @returns true when the Currencies block is on screen
   */
  async openInvoicingSettings(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<boolean> {
    const origin = new URL(this.page.url()).origin;
    console.log('  - Opening Invoicing > Configuration > Settings');
    // Odoo refuses to navigate away from a form with unsaved changes, so clear that state first or this
    // request is simply swallowed and the settings screen never opens.
    await this.discardFormIfInEditMode().catch(() => {});
    await this.dismissDiscardChangesDialog().catch(() => {});
    await this.page.evaluate(() => { (window as unknown as { onbeforeunload: unknown }).onbeforeunload = null; }).catch(() => {});
    await this.page.goto(`${origin}/web?#action=303&model=res.config.settings&view_type=form&menu_id=148`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    // A hash-only change is a same-document navigation and can leave the previous screen up; the reload
    // makes the boot into this action deterministic.
    await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.dismissErrorDialogWithRetry().catch(() => {});
    await this.settingsForm().waitFor({ state: 'visible', timeout }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);

    const block = this.currenciesBlock();
    const found = await block.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true).catch(() => false);
    if (found) {
      await block.scrollIntoViewIfNeeded({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.medium);
    }
    console.log(`  ${found ? '✓' : '!'} Invoicing Settings opened (Currencies block visible: ${found})`);
    return found;
  }

  /**
   * Read the "Automatic Currency Rates" settings, so a case can put them back afterwards.
   */
  async readSettings(): Promise<AutomaticRatesSettings> {
    const enabled = await this.automaticRatesBox().isChecked({ timeout: CommonUtils.waitTimes.long }).catch(() => false);

    let service = '';
    const svc = this.serviceSelect();
    if (await svc.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false)) {
      // Read the selected option's LABEL (what the tester sees), not the stored technical value.
      service = await svc.evaluate((el: HTMLSelectElement) => (el.selectedOptions[0]?.textContent || '').trim()).catch(() => '');
    }

    let interval = '';
    const itv = this.intervalSelect();
    if (await itv.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false)) {
      interval = await itv.evaluate((el: HTMLSelectElement) => (el.selectedOptions[0]?.textContent || '').trim()).catch(() => '');
    }

    let nextRun = '';
    const nxt = this.nextRunInput();
    if (await nxt.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false)) {
      nextRun = ((await nxt.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
    }

    let lastSync = '';
    const sync = this.lastSyncField();
    if (await sync.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false)) {
      const tag = await sync.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
      lastSync = tag === 'input'
        ? ((await sync.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim()
        : ((await sync.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    }

    const state: AutomaticRatesSettings = { enabled, service, interval, nextRun, lastSync };
    console.log(`  ✓ Automatic Currency Rates: enabled=${enabled}, Service="${service}", Interval="${interval}", Next Run="${nextRun}", Last Sync="${lastSync || '(empty)'}"`);
    return state;
  }

  /**
   * Read the labels the "Service" drop-down offers (the rate sources an administrator may choose).
   */
  async getServiceOptions(): Promise<string[]> {
    const svc = this.serviceSelect();
    const visible = await svc.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true).catch(() => false);
    if (!visible) {
      console.log('  ! The "Service" drop-down is not on screen');
      return [];
    }
    const options = await svc.evaluate((el: HTMLSelectElement) =>
      Array.from(el.options).map((o) => (o.textContent || '').trim()).filter((t) => !!t)
    ).catch(() => [] as string[]);
    console.log(`  ✓ "Service" offers (${options.length}): ${options.join(' | ')}`);
    return options;
  }

  /**
   * Pick a rate source by its visible label and save the settings page.
   * @param label - e.g. "European Central Bank"
   */
  async setService(label: string): Promise<boolean> {
    console.log(`  - Setting "Service" to "${label}"`);
    const svc = this.serviceSelect();
    await svc.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await svc.selectOption({ label });
    await this.wait(CommonUtils.waitTimes.standard);
    // The save result is RETURNED rather than discarded: a settings change that is not saved leaves the
    // page dirty, which then blocks navigation, and the failure surfaces far from its cause.
    return this.saveSettings();
  }

  /**
   * Pick an update frequency by its visible label and save the settings page.
   * @param label - e.g. "Daily" or "Manually"
   */
  async setInterval(label: string): Promise<boolean> {
    console.log(`  - Setting "Interval" to "${label}"`);
    const itv = this.intervalSelect();
    await itv.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await itv.selectOption({ label });
    await this.wait(CommonUtils.waitTimes.standard);
    return this.saveSettings();
  }

  /**
   * Type a value into "Next Run" and save.
   * @param value - the date in the field's rendered format, e.g. "08/18/2026"
   */
  async setNextRun(value: string): Promise<boolean> {
    console.log(`  - Setting "Next Run" to "${value}"`);
    const nxt = this.nextRunInput();
    await nxt.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await nxt.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await nxt.press('Control+a').catch(() => {});
    await nxt.press('Backspace').catch(() => {});
    await this.page.keyboard.type(value, { delay: 30 });
    // Tab commits the typed value and closes the date picker. Escape is deliberately NOT used: in Odoo it
    // can abandon the edit rather than just dismissing the picker.
    await this.page.keyboard.press('Tab').catch(() => {});
    await this.wait(CommonUtils.waitTimes.standard);
    const saved = await this.saveSettings();

    // Verify the value survived the save rather than trusting the click. A "Next Run" that silently kept
    // its old value leaves the update not due, and the scheduled job then returns early doing nothing.
    const onFile = ((await this.nextRunInput().inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
    const ok = saved && onFile === value;
    console.log(`  ${ok ? '✓' : '!'} "Next Run" now holds "${onFile}" (wanted "${value}", save clicked: ${saved})`);
    return ok;
  }

  /**
   * Click the circular refresh control next to "Next Run" - it fetches rates immediately and ignores
   * the schedule, so a case does not have to wait for the next run.
   * @param timeout - max time to wait for the fetch (default: elementAppear, an external fetch is slow)
   * @returns true when the control was pressed
   */
  async clickRefreshRatesNow(timeout: number = CommonUtils.waitTimes.elementAppear): Promise<boolean> {
    const button = this.refreshRatesBtn();
    const visible = await button.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true).catch(() => false);
    if (!visible) {
      console.log('  ! The refresh control next to "Next Run" is not on screen');
      return false;
    }
    console.log('  - Clicking the refresh control next to "Next Run" and waiting for the fetch');
    await button.click({ timeout }).catch(() => {});
    await this.waitForLoadingOverlayHidden(timeout).catch(() => {});
    await this.dismissErrorDialogWithRetry().catch(() => {});
    await this.wait(CommonUtils.waitTimes.extraLong);
    console.log('  ✓ Rate refresh completed');
    return true;
  }

  /**
   * Click SAVE on the settings page and wait for it to come back.
   */
  async saveSettings(): Promise<boolean> {
    const save = this.saveButton();
    const visible = await save.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true).catch(() => false);
    if (!visible) {
      // Report what the panel actually offers rather than shrugging: an unsaved settings page stays dirty,
      // and Odoo then blocks navigation away from it, which surfaces much later as an unrelated timeout.
      // Scan the WHOLE document and report HIDDEN buttons too. An earlier version listed only visible
      // buttons inside .o_control_panel and reported "none readable", which hid the real story: the
      // control exists but is not displayed.
      const buttons = await this.page.evaluate(() => {
        return Array.from(document.querySelectorAll('button')).map((b) => {
          const el = b as HTMLElement;
          const shown = el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';
          const text = (b.textContent || '').replace(/\s+/g, ' ').trim() || '(no text)';
          return `${shown ? 'VISIBLE' : 'hidden '} "${text}" [name=${b.getAttribute('name') || '-'} class=${el.className}]`;
        });
      }).catch(() => [] as string[]);
      console.log(`  ! No SAVE control found on the settings page. Buttons in the document (${buttons.length}):`);
      buttons.forEach((b) => console.log(`      ${b}`));
      return false;
    }
    await save.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.waitForLoadingOverlayHidden(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.dismissErrorDialogWithRetry().catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  ✓ Settings saved');
    return true;
  }

  /**
   * Leave the settings page without saving. Odoo blocks navigation away from a dirty settings form, so a
   * case that gave up half way must clear it or the NEXT screen it asks for will never open.
   */
  async discardSettings(): Promise<void> {
    const discard = this.settingsDiscardButton();
    if (await discard.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false)) {
      await discard.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.waitForLoadingOverlayHidden(CommonUtils.waitTimes.savingPage).catch(() => {});
      await this.wait(CommonUtils.waitTimes.long);
      console.log('  OK Settings page discarded');
    }
  }

  /**
   * Put the "Automatic Currency Rates" settings back to a captured state. Call from a `finally` block:
   * leaving "Interval" on "Manually" turns automatic rate arrival off for the whole environment.
   * @param state - the state captured by {@link readSettings}
   */
  async restoreSettings(state: AutomaticRatesSettings): Promise<void> {
    console.log(`  - Restoring Automatic Currency Rates: Service="${state.service}", Interval="${state.interval}", Next Run="${state.nextRun}"`);
    await this.openInvoicingSettings().catch(() => {});
    if (state.service) await this.setService(state.service).catch(() => false);
    if (state.interval) await this.setInterval(state.interval).catch(() => false);
    if (state.nextRun) await this.setNextRun(state.nextRun).catch(() => false);
    const after = await this.readSettings().catch(() => null);
    const ok = !!after && after.service === state.service && after.interval === state.interval;
    console.log(`  ${ok ? '✓' : '!'} Automatic Currency Rates restored (Service/Interval match: ${ok})`);
  }
}
