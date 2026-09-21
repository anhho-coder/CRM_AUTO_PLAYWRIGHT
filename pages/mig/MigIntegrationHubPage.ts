import { MigDataParityPage } from './MigDataParityPage';
import { CommonUtils } from '@helpers/common.utils';
import { hubConfig } from '@config/integration-hub.config';
import type { Page } from '@playwright/test';

/** One row of the outbound queue, as the specs read it. */
export interface QueueEntry {
  id: number;
  syncEvent: string | false;
  leadId: number | false;
  createDate: string;
  createUid: number | false;
  createUidLabel: string;
}

/** What the simulated marketing platform recorded for one reference. */
export interface SimulatorRecord {
  contactUpserts: number;
  automationTriggers: number;
  raw: unknown;
}

/**
 * Integration Hub reader for the O12 Migration server.
 *
 * Extends the read-only MigDataParityPage, so every Odoo read it makes inherits that class's
 * guards: only search/read methods, never an empty domain, and a hard limit of MAX_LIMIT records.
 * The hub's own entry points are NOT Odoo calls - they are HTTP requests to the endpoints the
 * delivery owes under IS-CRM-SUPP-0011 / IS-CRM-SUPP-0012, and every one of those methods throws a
 * clear BLOCKED error while the endpoint is still undelivered rather than guessing a URL.
 */
export class MigIntegrationHubPage extends MigDataParityPage {
  /** The outbound queue the CRM writes an entry into for each carried sync event. */
  static readonly QUEUE_MODEL = 'x_lead_for_activecampa';

  /** The field carrying the sync-event label. A plain char field - the CRM defines no selection list. */
  static readonly SYNC_EVENT_FIELD = 'x_studio_activecampaign_event';

  /** Back-reference to the originating lead. */
  static readonly LEAD_REF_FIELD = 'x_studio_lead_id';

  /**
   * The twelve sync events in active use (IS-CRM-FUNC-0226-01 .. -12).
   * Labels are carried VERBATIM from the CRM - including the "Change Saleperson" spelling.
   */
  static readonly CARRIED_SYNC_EVENTS: readonly string[] = [
    'archived',
    'Lead qualified',
    'Email Changed',
    'Stop Automation',
    'Customer renewed/upgraded',
    'Partner promoted',
    'Change Saleperson',
    'Contact Updated',
    'New customer',
    'New partner sign-up',
    'Partner activated',
    'Sale Order Updated',
  ];

  /** The two suppression events - the ones that stop or withdraw marketing contact. */
  static readonly SUPPRESSION_EVENTS: readonly string[] = ['archived', 'Stop Automation'];

  constructor(page: Page) {
    super(page);
  }

  // ---------------------------------------------------------------- Odoo-side reads

  /**
   * Is the outbound queue model present on this server at all?
   *
   * crm-mig is an Odoo 12 COMMUNITY base and the queue is a Studio model that came from the
   * Enterprise side, so it may legitimately be absent. An absent model and an empty model look
   * identical to a naive count - callers must branch on this before reading any row count.
   */
  async isQueueModelPresent(): Promise<boolean> {
    try {
      await this.readKw<Record<string, unknown>>(MigIntegrationHubPage.QUEUE_MODEL, 'fields_get');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Only an "this model does not exist" answer means ABSENT. A transport / auth failure must
      // NEVER be reported as absence: an unreachable server and a server without the model look
      // identical from here, and reading one as the other is how a green-looking lie gets recorded.
      // Odoo 12 answers a schema read for an unknown model with a bare KeyError whose whole message
      // is the model name, so match that shape too - not just the prose variants.
      // The message can carry a remote stack, so judge the FIRST line only.
      const firstLine = msg.split('\n')[0].trim();
      const bareKeyError = firstLine.endsWith(MigIntegrationHubPage.QUEUE_MODEL);
      if (bareKeyError || /doesn'?t exist|does not exist|KeyError|Object .* not found|MissingError/i.test(msg)) {
        return false;
      }
      throw new Error(
        `Could not determine whether ${MigIntegrationHubPage.QUEUE_MODEL} is present - the server did not ` +
          `answer a schema read. This is an environment failure, not a product result: ${msg}`,
      );
    }
  }

