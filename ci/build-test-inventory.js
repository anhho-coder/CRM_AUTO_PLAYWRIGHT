/*
 * Build the TEST INVENTORY: a bug-centric index of every test that is blocked
 * in code (test.skip / test.describe.skip / test.fail / test.fixme), plus a
 * tier-tag (@smoke-test / @regression-test) inventory.
 *
 * WHY: when a bug is fixed we need an instant, reliable answer to
 *   "which specs were parked on that bug — so which do I un-skip and re-run?"
 * The source of truth is the SPEC itself (the [CRM-####] title tag + the
 * `test.skip(cond,'...CRM-####')` reason), never a hand-kept list. This scanner
 * derives the index from the specs, so it can never drift.
 *
 * The blocking bug is taken from: the greppable [CRM-####] / @CRM-#### TITLE
 * tag, the skip-reason string (`test.skip(true,'...CRM-####')`), and the
 * preceding // comment. {type:'defect'} annotations are deliberately NOT used —
 * in these specs they mean "this test also verifies CRM-####" (a related/fixed
 * issue), not "blocked by CRM-####", so they mis-attribute the blocker.
 * Comments are stripped before matching so `test.skip(` mentioned in prose is
 * not counted as a real skip.
 *
 * Parsing mirrors ci/allure-build-skip-index.js where they overlap; keep the
 * skip/bug regexes in sync. This tool ADDS: comment-stripping, test.fail/fixme,
 * tier tags, bug-centric grouping, per-test "all blockers fixed?" readiness,
 * Jira-status enrichment (ci/crm-skip-bug-meta.json), and a title-tag GAP check.
 *
 * Outputs (best-effort):
 *   <out>/inventory.json      machine-readable source of truth
 *   <out>/SKIPPED_BY_BUG.md   human view: per-bug specs + ready re-run command
 *   <out>/TIER_TAGS.md        smoke/regression breakdown + nesting warnings
 *
 * Usage: node ci/build-test-inventory.js [tests-dir] [out-dir]
 */
const fs = require('fs');
const path = require('path');

const testsDir = process.argv[2] || 'tests';
const outDir = process.argv[3] || 'test-inventory';
const JIRA_BASE = 'http://jira.nakivo.com/browse/';
const BUG_META_FILE = path.join('ci', 'crm-skip-bug-meta.json');
const RERUN_PROJECT = 'chrome-headless';   // its testDir is the whole suite, so -g works across all

