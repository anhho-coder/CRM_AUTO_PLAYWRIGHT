import { Page, TestInfo } from '@playwright/test';
import * as fs from 'fs';
import { InvestmentPage } from '../InvestmentPage';
import { MigPlatformPage } from './MigPlatformPage';
import { baseUrl_mig } from '@config/users.config';
import { CommonUtils } from '@/helpers/common.utils';

/**
 * Investments app on the O12 CE Migration server (crm-mig.nakivo.site).
 *
 * The form, its tabs and its field names are the SAME as pre-production (grounded 2026-10-19 over
 * fields_view_get on nakivo.investment.activity, module `nakivo_invesment_tracking` - note the
 * module's own spelling "invesment"), so every field/tab method of `InvestmentPage` is reused as is.
 * Only two things differ and are overridden here:
 *
 *  1. NAVIGATION. The pre-prod object clicks menu links by visible text
 *     (`(//a[contains(., "Investments")])[2]`); the Mig sidebar theme renders a different set of
 *     "Investments" links, so the index points somewhere else. The Mig variant opens the list by
 *     URL hash, resolving the action and the menu from their XML ids on the live instance -
 *     never a database id, which a rebuild re-issues (see BasePage.xmlId).
 *  2. CLEAN-UP. crm-mig is a shared migration base: everything a spec creates must be removed.
 *     The helpers below return the ids an Investment import created (deny-list of THIS run's
 *     records), and sweep leftovers by the spec's own name marker - never by a keep-list.
 */
export class InvestmentPageMig extends InvestmentPage {
  static readonly MODEL = 'nakivo.investment.activity';

  static readonly XMLID = {
    investmentsAction: 'nakivo_invesment_tracking.nakivo_investment_marketing_activity_object_action',
    investmentsMenu: 'nakivo_invesment_tracking.nakivo_investment_marketing_activity_object_menu_act',
    activityTypeAction: 'nakivo_invesment_tracking.nakivo_investment_activity_type_action',
    activityTypeMenu: 'nakivo_invesment_tracking.nakivo_investment_activity_type_menu_act',
  } as const;

  /** A sweep that matches more than this is wrong, not a reason to delete more. */
  static readonly SWEEP_LIMIT = 50;

  /**
   * TEMPORARY (2026-10-19, tester's request) - teardown PAUSED for the 31 specs that went red in the
   * 19-10 MigSmoke run (IMPORT refused by the server, see clickImportButton). When one of them FAILS,
   * its Investment, the records the import created and its import file are KEPT on crm-mig for the
   * investigation; a passing run still cleans up. The afterAll sweep is skipped for them as well.
   * Every kept Investment keeps its "TEST <TC> ..." name: take a TC off this list and its next
   * afterAll sweep removes what was kept. The 16:00 leftover check will report these records.
   */
  static readonly TEARDOWN_PAUSED_ON_FAILURE: ReadonlySet<string> = new Set([
    'CRM-12370_8.3.5', 'CRM-12370_8.3.6', 'CRM-12370_8.3.10', 'CRM-12370_8.3.11', 'CRM-12370_8.3.12',
    'CRM-12370_8.3.13', 'CRM-12370_8.3.14', 'CRM-12370_8.3.15', 'CRM-12370_8.3.16', 'CRM-12370_8.3.17',
    'CRM-12370_8.3.18', 'CRM-12370_8.3.19',
    'CRM-12370_8.4.1', 'CRM-12370_8.4.2', 'CRM-12370_8.4.3',
    'CRM-12370_8.5.1',
    'CRM-12370_8.7.3', 'CRM-12370_8.7.4', 'CRM-12370_8.7.5', 'CRM-12370_8.7.6', 'CRM-12370_8.7.7',
    'CRM-12370_8.7.8', 'CRM-12370_8.7.9', 'CRM-12370_8.7.10', 'CRM-12370_8.7.11', 'CRM-12370_8.7.12',
    'CRM-12370_8.7.13', 'CRM-12370_8.7.14', 'CRM-12370_8.7.15',
    'CRM-12370_8.8.1', 'CRM-12370_8.8.2',
  ]);

