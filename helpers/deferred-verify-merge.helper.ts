import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'fs';
import { dirname, isAbsolute, resolve } from 'path';

/**
 * Deferred re-verify helper for async Lead MERGING (mirror of helpers/deferred-verify.helper.ts,
 * which does the same for Lead Assignment).
 *
 * Problem: lead merging runs on an async Odoo cron (~10 min). Two failure modes follow from that:
 *   - A POSITIVE ("should merge") spec asserts before the cron fires -> the merge chatter message is
 *     absent and the test FALSE-FAILS, even though the leads usually merge correctly minutes later.
 *   - A NEGATIVE ("should NOT merge") spec waits only 90s (leadMergingNotHappen); a wrongly-slow merge
 *     can land AFTER that window, so the no-merge assertion FALSE-PASSES while a real merge appears later.
 *
 * Strategy (identical to Lead Assignment): round-1 keeps its assertions but ALSO appends every merge
 * checkpoint to a JSONL manifest - one line per {leadUrl, role, expected, counterpartName}. A separate
 * Jenkins job (CRM_Lead_Merging_DeferredVerify) runs ~1h later, re-opens each lead URL and produces the
 * authoritative verdict:
 *     expected 'merged'     -> the merge chatter message MUST be present by now (the cron caught up)
 *     expected 'not_merged' -> the merge chatter message MUST STILL be absent ~1h later
 *
 * This emitter is a NO-OP unless env DEFERRED_MERGE_MANIFEST is set, so it has zero effect on local /
 * non-CI runs, and never throws (a manifest write must not fail an otherwise-passing test).
 */

/** 'any' (crm-mig negatives) = no "has been merged into" line in either direction - round-2 reads the whole log. */
export type MergeRole = 'source' | 'target' | 'any';
export type MergeExpected = 'merged' | 'not_merged';

export interface MergeDeferredRecord {
  tcId: string;
  title: string;
  leadUrl: string;
  /**
   * Which side of the merge this URL is, so round-2 checks the right chatter message:
   *   'source' = the merged-AWAY lead   -> "This lead has been merged into <counterpart>"  (hasTargetLeadMergeMessage)
   *   'target' = the SURVIVING lead     -> "<counterpart>, has been merged into this lead" (hasSourceLeadMergeMessage)
   */
  role: MergeRole;
  expected: MergeExpected;
  /** The OTHER lead's name - used to build the exact chatter message round-2 looks for. */
  counterpartName: string;
  /** 'merged' | 'not_merged' - the state observed at round-1 time. */
  firstRunActual: string;
  runAtIso: string;
  /** Spec FILE path - round-2's dedup key (collapses retries of one spec). */
  specFile?: string;
  /** crm-mig only: which form the URL opens, so round-2 reads it with the matching Mig page object. */
  form?: 'lead' | 'opportunity';
}

/** One deletion of the crm-mig teardown ledger, in the order the teardown would have run it. */
export interface MigCleanupEntry {
  model: string;
  id: number;
  label: string;
  deleteLast?: boolean;
}

/**
 * crm-mig teardown handed to round-2: written INSTEAD of deleting when the test left a merge checkpoint, because
 * round-2 must still find the leads ~90 min later. Round-2 deletes exactly these ids (this run's own) after its re-check.
 */
export interface MigCleanupRecord {
  kind: 'mig-cleanup';
  tcId: string;
  title: string;
  specFile: string;
  runAtIso: string;
  records: MigCleanupEntry[];
}

/** True for a crm-mig record URL - the pre-production round-2 leaves these to the crm-mig round-2. */
export function isMigRecordUrl(url: string): boolean {
  return /\/\/crm-mig\.nakivo\.site\//.test(url);
}

/**
 * Canonical `test.skip()` reason for a POSITIVE merge spec whose merge has NOT fired within the short
 * wait. The spec emits its deferred record (via the LeadPage merge-wait chokepoint) and then skips with
 * this message, handing the authoritative verdict to the round-2 re-verify job instead of false-failing
 * on a merely-late cron. Kept here so the wording stays identical across specs. ASCII-only (spec/step
 * labels must be plain ASCII).
 */
