/*
 * CRM Allure customization (client-side, runs inside the generated report).
 *
 * Adds an Overview card: "Bugs found by automation test" - the CRM bugs that the
 * automation suite surfaced (Jira: project=CRM, issuetype Bug/Bug[Maintenance],
 * label QA-CRM_Automation). Columns: Bug (Jira link) | Summary | Bug Status |
 * Assignee | Latest Update. Bugs are split into "Open" (not yet Done) and
 * "Resolved / Closed" groups. Data is resolved at build time by
 * ci/allure-fetch-automation-bugs.js into <report-root>/crm-automation-bugs.json;
 * this script only renders it.
 *
 * Placement: inserted in the right column, just ABOVE the "Executors" widget.
 * Idempotent, dark-mode friendly, re-applies on hash navigation.
 */
(function () {
  'use strict';

  var WIDGET_ID = 'crm-autobugs-widget';
  var STYLE_ID = 'crm-autobugs-style';
  var dataPromise = null;

  function reportRoot() {
    var p = window.location.pathname;
    if (!/\/$/.test(p)) p = p.replace(/[^/]*$/, '');
    return p;
  }

  function loadData() {
    if (dataPromise) return dataPromise;
    dataPromise = fetch(reportRoot() + 'crm-automation-bugs.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
    return dataPromise;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '#' + WIDGET_ID + '{padding:16px 20px;margin-bottom:20px;}' +
      '#' + WIDGET_ID + ' .crm-ab-h{font-size:16px;font-weight:700;margin:0 0 2px;}' +
      '#' + WIDGET_ID + ' .crm-ab-sub{font-size:12px;opacity:.6;margin:0 0 12px;}' +
      '#' + WIDGET_ID + ' .crm-ab-sub b{opacity:.9;}' +
      '#' + WIDGET_ID + ' .crm-ab-scroll{overflow-x:auto;}' +
      '#' + WIDGET_ID + ' table{width:100%;border-collapse:collapse;font-size:13px;min-width:460px;}' +
      '#' + WIDGET_ID + ' th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.03em;' +
        'opacity:.55;font-weight:700;padding:4px 10px 6px 0;border-bottom:1px solid rgba(127,127,127,.25);white-space:nowrap;}' +
      '#' + WIDGET_ID + ' td{padding:7px 10px 7px 0;vertical-align:top;border-bottom:1px solid rgba(127,127,127,.10);}' +
      '#' + WIDGET_ID + ' tr.grp td{padding:10px 0 5px;border-bottom:1px solid rgba(127,127,127,.25);' +
        'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;opacity:.6;}' +
      '#' + WIDGET_ID + ' .crm-bug{display:inline-block;padding:1px 7px;border-radius:10px;font-size:12px;font-weight:600;' +
        'text-decoration:none;background:rgba(217,83,79,.14);color:#c9302c;border:1px solid rgba(217,83,79,.30);white-space:nowrap;}' +
      '#' + WIDGET_ID + ' .crm-bug:hover{background:rgba(217,83,79,.24);}' +
      '#' + WIDGET_ID + ' .crm-sum{opacity:.9;min-width:180px;}' +
      '#' + WIDGET_ID + ' .crm-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle;}' +
      '#' + WIDGET_ID + ' .cat-done{background:#3ca25b;}' +
      '#' + WIDGET_ID + ' .cat-indeterminate{background:#2f7ed8;}' +
      '#' + WIDGET_ID + ' .cat-new{background:#c99a2e;}' +
      '#' + WIDGET_ID + ' .cat-unknown{background:#9aa0a6;}' +
      '#' + WIDGET_ID + ' .crm-status,#' + WIDGET_ID + ' .crm-upd{white-space:nowrap;}' +
      '#' + WIDGET_ID + ' .crm-upd{opacity:.85;}' +
      '#' + WIDGET_ID + ' .crm-inactive{opacity:.5;font-size:11px;}' +
      '#' + WIDGET_ID + ' .crm-none{opacity:.4;}' +
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

  function rowHtml(b, jira) {
    var statusCell = b.status
      ? '<span class="crm-status"><span class="crm-dot ' + catClass(b.statusCategory) + '"></span>' + esc(b.status) + '</span>'
      : '<span class="crm-none">—</span>';
    var assignee = b.assignee
      ? esc(b.assignee) + (b.active === false ? ' <span class="crm-inactive">(inactive)</span>' : '')
      : '<span class="crm-none">—</span>';
    return '<tr>' +
      '<td><a class="crm-bug" href="' + jira + encodeURIComponent(b.key) + '" target="_blank" rel="noopener">' + esc(b.key) + '</a></td>' +
      '<td class="crm-sum">' + esc(b.summary) + '</td>' +
      '<td>' + statusCell + '</td>' +
      '<td>' + assignee + '</td>' +
      '<td class="crm-upd">' + fmtDate(b.updated) + '</td>' +
    '</tr>';
  }

  function buildCard(data) {
    var card = document.createElement('div');
    card.id = WIDGET_ID;
    card.className = 'widget island';
    var jira = data.jiraBase || 'http://jira.nakivo.com/browse/';
    var bugs = data.bugs || [];
    var open = bugs.filter(function (b) { return b.statusCategory !== 'done'; });
    var done = bugs.filter(function (b) { return b.statusCategory === 'done'; });

    var html = '';
    html += '<div class="crm-ab-h">Bugs found by automation test</div>';
    html += '<div class="crm-ab-sub">CRM bugs surfaced by the automation suite (label <b>QA-CRM_Automation</b>) &mdash; <b>' +
            bugs.length + '</b> total: <b>' + open.length + '</b> open, <b>' + done.length + '</b> resolved/closed.</div>';
    html += '<div class="crm-ab-scroll"><table><thead><tr>' +
              '<th>Bug</th><th>Summary</th><th>Bug Status</th><th>Assignee</th><th>Latest Update</th>' +
            '</tr></thead><tbody>';

    if (open.length) {
      html += '<tr class="grp"><td colspan="5">Open — ' + open.length + '</td></tr>';
      open.forEach(function (b) { html += rowHtml(b, jira); });
    }
    if (done.length) {
      html += '<tr class="grp"><td colspan="5">Resolved / Closed — ' + done.length + '</td></tr>';
      done.forEach(function (b) { html += rowHtml(b, jira); });
    }
    if (!bugs.length) html += '<tr><td colspan="5" class="crm-none">No automation bugs found.</td></tr>';

    html += '</tbody></table></div>';

    var srcLabel = data.source === 'jira-live' ? 'live from Jira'
                 : data.source === 'cache' ? 'cached snapshot' : 'unavailable';
    html += '<div class="crm-foot">Jira data: ' + srcLabel +
            (data.asOf ? ' &middot; as of ' + fmtDate(data.asOf) : '') + '</div>';

    card.innerHTML = html;
    return card;
  }

  // The right-column widget whose title is "Executors".
  function findWidgetByTitle(re) {
    var widgets = document.querySelectorAll('.widget');
    for (var i = 0; i < widgets.length; i++) {
      var t = widgets[i].querySelector('.widget__title, h2, .pane__title');
      if (t && re.test((t.textContent || '').trim())) return widgets[i];
    }
    return null;
  }

  function enhance() {
    loadData().then(function (data) {
      if (!data) return;
      if (document.getElementById(WIDGET_ID)) return;
      if (!document.querySelector('a.table__row[href^="#suites/"]')) return;   // Overview only
      injectStyle();
      var card = buildCard(data);
      // Insert just ABOVE the Executors widget (right column).
      var exec = findWidgetByTitle(/^Executors\b/i);
      if (exec && exec.parentNode) { exec.parentNode.insertBefore(card, exec); return; }
      // Fallbacks: after Categories, else below the grid, else content.
      var cats = findWidgetByTitle(/^Categories\b/i);
      if (cats && cats.parentNode) { cats.parentNode.insertBefore(card, cats.nextSibling); return; }
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
    if (target && window.MutationObserver) new MutationObserver(schedule).observe(target, { childList: true, subtree: true });
    window.addEventListener('hashchange', schedule);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
