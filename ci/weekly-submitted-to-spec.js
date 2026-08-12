// Resolve the test cases SUBMITTED THIS WEEK into a per-group run plan that the
// CRM-Run-Weekly-Submitted job executes.
//
//   Jenkins job: CRM-Run-Weekly-Submitted    Pipeline -> Script Path: ci/Jenkinsfile.weekly-submitted
//
// PURPOSE: a weekly gate over the automation ADDED / CHANGED in the current ISO week - the specs
// a QA "submitted" (committed) this week - so new automation is proven green on pre-prod before it
// is folded into the nightly section jobs. Sibling of ci/weekly-fails-to-spec.js (which re-runs the
// week's RED cells); this one runs the week's NEW/UPDATED cells.
//
// "Submitted this week" has two independent signals in this repo, and both are supported:
//   git  - the spec file was Added/Copied/Modified/Renamed by a commit whose COMMIT date falls in
//          the week window, on the scanned ref (default HEAD = whatever branch Jenkins checked out).
//          This is what "submitted" means day-to-day: it landed on the branch this week.
//   tag  - the spec header carries `Automation-Date: <yyyy-MM-dd>` inside the week window (the same
//          tag the automation-metrics report consumes, see CLAUDE.md "Automation-Type/Date tags").
//          Catches work whose commit slipped to the next week, and work merged in from a side branch
//          whose commit dates are older than the merge.
// SOURCE=both (default) takes the UNION, so neither a missing tag nor an odd commit date can hide a
// spec that really was submitted this week.
//
// Why filter by FILENAME and not full path (same reason as ci/weekly-fails-to-spec.js): O12 folders
// contain a literal "->" (U+2192) arrow and one CMR spec contains "%", both of which corrupt through
// a Windows `bat` command line. A Playwright positional arg is matched as a REGEX against the whole
// test-file path, so passing the ASCII spec BASENAME reliably selects the file without any non-ASCII
// / cmd-special character reaching cmd.
//
// Env in:
//   WEEK     current | previous | last7 | yyyy-Www     (default: current)
//              current  = the in-progress ISO week (Mon 00:00 -> next Mon 00:00, local time)
//              previous = the week before; last7 = a rolling 7x24h window ending now
//              yyyy-Www = an exact ISO week, e.g. 2026-W33
//   SOURCE   both | git | tag                          (default: both - the union, see above)
//   TYPE     all | new | refactored                    (default: all) - filters on the spec's
//              `Automation-Type:` header tag. Untagged specs count as 'new' only for TYPE=all.
//   AUTHOR   optional git author substring (e.g. "anh.ho") - git source only; empty = everyone.
//   REF      git ref to scan (default: HEAD - the branch Jenkins checked out).
//   TESTS_ROOT  override the scanned tests root (default: tests)
//
// Writes into <cwd>/submitted/:
//   _groups.txt      one "<Group> <count>" line per group that has specs to run
//   <Group>.txt      space-joined double-quoted spec BASENAMES for that group
//   _specs.txt       every selected spec as a full repo path (audit / archive)
//   _summary.txt     human-readable plan (echoed into the build log)
// and echoes PLAN_* key=value lines the Jenkinsfile can read.

'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const WEEK = (process.env.WEEK || 'current').trim();
const SOURCE = (process.env.SOURCE || 'both').trim().toLowerCase();
const TYPE = (process.env.TYPE || 'all').trim().toLowerCase();
const AUTHOR = (process.env.AUTHOR || '').trim();
const REF = (process.env.REF || 'HEAD').trim();
const TESTS_ROOT = (process.env.TESTS_ROOT || 'tests').trim();

function fail(msg) { console.error('ERROR: ' + msg); process.exit(1); }
function pad2(n) { return String(n).padStart(2, '0'); }

if (!['both', 'git', 'tag'].includes(SOURCE)) fail('SOURCE must be both | git | tag (got "' + SOURCE + '").');
if (!['all', 'new', 'refactored'].includes(TYPE)) fail('TYPE must be all | new | refactored (got "' + TYPE + '").');

// ---- week window ---------------------------------------------------------------------------
// ISO week key computed the SAME way as ci/weekly-fails-to-spec.js / the Allure period pipeline,
// so a week printed here matches the frozen weekly report folder name.
function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d - start) / 86400000) + 1;
}
function keyFromMonday(monday) {
  const thursday = new Date(monday); thursday.setDate(monday.getDate() + 3);
  const weekNo = Math.floor((dayOfYear(thursday) - 1) / 7) + 1;
  return thursday.getFullYear() + '-W' + pad2(weekNo);
}
function mondayOf(t) {
  let dt = t.getDay(); if (dt === 0) dt = 7;          // Mon=1..Sun=7
  const monday = new Date(t.getFullYear(), t.getMonth(), t.getDate() + (1 - dt));
  return monday;                                       // local midnight
}
function mondayOfWeekNumber(wy, wn) {
  const jan4 = new Date(wy, 0, 4);                     // Jan 4 is always in ISO week 1
  let d4 = jan4.getDay(); if (d4 === 0) d4 = 7;
  return new Date(wy, 0, 4 + (1 - d4) + (wn - 1) * 7);
}

