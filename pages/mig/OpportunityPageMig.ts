import { Page } from '@playwright/test';
import { OpportunityPage } from '../OpportunityPage';
import { openNotebookTabMig } from './MigNotebook';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Opportunity form on the O12 Migration server (crm-mig.nakivo.site).
 * Why a Mig variant: the crm-mig form folds overflow notebook tabs into "More (N)" (see MigNotebook.ts), so the
 * pre-production tab click times out on a folded tab. Everything else is the base OpportunityPage.
 */
export class OpportunityPageMig extends OpportunityPage {
  constructor(page: Page) {
    super(page);
  }

  /** Notebook tab by caption (readVisibleFormRow's fallback tab), inline or under More. */
  protected async openNotebookTabByCaption(caption: string): Promise<void> {
    await openNotebookTabMig(this.page, caption);
  }

  /** "CRM Developer", inline or under More. */
  async clickCRMDeveloperTab() {
    await openNotebookTabMig(this.page, 'CRM Developer', 'first');
  }

  /**
   * "Company Name" = the VISIBLE partner_name input. The base page object takes the 3rd partner_name input, which on
   * crm-mig is sometimes a hidden one: CRM-12370_9.6.2 / 9.6.3 (2026-10-30) waited on it until the test timeout
   * (55 / 15 min) on the same new-Opportunity form where 9.6.1 had filled it.
   */
  async fillCompanyName(name: string) {
    await this.visibleFormInput('partner_name').fill(name, { timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long);
  }

  /** The VISIBLE `<input name="...">` of the open form (the base page object picks inputs by DOM position). */
  private visibleFormInput(name: string) {
    return this.page.locator(`xpath=//div[contains(@class,"o_form_view")]//input[@name="${name}"]`)
      .or(this.page.locator(`.o_form_view input[name="${name}"]`))
      .locator('visible=true').first();
  }

  /**
   * "Street" = the VISIBLE street input. The base page object takes the 2nd street input, which on crm-mig was hidden in
   * CRM-12370_9.6.1 / 9.6.2 / 9.6.3 (2026-10-30, batch 3): each waited on it until the test timeout.
   */
  async fillStreet(street: string) {
    await this.visibleFormInput('street').fill(street, { timeout: CommonUtils.waitTimes.abnormalWait });
  }

  /** "Country" = the VISIBLE address-country input (base: the 2nd address_country block - same positional trap as Street). */
  async selectCountry(country: string) {
    const input = this.page.locator('xpath=//div[contains(@class,"o_form_view")]//div[contains(@class,"address_country")]//input')
      .or(this.page.locator('.o_form_view .o_address_country input'))
      .locator('visible=true').first();
    const shown = await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true, () => false);
    if (!shown) return false;
    await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await input.fill(country, { timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.standard);
    const option = this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]').filter({ hasText: country }).first();
    const listed = await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true, () => false);
    if (listed) await option.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    return listed;
  }

  /** "Lead Form" (crm-mig: `lead_form`) = the VISIBLE input; base takes the last match with an unbounded click. */
  async fillLeadForm(value: string) {
    const input = this.visibleFormInput('lead_form');
    if (!(await input.isVisible().catch(() => false))) return false;
    await input.fill(value, { timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.standard);
    return true;
  }

  /** Wait until the chatter has rendered its messages (see LeadPageMig.waitForChatterMessagesMig). */
  async waitForChatterMessagesMig(): Promise<void> {
    await this.page.locator('xpath=//div[contains(@class,"o_mail_thread")]//div[contains(@class,"o_thread_message")]')
      .or(this.page.locator('.o_mail_thread .o_thread_message')).first()
      .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
  }
}
