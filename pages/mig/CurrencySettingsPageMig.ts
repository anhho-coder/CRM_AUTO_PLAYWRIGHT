import { CurrencySettingsPage } from '@pages';
import { CommonUtils } from '@/helpers/common.utils';
import { Page } from '@playwright/test';

/**
 * CurrencySettingsPageMig - fork of CurrencySettingsPage for the O12 CE migration server.
 *
 * The Mig instance uses a SIDEBAR backend theme (body class `mk_sidebar_type_large`) instead of the
 * standard top navbar. The base CurrencySettingsPage navigates by action hash, which works
 * on both layouts, so all methods are inherited from the base class.
 *
 * This fork exists for consistency with other Mig page objects and to provide a clear import path
 * (@pages/mig). Navigation and the two currency-rate booleans are overridden here because crm-mig
 * differs from pre-prod on both.
 *
 * MEASURED on crm-mig (db nakivoCE) 2026-10-13 - the earlier "VERIFIED on crm-mig 2026-10-08"
 * comment that stood here was not true and is removed:
 *
 * 1. ACTION IDS ARE NOT THE PRE-PROD ONES. The rebuild re-sequenced them. On this base
 *    `ir.actions.act_window` carries NO action 303 for res.config.settings at all; the Invoicing
 *    settings action is id 321 (context {'module': 'account'}) behind `ir.ui.menu` id 213
 *    ("Invoicing/Configuration/Settings"). The inherited openInvoicingSettings() navigates to
 *    action=303&menu_id=148, the web client boots with an EMPTY <main>, and every field read
 *    afterwards finds nothing.
 * 2. THE `name` ATTRIBUTE SITS ON THE FIELD WRAPPER, NOT ON THE INPUT. Measured DOM:
 *      <div class="o_field_boolean o_field_widget custom-control custom-checkbox"
 *           name="currency_rates_autoupdate">
 *        <input type="checkbox" id="o_field_input_232" class="custom-control-input">
 *      </div>
 *    so `input[name="currency_rates_autoupdate"]` matches 0 elements while `[name="..."]` matches 1.
 *    Measured state: OCA inner checkbox checked=true, Enterprise inner checkbox checked=false,
 *    both visible - which agrees with res.company(1).currency_rates_autoupdate = true and with
 *    `currency_rate_live` having no ir.module.module record.
 *    Rendered labels: "Automatic Currency Rates (OCA)" and "Automatic Currency Rates Enterprise".
 */
