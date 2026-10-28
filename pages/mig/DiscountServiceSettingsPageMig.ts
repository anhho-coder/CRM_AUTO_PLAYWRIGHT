import { Locator, Page } from '@playwright/test';
import { BasePage } from '@pages/BasePage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * crm-mig: Settings > General Settings > Discount Service (module nakivo_promotion) - the Maintenance mode switch.
 * Added 2026-10-26 for CRM-12144_7.5 (QI TC-22).
 *
 * Measured on crm-mig 2026-10-26 (tests/_explore/discount-mig-batchB-probe-20261026, labels and field names only):
 *  - General Settings = action base_setup.action_general_configuration; the settings sidebar holds a tab
 *    `.settings_tab .tab[data-key="nakivo_promotion"]` captioned "Discount Service", whose block
 *    `.app_settings_block[data-key="nakivo_promotion"]` carries: Discount Service URL (promotion_service_url),
 *    Discount Service Token (promotion_service_token), Maintenance mode (promotion_maintenance_mode, a boolean whose
 *    `name` sits on the wrapper div - the checkbox is the input inside it) and Booked Value Allocation Promotion
 *    Products (booked_value_alloc_promo_product_ids);
 *  - the control panel's Save is `button[name="execute"]`.
 *
 * SECRET: the block shows the Discount Service Token. maskSecretFields() must run BEFORE the screen is opened: it hides
 * the URL and Token inputs with CSS on every load of this page, so no screenshot or video frame carries them. This page
 * object never reads either input's value.
 */
export class DiscountServiceSettingsPageMig extends BasePage {
  static readonly SETTINGS_ACTION_XMLID = 'base_setup.action_general_configuration';
  static readonly SETTINGS_MENU_XMLID = 'base.menu_administration';
  static readonly BLOCK_KEY = 'nakivo_promotion';

  // ─── Locators (XPath primary, CSS fallback) ───────────────────────────────
  private readonly anySettingsBlock = (): Locator =>
    this.page.locator('xpath=//div[contains(@class,"app_settings_block")]').or(this.page.locator('.app_settings_block')).first();
  private readonly discountServiceTab = (): Locator =>
    this.page.locator(`xpath=//div[contains(@class,"settings_tab")]//div[contains(@class,"tab") and @data-key="${DiscountServiceSettingsPageMig.BLOCK_KEY}"]`)
      .or(this.page.locator(`.settings_tab .tab[data-key="${DiscountServiceSettingsPageMig.BLOCK_KEY}"]`)).first();
  readonly discountServiceBlockCss = `.app_settings_block[data-key="${DiscountServiceSettingsPageMig.BLOCK_KEY}"]`;
  private readonly discountServiceBlock = (): Locator =>
    this.page.locator(`xpath=//div[contains(@class,"app_settings_block") and @data-key="${DiscountServiceSettingsPageMig.BLOCK_KEY}"]`)
      .or(this.page.locator(this.discountServiceBlockCss)).first();
  readonly maintenanceFieldCss = '[name="promotion_maintenance_mode"]';
  private readonly maintenanceField = (): Locator =>
    this.page.locator('xpath=//div[@name="promotion_maintenance_mode"]').or(this.page.locator(`div${this.maintenanceFieldCss}`)).first();
  private readonly maintenanceCheckbox = (): Locator =>
    this.page.locator('xpath=//div[@name="promotion_maintenance_mode"]//input[@type="checkbox"]')
      .or(this.page.locator(`${this.maintenanceFieldCss} input[type="checkbox"]`)).first();
  private readonly saveButton = (): Locator =>
    this.page.locator('xpath=//div[contains(@class,"o_control_panel")]//button[@name="execute"]')
      .or(this.page.locator('.o_control_panel button[name="execute"]')).first();

  constructor(page: Page) {
    super(page);
  }

