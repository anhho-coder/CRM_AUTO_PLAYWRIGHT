import { request, APIRequestContext } from '@playwright/test';
import { users, baseUrl_mailpit_mig } from '@config/users.config';
import { CommonUtils } from '@helpers/common.utils';

/**
 * REST client for the crm-mig Mailpit test mailbox (baseUrl_mailpit_mig).
 *
 * Mailpit is the SMTP sink crm-mig sends to (ir.mail_server "Mailpit crm-mig (QA sink)", 127.0.0.1:1025,
 * relay disabled) - nothing reaches a real inbox, so a spec can assert on what the CRM sent.
 * HTTP Basic auth with users.mailpit_crm_mig; the host's cert chain is self-signed, hence
 * ignoreHTTPSErrors. API reference: <baseUrl_mailpit_mig>api/v1/.
 *
 * Read-only by design: search, read one message. Reading a message marks it read in Mailpit - that is the
 * only state it changes, and only on messages the caller asked for.
 */

export interface MailpitAddress { Name: string; Address: string }

export interface MailpitSummary {
  ID: string;
  From: MailpitAddress;
  To: MailpitAddress[];
  Subject: string;
  Created: string;
  Snippet: string;
}

export interface MailpitMessage extends MailpitSummary {
  Date: string;
  Text: string;
  HTML: string;
}

export class MailpitClient {
  private constructor(private readonly api: APIRequestContext) {}

  static async open(): Promise<MailpitClient> {
    const api = await request.newContext({
      baseURL: baseUrl_mailpit_mig,
      httpCredentials: { username: users.mailpit_crm_mig.username, password: users.mailpit_crm_mig.password },
      ignoreHTTPSErrors: true,
      timeout: CommonUtils.waitTimes.abnormalWait,
    });
    return new MailpitClient(api);
  }

  async dispose(): Promise<void> {
    await this.api.dispose();
  }

  private async getJson<T>(path: string): Promise<T> {
    const res = await this.api.get(path);
    if (!res.ok()) throw new Error(`Mailpit GET ${path} -> HTTP ${res.status()} ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  }

  /**
   * Messages whose Subject is EXACTLY `subject`, newest first. Mailpit's search is token-based, so the
   * phrase search only narrows the candidates; the exact-equality filter is what decides.
   */
  async findBySubject(subject: string, limit = 50): Promise<MailpitSummary[]> {
    const query = `subject:"${subject.replace(/"/g, '')}"`;
    const body = await this.getJson<{ messages: MailpitSummary[] }>(
      `api/v1/search?query=${encodeURIComponent(query)}&limit=${limit}`
    );
    return (body.messages || []).filter(m => m.Subject === subject);
  }

  /**
   * Poll until at least `minCount` messages with exactly this Subject exist, or the budget runs out.
   * Never throws on timeout - returns what it last saw, so the caller asserts (and the report says
   * "0 found after N s", not a bare timeout).
   */
  async waitForSubject(
    subject: string,
    minCount: number,
    totalWait: number = CommonUtils.waitTimes.emailArrivalWait,
    interval: number = CommonUtils.waitTimes.emailPollInterval,
  ): Promise<{ messages: MailpitSummary[]; waitedMs: number; polls: number }> {
    const start = Date.now();
    let polls = 0;
    let messages: MailpitSummary[] = [];
    while (true) {
      polls++;
      messages = await this.findBySubject(subject);
      if (messages.length >= minCount || Date.now() - start >= totalWait) break;
      await new Promise(r => setTimeout(r, interval));
    }
    return { messages, waitedMs: Date.now() - start, polls };
  }

  async getMessage(id: string): Promise<MailpitMessage> {
    return this.getJson<MailpitMessage>(`api/v1/message/${encodeURIComponent(id)}`);
  }
}
