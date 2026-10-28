import { LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * LoginPage variant for the O12 Migration server (crm-mig.nakivo.site).
 *
 * The Mig instance uses a SIDEBAR backend theme (body class `mk_sidebar_type_large`) instead of the
 * standard top navbar. The base LoginPage signals login success by waiting for the navbar CRM menu
 * link (`crm.crm_menu_root`) to be VISIBLE - but under the sidebar theme that anchor stays hidden
 * (`offsetParent === null`), so the base check times out even though login succeeded.
 *
 * Override the success signal to the theme-agnostic Odoo web-client shell (`.o_web_client`), which
 * renders on every backend theme. `login()` is inherited and calls `this.waitForLoginSuccess()`, so
 * it picks up this override automatically.
 */
export class LoginPageMig extends LoginPage {
  /** Evidence hook: the signed-in user's name in the top bar (Odoo 12 systray user menu). */
  static readonly SIGNED_IN_USER = '.o_user_menu .oe_topbar_name';

  private readonly webClient = () => this.page.locator('.o_web_client');

  private readonly signedInUser = () =>
    this.page.locator('xpath=//li[contains(concat(" ",normalize-space(@class)," ")," o_user_menu ")]//span[contains(concat(" ",normalize-space(@class)," ")," oe_topbar_name ")]')
      .or(this.page.locator(LoginPageMig.SIGNED_IN_USER)).first();

  /** The signed-in user's name as the top bar shows it, e.g. "Thomas Semerich"; '' when it is not drawn. */
  async getSignedInUserName(): Promise<string> {
    await this.signedInUser().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    return ((await this.signedInUser().textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  async waitForLoginSuccess(timeout: number = CommonUtils.waitTimes.login) {
    await this.webClient().first().waitFor({ state: 'visible', timeout });
  }
}
