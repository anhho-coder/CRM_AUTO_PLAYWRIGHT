import { BasePage } from '@pages';
import { baseUrl_mig } from '@config/users.config';
import { CommonUtils } from '@helpers/common.utils';

export interface VersionInfo {
  server_version: string;
  server_version_info: Array<number | string>;
  server_serie: string;
  protocol_version?: number;
}
export interface ModuleInfo { name: string; state: string; }

/**
 * Platform-verification helpers for the O12 Migration server (crm-mig.nakivo.site).
 *
 * The version + module-state facts (edition, "no Enterprise installed", "no module stuck in a
 * transient state") are read via the AUTHENTICATED web-client session - the same JSON-RPC the Odoo
 * Apps / Settings > Technical > Modules screens use to render. This is deterministic; scraping the
 * kanban/list UI is not (and the Mig instance is debranded - `nakivo_debrand` - so the CE "Upgrade to
 * Enterprise" banner marker is unreliable). App opens use URL hashes (theme-agnostic; the Mig sidebar
 * theme hides the navbar). Used by the CRM-12325 Part-2 checks.
 */
export class MigPlatformPage extends BasePage {
  /**
   * Mig app URL hashes - RE-MEASURED 2026-09-15 against the live registry.
   *
   * WHY THIS WAS REWRITTEN. The crm-mig instance was rebuilt between 2026-08-24 and 2026-09-15 and
   * the rebuild RE-SEQUENCED `ir.ui.menu` and `ir.actions.*` ids. The previous map was discovered
   * before that, so it had gone stale in the worst possible way - silently. Measured by calling
   * `/web/action/load` on every action id in the old map:
   *
   *   * **13 of 25 action ids no longer existed at all.** `/web/action/load` returns `false`, and
   *     the web client answers a missing action with the generic `Odoo Client Error - An error
   *     occurred` dialog. (approval 509, myDashboard 567, portal 578, licenseManagement 602,
   *     reports 4165, salesReport 4212, kpi 4221, contractors 514, customerActivities 4286,
   *     nakivoApi 4293, investments 4344, serverCapacity 4820, reTimeTracking 4594.)
   *   * **6 more resolved to the WRONG SCREEN**: contacts 159 was now "Job Positions" (`hr.job`),
   *     sales 341 "Send an email" (`mail.compose.message`), calendar 157 "Subordinate Hierarchy"
   *     (`hr.employee`), jobQueue 109 "Unit of Measure Categories" (`uom.category`), invoicing 313
   *     "Analytic Accounts", activecampaign 124 the Discuss client action. `crm` 185 had become an
   *     `ir.actions.report` ("Pricelist") and `website` 366 a server action ("Config: Choose Your
   *     Theme").
   *   * Only `settings`, `apps` and `subscriptions` still named the right thing.
   *
   * That is the whole explanation for the CRM-12326_3.7.2 app walk reporting "20 of 27 apps raise
   * an error dialog" with 19 of them showing only the outer "An error occurred" shell: the walk was
   * opening dead URLs. Those 19 were an automation defect, not a product defect - so do NOT raise a
   * bug for them. (CRM-12656, "the remote instance has no browser origin configured ... Odoo 19
   * URL", is a separate and genuine dialog raised on a screen that did load.)
   *
   * HOW THIS MAP IS NOW DERIVED, so it can be re-derived after the next rebuild: for each of the 24
   * root `ir.ui.menu` records, take the menu's own `action` when it has one, otherwise walk down to
   * the first descendant that carries an action - that is the screen a user actually lands on when
   * they click the app. Every entry below was then confirmed with `/web/action/load`: **24 of 24
   * load, and each resolves to the semantically correct screen.**
   */
  static readonly HASH = {
    // CRM: root menu 216 has its own server action ("Crm: My Pipeline").
    crm:                '#menu_id=216&action_id=347',
    contacts:           '#menu_id=111&action_id=149',
    // Business screens used by the section-II main-business smoke (re-measured 2026-09-15):
    // CRM > Leads > Leads = menu 229 / act_window 345 (crm.lead, domain type=lead, tree first);
    // CRM > Sales > All Pipeline = menu 1308 / act_window 1705 (domain type=opportunity), opened
    // straight into its LIST view = the pre-prod "click at view list" step, without depending on
    // the theme's view-switcher buttons.
    leads:              '#menu_id=229&action_id=345',
    opportunitiesList:  '#action=1705&model=crm.lead&view_type=list&menu_id=1308',
    contactsList:       '#action=149&model=res.partner&view_type=list&menu_id=111',
    sales:              '#menu_id=253&action_id=385',
    settings:           '#menu_id=62&action_id=77',
    apps:               '#menu_id=45&action_id=32',
    // Other sidebar apps - CRM-12325 Part 2-A "main apps open cleanly"
    discuss:            '#menu_id=98&action_id=124',
    investments:        '#menu_id=1369&action_id=1861',
    calendar:           '#menu_id=106&action_id=147',
    website:            '#menu_id=332&action_id=536',
    jobQueue:           '#menu_id=136&action_id=186',
    activecampaign:     '#menu_id=150&action_id=215',
    approval:           '#menu_id=347&action_id=546',
    myDashboard:        '#menu_id=447&action_id=738',
    // Portal is an ir.actions.act_url - it navigates OUT of the web client, so a caller must not
    // wait for an Odoo action view to render.
    portal:             '#menu_id=395&action_id=642',
    licenseManagement:  '#menu_id=462&action_id=763',
    reports:            '#menu_id=1323&action_id=1784',
    salesReport:        '#menu_id=1357&action_id=1839',
    kpi:                '#menu_id=1382&action_id=2011',
    invoicing:          '#menu_id=214&action_id=323',
    contractors:        '#menu_id=128&action_id=156',
    customerActivities: '#menu_id=1342&action_id=1810',
    nakivoApi:          '#menu_id=1353&action_id=1817',
    // Server Capacity is NO LONGER A TOP-LEVEL APP on this base - it now sits at
    // Contacts > NAKIVO BaaS > Server Capacity (menu 1410 / act_window 2057). The screen still
    // opens; its demotion out of the app list is an app-parity fact for CRM-12326_3.7.1.
    serverCapacity:     '#menu_id=1410&action_id=2057',
    subscriptions:      '#menu_id=1437&action_id=2106',
    // New root menu on this base, absent from the old map: Global Search (sync_global_search).
    globalSearch:       '#menu_id=1439&action_id=2108',
    // KEPT ONLY SO EXISTING SPECS STILL COMPILE - see ABSENT_ON_MIG below. There is no live menu or
    // action for it, so opening this hash WILL raise an Odoo error dialog. That is the truth about
    // the instance, not a bug in the spec that opens it.
    reTimeTracking:     '#menu_id=2279&action_id=4594',
  };