const now = new Date();
let winStart, winEnd, weekKey;
const m = WEEK.match(/^(\d{4})-W(\d{1,2})$/i);
if (m) {
  winStart = mondayOfWeekNumber(parseInt(m[1], 10), parseInt(m[2], 10));
  winEnd = new Date(winStart.getFullYear(), winStart.getMonth(), winStart.getDate() + 7);
  weekKey = keyFromMonday(winStart);
} else if (WEEK === 'last7') {
  winEnd = now;
  winStart = new Date(now.getTime() - 7 * 86400000);
  weekKey = 'last7 (' + winStart.toISOString().slice(0, 10) + ' .. ' + winEnd.toISOString().slice(0, 10) + ')';
} else if (WEEK === 'previous') {
  winStart = mondayOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
  winEnd = new Date(winStart.getFullYear(), winStart.getMonth(), winStart.getDate() + 7);
  weekKey = keyFromMonday(winStart);
} else if (WEEK === 'current') {
  winStart = mondayOf(now);
  winEnd = new Date(winStart.getFullYear(), winStart.getMonth(), winStart.getDate() + 7);
  weekKey = keyFromMonday(winStart);
} else {
  fail('WEEK must be current | previous | last7 | yyyy-Www (got "' + WEEK + '").');
}
// Local-time stamps git understands ("2026-08-10 00:00:00"), so the window matches the calendar
// week the QA actually worked, not a UTC-shifted one.
function gitStamp(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
         pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}
function dayStamp(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

// ---- group a spec path into the section that owns it -----------------------------------------
// The group only splits the run into several `npx playwright test` invocations (so one section's
// failures never stop the others) and gives the build log a readable breakdown.
const GROUP_OF = {
  '1.SalesReport_Performance': 'SalesReport_Performance',
  '2.Leads_Assignment':        'Leads_Assignment',
  '3.Lead_Merging':            'Lead_Merging',
  '4.Investments':             'Investments',
  '5.Contact':                 'Contact',
  '9.CRM_Module':              'CRM_Module',
  '10.Sales_Module':           'Sales_Module',
  'O12_CE_to_O12_CC':          'O12',
};
function groupOf(repoPath) {
  const parts = repoPath.split('/');                   // tests/1.Project_CRM/<section>/...
  if (parts[0] === TESTS_ROOT && parts[1] === '1.Project_CRM' && parts[2]) {
    return GROUP_OF[parts[2]] || parts[2].replace(/^\d+\./, '');
  }
  return 'Other';
}

// ---- header tags (Automation-Type / Automation-Date) -----------------------------------------
const tagCache = new Map();
function readTags(repoPath) {
  if (tagCache.has(repoPath)) return tagCache.get(repoPath);
  let out = { type: '', date: '' };
  try {
    const head = fs.readFileSync(repoPath, 'utf8').slice(0, 4000);
    const t = head.match(/Automation-Type:\s*([A-Za-z]+)/);
    const d = head.match(/Automation-Date:\s*(\d{4}-\d{2}-\d{2})/);
    if (t) out.type = t[1].toLowerCase();
    if (d) out.date = d[1];
  } catch (e) { /* unreadable / vanished file -> no tags */ }
  tagCache.set(repoPath, out);
  return out;
}
function typeAllowed(repoPath) {
  if (TYPE === 'all') return true;
  const t = readTags(repoPath).type;
  return t === TYPE;
}

// ---- source 1: git (files touched by commits inside the window) ------------------------------
const picked = new Map();      // repoPath -> Set of reasons ('git', 'tag')
function add(repoPath, reason) {
  const p = repoPath.replace(/\\/g, '/');
  if (!/\.spec\.ts$/.test(p)) return;
  if (!p.startsWith(TESTS_ROOT + '/')) return;
  if (!fs.existsSync(p)) return;                       // deleted / renamed away since the commit
  if (!typeAllowed(p)) return;
  if (!picked.has(p)) picked.set(p, new Set());
  picked.get(p).add(reason);
}

let gitError = '';
if (SOURCE === 'git' || SOURCE === 'both') {
  try {
    const args = [
      'log', REF,
      '--since=' + gitStamp(winStart),
      '--until=' + gitStamp(winEnd),
      '--name-only',
      '--diff-filter=ACMR',                            // added/copied/modified/renamed - never deleted
      '--pretty=format:%x01%h %ad %an %s',
      '--date=short',
      '--', TESTS_ROOT,
    ];
    if (AUTHOR) args.splice(2, 0, '--author=' + AUTHOR);
    const out = execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    for (const line of out.split(/\r?\n/)) {
      if (!line || line.charCodeAt(0) === 1) continue; // commit header line
      add(line.trim(), 'git');
    }
  } catch (e) {
    gitError = (e.message || String(e)).split('\n')[0];
    if (SOURCE === 'git') fail('git log failed: ' + gitError);
    console.error('WARN: git source unavailable (' + gitError + ') - falling back to the Automation-Date tag only.');
  }
}

// ---- source 2: Automation-Date header tag inside the window ----------------------------------
function walkSpecs(dir, hit) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name).replace(/\\/g, '/');
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      walkSpecs(p, hit);
    } else if (/\.spec\.ts$/.test(e.name)) {
      hit(p);
    }
  }
}
if (SOURCE === 'tag' || SOURCE === 'both') {
  const from = dayStamp(winStart);
  // Tag dates have day precision: a window ending at next-Monday-00:00 must accept the SUNDAY tag,
  // so compare against the last day INSIDE the window.
  const to = dayStamp(new Date(winEnd.getTime() - 1000));
  walkSpecs(TESTS_ROOT, (p) => {
    const d = readTags(p).date;
    if (d && d >= from && d <= to) add(p, 'tag');
  });
}

