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
  private readonly webClient = () => this.page.locator('.o_web_client');

  async waitForLoginSuccess(timeout: number = CommonUtils.waitTimes.login) {
    await this.webClient().first().waitFor({ state: 'visible', timeout });
  }
}
