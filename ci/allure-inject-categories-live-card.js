/*
 * Post-generate injector: makes the Overview "Categories - list of failed cases"
 * card LIVE.
 *
 * Copies ci/allure-categories-live-card.js into the report root and adds a
 * <script> tag for it before </body>. That card re-fetches widgets/categories.json
 * with { cache: 'no-store' } on every Overview entry, renders the categories, and
 * hides the native (browser-cacheable) Categories widget so the counts are never
 * stale after a rebuild. No data build step (reads Allure's own categories.json).
 *
 * Usage: node ci/allure-inject-categories-live-card.js <report-dir>  (default "allure-report").
 * Idempotent; best-effort (never fails the build).
 */
const fs = require('fs');
const path = require('path');

const reportDir = process.argv[2] || 'allure-report';
const scriptName = 'allure-categories-live-card.js';
const srcScript = path.join(__dirname, scriptName);
const indexHtml = path.join(reportDir, 'index.html');
const tag = '<script src="' + scriptName + '"></script>';

if (!fs.existsSync(indexHtml)) { console.error('categories-live-card: no index.html at ' + indexHtml + ' (skipping).'); process.exit(0); }
if (!fs.existsSync(srcScript)) { console.error('categories-live-card: missing ' + srcScript + ' (skipping).'); process.exit(0); }

fs.copyFileSync(srcScript, path.join(reportDir, scriptName));

let html = fs.readFileSync(indexHtml, 'utf8');
if (html.indexOf(scriptName) !== -1) { console.log('categories-live-card: already injected in ' + indexHtml + '.'); process.exit(0); }
if (html.indexOf('</body>') !== -1) html = html.replace('</body>', '    ' + tag + '\n</body>');
else html += '\n' + tag + '\n';
fs.writeFileSync(indexHtml, html);
console.log('categories-live-card: injected ' + scriptName + ' into ' + indexHtml + '.');
