import { MigDataParityPage } from './MigDataParityPage';
import { CommonUtils } from '@helpers/common.utils';
import { baseUrl_mig, baseUrl_presales_mig, presalesDb_mig, users } from '@config/users.config';
// Imported by FILE, not through the `@pages/mig` barrel: the barrel also exports this very class,
// so going through it would make the module import itself.
import { LoginPageMig } from './LoginPageMig';
import type { Page, APIRequestContext } from '@playwright/test';

/** One pre-sale request, as the specs read it off the Pre-Sales Application. */
export interface PreSaleRequest {
  id: number;
  name: string;
  number: string;
  stage: string;
  stageId: number;
  priority: string;
  typeId: number | false;
  typeName: string | false;
  assignedUserId: number | false;
  assignedUserName: string | false;
  crmLeadRef: number | false;
  createDate: string;
  closedDate: string | false;
  assignedDate: string | false;
  requestUuid: string | false;
  requesterLogin: string | false;
  ackQueued: boolean;
  meetingUrl: string | false;
}

/** One entry of the Pre-Sales mail queue - the evidence channel for every notification case. */
export interface PreSaleMail {
  id: number;
  state: string;
  subject: string;
  /**
   * The raw To header. On the PRE-SALES Application this is almost always EMPTY: those notifications
   * address PARTNERS, and Odoo keeps partner recipients in `recipient_ids`, not here. Measured
   * 2026-10-05 on a real request - email_to "", recipient_ids [68]. Reading only this field is why
   * TC-20 and TC-21 could never pass. On the CRM the opposite holds: email_to carries
   * pre-sales@nakivo.com and recipient_ids is empty.
   */
  emailTo: string;
  /** Partner ids this mail is addressed to - resolve with resolvePartnerEmails(). */
  recipientIds: number[];
  bodyHtml: string;
  date: string;
}

/**
 * Pre-Sales Support migration (CRM-12135) - the ONE page object both halves of the flow go through.
 *
 * The feature spans TWO servers and a spec drives both in a single run:
 *   - the CRM  (crm-mig.nakivo.site, Odoo 12 CE, db nakivoCE) raises the request from an Opportunity
 *   - the Pre-Sales Application (pre-sales-crm-mig.nakivo.site, Odoo 19, db odoo19) works it
 *
 * CRM-side reads inherit MigDataParityPage's guards (read-only methods, no empty domain, hard
 * limit). Pre-Sales-side calls cannot go through `page.evaluate` - that would be a cross-origin
 * fetch from the CRM page - so they use the browser context's APIRequestContext against the second
 * host, which keeps its own cookie jar in the same context.
 *
 * WRITES: the CRM-side create/unlink helpers and `deleteRequest` exist ONLY so a spec can build and
 * then REMOVE its own fixture. crm-mig is a shared migration base: a spec creates what it needs,
 * tags it with MARKER_PREFIX so a sweep can always find it by name, and deletes it in teardown even
 * when the test fails. Nothing that came from the migration is ever edited or deleted.
 */
export class MigPreSalePage extends MigDataParityPage {
  // ------------------------------------------------------------------ what the delivery is

  /** The raise-request wizard the Opportunity's action button opens (CRM side). */
  static readonly WIZARD_MODEL = 'nakivo_presale_bridge.new_ticket';

  /** The CRM-side bridge module that carries the whole raise path. */
  static readonly BRIDGE_MODULE = 'nakivo_presale_bridge';

  /** The request model on the Pre-Sales Application. */
  static readonly TICKET_MODEL = 'helpdesk.ticket';

  /** The Pre-Sales team every request lands on. */
  static readonly TEAM_NAME = 'Sales Engineers';

  /**
   * The Expected-Revenue gate on the raise button. Read off the Opportunity view arch:
   * the live button is invisible below it, the disabled twin invisible at or above it.
   */
  static readonly RAISE_THRESHOLD = 100;

  /** The field the gate reads - "Expected Revenue Deal", NOT the stock `planned_revenue`. */
  static readonly THRESHOLD_FIELD = 'planned_revenue_custom';

  /** The tooltip the disabled twin carries below the threshold, verbatim. */
  static readonly BELOW_THRESHOLD_TOOLTIP = 'Expected Revenue less than $100!';

  /** The five statuses IS-CRM-FUNC-0050 requires after its CRM-12134 correction, in queue order. */
  static readonly EXPECTED_STAGES: readonly string[] = [
    'New', 'In Progress', 'On Support Team', 'On Product Team', 'Closed',
  ];

  /** The three request types IS-CRM-FUNC-0042 requires - exactly these, no "other". */
  static readonly EXPECTED_TYPES: readonly string[] = [
    'Technical assistance', 'Deployment / POC session', 'Cancelled demo / session',
  ];

  /** The three assistance needs IS-CRM-FUNC-0041 requires, as the wizard offers them. */
  static readonly SUPPORT_TYPES: readonly string[] = [
    'Online deployment session', 'Online technical assistance', 'Offline technical assistance',
  ];

  /** The two support types that require a Meeting Time (the online ones). */
  static readonly ONLINE_SUPPORT_TYPES: readonly string[] = [
    'Online deployment session', 'Online technical assistance',
  ];

  /** The four priority levels of IS-CRM-FUNC-0053, lowest first. Low is the default. */
  static readonly PRIORITY_LABELS: readonly string[] = ['Low', 'Medium', 'High', 'Urgent'];

  /** The raise dialog's five fields, in the order the form declares them. */
  static readonly DIALOG_FIELD_ORDER: readonly string[] = [
    'subject', 'meeting_time', 'description', 'meeting_link', 'support_type',
  ];

  /**
   * Sales Engineers known to be on the team - a source of a REAL login to assign to, nothing more.
   *
   * Do NOT assert that the team holds exactly these. Membership changes: on 2026-10-05 the team held
   * seven, `qa.se.user@nakivo.com` having been added, and CRM-12135_TC-10 went red for it although
   * nothing was wrong with the product. The manual TC itself says "six TODAY", which is the author
   * telling us the number is incidental. Assert the invariant - the team is non-empty and does not
   * contain everyone - not the roster.
   */
  static readonly SE_TEAM_LOGINS: readonly string[] = [
    'alex.tsiklidis@nakivo.com', 'dario@nakivo.com', 'elie@nakivo.com',
    'hassan.dika@nakivo.com', 'luis.mata@nakivo.com', 'nick.luchkov@nakivo.com',
  ];

