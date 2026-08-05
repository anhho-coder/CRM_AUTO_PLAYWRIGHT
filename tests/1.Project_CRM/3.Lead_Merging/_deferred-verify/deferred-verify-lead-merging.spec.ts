import { test, expect } from '@playwright/test';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { isAbsolute, resolve, dirname } from 'path';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Deferred re-verify - Lead Merging (ROUND 2, authoritative)
 *
 * Reads the JSONL manifest produced by round-1 lead-merging runs (see
 * helpers/deferred-verify-merge.helper.ts) and re-opens each saved lead URL to check whether the async
 * merge cron has, by now (~1h later, on the Jenkins side), reached the expected merge state:
 *   expected 'merged'     -> a POSITIVE spec whose merge was late at round-1: the merge chatter message
 *                            must be present now (the cron caught up). Still absent = a real merge defect.
 *   expected 'not_merged' -> a NEGATIVE spec: the merge chatter message must STILL be absent. Present now
 *                            = leads merged when they should not have (a wrongly-slow merge that beat the
 *                            round-1 90s no-merge window).
 *
 * This is the SOURCE OF TRUTH for lead merging. Enablement (both required, else the whole file is skipped
 * so it never runs in a normal round-1 build):
 *   DEFERRED_MERGE_VERIFY_RUN=1                 -> turn this round on
 *   DEFERRED_MERGE_MANIFEST=<path to .jsonl>    -> the manifest to read
 *
 * Command to run (Jenkins job CRM_Lead_Merging_DeferredVerify):
 *   DEFERRED_MERGE_VERIFY_RUN=1 DEFERRED_MERGE_MANIFEST=deferred-verify/gathered.jsonl \
 *     npx playwright test "tests/1.Project_CRM/3.Lead_Merging/_deferred-verify/deferred-verify-lead-merging.spec.ts" --project=chrome-headless
 */

interface MergeDeferredRecord {
  tcId: string;
  title: string;
  leadUrl: string;
  role: 'source' | 'target';
  expected: 'merged' | 'not_merged';
  counterpartName: string;
  firstRunActual: string;
  runAtIso: string;
  specFile?: string;
}

/** One round-2 verdict per manifest record - machine-readable output for later Allure reclassification. */
interface MergeVerdict {
  tcId: string;
  specFile?: string;
  leadUrl: string;
  role: 'source' | 'target';
  expected: string;
  firstRunActual: string;
  nowMerged: boolean | null;
  ok: boolean;
  dead?: boolean;
  runAtIso?: string;
}

function manifestPath(): string | null {
  const p = process.env.DEFERRED_MERGE_MANIFEST;
  if (!p) return null;
  return isAbsolute(p) ? p : resolve(process.cwd(), p);
}

/**
 * Load manifest, dedup by specFile+leadUrl+role. Unlike Lead Assignment (keyed on specFile+field), ONE
 * merge spec can legitimately emit TWO records - a NEGATIVE spec records BOTH of its leads - so the
 * leadUrl stays in the key to keep them separate. A Playwright retry re-creates leads with a new URL, so
 * an abandoned attempt's URL simply re-verifies to its own (usually not_merged) state and never masks the
 * winning attempt; the last line for a given (specFile, leadUrl, role) wins. Falls back to tcId for old
 * records written before specFile existed.
 */
function loadRecords(): MergeDeferredRecord[] {
  const path = manifestPath();
  if (!process.env.DEFERRED_MERGE_VERIFY_RUN || !path || !existsSync(path)) return [];

  const byKey = new Map<string, MergeDeferredRecord>();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let rec: MergeDeferredRecord;
    try {
      rec = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const key = `${rec.specFile || rec.tcId}::${rec.leadUrl}::${rec.role}`;
    byKey.set(key, rec);
  }
  return [...byKey.values()];
}

const records = loadRecords();

