/*
 * Post-generate injector: labels the Overview's summary widget as "Section 1"
 * (total test cases run in the period) and the Suites widget as "Section 2"
 * (latest result per suite).
 *
 * It copies ci/allure-section-labels.js into the report root and adds a
 * <script> tag for it just before </body> in index.html.
 *
 * Usage: node ci/allure-inject-section-labels.js <report-dir>
 *   (defaults to "allure-report"). Run right AFTER `allure generate`.
 * Idempotent: re-running does not add a second <script> tag.
 */
const fs = require('fs');
const path = require('path');

const reportDir = process.argv[2] || 'allure-report';
const scriptName = 'allure-section-labels.js';
const srcScript = path.join(__dirname, scriptName);
const indexHtml = path.join(reportDir, 'index.html');
const tag = '<script src="' + scriptName + '"></script>';

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
if (html.indexOf(scriptName) !== -1) {
  console.log('section-labels: already injected in ' + indexHtml + '.');
  process.exit(0);
}
if (html.indexOf('</body>') !== -1) {
  html = html.replace('</body>', '    ' + tag + '\n</body>');
} else {
  html += '\n' + tag + '\n';
}
fs.writeFileSync(indexHtml, html);
console.log('section-labels: injected ' + scriptName + ' into ' + indexHtml + '.');
