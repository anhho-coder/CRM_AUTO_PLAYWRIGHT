import { test, expect, request as pwRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ========== Reliability_1.1.2 ==========
 * Test Case ID    : Reliability_1.1.2
 * Jira            : (not imported to Xray yet - add the key here and in the title when it is)
 * Test Repository : CRM test/Reliability_testing/Lead intake from web forms/Connection outage and recovery
 * Target          : pre-production.nakivo.site (db nakivo) - creates Leads, deletes them in afterEach
 * Run as          : B (form collector) = integration account sale_ic_thomas (Thomas Semerich)
 *                   checks + cleanup   = CRM admin admin_crm (Anh Ho)
 * Automation-Type : new
 * Automation-Date : 2026-11-03
 *
 * Summary:
 *   B sends one form, the connection drops before CRM answers, so B re-sends it. CRM saved the
 *   first send anyway; after the re-send CRM must still hold exactly one Lead for that form.
 *
 * Command to run:
 *   npx playwright test --grep "Reliability_1\.1\.2:" --project=Reliability
 *
 * Source manual TC : Reliability_1.1.2 in "D:\Claude - ready to import to Xray\
 *                    Reliability_lead-intake_outage-recovery_testcases.xlsx" (5 steps)
 * Source version   : written 2026-11-03, not in Xray yet - re-check against the Xray TC once imported
 *
 * Source manual TC:
 *   Pre-conditions:
 *     - The test plays the web-form collector (B): it sends each form to CRM (A) through the CRM
 *       integration interface (external API), the same way Zapier does
 *     - B sends as the integration account (e.g. Thomas Semerich)
 *     - Check the results and clean up as a CRM admin (e.g. Anh Ho)
 *     - Prepare 1 NEW form submission S01 with unique data:
 *         Lead name     = AUTO-REL-1.1.2-<runId>-S01
 *         Contact Name  = Rel Retry 01
 *         Email         = s01@<runId>-s01.example.com
 *         Phone         = +1 555 0301
 *         Company Name  = AUTO-REL-1.1.2-<runId>-S01 Co
 *         Notes         = Retry submission 01
 *
 *   Steps:
 *     1. In CRM > Leads, count the Leads named "AUTO-REL-1.1.2-<runId>-S01"
 *     2. B sends S01 to CRM, and the connection drops before CRM answers (B stops waiting after 0.3 seconds)
 *     3. Wait 15 seconds, then count the Leads named "AUTO-REL-1.1.2-<runId>-S01" again
 *     4. B has no confirmation, so it re-sends S01 and waits for the answer
 *     5. Wait 15 seconds, then count the active Leads named "AUTO-REL-1.1.2-<runId>-S01"
 *
 *   Expected:
 *     1. 0 Leads
 *     2. B gets no answer and no Lead ID
 *     3. 1 Lead (CRM saved the form although B never got the answer)
 *     4. CRM answers the re-send without error
 *     5. Exactly 1 Lead: the re-send did not create a second Lead for S01
 *
 * How the dropped connection is produced: on the client side. B stops waiting for the answer after
 *   0.3 s (a create takes ~3 s on pre-prod, measured 2026-11-03), so the CRM keeps working on a request
 *   whose answer nobody receives - the "lost acknowledgement". The network itself is NOT cut.
 * External API: the /jsonrpc "object.execute_kw" service = the same Odoo external API the Zapier
 *   connector calls over XML-RPC, with the same password authentication; only the encoding differs.
 * Open question (not in any spec read so far): whether preventing the duplicate is the CRM's job, the
 *   Integration Hub's, or the lead-merge job's. Step 5's expected result comes from the test goal
 *   "every form reaches CRM complete and exact" - confirm it with Dev/PM.
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

const TC = 'Reliability_1.1.2';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: [INTERNAL check, Call API] B signs in to the CRM integration interface (external API) as the integration account; the checking account signs in as CRM admin',
  pre2: 'Pre-condition 2: Prepare 1 form submission S01 with unique data',
  s1: 'Step 1: [INTERNAL check, Call API] In CRM > Leads, count the Leads named "AUTO-REL-1.1.2-<runId>-S01"',
  s2: 'Step 2: [INTERNAL check, Call API] B sends S01 to CRM, and the connection drops before CRM answers (B stops waiting after 0.3 seconds)',
  s3: 'Step 3: [INTERNAL check, Call API] Wait 15 seconds, then count the Leads named "AUTO-REL-1.1.2-<runId>-S01" again',
  s4: 'Step 4: [INTERNAL check, Call API] B has no confirmation, so it re-sends S01 and waits for the answer',
  s5: 'Step 5: [INTERNAL check, Call API] Wait 15 seconds, then count the active Leads named "AUTO-REL-1.1.2-<runId>-S01"',
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

test.describe('Reliability 1.1.2 - Re-send after a lost answer', () => {
  const runId = `r${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const RUN = `AUTO-REL-1.1.2-${runId}`;
  let ctx: APIRequestContext | undefined;
  let b: ExternalApi | undefined;
  let admin: ExternalApi | undefined;

  test(`${TC}: Form collector re-sends a submission whose answer was lost when the connection dropped`, async () => {
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

    let s01!: Submission;
    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      s01 = makeSubmission(RUN, runId, 'S', 1, 'Rel Retry', 'Retry submission', '03');
      console.log(`  Run marker : ${RUN}`);
      logSubmission(s01);
    });

    const baseline = await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const n = await countLeadsNamed(admin!, s01.name);
      console.log(`  Leads named "${s01.name}" : ${n}`);
      return n;
    });

    const first = await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const r = await send(b!, s01, CommonUtils.waitTimes.reliabilityAckGiveUp);
      console.log(`  B waited      : ${CommonUtils.waitTimes.reliabilityAckGiveUp} ms`);
      console.log(`  Lead ID       : ${r.id ?? 'none'}`);
      console.log(`  B saw         : ${r.error ?? 'an answer'} (${r.ms} ms)`);
      return r;
    });

    const afterLostAnswer = await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await new Promise((r) => setTimeout(r, CommonUtils.waitTimes.reliabilitySettleWait));
      const n = await countLeadsNamed(admin!, s01.name);
      console.log(`  Leads named "${s01.name}" : ${n}`);
      return n;
    });

    const resend = await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      const r = await send(b!, s01);
      console.log(`  Lead ID       : ${r.id ?? 'none'}`);
      console.log(`  B saw         : ${r.error ?? 'an answer'} (${r.ms} ms)`);
      return r;
    });

    const final = await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      await new Promise((r) => setTimeout(r, CommonUtils.waitTimes.reliabilitySettleWait));
      const active = await countLeadsNamed(admin!, s01.name);
      const all = await countLeadsNamed(admin!, s01.name, true);
      const ids = await admin!.call<number[]>('crm.lead', 'search', [[['name', '=', s01.name]]], { order: 'id' });
      console.log(`  Active Leads named "${s01.name}" : ${active} (${ids.join(', ') || '-'})`);
      console.log(`  Observation (not scored) - archived Leads with that name : ${all - active}`);
      return active;
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const gaveUp = first.id === null && /timeout/i.test(first.error ?? '');
      const checks: Check[] = [
        countCheck('Step 1 - Leads named S01 before anything is sent', 0, baseline),
        {
          title: 'Step 2 - B gets no answer and no Lead ID',
          expected: `no answer within ${CommonUtils.waitTimes.reliabilityAckGiveUp} ms, no Lead ID`,
          actual: first.id !== null ? `answered with Lead ID ${first.id}` : `no Lead ID - ${first.error}`,
          passed: gaveUp,
          difference: first.id !== null
            ? `CRM answered within ${CommonUtils.waitTimes.reliabilityAckGiveUp} ms - the lost answer was not reproduced`
            : `the send failed with something other than B giving up: ${first.error}`,
        },
        countCheck('Step 3 - Leads named S01 after the lost answer (baseline + 1: CRM saved it anyway)', baseline + 1, afterLostAnswer),
        {
          title: 'Step 4 - CRM answers the re-send without error',
          expected: 'an answer with a Lead ID, no error',
          actual: resend.id !== null ? `Lead ID ${resend.id}` : `no Lead ID - ${resend.error}`,
          passed: resend.id !== null,
          difference: `the re-send got no Lead ID: ${resend.error}`,
        },
        countCheck('Step 5 - active Leads named S01 after the re-send (baseline + 1; baseline + 2 = the re-send created a duplicate)', baseline + 1, final),
      ];
      printVerify(checks, 'the re-send after a lost answer left exactly one Lead for the form');
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
          await deleteRunRecords(admin, RUN, runId, 4);
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

function countLeadsNamed(api: ExternalApi, name: string, includeArchived = false): Promise<number> {
  return api.call<number>('crm.lead', 'search_count', [[['name', '=', name]]],
    includeArchived ? { context: { active_test: false } } : {});
}
