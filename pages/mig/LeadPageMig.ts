import { Page } from '@playwright/test';
import { LeadPage } from '../LeadPage';
import { openNotebookTabMig } from './MigNotebook';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead form on the O12 Migration server (crm-mig.nakivo.site).
 * Why a Mig variant: the crm-mig form folds overflow notebook tabs into "More (N)" (see MigNotebook.ts), so the
 * pre-production tab clicks time out on a folded tab. Everything else is the base LeadPage.
 */
export class LeadPageMig extends LeadPage {
  constructor(page: Page) {
    super(page);
  }

  /** Notebook tab by caption (readVisibleFormRow's fallback tab), inline or under More. */
  protected async openNotebookTabByCaption(caption: string): Promise<void> {
    await this.dismissErrorDialog();
    await openNotebookTabMig(this.page, caption);
  }

  /** "CRM Developer" (first page of that name), inline or under More. */
  async clickCRMDeveloperTab() {
    await this.dismissErrorDialog();
    await openNotebookTabMig(this.page, 'CRM Developer', 'first');
  }

  /** "CRM Developer" (last page of that name - the pre-production target-lead variant), inline or under More. */
  async clickCRMDeveloperTab_targetLead() {
    await this.dismissErrorDialog();
    await openNotebookTabMig(this.page, 'CRM Developer', 'last');
  }

  /**
   * Wait until the chatter has rendered its messages (a lead always has at least its creation note). Reading the log
   * right after a reload returned an empty/partial thread on crm-mig: CRM-12370_9.1.1 (2026-10-30) polled 34 min
   * without seeing a merge note that the same page showed once fully loaded.
   */
  async waitForChatterMessagesMig(): Promise<void> {
    await this.page.locator('xpath=//div[contains(@class,"o_mail_thread")]//div[contains(@class,"o_thread_message")]')
      .or(this.page.locator('.o_mail_thread .o_thread_message')).first()
      .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
  }

  /** Evidence hook set by markContactNameRowMig(). */
  static readonly CONTACT_NAME_ROW = '[data-pw-verify="contact-name"]';

  /**
   * Tag the visible "Contact Name" row (the one getContactNameReadonly() reads) so a verify-evidence shot can outline it:
   * the [name="contact_name"] widgets on the crm-mig lead form are all hidden (CRM-12370_9.1.3 / 9.1.5, 2026-10-30).
   */
  async markContactNameRowMig(): Promise<void> {
    // the reader's own locator (LeadPage.contactNameRow: td:has-text -> parent row), limited to the visible copy. An exact
    // normalize-space()="Contact Name" match found no visible row although the snapshot shows two (CRM-12370_9.1.3 /
    // 9.1.5, batch 3, 2026-10-30) - has-text normalises the label's whitespace, XPath does not.
    await this.page.locator('xpath=//div[contains(@class,"o_form_view")]//td[contains(normalize-space(),"Contact Name")]/..')
      .or(this.page.locator('.o_form_view td:has-text("Contact Name")').locator('..'))
      .locator('visible=true').first()
      // bounded: no actionTimeout in the config, so an unmatched row waited until the 55-min test timeout
      // (CRM-12370_9.1.3 / 9.1.5 hung 53 min at Step 3.8, 2026-10-30)
      .evaluate((el) => el.setAttribute('data-pw-verify', 'contact-name'), undefined, { timeout: CommonUtils.waitTimes.extraLong })
      .catch(() => {});
  }

  /** Odoo's "Odoo Server Error" dialog. */
  private readonly convertServerErrorDialog = () =>
    this.page.locator('xpath=//div[contains(@class,"modal-content")][.//h4[normalize-space()="Odoo Server Error"]]')
      .or(this.page.locator('.modal-content', { has: this.page.locator('h4', { hasText: 'Odoo Server Error' }) })).first();

  /**
   * Base click + wizard wait, then fail AT THIS STEP when crm-mig answered with "Odoo Server Error" instead of the
   * conversion wizard. CRM-12370_9.6.3 (2026-10-30): the base wait took the error dialog for the wizard, so the run went
   * on and failed one step later as "Merge with existing opportunities not offered". Logs the last line of the details.
   */
  async clickConvertToOpportunity() {
    await super.clickConvertToOpportunity();
    const error = this.convertServerErrorDialog();
    if (!(await error.isVisible().catch(() => false))) return;
    await error.locator('xpath=.//button[normalize-space()="See details"]').or(error.locator('button', { hasText: 'See details' })).first()
      .click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const detail = (await error.locator('xpath=.//pre').or(error.locator('pre')).first()
      .textContent({ timeout: CommonUtils.waitTimes.extraLong }).catch(() => '')) ?? '';
    const last = detail.split('\n').map((l) => l.trim()).filter(Boolean).pop() ?? '(no details shown)';
    console.log(`  - Convert     : "Odoo Server Error" instead of the conversion wizard - ${last}`);
    throw new Error(`crm-mig: "Convert to Opportunity" raised "Odoo Server Error" instead of the conversion wizard - ${last}`);
  }

  /** "Deal registration", inline or under More. */
  async clickDealRegistrationTab() {
    await this.dismissErrorDialog();
    await openNotebookTabMig(this.page, 'Deal registration');
  }
}
