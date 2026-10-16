import { CommonUtils } from '@/helpers/common.utils';
import { BasePage } from './BasePage';

/** One DataTables table on a dashboard, as the regression checks read it. */
export interface DataTableSummary {
  /** The table's id attribute, or '(no id)'. */
  id: string;
  /** The column header texts, in order. */
  headers: string[];
  /** The DataTables sorting class on each header, in order (e.g. 'sorting', 'sorting_asc'). */
  headerSortClasses: string[];
  /** Rows currently rendered in tbody (the page, not the whole data set). */
  renderedRows: number;
  /** The ".dataTables_info" line, e.g. "Showing 1 to 10 of 67 entries". */
  infoText: string;
  /** The values offered by the "Show N entries" select. */
  lengthOptions: string[];
  /** Whether each injected control is present. */
  hasLengthMenu: boolean;
  hasSearchBox: boolean;
  hasPagination: boolean;
  hasInfoLine: boolean;
  /** The page links the paginator offers, e.g. ["Previous","1","2","Next"]. */
  pageButtons: string[];
  /** The "No data available in table" cell when the table has no rows, else ''. */
  emptyMessage: string;
}

/** A rectangle on screen, rounded to whole pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The styling facts a "Bootstrap 4 compiled -> plain CSS" delivery change could break.
 *
 * Measured rather than eyeballed: each field below is a thing that goes wrong SILENTLY when a
 * stylesheet rule is dropped - the table keeps working, the assertions on counts and ordering
 * keep passing, and only the look is wrong. That is the regression CRM-12630 D.4 is about.
 */
export interface DataTablesStyling {
  /** CSS rules whose selector mentions the library, across every readable stylesheet. */
  cssRulesForDataTables: number;
  stylesheetsRead: number;
  /** Cross-origin stylesheets the browser would not let us read - they are NOT counted above. */
  stylesheetsBlocked: number;
  hasDataTable: boolean;
  tableId: string;
  tableClass: string;
  /** Where DataTables places the four controls it injects, relative to the viewport. */
  regions: { length: Rect | null; filter: Rect | null; info: Rect | null; paginate: Rect | null };
  /** The sort arrows, which are drawn by CSS pseudo-element content - not by markup. */
  sortGlyph: {
    thClass: string;
    beforeContent: string;
    afterContent: string;
    cursor: string;
  };
  header: { borderBottomWidth: string; fontWeight: string; paddingTop: string };
  cell: { fontSize: string; fontFamily: string; paddingTop: string };
  overflow: {
    tableScrollWidth: number;
    tableClientWidth: number;
    parentClientWidth: number;
    docScrollWidth: number;
    docClientWidth: number;
  };
}

/** A plain HTML table - one DataTables did NOT take over. */
export interface PlainTableSummary {
  id: string;
  cssClass: string;
  headerCells: number;
  bodyRows: number;
  visible: boolean;
  drivenByDataTables: boolean;
}

/**
 * Page Object - internal back-office dashboards that render a jQuery DataTables table.
 *
 * Used by the CRM-8339 security checks (pen test finding 5.9 - vulnerable JS library):
 * the version checks (CRM-8336_US3.9 / US3.10) and the post-upgrade regression across the
 * reachable dashboard screens (CRM-8339_2.x).
 *
 * The dashboards are Odoo CLIENT actions, so they are reached by action id rather than by a
 * menu walk: the menu path a human uses is named in the spec's step label, and the id below
 * is what that menu entry actually opens.
 *
 * Action ids read from ir.ui.menu on pre-production (2026-09-25, re-confirmed 2026-10-13):
 *   2311 - Helpdesk > Reporting > Tickets per product line        (menu 858)
 *   1945 - Helpdesk > Reporting > Time escalated                  (menu 759)
 *   2247 - Contacts > Reporting > Outside and Inside CM team      (menu 842)
 *   2177 - Contractors > Ranking > HR Contractors Ranking Report  (menu 837)
 *   1135 - Reports > Sales                                        (menu 591)
 *   2235 - Reports > Sales Won/Lost                               (menu 841)
 */
