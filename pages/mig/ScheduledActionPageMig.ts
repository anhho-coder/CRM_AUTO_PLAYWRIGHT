import { ScheduledActionPage } from '@pages';
import { CommonUtils } from '@/helpers/common.utils';
import { Page } from '@playwright/test';

/**
 * ScheduledActionPageMig - fork of ScheduledActionPage for the O12 CE migration server.
 *
 * The Mig instance uses a SIDEBAR backend theme (body class `mk_sidebar_type_large`) instead of the
 * standard top navbar. The base ScheduledActionPage works as-is on the sidebar theme - all navigation
 * is by action hash (model=ir.cron, action=11) which does not depend on the navbar menu being rendered.
 *
 * This fork exists for consistency with other Mig page objects and to provide a clear import path
 * (@pages/mig). All methods are inherited from the base class.
 *
 * VERIFIED on crm-mig 2026-10-05:
 * - Action 11 opens the Scheduled Actions list correctly
 * - The OCA cron "Currency Rates Update (OCA) daily" is found via search in the list
 * - The cron's form opens correctly with all fields readable
 * - The "RUN MANUALLY" button is visible and functional
 * - All inherited methods (openScheduledAction, readState, setNextExecutionDate, restoreState,
 *   clickRunManually) are ready to use on crm-mig
 *
 * 2026-10-26: ADDED (no inherited method changed) - clickRunManuallyStrict, openScheduledActionsList, countListedActionsNamed,
 * openListedAction, readActiveMarker, readFormFieldText, readNextExecutionEpochMs - so CRM-11857_9.2 can
 * walk list -> row -> form as separate steps and assert the active marker as rendered ("On"/"Off")
 * instead of a boolean that defaults to false when the marker is missing.
 */
export class ScheduledActionPageMig extends ScheduledActionPage {
  // --- Locators added 2026-10-26 for CRM-11857_9.2 (XPath primary, CSS fallback) ---
  // DOM read on crm-mig 2026-10-26 (EXPLORE-20261026_10): the cron form's button box holds
  // <button name="toggle_active"><div name="active"><span class="o_stat_text o_not_hover">On</span>...;
  // the readonly fields render as <span name="..."> / <div name="...">.
  private readonly migListTable = () =>
    this.page.locator('xpath=//table[contains(@class,"o_list_view")]').or(this.page.locator('table.o_list_view')).first();
  private readonly migSearchInput = () =>
    this.page.locator('xpath=//div[contains(@class,"o_searchview")]//input').or(this.page.locator('.o_searchview input')).first();
  private readonly migRowsByName = (name: string) =>
    this.page.locator(`xpath=//tr[contains(@class,"o_data_row")][td[normalize-space()="${name}"]]`)
      .or(this.page.locator(`tr.o_data_row:has(td:text-is("${name}"))`));
  private readonly migFormView = () =>
    this.page.locator('xpath=//div[contains(@class,"o_form_view")]').or(this.page.locator('.o_form_view')).first();
  private readonly migActiveMarker = () =>
    this.page.locator('xpath=//*[@name="active"]//span[contains(concat(" ",normalize-space(@class)," ")," o_not_hover ")]')
      .or(this.page.locator('[name="active"] .o_stat_text.o_not_hover')).first();
  private readonly migFieldText = (fieldName: string) =>
    this.page.locator(`xpath=//div[contains(@class,"o_form_view")]//span[@name="${fieldName}"] | //div[contains(@class,"o_form_view")]//div[@name="${fieldName}"]`)
      .or(this.page.locator(`.o_form_view span[name="${fieldName}"], .o_form_view div[name="${fieldName}"]`)).first();

  private readonly migRunManuallyBtn = () =>
    this.page.locator('xpath=//button[@name="method_direct_trigger"]')
      .or(this.page.locator('button[name="method_direct_trigger"]')).first();
  /** An Odoo error/warning dialog (server traceback, UserError, ValidationError). */
  private readonly migErrorDialog = () =>
    this.page.locator('xpath=//div[contains(@class,"modal-dialog")][.//div[contains(@class,"o_dialog_warning") or contains(@class,"o_error_detail")] or .//h4[contains(normalize-space(),"Error") or contains(normalize-space(),"Warning")]]')
      .or(this.page.locator('.modal-dialog:has(.o_dialog_warning), .modal-dialog:has(.o_error_detail)')).first();

  constructor(page: Page) {
    super(page);
  }