  /**
   * Confirm the browser session is really authenticated against this server before anything is
   * read. Throws with a SKIPPED-prefixed reason when it is not, so an unreachable or logged-out
   * environment can never be mistaken for "the data is not there".
   */
  async assertSessionUsable(): Promise<void> {
    let authenticated = false;
    try {
      authenticated = await this.isAuthenticatedSession();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`SKIPPED - the migration server did not answer a session check (environment failure): ${msg}`);
    }
    if (!authenticated) {
      throw new Error(
        'SKIPPED - the migration server session is not authenticated, so nothing below could be read. ' +
          'This is an environment failure, not a product result.',
      );
    }
  }

  /** The queue model's full field schema, keyed by field name. */
  async readQueueFieldSchema(): Promise<Record<string, { string?: string; type?: string }>> {
    return await this.readKw<Record<string, { string?: string; type?: string }>>(
      MigIntegrationHubPage.QUEUE_MODEL,
      'fields_get',
    );
  }

  /**
   * Split the queue model's fields into the Studio-custom set and Odoo's technical set.
   * Custom fields are the `x_`-prefixed ones the integration actually carries.
   */
  async countQueueFields(): Promise<{ total: number; custom: string[]; technical: string[] }> {
    const schema = await this.readQueueFieldSchema();
    const names = Object.keys(schema);
    const custom = names.filter((n) => n.startsWith('x_')).sort();
    const technical = names.filter((n) => !n.startsWith('x_')).sort();
    return { total: names.length, custom, technical };
  }

  /**
   * Queue rows created on or after `sinceIso`.
   * The date range is the narrow filter every read here is required to carry.
   */
  async readQueueEntriesSince(sinceIso: string, limit: number = 500): Promise<QueueEntry[]> {
    const rows = await this.searchRead<Record<string, any>>(
      MigIntegrationHubPage.QUEUE_MODEL,
      [['create_date', '>=', sinceIso]],
      ['id', MigIntegrationHubPage.SYNC_EVENT_FIELD, MigIntegrationHubPage.LEAD_REF_FIELD, 'create_date', 'create_uid'],
      { limit, order: 'create_date desc' },
    );
    return rows.map((r) => ({
      id: r.id as number,
      syncEvent: r[MigIntegrationHubPage.SYNC_EVENT_FIELD] ?? false,
      leadId: Array.isArray(r[MigIntegrationHubPage.LEAD_REF_FIELD])
        ? r[MigIntegrationHubPage.LEAD_REF_FIELD][0]
        : false,
      createDate: String(r.create_date ?? ''),
      createUid: Array.isArray(r.create_uid) ? r.create_uid[0] : false,
      createUidLabel: Array.isArray(r.create_uid) ? String(r.create_uid[1]) : '',
    }));
  }

  /** Queue rows whose sync-event label is exactly `label`, since `sinceIso`. */
  async countQueueEntriesForEvent(label: string, sinceIso: string): Promise<number> {
    return await this.searchCount(MigIntegrationHubPage.QUEUE_MODEL, [
      ['create_date', '>=', sinceIso],
      [MigIntegrationHubPage.SYNC_EVENT_FIELD, '=', label],
    ]);
  }

  /** Distinct sync-event labels observed since `sinceIso`, with a row count each. */
  async observedSyncEventLabels(sinceIso: string, limit: number = 500): Promise<Map<string, number>> {
    const entries = await this.readQueueEntriesSince(sinceIso, limit);
    const observed = new Map<string, number>();
    for (const e of entries) {
      const label = e.syncEvent === false ? '(empty)' : String(e.syncEvent);
      observed.set(label, (observed.get(label) ?? 0) + 1);
    }
    return observed;
  }

  /** Labels present in the queue that are NOT one of the twelve carried events. */
  static unknownLabels(observed: Map<string, number>): string[] {
    return [...observed.keys()].filter(
      (label) => !MigIntegrationHubPage.CARRIED_SYNC_EVENTS.includes(label),
    );
  }

  /** The field name the clean-set rule already ruled dormant (IS-CRM-FUNC-0237). */
  static readonly DORMANT_FIELD = 'x_studio_field_d29wC';

  /**
   * How many queue rows carry a real value in the dormant placeholder field, within a date range.
   *
   * On an Odoo INTEGER field `!= False` matches EVERY row, so the domain must compare against 0.
   * Getting that wrong turns "nothing carries a value" into "everything does".
   */
  async countRowsWithDormantValue(sinceIso: string): Promise<number> {
    return await this.searchCount(MigIntegrationHubPage.QUEUE_MODEL, [
      ['create_date', '>=', sinceIso],
      [MigIntegrationHubPage.DORMANT_FIELD, '!=', 0],
    ]);
  }

  /** Total queue rows in the window, so a "0 carry a value" result can be shown to be meaningful. */
  async countRowsSince(sinceIso: string): Promise<number> {
    return await this.searchCount(MigIntegrationHubPage.QUEUE_MODEL, [['create_date', '>=', sinceIso]]);
  }

  /** Field names declared by any model, sorted - the shape check for IS-CRM-FUNC-0234. */
  async readModelFieldNames(model: string): Promise<string[]> {
    const schema = await this.readKw<Record<string, unknown>>(model, 'fields_get');
    return Object.keys(schema).sort();
  }

  /**
   * The carried custom fields: every `x_`-prefixed field except the one already ruled dormant.
   * This is the set IS-CRM-FUNC-0227 counts (70 declared - 1 dormant = 69 carried).
   */
  async readCarriedCustomFields(): Promise<{ declared: string[]; carried: string[]; dormantDeclared: boolean }> {
    const { custom } = await this.countQueueFields();
    const dormantDeclared = custom.includes(MigIntegrationHubPage.DORMANT_FIELD);
    return {
      declared: custom,
      carried: custom.filter((f) => f !== MigIntegrationHubPage.DORMANT_FIELD),
      dormantDeclared,
    };
  }

  /** Leads whose name contains `marker`, newest first. Used to count what an intake produced. */
  async readLeadsByNameMarker(marker: string, limit: number = 500): Promise<
    Array<{ id: number; name: string; emailFrom: string | false; createDate: string; createUidLabel: string }>
  > {
    const rows = await this.searchRead<Record<string, any>>(
      'crm.lead',
      [['name', 'like', marker]],
      ['id', 'name', 'email_from', 'create_date', 'create_uid'],
      { limit, order: 'create_date desc' },
    );
    return rows.map((r) => ({
      id: r.id as number,
      name: String(r.name ?? ''),
      emailFrom: r.email_from ?? false,
      createDate: String(r.create_date ?? ''),
      createUidLabel: Array.isArray(r.create_uid) ? String(r.create_uid[1]) : '',
    }));
  }

  /** How many leads carry `emailMarker` in their email address. */
  async countLeadsByEmail(emailMarker: string): Promise<number> {
    return await this.searchCount('crm.lead', [['email_from', 'like', emailMarker]]);
  }

  // ---------------------------------------------------- hub entry points (IS-CRM-SUPP-0011/0012)

  /** Throw a BLOCKED error naming the requirement that owes the missing endpoint. */
  private assertEndpoint(url: string, auth: string, requirement: string, what: string): void {
    if (!url || url.trim() === '') {
      throw new Error(
        `BLOCKED - ${what} is not available: the delivery has not provided it (${requirement}, open on CRM-12069). ` +
          'Record this run as SKIPPED with this reason - it is neither a pass nor a product failure.',
      );
    }
    if (!auth || auth.trim() === '') {
      throw new Error(
        `BLOCKED - ${what} has no stated authentication mechanism (${requirement} requires the URL AND its ` +
          'authentication). Record this run as SKIPPED with this reason.',
      );
    }
  }

  /** Split a configured "Header: value" auth string into a request header pair. */
  private authHeader(auth: string): Record<string, string> {
    const idx = auth.indexOf(':');
    if (idx > 0) {
      return { [auth.slice(0, idx).trim()]: auth.slice(idx + 1).trim() };
    }
    return { Authorization: auth.trim() };
  }

  /**
   * Submit one web-form lead through the hub's inbound entry point, as the web-form delivery
   * service would. Throws BLOCKED while IS-CRM-SUPP-0011 is undelivered.
   */
  async submitInboundLead(payload: Record<string, unknown>): Promise<{ status: number; body: string }> {
    this.assertEndpoint(
      hubConfig.inboundSimulationUrl,
      hubConfig.inboundSimulationAuth,
      'IS-CRM-SUPP-0011',
      'the inbound simulation entry point',
    );
    const response = await this.page.request.post(hubConfig.inboundSimulationUrl, {
      headers: { 'content-type': 'application/json', ...this.authHeader(hubConfig.inboundSimulationAuth) },
      data: payload,
      timeout: CommonUtils.waitTimes.abnormalWait,
    });
    return { status: response.status(), body: (await response.text()).slice(0, 2000) };
  }

  /**
   * Enqueue one outbound queue entry through the hub's enqueue entry point.
   * Throws BLOCKED while IS-CRM-SUPP-0011 is undelivered.
   */
  async enqueueOutboundEntry(payload: Record<string, unknown>): Promise<{ status: number; body: string }> {
    this.assertEndpoint(
      hubConfig.outboundEnqueueUrl,
      hubConfig.outboundEnqueueAuth,
      'IS-CRM-SUPP-0011',
      'the outbound enqueue entry point',
    );
    const response = await this.page.request.post(hubConfig.outboundEnqueueUrl, {
      headers: { 'content-type': 'application/json', ...this.authHeader(hubConfig.outboundEnqueueAuth) },
      data: payload,
      timeout: CommonUtils.waitTimes.abnormalWait,
    });
    return { status: response.status(), body: (await response.text()).slice(0, 2000) };
  }

  /**
   * Ask the hub to re-process a queue entry that has already been delivered.
   * Used by the delivered-once check (IS-CRM-REL-0009).
   */
  async reprocessQueueEntry(queueEntryRef: string): Promise<{ status: number; body: string }> {
    this.assertEndpoint(
      hubConfig.outboundEnqueueUrl,
      hubConfig.outboundEnqueueAuth,
      'IS-CRM-SUPP-0011',
      'the outbound enqueue entry point (re-delivery)',
    );
    const response = await this.page.request.post(hubConfig.outboundEnqueueUrl, {
      headers: { 'content-type': 'application/json', ...this.authHeader(hubConfig.outboundEnqueueAuth) },
      data: { reference: queueEntryRef, reprocess: true },
      timeout: CommonUtils.waitTimes.abnormalWait,
    });
    return { status: response.status(), body: (await response.text()).slice(0, 2000) };
  }

  /**
   * Read what the simulated marketing platform recorded for one reference: how many contact
   * create/update calls it received and how many automation triggers were requested.
   * Throws BLOCKED while IS-CRM-SUPP-0012 is undelivered.
   */
  async readSimulatorRecord(reference: string): Promise<SimulatorRecord> {
    this.assertEndpoint(
      hubConfig.simulatedMarketingUrl,
      hubConfig.simulatedMarketingAuth,
      'IS-CRM-SUPP-0012',
      'the simulated marketing-platform endpoint',
    );
    const url = `${hubConfig.simulatedMarketingUrl.replace(/\/+$/, '')}/deliveries?reference=${encodeURIComponent(reference)}`;
    const response = await this.page.request.get(url, {
      headers: this.authHeader(hubConfig.simulatedMarketingAuth),
      timeout: CommonUtils.waitTimes.abnormalWait,
    });
    const text = await response.text();
    let parsed: any = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(
        `The simulated marketing-platform endpoint did not return JSON for reference "${reference}". ` +
          `Status ${response.status()}, body starts: ${text.slice(0, 200)}`,
      );
    }
    return {
      contactUpserts: Number(parsed.contactUpserts ?? parsed.contact_upserts ?? 0),
      automationTriggers: Number(parsed.automationTriggers ?? parsed.automation_triggers ?? 0),
      raw: parsed,
    };
  }
}