export class DataTablesDashboardPage extends BasePage {
  // ---------------------------------------------------------------------------
  // Locators - XPath primary, CSS fallback
  // ---------------------------------------------------------------------------

  /** The table DataTables has taken over (it adds the "dataTable" class on initialisation). */
  private readonly dataTable_dashboard = () =>
    this.page
      .locator('xpath=//table[contains(@class,"dataTable")]')
      .or(this.page.locator('table.dataTable'))
      .first();

  /** The wrapper DataTables injects around the table - proof the library actually ran. */
  private readonly dataTablesWrapper_dashboard = () =>
    this.page
      .locator('xpath=//div[contains(@class,"dataTables_wrapper")]')
      .or(this.page.locator('.dataTables_wrapper'))
      .first();

  /** The search box DataTables injects above the table. */
  private readonly dataTablesSearchInput_dashboard = () =>
    this.page
      .locator('xpath=//div[contains(@class,"dataTables_filter")]//input')
      .or(this.page.locator('.dataTables_filter input'))
      .first();

  /** The pagination control DataTables injects below the table. */
  private readonly dataTablesPaginate_dashboard = () =>
    this.page
      .locator('xpath=//div[contains(@class,"dataTables_paginate")]')
      .or(this.page.locator('.dataTables_paginate'))
      .first();

  /** The "Show N entries" select DataTables injects above the table. */
  private readonly dataTablesLengthSelect_dashboard = () =>
    this.page
      .locator('xpath=//div[contains(@class,"dataTables_length")]//select')
      .or(this.page.locator('.dataTables_length select'))
      .first();

  /** A column header of the table under test. */
  private readonly columnHeader_dashboard = (index: number) =>
    this.page
      .locator(`xpath=(//table[contains(@class,"dataTable")])[1]/thead/tr/th[${index + 1}]`)
      .or(this.page.locator(`table.dataTable thead th`).nth(index))
      .first();

  /** The paginator's "Next" link. */
  private readonly paginateNext_dashboard = () =>
    this.page
      .locator('xpath=//a[contains(@class,"paginate_button") and contains(@class,"next")]')
      .or(this.page.locator('.dataTables_paginate .next'))
      .first();

  /** The first data row of the table under test. */
  private readonly firstDataRow_dashboard = () =>
    this.page
      .locator('xpath=(//table[contains(@class,"dataTable")])[1]/tbody/tr[1]')
      .or(this.page.locator('table.dataTable tbody tr').first())
      .first();

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Open a dashboard client action and wait until Odoo has finished loading it.
   *
   * @param baseUrl  pre-production base URL, from `@config/users.config`
   * @param actionId the client-action id behind the dashboard's menu entry
   */
  async openDashboardByActionId(baseUrl: string, actionId: number): Promise<void> {
    await this.page.goto(`${baseUrl}web#action=${actionId}`, {
      waitUntil: 'domcontentloaded',
      timeout: CommonUtils.waitTimes.pageLoad,
    });
    await CommonUtils.waitForSpinnersToHide(
      this.page,
      CommonUtils.waitTimes.extraLong,
      CommonUtils.waitTimes.pageLoad
    ).catch(() => {});
  }

  /**
   * Wait until DataTables has initialised a table on the open dashboard.
   * The dashboards fetch their rows over RPC after the view renders, so the table element
   * exists before the library has taken it over - waiting on the injected wrapper is what
   * proves the library ran, not just that a <table> tag is on the page.
   */
  async waitForDataTableToRender(): Promise<void> {
    await this.dataTablesWrapper_dashboard().waitFor({
      state: 'visible',
      timeout: CommonUtils.waitTimes.elementAppear,
    });
    await this.dataTable_dashboard().waitFor({
      state: 'visible',
      timeout: CommonUtils.waitTimes.abnormalWait,
    });
    await this.page.waitForTimeout(CommonUtils.waitTimes.extraLong);
  }

