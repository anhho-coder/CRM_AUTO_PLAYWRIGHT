/*
 * Build the "intentional skips" index for the Skipped-by-Suite Allure card.
 *
 * Scans the test sources for tests that are DELIBERATELY skipped in code
 * (`test.skip(...)` and `test.describe.skip(...)`), because the Allure report
 * itself carries no skip reason and no bug link (statusMessage is empty and
 * links is []). The reason + blocking bug live only in the source:
 *   - a `// FIXME ...` / `// ...` comment block right above the skip, and/or
 *   - a `[CRM-####]` / `@CRM-####` tag inside the test title, and/or
 *   - a `... SKIPPED: <reason>` suffix in a describe.skip title.
 *
 * Output: <reportDir>/crm-skips.json  (read client-side by allure-skips-card.js)
 *   {
 *     generatedAt, jiraBase, totalSkipped, totalBugs,
 *     suites: [ { suite, count, bugs:[...], reasons:[...], tests:[{name,reason,bugs,file}] } ]
 *   }
 *
 * Usage: node ci/allure-build-skip-index.js <report-dir> <tests-dir>
 *   report-dir defaults to "allure-report", tests-dir to "tests".
 * Best-effort: never throws in a way that would fail the build.
 */
const fs = require('fs');
const path = require('path');

const reportDir = process.argv[2] || 'allure-report';
const testsDir = process.argv[3] || 'tests';
const JIRA_BASE = 'http://jira.nakivo.com/browse/';

function walkSpecs(dir, acc) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return acc; }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkSpecs(full, acc);
    else if (ent.isFile() && /\.spec\.ts$/i.test(ent.name)) acc.push(full);
  }
  return acc;
}

