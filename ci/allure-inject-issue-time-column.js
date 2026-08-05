/*
 * Post-generate injector: adds the "issue date & time" cell to every leaf row
 * of the tree views (Categories / Suites / Behaviors / Packages) of a generated
 * Allure report.
 *
 * It copies ci/allure-issue-time-column.js into the report root and adds a
 * <script> tag for it just before </body> in index.html.
 *
 * Usage: node ci/allure-inject-issue-time-column.js <report-dir>
 *   (defaults to "allure-report"). Run right AFTER `allure generate`.
 * Idempotent: re-running does not add a second <script> tag.
 */
const fs = require('fs');
const path = require('path');

const reportDir = process.argv[2] || 'allure-report';
const scriptName = 'allure-issue-time-column.js';
const srcScript = path.join(__dirname, scriptName);
const indexHtml = path.join(reportDir, 'index.html');
const tag = '<script src="' + scriptName + '"></script>';

if (!fs.existsSync(indexHtml)) {
  console.error('issue-time-column: no index.html at ' + indexHtml + ' (skipping).');
  process.exit(0); // best-effort, never fail the build
}
if (!fs.existsSync(srcScript)) {
  console.error('issue-time-column: missing ' + srcScript + ' (skipping).');
  process.exit(0);
}

fs.copyFileSync(srcScript, path.join(reportDir, scriptName));

let html = fs.readFileSync(indexHtml, 'utf8');
if (html.indexOf(scriptName) !== -1) {
  console.log('issue-time-column: already injected in ' + indexHtml + '.');
  process.exit(0);
}
if (html.indexOf('</body>') !== -1) {
  html = html.replace('</body>', '    ' + tag + '\n</body>');
} else {
  html += '\n' + tag + '\n';
}
fs.writeFileSync(indexHtml, html);
console.log('issue-time-column: injected ' + scriptName + ' into ' + indexHtml + '.');
