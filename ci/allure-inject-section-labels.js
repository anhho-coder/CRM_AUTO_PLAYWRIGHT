/*
 * Post-generate injector: labels the Overview's summary widget as "Section 1"
 * (total test cases run in the period) and the Suites widget as "Section 2"
 * (latest result per suite).
 *
 * It copies ci/allure-section-labels.js into the report root and adds a
 * <script> tag for it just before </body> in index.html.
 *
 * When a stash file (allure-allruns-summary.json) is passed, its `byQa` block is
 * embedded inline as `window.CRM_QA_BREAKDOWN` just before the labels script, so
 * Section 1 can render the per-QA "executed by" split with no runtime fetch.
 *
 * Usage: node ci/allure-inject-section-labels.js <report-dir> [stash-file]
 *   (defaults to "allure-report"). Run right AFTER `allure generate`.
 * Idempotent: re-running does not add a second <script> tag.
 */
const fs = require('fs');
const path = require('path');

const reportDir = process.argv[2] || 'allure-report';
const stashFile = process.argv[3] || '';
const scriptName = 'allure-section-labels.js';
const srcScript = path.join(__dirname, scriptName);
const indexHtml = path.join(reportDir, 'index.html');
const tag = '<script src="' + scriptName + '"></script>';

// Build the inline per-QA breakdown script from the stash (best-effort).
let dataTag = '';
if (stashFile) {
  try {
    const stash = JSON.parse(fs.readFileSync(stashFile, 'utf8'));
    if (stash && stash.byQa && Object.keys(stash.byQa).length) {
      dataTag = '<script>window.CRM_QA_BREAKDOWN=' + JSON.stringify(stash.byQa) + ';</script>';
    }
  } catch (e) { /* no breakdown -> Section 1 just omits the split */ }
}

if (!fs.existsSync(indexHtml)) {
  console.error('section-labels: no index.html at ' + indexHtml + ' (skipping).');
  process.exit(0); // best-effort, never fail the build
}
if (!fs.existsSync(srcScript)) {
  console.error('section-labels: missing ' + srcScript + ' (skipping).');
  process.exit(0);
}

fs.copyFileSync(srcScript, path.join(reportDir, scriptName));

let html = fs.readFileSync(indexHtml, 'utf8');

// Refresh the per-QA data tag on every run (counts change build to build).
html = html.replace(/<script>window\.CRM_QA_BREAKDOWN=[\s\S]*?<\/script>\n?/, '');

if (html.indexOf(scriptName) !== -1) {
  // Labels script already present (same generated report): (re)insert the data tag
  // right before the labels script so the global is defined before it reads it.
  if (dataTag && html.indexOf(tag) !== -1) {
    html = html.replace(tag, dataTag + '\n    ' + tag);
    fs.writeFileSync(indexHtml, html);
  }
  console.log('section-labels: already injected; refreshed QA breakdown in ' + indexHtml + '.');
  process.exit(0);
}

const block = (dataTag ? '    ' + dataTag + '\n' : '') + '    ' + tag + '\n';
if (html.indexOf('</body>') !== -1) {
  html = html.replace('</body>', block + '</body>');
} else {
  html += '\n' + block;
}
fs.writeFileSync(indexHtml, html);
console.log('section-labels: injected ' + scriptName +
  (dataTag ? ' + QA breakdown' : '') + ' into ' + indexHtml + '.');
