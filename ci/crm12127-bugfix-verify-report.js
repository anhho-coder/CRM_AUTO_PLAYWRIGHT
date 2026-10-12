/**
 * Per-bug verdict for the CRM-12127 bug-fix verification run.
 *
 * Reads
 *   - the bug-to-spec manifest  (env MANIFEST, default ci/crm12127-bugfix-verify-specs.txt)
 *   - the newest Playwright json reporter output
 *     (playwright-report/<timestamped folder>/test-results.json)
 *
 * Writes bugfix-verify-summary.txt and prints it, so the Jenkins console answers the only
 * question this job exists to answer: which of the Resolved bugs are actually green again.
 *
 * A spec the manifest lists but the results file never mentions is reported NOT RUN - never
 * silently counted as a pass. That distinction is the whole point: an aborted run and a clean
 * run look identical if you only count failures.
 *
 * Exit code is always 0 - the build result is decided by Playwright's own exit code in the
 * pipeline, not by this reporter.
 */
const fs = require('fs');
const path = require('path');

const manifestPath = process.env.MANIFEST || 'ci/crm12127-bugfix-verify-specs.txt';
const onlyBugs = (process.env.ONLY_BUGS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/* ---------- 1. the manifest: bug -> [{ tc, spec, base }] ---------- */
if (!fs.existsSync(manifestPath)) {
  console.error(`ERROR: manifest not found: ${manifestPath}`);
  process.exit(0);
}
const byBug = new Map();
for (const raw of fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const cols = line.split(/\s+/);
  if (cols.length < 3) continue;
  const [bug, tc, spec] = cols;
  if (onlyBugs.length && !onlyBugs.includes(bug)) continue;
  const base = path.basename(spec);
  if (!byBug.has(bug)) byBug.set(bug, []);
  byBug.get(bug).push({ tc, spec, base });
}

/* ---------- 2. the newest json reporter output ---------- */
function newestResultsFile() {
  const root = 'playwright-report';
  if (!fs.existsSync(root)) return null;
  const candidates = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(root, d.name, 'test-results.json'))
    .filter((p) => fs.existsSync(p))
    .map((p) => ({ p, mtime: fs.statSync(p).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return candidates.length ? candidates[0].p : null;
}

/** Flatten the reporter's nested suites into { basename -> status }. */
function collectStatuses(resultsFile) {
  const byBase = new Map();
  if (!resultsFile) return byBase;
  let json;
  try {
    json = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
  } catch (err) {
    console.error(`ERROR: could not parse ${resultsFile}: ${err.message}`);
    return byBase;
  }
  const walk = (suite, inheritedFile) => {
    const file = suite.file || inheritedFile;
    for (const spec of suite.specs || []) {
      const base = path.basename(spec.file || file || '');
      if (!base) continue;
      // spec.ok is Playwright's own verdict and already accounts for retries.
      const status = spec.ok ? 'PASS' : 'FAIL';
      // One file can hold several test() blocks - a single red makes the file red.
      if (byBase.get(base) !== 'FAIL') byBase.set(base, status);
    }
    for (const child of suite.suites || []) walk(child, file);
  };
  for (const suite of json.suites || []) walk(suite, null);
  return byBase;
}

const resultsFile = newestResultsFile();
const statuses = collectStatuses(resultsFile);

/* ---------- 3. the verdict table ---------- */
const out = [];
out.push('================ CRM-12127 BUG-FIX VERIFICATION ================');
out.push(`Manifest     : ${manifestPath}`);
out.push(`Results file : ${resultsFile || '(none found - no spec result was read)'}`);
out.push(`Server       : crm-mig.nakivo.site (db nakivoCE)`);
if (onlyBugs.length) out.push(`ONLY_BUGS    : ${onlyBugs.join(', ')}`);
out.push('');
out.push('Bug          Verdict      Specs (TC id : result)');
out.push('-----------  -----------  -------------------------------------------------');

let bugsGreen = 0;
let bugsRed = 0;
let bugsIncomplete = 0;
const redSpecs = [];
const notRunSpecs = [];

for (const bug of [...byBug.keys()].sort()) {
  const rows = byBug.get(bug);
  const parts = [];
  let anyFail = false;
  let anyMissing = false;
  for (const r of rows) {
    const st = statuses.get(r.base) || 'NOT RUN';
    if (st === 'FAIL') {
      anyFail = true;
      redSpecs.push(`${bug}  ${r.tc}  ${r.spec}`);
    }
    if (st === 'NOT RUN') {
      anyMissing = true;
      notRunSpecs.push(`${bug}  ${r.tc}  ${r.spec}`);
    }
    parts.push(`${r.tc} : ${st}`);
  }
  let verdict;
  if (anyFail) {
    verdict = 'STILL RED';
    bugsRed++;
  } else if (anyMissing) {
    verdict = 'INCOMPLETE';
    bugsIncomplete++;
  } else {
    verdict = 'VERIFIED';
    bugsGreen++;
  }
  out.push(`${bug.padEnd(11)}  ${verdict.padEnd(11)}  ${parts.join(' | ')}`);
}

out.push('');
out.push(`Bugs VERIFIED (every spec green) : ${bugsGreen}`);
out.push(`Bugs STILL RED                   : ${bugsRed}`);
out.push(`Bugs INCOMPLETE (a spec not run) : ${bugsIncomplete}`);

if (redSpecs.length) {
  out.push('');
  out.push('Still-red specs:');
  redSpecs.forEach((s) => out.push(`  ${s}`));
}
if (notRunSpecs.length) {
  out.push('');
  out.push('Specs the results file never mentioned (NOT RUN - this is not a pass):');
  notRunSpecs.forEach((s) => out.push(`  ${s}`));
}
out.push('===============================================================');

const text = out.join('\n') + '\n';
fs.writeFileSync('bugfix-verify-summary.txt', text, 'utf8');
process.stdout.write(text);
