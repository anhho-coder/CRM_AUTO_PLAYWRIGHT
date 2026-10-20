import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * SE Support Page Object - the "New Ticket" window opened from the Opportunity form's
 * "REQUEST SE SUPPORT" button (Salesperson requests SE support on a deal).
 *
 * The window is an Odoo modal dialog with the fields: Subject, Meeting Time, Description,
 * Meeting link, Support type (native <select>), plus SAVE / CANCEL. This TC only sets Subject,
 * Description and Support type. Every locator is scoped to the modal (so a page-wide "label
 * Subject" ancestor match can't resolve to a background field) and uses XPath primary + CSS fallback.
 */
export class SESupportPage extends BasePage {
  // The "New Ticket" modal dialog - all field locators are scoped under it.
  private readonly modal = () => this.page.locator('div.modal.show, div.modal-dialog').first();

  // Subject (char, placeholder "Subject:").
  private readonly subjectInput = () =>
    this.modal()
      .locator("input[placeholder='Subject:'], input[name='subject'], input[name='name']")
      .or(this.modal().locator("xpath=.//label[normalize-space()='Subject']/following::input[1]"))
      .first();

  // Description (input or textarea, after the "Description" label).
  private readonly descriptionInput = () =>
    this.modal()
      .locator("textarea[name='description']")
      .or(this.modal().locator("xpath=.//label[normalize-space()='Description']/following::*[self::textarea or self::input][1]"))
      .first();

  // Support type - native <select> after the "Support type" label.
  private readonly supportTypeSelect = () =>
    this.modal()
      .locator("select[name='support_type'], select[name='x_support_type']")
      .or(this.modal().locator("xpath=.//label[contains(normalize-space(),'Support type')]/following::select[1]"))
      .first();

  // Support type - many2one/autocomplete fallback (only if it is not a native <select>).
  private readonly supportTypeInput = () =>
    this.modal().locator("xpath=.//label[contains(normalize-space(),'Support type')]/following::input[1]").first();

  private readonly dropdownOption = () =>
    this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]');

  // SAVE button in the modal footer.
  private readonly saveButton = () =>
    this.modal()
      .getByRole('button', { name: /SAVE/i })
      .or(this.modal().locator("xpath=.//button[normalize-space(.)='Save' or normalize-space(.)='SAVE']"))
      .first();

  constructor(page: Page) {
    super(page);
  }

  /** Wait for the "New Ticket" window to be open and interactive. */
  async waitForWindowOpen(): Promise<void> {
    await this.modal().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    // The Subject field being visible confirms the modal is rendered and editable.
    await this.subjectInput().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.medium);
  }

  /** Fill the Subject field. */
  async fillSubject(subject: string): Promise<void> {
    const input = this.subjectInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.short);
    await input.fill(subject);
    console.log(`  - Subject set to "${subject}"`);
  }

  /** Fill the Description field. */
  async fillDescription(description: string): Promise<void> {
    const input = this.descriptionInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.short);
    await input.fill(description);
    console.log(`  - Description set to "${description}"`);
  }

  /**
   * Set the "Support type" field. Handles both a native <select> and a many2one autocomplete input.
   * @param supportType - e.g. "Online deployment session"
   */
  async selectSupportType(supportType: string): Promise<void> {
    const select = this.supportTypeSelect();
    if (await select.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false)) {
      await select.selectOption({ label: supportType }).catch(async () => {
        await select.selectOption(supportType);
      });
      console.log(`  - Support type set to "${supportType}" (select)`);
      await this.wait(CommonUtils.waitTimes.medium);
      return;
    }

    // Otherwise treat it as a many2one autocomplete input.
    const input = this.supportTypeInput();
    await input.click();
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.short);
    await input.fill(supportType);
    await this.wait(CommonUtils.waitTimes.standard);
    const option = this.dropdownOption().filter({ hasText: new RegExp(supportType, 'i') }).first();
    const optionVisible = await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    if (optionVisible) {
      await option.click();
    } else {
      await this.page.keyboard.press('Enter');
    }
    console.log(`  - Support type set to "${supportType}" (autocomplete)`);
    await this.wait(CommonUtils.waitTimes.medium);
  }

  // ─── pre-sale-7.7 .. 7.15: read the window, negative saves, failure / double-click ───
  // The window title and its form labels / footer buttons (all scoped to the modal).
  private readonly modalTitle = () =>
    this.modal().locator("xpath=.//*[contains(@class,'modal-title')]").or(this.modal().locator('.modal-title')).first();
  private readonly modalLabels = () =>
    this.modal().locator("xpath=.//label[contains(@class,'o_form_label')]").or(this.modal().locator('label.o_form_label'));
  private readonly modalFooterButtons = () =>
    this.modal().locator("xpath=.//footer//button | .//div[contains(@class,'modal-footer')]//button").or(this.modal().locator('footer button, .modal-footer button'));
  // A field widget flagged invalid by Odoo's client-side required check.
  private readonly invalidFields = () =>
    this.modal().locator("xpath=.//*[contains(@class,'o_field_invalid')][@name]").or(this.modal().locator('.o_field_invalid[name]'));
  // The warning toast Odoo raises on a rejected save ("The following fields are invalid: ...").
  // Token-exact class match: a plain contains(@class,'o_notification') also hits the inner
  // o_notification_content div and drops the toast's title line.
  private readonly warningToast = () =>
    this.page.locator("xpath=//div[contains(concat(' ',normalize-space(@class),' '),' o_notification ')]").or(this.page.locator('div.o_notification')).last();
  // Meeting Time date-time picker input (pre-filled with a default on pre-production).
  private readonly meetingTimeInput = () =>
    this.modal().locator("xpath=.//div[@name='meeting_time']//input | .//input[@name='meeting_time']").or(this.modal().locator("div[name='meeting_time'] input")).first();
  // An error dialog stacked ABOVE the New Ticket window (e.g. "Odoo Server Error").
  private readonly stackedErrorDialog = () =>
    this.page.locator("xpath=//div[contains(@class,'modal') and contains(@class,'show')][.//*[contains(@class,'modal-title')][contains(normalize-space(),'Error') or contains(normalize-space(),'Warning')]]")
      .or(this.page.locator('div.modal.show:has(.o_dialog_error), div.modal.show:has(.o_error_detail)')).last();

  /** Title of the open window, e.g. "New Ticket". */
  async getWindowTitle(): Promise<string> {
    return ((await this.modalTitle().textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  /** The window's field labels, in on-screen order (e.g. Subject, Meeting Time, Description, ...). */
  async getFieldLabels(): Promise<string[]> {
    const raw = await this.modalLabels().allTextContents();
    return raw.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  /**
   * Every labelled input control of the window, in on-screen order: its label, the HTML control kind
   * (input / textarea / select / datepicker) and whether Odoo marks it required (o_required_modifier).
   * Each label is joined to its widget through the label's `for` -> the widget's `id`.
   */
  async getFieldControls(): Promise<Array<{ label: string; field: string; kind: string; required: boolean }>> {
    await this.subjectInput().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    return this.modalLabels().evaluateAll((labels) =>
      labels.map((lab) => {
        const forId = lab.getAttribute('for') || '';
        const el = forId ? document.getElementById(forId) : null;
        const widget = el ? (el.closest('[name]') as HTMLElement | null) || el : null;
        const kind = !el ? 'none'
          : el.classList.contains('datetimepicker-input') || (widget && widget.classList.contains('o_datepicker')) ? 'datepicker'
          : el.tagName.toLowerCase();
        const required = !!(widget && widget.classList.contains('o_required_modifier')) || !!(el && el.classList.contains('o_required_modifier'));
        return {
          label: (lab.textContent || '').replace(/\s+/g, ' ').trim(),
          field: (widget && widget.getAttribute('name')) || (el && el.getAttribute('name')) || '',
          kind,
          required,
        };
      })
    );
  }

  /**
   * Empty the Meeting Time field (pre-production pre-fills it with a default date-time), then Tab out
   * so the empty value is committed. Returns the value it held before clearing.
   */
  async clearMeetingTime(): Promise<string> {
    const input = this.meetingTimeInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const before = (await input.inputValue().catch(() => '')).trim();
    await input.click();
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.short);
    await this.page.keyboard.press('Tab');
    await this.wait(CommonUtils.waitTimes.medium);
    console.log(`  - Meeting Time cleared (was "${before}")`);
    return before;
  }

  /** Current values of the window's inputs (Support type = the selected option's label, '' when none). */
  async getFieldValues(): Promise<{ subject: string; description: string; supportType: string; meetingTime: string; meetingLink: string }> {
    const val = async (sel: string) => (await this.modal().locator(sel).first().inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')).trim();
    const select = this.supportTypeSelect();
    const supportType = ((await select.evaluate((s) => {
      const el = s as HTMLSelectElement;
      const o = el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
      return o && o.value && o.value !== 'false' ? (o.textContent || '') : '';
    }).catch(() => '')) || '').trim();
    return {
      subject: await val("input[name='subject']"),
      description: await val("textarea[name='description']"),
      supportType,
      meetingTime: await val("input[name='meeting_time'], div[name='meeting_time'] input"),
      meetingLink: await val("input[name='meeting_link']"),
    };
  }

  /** The window's footer buttons, in on-screen order (e.g. SAVE, CANCEL). */
  async getFooterButtons(): Promise<string[]> {
    const raw = await this.modalFooterButtons().allTextContents();
    return raw.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  /** Every option label of the Support type <select> (the empty placeholder excluded). */
  async getSupportTypeOptions(): Promise<string[]> {
    const select = this.supportTypeSelect();
    await select.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const raw = await select.locator('option').allTextContents();
    return raw.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t && t !== 'false');
  }

  /** True while the New Ticket window is on screen. */
  async isWindowOpen(): Promise<boolean> {
    return this.subjectInput().isVisible({ timeout: CommonUtils.waitTimes.medium }).catch(() => false);
  }

  /**
   * Press Tab then SAVE once and return WITHOUT waiting for the window to close - for the negative
   * paths (required-field rejection, intercepted failure) where the window is expected to stay.
   */
  async clickSaveOnly(): Promise<void> {
    await this.page.keyboard.press('Tab').catch(() => {});
    await this.wait(CommonUtils.waitTimes.short);
    const button = this.saveButton();
    await button.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await button.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.extraLong);
  }

  /**
   * Press Tab then click SAVE twice in rapid succession (pre-sale-7.15.1.2). Right after the first
   * click it records whether the re-click is GUARDED (button disabled, or the window already gone);
   * the second click is best-effort and reports whether it actually landed.
   */
  async doubleClickSave(): Promise<{ guardedAfterFirst: string; secondClickLanded: boolean }> {
    await this.page.keyboard.press('Tab').catch(() => {});
    await this.wait(CommonUtils.waitTimes.short);
    const button = this.saveButton();
    await button.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await button.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    const state = await button.evaluate((b) => {
      const el = b as HTMLButtonElement;
      if (!el.isConnected) return 'window closed';
      if (el.disabled || el.hasAttribute('disabled') || el.classList.contains('disabled')) return 'SAVE disabled';
      return 'SAVE still enabled';
    }, undefined, { timeout: CommonUtils.waitTimes.short }).catch(() => 'window closed');
    const second = await button.click({ timeout: CommonUtils.waitTimes.medium, noWaitAfter: true }).then(() => true).catch(() => false);
    await this.modal().waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.elementAppear }).catch(() => {});
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    return { guardedAfterFirst: state, secondClickLanded: second };
  }

  /** Odoo field names of the inputs flagged invalid on the window (e.g. subject, description). */
  async getInvalidFieldNames(): Promise<string[]> {
    const names = await this.invalidFields().evaluateAll((els) => els.map((e) => e.getAttribute('name') || ''));
    return Array.from(new Set(names.filter(Boolean)));
  }

  /** Text of the most recent warning toast, whitespace-collapsed ('' when none). */
  async getWarningToastText(): Promise<string> {
    // innerText (not textContent): the field names are <li> items and textContent would glue them together.
    return ((await this.warningToast().innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Make the NEXT ticket-create call fail at the network layer (pre-sale-7.15.1.1): the wizard's
   * "create_ticket" button posts to /web/dataset/call_button; that one request is answered with an
   * HTTP 500, every other request passes through untouched. Call releaseCreateTicketFailure() after.
   */
  async failNextCreateTicketCall(): Promise<void> {
    let fired = false;
    await this.page.route('**/web/dataset/call_button', async (route) => {
      const body = route.request().postData() || '';
      if (!fired && body.includes('create_ticket')) {
        fired = true;
        console.log('  - Intercepted the create_ticket call -> answered with HTTP 500');
        await route.fulfill({ status: 500, contentType: 'text/html', body: 'Internal Server Error (injected by test)' });
        return;
      }
      await route.continue();
    });
  }

  /** Remove the interception installed by failNextCreateTicketCall(). */
  async releaseCreateTicketFailure(): Promise<void> {
    await this.page.unroute('**/web/dataset/call_button').catch(() => {});
  }

  /** Title + body of an error dialog stacked above the window ('' when none is shown). */
  async getErrorDialogText(): Promise<string> {
    const dlg = this.stackedErrorDialog();
    if (!(await dlg.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) return '';
    return ((await dlg.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  /** Close any stacked error dialog and then the New Ticket window itself (CANCEL). */
  async closeErrorAndCancel(): Promise<void> {
    const dlg = this.stackedErrorDialog();
    if (await dlg.isVisible({ timeout: CommonUtils.waitTimes.medium }).catch(() => false)) {
      await dlg.locator("xpath=.//footer//button | .//div[contains(@class,'modal-footer')]//button").first()
        .click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.standard);
    }
    if (await this.isWindowOpen()) {
      await this.modalFooterButtons().filter({ hasText: /cancel/i }).first().click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.standard);
    }
  }

  /** Press SAVE on the "New Ticket" window and wait for it to close. */
  async save(): Promise<void> {
    // Blur the active field / commit the selection so the SAVE click is not intercepted.
    // NOTE: do NOT press Escape here - on this Odoo modal Escape closes the whole "New Ticket"
    // window (documented gotcha), which would remove the SAVE button. Use Tab instead.
    await this.page.keyboard.press('Tab').catch(() => {});
    await this.wait(CommonUtils.waitTimes.short);

    const button = this.saveButton();
    await button.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await button.scrollIntoViewIfNeeded();
    await button.click();

    // The window closes once the ticket is created; wait for the modal to disappear and the spinner to settle.
    await this.modal().waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.savingPage }).catch(() => {});
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  - New Ticket saved');
  }
}
