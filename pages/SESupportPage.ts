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
