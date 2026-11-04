import { test, expect, request as pwRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ========== Reliability_1.1.1 ==========
 * Test Case ID    : Reliability_1.1.1
 * Jira            : (not imported to Xray yet - add the key here and in the title when it is)
 * Test Repository : CRM test/Reliability_testing/Lead intake from web forms/Connection outage and recovery
 * Target          : pre-production.nakivo.site (db nakivo) - creates Leads, deletes them in afterEach
 * Run as          : B (form collector) = integration account sale_ic_thomas (Thomas Semerich)
 *                   checks + cleanup   = CRM admin admin_crm (Anh Ho)
 * Automation-Type : new
 * Automation-Date : 2026-11-03
 *
 * Summary:
 *   B holds 10 form submissions during a connection outage, then sends them all at once when the
 *   connection is back while 3 new submissions arrive; CRM must end with exactly one Lead per
 *   submission, carrying exactly the submitted data.
 *
 * Command to run:
 *   npx playwright test --grep "Reliability_1\.1\.1:" --project=Reliability
 *
 * Source manual TC : Reliability_1.1.1 in "D:\Claude - ready to import to Xray\
 *                    Reliability_lead-intake_outage-recovery_testcases.xlsx" (8 steps)
 * Source version   : written 2026-11-03, not in Xray yet - re-check against the Xray TC once imported
 *
 * Source manual TC:
 *   Pre-conditions:
 *     - The test plays the web-form collector (B): it sends each form to CRM (A) through the CRM
 *       integration interface (external API), the same way Zapier does
 *     - B sends as the integration account (e.g. Thomas Semerich)
 *     - Check the results and clean up as a CRM admin (e.g. Anh Ho)
 *     - Prepare 10 NEW form submissions that arrive DURING the outage (S01..S10), each with unique data:
 *         Lead name     = AUTO-REL-1.1.1-<runId>-S<nn>
 *         Contact Name  = Rel Backlog <nn>
 *         Email         = s<nn>@<runId>-s<nn>.example.com
 *         Phone         = +1 555 01<nn>
 *         Company Name  = AUTO-REL-1.1.1-<runId>-S<nn> Co
 *         Notes         = Backlog submission <nn>
 *     - Prepare 3 NEW live form submissions that arrive AFTER the connection is back (L01..L03):
 *         Lead name     = AUTO-REL-1.1.1-<runId>-L<nn>
 *         Contact Name  = Rel Live <nn>
 *         Email         = l<nn>@<runId>-l<nn>.example.com
 *         Phone         = +1 555 02<nn>
 *         Company Name  = AUTO-REL-1.1.1-<runId>-L<nn> Co
 *         Notes         = Live submission <nn>
 *
 *   Steps:
 *     1. In CRM > Leads, count the Leads whose name starts with "AUTO-REL-1.1.1-<runId>"
 *     2. Outage: B keeps the 10 backlog submissions S01..S10 and sends nothing to CRM
 *     3. In CRM > Leads, count the Leads of this run again
 *     4. Connection back: B sends all 10 backlog submissions to CRM at the same time
 *     5. While the backlog is still being sent, B sends the 3 live submissions L01..L03
 *     6. Wait until all 13 sends have answered; note the Lead ID CRM returns for each submission
 *     7. In CRM > Leads, search the Leads of this run
 *     8. Compare every Lead with the submission it came from
 *
 *   Expected:
 *     1. 0 Leads
 *     3. Still 0 Leads (nothing reached CRM during the outage)
 *     6. All 13 sends answer with a Lead ID; no error
 *     7. Exactly 13 Leads: one Lead per submission (S01..S10, L01..L03), none missing, none
 *        duplicated; the Lead IDs are the ones returned in step 6
 *     8. On every Lead these fields equal the submission exactly:
 *          Lead name, Contact Name, Email, Phone, Company Name, Notes
 *
 * How the outage is produced: on the client side. B is emulated by this spec, so "outage" = B holds
 *   the submissions and sends nothing. The network between a real B and CRM is NOT cut - that needs
 *   devops (e.g. a Toxiproxy between B and CRM). This TC verifies CRM's side of the recovery.
 * External API: the /jsonrpc "object.execute_kw" service = the same Odoo external API the Zapier
 *   connector calls over XML-RPC, with the same password authentication; only the encoding differs.
 * Evidence: stdout only - this TC drives no UI. Every step is an external-API call; the console
 *   output IS the artifact. Screenshot/video are off for this spec on purpose.
 */

// RPC-only spec: no screen is driven, so a screenshot/video would only show an idle page.
test.use({ screenshot: 'off', video: 'off' });

/** Set true only to keep the run's Leads for a manual look - they must then be swept by hand. */
const SKIP_CLEANUP = false;

/** Pre-production database the external API authenticates against (same value as helpers/discount-baseline.helper.ts). */
const PREPROD_DB = 'nakivo';
/** The external API answers over HTTPS only - the http:// baseUrl gets a 301 and a redirected POST loses its body. */
const API_BASE = baseUrl.replace(/^http:/, 'https:').replace(/\/$/, '');

const TC = 'Reliability_1.1.1';
const BACKLOG_COUNT = 10;
const LIVE_COUNT = 3;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: [INTERNAL check, Call API] B signs in to the CRM integration interface (external API) as the integration account; the checking account signs in as CRM admin',
  pre2: 'Pre-condition 2: Prepare 10 backlog submissions S01..S10 and 3 live submissions L01..L03 with unique data',
  s1: 'Step 1: [INTERNAL check, Call API] In CRM > Leads, count the Leads whose name starts with "AUTO-REL-1.1.1-<runId>"',
  s2: 'Step 2: [EMULATED - no call is made] Outage: B keeps the 10 backlog submissions S01..S10 and sends nothing to CRM',
  s3: 'Step 3: [INTERNAL check, Call API] In CRM > Leads, count the Leads of this run again',
  s4: 'Step 4: [INTERNAL check, Call API] Connection back: B sends all 10 backlog submissions to CRM at the same time',
  s5: 'Step 5: [INTERNAL check, Call API] While the backlog is still being sent, B sends the 3 live submissions L01..L03',
  s6: 'Step 6: [INTERNAL check, Call API] Wait until all 13 sends have answered; note the Lead ID CRM returns for each submission',
  s7: 'Step 7: [INTERNAL check, Call API] In CRM > Leads, search the Leads of this run',
  s8: 'Step 8: [INTERNAL check, Call API] Compare every Lead with the submission it came from',
  verify: 'Verification',
} as const;

