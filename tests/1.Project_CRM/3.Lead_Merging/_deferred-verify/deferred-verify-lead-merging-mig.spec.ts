import { test, expect, Page } from '@playwright/test';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { isAbsolute, resolve, dirname } from 'path';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, LeadPageMig, OpportunityPageMig, MigPlatformPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { openRecordByUrl } from '@helpers/lead-merging-mig.helper';
import { deleteHandedOffMigRecords, MigCreatedRecord } from '@helpers/o12ce-main-business.helper';
import {
  isMigRecordUrl, MergeDeferredRecord, MigCleanupRecord, MigCleanupEntry,
} from '@helpers/deferred-verify-merge.helper';

/**
 * Deferred re-verify - Lead Merging on crm-mig (ROUND 2, authoritative) - the crm-mig twin of
 * deferred-verify-lead-merging.spec.ts (pre-production).
 *
 * Round-1 = Jenkins job CRM-SETUP-CRM-12127-9-Leads-Merging (CRM-12370 section 9 on crm-mig). Its merge waits
 * (helpers/lead-merging-mig.helper.ts) write a checkpoint per lead to the manifest:
 *   role 'source' / 'target', expected 'merged'  -> a merge the 35-min window did NOT see - it must be there now;
 *   role 'any', expected 'not_merged'           -> a NO-merge case - still no "has been merged into" line now.
 * A test that wrote a checkpoint does NOT delete its records in afterEach: it hands the deletion list (the ids it
 * registered, in deletion order) to this round (`kind: 'mig-cleanup'` lines - tester's decision 2026-11-03).
 *
 * This spec, ~90 min after round-1 (job CRM-SETUP-CRM-12127-9-Leads-Merging-DeferredVerify, upstream trigger +
 * quietPeriod 5400):
 *   1. logs in to crm-mig once and re-opens every checkpoint URL, reads the log, records PASS / FAIL with a
 *      verify-point capture of the log it read;
 *   2. ALWAYS (even after a FAIL) deletes exactly the ids handed over - counted first, deny-list, already-deleted
 *      ids reported, never a name or prefix search;
 *   3. writes verdicts.json + mig-cleanup-done.txt next to the manifest (the job then moves the processed files).
 *
 * Enablement (else the whole file self-skips):
 *   DEFERRED_MERGE_VERIFY_RUN=1  DEFERRED_MERGE_MANIFEST=deferred-verify/gathered.jsonl
 *     npx playwright test "tests/1.Project_CRM/3.Lead_Merging/_deferred-verify/deferred-verify-lead-merging-mig.spec.ts" --project=chrome-headless
 */

/** More rows in one hand-off line than one test can create = a wrong line: STOP for it, delete nothing. */
const MAX_HANDED_OFF_PER_TEST = 30;

