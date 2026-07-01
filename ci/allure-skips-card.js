/*
 * CRM Allure customization (client-side, runs inside the generated report).
 *
 * Adds a new Overview card: "Skipped Test Cases by Suite (intentional skips)".
 * One row PER BLOCKING BUG, grouped by suite, showing how many skipped test
 * cases that bug accounts for, plus the bug's live Jira status / assignee /
 * last-updated. None of this exists in the Allure report itself, so it is
 * produced from the sources + Jira by:
 *   - ci/allure-build-skip-index.js  -> crm-skips.json (suites[].bugRows[])
 *   - ci/allure-fetch-jira-meta.js   -> crm-skips.json bugMeta{}
 * This script only renders that file.
 *
 * Placement: inserted right after the Overview "Suites" widget. Idempotent,
 * dark-mode friendly, re-applies on hash navigation via a MutationObserver.
 */
(function () {
  'use strict';

  var WIDGET_ID = 'crm-skips-widget';
  var STYLE_ID = 'crm-skips-style';
  var dataPromise = null;

  function reportRoot() {
    var p = window.location.pathname;
    if (!/\/$/.test(p)) p = p.replace(/[^/]*$/, '');
    return p;
  }

  function loadData() {
    if (dataPromise) return dataPromise;
    dataPromise = fetch(reportRoot() + 'crm-skips.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
    return dataPromise;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '#' + WIDGET_ID + '{padding:16px 20px;margin-bottom:20px;}' +
      '#' + WIDGET_ID + ' .crm-skips-h{font-size:16px;font-weight:700;margin:0 0 2px;}' +
      '#' + WIDGET_ID + ' .crm-skips-sub{font-size:12px;opacity:.6;margin:0 0 12px;}' +
      '#' + WIDGET_ID + ' .crm-skips-sub b{opacity:.9;}' +
      '#' + WIDGET_ID + ' .crm-scroll{overflow-x:auto;}' +
      '#' + WIDGET_ID + ' table{width:100%;border-collapse:collapse;font-size:13px;min-width:720px;}' +
      '#' + WIDGET_ID + ' th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.03em;' +
        'opacity:.55;font-weight:700;padding:4px 10px 6px 0;border-bottom:1px solid rgba(127,127,127,.25);white-space:nowrap;}' +
      '#' + WIDGET_ID + ' th.num,#' + WIDGET_ID + ' td.num{text-align:right;width:60px;white-space:nowrap;}' +
      '#' + WIDGET_ID + ' td{padding:7px 10px 7px 0;vertical-align:top;border-bottom:1px solid rgba(127,127,127,.10);}' +
      '#' + WIDGET_ID + ' tr.grp-first td{border-top:2px solid rgba(127,127,127,.22);}' +
      '#' + WIDGET_ID + ' .crm-suite{font-weight:700;white-space:nowrap;}' +
      '#' + WIDGET_ID + ' .crm-suite .tot{font-weight:400;opacity:.5;font-size:11px;}' +
      '#' + WIDGET_ID + ' .crm-bug-cell{white-space:nowrap;cursor:pointer;user-select:none;}' +
      '#' + WIDGET_ID + ' .crm-bug-cell .caret{display:inline-block;width:11px;opacity:.45;font-size:9px;}' +
      '#' + WIDGET_ID + ' tr.open .crm-bug-cell .caret{transform:rotate(90deg);}' +
      '#' + WIDGET_ID + ' .crm-bug{display:inline-block;padding:1px 7px;border-radius:10px;font-size:12px;font-weight:600;' +
        'text-decoration:none;background:rgba(217,83,79,.14);color:#c9302c;border:1px solid rgba(217,83,79,.30);}' +
      '#' + WIDGET_ID + ' .crm-bug:hover{background:rgba(217,83,79,.24);}' +
      '#' + WIDGET_ID + ' .crm-nobug{opacity:.45;font-style:italic;}' +
      '#' + WIDGET_ID + ' .crm-none{opacity:.4;}' +
      '#' + WIDGET_ID + ' .crm-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle;}' +
      '#' + WIDGET_ID + ' .cat-done{background:#3ca25b;}' +
      '#' + WIDGET_ID + ' .cat-indeterminate{background:#2f7ed8;}' +
      '#' + WIDGET_ID + ' .cat-new{background:#c99a2e;}' +
      '#' + WIDGET_ID + ' .cat-unknown{background:#9aa0a6;}' +
      '#' + WIDGET_ID + ' .crm-status{white-space:nowrap;}' +
      '#' + WIDGET_ID + ' .crm-inactive{opacity:.5;font-size:11px;}' +
      '#' + WIDGET_ID + ' .crm-upd{white-space:nowrap;opacity:.85;}' +
      '#' + WIDGET_ID + ' .crm-reason{opacity:.8;min-width:180px;}' +
      '#' + WIDGET_ID + ' .crm-detail{display:none;}' +
      '#' + WIDGET_ID + ' tr.open + tr.crm-detail{display:table-row;}' +
      '#' + WIDGET_ID + ' .crm-detail td{padding-top:2px;}' +
      '#' + WIDGET_ID + ' .crm-detail ol{margin:2px 0 6px;padding-left:22px;}' +
      '#' + WIDGET_ID + ' .crm-detail li{padding:2px 0;opacity:.85;font-size:12px;}' +
      '#' + WIDGET_ID + ' .crm-foot{font-size:11px;opacity:.5;margin-top:10px;}';
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    var m = String(iso).match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : String(iso);
  }
  function catClass(cat) {
    if (cat === 'done') return 'cat-done';
    if (cat === 'indeterminate') return 'cat-indeterminate';
    if (cat === 'new') return 'cat-new';
    return 'cat-unknown';
  }

  function buildCard(data) {
    var card = document.createElement('div');
    card.id = WIDGET_ID;
    card.className = 'widget island';   // reuse Allure's themed card chrome (bg/radius/shadow)
    var jira = data.jiraBase || 'http://jira.nakivo.com/browse/';
    var meta = data.bugMeta || {};

    var html = '';
    html += '<div class="crm-skips-h">Skipped Test Cases by Suite</div>';
    html += '<div class="crm-skips-sub">Deliberate skips in code &mdash; <b>' + data.totalSkipped +
            '</b> test case(s) across <b>' + data.suites.length + '</b> suite(s), blocked by <b>' +
            data.totalBugs + '</b> bug(s). Click a bug to list its tests.</div>';
    html += '<div class="crm-scroll"><table><thead><tr>' +
              '<th>Suite</th><th class="num">Skipped</th><th>Bug</th>' +
              '<th>Bug Status</th><th>Assignee</th><th>Latest Update</th><th>Reason</th>' +
            '</tr></thead><tbody>';

    data.suites.forEach(function (s) {
      var rows = s.bugRows || [];
      rows.forEach(function (br, ri) {
        var first = ri === 0;
        var suiteCell = first
          ? '<span class="crm-suite">' + esc(s.suite) + ' <span class="tot">(' + s.count + ' total)</span></span>'
          : '';
        var m = br.bug ? (meta[br.bug] || null) : null;
        var bugCell = br.bug
          ? '<span class="caret">▶</span> <a class="crm-bug" href="' + jira + encodeURIComponent(br.bug) +
            '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + esc(br.bug) + '</a>'
          : '<span class="caret">▶</span> <span class="crm-nobug">(no bug)</span>';
        var statusCell = m && m.status
          ? '<span class="crm-status"><span class="crm-dot ' + catClass(m.statusCategory) + '"></span>' + esc(m.status) + '</span>'
          : '<span class="crm-none">—</span>';
        var assigneeCell = m && m.assignee
          ? esc(m.assignee) + (m.active === false ? ' <span class="crm-inactive">(inactive)</span>' : '')
          : '<span class="crm-none">—</span>';
        var updCell = m ? '<span class="crm-upd">' + fmtDate(m.updated) + '</span>' : '<span class="crm-none">—</span>';
        var reason = (br.reasons && br.reasons.length)
          ? br.reasons.map(esc).join(' &middot; ')
          : '<span class="crm-none">—</span>';

        html += '<tr class="crm-bugrow' + (first ? ' grp-first' : '') + '" data-bug="' + esc(br.bug || '') + '">' +
                  '<td>' + suiteCell + '</td>' +
                  '<td class="num">' + br.count + '</td>' +
                  '<td class="crm-bug-cell">' + bugCell + '</td>' +
                  '<td>' + statusCell + '</td>' +
                  '<td>' + assigneeCell + '</td>' +
                  '<td>' + updCell + '</td>' +
                  '<td class="crm-reason">' + reason + '</td>' +
                '</tr>';
        var items = (br.tests || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
        html += '<tr class="crm-detail"><td></td><td></td><td colspan="5"><ol>' + items + '</ol></td></tr>';
      });
    });

    html += '</tbody></table></div>';

    var srcLabel = data.bugMetaSource === 'jira-live' ? 'live from Jira'
                 : data.bugMetaSource === 'cache' ? 'cached snapshot'
                 : 'unavailable';
    html += '<div class="crm-foot">Jira data: ' + srcLabel +
            (data.bugMetaAsOf ? ' &middot; as of ' + fmtDate(data.bugMetaAsOf) : '') + '</div>';

    card.innerHTML = html;

    // Expand/collapse a bug row to list its skipped tests.
    Array.prototype.forEach.call(card.querySelectorAll('tr.crm-bugrow .crm-bug-cell'), function (cell) {
      cell.addEventListener('click', function () { cell.parentNode.classList.toggle('open'); });
    });
    return card;
  }

  function enhance() {
    loadData().then(function (data) {
      if (!data || !data.suites || !data.suites.length) return;
      if (document.getElementById(WIDGET_ID)) return;
      if (!document.querySelector('a.table__row[href^="#suites/"]')) return;   // Overview only
      injectStyle();
      var card = buildCard(data);
      // Prefer a FULL-WIDTH slot below the widgets grid (the card has 7 columns and
      // does not fit one masonry column). Fall back to after the Suites widget.
      var grid = document.querySelector('.widgets-grid');
      if (grid && grid.parentNode) {
        grid.parentNode.insertBefore(card, grid.nextSibling);
        return;
      }
      var suiteRow = document.querySelector('a.table__row[href^="#suites/"]');
      var w = suiteRow && suiteRow.closest ? suiteRow.closest('.widget') : null;
      if (w && w.parentNode) { w.parentNode.insertBefore(card, w.nextSibling); return; }
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
