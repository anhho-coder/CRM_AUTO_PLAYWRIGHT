import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * SE Meeting Page Object - the "Schedule activity -> Schedule Support Meeting" flow started from an
 * SE support ticket (Helpdesk) by the Pre-Sales Engineer (pre-sale-7.2.3.1 "A meeting created").
 *
 * Flow covered:
 *   1) Ticket chatter "Schedule activity" -> the Schedule Activity wizard.
 *   2) Wizard: Activity = "Schedule Support Meeting" (reveals Meeting Type / Assignee /
 *      "Save & open calendar"), Meeting Type = native <select>, Assignee = many2one.
 *   3) "Save & open calendar" (button name=create_support_meeting) navigates to the
 *      calendar.event calendar view.
 *   4) Pick a date on the calendar -> the "Create: Meetings" modal opens (quick-create is off,
 *      so the full form dialog appears directly).
 *   5) Create: Meetings form: Meeting Subject, Meeting Platform = G2M (native <select>),
 *      G2M Meeting room = "Meeting link #4" (many2one, shown once platform = G2M),
 *      Duration = 15 (native <select> name=minute_duration, shown once a G2M room is bookable),
 *      Customer's Timezone (native <select> name=tz) -> Save.
 *
 * NOTE (pre-sale-7.2.3.1): the manual TC's Pre-condition #3 (copy the G2M Token / Refresh Token
 * from Production to Pre-production so "Meeting link #4" is usable) is done MANUALLY outside the
 * automation - this page object assumes "Meeting link #4" is available.
 *
 * Every locator uses the two-layer strategy: XPath primary, CSS fallback; all modal-scoped.
 */
export class SEMeetingPage extends BasePage {
  // ── Ticket chatter: "Schedule activity" ──
  private readonly scheduleActivityButton = () =>
    this.page.locator("xpath=//button[contains(@class,'o_chatter_button_schedule_activity')]").or(
      this.page.locator('.o_chatter_button_schedule_activity')
    ).first();

  // The last (top-most) open modal - both the wizard and the Create: Meetings dialog are modals.
  private readonly openModal = () => this.page.locator('div.modal.show').last();

  // ── Schedule Activity wizard fields ──
  private readonly activityTypeInput = () =>
    this.openModal().locator("xpath=.//div[@name='activity_type_id']//input").or(
      this.openModal().locator("div[name='activity_type_id'] input")
    ).first();
  private readonly meetingTypeSelect = () =>
    this.openModal().locator("select[name='meeting_type']").first();
  private readonly saveAndOpenCalendarButton = () =>
    this.openModal().locator("xpath=.//button[@name='create_support_meeting']").or(
      this.openModal().locator("button[name='create_support_meeting']")
    ).first();

  // ── Calendar (calendar.event) ──
  private readonly calendarView = () => this.page.locator('.fc-view, .o_calendar_view, .fc').first();
  // The meeting event that "Save & open calendar" already created (linked to the ticket) and rendered
  // on the calendar. Opening THIS event keeps the meeting linked to the ticket.
  private readonly calendarEvent = () =>
    this.page.locator('.fc-time-grid-event.fc-event, .fc-day-grid-event.fc-event, a.fc-event.fc-draggable, .fc-event.fc-draggable').first();
  // Odoo's calendar event popover "Edit" button (a single event-click may open a details popover first).
  private readonly calendarEventPopoverEdit = () =>
    this.page.locator(".o_cw_popover .o_cw_popover_edit, .o_cw_popover a.o_cw_popover_edit, .popover .o_cw_popover_edit").or(
      this.page.locator(".o_cw_popover a, .popover .card-footer a").filter({ hasText: /Edit/i })
    ).first();
  // A clickable day/time cell in fullcalendar (fallback only, if no pre-created event exists).
  private readonly calendarDayCell = () =>
    this.page.locator(
      "xpath=(//td[contains(@class,'fc-day') and contains(@class,'fc-widget-content') and not(contains(@class,'fc-other-month'))])[1] | (//div[contains(@class,'fc-day-grid')]//td[contains(@class,'fc-day-top')])[1] | (//div[contains(@class,'fc-time-grid')]//td[contains(@class,'fc-widget-content')])[1]"
    ).first();