  /**
   * Every record a spec creates carries this prefix in its name.
   *
   * It is the contract that makes teardown auditable: the 16:00 leftover sweep finds a survivor by
   * NAME, without having to guess from timestamps.
   */
  static readonly MARKER_PREFIX = 'AUTO-CRM-12135';

  /** Budget for one raise round-trip: the save posts to the second server before it returns. */
  static readonly RAISE_BUDGET_MS = 60000;

  /** Budget for getting the raise dialog open, across however many reveal/click attempts it takes. */
  static readonly RAISE_OPEN_BUDGET_MS = 60000;

  // ------------------------------------------------------------------ Pre-Sales session state

  private presalesUid: number | undefined;

  /** Bumped on every Opportunity open so each one is a full document load, never a hash move. */
  private openCounter = 0;

  constructor(page: Page) {
    super(page);
  }

  /** A run id that makes every created record unique and greppable. */
  static runId(): string {
    return `${Date.now()}`;
  }

  /** The name a spec gives the data it creates, e.g. AUTO-CRM-12135-TC-01-1758100000000. */
  static marker(tcId: string, runId: string): string {
    // Remember it. A test that TIMES OUT never reaches its finally block, so the sweep that
    // lives there does not run and the records stay on crm-mig. afterEach can still clean up,
    // but only if it knows which marker to look for - and the marker is created inside the test
    // body. Recording it here keeps all 30 specs free of extra bookkeeping.
    const m = `${MigPreSalePage.MARKER_PREFIX}-${tcId}-${runId}`;
    MigPreSalePage.lastMarker = m;
    return m;
  }

  /** The marker most recently issued by marker(), for the afterEach safety sweep. */
  static lastMarker = '';

  private get api(): APIRequestContext {
    return this.page.context().request;
  }

  // ------------------------------------------------------------------ Pre-Sales Application RPC