export function mergeDeferSkipReason(tcId: string): string {
  return `${tcId}: leads not merged within the short wait - deferred to round-2 re-verify (async merge cron may be late; not a failure).`;
}

function manifestPath(): string | null {
  const p = process.env.DEFERRED_MERGE_MANIFEST;
  if (!p) return null;
  // During round-2 (DEFERRED_MERGE_VERIFY_RUN set) the re-verify spec re-opens leads and calls the SAME
  // LeadPage merge-wait helpers to READ - it must NOT emit again. Disable all emit while re-verifying.
  if (process.env.DEFERRED_MERGE_VERIFY_RUN) return null;
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

/** Current spec FILE path, or '' outside a running test. Round-2 dedups on this. */
function safeFile(): string {
  try {
    return test.info().file;
  } catch {
    return '';
  }
}

/**
 * Pull the "CRM-xxxx_x.x.x" / "TC.xxx" id out of the test's FULL title path (describe + test). Merge
 * specs put the id on the DESCRIBE block ("CRM-1664_1.1.1 - ...") while the test() name starts with
 * "Verify ..." - so a plain test-title prefix match would wrongly yield "Verify". Falls back to the
 * innermost-title prefix, then a slice.
 */
function extractTcId(): string {
  let parts: string[] = [];
  try {
    parts = test.info().titlePath || [];
  } catch {
    parts = [];
  }
  const joined = (parts.length ? parts.join(' ') : safeTitle());
  const idMatch = joined.match(/(CRM-\d+_\d+(?:\.\d+)*)/) || joined.match(/(LeadMerging-Exploratory_\d+(?:\.\d+)*)/) || joined.match(/(TC\.[A-Za-z0-9_.-]+)/);
  if (idMatch) return idMatch[1];
  const t = safeTitle();
  const p = t.match(/^([A-Za-z0-9._-]+?)(?=:|\s|\[)/);
  return p ? p[1] : t.slice(0, 60);
}

/**
 * A URL is only worth re-verifying if it points at a saved record. In Odoo 12 an Opportunity IS a
 * crm.lead (type=opportunity), so converted-Opp URLs are model=crm.lead too. Accept crm.opportunity
 * defensively in case a flow/version ever surfaces that model.
 */
function isSavedRecordUrl(url: string): boolean {
  return /[?#].*\bid=\d+/.test(url) && /model=crm\.(lead|opportunity)/.test(url);
}

function appendRecords(path: string, records: MergeDeferredRecord[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const lines = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  appendFileSync(path, lines, 'utf8');
}

export interface RecordMergeOptions {
  role: MergeRole;
  counterpartName: string;
  expected: MergeExpected;
  /** Whether the merge was observed at round-1 time. */
  merged: boolean;
  /** Defaults to page.url() (the lead the round-1 wait was polling). Pass explicitly for the OTHER lead. */
  leadUrl?: string;
  /** crm-mig only - see MergeDeferredRecord.form. */
  form?: 'lead' | 'opportunity';
}

/** Tests (testId) of this worker that wrote a crm-mig checkpoint - their teardown goes to round-2. */
const migCheckpointTests = new Set<string>();
/** TC ids whose crm-mig teardown was handed to round-2 - their afterAll sweep must leave the records alone. */
const migHandedOffTcIds = new Set<string>();

function safeTestId(): string {
  try {
    return test.info().testId;
  } catch {
    return '';
  }
}

/**
 * Record ONE lead's merge checkpoint for the round-2 re-verify job. No-op unless DEFERRED_MERGE_MANIFEST
 * is set; never throws.
 */
export function recordMergeForDeferredVerify(page: Page, opts: RecordMergeOptions): void {
  const path = manifestPath();
  if (!path) return;

  const leadUrl = opts.leadUrl ?? page.url();
  if (!isSavedRecordUrl(leadUrl)) {
    console.log(`  [deferred-verify-merge] skipped - URL is not a saved crm.lead: ${leadUrl}`);
    return;
  }

  const title = safeTitle();
  const record: MergeDeferredRecord = {
    tcId: extractTcId(),
    title,
    specFile: safeFile(),
    leadUrl,
    role: opts.role,
    expected: opts.expected,
    counterpartName: opts.counterpartName,
    firstRunActual: opts.merged ? 'merged' : 'not_merged',
    runAtIso: new Date().toISOString(),
    ...(opts.form ? { form: opts.form } : {}),
  };

  try {
    appendRecords(path, [record]);
    if (isMigRecordUrl(leadUrl)) migCheckpointTests.add(safeTestId());
    console.log(
      `  [deferred-verify-merge] recorded ${record.tcId} ` +
      `(role=${opts.role}, expected=${opts.expected}, counterpart="${opts.counterpartName}") -> ${path}`,
    );
  } catch (err) {
    console.log(`  [deferred-verify-merge] WARNING: could not write manifest (${err instanceof Error ? err.message : String(err)}) - skipping ${record.tcId}`);
  }
}

/**
 * Convenience for POSITIVE specs - called from the LeadPage merge-wait chokepoints
 * (waitForLeadMergingHappen / waitForLeadMergingHappen_OnTargetLead). Records ONLY when the merge did
 * NOT fire within the short wait (the defer case); a merge that already succeeded needs no round-2.
 * No-op unless DEFERRED_MERGE_MANIFEST is set.
 */
export function recordMergeDeferIfNotMerged(
  page: Page,
  role: MergeRole,
  counterpartName: string,
  merged: boolean,
): void {
  if (merged) return;
  recordMergeForDeferredVerify(page, { role, counterpartName, expected: 'merged', merged });
}

/**
 * Convenience for NEGATIVE ("should NOT merge") specs. Call once per lead AFTER the round-1 no-merge
 * wait, passing that lead's URL + the counterpart name. Round-2 re-confirms the merge message is STILL
 * absent ~1h later (catches a wrongly-slow merge that beat the 90s no-merge window). Round-1 keeps its
 * own no-merge assertions unchanged - this only ADDS the deferred record. No-op unless
 * DEFERRED_MERGE_MANIFEST is set.
 */
export function recordNoMergeForDeferredVerify(
  page: Page,
  leadUrl: string,
  role: MergeRole,
  counterpartName: string,
): void {
  recordMergeForDeferredVerify(page, { role, counterpartName, expected: 'not_merged', merged: false, leadUrl });
}

/**
 * crm-mig teardown hand-off (tester's decision 2026-11-03): when the CURRENT test wrote a crm-mig merge checkpoint,
 * round-2 must still find its leads ~90 min later, so instead of deleting, the teardown appends the deletion list -
 * the ids THIS run registered, already in deletion order - to the manifest, and round-2 deletes exactly those ids
 * after its re-check. Returns true when handed off (the caller then deletes nothing); false = delete now as usual
 * (no manifest, no checkpoint this test, or the write failed). Never throws.
 */
export function handOffMigCleanupToRound2(queued: MigCleanupEntry[]): boolean {
  const path = manifestPath();
  const testId = safeTestId();
  if (!path || !testId || !migCheckpointTests.has(testId) || queued.length === 0) return false;
  const line: MigCleanupRecord = {
    kind: 'mig-cleanup',
    tcId: extractTcId(),
    title: safeTitle(),
    specFile: safeFile(),
    runAtIso: new Date().toISOString(),
    records: queued.map((r) => ({ model: r.model, id: r.id, label: r.label, ...(r.deleteLast ? { deleteLast: true } : {}) })),
  };
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(line) + '\n', 'utf8');
  } catch (err) {
    console.log(`  [deferred-verify-merge] WARNING: could not hand the teardown to round-2 (${err instanceof Error ? err.message : String(err)}) - deleting now`);
    return false;
  }
  migCheckpointTests.delete(testId);
  migHandedOffTcIds.add(line.tcId);
  console.log(
    `\n[mig-cleanup] HANDED TO ROUND-2 - ${queued.length} record(s) kept on crm-mig until the deferred re-verify ` +
    `(~90 min) re-checks the merge and deletes them -> ${path}\n` +
    queued.map((r) => `  deferred ${r.model}#${r.id} (${r.label})`).join('\n'),
  );
  return true;
}

/** True when this worker handed `tcId`'s crm-mig teardown to round-2 - an afterAll sweep must then leave its records. */
export function migCleanupHandedOff(tcId: string): boolean {
  return migHandedOffTcIds.has(tcId);
}