  // ── Create: Meetings modal fields ──
  private readonly meetingSubjectInput = () =>
    this.openModal().locator("input[name='name']").first();
  private readonly meetingPlatformSelect = () =>
    this.openModal().locator("select[name='meeting_platform']").first();
  private readonly g2mMeetingRoomInput = () =>
    this.openModal().locator("xpath=.//div[@name='g2m_meeting_room_id']//input").or(
      this.openModal().locator("div[name='g2m_meeting_room_id'] input")
    ).first();
  private readonly durationMinuteSelect = () =>
    this.openModal().locator("select[name='minute_duration']").first();
  private readonly timezoneSelect = () =>
    this.openModal().locator("select[name='tz']").first();
  // "Starting at" datetime input for a timed (non-all-day) meeting (start_datetime).
  private readonly startDatetimeInput = () =>
    this.openModal().locator("input[name='start_datetime']").first();
  // The "Ticket" many2one on the Create: Meetings form (the link that makes the meeting show in the
  // ticket's "L1 notes" table). Normally pre-filled from the ticket context; repaired if empty.
  private readonly meetingTicketInput = () =>
    this.openModal().locator("xpath=.//div[@name='ticket_id']//input").or(
      this.openModal().locator("div[name='ticket_id'] input")
    ).first();
  // When a record opens in a dialog/popover in READONLY mode, Odoo shows an "Edit" control (a footer
  // button in a form dialog, or an <a> in a calendar event popover). Click it to make the form fields
  // (the native <select>s) editable.
  private readonly modalEditButton = () =>
    this.openModal().locator(
      "xpath=.//button[contains(@class,'o_form_button_edit')] | .//a[contains(@class,'o_cw_popover_edit')] | .//button[contains(@class,'o_cw_popover_edit')] | .//*[self::button or self::a][normalize-space()='Edit']"
    ).or(
      this.openModal().locator('.o_form_button_edit, .o_cw_popover_edit')
    ).first();
  private readonly meetingSaveButton = () =>
    this.openModal().locator("xpath=.//footer//button[normalize-space()='Save'] | .//div[contains(@class,'modal-footer')]//button[contains(@class,'btn-primary')]").or(
      this.openModal().locator('.modal-footer button.btn-primary')
    ).first();

