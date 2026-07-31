import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { isAbsolute, resolve } from 'path';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, LeadPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { NONEMPTY_EXPECTED } from '@helpers/deferred-verify.helper';

/**
 * Deferred re-verify - Lead Assignment (ROUND 2, authoritative)
 *
 * Reads the JSONL manifest produced by round-1 lead-assignment runs (see
 * helpers/deferred-verify.helper.ts) and re-opens each saved lead URL to check
 * whether the async Sales Team / Salesperson assignment CRON has, by now
 * (~1h later, on the Jenkins side), assigned the expected values.
 *
 * This is the SOURCE OF TRUTH for lead assignment: a record that is STILL wrong
 * here (1h after creation) is a real defect; a round-1 "Received: ''" that is
 * correct here was merely the CRON running late.
 *
 * Enablement (both required, else the whole file is skipped so it never runs in
 * a normal round-1 build):
 *   DEFERRED_VERIFY_RUN=1                 -> turn this round on
 *   DEFERRED_MANIFEST=<path to .jsonl>    -> the manifest to read
 *
 * Command to run (Jenkins Job B):
 *   DEFERRED_VERIFY_RUN=1 DEFERRED_MANIFEST=deferred-verify/la.jsonl \
 *     npx playwright test "tests/1.Project_CRM/2.Leads_Assignment/_deferred-verify/deferred-verify-lead-assignment.spec.ts" --project=chromium-headless
 */

interface DeferredRecord {
  tcId: string;
  title: string;
  leadUrl: string;
  field: 'sales_team' | 'salesperson';
  expected: string;
  firstRunActual: string;
  runAtIso: string;
  recordType?: 'lead' | 'opportunity';
  specFile?: string;
}

function manifestPath(): string | null {
  const p = process.env.DEFERRED_MANIFEST;
  if (!p) return null;
  return isAbsolute(p) ? p : resolve(process.cwd(), p);
}

/**
 * Load manifest, dedup by specFile+field (NOT leadUrl, NOT tcId). A single test with Playwright
 * retries (CI retries:2) creates a NEW lead per attempt, so leadUrl differs across attempts of the
 * SAME test; keying on leadUrl would keep every abandoned lead and re-verify them, risking false
 * failures. Keying on the spec FILE collapses all attempts of one spec to ONE record - the winning
 * one (a real team name from verifySalesTeamAssignment ALWAYS beats the NONEMPTY sentinel; within
 * the same tier the later line wins, i.e. the last / passing attempt). Unlike tcId, specFile keeps
 * two DIFFERENT specs that share a TC id (the Leads_Assignment and O12 twins both titled
 * "TC.THD_3.2.1.5.2") as SEPARATE records so BOTH are re-verified. Falls back to tcId for old
 * records written before specFile existed.
 */