type Account = { username: string; password: string; displayName: string };

/** The fields B fills from a web form - compared one by one in step 8. */
const FORM_FIELDS = ['name', 'contact_name', 'email_from', 'phone', 'partner_name', 'description'] as const;
type FormField = (typeof FORM_FIELDS)[number];
const FIELD_LABEL: Record<FormField, string> = {
  name: 'Lead name',
  contact_name: 'Contact Name',
  email_from: 'Email',
  phone: 'Phone',
  partner_name: 'Company Name',
  description: 'Notes',
};
type Submission = { key: string } & Record<FormField, string>;
type LeadRow = { id: number } & Record<FormField, string | false>;
type SendResult = { key: string; id: number | null; error: string | null; ms: number };

/** One external-API session: the /jsonrpc "object.execute_kw" service. Never logs the password. */
class ExternalApi {
  private uid = 0;

  constructor(private readonly ctx: APIRequestContext, readonly account: Account) {}

  async login(): Promise<number> {
    this.uid = await this.rpc<number>('common', 'login', [PREPROD_DB, this.account.username, this.account.password]);
    if (!this.uid) throw new Error(`external API login refused for ${this.account.username}`);
    return this.uid;
  }

  /** model.method over the external API; timeoutMs = how long the caller waits for the CRM's answer. */
  call<T>(model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {},
    timeoutMs: number = CommonUtils.waitTimes.reliabilityCallTimeout): Promise<T> {
    return this.rpc<T>('object', 'execute_kw',
      [PREPROD_DB, this.uid, this.account.password, model, method, args, kwargs], timeoutMs);
  }

  private async rpc<T>(service: string, method: string, args: unknown[],
    timeoutMs: number = CommonUtils.waitTimes.reliabilityCallTimeout): Promise<T> {
    const res = await this.ctx.post('/jsonrpc', {
      data: { jsonrpc: '2.0', method: 'call', id: Date.now(), params: { service, method, args } },
      timeout: timeoutMs,
    });
    if (!res.ok()) throw new Error(`HTTP ${res.status()} from /jsonrpc (${service}.${method})`);
    const body = await res.json();
    if (body.error) throw new Error(`Odoo error on ${service}.${method}: ${body.error.data?.message ?? body.error.message}`);
    return body.result as T;
  }
}

