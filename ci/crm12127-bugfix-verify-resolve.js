/**
 * Resolve the CRM-12127 bug-fix verification set from the manifest into something the pipeline
 * can hand straight to Playwright.
 *
 * Same division of labour as ci/changed-specs-to-spec.js: all the parsing happens in node and
 * the Jenkinsfile only reads the files written here. Groovy in a Jenkins pipeline runs inside a
 * script-security sandbox that rejects perfectly ordinary methods, so the less of this logic
 * lives there, the fewer ways the build has to die after npm ci.
 *
 * In   : env MANIFEST   (default ci/crm12127-bugfix-verify-specs.txt)
 *        env ONLY_BUGS  (comma-separated bug keys; blank = the whole manifest)
 * Out  : bugfix-verify/spec-regex.txt  - one line, the positional regex for `npx playwright test`
 *        bugfix-verify/spec-list.txt   - the resolved spec paths, one per line
 *        bugfix-verify/counts.txt      - "<bug count> <spec count>"
 * Exit : 0 on success, 1 when the manifest resolves to nothing (so the build stops before it
 *        runs a silently empty suite and calls it green).
 */
const fs = require('fs');
const path = require('path');

const manifestPath = process.env.MANIFEST || 'ci/crm12127-bugfix-verify-specs.txt';
const onlyBugs = (process.env.ONLY_BUGS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!fs.existsSync(manifestPath)) {
  console.error(`ERROR: manifest not found: ${manifestPath}`);
  process.exit(1);
}

const bugs = [];
const specs = [];
for (const raw of fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const cols = line.split(/\s+/);
  if (cols.length < 3) continue;
  const [bug, , spec] = cols;
  if (onlyBugs.length && !onlyBugs.includes(bug)) continue;
  if (!bugs.includes(bug)) bugs.push(bug);
  if (!specs.includes(spec)) specs.push(spec);
}

if (!specs.length) {
  console.error(
    `ERROR: the manifest resolved to no specs (ONLY_BUGS='${onlyBugs.join(',')}'). Nothing to verify.`
  );
  process.exit(1);
}

/*
 * The positional Playwright argument is a REGEX over the whole file path, so the basename alone
 * is enough - and 45 full paths would blow past the cmd command-line limit. Metacharacters are
 * escaped: an unescaped "(TEMPLATE)" in a basename becomes a capture group and matches nothing.
 */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const names = specs.map((p) => escapeRe(path.basename(p, '.spec.ts')));
const regex = `(${names.join('|')})\\.spec\\.ts`;

const outDir = 'bugfix-verify';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'spec-regex.txt'), regex, 'utf8');
fs.writeFileSync(path.join(outDir, 'spec-list.txt'), specs.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(outDir, 'counts.txt'), `${bugs.length} ${specs.length}\n`, 'utf8');

console.log(`Bug-fix verification set: ${bugs.length} bug(s) -> ${specs.length} unique spec(s)`);
specs.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${s}`));
console.log(`Bugs: ${bugs.join(', ')}`);
