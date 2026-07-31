/*
 * CRM Allure customization (client-side, runs inside the generated report).
 *
 * Adds an Overview card: "Fix failed cases" - the failed test cases from this
 * period's run that the team is fixing / has already fixed, as a 7-column table:
 *   # | Section | Test case summary | Error | Issue found date | Issue fix date | Solution
 * Data is resolved at build time by ci/allure-build-fix-failed.js from the
 * committed source ci/crm-fix-failed-cases.json into <report-root>/crm-fix-failed.json;
 * this script only renders it.
 *
 * Placement: full-width card BELOW the widgets grid (a 7-column table does not fit
 * a half-width column). Idempotent, dark-mode friendly, re-applies on hash nav.
 */
(function () {
  'use strict';

  var WIDGET_ID = 'crm-fixfailed-widget';
  var STYLE_ID = 'crm-fixfailed-style';
  var dataPromise = null;

  function reportRoot() {
    var p = window.location.pathname;
    if (!/\/$/.test(p)) p = p.replace(/[^/]*$/, '');
    return p;
  }

  function loadData() {
    if (dataPromise) return dataPromise;
    dataPromise = fetch(reportRoot() + 'crm-fix-failed.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
    return dataPromise;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      // Text is solid (no opacity dimming) so it reads black in light mode and
      // stays readable in dark mode; borders use grey rgba that works in both.
      '#' + WIDGET_ID + '{padding:16px 20px;margin-bottom:20px;}' +
      '#' + WIDGET_ID + ' .crm-ff-h{font-size:18px;font-weight:700;margin:0 0 2px;}' +
      '#' + WIDGET_ID + ' .crm-ff-sub{font-size:14px;margin:0 0 12px;}' +
      '#' + WIDGET_ID + ' .crm-ff-sub b{font-weight:700;}' +
      '#' + WIDGET_ID + ' .crm-ff-scroll{overflow-x:auto;}' +
      '#' + WIDGET_ID + ' table{width:100%;border-collapse:collapse;font-size:14px;min-width:900px;}' +
      '#' + WIDGET_ID + ' th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.03em;' +
        'font-weight:700;padding:5px 12px 7px 0;border-bottom:1px solid rgba(127,127,127,.30);white-space:nowrap;vertical-align:bottom;}' +
      '#' + WIDGET_ID + ' td{padding:9px 12px 9px 0;vertical-align:top;border-bottom:1px solid rgba(127,127,127,.12);}' +
      '#' + WIDGET_ID + ' td.crm-ff-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:600;padding-right:16px;}' +
      '#' + WIDGET_ID + ' .crm-ff-sec{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;font-weight:600;' +
        'background:rgba(47,126,216,.12);color:#2f6fb0;border:1px solid rgba(47,126,216,.28);white-space:nowrap;}' +
      '#' + WIDGET_ID + ' td.crm-ff-sum{min-width:230px;max-width:360px;font-weight:600;}' +
      '#' + WIDGET_ID + ' td.crm-ff-err{min-width:200px;max-width:340px;}' +
      '#' + WIDGET_ID + ' td.crm-ff-err code{font-family:Menlo,Consolas,"Courier New",monospace;font-size:12.5px;' +
        'color:#c0392b;background:rgba(217,83,79,.08);padding:1px 4px;border-radius:4px;white-space:pre-wrap;word-break:break-word;}' +
      '#' + WIDGET_ID + ' td.crm-ff-sol{min-width:200px;max-width:360px;white-space:pre-wrap;}' +
      '#' + WIDGET_ID + ' td.crm-ff-date{white-space:nowrap;font-variant-numeric:tabular-nums;}' +
      '#' + WIDGET_ID + ' .crm-ff-badge{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;font-weight:600;white-space:nowrap;}' +
      '#' + WIDGET_ID + ' .crm-ff-fixed{background:rgba(60,162,91,.14);color:#2f8a4d;border:1px solid rgba(60,162,91,.30);}' +
      '#' + WIDGET_ID + ' .crm-ff-wip{background:rgba(201,154,46,.16);color:#b07d16;border:1px solid rgba(201,154,46,.32);}' +
      '#' + WIDGET_ID + ' tr.crm-ff-wiprow td{background:rgba(201,154,46,.05);}' +
      '#' + WIDGET_ID + ' .crm-ff-todo{opacity:.5;font-style:italic;}' +
      '#' + WIDGET_ID + ' .crm-ff-none{opacity:.55;}' +
      '#' + WIDGET_ID + ' .crm-ff-foot{font-size:12.5px;opacity:.6;margin-top:10px;}';
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
    if (!iso) return '';
    var m = String(iso).match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : String(iso);
  }
  function cell(val, todoLabel) {
    var v = (val == null ? '' : String(val)).trim();
    return v ? esc(v) : '<span class="crm-ff-todo">' + esc(todoLabel || 'to fill') + '</span>';
  }

  function rowHtml(c, i) {
    var fixed = !!(c.fixDate && String(c.fixDate).trim());
    var errHtml = (c.error && String(c.error).trim())
      ? '<code>' + esc(c.error) + '</code>'
      : '<span class="crm-ff-todo">to fill</span>';
    var found = fmtDate(c.foundDate);
    var fix = fixed
      ? '<span class="crm-ff-badge crm-ff-fixed">' + esc(fmtDate(c.fixDate)) + '</span>'
      : '<span class="crm-ff-badge crm-ff-wip">in progress</span>';
    return '<tr' + (fixed ? '' : ' class="crm-ff-wiprow"') + '>' +
      '<td class="crm-ff-num">' + i + '</td>' +
      '<td><span class="crm-ff-sec">' + cell(c.section, '—') + '</span></td>' +
      '<td class="crm-ff-sum">' + cell(c.summary, '—') + '</td>' +
      '<td class="crm-ff-err">' + errHtml + '</td>' +
      '<td class="crm-ff-date">' + (found ? esc(found) : '<span class="crm-ff-todo">—</span>') + '</td>' +
      '<td class="crm-ff-date">' + fix + '</td>' +
      '<td class="crm-ff-sol">' + cell(c.solution, 'to fill') + '</td>' +
    '</tr>';
  }

  function buildCard(data) {
    var card = document.createElement('div');
    card.id = WIDGET_ID;
    card.className = 'widget island';
    var cases = (data.cases || []);
    var fixed = cases.filter(function (c) { return c.fixDate && String(c.fixDate).trim(); });
    var wip = cases.length - fixed.length;

    var html = '';
    html += '<div class="crm-ff-h">Fix failed cases</div>';
    html += '<div class="crm-ff-sub">Failed test case(s) from this period\'s run being fixed &mdash; <b>' +
            cases.length + '</b> total: <b>' + fixed.length + '</b> fixed, <b>' + wip + '</b> in progress.</div>';
    html += '<div class="crm-ff-scroll"><table><thead><tr>' +
              '<th class="crm-ff-num">#</th>' +
              '<th>Section</th>' +
              '<th>Test case summary</th>' +
              '<th>Error</th>' +
              '<th>Issue found date</th>' +
              '<th>Issue fix date</th>' +
              '<th>Solution</th>' +
            '</tr></thead><tbody>';
    if (cases.length) {
      cases.forEach(function (c, i) { html += rowHtml(c, i + 1); });
    } else {
      html += '<tr><td colspan="7" class="crm-ff-none">No failed cases recorded for this period.</td></tr>';
    }
    html += '</tbody></table></div>';
    html += '<div class="crm-ff-foot">Source: ci/crm-fix-failed-cases.json' +
            (data.week ? ' &middot; ' + esc(data.week) : '') +
            (data.generatedAt ? ' &middot; as of ' + esc(fmtDate(data.generatedAt)) : '') + '</div>';

    card.innerHTML = html;
    return card;
  }

  // Allure's Overview uses a masonry grid: .widgets-grid is position:absolute
  // (no flow height) and the real widgets live in two tall .widgets-grid__col
  // columns inside it. A plain sibling after the grid renders at top:0 and
  // overlaps. To sit full-width BELOW everything we append into .app__content
  // (the relative scroll container) and push down by the tallest column's
  // bottom - recomputed each pass so it tracks late-loading widgets.
  function placeBelowGrid(card) {
    var content = document.querySelector('.app__content');
    var cols = document.querySelectorAll('.widgets-grid__col');
    if (!content || !cols.length) return false;
    var maxBottom = 0;
    for (var i = 0; i < cols.length; i++) {
      var bottom = cols[i].offsetTop + cols[i].offsetHeight;   // in .app__content coords (grid offsetTop = 0)
      if (bottom > maxBottom) maxBottom = bottom;
    }
    card.style.marginTop = (maxBottom + 16) + 'px';
    if (card.parentNode !== content) content.appendChild(card);
    return true;
  }

  function enhance() {
    loadData().then(function (data) {
      if (!data) return;
      if (!document.querySelector('a.table__row[href^="#suites/"]')) return;   // Overview only
      injectStyle();
      var card = document.getElementById(WIDGET_ID) || buildCard(data);
      // Primary: full-width, below the masonry columns (recomputes offset each pass).
      if (placeBelowGrid(card)) return;
      // Fallback (non-masonry Allure): just append to the content area / body.
      card.style.marginTop = '';
      var host = document.querySelector('.app__content') || document.getElementById('content') || document.body;
      if (host && card.parentNode !== host) host.appendChild(card);
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