  /**
   * Apps that exist in HASH but have NO live menu on crm-mig as of 2026-09-15.
   *
   * A spec that walks one of these should report it as ABSENT rather than opening the hash and
   * charging the resulting error dialog to the product. Measured: no `ir.ui.menu` row matches
   * "time"/"tracking" anywhere in the tree, at any depth.
   */
  static readonly ABSENT_ON_MIG: readonly string[] = ['reTimeTracking'];

  // Locators
  private readonly renderedView = () =>
    this.page.locator('.o_list_view, .o_kanban_view, .o_form_view, .o_setting_container, .o_web_settings_dashboard').first();
  /**
   * Any Odoo error dialog - CLIENT error, SERVER error or a raised Warning.
   *
   * The first version matched only `.o_error_dialog`, a modal containing "Traceback", and the title
   * "Odoo Client Error". That missed the "Odoo Server Error - Warning" dialog entirely: it carries no
   * traceback and its title says *Server*, so `isErrorDialogVisible()` answered false while a dialog
   * was plainly on screen (seen 2026-09-15 on CRM and on the Users form - "The remote instance has no
   * browser origin configured"). A missed dialog is worse than a noisy one here, because the app walk
   * then reports a broken screen as clean, so the text filter below is deliberately as broad as the
   * one BasePage already uses.
   */
  private readonly errorDialog = () =>
    this.page.locator('.o_error_dialog')
      .or(this.page.locator('.modal-dialog:has-text("Traceback")'))
      .or(this.page.locator('.modal, .o_dialog').filter({
        hasText: /Odoo Client Error|Odoo Server Error|error occurred|Traceback|does not exist|Missing Record|has been deleted/i,
      }))
      .first();
  private readonly createButton = () =>
    this.page.locator('xpath=//button[contains(@class,"o_list_button_add") or normalize-space()="CREATE" or normalize-space()="Create"]').first();
  private readonly nameInput = () =>
    this.page.locator('.o_form_view .o_field_widget[name="name"] input').or(this.page.locator('input[name="name"]')).first();
  private readonly saveButton = () =>
    this.page.locator('xpath=//button[contains(@class,"o_form_button_save")]').first();

