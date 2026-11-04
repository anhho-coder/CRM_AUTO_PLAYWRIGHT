import { request, APIRequestContext } from '@playwright/test';

/**
 * Teardown for specs that create data on the Support service (Frappe Helpdesk, support-crm-mig.nakivo.site).
 *
 * An agent cannot delete a ticket there - only the Administrator can - so the teardown signs in as Administrator in a
 * SEPARATE API context (the browser session of the test is not touched) and deletes exactly what the run created:
 *  - DENY-LIST only: the ticket number captured at creation, or - when the number was never captured - the rows whose
 *    subject equals this run's unique subject; the Contact whose e-mail equals this run's unique Raised By address.
 *    Nothing is computed as "everything except"; there is no keep-list.
 *  - every row is re-read before its delete, and its subject / e-mail must equal this run's marker;
 *  - a lookup returning MORE rows than the run created stops the cleanup with an error instead of deleting.
 * Deleted documents stay restorable in Frappe's Deleted Documents.
 */
export interface SupportProbe {
  /** ticket number captured from the create call, if it got that far */
  ticketName?: string;
  /** this run's unique ticket subject (the marker) */
  subject: string;
  /** this run's unique Raised By address - FF creates a Contact named after it */
  contactEmail?: string;
  /**
   * Start of the run in the server's zone ('YYYY-MM-DD HH:mm:ss'). When set, the ticket's ToDo (assignment) and HD
   * Notification rows CREATED SINCE then are deleted too - the assignments this run made. Ticket numbers are reused after a
   * delete, so a row is never deleted on its ticket number alone.
   */
  since?: string;
}

/**
 * Rows this run's own stage moves and notes left on the ticket block its DELETE (Frappe LinkExistsError, measured
 * 2026-10-23: "HD Ticket 13415 is linked with NK Stage Transition ..."). NK Stage Transition (field `ticket`) and HD Ticket
 * Comment (field `reference_ticket`) rows are deleted first - only rows whose link equals this ticket, at most 50.
 */
const TICKET_LINKED_ROWS: ReadonlyArray<{ doctype: string; field: string }> = [
  { doctype: 'NK Stage Transition', field: 'ticket' },
  { doctype: 'HD Ticket Comment', field: 'reference_ticket' },
];

/**
 * Rows a run can cause on its own ticket - deleted only with `since` (rows created during the run): assignments, and the
 * e-mails of a reply (Communication + Email Queue; an Administrator-created ticket also gets a "Received" Communication).
 */
const TICKET_ASSIGNMENT_ROWS: ReadonlyArray<{ doctype: string; field: string; extra: unknown[][] }> = [
  { doctype: 'ToDo', field: 'reference_name', extra: [['reference_type', '=', 'HD Ticket']] },
  { doctype: 'HD Notification', field: 'reference_ticket', extra: [] },
  { doctype: 'Communication', field: 'reference_name', extra: [['reference_doctype', '=', 'HD Ticket']] },
  { doctype: 'Email Queue', field: 'reference_name', extra: [['reference_doctype', '=', 'HD Ticket']] },
];

async function clearTicketLinkedRows(api: APIRequestContext, ticket: string, log: string[], since?: string): Promise<void> {
  const enc = (o: unknown) => encodeURIComponent(JSON.stringify(o));
  const groups = [
    ...TICKET_LINKED_ROWS.map((g) => ({ ...g, filters: [[g.field, '=', ticket]] as unknown[][] })),
    ...(since ? TICKET_ASSIGNMENT_ROWS.map((g) => ({ ...g, filters: [[g.field, '=', ticket], ...g.extra, ['creation', '>=', since]] as unknown[][] })) : []),
  ];
  for (const g of groups) {
    const r = await api.get(
      `/api/resource/${encodeURIComponent(g.doctype)}?fields=${enc(['name', g.field])}&filters=${enc(g.filters)}&limit_page_length=51`
    );
    if (r.status() !== 200) throw new Error(`${g.doctype} of ticket ${ticket}: lookup answered HTTP ${r.status()}`);
    const rows: Array<Record<string, string>> = (await r.json()).data || [];
    if (rows.length > 50) throw new Error(`${rows.length}+ ${g.doctype} rows point at ticket ${ticket} - more than this run creates; nothing deleted`);
    for (const row of rows) {
      if (String(row[g.field]) !== ticket) throw new Error(`${g.doctype} ${row.name} points at "${row[g.field]}", not ${ticket} - not deleted`);
      const d = await api.delete(`/api/resource/${encodeURIComponent(g.doctype)}/${encodeURIComponent(row.name)}`);
      if (![200, 202].includes(d.status())) throw new Error(`${g.doctype} ${row.name}: DELETE answered HTTP ${d.status()} ${(await d.text()).slice(0, 200)}`);
      log.push(`${g.doctype} ${row.name} (linked to ticket ${ticket}): deleted`);
    }
    if (!rows.length) log.push(`${g.doctype}: none linked to ticket ${ticket}`);
  }
}

