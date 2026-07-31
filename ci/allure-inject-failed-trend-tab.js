/*
 * Post-generate injector: adds the "Failed cases trend" sidebar TAB to a generated
 * Allure report (weekly).
 *
 * Copies ci/allure-failed-trend-tab.js into the report root and adds a <script> tag
 * for it before </body>. The tab's data comes from crm-failed-trend.json (written by
 * ci/allure-build-failed-trend.js) and crm-fix-failed.json (written by
 * ci/allure-build-fix-failed.js), which must run first.
 *
 * Usage: node ci/allure-inject-failed-trend-tab.js <report-dir>  (default "allure-report").
 * Idempotent; best-effort (never fails the build).
 */
const fs = require('fs');
const path = require('path');

const reportDir = process.argv[2] || 'allure-report';
const scriptName = 'allure-failed-trend-tab.js';
const srcScript = path.join(__dirname, scriptName);
const indexHtml = path.join(reportDir, 'index.html');
const tag = '<script src="' + scriptName + '"></script>';

if (!fs.existsSync(indexHtml)) { console.error('failed-trend-tab: no index.html at ' + indexHtml + ' (skipping).'); process.exit(0); }
if (!fs.existsSync(srcScript)) { console.error('failed-trend-tab: missing ' + srcScript + ' (skipping).'); process.exit(0); }

fs.copyFileSync(srcScript, path.join(reportDir, scriptName));

let html = fs.readFileSync(indexHtml, 'utf8');
if (html.indexOf(scriptName) !== -1) { console.log('failed-trend-tab: already injected in ' + indexHtml + '.'); process.exit(0); }
if (html.indexOf('</body>') !== -1) html = html.replace('</body>', '    ' + tag + '\n</body>');
else html += '\n' + tag + '\n';
fs.writeFileSync(indexHtml, html);
console.log('failed-trend-tab: injected ' + scriptName + ' into ' + indexHtml + '.');