/* ------------------------------------------------------------------ helpers */
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
function suiteFromPath(file) {
  const norm = file.replace(/\\/g, '/');
  let seg;
  const m = norm.match(/(?:^|\/)tests\/1\.Project_CRM\/([^/]+)\//);
  if (m) seg = m[1];
  else { const m2 = norm.match(/(?:^|\/)tests\/([^/]+)\//); seg = m2 ? m2[1] : 'Other'; }
  if (seg === 'O12_CE_to_O12_CC') return 'O12';
  return seg.replace(/^\d+\./, '');
}
// Blank out // line-comments and /* */ block-comments while PRESERVING string
// literals (so a `//` inside a URL string, or `test.skip(` inside a comment,
// is handled correctly). Returns a code-only line for match/title extraction.
function stripComments(lines) {
  let inBlock = false;
  return lines.map(line => {
    let out = '';
    for (let k = 0; k < line.length; k++) {
      if (inBlock) { if (line[k] === '*' && line[k + 1] === '/') { inBlock = false; k++; } continue; }
      const ch = line[k];
      if (ch === '"' || ch === "'" || ch === '`') {         // copy a string literal verbatim
        out += ch;
        for (k++; k < line.length; k++) {
          out += line[k];
          if (line[k] === '\\') { out += line[k + 1] || ''; k++; continue; }
          if (line[k] === ch) break;
        }
        continue;
      }
      if (ch === '/' && line[k + 1] === '/') break;          // rest of line is a comment
      if (ch === '/' && line[k + 1] === '*') { inBlock = true; k++; continue; }
      out += ch;
    }
    return out;
  });
}
function firstStringArg(line) {
  const m = line.match(/\(\s*(['"`])((?:\\.|(?!\1).)*)\1/);
  return m ? m[2] : '';
}
function stringArgs(line) {
  const out = []; const re = /(['"`])((?:\\.|(?!\1).)*)\1/g; let m;
  while ((m = re.exec(line))) out.push(m[2]);
  return out;
}
function isConditionalMod(codeLine, mod) {
  const m = codeLine.match(new RegExp('test\\.' + mod + '\\s*\\(\\s*(.?)'));
  return !!m && !/['"`]/.test(m[1]);   // first arg not a string => conditional / arg-less modifier
}
// For a body-level modifier, the title is on the enclosing test(...) line above.
function enclosingTestTitle(codeLines, idx) {
  for (let j = idx - 1; j >= 0 && j >= idx - 40; j--) {
    const t = codeLines[j];
    if (/(^|[^.\w])test\.(skip|fixme)\s*\(\s*['"`]/.test(t)) return '';        // a different static test
    if (/(^|[^.\w])test(\.only)?\s*\(\s*['"`]/.test(t)) return firstStringArg(t);
  }
  return '';
}
function precedingComment(lines, idx) {   // uses ORIGINAL lines (comments intact)
  const out = []; let i = idx - 1;
  while (i >= 0) {
    const t = lines[i].trim();
    if (t.startsWith('//')) { out.unshift(t.replace(/^\/\/+\s?/, '')); i--; } else break;
  }
  return out.join(' ').trim();
}
function bugsFromTitle(text) {
  const bugs = new Set(); let m;
  const re = /(?:\[CRM-(\d+)\]|@CRM-(\d+))/g;
  while ((m = re.exec(text))) bugs.add('CRM-' + (m[1] || m[2]));
  return bugs;
}
function bugsFromText(text) {
  const bugs = new Set(); let m; const any = /CRM-(\d+)/g;
  while ((m = any.exec(text))) bugs.add('CRM-' + m[1]);
  return bugs;
}
function reasonFromTitle(title) { const m = title.match(/SKIPPED:\s*(.+?)\s*$/i); return m ? m[1].trim() : ''; }
function cleanReason(c) { return c.replace(/^(FIXME|TODO|NOTE|HACK|XXX)\s*:?\s*/i, '').trim(); }
function tierTagsInFile(text) {
  const tags = new Set();
  if (/@smoke-test\b/.test(text)) tags.add('@smoke-test');
  if (/@regression-test\b/.test(text)) tags.add('@regression-test');
  return tags;
}
const byNum = b => parseInt(String(b).replace(/\D/g, ''), 10) || 0;

/* ------------------------------------------------------------------- jira meta */
let bugMeta = {}, bugMetaSource = 'none', bugMetaAsOf = null;
try {
  const raw = JSON.parse(fs.readFileSync(BUG_META_FILE, 'utf8'));
  bugMeta = raw.bugs || {}; bugMetaAsOf = raw.asOf || null; bugMetaSource = 'cache';
} catch (e) { /* statuses left unknown */ }
function statusOf(bug) {
  const m = bugMeta[bug];
  if (!m) return { status: 'unknown', statusCategory: 'unknown', isFixed: false };
  return { status: m.status || 'unknown', statusCategory: m.statusCategory || 'unknown', isFixed: m.statusCategory === 'done' };
}

/* ------------------------------------------------------------------- scan */
const blocked = [];
const tierByFile = {};
let specsScanned = 0;

const files = walkSpecs(testsDir, []);
for (const file of files) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { continue; }
  specsScanned++;
  const rel = file.replace(/\\/g, '/').replace(/.*?\/tests\//, 'tests/');
  const suite = suiteFromPath(file);

  const tiers = tierTagsInFile(text);
  if (tiers.size) tierByFile[rel] = tiers;

  const lines = text.split(/\r?\n/);
  const code = stripComments(lines);
  const codeText = code.join('\n');
  if (!/test\.(skip|fixme|fail)\s*\(|test\.describe\.(skip|fixme)\s*\(/.test(codeText)) continue;

  for (let i = 0; i < code.length; i++) {
    const cl = code[i];
    const dm = cl.match(/test\.describe\.(skip|fixme)\s*\(/);
    const tm = cl.match(/(^|[^.\w])test\.(skip|fixme|fail)\s*\(/);
    if (!dm && !tm) continue;
    const mod = dm ? dm[1] : tm[2];
    const isDescribe = !!dm;

    let title = firstStringArg(cl);
    const comment = precedingComment(lines, i);
    let condReason = '';
    if (!isDescribe && isConditionalMod(cl, mod)) {
      const encl = enclosingTestTitle(code, i);
      if (encl) title = encl;
      const args = stringArgs(cl);
      condReason = args.length ? args[args.length - 1] : '';
    }

    const titleBugs = bugsFromTitle(title);
    const otherBugs = new Set([...bugsFromText(comment), ...bugsFromText(condReason)]);
    const bugs = new Set([...titleBugs, ...otherBugs]);
    const reason = cleanReason(comment) || reasonFromTitle(title) || cleanReason(condReason);
    const looksBugBlocked = bugs.size > 0 ||
      /\b(bug|defect|known issue|regression|blocked by)\b/i.test(comment + ' ' + condReason + ' ' + title);

    const emit = (nm) => blocked.push({
      file: rel, line: i + 1, suite, modifier: isDescribe ? 'describe.' + mod : mod,
      title: nm || '(untitled)', reason,
      bugs: [...bugs].sort((a, b) => byNum(a) - byNum(b)),
      titleTagged: titleBugs.size > 0,
      looksBugBlocked,
    });

    if (isDescribe) {
      const inners = [];
      for (let j = i + 1; j < code.length; j++) {
        if (/^\s*test(\.skip|\.fixme|\.fail)?\s*\(\s*['"`]/.test(code[j])) inners.push(firstStringArg(code[j]));
      }
      (inners.length ? inners : [title]).forEach(nm => emit(nm));
    } else {
      emit(title);
    }
  }
}

/* ------------------------------------------------------------------- aggregate */
// Attach per-test status: is EVERY blocking bug fixed? which bugs are still open?
for (const t of blocked) {
  const st = t.bugs.map(b => ({ bug: b, ...statusOf(b) }));
  t.openBugs = st.filter(s => !s.isFixed).map(s => s.bug);       // includes unknown-status
  t.fixedBugs = st.filter(s => s.isFixed).map(s => s.bug);
  t.allFixed = t.bugs.length > 0 && t.openBugs.length === 0;
}

const bugMap = {};
for (const t of blocked) {
  const keys = t.bugs.length ? t.bugs : ['(no bug)'];
  for (const b of keys) { (bugMap[b] || (bugMap[b] = [])).push(t); }
}
const byBug = Object.keys(bugMap).map(b => {
  const st = b === '(no bug)' ? { status: 'n/a', statusCategory: 'n/a', isFixed: false } : statusOf(b);
  return {
    bug: b === '(no bug)' ? null : b,
    link: b === '(no bug)' ? null : JIRA_BASE + b,
    ...st, count: bugMap[b].length,
    grep: b === '(no bug)' ? null : `\\[${b}\\]`,
    tests: bugMap[b].map(t => ({
      file: t.file, line: t.line, title: t.title, suite: t.suite, modifier: t.modifier,
      reason: t.reason, titleTagged: t.titleTagged,
      alsoOpen: t.openBugs.filter(x => x !== b),   // other still-open blockers on this same test
    })),
  };
}).sort((a, b) => {
  if (a.bug === null) return 1; if (b.bug === null) return -1;
  if (a.isFixed !== b.isFixed) return a.isFixed ? -1 : 1;
  return byNum(a.bug) - byNum(b.bug);
});

const readyTests = blocked.filter(t => t.allFixed);
const gaps = {
  bugBlockedNoKey: blocked.filter(t => t.looksBugBlocked && t.bugs.length === 0)
    .map(t => ({ file: t.file, line: t.line, title: t.title, suite: t.suite, modifier: t.modifier, reason: t.reason })),
  keyNotInTitle: blocked.filter(t => t.looksBugBlocked && !t.titleTagged && t.bugs.length > 0)
    .map(t => ({ file: t.file, line: t.line, title: t.title, suite: t.suite, modifier: t.modifier, bugs: t.bugs })),
};

const tierFiles = Object.keys(tierByFile).sort();
const smoke = tierFiles.filter(f => tierByFile[f].has('@smoke-test'));
const regression = tierFiles.filter(f => tierByFile[f].has('@regression-test'));
const smokeWithoutRegression = smoke.filter(f => !tierByFile[f].has('@regression-test'));

const modCount = m => blocked.filter(t => t.modifier === m).length;
const totals = {
  specsScanned, blockedTests: blocked.length,
  byModifier: { skip: modCount('skip'), 'describe.skip': modCount('describe.skip'), fixme: modCount('fixme') + modCount('describe.fixme'), fail: modCount('fail') },
  distinctBugs: byBug.filter(b => b.bug).length,
  fixedBugsSeen: byBug.filter(b => b.bug && b.isFixed).length,
  testsReadyToRerun: readyTests.length,
  smokeTagged: smoke.length, regressionTagged: regression.length,
  gapCount: gaps.bugBlockedNoKey.length + gaps.keyNotInTitle.length,
};

const nowIso = new Date().toISOString();
const inventory = {
  generatedAt: nowIso, jiraBase: JIRA_BASE, rerunProject: RERUN_PROJECT,
  bugMetaSource, bugMetaAsOf, totals,
  readyToRerun: readyTests.map(t => ({ file: t.file, line: t.line, title: t.title, suite: t.suite, modifier: t.modifier, bugs: t.bugs })),
  byBug, gaps, tiers: { smoke, regression, smokeWithoutRegression },
};

/* ------------------------------------------------------------------- render */
const GEN = `<!-- GENERATED by ci/build-test-inventory.js on ${nowIso}. Do NOT edit by hand — re-run \`npm run inventory\`. Source of truth = the specs. -->`;
const esc = s => String(s).replace(/\|/g, '\\|');

function bugSection(b) {
  const L = [];
  const co = b.tests.some(t => t.alsoOpen.length);
  L.push(`### [${b.bug}](${b.link}) — ${b.status} · ${b.count} test(s)`, '');
  L.push('Re-run: un-skip the listed file:line, then', '', '```bash',
    `npx playwright test -g "${b.grep}" --project=${RERUN_PROJECT}`, '```', '');
  L.push('| Spec | Line | Modifier | Title |' + (co ? ' Also blocked by (open) |' : ''),
    '|---|---|---|---|' + (co ? '---|' : ''));
  for (const t of b.tests) {
    let row = `| \`${t.file}\` | ${t.line} | ${t.modifier} | ${esc(t.title)} |`;
    if (co) row += ` ${t.alsoOpen.length ? '⚠ ' + t.alsoOpen.join(', ') : ''} |`;
    L.push(row);
  }
  L.push('');
  return L;
}
function mdSkips() {
  const L = [];
  L.push(GEN, '', '# Skipped / blocked tests — by bug', '');
  L.push(`_Generated ${nowIso} · Jira status as of ${bugMetaAsOf || 'n/a'} (${bugMetaSource})._`, '');
  L.push(`**${totals.blockedTests}** blocked test(s) across **${totals.distinctBugs}** bug(s) — ` +
    `skip ${totals.byModifier.skip}, describe.skip ${totals.byModifier['describe.skip']}, ` +
    `fail ${totals.byModifier.fail}, fixme ${totals.byModifier.fixme}.`, '');

  L.push('## ⚡ Ready to re-run — every blocking bug is Closed/Resolved', '');
  if (!readyTests.length) {
    L.push('_None right now. (A test is "ready" only when ALL its bug keys are done — a test tagged with both a fixed and an open key stays blocked.)_', '');
  } else {
    L.push('Un-skip these (flip the modifier at file:line back to `test`) and re-run:', '', '| Spec | Line | Modifier | Bug(s) | Title |', '|---|---|---|---|---|');
    for (const t of readyTests) L.push(`| \`${t.file}\` | ${t.line} | ${t.modifier} | ${t.bugs.join(', ')} | ${esc(t.title)} |`);
    L.push('');
  }

  const fixed = byBug.filter(b => b.bug && b.isFixed);
  if (fixed.length) {
    L.push('## ✅ Bug marked done, but tests still parked on it', '');
    L.push('The bug is done in Jira — but ⚠ rows are also blocked by another OPEN bug, so don\'t un-skip those yet.', '');
    for (const b of fixed) L.push(...bugSection(b));
  }
  const open = byBug.filter(b => b.bug && !b.isFixed);
  if (open.length) { L.push('## ⛔ Blocked — bug open / status unknown', ''); for (const b of open) L.push(...bugSection(b)); }
  const noBug = byBug.find(b => b.bug === null);
  if (noBug) {
    L.push('## ⚪ Blocked with no bug key (env/data or untagged)', '');
    L.push(`${noBug.count} test(s). Environment/data skips are expected here; genuinely bug-blocked ones show under Gaps below.`, '');
    for (const t of noBug.tests) L.push(`- \`${t.file}\`:${t.line} — ${esc(t.title)} _(${t.modifier}${t.reason ? '; ' + esc(t.reason) : ''})_`);
    L.push('');
  }
  return L.join('\n');
}
function mdGaps() {
  const L = [];
  L.push('## 🔧 Gaps — bug-blocked skips whose key is not greppable', '');
  if (!totals.gapCount) { L.push('_None — every bug-blocked skip carries a `[CRM-####]` tag in its title._', ''); return L.join('\n'); }
  if (gaps.bugBlockedNoKey.length) {
    L.push(`**No bug key at all (${gaps.bugBlockedNoKey.length})** — looks bug-blocked but has no CRM key anywhere. Add \`[CRM-####]\` to the title:`, '');
    for (const t of gaps.bugBlockedNoKey) L.push(`- \`${t.file}\`:${t.line} — ${esc(t.title)} _(${t.modifier}${t.reason ? '; ' + esc(t.reason) : ''})_`);
    L.push('');
  }
  if (gaps.keyNotInTitle.length) {
    L.push(`**Key not in the title (${gaps.keyNotInTitle.length})** — the bug is only in a comment/reason, so \`-g "[CRM-####]"\` won't select it. Add the tag to the title:`, '');
    for (const t of gaps.keyNotInTitle) L.push(`- \`${t.file}\`:${t.line} — ${esc(t.title)} _(${t.bugs.join(', ')})_`);
    L.push('');
  }
  return L.join('\n');
}
function mdTiers() {
  const L = [];
  L.push(GEN, '', '# Tier tags — @smoke-test / @regression-test', '');
  L.push(`_Generated ${nowIso}._`, '');
  L.push('Model: **nested via dual-tagging**. A smoke test carries BOTH `@smoke-test` and `@regression-test`; a regression-only test carries `@regression-test`. `-g @smoke-test` → smoke subset; `-g @regression-test` → full regression.', '');
  L.push(`- **@smoke-test:** ${smoke.length} spec(s)`, `- **@regression-test:** ${regression.length} spec(s)`, '');
  L.push('```bash',
    `npx playwright test -g "@smoke-test" --project=${RERUN_PROJECT}      # smoke subset`,
    `npx playwright test -g "@regression-test" --project=${RERUN_PROJECT} # full regression`, '```', '');
  if (regression.length === 0 && smoke.length > 0) {
    L.push('## ℹ️ Regression tagging not adopted yet', '');
    L.push('No spec carries `@regression-test`, so the nested model is not in use. As you roll it out, add `@regression-test` to every spec that belongs in a full regression run — including all `@smoke-test` specs (a smoke test must carry BOTH tags).', '');
  } else if (smokeWithoutRegression.length) {
    L.push(`## ⚠ Nesting broken — @smoke-test WITHOUT @regression-test (${smokeWithoutRegression.length})`, '');
    L.push('A regression run (`-g @regression-test`) would wrongly SKIP these smoke tests. Add `@regression-test`:', '');
    for (const f of smokeWithoutRegression) L.push(`- \`${f}\``);
    L.push('');
  }
  if (smoke.length) { L.push('## @smoke-test specs', ''); for (const f of smoke) L.push(`- \`${f}\``); L.push(''); }
  return L.join('\n');
}

/* ------------------------------------------------------------------- write */
try {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'inventory.json'), JSON.stringify(inventory, null, 2));
  fs.writeFileSync(path.join(outDir, 'SKIPPED_BY_BUG.md'), mdSkips() + '\n' + mdGaps() + '\n');
  fs.writeFileSync(path.join(outDir, 'TIER_TAGS.md'), mdTiers());
  console.log(`test-inventory: ${totals.blockedTests} blocked test(s), ${totals.distinctBugs} bug(s), ` +
    `${totals.testsReadyToRerun} ready to re-run, ${totals.gapCount} gap(s), ` +
    `smoke ${totals.smokeTagged} / regression ${totals.regressionTagged} -> ${outDir}/`);
} catch (e) {
  console.error('test-inventory: failed to write outputs: ' + e.message);
  process.exit(1);
}