// Map a spec path to its top-level suite name, matching the report's parentSuite.
//   tests/1.Project_CRM/3.Lead_Merging/...  -> "Lead_Merging"
//   tests/1.Project_CRM/O12_CE_to_O12_CC/... -> "O12"
function suiteFromPath(file) {
  const norm = file.replace(/\\/g, '/');
  let seg;
  const m = norm.match(/(?:^|\/)tests\/1\.Project_CRM\/([^/]+)\//);
  if (m) seg = m[1];
  else {
    const m2 = norm.match(/(?:^|\/)tests\/([^/]+)\//);
    seg = m2 ? m2[1] : 'Other';
  }
  if (seg === 'O12_CE_to_O12_CC') return 'O12';
  return seg.replace(/^\d+\./, '');
}

// First quoted string argument on a line (handles ' " and ` quoting).
function firstStringArg(line) {
  const m = line.match(/\(\s*(['"`])((?:\\.|(?!\1).)*)\1/);
  return m ? m[2] : '';
}

// Contiguous `//` line-comment block immediately above `idx` (the skip's reason).
// Block comments (/* ... */) are intentionally ignored: those are file/test
// headers, not skip reasons.
function precedingComment(lines, idx) {
  const out = [];
  let i = idx - 1;
  while (i >= 0) {
    const t = lines[i].trim();
    if (t.startsWith('//')) { out.unshift(t.replace(/^\/\/+\s?/, '')); i--; }
    else break;
  }
  return out.join(' ').trim();
}

function bugsFrom(text) {
  const bugs = new Set();
  let m;
  const bracket = /\[CRM-(\d+)\]/g;   // [CRM-8930]  -> the blocking bug
  while ((m = bracket.exec(text))) bugs.add('CRM-' + m[1]);
  const tag = /@CRM-(\d+)/g;          // @CRM-10450  -> tag form
  while ((m = tag.exec(text))) bugs.add('CRM-' + m[1]);
  return bugs;
}
function bugsFromComment(text) {
  const bugs = new Set();
  let m;
  const any = /CRM-(\d+)/g;           // "bug CRM-9374" in a comment
  while ((m = any.exec(text))) bugs.add('CRM-' + m[1]);
  return bugs;
}
function reasonFromTitle(title) {
  const m = title.match(/SKIPPED:\s*(.+?)\s*$/i);
  return m ? m[1].trim() : '';
}
function cleanReason(comment) {
  return comment.replace(/^(FIXME|TODO|NOTE|HACK|XXX)\s*:?\s*/i, '').trim();
}

const bySuite = {};
// Basenames of every spec that DELIBERATELY skips in code. Consumed by
// allure-build-didnotrun-index.js to tell intentional skips apart from
// did-not-run skips at the spec-file level (title matching is unreliable —
// describe.skip inner tests can scan as "(untitled)").
const skipFilesSet = new Set();
function addSkip(suite, name, reason, bugs, relFile) {
  if (!bySuite[suite]) bySuite[suite] = { suite, count: 0, bugs: new Set(), reasons: new Set(), tests: [] };
  const s = bySuite[suite];
  s.count += 1;
  bugs.forEach(b => s.bugs.add(b));
  if (reason) s.reasons.add(reason);
  s.tests.push({ name: name || '(untitled)', reason: reason || '', bugs: [...bugs], file: relFile });
}

const files = walkSpecs(testsDir, []);
for (const file of files) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { continue; }
  if (!/test\.skip\s*\(|test\.describe\.skip\s*\(/.test(text)) continue;
  skipFilesSet.add(path.basename(file).toLowerCase());

  const lines = text.split(/\r?\n/);
  const suite = suiteFromPath(file);
  const rel = file.replace(/\\/g, '/').replace(/.*?\/tests\//, 'tests/');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isDescribeSkip = /test\.describe\.skip\s*\(/.test(line);
    const isTestSkip = !isDescribeSkip && /(^|[^.\w])test\.skip\s*\(/.test(line);
    if (!isDescribeSkip && !isTestSkip) continue;

    const title = firstStringArg(line);
    const comment = precedingComment(lines, i);
    const bugs = new Set([...bugsFrom(title), ...bugsFromComment(comment)]);
    const reason = cleanReason(comment) || reasonFromTitle(title);

    if (isDescribeSkip) {
      // A skipped describe block counts each test() inside it as one skipped TC,
      // all sharing the block's reason + bugs.
      const inners = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s*test(\.skip)?\s*\(/.test(lines[j])) inners.push(firstStringArg(lines[j]));
      }
      const names = inners.length ? inners : [title];
      for (const nm of names) addSkip(suite, nm || title, reason, bugs, rel);
    } else {
      addSkip(suite, title, reason, bugs, rel);
    }
  }
}

const byNum = b => parseInt(b.replace(/\D/g, ''), 10) || 0;
const NOBUG = '(no bug)';

const suites = Object.values(bySuite).map(s => {
  // Per-bug breakdown WITHIN the suite: one row per bug, with how many skipped
  // tests reference it. A test tagged with N bugs contributes to N bug rows, so
  // the per-bug counts can sum to more than the suite's distinct skip count.
  // Tests with no bug are grouped into a single "(no bug)" row.
  const bugMap = {};
  s.tests.forEach(t => {
    const keys = (t.bugs && t.bugs.length) ? t.bugs : [NOBUG];
    keys.forEach(b => {
      if (!bugMap[b]) bugMap[b] = { bug: b, count: 0, reasons: new Set(), tests: [] };
      bugMap[b].count += 1;
      if (t.reason) bugMap[b].reasons.add(t.reason);
      bugMap[b].tests.push(t.name);
    });
  });
  const bugRows = Object.values(bugMap).map(b => ({
    bug: b.bug === NOBUG ? null : b.bug,   // null => "(no bug)" row
    count: b.count,
    reasons: [...b.reasons],
    tests: b.tests,
  })).sort((a, b) => {
    if (a.bug === null) return 1;          // "(no bug)" last
    if (b.bug === null) return -1;
    return byNum(a.bug) - byNum(b.bug);
  });
  return {
    suite: s.suite,
    count: s.count,
    bugs: [...s.bugs].sort((a, b) => byNum(a) - byNum(b)),
    reasons: [...s.reasons],
    bugRows,
  };
}).sort((a, b) => b.count - a.count || a.suite.localeCompare(b.suite));

const allBugs = new Set();
suites.forEach(s => s.bugs.forEach(b => allBugs.add(b)));
const totalSkipped = suites.reduce((n, s) => n + s.count, 0);
const bugKeys = [...allBugs].sort((a, b) => byNum(a) - byNum(b));

const out = {
  generatedAt: new Date().toISOString(),
  jiraBase: JIRA_BASE,
  totalSkipped,
  totalBugs: allBugs.size,
  skipFiles: [...skipFilesSet].sort(),   // spec basenames with a static skip -> allure-build-didnotrun-index.js
  bugKeys,               // distinct bug keys -> consumed by allure-fetch-jira-meta.js
  bugMeta: {},           // bug -> { status, statusCategory, assignee, active, updated }; filled by the Jira fetch
  bugMetaSource: 'none', // 'jira-live' | 'cache' | 'none'
  bugMetaAsOf: null,
  suites,
};

try {
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'crm-skips.json'), JSON.stringify(out, null, 2));
  console.log(`skip-index: ${totalSkipped} intentional skip(s) across ${suites.length} suite(s), ${allBugs.size} bug(s) -> ${path.join(reportDir, 'crm-skips.json')}`);
} catch (e) {
  console.error('skip-index: failed to write crm-skips.json (skipping): ' + e.message);
  process.exit(0); // best-effort, never fail the build
}
