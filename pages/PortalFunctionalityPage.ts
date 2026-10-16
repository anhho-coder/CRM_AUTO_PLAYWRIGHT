import { CommonUtils } from '@/helpers/common.utils';
import { BasePage } from './BasePage';

/** The TLS certificate the portal is served with, as the browser sees it. */
export interface CertificateDetails {
  /** HTTP status of the navigation that produced it. */
  status: number;
  /** The URL actually landed on. */
  url: string;
  /** 'https:' when the page is served over TLS. */
  protocol: string;
  issuer: string;
  subjectName: string;
  /** Unix seconds; 0 when the browser reported none. */
  validFrom: number;
  validTo: number;
  /** True when the navigation produced no TLS error and a certificate was readable. */
  readable: boolean;
}

/** One of the partner-facing list pages (Orders, Invoices, Quotations, ...). */
export interface PortalListSummary {
  /** The table's CSS class - the portal styles its lists with p-table__table. */
  cssClass: string;
  /**
   * Header CELLS in <thead>. Measured 0 on every partner list (2026-10-13): these lists render
   * their column titles as the first <tbody> row, which is why there is no header to click.
   */
  theadCells: number;
  /** Column titles as rendered, whether they sit in thead or in the first body row. */
  columnTitles: string[];
  /** Rows in <tbody>, including the title row when the list renders one. */
  bodyRows: number;
  /** The pager line, e.g. "Prev 1 2 3 4 5 Next", or '' when the list fits one page. */
  pagerText: string;
  /** The page links the pager offers, with their hrefs. */
  pagerLinks: { text: string; href: string }[];
  hasSearchBox: boolean;
}

/** A field of the portal ticket-submission form. */
export interface PortalFormField {
  name: string;
  type: string;
  required: boolean;
  label: string;
}

/**
 * Page Object - the partner-facing NAKIVO Partner Portal pages.
 *
 * Used by the CRM-8339 US3 cases (CRM-11491 .. CRM-11498), which check that portal functionality
 * survived the pen-test remediation. A partner signs in with `LoginPage.loginPortalUser` - these
 * accounts have no CRM back-office menu, so the standard login wait never completes for them.
 *
 * Addresses grounded on pre-production 2026-10-13, signed in as a partner:
 *   /my, /my/home                  - Overview
 *   /my/opportunities /my/quotes /my/orders /my/invoices /my/customers - the lists
 *   /download                      - "Download Trial" (embeds an external www.nakivo.com frame)
 *   /nfr-download                  - "Request NFR License" (a REQUEST form, not a registration)
 *   /helpdesk/                     - "Submit a Ticket" and "View my Tickets"
 *   /helpdesk/1/submit             - the submission form (redirects to customer-support-1)
 *   /my/tickets                    - HTTP 404 (the "View my Tickets" link is broken)
 */
export class PortalFunctionalityPage extends BasePage {
  // ---------------------------------------------------------------------------
  // Locators - XPath primary, CSS fallback
  // ---------------------------------------------------------------------------

  /** The portal list table. */
  private readonly listTable_portal = () =>
    this.page
      .locator('xpath=//table[contains(@class,"p-table__table")]')
      .or(this.page.locator('table.p-table__table'))
      .or(this.page.locator('table'))
      .first();

  /** The list page's search input. */
  private readonly searchInput_portal = () =>
    this.page
      .locator('xpath=//input[@name="search"]')
      .or(this.page.locator('input[name="search"]'))
      .first();

  /** A pager link by its visible text, e.g. "2" or "Next". */
  private readonly pagerLink_portal = (text: string) =>
    this.page
      .locator(`xpath=//*[contains(@class,"o_portal_pager") or contains(@class,"pagination")]//a[normalize-space(.)="${text}"]`)
      .or(this.page.locator('.o_portal_pager a, .pagination a').filter({ hasText: text }))
      .first();