  /**
   * Hide the Discount Service URL and Token inputs on every load of this page (an init script plus the current
   * document), so the settings screen can be screenshotted and recorded without exposing the token.
   */
  async maskSecretFields(): Promise<void> {
    const css = '[name="promotion_service_token"], [name="promotion_service_url"] { -webkit-text-security: disc !important; color: transparent !important; text-shadow: none !important; filter: blur(8px) !important; }';
    await this.page.addInitScript((rule: string) => {
      const add = () => {
        if (document.getElementById('qa-mask-secrets')) return;
        const s = document.createElement('style');
        s.id = 'qa-mask-secrets';
        s.textContent = rule;
        (document.head || document.documentElement).appendChild(s);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
      else add();
    }, css);
    await this.page.addStyleTag({ content: css }).catch(() => {});
    console.log('  - Discount Service URL / Token inputs masked for screenshots and video');
  }

  /**
   * Open Settings > General Settings and its "Discount Service" tab. Resolved by XML id (never a raw action id).
   * @returns true when the Maintenance mode field is visible
   */
  async openDiscountServiceSettings(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<boolean> {
    const action = await this.xmlId(DiscountServiceSettingsPageMig.SETTINGS_ACTION_XMLID);
    const menu = await this.xmlId(DiscountServiceSettingsPageMig.SETTINGS_MENU_XMLID);
    const origin = new URL(this.page.url()).origin;
    console.log(`  - Opening Settings > General Settings > Discount Service (action ${action})`);
    await this.discardFormIfInEditMode().catch(() => {});
    await this.dismissDiscardChangesDialog().catch(() => {});
    await this.page.evaluate(() => { (window as unknown as { onbeforeunload: unknown }).onbeforeunload = null; }).catch(() => {});
    let ready = false;
    for (let attempt = 1; attempt <= 2 && !ready; attempt++) {
      await this.page.goto(`${origin}/web#action=${action}&model=res.config.settings&view_type=form&menu_id=${menu}`, { waitUntil: 'domcontentloaded', timeout });
      // a hash route is a same-document navigation - reload so the client boots into this action
      await this.page.reload({ waitUntil: 'domcontentloaded', timeout }).catch(() => {});
      await this.dismissErrorDialogWithRetry().catch(() => {});
      await this.anySettingsBlock().waitFor({ state: 'attached', timeout }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.long);
      await this.discountServiceTab().click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.long);
      ready = await this.maintenanceField().isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
      console.log(`  ${ready ? 'OK' : '!'} attempt ${attempt}: Maintenance mode field visible = ${ready}`);
    }
    if (ready) await this.discountServiceBlock().scrollIntoViewIfNeeded({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    return ready;
  }

  /**
   * Maintenance mode as the checkbox shows it.
   * @throws when the field is not on screen - an unread switch is never reported as "off"
   */
  async isMaintenanceModeOn(): Promise<boolean> {
    const present = await this.maintenanceField().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    if (!present) throw new Error(`Maintenance mode (promotion_maintenance_mode) is not on screen at ${this.page.url()} - its state is UNKNOWN`);
    return this.maintenanceCheckbox().isChecked({ timeout: CommonUtils.waitTimes.abnormalWait });
  }

  /**
   * Tick / untick Maintenance mode, click Save, then load the settings again and read the switch back.
   * @returns the state read back after Save
   */
  async setMaintenanceMode(on: boolean): Promise<boolean> {
    const before = await this.isMaintenanceModeOn();
    console.log(`  - Maintenance mode before : ${before ? 'ON' : 'OFF'}; wanted ${on ? 'ON' : 'OFF'}`);
    if (before !== on) {
      // Measured 2026-10-26 (tests/_explore/discount-mig-batchB-cron-toggle-20261026c): the label's only content is a
      // zero-width space, so the label box is 0 px wide and Playwright never sees it as visible (CRM-12144_7.5 round 1
      // timed out on it); the input is opacity 0. The drawn box is the label's ::before, inside the 18 px wrapper div
      // [name="promotion_maintenance_mode"] - click the wrapper's left part (that is where a person clicks), then
      // fall back to a DOM click on the input (fires the change event the boolean widget listens to).
      await this.maintenanceField().click({ position: { x: 8, y: 10 }, timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.standard);
      if ((await this.maintenanceCheckbox().isChecked({ timeout: CommonUtils.waitTimes.abnormalWait })) !== on) {
        console.log('  - the switch did not change on the wrapper click - clicking its input (DOM click)');
        await this.maintenanceCheckbox().dispatchEvent('click', undefined, { timeout: CommonUtils.waitTimes.abnormalWait });
        await this.wait(CommonUtils.waitTimes.standard);
      }
      console.log(`  - Maintenance mode on the form before Save : ${(await this.maintenanceCheckbox().isChecked({ timeout: CommonUtils.waitTimes.abnormalWait })) ? 'ON' : 'OFF'}`);
    }
    console.log('  - Clicking Save');
    await this.saveButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.waitForLoadingOverlayHidden(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.dismissErrorDialogWithRetry().catch(() => {});
    await this.wait(CommonUtils.waitTimes.extraLong);
    // read back on a FRESH load of the settings (review 2026-10-26: re-reading the form still open after Save reported
    // OFF while crm-mig stayed in Maintenance mode - the next run found it ON and its afterEach skipped the switch-off)
    await this.anySettingsBlock().waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    if (!(await this.openDiscountServiceSettings())) throw new Error('Maintenance mode: the Discount Service settings did not render on the fresh load after Save - the switch was not read back');
    const after = await this.isMaintenanceModeOn();
    console.log(`  - Maintenance mode after Save (read back on a fresh load) : ${after ? 'ON' : 'OFF'}`);
    return after;
  }
}