test.describe('Reliability 1.1.1 - Backlog replay after a connection outage', () => {
  const runId = `r${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const RUN = `AUTO-REL-1.1.1-${runId}`;
  let ctx: APIRequestContext | undefined;
  let b: ExternalApi | undefined;
  let admin: ExternalApi | undefined;

  test(`${TC}: Form submissions held during an outage all reach CRM, complete and exact, while new submissions keep arriving`, async () => {
    test.setTimeout(CommonUtils.waitTimes.reliabilityTestTimeout);
    console.log(`========== ${TC} ==========`);

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      ctx = await pwRequest.newContext({ baseURL: API_BASE, ignoreHTTPSErrors: true });
      b = new ExternalApi(ctx, users.sale_ic_thomas);
      admin = new ExternalApi(ctx, users.admin_crm);
      console.log(`  Target          : ${API_BASE} (db ${PREPROD_DB})`);
      console.log(`  B account       : ${b.account.username} -> uid ${await b.login()}`);
      console.log(`  Checking account: ${admin.account.username} -> uid ${await admin.login()}`);
    });

    const backlog: Submission[] = [];
    const live: Submission[] = [];
    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      for (let n = 1; n <= BACKLOG_COUNT; n++) backlog.push(makeSubmission(RUN, runId, 'S', n, 'Rel Backlog', 'Backlog submission', '01'));
      for (let n = 1; n <= LIVE_COUNT; n++) live.push(makeSubmission(RUN, runId, 'L', n, 'Rel Live', 'Live submission', '02'));
      console.log(`  Run marker : ${RUN}`);
      for (const s of [...backlog, ...live]) logSubmission(s);
    });

    const baseline = await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const n = await countRunLeads(admin!, RUN);
      console.log(`  Leads named "${RUN}-*" : ${n}`);
      return n;
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log(`  B holds ${backlog.length} submissions: ${backlog.map((s) => s.key).join(', ')}`);
      console.log('  Nothing is sent to CRM in this step.');
    });

    const duringOutage = await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const n = await countRunLeads(admin!, RUN);
      console.log(`  Leads named "${RUN}-*" : ${n}`);
      return n;
    });

    const backlogSettled = new Set<string>();
    let backlogSends: Promise<SendResult>[] = [];
    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      backlogSends = backlog.map((s) => send(b!, s).then((r) => { backlogSettled.add(r.key); return r; }));
      console.log(`  ${backlogSends.length} sends started together at ${new Date().toISOString()}`);
    });

    let settledAtLiveStart = -1;
    let liveSends: Promise<SendResult>[] = [];
    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      await new Promise((r) => setTimeout(r, CommonUtils.waitTimes.standard));
      settledAtLiveStart = backlogSettled.size;
      liveSends = live.map((s) => send(b!, s));
      console.log(`  Live sends started at ${new Date().toISOString()}`);
      console.log(`  Backlog sends already answered at that moment : ${settledAtLiveStart} of ${backlog.length}`);
    });

    const results = await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      const all = await Promise.all([...backlogSends, ...liveSends]);
      for (const r of all) {
        console.log(`  ${r.key} : ${r.id !== null ? `Lead ID ${r.id}` : `NO Lead ID - ${r.error}`} (${r.ms} ms)`);
      }
      return all;
    });

    const leads = await test.step(STEP.s7, async () => {
      console.log(`\n--- ${STEP.s7} ---`);
      const rows = await readRunLeads(admin!, RUN);
      console.log(`  Leads named "${RUN}-*" : ${rows.length}`);
      for (const r of rows) console.log(`  - id ${r.id} : ${r.name}`);
      return rows;
    });

    const mismatches = await test.step(STEP.s8, async () => {
      console.log(`\n--- ${STEP.s8} ---`);
      const diffs = compareFields([...backlog, ...live], leads);
      console.log(diffs.length ? diffs.map((d) => `  MISMATCH ${d}`).join('\n') : '  Every field of every Lead equals its submission.');
      return diffs;
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const expectedKeys = [...backlog, ...live].map((s) => s.key).sort();
      const leadKeys = leads.map((l) => keyOf(RUN, String(l.name))).sort();
      const returnedIds = results.filter((r) => r.id !== null).map((r) => r.id as number).sort((x, y) => x - y);
      const leadIds = leads.map((l) => l.id).sort((x, y) => x - y);
      const errors = results.filter((r) => r.id === null).map((r) => `${r.key}: ${r.error}`);
      const total = backlog.length + live.length;

      const checks: Check[] = [
        countCheck('Step 1 - Leads of this run before anything is sent', 0, baseline),
        countCheck('Step 3 - Leads of this run during the outage (baseline + 0)', baseline, duringOutage),
        {
          title: 'Step 5 - the live submissions were sent while the backlog was still being sent',
          expected: `fewer than ${backlog.length} backlog sends answered when the live sends started`,
          actual: `${settledAtLiveStart} of ${backlog.length} backlog sends answered`,
          passed: settledAtLiveStart >= 0 && settledAtLiveStart < backlog.length,
          difference: `all ${backlog.length} backlog sends had already answered - the live sends did not overlap the backlog`,
        },
        {
          title: `Step 6 - every send answered with a Lead ID, no error`,
          expected: `${total} Lead IDs, 0 errors`,
          actual: `${returnedIds.length} Lead IDs, ${errors.length} errors${errors.length ? `: ${errors.join('; ')}` : ''}`,
          passed: returnedIds.length === total && errors.length === 0,
          difference: `${total - returnedIds.length} send(s) without a Lead ID`,
        },
        countCheck(`Step 7 - Leads of this run after the reconnect (baseline + ${total})`, baseline + total, leads.length),
        {
          title: 'Step 7 - one Lead per submission, none missing, none duplicated',
          expected: expectedKeys.join(', '),
          actual: leadKeys.join(', '),
          passed: JSON.stringify(expectedKeys) === JSON.stringify(leadKeys),
          difference: keyDifference(expectedKeys, leadKeys),
        },
        {
          title: 'Step 7 - the Lead IDs are the ones returned in step 6',
          expected: returnedIds.join(', '),
          actual: leadIds.join(', '),
          passed: JSON.stringify(returnedIds) === JSON.stringify(leadIds),
          difference: idDifference(returnedIds, leadIds),
        },
        {
          title: `Step 8 - ${FORM_FIELDS.map((f) => FIELD_LABEL[f]).join(', ')} equal the submission on every Lead`,
          expected: '0 field mismatches (a mismatch = CRM stored something other than what the form sent)',
          actual: `${mismatches.length} field mismatches`,
          passed: mismatches.length === 0,
          difference: mismatches.join('; '),
        },
      ];
      printVerify(checks, 'every submission reached CRM exactly once with exactly the submitted data');
      for (const c of checks) expect.soft(c.passed, `${c.title} - ${c.passed ? '' : c.difference}`).toBe(true);
    });
  });

  test.afterEach(async () => {
    console.log(`\n--- afterEach - teardown (${RUN}) ---`);
    try {
      if (SKIP_CLEANUP) {
        console.log(`  SKIP_CLEANUP = true - Leads named "${RUN}-*" are left on pre-prod for a manual sweep`);
        return;
      }
      if (!ctx) ctx = await pwRequest.newContext({ baseURL: API_BASE, ignoreHTTPSErrors: true });
      if (!admin) admin = new ExternalApi(ctx, users.admin_crm);
      // Idempotent (finds the run's records by marker every time), so a gateway error just retries it.
      const deadline = Date.now() + CommonUtils.waitTimes.reliabilityTeardown;
      for (let attempt = 1; ; attempt++) {
        try {
          await admin.login();
          await deleteRunRecords(admin, RUN, runId, (BACKLOG_COUNT + LIVE_COUNT) * 2);
          break;
        } catch (e) {
          const reason = String((e as Error)?.message ?? e).split('\n')[0];
          if (Date.now() > deadline) {
            console.log(`  LEFTOVER - teardown gave up after ${attempt} attempts (${reason}); sweep by marker "${RUN}" / run id "${runId}"`);
            throw e;
          }
          console.log(`  teardown attempt ${attempt} failed (${reason}) - retrying`);
          await new Promise((r) => setTimeout(r, CommonUtils.waitTimes.reliabilityTeardownRetry));
        }
      }
    } finally {
      await ctx?.dispose();
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Helpers - kept in this file on purpose: each Reliability spec is self-contained.
// ---------------------------------------------------------------------------------------------

function makeSubmission(run: string, runId: string, kind: 'S' | 'L', n: number, contact: string, note: string, phoneBlock: string): Submission {
  const nn = String(n).padStart(2, '0');
  const key = `${kind}${nn}`;
  return {
    key,
    name: `${run}-${key}`,
    contact_name: `${contact} ${nn}`,
    email_from: `${key.toLowerCase()}@${runId}-${key.toLowerCase()}.example.com`,
    phone: `+1 555 ${phoneBlock}${nn}`,
    partner_name: `${run}-${key} Co`,
    description: `${note} ${nn}`,
  };
}

function logSubmission(s: Submission): void {
  console.log(`  ${s.key}:`);
  for (const f of FORM_FIELDS) console.log(`    ${FIELD_LABEL[f].padEnd(13)} = ${s[f]}`);
}

/** One form sent by B; a failure (or B giving up after timeoutMs) is recorded, not thrown, so the other sends keep going. */
async function send(api: ExternalApi, s: Submission,
  timeoutMs: number = CommonUtils.waitTimes.reliabilityCallTimeout): Promise<SendResult> {
  const vals: Record<string, string> = {};
  for (const f of FORM_FIELDS) vals[f] = s[f];
  const t0 = Date.now();
  try {
    const id = await api.call<number>('crm.lead', 'create', [vals], {}, timeoutMs);
    return { key: s.key, id, error: null, ms: Date.now() - t0 };
  } catch (e) {
    return { key: s.key, id: null, error: String((e as Error)?.message ?? e).split('\n')[0], ms: Date.now() - t0 };
  }
}

function runDomain(run: string): unknown[] {
  return [['name', '=like', `${run}-%`]];
}

function countRunLeads(api: ExternalApi, run: string): Promise<number> {
  return api.call<number>('crm.lead', 'search_count', [runDomain(run)]);
}

function readRunLeads(api: ExternalApi, run: string): Promise<LeadRow[]> {
  return api.call<LeadRow[]>('crm.lead', 'search_read', [runDomain(run)], { fields: [...FORM_FIELDS], limit: 200, order: 'id' });
}

function keyOf(run: string, leadName: string): string {
  return leadName.startsWith(`${run}-`) ? leadName.slice(run.length + 1) : leadName;
}

/** Field-by-field comparison; one entry per field that differs, naming the Lead and both values. */
function compareFields(subs: Submission[], leads: LeadRow[]): string[] {
  const diffs: string[] = [];
  for (const lead of leads) {
    const s = subs.find((x) => x.name === lead.name);
    if (!s) continue; // an unknown name is reported by the per-submission check
    for (const f of FORM_FIELDS) {
      const got = lead[f] === false ? '' : String(lead[f]);
      if (got !== s[f]) diffs.push(`${s.key} (id ${lead.id}) ${FIELD_LABEL[f]}: sent '${s[f]}', stored '${got}'`);
    }
  }
  return diffs;
}

interface Check { title: string; expected: string; actual: string; passed: boolean; difference: string }

function countCheck(title: string, expected: number, actual: number): Check {
  const delta = actual - expected;
  return {
    title,
    expected: String(expected),
    actual: String(actual),
    passed: actual === expected,
    difference: `expected '${expected}', got '${actual}' (${delta > 0 ? '+' : ''}${delta})`,
  };
}

/** REQUIREMENT #4c - names the missing and the duplicated submissions. */
function keyDifference(expected: string[], actual: string[]): string {
  const parts: string[] = [];
  const missing = expected.filter((k) => !actual.includes(k));
  const dup = [...new Set(actual.filter((k, i) => actual.indexOf(k) !== i))];
  const extra = [...new Set(actual.filter((k) => !expected.includes(k)))];
  if (missing.length) parts.push(`missing: ${missing.join(', ')}`);
  if (dup.length) parts.push(`more than one Lead: ${dup.map((k) => `${k} x${actual.filter((a) => a === k).length}`).join(', ')}`);
  if (extra.length) parts.push(`not a submission of this run: ${extra.join(', ')}`);
  return parts.join('; ') || 'none';
}

function idDifference(returned: number[], found: number[]): string {
  const notFound = returned.filter((id) => !found.includes(id));
  const notReturned = found.filter((id) => !returned.includes(id));
  const parts: string[] = [];
  if (notFound.length) parts.push(`returned to B but not in CRM: ${notFound.join(', ')}`);
  if (notReturned.length) parts.push(`in CRM but never returned to B: ${notReturned.join(', ')}`);
  return parts.join('; ') || 'none';
}

function printVerify(checks: Check[], passOutcome: string): void {
  console.log('\n==================== VERIFY ====================');
  checks.forEach((c, i) => {
    console.log(`  Verify #${i + 1} - ${c.title}:`);
    console.log(`     Expected : ${c.expected}`);
    console.log(`     Actual   : ${c.actual}`);
    console.log(`     Result   : ${c.passed ? 'PASS' : 'FAIL'}`);
    if (!c.passed) console.log(`     Difference : ${c.difference}`);
  });
  console.log('===============================================');
  const failed = checks.findIndex((c) => !c.passed);
  console.log(failed < 0
    ? `OVERALL: PASS - ${passOutcome}`
    : `OVERALL: FAIL - Verify #${failed + 1}: ${checks[failed].difference}`);
}