  /** True when this run's data must be KEPT: the TC is on the pause list and the test did not pass. */
  static keepFailedRunData(tcId: string, testInfo: TestInfo): boolean {
    return InvestmentPageMig.TEARDOWN_PAUSED_ON_FAILURE.has(tcId) && testInfo.status !== testInfo.expectedStatus;
  }

  /** Log what a paused teardown leaves on crm-mig, so the records can be found and removed later. */
  static logKeptRunData(tcId: string, records: Array<{ model: string; id: number; label: string }>, files: string[],
    reason: string = 'test failed'): void {
    console.log(`\n[mig-cleanup] TEARDOWN PAUSED for ${tcId} (${reason}) - KEPT on crm-mig for investigation:`);
    records.forEach((r) => console.log(`  kept      ${r.model}#${r.id} (${r.label})  ${InvestmentPageMig.recordUrl(r.model, r.id)}`));
    files.filter((f) => f && fs.existsSync(f)).forEach((f) => console.log(`  kept      file ${f}`));
    if (records.length === 0) console.log('  (no record registered)');
  }

  private readonly listViewRoot = () =>
    this.page.locator('xpath=//div[contains(@class,"o_list_view")] | //table[contains(@class,"o_list_table")]')
      .or(this.page.locator('.o_list_view, table.o_list_table'))
      .first();

  private readonly activeBreadcrumb = () =>
    this.page.locator('xpath=//li[contains(@class,"breadcrumb-item") and contains(@class,"active")]')
      .or(this.page.locator('.breadcrumb-item.active'))
      .first();

  /** Odoo's server-error dialog ("Odoo Server Error" + traceback). */
  private readonly serverErrorDialog = () =>
    this.page.locator('xpath=//div[contains(@class,"modal") and contains(@class,"show")][.//*[contains(normalize-space(),"Odoo Server Error")]]')
      .or(this.page.locator('.modal.show:has(.o_error_detail)'))
      .first();

  private readonly serverErrorDialogOk = () =>
    this.page.locator('xpath=//div[contains(@class,"modal") and contains(@class,"show")]//footer//button[normalize-space()="Ok" or normalize-space()="OK"]')
      .or(this.page.locator('.modal.show footer button.btn-primary'))
      .first();

  constructor(page: Page) {
    super(page);
  }

