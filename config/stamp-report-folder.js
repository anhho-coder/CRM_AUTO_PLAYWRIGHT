/**
 * Stamps a Playwright HTML report with the report folder it was generated into.
 *
 * Playwright's index.html always renders the same "Playwright Test Report" tab title and
 * shows nothing about its own location, so once several runs sit side by side under
 * playwright-report/ there is no way to tell which folder the open report came from.
 *
 * This appends ONE self-contained script to index.html which, at view time:
 *   - sets the browser tab title to the report folder name, and
 *   - shows a small pill in the bottom-right corner with that folder name
 *     (hover = full path, click = copy the full path, x = hide it for the session).
 *
 * Append-only and idempotent: the embedded report data is never rewritten, and a report
 * that already carries the stamp is left alone.
 *
 * Used by config/custom-reporter.js after the run folder is renamed to _Passed / _Failed,
 * and runnable on its own to backfill reports produced before this existed:
 *   node config/stamp-report-folder.js                 # every report under playwright-report/
 *   node config/stamp-report-folder.js <folder> [...]  # only these report folders
 *   node config/stamp-report-folder.js --force         # re-stamp (e.g. after a rename)
 */

const fs = require('fs');
const path = require('path');

const MARKER = 'pw-report-folder-stamp';
const TAIL_BYTES = 8192;
const REPORT_ROOT = path.join(process.cwd(), 'playwright-report');

/** True when index.html already carries a stamp (checked from the file tail, not a full read). */
function isStamped(indexPath) {
  const size = fs.statSync(indexPath).size;
  const length = Math.min(TAIL_BYTES, size);
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(indexPath, 'r');
  try {
    fs.readSync(fd, buffer, 0, length, size - length);
  } finally {
    fs.closeSync(fd);
  }
  return buffer.toString('utf8').includes(MARKER);
}

/** Drop a previous stamp so a renamed folder can be re-stamped with its new name. */
function removeStamp(indexPath) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const start = html.indexOf('<script id="' + MARKER + '"');
  if (start === -1) return;
  const end = html.indexOf('</script>', start);
  fs.writeFileSync(indexPath, html.slice(0, start) + (end === -1 ? '' : html.slice(end + '</script>'.length)), 'utf8');
}

function buildSnippet(label, fullPath) {
  const info = JSON.stringify({ label: label, fullPath: fullPath });
  return `
<script id="${MARKER}">
(function () {
  var info = ${info};

  function applyTitle() {
    if (document.title !== info.label) document.title = info.label;
  }
  applyTitle();
  // The report app renders after this runs, so re-assert the title briefly.
  var ticks = 0;
  var timer = setInterval(function () {
    applyTitle();
    if (++ticks > 20) clearInterval(timer);
  }, 500);
  window.addEventListener('hashchange', applyTitle);

  function render() {
    if (document.getElementById('pw-report-folder-badge')) return;

    var badge = document.createElement('div');
    badge.id = 'pw-report-folder-badge';
    badge.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483647;' +
      'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;';

    var pill = document.createElement('div');
    pill.style.cssText = 'display:flex;align-items:center;gap:8px;max-width:48vw;padding:7px 12px;' +
      'border-radius:999px;background:rgba(24,26,30,.93);color:#f2f4f7;' +
      'border:1px solid rgba(255,255,255,.2);box-shadow:0 2px 12px rgba(0,0,0,.4);' +
      'backdrop-filter:blur(4px);cursor:pointer;';
    pill.title = info.fullPath + '  (click to copy)';

    var text = document.createElement('span');
    text.textContent = '\uD83D\uDCC1 ' + info.label;
    text.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

    var close = document.createElement('span');
    close.textContent = '\u00D7';
    close.title = 'Hide';
    close.style.cssText = 'opacity:.6;font-size:14px;line-height:1;padding:0 2px;';
    close.addEventListener('click', function (event) {
      event.stopPropagation();
      badge.remove();
    });

    pill.addEventListener('click', function () {
      var restore = text.textContent;
      function flash(message) {
        text.textContent = message;
        setTimeout(function () { text.textContent = restore; }, 1200);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(info.fullPath).then(
          function () { flash('\u2713 path copied'); },
          function () { flash(info.fullPath); }
        );
      } else {
        flash(info.fullPath);
      }
    });

    pill.appendChild(text);
    pill.appendChild(close);
    badge.appendChild(pill);
    document.body.appendChild(badge);
  }

  if (document.body) render();
  else document.addEventListener('DOMContentLoaded', render);
})();
</script>
`;
}

/**
 * Stamp one report folder (the folder that holds index.html).
 * Returns 'stamped' | 'restamped' | 'skipped' | 'missing'.
 */
function stampReportFolder(folderPath, options) {
  const force = !!(options && options.force);
  const indexPath = path.join(folderPath, 'index.html');
  if (!fs.existsSync(indexPath)) return 'missing';

  const stamped = isStamped(indexPath);
  if (stamped && !force) return 'skipped';
  if (stamped) removeStamp(indexPath);

  const absolute = path.resolve(folderPath);
  // Label reports by their path relative to playwright-report/ so nested bundle reports stay distinguishable.
  let label = path.relative(REPORT_ROOT, absolute);
  if (!label || label.startsWith('..')) label = path.basename(absolute);
  label = label.split(path.sep).join('/');

  fs.appendFileSync(indexPath, buildSnippet(label, absolute), 'utf8');
  return stamped ? 'restamped' : 'stamped';
}

/** Every folder holding an index.html under playwright-report/ (reports, plus bundle sub-reports). */
function findReportFolders(root, depth) {
  const found = [];
  if (!fs.existsSync(root)) return found;
  if (fs.existsSync(path.join(root, 'index.html'))) found.push(root);
  if (depth <= 0) return found;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== 'data' && entry.name !== 'trace') {
      found.push(...findReportFolders(path.join(root, entry.name), depth - 1));
    }
  }
  return found;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const targets = args.filter(arg => !arg.startsWith('--'));
  const folders = targets.length ? targets : findReportFolders(REPORT_ROOT, 2);

  const tally = { stamped: 0, restamped: 0, skipped: 0, missing: 0 };
  for (const folder of folders) {
    const result = stampReportFolder(folder, { force });
    tally[result]++;
    if (result === 'stamped' || result === 'restamped') {
      console.log(`  ${result}: ${path.basename(path.resolve(folder))}`);
    }
  }
  console.log(`[stamp-report-folder] ${tally.stamped} stamped, ${tally.restamped} re-stamped, ` +
    `${tally.skipped} already stamped, ${tally.missing} without index.html`);
}

module.exports = { stampReportFolder, findReportFolders };
