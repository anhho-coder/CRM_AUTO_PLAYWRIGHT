/*
 * CRM Allure customization (client-side, runs inside the generated report).
 *
 * Adds two columns to the Overview -> "Suites" widget, filling the empty gap
 * between each suite name and its status bar:
 *   - "Total TC"  : total number of test cases in that suite
 *   - "Run Time"  : total execution time of that suite
 *
 * Data sources (fetched once, relative to the report root):
 *   widgets/suites.json -> items[].statistic.total   (per-suite test count)
 *   data/suites.json    -> sum of every leaf test's time.duration (per-suite time)
 * Both are keyed by the same suite `uid` that the widget row link uses
 * (href="#suites/<uid>"), so the join is exact.
 *
 * Pure DOM enhancement, no build step. Idempotent, and re-applies itself when
 * the Overview re-renders (hash navigation) via a MutationObserver.
 */
(function () {
  'use strict';

  var CELL = 'crm-suite-col';   // marker class on every injected data cell
  var HDR = 'crm-suite-hdr';    // marker class on the injected header row
  var STYLE_ID = 'crm-suite-cols-style';
  var dataPromise = null;

  function reportRoot() {
    // Directory of the current page, e.g. "/job/CRM-Allure-Yearly/Allure-Report/"
    var p = window.location.pathname;
    if (!/\/$/.test(p)) p = p.replace(/[^/]*$/, '');
    return p;
  }

  function fmtDuration(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return '—';
    var s = Math.round(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    if (m > 0) return m + 'm ' + String(sec).padStart(2, '0') + 's';
    return sec + 's';
  }

  // A suite node in data/suites.json is a tree; only leaves carry a duration.
  function sumLeafDuration(node) {
    if (node.children && node.children.length) {
      var total = 0;
      for (var i = 0; i < node.children.length; i++) total += sumLeafDuration(node.children[i]);
      return total;
    }
    if (node.time && typeof node.time.duration === 'number') return node.time.duration;
    return 0;
  }

  function loadData() {
    if (dataPromise) return dataPromise;
    var root = reportRoot();
    var getJson = function (url) {
      return fetch(root + url).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    };
    dataPromise = Promise.all([getJson('widgets/suites.json'), getJson('data/suites.json')]).then(function (res) {
      var widgets = res[0], tree = res[1], byUid = {};
      if (widgets && widgets.items) {
        widgets.items.forEach(function (it) {
          byUid[it.uid] = { total: (it.statistic && it.statistic.total) || 0, durationMs: null };
        });
      }
      if (tree && tree.children) {
        tree.children.forEach(function (child) {
          if (!byUid[child.uid]) byUid[child.uid] = { total: 0, durationMs: null };
          byUid[child.uid].durationMs = sumLeafDuration(child);
        });
      }
      return byUid;
    });
    return dataPromise;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.crm-suite-col.crm-col-total,.crm-suite-col.crm-col-time{flex:0 0 auto;text-align:right;white-space:nowrap;}' +
      '.crm-suite-col.crm-col-total{width:76px;}' +
      '.crm-suite-col.crm-col-time{width:104px;}' +
      '.crm-suite-col.crm-col-name,.crm-suite-col.crm-col-bar{flex:1 1 0%;}' +
      '.table__row.crm-suite-hdr{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;opacity:.55;cursor:default;}' +
      '.table__row.crm-suite-hdr .table__col{padding-top:4px;padding-bottom:4px;}';
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  }

  function cell(cls, text) {
    var d = document.createElement('div');
    d.className = 'table__col ' + CELL + ' ' + cls;
    d.textContent = text;
    return d;
  }

  function enhance() {
    loadData().then(function (byUid) {
      var tables = document.querySelectorAll('.widget__table');
      Array.prototype.forEach.call(tables, function (table) {
        var rows = table.querySelectorAll('a.table__row[href^="#suites/"]');
        if (!rows.length) return; // only the Overview "Suites" widget

        // Header row (once per widget table)
        if (!table.querySelector('.' + HDR)) {
          var header = document.createElement('div');
          header.className = 'table__row ' + HDR;
          header.appendChild(cell('crm-col-name', ''));
          header.appendChild(cell('crm-col-total', 'Total TC'));
          header.appendChild(cell('crm-col-time', 'Run Time'));
          header.appendChild(cell('crm-col-bar', ''));
          table.insertBefore(header, table.firstChild);
        }

        // Data rows: insert [Total TC][Run Time] between the name col and the bar col
        Array.prototype.forEach.call(rows, function (row) {
          if (row.querySelector('.' + CELL)) return; // already enhanced
          var uid = (row.getAttribute('href') || '').split('#suites/')[1];
          if (!uid) return;
          var nameCol = row.querySelector('.table__col');
          if (!nameCol) return;
          var info = byUid[uid] || {};
          var totalCell = cell('crm-col-total', info.total != null ? String(info.total) : '—');
          var timeCell = cell('crm-col-time', fmtDuration(info.durationMs));
          // insertAdjacent in reverse so both land right after the name col, in order
          nameCol.insertAdjacentElement('afterend', timeCell);
          nameCol.insertAdjacentElement('afterend', totalCell);
        });
      });
    });
  }

  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () { scheduled = false; enhance(); }, 150);
  }

  function boot() {
    injectStyle();
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