interface MigVerdict {
  tcId: string;
  specFile?: string;
  leadUrl: string;
  role: string;
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
 * crm-mig checkpoints (deduped on specFile + leadUrl + role, last line wins - a retry re-creates leads with new URLs)
 * and hand-off lines (deduped on specFile + runAtIso). Pre-production lines are left to the pre-production round-2.
 */
function loadManifest(): { checkpoints: MergeDeferredRecord[]; handOffs: MigCleanupRecord[] } {
  const path = manifestPath();
  if (!process.env.DEFERRED_MERGE_VERIFY_RUN || !path || !existsSync(path)) return { checkpoints: [], handOffs: [] };
  const checkpoints = new Map<string, MergeDeferredRecord>();
  const handOffs = new Map<string, MigCleanupRecord>();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let rec: MergeDeferredRecord | MigCleanupRecord;
    try {
      rec = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if ((rec as MigCleanupRecord).kind === 'mig-cleanup') {
      const h = rec as MigCleanupRecord;
      handOffs.set(`${h.specFile || h.tcId}::${h.runAtIso}`, h);
    } else if (isMigRecordUrl((rec as MergeDeferredRecord).leadUrl ?? '')) {
      const r = rec as MergeDeferredRecord;
      checkpoints.set(`${r.specFile || r.tcId}::${r.leadUrl}::${r.role}`, r);
    }
  }
  return { checkpoints: [...checkpoints.values()], handOffs: [...handOffs.values()] };
}

const { checkpoints, handOffs } = loadManifest();

/**
 * The merge state the checkpoint asks about, read from the log of the record now on screen. Throws when the record no
 * longer exists: Odoo then draws an empty form whose log has no merge note, which would PASS a no-merge checkpoint.
 */
async function readMergeNow(page: Page, r: MergeDeferredRecord): Promise<boolean> {
  const id = Number((r.leadUrl.match(/[?#&]id=(\d+)/) || [])[1]);
  if (!id || (await existingIds(new MigPlatformPage(page), 'crm.lead', [id])).length === 0) {
    throw new Error(`crm.lead#${id || '?'} does not exist on crm-mig (deleted?)`);
  }
  const lead = new LeadPageMig(page);
  const reader = r.form === 'opportunity' ? new OpportunityPageMig(page) : lead;
  await openRecordByUrl(page, reader, r.leadUrl);
  await reader.waitForChatterMessagesMig();
  if (r.role === 'source') return reader.hasTargetLeadMergeMessage(r.counterpartName);
  if (r.role === 'target') return reader.hasSourceLeadMergeMessage(r.counterpartName);
  return /has been merged into/.test(await lead.getChatterLogText());
}

/** Ids of `model` among `ids` that still exist (archived included) - one bounded search. */
async function existingIds(platform: MigPlatformPage, model: string, ids: number[]): Promise<number[]> {
  return platform.callKw<number[]>(model, 'search', [[['id', 'in', ids]]], { limit: ids.length, context: { active_test: false } });
}

test.describe('Deferred re-verify - Lead Merging on crm-mig (round 2)', () => {
  // One authoritative pass over a fixed manifest - a CI retry would re-delete and re-verify everything.
  test.describe.configure({ retries: 0 });

  test.skip(checkpoints.length === 0 && handOffs.length === 0,
    'No crm-mig merge checkpoint or hand-off (set DEFERRED_MERGE_VERIFY_RUN=1 + DEFERRED_MERGE_MANIFEST).');

  test('Deferred re-verify (crm-mig): every checkpoint matches its expected merge state, then the handed-over records are deleted', async ({ page }, testInfo) => {
    test.setTimeout(Math.max(config.timeouts.test, (checkpoints.length + handOffs.length) * CommonUtils.waitTimes.mergeReverifyBudget));
    await page.setViewportSize({ width: 1920, height: 1080 });

    await test.step('Login once as admin_crm_mig on crm-mig', async () => {
      const login = new LoginPageMig(page);
      console.log(`  - Host    : ${baseUrl_mig}`);
      console.log(`  - Account : ${users.admin_crm_mig.username}`);
      await login.navigateTo(baseUrl_mig);
      await login.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
    });

    console.log(`\n========== DEFERRED RE-VERIFY (crm-mig MERGING): ${checkpoints.length} checkpoint(s), ${handOffs.length} hand-off(s) ==========`);
    const stillWrong: string[] = [];
    const recovered: string[] = [];
    const deadLeads: string[] = [];
    const leftovers: string[] = [];
    const verdicts: MigVerdict[] = [];

    for (const r of checkpoints) {
      const label = `${r.tcId} [${r.role}] expected="${r.expected}" counterpart="${r.counterpartName}"`;
      await test.step(label, async () => {
        console.log(`\n--- ${label} ---`);
        let nowMerged: boolean;
        try {
          nowMerged = await readMergeNow(page, r);
        } catch (err) {
          // One unreachable / deleted lead must not stop the round: report it and go on.
          const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
          console.log(`  DEAD - could not open/read the record (${msg}) - url: ${r.leadUrl}`);
          deadLeads.push(`${r.tcId} [${r.role}] unreachable (${msg}) - url: ${r.leadUrl}`);
          verdicts.push({ tcId: r.tcId, specFile: r.specFile, leadUrl: r.leadUrl, role: r.role, expected: r.expected, firstRunActual: r.firstRunActual, nowMerged: null, ok: false, dead: true, runAtIso: r.runAtIso });
          return;
        }
        const wantMerged = r.expected === 'merged';
        const ok = wantMerged ? nowMerged : !nowMerged;
        const what = r.role === 'source'
          ? `"This lead has been merged into ${r.counterpartName}."`
          : r.role === 'target'
            ? `"${r.counterpartName}, has been merged into this lead."`
            : 'any "has been merged into" log note';
        const expectedText = `${what} ${wantMerged ? 'PRESENT' : 'ABSENT'}`;
        const actualText = nowMerged ? 'FOUND' : 'NOT FOUND';
        console.log(`  URL      : ${r.leadUrl}`);
        console.log(`  Expected : ${expectedText}`);
        console.log(`  Actual   : ${actualText} (round-1 at ${r.runAtIso}: ${r.firstRunActual})`);
        console.log(`  Result   : ${ok ? 'PASS' : 'FAIL'}`);
        if (!ok) console.log(`  Difference : ${wantMerged ? `${what} not found` : `${what} found but must be absent`}`);
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${r.tcId} [${r.role}] round-2`,
          passed: ok,
          highlight: '.o_mail_thread',
          lines: [`${ok ? 'PASS' : 'FAIL'} ${r.tcId} [${r.role}]`, `  expected: ${expectedText}`, `  actual  : ${actualText}`],
          // the log sits on the right - keep the banner off it
          corner: 'bottom-left',
        }).catch(() => {});
        if (ok && wantMerged && r.firstRunActual === 'not_merged') recovered.push(`${r.tcId} [${r.role}] merged late`);
        if (!ok) {
          stillWrong.push(`${r.tcId} [${r.role}] ${wantMerged
            ? 'expected MERGED but STILL not merged ~90 min later'
            : 'expected NOT merged but a merge appeared after round-1'} (counterpart="${r.counterpartName}", url: ${r.leadUrl})`);
        }
        verdicts.push({ tcId: r.tcId, specFile: r.specFile, leadUrl: r.leadUrl, role: r.role, expected: r.expected, firstRunActual: r.firstRunActual, nowMerged, ok, runAtIso: r.runAtIso });
      });
    }

    // Always runs - a FAIL above must not leave round-1's records on crm-mig.
    await test.step('Delete the records round-1 handed over (exactly its own ids, counted first)', async () => {
      console.log('\n--- Delete the records round-1 handed over (exactly its own ids, counted first) ---');
      const platform = new MigPlatformPage(page);
      for (const h of handOffs) {
        const entries: MigCleanupEntry[] = h.records ?? [];
        console.log(`\n[mig-cleanup] ${h.tcId} (round-1 at ${h.runAtIso}): ${entries.length} record(s) handed over`);
        if (entries.length > MAX_HANDED_OFF_PER_TEST) {
          console.log(`[mig-cleanup] STOPPED - ${entries.length} ids in one hand-off, more than one test creates (${MAX_HANDED_OFF_PER_TEST}); nothing deleted`);
          leftovers.push(...entries.map((e) => `${e.model}#${e.id} (${e.label}) - not deleted: hand-off over the cap`));
          continue;
        }
        const alive = new Set<string>();
        for (const model of [...new Set(entries.map((e) => e.model))]) {
          const ids = entries.filter((e) => e.model === model).map((e) => e.id);
          (await existingIds(platform, model, ids)).forEach((id) => alive.add(`${model}#${id}`));
        }
        // Keep the hand-off order (the teardown's child-before-parent order) and drop what is already gone.
        const toDelete: MigCreatedRecord[] = [];
        for (const e of entries) {
          if (alive.has(`${e.model}#${e.id}`)) toDelete.push({ model: e.model, id: e.id, label: e.label, deleteLast: e.deleteLast });
          else console.log(`  gone      ${e.model}#${e.id} (${e.label}) - already deleted`);
        }
        console.log(`[mig-cleanup] deleting ${toDelete.length} of ${entries.length} (the rest are already gone)`);
        const failed = await deleteHandedOffMigRecords(page, toDelete);
        leftovers.push(...failed.map((f) => `${f.model}#${f.id} (${f.label}) - ${h.tcId}`));
      }
      try {
        const mpath = manifestPath();
        const outDir = mpath ? dirname(mpath) : resolve(process.cwd(), 'deferred-verify');
        mkdirSync(outDir, { recursive: true });
        writeFileSync(resolve(outDir, 'mig-cleanup-done.txt'),
          `hand-offs=${handOffs.length} leftovers=${leftovers.length}\n${leftovers.join('\n')}\n`, 'utf8');
      } catch (err) {
        console.log(`  [deferred-verify-merge] WARNING: could not write mig-cleanup-done.txt (${err instanceof Error ? err.message : String(err)})`);
      }
    });

    try {
      const mpath = manifestPath();
      const outDir = mpath ? dirname(mpath) : resolve(process.cwd(), 'deferred-verify');
      mkdirSync(outDir, { recursive: true });
      writeFileSync(resolve(outDir, 'verdicts.json'), JSON.stringify(verdicts, null, 2), 'utf8');
      await testInfo.attach('Deferred re-verify (crm-mig merging) verdicts (JSON)', { body: JSON.stringify(verdicts, null, 2), contentType: 'application/json' });
    } catch (err) {
      console.log(`  [deferred-verify-merge] WARNING: could not write verdicts.json (${err instanceof Error ? err.message : String(err)})`);
    }

    const summary =
      `Deferred re-verify (crm-mig merging) summary\n` +
      `  Checkpoints   : ${checkpoints.length}\n` +
      `  Recovered late (not merged at round-1, merged now): ${recovered.length}\n` +
      `  Still wrong (real defects): ${stillWrong.length}\n` +
      `  Unreachable records: ${deadLeads.length}\n` +
      `  Hand-offs deleted : ${handOffs.length}, leftovers after delete: ${leftovers.length}\n\n` +
      (recovered.length ? `Recovered:\n  ${recovered.join('\n  ')}\n\n` : '') +
      (deadLeads.length ? `Unreachable:\n  ${deadLeads.join('\n  ')}\n\n` : '') +
      (leftovers.length ? `LEFTOVERS on crm-mig (the 16:00 check will report them):\n  ${leftovers.join('\n  ')}\n\n` : '') +
      (stillWrong.length ? `Still wrong:\n  ${stillWrong.join('\n  ')}\n` : 'All reachable checkpoints match their expected merge state.\n');
    console.log('\n' + summary);
    await testInfo.attach('Deferred re-verify (crm-mig merging) summary', { body: summary, contentType: 'text/plain' });

    expect.soft(leftovers, 'records round-1 handed over that could not be deleted').toEqual([]);
    expect(stillWrong, summary).toEqual([]);
  });
});
