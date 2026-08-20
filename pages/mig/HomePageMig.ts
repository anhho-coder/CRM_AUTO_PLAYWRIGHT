import { HomePage } from '@pages';
import { baseUrl_mig } from '@config/users.config';
import { CommonUtils } from '@helpers/common.utils';

/**
 * HomePage variant for the O12 Migration server (crm-mig.nakivo.site).
 *
 * The base `navigateToCRM()` clicks the navbar CRM link, which the sidebar theme keeps hidden, so
 * open CRM by its kanban URL instead - theme-agnostic and immune to the sidebar-vs-navbar layout.
 * (CRM lead kanban action id 185 / menu_id 125 taken from the Mig instance; these are DB-specific
 * and belong in a Mig page object.)
 */
export class HomePageMig extends HomePage {
  private static readonly CRM_KANBAN_HASH = 'web#action=185&model=crm.lead&view_type=kanban&menu_id=125';
  private static readonly CRM_KANBAN_URL_RE = /\/web[?#].*view_type=kanban/;

  async navigateToCRM() {
    await this.goto(`${baseUrl_mig}${HomePageMig.CRM_KANBAN_HASH}`);
    await this.waitForURL(HomePageMig.CRM_KANBAN_URL_RE, CommonUtils.waitTimes.pageLoad);
    await this.dismissErrorDialog();
  }
}