export class CurrencySettingsPageMig extends CurrencySettingsPage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Invoicing > Configuration > Settings on crm-mig.
   *
   * These were raw ids (action 321, menu 213) measured on the build that preceded the 2026-10-13
   * rebuild. That rebuild re-issued both: 321 is now the bank-statement Import action and 213 does
   * not exist at all, so this page object was driving to the wrong screen while asserting against
   * it. Resolved from XML ids instead, which hold across rebuilds and across instances.
   */
  private static readonly SETTINGS_ACTION_XMLID = 'account.action_account_config';
  private static readonly SETTINGS_MENU_XMLID = 'account.menu_finance';

  /**
   * Open Invoicing > Configuration > Settings on crm-mig and confirm the settings form really rendered.
   *
   * Overrides the base method, which hard-codes the pre-prod action id. A hash-only change is a
   * same-document navigation that the web client can drop, so landing is confirmed on BOTH the URL
   * keeping the action and `.app_settings_block` being present, and re-driven up to 3 times.
   *
   * @returns true when the settings blocks are on the page
   */
  async openInvoicingSettings(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<boolean> {
    const action = await this.xmlId(CurrencySettingsPageMig.SETTINGS_ACTION_XMLID);
    const menu = await this.xmlId(CurrencySettingsPageMig.SETTINGS_MENU_XMLID);
    const origin = new URL(this.page.url()).origin;
    const route = `${origin}/web?#action=${action}&model=res.config.settings&view_type=form&menu_id=${menu}`;
    console.log(`  - Opening Invoicing > Configuration > Settings (crm-mig action ${action})`);

    // Odoo refuses to navigate away from a form with unsaved changes and simply swallows the request.
    await this.discardFormIfInEditMode().catch(() => {});
    await this.dismissDiscardChangesDialog().catch(() => {});
    await this.page.evaluate(() => { (window as unknown as { onbeforeunload: unknown }).onbeforeunload = null; }).catch(() => {});

    let landed = false;
    for (let attempt = 1; attempt <= 3 && !landed; attempt++) {
      await this.page.goto(route, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await this.dismissErrorDialogWithRetry().catch(() => {});
      await this.page.locator('.app_settings_block').first().waitFor({ state: 'attached', timeout }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.long);
      const urlKeptAction = this.page.url().includes(`action=${action}`);
      const blocks = await this.page.locator('.app_settings_block').count();
      landed = urlKeptAction && blocks > 0;
      console.log(`  ${landed ? '✓' : '!'} attempt ${attempt}: action=${action} in URL: ${urlKeptAction}, app_settings_block count: ${blocks}`);
    }
    return landed;
  }

  /**
   * Read the OCA and Enterprise currency rate checkboxes from res.config.settings:
   * - currency_rates_autoupdate ("Automatic Currency Rates (OCA)")
   * - module_currency_rate_live ("Automatic Currency Rates Enterprise")
   *
   * @throws when the settings form or a field is absent - an unread field is NOT reported as false.
   * @returns { ocaEnabled: boolean, enterpriseEnabled: boolean }
   */
  async readCurrencyRateCheckboxes(): Promise<{ ocaEnabled: boolean; enterpriseEnabled: boolean }> {
    console.log('  - Reading currency rate checkboxes by field name');

    const action = await this.xmlId(CurrencySettingsPageMig.SETTINGS_ACTION_XMLID);
    const blocks = await this.page.locator('.app_settings_block').count();
    if (!this.page.url().includes(`action=${action}`) || blocks === 0) {
      console.log('  ! Settings form is not on screen, re-driving the route');
      const opened = await this.openInvoicingSettings();
      if (!opened) {
        throw new Error(
          `The Invoicing Settings form (action ${action}, menu ${await this.xmlId(CurrencySettingsPageMig.SETTINGS_MENU_XMLID)}) did not render on ` +
          `${this.page.url()} - the currency rate checkboxes could not be read. This is a navigation failure, not a setting that is off.`
        );
      }
    }

    const ocaEnabled = await this.readSettingsBoolean('currency_rates_autoupdate', 'Automatic Currency Rates (OCA)');
    console.log(`    OCA (currency_rates_autoupdate): ${ocaEnabled ? 'CHECKED' : 'NOT CHECKED'}`);

    const enterpriseEnabled = await this.readSettingsBoolean('module_currency_rate_live', 'Automatic Currency Rates Enterprise');
    console.log(`    Enterprise (module_currency_rate_live): ${enterpriseEnabled ? 'CHECKED' : 'NOT CHECKED'}`);

    return { ocaEnabled, enterpriseEnabled };
  }

  /**
   * Read one res.config.settings boolean by its Odoo field name.
   *
   * The field's `name` attribute is on the WRAPPER div, so the checkbox is read from the input INSIDE
   * it. A missing field throws instead of returning false: a field that could not be read and a
   * setting that is switched off look identical to a caller, and the difference is the whole verdict.
   */
  private async readSettingsBoolean(fieldName: string, label: string): Promise<boolean> {
    const field = this.page.locator(`[name="${fieldName}"]`).first();
    const present = await field.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.long })
      .then(() => true).catch(() => false);
    if (!present) {
      throw new Error(
        `Settings field "${fieldName}" ("${label}") was not found on the Settings form at ${this.page.url()}. ` +
        `The field state is UNKNOWN - it is not being reported as unchecked.`
      );
    }
    const innerBox = field.locator('input[type="checkbox"]');
    const target = (await innerBox.count()) > 0 ? innerBox.first() : field;
    return await target.isChecked({ timeout: CommonUtils.waitTimes.long });
  }
}