  /**
   * The sort control of a partner list.
   *
   * These lists render no clickable column headers - the column titles are the first row of the
   * table body - so sorting is offered only here: a dropdown above the table, to the left of the
   * search box, whose items are links carrying ?sortby=<field>. Scoped to the dropdown that holds
   * those links, because the page carries other `.dropdown-c` controls too.
   */
  private readonly sortDropdown_portal = () =>
    this.page
      .locator('xpath=//div[contains(@class,"dropdown-c")][.//a[contains(@href,"sortby=")]]')
      .or(this.page.locator('.dropdown-c').filter({ has: this.page.locator('a[href*="sortby="]') }))
      .first();

  /** The visible title of the sort dropdown - the field the list is currently sorted by. */
  private readonly sortDropdownTitle_portal = () =>
    this.sortDropdown_portal()
      .locator('xpath=.//div[contains(@class,"dropdown-c__title")]')
      .or(this.sortDropdown_portal().locator('.dropdown-c__title'))
      .first();

  /** One option of the sort dropdown, by its visible text. */
  private readonly sortDropdownOption_portal = (text: string) =>
    this.sortDropdown_portal()
      .locator(`xpath=.//div[contains(@class,"dropdown-c__item")]//a[normalize-space(.)="${text}"]`)
      .or(this.sortDropdown_portal().locator('.dropdown-c__item a').filter({ hasText: text }))
      .first();

  /** The account menu in the portal header - present only while signed in. */
  private readonly accountMenu_portal = () =>
    this.page
      .locator('xpath=//a[contains(@href,"/my/home") or contains(@href,"/web/session/logout")]')
      .or(this.page.locator('a[href*="/my/home"], a[href*="/web/session/logout"]'))
      .first();

  /** A navigation link by its visible text, e.g. "Download Trial". */
  private readonly navLink_portal = (text: string) =>
    this.page
      .locator(`xpath=//a[normalize-space(.)="${text}"]`)
      .or(this.page.getByRole('link', { name: text, exact: true }))
      .first();

  /** A field of the ticket-submission form, by its name attribute. */
  private readonly formField_portal = (name: string) =>
    this.page
      .locator(`xpath=//*[@name="${name}"]`)
      .or(this.page.locator(`[name="${name}"]`))
      .first();

  /** The submission form's Send button. */
  private readonly sendButton_portal = () =>
    this.page
      .locator('xpath=//form//*[self::button or self::input][contains(normalize-space(.),"Send") or @value="Send"]')
      .or(this.page.getByRole('button', { name: 'Send' }))
      .first();

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Open a portal path and report the HTTP status.
   *
   * @param baseUrl the environment base URL
   * @param portalPath a path without a leading slash, e.g. 'my/orders'
   * @returns the HTTP status, or 0 when the navigation itself failed.
   */
  async openPortalPath(baseUrl: string, portalPath: string): Promise<number> {
    const response = await this.page
      .goto(`${baseUrl}${portalPath}`, {
        waitUntil: 'domcontentloaded',
        timeout: CommonUtils.waitTimes.pageLoad,
      })
      .catch(() => null);
    await this.page.waitForTimeout(CommonUtils.waitTimes.long);
    return response?.status() ?? 0;
  }

  /**
   * Navigate to the portal over HTTPS and read the TLS certificate the browser accepted.
   *
   * This is how a human "checks the browser address bar and certificate details" - Playwright
   * exposes the same certificate the padlock shows. A TLS failure throws on navigation, so
   * `readable: false` means the browser refused the certificate outright.
   *
   * @param baseUrl the environment base URL; its scheme is forced to https.
   */
  async openOverHttpsAndReadCertificate(baseUrl: string, portalPath: string): Promise<CertificateDetails> {
    const httpsUrl = `${baseUrl.replace(/^http:/, 'https:')}${portalPath}`;
    const response = await this.page
      .goto(httpsUrl, {
        waitUntil: 'domcontentloaded',
        timeout: CommonUtils.waitTimes.pageLoad,
      })
      .catch(() => null);
    await this.page.waitForTimeout(CommonUtils.waitTimes.long);

    // Playwright returns securityDetails() as a plain object of properties, not accessor methods.
    const security = response ? await response.securityDetails().catch(() => null) : null;
    return {
      status: response?.status() ?? 0,
      url: this.page.url(),
      protocol: await this.page.evaluate(() => location.protocol),
      issuer: security?.issuer ?? '',
      subjectName: security?.subjectName ?? '',
      validFrom: security?.validFrom ?? 0,
      validTo: security?.validTo ?? 0,
      readable: !!security,
    };
  }

