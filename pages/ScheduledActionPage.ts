import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@/helpers/common.utils';

/** The fields of a scheduled action that the exchange-rate cases read or restore. */
export interface ScheduledActionState {
  /** "Next Execution Date" exactly as rendered, e.g. "08/19/2026 05:15:16". */
  nextExecution: string;
  /** "Execute Every" interval number, e.g. "1". */
  intervalNumber: string;
  /** "Execute Every" interval unit, e.g. "Days". */
  intervalUnit: string;
  /** Whether "Repeat Missed" is ticked. */
  repeatMissed: boolean;
}

/**
 * Scheduled Actions Page Object (Settings > Technical > Automation > Scheduled Actions, model ir.cron).
 *
 * Used by the exchange-rate cases to drive the "Currency: rate update" job on demand: set its
 * "Next Execution Date" to today so the job is due, then press "RUN MANUALLY".
 *
 * ── Shared-environment safety ────────────────────────────────────────────────────────────────────
 * This screen changes a job the WHOLE pre-production environment shares. Every case that touches it
 * must capture the state first with {@link readState} and put it back with {@link restoreState} inside
 * a `finally`, so a failing assertion cannot leave the job on a wrong schedule for everyone else.
 * `SKIP_MUTATING_TESTS` in the specs is the kill switch for the whole group.
 *
 * Developer mode must be on for the Technical menu to exist; navigation is by the action hash
 * (action=11, model=ir.cron), which does not depend on the menu being rendered.
 */
export class ScheduledActionPage extends BasePage {
  // ─── Locators (XPath primary, CSS fallback) ───────────────────────────────
  private readonly listTable       = () => this.page.locator('xpath=//table[contains(@class,"o_list_view")]').or(this.page.locator('table.o_list_view')).first();
  private readonly anyDataRow      = () => this.page.locator('xpath=//tr[contains(@class,"o_data_row")]').or(this.page.locator('tr.o_data_row')).first();
  private readonly searchInput     = () => this.page.locator('xpath=//div[contains(@class,"o_searchview")]//input').or(this.page.locator('.o_searchview input')).first();
  private readonly rowByName       = (name: string) =>
    this.page.locator(`xpath=//tr[contains(@class,"o_data_row")][td[normalize-space()="${name}"]]`)
      .or(this.page.locator(`tr.o_data_row:has(td:text-is("${name}"))`)).first();
  private readonly formView        = () => this.page.locator('xpath=//div[contains(@class,"o_form_view")]').or(this.page.locator('.o_form_view')).first();
  private readonly cronEditButton  = () => this.page.locator('xpath=//button[contains(@class,"o_form_button_edit")]').or(this.page.locator('button.o_form_button_edit')).first();
  private readonly saveButton      = () => this.page.locator('xpath=//button[contains(@class,"o_form_button_save")]').or(this.page.locator('button.o_form_button_save')).first();
  private readonly runManuallyBtn  = () =>
    this.page.locator('xpath=//button[contains(normalize-space(.),"RUN MANUALLY") or contains(normalize-space(.),"Run Manually")]')
      .or(this.page.locator('button:has-text("Run Manually")')).first();
  private readonly fieldInput      = (fieldName: string) =>
    this.page.locator(`xpath=//input[@name="${fieldName}"]`).or(this.page.locator(`input[name="${fieldName}"]`)).first();
  private readonly fieldReadonly   = (fieldName: string) =>
    this.page.locator(`xpath=//span[@name="${fieldName}"] | //div[@name="${fieldName}"]`)
      .or(this.page.locator(`span[name="${fieldName}"], div[name="${fieldName}"]`)).first();
  private readonly fieldSelect     = (fieldName: string) =>
    this.page.locator(`xpath=//select[@name="${fieldName}"]`).or(this.page.locator(`select[name="${fieldName}"]`)).first();
  private readonly checkboxInput   = (fieldName: string) =>
    this.page.locator(`xpath=//input[@type="checkbox"][@name="${fieldName}"]`).or(this.page.locator(`input[type="checkbox"][name="${fieldName}"]`)).first();

  constructor(page: Page) {
    super(page);
  }

  /**
   * Open Settings > Technical > Automation > Scheduled Actions and open one job by its exact name.
   * Navigation is by the action hash so it does not depend on the Technical menu being rendered.
   * @param actionName - the job name, e.g. "Currency: rate update"
   * @param timeout - max time to wait for each stage (default: pageLoad)
   * @returns true when the job's form opened
   */
  async openScheduledAction(actionName: string, timeout: number = CommonUtils.waitTimes.pageLoad): Promise<boolean> {
    const origin = new URL(this.page.url()).origin;
    console.log(`  - Opening Settings > Technical > Automation > Scheduled Actions to find "${actionName}"`);
    // Odoo refuses to navigate away from a form with unsaved changes, and a settings page counts: the
    // request is swallowed, this list never opens, and the job then looks like it "was not found". Clear
    // that state before asking for a new screen.
    await this.discardFormIfInEditMode().catch(() => {});
    await this.dismissDiscardChangesDialog().catch(() => {});
    await this.page.evaluate(() => { (window as unknown as { onbeforeunload: unknown }).onbeforeunload = null; }).catch(() => {});
    await this.page.goto(`${origin}/web?#action=11&model=ir.cron&view_type=list&menu_id=4`, { waitUntil: 'domcontentloaded' });
    // A hash change alone is a same-document navigation, so the client can keep the previous screen on
    // display. The reload makes the boot into this action deterministic.
    await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.dismissErrorDialogWithRetry().catch(() => {});
    await this.listTable().waitFor({ state: 'visible', timeout }).catch(() => {});
    await this.anyDataRow().waitFor({ state: 'visible', timeout }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    const onList = await this.listTable().isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false);
    console.log(`  - Scheduled Actions list on screen: ${onList}`);

    // Type the name through real key events so Odoo builds the search facet (fill() alone applies none).
    const input = this.searchInput();
    const searchable = await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true).catch(() => false);
    if (searchable) {
      await input.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await input.press('Control+a').catch(() => {});
      await input.press('Backspace').catch(() => {});
      await this.page.keyboard.type(actionName, { delay: 30 });
      await this.wait(CommonUtils.waitTimes.long);
      await this.page.keyboard.press('Enter');
      await this.wait(CommonUtils.waitTimes.long);
    }