/**
 * Deletes what THIS run created - Leads named "<run>-*" and the Customers CRM generated from them
 * (company = "<run>-* Co", contacts whose email carries the run id). A deny-list by run marker,
 * never a complement; stops without deleting when the match count exceeds what the run can own.
 */
async function deleteRunRecords(api: ExternalApi, run: string, runId: string, maxOwnLeads: number): Promise<void> {
  const ctxAll = { context: { active_test: false } };
  // CRM creates the Customer of a new Lead 40-90 s after the create (measured 2026-11-03): wait for it,
  // or it is created after the Lead is gone and left behind - and a delete racing that creation waits on its lock.
  const waitUntil = Date.now() + CommonUtils.waitTimes.contactRefreshTotalWait;
  for (;;) {
    const pending = await api.call<number>('crm.lead', 'search_count', [[...runDomain(run), ['partner_id', '=', false]]], ctxAll);
    if (!pending || Date.now() > waitUntil) {
      console.log(`  Leads still without a Customer before delete : ${pending}`);
      break;
    }
    await new Promise((r) => setTimeout(r, CommonUtils.waitTimes.reliabilityTeardownRetry));
  }

  let leadIds = await api.call<number[]>('crm.lead', 'search', [runDomain(run)], { ...ctxAll, limit: 500 });
  console.log(`  Leads to delete     : ${leadIds.length} (${leadIds.join(', ') || '-'})`);
  if (leadIds.length > maxOwnLeads) {
    console.log(`  STOP - ${leadIds.length} Leads match "${run}-*", more than this run can own (${maxOwnLeads}). Nothing deleted.`);
    return;
  }
  const deadline = Date.now() + CommonUtils.waitTimes.reliabilityTeardown;
  while (leadIds.length && Date.now() < deadline) {
    try {
      await api.call('crm.lead', 'unlink', [leadIds], {}, CommonUtils.waitTimes.reliabilityTeardown);
    } catch (e) {
      console.log(`  unlink refused/slow, retrying: ${String((e as Error)?.message ?? e).split('\n')[0]}`);
      await new Promise((r) => setTimeout(r, CommonUtils.waitTimes.reliabilityTeardownRetry));
    }
    leadIds = await api.call<number[]>('crm.lead', 'search', [runDomain(run)], { ...ctxAll, limit: 500 });
  }

  const partnerDomain = ['|', ['name', '=like', `${run}-%`], ['email', 'ilike', runId]];
  const partnerIds = await api.call<number[]>('res.partner', 'search', [partnerDomain], { ...ctxAll, limit: 500 });
  console.log(`  Customers to delete : ${partnerIds.length} (${partnerIds.join(', ') || '-'})`);
  if (partnerIds.length > maxOwnLeads * 2) {
    console.log(`  STOP - ${partnerIds.length} Customers match the run marker, more than this run can own. Nothing deleted.`);
  } else {
    // One Customer per call: a 26-record batch overran 60 s on 2026-11-03, one record takes ~1.2 s.
    for (const id of partnerIds) {
      await api.call('res.partner', 'unlink', [[id]], {}, CommonUtils.waitTimes.reliabilityTeardown).catch((e) =>
        console.log(`  Customer ${id} unlink failed: ${String((e as Error)?.message ?? e).split('\n')[0]}`));
    }
  }
  const leftLeads = await api.call<number>('crm.lead', 'search_count', [runDomain(run)], ctxAll);
  const leftPartners = await api.call<number>('res.partner', 'search_count', [partnerDomain], ctxAll);
  console.log(`  Left after teardown : ${leftLeads} Leads, ${leftPartners} Customers`);
  if (leftLeads || leftPartners) console.log(`  LEFTOVER - sweep by marker "${run}" (Leads) / run id "${runId}" (Customers)`);
}