  /**
   * Sign in to the Pre-Sales Application for the rest of the run.
   *
   * The database MUST be named: this instance answers every other value with "Database not found",
   * so an unnamed call looks exactly like a wrong password. Defaults to the QA account that the
   * shared sign-in matches to the same person as on the CRM.
   */
  async loginPresales(
    username: string = users.anh_ho_presales_mig.username,
    password: string = users.anh_ho_presales_mig.password,
  ): Promise<number> {
    const res = await this.api.post(`${baseUrl_presales_mig}web/session/authenticate`, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        jsonrpc: '2.0',
        method: 'call',
        params: { db: presalesDb_mig, login: username, password },
      },
      timeout: CommonUtils.waitTimes.abnormalWait,
    });
    const body = await res.json();
    if (body.error) {
      const d = body.error.data || {};
      throw new Error(
        `Pre-Sales sign-in failed for "${username}" on db "${presalesDb_mig}": ` +
        String(d.message || body.error.message).slice(0, 300),
      );
    }
    const uid = body.result?.uid;
    if (!uid) {
      throw new Error(`Pre-Sales sign-in returned no uid for "${username}" - the account is refused.`);
    }
    this.presalesUid = uid;
    return uid;
  }

  /** The uid the current Pre-Sales session runs as; throws when nothing signed in yet. */
  presalesSessionUid(): number {
    if (!this.presalesUid) {
      throw new Error('MigPreSalePage: loginPresales() has not been called for this session.');
    }
    return this.presalesUid;
  }

  /**
   * A `call_kw` against the Pre-Sales Application.
   *
   * Unlike the CRM-side `readKw` this one is NOT method-restricted: the teardown has to unlink what
   * the spec created, and a few cases legitimately drive a write. Every caller inside this class
   * names what it does, so a write is always visible at the call site.
   */
  async presalesCallKw<T = any>(
    model: string,
    method: string,
    args: any[] = [],
    kwargs: Record<string, any> = {},
  ): Promise<T> {
    const res = await this.api.post(`${baseUrl_presales_mig}web/dataset/call_kw`, {
      headers: { 'Content-Type': 'application/json' },
      data: { jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } },
      timeout: CommonUtils.waitTimes.abnormalWait,
    });
    const body = await res.json();
    if (body.error) {
      const d = body.error.data || {};
      throw new Error(
        `Pre-Sales ${model}.${method} failed: ` + String(d.message || body.error.message).slice(0, 400),
      );
    }
    return body.result as T;
  }

  /** Can the signed-in Pre-Sales account do `operation` on the request model? */
  async presalesCanOnTickets(operation: 'create' | 'write' | 'unlink' | 'read'): Promise<boolean> {
    return await this.presalesCallKw<boolean>(
      MigPreSalePage.TICKET_MODEL, 'check_access_rights', [operation], { raise_exception: false },
    );
  }

  // ------------------------------------------------------------------ Pre-Sales configuration

  /** The stage names configured on the Pre-Sales Application, in queue order. */
  async stageNames(): Promise<string[]> {
    const rows = await this.presalesCallKw<any[]>(
      'helpdesk.ticket.stage', 'search_read', [[], ['name', 'sequence', 'closed']],
      { limit: MigDataParityPage.MAX_LIMIT, order: 'sequence asc' },
    );
    return rows.map((r) => String(r.name));
  }

  /** The stage names flagged as closing - IS-CRM-FUNC-0051/0052 hang off this. */
  async closingStageNames(): Promise<string[]> {
    const rows = await this.presalesCallKw<any[]>(
      'helpdesk.ticket.stage', 'search_read', [[['closed', '=', true]], ['name']],
      { limit: MigDataParityPage.MAX_LIMIT },
    );
    return rows.map((r) => String(r.name));
  }

  /** The active request types (the close-gate classification of IS-CRM-FUNC-0042/0051). */
  async requestTypeNames(): Promise<string[]> {
    const rows = await this.presalesCallKw<any[]>(
      'helpdesk.ticket.type', 'search_read', [[['active', '=', true]], ['name']],
      { limit: MigDataParityPage.MAX_LIMIT },
    );
    return rows.map((r) => String(r.name));
  }

  /** The priority selection offered on a request, lowest first. */
  async priorityLabels(): Promise<string[]> {
    const meta = await this.presalesCallKw<Record<string, any>>(
      MigPreSalePage.TICKET_MODEL, 'fields_get', [['priority'], ['selection']],
    );
    const sel = (meta.priority?.selection ?? []) as [string, string][];
    return sel.map(([, label]) => String(label));
  }

  /** The priority a brand-new request is created at, as the server's own default reports it. */
  async defaultPriorityLabel(): Promise<string> {
    const defaults = await this.presalesCallKw<Record<string, any>>(
      MigPreSalePage.TICKET_MODEL, 'default_get', [['priority']],
    );
    const raw = String(defaults.priority ?? '');
    const meta = await this.presalesCallKw<Record<string, any>>(
      MigPreSalePage.TICKET_MODEL, 'fields_get', [['priority'], ['selection']],
    );
    const sel = (meta.priority?.selection ?? []) as [string, string][];
    const hit = sel.find(([value]) => value === raw);
    return hit ? String(hit[1]) : `<unmapped:${raw}>`;
  }

  /** Every field name the request model carries - the "left out of scope" cases read this. */
  async ticketFieldNames(): Promise<string[]> {
    const meta = await this.presalesCallKw<Record<string, any>>(
      MigPreSalePage.TICKET_MODEL, 'fields_get', [[], ['string']],
    );
    return Object.keys(meta);
  }

  /** The logins on the Sales Engineers team. */
  async teamMemberLogins(): Promise<string[]> {
    const teams = await this.presalesCallKw<any[]>(
      'helpdesk.ticket.team', 'search_read',
      [[['name', '=', MigPreSalePage.TEAM_NAME]], ['name', 'user_ids']], { limit: 10 },
    );
    if (!teams.length) {
      throw new Error(`Pre-Sales team "${MigPreSalePage.TEAM_NAME}" does not exist on this instance.`);
    }
    const ids = (teams[0].user_ids ?? []) as number[];
    if (!ids.length) return [];
    const usersRows = await this.presalesCallKw<any[]>('res.users', 'read', [ids, ['login']]);
    return usersRows.map((u) => String(u.login));
  }

  /**
   * How many active internal users the Pre-Sales Application has.
   *
   * Lets a case prove that the Sales Engineers team is a PROPER subset of the user base - i.e. the
   * assignee field really is restricted - without pinning any name or count that will rot.
   */
  async activeUserCount(): Promise<number> {
    return await this.presalesCallKw<number>(
      'res.users', 'search_count', [[['active', '=', true], ['share', '=', false]]],
    );
  }

  /**
   * Sweep the last run's records from a FRESH session - the afterEach safety net.
   *
   * The in-test sweep lives in a finally block, which a Playwright TEST TIMEOUT skips entirely.
   * On 2026-09-24 that left two Opportunities on crm-mig after TC-07 and TC-09 timed out, and the
   * afterEach of the day only PRINTED "TEARDOWN DID NOT RUN". afterEach cannot reuse the test's
   * page either - the context is already closing - so this opens its own, logs in, sweeps, closes.
   * Returns what it removed; never throws, because a teardown that fails the test is worse than
   * a leftover that gets reported.
   */
  static async sweepLeftovers(
    browser: import('@playwright/test').Browser,
    marker: string = MigPreSalePage.lastMarker,
  ): Promise<{ requests: number[]; opportunities: number[]; errors: string[] }> {
    const out = { requests: [] as number[], opportunities: [] as number[], errors: [] as string[] };
    if (!marker) {
      out.errors.push('no marker was recorded for this test - nothing to sweep');
      return out;
    }
    let context: import('@playwright/test').BrowserContext | undefined;
    try {
      context = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await context.newPage();
      const login = new LoginPageMig(page);
      await login.navigateTo(baseUrl_mig);
      await login.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      const preSale = new MigPreSalePage(page);
      await preSale.loginPresales(
        users.anh_ho_presales_mig.username,
        users.anh_ho_presales_mig.password,
      );
      return await preSale.sweepByMarker(marker);
    } catch (err) {
      out.errors.push(`standalone sweep failed: ${(err as Error).message}`);
      return out;
    } finally {
      await context?.close().catch(() => { /* nothing left to close */ });
    }
  }

  /**
   * Turn a mail's `recipient_ids` into the e-mail addresses a reader would see in "To (Partners)".
   *
   * The manual cases say "Its To (Partners) field names the engineer / the salesperson". That field
   * is partner-based, so the assertion has to resolve the partners - comparing against `email_to`
   * compares against an empty string.
   */
  async resolvePartnerEmails(partnerIds: number[]): Promise<string[]> {
    if (!partnerIds.length) return [];
    const rows = await this.presalesCallKw<any[]>(
      'res.partner', 'read', [partnerIds, ['email', 'name']],
    );
    return rows.map((r) => String(r.email || r.name || '')).filter(Boolean);
  }

  /**
   * A mail body as a READER sees it: tags removed, entities and whitespace normalised.
   *
   * Never match a sentence against raw `body_html`. The template wraps words in tags and uses
   * &nbsp;, so "has been received and is being reviewed by our Sales Engineers team" is present on
   * screen while `bodyHtml.includes(...)` is false - measured 2026-10-05 on TC-19, whose body
   * plainly read that sentence while the filter counted zero matches.
   */
  static mailText(mail: PreSaleMail): string {
    return (mail.bodyHtml || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Both revenue fields of one Opportunity.
   *
   * The CRM carries TWO: `planned_revenue` ("Expected Revenue") and `planned_revenue_custom`
   * ("Expected Revenue Deal"). The pre-sales gate and this whole feature use the CUSTOM one, and a
   * spec that sets one while the product reports the other will disagree for a reason that has
   * nothing to do with the check being made. Read both and say which is which.
   */
  async leadRevenues(leadId: number): Promise<{ plain: number; deal: number }> {
    const rows = await this.page.evaluate(async (id) => {
      const res = await fetch('/web/dataset/call_kw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', method: 'call',
          params: {
            model: 'crm.lead', method: 'read',
            args: [[id], ['planned_revenue', 'planned_revenue_custom']], kwargs: {},
          },
        }),
      });
      const j = await res.json();
      if (j.error) throw new Error(`crm.lead read failed: ${JSON.stringify(j.error).slice(0, 200)}`);
      return j.result as any[];
    }, leadId);
    const r = rows[0] ?? {};
    return { plain: Number(r.planned_revenue ?? 0), deal: Number(r.planned_revenue_custom ?? 0) };
  }

  /** Every address a mail is addressed to, from BOTH the raw header and the partner recipients. */
  async mailRecipients(mail: PreSaleMail): Promise<string[]> {
    const fromPartners = await this.resolvePartnerEmails(mail.recipientIds);
    const raw = mail.emailTo.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    return [...new Set([...raw, ...fromPartners])];
  }

  /**
   * Mails in the CRM's OWN queue - a different server from the Pre-Sales Application.
   *
   * Both hosts run `Settings > Technical > Email > Emails`, and they hold different mail. The
   * dispatcher notification of TC-18 is sent BY the CRM and lives here; the acknowledgment,
   * assignment and reply notifications live on the Pre-Sales Application. Reading the wrong queue
   * finds nothing, which is exactly how TC-18 failed until 2026-10-05.
   */
  async mailsOnCrmBySubject(subjectLike: string, limit: number = 50): Promise<PreSaleMail[]> {
    const rows = await this.page.evaluate(async ({ subjectLike: sub, limit: lim }) => {
      const res = await fetch('/web/dataset/call_kw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'mail.mail',
            method: 'search_read',
            args: [[['subject', 'ilike', sub]],
              ['id', 'state', 'subject', 'email_to', 'recipient_ids', 'body_html', 'date']],
            kwargs: { limit: lim, order: 'id desc' },
          },
        }),
      });
      const j = await res.json();
      if (j.error) throw new Error(`CRM mail.mail search_read failed: ${JSON.stringify(j.error).slice(0, 300)}`);
      return j.result as any[];
    }, { subjectLike, limit });
    return rows.map((m) => ({
      id: m.id,
      state: String(m.state ?? ''),
      subject: String(m.subject ?? ''),
      emailTo: m.email_to ? String(m.email_to) : '',
      recipientIds: (m.recipient_ids ?? []) as number[],
      bodyHtml: String(m.body_html ?? ''),
      date: String(m.date ?? ''),
    }));
  }

  // ------------------------------------------------------------------ Pre-Sales requests

  private static toRequest(r: any): PreSaleRequest {
    return {
      id: r.id,
      name: String(r.name ?? ''),
      number: String(r.number ?? ''),
      stage: Array.isArray(r.stage_id) ? String(r.stage_id[1]) : '',
      stageId: Array.isArray(r.stage_id) ? Number(r.stage_id[0]) : 0,
      priority: String(r.priority ?? ''),
      typeId: Array.isArray(r.type_id) ? Number(r.type_id[0]) : false,
      typeName: Array.isArray(r.type_id) ? String(r.type_id[1]) : false,
      assignedUserId: Array.isArray(r.user_id) ? Number(r.user_id[0]) : false,
      assignedUserName: Array.isArray(r.user_id) ? String(r.user_id[1]) : false,
      crmLeadRef: r.crm_lead_ref === undefined ? false : r.crm_lead_ref,
      createDate: String(r.create_date ?? ''),
      closedDate: r.closed_date ?? false,
      assignedDate: r.assigned_date ?? false,
      requestUuid: r.presale_request_uuid ?? false,
      requesterLogin: r.presale_requester_login ?? false,
      ackQueued: Boolean(r.presale_ack_queued),
      meetingUrl: r.meeting_url ?? false,
    };
  }

  private static readonly REQUEST_FIELDS = [
    'name', 'number', 'stage_id', 'priority', 'type_id', 'user_id', 'crm_lead_ref',
    'create_date', 'closed_date', 'assigned_date', 'presale_request_uuid',
    'presale_requester_login', 'presale_ack_queued', 'meeting_url',
  ];

  /** Every request raised from one Opportunity, newest first. */
  async requestsForLead(leadId: number): Promise<PreSaleRequest[]> {
    const rows = await this.presalesCallKw<any[]>(
      MigPreSalePage.TICKET_MODEL, 'search_read',
      [[['crm_lead_ref', '=', leadId]], MigPreSalePage.REQUEST_FIELDS],
      { limit: MigDataParityPage.MAX_LIMIT, order: 'id desc' },
    );
    return rows.map(MigPreSalePage.toRequest);
  }

  /** Every request whose subject carries a marker - the teardown sweep's entry point. */
  async requestsByMarker(marker: string): Promise<PreSaleRequest[]> {
    const rows = await this.presalesCallKw<any[]>(
      MigPreSalePage.TICKET_MODEL, 'search_read',
      [[['name', 'like', marker]], MigPreSalePage.REQUEST_FIELDS],
      { limit: MigDataParityPage.MAX_LIMIT, order: 'id desc' },
    );
    return rows.map(MigPreSalePage.toRequest);
  }

  /** One request by id. */
  async request(id: number): Promise<PreSaleRequest> {
    const rows = await this.presalesCallKw<any[]>(
      MigPreSalePage.TICKET_MODEL, 'read', [[id], MigPreSalePage.REQUEST_FIELDS],
    );
    if (!rows.length) throw new Error(`Pre-Sales request ${id} no longer exists.`);
    return MigPreSalePage.toRequest(rows[0]);
  }

  /** The deal context the request carries - IS-CRM-FUNC-0040 reads exactly these. */
  async requestDealContext(id: number): Promise<Record<string, unknown>> {
    const rows = await this.presalesCallKw<any[]>(
      MigPreSalePage.TICKET_MODEL, 'read',
      [[id], [
        'crm_partner_id', 'crm_end_user_id', 'crm_distributor_id', 'crm_reseller_id',
        'crm_salesperson_name', 'crm_expected_revenue', 'crm_country_id', 'crm_customer_phone',
        'crm_support_level', 'crm_opportunity_type', 'crm_customer_value', 'crm_lead_ref',
      ]],
    );
    return rows[0] as Record<string, unknown>;
  }

  /** The chatter bodies on a request - a reply (IS-CRM-FUNC-0048) is read from here. */
  async requestMessages(id: number): Promise<string[]> {
    const rows = await this.presalesCallKw<any[]>(
      'mail.message', 'search_read',
      [[['model', '=', MigPreSalePage.TICKET_MODEL], ['res_id', '=', id]], ['body', 'date']],
      { limit: 50, order: 'id desc' },
    );
    return rows.map((m) => String(m.body ?? ''));
  }

  // ------------------------------------------------------------------ working a request

  /** The Pre-Sales uid behind a login - the assignment cases pick their engineer with it. */
  async presalesUserIdByLogin(login: string): Promise<number> {
    const rows = await this.presalesCallKw<any[]>(
      'res.users', 'search_read', [[['login', '=', login]], ['id', 'login']], { limit: 5 },
    );
    if (!rows.length) throw new Error(`No Pre-Sales user with login "${login}".`);
    return Number(rows[0].id);
  }

  /** The stage id behind a stage name. */
  async stageIdByName(name: string): Promise<number> {
    const rows = await this.presalesCallKw<any[]>(
      'helpdesk.ticket.stage', 'search_read', [[['name', '=', name]], ['id', 'name']], { limit: 5 },
    );
    if (!rows.length) throw new Error(`No Pre-Sales stage named "${name}".`);
    return Number(rows[0].id);
  }

  /** The request-type id behind a type name. */
  async requestTypeIdByName(name: string): Promise<number> {
    const rows = await this.presalesCallKw<any[]>(
      'helpdesk.ticket.type', 'search_read', [[['name', '=', name]], ['id', 'name']], { limit: 5 },
    );
    if (!rows.length) throw new Error(`No Pre-Sales request type named "${name}".`);
    return Number(rows[0].id);
  }

  /** Give a request an owner - the manual pick-up of IS-CRM-FUNC-0044/0045. */
  async assignRequest(ticketId: number, userId: number): Promise<void> {
    await this.presalesCallKw(MigPreSalePage.TICKET_MODEL, 'write', [[ticketId], { user_id: userId }]);
  }

  /** Move a request to a stage. Throws with the server's own message when the move is refused. */
  async moveRequestToStage(ticketId: number, stageId: number): Promise<void> {
    await this.presalesCallKw(MigPreSalePage.TICKET_MODEL, 'write', [[ticketId], { stage_id: stageId }]);
  }

  /** Record the classification a close needs - IS-CRM-FUNC-0051. */
  async setRequestType(ticketId: number, typeId: number): Promise<void> {
    await this.presalesCallKw(MigPreSalePage.TICKET_MODEL, 'write', [[ticketId], { type_id: typeId }]);
  }

  /** Set the priority on a request - IS-CRM-FUNC-0053. */
  async setRequestPriority(ticketId: number, priorityValue: string): Promise<void> {
    await this.presalesCallKw(MigPreSalePage.TICKET_MODEL, 'write', [[ticketId], { priority: priorityValue }]);
  }

  /** Answer on a request the way Send message does - IS-CRM-FUNC-0048/0060. */
  async replyOnRequest(ticketId: number, body: string): Promise<number> {
    return await this.presalesCallKw<number>(
      MigPreSalePage.TICKET_MODEL, 'message_post', [[ticketId]],
      { body, message_type: 'comment', subtype_xmlid: 'mail.mt_comment' },
    );
  }

  /** The ratings recorded against a request - IS-CRM-FUNC-0125. */
  async ratingsForRequest(ticketId: number): Promise<any[]> {
    return await this.presalesCallKw<any[]>(
      'rating.rating', 'search_read',
      [[['res_model', '=', MigPreSalePage.TICKET_MODEL], ['res_id', '=', ticketId]],
        ['id', 'rating', 'consumed', 'create_date']],
      { limit: 50, order: 'id desc' },
    );
  }

  // ------------------------------------------------------------------ the mail queue

  /**
   * The mail queue entries for one request.
   *
   * The Pre-Sales instance has NO outgoing mail server and its scheduled jobs are stopped, so a
   * notification is PROVEN by its queue entry - recipient, subject and body - not by delivery.
   * Dev confirmed this is the evidence channel for the notification cases (CRM-12135, 2026-09-17).
   */
  async mailsForRequest(id: number): Promise<PreSaleMail[]> {
    const rows = await this.presalesCallKw<any[]>(
      'mail.mail', 'search_read',
      [[['model', '=', MigPreSalePage.TICKET_MODEL], ['res_id', '=', id]],
        ['state', 'subject', 'email_to', 'recipient_ids', 'body_html', 'date']],
      { limit: MigDataParityPage.MAX_LIMIT, order: 'id asc' },
    );
    return rows.map((m) => ({
      id: m.id,
      state: String(m.state ?? ''),
      subject: String(m.subject ?? ''),
      emailTo: m.email_to ? String(m.email_to) : '',
      recipientIds: (m.recipient_ids ?? []) as number[],
      bodyHtml: String(m.body_html ?? ''),
      date: String(m.date ?? ''),
    }));
  }

  // ------------------------------------------------------------------ CRM side - fixtures

  /**
   * Create the Opportunity a spec raises its request from.
   *
   * A spec builds its own Opportunity rather than borrowing a migrated one: the raise drops a log
   * note on whatever it is raised from, and a migrated record must come out of a test run exactly
   * as it went in. `deleteOpportunity` removes it in teardown.
   */
  async createOpportunity(name: string, expectedRevenue: number): Promise<number> {
    const id = await this.page.evaluate(
      async ({ name, expectedRevenue, field }) => {
        const r = await fetch('/web/dataset/call_kw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', method: 'call',
            params: {
              model: 'crm.lead', method: 'create',
              args: [{ name, type: 'opportunity', [field]: expectedRevenue }], kwargs: {},
            },
          }),
        });
        const j = await r.json();
        if (j.error) throw new Error(String((j.error.data || {}).message || j.error.message).slice(0, 300));
        return j.result as number;
      },
      { name, expectedRevenue, field: MigPreSalePage.THRESHOLD_FIELD },
    );
    return id;
  }

  /** Set the Expected Revenue Deal on an Opportunity - the value the raise gate reads. */
  async setExpectedRevenue(leadId: number, value: number): Promise<void> {
    await this.page.evaluate(
      async ({ leadId, value, field }) => {
        const r = await fetch('/web/dataset/call_kw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', method: 'call',
            params: { model: 'crm.lead', method: 'write', args: [[leadId], { [field]: value }], kwargs: {} },
          }),
        });
        const j = await r.json();
        if (j.error) throw new Error(String((j.error.data || {}).message || j.error.message).slice(0, 300));
        return true;
      },
      { leadId, value, field: MigPreSalePage.THRESHOLD_FIELD },
    );
  }

  /** Remove an Opportunity the spec created. Teardown only - never call it on migrated data. */
  async deleteOpportunity(leadId: number): Promise<void> {
    await this.page.evaluate(
      async ({ leadId }) => {
        const r = await fetch('/web/dataset/call_kw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', method: 'call',
            params: { model: 'crm.lead', method: 'unlink', args: [[leadId]], kwargs: {} },
          }),
        });
        const j = await r.json();
        if (j.error) throw new Error(String((j.error.data || {}).message || j.error.message).slice(0, 300));
        return true;
      },
      { leadId },
    );
  }

  /** Remove a request the spec created on the Pre-Sales Application. Teardown only. */
  async deleteRequest(ticketId: number): Promise<void> {
    await this.presalesCallKw(MigPreSalePage.TICKET_MODEL, 'unlink', [[ticketId]]);
  }

  /**
   * Remove every record this run made, on both servers, and say what it removed.
   *
   * Never throws: teardown runs after a failed assertion too, and a teardown that explodes hides
   * the real failure. It reports instead, so a leftover is visible in stdout.
   */
  async sweepByMarker(marker: string): Promise<{ requests: number[]; opportunities: number[]; errors: string[] }> {
    const out = { requests: [] as number[], opportunities: [] as number[], errors: [] as string[] };
    try {
      const reqs = await this.requestsByMarker(marker);
      for (const r of reqs) {
        try {
          await this.deleteRequest(r.id);
          out.requests.push(r.id);
        } catch (err) {
          out.errors.push(`request ${r.id}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      out.errors.push(`request sweep: ${(err as Error).message}`);
    }
    try {
      const leads = await this.searchRead<any>('crm.lead', [['name', 'like', marker]], ['id', 'name'], { limit: 50 });
      for (const l of leads) {
        try {
          await this.deleteOpportunity(l.id);
          out.opportunities.push(l.id);
        } catch (err) {
          out.errors.push(`opportunity ${l.id}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      out.errors.push(`opportunity sweep: ${(err as Error).message}`);
    }
    return out;
  }

  // ------------------------------------------------------------------ CRM side - the UI

  private readonly raiseButton = () =>
    this.page.locator('.o_form_statusbar button[name="2543"]');

  private readonly raiseButtonDisabled = () =>
    this.page.locator('.o_form_statusbar button[name="presale_request_below_threshold"]');

  private readonly ticketsStatButton = () =>
    this.page.locator('button[name="open_customer_tickets"]');

  private readonly dialog = () => this.page.locator('.modal-dialog .o_form_view').first();

  private readonly dialogSaveButton = () =>
    this.page.locator('.modal-dialog footer button[name="create_ticket"]');

  private readonly dialogCancelButton = () =>
    this.page.locator('.modal-dialog footer button[special="cancel"]')
      .or(this.page.locator('.modal-dialog footer button.o_form_button_cancel'))
      .or(this.page.locator('.modal-dialog footer button:has-text("Cancel")'))
      .first();

  /** The datetime picker the Meeting Time field opens. It is appended to the body, not to the dialog. */
  private readonly datePicker = () => this.page.locator('.bootstrap-datetimepicker-widget');

  private readonly logNotes = () => this.page.locator('.o_thread_message .o_thread_message_content');

  /**
   * Open one Opportunity's form by id on the CRM.
   *
   * The hash route alone is NOT enough: navigating from `#id=X` to the same `#id=X` is a
   * same-document move, so the web client keeps the record it already has and the form shows the
   * values from before the last write. That is how a re-read after changing Expected Revenue kept
   * reporting the OLD figure - and read the raise gate off it. A document reload is forced here.
   */
  async openOpportunity(leadId: number): Promise<void> {
    const origin = this.page.url().split('/web')[0];
    // A unique query string makes every open a FULL document load. Without it the second open of
    // the same record is a same-document hash move, the web client serves the copy it already has,
    // and the form answers with the values from before the last write.
    this.openCounter += 1;
    const target = `${origin}/web?presale_open=${this.openCounter}#id=${leadId}&model=crm.lead&view_type=form`;
    await this.page.goto(target, { waitUntil: 'domcontentloaded' });
    await this.page.locator('.o_form_view').first().waitFor({
      state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait,
    });
    await this.page.locator('.o_loading').waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.abnormalWait })
      .catch(() => { /* the spinner may never have rendered */ });
  }

  private readonly moreToggle = () =>
    this.page.locator('.o_form_statusbar .dropdown-toggle, .o_statusbar_buttons .dropdown-toggle');

  /**
   * Open the header's More menu when the buttons have overflowed into it.
   *
   * On an Opportunity with many buttons the raise control sits UNDER More, where `isVisible()` is
   * false until the menu is opened. Reading that as "the control is not there" turned a working
   * feature into a failed case once already - so every read of the control goes through here first.
   */
  private async revealHeaderButtons(): Promise<void> {
    const toggle = this.moreToggle().first();
    if ((await toggle.count()) === 0) return;
    const expanded = await toggle.getAttribute('aria-expanded').catch(() => null);
    if (expanded === 'true') return;
    await toggle.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => { /* already open */ });
    await this.page.waitForTimeout(CommonUtils.waitTimes.medium);
  }

  /** Is the live "Request SE support" control available to the user, inline or under More? */
  async isRaiseButtonVisible(): Promise<boolean> {
    if (await this.raiseButton().isVisible().catch(() => false)) return true;
    await this.revealHeaderButtons();
    return await this.raiseButton().isVisible().catch(() => false);
  }

  /** Is the greyed twin on screen - the control that only says why it is greyed? */
  async isRaiseButtonDisabledTwinVisible(): Promise<boolean> {
    if (await this.raiseButtonDisabled().isVisible().catch(() => false)) return true;
    await this.revealHeaderButtons();
    return await this.raiseButtonDisabled().isVisible().catch(() => false);
  }

  /** The tooltip the greyed twin carries. */
  async raiseDisabledTooltip(): Promise<string> {
    await this.revealHeaderButtons();
    return (await this.raiseButtonDisabled().getAttribute('title')) ?? '';
  }

  /**
   * Click the live control and wait for the raise dialog.
   *
   * The header's buttons are laid out by a NAKIVO script that runs AFTER the form renders: the raise
   * control is drawn INLINE for about half a second and is then moved into the More overflow. Probing
   * `isVisible()` once, inside that opening window, answers "visible" - so the reveal is skipped, and
   * the click that follows then waits on a button that has already moved. Playwright retries that
   * click until the TEST times out; on 2026-09-23 that cost TC-40 its whole 15-minute budget, and the
   * error surfaced far from here (at the next `locator.fill`), which is why it read as a fill bug.
   *
   * So do not decide once. Re-check and re-reveal on every attempt until the dialog is actually up.
   */
  async openRaiseDialog(): Promise<void> {
    const deadline = Date.now() + MigPreSalePage.RAISE_OPEN_BUDGET_MS;
    let attempts = 0;
    while (Date.now() < deadline) {
      attempts += 1;
      if (!(await this.raiseButton().isVisible().catch(() => false))) {
        await this.revealHeaderButtons();
      }
      // A short click budget on purpose: if the button moved between the check and the click, fail
      // fast and take the next attempt - which reveals More again - instead of blocking on a stale one.
      await this.raiseButton().click({ timeout: CommonUtils.waitTimes.extraLong }).catch(() => { /* it overflowed mid-attempt */ });
      if (await this.dialog().isVisible().catch(() => false)) {
        await this.dialog().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
        return;
      }
      await this.page.waitForTimeout(CommonUtils.waitTimes.medium);
    }
    throw new Error(
      `The raise dialog never opened after ${attempts} attempt(s) in ` +
      `${MigPreSalePage.RAISE_OPEN_BUDGET_MS}ms - the "Request SE support" control was neither inline ` +
      'nor reachable under the header More menu.',
    );
  }

  /** The raise dialog's field names, in the order the dialog renders them. */
  async dialogFieldOrder(): Promise<string[]> {
    const names = await this.dialog().locator('.o_field_widget[name]').evaluateAll(
      (nodes) => nodes.map((n) => n.getAttribute('name') ?? ''),
    );
    return names.filter(Boolean);
  }

  /** The dialog fields Odoo marks required, in render order. */
  async dialogRequiredFieldNames(): Promise<string[]> {
    const names = await this.dialog().locator('.o_field_widget.o_required_modifier[name]').evaluateAll(
      (nodes) => nodes.map((n) => n.getAttribute('name') ?? ''),
    );
    return names.filter(Boolean);
  }

  /** The three assistance needs the dialog offers, as a user reads them. */
  async dialogSupportTypeOptions(): Promise<string[]> {
    const options = await this.dialog().locator('select[name="support_type"] option').evaluateAll(
      (nodes) => nodes.map((n) => (n.textContent ?? '').trim()),
    );
    return options.filter((o) => o.length > 0);
  }

  /** Fill the raise dialog. Every argument is optional so a spec can leave one out on purpose. */
  async fillRaiseDialog(values: {
    subject?: string;
    description?: string;
    supportType?: string;
    meetingTime?: string;
    meetingLink?: string;
  }): Promise<void> {
    const d = this.dialog();
    if (values.subject !== undefined) {
      await d.locator('.o_field_widget[name="subject"] input, input[name="subject"]').first().fill(values.subject);
    }
    if (values.meetingTime !== undefined) {
      // Meeting Time is a datetime widget: <div class="o_datepicker" name="meeting_time"> wrapping an
      // <input class="o_datepicker_input" name="meeting_time">. The input itself fills in ~150ms - the
      // fill was never the problem. Dismissing the picker with ESCAPE is: inside a modal, Odoo 12
      // reads Escape as "close the dialog", so the whole raise dialog goes away and every field after
      // this one waits on a locator that can no longer resolve. That is exactly how TC-40 burned its
      // 15-minute timeout and reported it against the NEXT field's `.fill()`.
      // Blur instead - the picker closes with the focus and the dialog stays up.
      const meetingTime = d.locator('.o_datepicker[name="meeting_time"] input, input[name="meeting_time"]').first();
      await meetingTime.fill(values.meetingTime);
      await meetingTime.blur();
      await this.datePicker().waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.abnormalWait })
        .catch(() => { /* the picker may never have opened */ });
    }
    if (values.description !== undefined) {
      await d.locator('textarea[name="description"], input[name="description"]').first().fill(values.description);
    }
    if (values.meetingLink !== undefined) {
      await d.locator('input[name="meeting_link"]').first().fill(values.meetingLink);
    }
    if (values.supportType !== undefined) {
      await d.locator('select[name="support_type"]').first().selectOption({ label: values.supportType });
    }
  }

  /**
   * What the Meeting Time input actually holds right now.
   *
   * A case that claims to test "Meeting Time left blank" must PROVE the field is blank at the
   * moment it saves. Choosing an online support type may fire an onchange that fills it - in which
   * case the case tested nothing, and the save succeeding is correct behaviour, not a defect.
   */
  async meetingTimeValue(): Promise<string> {
    const input = this.dialog()
      .locator('.o_datepicker[name="meeting_time"] input, input[name="meeting_time"]').first();
    return ((await input.inputValue().catch(() => '')) || '').trim();
  }

  /**
   * Press Save on the raise dialog.
   *
   * `timeout` bounds the CLICK. It matters when a case presses Save twice on purpose (TC-09): the
   * first save closes the dialog, so the second click finds no button and - with Playwright's default
   * budget - waits out the entire test timeout instead of failing in seconds.
   */
  async saveRaiseDialog(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<void> {
    await this.dialogSaveButton().click({ timeout });
  }

  /**
   * Press Cancel on the raise dialog and wait for it to go.
   *
   * A case that tries several INVALID combinations needs a FRESH dialog per attempt, because
   * `fillRaiseDialog()` only writes the fields it is given - it never blanks one - and `support_type`
   * offers no empty option at all, so a value once chosen cannot be taken back inside the same dialog.
   * Mutating one dialog across attempts silently carries the previous attempt's values forward: that
   * is how TC-07 turned its third "must be refused" attempt into a successful save on 2026-09-24,
   * created a real request, and then hung for 15 minutes filling a dialog that had already closed.
   */
  async cancelRaiseDialog(): Promise<void> {
    await this.dialogCancelButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.dialog().waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.abnormalWait })
      .catch(() => { /* already gone */ });
  }

  /**
   * The Odoo warning/validation popup that a refused save can raise, if one is on screen.
   *
   * Not every refusal flags a field. Some are a MODAL instead - "Please input meeting time!" is one,
   * and the spec that only read `.o_field_invalid` saw an empty list and concluded nothing was wrong.
   * The popup also sits ON TOP of the raise dialog, so any later click on it (Cancel, Save) times out
   * until the popup is dismissed. Both are why these two helpers exist.
   */
  // `.modal-dialog:not(:has(.o_form_view))` matched NOTHING: Playwright does not support :has()
  // nested inside :not(). The popup was on screen the whole time - "Odoo Server Error - Warning /
  // Please input meeting time!" - and the spec reported "(no popup)". filter({hasNot}) is the
  // supported form and does what the selector was meant to say: the modal that is not the form.
  private readonly alertModal = () =>
    this.page.locator('.modal-dialog')
      .filter({ hasNot: this.page.locator('.o_form_view') })
      .first();

  /**
   * The text of that popup, or '' when none appears within `timeout`.
   *
   * It must WAIT. The popup is rendered after the server answers the save, so reading immediately
   * after the click returns '' every time and the spec concludes "no popup" while the warning is
   * sitting on the screen - measured 2026-10-05 against "Please input meeting time!".
   */
  async alertText(timeout: number = CommonUtils.waitTimes.searchOppWait): Promise<string> {
    const modal = this.alertModal();
    const appeared = await modal.waitFor({ state: 'visible', timeout })
      .then(() => true).catch(() => false);
    if (!appeared) return '';
    return ((await modal.innerText().catch(() => '')) || '').trim();
  }

  /** Dismiss the popup (Ok / Close), so the dialog underneath is clickable again. */
  async dismissAlert(): Promise<void> {
    const modal = this.alertModal();
    if (!(await modal.isVisible().catch(() => false))) return;
    const btn = modal.locator('footer button, .modal-footer button').first();
    await btn.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => { /* already gone */ });
    await modal.waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.abnormalWait })
      .catch(() => { /* already gone */ });
  }

  /** Is the raise dialog still on screen? A refused save keeps it open. */
  async isRaiseDialogOpen(): Promise<boolean> {
    return await this.dialog().isVisible().catch(() => false);
  }

  /** The field Odoo flags as invalid after a refused save, if any. */
  async dialogInvalidFieldNames(): Promise<string[]> {
    const names = await this.dialog().locator('.o_field_invalid[name], .o_field_widget.o_field_invalid[name]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('name') ?? ''));
    return names.filter(Boolean);
  }

  /** Wait until the dialog closes - the signal that the save reached the second server. */
  async waitForRaiseDialogClosed(timeout: number = MigPreSalePage.RAISE_BUDGET_MS): Promise<void> {
    await this.dialog().waitFor({ state: 'hidden', timeout });
  }

  /** Is the Tickets counter on screen at all? It is hidden while the count is zero. */
  async isTicketsStatVisible(): Promise<boolean> {
    return await this.ticketsStatButton().isVisible().catch(() => false);
  }

  /** The number the Tickets counter shows. */
  async ticketsStatCount(): Promise<number> {
    const text = await this.ticketsStatButton().locator('.o_stat_value, .o_field_widget').first().innerText();
    const n = parseInt(text.replace(/[^0-9]/g, ''), 10);
    return Number.isNaN(n) ? 0 : n;
  }

  /** The newest log-note body on the record currently open. */
  async latestLogNote(): Promise<string> {
    const notes = this.logNotes();
    if ((await notes.count()) === 0) return '';
    return (await notes.first().innerText()).trim();
  }

  /** The log notes on one Opportunity, read over RPC - narrow by construction (one record). */
  async logNotesForLead(leadId: number): Promise<string[]> {
    const rows = await this.readKw<any[]>(
      'mail.message', 'search_read',
      [[['model', '=', 'crm.lead'], ['res_id', '=', leadId]], ['body', 'date']],
      { limit: 30, order: 'id desc' },
    );
    return rows.map((m) => String(m.body ?? ''));
  }

  /** The user-visible page text, for the "no platform or version name leaks" case. */
  async visibleBodyText(): Promise<string> {
    return await this.page.locator('body').innerText();
  }

  // ------------------------------------------------------------------ the helpdesk inside the CRM

  /**
   * Open the requests of the Opportunity currently on screen.
   *
   * The Tickets control opens the helpdesk INSIDE the CRM page - the whole point of
   * IS-CRM-FUNC-0063 - so this waits for the embedded surface rather than for a new tab.
   */
  async openTicketsPanel(): Promise<void> {
    await this.ticketsStatButton().click();
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForTimeout(CommonUtils.waitTimes.extraLong);
  }

  /**
   * Does a sign-in form stand between the user and the embedded helpdesk?
   *
   * Looks in the CRM page AND in every frame it holds: the embedded helpdesk renders in a frame,
   * and a login form inside that frame is exactly the "second login" the requirement is about.
   */
  async embeddedLoginFormVisible(): Promise<boolean> {
    for (const frame of this.page.frames()) {
      const count = await frame.locator('input[type="password"]').count().catch(() => 0);
      if (count > 0) {
        const visible = await frame.locator('input[type="password"]').first().isVisible().catch(() => false);
        if (visible) return true;
      }
    }
    return false;
  }

  /** The text of the embedded helpdesk surface, or the page text when it renders inline. */
  async embeddedText(): Promise<string> {
    const frames = this.page.frames();
    let best = '';
    for (const frame of frames) {
      const text = await frame.locator('body').innerText().catch(() => '');
      if (text.length > best.length) best = text;
    }
    return best;
  }

  /** How many frames the CRM page holds - the embedded helpdesk adds one. */
  frameCount(): number {
    return this.page.frames().length;
  }
}