  /**
   * Wait for a DataTables table only if the dashboard renders one.
   * Reports > Sales renders plain tables the library never takes over, so a spec that must
   * describe what IS there cannot hard-wait on a wrapper that will never appear.
   *
   * @returns true when a DataTables wrapper rendered, false when the dashboard has none.
   */
  async waitForDataTableIfPresent(): Promise<boolean> {
    const appeared = await this.dataTablesWrapper_dashboard()
      .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear })
      .then(() => true)
      .catch(() => false);
    await this.page.waitForTimeout(CommonUtils.waitTimes.extraLong);
    return appeared;
  }

  /**
   * Wait for ANY table to render, whether or not DataTables drives it.
   *
   * Reports > Sales renders plain tables the library never takes over, and it builds them slowly:
   * on 2026-10-13 two consecutive reads caught the page still showing "Trying to reconnect...".
   * Waiting on a <table> rather than on a wrapper is what lets a spec describe that screen at all.
   *
   * @returns true when a table rendered, false when none did within the budget.
   */
  async waitForAnyTableToRender(): Promise<boolean> {
    const rendered = await this.page
      .locator('xpath=//table')
      .or(this.page.locator('table'))
      .first()
      .waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.elementAppear })
      .then(() => true)
      .catch(() => false);
    await this.page.waitForTimeout(CommonUtils.waitTimes.extraLong);
    return rendered;
  }

  /**
   * The date-range inputs that belong to the TABLE, not to the charts above it.
   *
   * These dashboards filter by a date period and several of them default to a period that holds no
   * rows - Time escalated opens on "this quarter" and HR Contractors Ranking on "this month", both
   * empty on pre-production while the same screens hold hundreds of rows in other periods. The
   * period is driven by Odoo datepicker inputs, and a screen can carry several pairs (one per
   * widget), so the pair is identified by DOM position: the last two datepickers that appear
   * BEFORE the DataTables wrapper are the ones the table reads.
   *
   * @returns the current values of that pair, newest-to-the-table first, or [] when none exist.
   */
  async getTableDateRangeInputs(): Promise<string[]> {
    return this.page.evaluate(() => {
      const wrapper = document.querySelector('.dataTables_wrapper');
      if (!wrapper) return [];
      const all = Array.from(document.querySelectorAll('input.o_datepicker_input')) as HTMLInputElement[];
      const before = all.filter(
        (i) => i.compareDocumentPosition(wrapper) & Node.DOCUMENT_POSITION_FOLLOWING
      );
      return before.slice(-2).map((i) => i.value);
    });
  }

  /**
   * Set the table's date range and wait for the dashboard to refetch.
   *
   * Odoo's datepicker commits on the input's own change event, so the value is written and the
   * event dispatched explicitly rather than typed - a keyboard entry opens the calendar overlay and
   * leaves the widget mid-edit. The wait is on the info line CHANGING, not a fixed delay: the
   * refetch goes through the dashboard's own controller route and its duration varies.
   *
   * @param startDate first date, in the format the inputs already display (e.g. '01/01/2025')
   * @param endDate   last date, same format
   * @returns true when the info line changed, false when it never did within the budget.
   */
  async setTableDateRange(startDate: string, endDate: string): Promise<boolean> {
    const infoBefore = (await this.getTableSummary()).infoText;

    await this.page.evaluate(
      ({ startDate, endDate }) => {
        const wrapper = document.querySelector('.dataTables_wrapper');
        if (!wrapper) return;
        const all = Array.from(document.querySelectorAll('input.o_datepicker_input')) as HTMLInputElement[];
        const before = all.filter(
          (i) => i.compareDocumentPosition(wrapper) & Node.DOCUMENT_POSITION_FOLLOWING
        );
        const pair = before.slice(-2);
        const values = [startDate, endDate];
        pair.forEach((input, i) => {
          input.value = values[i];
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('blur', { bubbles: true }));
        });
      },
      { startDate, endDate }
    );

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await this.page.waitForTimeout(CommonUtils.waitTimes.long);
      const info = (await this.getTableSummary()).infoText;
      if (info && info !== infoBefore) return true;
    }
    return false;
  }

  /**
   * Set a single-month period, for the dashboards whose table shows ONE month rather than a range.
   *
   * HR Contractors Ranking Report is of this kind: its pickers read "10/2026", and feeding it a
   * start/end PAIR is silently ignored - the inputs change, the table does not refetch and stays
   * empty, which reads exactly like a screen with no data. Writing the same month into every
   * picker does refetch it: 09/2025 returned 282 entries when measured on 2026-10-16.
   *
   * @param month the month in the format the inputs display, e.g. '09/2025'
   * @returns true when the info line changed, false when it never did within the budget.
   */
  async setTableMonth(month: string): Promise<boolean> {
    const infoBefore = (await this.getTableSummary()).infoText;

    await this.page.evaluate((m: string) => {
      const inputs = Array.from(
        document.querySelectorAll('input.o_datepicker_input')
      ) as HTMLInputElement[];
      inputs.forEach((input) => {
        input.value = m;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
      });
    }, month);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await this.page.waitForTimeout(CommonUtils.waitTimes.long);
      const info = (await this.getTableSummary()).infoText;
      if (info && info !== infoBefore) return true;
    }
    return false;
  }

  /** Click a column header to sort by it. Index is 0-based, left to right. */
  async clickColumnHeader(index: number): Promise<void> {
    const header = this.columnHeader_dashboard(index);
    await header.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await header.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.waitForTimeout(CommonUtils.waitTimes.long);
  }

  /** Type into the DataTables search box; the table filters as the text is entered. */
  async searchInTable(text: string): Promise<void> {
    const box = this.dataTablesSearchInput_dashboard();
    await box.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await box.fill('');
    await box.fill(text);
    await this.page.waitForTimeout(CommonUtils.waitTimes.long);
  }

  /** Empty the DataTables search box and let the table restore. */
  async clearTableSearch(): Promise<void> {
    const box = this.dataTablesSearchInput_dashboard();
    await box.fill('');
    await this.page.waitForTimeout(CommonUtils.waitTimes.long);
  }

  /**
   * Change the "Show N entries" page length.
   *
   * @param value the option value, as offered by the select (e.g. '25', '-1' for All).
   */
  async setPageLength(value: string): Promise<void> {
    const select = this.dataTablesLengthSelect_dashboard();
    await select.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await select.selectOption(value);
    await this.page.waitForTimeout(CommonUtils.waitTimes.long);
  }

  /**
   * Click the paginator's "Next".
   *
   * @returns false when Next is disabled (a single page of data), true when the click was made.
   */
  async goToNextPage(): Promise<boolean> {
    const next = this.paginateNext_dashboard();
    const visible = await next
      .isVisible({ timeout: CommonUtils.waitTimes.abnormalWait })
      .catch(() => false);
    if (!visible) return false;
    const cls = (await next.getAttribute('class')) ?? '';
    if (cls.includes('disabled')) return false;
    await next.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.waitForTimeout(CommonUtils.waitTimes.long);
    return true;
  }

  /** Click the first data row - the path that opens the ticket list from a dashboard row. */
  async clickFirstDataRow(): Promise<void> {
    const row = this.firstDataRow_dashboard();
    await row.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await row.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await CommonUtils.waitForSpinnersToHide(
      this.page,
      CommonUtils.waitTimes.extraLong,
      CommonUtils.waitTimes.pageLoad
    ).catch(() => {});
    await this.page.waitForTimeout(CommonUtils.waitTimes.extraLong);
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  /**
   * The DataTables version the browser is actually executing, i.e. what a tester reads by
   * typing `$.fn.dataTable.version` in the DevTools console.
   *
   * @returns the version string, or '(library not loaded)' when jQuery / DataTables is absent.
   */
  async getDataTableVersion(): Promise<string> {
    return this.page.evaluate(() => {
      const jq = (window as any).$;
      if (!jq || !jq.fn || !jq.fn.dataTable) return '(library not loaded)';
      const v = jq.fn.dataTable.version;
      return v === undefined ? '(undefined)' : String(v);
    });
  }

  /**
   * The DataTables downloader-builder tag, i.e. `$.fn.dataTable.ext.builder`.
   *
   * NOTE (pre-production, 2026-09-25): on 1.10.21 this property does NOT exist and the console
   * answers `undefined`. It only becomes a usable marker once the library is updated, so it is
   * an "after" signal and cannot serve as a "before" one.
   *
   * @returns the builder tag, or '(undefined)' when the property is absent.
   */
  async getDataTableBuilderTag(): Promise<string> {
    return this.page.evaluate(() => {
      const jq = (window as any).$;
      if (!jq || !jq.fn || !jq.fn.dataTable || !jq.fn.dataTable.ext) return '(library not loaded)';
      const b = jq.fn.dataTable.ext.builder;
      return b === undefined ? '(undefined)' : String(b);
    });
  }

  /** The id attribute of the table DataTables took over - identifies which dashboard table ran. */
  async getRenderedDataTableId(): Promise<string> {
    const id = await this.dataTable_dashboard().getAttribute('id');
    return id ?? '(no id)';
  }

  /** How many tables on this page DataTables has initialised. */
  async getInitialisedTableCount(): Promise<number> {
    return this.page.evaluate(() => document.querySelectorAll('table.dataTable').length);
  }

  /**
   * Whether the three controls DataTables injects are on screen. Their presence is what shows
   * the library is in real use on this dashboard rather than merely loaded into the bundle.
   */
  async areTableControlsVisible(): Promise<{ wrapper: boolean; searchBox: boolean; pagination: boolean }> {
    return {
      wrapper: await this.dataTablesWrapper_dashboard().isVisible({
        timeout: CommonUtils.waitTimes.abnormalWait,
      }),
      searchBox: await this.dataTablesSearchInput_dashboard().isVisible({
        timeout: CommonUtils.waitTimes.abnormalWait,
      }),
      pagination: await this.dataTablesPaginate_dashboard().isVisible({
        timeout: CommonUtils.waitTimes.abnormalWait,
      }),
    };
  }

  /**
   * Everything the regression needs to describe one DataTables table in one read: its headers,
   * their sorting classes, the rendered rows, the info line and which injected controls exist.
   *
   * @param tableIndex which DataTables table on the page (0-based); dashboards that hold several
   *                   tables are read one index at a time.
   */
  async getTableSummary(tableIndex: number = 0): Promise<DataTableSummary> {
    return this.page.evaluate((idx: number) => {
      const table = document.querySelectorAll('table.dataTable')[idx] as HTMLTableElement | undefined;
      const empty: DataTableSummary = {
        id: '(no table)',
        headers: [],
        headerSortClasses: [],
        renderedRows: 0,
        infoText: '',
        lengthOptions: [],
        hasLengthMenu: false,
        hasSearchBox: false,
        hasPagination: false,
        hasInfoLine: false,
        pageButtons: [],
        emptyMessage: '',
      };
      if (!table) return empty;
      const wrap = table.closest('.dataTables_wrapper');
      const ths = Array.from(table.querySelectorAll('thead th')) as HTMLElement[];
      const bodyRows = Array.from(table.querySelectorAll('tbody tr')) as HTMLElement[];
      const emptyCell = table.querySelector('tbody td.dataTables_empty') as HTMLElement | null;
      return {
        id: table.id || '(no id)',
        headers: ths.map((th) => (th.innerText || '').trim()),
        headerSortClasses: ths.map((th) => th.className),
        renderedRows: emptyCell ? 0 : bodyRows.length,
        infoText: ((wrap?.querySelector('.dataTables_info') as HTMLElement)?.innerText || '').trim(),
        lengthOptions: Array.from(
          wrap?.querySelectorAll('.dataTables_length select option') ?? []
        ).map((o: any) => String(o.value)),
        hasLengthMenu: !!wrap?.querySelector('.dataTables_length select'),
        hasSearchBox: !!wrap?.querySelector('.dataTables_filter input'),
        hasPagination: !!wrap?.querySelector('.dataTables_paginate'),
        hasInfoLine: !!wrap?.querySelector('.dataTables_info'),
        pageButtons: Array.from(wrap?.querySelectorAll('.dataTables_paginate a') ?? []).map((a: any) =>
          (a.innerText || '').trim()
        ),
        emptyMessage: (emptyCell?.innerText || '').trim(),
      } as DataTableSummary;
    }, tableIndex);
  }

  /**
   * The rendered values of one column, top to bottom - the input to a sort assertion.
   *
   * @param columnIndex 0-based column, left to right.
   */
  async getColumnValues(columnIndex: number, tableIndex: number = 0): Promise<string[]> {
    return this.page.evaluate(
      ({ columnIndex, tableIndex }) => {
        const table = document.querySelectorAll('table.dataTable')[tableIndex] as
          | HTMLTableElement
          | undefined;
        if (!table) return [];
        if (table.querySelector('tbody td.dataTables_empty')) return [];
        return Array.from(table.querySelectorAll('tbody tr')).map((tr: any) => {
          const cell = tr.querySelectorAll('td')[columnIndex];
          return cell ? (cell.innerText || '').trim() : '';
        });
      },
      { columnIndex, tableIndex }
    );
  }

  /**
   * Every plain <table> on the dashboard and whether DataTables drives it. Reports > Sales
   * renders tables the library never takes over, and a regression there has to state that
   * rather than hard-fail on a missing wrapper.
   */
  async getPlainTableSummaries(): Promise<PlainTableSummary[]> {
    return this.page.evaluate(() =>
      Array.from(document.querySelectorAll('table')).map((t: any) => ({
        id: t.id || '(no id)',
        cssClass: t.className,
        headerCells: t.querySelectorAll('thead th').length,
        bodyRows: t.querySelectorAll('tbody tr').length,
        visible: (t as HTMLElement).offsetParent !== null,
        drivenByDataTables: t.classList.contains('dataTable'),
      }))
    );
  }

  /**
   * Any control on the dashboard that offers an export / download of the table.
   *
   * Measured on pre-production 2026-10-13: these dashboards ship NO export control at all -
   * the DataTables Buttons extension is not loaded and the control panel is empty - so this
   * returns an empty list. It is read rather than assumed so a later build that adds one is
   * noticed instead of silently skipped.
   */
  async getExportControls(): Promise<string[]> {
    return this.page.evaluate(() => {
      const found = new Set<string>();
      document
        .querySelectorAll('.dt-buttons button, .dt-button, button, a.btn, .btn, .dropdown-item')
        .forEach((b: any) => {
          const text = (b.innerText || b.title || '').trim();
          if (text && text.length < 60 && /csv|export|excel|download|xls/i.test(text)) {
            found.add(text);
          }
        });
      return Array.from(found);
    });
  }

  /**
   * What the DataTables search box currently holds.
   *
   * On a dashboard with no rows the info line cannot evidence that the search ran - DataTables
   * omits its "(filtered from N total entries)" clause entirely when the table has 0 records - so
   * the input's own value is what shows the box accepted the text.
   */
  async getSearchBoxValue(): Promise<string> {
    return this.dataTablesSearchInput_dashboard().inputValue({
      timeout: CommonUtils.waitTimes.abnormalWait,
    });
  }

  /** The breadcrumb / control-panel title after a row click, to show where the row led. */
  async getCurrentViewTitle(): Promise<string> {
    return this.page.evaluate(() => {
      const bc = document.querySelector('.breadcrumb, .o_control_panel .o_cp_title') as HTMLElement | null;
      const text = (bc?.innerText || '').replace(/\s+/g, ' ').trim();
      return text || document.title;
    });
  }

  /** How many rows the Odoo list view that a row click opened is showing. */
  async getOdooListRowCount(): Promise<number> {
    return this.page.evaluate(
      () => document.querySelectorAll('.o_list_view tbody tr.o_data_row').length
    );
  }

  /**
   * Read every styling fact the D.4 visual check scores, in one pass.
   *
   * Grounded on pre-production 2026-10-14 against DataTables 1.13.11: 57 rules carrying a
   * `.dataTables_wrapper` / `table.dataTable` selector across 10 readable stylesheets, the sort
   * arrows drawn as pseudo-element content "▲" / "▼", the length menu and search box on one row
   * above the table and the info line and paginator on one row below it.
   */
  async getStylingFacts(): Promise<DataTablesStyling> {
    return this.page.evaluate(() => {
      const rect = (el: Element | null): Rect | null => {
        if (!el) return null;
        const b = (el as HTMLElement).getBoundingClientRect();
        return {
          x: Math.round(b.x),
          y: Math.round(b.y),
          w: Math.round(b.width),
          h: Math.round(b.height),
        };
      };
      const prop = (el: Element | null, name: string, pseudo?: string): string =>
        el ? getComputedStyle(el as HTMLElement, pseudo).getPropertyValue(name) : '';

      const dtTable = document.querySelector('table.dataTable') as HTMLTableElement | null;
      const wrap = dtTable?.closest('.dataTables_wrapper') as HTMLElement | null;
      const table = (dtTable ?? document.querySelector('table')) as HTMLTableElement | null;
      const ths = Array.from(table?.querySelectorAll('thead th') ?? []) as HTMLElement[];
      const sortableTh = ths.find((t) => /sorting/.test(t.className)) ?? ths[0] ?? null;
      const firstCell = table?.querySelector('tbody td') ?? null;

      let cssRulesForDataTables = 0;
      let stylesheetsRead = 0;
      let stylesheetsBlocked = 0;
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const rules = (sheet as CSSStyleSheet).cssRules;
          stylesheetsRead += 1;
          for (const rule of Array.from(rules)) {
            const selector = (rule as any).selectorText || '';
            if (/dataTables_wrapper|table\.dataTable/.test(selector)) cssRulesForDataTables += 1;
          }
        } catch {
          stylesheetsBlocked += 1;
        }
      }

      return {
        cssRulesForDataTables,
        stylesheetsRead,
        stylesheetsBlocked,
        hasDataTable: !!dtTable,
        tableId: table?.id || '(no id)',
        tableClass: table?.className ?? '',
        regions: {
          length: rect(wrap?.querySelector('.dataTables_length') ?? null),
          filter: rect(wrap?.querySelector('.dataTables_filter') ?? null),
          info: rect(wrap?.querySelector('.dataTables_info') ?? null),
          paginate: rect(wrap?.querySelector('.dataTables_paginate') ?? null),
        },
        sortGlyph: {
          thClass: sortableTh?.className ?? '',
          beforeContent: prop(sortableTh, 'content', '::before'),
          afterContent: prop(sortableTh, 'content', '::after'),
          cursor: prop(sortableTh, 'cursor'),
        },
        header: {
          borderBottomWidth: prop(ths[0] ?? null, 'border-bottom-width'),
          fontWeight: prop(ths[0] ?? null, 'font-weight'),
          paddingTop: prop(ths[0] ?? null, 'padding-top'),
        },
        cell: {
          fontSize: prop(firstCell, 'font-size'),
          fontFamily: prop(firstCell, 'font-family'),
          paddingTop: prop(firstCell, 'padding-top'),
        },
        overflow: {
          tableScrollWidth: table?.scrollWidth ?? 0,
          tableClientWidth: table?.clientWidth ?? 0,
          parentClientWidth: (table?.parentElement as HTMLElement)?.clientWidth ?? 0,
          docScrollWidth: document.documentElement.scrollWidth,
          docClientWidth: document.documentElement.clientWidth,
        },
      } as DataTablesStyling;
    });
  }

  /** CSS selector of the DataTables wrapper, for `captureVerifyEvidence({ highlight })`. */
  static readonly WRAPPER_SELECTOR = '.dataTables_wrapper';
}
