import { Page } from '@playwright/test';
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
  // Helpdesk app link on the apps home (menu_id=289).
  private readonly helpdeskAppLinkXPath = () =>
    this.page.locator("xpath=//a[contains(@href,'menu_id=289')] | //a[contains(@data-menu-xmlid,'helpdesk')]").first();
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
    await link.click();
    await this.waitForURL('**/web?*menu_id=289*', CommonUtils.waitTimes.pageLoad).catch(() => {});
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
    const url = `${origin}/web?#action=465&active_id=5&model=helpdesk.ticket&view_type=list&menu_id=289`;
    await this.page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    // Wait for the list view itself to render (waitForPageReady alone can resolve before the list is up).
    await this.page.waitForSelector('.o_list_view, .o_content', { timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    await this.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    await this.dismissErrorDialog();
    console.log('  - Opened Sales Engineers tickets list (direct URL)');
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
}
