import { CommonUtils } from '@/helpers/common.utils';
import { BasePage } from './BasePage';

/** One enabled scheduled action, as Settings > Technical > Scheduled Actions lists it. */
export interface ScheduledActionRow {
  id: number;
  name: string;
  /** "Next Execution" - the column a human watches to tell a running cron from a stuck one. */
  nextcall: string;
  intervalNumber: number;
  intervalType: string;
}

/** How many outgoing messages sit in each state of the mail queue. */
export interface MailQueueCounts {
  outgoing: number;
  sent: number;
  exception: number;
  cancel: number;
  /** Any state the server reported that is not one of the four above. */
  other: Record<string, number>;
}

/**
 * Page Object - the back-office health screens behind CRM-8339_1.6: Settings > Technical >
 * Scheduled Actions and Settings > Technical > Email > Emails.
 *
 * Both are read over the authenticated JSON-RPC the web client itself uses, because the case asks
 * for COUNTS and for the Next Execution time to ADVANCE - neither of which a screenshot of a list
 * view can establish. The spec marks those steps [INTERNAL check, Call API] accordingly.
 *
 * Grounded on pre-production 2026-10-13: 136 scheduled actions, all enabled; the mail queue holds
 * sent / exception / cancel and no outgoing.
 */
export class BackOfficeHealthPage extends BasePage {
  /** Call a model method over the web client's own authenticated JSON-RPC endpoint. */
  private async callKw(
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {}
  ): Promise<any> {
    return this.page.evaluate(
      async ({ model, method, args, kwargs }) => {
        const res = await fetch('/web/dataset/call_kw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'call',
            params: { model, method, args, kwargs },
          }),
        });
        const json = await res.json();
        if (json.error) {
          throw new Error(json.error.data?.message || json.error.message || 'RPC error');
        }
        return json.result;
      },
      { model, method, args, kwargs }
    );
  }

  /** How many scheduled actions exist, and how many of them are enabled. */
  async getScheduledActionCounts(): Promise<{ total: number; enabled: number }> {
    const total = await this.callKw('ir.cron', 'search_count', [[]]);
    const enabled = await this.callKw('ir.cron', 'search_count', [[['active', '=', true]]]);
    return { total, enabled };
  }

  /**
   * The enabled scheduled actions due soonest - the ones whose Next Execution a human would watch.
   *
   * @param limit how many rows to read (the case needs a handful, not the whole table).
   */
  async getEnabledScheduledActions(limit: number = 10): Promise<ScheduledActionRow[]> {
    const rows = await this.callKw(
      'ir.cron',
      'search_read',
      [
        [['active', '=', true]],
        ['id', 'name', 'nextcall', 'interval_number', 'interval_type'],
      ],
      { limit, order: 'nextcall asc' }
    );
    return (rows as any[]).map((r) => ({
      id: r.id,
      name: r.name,
      nextcall: r.nextcall,
      intervalNumber: r.interval_number,
      intervalType: r.interval_type,
    }));
  }

  /**
   * Re-read the Next Execution of specific scheduled actions.
   *
   * Comparing this against an earlier read is what distinguishes jobs that RUN from jobs that are
   * merely enabled: a stuck scheduler leaves Next Execution frozen in the past.
   */
  async getNextExecutionTimes(ids: number[]): Promise<Record<number, string>> {
    const rows = await this.callKw('ir.cron', 'read', [ids, ['nextcall']]);
    const out: Record<number, string> = {};
    (rows as any[]).forEach((r) => {
      out[r.id] = r.nextcall;
    });
    return out;
  }

  /** How many outgoing messages sit in each state of the mail queue. */
  async getMailQueueCounts(): Promise<MailQueueCounts> {
    const groups = await this.callKw('mail.mail', 'read_group', [[], ['id'], ['state']], {
      lazy: false,
    });
    const counts: MailQueueCounts = { outgoing: 0, sent: 0, exception: 0, cancel: 0, other: {} };
    (groups as any[]).forEach((g) => {
      const state = String(g.state);
      const n = Number(g.__count ?? 0);
      if (state === 'outgoing') counts.outgoing = n;
      else if (state === 'sent') counts.sent = n;
      else if (state === 'exception') counts.exception = n;
      else if (state === 'cancel') counts.cancel = n;
      else counts.other[state] = n;
    });
    return counts;
  }

  /**
   * The outgoing messages whose subject contains `fragment`, newest first.
   *
   * This is how "check the outgoing message" is answered for a message THIS run triggered, rather
   * than by reading whatever happens to sit at the top of a queue holding over a million rows.
   */
  async getMailForSubject(
    fragment: string,
    limit: number = 10
  ): Promise<{ id: number; subject: string; state: string }[]> {
    const rows = await this.callKw(
      'mail.mail',
      'search_read',
      [[['subject', 'ilike', fragment]], ['id', 'subject', 'state']],
      { limit, order: 'id desc' }
    );
    return (rows as any[]).map((r) => ({
      id: r.id,
      subject: String(r.subject ?? ''),
      state: String(r.state ?? ''),
    }));
  }

  /**
   * The chatter notifications a helpdesk ticket carries, found by the ticket's name.
   *
   * Submitting a portal ticket on pre-production notifies through the ticket's chatter, not
   * through the outgoing-mail queue (measured 2026-10-13: two tickets created at 12:12 and 12:15
   * server time produced a "Ticket Created" chatter notification each and no mail.mail row at
   * all). So "an action that sends an email/notification" has to be evidenced here rather than in
   * the mail queue.
   */
  async getTicketNotifications(
    ticketName: string
  ): Promise<{ ticketId: number; messages: { id: number; type: string; subtype: string }[] }> {
    const tickets = await this.callKw(
      'helpdesk.ticket',
      'search_read',
      [[['name', '=', ticketName]], ['id', 'name']],
      { limit: 5, context: { active_test: false } }
    );
    const ticketId = (tickets as any[])[0]?.id ?? 0;
    if (!ticketId) return { ticketId: 0, messages: [] };

    const rows = await this.callKw(
      'mail.message',
      'search_read',
      [
        [
          ['model', '=', 'helpdesk.ticket'],
          ['res_id', '=', ticketId],
        ],
        ['id', 'message_type', 'subtype_id'],
      ],
      { limit: 20, order: 'id desc' }
    );
    return {
      ticketId,
      messages: (rows as any[]).map((r) => ({
        id: r.id,
        type: String(r.message_type ?? ''),
        subtype: Array.isArray(r.subtype_id) ? String(r.subtype_id[1]) : '',
      })),
    };
  }

  /**
   * The date on the newest row of the outgoing-mail queue.
   *
   * Comparing it against the time an action ran is what shows whether that action reached the
   * queue at all - the queue holds over a million historical rows, so its size says nothing.
   */
  async getNewestMailDate(): Promise<string> {
    const rows = await this.callKw('mail.mail', 'search_read', [[], ['id', 'date', 'subject']], {
      limit: 1,
      order: 'id desc',
    });
    const row = (rows as any[])[0];
    return row ? `${row.date} - ${row.subject}` : '(queue empty)';
  }

  /** Archive a helpdesk ticket by name - Odoo helpdesk tickets cannot be deleted, only archived. */
  async archiveTicketByName(ticketName: string): Promise<boolean> {
    const tickets = await this.callKw(
      'helpdesk.ticket',
      'search',
      [[['name', '=', ticketName]]],
      { limit: 5 }
    );
    const ids = tickets as number[];
    if (!ids.length) return false;
    await this.callKw('helpdesk.ticket', 'write', [ids, { active: false }]);
    return true;
  }

  /** The server's own clock, so a Next Execution can be called past or future without guessing. */
  async getServerTime(): Promise<string> {
    const rows = await this.callKw('ir.cron', 'search_read', [[], ['id']], { limit: 1 });
    void rows;
    return this.page.evaluate(() => new Date().toISOString().replace('T', ' ').slice(0, 19));
  }

  /** Open a back-office action by id and wait for the web client to settle. */
  async openActionById(baseUrl: string, actionId: number): Promise<void> {
    await this.page.goto(`${baseUrl}web#action=${actionId}`, {
      waitUntil: 'domcontentloaded',
      timeout: CommonUtils.waitTimes.pageLoad,
    });
    await CommonUtils.waitForSpinnersToHide(
      this.page,
      CommonUtils.waitTimes.extraLong,
      CommonUtils.waitTimes.pageLoad
    ).catch(() => {});
    await this.page.waitForTimeout(CommonUtils.waitTimes.extraLong);
  }
}
