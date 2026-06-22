import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Reseller / Partner Portal Page Object
 * Handles the NAKIVO Partner Portal (Odoo "/my" portal) that a Reseller user sees after login -
 * the portal home (/my) and the "My Opportunities" list (/my/opportunities).
 */
export class ResellerPortalPage extends BasePage {
  // Locators (XPath primary, CSS fallback)
  // "My Opportunities" control on the portal home (Overview). Rendered as a VISIBLE
  // <a href="/my/opportunities"> card. NOTE: the user navbar also has a HIDDEN
  // <a class="dropdown-item" href="/my/opportunities">; exclude it (XPath) / filter to visible (CSS)
  // so we never act on the hidden one.
  private readonly myOpportunitiesLinkXPath = () =>
    this.page.locator(
      "xpath=//a[@href='/my/opportunities' and not(contains(@class,'dropdown-item'))]"
    ).first();
  private readonly myOpportunitiesLinkCss = () =>
    this.page.locator("a[href='/my/opportunities']:visible").first();
  // Data rows on /my/opportunities. The Opp name is in the first cell (td[1]).
  private readonly opportunityRows = () =>
    this.page.locator("xpath=//tr[contains(@class,'opportunity_table_row')]");
  private readonly opportunityRowByName = (name: string) =>
    this.page.locator(
      `xpath=//tr[contains(@class,'opportunity_table_row')][.//td[contains(normalize-space(.),"${name}")]]`
    );

  constructor(page: Page) {
    super(page);
  }

  /**
   * Wait for the portal home (/my) to be ready - signalled by the "My Opportunities" link rendering.
   * Tolerates a slow portal login (uses the login-length wait budget).
   */
  async waitForPortalReady(): Promise<void> {
    let link = this.myOpportunitiesLinkXPath();
    const visibleByXPath = await link.isVisible({ timeout: CommonUtils.waitTimes.login }).catch(() => false);
    if (!visibleByXPath) {
      link = this.myOpportunitiesLinkCss();
      await link.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.login });
    }
  }

  /**
   * Click the "My Opportunities" button/link on the portal home; lands on /my/opportunities.
   */
  async clickMyOpportunities(): Promise<void> {
    let link = this.myOpportunitiesLinkXPath();
    const visibleByXPath = await link.isVisible({ timeout: CommonUtils.waitTimes.elementAppear }).catch(() => false);
    if (!visibleByXPath) link = this.myOpportunitiesLinkCss();
    await link.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await this.waitForURL('**/my/opportunities**', CommonUtils.waitTimes.pageLoad);
    await this.opportunityRows().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
  }

  /**
   * Verify an Opportunity with the given name is listed on the My Opportunities page.
   * The page is server-rendered, so a match is reliable per page load; reload-and-retry tolerates a
   * just-created Opp that needs a brief moment to surface.
   * @param name - the Opportunity name to look for
   * @param maxAttempts - number of (check + reload) attempts (default 5)
   * @param interval - wait between reload attempts (default waitTimes.long)
   * @returns true if a row containing the name is found
   */
  async isOpportunityListed(
    name: string,
    maxAttempts: number = 5,
    interval: number = CommonUtils.waitTimes.long
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const count = await this.opportunityRowByName(name).count().catch(() => 0);
      console.log(`  - My Opportunities check attempt ${attempt}/${maxAttempts}: row(s) matching "${name}" = ${count}`);
      if (count > 0) return true;
      if (attempt < maxAttempts) {
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.opportunityRows().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
        await this.wait(interval);
      }
    }
    return false;
  }

  /**
   * Read the names of the Opportunities currently listed on the My Opportunities page.
   * @returns array of trimmed Opportunity names (first column)
   */
  async getListedOpportunityNames(): Promise<string[]> {
    const names = await this.page
      .locator("xpath=//tr[contains(@class,'opportunity_table_row')]/td[1]")
      .allTextContents()
      .catch(() => []);
    return names.map((s) => s.trim());
  }
}
