import { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Helpdesk Page Object - the Helpdesk module (support tickets).
 *
 * Covers the Pre-Sales Engineer flow: open Helpdesk, open the "Sales Engineers" team's TICKETS,
 * switch to list view, search a ticket by Subject, open it, and read its Customer + chatter/Log note.
 *
 * Every locator uses the two-layer strategy: XPath primary, CSS fallback.
 */
export class HelpdeskPage extends BasePage {
  // Helpdesk app link on the apps home - addressed by XML id, which the DOM itself carries
  // (data-menu-xmlid=helpdesk.menu_helpdesk_root). The old href filter hard-coded menu_id=289,
  // which is Contract Tag on crm-mig after the 2026-10-13 rebuild.
  private readonly helpdeskAppLinkXPath = () =>
    this.page.locator("xpath=//a[contains(@data-menu-xmlid,'helpdesk')]").first();
  private readonly helpdeskAppLinkRole = () => this.page.getByRole('link', { name: /^\s*Helpdesk\s*$/i }).first();

  // The "Sales Engineers" team card on the Helpdesk Overview kanban, and its primary "Tickets" action
  // button (an Odoo kanban action button that drills into that team's tickets). Exact-text scoped so
  // it can't grab another team's card or a per-card stat count like "10 Tickets".
  private readonly salesEngineersCard = () =>
    this.page.locator("xpath=//div[contains(@class,'o_kanban_record')][.//*[normalize-space()='Sales Engineers']]").first();
  private readonly salesEngineersTicketsButton = () =>
    this.salesEngineersCard().locator("xpath=.//button[contains(@class,'oe_kanban_action_button') and normalize-space()='Tickets']").first();
  // Fallback: the first primary Tickets action button inside the Sales Engineers card.
  private readonly salesEngineersTicketsButtonFallback = () =>
    this.salesEngineersCard().locator("xpath=.//button[normalize-space()='Tickets'] | .//a[normalize-space()='Tickets']").first();

  // The team-card kanban records on the Overview (used to confirm we drilled OUT of the Overview).
  private readonly overviewTeamCards = () =>
    this.page.locator("xpath=//div[contains(@class,'o_kanban_record')][.//button[contains(@class,'oe_kanban_action_button')]]");

  // List-view toggle in the control panel (Odoo 12 view switcher), plus a "View list" button fallback.
  private readonly listViewToggle = () =>
    this.page.locator("xpath=//div[contains(@class,'o_cp_switch_buttons')]//button[contains(@class,'o_list') or @data-view-type='list' or @title='List'] | //div[contains(@class,'o_cp_switch_buttons')]//a[contains(@class,'o_list')]").first();
  private readonly viewListButton = () => this.page.getByRole('button', { name: /View list/i }).first();

  // Search view input.
  private readonly searchInputXPath = () =>
    this.page.locator("xpath=//div[contains(@class,'o_searchview')]//input[contains(@class,'o_searchview_input')]").first();
  private readonly searchInputCss = () => this.page.locator("input.o_searchview_input").first();

  // A ticket list row matching a given subject text.
  private readonly ticketRowByText = (text: string) =>
    this.page.locator("xpath=//tr[contains(@class,'o_data_row')]").filter({ hasText: text }).first();
  // A ticket kanban card matching a given subject text (in case list view is not active).
  private readonly ticketCardByText = (text: string) =>
    this.page.locator("xpath=//div[contains(@class,'o_kanban_record')]").filter({ hasText: text }).first();

  // Customer / partner field on the ticket form (readonly link or input).
  private readonly customerFieldXPath = () =>
    this.page.locator("xpath=//*[@name='partner_id']//a | //div[@name='partner_id']//input | //*[@name='partner_id']").first();

  // Chatter / log thread on the ticket form.
  private readonly chatterThread = () =>
    this.page.locator('.o_thread_message_content, .o_mail_thread, .o-mail-Thread');

  // "Assign To Me" button in the ticket form statusbar/header. Prefer the stable Odoo action name
  // (assign_ticket_to_self); fall back to the visible label. (The button is only present while the
  // ticket is unassigned - it disappears once assigned.)
  private readonly assignToMeButton = () =>
    this.page.locator("xpath=//button[@name='assign_ticket_to_self'] | //button[normalize-space()='Assign To Me' or normalize-space()='ASSIGN TO ME']").first();

  // The "Opportunity Info" notebook tab (lazy-rendered - its fields only exist after it is clicked).
  private readonly opportunityInfoTab = () =>
    this.page.locator("xpath=//a[normalize-space()='Opportunity Info']").first();

  // A field on the ticket form, addressed by its Odoo field name (readonly link/span). Opportunity Info
  // fields: opportunity_id (Opportunity), lead_reseller_id (Reseller), lead_country_id (Country),
  // lead_planed_revenue (Expected Revenue Deal). Prefer the anchor inside the widget, else the widget.
  private readonly fieldByName = (name: string) =>
    this.page.locator(`xpath=//*[@name='${name}']//a | //*[@name='${name}']`).first();

  // The list header cell (th) with a given column label, and a matched row's cell at a column index.
  private readonly listHeaderCells = () =>
    this.page.locator("xpath=//thead//th");

  // ─── Archive-from-list locators (helpdesk tickets can't be deleted, only archived) ───
  // The row selector is a Bootstrap custom-checkbox: the <input> is hidden and the <label> renders the
  // box via a pseudo-element (Playwright sees the label as "not visible"), so selection is done by
  // FORCE-clicking the label / custom-control div / cell and verifying the hidden input's checked state.
  private readonly ticketRowCheckboxInput = (subject: string) =>
    this.ticketRowByText(subject).locator("xpath=.//td[contains(@class,'o_list_record_selector')]//input[@type='checkbox'] | .//input[@type='checkbox']").first();
  private readonly ticketRowSelectorLabel = (subject: string) =>
    this.ticketRowByText(subject).locator("xpath=.//td[contains(@class,'o_list_record_selector')]//label[contains(@class,'custom-control-label')]").first();
  private readonly ticketRowSelectorCtrl = (subject: string) =>
    this.ticketRowByText(subject).locator("xpath=.//td[contains(@class,'o_list_record_selector')]//div[contains(@class,'custom-control')]").first();
  private readonly ticketRowSelectorCell = (subject: string) =>
    this.ticketRowByText(subject).locator("xpath=.//td[contains(@class,'o_list_record_selector')]").first();
  // The list control-panel "Action" dropdown (appears only when rows are selected).
  private readonly listActionMenuButton = () =>
    this.page.locator("xpath=//div[contains(@class,'o_cp_sidebar')]//button[contains(@class,'o_dropdown_toggler_btn') or normalize-space()='Action'] | //button[normalize-space()='Action']").first();
  // The "Archive" item inside the open Action dropdown (exact text, so it can't match "Unarchive").
  private readonly actionArchiveOption = () =>
    this.page.locator("xpath=//div[contains(@class,'dropdown-menu') and contains(@class,'show')]//a[normalize-space()='Archive'] | //ul[contains(@class,'dropdown-menu')]//a[normalize-space()='Archive'] | //a[normalize-space()='Archive']").first();
  // The confirmation dialog OK/Confirm button (Odoo may confirm the archive).
  private readonly archiveConfirmButton = () =>
    this.page.locator("xpath=//div[contains(@class,'modal') and contains(@class,'show')]//button[normalize-space()='Ok' or normalize-space()='OK' or normalize-space()='Confirm' or contains(@class,'btn-primary')]").first();

  // ---- Cards 4/5/6: run the session (In Progress) / notes & close ----
  // Stage pipeline button by its exact label (e.g. "In Progress", "Closed").
  private readonly stageButtonByName = (name: string) =>
    this.page.locator(`xpath=//div[contains(@class,'o_statusbar_status')]//button[normalize-space()='${name}']`).first();
  // Chatter "Log note" composer controls (o_chatter_button_log_note -> textarea -> "Log" send button).
  private readonly logNoteButton = () => this.page.locator('.o_chatter_button_log_note').first();
  private readonly composerTextarea = () =>
    this.page.locator('.o_chatter textarea.o_composer_text_field, .o_chatter textarea.o_input').first();
  private readonly composerSendButton = () => this.page.locator('.o_chatter .o_composer_button_send').first();

  // ---- Card 4 (7.2.3): the "L1 notes" meeting table on the ticket main page ----
  // The one2many field `meeting_info_ids` renders a list with columns (in order):
  // Meeting Link | Meeting Time | Meeting Client Name | Meeting Type | State.
  private readonly meetingInfoTable = () =>
    this.page.locator("xpath=//div[@name='meeting_info_ids']//table | //div[contains(@class,'o_field_x2many') and @name='meeting_info_ids']").first();
  private readonly meetingInfoRows = () =>
    this.page.locator("xpath=//div[@name='meeting_info_ids']//tr[contains(@class,'o_data_row')]");

  constructor(page: Page) {
    super(page);
  }

  /** Navigate to the Helpdesk module from the apps home (or via the app link). */
  async navigateToHelpdesk(): Promise<void> {
    await this.dismissErrorDialog();
    // Use whichever Helpdesk app link appears FIRST. The href-based XPath often does NOT match the
    // apps-home tile, and probing it alone (isVisible with a 3-min timeout) burned ~3 min before the
    // role-link fallback. .or() resolves the instant EITHER link is visible - no wasted sequential wait.
    const link = this.helpdeskAppLinkXPath().or(this.helpdeskAppLinkRole()).first();
    await link.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await link.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.waitForURL(`**/web?*menu_id=${await this.xmlId('helpdesk.menu_helpdesk_root')}*`, CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.dismissErrorDialog();
    console.log('  - Helpdesk module opened');
  }

  /** On the Helpdesk Overview, click the "Sales Engineers" team's primary "Tickets" button to drill
   *  into that team's tickets. Confirms we actually left the Overview (team cards gone). */
  async openSalesEngineersTickets(): Promise<void> {
    await this.dismissErrorDialog();
    await this.salesEngineersCard().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    let btn = this.salesEngineersTicketsButton();
    if (!(await btn.isVisible({ timeout: CommonUtils.waitTimes.elementAppear }).catch(() => false))) {
      btn = this.salesEngineersTicketsButtonFallback();
    }
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    // Confirm the drill-in: the Overview team cards should no longer be present.
    await this.overviewTeamCards().first().waitFor({ state: 'detached', timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    await this.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.dismissErrorDialog();
    console.log('  - Sales Engineers TICKETS opened');
  }

  /** Switch the TICKETS view to list (best-effort). Uses the control-panel list toggle first, then a
   *  "View list" button. No-op if neither is present (search works in kanban too). */
  async switchToListView(): Promise<void> {
    let toggle = this.listViewToggle();
    if (!(await toggle.isVisible({ timeout: CommonUtils.waitTimes.elementAppear }).catch(() => false))) {
      toggle = this.viewListButton();
    }
    if (await toggle.isVisible({ timeout: CommonUtils.waitTimes.elementAppear }).catch(() => false)) {
      await this.page.keyboard.press('Escape').catch(() => {});
      await toggle.click().catch(() => {});
      await this.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
      console.log('  - Switched tickets to list view');
    } else {
      console.log('  - No list toggle present (staying in current tickets view)');
    }
  }

  /**
   * Search the ticket list/kanban by Subject text.
   * NOTE: Odoo 12's search box only builds its search facet from real keystrokes - a plain fill()
   * sets the value but does NOT trigger the search, leaving the list unfiltered. So type the term
   * character-by-character (pressSequentially), then press Enter to apply the default-field search
   * (the ticket Display Name = its Subject, so this filters to the matching ticket).
   */
  async searchTicket(subject: string): Promise<void> {
    let input = this.searchInputXPath();
    if (!(await input.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) {
      input = this.searchInputCss();
    }
    await input.click();
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.short);
    await input.pressSequentially(subject, { delay: 20 });
    await this.wait(CommonUtils.waitTimes.medium);
    await this.page.keyboard.press('Enter');
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  - Searched tickets for "${subject}"`);
  }

  /** Whether a ticket whose Subject matches `subject` appears in the list/kanban. */
  async isTicketVisible(subject: string): Promise<boolean> {
    const row = this.ticketRowByText(subject);
    if (await row.isVisible({ timeout: CommonUtils.waitTimes.elementAppear }).catch(() => false)) return true;
    const card = this.ticketCardByText(subject);
    return await card.isVisible({ timeout: CommonUtils.waitTimes.elementAppear }).catch(() => false);
  }

  /** Open the ticket whose Subject matches `subject`. */
  async openTicket(subject: string): Promise<void> {
    const row = this.ticketRowByText(subject);
    if (await row.isVisible({ timeout: CommonUtils.waitTimes.elementAppear }).catch(() => false)) {
      await row.click();
    } else {
      await this.ticketCardByText(subject).click();
    }
    await this.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.dismissErrorDialog();
    console.log(`  - Opened ticket "${subject}"`);
  }

  /** Read the Customer (partner) name on the open ticket form. */
  async getCustomerName(): Promise<string> {
    const field = this.customerFieldXPath();
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    // Prefer an input value; fall back to the link/label text.
    const value = await field.inputValue().catch(() => null);
    if (value && value.trim()) return value.trim();
    const text = await field.textContent().catch(() => '');
    return (text ?? '').trim();
  }

  /** Full chatter/log text on the ticket form. */
  async getChatterLogText(): Promise<string> {
    await this.chatterThread().first().waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const texts = await this.chatterThread().allTextContents().catch(() => [] as string[]);
    return texts.join(' ');
  }

  /**
   * Poll the ticket chatter/Log note (with reloads) until it contains `expectedText`.
   * @returns { found, chatterText }
   */
  async waitForChatterContaining(
    expectedText: string,
    maxAttempts: number = 6,
    refreshInterval: number = CommonUtils.waitTimes.long
  ): Promise<{ found: boolean; chatterText: string }> {
    let found = false;
    let chatterText = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`  - Ticket chatter check, attempt ${attempt}/${maxAttempts}`);
      if (attempt > 1) {
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
        await this.wait(CommonUtils.waitTimes.checkingChatterLog);
      }
      chatterText = (await this.getChatterLogText()).replace(/\s+/g, ' ').trim();
      if (chatterText.includes(expectedText)) {
        console.log(`  - Ticket chatter contains expected text after attempt ${attempt}`);
        found = true;
        break;
      }
      const preview = chatterText.substring(0, 300);
      console.log(`  - Not found yet (attempt ${attempt}); chatter (first 300 chars): "${preview}"`);
      if (attempt < maxAttempts) await this.wait(refreshInterval);
    }
    return { found, chatterText };
  }

  // ─── Ticket form: Assign To Me + Opportunity Info tab ──────────────────────────

  /** Press "Assign To Me" on the open ticket (no-op if the button is absent / already assigned).
   *  Uses waitFor (not isVisible, which does NOT wait) so it does not skip while the statusbar is
   *  still rendering after the ticket opens. */
  async clickAssignToMe(): Promise<void> {
    await this.dismissErrorDialog();
    const btn = this.assignToMeButton();
    const appeared = await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    if (!appeared) {
      console.log('  - "Assign To Me" button not visible (maybe already assigned)');
      return;
    }
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  - Clicked "Assign To Me"');
  }

  /** Open the "Opportunity Info" tab (its fields are lazy-rendered until the tab is clicked). */
  async openOpportunityInfoTab(): Promise<void> {
    const tab = this.opportunityInfoTab();
    await tab.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await tab.scrollIntoViewIfNeeded().catch(() => {});
    await tab.click({ force: true });
    await this.wait(CommonUtils.waitTimes.long);
    await this.dismissErrorDialog();
    console.log('  - Opened "Opportunity Info" tab');
  }

  /**
   * Read a ticket-form field value by its Odoo field name. Handles readonly many2one links (<a>),
   * spans and inputs. Opportunity Info tab fields: opportunity_id, lead_reseller_id, lead_country_id,
   * lead_planed_revenue.
   */
  async getFieldValueByName(name: string): Promise<string> {
    const field = this.fieldByName(name);
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const iv = await field.inputValue().catch(() => null);
    if (iv && iv.trim()) return iv.trim();
    const t = await field.textContent().catch(() => '');
    return (t ?? '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Read the value of a named column for the ticket row matching `subject`, from the list view.
   * Matches the column by its header label and reads the aligned cell of the matched row.
   */
  async getTicketListColumnValue(subject: string, columnLabel: string): Promise<string> {
    const headers = (await this.listHeaderCells().allTextContents()).map((h) => h.replace(/\s+/g, ' ').trim());
    const idx = headers.findIndex((h) => h === columnLabel);
    console.log(`  - list headers: ${JSON.stringify(headers)} | "${columnLabel}" at index ${idx}`);
    if (idx < 0) return '';
    const row = this.ticketRowByText(subject);
    await row.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const cell = row.locator('xpath=./td').nth(idx);
    const t = await cell.textContent().catch(() => '');
    return (t ?? '').replace(/\s+/g, ' ').trim();
  }

  // ─── Cards 4/5/6: run the session / notes & close ─────────────────────────────

  /** Read the Stage name on the ticket statusbar (e.g. "New", "In Progress", "Closed"). */
  async getStageName(): Promise<string> {
    return await this.getFieldValueByName('stage_name');
  }

  /** Read the "Assigned to" (user_id) value on the ticket. */
  async getAssignedTo(): Promise<string> {
    return await this.getFieldValueByName('user_id');
  }

  /** Read the "Ticket Type" (classification_ticket_type) value on the ticket. */
  async getTicketType(): Promise<string> {
    return await this.getFieldValueByName('classification_ticket_type');
  }

  /** Read the "Close date" (close_date) value on the ticket. */
  async getCloseDate(): Promise<string> {
    return await this.getFieldValueByName('close_date');
  }

  /**
   * Move the ticket to the given pipeline stage by clicking its statusbar button, then confirm the
   * change persisted. NOTE: on this Helpdesk the statusbar stage write is applied ASYNCHRONOUSLY -
   * the in-page form can still show the old stage right after the click - so this reloads and
   * re-reads Stage Name until it matches the target (or the attempts run out). Returns the last-read
   * Stage Name.
   */
  async moveTicketToStage(stageName: string, maxAttempts: number = 6): Promise<string> {
    await this.dismissErrorDialog();
    const btn = this.stageButtonByName(stageName);
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await btn.scrollIntoViewIfNeeded();
    await btn.click().catch(() => {});
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.wait(CommonUtils.waitTimes.extraLong);
    let current = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      current = await this.getStageName();
      console.log(`  - Stage check ${attempt}/${maxAttempts}: "${current}" (target "${stageName}")`);
      if (current.trim().toLowerCase() === stageName.trim().toLowerCase()) {
        console.log(`  - Ticket stage is now "${stageName}"`);
        return current;
      }
      if (attempt < maxAttempts) {
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
        await this.wait(CommonUtils.waitTimes.checkingChatterLog);
      }
    }
    return current;
  }

  /** Write a Log note (internal message) on the ticket chatter and post it (send button = "Log"). */
  async postLogNote(text: string): Promise<void> {
    await this.dismissErrorDialog();
    const logBtn = this.logNoteButton();
    await logBtn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await logBtn.click();
    await this.wait(CommonUtils.waitTimes.medium);
    const ta = this.composerTextarea();
    await ta.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await ta.click();
    await ta.fill(text);
    await this.wait(CommonUtils.waitTimes.short);
    const send = this.composerSendButton();
    await send.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await send.click();
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  - Posted Log note: "${text}"`);
  }

  // ─── Archive a ticket from the list (helpdesk tickets can't be deleted, only archived) ─────────

  // The Helpdesk top-navbar "Overview" menu link (loads the team-Overview kanban as a PROPER menu
  // action, within the app - fast, no apps-home round-trip and no slow app-link wait).
  private readonly overviewMenuLink = () =>
    this.page.locator("xpath=//div[contains(@class,'o_menu_sections')]//a[normalize-space()='Overview'] | //nav//a[normalize-space()='Overview'] | //ul//a[normalize-space()='Overview']").or(
      this.page.getByRole('link', { name: /^\s*Overview\s*$/i })
    ).first();

  /**
   * Open the Helpdesk team "Overview" kanban via the top-navbar menu (a proper, fast in-app menu action).
   * Use this instead of navigateToHelpdesk() when already inside the Helpdesk app (e.g. on the calendar
   * or a ticket form) - navigateToHelpdesk() wastes minutes waiting for the apps-home app link.
   */
  async openHelpdeskOverview(): Promise<void> {
    await this.dismissErrorDialog();
    const link = this.overviewMenuLink();
    await link.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await link.scrollIntoViewIfNeeded().catch(() => {});
    await link.click();
    await this.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    await this.dismissErrorDialog();
    console.log('  - Opened Helpdesk Overview (navbar)');
  }

  /**
   * Re-open a ticket FORM by Subject, fast and reliably, from anywhere inside the Helpdesk app:
   * Overview (navbar) -> Sales Engineers TICKETS -> list view -> search -> open the row. This reuses
   * the SAME proven chain that renders the ticket form during the main flow (a direct list-URL load
   * does NOT render the form on row-click; the huge "All Tickets" list does not surface the row).
   */
  async reopenTicketViaOverview(subject: string): Promise<void> {
    await this.openHelpdeskOverview();
    await this.openSalesEngineersTickets();
    await this.switchToListView();
    await this.searchTicket(subject);
    await this.openTicket(subject);
  }

  /**
   * Navigate DIRECTLY to the "Sales Engineers" team tickets LIST (action 465), bypassing the slow
   * Helpdesk Overview kanban drill-in. Used by teardown to reach the list quickly for archiving.
   */
  async openSalesEngineersTicketsListDirect(): Promise<void> {
    const origin = new URL(this.page.url()).origin;
    const url = `${origin}/web?#action=${await this.xmlId('helpdesk.helpdesk_ticket_action_team')}&active_id=5&model=helpdesk.ticket&view_type=list&menu_id=${await this.xmlId('helpdesk.menu_helpdesk_root')}`;
    await this.page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    // Wait for the list view itself to render (waitForPageReady alone can resolve before the list is up).
    await this.page.waitForSelector('.o_list_view, .o_content', { timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    await this.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    await this.dismissErrorDialog();
    console.log('  - Opened Sales Engineers tickets list (direct URL)');
  }

  /**
   * Open the UNFILTERED ticket list (action 455 - "All Tickets"), the list a ticket created by this
   * suite is guaranteed to appear in regardless of which team it landed on.
   */
  async openAllTicketsListDirect(baseUrl: string): Promise<void> {
    const url = `${baseUrl.replace(/\/$/, '')}/web#action=${await this.xmlId('helpdesk.helpdesk_ticket_action_main_tree')}&model=helpdesk.ticket&view_type=list`;
    await this.page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.page
      .waitForSelector('.o_list_view, .o_content', { timeout: CommonUtils.waitTimes.pageLoad })
      .catch(() => {});
    await this.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    await this.dismissErrorDialog();
    console.log('  - Opened All Tickets list (direct URL)');
  }

  /**
   * In the ticket LIST, select the row matching `subject` and Archive it via the list "Action" menu
   * (helpdesk tickets cannot be deleted - only archived). The row selector is a Bootstrap custom-
   * checkbox, so it is selected by FORCE-clicking the label / custom-control / cell (the hidden input
   * can't be clicked and check({force}) doesn't fire Odoo's selection handler). Confirms the archive
   * dialog. Returns true only when the input actually became checked and Archive was triggered.
   */
  async archiveTicketFromListBySubject(subject: string): Promise<boolean> {
    // The row must exist (short bound - if the search surfaced nothing, fail fast, don't hang).
    const row = this.ticketRowByText(subject);
    if (!(await row.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false))) {
      console.log(`  - No ticket row for "${subject}"`);
      return false;
    }

    // Select the row: force-click label -> custom-control div -> cell, verifying the input got checked.
    const input = this.ticketRowCheckboxInput(subject);
    let checked = await input.isChecked().catch(() => false);
    for (const target of [this.ticketRowSelectorLabel(subject), this.ticketRowSelectorCtrl(subject), this.ticketRowSelectorCell(subject)]) {
      if (checked) break;
      await target.click({ force: true, timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.short);
      checked = await input.isChecked().catch(() => false);
    }
    if (!checked) {
      console.log(`  - Could not select the row for "${subject}"`);
      return false;
    }

    // Open the list "Action" dropdown (only present when a row is selected).
    const actionBtn = this.listActionMenuButton();
    await actionBtn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await actionBtn.click();
    await this.wait(CommonUtils.waitTimes.medium);

    // Click "Archive".
    const archive = this.actionArchiveOption();
    await archive.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await archive.click();
    await this.wait(CommonUtils.waitTimes.medium);

    // Confirm the archive dialog (Odoo shows one for archive).
    const confirm = this.archiveConfirmButton();
    if (await confirm.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false)) {
      await confirm.click();
    }
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  - Archived ticket "${subject}"`);
    return true;
  }

  // ─── Card 4 (7.2.3): read the "L1 notes" meeting table (meeting_info_ids) ──────

  /** Current number of rows in the "L1 notes" meeting table on the ticket. */
  async getMeetingInfoRowCount(): Promise<number> {
    return await this.meetingInfoRows().count().catch(() => 0);
  }

  /** Diagnostic: whether the ticket FORM is rendered, and the raw text of the "L1 notes" table. */
  async logMeetingInfoDiagnostic(): Promise<void> {
    const formVisible = await this.page.locator('.o_form_view').first().isVisible().catch(() => false);
    const tableCount = await this.meetingInfoTable().count().catch(() => 0);
    const tableTxt = tableCount
      ? ((await this.meetingInfoTable().first().textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim().substring(0, 220)
      : '(meeting_info_ids table not in DOM)';
    console.log(`      [diag] ticket form visible=${formVisible} | L1-notes table text: "${tableTxt}"`);
  }

  /**
   * Poll the ticket (reloading between attempts) until the "L1 notes" meeting table shows at least
   * one row - the created meeting is written back to the ticket asynchronously. Returns true once a
   * row appears. Reloading re-renders the ticket main page where meeting_info_ids lives.
   */
  async waitForMeetingInfoRow(maxAttempts: number = 3): Promise<boolean> {
    // Wait for the ticket FORM (and its L1-notes table) to actually paint first - openTicket's
    // page-ready can resolve a beat before the form renders, so a naive first read sees no form.
    await this.page.locator('.o_form_view').first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    await this.meetingInfoTable().first().waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        // The ticket form is already open FRESH (re-opened after the meeting was committed). Just wait
        // and re-read IN PLACE for any render lag. Do NOT page.reload()/re-navigate: reloading the ticket
        // FORM url renders the LIST on this Odoo, and re-navigating the form does not re-render reliably.
        await this.wait(CommonUtils.waitTimes.checkingChatterLog);
      }
      const count = await this.getMeetingInfoRowCount();
      console.log(`  - L1 notes row check ${attempt}/${maxAttempts}: ${count} row(s)`);
      if (count > 0) return true;
      if (attempt === 1 || attempt === maxAttempts) await this.logMeetingInfoDiagnostic();
    }
    return false;
  }

  /**
   * Read the first row of the "L1 notes" meeting table as {meetingLink, meetingTime,
   * meetingClientName, meetingType, state} (cells read left-to-right by the fixed column order).
   */
  async getFirstMeetingInfoRow(): Promise<{
    meetingLink: string;
    meetingTime: string;
    meetingClientName: string;
    meetingType: string;
    state: string;
  }> {
    const row = this.meetingInfoRows().first();
    await row.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const cells = await row.locator('xpath=./td[not(contains(@class,"o_list_record_selector"))]').allTextContents().catch(() => [] as string[]);
    const clean = cells.map((c) => (c ?? '').replace(/\s+/g, ' ').trim());
    return {
      meetingLink: clean[0] ?? '',
      meetingTime: clean[1] ?? '',
      meetingClientName: clean[2] ?? '',
      meetingType: clean[3] ?? '',
      state: clean[4] ?? '',
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  //  CRM-12540 - chatter carrying characters PostgreSQL cannot store
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  //  The composer paste, the server-path post and the stored-body readback are model-agnostic and
  //  live on BasePage (openRecordFormById / pasteAndPostLogNote / pasteAndSendMessage /
  //  postChatterMessageViaServerPath / getStoredChatterMessageText), so the same scenario can be
  //  proven on a lead and an invoice too. What stays here is helpdesk-specific: creating a ticket,
  //  opening the unfiltered ticket list, and the two ticket-scoped delegates.

  private readonly listCreateButton = () =>
    this.page.locator("xpath=//button[contains(@class,'o_list_button_add')]").first();
  private readonly formSaveButton = () =>
    this.page.locator("xpath=//button[contains(@class,'o_form_button_save')]").first();
  private readonly subjectField = () =>
    this.page.locator("xpath=//input[@name='name'] | //div[@name='name']//input").first();

  /** Open a ticket form straight by record id, with its chatter ready. */
  async openTicketById(baseUrl: string, ticketId: number | string): Promise<void> {
    await this.openRecordFormById(baseUrl, 'helpdesk.ticket', ticketId);
  }

  /**
   * Create a helpdesk ticket with the given Subject through the Tickets list (action 455 -
   * "All Tickets", the unfiltered ticket action) and return its record id.
   * THROWS when the ticket cannot be created - a setup step must never fail silently.
   */
  async createTicket(baseUrl: string, subject: string): Promise<string> {
    const listUrl = `${baseUrl.replace(/\/$/, '')}/web#action=${await this.xmlId('helpdesk.helpdesk_ticket_action_main_tree')}&model=helpdesk.ticket&view_type=list`;
    await this.page.goto(listUrl, { waitUntil: 'domcontentloaded' });
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);

    const create = this.listCreateButton();
    await create.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await create.click();
    await this.waitForFormView(CommonUtils.waitTimes.abnormalWait);

    const subj = this.subjectField();
    await subj.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await subj.click();
    await subj.fill(subject);
    await this.wait(CommonUtils.waitTimes.short);

    const save = this.formSaveButton();
    await save.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await save.click();
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});

    const popup = await this.getBlockingPopupText(CommonUtils.waitTimes.long);
    if (popup) throw new Error(`createTicket("${subject}") was blocked by a dialog: ${popup}`);

    const id = await this.waitForIdInUrlAndExtract(CommonUtils.waitTimes.abnormalWait);
    if (!/^\d+$/.test(id)) throw new Error(`createTicket("${subject}") did not yield a record id (got "${id}")`);
    console.log(`  - Created helpdesk ticket #${id} - Subject "${subject}"`);
    return id;
  }

  /** Ticket-scoped delegate: post through the server path on this ticket. */
  async postMessageViaServerPath(ticketId: number | string, text: string): Promise<number> {
    return this.postChatterMessageViaServerPath('helpdesk.ticket', ticketId, text);
  }

  /** Ticket-scoped delegate: newest stored chatter body on this ticket, as plain text. */
  async getStoredLastMessageText(ticketId: number | string): Promise<string> {
    return this.getStoredChatterMessageText('helpdesk.ticket', ticketId);
  }

  // ─── pre-sale-7.7 .. 7.15 (CRM-12203 .. CRM-12235): ticket form reads/edits on PRE-PRODUCTION ───
  // Form Edit / Save / Discard (Odoo 12 form control panel).
  private readonly ticketEditButton = () =>
    this.page.locator("xpath=//button[contains(@class,'o_form_button_edit')]").or(this.page.locator('button.o_form_button_edit')).first();
  private readonly ticketSaveButton = () =>
    this.page.locator("xpath=//button[contains(@class,'o_form_button_save')]").or(this.page.locator('button.o_form_button_save')).first();
  private readonly ticketDiscardButton = () =>
    this.page.locator("xpath=//button[contains(@class,'o_form_button_cancel')]").or(this.page.locator('button.o_form_button_cancel')).first();
  // Priority widget stars (Odoo priority radiogroup). The lowest level carries no star - it is the
  // state with no star checked.
  private readonly priorityStars = () =>
    this.page.locator("xpath=//div[@name='priority']//a[contains(@class,'o_priority_star')]").or(this.page.locator("div[name='priority'] a.o_priority_star"));
  private readonly priorityStarByTitle = (title: string) =>
    this.page.locator(`xpath=//div[@name='priority']//a[contains(@class,'o_priority_star')][@title='${title}']`).first();
  // Many2one "Assigned to" input in edit mode + its autocomplete items.
  private readonly assignedToInput = () =>
    this.page.locator("xpath=//div[@name='user_id']//input").or(this.page.locator("div[name='user_id'] input")).first();
  private readonly autocompleteItems = () =>
    this.page.locator("xpath=//ul[contains(@class,'ui-autocomplete')]//li").or(this.page.locator('ul.ui-autocomplete li'));
  // Statusbar stage buttons.
  private readonly stageButtons = () =>
    this.page.locator("xpath=//div[contains(@class,'o_statusbar_status')]//button").or(this.page.locator('.o_statusbar_status button'));
  // Header action buttons that are displayed (Odoo hides the rest with o_invisible_modifier).
  private readonly visibleHeaderButtons = () =>
    this.page.locator("xpath=//div[contains(@class,'o_statusbar_buttons')]/button[not(contains(@class,'o_invisible_modifier'))]")
      .or(this.page.locator('.o_statusbar_buttons > button:not(.o_invisible_modifier)'));
  // List rows of the ticket list view.
  private readonly listRows = () =>
    this.page.locator("xpath=//tr[contains(@class,'o_data_row')]").or(this.page.locator('tr.o_data_row'));
  // The dialog Odoo is currently showing (validation error, warning, access error).
  private readonly shownDialog = () =>
    this.page.locator("xpath=//div[contains(@class,'modal') and contains(@class,'show')]").or(this.page.locator('div.modal.show')).last();

  /** Put the ticket form in edit mode. */
  async clickEditTicket(): Promise<void> {
    await this.dismissErrorDialog();
    await this.ticketEditButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.ticketEditButton().click();
    await this.ticketSaveButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.medium);
  }

  /** Whether the form offers EDIT to the signed-in user. */
  async isEditTicketAvailable(): Promise<boolean> {
    return this.ticketEditButton().isVisible({ timeout: CommonUtils.waitTimes.extraLong }).catch(() => false);
  }

  /** Save the ticket form and wait for read mode - returns false when something (a dialog) blocked the save. */
  async clickSaveTicket(): Promise<boolean> {
    await this.ticketSaveButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    const saved = await this.ticketEditButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.savingPage }).then(() => true).catch(() => false);
    await this.wait(CommonUtils.waitTimes.long);
    return saved;
  }

  /** Discard pending edits (and confirm the discard dialog if Odoo raises one). */
  async discardTicketEdits(): Promise<void> {
    if (await this.ticketDiscardButton().isVisible({ timeout: CommonUtils.waitTimes.medium }).catch(() => false)) {
      await this.ticketDiscardButton().click().catch(() => {});
      await this.dismissDiscardChangesDialog().catch(() => false);
      await this.wait(CommonUtils.waitTimes.standard);
    }
  }

  /** Subject of the open ticket (field `name`). */
  async getTicketSubject(): Promise<string> {
    return this.getFieldValueByName('name');
  }

  /** Helpdesk Team of the open ticket (field `team_id`). */
  async getHelpdeskTeam(): Promise<string> {
    return this.getFieldValueByName('team_id');
  }

  /** Titles of the priority stars, in order (e.g. Medium, High, Urgent). */
  async getPriorityStarTitles(): Promise<string[]> {
    await this.priorityStars().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    return this.priorityStars().evaluateAll((els) => els.map((e) => e.getAttribute('title') || ''));
  }

  /**
   * The current priority label: the title of the highest checked star, or `lowLabel` (default "Low")
   * when no star is checked - the lowest level of the scale carries no star.
   */
  async getPriorityLabel(lowLabel: string = 'Low'): Promise<string> {
    await this.priorityStars().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const checked = await this.priorityStars().evaluateAll((els) =>
      els.filter((e) => e.getAttribute('aria-checked') === 'true').map((e) => e.getAttribute('title') || '')
    );
    return checked.length ? checked[checked.length - 1] : lowLabel;
  }

  /**
   * Set the priority in EDIT mode. A star label clicks that star; `lowLabel` clicks the currently
   * highest checked star, which the Odoo priority widget turns into "no star" (the lowest level).
   */
  async setPriority(label: string, lowLabel: string = 'Low'): Promise<void> {
    if (label === lowLabel) {
      const current = await this.getPriorityLabel(lowLabel);
      if (current === lowLabel) return;
      await this.priorityStarByTitle(current).click();
    } else {
      await this.priorityStarByTitle(label).click();
    }
    await this.wait(CommonUtils.waitTimes.medium);
    console.log(`  - Priority set to "${label}"`);
  }

  /** Set "Assigned to" (user_id) in EDIT mode to `userName` via the many2one autocomplete. */
  async setAssignedTo(userName: string): Promise<void> {
    const input = this.assignedToInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.short);
    await input.pressSequentially(userName, { delay: 20 });
    const item = this.autocompleteItems().filter({ hasText: userName }).first();
    await item.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await item.click();
    await this.wait(CommonUtils.waitTimes.medium);
    console.log(`  - Assigned to set to "${userName}"`);
  }

  /** Labels of the statusbar stages, in on-screen order. */
  async getStageButtonLabels(): Promise<string[]> {
    const raw = await this.stageButtons().allTextContents();
    return raw.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  /** Whether the statusbar lets the signed-in user click a stage (Odoo renders it disabled when readonly). */
  async isStageBarClickable(): Promise<boolean> {
    return this.stageButtons().evaluateAll((els) => els.some((e) => !(e as HTMLButtonElement).disabled && !e.hasAttribute('disabled')));
  }

  /** Labels of the header action buttons the signed-in user can see (e.g. ASSIGN TO ME, Close). */
  async getVisibleHeaderButtons(): Promise<string[]> {
    const raw = await this.visibleHeaderButtons().allTextContents();
    return raw.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  /** Number of ticket rows in the current list whose text contains `text`. */
  async countTicketRows(text: string): Promise<number> {
    await this.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
    return this.listRows().filter({ hasText: text }).count();
  }

  /**
   * Priority shown in the LIST row of the ticket matching `subject`: title of the highest checked
   * star, or `lowLabel` when no star is checked.
   */
  async getListRowPriority(subject: string, lowLabel: string = 'Low'): Promise<string> {
    const row = this.ticketRowByText(subject);
    await row.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const checked = await row.locator("xpath=.//div[@name='priority']//a[@aria-checked='true'] | .//*[contains(@class,'o_priority')]//a[@aria-checked='true']")
      .evaluateAll((els) => els.map((e) => e.getAttribute('title') || ''));
    return checked.length ? checked[checked.length - 1] : lowLabel;
  }

  /**
   * Open the Sales Engineers ticket LIST by its action (same target as Helpdesk > Sales Engineers >
   * Tickets) and report what the signed-in user got - WITHOUT dismissing an access error first, so the
   * refusal itself can be evidenced. `listShown` = a ticket list view rendered; `error` = the dialog text.
   */
  async openSalesEngineersTicketsListReportingAccess(): Promise<{ listShown: boolean; error: string }> {
    const origin = new URL(this.page.url()).origin;
    const url = `${origin}/web?#action=${await this.xmlId('helpdesk.helpdesk_ticket_action_team')}&active_id=5&model=helpdesk.ticket&view_type=list&menu_id=${await this.xmlId('helpdesk.menu_helpdesk_root')}`;
    await this.page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    const list = this.page.locator("xpath=//div[contains(@class,'o_list_view')]").or(this.page.locator('.o_list_view')).first();
    await Promise.race([
      list.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad }),
      this.shownDialog().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad }),
    ]).catch(() => {});
    const error = await this.getShownDialogText();
    const listShown = await list.isVisible().catch(() => false);
    console.log(`  - Sales Engineers list shown: ${listShown}${error ? ` | dialog: ${error.slice(0, 160)}` : ''}`);
    return { listShown, error };
  }

  /** Open a ticket-form notebook tab by its label (e.g. "Description"); the tab content is lazy. */
  async openTicketTab(label: string): Promise<void> {
    const tab = this.page.locator(`xpath=//div[contains(@class,'o_notebook')]//a[normalize-space()='${label}']`)
      .or(this.page.locator('.o_notebook a.nav-link', { hasText: label })).first();
    await tab.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await tab.click();
    await this.wait(CommonUtils.waitTimes.standard);
  }

  /** Whether the Helpdesk app entry point (the SE working surface's door) is on the apps home. */
  async isHelpdeskEntryVisible(): Promise<boolean> {
    return this.helpdeskAppLinkXPath().or(this.helpdeskAppLinkRole()).first().isVisible({ timeout: CommonUtils.waitTimes.elementAppear }).catch(() => false);
  }

  /** Column labels of the current ticket list (selector column dropped). */
  async getListHeaders(): Promise<string[]> {
    await this.listHeaderCells().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const raw = await this.listHeaderCells().allTextContents();
    return raw.map((t) => t.replace(/[\s​]+/g, ' ').trim()).filter(Boolean);
  }

  /** Title + body of the dialog Odoo is showing ('' when none). */
  async getShownDialogText(): Promise<string> {
    const dlg = this.shownDialog();
    if (!(await dlg.isVisible({ timeout: CommonUtils.waitTimes.extraLong }).catch(() => false))) return '';
    return ((await dlg.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  /** Close the shown dialog with its first footer button (OK / Close). */
  async closeShownDialog(): Promise<void> {
    const dlg = this.shownDialog();
    if (await dlg.isVisible({ timeout: CommonUtils.waitTimes.medium }).catch(() => false)) {
      await dlg.locator("xpath=.//footer//button | .//div[contains(@class,'modal-footer')]//button").first()
        .click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.standard);
    }
  }

  // "Ticket Type" under CLASSIFICATION (classification_ticket_type) - a native <select> in edit mode.
  private readonly classificationTicketTypeSelect = () =>
    this.page.locator("xpath=//select[@name='classification_ticket_type']").or(this.page.locator("select[name='classification_ticket_type']")).first();

  /** Every option label of the CLASSIFICATION "Ticket Type" select (EDIT mode; the empty option dropped). */
  async getClassificationTicketTypeOptions(): Promise<string[]> {
    const select = this.classificationTicketTypeSelect();
    await select.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const raw = await select.locator('option').allTextContents();
    return raw.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t && t !== 'false');
  }

  /** Set the CLASSIFICATION "Ticket Type" in EDIT mode; '' empties it. */
  async setClassificationTicketType(label: string): Promise<void> {
    const select = this.classificationTicketTypeSelect();
    await select.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    if (label === '') await select.selectOption({ index: 0 });
    else await select.selectOption({ label });
    await this.wait(CommonUtils.waitTimes.medium);
    console.log(`  - Ticket Type set to "${label || '(empty)'}"`);
  }

  /**
   * Click a statusbar stage ONCE (no reload loop) - for the negative path where the move is expected to
   * be refused by a dialog. Returns the dialog text Odoo shows ('' when none).
   */
  async clickStageExpectingRefusal(stageName: string): Promise<string> {
    await this.dismissErrorDialog();
    const btn = this.stageButtonByName(stageName);
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await btn.click();
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    // The refusal comes back from the server several seconds after the click (~4 s measured) - wait for
    // the dialog itself rather than reading the screen once.
    await this.shownDialog().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    return this.getShownDialogText();
  }

  /**
   * On the "Opportunity Info" tab, follow the Opportunity link (opportunity_id many2one) back to the
   * CRM. Returns the record id it opened (from the URL), or '' when the link is absent.
   */
  async followLinkedOpportunity(): Promise<string> {
    const link = this.page.locator("xpath=//*[@name='opportunity_id']//a | //a[@name='opportunity_id']").or(this.page.locator("a[name='opportunity_id'], [name='opportunity_id'] a")).first();
    if (!(await link.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) return '';
    await link.click();
    await this.page.waitForURL(/model=crm\.lead/, { timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    await this.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    const m = this.page.url().match(/[#&?]id=(\d+)/);
    console.log(`  - Followed the Opportunity link -> ${this.page.url()}`);
    return m ? m[1] : '';
  }

  /** Reload the open ticket form (a fresh read of every field + chatter). */
  async reloadTicket(): Promise<void> {
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.fieldByName('name').waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
  }

  // ─── Read-only access checks (what a non-member user sees in Helpdesk) ─────────────────────────

  // The Helpdesk top-navbar "All Tickets" entry, addressed by the XML id the DOM carries.
  private readonly allTicketsMenuLink = () =>
    this.page.locator("xpath=//a[@data-menu-xmlid='helpdesk.helpdesk_ticket_menu_main']")
      .or(this.page.getByRole('link', { name: /^\s*All Tickets\s*$/i })).first();
  // Control-panel search facets (e.g. "Open Tickets").
  private readonly searchFacets = () =>
    this.page.locator("xpath=//div[contains(@class,'o_searchview_facet')]").or(this.page.locator('.o_searchview_facet'));
  // List pager counter ("1-80 / 2424").
  private readonly pagerCounter = () =>
    this.page.locator("xpath=//span[contains(@class,'o_pager_counter')]").or(this.page.locator('.o_pager_counter')).first();
  // Kanban columns of a grouped kanban, and the ticket cards (the empty ghost cards excluded). Matched on the
  // exact class TOKEN: a plain contains(@class,'o_kanban_group') also hits the renderer's 'o_kanban_grouped'
  // (and 'o_kanban_record' hits 'o_kanban_record_title' ...), which counted the first column twice.
  private readonly kanbanGroups = () =>
    this.page.locator("xpath=//div[contains(concat(' ',normalize-space(@class),' '),' o_kanban_group ')]").or(this.page.locator('div.o_kanban_group'));
  private readonly kanbanCards = () =>
    this.page.locator("xpath=//div[contains(concat(' ',normalize-space(@class),' '),' o_kanban_record ') and not(contains(@class,'o_kanban_ghost'))]")
      .or(this.page.locator('div.o_kanban_record:not(.o_kanban_ghost)'));

  /** Helpdesk > All Tickets from the app's top menu; waits for the ticket list to render. */
  async openAllTicketsFromMenu(): Promise<void> {
    await this.dismissErrorDialog();
    const link = this.allTicketsMenuLink();
    await link.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await link.click();
    await this.listRows().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    await this.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  - Opened Helpdesk > All Tickets (navbar)');
  }

  /** Team names on the Helpdesk Overview cards, in on-screen order (first line of each card). */
  async getOverviewTeamCardNames(): Promise<string[]> {
    await this.overviewTeamCards().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    return this.overviewTeamCards().evaluateAll((els) =>
      els.map((e) => ((e as HTMLElement).innerText || '').trim().split('\n')[0].trim()).filter(Boolean)
    );
  }

  /** Labels of the control-panel search facets, e.g. ["Open Tickets"]. */
  async getSearchFacets(): Promise<string[]> {
    const raw = await this.searchFacets().allInnerTexts().catch(() => [] as string[]);
    return raw.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  /** The list pager text, e.g. "1-80 / 2424" ('' when the view has no pager). */
  async getPagerText(): Promise<string> {
    return ((await this.pagerCounter().textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Columns of the grouped kanban on screen with the record count each header shows. A column whose
   * header carries no counter (folded) reports count -1, so a caller summing them can tell it apart from 0.
   */
  async getKanbanColumnCounts(): Promise<Array<{ column: string; count: number }>> {
    await this.kanbanGroups().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    return this.kanbanGroups().evaluateAll((els) =>
      els.map((g) => {
        const title = (g.querySelector('.o_column_title, .o_kanban_header_title') as HTMLElement | null)?.innerText || '';
        const counter = (g.querySelector('.o_kanban_counter_side') as HTMLElement | null)?.innerText || '';
        const n = parseInt(counter.replace(/[^\d]/g, ''), 10);
        return { column: title.replace(/\s+/g, ' ').trim(), count: Number.isNaN(n) ? -1 : n };
      })
    );
  }

  /** The text of every ticket card in the kanban on screen, one entry per card. */
  async getKanbanCardTexts(): Promise<string[]> {
    const raw = await this.kanbanCards().allInnerTexts().catch(() => [] as string[]);
    return raw.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  /**
   * READ-ONLY lookup run AS THE SIGNED-IN USER, so the server applies that user's record rules: the newest
   * helpdesk.ticket matching `domain` (search_read, limit 1). Lets a read-only check pick an existing ticket
   * at run time instead of hard-coding an id. Returns null when the user can read no such ticket; throws on
   * an RPC error, so a refusal is never mistaken for "no ticket".
   */
  async findNewestVisibleTicket(domain: unknown[]): Promise<
    { id: number; name: string; team: string; opportunityId: number; opportunityName: string } | null
  > {
    const row = await this.page.evaluate(async (dom) => {
      const r = await fetch('/web/dataset/call_kw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'helpdesk.ticket', method: 'search_read',
            args: [dom, ['id', 'name', 'team_id', 'opportunity_id']],
            kwargs: { limit: 1, order: 'id desc' },
          },
        }),
      });
      const j = await r.json();
      if (j.error) return { error: String((j.error.data && j.error.data.message) || j.error.message) };
      return (j.result && j.result[0]) || null;
    }, domain);
    if (!row) return null;
    if ('error' in row) throw new Error(`HelpdeskPage.findNewestVisibleTicket: ${row.error}`);
    return {
      id: row.id,
      name: row.name,
      team: Array.isArray(row.team_id) ? row.team_id[1] : '',
      opportunityId: Array.isArray(row.opportunity_id) ? row.opportunity_id[0] : 0,
      opportunityName: Array.isArray(row.opportunity_id) ? row.opportunity_id[1] : '',
    };
  }

  // ─── Stage list and order (Helpdesk A/B TC-FLOW-001) ───────────────────────────────────────────

  // A team card on the Helpdesk Overview, by its exact team name, and that card's primary TICKETS button.
  private readonly overviewTeamCard = (teamName: string) =>
    this.page.locator(`xpath=//div[contains(concat(' ',normalize-space(@class),' '),' o_kanban_record ')][.//*[normalize-space()='${teamName}']]`)
      .or(this.page.locator('div.o_kanban_record').filter({ hasText: teamName })).first();
  private readonly overviewTeamTicketsButton = (teamName: string) =>
    this.overviewTeamCard(teamName).locator("xpath=.//button[contains(@class,'oe_kanban_action_button') and normalize-space()='Tickets']")
      .or(this.overviewTeamCard(teamName).locator('button.oe_kanban_action_button')).first();
  // Control-panel breadcrumb ("Helpdesk Overview / Tickets", "<ticket> (#id)").
  private readonly controlPanelBreadcrumb = () =>
    this.page.locator("xpath=//div[contains(@class,'o_control_panel')]//ol[contains(@class,'breadcrumb')]")
      .or(this.page.locator('.o_control_panel .breadcrumb')).first();
  // The kanban icon of the control-panel view switcher.
  private readonly kanbanViewSwitch = () =>
    this.page.locator("xpath=//div[contains(@class,'o_cp_switch_buttons')]//button[@data-view-type='kanban']")
      .or(this.page.locator('.o_cp_switch_buttons button.o_cp_switch_kanban')).first();
  // The ticket kanban (GROUPED by stage - the Overview dashboard is an ungrouped kanban) or list view a team's
  // TICKETS action renders.
  private readonly ticketsViewRoot = () =>
    this.page.locator("xpath=//div[contains(@class,'o_kanban_view') and contains(@class,'o_kanban_grouped')] | //div[contains(@class,'o_list_view')]")
      .or(this.page.locator('.o_kanban_view.o_kanban_grouped, .o_list_view')).first();
  // The ticket list OR the "no content" helper Odoo draws instead of an EMPTY list (e.g. right after archiving the
  // only row a search matched) - waiting for the list alone would hang on an empty result.
  private readonly listOrEmptyHelper = () =>
    this.page.locator("xpath=//div[contains(@class,'o_list_view') or contains(@class,'o_view_nocontent')]")
      .or(this.page.locator('.o_list_view, .o_view_nocontent')).first();
  // The breadcrumb crumb with this exact text (e.g. "Tickets" once a team's TICKETS action has opened).
  private readonly breadcrumbCrumb = (text: string) =>
    this.page.locator(`xpath=//div[contains(@class,'o_control_panel')]//ol[contains(@class,'breadcrumb')]/li[normalize-space()='${text}']`)
      .or(this.page.locator('.o_control_panel .breadcrumb li').filter({ hasText: new RegExp(`^\\s*${text}\\s*$`) })).first();
  // The statusbar widget in the ticket form header.
  private readonly stageBar = () =>
    this.page.locator("xpath=//div[contains(@class,'o_statusbar_status')]").or(this.page.locator('.o_statusbar_status')).first();

  /**
   * On the Helpdesk Overview, click the TICKETS button of the team card named `teamName` (exact name) and wait
   * for that team's tickets to render. The team action opens in KANBAN by default on pre-production.
   */
  async openTeamTicketsFromOverview(teamName: string): Promise<void> {
    await this.dismissErrorDialog();
    await this.overviewTeamCard(teamName).waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    const btn = this.overviewTeamTicketsButton(teamName);
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    // A click that lands while the Overview dashboard is still binding its card handlers is silently dropped
    // (measured 2026-10-22: the page stayed on "Helpdesk Overview"). So the click counts only once the
    // breadcrumb shows the "Tickets" crumb; otherwise it is retried, a bounded number of times.
    await this.wait(CommonUtils.waitTimes.long);
    let opened = false;
    for (let attempt = 1; attempt <= 3 && !opened; attempt++) {
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      // Bounded: a TICKETS button that cannot take the click (not stable, covered) counts as a failed attempt and is retried
      // below; an unbounded click hung the TC-FLOW-030_A run for the whole 15-minute test timeout (2026-10-23).
      await btn.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      opened = await this.breadcrumbCrumb('Tickets')
        .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
        .then(() => true)
        .catch(() => false);
      if (!opened) console.log(`  - TICKETS click #${attempt} on "${teamName}" did not open the team tickets - retrying`);
    }
    if (!opened) throw new Error(`openTeamTicketsFromOverview("${teamName}"): the TICKETS button did not open the team tickets after 3 clicks`);
    await this.ticketsViewRoot().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    await this.dismissErrorDialog();
    console.log(`  - Opened Helpdesk Overview > ${teamName} > TICKETS`);
  }

  /** The control-panel breadcrumb as one line, crumbs joined by " / " ('' when none is shown). */
  async getBreadcrumbText(): Promise<string> {
    const raw = await this.controlPanelBreadcrumb().innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '');
    return raw.split('\n').map((s) => s.trim()).filter(Boolean).join(' / ');
  }

  /**
   * Open a ticket form by its link INSIDE the Helpdesk app (menu_id kept in the hash, so the Helpdesk top
   * navbar - Overview, Tickets ... - stays on screen for the next step). Reloads so the read never comes off a
   * previously open record (hash goto is a same-document navigation), then waits for the stage bar.
   */
  async openTicketInHelpdeskApp(baseUrl: string, ticketId: number | string): Promise<void> {
    const menuId = await this.xmlId('helpdesk.menu_helpdesk_root');
    const url = `${baseUrl.replace(/\/$/, '')}/web#id=${ticketId}&model=helpdesk.ticket&view_type=form&menu_id=${menuId}`;
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.waitForFormView(CommonUtils.waitTimes.pageLoad);
    await this.stageBar().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long);
    await this.dismissErrorDialog();
    console.log(`  - Opened helpdesk.ticket#${ticketId} (Helpdesk app kept in the navbar)`);
  }

  /**
   * The stages of the form's stage bar in the order a person READS them.
   * Odoo 12 renders the statusbar buttons in REVERSE DOM order (flex row-reverse + wrap-reverse), and a narrow
   * form wraps the 13 CS stages over 3 rows - so DOM order is the opposite of the screen, and x alone is not
   * enough. Rows are read top to bottom, each row left to right. Labels come from textContent (the stage name as
   * stored); the UPPERCASE on screen is CSS only. `folded` = stages Odoo hides under the bar's "More" dropdown
   * (fold = True), listed in DOM order - they are not part of the visible bar.
   */
  async getStageBarInScreenOrder(): Promise<{ shown: string[]; folded: string[] }> {
    await this.stageBar().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const items = await this.stageButtons().evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return {
          label: (e.textContent || '').replace(/\s+/g, ' ').trim(),
          top: r.top,
          left: r.left,
          width: r.width,
          inDropdown: !!e.closest('.dropdown-menu'),
          isToggle: e.classList.contains('dropdown-toggle'),
        };
      })
    );
    const shown = items
      .filter((i) => !i.inDropdown && !i.isToggle && i.width > 0 && i.label)
      .sort((a, b) => Math.round(a.top / 10) - Math.round(b.top / 10) || a.left - b.left)
      .map((i) => i.label);
    const folded = items.filter((i) => i.inDropdown && i.label).map((i) => i.label);
    return { shown, folded };
  }

  /** Click the kanban icon of the view switcher and wait for the grouped kanban columns. */
  async switchToKanbanView(): Promise<void> {
    const icon = this.kanbanViewSwitch();
    await icon.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await icon.click();
    await this.kanbanGroups().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  - Switched to the kanban view (kanban icon)');
  }

  // The CURRENT stage of the form's stage bar (Odoo marks it btn-primary).
  private readonly stageBarCurrent = () =>
    this.page.locator("xpath=//div[contains(@class,'o_statusbar_status')]//button[contains(@class,'btn-primary')]")
      .or(this.page.locator('.o_statusbar_status button.btn-primary')).first();
  // The form's Active / Archived toggle in the button box (name toggle_active). On the ticket FORM it is the only
  // archive control a helpdesk user gets: the form's Action menu holds Duplicate / Share / Helpdesk Schedule Followup /
  // The link of an EARLIER breadcrumb crumb (the current crumb has no link).
  private readonly breadcrumbCrumbLink = (text: string) =>
    this.page.locator(`xpath=//div[contains(@class,'o_control_panel')]//ol[contains(@class,'breadcrumb')]/li/a[normalize-space()='${text}']`)
      .or(this.page.locator('.o_control_panel .breadcrumb li a').filter({ hasText: new RegExp(`^\\s*${text}\\s*$`) })).first();

  /**
   * In the ticket LIST on screen (e.g. a team's TICKETS switched to list), click CREATE, type the Subject, SAVE and
   * return the new record id. The team comes from the list's own context (a team's TICKETS action defaults the team),
   * so the caller re-reads it. THROWS when the ticket is not created - a setup step must never fail silently.
   */
  async createTicketInCurrentList(subject: string): Promise<string> {
    const create = this.listCreateButton();
    await create.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await create.click();
    await this.waitForFormView(CommonUtils.waitTimes.abnormalWait);
    const subj = this.subjectField();
    await subj.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await subj.click();
    await subj.fill(subject);
    await this.wait(CommonUtils.waitTimes.short);
    const save = this.formSaveButton();
    await save.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await save.click();
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    const popup = await this.getBlockingPopupText(CommonUtils.waitTimes.long);
    if (popup) throw new Error(`createTicketInCurrentList("${subject}") was blocked by a dialog: ${popup}`);
    const id = await this.waitForIdInUrlAndExtract(CommonUtils.waitTimes.abnormalWait);
    if (!/^\d+$/.test(id)) throw new Error(`createTicketInCurrentList("${subject}") did not yield a record id (got "${id}")`);
    await this.stageBar().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    console.log(`  - Created helpdesk ticket #${id} - Subject "${subject}"`);
    return id;
  }

  /** The stage the open ticket is in, as stored (textContent; the UPPERCASE on screen is CSS only). */
  async getCurrentStage(): Promise<string> {
    await this.stageBarCurrent().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const t = await this.stageBarCurrent().textContent({ timeout: CommonUtils.waitTimes.abnormalWait });
    return (t || '').replace(/\s+/g, ' ').trim();
  }

  /** Number of rows of the list on screen whose text contains `text` - bounded, never hangs on an empty list. */
  async countListRowsContaining(text: string): Promise<number> {
    await this.listOrEmptyHelper().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.medium);
    return this.listRows().filter({ hasText: text }).count();
  }

  /**
   * Wait (bounded) until a row containing `text` is drawn, then count the matches. Right after a search the list still
   * shows the previous page for a moment, so an immediate count reads 0 (measured 2026-10-22). Returns 0 when no row
   * appears within abnormalWait.
   */
  async waitForListRowsContaining(text: string): Promise<number> {
    await this.listRows().filter({ hasText: text }).first()
      .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .catch(() => {});
    return this.countListRowsContaining(text);
  }

  /** Open the ONLY list row containing `text`; throws unless exactly one row matches (never acts on a row it did not create). */
  async openOnlyListRowContaining(text: string): Promise<void> {
    const n = await this.waitForListRowsContaining(text);
    if (n !== 1) throw new Error(`openOnlyListRowContaining("${text}"): ${n} matching rows, expected exactly 1`);
    await this.listRows().filter({ hasText: text }).first().click();
    await this.waitForFormView(CommonUtils.waitTimes.pageLoad);
    await this.stageBar().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long);
    await this.dismissErrorDialog();
    console.log(`  - Opened the only row containing "${text}"`);
  }

  /** Click the earlier breadcrumb crumb `text` (e.g. "Tickets") and wait for that view to render again. */
  async goBackToBreadcrumb(text: string): Promise<void> {
    const link = this.breadcrumbCrumbLink(text);
    await link.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await link.click();
    await this.ticketsViewRoot().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  - Back to breadcrumb "${text}"`);
  }

  /**
   * [INTERNAL, Call API] Teardown of a ticket a spec created, as the signed-in user: read the ticket BY ID, require its
   * name to equal `expectedSubject` (deny-list by the run's own marker - never touches another ticket), write
   * active = False (helpdesk users hold no unlink), re-read it. Returns true only when it reads back inactive.
   * Why not the UI: a list search once answered 0 rows for a probe that existed, the form's Action menu has no Archive
   * for a helpdesk user, and the button-box Active toggle left the record active (all measured 2026-10-22).
   */
  async archiveTicketByIdOverRpc(ticketId: number | string, expectedSubject: string): Promise<boolean> {
    const res = await this.page.evaluate(async ([id, subject]) => {
      const kw = async (method: string, args: unknown[]) => {
        const r = await fetch('/web/dataset/call_kw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model: 'helpdesk.ticket', method, args, kwargs: {} } }),
        });
        return r.json();
      };
      const read = await kw('search_read', [[['id', '=', id], ['active', 'in', [true, false]]], ['name', 'active']]);
      if (read.error) return { error: String((read.error.data && read.error.data.message) || read.error.message) };
      const row = read.result && read.result[0];
      if (!row) return { error: `no ticket #${id}` };
      if (row.name !== subject) return { error: `ticket #${id} is "${row.name}", not this run's "${subject}" - not archived` };
      if (row.active) {
        const w = await kw('write', [[id], { active: false }]);
        if (w.error) return { error: String((w.error.data && w.error.data.message) || w.error.message) };
      }
      const after = await kw('search_read', [[['id', '=', id], ['active', 'in', [true, false]]], ['active']]);
      return { active: !!(after.result && after.result[0] && after.result[0].active) };
    }, [Number(ticketId), expectedSubject] as [number, string]);
    if ('error' in res) throw new Error(`HelpdeskPage.archiveTicketByIdOverRpc: ${res.error}`);
    console.log(`  - [INTERNAL, Call API] ticket #${ticketId} archived - reads back active = ${res.active}`);
    return !res.active;
  }

  /** [INTERNAL check, Call API] READ-ONLY: whether ticket `ticketId` is active (archived ones included in the read). */
  async isTicketActive(ticketId: number | string): Promise<boolean> {
    const res = await this.page.evaluate(async (id) => {
      const r = await fetch('/web/dataset/call_kw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', method: 'call',
          params: { model: 'helpdesk.ticket', method: 'search_read', args: [[['id', '=', id], ['active', 'in', [true, false]]], ['active']], kwargs: { limit: 1 } },
        }),
      });
      const j = await r.json();
      if (j.error) return { error: String((j.error.data && j.error.data.message) || j.error.message) };
      return { found: !!(j.result && j.result[0]), active: !!(j.result && j.result[0] && j.result[0].active) };
    }, Number(ticketId));
    if ('error' in res) throw new Error(`HelpdeskPage.isTicketActive(${ticketId}): ${res.error}`);
    if (!res.found) throw new Error(`HelpdeskPage.isTicketActive(${ticketId}): no such ticket`);
    return res.active;
  }

  /**
   * [INTERNAL check, Call API] READ-ONLY, as the signed-in user: the user's employee record and its "Support Team"
   * (hr.employee.support_team: l1 / l2 / it_l1 / it_l2). Lets a spec prove it runs as the tier the TC names.
   * THROWS on an RPC error, so a refusal is never read as "no tier".
   */
  async getMyEmployeeSupportTeam(): Promise<{ uid: number; employee: string; supportTeam: string }> {
    const res = await this.page.evaluate(async () => {
      const call = async (url: string, params: unknown) => {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params }),
        });
        return r.json();
      };
      const info = await call('/web/session/get_session_info', {});
      if (info.error) return { error: String(info.error.message) };
      const uid = info.result.uid as number;
      const emp = await call('/web/dataset/call_kw', {
        model: 'hr.employee', method: 'search_read',
        args: [[['user_id', '=', uid]], ['name', 'support_team']], kwargs: { limit: 1 },
      });
      if (emp.error) return { error: String((emp.error.data && emp.error.data.message) || emp.error.message) };
      const row = (emp.result && emp.result[0]) || null;
      return { uid, employee: row ? String(row.name) : '', supportTeam: row && row.support_team ? String(row.support_team) : '' };
    });
    if ('error' in res) throw new Error(`HelpdeskPage.getMyEmployeeSupportTeam: ${res.error}`);
    return res;
  }

  // ─── Lifecycle & escalation (CRM-11859 Helpdesk A/B: TC-FLOW-002 / 030 / 032 / 058, TC-UI-063) ───────────

  // The header button "Hibernate" of the ticket form (a button, not a stage: the stage bar refuses Hibernate).
  private readonly headerHibernateButton = () =>
    this.page.locator("xpath=//div[contains(@class,'o_statusbar_buttons')]//button[normalize-space()='Hibernate']")
      .or(this.page.locator('.o_statusbar_buttons button').filter({ hasText: /^\s*Hibernate\s*$/ })).first();
  // The "Hibernate ticket" wizard (a modal): "Hibernate until" (date, defaults to today + 14) and "Hibernate reason".
  private readonly hibernateDialog = () =>
    this.page.locator("xpath=//div[contains(@class,'modal') and contains(@class,'show')][.//*[normalize-space()='Hibernate ticket']]")
      .or(this.page.locator('div.modal.show').filter({ hasText: 'Hibernate ticket' })).last();
  private readonly hibernateUntilInput = () =>
    this.hibernateDialog().locator("xpath=.//input[@name='hibernate_until']").or(this.hibernateDialog().locator("input[name='hibernate_until']")).first();
  private readonly hibernateReasonInput = () =>
    this.hibernateDialog().locator("xpath=.//textarea[@name='hibernate_reason']").or(this.hibernateDialog().locator("textarea[name='hibernate_reason']")).first();
  private readonly hibernateOkButton = () =>
    this.hibernateDialog().locator("xpath=.//footer//button[normalize-space()='OK' or normalize-space()='Ok']")
      .or(this.hibernateDialog().locator('footer button').filter({ hasText: /^\s*OK\s*$/i })).first();
  // The yellow banner Odoo draws on a hibernated ticket (matched on its leaf text node).
  private readonly hibernationBannerLeaf = () =>
    this.page.locator("xpath=//*[not(*)][contains(normalize-space(.),'This ticket is hibernated')]").first();
  // The button-box "Active / Archive" toggle of the ticket form (name toggle_active; its confirm attribute asks first).
  private readonly activeToggleButton = () =>
    this.page.locator("xpath=//button[@name='toggle_active']").or(this.page.locator("button[name='toggle_active']")).first();
  // A kanban column by its exact title ("Hibernate", "Open", ...).
  private kanbanColumnByTitle(title: string) {
    return this.page
      .locator(`xpath=//div[contains(concat(' ',normalize-space(@class),' '),' o_kanban_group ')][.//*[contains(@class,'o_column_title') or contains(@class,'o_kanban_header_title')][normalize-space()='${title}']]`)
      .or(this.page.locator('div.o_kanban_group').filter({ has: this.page.locator('.o_column_title, .o_kanban_header_title').filter({ hasText: new RegExp(`^\\s*${title}\\s*$`) }) }))
      .first();
  }

  /** Click the header button "Hibernate" and wait for the "Hibernate ticket" wizard to open. */
  async openHibernateDialog(): Promise<void> {
    await this.dismissErrorDialog();
    const btn = this.headerHibernateButton();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    await btn.click();
    await this.hibernateDialog().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.medium);
    console.log('  - Opened the "Hibernate ticket" wizard (header button Hibernate)');
  }

  /** The wizard as shown: the "Hibernate until" value (MM/DD/YYYY), whether the reason is required, the footer buttons. */
  async getHibernateDialogDefaults(): Promise<{ until: string; reasonRequired: boolean; buttons: string[] }> {
    await this.hibernateDialog().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const until = ((await this.hibernateUntilInput().inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
    const reasonRequired = await this.hibernateReasonInput()
      .evaluate((e) => (e.getAttribute('class') || '').includes('o_required_modifier'), undefined, { timeout: CommonUtils.waitTimes.abnormalWait })
      .catch(() => false);
    const buttons = (await this.hibernateDialog().locator('footer button').allTextContents().catch(() => [] as string[]))
      .map((t) => t.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    return { until, reasonRequired, buttons };
  }

  /** Type the wizard's reason and press OK; waits until the wizard has closed. */
  async confirmHibernate(reason: string): Promise<void> {
    const ta = this.hibernateReasonInput();
    await ta.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await ta.click();
    await ta.fill(reason);
    await this.wait(CommonUtils.waitTimes.short);
    await this.hibernateOkButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.hibernateDialog().waitFor({ state: 'detached', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.wait(CommonUtils.waitTimes.extraLong);
    console.log(`  - Hibernate confirmed (reason "${reason}")`);
  }

  /** The yellow hibernation banner of the open ticket ('' when none is drawn). */
  async getHibernationBannerText(): Promise<string> {
    const leaf = this.hibernationBannerLeaf();
    if (!(await leaf.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) return '';
    return ((await leaf.textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * The chatter messages that carry a field-tracking line ("Stage: ..."), newest first, each with its author. Odoo draws
   * the arrow between the old and the new stage as an icon, so the line reads "Stage: L2 In Progress (L2)" as text.
   */
  async getStageTrackingLines(): Promise<Array<{ author: string; line: string }>> {
    const thread = await this.getChatterThread();
    return thread
      .filter((m) => /Stage:/.test(m.body))
      .map((m) => ({ author: m.info.split(' - ')[0].replace(/^Note by\s+/i, '').trim(), line: m.body.replace(/\s+/g, ' ').trim() }));
  }

  /** Total behind the list pager ("1-80 / 2424" -> 2424); -1 when no pager is drawn. */
  async getPagerTotal(): Promise<number> {
    const m = (await this.getPagerText()).match(/\/\s*(\d+)\s*$/);
    return m ? parseInt(m[1], 10) : -1;
  }

  /** The stage column a ticket's kanban card sits in, by the column title ('' when the card is not drawn). */
  async getKanbanColumnOfCard(subject: string): Promise<string> {
    return this.page.evaluate((s) => {
      const rec = Array.from(document.querySelectorAll('div.o_kanban_record')).find((e) => (e.textContent || '').includes(s));
      if (!rec) return '';
      const g = rec.closest('.o_kanban_group');
      if (!g) return '';
      const t = g.querySelector('.o_column_title, .o_kanban_header_title') as HTMLElement | null;
      return (t?.innerText || '').replace(/\s+/g, ' ').trim();
    }, subject);
  }

  /**
   * Drag the kanban card of the ticket `subject` onto the column `columnTitle` with real pointer moves (Odoo's kanban
   * listens to them). The viewport is widened to 3800 px for the drag only: the 13 stage columns do not fit 1920 px, the
   * Hibernate column starts at x = 2720, and a drop at the clamped edge put the card in Resolving (measured 2026-10-23).
   * Returns the dialog Odoo shows and the column before and after; the viewport is back at 1920 x 1080 afterwards.
   */
  async dragKanbanCardToColumn(
    subject: string,
    columnTitle: string,
    opts: { onDialog?: (dialogText: string) => Promise<void> } = {}
  ): Promise<{ dialog: string; columnBefore: string; columnAfter: string }> {
    let result = { dialog: '', columnBefore: '', columnAfter: '' };
    for (let attempt = 1; attempt <= 3; attempt++) {
      result = await this.dragKanbanCardOnce(subject, columnTitle, opts);
      if (result.dialog || result.columnAfter !== result.columnBefore) return result;
      console.log(`  - Drop attempt ${attempt} produced no dialog and no move (pointer drop not registered) - retrying`);
    }
    return result;
  }

  /**
   * One pointer drag of the card onto the column (see dragKanbanCardToColumn for the retry around it).
   * `onDialog` runs while the refusal dialog is still drawn, at 1920 px, BEFORE it is closed: the spec takes the
   * verify-evidence shot of the dialog there (a dialog-borne value is shot before the dialog is dismissed).
   */
  private async dragKanbanCardOnce(
    subject: string,
    columnTitle: string,
    opts: { onDialog?: (dialogText: string) => Promise<void> } = {}
  ): Promise<{ dialog: string; columnBefore: string; columnAfter: string }> {
    const columnBefore = await this.getKanbanColumnOfCard(subject);
    await this.page.setViewportSize({ width: 3800, height: 1080 });
    await this.wait(CommonUtils.waitTimes.standard);
    const card = this.ticketCardByText(subject);
    await card.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const target = this.kanbanColumnByTitle(columnTitle);
    await target.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const from = await card.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error(`dragKanbanCardToColumn("${subject}" -> "${columnTitle}"): no bounding box (card ${!!from}, column ${!!to})`);
    await this.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, { steps: 5 });
    await this.page.mouse.move(to.x + to.width / 2, to.y + 160, { steps: 30 });
    await this.wait(CommonUtils.waitTimes.medium);
    await this.page.mouse.up();
    await this.shownDialog().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.standard);
    const dialog = await this.getShownDialogText();
    if (dialog && opts.onDialog) {
      await this.page.setViewportSize({ width: 1920, height: 1080 });
      await this.wait(CommonUtils.waitTimes.standard);
      await opts.onDialog(dialog);
      await this.page.setViewportSize({ width: 3800, height: 1080 });
      await this.wait(CommonUtils.waitTimes.standard);
    }
    await this.closeShownDialog();
    await this.wait(CommonUtils.waitTimes.long);
    const columnAfter = await this.getKanbanColumnOfCard(subject);
    await this.page.setViewportSize({ width: 1920, height: 1080 });
    await this.wait(CommonUtils.waitTimes.standard);
    console.log(`  - Dragged "${subject}" onto "${columnTitle}": card ${columnBefore} -> ${columnAfter}; dialog "${dialog}"`);
    return { dialog, columnBefore, columnAfter };
  }

  /** Press the button-box "Active" toggle of the open ticket form; Odoo answers with its confirmation (not yet confirmed). */
  async clickActiveToggleOnForm(): Promise<void> {
    await this.dismissErrorDialog();
    const toggle = this.activeToggleButton();
    await toggle.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await toggle.click();
    await this.shownDialog().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.medium);
    console.log('  - Pressed the form\'s Active / Archive toggle (button box)');
  }

  /** Press OK on the confirmation Odoo shows, then wait for it to close. */
  async confirmShownDialogWithOk(): Promise<void> {
    const dlg = this.shownDialog();
    await dlg.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await dlg.locator("xpath=.//footer//button[normalize-space()='Ok' or normalize-space()='OK']").first().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await dlg.waitFor({ state: 'detached', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  - Confirmed the dialog (OK)');
  }

  /**
   * Open the list's Advanced Search and tick the "Archived" filter under Filters. Odoo keeps the filter in the page only.
   * Returns false when the item is not on the menu.
   */
  async applyArchivedFilter(): Promise<boolean> {
    // The search options (Filters, Group By, Favorites) are drawn by default. The "Advanced Search" icon
    // (span.o_searchview_more) HIDES them (measured 2026-10-23), so the icon is not clicked here.
    const toggler = this.page
      .locator("xpath=//button[contains(@class,'o_dropdown_toggler_btn')][normalize-space()='Filters']")
      .or(this.page.locator('button.o_dropdown_toggler_btn').filter({ hasText: /^\s*Filters\s*$/ }))
      .first();
    await toggler.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await toggler.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.medium);
    const archived = this.page
      .locator("xpath=//a[contains(@class,'dropdown-item')][normalize-space()='Archived']")
      .or(this.page.locator('a.dropdown-item').filter({ hasText: /^\s*Archived\s*$/ }))
      .first();
    if (!(await archived.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) return false;
    await archived.click();
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  - Filters > Archived applied');
    return true;
  }

  // ─── CRM-11859 close gate (TC-FLOW-038..041, side A) and the list mass stage edit (TC-UI-059, side A) ───

  /** Set a native select of the ticket form (EDIT mode) by its Odoo field name, to the option with this label. */
  async setFormSelectByName(fieldName: string, label: string): Promise<void> {
    const sel = this.page.locator(`xpath=//select[@name='${fieldName}']`).or(this.page.locator(`select[name='${fieldName}']`)).first();
    await sel.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await sel.selectOption({ label }, { timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.medium);
    console.log(`  - ${fieldName} = "${label}"`);
  }

  /** Fill a textarea of the ticket form (EDIT mode) by its Odoo field name. */
  async setFormTextAreaByName(fieldName: string, text: string): Promise<void> {
    const ta = this.page.locator(`xpath=//textarea[@name='${fieldName}']`).or(this.page.locator(`textarea[name='${fieldName}']`)).first();
    await ta.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await ta.fill(text, { timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.short);
    console.log(`  - ${fieldName} = "${text}"`);
  }

  /** Option labels a many2one field of the ticket form (EDIT mode) offers for `typed`. Read only - nothing is picked. */
  async listFormMany2oneOptions(fieldName: string, typed: string): Promise<string[]> {
    const input = this.formM2oInput(fieldName);
    await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await input.fill('', { timeout: CommonUtils.waitTimes.abnormalWait });
    await input.pressSequentially(typed, { delay: 30 });
    await this.wait(CommonUtils.waitTimes.long);
    return (await this.page.locator('ul.ui-autocomplete:visible li').allTextContents())
      .map((t) => t.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  /** Pick the autocomplete option whose text is exactly `option` for a many2one field of the ticket form (EDIT mode). */
  async setFormMany2oneByName(fieldName: string, typed: string, option: string): Promise<void> {
    const input = this.formM2oInput(fieldName);
    await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await input.fill('', { timeout: CommonUtils.waitTimes.abnormalWait });
    await input.pressSequentially(typed, { delay: 30 });
    const items = this.page.locator('ul.ui-autocomplete:visible li');
    await items.first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await items.filter({ hasText: new RegExp(`^\\s*${escapeRegExp(option)}\\s*$`) }).first().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  - ${fieldName} = "${option}"`);
  }

  private formM2oInput(fieldName: string): Locator {
    return this.page.locator(`xpath=//div[@name='${fieldName}']//input`).or(this.page.locator(`div[name='${fieldName}'] input`)).first();
  }

  /** Select the list rows whose subjects are given, through their row checkboxes (each one verified). Returns the count. */
  async selectListRowsBySubjects(subjects: string[]): Promise<number> {
    for (const subject of subjects) {
      if (!(await this.ticketRowByText(subject).isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false))) {
        throw new Error(`selectListRowsBySubjects: no list row for "${subject}"`);
      }
      const input = this.ticketRowCheckboxInput(subject);
      let checked = await input.isChecked().catch(() => false);
      for (const target of [this.ticketRowSelectorLabel(subject), this.ticketRowSelectorCtrl(subject), this.ticketRowSelectorCell(subject)]) {
        if (checked) break;
        await target.click({ force: true, timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
        await this.wait(CommonUtils.waitTimes.short);
        checked = await input.isChecked().catch(() => false);
      }
      if (!checked) throw new Error(`selectListRowsBySubjects: the row checkbox of "${subject}" did not register`);
      console.log(`  - Row selected: "${subject}"`);
    }
    return subjects.length;
  }

  /** Open the list's Action menu (drawn only while rows are selected) and choose the item with this exact label. */
  async chooseListActionItem(label: string): Promise<void> {
    const actionBtn = this.listActionMenuButton();
    await actionBtn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await actionBtn.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    const item = this.page.locator('.dropdown-menu.show a.dropdown-item')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`) }).first();
    await item.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await item.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.medium);
    console.log(`  - Action > ${label}`);
  }

  /** In the open "Mass Editing (Stage)" wizard: choose Set, the stage, then Apply. Waits (bounded) for the wizard to close. */
  async applyMassEditStage(stageName: string): Promise<string> {
    const wizard = this.page.locator('.modal.show').filter({ hasText: 'Mass Editing (Stage)' }).last();
    await wizard.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await wizard.locator("select[name='selection__stage_id']").selectOption({ label: 'Set' }, { timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.short);
    const input = wizard.locator("div[name='stage_id'] input").first();
    await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await input.pressSequentially(stageName, { delay: 30 });
    const items = this.page.locator('ul.ui-autocomplete:visible li');
    await items.first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await items.filter({ hasText: new RegExp(`^\\s*${escapeRegExp(stageName)}\\s*$`) }).first().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.medium);
    await wizard.locator("button[name='action_apply']").click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await wizard.waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.savingPage }).catch(() => {});
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    const serverError = await this.readOdooServerErrorSummary();
    console.log(`  - Mass Editing (Stage): Set "${stageName}" > Apply${serverError ? ` - server error: ${serverError}` : ''}`);
    return serverError;
  }

  /** The "Odoo Server Error" dialog drawn after a failed server call, reduced to its exception line ('' when none is drawn). */
  async readOdooServerErrorSummary(): Promise<string> {
    const dlg = this.page.locator('.modal.show').filter({ hasText: 'Odoo Server Error' }).last();
    if (!(await dlg.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) return '';
    const details = dlg.locator('a, button, span').filter({ hasText: /^\s*See details\s*$/ }).first();
    if (await details.isVisible({ timeout: CommonUtils.waitTimes.medium }).catch(() => false)) {
      await details.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.medium);
    }
    const text = await dlg.innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '');
    const exc = text.split('\n').map((l) => l.trim()).filter((l) => /^(\w+Error|\w+Exception|UserError|AccessError): /.test(l));
    return exc.length ? exc[exc.length - 1] : 'Odoo Server Error (no exception line could be read)';
  }

  /** The text of the warning Odoo shows after a refused stage move ('' when none), read after the dialog is drawn (bounded). */
  async getStageRefusalText(): Promise<string> {
    return this.getShownDialogText();
  }

  /** [INTERNAL check, Call API] READ-ONLY, as the signed-in user: the stage name of one ticket (helpdesk.ticket.stage_id). */
  async readStageOverRpc(ticketId: number | string): Promise<string> {
    const res = await this.page.evaluate(async (id) => {
      const r = await fetch('/web/dataset/call_kw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', method: 'call',
          params: { model: 'helpdesk.ticket', method: 'read', args: [[id], ['stage_id']], kwargs: {} },
        }),
      });
      const j = await r.json();
      if (j.error) return { error: String((j.error.data && j.error.data.message) || j.error.message) };
      const row = j.result && j.result[0];
      return { stage: row && Array.isArray(row.stage_id) ? String(row.stage_id[1]) : '' };
    }, Number(ticketId));
    if ('error' in res) throw new Error(`HelpdeskPage.readStageOverRpc(${ticketId}): ${res.error}`);
    return res.stage;
  }

  // ─── Service-level targets (CRM-11859 Helpdesk A/B batch 2: TC-FLOW-013 / 015 / 018 / 020) ────────────────

  /**
   * [INTERNAL check, Call API] READ-ONLY, as the signed-in user: `fields` of ticket `ticketId` as STORED - datetimes come
   * back in UTC ('YYYY-MM-DD HH:mm:ss'), selections as their keys, many2one as [id, name]. Archived tickets included.
   * THROWS on an RPC error or a missing ticket, so a refusal is never read as an empty value.
   */
  async readTicketOverRpc(ticketId: number | string, fields: string[]): Promise<Record<string, unknown>> {
    const res = await this.page.evaluate(async ([id, flds]) => {
      const r = await fetch('/web/dataset/call_kw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', method: 'call',
          params: { model: 'helpdesk.ticket', method: 'search_read', args: [[['id', '=', id], ['active', 'in', [true, false]]], flds], kwargs: { limit: 1 } },
        }),
      });
      const j = await r.json();
      if (j.error) return { error: String((j.error.data && j.error.data.message) || j.error.message) };
      return { row: (j.result && j.result[0]) || null };
    }, [Number(ticketId), fields] as [number, string[]]);
    if ('error' in res) throw new Error(`HelpdeskPage.readTicketOverRpc(${ticketId}): ${res.error}`);
    if (!res.row) throw new Error(`HelpdeskPage.readTicketOverRpc(${ticketId}): no such ticket`);
    return res.row as Record<string, unknown>;
  }

  /**
   * Set the priority of the open ticket form: EDIT, click the star `label` (Low = no star), SAVE. Does nothing when the
   * form already shows `label` - a new CS ticket defaults to Medium, and clicking the star that is already the current
   * level CLEARS it to Low (measured 2026-10-28). Throws when the save is blocked.
   */
  async setPriorityAndSave(label: string): Promise<void> {
    if ((await this.getPriorityLabel()) === label) {
      console.log(`  - Priority already "${label}" - left as is`);
      return;
    }
    await this.clickEditTicket();
    await this.setPriority(label);
    if (!(await this.clickSaveTicket())) throw new Error(`setPriorityAndSave("${label}"): the form did not return to read mode after SAVE`);
  }

  // The control panel's "Filters" toggler and the items of its open dropdown (filters + the dividers between groups).
  private readonly filtersToggler = () =>
    this.page.locator("xpath=//button[contains(@class,'o_dropdown_toggler_btn')][normalize-space()='Filters']")
      .or(this.page.locator('button.o_dropdown_toggler_btn').filter({ hasText: /^\s*Filters\s*$/ })).first();
  private readonly filtersMenu = () =>
    this.page.locator("xpath=//div[contains(@class,'o_filters_menu') or contains(@class,'o_search_options')]//ul[contains(@class,'dropdown-menu') and contains(@class,'show')]")
      .or(this.page.locator('.o_filters_menu.show, ul.o_filters_menu.show, .o_search_options .dropdown-menu.show')).first();
  // A ticket's kanban card, found by a text its card carries (the subject).
  private readonly kanbanCardWithText = (text: string) =>
    this.page.locator('div.o_kanban_record:not(.o_kanban_ghost)').filter({ hasText: text }).first();

  /** Open the control panel's "Filters" dropdown (it stays open for reading). */
  async openFiltersMenu(): Promise<void> {
    await this.filtersToggler().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    if (await this.filtersMenu().isVisible({ timeout: CommonUtils.waitTimes.short }).catch(() => false)) return;
    await this.filtersToggler().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.filtersMenu().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.medium);
  }

  /** The entries of the OPEN Filters dropdown in screen order; each divider between groups reads '---'. Reads only. */
  async getFiltersMenuEntries(): Promise<string[]> {
    await this.openFiltersMenu();
    return this.page.evaluate(() => {
      const menu = Array.from(document.querySelectorAll('.o_filters_menu')).find((m) => (m as HTMLElement).offsetParent !== null) as HTMLElement | undefined;
      if (!menu) return [];
      const out: string[] = [];
      menu.querySelectorAll('a.dropdown-item, .dropdown-divider').forEach((e) => {
        const el = e as HTMLElement;
        if (el.classList.contains('dropdown-divider')) { if (out.length && out[out.length - 1] !== '---') out.push('---'); return; }
        if (el.offsetParent === null) return;
        const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
        if (t) out.push(t);
      });
      return out;
    });
  }

  /** Control panel > Filters > the entry `label` (exact text); waits for the list to reload. Throws when the entry is absent. */
  async chooseSearchFilter(label: string): Promise<void> {
    await this.openFiltersMenu();
    const item = this.page
      .locator(`xpath=//a[contains(@class,'dropdown-item')][normalize-space()='${label}']`)
      .or(this.page.locator('a.dropdown-item').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`) }))
      .first();
    if (!(await item.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false))) {
      throw new Error(`chooseSearchFilter: no "${label}" entry in the Filters menu`);
    }
    await item.click();
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    await this.page.keyboard.press('Escape').catch(() => {});
    console.log(`  - Filters > ${label} applied`);
  }

  /** Ticket ids of the first `n` list rows in screen order, read from the "(#id)" the Subject column carries. */
  async getListRowTicketIds(n: number): Promise<string[]> {
    await this.listOrEmptyHelper().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const texts = await this.listRows().evaluateAll((rows, max) => rows.slice(0, max as number).map((r) => (r as HTMLElement).innerText || ''), n);
    return texts.map((t) => (t.match(/\(#(\d+)\)/) || [])[1] || '').filter(Boolean);
  }

  /** The Due Date the open form SHOWS (the visible `overdue` widget - the form carries a red and a plain one) and its CSS colour. */
  async getVisibleDueDateStyle(): Promise<{ text: string; color: string }> {
    return this.page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('.o_form_view [name="overdue"]')).find((e) => (e as HTMLElement).offsetParent !== null) as HTMLElement | undefined;
      if (!el) return { text: '', color: '' };
      return { text: (el.innerText || (el as HTMLInputElement).value || '').trim(), color: getComputedStyle(el).color };
    });
  }

  /** On a kanban view: the Due Date block of the card showing `cardText` (the subject) - its text, class (oe_kanban_text_red / _black) and colour. */
  async getKanbanCardDueDateStyle(cardText: string): Promise<{ found: boolean; text: string; className: string; color: string }> {
    const card = this.kanbanCardWithText(cardText);
    // isVisible() does not wait - give the kanban a bounded moment to draw the card.
    if (!(await card.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.long }).then(() => true).catch(() => false))) return { found: false, text: '', className: '', color: '' };
    await card.scrollIntoViewIfNeeded().catch(() => {});
    return card.evaluate((c) => {
      const box = c.querySelector('[class*="oe_kanban_text_"]') as HTMLElement | null;
      if (!box) return { found: true, text: '', className: '', color: '' };
      box.setAttribute('data-pw-verify', 'kanban-due');
      return { found: true, text: (box.innerText || '').trim(), className: box.className, color: getComputedStyle(box).color };
    });
  }

  /**
   * [INTERNAL check, Call API] READ-ONLY: the domain of the saved search (ir.filters, "Favorites") `name` on helpdesk.ticket
   * that the signed-in user sees (his own or a shared one; his own wins), parsed from Odoo's Python-literal text into a
   * JSON domain. THROWS when no such favorite exists - an unknown facet must never be read as "no condition".
   */
  async readSavedFilterDomain(name: string): Promise<unknown[]> {
    const res = await this.page.evaluate(async (n) => {
      const call = async (url: string, params: unknown) => (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params }) })).json();
      const info = await call('/web/session/get_session_info', {});
      const uid = info.result.uid as number;
      const j = await call('/web/dataset/call_kw', { model: 'ir.filters', method: 'search_read', args: [[['model_id', '=', 'helpdesk.ticket'], ['name', '=', n], ['user_id', 'in', [uid, false]]], ['domain', 'user_id']], kwargs: { limit: 5 } });
      if (j.error) return { error: String((j.error.data && j.error.data.message) || j.error.message) };
      const rows = (j.result || []) as Array<{ domain: string; user_id: [number, string] | false }>;
      const row = rows.find((r) => r.user_id && r.user_id[0] === uid) || rows[0];
      return { domain: row ? row.domain : null };
    }, name);
    if ('error' in res) throw new Error(`HelpdeskPage.readSavedFilterDomain("${name}"): ${res.error}`);
    if (!res.domain) throw new Error(`HelpdeskPage.readSavedFilterDomain("${name}"): no saved search of that name`);
    const json = res.domain.replace(/\(/g, '[').replace(/\)/g, ']').replace(/\bFalse\b/g, 'false').replace(/\bTrue\b/g, 'true').replace(/'/g, '"');
    return JSON.parse(json) as unknown[];
  }

  /**
   * [INTERNAL check, Call API] READ-ONLY, on the ticket list just opened: its action's context (e.g.
   * "{'search_default_is_open': True}") and the signed-in user's OWN default saved search on that action, which Odoo applies
   * instead ('' when he has none). Throws on an RPC error.
   */
  async readAllTicketsDefaults(): Promise<{ actionContext: string; myDefaultFavorite: string }> {
    const res = await this.page.evaluate(async () => {
      const call = async (url: string, params: unknown) => (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params }) })).json();
      const info = await call('/web/session/get_session_info', {});
      const uid = info.result.uid as number;
      // The action on screen (two actions are named "All Tickets" - measured 2026-10-28), from the URL's action=<id>.
      const actionId = Number(((window.location.hash || '').match(/[#&]action=(\d+)/) || [])[1] || 0);
      if (!actionId) return { error: `no action=<id> in the URL ${window.location.href}` };
      const a = await call('/web/dataset/call_kw', { model: 'ir.actions.act_window', method: 'read', args: [[actionId], ['id', 'context']], kwargs: {} });
      if (a.error || a.result.length !== 1) return { error: a.error ? String(a.error.data?.message || a.error.message) : `action ${actionId} not readable` };
      const f = await call('/web/dataset/call_kw', { model: 'ir.filters', method: 'search_read', args: [[['model_id', '=', 'helpdesk.ticket'], ['is_default', '=', true], ['user_id', '=', uid], ['action_id', '=', a.result[0].id]], ['name']], kwargs: { limit: 1 } });
      if (f.error) return { error: String(f.error.data?.message || f.error.message) };
      return { actionContext: String(a.result[0].context), myDefaultFavorite: f.result.length ? String(f.result[0].name) : '' };
    });
    if ('error' in res) throw new Error(`HelpdeskPage.readAllTicketsDefaults: ${res.error}`);
    return res;
  }

  /** The texts of list column `index` (0 = first data column, the row selector excluded) for the first `n` rows. */
  async getListColumnTexts(index: number, n: number): Promise<string[]> {
    await this.listOrEmptyHelper().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    return this.listRows().evaluateAll((rows, [i, max]) => rows.slice(0, max).map((r) => {
      const cells = Array.from(r.querySelectorAll('td')).filter((td) => !td.classList.contains('o_list_record_selector'));
      return ((cells[i] as HTMLElement | undefined)?.innerText || '').replace(/\s+/g, ' ').trim();
    }), [index, n] as [number, number]);
  }

  /** [INTERNAL check, Call API] READ-ONLY: the names of the stages of team 1 Customer Support. Throws on an RPC error. */
  async readCsStageNamesOverRpc(): Promise<string[]> {
    const res = await this.page.evaluate(async () => {
      const r = await fetch('/web/dataset/call_kw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model: 'helpdesk.stage', method: 'search_read', args: [[['team_ids', 'in', [1]]], ['name']], kwargs: { limit: 60 } } }) });
      const j = await r.json();
      if (j.error) return { error: String((j.error.data && j.error.data.message) || j.error.message) };
      return { names: (j.result as Array<{ name: string }>).map((s) => s.name) };
    });
    if ('error' in res) throw new Error(`HelpdeskPage.readCsStageNamesOverRpc: ${res.error}`);
    return res.names;
  }

  /** SEC checks: how many <img src="x"> elements the page holds (an executed `<img src=x onerror=...>` payload) and whether `text` is in the page's visible text. */
  async inspectInjectedMarkup(text: string): Promise<{ injectedImages: number; textShown: boolean }> {
    return this.page.evaluate((t) => ({
      injectedImages: document.querySelectorAll('img[src="x"]').length,
      textShown: (document.body.innerText || '').includes(t),
    }), text);
  }

  // ─── CRM context (CRM-11859 batch 2: TC-CUST-051 / TC-CUST-074) ─────────────────────────────────────────────────

  /**
   * Chatter > Schedule activity > Activity Type "Schedule Support Meeting" > Meeting Type "Regular meeting", Assignee
   * `activityAssignee` (both required by the dialog) > SAVE & OPEN CALENDAR, and return the warning
   * Odoo shows ('' when none). The warning dialog is LEFT OPEN for the evidence shot - closeShownDialog() and
   * discardActivityDialog() follow. Measured 2026-10-28: the type is a many2one autocomplete; the footer carries hidden
   * twins of its buttons, so only the VISIBLE "SAVE & OPEN CALENDAR" is clicked.
   */
  async trySaveSupportMeetingAndOpenCalendar(activityAssignee: string): Promise<string> {
    await this.page.locator('button.o_chatter_button_schedule_activity').first().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    const dialog = this.page.locator('.modal.show .modal-content').filter({ hasText: 'Activity' }).last();
    await dialog.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const type = dialog.locator('[name="activity_type_id"] input:visible').first();
    await type.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await type.fill('Schedule Support Meeting', { timeout: CommonUtils.waitTimes.abnormalWait });
    await this.autocompleteItems().filter({ hasText: 'Schedule Support Meeting' }).first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.autocompleteItems().filter({ hasText: 'Schedule Support Meeting' }).first().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long);
    // The type then asks for two REQUIRED fields (measured 2026-10-28): "Meeting Type" (a select) and the activity's
    // "Assignee" (a many2one). With either empty SAVE does nothing, so the ticket's engineer check is never reached.
    // Only the VISIBLE select that offers "Regular meeting" - the dialog's note editor carries hidden selects too.
    const meetingType = dialog.locator('select:visible').filter({ has: this.page.locator('option', { hasText: 'Regular meeting' }) }).first();
    if (await meetingType.count()) {
      await meetingType.selectOption({ label: 'Regular meeting' }, { timeout: CommonUtils.waitTimes.abnormalWait });
      await this.wait(CommonUtils.waitTimes.medium);
    }
    // The activity's "Assignee" is mail.activity.support_user_id (many2one over the support team users; the plain user_id is
    // hidden for a meeting - read from the view arch 2026-10-28).
    const input = dialog.locator('[name="support_user_id"] input:visible').first();
    if (await input.count()) {
      await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await input.fill(activityAssignee, { timeout: CommonUtils.waitTimes.abnormalWait });
      const item = this.autocompleteItems().filter({ hasText: activityAssignee }).first();
      await item.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await item.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.wait(CommonUtils.waitTimes.medium);
      console.log(`  - Activity Assignee = ${activityAssignee}`);
    }
    const btn = dialog.locator('.modal-footer button:visible').filter({ hasText: /^\s*SAVE & OPEN CALENDAR\s*$/i }).first();
    await btn.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    return this.waitForMessageContaining('assign engineer');
  }

  /**
   * Wait (bounded) for any visible text containing `fragment` - a warning dialog or a notification toast - and return the
   * text of the box that holds it ('' when none appears). That box is tagged MESSAGE for the evidence outline.
   * The holder is the INNERMOST visible element whose text carries the whole fragment, not a leaf: Odoo 12's warning
   * dialog writes the message into div.o_dialog_warning with t-raw ("\n" -> <br/>), so that div has element children
   * (TC-CUST-051_A read "(no message)" with the dialog on screen - 2026-10-28).
   */
  async waitForMessageContaining(fragment: string): Promise<string> {
    const drawn = await this.page.waitForFunction(
      (f) => Array.from(document.querySelectorAll('body *')).some((e) => (e.textContent || '').includes(f) && e.getBoundingClientRect().width > 0
        && !Array.from(e.children).some((c) => (c.textContent || '').includes(f))),
      fragment, { timeout: CommonUtils.waitTimes.abnormalWait }
    ).then(() => true).catch(() => false);
    if (!drawn) return '';
    return this.page.evaluate((f) => {
      document.querySelectorAll('[data-pw-verify="odoo-msg"]').forEach((e) => e.removeAttribute('data-pw-verify'));
      const holder = Array.from(document.querySelectorAll('body *')).find((e) => (e.textContent || '').includes(f) && e.getBoundingClientRect().width > 0
        && !Array.from(e.children).some((c) => (c.textContent || '').includes(f))) as HTMLElement;
      const box = (holder.closest('.modal-content, .o_notification, .o_dialog_warning') as HTMLElement) || holder;
      box.setAttribute('data-pw-verify', 'odoo-msg');
      return (box.innerText || '').replace(/\s+/g, ' ').trim();
    }, fragment);
  }

  /** The message box tagged by waitForMessageContaining (for the evidence outline). */
  static readonly MESSAGE = '[data-pw-verify="odoo-msg"]';

  /** Discard the open "Activity" dialog (and any warning above it) with its DISCARD / close buttons. */
  async discardActivityDialog(): Promise<void> {
    for (let i = 0; i < 3 && (await this.page.locator('.modal.show').count()); i++) {
      const discard = this.page.locator('.modal.show .modal-footer button:visible').filter({ hasText: /^\s*(DISCARD|Discard|Ok|OK|Close)\s*$/ }).last();
      if (await discard.count()) await discard.click().catch(() => {});
      else await this.page.keyboard.press('Escape').catch(() => {});
      await this.wait(CommonUtils.waitTimes.medium);
    }
  }

  /** [INTERNAL check, Call API] READ-ONLY: activities and calendar events linked to ticket `ticketId`. */
  async countActivitiesAndEventsOverRpc(ticketId: number | string): Promise<{ activities: number; events: number }> {
    const res = await this.page.evaluate(async (id) => {
      const kw = async (model: string, args: unknown[]) => { const r = await fetch('/web/dataset/call_kw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method: 'search_count', args, kwargs: {} } }) }); return r.json(); };
      const a = await kw('mail.activity', [[['res_model', '=', 'helpdesk.ticket'], ['res_id', '=', id]]]);
      const e = await kw('calendar.event', [[['res_model', '=', 'helpdesk.ticket'], ['res_id', '=', id]]]);
      if (a.error || e.error) return { error: String((a.error || e.error).data?.message || (a.error || e.error).message) };
      return { activities: Number(a.result), events: Number(e.result) };
    }, Number(ticketId));
    if ('error' in res) throw new Error(`HelpdeskPage.countActivitiesAndEventsOverRpc(${ticketId}): ${res.error}`);
    return res;
  }

  /** Whether the ticket view on screen is the LIST view (o_list_view drawn). */
  async isListViewShown(): Promise<boolean> {
    return this.page.locator('.o_list_view').first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.long }).then(() => true).catch(() => false);
  }

  // ─── Queue, ownership & team (CRM-11859 Helpdesk A/B batch 2: TC-FLOW-003, TC-UI-038, TC-SEC-018 / 019) ─────────

  /** EDIT mode: the text input of char field `fieldName` (e.g. partner_email) - cleared, typed, then Tab. */
  async setFormInputByName(fieldName: string, value: string): Promise<void> {
    const input = this.page.locator(`xpath=//div[contains(@class,'o_form_view')]//input[@name='${fieldName}']`)
      .or(this.page.locator(`.o_form_view input[name="${fieldName}"]`)).first();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.fill(value);
    await input.press('Tab').catch(() => {});
    await this.wait(CommonUtils.waitTimes.medium);
    console.log(`  - ${fieldName} = "${value}"`);
  }

  /**
   * In the ticket LIST on screen: CREATE, fill Subject and the optional Customer Email / Priority / Assigned to, SAVE once,
   * and return the new id. Priority: a new ticket starts at Medium and clicking the current level clears it, so the star
   * is clicked only when it differs. THROWS when the ticket is not created.
   */
  async createTicketWithFieldsInCurrentList(data: { subject: string; customerEmail?: string; priority?: string; assignedTo?: string }): Promise<string> {
    const create = this.listCreateButton();
    await create.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await create.click();
    await this.waitForFormView(CommonUtils.waitTimes.abnormalWait);
    const subj = this.subjectField();
    await subj.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await subj.fill(data.subject);
    if (data.customerEmail) await this.setFormInputByName('partner_email', data.customerEmail);
    if (data.priority && (await this.getPriorityLabel()) !== data.priority) await this.setPriority(data.priority);
    if (data.assignedTo) await this.setAssignedTo(data.assignedTo);
    await this.formSaveButton().click();
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    const popup = await this.getBlockingPopupText(CommonUtils.waitTimes.long);
    if (popup) throw new Error(`createTicketWithFieldsInCurrentList("${data.subject}") was blocked by a dialog: ${popup}`);
    const id = await this.waitForIdInUrlAndExtract(CommonUtils.waitTimes.abnormalWait);
    if (!/^\d+$/.test(id)) throw new Error(`createTicketWithFieldsInCurrentList("${data.subject}") did not yield a record id (got "${id}")`);
    await this.stageBar().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    console.log(`  - Created helpdesk ticket #${id} - Subject "${data.subject}"`);
    return id;
  }

  /**
   * EDIT mode: type `text` into "Assigned to" and return what its autocomplete OFFERS (item texts, "Search More..." and
   * "Create ..." entries included as shown). Closes the dropdown with Escape unless `keepOpen` (for the evidence shot -
   * closeAssignedToDropdown() follows); nothing is chosen.
   */
  async getAssignedToOptions(text: string, keepOpen = false): Promise<string[]> {
    const input = this.assignedToInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await input.pressSequentially(text, { delay: 20 });
    await this.autocompleteItems().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    const items = (await this.autocompleteItems().allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (!keepOpen) await this.closeAssignedToDropdown();
    return items;
  }

  /** [INTERNAL check, Call API] READ-ONLY: helpdesk team `teamId` - its name and members (login, name). Throws on an RPC error. */
  async readTeamMembersOverRpc(teamId: number): Promise<{ name: string; members: Array<{ login: string; name: string }> }> {
    const res = await this.page.evaluate(async (id) => {
      const kw = async (model: string, method: string, args: unknown[], kwargs: unknown = {}) => (await fetch('/web/dataset/call_kw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } }) })).json();
      const t = await kw('helpdesk.team', 'read', [[id], ['name', 'member_ids']]);
      if (t.error) return { error: String((t.error.data && t.error.data.message) || t.error.message) };
      const team = t.result[0];
      const u = await kw('res.users', 'read', [team.member_ids, ['login', 'name']]);
      if (u.error) return { error: String((u.error.data && u.error.data.message) || u.error.message) };
      return { name: String(team.name), members: (u.result as Array<{ login: string; name: string }>).map((x) => ({ login: x.login, name: x.name })) };
    }, teamId);
    if ('error' in res) throw new Error(`HelpdeskPage.readTeamMembersOverRpc(${teamId}): ${res.error}`);
    return res;
  }

  /** [INTERNAL check, Call API] READ-ONLY: the assign method of helpdesk team `teamId` (manual / randomly / balanced). */
  async readTeamAssignMethodOverRpc(teamId: number): Promise<string> {
    const res = await this.page.evaluate(async (id) => {
      const r = await fetch('/web/dataset/call_kw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model: 'helpdesk.team', method: 'read', args: [[id], ['assign_method']], kwargs: {} } }) });
      const j = await r.json();
      if (j.error) return { error: String((j.error.data && j.error.data.message) || j.error.message) };
      return { method: String(j.result[0].assign_method) };
    }, teamId);
    if ('error' in res) throw new Error(`HelpdeskPage.readTeamAssignMethodOverRpc(${teamId}): ${res.error}`);
    return res.method;
  }

  /**
   * [INTERNAL check, Call API] READ-ONLY: whether an active user with `login` exists. (A helpdesk agent cannot read
   * res.groups - its group membership is measured as an administrator and recorded in the spec header instead.)
   */
  async userExistsOverRpc(login: string): Promise<boolean> {
    const res = await this.page.evaluate(async (l) => {
      const r = await fetch('/web/dataset/call_kw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model: 'res.users', method: 'search_count', args: [[['login', '=', l], ['active', '=', true]]], kwargs: {} } }) });
      const j = await r.json();
      if (j.error) return { error: String((j.error.data && j.error.data.message) || j.error.message) };
      return { n: Number(j.result) };
    }, login);
    if ('error' in res) throw new Error(`HelpdeskPage.userExistsOverRpc(${login}): ${res.error}`);
    return res.n > 0;
  }

  /** Close the "Assigned to" autocomplete with Escape (nothing chosen). */
  async closeAssignedToDropdown(): Promise<void> {
    await this.assignedToInput().press('Escape').catch(() => {});
    await this.wait(CommonUtils.waitTimes.short);
  }

  /** Selector of the open many2one autocomplete list (for the evidence outline). */
  static readonly AUTOCOMPLETE = 'ul.ui-autocomplete';

  /** EDIT mode: type `text` into "Assigned to" and press Enter (Odoo takes the first offered item, if any); returns the field's text after. */
  async typeAssignedToAndEnter(text: string): Promise<string> {
    const input = this.assignedToInput();
    await input.click();
    await input.fill('');
    await input.pressSequentially(text, { delay: 20 });
    await this.wait(CommonUtils.waitTimes.long);
    await input.press('Enter');
    await this.wait(CommonUtils.waitTimes.long);
    await this.page.keyboard.press('Escape').catch(() => {});
    return (await input.inputValue().catch(() => '')).trim();
  }

  /** Selector of the kanban Due Date block tagged by getKanbanCardDueDateStyle (for the evidence outline). */
  static readonly KANBAN_DUE = '[data-pw-verify="kanban-due"]';

  /**
   * [INTERNAL check, Call API] READ-ONLY, as the signed-in user: search_count of helpdesk.ticket over `domain` (Odoo
   * domain syntax). THROWS on an RPC error so a refusal is never read as 0.
   */
  async countTicketsOverRpc(domain: unknown[]): Promise<number> {
    const res = await this.page.evaluate(async (d) => {
      const r = await fetch('/web/dataset/call_kw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model: 'helpdesk.ticket', method: 'search_count', args: [d], kwargs: {} } }),
      });
      const j = await r.json();
      if (j.error) return { error: String((j.error.data && j.error.data.message) || j.error.message) };
      return { n: Number(j.result) };
    }, domain);
    if ('error' in res) throw new Error(`HelpdeskPage.countTicketsOverRpc: ${res.error}`);
    return res.n;
  }

  // ─── 1. Ticket ownership (CRM-11859 Helpdesk A/B: TC-SEC-066 / TC-SEC-080) ─────────────────────────────────────

  /** One READ-ONLY JSON-RPC call_kw as the signed-in user. THROWS on an RPC error, so a refusal is never read as "nothing". */
  private async callKwReadOnly(model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}): Promise<unknown> {
    const res = await this.page.evaluate(async (p) => {
      const r = await fetch('/web/dataset/call_kw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: p }),
      });
      const j = await r.json();
      if (j.error) return { error: String((j.error.data && j.error.data.message) || j.error.message) };
      return { result: j.result as unknown };
    }, { model, method, args, kwargs });
    if ('error' in res) throw new Error(`HelpdeskPage ${model}.${method}: ${res.error}`);
    return res.result;
  }

  /**
   * [INTERNAL check, Call API] READ-ONLY, as the signed-in user: helpdesk.ticket rows over `domain` (archived ones only when
   * the domain names `active`), `order`ed and bounded by `limit`. Datetimes come back in UTC, many2one as [id, name].
   */
  async searchTicketsOverRpc(domain: unknown[], fields: string[], opts: { limit: number; order: string }): Promise<Array<Record<string, unknown>>> {
    return (await this.callKwReadOnly('helpdesk.ticket', 'search_read', [domain, fields], { limit: opts.limit, order: opts.order })) as Array<Record<string, unknown>>;
  }

  /** [INTERNAL check, Call API] READ-ONLY: `fields` of the partner `partnerId`. THROWS when it does not exist. */
  async readPartnerOverRpc(partnerId: number, fields: string[]): Promise<Record<string, unknown>> {
    const rows = (await this.callKwReadOnly('res.partner', 'read', [[partnerId], fields])) as Array<Record<string, unknown>>;
    if (!rows.length) throw new Error(`HelpdeskPage.readPartnerOverRpc(${partnerId}): no such partner`);
    return rows[0];
  }

  /** CSS hook of the form rows tagged by readFormFieldsByName() - for captureVerifyEvidence's highlight. */
  static readonly FORM_FIELD = '[data-pw-verify="odoo-field"]';

  /**
   * The values the open ticket form DRAWS (read mode) for the Odoo fields `names`: the text of the first VISIBLE widget of
   * each (a many2one = its link text); '' when Odoo draws none (an empty field is hidden in read mode). Tags each field's
   * label + value row (and the title for `name`) for the verify shot - FORM_FIELD. Reads only.
   */
  async readFormFieldsByName(names: string[]): Promise<Record<string, string>> {
    await this.page.locator('.o_form_view').first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    return this.page.evaluate((list) => {
      document.querySelectorAll('[data-pw-verify="odoo-field"]').forEach((e) => e.removeAttribute('data-pw-verify'));
      const out: Record<string, string> = {};
      for (const n of list) {
        const el = Array.from(document.querySelectorAll<HTMLElement>(`.o_form_view .o_field_widget[name="${n}"]`)).find((e) => e.offsetParent !== null);
        out[n] = el ? (el.innerText || (el as HTMLInputElement).value || '').replace(/\s+/g, ' ').trim() : '';
        if (!el) continue;
        const row = (el.closest('tr') as HTMLElement | null) || (el.closest('.oe_title') as HTMLElement | null) || el;
        row.setAttribute('data-pw-verify', 'odoo-field');
      }
      return out;
    }, names);
  }

  /** The control-panel breadcrumb of the open form - the record's display name, e.g. "subject (#374559)". */
  async getFormBreadcrumb(): Promise<string> {
    const crumb = this.page.locator('.o_control_panel .breadcrumb li.active, .o_control_panel .breadcrumb-item.active').last();
    await crumb.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    return ((await crumb.innerText({ timeout: CommonUtils.waitTimes.abnormalWait })) || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * A stored UTC datetime ('YYYY-MM-DD HH:mm:ss') as THIS browser's Odoo web client draws it: MM/DD/YYYY HH:mm:ss in the
   * browser's time zone (Odoo 12 converts with the browser offset). Lets a spec compare the drawn value to the stored one.
   */
  async formatUtcAsOdooDatetime(utc: string): Promise<string> {
    return this.page.evaluate((v) => {
      const d = new Date(`${v.replace(' ', 'T')}Z`);
      const p = (x: number) => String(x).padStart(2, '0');
      return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    }, utc);
  }

  /** Remove every facet of the control-panel search box (e.g. the user's own default favorite), so the action's own list shows. */
  async clearSearchFacets(): Promise<void> {
    for (let i = 0; i < 8; i++) {
      const x = this.page.locator('.o_searchview_facet .o_facet_remove').first();
      if ((await x.count()) === 0) break;
      await x.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await this.wait(CommonUtils.waitTimes.medium);
    }
    console.log(`  - Search facets cleared (now: ${JSON.stringify(await this.getSearchFacets())})`);
  }

  /**
   * Control-panel search box: type `text` and choose the option "Search <field> for: <text>" (e.g. field 'All' or
   * 'Ticket ID'), then wait for the list. THROWS when Odoo does not offer that option.
   */
  async searchListFor(field: string, text: string): Promise<void> {
    const box = this.page.locator('.o_searchview_input').first();
    await box.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await box.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await box.fill('', { timeout: CommonUtils.waitTimes.abnormalWait });
    await box.type(text, { delay: 30, timeout: CommonUtils.waitTimes.abnormalWait });
    const option = this.page.locator('.o_searchview_autocomplete li')
      .filter({ hasText: new RegExp(`^\\s*Search ${escapeRegExp(field)} for:\\s*${escapeRegExp(text)}\\s*$`) }).first();
    await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await option.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.listOrEmptyHelper().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  - Search ${field} for: ${text} -> facets ${JSON.stringify(await this.getSearchFacets())}`);
  }

  /** CSS hook of the list (rows or the empty-list helper) - for captureVerifyEvidence's highlight. */
  static readonly LIST_VIEW = '.o_list_view, .o_view_nocontent';
}

/** Escape a string for use inside a RegExp source. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