/**
 * Closing a ticket creates rows of other doctypes that link it (measured 2026-10-23: NK Rating RAT-000002712 with field
 * `ticket`, then NK L2 Ticket Score), and Frappe refuses the ticket DELETE while they exist:
 * `HD Ticket <a>13426</a> is linked with NK Rating <a>RAT-...</a>` (LinkExistsError, HTTP 417). The named row is deleted
 * only when one of its own fields holds this ticket's number; the DELETE is retried after each one (bounded).
 */
async function deleteTicketAndLinkedRows(api: APIRequestContext, ticket: string, log: string[]): Promise<void> {
  for (let attempt = 1; attempt <= 8; attempt++) {
    const d = await api.delete(`/api/resource/HD Ticket/${encodeURIComponent(ticket)}`);
    if ([200, 202].includes(d.status())) return;
    const text = (await d.text()).replace(/\\"/g, '"');
    const m = text.match(/is linked with ([A-Za-z][A-Za-z0-9 ]*?) <a[^>]*>([^<]+)<\/a>/);
    if (d.status() !== 417 || !m) throw new Error(`ticket ${ticket}: DELETE answered HTTP ${d.status()} ${text.slice(0, 300)}`);
    const [, doctype, rowName] = m;
    const g = await api.get(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(rowName)}`);
    if (g.status() !== 200) throw new Error(`${doctype} ${rowName} (linked to ticket ${ticket}): lookup answered HTTP ${g.status()}`);
    const row: Record<string, unknown> = (await g.json()).data || {};
    const refs = Object.entries(row).filter(([, v]) => String(v) === ticket).map(([k]) => k);
    if (!refs.length) throw new Error(`${doctype} ${rowName} is reported as linked to ticket ${ticket}, but no field of it holds that number - not deleted`);
    const dd = await api.delete(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(rowName)}`);
    if (![200, 202].includes(dd.status())) throw new Error(`${doctype} ${rowName}: DELETE answered HTTP ${dd.status()} ${(await dd.text()).slice(0, 200)}`);
    log.push(`${doctype} ${rowName} (field ${refs.join(', ')} = ticket ${ticket}): deleted`);
  }
  throw new Error(`ticket ${ticket}: still linked after 8 linked-row deletes - nothing more deleted`);
}

