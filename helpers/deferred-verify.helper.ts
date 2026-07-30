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
  expected: string;      // team name for sales_team, or SALESPERSON_EXPECTED sentinel
  firstRunActual: string;
  runAtIso: string;
}

function manifestPath(): string | null {
  const p = process.env.DEFERRED_MANIFEST;
  if (!p) return null;
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

/** Pull the "TC.xxx" / "CRM-xxxx_x.x.x" id prefix out of the test title. */
function extractTcId(title: string): string {
  const m = title.match(/^([A-Za-z0-9._-]+?)(?=:|\s|\[)/);
  return m ? m[1] : title.slice(0, 60);
}

/** A URL is only worth re-verifying if it points at a saved record. */
function isSavedRecordUrl(url: string): boolean {
  return /[?#].*\bid=\d+/.test(url) && /model=crm\.lead/.test(url);
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
  const base = { tcId, title, leadUrl, runAtIso };

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