  /**
   * Press "RUN MANUALLY" on the open cron form and report honestly whether it ran (added 2026-10-26).
   *
   * Unlike the inherited {@link ScheduledActionPage.clickRunManually} - which swallows a failed click, dismisses
   * any error dialog and returns true - this returns ran = false when the button is missing, the click throws,
   * or an error/warning dialog is on screen after the run; the dialog text is returned (not dismissed), so the
   * evidence screenshot still shows it. It does not prove the job DID something: callers pair it with a
   * read-back of the state the job must change (e.g. the provider's Last successful update).
   * @param timeout - bound for the click and for the run to come back (default: elementAppear)
   */
  async clickRunManuallyStrict(timeout: number = CommonUtils.waitTimes.elementAppear): Promise<{ ran: boolean; error: string }> {
    await this.discardFormIfInEditMode().catch(() => {});
    const button = this.migRunManuallyBtn();
    const visible = await button.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    if (!visible) return { ran: false, error: 'the "RUN MANUALLY" button (method_direct_trigger) is not on the form' };
    let clickError = '';
    await button.click({ timeout }).catch((e: Error) => { clickError = String(e?.message ?? e).split('\n')[0]; });
    if (clickError) return { ran: false, error: `click failed: ${clickError}` };
    await this.waitForLoadingOverlayHidden(timeout).catch(() => {});
    await this.wait(CommonUtils.waitTimes.extraLong);
    const dialog = this.migErrorDialog();
    if (await dialog.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false)) {
      const text = ((await dialog.innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      return { ran: false, error: `error dialog after the run: ${text.slice(0, 300)}` };
    }
    console.log('  OK "RUN MANUALLY" came back with no error dialog');
    return { ran: true, error: '' };
  }

  /**
   * Open Settings > Technical > Automation > Scheduled Actions (the LIST only - no record is opened).
   * Same route as {@link ScheduledActionPage.openScheduledAction}, resolved by XML id.
   * @returns true when the list table is on screen
   */
  async openScheduledActionsList(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<boolean> {
    const origin = new URL(this.page.url()).origin;
    console.log('  - Opening Settings > Technical > Automation > Scheduled Actions (list)');
    await this.discardFormIfInEditMode().catch(() => {});
    await this.dismissDiscardChangesDialog().catch(() => {});
    await this.page.goto(`${origin}/web?#action=${await this.xmlId('base.ir_cron_act')}&model=ir.cron&view_type=list&menu_id=${await this.xmlId('base.menu_administration')}`,
      { waitUntil: 'domcontentloaded', timeout });
    // A hash route is a same-document navigation - reload so the client really boots into this action.
    await this.page.reload({ waitUntil: 'domcontentloaded', timeout }).catch(() => {});
    await this.dismissErrorDialogWithRetry().catch(() => {});
    const onList = await this.migListTable().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  ${onList ? 'OK' : '!'} Scheduled Actions list on screen: ${onList}`);
    return onList;
  }

  /**
   * Type a name into the open list's search box (real key events, so Odoo builds the facet) and count the
   * rows whose name cell equals it exactly.
   * @returns the number of rows named exactly `actionName`
   */
  async countListedActionsNamed(actionName: string): Promise<number> {
    const input = this.migSearchInput();
    const searchable = await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    if (!searchable) {
      console.log('  ! The Scheduled Actions search box is not on screen');
      return 0;
    }
    await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    // Clear only typed text: Backspace in an EMPTY Odoo search box deletes the last FACET - it removed the default
    // "All" facet (archived jobs included) and the archived sync job of CRM-12144_7.5 then listed 0 rows (2026-10-26).
    if ((await input.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) !== '') {
      await input.press('Control+a', { timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await input.press('Backspace', { timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    }
    await this.page.keyboard.type(actionName, { delay: 30 });
    await this.wait(CommonUtils.waitTimes.long);
    await this.page.keyboard.press('Enter');
    await this.wait(CommonUtils.waitTimes.long);
    await this.migRowsByName(actionName).first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const count = await this.migRowsByName(actionName).count().catch(() => 0);
    console.log(`  - Rows named "${actionName}" on the Scheduled Actions list: ${count}`);
    return count;
  }

  /** Click the listed row named exactly `actionName` and wait for its form. */
  async openListedAction(actionName: string, timeout: number = CommonUtils.waitTimes.pageLoad): Promise<boolean> {
    const row = this.migRowsByName(actionName).first();
    const visible = await row.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    if (!visible) {
      console.log(`  ! No row named "${actionName}" to open`);
      return false;
    }
    await row.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.dismissErrorDialogWithRetry().catch(() => {});
    const onForm = await this.migFormView().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  ${onForm ? 'OK' : '!'} "${actionName}" form opened: ${onForm}`);
    return onForm;
  }

  /**
   * The active marker of the open cron form, exactly as rendered in its button box: "On" for an active
   * job, "Off" for an inactive one (Odoo 12 boolean_button). '' when the marker is not on screen.
   */
  async readActiveMarker(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<string> {
    const marker = this.migActiveMarker();
    const shown = await marker.waitFor({ state: 'attached', timeout }).then(() => true).catch(() => false);
    if (!shown) return '';
    return ((await marker.textContent({ timeout }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  /** The rendered text of one readonly field on the open cron form (e.g. "xml_id", "model_name", "code"). */
  async readFormFieldText(fieldName: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<string> {
    const field = this.migFieldText(fieldName);
    const there = await field.waitFor({ state: 'attached', timeout }).then(() => true).catch(() => false);
    if (!there) return '';
    return ((await field.innerText({ timeout }).catch(() => '')) || '').replace(/​/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * "Next Execution Date" of the open cron form as epoch milliseconds. The web client renders a datetime in
   * the BROWSER's timezone ("MM/DD/YYYY HH:MM:SS"), so the text is converted inside the browser, in the
   * same timezone it was rendered in. NaN when the field is empty or unreadable.
   */
  async readNextExecutionEpochMs(): Promise<{ text: string; epochMs: number }> {
    const text = await this.readFormFieldText('nextcall');
    const epochMs = await this.page.evaluate((t: string) => {
      const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(t);
      return m ? new Date(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +m[6]).getTime() : NaN;
    }, text).catch(() => NaN);
    return { text, epochMs };
  }
}