  /** Server version_info via the authenticated web-client session (same source the UI reads). */
  async getServerVersionInfo(): Promise<VersionInfo> {
    return await this.page.evaluate(async () => {
      const r = await fetch('/web/webclient/version_info', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: {} }),
      });
      return (await r.json()).result;
    });
  }

  /** All modules with their install state (the registry Apps / Settings>Technical>Modules display). */
  async getModules(): Promise<ModuleInfo[]> {
    return await this.page.evaluate(async () => {
      const r = await fetch('/web/dataset/call_kw', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: {
          model: 'ir.module.module', method: 'search_read',
          args: [[], ['name', 'state']], kwargs: { limit: 2000 },
        } }),
      });
      const j = await r.json();
      return j.result || [];
    });
  }

  /**
   * Generic authenticated `call_kw` - the same JSON-RPC the web client issues to render a screen.
   *
   * Section III leans on this: the cut-off is a DECLARATION-layer question, and the facts it asks
   * about - which module declares what, which view resolves, which object a module owns - live in the
   * registry, not on a screen. An Odoo-side error is re-thrown rather than swallowed so a spec fails
   * loudly instead of quietly asserting against `undefined`.
   */
  async callKw<T = any>(model: string, method: string, args: any[] = [], kwargs: Record<string, any> = {}): Promise<T> {
    return await this.page.evaluate(async ({ model, method, args, kwargs }) => {
      const r = await fetch('/web/dataset/call_kw', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } }),
      });
      const j = await r.json();
      if (j.error) {
        const d = j.error.data || {};
        throw new Error(String(d.message || j.error.message || 'rpc error').slice(0, 400));
      }
      return j.result;
    }, { model, method, args, kwargs });
  }

  /**
   * Which records of `targetModel` the given modules OWN, via `ir.model.data`.
   *
   * `ir.model.data` is the only join table that answers "who created this object". A module's name on
   * a view or an action is not stored on the record itself, so ownership questions - "does anything
   * this module owns still work" - have to go through here.
   *
   * @returns res_id -> owning module name
   */
  async ownedRecordIds(targetModel: string, moduleNames: string[]): Promise<Map<number, string>> {
    if (!moduleNames.length) return new Map();
    const rows: Array<{ res_id: number; module: string }> = await this.callKw(
      'ir.model.data', 'search_read',
      [[['model', '=', targetModel], ['module', 'in', moduleNames]], ['module', 'res_id']],
      { limit: 8000 },
    );
    return new Map(rows.map((r) => [r.res_id, r.module]));
  }

  /**
   * Fetch a path over the authenticated session and report how it answered.
   *
   * Used for addons-path probes: a module's static files only resolve while its directory is on the
   * path, so a 404 on `/<module>/static/...` is evidence the code is gone and only the
   * `ir.module.module` metadata row survives. Note the caveat - that path also 404s when the module is
   * present but simply has no such file, so a 404 alone never proves absence on its own.
   */
  async probe(path: string): Promise<{ status: number; contentType: string; bytes: number }> {
    return await this.page.evaluate(async (p) => {
      try {
        const res = await fetch(p);
        const body = await res.arrayBuffer();
        return { status: res.status, contentType: res.headers.get('content-type') || '', bytes: body.byteLength };
      } catch (e) {
        return { status: -1, contentType: String((e as Error).message).slice(0, 120), bytes: 0 };
      }
    }, path);
  }

  /**
   * How long one action gets to reach a terminal state.
   *
   * Deliberately NOT `waitTimes.pageLoad` (240 s): a screen that has painted nothing in 90 s is a
   * finding, and a 4-minute hang would only time the whole test out with no evidence attached.
   */
  private static readonly ACTION_READY_TIMEOUT_MS = 90000;

  /**
   * Wait until an opened action has actually finished loading.
   *
   * WHY THIS WAS REWRITTEN (2026-09-15). The previous version waited for the URL, then did
   *     page.locator('.o_loading, .oe_loading').first().waitFor({ state: 'hidden' }).catch(() => {})
   * and returned. Before Odoo's JS boots, `.o_loading` is NOT IN THE DOM AT ALL - and Playwright
   * reads "not in the DOM" as hidden, so that wait resolved INSTANTLY, against a still-white page.
   * Measured on the live instance 2026-09-15 across six app kinds: `.o_loading` only becomes visible
   * at 940-1380 ms, while the old wait returned at ~600 ms. It ran before the spinner existed, every
   * single time.
   *
   * What that cost: 13 of the 25 Part 2-A app-open specs finished their open step in 630-700 ms and
   * then read `hasError` off a blank page, so every one of them asserted nothing. CRM-12325_1.1.8
   * (R&E Time Tracking) PASSED with hasError=false although its hash has no live menu and provably
   * raises a dialog at ~2.5 s - the check simply ran 1.9 s too early. The blank "Loading" screenshots
   * in those reports were the symptom, not the defect.
   *
   * Three ordered gates, each measured rather than guessed:
   *   1. the web-client shell is up (~500 ms on every app probed). Same signal LoginPageMig uses for
   *      login success, so it is known to survive the sidebar theme. Until it is up, "no spinner"
   *      means nothing.
   *   2. a TERMINAL state is reached - any one of:
   *      a. `.o_content` has at least one rendered child. Measured 3.1 s (Discuss, `o_mail_discuss`)
   *         to 6.9 s (My Dashboard, `ks_dashboard_ninja`). `.o_content` itself appears EMPTY at ~1 s
   *         and keeps its full height while empty, so height proves nothing here - the CHILD COUNT is
   *         the discriminator.
   *      b. a dialog is visible. An action that does not exist never populates `.o_content` and
   *         raises a modal instead (reTimeTracking: modal at 2.48 s, `.o_content` never populated).
   *         Without this branch the wait would hang on exactly the screens this suite exists to catch.
   *      c. the page has LEFT the web client. Portal is an `ir.actions.act_url` and navigates the
   *         same tab to `/my` (measured - no popup), where there is no `.o_content` at all.
   *   3. only then: no RPC still in flight.
   *
   * Three traps this avoids on purpose:
   *   - `.o_action_manager` does NOT exist on the Mig sidebar theme (probed: absent on all six apps).
   *     `.o_content` is the container that does exist. `.o_view_controller` exists in the live DOM
   *     but only for standard views, so it cannot be the general signal.
   *   - the portal frontend ships PRE-RENDERED HIDDEN `.modal-dialog` nodes, so gate 2b tests
   *     VISIBILITY (client rects + computed style), never mere presence.
   *   - gate 2 polls from Node instead of `page.waitForFunction`, because Portal's navigation
   *     destroys the evaluation context mid-poll; a thrown evaluate is simply the next tick here.
   */
  private async waitForActionLoaded() {
    await this.waitForURL(/\/web[?#]/, CommonUtils.waitTimes.pageLoad);

    // Gate 1 - shell. Swallowed: an act_url may navigate out before the shell is ever asked for.
    await this.page.locator('.o_web_client').first()
      .waitFor({ state: 'visible', timeout: MigPlatformPage.ACTION_READY_TIMEOUT_MS })
      .catch(() => {});

    // Gate 2 - terminal state.
    const probeTerminalState = () => {
      const visible = (el: Element | null) =>
        !!el && (el as HTMLElement).getClientRects().length > 0 &&
        getComputedStyle(el).visibility !== 'hidden';
      // A dropped session lands on /web/login, which still starts with /web - so it is NOT treated
      // as "left the web client" and the wait fails loudly instead of passing on a login screen.
      const leftWebClient = !location.pathname.startsWith('/web');
      const dialogUp = Array.from(
        document.querySelectorAll('.modal-dialog, .o_error_dialog, .o_dialog'),
      ).some(visible);
      const content = document.querySelector('.o_content');
      return {
        ready: leftWebClient || dialogUp || (!!content && content.children.length > 0),
        leftWebClient, dialogUp,
        contentKids: content ? content.children.length : -1,
        url: location.href,
      };
    };

    const deadline = Date.now() + MigPlatformPage.ACTION_READY_TIMEOUT_MS;
    let last: ReturnType<typeof probeTerminalState> | null = null;
    let ready = false;
    while (Date.now() < deadline) {
      // null while a navigation is tearing the context down - just poll again.
      const state = await this.page.evaluate(probeTerminalState).catch(() => null);
      if (state) { last = state; if (state.ready) { ready = true; break; } }
      await this.wait(200);
    }
    if (!ready) {
      throw new Error(
        `waitForActionLoaded: the action never reached a terminal state within ` +
        `${MigPlatformPage.ACTION_READY_TIMEOUT_MS}ms. Last seen: ${JSON.stringify(last)}`,
      );
    }

    // Gate 3 - no RPC still in flight.
    await this.page.locator('.o_loading, .oe_loading').first()
      .waitFor({ state: 'hidden', timeout: MigPlatformPage.ACTION_READY_TIMEOUT_MS }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.medium);
  }

  /**
   * Build a Mig web-client URL for an app hash.
   *
   * The `?` before the `#` is REQUIRED, not cosmetic: Odoo's hash writer merges into whatever URL is
   * already loaded, so a page opened as `/web#...` keeps that shape for every later action - and the
   * shared page objects wait on the glob `**\/web?*view_type=form*`, in which Playwright treats `?` as
   * a LITERAL character. Seeding `/web?#...` (the pre-prod URL shape) makes every base page-object URL
   * wait work unchanged on the Migration server. See CRM-12370_1.x (section II) for the failure this
   * fixes: "CREATE" navigated to `/web#...view_type=form` and the wait timed out anyway.
   */
  static appUrl(hash: string): string {
    return `${baseUrl_mig}web?${hash}`;
  }

  async openAppAndAssertRendered(hash: string) {
    await this.goto(MigPlatformPage.appUrl(hash));
    await this.waitForActionLoaded();
    await this.waitForActionInUrl(hash);
  }

  /**
   * Wait until the URL actually reflects the action that was requested.
   *
   * Navigating between two `#...` hashes on the same `/web` document is a SAME-DOCUMENT change, so
   * nothing reloads and `waitForActionLoaded()` can return while the PREVIOUS screen is still in the
   * DOM. That is not a cosmetic race: the next call then inspects the old screen. It cost three
   * specs a full run on 2026-09-15 - each clicked CREATE, was handed the previous screen's hidden
   * CREATE button, and reported "failed to open the form" on screens where CREATE works perfectly.
   *
   * Odoo rewrites the hash once the action is live (`#menu_id=262&action_id=386` becomes
   * `#action=386&model=sale.order&view_type=list&menu_id=262`), so waiting for `action=<id>` is a
   * reliable signal that the router switched. Falls back to a short settle when the hash carries no
   * action id, and never throws - a timeout here should surface as the caller's own assertion.
   */
  private async waitForActionInUrl(hash: string): Promise<void> {
    const m = hash.match(/action(?:_id)?=(\d+)/);
    if (!m) { await this.wait(CommonUtils.waitTimes.medium); return; }
    const actionId = m[1];
    await this.page
      .waitForFunction(
        (id) => new RegExp(`action=${id}(?![0-9])`).test(window.location.href),
        actionId,
        { timeout: CommonUtils.waitTimes.pageLoad },
      )
      .catch(() => {});
    await this.page.locator('.o_loading, .oe_loading').first()
      .waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.medium);
  }

  /** A "reasonable time" budget (ms) for a single app/action to render - generous to avoid flakiness
   *  on a cold SPA load while still catching a hung/broken app. */
  static readonly APP_RESPONSE_BUDGET_MS = 30000;

  /** Open an app by hash, wait until its action finished loading (spinner gone), and return the
   *  elapsed load time (ms). The caller checks isErrorDialogVisible() separately, so this does NOT
   *  dismiss any error dialog. */
  async openAppAndMeasureMs(hash: string): Promise<number> {
    const start = Date.now();
    await this.goto(MigPlatformPage.appUrl(hash));
    await this.waitForActionLoaded();
    return Date.now() - start;
  }

  /**
   * Click CREATE on the open list so Odoo BUILDS the form view, then stop. Nothing is saved.
   *
   * This is how a form view is reached on crm-mig, where the read-only rule forbids creating a
   * record: pressing CREATE runs `default_get` and renders the form arch - both reads - and the
   * record only exists once SAVE is pressed, which this never does. It is the same no-save pattern
   * the k6 create-Lead script uses. Reaching the form matters because a view that references a field
   * the model no longer provides fails exactly here, on screen, where a screenshot can capture it.
   *
   * Returns false when the list offers no CREATE button at all (some Odoo actions hide it), so the
   * caller can report that rather than hang - the button is matched on the stable Odoo class
   * `o_list_button_add` first, because on the mig sidebar theme the visible label carries a leading
   * icon and an anchored text match finds nothing (the same trap as the " Save" button).
   */
  async clickCreateAndBuildForm(): Promise<boolean> {
    const btn = this.migCreateButton();
    const visible = await btn.isVisible({ timeout: CommonUtils.waitTimes.standard }).catch(() => false);
    if (!visible) return false;
    await btn.click({ timeout: CommonUtils.waitTimes.standard });
    await this.page.locator('.o_form_view, .modal-dialog').first()
      .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.medium);
    return true;
  }

  /** CREATE on a list, matched by the stable Odoo class before any label text. */
  private readonly migCreateButton = () =>
    this.page.locator('.o_list_button_add, .o_cp_buttons button.btn-primary')
      .or(this.page.locator('xpath=//button[contains(normalize-space(),"Create")]'))
      .first();

  /**
   * The text of the visible error dialog, or '' when none is up.
   *
   * A caller that only knows "a dialog appeared" cannot say WHOSE fault it is. Reading the message
   * lets a spec separate a defect in the module under test from an instance-wide condition that
   * happens to raise on every screen - and report the difference instead of blaming the module.
   */
  async getErrorDialogText(): Promise<string> {
    if (!(await this.isErrorDialogVisible())) return '';
    const raw = await this.errorDialog().innerText({ timeout: CommonUtils.waitTimes.short }).catch(() => '');
    return raw.replace(/\s+/g, ' ').trim();
  }

  /**
   * Press the dialog's "Copy the full error to clipboard" button and return what it put there.
   *
   * The dialog body only ever says "An error occurred - Please use the copy button to report the
   * error to your support service."; the stack that names the failing module sits behind that button
   * (and behind "See details"). A run that records `hasError = true` and nothing else cannot be
   * triaged at all - which is exactly where the crm-mig app-walk failures stalled - so this returns
   * the full text for the caller to attach to the report.
   *
   * Requires clipboard-read on the browser context (`grantPermissions(['clipboard-read'])`). When the
   * permission is refused, the button is absent, or the read comes back empty, it falls back to
   * expanding "See details" and reading the dialog body, so the caller gets the best text available
   * instead of nothing.
   */
  async copyFullErrorToClipboard(): Promise<string> {
    if (!(await this.isErrorDialogVisible())) return '';

    const copyButton = this.errorDialog()
      .locator('xpath=.//button[contains(., "Copy the full error to clipboard")]')
      .or(this.errorDialog().locator('button:has-text("Copy the full error")'))
      .first();

    let copied = '';
    if (await copyButton.isVisible({ timeout: CommonUtils.waitTimes.short }).catch(() => false)) {
      await copyButton.click().catch(() => {});
      await this.page.waitForTimeout(CommonUtils.waitTimes.long);
      copied = await this.page
        .evaluate(() => navigator.clipboard.readText().catch(() => ''))
        .catch(() => '');
    }

    if (!copied.trim()) {
      const seeDetails = this.errorDialog()
        .locator('xpath=.//*[self::a or self::button or self::span][contains(normalize-space(), "See details")]')
        .or(this.errorDialog().locator('text=See details'))
        .first();
      if (await seeDetails.isVisible({ timeout: CommonUtils.waitTimes.short }).catch(() => false)) {
        await seeDetails.click().catch(() => {});
        await this.page.waitForTimeout(CommonUtils.waitTimes.long);
      }
      copied = await this.errorDialog().innerText({ timeout: CommonUtils.waitTimes.short }).catch(() => '');
    }

    return copied.trim();
  }

  /** True if an Odoo client-error / traceback dialog is currently visible. */
  async isErrorDialogVisible(): Promise<boolean> {
    return await this.errorDialog().isVisible({ timeout: CommonUtils.waitTimes.short }).catch(() => false);
  }

  /**
   * NOTE on dismissing an error dialog: use the INHERITED BasePage.dismissErrorDialog() - it already
   * does this and is the one the rest of the repo calls. Dismissal matters here because an Odoo
   * client-error dialog is MODAL and SURVIVES a hash navigation, so an app walk that leaves it up
   * re-detects the same dialog on every later app. On the first CRM-12326 browser run that turned
   * 1 real failure into 7 reported ones, blaming six innocent apps.
   */

  // ---------------------------------------------------------------------------------------------
  // WRITE + TEARDOWN helpers.
  //
  // crm-mig was read-only until 2026-09-15, when the tester lifted that rule on the condition that
  // every spec removes what it creates. These helpers exist to make that condition cheap to honour:
  // a spec tags what it makes with a greppable marker, and the teardown finds the records BY THAT
  // MARKER rather than by a remembered id - so an aborted run that never reached its `afterEach`
  // still gets swept by the next `afterAll`.
  //
  // Deliberately RPC-based, not UI-based. Teardown must work even when the UI is the thing that
  // broke: a cleanup that depends on the screen under test cannot run when that screen fails, which
  // is exactly when a leftover would otherwise be created.
  // ---------------------------------------------------------------------------------------------

  /** Type a value into a form field by its Odoo `name=` attribute. */
  async fillFormField(fieldName: string, value: string): Promise<void> {
    const input = this.page
      .locator(`.o_form_view .o_field_widget[name="${fieldName}"] input`)
      .or(this.page.locator(`.o_form_view input[name="${fieldName}"]`))
      .or(this.page.locator(`.o_form_view .o_field_widget[name="${fieldName}"] textarea`))
      .first();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await input.fill(value);
    // Many2one and relational widgets commit on blur/Enter. This app has no JS autocomplete dropdown,
    // so Enter is the correct commit - never wait for an option list to render.
    await this.page.keyboard.press('Enter').catch(() => {});
    await this.wait(CommonUtils.waitTimes.short);
  }

  /**
   * Set a many2one field and VERIFY it committed.
   *
   * Typing into a many2one and pressing Enter is not reliable here: on CRM-12326_3.6.1 the customer
   * looked set (the log said so) while `partner_id` had in fact stayed empty, so the save was
   * rejected for six required fields at once - `partner_id` plus the five Odoo derives from it
   * (partner_invoice_id, partner_shipping_id, partner_end_user_id, currency_id, pricelist_id).
   * Nothing on screen said the field had not taken.
   *
   * So: type, prefer clicking a real suggestion from the dropdown, fall back to Enter, then CHECK
   * the input actually holds a value and is not flagged invalid. Returns what the field ended up
   * holding so the caller can assert rather than assume.
   */
  async setMany2One(fieldName: string, query: string): Promise<{ committed: boolean; value: string }> {
    const input = this.page
      .locator(`.o_form_view .o_field_widget[name="${fieldName}"] input`)
      .or(this.page.locator(`.o_form_view input[name="${fieldName}"]`))
      .first();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await input.click({ timeout: CommonUtils.waitTimes.standard }).catch(() => {});
    await input.fill('');
    await input.type(query.slice(0, 40), { delay: 30 });
    await this.wait(CommonUtils.waitTimes.medium);

    // Prefer a real suggestion. Skip the "Create ..." / "Search More" entries - picking those opens a
    // dialog instead of setting the value.
    const option = this.page
      .locator('.ui-autocomplete li.ui-menu-item, .o_input_dropdown li, ul.ui-autocomplete li')
      .filter({ hasNotText: /Create|Search More/i })
      .first();
    if (await option.isVisible({ timeout: CommonUtils.waitTimes.standard }).catch(() => false)) {
      await option.click({ timeout: CommonUtils.waitTimes.standard }).catch(() => {});
    } else {
      await this.page.keyboard.press('Enter').catch(() => {});
    }
    await this.wait(CommonUtils.waitTimes.medium);

    const value = ((await input.inputValue().catch(() => '')) || '').trim();
    const invalid = await this.page
      .locator(`.o_form_view .o_field_widget[name="${fieldName}"].o_field_invalid`)
      .first().isVisible({ timeout: CommonUtils.waitTimes.short }).catch(() => false);
    return { committed: value.length > 0 && !invalid, value };
  }

  /**
   * Fill a field that may live on a notebook page which is not the one currently open.
   *
   * An Odoo form hides every notebook page except the active one, so a plain `fill()` on a field
   * such as `client_order_ref` (Sales > Other Information) waits for a permanently-hidden element
   * until the test times out. That is what hung CRM-12326_3.6.1 for the full 240s. This clicks
   * through the notebook tabs until the field becomes visible, then fills it.
   */
  async fillFormFieldAnyTab(fieldName: string, value: string): Promise<boolean> {
    const target = this.page.locator(`.o_form_view .o_field_widget[name="${fieldName}"]`).first();
    if (await target.isVisible({ timeout: CommonUtils.waitTimes.short }).catch(() => false)) {
      await this.fillFormField(fieldName, value);
      return true;
    }
    const tabs = this.page.locator('.o_notebook .nav-link, .o_notebook li > a');
    const count = await tabs.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      await tabs.nth(i).click({ timeout: CommonUtils.waitTimes.standard }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.short);
      if (await target.isVisible({ timeout: CommonUtils.waitTimes.short }).catch(() => false)) {
        await this.fillFormField(fieldName, value);
        return true;
      }
    }
    return false;
  }

  /**
   * Add one line to a one2many editable list on the open form (e.g. a Quotation's order lines).
   *
   * Returns false when the list offers no "Add a line" control, so a caller can report that instead
   * of hanging. Kept generic: the o2m field name and the column field names are the caller's.
   */
  async addOneToManyLine(
    o2mFieldName: string,
    cells: Array<{ field: string; value: string }>,
  ): Promise<boolean> {
    const list = this.page.locator(`.o_form_view .o_field_widget[name="${o2mFieldName}"]`).first();
    if (!(await list.isVisible({ timeout: CommonUtils.waitTimes.standard }).catch(() => false))) return false;
    const addLink = list
      .locator('a.o_field_x2many_list_row_add, .o_field_x2many_list_row_add a')
      .or(list.locator('xpath=.//a[contains(normalize-space(),"Add a line")]'))
      .first();
    if (!(await addLink.isVisible({ timeout: CommonUtils.waitTimes.standard }).catch(() => false))) return false;
    await addLink.click({ timeout: CommonUtils.waitTimes.standard });
    await this.wait(CommonUtils.waitTimes.medium);

    for (const c of cells) {
      const cell = list.locator(`.o_selected_row .o_field_widget[name="${c.field}"] input`).first();
      if (!(await cell.isVisible({ timeout: CommonUtils.waitTimes.standard }).catch(() => false))) continue;
      await cell.fill(c.value);
      // No JS autocomplete dropdown in this app - Enter commits a many2one cell.
      await this.page.keyboard.press('Enter').catch(() => {});
      await this.wait(CommonUtils.waitTimes.short);
    }
    return true;
  }

  /** Read back a form field's current value by its Odoo `name=` attribute. */
  async readFormField(fieldName: string): Promise<string> {
    const widget = this.page.locator(`.o_form_view .o_field_widget[name="${fieldName}"]`).first();
    await widget.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    const input = widget.locator('input, textarea').first();
    if (await input.isVisible({ timeout: CommonUtils.waitTimes.short }).catch(() => false)) {
      return ((await input.inputValue().catch(() => '')) || '').trim();
    }
    return ((await widget.innerText().catch(() => '')) || '').trim();
  }

  /**
   * True when the form shows a field with this `name=`. Used for the "no field from a removed
   * add-on is on the form" checks - asked of the FORM, not of the model, because a field can exist
   * on the model and still be absent from the rendered arch.
   */
  async isFormFieldPresent(fieldName: string): Promise<boolean> {
    return await this.page
      .locator(`.o_form_view .o_field_widget[name="${fieldName}"]`)
      .first()
      .isVisible({ timeout: CommonUtils.waitTimes.short })
      .catch(() => false);
  }

  /** Press the form's SAVE button and wait for the record to persist. */
  async saveForm(): Promise<void> {
    // Matched on the stable Odoo class, never on the visible label: this instance's sidebar theme
    // renders the button as " Save" with a leading icon, so an anchored /^Save$/i text match finds
    // nothing at all.
    const save = this.page.locator('.o_form_button_save, button.o_form_button_save').first();
    await save.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await save.click({ timeout: CommonUtils.waitTimes.standard });
    await this.page.locator('.o_form_editable').first()
      .waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.medium);
  }

  /**
   * Press SAVE and REPORT what happened, instead of assuming it worked.
   *
   * `saveForm()` swallows the outcome: it clicks, waits for the editable class to disappear with a
   * `.catch(() => {})`, and returns regardless - so a save blocked by a required field looks
   * identical to a successful one, and the caller only finds out later with a confusing "no record
   * id in the URL". Odoo does not raise a modal for a missing required field; it marks the field
   * `o_field_invalid` and leaves the form editable, which is invisible to a plain click-and-hope.
   */
  async saveFormAndReport(): Promise<{ saved: boolean; invalidFields: string[]; dialogText: string }> {
    const save = this.page.locator('.o_form_button_save, button.o_form_button_save').first();
    await save.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await save.click({ timeout: CommonUtils.waitTimes.standard });
    await this.wait(CommonUtils.waitTimes.medium);

    const stillEditable = await this.page.locator('.o_form_editable').first()
      .isVisible({ timeout: CommonUtils.waitTimes.short }).catch(() => false);
    const invalidFields = await this.page.evaluate(() =>
      Array.from(document.querySelectorAll('.o_field_invalid, .o_form_invalid [name]'))
        .map((e) => e.getAttribute('name') || (e.closest('[name]')?.getAttribute('name') ?? ''))
        .filter(Boolean),
    ).catch(() => [] as string[]);
    const dialogText = await this.getErrorDialogText().catch(() => '');

    return { saved: !stillEditable && !dialogText, invalidFields: [...new Set(invalidFields)], dialogText };
  }

  /** The record id currently open on the form, read from the URL hash (0 when unsaved). */
  async currentRecordIdFromUrl(): Promise<number> {
    const m = this.page.url().match(/[#&]id=(\d+)/);
    return m ? Number(m[1]) : 0;
  }

  /**
   * TEARDOWN: delete every record of `model` whose `name` starts with `marker`.
   *
   * Returns the ids it removed and any it could not, so the caller can report a partial sweep rather
   * than assume success. Never throws - a teardown that throws masks the real test failure.
   */
  async deleteRecordsByNameMarker(
    model: string,
    marker: string,
    /** Field the marker was written into. `sale.order.name` is an auto-generated SO number, so that
     *  spec tags `client_order_ref` instead - the marker field is per-model, not always `name`. */
    markerField: string = 'name',
  ): Promise<{ deleted: number[]; failed: Array<{ id: number; error: string }> }> {
    const deleted: number[] = [];
    const failed: Array<{ id: number; error: string }> = [];
    let rows: Array<{ id: number }> = [];
    try {
      rows = await this.callKw(model, 'search_read', [[[markerField, 'like', `${marker}%`]], ['id']], { limit: 200 });
    } catch (e) {
      return { deleted, failed: [{ id: 0, error: `search failed: ${String((e as Error).message).slice(0, 160)}` }] };
    }
    for (const r of rows) {
      try { await this.callKw(model, 'unlink', [[r.id]]); deleted.push(r.id); }
      catch (e) { failed.push({ id: r.id, error: String((e as Error).message).slice(0, 160) }); }
    }
    return { deleted, failed };
  }

  /** How many records of `model` still carry `marker` - the teardown's own verification. */
  async countRecordsByNameMarker(model: string, marker: string, markerField: string = 'name'): Promise<number> {
    return await this.callKw(model, 'search_count', [[[markerField, 'like', `${marker}%`]]], {});
  }

  /**
   * Write-path smoke: create a trivial res.partner and delete it, via the authenticated web-client
   * session. Returns the new record id (and whether cleanup succeeded). Done over RPC rather than the
   * partner FORM because this instance's partner form (nakivo_accounting) makes the receivable/payable
   * accounts required - a business-form detail beyond a base write-path smoke. The record is disposable
   * (the DB will be replaced).
   */
  async writePathAliveViaPartner(name: string): Promise<{ id: number; deleted: boolean; error?: string }> {
    return await this.page.evaluate(async (nm) => {
      async function callKw(model: string, method: string, args: any[]) {
        const r = await fetch('/web/dataset/call_kw', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs: {} } }),
        });
        const j = await r.json();
        if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 200));
        return j.result;
      }
      try {
        const id = await callKw('res.partner', 'create', [{ name: nm }]);
        let deleted = false;
        let deleteError: string | undefined;
        // The unlink reason is CAPTURED, not swallowed: a cleanup that silently fails leaves a real
        // record behind on a shared instance, and the caller can neither assert on it nor retry it
        // without knowing why it failed.
        try {
          await callKw('res.partner', 'unlink', [[id]]);
          deleted = true;
        } catch (e) {
          deleted = false;
          deleteError = String(e).slice(0, 300);
        }
        return { id, deleted, deleteError };
      } catch (e) {
        return { id: 0, deleted: false, error: String(e).slice(0, 200) };
      }
    }, name);
  }

  /**
   * Delete one res.partner by id over the authenticated web-client session.
   *
   * Exists as the teardown safety net for the write-path smoke: when the create succeeded but the
   * unlink did not, the record is live data on a shared instance, so the spec retries the delete in
   * its afterEach instead of leaving it for the daily leftover check to find.
   */
  async deletePartnerById(id: number): Promise<{ deleted: boolean; error?: string }> {
    return await this.page.evaluate(async (pid) => {
      try {
        const r = await fetch('/web/dataset/call_kw', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', method: 'call',
            params: { model: 'res.partner', method: 'unlink', args: [[pid]], kwargs: {} },
          }),
        });
        const j = await r.json();
        if (j.error) return { deleted: false, error: JSON.stringify(j.error).slice(0, 300) };
        return { deleted: true };
      } catch (e) {
        return { deleted: false, error: String(e).slice(0, 300) };
      }
    }, id);
  }

  /** How many res.partner rows carry this exact name - used to prove a teardown really removed it. */
  async countPartnersByName(name: string): Promise<number> {
    return await this.page.evaluate(async (nm) => {
      const r = await fetch('/web/dataset/call_kw', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', method: 'call',
          params: { model: 'res.partner', method: 'search_count', args: [[['name', '=', nm]]], kwargs: {} },
        }),
      });
      const j = await r.json();
      return j.error ? -1 : (j.result as number);
    }, name);
  }
}
