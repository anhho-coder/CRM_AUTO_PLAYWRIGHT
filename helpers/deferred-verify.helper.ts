import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'fs';
import { dirname, isAbsolute, resolve } from 'path';

/**
 * Deferred re-verify helper for async Lead Assignment.
 *
 * Problem: the Sales Team / Salesperson auto-assignment runs on an async Odoo
 * CRON. When it has not fired by the time a lead-assignment spec asserts, the
 * field is empty (Received: "") and the test fails - even though the lead is
 * usually assigned correctly >30 min later.
 *
 * Strategy: round-1 (the normal run) keeps its expect() assertions but ALSO
 * appends every checked assignment to a shared JSONL manifest (one line per
 * {leadUrl, field, expected}). A separate Jenkins job runs ~1h later, reads the
 * manifest and re-opens each lead URL to produce the authoritative verdict.
 *
 * This emitter is a NO-OP unless the env var DEFERRED_MANIFEST is set, so it has
 * zero effect on local / non-CI runs.
 */

/**
 * Sentinel `expected` meaning "any non-empty value" - used for Salesperson (never a
 * fixed name) and for the Sales Team when recorded from the wait chokepoint, which does
 * not know the expected team. Round-2 treats this as a non-empty check instead of an
 * exact match. When a spec ALSO calls verifySalesTeamAssignment(team) afterwards, that
 * later record (real team name) supersedes this one via the leadUrl+field dedup.
 */
export const NONEMPTY_EXPECTED = '<non-empty>';
/** @deprecated use NONEMPTY_EXPECTED */
export const SALESPERSON_EXPECTED = NONEMPTY_EXPECTED;

export interface DeferredVerifyRecord {
  tcId: string;
  title: string;
  leadUrl: string;
  field: 'sales_team' | 'salesperson';
  expected: string;      // team name for sales_team, or NONEMPTY_EXPECTED sentinel
  firstRunActual: string;
  runAtIso: string;
  // Which form the URL re-opens to, so round-2 picks the right reader. Absent = 'lead'
  // (back-compat: existing lead records have no recordType). 'opportunity' = converted Opp.
  recordType?: 'lead' | 'opportunity';
  // Spec file path - round-2's dedup key (collapses retries, keeps same-tcId twins separate).
  specFile?: string;
}

function manifestPath(): string | null {
  const p = process.env.DEFERRED_MANIFEST;
  if (!p) return null;
  // During round-2 (DEFERRED_VERIFY_RUN set) the deferred-verify spec re-opens leads and calls the
  // page-object getters to READ - it must NOT emit again (that getter also backs the emit chokepoint
  // for the Opportunity path). Disable all emit while re-verifying.
  if (process.env.DEFERRED_VERIFY_RUN) return null;
  return isAbsolute(p) ? p : resolve(process.cwd(), p);
}

/** Current test title, or '' when called outside a running test. */
function safeTitle(): string {
  try {
    return test.info().title;
  } catch {
    return '';
  }
}

/**
 * Current spec FILE path, or '' outside a running test. Round-2 dedups on this (not tcId) so that
 * retries of ONE spec (same file, different lead per attempt) collapse to the final attempt, while
 * two DIFFERENT specs that happen to share a TC id (e.g. the Leads_Assignment and O12 twins both
 * titled "TC.THD_3.2.1.5.2") stay as separate records and are BOTH re-verified.
 */
function safeFile(): string {
  try {
    return test.info().file;
  } catch {
    return '';
  }
}