  /**
   * Click IMPORT, then FAIL FAST if the server refuses it.
   *
   * On crm-mig (2026-10-19) `action_import_audience` raised
   *   AttributeError: 'bool' object has no attribute 'keys'
   *   (nakivo_invesment_tracking/models/investment_activities_file_import.py line 321, _check_is_valid)
   * The base method then went on to SAVE, whose click was intercepted by the error dialog until the
   * 15-minute test timeout. Here the dialog is detected, its last traceback line is reported, the
   * dialog is closed and the step throws - so the run says WHY it is red, in seconds.
   */
  async clickImportButton(): Promise<void> {
    await super.clickImportButton();
    const refused = await this.serverErrorDialog()
      .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.standard })
      .then(() => true).catch(() => false);
    if (!refused) return;

    const text = ((await this.serverErrorDialog().textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    const lastLine = (text.match(/(\w+(?:Error|Exception|Warning)\b:[^]*?)(?: Ok\s*$|$)/) || [])[1] || text.slice(-300);
    await this.serverErrorDialogOk().click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    throw new Error(`IMPORT refused by the server (Odoo Server Error): ${lastLine.slice(0, 400)}`);
  }

  /** Investments > Investments (list view). Replaces the menu-text click of the base object. */
  async navigateToInvestment(): Promise<void> {
    await this.openListByXmlIds(
      InvestmentPageMig.XMLID.investmentsAction,
      InvestmentPageMig.XMLID.investmentsMenu,
      InvestmentPageMig.MODEL,
      'Investments',
    );
  }

  /** Investments > Configuration > Activity Type (list view). */
  async navigateToActivityType(): Promise<void> {
    await this.openListByXmlIds(
      InvestmentPageMig.XMLID.activityTypeAction,
      InvestmentPageMig.XMLID.activityTypeMenu,
      'nakivo.investment.activity.type',
      'Activity Type',
    );
  }

  /**
   * Open a list by `#action=..&model=..&view_type=list&menu_id=..`, both ids resolved from XML ids.
   * Retries once with a reload: the web client sometimes boots on the session's LAST action before
   * it applies the fragment (seen on crm-mig, see HomePageMig.openListByHash). Fails naming what is
   * on screen instead of a bare timeout.
   */
  private async openListByXmlIds(actionXmlId: string, menuXmlId: string, model: string, label: string) {
    // xmlId() resolves over the authenticated web-client RPC, so the page must already sit on the
    // Mig web client (it does right after login).
    const actionId = await this.xmlId(actionXmlId);
    const menuId = await this.xmlId(menuXmlId);
    const url = `${baseUrl_mig}web#action=${actionId}&model=${model}&view_type=list&menu_id=${menuId}`;

    for (let attempt = 1; attempt <= 2; attempt++) {
      await this.goto(url);
      if (attempt === 2) {
        console.log(`  - "${label}" list did not render; re-applying the hash and reloading once`);
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      }
      await this.waitForURL(/\/web[?#]/, CommonUtils.waitTimes.pageLoad).catch(() => {});
      await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.pageLoad).catch(() => {});
      await this.dismissErrorDialog();

      const rendered = await this.listViewRoot()
        .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
        .then(() => true).catch(() => false);
      if (rendered && this.page.url().includes(`model=${model}`)) {
        await this.wait(CommonUtils.waitTimes.long);
        return;
      }
    }

    const heading = (await this.activeBreadcrumb().textContent({ timeout: CommonUtils.waitTimes.long })
      .catch(() => '') || '').trim();
    throw new Error(
      `"${label}" (${model}) never rendered its list view, twice. URL = ${this.page.url()}; the screen ` +
      `reads "${heading || '(no heading)'}".`,
    );
  }

  /**
   * CRM app (its default pipeline action) by URL hash, VERIFIED to be the crm.lead screen.
   *
   * `HomePageMig.navigateToCRM()` returns as soon as ANY records view is visible. Called right after
   * `returnToHome()` - the Apps screen, itself a kanban - that is already true before the CRM action
   * has loaded, so it returned while Apps was still on screen; `switchToListView()` then switched the
   * APPS list and `searchByEmail()` typed into the Apps search (CRM-12370_8.8.2 on 2026-10-20: facet
   * "Module Test@company...", then a 30 s timeout on the Opp row). This waits until the client has
   * rewritten the hash to `model=crm.lead`, re-applies the hash with a reload once if it never does,
   * and fails naming the screen it is on.
   */
  async openCrmPipeline(): Promise<void> {
    const url = await new MigPlatformPage(this.page).appUrlFor('crm');
    for (let attempt = 1; attempt <= 2; attempt++) {
      await this.goto(url);
      if (attempt === 2) {
        console.log('  - CRM did not load on the first hash change; re-applying the hash and reloading once');
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      }
      const onCrm = await this.page.waitForFunction(() => window.location.hash.includes('model=crm.lead'), null,
        { timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
      if (onCrm) {
        await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.pageLoad).catch(() => {});
        await this.dismissErrorDialog();
        await this.page.locator('xpath=//div[contains(@class,"o_kanban_view") or contains(@class,"o_list_view")]')
          .or(this.page.locator('.o_kanban_view, .o_list_view')).first()
          .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
        console.log(`  - CRM URL : ${this.page.url()}`);
        return;
      }
    }
    const heading = (await this.activeBreadcrumb().textContent({ timeout: CommonUtils.waitTimes.long })
      .catch(() => '') || '').trim();
    throw new Error(`CRM never loaded (the hash never reached model=crm.lead), twice. URL = ${this.page.url()}; ` +
      `the screen reads "${heading || '(no heading)'}".`);
  }

  /** Form URL of a record on crm-mig - what a reader pastes into the browser to open it. */
  static recordUrl(model: string, id: number): string {
    return `${baseUrl_mig}web#id=${id}&model=${model}&view_type=form`;
  }

  /** Step-log line with the URL of a record the step just created. */
  static logRecordUrl(label: string, model: string, id: number): void {
    console.log(`  - ${label} URL : ${id ? InvestmentPageMig.recordUrl(model, id) : '(no record id - not created)'}`);
  }

  /** Step-log line with a URL the step already holds (e.g. the form it just opened). */
  static logUrl(label: string, url: string): void {
    console.log(`  - ${label} URL : ${url}`);
  }

  /**
   * Step-log line for a form that is never saved: there is no record, so the line says so and gives
   * the URL of the form the step looked at.
   */
  logUnsavedFormUrl(label: string): void {
    console.log(`  - ${label} URL : (CREATE form, never saved - no record id) ${this.page.url()}`);
  }

  /**
   * Print the form URL of every record this test created, one per line, so a reader of the report can
   * open exactly what the run worked on: the Investment, the Lead / Opportunity and the Contact /
   * Company an audience import produced, and any sales document after them. `crm.lead` rows are
   * labelled Lead or Opportunity from their `type`, `res.partner` rows Contact or Company from
   * `is_company`; every other row keeps its ledger label. Call it BEFORE teardown. Never throws.
   */
  async logRecordUrls(tcId: string, records: ReadonlyArray<{ model: string; id: number; label: string }>): Promise<void> {
    const bar = '='.repeat(20);
    console.log(`\n${bar} RECORDS created by ${tcId} on crm-mig ${bar}`);
    if (records.length === 0) {
      console.log('  (none - this test created no record)');
      console.log('='.repeat(62));
      return;
    }
    const platform = new MigPlatformPage(this.page);
    const details = new Map<string, { kind: string; name: string }>();
    const byModel = new Map<string, number[]>();
    records.forEach((r) => byModel.set(r.model, [...(byModel.get(r.model) || []), r.id]));
    for (const [model, ids] of byModel) {
      const fields = model === 'crm.lead' ? ['display_name', 'type']
        : model === 'res.partner' ? ['display_name', 'is_company'] : ['display_name'];
      try {
        const rows = await platform.callKw<Array<Record<string, any>>>(model, 'read', [ids, fields],
          { context: { active_test: false } });
        rows.forEach((row) => details.set(`${model}#${row.id}`, {
          kind: model === 'crm.lead' ? (row.type === 'opportunity' ? 'Opportunity' : 'Lead')
            : model === 'res.partner' ? (row.is_company ? 'Company' : 'Contact') : '',
          name: String(row.display_name ?? ''),
        }));
      } catch {
        // Unreadable (already deleted, no access): the line below still prints the URL.
      }
    }
    for (const r of records) {
      const d = details.get(`${r.model}#${r.id}`);
      const kind = (d?.kind || r.label).padEnd(18);
      console.log(`  - ${kind} : ${InvestmentPageMig.recordUrl(r.model, r.id)}${d?.name ? `  "${d.name}"` : ''}`);
    }
    console.log('='.repeat(62));
  }

  /** Database id of the record the open form shows (0 while the form is unsaved). */
  async currentRecordId(): Promise<number> {
    const id = (this.page.url().match(/[#&?]id=(\d+)/) || [])[1];
    return id ? Number(id) : 0;
  }

  /**
   * Id of the Investment named exactly `name` (0 when none), for the cleanup ledger.
   *
   * Polls, because `createBlankInvestment` returns ~2 s after clicking SAVE while the save RPC on
   * crm-mig can take longer: on 2026-10-19 8.4.3 and the first run of 8.6.3 read 0 here and failed
   * "must exist after SAVE" although the same data saved fine seconds earlier. A record that never
   * appears within the budget still returns 0, so a real failed save stays red.
   */
  async findInvestmentIdByName(name: string, attempts: number = 10): Promise<number> {
    const platform = new MigPlatformPage(this.page);
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const rows = await platform.callKw<Array<{ id: number }>>(
        InvestmentPageMig.MODEL, 'search_read', [[['name', '=', name]], ['id']],
        { limit: 2, context: { active_test: false } },
      );
      if (rows.length > 1) throw new Error(`findInvestmentIdByName: "${name}" is not unique (${rows.length} rows)`);
      if (rows[0]?.id) return rows[0].id;
      if (attempt < attempts) await this.wait(CommonUtils.waitTimes.standard);
    }
    return 0;
  }

  /**
   * Records an audience import created for THIS run, so the spec can queue them for deletion.
   *
   * Deny-list only: the Leads linked to the run's own Investment, and the partners carrying the
   * run's unique email / company name. Nothing is computed as "everything except".
   *
   * `waitForLeadMs`: when the import was accepted but runs in the background ("Import With Queue?"),
   * its Lead and partners can commit a few seconds after the spec ends - 8.4.2 lost them on
   * 2026-10-20. A positive value polls for the Lead (1 s step) before the partners are read.
   */
  async findImportCreatedRecords(investmentId: number, email: string, company: string, waitForLeadMs = 0): Promise<{
    leadIds: number[];
    partnerIds: number[];
  }> {
    const platform = new MigPlatformPage(this.page);
    const ctx = { limit: InvestmentPageMig.SWEEP_LIMIT, context: { active_test: false } };
    const readLeads = async () => investmentId
      ? platform.callKw<Array<{ id: number }>>('crm.lead', 'search_read',
        [[['activity_id', '=', investmentId]], ['id']], ctx)
      : [];
    let leads = await readLeads();
    for (const deadline = Date.now() + waitForLeadMs; investmentId && leads.length === 0 && Date.now() < deadline;) {
      await this.page.waitForTimeout(1_000);
      leads = await readLeads();
    }
    const domain: unknown[] = [];
    if (email && company) domain.push('|');
    if (email) domain.push(['email', '=ilike', email]);
    if (company) domain.push(['name', '=', company]);
    const partners = domain.length
      ? await platform.callKw<Array<{ id: number }>>('res.partner', 'search_read', [domain, ['id']], ctx)
      : [];
    return { leadIds: leads.map((r) => r.id), partnerIds: partners.map((r) => r.id) };
  }

  /**
   * afterAll safety net: delete Investments whose NAME carries this spec's marker
   * (`TEST <tcId> ...`), plus the Leads linked to them. Child-first. Never throws.
   *
   * Counts before it deletes: more than SWEEP_LIMIT matches means the marker is wrong, so it STOPS
   * and reports instead of deleting.
   */
  async sweepInvestmentLeftovers(tcId: string): Promise<void> {
    const platform = new MigPlatformPage(this.page);
    if (InvestmentPageMig.TEARDOWN_PAUSED_ON_FAILURE.has(tcId)) {
      console.log(`[mig-sweep] PAUSED for ${tcId} - see InvestmentPageMig.TEARDOWN_PAUSED_ON_FAILURE. Nothing deleted.`);
      return;
    }
    const marker = [['name', 'like', tcId], ['name', 'like', 'TEST']];
    try {
      const count = await platform.callKw<number>(InvestmentPageMig.MODEL, 'search_count', [marker],
        { context: { active_test: false } });
      if (count === 0) {
        console.log(`[mig-sweep] investments clean - nothing named "TEST ${tcId} ..." is left`);
        return;
      }
      if (count > InvestmentPageMig.SWEEP_LIMIT) {
        console.log(`[mig-sweep] STOPPED - ${count} investments match "${tcId}", more than a run creates. Nothing deleted.`);
        return;
      }
      const invs = await platform.callKw<Array<{ id: number; name: string }>>(InvestmentPageMig.MODEL,
        'search_read', [marker, ['id', 'name']], { limit: InvestmentPageMig.SWEEP_LIMIT, context: { active_test: false } });
      const invIds = invs.map((r) => r.id);
      const leads = await platform.callKw<Array<{ id: number; name: string }>>('crm.lead', 'search_read',
        [[['activity_id', 'in', invIds]], ['id', 'name']],
        { limit: InvestmentPageMig.SWEEP_LIMIT, context: { active_test: false } });
      console.log(`\n[mig-sweep] ${invs.length} investment(s) + ${leads.length} linked lead(s) match "${tcId}" - deleting`);
      for (const [model, rows] of [['crm.lead', leads], [InvestmentPageMig.MODEL, invs]] as const) {
        for (const r of rows) {
          try {
            await platform.callKw(model, 'unlink', [[r.id]]);
            console.log(`  deleted   ${model}#${r.id} (${r.name})`);
          } catch (err) {
            const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
            console.log(`  FAILED    ${model}#${r.id} (${r.name}) - ${msg}`);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
      console.log(`[mig-sweep] investments sweep SKIPPED - ${msg}`);
    }
  }
}
