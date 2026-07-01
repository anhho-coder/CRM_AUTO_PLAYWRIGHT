/*
 * Post-generate injector: adds the "Skipped Test Cases by Suite" Overview card
 * to a generated Allure report.
 *
 * It copies ci/allure-skips-card.js into the report root and adds a <script>
 * tag for it just before </body> in index.html. The card's data comes from
 * crm-skips.json, which ci/allure-build-skip-index.js must have written first.
 *
 * Usage: node ci/allure-inject-skips-card.js <report-dir>
 *   (defaults to "allure-report"). Run right AFTER `allure generate`.
 * Idempotent: re-running does not add a second <script> tag.
 */
const fs = require('fs');
const path = require('path');

const reportDir = process.argv[2] || 'allure-report';
const scriptName = 'allure-skips-card.js';
const srcScript = path.join(__dirname, scriptName);
const indexHtml = path.join(reportDir, 'index.html');
const tag = '<script src="' + scriptName + '"></script>';

if (!fs.existsSync(indexHtml)) {
  console.error('skips-card: no index.html at ' + indexHtml + ' (skipping).');
  process.exit(0); // best-effort, never fail the build
}
if (!fs.existsSync(srcScript)) {
  console.error('skips-card: missing ' + srcScript + ' (skipping).');
  process.exit(0);
}

fs.copyFileSync(srcScript, path.join(reportDir, scriptName));

let html = fs.readFileSync(indexHtml, 'utf8');
if (html.indexOf(scriptName) !== -1) {
  console.log('skips-card: already injected in ' + indexHtml + '.');
  process.exit(0);
}
if (html.indexOf('</body>') !== -1) {
  html = html.replace('</body>', '    ' + tag + '\n</body>');
} else {
  html += '\n' + tag + '\n';
}
fs.writeFileSync(indexHtml, html);
console.log('skips-card: injected ' + scriptName + ' into ' + indexHtml + '.');
