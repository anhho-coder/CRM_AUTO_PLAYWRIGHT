/**
 * Colour-codes the VERIFY block that every spec prints on stdout, inside the Playwright HTML report.
 *
 * Playwright's HTML reporter strips ANSI escapes from stdout (playwright/lib/reporters/html.js,
 * _serializeAttachments), so colouring the console.log output in the specs never reaches the
 * report. Instead this appends ONE self-contained script to index.html which, at view time,
 * restyles the plain-text stdout box:
 *   - Result : PASS            -> green badge
 *   - Result : FAIL            -> red badge, and the whole "Verify #N" block is tinted red
 *   - OVERALL: PASS / FAIL     -> green / red bar
 *   - Verify #N - <check>:     -> bold heading
 *   - ===== VERIFY =====       -> bold banner
 *   - Expected : / Actual :    -> dimmed label, value left as is
 * Only the rendering changes: the text, the "copy" button and the embedded report data are untouched.
 *
 * Append-only and idempotent, like config/stamp-report-folder.js.
 *
 * Used by config/custom-reporter.js after the run folder is renamed to _Passed / _Failed,
 * and runnable on its own to backfill reports produced before this existed:
 *   node config/colorize-verify-stdout.js                 # every report under playwright-report/
 *   node config/colorize-verify-stdout.js <folder> [...]  # only these report folders
 *   node config/colorize-verify-stdout.js --force         # replace an older version of the script
 */

const fs = require('fs');
const path = require('path');
const { findReportFolders } = require('./stamp-report-folder');

const MARKER = 'pw-verify-colorize';
// The folder stamp is appended after this script on every re-stamp, so look further back than its 8 KB.
const TAIL_BYTES = 65536;
const REPORT_ROOT = path.join(process.cwd(), 'playwright-report');

/** Runs in the browser. Serialised with toString(), so it must not reference anything outside itself. */
function browserColorizeVerify() {
  var STYLE_ID = 'pw-verify-colorize-style';
  var css = [
    '.vr-badge{color:#fff;font-weight:700;padding:0 6px;border-radius:3px}',
    '.vr-pass{background:#1f883d}',
    '.vr-fail{background:#cf222e}',
    '.vr-head{font-weight:700}',
    '.vr-banner{font-weight:700}',
    '.vr-label{opacity:.65}',
    '.vr-in-fail{background:rgba(207,34,46,.13)}',
    '.vr-head.vr-in-fail{color:#cf222e}',
    '.dark-mode .vr-head.vr-in-fail{color:#ff7b72}',
    '.vr-overall{color:#fff;font-weight:700;padding:1px 8px;border-radius:3px}'
  ].join('\n');

  var BANNER = /^\s*=+\s*(VERIFY\s*=+\s*)?$/;
  var HEAD = /^\s*Verify\s*#\s*\d+/;
  var RESULT = /^(\s*Result\s*:\s*)(PASS|FAIL)\b(.*)$/;
  var OVERALL = /^\s*OVERALL\s*:\s*(PASS|FAIL)\b/;
  var LABEL = /^(\s*(?:Expected|Actual)\s*:)(.*)$/;

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function span(className, text) {
    var el = document.createElement('span');
    el.className = className;
    el.textContent = text;
    return el;
  }

  /** One stdout line -> a span whose classes say what kind of line it is. */
  function renderLine(text) {
    var line = document.createElement('span');
    line.className = 'vr-line';
    var match;
    if ((match = RESULT.exec(text))) {
      var verdict = match[2];
      line.className += ' vr-result vr-result-' + verdict.toLowerCase();
      line.appendChild(span('vr-label', match[1]));
      line.appendChild(span('vr-badge vr-' + verdict.toLowerCase(), verdict));
      if (match[3]) line.appendChild(document.createTextNode(match[3]));
    } else if ((match = OVERALL.exec(text))) {
      line.className += ' vr-overall vr-' + match[1].toLowerCase();
      line.textContent = text;
    } else if (HEAD.test(text)) {
      line.className += ' vr-head';
      line.textContent = text;
    } else if (BANNER.test(text) && /={5,}/.test(text)) {
      line.className += ' vr-banner';
      line.textContent = text;
    } else if ((match = LABEL.exec(text))) {
      line.appendChild(span('vr-label', match[1]));
      line.appendChild(document.createTextNode(match[2]));
    } else {
      line.textContent = text;
    }
    return line;
  }

  /** Replace a plain text node by line spans, keeping every character (newlines included). */
  function renderTextNode(node) {
    var parts = node.nodeValue.split('\n');
    var fragment = document.createDocumentFragment();
    for (var i = 0; i < parts.length; i++) {
      if (i > 0) fragment.appendChild(document.createTextNode('\n'));
      if (parts[i]) fragment.appendChild(renderLine(parts[i]));
    }
    node.parentNode.replaceChild(fragment, node);
  }

  /** Tint every line of a "Verify #N" block whose Result is FAIL. */
  function markFailedBlocks(body) {
    var block = [];
    var lines = body.querySelectorAll('.vr-line');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.classList.contains('vr-head')) block = [line];
      else if (block.length) block.push(line);
      if (line.classList.contains('vr-result')) {
        if (line.classList.contains('vr-result-fail')) {
          for (var j = 0; j < block.length; j++) block[j].classList.add('vr-in-fail');
        }
        block = [];
      }
    }
  }

  function colorize(body) {
    body.setAttribute('data-vr', '1');
    if (!/Result\s*:\s*(PASS|FAIL)|OVERALL\s*:/.test(body.textContent)) return;
    var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parent = node.parentElement;
        if (!parent || parent.closest('a, button, svg, [class*="copy"]')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(renderTextNode);
    markFailedBlocks(body);
  }

  var scheduled = false;
  function scan() {
    scheduled = false;
    var bodies = document.querySelectorAll('.attachment-body:not([data-vr])');
    for (var i = 0; i < bodies.length; i++) colorize(bodies[i]);
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scan);
  }

  function start() {
    addStyle();
    schedule();
    // The report is a React app: stdout boxes are created when a test / attachment is expanded.
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
}