  // Shared many2one autocomplete dropdown option.
  private readonly dropdownOption = () =>
    this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]');
  // The "No results to show..." item Odoo renders when a many2one search matches nothing.
  private readonly dropdownNoResults = () =>
    this.page.locator('.ui-autocomplete .ui-menu-item, .o_m2o_no_result').filter({ hasText: /No records|No results/i }).first();

  constructor(page: Page) {
    super(page);
  }

  /** Set a many2one autocomplete: clear, type the value, then click the matching option (or Enter). */
  private async setMany2One(input: Locator, value: string): Promise<void> {
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.short);
    await input.fill(value);
    await this.wait(CommonUtils.waitTimes.standard);
    const option = this.dropdownOption().filter({ hasText: value }).first();
    const visible = await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    if (visible) {
      await option.click();
    } else {
      await this.page.keyboard.press('Enter');
    }
    await this.wait(CommonUtils.waitTimes.medium);
  }

  /**
   * STRICT G2M Meeting room selection: type the room, and select the matching autocomplete option.
   * If the option does NOT appear (the search shows "No results to show"), CLEAR the field and raise
   * a clear notification instead of silently continuing - because on this app that almost always means
   * Pre-condition #3 (the manual G2M Token/Refresh-Token copy from Production to Pre-production) was
   * NOT done, so the G2M room (e.g. "Meeting link #4") is not available on Pre-production.
   */
  async selectG2MMeetingRoom(room: string): Promise<void> {
    const input = this.g2mMeetingRoomInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.short);
    await input.fill(room);
    await this.wait(CommonUtils.waitTimes.standard);

    const option = this.dropdownOption().filter({ hasText: room }).first();
    const found = await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    if (found) {
      await option.click();
      await this.wait(CommonUtils.waitTimes.medium);
      console.log(`  - G2M Meeting room = "${room}"`);
      return;
    }

    // Could not select the room -> CLEAR the field and NOTIFY (fail the step with a clear reason).
    const noResults = await this.dropdownNoResults().isVisible({ timeout: CommonUtils.waitTimes.short }).catch(() => false);
    await input.fill('').catch(() => {});
    await this.wait(CommonUtils.waitTimes.short);
    const msg =
      `Could not select G2M Meeting room "${room}"${noResults ? ' - the search returned "No results to show"' : ' - no matching autocomplete option appeared'}. ` +
      `This usually means Pre-condition #3 (the manual G2M Token/Refresh-Token copy from Production to Pre-production) was NOT done, ` +
      `so "${room}" is not available on Pre-production. The G2M Meeting room field has been cleared.`;
    console.log(`  ⚠ ${msg}`);
    throw new Error(msg);
  }

  /** Step 9: on the ticket, click "Schedule activity" in the Log note / chatter section. */
  async clickScheduleActivity(): Promise<void> {
    await this.dismissErrorDialog();
    const btn = this.scheduleActivityButton();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await this.openModal().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  - Opened the Schedule Activity wizard');
  }

  /**
   * Step 10: fill the Schedule Activity wizard.
   *  - Activity     = "Schedule Support Meeting" (reveals the meeting fields + Save & open calendar)
   *  - Meeting type = "Data collection"
   *  - Assignee     = LEFT AS-IS: it already defaults to the logged-in Pre-Sales Engineer
   *                   (Nick Luchkov); re-typing it makes the autocomplete return "No results to show",
   *                   so this method never touches the Assignee field.
   */
  async fillScheduleMeetingActivity(activity: string, meetingType: string): Promise<void> {
    // Activity type (many2one) - drives the onchange that reveals Meeting Type / Assignee / the button.
    await this.setMany2One(this.activityTypeInput(), activity);
    await this.wait(CommonUtils.waitTimes.long);

    // Meeting type (native <select>).
    const mt = this.meetingTypeSelect();
    await mt.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await mt.selectOption({ label: meetingType }).catch(async () => {
      await mt.selectOption(meetingType).catch(() => {});
    });
    await this.wait(CommonUtils.waitTimes.medium);

    // Assignee: intentionally NOT set - keep its default value (Nick Luchkov).
    console.log(`  - Wizard set: Activity="${activity}", Meeting type="${meetingType}", Assignee=left as default`);
  }

  /** Step 11: press "Save & open calendar" and wait for the calendar.event calendar view to render. */
  async clickSaveAndOpenCalendar(): Promise<void> {
    const btn = this.saveAndOpenCalendarButton();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    // Navigates to the calendar.event calendar view.
    await this.waitForURL('**model=calendar.event**', CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.calendarView().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  - "Save & open calendar" -> calendar view opened');
  }

  /**
   * Ensure the meeting dialog is in EDIT mode: an existing event opens READONLY ("Open: Meetings"),
   * where the fields render as text (no native <select>). Poll for the Meeting Platform <select>; while
   * it is absent, click the dialog's "Edit" control. A single Edit-click is flaky (button/render can
   * lag), so this retries. Returns true once the form is editable.
   */
  private async ensureMeetingFormEditable(): Promise<boolean> {
    for (let i = 0; i < 5; i++) {
      if (await this.meetingPlatformSelect().isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false)) {
        if (i > 0) console.log(`  - Meeting form is editable (after ${i} Edit click(s))`);
        return true;
      }
      const edit = this.modalEditButton();
      if (await edit.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false)) {
        await edit.click({ force: true }).catch(() => {});
      }
      await this.wait(CommonUtils.waitTimes.extraLong);
    }
    return await this.meetingPlatformSelect().isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
  }

  /**
   * Step 12: open the meeting on the calendar so the "Create: Meetings" form appears.
   *
   * IMPORTANT: "Save & open calendar" already CREATED the support meeting (linked to the ticket via
   * ticket_id/lead_id) and rendered it as an event on the calendar. We OPEN THAT event so the meeting
   * stays linked to the ticket (and therefore shows up in the ticket's "L1 notes" table). Clicking a
   * blank calendar slot instead would create a SECOND, UNLINKED meeting that never appears on the ticket.
   * A single click on the event may open a details popover first, in which case we click its "Edit".
   */
  async pickDateAndOpenCreateMeeting(): Promise<void> {
    await this.dismissErrorDialog();
    const event = this.calendarEvent();
    const haveEvent = await event.isVisible({ timeout: CommonUtils.waitTimes.pageLoad }).catch(() => false);
    if (haveEvent) {
      await event.scrollIntoViewIfNeeded().catch(() => {});
      await event.click({ force: true });
      await this.wait(CommonUtils.waitTimes.long);
      // If a details popover opened, click "Edit" to reach the full form.
      const edit = this.calendarEventPopoverEdit();
      if (await edit.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false)) {
        await edit.click().catch(() => {});
        await this.wait(CommonUtils.waitTimes.long);
        console.log('  - Opened the ticket-linked meeting event (via popover Edit)');
      } else {
        console.log('  - Opened the ticket-linked meeting event (form dialog)');
      }
    } else {
      // Fallback: no pre-created event -> select a blank slot (may create an unlinked meeting).
      console.log('  - WARNING: no pre-created calendar event found; selecting a blank slot');
      const cell = this.calendarDayCell();
      await cell.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
      await cell.scrollIntoViewIfNeeded().catch(() => {});
      await cell.click({ force: true });
      await this.wait(CommonUtils.waitTimes.long);
    }
    // The "Create: Meetings" (or "Open: Meetings") form dialog is now open.
    await this.openModal().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.wait(CommonUtils.waitTimes.long);
    // An existing event opens in READONLY ("Open: Meetings") mode - make it editable (poll + click Edit)
    // so the native <select> fields (Meeting Platform, etc.) are present before filling.
    const editable = await this.ensureMeetingFormEditable();
    console.log(`  - Meeting form dialog is open (editable=${editable})`);
  }

  /** Diagnostic: log the currently-open modal's title, its native <select> field names and its buttons. */
  private async logOpenModalState(tag: string): Promise<void> {
    const title = (await this.openModal().locator('.modal-title').first().textContent().catch(() => '') ?? '').trim();
    const selects = await this.openModal().locator('select[name]').evaluateAll((els) => els.map((e) => (e as HTMLElement).getAttribute('name'))).catch(() => [] as any[]);
    const names = await this.openModal().locator('[name]').evaluateAll((els) => els.map((e) => (e as HTMLElement).getAttribute('name')).filter(Boolean).slice(0, 40)).catch(() => [] as any[]);
    const buttons = await this.openModal().locator('button').evaluateAll((els) => els.map((e) => (e.textContent || '').trim()).filter(Boolean).slice(0, 20)).catch(() => [] as any[]);
    console.log(`  [modal ${tag}] title="${title}" selects=${JSON.stringify(selects)} buttons=${JSON.stringify(buttons)}`);
    console.log(`  [modal ${tag}] field names=${JSON.stringify(names)}`);
  }

  /**
   * Set the "Starting at" (start_datetime) to (current form time) + `minutes`. Bases the new value on
   * the field's CURRENT value so the timezone and display format match Odoo exactly (falls back to the
   * local clock if the current value can't be parsed). Format: MM/DD/YYYY HH:mm:ss. Commits with Tab
   * (NOT Escape, which can close the whole modal on this Odoo). Returns the value written.
   */
  async setStartingAtPlusMinutes(minutes: number): Promise<string> {
    const input = this.startDatetimeInput();
    if (!(await input.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) {
      console.log('  - "Starting at" (start_datetime) not visible; skipped');
      return '';
    }
    const current = ((await input.inputValue().catch(() => '')) || '').trim();
    const m = current.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
    let base = m ? new Date(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +m[6]) : new Date();
    if (isNaN(base.getTime())) base = new Date();
    const t = new Date(base.getTime() + minutes * 60 * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    const formatted = `${p(t.getMonth() + 1)}/${p(t.getDate())}/${t.getFullYear()} ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`;
    await input.click();
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.short);
    await input.fill(formatted);
    await this.wait(CommonUtils.waitTimes.short);
    // Commit the value + close the datetime-picker overlay WITHOUT Escape (Escape can close the modal
    // here). Tab blurs the input; a click on a neutral modal area (header/title) dismisses the picker.
    await this.page.keyboard.press('Tab').catch(() => {});
    await this.openModal().locator('.modal-title, .modal-header').first().click({ force: true }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.medium);
    console.log(`  - Starting at = "${formatted}" (was "${current}", +${minutes} min)`);
    return formatted;
  }

  /**
   * Step 13: fill the "Create: Meetings" dialog.
   *  - Meeting Subject (name) - set only if provided/empty (calendar.event needs a subject to save)
   *  - Starting at           = now + startPlusMinutes (start_datetime), when provided
   *  - Meeting Platform      = "G2M"        (native <select>)
   *  - G2M Meeting room      = "Meeting link #4" (many2one, shown once platform = G2M)
   *  - Duration              = "15" minutes (native <select> name=minute_duration, shown for G2M)
   *  - Customer's Timezone   = any value    (native <select> name=tz)
   */
  async fillCreateMeeting(opts: {
    subject?: string;
    platform: string;
    g2mRoom: string;
    durationMinutes: string;
    timezone?: string;
    ticketName?: string;
    startPlusMinutes?: number;
  }): Promise<void> {
    // Diagnostic + repair: the meeting must be linked to the ticket to appear in its "L1 notes" table.
    // The Ticket field is normally pre-filled from the ticket context that opened the calendar; if it is
    // empty, link it explicitly (the ticket Display Name = its Subject).
    try {
      const tInput = this.meetingTicketInput();
      if (await tInput.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false)) {
        const tVal = await tInput.inputValue().catch(() => '');
        console.log(`  - (diagnostic) Create: Meetings Ticket = "${tVal}"`);
        if ((!tVal || !tVal.trim()) && opts.ticketName) {
          await this.setMany2One(tInput, opts.ticketName);
          console.log(`  - Ticket link set to "${opts.ticketName}" (was empty)`);
        }
      } else {
        console.log('  - (diagnostic) Ticket field not visible on the Create: Meetings form');
      }
    } catch (e) {
      console.log(`  - (diagnostic) could not read/set the Ticket link: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Meeting Subject - ensure a non-empty subject so Save succeeds.
    if (opts.subject) {
      const subj = this.meetingSubjectInput();
      if (await subj.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false)) {
        const cur = await subj.inputValue().catch(() => '');
        if (!cur || !cur.trim()) {
          await subj.click();
          await subj.fill(opts.subject);
          console.log(`  - Meeting Subject = "${opts.subject}"`);
        }
      }
    }

    // Make sure the dialog is editable first (the existing event can still be readonly here).
    await this.ensureMeetingFormEditable();

    // Starting at = now + N minutes - set BEFORE choosing G2M: the start_datetime field is only visible
    // PRE-G2M (selecting a G2M room hides it). The picker is closed robustly inside the method, then we
    // let the form settle and re-confirm it is editable so the Platform -> G2M-room reveal is not disrupted.
    if (opts.startPlusMinutes) {
      await this.setStartingAtPlusMinutes(opts.startPlusMinutes);
      await this.wait(CommonUtils.waitTimes.long);
      await this.ensureMeetingFormEditable();
    }

    // Meeting Platform = G2M (reveals the G2M Meeting room field + the minute-based Duration select).
    const plat = this.meetingPlatformSelect();
    const platVisible = await plat.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    if (!platVisible) {
      await this.logOpenModalState('platform-missing');
      throw new Error('Meeting Platform <select> not found/visible on the meeting dialog (see the [modal platform-missing] log above for the dialog contents).');
    }
    await plat.selectOption({ label: opts.platform }).catch(async () => {
      await plat.selectOption(opts.platform);
    });
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  - Meeting Platform = "${opts.platform}"`);

    // G2M Meeting room (many2one) = "Meeting link #4" - STRICT: clears + notifies if it can't be selected.
    await this.selectG2MMeetingRoom(opts.g2mRoom);
    await this.wait(CommonUtils.waitTimes.long);

    // Duration (minute select, shown once a G2M room is bookable) = 15.
    const dur = this.durationMinuteSelect();
    if (await dur.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false)) {
      await dur.selectOption({ label: opts.durationMinutes }).catch(async () => {
        await dur.selectOption(opts.durationMinutes).catch(() => {});
      });
      console.log(`  - Duration = "${opts.durationMinutes}" minutes`);
    } else {
      console.log('  - Duration minute-select not visible (skipped)');
    }
    await this.wait(CommonUtils.waitTimes.medium);

    // Customer's Timezone (any value).
    if (opts.timezone) {
      const tz = this.timezoneSelect();
      if (await tz.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false)) {
        await tz.selectOption({ label: opts.timezone }).catch(async () => {
          await tz.selectOption({ index: 1 }).catch(() => {});
        });
        console.log(`  - Customer's Timezone = "${opts.timezone}"`);
      }
    }
    await this.wait(CommonUtils.waitTimes.medium);
  }

  /** Step 14: press SAVE on the "Create: Meetings" dialog and wait for it to close. */
  async saveMeeting(): Promise<void> {
    // Blur any open autocomplete/select so the Save click is not intercepted (Tab, not Escape).
    await this.page.keyboard.press('Tab').catch(() => {});
    await this.wait(CommonUtils.waitTimes.short);
    const btn = this.meetingSaveButton();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await this.openModal().waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.savingPage }).catch(() => {});
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  - "Create: Meetings" saved');
  }
}
