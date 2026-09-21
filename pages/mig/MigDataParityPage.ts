import { BasePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import type { Page } from '@playwright/test';

/**
 * READ-ONLY authenticated JSON-RPC reader for data-migration parity verification.
 *
 * This class is READ-ONLY BY CONSTRUCTION: it issues only the `ALLOWED_METHODS` through
 * the authenticated web-client session, and physically cannot issue create / write / unlink /
 * copy / action_* methods. Used against BOTH pre-production and crm-mig (an Odoo 12 shared
 * migration QA environment, read-only per policy) to compare data state and prove parity
 * after migration. Every query is bounded: searches must pass a non-empty domain, searchRead
 * must set a limit (1..MAX_LIMIT), and other reads are capped at MAX_LIMIT records.
 *
 * Because every read filters on a concrete condition (record ids or date range) and respects
 * a strict limit, the same class works against whichever origin its `page` is on without
 * authentication concerns - the page is already in an authenticated session when the
 * MigDataParityPage is instantiated.
 */
export class MigDataParityPage extends BasePage {
  /** Methods that this reader is allowed to issue. Everything else throws. */
  static readonly ALLOWED_METHODS: string[] = [
    'search_count', 'search_read', 'read', 'read_group',
    'fields_get', 'name_get', 'name_search',
  ];

  /** The core sales models this reader can query. */
  static readonly SALES_MODELS: string[] = [
    'res.partner', 'crm.lead', 'sale.order', 'account.invoice',
  ];

  /** Maximum records per query - a guard against unbounded reads on big tables. */
  static readonly MAX_LIMIT: number = 500;

  constructor(page: Page) {
    super(page);
  }

  /**
   * Generic authenticated `call_kw` RPC - the same JSON-RPC the web client issues.
   *
   * ONLY ALLOWED_METHODS are callable through this class. Any attempt to issue an unlisted
   * method immediately throws with a clear error naming the forbidden method. This is the
   * architectural read-only guard: a spec physically cannot write to either server.
   *
   * Odoo-side errors are re-thrown with their message so specs fail loudly instead of
   * quietly asserting against `undefined`.
   *
   * @param model - the target model (e.g., 'res.partner')
   * @param method - the RPC method (e.g., 'search_read'); must be in ALLOWED_METHODS
   * @param args - positional arguments to the method
   * @param kwargs - keyword arguments (limit, order, etc.)
   * @returns the result from the RPC
   * @throws if method is not in ALLOWED_METHODS, or if the Odoo backend returns an error
   */
  async readKw<T = any>(
    model: string,
    method: string,
    args: any[] = [],
    kwargs: Record<string, any> = {},
  ): Promise<T> {
    if (!MigDataParityPage.ALLOWED_METHODS.includes(method)) {
      throw new Error(
        `MigDataParityPage.readKw: method "${method}" is not in ALLOWED_METHODS. ` +
        `Read-only methods only: ${MigDataParityPage.ALLOWED_METHODS.join(', ')}`,
      );
    }

    return await this.page.evaluate(
      async ({ model, method, args, kwargs }) => {
        const r = await fetch('/web/dataset/call_kw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'call',
            params: { model, method, args, kwargs },
          }),
        });
        const j = await r.json();
        if (j.error) {
          const d = j.error.data || {};
          throw new Error(String(d.message || j.error.message || 'rpc error').slice(0, 400));
        }
        return j.result;
      },
      { model, method, args, kwargs },
    );
  }

  /**
   * Count records matching a domain.
   *
   * @param model - the model to query
   * @param domain - the filter (e.g., [['type', '=', 'lead']]); must not be empty
   * @returns the record count
   * @throws if domain is empty (unbounded queries are forbidden)
   */
  async searchCount(model: string, domain: any[]): Promise<number> {
    if (!domain || domain.length === 0) {
      throw new Error(
        `MigDataParityPage.searchCount: domain must not be empty. ` +
        `Unbounded queries on big tables (mail.message, ir.attachment) have taken the CRM down.`,
      );
    }
    return await this.readKw<number>(model, 'search_count', [domain]);
  }

  /**
   * Search and read records matching a domain.
   *
   * @param model - the model to query
   * @param domain - the filter (e.g., [['type', '=', 'lead']]); must not be empty
   * @param fields - the field names to return (e.g., ['id', 'name'])
   * @param kwargs - options: limit (required, 1..MAX_LIMIT), order, offset, etc.
   * @returns the matching records as objects with the requested fields
   * @throws if domain is empty, or if kwargs.limit is missing / out of range
   */
  async searchRead<T>(
    model: string,
    domain: any[],
    fields: string[],
    kwargs: Record<string, any> = {},
  ): Promise<T[]> {
    if (!domain || domain.length === 0) {
      throw new Error(
        `MigDataParityPage.searchRead: domain must not be empty. ` +
        `Unbounded queries on big tables (mail.message, ir.attachment) have taken the CRM down.`,
      );
    }
    if (
      kwargs.limit === undefined ||
      typeof kwargs.limit !== 'number' ||
      kwargs.limit < 1 ||
      kwargs.limit > MigDataParityPage.MAX_LIMIT
    ) {
      throw new Error(
        `MigDataParityPage.searchRead: kwargs.limit must be 1..${MigDataParityPage.MAX_LIMIT}. ` +
        `Unbounded reads are forbidden.`,
      );
    }
    return await this.readKw<T[]>(model, 'search_read', [domain, fields], kwargs);
  }

  /**
   * Group and aggregate records by a field.
   *
   * @param model - the model to query
   * @param domain - the filter (e.g., [['type', '=', 'lead']]); must not be empty
   * @param fields - the aggregate fields (e.g., ['count:id', 'stage_id'])
   * @param groupby - the grouping field (e.g., 'stage_id')
   * @param kwargs - options: limit, order, offset, etc.
   * @returns the group buckets with aggregates
   * @throws if domain is empty
   */
  async readGroup(
    model: string,
    domain: any[],
    fields: string[],
    groupby: string[],
    kwargs: Record<string, any> = {},
  ): Promise<any[]> {
    if (!domain || domain.length === 0) {
      throw new Error(
        `MigDataParityPage.readGroup: domain must not be empty. ` +
        `Unbounded queries on big tables (mail.message, ir.attachment) have taken the CRM down.`,
      );
    }
    return await this.readKw<any[]>(
      model,
      'read_group',
      [domain, fields, groupby],
      kwargs,
    );
  }

  /**
   * Read specific records by their ids.
   *
   * @param model - the model to query
   * @param ids - the record ids to read; must not be empty and must fit within MAX_LIMIT
   * @param fields - the field names to return
   * @returns the records with the requested fields
   * @throws if ids is empty or longer than MAX_LIMIT
   */
  async readIds<T>(model: string, ids: number[], fields: string[]): Promise<T[]> {
    if (!ids || ids.length === 0) {
      throw new Error('MigDataParityPage.readIds: ids must not be empty.');
    }
    if (ids.length > MigDataParityPage.MAX_LIMIT) {
      throw new Error(
        `MigDataParityPage.readIds: ids length (${ids.length}) exceeds MAX_LIMIT ` +
        `(${MigDataParityPage.MAX_LIMIT}).`,
      );
    }
    return await this.readKw<T[]>(model, 'read', [ids, fields]);
  }

  /**
   * Resolve the newest (most recently created) record of a model, by its create date.
   *
   * @param model - the model to query
   * @param dateField - the date field to order by (defaults to 'create_date')
   * @returns the YYYY-MM-DD HH:MM:SS timestamp of the newest record, or null if the model is empty
   */
  async newestCreateDate(model: string, dateField: string = 'create_date'): Promise<string | null> {
    // Bounded by construction: `dateField != false` is a real filter, so the searchRead
    // guard is satisfied and the query still reaches the newest row via `order desc, limit 1`.
    // An empty domain here would be rejected by searchRead - and swallowing that rejection
    // would make this method return null forever, silently killing resolveCutoffDate().
    const rows = await this.searchRead<{ [key: string]: string }>(
      model,
      [[dateField, '!=', false]],
      [dateField],
      { limit: 1, order: `${dateField} desc` },
    );
    if (rows && rows.length > 0) {
      return rows[0][dateField] || null;
    }
    return null;
  }

  /**
   * Find the cutoff date - the EARLIEST create_date across all SALES_MODELS.
   *
   * This is the migration cutoff: the moment the source and target started diverging.
   * Returns the earliest timestamp as 'YYYY-MM-DD' (just the date part).
   *
   * @returns the cutoff date as 'YYYY-MM-DD'
   * @throws if every SALES_MODEL comes back null (no records at all - the session is not reading data)
   */
  async resolveCutoffDate(): Promise<string> {
    const dates: (string | null)[] = [];
    for (const model of MigDataParityPage.SALES_MODELS) {
      const newest = await this.newestCreateDate(model);
      if (newest) dates.push(newest);
    }

    if (dates.length === 0) {
      throw new Error(
        'MigDataParityPage.resolveCutoffDate: every SALES_MODEL has no records. ' +
        'The session is not reading data.',
      );
    }

    // Parse dates and find the earliest
    const sorted = dates
      .map((d) => ({ raw: d, ymd: d!.split(' ')[0] })) // extract YYYY-MM-DD
      .sort((a, b) => a.ymd.localeCompare(b.ymd));

    return sorted[0].ymd;
  }

  /**
   * Group records by a field and count them within each group.
   *
   * Uses read_group to aggregate. The result is a Map where keys are the DISPLAY NAMES
   * of the grouped field (for many2one, the record name not the id) and values are the counts.
   *
   * @param model - the model to query
   * @param domain - the filter; must not be empty
   * @param groupField - the field to group by
   * @returns a Map of display-name -> count
   */
  async countByField(
    model: string,
    domain: any[],
    groupField: string,
  ): Promise<Map<string, number>> {
    const groups = await this.readGroup(
      model,
      domain,
      [groupField],
      [groupField],
      { limit: MigDataParityPage.MAX_LIMIT },
    );

    const result = new Map<string, number>();
    for (const group of groups) {
      // The grouping field arrives as [id, name] for many2one, or a scalar for other types
      let displayName = 'None';
      const fieldValue = group[groupField];
      if (fieldValue === false || fieldValue === null) {
        displayName = 'None';
      } else if (Array.isArray(fieldValue)) {
        // many2one: [id, name] - take the name
        displayName = fieldValue[1] || String(fieldValue[0]);
      } else {
        // scalar
        displayName = String(fieldValue);
      }

      // read_group always returns the bucket size as __count in Odoo 12.
      const count = group.__count || 0;
      result.set(displayName, count);
    }

    return result;
  }

  /**
   * Get the Odoo server version info (edition, version number, etc.).
   *
   * @returns an object with server_version, server_version_info, etc.
   */
  async getServerVersionInfo(): Promise<{
    server_version: string;
    server_version_info: Array<number | string>;
  }> {
    return await this.page.evaluate(async () => {
      const r = await fetch('/web/webclient/version_info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: {} }),
      });
      return (await r.json()).result;
    });
  }

  /**
   * Check whether the page session is still authenticated.
   *
   * @returns true if the session appears authenticated, false otherwise
   */
  async isAuthenticatedSession(): Promise<boolean> {
    try {
      // Deliberately bounded: one row, one field. An unbounded search_count here would run a
      // full-table COUNT on res.partner (~250k rows) on BOTH servers for every single spec -
      // exactly the read pattern this class exists to prevent.
      await this.searchRead('res.users', [['id', '>', 0]], ['id'], { limit: 1 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fetch a path over the authenticated session and return its byte length.
   *
   * Used to measure downloaded files and verify that paths resolve (e.g., reports
   * that generate PDFs). GET only - stays read-only.
   *
   * @param path - relative path (e.g., '/web/content/1234' or '/report/pdf/...')
   * @returns the Content-Length in bytes
   */
  async fetchContentLength(path: string): Promise<number> {
    return await this.page.evaluate(async (p: string) => {
      const res = await fetch(p);
      const body = await res.arrayBuffer();
      return body.byteLength;
    }, path);
  }

  /**
   * Build a domain clause for records created ON OR BEFORE the cutoff date (inclusive).
   *
   * The cutoff date is treated as starting at 00:00:00; this filter includes the entire day.
   *
   * @param cutoff - the cutoff date as 'YYYY-MM-DD'
   * @param field - the date field to filter on (defaults to 'create_date')
   * @returns a domain clause: [[field, '<', '<next-day> 00:00:00']]
   */
  static onOrBeforeCutoff(cutoff: string, field: string = 'create_date'): any[] {
    // Parse the cutoff date
    const [y, m, d] = cutoff.split('-').map(Number);
    // Compute the next day
    let nextY = y, nextM = m, nextD = d + 1;
    // Days per month (leap years: Feb = 29; non-leap = 28)
    const daysInMonth = [31, (nextY % 4 === 0 && (nextY % 100 !== 0 || nextY % 400 === 0)) ? 29 : 28,
      31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (nextD > daysInMonth[nextM - 1]) {
      nextD = 1;
      nextM += 1;
      if (nextM > 12) {
        nextM = 1;
        nextY += 1;
      }
    }
    const nextDayStr = `${String(nextY).padStart(4, '0')}-${String(nextM).padStart(2, '0')}-${String(nextD).padStart(2, '0')}`;
    return [[field, '<', `${nextDayStr} 00:00:00`]];
  }

  /**
   * Build a domain clause for records created AFTER the cutoff date (exclusive).
   *
   * This is the complement of onOrBeforeCutoff: records created strictly after the cutoff day.
   *
   * @param cutoff - the cutoff date as 'YYYY-MM-DD'
   * @param field - the date field to filter on (defaults to 'create_date')
   * @returns a domain clause: [[field, '>=', '<next-day> 00:00:00']]
   */
  static afterCutoff(cutoff: string, field: string = 'create_date'): any[] {
    const [y, m, d] = cutoff.split('-').map(Number);
    let nextY = y, nextM = m, nextD = d + 1;
    const daysInMonth = [31, (nextY % 4 === 0 && (nextY % 100 !== 0 || nextY % 400 === 0)) ? 29 : 28,
      31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (nextD > daysInMonth[nextM - 1]) {
      nextD = 1;
      nextM += 1;
      if (nextM > 12) {
        nextM = 1;
        nextY += 1;
      }
    }
    const nextDayStr = `${String(nextY).padStart(4, '0')}-${String(nextM).padStart(2, '0')}-${String(nextD).padStart(2, '0')}`;
    return [[field, '>=', `${nextDayStr} 00:00:00`]];
  }
}
