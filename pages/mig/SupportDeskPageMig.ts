import { Locator, Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Support service of the migration - Frappe Helpdesk agent app (https://support-crm-mig.nakivo.site/helpdesk).
 *
 * NOT Odoo: every Odoo route answers 404, so none of the Odoo helpers of BasePage (statusbar, control panel,
 * form view) apply here - only the generic wait helpers are reused. The agent UI is a Vue app built on
 * frappe-ui / Reka UI: dropdowns are `button[aria-haspopup=menu]` triggers whose content is teleported to the
 * end of <body> as `[role=menu]` with `[role=menuitem]` entries.
 *
 * Measured 2026-10-22 (read-only DOM probe as nam.pham):
 *  - login form       : #login_email, #login_password, button.btn-login ("Login") -> lands on /helpdesk/overview
 *  - sidebar          : buttons by aria-label ("All Tickets", "Search Messages", ...), not anchors
 *  - ticket header    : Start | Assign to me | Actions | <status> | ... - the STATUS control is the header dropdown
 *                       whose aria-label is the ticket's current status (e.g. "Open"); the side panel carries
 *                       Sub-status only, no Status row
 *  - tickets list     : header "Tickets" crumb + List / Kanban buttons; Kanban -> crumb "Tickets / Kanban"
 *  - kanban column    : a div whose direct child is the header div[title='Fold'] (unfolded: title span + count)
 *                       or div[title='Show'] (folded: count only, the title is a vertical-text div)
 *
 * TRAP (measured 2026-10-22) - the tickets LIST keeps state per USER, server-side (nakivo_helpdesk.navigation.ticket_filters):
 * a value typed in a quick filter (All / Message Author / ID / Subject) and a plain click on a list CELL (Contact, Team,
 * Customer ... adds "<field> is <value>") are saved for that user and come back in every new session. This page object
 * therefore never types in a quick filter and never clicks a list cell; a ticket is opened by its link.
 *
 * Every locator: XPath primary, CSS fallback.
 */
export class SupportDeskPageMig extends BasePage {
  // Locators
  private readonly loginEmailInput = () =>
    this.page.locator("xpath=//input[@id='login_email']").or(this.page.locator('#login_email')).first();
  private readonly loginPasswordInput = () =>
    this.page.locator("xpath=//input[@id='login_password']").or(this.page.locator('#login_password')).first();
  private readonly loginButton = () =>
    this.page.locator("xpath=//button[contains(@class,'btn-login')]").or(this.page.locator('button.btn-login')).first();

  private readonly sidebarItem = (label: string) =>
    this.page.locator(`xpath=//button[@aria-label='${label}']`).or(this.page.locator(`button[aria-label="${label}"]`)).first();

  // The header crumbs container: the parent of the "Tickets" crumb link (holds "Tickets / <view or ticket>").
  private readonly headerCrumbs = () =>
    this.page.locator("xpath=//header//a[@href='/helpdesk/tickets']/..")
      .or(this.page.locator('header div:has(> a[href="/helpdesk/tickets"])')).first();
  private readonly headerButtonByLabel = (label: string) =>
    this.page.locator(`xpath=//header//button[@aria-label='${label}']`).or(this.page.locator(`header button[aria-label="${label}"]`)).first();
  // The ticket's Status dropdown trigger: the header menu button labelled with the CURRENT status.
  private readonly statusMenuTrigger = (currentStatus: string) =>
    this.page.locator(`xpath=//header//button[@aria-haspopup='menu' and @aria-label='${currentStatus}']`)
      .or(this.page.locator(`header button[aria-haspopup="menu"][aria-label="${currentStatus}"]`)).first();
  private readonly openMenu = () =>
    this.page.locator("xpath=//*[@role='menu']").or(this.page.locator('[role="menu"]')).first();
  private readonly openMenuItems = () =>
    this.page.locator("xpath=//*[@role='menu']//*[@role='menuitem']").or(this.page.locator('[role="menu"] [role="menuitem"]'));

  // Ticket list rows (each row links to /helpdesk/tickets/<name>) - the header "Create" link (/helpdesk/tickets/new)
  // starts with the same path and is excluded.
  private readonly ticketListLinks = () =>
    this.page.locator("xpath=//a[starts-with(@href,'/helpdesk/tickets/') and not(@href='/helpdesk/tickets/new')]")
      .or(this.page.locator('a[href^="/helpdesk/tickets/"]:not([href="/helpdesk/tickets/new"])'));
  // Kanban columns: the div whose direct child is the Fold / Show header.
  private readonly kanbanColumns = () =>
    this.page.locator("xpath=//div[./div[@title='Fold' or @title='Show']]")
      .or(this.page.locator('div:has(> div[title="Fold"]), div:has(> div[title="Show"])'));

  // New-ticket form (/helpdesk/tickets/new): Raised By, Subject, the description editor, Submit.
  private readonly newTicketRaisedByInput = () =>
    this.page.locator("xpath=//input[@placeholder='Customer e-mail']").or(this.page.locator('input[placeholder="Customer e-mail"]')).first();
  private readonly newTicketSubjectInput = () =>
    this.page.locator("xpath=//input[@placeholder='A short description']").or(this.page.locator('input[placeholder="A short description"]')).first();
  private readonly newTicketDescriptionEditor = () =>
    this.page.locator("xpath=//div[@contenteditable='true' and contains(@class,'ProseMirror')]")
      .or(this.page.locator('div.ProseMirror[contenteditable="true"]')).first();
  private readonly newTicketSubmitButton = () =>
    this.page.locator("xpath=//button[@aria-label='Submit']").or(this.page.locator('button[aria-label="Submit"]')).first();
  constructor(page: Page) {
    super(page);
  }

  /** READ-ONLY REST, as the signed-in user: the HD Agent record (Support Level L1 / L2, Job Level). Throws on HTTP error. */
  async getMyAgentLevel(user: string): Promise<{ agent: string; level: string; jobLevel: string; active: boolean }> {
    const res = await this.page.evaluate(async (u) => {
      const r = await fetch(`/api/resource/HD Agent/${encodeURIComponent(u)}`, { headers: { Accept: 'application/json' } });
      return { status: r.status, body: await r.text() };
    }, user);
    if (res.status !== 200) throw new Error(`SupportDeskPageMig.getMyAgentLevel(${user}): HTTP ${res.status} ${res.body.slice(0, 300)}`);
    const d = JSON.parse(res.body).data || {};
    return { agent: String(d.agent_name || ''), level: String(d.custom_support_level || ''), jobLevel: String(d.custom_job_level || ''), active: !!d.is_active };
  }

  /**
   * From the tickets list: header Create -> the new-ticket form -> Raised By, Subject, Description -> Submit, and return
   * the new ticket's number. Two traps measured 2026-10-22: Submit stays DISABLED until both Subject and Description
   * hold text, and the server refuses a ticket with neither Raised By nor Contact ("Set the customer's e-mail or pick a
   * contact.") WITHOUT any toast - so the server's answer is read here and a refusal THROWS with its message.
   */
  async createTicketFromList(data: { raisedBy: string; subject: string; description: string }): Promise<string> {
    const create = this.headerButtonByLabel('Create');
    await create.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await create.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.waitForURL('**/helpdesk/tickets/new', { timeout: CommonUtils.waitTimes.pageLoad });
    await this.newTicketSubjectInput().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.newTicketRaisedByInput().fill(data.raisedBy, { timeout: CommonUtils.waitTimes.abnormalWait });
    await this.newTicketSubjectInput().fill(data.subject, { timeout: CommonUtils.waitTimes.abnormalWait });
    await this.newTicketDescriptionEditor().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.keyboard.type(data.description);
    await this.wait(CommonUtils.waitTimes.medium);
    const submit = this.newTicketSubmitButton();
    if (await submit.isDisabled({ timeout: CommonUtils.waitTimes.abnormalWait })) {
      throw new Error('createTicketFromList: Submit is still disabled after Subject + Description were filled');
    }
    const answer = this.page.waitForResponse((r) => /hd_ticket\.api\.new/.test(r.url()), { timeout: CommonUtils.waitTimes.pageLoad });
    await submit.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    const resp = await answer;
    const body = await resp.text().catch(() => '');
    if (resp.status() !== 200) {
      let msg = body.slice(0, 300);
      try {
        const j = JSON.parse(body);
        const sm = j._server_messages ? JSON.parse(j._server_messages).map((m: string) => JSON.parse(m).message).join(' | ') : '';
        msg = sm || j.exception || msg;
      } catch { /* keep the raw body */ }
      throw new Error(`createTicketFromList: the server refused the ticket (HTTP ${resp.status()}): ${msg}`);
    }
    const name = String((JSON.parse(body).message || {}).name || '');
    if (!/^\d+$/.test(name)) throw new Error(`createTicketFromList: no ticket number in the server answer (${body.slice(0, 200)})`);
    await this.page.waitForURL(`**/helpdesk/tickets/${name}`, { timeout: CommonUtils.waitTimes.pageLoad });
    await this.headerButtonByLabel('Actions').waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  - Created ticket ${name} - Subject "${data.subject}"`);
    return name;
  }

  /** READ-ONLY REST, as the signed-in user: the fields of one ticket this spec checks after creating it. */
  async getTicketFields(ticketName: string): Promise<{ subject: string; status: string; team: string; raisedBy: string; contact: string; assigned: string }> {
    const res = await this.page.evaluate(async (n) => {
      const r = await fetch(`/api/resource/HD Ticket/${n}`, { headers: { Accept: 'application/json' } });
      return { status: r.status, body: await r.text() };
    }, ticketName);
    if (res.status !== 200) throw new Error(`SupportDeskPageMig.getTicketFields(${ticketName}): HTTP ${res.status} ${res.body.slice(0, 300)}`);
    const d = JSON.parse(res.body).data || {};
    return {
      subject: String(d.subject || ''), status: String(d.status || ''), team: String(d.agent_group || ''),
      raisedBy: String(d.raised_by || ''), contact: String(d.contact || ''), assigned: String(d._assign || ''),
    };
  }

  /** Sign in on the Frappe /login form and wait for the agent app (/helpdesk) to load. */
  async login(baseUrl: string, username: string, password: string): Promise<void> {
    await this.page.setViewportSize({ width: 1920, height: 1080 });
    await this.page.goto(`${baseUrl.replace(/\/$/, '')}/login`, { waitUntil: 'domcontentloaded' });
    await this.loginEmailInput().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.loginEmailInput().fill(username, { timeout: CommonUtils.waitTimes.abnormalWait });
    await this.loginPasswordInput().fill(password, { timeout: CommonUtils.waitTimes.abnormalWait });
    await this.loginButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.waitForURL('**/helpdesk**', { timeout: CommonUtils.waitTimes.pageLoad });
    await this.sidebarItem('All Tickets').waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  - Signed in to the Support service as ${username} -> ${this.page.url()}`);
  }

  /** The signed-in user as the server sees it (frappe.auth.get_logged_user). */
  async getLoggedUser(): Promise<string> {
    return this.page.evaluate(async () => {
      const r = await fetch('/api/method/frappe.auth.get_logged_user', { headers: { Accept: 'application/json' } });
      const j = await r.json();
      return String(j.message || '');
    });
  }

  /**
   * READ-ONLY REST lookup AS THE SIGNED-IN USER (the server applies that user's permissions): the newest
   * HD Ticket matching `filters` (limit 1, creation desc). Returns null when none is readable; THROWS on an HTTP
   * error, so a refusal is never mistaken for "no ticket".
   */
  async findNewestTicket(filters: unknown[]): Promise<{ name: string; subject: string; status: string; team: string } | null> {
    const res = await this.page.evaluate(async (flt) => {
      const q = new URLSearchParams({
        fields: JSON.stringify(['name', 'subject', 'status', 'agent_group']),
        filters: JSON.stringify(flt),
        limit_page_length: '1',
        order_by: 'creation desc',
      });
      const r = await fetch(`/api/resource/HD Ticket?${q.toString()}`, { headers: { Accept: 'application/json' } });
      return { status: r.status, body: await r.text() };
    }, filters);
    if (res.status !== 200) throw new Error(`SupportDeskPageMig.findNewestTicket: HTTP ${res.status} ${res.body.slice(0, 300)}`);
    const row = (JSON.parse(res.body).data || [])[0];
    return row ? { name: String(row.name), subject: row.subject, status: row.status, team: row.agent_group } : null;
  }

  /** READ-ONLY: every HD Ticket Status record (name, category, order) - the registry behind the Status control. */
  async getStatusRegistry(): Promise<Array<{ name: string; category: string; order: number }>> {
    const res = await this.page.evaluate(async () => {
      const q = new URLSearchParams({
        fields: JSON.stringify(['name', 'category', 'order']),
        limit_page_length: '100',
        order_by: '`order` asc, name asc',
      });
      const r = await fetch(`/api/resource/HD Ticket Status?${q.toString()}`, { headers: { Accept: 'application/json' } });
      return { status: r.status, body: await r.text() };
    });
    if (res.status !== 200) throw new Error(`SupportDeskPageMig.getStatusRegistry: HTTP ${res.status} ${res.body.slice(0, 300)}`);
    return (JSON.parse(res.body).data || []).map((d: { name: string; category: string; order: number }) => ({
      name: d.name, category: d.category, order: d.order,
    }));
  }

  /** Click the sidebar entry "All Tickets" and wait for the ticket list. */
  async openAllTicketsFromSidebar(): Promise<void> {
    const item = this.sidebarItem('All Tickets');
    const current = new URL(this.page.url());
    if (/^\/helpdesk\/tickets\/[^/]+/.test(current.pathname)) {
      // On a ticket page the sidebar item is visible but never settles enough to click (measured 2026-10-23, the click
      // waited until the test timeout): the same list is opened by its address.
      await this.page.goto(`${current.origin}/helpdesk/tickets`, { waitUntil: 'domcontentloaded' });
    } else {
      await item.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
      await item.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    }
    await this.page.waitForURL('**/helpdesk/tickets**', { timeout: CommonUtils.waitTimes.pageLoad });
    await this.ticketListLinks().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  - Opened sidebar > All Tickets');
  }

  /** The header crumbs as one line, e.g. "Tickets / List", "Tickets / Kanban" or "Tickets / <ticket subject>". */
  async getHeaderCrumbs(): Promise<string> {
    const text = await this.headerCrumbs().innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '');
    return text.replace(/\s+/g, ' ').replace(/\s*\/\s*/g, ' / ').trim();
  }

  /** Number of ticket rows (links to a ticket, the header "Create" link excluded) currently rendered. */
  async countTicketLinks(): Promise<number> {
    return this.ticketListLinks().count();
  }

  /** Open a ticket by its link /helpdesk/tickets/<name> and wait for its header (Assign to me / Actions). */
  async openTicketByLink(baseUrl: string, ticketName: string): Promise<void> {
    await this.page.goto(`${baseUrl.replace(/\/$/, '')}/helpdesk/tickets/${ticketName}`, { waitUntil: 'domcontentloaded' });
    await this.headerButtonByLabel('Actions').waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  - Opened ticket ${ticketName} (${this.page.url()})`);
  }

  /** The ticket title the header crumb shows after "Tickets / ". */
  async getTicketHeaderTitle(): Promise<string> {
    const crumbs = await this.getHeaderCrumbs();
    return crumbs.replace(/^Tickets\s*\/\s*/, '').trim();
  }

  /** Open the ticket's Status dropdown (header trigger labelled with `currentStatus`) and wait for its menu. */
  async openStatusMenu(currentStatus: string): Promise<void> {
    const trig = this.statusMenuTrigger(currentStatus);
    await trig.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await trig.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.openMenu().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.medium);
    console.log(`  - Opened the Status dropdown (current status "${currentStatus}")`);
  }

  /** The entries of the open dropdown menu in on-screen order (top to bottom). Reads only - never clicks one. */
  async getOpenMenuOptions(): Promise<string[]> {
    const items = await this.openMenuItems().evaluateAll((els) =>
      els.map((e) => ({ label: (e.textContent || '').replace(/\s+/g, ' ').trim(), top: e.getBoundingClientRect().top }))
    );
    return items.filter((i) => i.label).sort((a, b) => a.top - b.top).map((i) => i.label);
  }

  /** Close the open dropdown with Escape (nothing is selected) and wait for it to go. */
  async closeOpenMenu(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.openMenu().waitFor({ state: 'detached', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.short);
  }

  /** The current status shown on the ticket header trigger, read again after a reload (proves nothing changed). */
  async isStatusTriggerShowing(status: string): Promise<boolean> {
    return this.statusMenuTrigger(status).isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
  }

  /** On the tickets list, click the header "Kanban" button and wait for the kanban columns. */
  async switchToKanbanLayout(): Promise<void> {
    const btn = this.headerButtonByLabel('Kanban');
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.waitForURL('**layout=kanban**', { timeout: CommonUtils.waitTimes.pageLoad });
    await this.kanbanColumns().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.wait(CommonUtils.waitTimes.extraLong);
    console.log(`  - Switched to the Kanban layout (${this.page.url()})`);
  }

  /**
   * Kanban columns in on-screen order (left to right): title, the count its header shows, and whether it is
   * folded. A folded column has no title span - its title is the vertical-text body div.
   */
  async getKanbanColumns(): Promise<Array<{ column: string; count: number; folded: boolean }>> {
    await this.kanbanColumns().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    const cols = await this.kanbanColumns().evaluateAll((els) =>
      els.map((col) => {
        const header = col.querySelector(':scope > div[title]') as HTMLElement | null;
        const folded = header?.getAttribute('title') === 'Show';
        const titleEl = folded
          ? (col.querySelector(':scope > div:not([title])') as HTMLElement | null)
          : (header?.querySelector('span.truncate') as HTMLElement | null);
        const spans = header ? Array.from(header.querySelectorAll('span')) : [];
        const countText = spans.length ? (spans[spans.length - 1].textContent || '') : '';
        const n = parseInt(countText.replace(/[^\d]/g, ''), 10);
        return {
          column: (titleEl?.textContent || '').replace(/\s+/g, ' ').trim(),
          count: Number.isNaN(n) ? -1 : n,
          folded,
          left: col.getBoundingClientRect().left,
        };
      })
    );
    return cols.sort((a, b) => a.left - b.left).map(({ column, count, folded }) => ({ column, count, folded }));
  }

  // ─── Lifecycle & escalation (CRM-11859 Helpdesk A/B: TC-FLOW-002 / 030 / 032 / 058, TC-UI-063) ───────────

  // The ticket header's more menu (a button with no aria-label, marked by its horizontal-dots icon). Once the ticket is
  // assigned, Hibernate / Archive / Merge ... live in it (measured 2026-10-23); before that they sit under "Actions".
  private readonly headerMoreMenuButton = () =>
    this.page.locator("xpath=//header//button[.//*[contains(@class,'lucide-more-horizontal')]]")
      .or(this.page.locator('header button:has(.lucide-more-horizontal)')).first();
  private readonly headerActionsButton = () =>
    this.page.locator("xpath=//header//button[@aria-label='Actions']").or(this.page.locator('header button[aria-label="Actions"]')).first();
  private readonly headerAssignToMeButton = () =>
    this.page.locator("xpath=//header//button[@aria-label='Assign to me']").or(this.page.locator('header button[aria-label="Assign to me"]')).first();
  // The dialog Frappe shows (Hibernate ticket wizard, Archive confirmation).
  private readonly shownDialog = () => this.page.locator('[role="dialog"], [role="alertdialog"]').last();

  /** Open the header's Actions button, or its more (…) menu when Actions is no longer drawn, and wait for the menu. */
  async openHeaderActionsMenu(): Promise<void> {
    const btn = this.headerActionsButton();
    const target = (await btn.count()) ? btn : this.headerMoreMenuButton();
    await target.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await target.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.openMenu().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.medium);
  }

  /** Items of the open header menu, top to bottom. */
  async getHeaderMenuItems(): Promise<string[]> {
    return this.getOpenMenuOptions();
  }

  /** Open the header menu and choose the item whose text is exactly `label` (e.g. "Hibernate", "Archive"). */
  async chooseHeaderMenuItem(label: string): Promise<void> {
    await this.openHeaderActionsMenu();
    const item = this.openMenuItems().filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) }).first();
    await item.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await item.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.openMenu().waitFor({ state: 'detached', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.medium);
    console.log(`  - Header menu > ${label}`);
  }

  /** Header "Assign to me" (only drawn while the ticket is not assigned to the signed-in user). */
  async assignToMeFromHeader(): Promise<void> {
    const btn = this.headerAssignToMeButton();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.waitFor({ state: 'detached', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  - Clicked "Assign to me" (header)');
  }

  /** Choose a status from the header Status dropdown (current status `from`); the dropdown closes on the pick. */
  async chooseStatus(from: string, label: string): Promise<void> {
    await this.openStatusMenu(from);
    const item = this.openMenuItems().filter({ hasText: new RegExp(`^\\s*${label.replace(/[()]/g, '\\$&')}\\s*$`) }).first();
    await item.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await item.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.openMenu().waitFor({ state: 'detached', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  - Status menu > ${label}`);
  }

  /** The visible leaf text that contains `fragment` ('' when none is drawn) - for messages FF shows as toasts. */
  async readVisibleMessage(fragment: string): Promise<string> {
    return this.page.evaluate((f) => {
      const hit = Array.from(document.querySelectorAll('*')).find((e) => e.children.length === 0 && (e.textContent || '').includes(f) && e.getBoundingClientRect().width > 0);
      return hit ? (hit.textContent || '').replace(/\s+/g, ' ').trim() : '';
    }, fragment);
  }

  /** Bounded wait until a visible leaf text containing `fragment` is drawn; returns it, or '' when none appears in time. */
  async waitForVisibleMessage(fragment: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<string> {
    const drawn = await this.page
      .waitForFunction(
        (f) => Array.from(document.querySelectorAll('*')).some((e) => e.children.length === 0 && (e.textContent || '').includes(f) && e.getBoundingClientRect().width > 0),
        fragment,
        { timeout }
      )
      .then(() => true)
      .catch(() => false);
    return drawn ? this.readVisibleMessage(fragment) : '';
  }

  /**
   * The visible page text (innerText, whitespace-normalised) must contain `fragment`. FF draws a new timeline comment only
   * after a refresh, so the page is reloaded between attempts (bounded). Returns the text from the fragment on ('' when the
   * fragment never shows up).
   */
  async waitForTicketText(fragment: string, attempts: number = 4, interval: number = CommonUtils.waitTimes.long): Promise<string> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const found = await this.page.evaluate((f) => {
        const t = (document.body.innerText || '').replace(/\s+/g, ' ');
        const idx = t.indexOf(f);
        return idx < 0 ? '' : t.slice(idx, idx + f.length + 160).trim();
      }, fragment);
      if (found) return found;
      console.log(`  - "${fragment}" not on the page yet (attempt ${attempt}/${attempts})`);
      if (attempt < attempts) {
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.headerButtonByLabel('Actions').or(this.headerMoreMenuButton()).first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
        await this.wait(interval);
      }
    }
    return '';
  }

  /** The text of the dialog Frappe shows ('' when none). */
  async getShownDialogTextFF(): Promise<string> {
    const dlg = this.shownDialog();
    if (!(await dlg.isVisible({ timeout: CommonUtils.waitTimes.medium }).catch(() => false))) return '';
    return ((await dlg.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  /** The Hibernate ticket wizard: the "Hibernate until" date (ISO yyyy-mm-dd as the date input holds it) and the reason box. */
  async getHibernateWizardDefaults(): Promise<{ untilIso: string; hasReason: boolean; buttons: string[] }> {
    const dlg = this.shownDialog();
    await dlg.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const untilIso = await dlg.locator('input[type="date"]').first().inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '');
    const hasReason = (await dlg.locator('textarea').count()) > 0;
    const buttons = (await dlg.locator('button').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    return { untilIso, hasReason, buttons };
  }

  /** Type the wizard's reason and press OK; waits for the wizard to close. */
  async confirmHibernateWizard(reason: string): Promise<void> {
    const dlg = this.shownDialog();
    const ta = dlg.locator('textarea').first();
    await ta.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await ta.fill(reason, { timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.short);
    await dlg.locator('button').filter({ hasText: /^\s*OK\s*$/ }).first().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.shownDialog().waitFor({ state: 'detached', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  - Hibernate wizard confirmed (reason "${reason}")`);
  }

  /** Press OK on the open dialog (the Archive confirmation), then wait for it to close. */
  async confirmShownDialogOk(): Promise<void> {
    const dlg = this.shownDialog();
    await dlg.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await dlg.locator('button').filter({ hasText: /^\s*OK\s*$/ }).first().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.shownDialog().waitFor({ state: 'detached', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  - Dialog confirmed (OK)');
  }

  /**
   * The side-panel field whose row starts with `label` (e.g. "Hibernate until"): its value and whether the control is
   * read-only or disabled. Found = a text box/area whose nearest row starts with the label (reads only, never edits).
   */
  async getPanelFieldState(label: string): Promise<{ found: boolean; value: string; readOnly: boolean; disabled: boolean }> {
    return this.page.evaluate((lbl) => {
      const controls = Array.from(document.querySelectorAll('input, textarea, select')) as Array<HTMLInputElement>;
      for (const el of controls) {
        let box: Element | null = el.parentElement;
        for (let i = 0; i < 5 && box; i++) {
          const txt = ((box as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim();
          if (txt.startsWith(lbl)) {
            return { found: true, value: el.value || '', readOnly: !!el.readOnly, disabled: !!el.disabled };
          }
          box = box.parentElement;
        }
      }
      return { found: false, value: '', readOnly: false, disabled: false };
    }, label);
  }

  /**
   * The kanban column (title, e.g. "Hibernate") of a ticket's card ('' when the card is not drawn). Read only.
   */
  async getKanbanColumnOfTicket(ticketName: string): Promise<string> {
    return this.page.evaluate((n) => {
      const link = document.querySelector(`a[href="/helpdesk/tickets/${n}"]`);
      if (!link) return '';
      let e: Element | null = link;
      while (e && !(Array.from(e.children).some((c) => c.getAttribute('title') === 'Fold' || c.getAttribute('title') === 'Show'))) e = e.parentElement;
      if (!e) return '';
      const h = Array.from(e.children).find((c) => c.getAttribute('title')) as HTMLElement | undefined;
      const titleEl = h?.querySelector('span.truncate') as HTMLElement | null;
      const folded = h?.getAttribute('title') === 'Show';
      const text = folded ? ((Array.from(e.children).find((c) => !c.getAttribute('title')) as HTMLElement | undefined)?.textContent || '') : (titleEl?.textContent || '');
      return text.replace(/\s+/g, ' ').trim();
    }, ticketName);
  }

  /**
   * Make the ticket's card drawn: the kanban column of `columnTitle` loads 20 cards at a time ("Load more" at its foot),
   * and the newest tickets are not always in the first 20. Returns false when the card never appears.
   */
  async revealKanbanCard(ticketName: string, columnTitle: string): Promise<boolean> {
    const link = this.page.locator(`a[href="/helpdesk/tickets/${ticketName}"]`).first();
    const column = this.kanbanColumns()
      .filter({ has: this.page.locator('div[title]').filter({ hasText: new RegExp(`^\\s*${columnTitle}(?![A-Za-z])`) }) })
      .first();
    // Cards of a column are listed by time in the stage, oldest first: a new ticket sits at the foot of its column, and the
    // "On Customer" column holds ~250 tickets (13 pages of 20), so the bound covers the whole column.
    for (let attempt = 1; attempt <= 20; attempt++) {
      if (await link.isVisible({ timeout: CommonUtils.waitTimes.medium }).catch(() => false)) return true;
      const more = column.locator('button').filter({ hasText: /^\s*Load more\s*$/ }).first();
      if (!(await more.isVisible({ timeout: CommonUtils.waitTimes.medium }).catch(() => false))) return false;
      await more.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.wait(CommonUtils.waitTimes.long);
      console.log(`  - Kanban column "${columnTitle}": loaded more cards (round ${attempt})`);
    }
    return link.isVisible({ timeout: CommonUtils.waitTimes.medium }).catch(() => false);
  }

  /**
   * Drag the ticket's kanban card onto the column `columnTitle` with real pointer moves. The viewport is widened to 3800 px
   * for the drag (the 13 stage columns do not fit 1920 px) and restored to 1920 x 1080 afterwards. Returns the message FF
   * shows after the drop ('' when none), and the card's column before and after.
   */
  async dragKanbanCardToColumn(
    ticketName: string,
    fromColumn: string,
    columnTitle: string,
    opts: { onMessage?: (message: string) => Promise<void> } = {}
  ): Promise<{ message: string; columnBefore: string; columnAfter: string }> {
    let result = { message: '', columnBefore: '', columnAfter: '' };
    for (let attempt = 1; attempt <= 3; attempt++) {
      result = await this.dragKanbanCardOnce(ticketName, fromColumn, columnTitle, opts);
      if (result.message || result.columnAfter !== result.columnBefore) return result;
      console.log(`  - Drop attempt ${attempt} produced no message and no move (pointer drop not registered) - retrying`);
    }
    return result;
  }

  /**
   * One pointer drag of the card onto the column (see dragKanbanCardToColumn for the retry around it).
   * `onMessage` runs the moment the refusal message is drawn (it is a toast that fades), with the message tagged
   * (SupportDeskPageMig.MESSAGE): the spec takes the verify-evidence shot of it there.
   */
  private async dragKanbanCardOnce(
    ticketName: string,
    fromColumn: string,
    columnTitle: string,
    opts: { onMessage?: (message: string) => Promise<void> } = {}
  ): Promise<{ message: string; columnBefore: string; columnAfter: string }> {
    await this.page.setViewportSize({ width: 3800, height: 1080 });
    await this.wait(CommonUtils.waitTimes.standard);
    if (!(await this.revealKanbanCard(ticketName, fromColumn))) {
      throw new Error(`dragKanbanCardToColumn: the card of ticket ${ticketName} is not drawn in "${fromColumn}"`);
    }
    const columnBefore = await this.getKanbanColumnOfTicket(ticketName);
    const link = this.page.locator(`a[href="/helpdesk/tickets/${ticketName}"]`).first();
    await link.scrollIntoViewIfNeeded({ timeout: CommonUtils.waitTimes.abnormalWait });
    const target = this.kanbanColumns()
      .filter({ has: this.page.locator('div[title]').filter({ hasText: new RegExp(`^\\s*${columnTitle}(?![A-Za-z])`) }) })
      .first();
    await target.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const from = await link.boundingBox({ timeout: CommonUtils.waitTimes.abnormalWait });
    const to = await target.boundingBox({ timeout: CommonUtils.waitTimes.abnormalWait });
    if (!from || !to) throw new Error(`dragKanbanCardToColumn(${ticketName} -> ${columnTitle}): no bounding box (card ${!!from}, column ${!!to})`);
    await this.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, { steps: 5 });
    await this.page.mouse.move(to.x + to.width / 2, to.y + 300, { steps: 30 });
    await this.wait(CommonUtils.waitTimes.medium);
    await this.page.mouse.up();
    await this.wait(CommonUtils.waitTimes.standard);
    const message = await this.waitForVisibleMessage('Do not change', CommonUtils.waitTimes.abnormalWait);
    if (message && opts.onMessage) {
      // Shot at 1920 px like every other evidence shot (at 3800 px the toast is a speck in the corner).
      await this.page.setViewportSize({ width: 1920, height: 1080 });
      await this.markVisibleMessage('Do not change');
      await opts.onMessage(message);
      await this.page.setViewportSize({ width: 3800, height: 1080 });
    }
    await this.wait(CommonUtils.waitTimes.long);
    // The kanban re-draws its columns after a drop and drops the pages it had loaded: the card is revealed again first.
    await this.revealKanbanCard(ticketName, fromColumn);
    const columnAfter = await this.getKanbanColumnOfTicket(ticketName);
    await this.page.setViewportSize({ width: 1920, height: 1080 });
    await this.wait(CommonUtils.waitTimes.standard);
    console.log(`  - Dragged ticket ${ticketName} onto "${columnTitle}": card ${columnBefore} -> ${columnAfter}; message "${message || '(none)'}"`);
    return { message, columnBefore, columnAfter };
  }

  /**
   * Open the list's Filters popover and choose "Archived" (a menu item): it switches the list to the Archived view, and
   * choosing it again switches back (the header crumb reads "Tickets / Archived" while it is on). FF saves this per user.
   */
  async toggleListArchivedFilter(): Promise<void> {
    const wasArchived = await this.isArchivedViewShown();
    const trigger = this.page
      .locator("xpath=//header//button[@aria-label='Filters']")
      .or(this.page.locator('header button[aria-label="Filters"]'))
      .first();
    await trigger.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await trigger.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    const item = this.page.locator('[role="menuitem"]').filter({ hasText: /^\s*Archived\s*$/ }).first();
    await item.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await item.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.keyboard.press('Escape');
    if (wasArchived) {
      // Switching the Archived view off is saved by the server, but the open page keeps the Archived header until it is reloaded (measured 2026-10-23).
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await this.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
      await this.wait(CommonUtils.waitTimes.long);
    }
    // The header follows the server's answer to the toggle, which can land several seconds later: wait (bounded) until it flips.
    for (let i = 0; i < 10; i++) {
      await this.wait(CommonUtils.waitTimes.long);
      if ((await this.isArchivedViewShown()) !== wasArchived) break;
    }
    console.log(`  - Filters > Archived toggled - header now reads "${await this.getHeaderCrumbs()}"`);
  }

  /** From the kanban, switch the tickets to the list layout (the header "List" button); a no-op on the list. */
  async switchToListLayout(): Promise<void> {
    if (!/layout=kanban/.test(this.page.url())) return;
    const btn = this.page.locator('header button').filter({ hasText: /^\s*List\s*$/ }).first();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.waitForURL((u) => !/layout=kanban/.test(u.toString()), { timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  - Switched to the list layout');
  }

  /** Whether the list is showing the Archived view (the header crumb names it). */
  async isArchivedViewShown(): Promise<boolean> {
    return /Archived/.test(await this.getHeaderCrumbs());
  }

  /**
   * Whether the ticket's row is drawn in the list; "Load more" is pressed (bounded) while the row is not among those drawn.
   */
  async revealListRow(ticketName: string, subject: string = ''): Promise<boolean> {
    const link = this.page.locator(`a[href="/helpdesk/tickets/${ticketName}"]`).first();
    // The ticket's link, or - the Archived view draws its rows as cells without a link on the row (measured 2026-10-23) -
    // the subject of the ticket among the rows drawn.
    const drawn = async (): Promise<boolean> => {
      if ((await link.count()) > 0) return true;
      if (!subject) return false;
      const body = (await this.page.locator('body').innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '';
      return body.includes(subject);
    };
    for (let attempt = 1; attempt <= 10; attempt++) {
      if (await drawn()) return true;
      const more = this.page.locator('button').filter({ hasText: /^\s*Load more\s*$/ }).first();
      if (!(await more.isVisible({ timeout: CommonUtils.waitTimes.medium }).catch(() => false))) return false;
      await more.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.wait(CommonUtils.waitTimes.long);
    }
    return drawn();
  }

  /** Choose the item `label` of the dropdown that is open (the Status menu); waits for the menu to close. */
  async pickOpenMenuItem(label: string): Promise<void> {
    const item = this.openMenuItems().filter({ hasText: new RegExp(`^\\s*${label.replace(/[()]/g, '\\$&')}\\s*$`) }).first();
    await item.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await item.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.openMenu().waitFor({ state: 'detached', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    // The header's Status button takes the new status as its label once FF has saved it: wait for that label.
    const saved = await this.statusMenuTrigger(label).waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  - Status menu > ${label} (header shows it: ${saved})`);
  }

  /**
   * READ-ONLY REST, as the signed-in user: who the ticket is assigned to - the HD Ticket's `_assign` list and the open ToDo
   * rows that point at it (the header "Assign to me" writes the ToDo; `_assign` can lag behind it, measured 2026-10-23).
   */
  async getAssigneeInfo(ticketName: string): Promise<{ assignField: string; openTodos: string[] }> {
    const res = await this.page.evaluate(async (n) => {
      const doc = await (await fetch(`/api/resource/HD Ticket/${encodeURIComponent(n)}`, { headers: { Accept: 'application/json' } })).json();
      const q = new URLSearchParams({
        fields: JSON.stringify(['allocated_to', 'status']),
        filters: JSON.stringify([['reference_type', '=', 'HD Ticket'], ['reference_name', '=', n]]),
        limit_page_length: '20',
      });
      const todos = await (await fetch(`/api/resource/ToDo?${q.toString()}`, { headers: { Accept: 'application/json' } })).json();
      return {
        assign: String((doc.data || {})._assign || ''),
        todos: ((todos.data || []) as Array<{ allocated_to: string; status: string }>).map((t) => `${t.allocated_to}:${t.status}`),
      };
    }, ticketName);
    return { assignField: res.assign, openTodos: res.todos };
  }

  /** The ticket's Activity tab, as text (the timeline of status and assignment changes), read after a reload. */
  async readActivityTimeline(): Promise<string> {
    // The "Activity" tab of the ticket's tab bar (Conversation | Activity | Emails | ...) holds the entries (measured
    // 2026-10-23). The VISIBLE match is taken (the same word also sits in hidden menus), then the entries are awaited.
    const tab = this.page.locator('button, [role="tab"], a, div').filter({ hasText: /^\s*Activity\s*$/ }).filter({ visible: true }).first();
    await tab.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await tab.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page
      .waitForFunction(() => /assigned themselves|Show\s*\+\s*\d+\s*changes?|Status changed|changed status/i.test(document.body.innerText || ''), undefined, { timeout: CommonUtils.waitTimes.abnormalWait })
      .catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    // Consecutive changes are folded into one row ("Show +4 changes"): the row is opened so every change is read.
    // Its text is split over spans ("Show " / "+3" / "changes from" / name) with a chevron button at the end (measured 2026-10-23).
    const fold = this.page.locator('div.inline-flex').filter({ hasText: /Show\s*\+\s*\d+\s*changes?/ }).first();
    if (await fold.isVisible({ timeout: CommonUtils.waitTimes.medium }).catch(() => false)) {
      const chevron = fold.locator('button').first();
      const target = (await chevron.isVisible({ timeout: CommonUtils.waitTimes.short }).catch(() => false)) ? chevron : fold;
      await target.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.wait(CommonUtils.waitTimes.long);
      console.log(`  - Opened the folded changes row : ${(await fold.innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')).replace(/\s+/g, ' ').trim()}`);
    }
    const text = (await this.page.locator('body').innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '';
    return text.replace(/\s+/g, ' ').trim();
  }

  /** Reload the page as it stands (a fresh read of the server's state, e.g. after a kanban drop). */
  async reloadPage(): Promise<void> {
    await this.page.reload({ waitUntil: 'domcontentloaded', timeout: CommonUtils.waitTimes.pageLoad });
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  - Page reloaded');
  }

  /** READ-ONLY REST, as the signed-in user: the Archive flag FF keeps (custom_archived), who and when. */
  async getArchiveState(ticketName: string): Promise<{ archived: boolean; by: string; on: string }> {
    const res = await this.page.evaluate(async (n) => {
      const r = await fetch(`/api/resource/HD Ticket/${encodeURIComponent(n)}`, { headers: { Accept: 'application/json' } });
      return { status: r.status, body: await r.text() };
    }, ticketName);
    if (res.status !== 200) throw new Error(`SupportDeskPageMig.getArchiveState(${ticketName}): HTTP ${res.status} ${res.body.slice(0, 300)}`);
    const d = JSON.parse(res.body).data || {};
    return { archived: Number(d.custom_archived || 0) === 1, by: String(d.custom_archived_by || ''), on: String(d.custom_archived_on || '') };
  }

  // ─── CRM-11859 close gate (TC-FLOW-038..041, side B) and the list bulk status (TC-UI-059, side B) ───

  /** The side-panel control of the row whose label span reads exactly `label` (span -> label wrapper -> control wrapper). */
  private sidePanelControl(label: string, kind: 'button' | 'input' | 'textarea'): Locator {
    return this.page.locator(`xpath=//span[normalize-space()='${label}']/../following-sibling::div[1]//${kind}`).first();
  }

  /** The visible options of the open dropdown / listbox, in on-screen order. Reads only. */
  private async openDropdownOptions(): Promise<string[]> {
    const items = await this.page.locator('[role="option"]').evaluateAll((els) =>
      els.filter((e) => (e as HTMLElement).getBoundingClientRect().width > 0).map((e) => ({ label: (e.textContent || '').replace(/\s+/g, ' ').trim(), top: e.getBoundingClientRect().top }))
    );
    return items.filter((i) => i.label).sort((a, b) => a.top - b.top).map((i) => i.label);
  }

  /** Click the open dropdown's option whose text is exactly `option`, then let the save settle. */
  private async pickDropdownOption(option: string): Promise<void> {
    const item = this.page.locator('[role="option"]').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(option)}\\s*$`) }).first();
    await item.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await item.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long);
  }

  /** Run a side-panel or status action that saves the ticket, and wait for that save to answer before the next action. Frappe refuses a save that is sent with the timestamp of the document as it was before the previous save answered ("Document has been modified after you have opened it") and its error overlay then blocks the page (measured 2026-10-23, TC-FLOW-039 B). */
  private async withSave(action: () => Promise<void>): Promise<void> {
    const answered = this.page.waitForResponse(
      (r) => r.request().method() !== 'GET' && /frappe\.client\.set_value|\/api\/resource\/HD%20Ticket\//.test(r.url()),
      { timeout: CommonUtils.waitTimes.long }
    ).catch(() => null);
    await action();
    await answered;
    await this.wait(CommonUtils.waitTimes.medium);
    const overlay = this.page.locator('#nkv-err-overlay');
    if (await overlay.isVisible().catch(() => false)) {
      const text = ((await overlay.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      throw new Error(`Frappe refused a save and its error overlay is shown: ${text.slice(0, 300) || '(no text)'}`);
    }
  }

  /** The header status change (chooseStatus) with its save awaited before the next step. */
  async chooseStatusSaved(from: string, label: string): Promise<void> {
    await this.withSave(() => this.chooseStatus(from, label));
  }

  /** The header "Assign to me" with its save awaited before the next step. */
  async assignToMeSaved(): Promise<void> {
    await this.withSave(() => this.assignToMeFromHeader());
  }

  /** TICKET group of the side panel: the BUTTON combobox "Set <label>..." (Severity Level, Bug Report, FCR, Wrongly escalated to L2) -> option. */
  async setSidePanelChoice(label: string, option: string): Promise<void> {
    const btn = this.page.locator('button[role="combobox"]').filter({ hasText: new RegExp(`^\\s*Set ${escapeRegExp(label)}\\.\\.\\.\\s*$`) }).first();
    await this.withSave(async () => {
      await btn.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.pickDropdownOption(option);
    });
    console.log(`  - ${label} = "${option}"`);
  }

  /** CLASSIFICATION group: open a select ('button') or a search box ('input') and list its options; nothing is picked. */
  async listClassificationOptions(label: string, kind: 'button' | 'input'): Promise<string[]> {
    await this.sidePanelControl(label, kind).click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.medium);
    const opts = await this.openDropdownOptions();
    await this.page.keyboard.press('Escape');
    await this.wait(CommonUtils.waitTimes.short);
    return opts;
  }

  /** CLASSIFICATION group: pick `option` in a select ('button') or a search box ('input'). */
  async setClassificationOption(label: string, kind: 'button' | 'input', option: string): Promise<void> {
    await this.withSave(async () => {
      await this.sidePanelControl(label, kind).click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await this.wait(CommonUtils.waitTimes.medium);
      await this.pickDropdownOption(option);
    });
    console.log(`  - ${label} = "${option}"`);
  }

  /** CLASSIFICATION text box (Description, Root cause, Resolution): filled, blurred (Tab) and given time to save. */
  async setClassificationText(label: string, text: string): Promise<void> {
    await this.withSave(async () => {
      await this.sidePanelControl(label, 'textarea').fill(text, { timeout: CommonUtils.waitTimes.abnormalWait });
      await this.page.keyboard.press('Tab');
    });
    await this.wait(CommonUtils.waitTimes.extraLong);
    console.log(`  - ${label} = "${text}"`);
  }

  /** Whether a side-panel control is drawn and editable (not disabled, not read-only). Reads only. */
  async getSidePanelEditable(label: string, kind: 'button' | 'input' | 'textarea'): Promise<{ found: boolean; editable: boolean }> {
    const ctl = this.sidePanelControl(label, kind);
    if (!(await ctl.count())) return { found: false, editable: false };
    const s = await ctl.evaluate((e) => ({ disabled: (e as HTMLButtonElement).disabled === true, readOnly: (e as HTMLInputElement).readOnly === true }));
    return { found: true, editable: !s.disabled && !s.readOnly };
  }

  /** TICKET group: "Closed By: add / remove" - open the picker and click the user's name (the caller reads the server). */
  async pickClosedBy(name: string): Promise<void> {
    await this.withSave(async () => {
      await this.sidePanelControl('Closed By: add / remove', 'button').click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await this.wait(CommonUtils.waitTimes.medium);
      await this.pickDropdownOption(name);
    });
    console.log(`  - Closed By: clicked "${name}"`);
  }

  /** READ-ONLY REST, as the signed-in user: the whole HD Ticket document. Throws on HTTP error. */
  async readTicketDocument(ticketName: string): Promise<Record<string, unknown>> {
    const res = await this.page.evaluate(async (n) => {
      const r = await fetch(`/api/resource/HD Ticket/${encodeURIComponent(n)}`, { headers: { Accept: 'application/json' } });
      return { status: r.status, body: await r.text() };
    }, ticketName);
    if (res.status !== 200) throw new Error(`SupportDeskPageMig.readTicketDocument(${ticketName}): HTTP ${res.status} ${res.body.slice(0, 300)}`);
    return JSON.parse(res.body).data || {};
  }

  /** The Closed By rows the server stores for the ticket (custom_closed_by), one JSON string per row; [] when none. */
  async readClosedByOverRest(ticketName: string): Promise<string[]> {
    const rows = ((await this.readTicketDocument(ticketName)).custom_closed_by as unknown[] | undefined) || [];
    return rows.map((r) => JSON.stringify(r));
  }

  /** The close-gate warning ("Missing required fields") as its dialog reads ('' when none is drawn within the bound). */
  async getCloseGateDialogText(): Promise<string> {
    const ok = this.page.getByRole('button', { name: 'OK', exact: true }).last();
    if (!(await ok.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) return '';
    return ok.evaluate((btn) => {
      let box: HTMLElement | null = btn as HTMLElement;
      for (let i = 0; i < 10 && box; i++) {
        const t = (box.innerText || '').replace(/\s+/g, ' ').trim();
        if (t.includes('Missing required fields')) return t;
        box = box.parentElement;
      }
      return '';
    });
  }

  /** CSS hook of the element tagged by markCloseGateDialog() - for captureVerifyEvidence's highlight. */
  static readonly CLOSE_GATE_DIALOG = '[data-pw-verify="close-gate"]';
  /** CSS hook of the element tagged by markVisibleMessage() - for captureVerifyEvidence's highlight. */
  static readonly MESSAGE = '[data-pw-verify="message"]';

  /**
   * Tag the close-gate warning ("Missing required fields") so a verify-evidence shot can outline it: the FF dialog
   * carries no role="dialog", so '[role="dialog"]' matches nothing. Call it while the dialog is open, then shoot with
   * highlight SupportDeskPageMig.CLOSE_GATE_DIALOG. Returns false when no such dialog is drawn.
   */
  async markCloseGateDialog(): Promise<boolean> {
    const ok = this.page.getByRole('button', { name: 'OK', exact: true }).last();
    if (!(await ok.isVisible({ timeout: CommonUtils.waitTimes.medium }).catch(() => false))) return false;
    return ok.evaluate((btn) => {
      document.querySelectorAll('[data-pw-verify]').forEach((e) => e.removeAttribute('data-pw-verify'));
      let box: HTMLElement | null = btn as HTMLElement;
      for (let i = 0; i < 10 && box; i++) {
        if ((box.innerText || '').includes('Missing required fields')) {
          box.setAttribute('data-pw-verify', 'close-gate');
          return true;
        }
        box = box.parentElement;
      }
      return false;
    }).catch(() => false);
  }

  /**
   * Tag the visible message (toast or inline text) holding `fragment` so a verify-evidence shot can outline it
   * (highlight SupportDeskPageMig.MESSAGE). Call it the moment the message is read - toasts fade. False when none is drawn.
   */
  async markVisibleMessage(fragment: string): Promise<boolean> {
    return this.page.evaluate((f) => {
      document.querySelectorAll('[data-pw-verify]').forEach((e) => e.removeAttribute('data-pw-verify'));
      const leaf = Array.from(document.querySelectorAll<HTMLElement>('*')).find(
        (e) => e.children.length === 0 && (e.textContent || '').includes(f) && e.getBoundingClientRect().width > 0
      );
      if (!leaf) return false;
      // Outline the whole message box (the toast pill / the dialog), not only its text line: climb while the parent
      // still ENCLOSES the text on screen and stays message-sized (a toast's transition wrapper sits below the pill
      // and must not be picked).
      const t = leaf.getBoundingClientRect();
      const encloses = (r: DOMRect) => r.left <= t.left + 1 && r.top <= t.top + 1 && r.right >= t.right - 1 && r.bottom >= t.bottom - 1;
      let box: HTMLElement = leaf;
      for (let i = 0; i < 4 && box.parentElement; i++) {
        const r = box.parentElement.getBoundingClientRect();
        if (!encloses(r) || r.width >= 700 || r.height >= 150) break;
        box = box.parentElement;
      }
      box.setAttribute('data-pw-verify', 'message');
      return true;
    }, fragment).catch(() => false);
  }

  /** CSS hook of the side-panel row tagged by markPanelRow() - for captureVerifyEvidence's highlight. */
  static readonly PANEL_ROW = '[data-pw-verify="panel-row"]';

  /**
   * Tag the side-panel row whose label starts with `label` (e.g. 'Closed By') - the label AND its value - so a
   * verify-evidence shot outlines the field the check is about, not the ticket header. False when the row is not drawn.
   */
  async markPanelRow(label: string): Promise<boolean> {
    return this.page.evaluate((l) => {
      document.querySelectorAll('[data-pw-verify]').forEach((e) => e.removeAttribute('data-pw-verify'));
      const leaf = Array.from(document.querySelectorAll<HTMLElement>('*')).find(
        (e) => e.children.length === 0 && (e.textContent || '').trim().startsWith(l) && e.getBoundingClientRect().width > 0
      );
      if (!leaf) return false;
      let row: HTMLElement = leaf;
      for (let i = 0; i < 5 && row.parentElement && row.getBoundingClientRect().width < 400; i++) row = row.parentElement;
      row.setAttribute('data-pw-verify', 'panel-row');
      return true;
    }, label).catch(() => false);
  }

  /** Press OK on the close-gate warning and let it close. */
  async confirmCloseGateDialog(): Promise<void> {
    await this.page.getByRole('button', { name: 'OK', exact: true }).last().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long);
  }

  /** The action texts of the ticket's Activity history, as the Activity tab reads them (the server's own call). */
  async getTicketHistoryActions(ticketName: string): Promise<string[]> {
    const res = await this.page.evaluate(async (n) => {
      const csrf = (window as unknown as { csrf_token?: string }).csrf_token || '';
      const r = await fetch('/api/method/helpdesk.helpdesk.doctype.hd_ticket.api.get_ticket_activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Frappe-CSRF-Token': csrf },
        body: JSON.stringify({ ticket: n, limit: 25 }),
      });
      return { status: r.status, body: await r.text() };
    }, ticketName);
    if (res.status !== 200) throw new Error(`SupportDeskPageMig.getTicketHistoryActions(${ticketName}): HTTP ${res.status} ${res.body.slice(0, 300)}`);
    const history = ((JSON.parse(res.body).message || {}).history || []) as Array<{ action?: string }>;
    return history.map((h) => String(h.action || ''));
  }

  /** Index (in DOM order) of the list row checkbox that belongs to the row holding `subject`; -1 when none. */
  private async rowCheckboxIndexFor(subject: string): Promise<number> {
    return this.page.evaluate((s) => {
      const boxes = Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
      for (let i = 0; i < boxes.length; i++) {
        let anc: HTMLElement | null = boxes[i].parentElement;
        for (let k = 0; k < 12 && anc; k++) {
          const t = anc.innerText || '';
          if (t.includes(s)) {
            if ((t.match(/QA FLOW probe/g) || []).length === 1) return i;
            break;
          }
          anc = anc.parentElement;
        }
      }
      return -1;
    }, subject);
  }

  /** Tick the list rows of the given subjects through their row checkboxes. Returns the count the selection bar reads. */
  async selectListRowsBySubjects(subjects: string[]): Promise<number> {
    for (const subject of subjects) {
      const idx = await this.rowCheckboxIndexFor(subject);
      if (idx < 0) throw new Error(`selectListRowsBySubjects: no row checkbox for "${subject}"`);
      await this.page.locator('input[type="checkbox"]').nth(idx).click({ force: true, timeout: CommonUtils.waitTimes.abnormalWait });
      await this.wait(CommonUtils.waitTimes.medium);
      console.log(`  - Row checkbox ticked: "${subject}"`);
    }
    const bar = await this.page.locator('div').filter({ hasText: /^\s*\d+ rows? selected/ }).last()
      .innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '');
    const m = bar.match(/(\d+) rows? selected/);
    return m ? Number(m[1]) : 0;
  }

  /**
   * The selected rows' bulk action: the bar's menu > Set status > the status > "Apply to <count> tickets". Returns the toast text.
   * `onToast` runs the moment the toast is drawn (it fades), with it tagged (SupportDeskPageMig.MESSAGE): the spec takes the
   * verify-evidence shot of the toast there.
   */
  async bulkSetStatus(status: string, count: number, opts: { onToast?: (toast: string) => Promise<void> } = {}): Promise<string> {
    await this.page.locator('div.absolute button[aria-haspopup="menu"]').first().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.locator('[role="menu"] [role="menuitem"]').first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.locator('[role="menu"] [role="menuitem"]').filter({ hasText: /^\s*Set status\s*$/ }).first().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    const dlg = this.page.locator('[role="dialog"]').filter({ hasText: 'Set status' }).last();
    await dlg.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await dlg.locator('button').filter({ hasText: /Select option/ }).first().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.pickDropdownOption(status);
    await dlg.locator('button').filter({ hasText: new RegExp(`^\\s*Apply to ${count} tickets?\\s*$`) }).first().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    const toast = await this.waitForVisibleMessage(`${count} ticket(s) changed`, CommonUtils.waitTimes.abnormalWait);
    if (toast && opts.onToast) {
      await this.markVisibleMessage(`${count} ticket(s) changed`);
      await opts.onToast(toast);
    }
    await dlg.waitFor({ state: 'detached', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    console.log(`  - Set status "${status}" > Apply to ${count} tickets`);
    return toast;
  }

  /** The side panel's "Assignee" row as its text (e.g. "Assignee N Nam Pham"; '' when the row is not drawn). Reads only. */
  async readAssigneeText(): Promise<string> {
    return this.page.evaluate(() => {
      const leaf = Array.from(document.querySelectorAll('span, div, dt, label, p'))
        .find((e) => e.children.length === 0 && (e.textContent || '').trim() === 'Assignee') as HTMLElement | undefined;
      if (!leaf) return '';
      let box: HTMLElement | null = leaf.parentElement;
      for (let i = 0; i < 4 && box; i++) {
        const t = (box.innerText || '').replace(/\s+/g, ' ').trim();
        if (t.length > "Assignee".length + 2) return t;
        box = box.parentElement;
      }
      return '';
    });
  }

  /** The list row of `subject` as its text (its row container, found through the row checkbox); '' when not drawn. */
  async readListRowText(subject: string): Promise<string> {
    const idx = await this.rowCheckboxIndexFor(subject);
    if (idx < 0) return '';
    return this.page.evaluate(([i, s]) => {
      const box = (Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[])[i];
      let anc: HTMLElement | null = box.parentElement;
      for (let k = 0; k < 12 && anc; k++) {
        if ((anc.innerText || '').includes(s)) return (anc.innerText || '').replace(/\s+/g, ' ').trim();
        anc = anc.parentElement;
      }
      return '';
    }, [idx, subject] as [number, string]);
  }
}

/** Escape a string for use inside a RegExp source. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