  /**
   * The sort dropdown's current title and the fields it offers, in the order it lists them.
   *
   * @returns `{ title: '(no sort dropdown)', options: [] }` when the list has no sort control.
   */
  async getSortDropdown(): Promise<{ title: string; options: { text: string; sortBy: string }[] }> {
    return this.page.evaluate(() => {
      const dropdown = Array.from(document.querySelectorAll('.dropdown-c')).find((d) =>
        d.querySelector('a[href*="sortby="]')
      ) as HTMLElement | undefined;
      if (!dropdown) return { title: '(no sort dropdown)', options: [] };
      const title = (
        dropdown.querySelector('.dropdown-c__title') as HTMLElement | null
      )?.innerText?.replace(/\s+/g, ' ').trim();
      return {
        title: title || '(no title)',
        options: Array.from(dropdown.querySelectorAll('.dropdown-c__item a')).map((a: any) => ({
          text: (a.innerText || '').replace(/\s+/g, ' ').trim(),
          sortBy: ((a.getAttribute('href') || '').match(/sortby=([^&]+)/) || [])[1] ?? '',
        })),
      };
    });
  }

  /**
   * Open the sort dropdown and choose one of its fields.
   *
   * The option list is rendered with the `hidden` attribute until the title is clicked, so the
   * title has to be opened first - clicking the option straight away hits a hidden element.
   *
   * @param optionText the option's visible text, e.g. 'Reference'.
   * @returns false when the list offers no such option.
   */
  async chooseSortOption(optionText: string): Promise<boolean> {
    const dropdown = this.sortDropdown_portal();
    if (!(await dropdown.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) {
      return false;
    }
    await this.sortDropdownTitle_portal().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.waitForTimeout(CommonUtils.waitTimes.short);

    const option = this.sortDropdownOption_portal(optionText);
    if (!(await option.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) {
      return false;
    }
    await option.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page
      .waitForLoadState('domcontentloaded', { timeout: CommonUtils.waitTimes.pageLoad })
      .catch(() => {});
    await this.page.waitForTimeout(CommonUtils.waitTimes.long);
    return true;
  }

  /** Type into a portal list's search box and submit it. */
  async searchInPortalList(text: string): Promise<void> {
    const box = this.searchInput_portal();
    await box.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await box.fill('');
    await box.fill(text);
    await box.press('Enter');
    await this.page.waitForTimeout(CommonUtils.waitTimes.long);
  }

  /**
   * Click a pager link by its visible text.
   *
   * @returns false when no such link is on screen (a list that fits one page).
   */
  async clickPagerLink(text: string): Promise<boolean> {
    const link = this.pagerLink_portal(text);
    const visible = await link
      .isVisible({ timeout: CommonUtils.waitTimes.abnormalWait })
      .catch(() => false);
    if (!visible) return false;
    await link.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.waitForTimeout(CommonUtils.waitTimes.long);
    return true;
  }

  /** Click a navigation link by its visible text, e.g. "Download Trial". */
  async clickNavLink(text: string): Promise<boolean> {
    const link = this.navLink_portal(text);
    const visible = await link
      .isVisible({ timeout: CommonUtils.waitTimes.abnormalWait })
      .catch(() => false);
    if (!visible) return false;
    await link.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.waitForTimeout(CommonUtils.waitTimes.long);
    return true;
  }

  /** Fill one field of the ticket-submission form. */
  async fillSubmitFormField(name: string, value: string): Promise<void> {
    const field = this.formField_portal(name);
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await field.fill('');
    await field.fill(value);
    await this.page.waitForTimeout(CommonUtils.waitTimes.short);
  }

  /** Attach a file to the submission form's Attachment(s) field. */
  async attachFileToSubmitForm(filePath: string): Promise<void> {
    await this.formField_portal('attachments').setInputFiles(filePath);
    await this.page.waitForTimeout(CommonUtils.waitTimes.medium);
  }

  /** Press Send on the ticket-submission form and wait for the response page. */
  async submitTicketForm(): Promise<void> {
    await this.sendButton_portal().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page
      .waitForLoadState('domcontentloaded', { timeout: CommonUtils.waitTimes.pageLoad })
      .catch(() => {});
    await this.page.waitForTimeout(CommonUtils.waitTimes.extraLong);
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  /** The page title plus its visible headings - how a reader identifies the screen. */
  async getPageIdentity(): Promise<{ url: string; title: string; headings: string[] }> {
    return this.page.evaluate(() => ({
      url: location.href,
      title: document.title,
      headings: Array.from(document.querySelectorAll('h1,h2,h3'))
        .map((h: any) => (h.innerText || '').trim())
        .filter(Boolean)
        .slice(0, 5),
    }));
  }

  /**
   * Whether the portal shows a signed-in session.
   *
   * Read from the DOM rather than from visibility: the portal keeps "Overview" and "Logout" inside
   * a collapsed account dropdown, so both are present and correct while reporting `visible: false`
   * until the dropdown is opened. The pair that identifies a session is a logout link in the
   * document and a URL that is no longer the login page.
   */
  async isSignedIn(): Promise<boolean> {
    return this.page.evaluate(
      () =>
        !!document.querySelector('a[href*="/web/session/logout"]') &&
        !/\/web\/login/.test(location.pathname)
    );
  }

  /** The signed-in partner's display name, as the portal header shows it. */
  async getSignedInAccountName(): Promise<string> {
    return this.page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('a,span,div')).find((e: any) =>
        /TEST-|#1_Automation/.test((e.innerText || '').trim())
      ) as HTMLElement | undefined;
      return (el?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    });
  }

  /** Everything the table checks of CRM-8339_1.2 need, in one read. */
  async getPortalListSummary(): Promise<PortalListSummary> {
    return this.page.evaluate(() => {
      const table = document.querySelector('table.p-table__table') ?? document.querySelector('table');
      const pager = document.querySelector('.o_portal_pager, .pagination') as HTMLElement | null;
      if (!table) {
        return {
          cssClass: '(no table)',
          theadCells: 0,
          columnTitles: [],
          bodyRows: 0,
          pagerText: '',
          pagerLinks: [],
          hasSearchBox: !!document.querySelector('input[name="search"]'),
        } as PortalListSummary;
      }
      const theadCells = Array.from(table.querySelectorAll('thead th')) as HTMLElement[];
      const firstBodyRowCells = Array.from(
        table.querySelectorAll('tbody tr:first-child td, tbody tr:first-child th')
      ) as HTMLElement[];
      return {
        cssClass: (table as HTMLElement).className,
        theadCells: theadCells.length,
        // the portal lists put their column titles in the first body row, not in a <thead>
        columnTitles: (theadCells.length ? theadCells : firstBodyRowCells).map((c) =>
          (c.innerText || '').replace(/\s+/g, ' ').trim()
        ),
        bodyRows: table.querySelectorAll('tbody tr').length,
        pagerText: (pager?.innerText || '').replace(/\s+/g, ' ').trim(),
        pagerLinks: Array.from(pager?.querySelectorAll('a') ?? []).map((a: any) => ({
          text: (a.innerText || '').trim(),
          href: a.getAttribute('href') || '',
        })),
        hasSearchBox: !!document.querySelector('input[name="search"]'),
      } as PortalListSummary;
    });
  }

  /** The visible text of every data row, for a search / filter assertion. */
  async getPortalListRowTexts(): Promise<string[]> {
    return this.page.evaluate(() => {
      const table = document.querySelector('table.p-table__table') ?? document.querySelector('table');
      if (!table) return [];
      return Array.from(table.querySelectorAll('tbody tr')).map((tr: any) =>
        (tr.innerText || '').replace(/\s+/g, ' ').trim()
      );
    });
  }

  /**
   * Whether this list offers sorting as a CLICKABLE COLUMN HEADER, and what sort control it has
   * instead. CRM-11492 step 3 asks for a header click; these lists have no header cells, and sort
   * through a `?sortby=` parameter on their links - so the step cannot be performed as written.
   */
  async getSortAffordance(): Promise<{ clickableHeaders: number; sortByLinks: string[] }> {
    return this.page.evaluate(() => {
      const table = document.querySelector('table.p-table__table') ?? document.querySelector('table');
      const headers = Array.from(table?.querySelectorAll('thead th') ?? []) as HTMLElement[];
      const sortLinks = Array.from(document.querySelectorAll('a[href*="sortby="]')).map((a: any) =>
        (a.getAttribute('href') || '').replace(/^.*sortby=/, 'sortby=')
      );
      return {
        clickableHeaders: headers.filter((h) => h.querySelector('a') || /sort/i.test(h.className))
          .length,
        sortByLinks: Array.from(new Set(sortLinks)).slice(0, 10),
      };
    });
  }

  /** The navigation links the signed-in portal offers, for locating an area by name. */
  async getNavigationLinks(): Promise<{ text: string; href: string }[]> {
    return this.page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]'))
        .map((a: any) => ({
          text: (a.innerText || '').replace(/\s+/g, ' ').trim(),
          href: a.getAttribute('href') || '',
        }))
        .filter((l) => l.text && l.href && !/^(mailto|tel|#)/.test(l.href))
    );
  }

  /**
   * The src of any iframe the page embeds.
   *
   * The Downloads area is a NAKIVO page that frames www.nakivo.com, so what the partner browses
   * is served by a different site - which is why the download itself is outside this suite.
   */
  async getEmbeddedFrameSources(): Promise<string[]> {
    return this.page.evaluate(() =>
      Array.from(document.querySelectorAll('iframe'))
        .map((f: any) => f.getAttribute('src') || '')
        .filter(Boolean)
    );
  }

  /** Every field the ticket-submission form offers, in document order. */
  async getSubmitFormFields(): Promise<PortalFormField[]> {
    return this.page.evaluate(() =>
      Array.from(document.querySelectorAll('form input, form select, form textarea')).map(
        (i: any) => ({
          name: i.name || '(noname)',
          type: (i.type || i.tagName || '').toLowerCase(),
          required: !!i.required,
          label:
            (document.querySelector(`label[for="${i.id}"]`) as any)?.innerText?.trim() ??
            (i.closest('.form-group, .s_website_form_field')?.querySelector('label') as any)
              ?.innerText?.trim() ??
            '',
        })
      )
    );
  }

  /** The page text after a form submission, to read the confirmation it gave. */
  async getPageText(maxChars: number = 600): Promise<string> {
    const text = await this.page.evaluate(() =>
      (document.body.innerText || '').replace(/\s+/g, ' ').trim()
    );
    return text.slice(0, maxChars);
  }

  /** CSS selector of the portal list table, for `captureVerifyEvidence({ highlight })`. */
  static readonly LIST_TABLE_SELECTOR = 'table.p-table__table';
  /** CSS selector of the submission form, for `captureVerifyEvidence({ highlight })`. */
  static readonly SUBMIT_FORM_SELECTOR = 'form';
}