export async function deleteSupportProbeAsAdmin(
  baseUrl: string,
  admin: { username: string; password: string },
  probe: SupportProbe
): Promise<string[]> {
  const log: string[] = [];
  const api = await request.newContext({ baseURL: baseUrl.replace(/\/$/, ''), ignoreHTTPSErrors: true });
  const enc = (o: unknown) => encodeURIComponent(JSON.stringify(o));
  try {
    const lg = await api.post('/api/method/login', { data: { usr: admin.username, pwd: admin.password } });
    if (lg.status() !== 200) throw new Error(`Administrator login refused: HTTP ${lg.status()}`);

    // ---- ticket
    let names: string[] = [];
    if (probe.ticketName) {
      names = [probe.ticketName];
    } else {
      const r = await api.get(`/api/resource/HD Ticket?fields=${enc(['name', 'subject'])}&filters=${enc([['subject', '=', probe.subject]])}&limit_page_length=5`);
      names = ((await r.json()).data || []).map((d: { name: string }) => d.name);
      log.push(`ticket number was not captured - rows with this run's subject: ${names.length}`);
      if (names.length > 1) throw new Error(`${names.length} tickets carry the subject "${probe.subject}" - more than this run created; nothing deleted`);
    }
    for (const name of names) {
      const g = await api.get(`/api/resource/HD Ticket/${name}`);
      if (g.status() === 404) {
        log.push(`ticket ${name}: already gone`);
        continue;
      }
      const doc = (await g.json()).data || {};
      // the text guard (SEC-1) stores every '<' that can open a tag as '&lt;' (CRM-13916) - compare as typed
      if (String(doc.subject ?? '').replace(/&lt;/g, '<') !== probe.subject) throw new Error(`ticket ${name} has subject "${doc.subject}", not this run's "${probe.subject}" - not deleted`);
      await clearTicketLinkedRows(api, name, log, probe.since);
      await deleteTicketAndLinkedRows(api, name, log);
      const after = (await api.get(`/api/resource/HD Ticket/${name}`)).status();
      if (after !== 404) throw new Error(`ticket ${name}: still readable after the delete (HTTP ${after})`);
      log.push(`ticket ${name} ("${probe.subject}"): deleted, re-read answers 404`);
    }

    // ---- contact FF created for the run's Raised By address
    if (probe.contactEmail) {
      const r = await api.get(`/api/resource/Contact?fields=${enc(['name', 'email_id'])}&filters=${enc([['email_id', '=', probe.contactEmail]])}&limit_page_length=5`);
      const rows: Array<{ name: string; email_id: string }> = (await r.json()).data || [];
      if (rows.length > 1) throw new Error(`${rows.length} contacts carry "${probe.contactEmail}" - more than this run created; nothing deleted`);
      for (const c of rows) {
        if (c.email_id !== probe.contactEmail) throw new Error(`contact ${c.name} has e-mail "${c.email_id}" - not deleted`);
        const d = await api.delete(`/api/resource/Contact/${encodeURIComponent(c.name)}`);
        if (![200, 202].includes(d.status())) throw new Error(`contact ${c.name}: DELETE answered HTTP ${d.status()} ${(await d.text()).slice(0, 200)}`);
        log.push(`contact ${c.name}: deleted`);
      }
      if (!rows.length) log.push(`contact for ${probe.contactEmail}: none found (FF did not create one, or it is already gone)`);
    }
  } finally {
    await api.dispose();
  }
  return log;
}

/**
 * SET-UP, as Administrator in a separate API context: create a Contact named `firstName` whose primary e-mail is `email` -
 * this run's own test data (a run-unique marker in both), removed again by deleteSupportProbeAsAdmin({ contactEmail }).
 * Refuses when a Contact with that e-mail already exists. Returns the new Contact's name.
 */
export async function createSupportContactAsAdmin(
  baseUrl: string,
  admin: { username: string; password: string },
  contact: { firstName: string; email: string }
): Promise<string> {
  const api = await request.newContext({ baseURL: baseUrl.replace(/\/$/, ''), ignoreHTTPSErrors: true });
  const enc = (o: unknown) => encodeURIComponent(JSON.stringify(o));
  try {
    const lg = await api.post('/api/method/login', { data: { usr: admin.username, pwd: admin.password } });
    if (lg.status() !== 200) throw new Error(`Administrator login refused: HTTP ${lg.status()}`);
    const r = await api.get(`/api/resource/Contact?fields=${enc(['name'])}&filters=${enc([['email_id', '=', contact.email]])}&limit_page_length=2`);
    if (((await r.json()).data || []).length) throw new Error(`a Contact with e-mail ${contact.email} already exists - not created`);
    const c = await api.post('/api/resource/Contact', { data: { first_name: contact.firstName, email_ids: [{ email_id: contact.email, is_primary: 1 }] } });
    if (c.status() !== 200) throw new Error(`Contact create answered HTTP ${c.status()} ${(await c.text()).slice(0, 200)}`);
    return String(((await c.json()).data || {}).name || '');
  } finally {
    await api.dispose();
  }
}

/**
 * SET-UP, as Administrator in a separate API context: create ONE HD Ticket with this run's unique `subject` and `raisedBy`
 * (an example.com address - FF makes a Contact for it). Returns the ticket number and its creation time (server zone,
 * 'YYYY-MM-DD HH:mm:ss') - pass both to deleteSupportProbeAsAdmin({ ticketName, since }).
 */
export async function createSupportTicketAsAdmin(
  baseUrl: string,
  admin: { username: string; password: string },
  ticket: { subject: string; raisedBy: string; description: string }
): Promise<{ name: string; creation: string }> {
  const api = await request.newContext({ baseURL: baseUrl.replace(/\/$/, ''), ignoreHTTPSErrors: true });
  try {
    const lg = await api.post('/api/method/login', { data: { usr: admin.username, pwd: admin.password } });
    if (lg.status() !== 200) throw new Error(`Administrator login refused: HTTP ${lg.status()}`);
    const c = await api.post('/api/resource/HD Ticket', { data: { subject: ticket.subject, raised_by: ticket.raisedBy, description: ticket.description } });
    if (c.status() !== 200) throw new Error(`HD Ticket create answered HTTP ${c.status()} ${(await c.text()).slice(0, 200)}`);
    const d = (await c.json()).data || {};
    return { name: String(d.name || ''), creation: String(d.creation || '').slice(0, 19) };
  } finally {
    await api.dispose();
  }
}