test.describe('Deferred re-verify - Lead Merging (round 2)', () => {
  // Deterministic re-verification of a fixed manifest: NEVER retry the whole record loop on a genuine
  // "still wrong" FAIL. Playwright's CI retries:2 would re-run every record 3x (this is one mega-test),
  // tripling the wall-clock and blowing the build timeout (an early run ABORTED at 120 min this way).
  // One authoritative pass; verdicts.json is the record.
  test.describe.configure({ retries: 0 });

  test.skip(records.length === 0, 'No merge deferred-verify manifest (set DEFERRED_MERGE_VERIFY_RUN=1 + DEFERRED_MERGE_MANIFEST).');

  test('Deferred re-verify: all recorded Lead Merging URLs match their expected merge state', async ({ page }, testInfo) => {
    // Per-record budget: goto + a single chatter re-check.
    test.setTimeout(Math.max(config.timeouts.test, records.length * CommonUtils.waitTimes.mergeReverifyBudget));
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const leadPage = new LeadPage(page);

    await test.step('Login once as admin_crm', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
    });

    console.log(`\n========== DEFERRED RE-VERIFY (MERGING): ${records.length} record(s) ==========`);

    const stillWrong: string[] = [];
    const recovered: string[] = [];
    const deadLeads: string[] = [];
    const verdicts: MergeVerdict[] = [];

    for (const r of records) {
      await test.step(`${r.tcId} [${r.role}] expected="${r.expected}" counterpart="${r.counterpartName}"`, async () => {
        // A single unreachable/deleted lead must NOT kill the whole round - it is an infra issue,
        // tracked separately, and the loop continues so every other record is still evaluated.
        let nowMerged: boolean;
        try {
          await page.goto(r.leadUrl, { waitUntil: 'domcontentloaded' });
          await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
          // Single re-check (1 reload + a chatter settle). This runs hours after creation, so a merge
          // that happened is long settled and shows on the first reload; a 2nd attempt only tripled the
          // cost. Reuse the round-1 poll helper - its emit is disabled here (DEFERRED_MERGE_VERIFY_RUN set).
          if (r.role === 'source') {
            nowMerged = await leadPage.waitForLeadMergingHappen(r.counterpartName, 1, CommonUtils.waitTimes.checkingChatterLog);
          } else {
            nowMerged = await leadPage.waitForLeadMergingHappen_OnTargetLead(r.counterpartName, 1, CommonUtils.waitTimes.checkingChatterLog);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
          console.log(`  DEAD ${r.tcId} [${r.role}] - could not open/read lead (${msg}) - url: ${r.leadUrl}`);
          deadLeads.push(`${r.tcId} [${r.role}] unreachable (${msg}) - url: ${r.leadUrl}`);
          verdicts.push({ tcId: r.tcId, specFile: r.specFile, leadUrl: r.leadUrl, role: r.role, expected: r.expected, firstRunActual: r.firstRunActual, nowMerged: null, ok: false, dead: true, runAtIso: r.runAtIso });
          return;
        }

        const wantMerged = r.expected === 'merged';
        const ok = wantMerged ? nowMerged : !nowMerged;

        console.log(
          `  ${ok ? 'PASS' : 'FAIL'} ${r.tcId} [${r.role}] ` +
          `expected="${r.expected}" firstRun="${r.firstRunActual}" now="${nowMerged ? 'merged' : 'not_merged'}"`,
        );

        // "recovered" = a positive merge that was late at round-1 (not_merged) but has merged by now.
        if (ok && wantMerged && r.firstRunActual === 'not_merged') {
          recovered.push(`${r.tcId} [${r.role}] merged late (now="${r.counterpartName}")`);
        }
        if (!ok) {
          const why = wantMerged
            ? 'expected MERGED but STILL not merged ~1h later (real merge defect / cron never fired)'
            : 'expected NOT merged but a merge appeared ~1h later (leads merged when they should NOT)';
          stillWrong.push(`${r.tcId} [${r.role}] ${why} (counterpart="${r.counterpartName}", url: ${r.leadUrl})`);
        }
        verdicts.push({ tcId: r.tcId, specFile: r.specFile, leadUrl: r.leadUrl, role: r.role, expected: r.expected, firstRunActual: r.firstRunActual, nowMerged, ok, runAtIso: r.runAtIso });
      });
    }

    // Machine-readable per-record verdict, written next to the manifest. The round-2 job stashes it to
    // C:\deferred-verify-merge\<day>\verdict-<JOB>-<BUILD>.json so a later Allure reclassifier can flip
    // each round-1 lead-merging result (recovered -> passed / still-wrong -> confirmed defect).
    try {
      const mpath = manifestPath();
      const outDir = mpath ? dirname(mpath) : resolve(process.cwd(), 'deferred-verify');
      mkdirSync(outDir, { recursive: true });
      const vpath = resolve(outDir, 'verdicts.json');
      writeFileSync(vpath, JSON.stringify(verdicts, null, 2), 'utf8');
      console.log(`  [deferred-verify-merge] wrote ${verdicts.length} verdict record(s) -> ${vpath}`);
      await testInfo.attach('Deferred re-verify (merging) verdicts (JSON)', {
        body: JSON.stringify(verdicts, null, 2),
        contentType: 'application/json',
      });
    } catch (err) {
      console.log(`  [deferred-verify-merge] WARNING: could not write verdicts.json (${err instanceof Error ? err.message : String(err)})`);
    }

    const summary =
      `Deferred re-verify (merging) summary\n` +
      `  Total records : ${records.length}\n` +
      `  Recovered late (not merged at round-1, correctly merged now): ${recovered.length}\n` +
      `  Still wrong after 1h (real defects): ${stillWrong.length}\n` +
      `  Unreachable leads (deleted/404 - infra, not a defect): ${deadLeads.length}\n\n` +
      (recovered.length ? `Recovered:\n  ${recovered.join('\n  ')}\n\n` : '') +
      (deadLeads.length ? `Unreachable:\n  ${deadLeads.join('\n  ')}\n\n` : '') +
      (stillWrong.length ? `Still wrong:\n  ${stillWrong.join('\n  ')}\n` : 'All reachable records match their expected merge state.\n');

    console.log('\n' + summary);
    await testInfo.attach('Deferred re-verify (merging) summary', { body: summary, contentType: 'text/plain' });

    expect(stillWrong, summary).toEqual([]);
  });
});
