/*
 * CRM Allure customization (client-side, runs inside the generated report).
 *
 * Adds a new Overview card: "Skipped Test Cases by Suite (intentional skips)".
 * For every suite it lists how many test cases are deliberately skipped in code,
 * the blocking bug(s) as clickable Jira links, and the reason. This data does NOT
 * exist in the Allure report itself (skipped tests carry no message / no links),
 * so it is produced from the sources by ci/allure-build-skip-index.js, which
 * writes <report-root>/crm-skips.json. This script just renders that file.
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
      // Outer chrome (background / radius / shadow) is inherited from Allure's own
      // ".widget" class so the card matches light AND dark themes; we only pad the inside.
      '#' + WIDGET_ID + '{padding:16px 20px;margin-bottom:20px;}' +
      '#' + WIDGET_ID + ' .crm-skips-h{font-size:16px;font-weight:700;margin:0 0 2px;}' +
      '#' + WIDGET_ID + ' .crm-skips-sub{font-size:12px;opacity:.6;margin:0 0 12px;}' +
      '#' + WIDGET_ID + ' .crm-skips-sub b{opacity:.9;}' +
      '#' + WIDGET_ID + ' table{width:100%;border-collapse:collapse;font-size:13px;}' +
      '#' + WIDGET_ID + ' th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.03em;' +
        'opacity:.55;font-weight:700;padding:4px 10px 6px 0;border-bottom:1px solid rgba(127,127,127,.18);}' +
      '#' + WIDGET_ID + ' th.num,#' + WIDGET_ID + ' td.num{text-align:right;white-space:nowrap;width:64px;}' +
      '#' + WIDGET_ID + ' td{padding:8px 10px 8px 0;vertical-align:top;border-bottom:1px solid rgba(127,127,127,.10);}' +
      '#' + WIDGET_ID + ' tr:last-child td{border-bottom:none;}' +
      '#' + WIDGET_ID + ' .crm-suite{font-weight:600;cursor:pointer;user-select:none;}' +
      '#' + WIDGET_ID + ' .crm-suite .caret{display:inline-block;width:12px;opacity:.5;font-size:10px;transition:transform .15s;}' +
      '#' + WIDGET_ID + ' tr.open .crm-suite .caret{transform:rotate(90deg);}' +
      '#' + WIDGET_ID + ' .crm-count{font-weight:700;}' +
      '#' + WIDGET_ID + ' .crm-bug{display:inline-block;margin:0 4px 3px 0;padding:1px 7px;border-radius:10px;' +
        'font-size:12px;font-weight:600;text-decoration:none;background:rgba(217,83,79,.14);color:#c9302c;border:1px solid rgba(217,83,79,.30);white-space:nowrap;}' +
      '#' + WIDGET_ID + ' .crm-bug:hover{background:rgba(217,83,79,.24);}' +
      '#' + WIDGET_ID + ' .crm-none{opacity:.4;}' +
      '#' + WIDGET_ID + ' .crm-reason{opacity:.85;}' +
      '#' + WIDGET_ID + ' .crm-detail{display:none;}' +
      '#' + WIDGET_ID + ' tr.open + tr.crm-detail{display:table-row;}' +
      '#' + WIDGET_ID + ' .crm-detail ol{margin:2px 0 6px;padding-left:22px;}' +
      '#' + WIDGET_ID + ' .crm-detail li{padding:3px 0;opacity:.9;}' +
      '#' + WIDGET_ID + ' .crm-detail .crm-tname{font-weight:500;}' +
      '#' + WIDGET_ID + ' .crm-detail .crm-treason{opacity:.6;font-size:12px;}';
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  }

  function bugLinks(jiraBase, bugs) {
    if (!bugs || !bugs.length) return '<span class="crm-none">—</span>';
    return bugs.map(function (b) {
      return '<a class="crm-bug" href="' + jiraBase + encodeURIComponent(b) + '" target="_blank" rel="noopener">' + esc(b) + '</a>';
    }).join('');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function buildCard(data) {
    var card = document.createElement('div');
    card.id = WIDGET_ID;
    card.className = 'widget';   // reuse Allure's themed card chrome (bg/radius/shadow)
    var jira = data.jiraBase || 'http://jira.nakivo.com/browse/';

    var html = '';
    html += '<div class="crm-skips-h">Skipped Test Cases by Suite</div>';
    html += '<div class="crm-skips-sub">Deliberate skips in code &mdash; <b>' + data.totalSkipped +
            '</b> test case(s) across <b>' + data.suites.length + '</b> suite(s), blocked by <b>' +
            data.totalBugs + '</b> bug(s). Click a suite to expand.</div>';
    html += '<table><thead><tr>' +
              '<th>Suite</th><th class="num">Skipped</th><th>Bugs</th><th>Reason</th>' +
            '</tr></thead><tbody>';

    data.suites.forEach(function (s, idx) {
      var reason = (s.reasons && s.reasons.length)
        ? s.reasons.map(esc).join(' &middot; ')
        : '<span class="crm-none">—</span>';
      html += '<tr data-suite="' + idx + '">' +
                '<td class="crm-suite"><span class="caret">▶</span> ' + esc(s.suite) + '</td>' +
                '<td class="num"><span class="crm-count">' + s.count + '</span></td>' +
                '<td>' + bugLinks(jira, s.bugs) + '</td>' +
                '<td class="crm-reason">' + reason + '</td>' +
              '</tr>';
      // Detail row: every skipped test in the suite.
      var items = (s.tests || []).map(function (t) {
        var tb = (t.bugs && t.bugs.length) ? ' ' + bugLinks(jira, t.bugs) : '';
        var tr = t.reason ? ' <span class="crm-treason">&mdash; ' + esc(t.reason) + '</span>' : '';
        return '<li><span class="crm-tname">' + esc(t.name) + '</span>' + tb + tr + '</li>';
      }).join('');
      html += '<tr class="crm-detail"><td colspan="4"><ol>' + items + '</ol></td></tr>';
    });

    html += '</tbody></table>';
    card.innerHTML = html;

    // Expand/collapse per suite.
    Array.prototype.forEach.call(card.querySelectorAll('tr[data-suite] .crm-suite'), function (cell) {
      cell.addEventListener('click', function () {
        cell.parentNode.classList.toggle('open');
      });
    });
    return card;
  }

  function insertionAnchor() {
    // Prefer to sit right after the Overview "Suites" widget.
    var suiteRow = document.querySelector('a.table__row[href^="#suites/"]');
    if (suiteRow) {
      var w = suiteRow.closest ? suiteRow.closest('.widget') : null;
      if (w) return w;
    }
    // Fallbacks: after any widget, else the content area.
    var anyWidget = document.querySelector('.widget');
    return anyWidget || document.getElementById('content') || document.body;
  }

  function enhance() {
    loadData().then(function (data) {
      if (!data || !data.suites || !data.suites.length) return;
      if (document.getElementById(WIDGET_ID)) return;      // already present
      // Only render on the Overview (where the Suites widget lives).
      if (!document.querySelector('a.table__row[href^="#suites/"]')) return;
      injectStyle();
      var card = buildCard(data);
      var anchor = insertionAnchor();
      if (anchor && anchor.parentNode && anchor.classList && anchor.classList.contains('widget')) {
        anchor.parentNode.insertBefore(card, anchor.nextSibling);
      } else if (anchor) {
        anchor.insertBefore(card, anchor.firstChild);
      }
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