/**
 * READ-ONLY, as Administrator (an agent's REST read of Communication came back empty - measured 2026-11-04): the ticket's
 * review flags and the replies it SENT since `since`, with their Approval Status.
 */
export async function readTicketReviewStateAsAdmin(
  baseUrl: string,
  admin: { username: string; password: string },
  ticket: string,
  since: string
): Promise<{ reviewNeeded: number; reviewAuthor: string; replies: Array<{ name: string; approval: string }> }> {
  const api = await request.newContext({ baseURL: baseUrl.replace(/\/$/, ''), ignoreHTTPSErrors: true });
  const enc = (o: unknown) => encodeURIComponent(JSON.stringify(o));
  try {
    const lg = await api.post('/api/method/login', { data: { usr: admin.username, pwd: admin.password } });
    if (lg.status() !== 200) throw new Error(`Administrator login refused: HTTP ${lg.status()}`);
    const t = await api.get(`/api/resource/HD Ticket/${encodeURIComponent(ticket)}`);
    if (t.status() !== 200) throw new Error(`ticket ${ticket}: read answered HTTP ${t.status()}`);
    const doc = (await t.json()).data || {};
    const r = await api.get(`/api/resource/Communication?fields=${enc(['name', 'custom_approval_status'])}&filters=${enc([['reference_doctype', '=', 'HD Ticket'], ['reference_name', '=', ticket], ['sent_or_received', '=', 'Sent'], ['creation', '>=', since]])}&order_by=creation%20desc&limit_page_length=11`);
    if (r.status() !== 200) throw new Error(`Communication of ticket ${ticket}: lookup answered HTTP ${r.status()}`);
    const rows: Array<{ name: string; custom_approval_status: string | null }> = (await r.json()).data || [];
    return { reviewNeeded: Number(doc.custom_review_needed || 0), reviewAuthor: String(doc.custom_review_author || ''), replies: rows.map((c) => ({ name: c.name, approval: String(c.custom_approval_status || '') })) };
  } finally {
    await api.dispose();
  }
}

/**
 * READ-ONLY, as Administrator (an agent cannot read Email Queue): the Email Queue rows that reference HD Ticket `ticket` and
 * were created since `since` (server zone 'YYYY-MM-DD HH:mm:ss'), with their recipients. At most 20 - more throws.
 */
export async function readTicketEmailQueueAsAdmin(
  baseUrl: string,
  admin: { username: string; password: string },
  ticket: string,
  since: string
): Promise<Array<{ name: string; status: string; creation: string; recipients: string[] }>> {
  const api = await request.newContext({ baseURL: baseUrl.replace(/\/$/, ''), ignoreHTTPSErrors: true });
  const enc = (o: unknown) => encodeURIComponent(JSON.stringify(o));
  try {
    const lg = await api.post('/api/method/login', { data: { usr: admin.username, pwd: admin.password } });
    if (lg.status() !== 200) throw new Error(`Administrator login refused: HTTP ${lg.status()}`);
    const r = await api.get(`/api/resource/Email Queue?fields=${enc(['name', 'status', 'creation'])}&filters=${enc([['reference_doctype', '=', 'HD Ticket'], ['reference_name', '=', ticket], ['creation', '>=', since]])}&limit_page_length=21`);
    if (r.status() !== 200) throw new Error(`Email Queue of ticket ${ticket}: lookup answered HTTP ${r.status()}`);
    const rows: Array<{ name: string; status: string; creation: string }> = (await r.json()).data || [];
    if (rows.length > 20) throw new Error(`more than 20 Email Queue rows for ticket ${ticket} since ${since}`);
    const out: Array<{ name: string; status: string; creation: string; recipients: string[] }> = [];
    for (const row of rows) {
      const d = await api.get(`/api/resource/Email Queue/${encodeURIComponent(row.name)}`);
      const doc = d.status() === 200 ? (await d.json()).data || {} : {};
      out.push({ ...row, recipients: (doc.recipients || []).map((x: { recipient: string }) => x.recipient) });
    }
    return out;
  } finally {
    await api.dispose();
  }
}