/** Pull the "TC.xxx" / "CRM-xxxx_x.x.x" id prefix out of the test title. */
function extractTcId(title: string): string {
  const m = title.match(/^([A-Za-z0-9._-]+?)(?=:|\s|\[)/);
  return m ? m[1] : title.slice(0, 60);
}

/**
 * A URL is only worth re-verifying if it points at a saved record. In Odoo 12 an Opportunity IS a
 * crm.lead (type=opportunity), so converted-Opp URLs are model=crm.lead too (verified live on
 * pre-prod: .../web?#id=1024464&...&model=crm.lead...). We still accept crm.opportunity defensively
 * in case a flow/version ever surfaces that model.
 */
function isSavedRecordUrl(url: string): boolean {
  return /[?#].*\bid=\d+/.test(url) && /model=crm\.(lead|opportunity)/.test(url);
}

function appendRecords(path: string, records: DeferredVerifyRecord[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const lines = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  appendFileSync(path, lines, 'utf8');
}

/**
 * Record a lead's Sales Team + Salesperson checkpoints for deferred re-verify.
 * Called from LeadPage.verifySalesTeamAssignment (the shared chokepoint) so most
 * specs need no edit. No-op unless DEFERRED_MANIFEST is set.
 */
export function recordAssignmentForDeferredVerify(
  page: Page,
  expectedSalesTeam: string,
  salesTeamValue: string,
  salespersonValue: string,
): void {
  const path = manifestPath();
  if (!path) return;

  const leadUrl = page.url();
  if (!isSavedRecordUrl(leadUrl)) {
    console.log(`  [deferred-verify] skipped - URL is not a saved crm.lead: ${leadUrl}`);
    return;
  }

  const title = safeTitle();
  const tcId = extractTcId(title);
  const runAtIso = new Date().toISOString();
  const base = { tcId, title, specFile: safeFile(), leadUrl, runAtIso };

  // NEVER let a manifest-write error fail an otherwise-passing test - this emit runs at the end
  // of a green verification step. Any fs failure (disk full, permission, bad path) is swallowed
  // with a warning; the deferred round simply won't see this record.
  try {
    appendRecords(path, [
      { ...base, field: 'sales_team', expected: expectedSalesTeam, firstRunActual: salesTeamValue },
      { ...base, field: 'salesperson', expected: NONEMPTY_EXPECTED, firstRunActual: salespersonValue },
    ]);
    console.log(`  [deferred-verify] recorded ${tcId} (sales_team="${expectedSalesTeam}", salesperson) -> ${path}`);
  } catch (err) {
    console.log(`  [deferred-verify] WARNING: could not write manifest (${err instanceof Error ? err.message : String(err)}) - skipping record for ${tcId}`);
  }
}

/**
 * Record a lead's assignment from the WAIT chokepoint (LeadPage.waitForSalesTeamAssignment),
 * which does not know the expected team - so both fields are recorded with the NONEMPTY_EXPECTED
 * sentinel (round-2 checks "field became non-empty"). Covers the many specs that poll + assert
 * inline WITHOUT calling verifySalesTeamAssignment. When a spec does call verify afterwards, its
 * exact-team record supersedes this via the leadUrl+field dedup (latest runAtIso wins).
 * No-op unless DEFERRED_MANIFEST is set.
 */
export function recordAssignmentNonEmptyForDeferredVerify(
  page: Page,
  salesTeamValue: string,
  salespersonValue: string,
): void {
  recordAssignmentForDeferredVerify(page, NONEMPTY_EXPECTED, salesTeamValue, salespersonValue);
}

/**
 * Record ONE assigned field of a CONVERTED OPPORTUNITY for deferred re-verify. The 16 convert-to-Opp
 * specs read the assigned Sales Team / Salesperson via OpportunityPage.getSalesTeamValue /
 * getSalespersonValue (called ONCE at the final verify step, not in a loop), then assert inline with
 * per-spec expected values - so there is no shared chokepoint carrying the expected team. We emit
 * per-field with the NONEMPTY sentinel (round-2 confirms the async cron eventually populated the
 * Opp field) and recordType 'opportunity' so round-2 reads the Opportunity form. No-op unless
 * DEFERRED_MANIFEST is set; never throws (a manifest error must not fail a passing test).
 */
export function recordOpportunityFieldForDeferredVerify(
  page: Page,
  field: 'sales_team' | 'salesperson',
  actualValue: string,
): void {
  const path = manifestPath();
  if (!path) return;

  const leadUrl = page.url();
  if (!isSavedRecordUrl(leadUrl)) {
    console.log(`  [deferred-verify] skipped - URL is not a saved crm.lead/crm.opportunity: ${leadUrl}`);
    return;
  }

  const title = safeTitle();
  const record: DeferredVerifyRecord = {
    tcId: extractTcId(title),
    title,
    specFile: safeFile(),
    leadUrl,
    field,
    expected: NONEMPTY_EXPECTED,
    firstRunActual: actualValue,
    runAtIso: new Date().toISOString(),
    recordType: 'opportunity',
  };
  try {
    appendRecords(path, [record]);
    console.log(`  [deferred-verify] recorded ${record.tcId} (opportunity ${field}) -> ${path}`);
  } catch (err) {
    console.log(`  [deferred-verify] WARNING: could not write manifest (${err instanceof Error ? err.message : String(err)}) - skipping ${field} for ${record.tcId}`);
  }
}

/**
 * Convenience for the convert-to-Opportunity specs: emit ONLY the assignment field(s) the spec
 * verifies as non-empty. Pass `salesTeam` and/or `salesperson` (the value the spec just read) to
 * defer-verify that field; OMIT a field the spec does not assert or expects to stay EMPTY (e.g.
 * a "salesperson cleared" case), so round-2 never demands a value that should not be there.
 * No-op unless DEFERRED_MANIFEST is set; never throws.
 */
export function recordOppAssignmentForDeferredVerify(
  page: Page,
  values: { salesTeam?: string; salesperson?: string },
): void {
  if (values.salesTeam !== undefined) recordOpportunityFieldForDeferredVerify(page, 'sales_team', values.salesTeam);
  if (values.salesperson !== undefined) recordOpportunityFieldForDeferredVerify(page, 'salesperson', values.salesperson);
}
