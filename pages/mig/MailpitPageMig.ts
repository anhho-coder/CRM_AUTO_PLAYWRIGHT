import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import { CommonUtils } from '@helpers/common.utils';
import { users, baseUrl_mailpit_mig } from '@config/users.config';

/**
 * Mailpit web UI of crm-mig (baseUrl_mailpit_mig) - used to SHOW a received email as screen evidence.
 * The assertions themselves read the REST API (helpers/mailpit.helper.ts); this page only opens the
 * message the way a tester would, so the report carries a picture of it.
 *
 * Mailpit sits behind HTTP Basic auth, which an existing Odoo browser context was not created with.
 * Rather than a second context (that would split the video), every request under /mailpit/ gets the
 * Authorization header added by a route that is removed again in closeMailbox(). Odoo URLs are untouched.
 */
export class MailpitPageMig extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private static readonly ROUTE = /\/mailpit\//;

  // Locators
  private readonly exactText = (text: string) =>
    this.page.locator(`xpath=//*[normalize-space(text())=${MailpitPageMig.xpathLiteral(text)}]`)
      .or(this.page.getByText(text, { exact: true }))
      .first();

  private static xpathLiteral(s: string): string {
    if (!s.includes('"')) return `"${s}"`;
    if (!s.includes("'")) return `'${s}'`;
    return `concat("${s.replace(/"/g, '", \'"\', "')}")`;
  }

  /** Open one message in the Mailpit UI and wait until its Subject is on screen. */
  async openMessage(id: string, subject: string): Promise<boolean> {
    const token = Buffer.from(`${users.mailpit_crm_mig.username}:${users.mailpit_crm_mig.password}`).toString('base64');
    await this.page.route(MailpitPageMig.ROUTE, route =>
      route.continue({ headers: { ...route.request().headers(), authorization: `Basic ${token}` } })
    );
    await this.page.goto(`${baseUrl_mailpit_mig}view/${encodeURIComponent(id)}`, {
      waitUntil: 'domcontentloaded',
      timeout: CommonUtils.waitTimes.abnormalWait,
    });
    const visible = await this.exactText(subject)
      .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true)
      .catch(() => false);
    await this.wait(CommonUtils.waitTimes.long); // let the HTML preview iframe paint before the evidence shot
    return visible;
  }

  /**
   * Remove the auth route so nothing after this step carries the Mailpit credentials, and optionally
   * go back to an Odoo screen - the crm-mig teardown runs its RPC from whatever page is open.
   */
  async closeMailbox(returnUrl?: string): Promise<void> {
    await this.page.unroute(MailpitPageMig.ROUTE).catch(() => {});
    if (returnUrl) {
      await this.page.goto(returnUrl, { waitUntil: 'domcontentloaded', timeout: CommonUtils.waitTimes.abnormalWait });
      await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
  }
}
