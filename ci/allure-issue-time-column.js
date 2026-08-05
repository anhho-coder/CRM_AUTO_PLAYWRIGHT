/*
 * CRM Allure customization (client-side, runs inside the generated report).
 *
 * Adds a "date & time the issue occurred" cell to every leaf row of a tree
 * view (Categories, Suites, Behaviors, Packages), filling the empty gap
 * between the test name and the duration. The value is the moment the test
 * finished (time.stop) i.e. when the failure/result was recorded, shown in the
 * viewer's local timezone as "MMM DD, HH:mm:ss".
 *
 * Motivated by the Categories tab, where each row groups a failure but never
 * showed WHEN it happened - important on the weekly/period reports that
 * aggregate a whole week of runs into one Categories list.
 *
 * Data source (fetched once per tab, relative to the report root):
 *   data/<tab>.json  -> tree; every leaf node carries {uid, time:{start,stop}}.
 * The leaf row link is  href="#<tab>/<parentUid>/<uid>/<n>"  (Allure 2.4x),
 * so the join tab + uid -> time is exact.
 *
 * Pure DOM enhancement, no build step. Idempotent, and re-applies itself when
 * the tree re-renders (hash navigation / expand / search) via a MutationObserver.
 */
(function () {
  'use strict';

  var CELL = 'crm-issue-time';          // marker class on every injected cell
  var STYLE_ID = 'crm-issue-time-style';
  var maps = {};                        // tab -> Promise(map uid->time)

  function reportRoot() {
    // Directory of the current page, e.g. "/job/CRM-Allure-Weekly/Allure-Report/"
    var p = window.location.pathname;
    if (!/\/$/.test(p)) p = p.replace(/[^/]*$/, '');
    return p;
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Compact display shown in the cell: "Aug 03, 21:15:36" (viewer local time).
  function fmtStamp(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return '';
    var d = new Date(ms);
    return MONTHS[d.getMonth()] + ' ' + pad(d.getDate()) + ', ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  // Full timestamp for the tooltip: "Aug 03, 2026 21:15:36".
  function fmtFull(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return '';
    var d = new Date(ms);
    return MONTHS[d.getMonth()] + ' ' + pad(d.getDate()) + ', ' + d.getFullYear() + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  // Walk a tree, collecting every node that carries a time -> uid:time.
  function collect(node, out) {
    if (!node) return;
    if (node.uid && node.time && typeof node.time.stop === 'number') {
      out[node.uid] = node.time;
    }
    if (node.children && node.children.length) {
      for (var i = 0; i < node.children.length; i++) collect(node.children[i], out);
    }
  }

  function loadMap(tab) {
    if (maps[tab]) return maps[tab];
    var url = reportRoot() + 'data/' + tab + '.json';
    maps[tab] = fetch(url)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (tree) { var out = {}; if (tree) collect(tree, out); return out; })
      .catch(function () { return {}; });
    return maps[tab];
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.node__title > .' + CELL + '{flex:none;white-space:nowrap;color:var(--color-text-muted);' +
      'font-size:var(--font-size-s);padding:var(--space-1);opacity:.85;}';
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  }

  // "#categories/<parentUid>/<uid>/<n>" -> { tab:"categories", uid:"<uid>" }
  function parseHref(href) {
    if (!href || href.charAt(0) !== '#') return null;
    var parts = href.slice(1).split('/');
    if (parts.length < 3) return null;
    return { tab: parts[0], uid: parts[2] };
  }

  function enhance() {
    var leaves = document.querySelectorAll('a.node__leaf');
    if (!leaves.length) return;

    // Group visible leaves by tab so each tab's map is fetched at most once.
    var byTab = {};
    Array.prototype.forEach.call(leaves, function (leaf) {
      if (leaf.querySelector('.' + CELL)) return;              // already enhanced
      var info = parseHref(leaf.getAttribute('href') || '');
      if (!info || !info.uid) return;
      (byTab[info.tab] = byTab[info.tab] || []).push({ leaf: leaf, uid: info.uid });
    });

    Object.keys(byTab).forEach(function (tab) {
      loadMap(tab).then(function (map) {
        byTab[tab].forEach(function (item) {
          if (item.leaf.querySelector('.' + CELL)) return;
          var title = item.leaf.querySelector('.node__title');
          if (!title) return;
          var time = map[item.uid];
          var ms = time ? time.stop : null;
          var cell = document.createElement('div');
          cell.className = 'node__time ' + CELL;
          cell.textContent = fmtStamp(ms);
          if (ms != null) cell.setAttribute('data-tooltip', 'Issue occurred: ' + fmtFull(ms));
          // Sit just left of the duration cell; fall back to end of the row.
          var dur = title.querySelector('.node__time:not(.' + CELL + ')');
          if (dur) dur.insertAdjacentElement('beforebegin', cell);
          else title.appendChild(cell);
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
