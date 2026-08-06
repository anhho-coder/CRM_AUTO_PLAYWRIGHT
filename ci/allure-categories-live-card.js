/*
 * CRM Allure customization (client-side, runs inside the generated report).
 *
 * LIVE replacement for the Overview "Categories - list of failed cases" widget.
 *
 * The native Allure Categories widget reads widgets/categories.json ONCE via the
 * SPA, and that static JSON is served without Cache-Control -> browsers heuristically
 * cache it, so after the report is regenerated (each section job rebuilds the period
 * report) the Overview keeps showing STALE category counts until a hard refresh.
 *
 * This card re-fetches widgets/categories.json with { cache: 'no-store' } every time
 * the Overview is (re)entered, renders the same "category -> failed/broken bar + count"
 * list, links each row to its #categories/<uid> drill-down, and HIDES the native
 * widget so there is exactly one (always-fresh) Categories card.
 *
 * Data source: widgets/categories.json (Allure's own, regenerated every build), so
 * the numbers always match what `allure generate` computed for this report. No build
 * step; pure client-side. Idempotent, dark-mode friendly, re-applies on hash nav.
 */
(function () {
  'use strict';

  var WIDGET_ID = 'crm-categories-live-widget';
  var STYLE_ID = 'crm-categories-live-style';
  var TITLE = 'Categories - list of failed cases';
  // Allure status palette (read on both light and dark themes).
  var COL_FAILED = '#e0503f';   // red  - failed
  var COL_BROKEN = '#e2b33c';   // amber - broken
  var COL_OTHER = '#8aa0ad';   // grey - anything else in a category
  var dataPromise = null;

  function reportRoot() {
    var p = window.location.pathname;
    if (!/\/$/.test(p)) p = p.replace(/[^/]*$/, '');
    return p;
  }

  // Always refetch (no-store): the point of this card is to show the CURRENT
  // categories.json, never the browser's cached copy. dataPromise memoizes within a
  // single Overview view; hashchange clears it (see boot) so re-entry refetches.
  function loadData() {
    if (dataPromise) return dataPromise;
    dataPromise = fetch(reportRoot() + 'widgets/categories.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r || !r.ok) return null;
        var lm = r.headers ? r.headers.get('last-modified') : null;
        return r.json().then(function (j) {
          if (j && lm) { try { j.__lastModified = lm; } catch (e) { /* frozen obj */ } }
          return j;
        });
      })
      .catch(function () { return null; });
    return dataPromise;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '#' + WIDGET_ID + '{padding:14px 16px 16px;}' +
      '#' + WIDGET_ID + ' .crm-cl-head{display:flex;align-items:baseline;gap:9px;margin:0 0 12px;}' +
      '#' + WIDGET_ID + ' .crm-cl-h{font-size:16px;font-weight:700;}' +
      '#' + WIDGET_ID + ' .crm-cl-count{font-size:13px;opacity:.6;font-weight:600;}' +
      '#' + WIDGET_ID + ' .crm-cl-live{margin-left:auto;display:inline-flex;align-items:center;gap:5px;' +
        'font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;' +
        'color:#2f8a4d;border:1px solid rgba(60,162,91,.35);border-radius:11px;padding:2px 8px;}' +
      '#' + WIDGET_ID + ' .crm-cl-live .crm-cl-dot{width:7px;height:7px;border-radius:50%;background:#3ca25b;' +
        'box-shadow:0 0 0 0 rgba(60,162,91,.6);animation:crm-cl-pulse 1.8s infinite;}' +
      '@keyframes crm-cl-pulse{0%{box-shadow:0 0 0 0 rgba(60,162,91,.5);}70%{box-shadow:0 0 0 6px rgba(60,162,91,0);}100%{box-shadow:0 0 0 0 rgba(60,162,91,0);}}' +
      '#' + WIDGET_ID + ' .crm-cl-row{display:grid;grid-template-columns:minmax(120px,1.1fr) minmax(120px,1.6fr);' +
        'align-items:center;gap:12px;padding:7px 0;border-bottom:1px solid rgba(127,127,127,.12);}' +
      '#' + WIDGET_ID + ' .crm-cl-row:last-child{border-bottom:0;}' +
      '#' + WIDGET_ID + ' a.crm-cl-name{font-size:13px;font-weight:600;text-decoration:none;color:inherit;' +
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '#' + WIDGET_ID + ' a.crm-cl-name:hover{text-decoration:underline;}' +
      '#' + WIDGET_ID + ' .crm-cl-track{display:flex;align-items:center;gap:8px;}' +
      '#' + WIDGET_ID + ' .crm-cl-fill{display:flex;height:16px;border-radius:3px;overflow:hidden;min-width:8px;}' +
      '#' + WIDGET_ID + ' .crm-cl-seg{height:100%;}' +
      '#' + WIDGET_ID + ' .crm-cl-n{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;flex:0 0 auto;}' +
      '#' + WIDGET_ID + ' .crm-cl-none{opacity:.55;font-size:13px;padding:6px 0;}' +
      '#' + WIDGET_ID + ' .crm-cl-foot{font-size:11.5px;opacity:.55;margin-top:11px;}';
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

  function segHtml(count, color) {
    if (!count) return '';
    return '<span class="crm-cl-seg" style="flex:' + count + ';background:' + color + ';"></span>';
  }

  function rowHtml(item, maxTotal) {
    var st = item.statistic || {};
    var failed = st.failed || 0, broken = st.broken || 0;
    var total = st.total || (failed + broken + (st.passed || 0) + (st.skipped || 0) + (st.unknown || 0));
    var other = Math.max(0, total - failed - broken);
    var pct = maxTotal > 0 ? Math.max(10, Math.round((total / maxTotal) * 100)) : 100;
    var href = item.uid ? '#categories/' + encodeURIComponent(item.uid) : '#categories';
    return '<div class="crm-cl-row">' +
      '<a class="crm-cl-name" href="' + href + '" title="' + esc(item.name) + '">' + esc(item.name) + '</a>' +
      '<div class="crm-cl-track">' +
        '<span class="crm-cl-fill" style="width:' + pct + '%;">' +
          segHtml(failed, COL_FAILED) + segHtml(broken, COL_BROKEN) + segHtml(other, COL_OTHER) +
        '</span>' +
        '<span class="crm-cl-n">' + total + '</span>' +
      '</div>' +
    '</div>';
  }

  function buildCard(data) {
    var card = document.createElement('div');
    card.id = WIDGET_ID;
    card.className = 'widget island';
    var items = (data && data.items ? data.items.slice() : []);
    // Largest category first (mirrors the native widget ordering intent).
    items.sort(function (a, b) {
      return ((b.statistic && b.statistic.total) || 0) - ((a.statistic && a.statistic.total) || 0);
    });
    var maxTotal = items.reduce(function (m, it) {
      return Math.max(m, (it.statistic && it.statistic.total) || 0);
    }, 0);

    var html = '';
    html += '<div class="crm-cl-head">' +
              '<span class="crm-cl-h">Categories</span>' +
              '<span class="crm-cl-count">' + items.length + ' items total</span>' +
              '<span class="crm-cl-live" title="Re-reads categories.json (no-store) each time you open the Overview">' +
                '<span class="crm-cl-dot"></span>Live</span>' +
            '</div>';
    if (items.length) {
      items.forEach(function (it) { html += rowHtml(it, maxTotal); });
    } else {
      html += '<div class="crm-cl-none">No failed cases in this period. &#127881;</div>';
    }
    html += '<div class="crm-cl-foot">' + esc(TITLE) + ' &middot; live from widgets/categories.json' +
            (data && data.__lastModified ? ' &middot; updated ' + esc(data.__lastModified) : '') + '</div>';
    card.innerHTML = html;
    return card;
  }

  // The native Overview Categories widget = a .widget holding rows that link to
  // #categories/<uid>. Identify it unambiguously by those anchors (NOT by title,
  // which section-labels renames), excluding our own card.
  function findNativeCategoriesWidget() {
    var links = document.querySelectorAll('a.table__row[href^="#categories/"], .widget a[href^="#categories/"]');
    for (var i = 0; i < links.length; i++) {
      var w = links[i].closest ? links[i].closest('.widget') : null;
      if (w && w.id !== WIDGET_ID) return w;
    }
    return null;
  }

  function place(card, native) {
    if (native && native.parentNode) {
      if (native.previousElementSibling !== card) native.parentNode.insertBefore(card, native);
      if (native.style.display !== 'none') native.style.display = 'none';   // hide the stale duplicate
      return true;
    }
    return false;   // native not rendered yet -> retry on next mutation
  }

  function enhance() {
    // Overview only (Suites rows link to #suites/): matches how the sibling cards gate.
    if (!document.querySelector('a.table__row[href^="#suites/"]')) return;
    loadData().then(function (data) {
      if (!data) return;
      var items = (data.items || []);
      if (!items.length) return;                       // no categories -> mirror native (render nothing)
      var native = findNativeCategoriesWidget();
      if (!native) return;                             // wait for the SPA to render it, then take its slot
      injectStyle();
      var existing = document.getElementById(WIDGET_ID);
      var card = existing || buildCard(data);
      if (!existing) place(card, native);
      else { place(card, native); }                    // keep it anchored/hidden even after re-renders
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
    // On navigation back to the Overview, drop the memoized data + the old card so the
    // next enhance() REFETCHES categories.json (no-store) and rebuilds with fresh counts.
    window.addEventListener('hashchange', function () {
      dataPromise = null;
      var old = document.getElementById(WIDGET_ID);
      if (old && old.parentNode) old.parentNode.removeChild(old);
      schedule();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
