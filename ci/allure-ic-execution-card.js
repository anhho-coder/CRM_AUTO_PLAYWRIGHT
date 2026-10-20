/*
 * CRM Allure customization (client-side, runs inside the generated report).
 *
 * Adds the "Unique test execution by IC" Overview card: who triggered the runs in
 * this report, and how many DISTINCT tests each of them executed.
 *
 * Data: crm-ic-execution.json, written by ci/allure-build-ic-execution.js. This
 * script only RENDERS it - it computes nothing.
 *
 * Reading the numbers:
 *   Unique tests  - distinct tests that IC executed (a test re-run 5 times = 1).
 *   Executions    - raw attempts, so Executions - Unique = re-runs/retries.
 *   The Unique column does NOT have to sum to the report total: a test that two
 *   ICs both ran is unique for each of them. The footer states the column sum,
 *   the report total and how many tests are shared, so the gap is explained
 *   rather than looking like an arithmetic bug.
 *   "unattributed" = results produced before the owner label existed, or by a
 *   lane that does not export TRIGGERED_BY. Greyed, and sorted to the bottom.
 *
 * Placement: right after the Overview "Suites" widget. Idempotent, dark-mode
 * friendly, re-applies on hash navigation via a MutationObserver.
 */
(function () {
  'use strict';

  var WIDGET_ID = 'crm-ic-exec-widget';
  var STYLE_ID = 'crm-ic-exec-style';
  var dataPromise = null;

  function reportRoot() {
    var p = window.location.pathname;
    if (!/\/$/.test(p)) p = p.replace(/[^/]*$/, '');
    return p;
  }

  function loadData() {
    if (dataPromise) return dataPromise;
    dataPromise = fetch(reportRoot() + 'crm-ic-execution.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
    return dataPromise;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '#' + WIDGET_ID + '{padding:16px 20px;margin-bottom:20px;}' +
      '#' + WIDGET_ID + ' .crm-ic-h{font-size:18px;font-weight:700;margin:0 0 2px;}' +
      '#' + WIDGET_ID + ' .crm-ic-sub{font-size:14px;margin:0 0 12px;}' +
      '#' + WIDGET_ID + ' .crm-scroll{overflow-x:auto;}' +
      '#' + WIDGET_ID + ' table{width:100%;border-collapse:collapse;font-size:15px;min-width:620px;}' +
      '#' + WIDGET_ID + ' th{text-align:left;font-size:13px;text-transform:uppercase;letter-spacing:.03em;' +
        'font-weight:700;padding:4px 10px 6px 0;border-bottom:1px solid rgba(127,127,127,.25);white-space:nowrap;}' +
      '#' + WIDGET_ID + ' th.num,#' + WIDGET_ID + ' td.num{text-align:right;width:62px;white-space:nowrap;}' +
      '#' + WIDGET_ID + ' td{padding:7px 10px 7px 0;vertical-align:top;border-bottom:1px solid rgba(127,127,127,.10);}' +
      '#' + WIDGET_ID + ' .crm-ic-name{font-weight:700;white-space:nowrap;}' +
      '#' + WIDGET_ID + ' .crm-ic-name .meta{font-weight:400;font-size:12px;opacity:.7;display:block;}' +
      '#' + WIDGET_ID + ' tr.crm-ic-none td{opacity:.55;}' +
      '#' + WIDGET_ID + ' .crm-uniq{font-weight:700;}' +
      '#' + WIDGET_ID + ' .p{color:#3cb43c;font-weight:600;}' +
      '#' + WIDGET_ID + ' .f{color:#fd5a3e;font-weight:600;}' +
      '#' + WIDGET_ID + ' .b{color:#ffd050;font-weight:600;}' +
      '#' + WIDGET_ID + ' .s{opacity:.6;font-weight:600;}' +
      '#' + WIDGET_ID + ' .crm-ic-foot{font-size:13px;margin-top:10px;opacity:.85;line-height:1.5;}' +
      '#' + WIDGET_ID + ' .crm-ic-foot b{font-weight:700;}';
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.appendChild(document.createTextNode(css));
    document.head.appendChild(st);
  }

  function render(d) {
    var html = '';
    html += '<div class="crm-ic-h">Unique test execution by IC</div>';
    html += '<div class="crm-ic-sub">Who triggered the runs behind this report. ' +
            '<b>Unique tests</b> counts each test once per person, however many times they re-ran it.</div>';
    html += '<div class="crm-scroll"><table><thead><tr>' +
            '<th>IC</th><th class="num">Unique tests</th><th class="num">Executions</th>' +
            '<th class="num">Re-runs</th><th class="num">Passed</th><th class="num">Failed</th>' +
            '<th class="num">Broken</th><th class="num">Skipped</th><th class="num">Builds</th>' +
            '</tr></thead><tbody>';

    (d.ics || []).forEach(function (r) {
      var none = r.ic === 'unattributed';
      var meta = none
        ? 'no owner label on these results'
        : (r.triggers && r.triggers.length ? r.triggers.join(', ') : '');
      html += '<tr' + (none ? ' class="crm-ic-none"' : '') + '>' +
        '<td class="crm-ic-name">' + esc(r.ic) +
          (meta ? '<span class="meta">' + esc(meta) + '</span>' : '') + '</td>' +
        '<td class="num crm-uniq">' + r.uniqueTests + '</td>' +
        '<td class="num">' + r.executions + '</td>' +
        '<td class="num">' + r.reruns + '</td>' +
        '<td class="num p">' + r.passed + '</td>' +
        '<td class="num f">' + r.failed + '</td>' +
        '<td class="num b">' + r.broken + '</td>' +
        '<td class="num s">' + r.skipped + '</td>' +
        '<td class="num">' + r.buildCount + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';

    var foot = 'Column sum <b>' + d.attributedUnique + '</b> vs <b>' + d.totalUnique +
               '</b> unique tests in the report';
    if (d.sharedTests) {
      foot += ' &mdash; <b>' + d.sharedTests + '</b> test(s) were executed by more than one IC, ' +
              'so each of them counts it once while the report total counts it once overall.';
    } else {
      foot += ' &mdash; no test was executed by more than one IC.';
    }
    if (d.unattributedResults) {
      foot += ' <b>' + d.unattributedResults + '</b> result file(s) carry no owner label ' +
              '(produced before the label was added, or by a lane that does not export TRIGGERED_BY).';
    }
    foot += ' Uniqueness uses the same identity key as the period dedupe, so a test re-run across ' +
            'chunks or sections still counts once.';
    html += '<div class="crm-ic-foot">' + foot + '</div>';
    return html;
  }

  function enhance() {
    loadData().then(function (d) {
      if (!d || !d.ics || !d.ics.length) return;
      if (document.getElementById(WIDGET_ID)) return;
      if (!document.querySelector('a.table__row[href^="#suites/"]')) return;   // Overview only
      injectStyle();

      var card = document.createElement('div');
      card.id = WIDGET_ID;
      card.className = 'widget island';   // reuse Allure's themed card chrome
      card.innerHTML = render(d);

      // Directly AFTER the Suites widget, matching the Skipped-Test-cases card.
      var suiteRow = document.querySelector('a.table__row[href^="#suites/"]');
      var w = suiteRow && suiteRow.closest ? suiteRow.closest('.widget') : null;
      if (w && w.parentNode) { w.parentNode.insertBefore(card, w.nextSibling); return; }
      var grid = document.querySelector('.widgets-grid');
      if (grid && grid.parentNode) { grid.parentNode.insertBefore(card, grid.nextSibling); return; }
      var host = document.getElementById('content') || document.body;
      if (host) host.appendChild(card);
    });
  }

  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () { scheduled = false; enhance(); }, 150);
  }

  function boot() {
    schedule();
    var target = document.getElementById('content') || document.body;
    if (target && window.MutationObserver) {
      new MutationObserver(schedule).observe(target, { childList: true, subtree: true });
    }
    window.addEventListener('hashchange', schedule);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