// ---- build the plan ---------------------------------------------------------------------------
const byGroup = {};
for (const [p, reasons] of [...picked.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const g = groupOf(p);
  (byGroup[g] || (byGroup[g] = [])).push({ path: p, base: p.split('/').pop(), reasons: [...reasons].sort() });
}

const outDir = path.join(process.cwd(), 'submitted');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const groupNames = Object.keys(byGroup).sort();
const groupLines = [];
const summary = [];
const specLines = [];

summary.push('Weekly SUBMITTED run plan');
summary.push('  week      : ' + weekKey + '   (WEEK=' + WEEK + ')');
summary.push('  window    : ' + gitStamp(winStart) + '  ->  ' + gitStamp(winEnd) + '   (local)');
summary.push('  source    : ' + SOURCE + (gitError ? '   [git unavailable: ' + gitError + ']' : '') +
             '   (git = committed on ' + REF + ' this week; tag = Automation-Date in the week)');
summary.push('  type      : ' + TYPE + (AUTHOR ? '   author~' + AUTHOR : ''));
summary.push('  selected  : ' + picked.size + ' spec(s) in ' + groupNames.length + ' group(s)');
summary.push('');

for (const g of groupNames) {
  const items = byGroup[g];
  // Basenames are unique across the repo and are matched as a regex against the whole path.
  const bases = [...new Set(items.map(i => i.base))].sort();
  fs.writeFileSync(path.join(outDir, g + '.txt'), bases.map(b => '"' + b + '"').join(' '), 'utf8');
  groupLines.push(g + ' ' + bases.length);
  summary.push('## ' + g + '  (' + bases.length + ' spec(s))');
  for (const i of items) {
    const tags = readTags(i.path);
    summary.push('   [' + i.reasons.join('+') + '] ' + i.path +
                 (tags.type || tags.date ? '   (' + [tags.type, tags.date].filter(Boolean).join(' ') + ')' : ''));
    specLines.push(i.path);
  }
  summary.push('');
}

fs.writeFileSync(path.join(outDir, '_groups.txt'), groupLines.join('\n') + (groupLines.length ? '\n' : ''), 'utf8');
fs.writeFileSync(path.join(outDir, '_specs.txt'), specLines.join('\n') + (specLines.length ? '\n' : ''), 'utf8');
fs.writeFileSync(path.join(outDir, '_summary.txt'), summary.join('\n'), 'utf8');

console.log(summary.join('\n'));
console.log('PLAN_WEEK=' + weekKey);
console.log('PLAN_SOURCE=' + SOURCE);
console.log('PLAN_TOTAL=' + picked.size);
console.log('PLAN_GROUPS=' + groupLines.map(l => l.split(' ')[0]).join(','));

if (!picked.size) {
  console.log('\nNo test cases were submitted in ' + weekKey + ' (SOURCE=' + SOURCE + ', TYPE=' + TYPE +
              (AUTHOR ? ', AUTHOR~' + AUTHOR : '') + ') - nothing to run.');
}
