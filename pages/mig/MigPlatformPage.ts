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
  // Mig app URL hashes (DB-specific, discovered on crm-mig)
  static readonly HASH = {
    crm:                '#action=185&model=crm.lead&view_type=kanban&menu_id=125',
    contacts:           '#menu_id=110&action_id=159',
    sales:              '#menu_id=199&action_id=341',
    settings:           '#menu_id=4&action_id=77',
    apps:               '#menu_id=5&action_id=32',
    // Other sidebar apps (discovered on crm-mig) - CRM-12325 Part 2-A "main apps open cleanly"
    discuss:            '#menu_id=74&action_id=92',
    investments:        '#menu_id=2170&action_id=4344',
    reTimeTracking:     '#menu_id=2279&action_id=4594',
    calendar:           '#menu_id=106&action_id=157',
    website:            '#menu_id=228&action_id=366',
    jobQueue:           '#menu_id=83&action_id=109',
    activecampaign:     '#menu_id=89&action_id=124',
    approval:           '#menu_id=96&action_id=509',
    myDashboard:        '#menu_id=347&action_id=567',
    portal:             '#menu_id=355&action_id=578',
    licenseManagement:  '#menu_id=365&action_id=602',
    reports:            '#menu_id=2109&action_id=4165',
    salesReport:        '#menu_id=2139&action_id=4212',
    kpi:                '#menu_id=2141&action_id=4221',
    invoicing:          '#menu_id=147&action_id=313',
    contractors:        '#menu_id=315&action_id=514',
    customerActivities: '#menu_id=2155&action_id=4286',
    nakivoApi:          '#menu_id=2163&action_id=4293',
    serverCapacity:     '#menu_id=2291&action_id=4820',
  };

  // Locators
  private readonly renderedView = () =>
    this.page.locator('.o_list_view, .o_kanban_view, .o_form_view, .o_setting_container, .o_web_settings_dashboard').first();
  private readonly errorDialog = () =>
    this.page.locator('.o_error_dialog')
      .or(this.page.locator('.modal-dialog:has-text("Traceback")'))
      .or(this.page.locator('.modal-title:has-text("Odoo Client Error")'))
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

  /** Open an app by its URL hash and assert an Odoo action view rendered, with no error dialog. */
  /** Wait until an opened action has finished loading - the Odoo loading spinner disappears. This is
   *  view/theme-agnostic: it works for list, kanban, form, settings, dashboards, Discuss, Calendar,
   *  etc. (the strict view-root class does not, since dashboards/chat render different roots). */
  private async waitForActionLoaded() {
    await this.waitForURL(/\/web[?#]/, CommonUtils.waitTimes.pageLoad);
    await this.page.locator('.o_loading, .oe_loading').first()
      .waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.medium);
  }

  async openAppAndAssertRendered(hash: string) {
    await this.goto(`${baseUrl_mig}web${hash}`);
    await this.waitForActionLoaded();
  }

  /** A "reasonable time" budget (ms) for a single app/action to render - generous to avoid flakiness
   *  on a cold SPA load while still catching a hung/broken app. */
  static readonly APP_RESPONSE_BUDGET_MS = 30000;

  /** Open an app by hash, wait until its action finished loading (spinner gone), and return the
   *  elapsed load time (ms). The caller checks isErrorDialogVisible() separately, so this does NOT
   *  dismiss any error dialog. */
  async openAppAndMeasureMs(hash: string): Promise<number> {
    const start = Date.now();
    await this.goto(`${baseUrl_mig}web${hash}`);
    await this.waitForActionLoaded();
    return Date.now() - start;
  }

  /** True if an Odoo client-error / traceback dialog is currently visible. */
  async isErrorDialogVisible(): Promise<boolean> {
    return await this.errorDialog().isVisible({ timeout: CommonUtils.waitTimes.short }).catch(() => false);
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
        try { await callKw('res.partner', 'unlink', [[id]]); deleted = true; } catch (e) { deleted = false; }
        return { id, deleted };
      } catch (e) {
        return { id: 0, deleted: false, error: String(e).slice(0, 200) };
      }
    }, name);
  }
}
