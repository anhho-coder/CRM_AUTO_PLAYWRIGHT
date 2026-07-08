#!/usr/bin/env node
/*
 * Post-generate injector: adds the quarter period switcher (Current / Previous) to a
 * generated Allure report. Writes period-nav.json (the hrefs + which tab is active)
 * next to index.html, copies ci/allure-period-nav.js into the report, and adds a
 * <script> tag for it before </body>.
 *
 * Usage:
 *   node ci/allure-inject-period-nav.js <report-dir> <active> <curKey> <curHref> <prevKey> <prevHref> [label]
 *     active   = "current" | "previous"  (which tab is highlighted)
 *     curHref  = relative href to the CURRENT-period report from THIS report ("." or "..")
 *     prevHref = relative href to the PREVIOUS-period report ("previous" or "." or "" if none)
 *     label    = period word shown before the tabs ("Day"/"Week"/"Month"/"Quarter"/"Year")
 *
 * Idempotent: re-running rewrites period-nav.json and does not add a second <script> tag.
 */
const fs = require('fs');
const path = require('path');

const reportDir = process.argv[2] || 'allure-report';
const active    = process.argv[3] || 'current';
const curKey    = process.argv[4] || '';
const curHref   = process.argv[5] || '.';
const prevKey   = process.argv[6] || '';
const prevHref  = process.argv[7] || '';
const label     = process.argv[8] || 'Period';

const scriptName = 'allure-period-nav.js';
const srcScript = path.join(__dirname, scriptName);
const indexHtml = path.join(reportDir, 'index.html');
const tag = '<script src="' + scriptName + '"></script>';

if (!fs.existsSync(indexHtml)) {
  console.error('period-nav: no index.html at ' + indexHtml + ' (skipping).');
  process.exit(0);
}
if (!fs.existsSync(srcScript)) {
  console.error('period-nav: missing ' + srcScript + ' (skipping).');
  process.exit(0);
}

const cfg = {
  active: active,
  label: label,
  items: [
    { role: 'current',  key: curKey,  href: curHref },
    { role: 'previous', key: prevKey, href: prevHref }
  ]
};
fs.writeFileSync(path.join(reportDir, 'period-nav.json'), JSON.stringify(cfg));
fs.copyFileSync(srcScript, path.join(reportDir, scriptName));

let html = fs.readFileSync(indexHtml, 'utf8');
if (html.indexOf(scriptName) === -1) {
  if (html.indexOf('</body>') !== -1) {
    html = html.replace('</body>', '    ' + tag + '\n</body>');
  } else {
    html += '\n' + tag + '\n';
  }
  fs.writeFileSync(indexHtml, html);
}
console.log('period-nav: injected switcher into ' + indexHtml + ' (active=' + active +
            ', current=' + curKey + ', previous=' + (prevKey || '-') + ').');