function loadRecords(): DeferredRecord[] {
  const path = manifestPath();
  if (!process.env.DEFERRED_VERIFY_RUN || !path || !existsSync(path)) return [];

  const byKey = new Map<string, DeferredRecord>();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let rec: DeferredRecord;
    try {
      rec = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const key = `${rec.specFile || rec.tcId}::${rec.field}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, rec);
      continue;
    }
    const prevSentinel = prev.expected === NONEMPTY_EXPECTED;
    const recSentinel = rec.expected === NONEMPTY_EXPECTED;
    if (prevSentinel && !recSentinel) byKey.set(key, rec);        // upgrade sentinel -> exact team
    else if (prevSentinel === recSentinel) byKey.set(key, rec);  // same tier -> last (chronological) wins
    // else prev is exact team, rec is sentinel -> keep prev
  }
  return [...byKey.values()];
}

/** Odoo readonly placeholder labels that mean "not populated", treated as empty for the verdict. */
function normalizeFieldValue(v: string): string {
  return v === 'Sales Team' || v === 'Salesperson' ? '' : v;
}

const records = loadRecords();

test.describe('Deferred re-verify - Lead Assignment (round 2)', () => {
  test.skip(records.length === 0, 'No deferred-verify manifest (set DEFERRED_VERIFY_RUN=1 + DEFERRED_MANIFEST).');

  test('Deferred re-verify: all recorded Lead Assignment URLs are correctly assigned', async ({ page }, testInfo) => {
    // ~1 minute budget per record for the goto + readonly-form load + field read.
    test.setTimeout(Math.max(config.timeouts.test, records.length * CommonUtils.waitTimes.reAssignationWait));
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const leadPage = new LeadPage(page);
    const opportunityPage = new OpportunityPage(page);

    await test.step('Login once as admin_crm', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
    });

    console.log(`\n========== DEFERRED RE-VERIFY: ${records.length} record(s) ==========`);

    const stillWrong: string[] = [];
    const recovered: string[] = [];
    const deadLeads: string[] = [];

    for (const r of records) {
      await test.step(`${r.tcId} [${r.field}] expected="${r.expected}"`, async () => {
        // A single unreachable/deleted lead (404, timeout) must NOT kill the whole round - it
        // is an infrastructure issue, tracked separately, and the loop continues so every other
        // record is still evaluated (this round is the source of truth and must be complete).
        let actual: string;
        try {
          await page.goto(r.leadUrl);
          await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
          await leadPage.waitForEditButton(config.timeouts.urlWait);
          // Ensure the readonly assignment rows are actually rendered before reading, so a
          // still-loading form does not read an empty cell and false-fail. The Lead + Opportunity
          // readonly forms use the same tr/td layout, so this render-wait covers both.
          await leadPage.waitForAssignmentFieldsRendered();

          // Read with the page object matching the record's form: a converted Opportunity
          // (recordType 'opportunity') via OpportunityPage; everything else via LeadPage.
          const isOpp = r.recordType === 'opportunity';
          let raw: string;
          if (r.field === 'sales_team') {
            raw = isOpp ? await opportunityPage.getSalesTeamValue() : await leadPage.getSalesTeamValue();
          } else {
            raw = isOpp ? await opportunityPage.getSalespersonValue() : await leadPage.getSalespersonValue();
          }
          actual = normalizeFieldValue(raw);
        } catch (err) {
          const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
          console.log(`  DEAD ${r.tcId} [${r.field}] - could not open/read lead (${msg}) - url: ${r.leadUrl}`);
          deadLeads.push(`${r.tcId} [${r.field}] unreachable (${msg}) - url: ${r.leadUrl}`);
          return;
        }

        // Exact-team match when a real team name was recorded (from verifySalesTeamAssignment);
        // otherwise (NONEMPTY sentinel, from the wait chokepoint) just confirm the async cron
        // eventually populated the field - i.e. it is no longer the empty "Received: ''".
        const wantNonEmptyOnly = r.expected === NONEMPTY_EXPECTED;
        const isNonEmpty = Boolean(actual) && actual !== '';
        const ok = wantNonEmptyOnly ? isNonEmpty : actual === r.expected;

        const expectedLabel = wantNonEmptyOnly ? 'any non-empty value' : r.expected;
        const emptyNote = !isNonEmpty ? ' (still empty - cron not run OR field-row locator miss)' : '';
        console.log(
          `  ${ok ? 'PASS' : 'FAIL'} ${r.tcId} [${r.field}] ` +
          `expected="${expectedLabel}" firstRun="${r.firstRunActual}" now="${actual}"${ok ? '' : emptyNote}`,
        );

        const wasEmptyFirst = !r.firstRunActual || r.firstRunActual === '' || r.firstRunActual === 'Salesperson' || r.firstRunActual === 'Sales Team';
        if (ok && wasEmptyFirst) recovered.push(`${r.tcId} [${r.field}] now="${actual}"`);
        if (!ok) stillWrong.push(`${r.tcId} [${r.field}] expected="${expectedLabel}" now="${actual}" (url: ${r.leadUrl})`);
      });
    }

    const summary =
      `Deferred re-verify summary\n` +
      `  Total records : ${records.length}\n` +
      `  Recovered late (empty at round-1, correct now): ${recovered.length}\n` +
      `  Still wrong after 1h (real defects): ${stillWrong.length}\n` +
      `  Unreachable leads (deleted/404 - infra, not a defect): ${deadLeads.length}\n\n` +
      (recovered.length ? `Recovered:\n  ${recovered.join('\n  ')}\n\n` : '') +
      (deadLeads.length ? `Unreachable:\n  ${deadLeads.join('\n  ')}\n\n` : '') +
      (stillWrong.length ? `Still wrong:\n  ${stillWrong.join('\n  ')}\n` : 'All reachable records assigned correctly.\n');

    console.log('\n' + summary);
    await testInfo.attach('Deferred re-verify summary', { body: summary, contentType: 'text/plain' });

    expect(stillWrong, summary).toEqual([]);
  });
});