    const row = this.rowByName(actionName);
    const rowVisible = await row.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true).catch(() => false);
    if (!rowVisible) {
      console.log(`  ! The scheduled action "${actionName}" was not found in the list`);
      return false;
    }
    await row.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.dismissErrorDialogWithRetry().catch(() => {});
    const onForm = await this.formView().waitFor({ state: 'visible', timeout })
      .then(() => true).catch(() => false);
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  ${onForm ? '✓' : '!'} Scheduled action "${actionName}" opened (form visible: ${onForm})`);
    return onForm;
  }

  /**
   * Read the job's current schedule fields, so a case can put them back afterwards.
   * @returns the captured state
   */
  async readState(): Promise<ScheduledActionState> {
    const readField = async (name: string): Promise<string> => {
      const input = this.fieldInput(name);
      const asInput = await input.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false);
      if (asInput) return ((await input.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
      const span = this.fieldReadonly(name);
      return ((await span.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    };

    const nextExecution = await readField('nextcall');
    const intervalNumber = await readField('interval_number');
    let intervalUnit = '';
    const unitSelect = this.fieldSelect('interval_type');
    if (await unitSelect.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false)) {
      intervalUnit = ((await unitSelect.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
    } else {
      intervalUnit = await readField('interval_type');
    }
    const box = this.checkboxInput('doall');
    const repeatMissed = await box.isChecked({ timeout: CommonUtils.waitTimes.long }).catch(() => false);

    const state: ScheduledActionState = { nextExecution, intervalNumber, intervalUnit, repeatMissed };
    console.log(`  ✓ Scheduled action state: Next Execution="${nextExecution}", Execute Every="${intervalNumber} ${intervalUnit}", Repeat Missed=${repeatMissed}`);
    return state;
  }

  /**
   * Put the form into edit mode, set "Next Execution Date" and save.
   * @param value - the value to type, e.g. "08/18/2026 05:15:16" (the field's own rendered format)
   * @returns true when the value was written and saved
   */
  async setNextExecutionDate(value: string): Promise<boolean> {
    console.log(`  - Setting "Next Execution Date" to "${value}"`);
    const edit = this.cronEditButton();
    if (await edit.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false)) {
      await edit.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.standard);
    }
    const input = this.fieldInput('nextcall');
    const editable = await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true).catch(() => false);
    if (!editable) {
      console.log('  ! The "Next Execution Date" field did not become editable');
      return false;
    }
    await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await input.press('Control+a').catch(() => {});
    await input.press('Backspace').catch(() => {});
    await this.page.keyboard.type(value, { delay: 30 });
    // Tab commits the typed value and closes the date picker. Escape is deliberately NOT used: in Odoo it
    // can abandon the edit (and in an editable list it abandons the whole row), losing what was typed.
    await this.page.keyboard.press('Tab').catch(() => {});
    await this.wait(CommonUtils.waitTimes.standard);

    const save = this.saveButton();
    const saved = await save.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false);
    if (saved) {
      await save.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.waitForFormSaved(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  ✓ "Next Execution Date" set to "${value}"`);
    return true;
  }

  /**
   * Press "RUN MANUALLY" on the open scheduled action and wait for the run to come back.
   * The job is synchronous, so the button returns only once the run has finished.
   * @param timeout - max time to wait for the run (default: elementAppear, a rate fetch can take minutes)
   * @returns true when the button was pressed
   */
  async clickRunManually(timeout: number = CommonUtils.waitTimes.elementAppear): Promise<boolean> {
    // A form left in edit mode hides the button, so make sure the record is saved / readonly first.
    await this.discardFormIfInEditMode().catch(() => {});
    const button = this.runManuallyBtn();
    const visible = await button.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true).catch(() => false);
    if (!visible) {
      console.log('  ! The "RUN MANUALLY" button is not visible on this form');
      return false;
    }
    console.log('  - Clicking "RUN MANUALLY" and waiting for the job to finish');
    await button.click({ timeout }).catch(() => {});
    await this.waitForLoadingOverlayHidden(timeout).catch(() => {});
    await this.dismissErrorDialogWithRetry().catch(() => {});
    await this.wait(CommonUtils.waitTimes.extraLong);
    console.log('  ✓ "RUN MANUALLY" completed');
    return true;
  }

  /**
   * Put the job's schedule back to a previously captured state. Call this from a `finally` block so a
   * failing assertion never leaves the shared job on the wrong schedule.
   * @param state - the state captured by {@link readState}
   */
  async restoreState(state: ScheduledActionState): Promise<void> {
    console.log(`  - Restoring the scheduled action: Next Execution -> "${state.nextExecution}"`);
    if (!state.nextExecution) {
      console.log('  ! No captured "Next Execution Date" to restore - leaving the job as it is');
      return;
    }
    const ok = await this.setNextExecutionDate(state.nextExecution);
    console.log(`  ${ok ? '✓' : '!'} Scheduled action restored (Next Execution="${state.nextExecution}")`);
  }
}