/** True when index.html already carries the script (checked from the file tail, not a full read). */
function isColorized(indexPath) {
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

/** Drop a previous copy of the script so --force can replace it with the current version. */
function removeScript(indexPath) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const start = html.indexOf('<script id="' + MARKER + '"');
  if (start === -1) return;
  const end = html.indexOf('</script>', start);
  fs.writeFileSync(indexPath, html.slice(0, start) + (end === -1 ? '' : html.slice(end + '</script>'.length)), 'utf8');
}

/**
 * Add the colouring script to one report folder (the folder that holds index.html).
 * Returns 'colorized' | 'recolorized' | 'skipped' | 'missing'.
 */
function colorizeReportFolder(folderPath, options) {
  const force = !!(options && options.force);
  const indexPath = path.join(folderPath, 'index.html');
  if (!fs.existsSync(indexPath)) return 'missing';

  const colorized = isColorized(indexPath);
  if (colorized && !force) return 'skipped';
  if (colorized) removeScript(indexPath);

  fs.appendFileSync(indexPath, `\n<script id="${MARKER}">\n(${browserColorizeVerify.toString()})();\n</script>\n`, 'utf8');
  return colorized ? 'recolorized' : 'colorized';
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const targets = args.filter(arg => !arg.startsWith('--'));
  const folders = targets.length ? targets : findReportFolders(REPORT_ROOT, 2);

  const tally = { colorized: 0, recolorized: 0, skipped: 0, missing: 0 };
  for (const folder of folders) {
    const result = colorizeReportFolder(folder, { force });
    tally[result]++;
    if (result === 'colorized' || result === 'recolorized') {
      console.log(`  ${result}: ${path.basename(path.resolve(folder))}`);
    }
  }
  console.log(`[colorize-verify-stdout] ${tally.colorized} colorized, ${tally.recolorized} re-colorized, ` +
    `${tally.skipped} already colorized, ${tally.missing} without index.html`);
}

module.exports = { colorizeReportFolder };
