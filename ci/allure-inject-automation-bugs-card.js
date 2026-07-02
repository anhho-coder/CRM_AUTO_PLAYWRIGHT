/*
 * Post-generate injector: adds the "Bugs found by automation test" Overview card
 * to a generated Allure report.
 *
 * Copies ci/allure-automation-bugs-card.js into the report root and adds a
 * <script> tag for it before </body>. The card's data comes from
 * crm-automation-bugs.json, which ci/allure-fetch-automation-bugs.js writes first.
 *
 * Usage: node ci/allure-inject-automation-bugs-card.js <report-dir>  (default "allure-report").
 * Idempotent; best-effort (never fails the build).
 */
const fs = require('fs');
const path = require('path');

const reportDir = process.argv[2] || 'allure-report';
const scriptName = 'allure-automation-bugs-card.js';
const srcScript = path.join(__dirname, scriptName);
const indexHtml = path.join(reportDir, 'index.html');
const tag = '<script src="' + scriptName + '"></script>';

if (!fs.existsSync(indexHtml)) { console.error('autobugs-card: no index.html at ' + indexHtml + ' (skipping).'); process.exit(0); }
if (!fs.existsSync(srcScript)) { console.error('autobugs-card: missing ' + srcScript + ' (skipping).'); process.exit(0); }

fs.copyFileSync(srcScript, path.join(reportDir, scriptName));

let html = fs.readFileSync(indexHtml, 'utf8');
if (html.indexOf(scriptName) !== -1) { console.log('autobugs-card: already injected in ' + indexHtml + '.'); process.exit(0); }
if (html.indexOf('</body>') !== -1) html = html.replace('</body>', '    ' + tag + '\n</body>');
else html += '\n' + tag + '\n';
fs.writeFileSync(indexHtml, html);
console.log('autobugs-card: injected ' + scriptName + ' into ' + indexHtml + '.');
