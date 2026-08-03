/*
 * CRM Allure customization (client-side, runs inside the generated report).
 *
 * Adds a REAL left-sidebar tab "Failed cases trend" (directly under Overview) to the
 * WEEKLY report. Allure's router ignores unknown hashes (its loadUrl() returns false
 * and touches nothing), so #failed-cases-trend is safe: we render our own full-page
 * panel as a sibling of #content and toggle between the two. Allure navigates real
 * tabs via history.pushState (no hashchange), so we also intercept sidebar clicks.
 *
 * The panel shows four things (data from crm-failed-trend.json + crm-fix-failed.json,
 * both written at build time):
 *   0. Trend — a within-week burndown of the failed cases that existed at the START
 *      of the week: each day, how many of that initial set are Fixed / Still failing /
 *      Not re-run (stacked area, total height = the initial count).
 *   1. Categories — the failed cases at the BEGINNING of the week (count + breakdown +
 *      list, each with its current Fixed / Still-failing / Not-re-run state).
 *   2. Categories — the failed cases CURRENTLY (count + breakdown + list).
 *   3. Fix failed cases — the same table as the Overview "Fix failed cases" card.
 *
 * Idempotent; re-injects the nav item / panel via MutationObserver; theme-safe.
 */
(function () {
  'use strict';

  var ITEM_ID = 'crm-fct-item';
  var LINK_ID = 'crm-fct-link';
  var PANEL_ID = 'crm-fct-panel';
  var STYLE_ID = 'crm-fct-style';
  var HASH = '#failed-cases-trend';
  var ROUTE = 'failed-cases-trend';
  var ACTIVE_CLS = 'side-nav__link_active';
  var TITLE = 'Failed cases trend';

  var dataPromise = null;
  var active = false;

  // ---------- data ----------
  function reportRoot() {
    var p = window.location.pathname;
    if (!/\/$/.test(p)) p = p.replace(/[^/]*$/, '');
    return p;
  }
  function getJson(url) {
    return fetch(reportRoot() + url, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  function loadData() {
    if (dataPromise) return dataPromise;
    dataPromise = Promise.all([getJson('crm-failed-trend.json'), getJson('crm-fix-failed.json'), getJson('crm-fix-branches.json')])
      .then(function (res) { return { trend: res[0], ff: res[1], branches: (res[2] && res[2].branches) || [] }; });
    return dataPromise;
  }

  // ---------- helpers ----------
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDay(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? (MON[+m[2] - 1] + ' ' + (+m[3])) : String(iso || '');
  }
  function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }

  // ---------- style ----------
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var W = '#' + PANEL_ID;
    var css =
      W + '{display:none;flex:1 1 auto;min-width:0;overflow:auto;padding:24px 30px 60px;box-sizing:border-box;}' +
      W + '.is-on{display:block;}' +
      W + ' .crm-fct-title{font-size:24px;font-weight:800;margin:0 0 2px;}' +
      W + ' .crm-fct-lead{font-size:14px;opacity:.75;margin:0 0 14px;}' +
      // sub-tab bar (Week overview | per verification branch)
      W + ' .crm-fct-subtabs{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 18px;border-bottom:1px solid rgba(127,127,127,.2);padding-bottom:12px;}' +
      W + ' .crm-fct-subtab{font:inherit;font-size:13px;font-weight:600;cursor:pointer;color:inherit;background:transparent;' +
        'border:1px solid rgba(128,128,128,.35);border-radius:999px;padding:6px 14px;opacity:.82;display:inline-flex;align-items:center;gap:7px;}' +
      W + ' .crm-fct-subtab:hover{opacity:1;border-color:#4b6bfb;}' +
      W + ' .crm-fct-subtab.is-active{background:#4b6bfb;color:#fff;border-color:#4b6bfb;opacity:1;}' +
      W + ' .crm-fct-subtab-n{font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums;background:rgba(127,127,127,.18);' +
        'border-radius:999px;padding:0 7px;}' +
      W + ' .crm-fct-subtab.is-active .crm-fct-subtab-n{background:rgba(255,255,255,.25);}' +
      W + ' .crm-fct-bh a{color:#4b6bfb;text-decoration:none;font-weight:600;font-size:13px;}' +
      W + ' .crm-fct-bh a:hover{text-decoration:underline;}' +
      W + ' .b-async{background:rgba(201,154,46,.16);color:#a9791f;border:1px solid rgba(201,154,46,.34);}' +
      W + ' .widget.island{padding:18px 22px;margin-bottom:20px;}' +
      W + ' .crm-fct-h{font-size:18px;font-weight:700;margin:0 0 2px;}' +
      W + ' .crm-fct-h .n{opacity:.55;font-weight:600;font-size:14px;margin-left:6px;}' +
      W + ' .crm-fct-sub{font-size:13.5px;opacity:.8;margin:0 0 14px;}' +
      // KPI strip
      W + ' .crm-fct-kpis{display:flex;flex-wrap:wrap;gap:12px;margin:2px 0 16px;}' +
      W + ' .crm-fct-kpi{flex:1 1 130px;min-width:120px;border:1px solid rgba(127,127,127,.22);' +
        'border-radius:10px;padding:10px 14px;}' +
      W + ' .crm-fct-kpi .v{font-size:26px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1;}' +
      W + ' .crm-fct-kpi .l{font-size:12px;opacity:.7;margin-top:2px;}' +
      W + ' .crm-fct-kpi.k-fixed .v{color:#2f8a4d;}' +
      W + ' .crm-fct-kpi.k-remain .v{color:#c9302c;}' +
      // chart
      W + ' .crm-fct-chartwrap{position:relative;width:100%;overflow-x:auto;}' +
      W + ' .crm-fct-chart{width:100%;min-width:420px;height:auto;display:block;}' +
      W + ' .crm-fct-tt{position:absolute;pointer-events:none;z-index:5;background:rgba(30,32,38,.96);' +
        'color:#fff;font-size:12px;line-height:1.5;padding:7px 10px;border-radius:7px;white-space:nowrap;' +
        'box-shadow:0 4px 14px rgba(0,0,0,.28);transform:translate(-50%,-108%);opacity:0;transition:opacity .08s;}' +
      W + ' .crm-fct-tt b{font-weight:700;}' +
      W + ' .crm-fct-tt .sw{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;vertical-align:-1px;}' +
      W + ' .crm-fct-legend{display:flex;flex-wrap:wrap;gap:16px;font-size:13px;margin-top:10px;}' +
      W + ' .crm-fct-legend span{display:inline-flex;align-items:center;gap:6px;}' +
      W + ' .crm-fct-legend i{width:12px;height:12px;border-radius:3px;display:inline-block;}' +
      W + ' .crm-fct-empty{opacity:.6;font-size:14px;padding:20px 0;}' +
      // category bars (mirror the Allure "Categories" widget: name + red count bar)
      W + ' .crm-fct-bars{margin:2px 0 14px;}' +
      W + ' .crm-fct-brow{display:flex;align-items:center;gap:12px;margin:7px 0;}' +
      W + ' .crm-fct-bname{flex:0 0 40%;max-width:40%;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      W + ' .crm-fct-btrack{flex:1;min-width:60px;background:rgba(127,127,127,.14);border-radius:5px;height:24px;overflow:hidden;}' +
      W + ' .crm-fct-bbar{height:100%;min-width:28px;background:#e5533d;border-radius:5px;display:flex;align-items:center;' +
        'justify-content:flex-end;padding-right:9px;box-sizing:border-box;}' +
      W + ' .crm-fct-bnum{color:#fff;font-weight:700;font-size:12.5px;font-variant-numeric:tabular-nums;}' +
      // tables
      W + ' .crm-fct-toggle{cursor:pointer;user-select:none;font-size:13.5px;font-weight:600;' +
        'display:inline-flex;align-items:center;gap:6px;opacity:.9;}' +
      W + ' .crm-fct-toggle .caret{display:inline-block;transition:transform .12s;font-size:11px;opacity:.6;}' +
      W + ' .crm-fct-toggle.open .caret{transform:rotate(90deg);}' +
      W + ' .crm-fct-listwrap{display:none;margin-top:12px;overflow-x:auto;}' +
      W + ' .crm-fct-listwrap.open{display:block;}' +
      W + ' table.crm-fct-tbl{width:100%;border-collapse:collapse;font-size:13.5px;min-width:820px;}' +
      W + ' .crm-fct-tbl th{text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.03em;' +
        'font-weight:700;padding:5px 12px 7px 0;border-bottom:1px solid rgba(127,127,127,.30);white-space:nowrap;}' +
      W + ' .crm-fct-tbl td{padding:8px 12px 8px 0;vertical-align:top;border-bottom:1px solid rgba(127,127,127,.12);}' +
      W + ' .crm-fct-tbl td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:600;padding-right:14px;}' +
      W + ' .crm-fct-sec{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;font-weight:600;' +
        'background:rgba(47,126,216,.12);color:#2f6fb0;border:1px solid rgba(47,126,216,.28);white-space:nowrap;}' +
      W + ' .crm-fct-tbl td.sum{min-width:250px;max-width:420px;font-weight:600;}' +
      W + ' .crm-fct-tbl td.cat{white-space:nowrap;font-size:12.5px;opacity:.9;}' +
      W + ' .crm-fct-tbl td.err code{font-family:Menlo,Consolas,"Courier New",monospace;font-size:12px;color:#c0392b;' +
        'background:rgba(217,83,79,.08);padding:1px 4px;border-radius:4px;white-space:pre-wrap;word-break:break-word;}' +
      W + ' .crm-fct-tbl td.err{min-width:220px;max-width:420px;}' +
      W + ' .crm-badge{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;font-weight:600;white-space:nowrap;}' +
      W + ' .b-fixed{background:rgba(60,162,91,.14);color:#2f8a4d;border:1px solid rgba(60,162,91,.30);}' +
      W + ' .b-fail{background:rgba(217,83,79,.14);color:#c9302c;border:1px solid rgba(217,83,79,.30);}' +
      W + ' .b-nr{background:rgba(154,160,166,.16);color:#6b7075;border:1px solid rgba(154,160,166,.36);}' +
      W + ' .b-new{background:rgba(201,154,46,.16);color:#a9791f;border:1px solid rgba(201,154,46,.34);margin-left:6px;}' +
      W + ' .crm-fct-foot{font-size:12.5px;opacity:.6;margin-top:10px;}' +
      // reuse the Fix-failed table look
      W + ' .crm-ff-sec{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;font-weight:600;' +
        'background:rgba(47,126,216,.12);color:#2f6fb0;border:1px solid rgba(47,126,216,.28);white-space:nowrap;}' +
      W + ' .crm-ff-badge{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;font-weight:600;white-space:nowrap;}' +
      W + ' .crm-ff-fixed{background:rgba(60,162,91,.14);color:#2f8a4d;border:1px solid rgba(60,162,91,.30);}' +
      W + ' .crm-ff-wip{background:rgba(201,154,46,.16);color:#b07d16;border:1px solid rgba(201,154,46,.32);}' +
      W + ' tr.crm-ff-wiprow td{background:rgba(201,154,46,.05);}' +
      W + ' .crm-ff-todo{opacity:.5;font-style:italic;}';
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  }

  // ---------- burndown chart ----------
  var COL = { fixed: '#3ca25b', fail: '#d9534f', nr: '#9aa0a6' };
  // Stacked-area burndown, reused by Week overview, the aggregate card and each branch.
  // opts.labels = {fixed, mid, top}; opts.totalLabel; opts.titleOf(p); opts.emptyMsg.
  // Each hover slot carries its own tooltip (data-tt) so multiple charts coexist.
  function buildChart(series, total, opts) {
    opts = opts || {};
    var lbl = opts.labels || { fixed: 'Fixed (confirmed passing)', mid: 'Still failing', top: 'Not re-run yet' };
    var totalLabel = opts.totalLabel || 'Initial total';
    var titleOf = opts.titleOf || function (p) { return fmtDay(p.date); };
    if (!series || !series.length || !total) {
      return '<div class="crm-fct-empty">' + esc(opts.emptyMsg || 'No data to chart yet.') + '</div>';
    }
    var W = 820, H = 300, padL = 40, padR = 14, padT = 14, padB = 44;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var n = series.length;
    var xs = [];
    if (n === 1) xs = [padL + plotW / 2];
    else for (var i = 0; i < n; i++) xs.push(padL + plotW * i / (n - 1));
    function y(v) { return padT + plotH * (1 - v / total); }

    var zeros = series.map(function () { return 0; });
    var c1 = series.map(function (p) { return p.fixed; });
    var c2 = series.map(function (p) { return p.fixed + p.stillFailing; });
    var c3 = series.map(function (p) { return p.fixed + p.stillFailing + p.notRerun; });

    function band(low, high) {
      if (n === 1) {
        var xL = padL, xR = padL + plotW;
        return 'M' + xL + ',' + y(high[0]) + ' L' + xR + ',' + y(high[0]) +
               ' L' + xR + ',' + y(low[0]) + ' L' + xL + ',' + y(low[0]) + ' Z';
      }
      var d = 'M' + xs[0] + ',' + y(high[0]);
      for (var i = 1; i < n; i++) d += ' L' + xs[i] + ',' + y(high[i]);
      for (var j = n - 1; j >= 0; j--) d += ' L' + xs[j] + ',' + y(low[j]);
      return d + ' Z';
    }

    var svg = '<svg class="crm-fct-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img">';
    // horizontal gridlines + y labels (0, mid, total)
    var ticks = total <= 4 ? [0, total] : [0, Math.round(total / 2), total];
    ticks.forEach(function (t) {
      var yy = y(t);
      svg += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy +
             '" stroke="rgba(127,127,127,.18)" stroke-width="1"/>';
      svg += '<text x="' + (padL - 6) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="11" ' +
             'fill="currentColor" opacity=".55">' + t + '</text>';
    });
    // stacked areas
    svg += '<path d="' + band(zeros, c1) + '" fill="' + COL.fixed + '" fill-opacity=".55"/>';
    svg += '<path d="' + band(c1, c2) + '" fill="' + COL.fail + '" fill-opacity=".55"/>';
    svg += '<path d="' + band(c2, c3) + '" fill="' + COL.nr + '" fill-opacity=".45"/>';
    // dashed reference at the initial total
    svg += '<line x1="' + padL + '" y1="' + y(total) + '" x2="' + (W - padR) + '" y2="' + y(total) +
           '" stroke="rgba(127,127,127,.6)" stroke-width="1" stroke-dasharray="4 4"/>';
    // markers at the top of the "fixed" band (the fixed/remaining boundary) + x labels + hover slots
    var slotW = n === 1 ? plotW : plotW / (n - 1);
    for (var k = 0; k < n; k++) {
      var p = series[k];
      svg += '<circle cx="' + xs[k] + '" cy="' + y(p.fixed) + '" r="3.5" fill="#fff" stroke="' + COL.fixed + '" stroke-width="2"/>';
      // keep the first/last labels from overflowing the viewBox
      var anc = (n > 1 && k === 0) ? 'start' : (n > 1 && k === n - 1) ? 'end' : 'middle';
      svg += '<text x="' + xs[k] + '" y="' + (H - 24) + '" text-anchor="' + anc + '" font-size="11" fill="currentColor" opacity=".7">' +
             esc(titleOf(p)) + '</text>';
      svg += '<text x="' + xs[k] + '" y="' + (H - 10) + '" text-anchor="' + anc + '" font-size="10.5" fill="' + COL.fail + '">' +
             p.remaining + ' left</text>';
      // per-slot tooltip payload (so several charts on one page each show their own data)
      var ttHtml = '<b>' + esc(titleOf(p)) + '</b><br>' +
        '<span class="sw" style="background:' + COL.fixed + '"></span>' + esc(lbl.fixed) + ': <b>' + p.fixed + '</b><br>' +
        '<span class="sw" style="background:' + COL.fail + '"></span>' + esc(lbl.mid) + ': <b>' + p.stillFailing + '</b><br>' +
        '<span class="sw" style="background:' + COL.nr + '"></span>' + esc(lbl.top) + ': <b>' + p.notRerun + '</b><br>' +
        'Remaining: <b>' + p.remaining + '</b> / ' + total +
        (p.currentTotalFailed != null ? '<br>Failing now (all): <b>' + p.currentTotalFailed + '</b>' : '');
      var rx = xs[k] - slotW / 2;
      svg += '<rect class="crm-fct-slot" x="' + rx + '" y="' + padT + '" width="' + slotW + '" height="' + plotH +
             '" fill="transparent" data-tt="' + encodeURIComponent(ttHtml) + '"/>';
    }
    svg += '</svg>';

    var legend = '<div class="crm-fct-legend">' +
      '<span><i style="background:' + COL.fixed + '"></i>' + esc(lbl.fixed) + '</span>' +
      '<span><i style="background:' + COL.fail + '"></i>' + esc(lbl.mid) + '</span>' +
      '<span><i style="background:' + COL.nr + '"></i>' + esc(lbl.top) + '</span>' +
      '<span><i style="border:1px dashed rgba(127,127,127,.7);background:none"></i>' + esc(totalLabel) + '</span>' +
      '</div>';

    return '<div class="crm-fct-chartwrap"><div class="crm-fct-tt"></div>' + svg + '</div>' + legend;
  }

  // ---------- category bars + case list ----------
  // Group a list of cases by their category -> [{name,count}] (desc), like the build.
  function breakdown(cases) {
    var by = {};
    (cases || []).forEach(function (c) { var k = c.category || 'Uncategorized'; by[k] = (by[k] || 0) + 1; });
    return Object.keys(by).sort(function (a, b) { return by[b] - by[a] || a.localeCompare(b); })
      .map(function (k) { return { name: k, count: by[k] }; });
  }
  // Render a category breakdown as the Allure "Categories" widget does: name + a red
  // count bar (width proportional to the largest count).
  function catBars(cats) {
    if (!cats || !cats.length) return '<div class="crm-fct-empty">No categories.</div>';
    var max = cats.reduce(function (m, c) { return Math.max(m, c.count); }, 0) || 1;
    return '<div class="crm-fct-bars">' + cats.map(function (c) {
      var w = Math.max(8, Math.round((c.count / max) * 100));
      return '<div class="crm-fct-brow">' +
        '<div class="crm-fct-bname" title="' + esc(c.name) + '">' + esc(c.name) + '</div>' +
        '<div class="crm-fct-btrack"><div class="crm-fct-bbar" style="width:' + w + '%">' +
        '<span class="crm-fct-bnum">' + c.count + '</span></div></div>' +
      '</div>';
    }).join('') + '</div>';
  }
  function errCell(e) {
    return (e && String(e).trim()) ? '<code>' + esc(e) + '</code>' : '<span class="crm-ff-todo">—</span>';
  }
  function nowBadge(cs) {
    if (cs === 'passed') return '<span class="crm-badge b-fixed">Fixed</span>';
    if (cs === 'failed' || cs === 'broken') return '<span class="crm-badge b-fail">Still failing</span>';
    return '<span class="crm-badge b-nr">Not re-run</span>';
  }

  // Collapsible case list with a Now (current-state) column. Used by both category
  // boxes: the frozen start-of-week set and the still-failing remainder.
  function caseList(cases, statusByKey, listId, toggleLabel, emptyMsg) {
    cases = cases || [];
    var rows = cases.map(function (c, i) {
      var cs = statusByKey[c.key] || 'absent';
      return '<tr>' +
        '<td class="num">' + (i + 1) + '</td>' +
        '<td><span class="crm-fct-sec">' + esc(c.section) + '</span></td>' +
        '<td class="sum">' + esc(c.name) + '</td>' +
        '<td class="cat">' + esc(c.category) + '</td>' +
        '<td>' + nowBadge(cs) + '</td>' +
        '<td class="err">' + errCell(c.error) + '</td>' +
      '</tr>';
    }).join('');
    if (!cases.length) rows = '<tr><td colspan="6" class="crm-fct-empty">' + esc(emptyMsg || 'None.') + '</td></tr>';
    return '<div class="crm-fct-toggle" data-target="' + listId + '"><span class="caret">▶</span>' + esc(toggleLabel) + '</div>' +
           '<div class="crm-fct-listwrap" id="' + listId + '"><table class="crm-fct-tbl"><thead><tr>' +
             '<th class="num">#</th><th>Section</th><th>Test case</th><th>Category</th><th>Now</th><th>Error</th>' +
           '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  // Section 3: the same "Fix failed cases" table as the Overview card.
  function fixFailedTable(ff) {
    var cases = (ff && ff.cases) || [];
    var fixed = cases.filter(function (c) { return c.fixDate && String(c.fixDate).trim(); });
    var head = '<div class="crm-fct-h">Fix failed cases</div>' +
      '<div class="crm-fct-sub">Failed test case(s) from this period\'s run being fixed — <b>' + cases.length +
      '</b> total: <b>' + fixed.length + '</b> fixed, <b>' + (cases.length - fixed.length) + '</b> in progress.</div>';
    var rows = cases.map(function (c, i) {
      var isFixed = !!(c.fixDate && String(c.fixDate).trim());
      var fix = isFixed
        ? '<span class="crm-ff-badge crm-ff-fixed">' + esc(fmtDay(c.fixDate) || c.fixDate) + '</span>'
        : '<span class="crm-ff-badge crm-ff-wip">in progress</span>';
      return '<tr' + (isFixed ? '' : ' class="crm-ff-wiprow"') + '>' +
        '<td class="num">' + (i + 1) + '</td>' +
        '<td><span class="crm-ff-sec">' + (c.section ? esc(c.section) : '—') + '</span></td>' +
        '<td class="sum">' + (c.summary ? esc(c.summary) : '—') + '</td>' +
        '<td class="err">' + errCell(c.error) + '</td>' +
        '<td>' + (c.foundDate ? esc(fmtDay(c.foundDate) || c.foundDate) : '<span class="crm-ff-todo">—</span>') + '</td>' +
        '<td>' + fix + '</td>' +
        '<td class="sum">' + (c.solution ? esc(c.solution) : '<span class="crm-ff-todo">to fill</span>') + '</td>' +
      '</tr>';
    }).join('');
    if (!cases.length) rows = '<tr><td colspan="7" class="crm-fct-empty">No fix records for this period.</td></tr>';
    return head + '<div class="crm-fct-listwrap open"><table class="crm-fct-tbl"><thead><tr>' +
      '<th class="num">#</th><th>Section</th><th>Test case summary</th><th>Error</th>' +
      '<th>Issue found date</th><th>Issue fix date</th><th>Solution</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  // ---------- panel render ----------
  function renderPanel(panel, bundle) {
    var t = bundle.trend;
    injectStyle();
    if (!t || t.unsupported) {
      panel.innerHTML = '<div class="crm-fct-title">' + TITLE + '</div>' +
        '<div class="crm-fct-empty">This tab is only available on the weekly report.</div>';
      return;
    }
    try {
    var branches = bundle.branches || [];
    var html = '';
    html += '<div class="crm-fct-title">' + TITLE + '</div>';
    html += '<div class="crm-fct-lead">Tracks the failed test cases that existed at the <b>start of the week</b> and how they are fixed across the week &mdash; week ' +
            esc(t.week || '') + '.</div>';

    // Sub-tab bar: Week overview + one per verification branch (a CRM_Rerun_* job that
    // re-runs specific failed cases on its own fix branch). Shown only when present.
    if (branches.length) {
      html += '<div class="crm-fct-subtabs" role="tablist">';
      html += '<button type="button" class="crm-fct-subtab is-active" data-view="overview">Week overview</button>';
      branches.forEach(function (b, i) {
        html += '<button type="button" class="crm-fct-subtab" data-view="b' + i + '" title="' + esc(b.jobName) + '">' +
                esc(b.jobName) + '<span class="crm-fct-subtab-n">' + b.passed + '/' + b.total + '</span></button>';
      });
      html += '</div>';
    }

    // Views (only one visible at a time; switched client-side by the sub-tab bar).
    html += '<div class="crm-fct-views">';
    html += '<div class="crm-fct-view" data-view="overview">' + overviewHtml(t, bundle.ff, branches) + '</div>';
    branches.forEach(function (b, i) {
      html += '<div class="crm-fct-view" data-view="b' + i + '" style="display:none">' + branchHtml(b) + '</div>';
    });
    html += '</div>';

    html += '<div class="crm-fct-foot">Source: crm-failed-trend.json + crm-fix-failed.json' +
            (branches.length ? ' + crm-fix-branches.json (CRM_Rerun_* jobs)' : '') +
            (t.generatedAt ? ' &middot; as of ' + esc(fmtDay(t.generatedAt)) : '') + '.</div>';

    panel.innerHTML = html;
    wire(panel, t);
    panel.setAttribute('data-painted', '1');
    } catch (e) { console.error('FCT renderPanel error:', (e && e.stack) || e); }
  }

  // ---------- aggregate across verification branches (Week overview roll-up) ----------
  var BR_LABELS = { fixed: 'Fixed / confirmed', mid: 'Still failing', top: 'Async pending' };
  function aggregateTotals(branches) {
    var a = { count: branches.length, total: 0, passed: 0, asyncConfirmed: 0, asyncPending: 0, failed: 0 };
    branches.forEach(function (b) {
      a.total += b.total || 0; a.passed += b.passed || 0; a.asyncConfirmed += b.asyncConfirmed || 0;
      a.asyncPending += b.asyncPending || 0; a.failed += b.failed || 0;
    });
    return a;
  }
  // Combined burndown: for every date any branch ran, sum each branch's latest point up to
  // that date (carry-forward), so the stack reflects the whole week's verification state.
  function aggregateSeries(branches) {
    var dset = {};
    branches.forEach(function (b) { (b.series || []).forEach(function (p) { dset[p.date] = 1; }); });
    return Object.keys(dset).sort().map(function (d) {
      var acc = { date: d, fixed: 0, stillFailing: 0, notRerun: 0, total: 0, remaining: 0 };
      branches.forEach(function (b) {
        var pt = null;
        (b.series || []).forEach(function (p) { if (p.date <= d) pt = p; });   // series is chronological
        if (pt) { acc.fixed += pt.fixed; acc.stillFailing += pt.stillFailing; acc.notRerun += pt.notRerun; acc.total += pt.total; acc.remaining += pt.remaining; }
      });
      return acc;
    });
  }
  function aggregateCard(branches) {
    if (!branches.length) return '';
    var agg = aggregateTotals(branches);
    var html = '<div class="widget island">';
    html += '<div class="crm-fct-h">Verification branches &mdash; this week<span class="n">' + agg.count + ' branch(es), ' + agg.total + ' target spec(s)</span></div>';
    html += '<div class="crm-fct-sub">Aggregate of every <b>CRM_Rerun_*</b> fix branch run this week (click a branch tab above for its detail).</div>';
    html += '<div class="crm-fct-kpis">' +
      '<div class="crm-fct-kpi k-fixed"><div class="v">' + agg.passed + '</div><div class="l">Passed / fixed</div></div>' +
      '<div class="crm-fct-kpi k-fixed"><div class="v">' + agg.asyncConfirmed + '</div><div class="l">Async &check; confirmed</div></div>' +
      '<div class="crm-fct-kpi"><div class="v">' + agg.asyncPending + '</div><div class="l">Async pending</div></div>' +
      '<div class="crm-fct-kpi k-remain"><div class="v">' + agg.failed + '</div><div class="l">Still failing</div></div>' +
      '<div class="crm-fct-kpi"><div class="v">' + agg.total + '</div><div class="l">Target specs</div></div>' +
      '</div>';
    html += buildChart(aggregateSeries(branches), agg.total || 1,
      { labels: BR_LABELS, totalLabel: 'Total target', titleOf: function (p) { return fmtDay(p.date); }, emptyMsg: 'No verification branches ran this week.' });
    // per-branch summary
    html += '<div class="crm-fct-listwrap open" style="margin-top:14px"><table class="crm-fct-tbl"><thead><tr>' +
      '<th class="num">#</th><th>Branch (job)</th><th>Latest run</th><th>Passed</th><th>Async &check;</th><th>Pending</th><th>Failing</th><th>Build</th>' +
      '</tr></thead><tbody>';
    branches.forEach(function (b, i) {
      html += '<tr>' +
        '<td class="num">' + (i + 1) + '</td>' +
        '<td class="sum">' + esc(b.jobName) + '<br><span style="opacity:.6;font-weight:400">branch ' + esc(b.branch) + '</span></td>' +
        '<td>' + esc(b.date || '—') + ' #' + b.build + '</td>' +
        '<td>' + b.passed + '/' + b.total + '</td>' +
        '<td>' + (b.asyncConfirmed || 0) + '</td>' +
        '<td>' + b.asyncPending + '</td>' +
        '<td>' + b.failed + '</td>' +
        '<td><a href="' + esc(b.buildUrl) + '" target="_blank" rel="noopener">open ↗</a></td>' +
      '</tr>';
    });
    html += '</tbody></table></div></div>';
    return html;
  }

  // "Week overview" sub-view: an aggregate of the week's fix branches, then the burndown +
  // the two Categories boxes + Fix failed cases.
  function overviewHtml(t, ff, branches) {
    branches = branches || [];
    var begin = t.beginning || { total: 0, cases: [], categories: [] };
    var cur = t.current || { total: 0, cases: [], categories: [], fixedOfInitial: 0, remainingOfInitial: begin.total, newFailures: 0 };
    var statusByKey = {};
    (t.initialCasesStatus || []).forEach(function (s) { statusByKey[s.key] = s.currentStatus; });

    var html = '';
    // Aggregate of the week's verification branches (shown first when any ran).
    html += aggregateCard(branches);
    // 0. Trend
    html += '<div class="widget island">';
    html += '<div class="crm-fct-h">Trend<span class="n">burndown of the initial failed set</span></div>';
    html += '<div class="crm-fct-sub">Started the week with <b>' + begin.total + '</b> failed case(s). ' +
            'Each day the report re-runs, the fixed ones drop out and the chart shows how many remain.</div>';
    html += '<div class="crm-fct-kpis">' +
      '<div class="crm-fct-kpi"><div class="v">' + begin.total + '</div><div class="l">Failed at start of week</div></div>' +
      '<div class="crm-fct-kpi k-fixed"><div class="v">' + cur.fixedOfInitial + '</div><div class="l">Fixed so far (' + pct(cur.fixedOfInitial, begin.total) + '%)</div></div>' +
      '<div class="crm-fct-kpi k-remain"><div class="v">' + cur.remainingOfInitial + '</div><div class="l">Remaining of the initial set</div></div>' +
      '<div class="crm-fct-kpi"><div class="v">' + cur.total + '</div><div class="l">Failing now (incl. ' + cur.newFailures + ' new)</div></div>' +
      '</div>';
    html += buildChart(t.series || [], begin.total, { emptyMsg: 'No failed cases were recorded at the beginning of this week — nothing to burn down.' });
    html += '</div>';

    // 1. Categories - Start of week (the failed set, FROZEN for the whole period)
    html += '<div class="widget island">';
    html += '<div class="crm-fct-h">Categories - Start of week<span class="n">' + begin.total + ' failed case(s)</span></div>';
    html += '<div class="crm-fct-sub">The failed set at the start of week <b>' + esc(t.week || '') + '</b> (captured ' +
            esc(begin.capturedAt || '') + '). This set is <b>frozen</b> and does not change for the rest of the period.</div>';
    html += catBars(begin.categories);
    html += caseList(begin.cases, statusByKey, 'crm-fct-begin-list',
              'Show the ' + begin.total + ' start-of-week failed case(s)',
              'No failed cases at the start of this week.');
    html += '</div>';

    // 2. Categories - Current status (the members of the start-of-week set STILL not fixed)
    var remainingCases = (begin.cases || []).filter(function (c) { return (statusByKey[c.key] || 'absent') !== 'passed'; });
    var fixedN = begin.total - remainingCases.length;
    html += '<div class="widget island">';
    html += '<div class="crm-fct-h">Categories - Current status<span class="n">' + remainingCases.length + ' of ' + begin.total + ' still failing</span></div>';
    html += '<div class="crm-fct-sub"><b>' + fixedN + '</b> of the <b>' + begin.total + '</b> start-of-week failure(s) fixed so far &mdash; <b>' +
            remainingCases.length + '</b> remaining' + (cur.newFailures ? ' (plus <b>' + cur.newFailures + '</b> new failure(s) this period, shown only in the KPIs above)' : '') + '.</div>';
    html += catBars(breakdown(remainingCases));
    html += caseList(remainingCases, statusByKey, 'crm-fct-cur-list',
              'Show the ' + remainingCases.length + ' remaining failed case(s)',
              'All start-of-week failures are fixed. 🎉');
    html += '</div>';

    // 3. Fix failed cases
    html += '<div class="widget island">' + fixFailedTable(ff) + '</div>';
    return html;
  }

  function branchStatusBadge(s) {
    if (s === 'passed') return '<span class="crm-badge b-fixed">Passed</span>';
    if (s === 'async-ok') return '<span class="crm-badge b-fixed">Async &check; confirmed</span>';
    if (s === 'async') return '<span class="crm-badge b-async">Async &middot; re-check</span>';
    if (s === 'failed' || s === 'broken') return '<span class="crm-badge b-fail">Failed</span>';
    if (s === 'skipped') return '<span class="crm-badge b-nr">Skipped</span>';
    return '<span class="crm-badge b-nr">' + esc(s || '—') + '</span>';
  }

  // A verification-branch sub-view: header + KPIs + per-spec status table.
  function branchHtml(b) {
    var rows = (b.tests || []).map(function (tst, i) {
      return '<tr>' +
        '<td class="num">' + (i + 1) + '</td>' +
        '<td>' + (tst.section ? '<span class="crm-fct-sec">' + esc(tst.section) + '</span>' : '') + '</td>' +
        '<td class="cat">' + esc(tst.tcId || '') + '</td>' +
        '<td class="sum">' + esc(tst.title || '') + '</td>' +
        '<td>' + branchStatusBadge(tst.status) + '</td>' +
        '<td class="err">' + errCell(tst.error) + '</td>' +
      '</tr>';
    }).join('');
    if (!(b.tests || []).length) rows = '<tr><td colspan="6" class="crm-fct-empty">No results for this branch yet.</td></tr>';

    var html = '<div class="widget island">';
    html += '<div class="crm-fct-h crm-fct-bh">' + esc(b.jobName) +
            '<span class="n">branch ' + esc(b.branch) + ' &middot; latest run ' + esc(b.date || '—') +
            ' &middot; <a href="' + esc(b.buildUrl) + '" target="_blank" rel="noopener">open build ↗</a></span></div>';
    var asyncOk = b.asyncConfirmed || 0;
    html += '<div class="crm-fct-sub">Re-run of ' + b.total + ' target spec(s): <b>' + b.passed + '</b> passed' +
            (asyncOk ? ', <b>' + asyncOk + '</b> async-confirmed (Sales-Team assigned by a later CRON, verified by the deferred re-check)' : '') +
            (b.asyncPending ? ', <b>' + b.asyncPending + '</b> async pending re-check' : '') +
            (b.failed ? ', <b>' + b.failed + '</b> still failing' : '') + '.</div>';
    html += '<div class="crm-fct-kpis">' +
      '<div class="crm-fct-kpi k-fixed"><div class="v">' + b.passed + '</div><div class="l">Passed / fixed</div></div>' +
      '<div class="crm-fct-kpi k-fixed"><div class="v">' + asyncOk + '</div><div class="l">Async &check; confirmed</div></div>' +
      '<div class="crm-fct-kpi"><div class="v">' + b.asyncPending + '</div><div class="l">Async pending</div></div>' +
      '<div class="crm-fct-kpi k-remain"><div class="v">' + b.failed + '</div><div class="l">Still failing</div></div>' +
      '<div class="crm-fct-kpi"><div class="v">' + b.total + '</div><div class="l">Target specs</div></div>' +
      '</div>';
    // Burndown of this branch's target specs across its re-runs (builds) this week.
    html += buildChart(b.series || [], b.total || 1,
      { labels: BR_LABELS, totalLabel: 'Target specs', titleOf: function (p) { return '#' + p.build; },
        emptyMsg: 'No builds recorded for this branch this week.' });
    html += '<div class="crm-fct-listwrap open" style="margin-top:14px"><table class="crm-fct-tbl"><thead><tr>' +
      '<th class="num">#</th><th>Section</th><th>TC</th><th>Test case</th><th>Status</th><th>Error</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    html += '</div>';
    return html;
  }

  // sub-tab switching + expand/collapse toggles + chart hover tooltip
  function wire(panel, trend) {
    Array.prototype.forEach.call(panel.querySelectorAll('.crm-fct-subtab'), function (tab) {
      tab.addEventListener('click', function () {
        var v = tab.getAttribute('data-view');
        Array.prototype.forEach.call(panel.querySelectorAll('.crm-fct-subtab'), function (x) { x.classList.toggle('is-active', x === tab); });
        Array.prototype.forEach.call(panel.querySelectorAll('.crm-fct-view'), function (x) { x.style.display = (x.getAttribute('data-view') === v) ? '' : 'none'; });
      });
    });
    Array.prototype.forEach.call(panel.querySelectorAll('.crm-fct-toggle'), function (tg) {
      tg.addEventListener('click', function () {
        var w = panel.querySelector('#' + tg.getAttribute('data-target'));
        if (!w) return;
        tg.classList.toggle('open');
        w.classList.toggle('open');
      });
    });
    Array.prototype.forEach.call(panel.querySelectorAll('.crm-fct-slot'), function (slot) {
      function ttEl() { var w = slot.ownerSVGElement && slot.ownerSVGElement.parentNode; return w && w.querySelector('.crm-fct-tt'); }
      slot.addEventListener('mousemove', function (ev) {
        var tt = ttEl(); if (!tt) return;
        tt.innerHTML = decodeURIComponent(slot.getAttribute('data-tt') || '');
        var rect = tt.parentNode.getBoundingClientRect();
        tt.style.left = (ev.clientX - rect.left) + 'px';
        tt.style.top = (ev.clientY - rect.top) + 'px';
        tt.style.opacity = '1';
      });
      slot.addEventListener('mouseleave', function () { var tt = ttEl(); if (tt) tt.style.opacity = '0'; });
    });
  }

  // ---------- panel + nav plumbing ----------
  // Allure's "awesome" theme renders its real view into .app__content (a child of
  // .app); the static #content in index.html is an unused leftover. So we mount our
  // panel as a SIBLING of .app__content (under .app) — Allure never wipes it there —
  // and toggle .app__content's visibility to switch views.
  function viewEl() { return document.querySelector('.app__content') || document.getElementById('content'); }
  function panelHost() { var v = viewEl(); return (v && v.parentNode) || document.body; }
  function ensurePanel() {
    var host = panelHost();
    var panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      host.appendChild(panel);
    } else if (panel.parentNode !== host) {
      host.appendChild(panel);
    }
    // Render once per panel ELEMENT (not a global latch): if Allure ever recreates the
    // host and our panel is remade empty, this refills it.
    if (panel.getAttribute('data-painted') !== '1') {
      loadData().then(function (b) { var p = document.getElementById(PANEL_ID); if (p) renderPanel(p, b); });
    }
    return panel;
  }

  function myLink() { return document.getElementById(LINK_ID); }

  function ensureNavItem() {
    if (document.getElementById(ITEM_ID)) return true;
    var menu = document.querySelector('.side-nav__menu');
    if (!menu) return false;
    var items = menu.querySelectorAll('.side-nav__item');
    var overview = items && items.length ? items[0] : null;
    if (!overview) return false;

    var clone = overview.cloneNode(true);
    clone.id = ITEM_ID;
    var link = clone.querySelector('.side-nav__link') || clone.querySelector('a');
    if (!link) return false;
    link.id = LINK_ID;
    link.classList.remove(ACTIVE_CLS);
    if (link.tagName === 'A') link.setAttribute('href', HASH);
    link.setAttribute('data-tooltip', TITLE);
    link.setAttribute('aria-label', TITLE);
    // label text
    var txt = clone.querySelector('.side-nav__text');
    if (txt) txt.textContent = TITLE; else link.textContent = TITLE;
    // icon: swap in a trend glyph (best-effort; keep the cloned icon if this fails)
    try {
      var icon = clone.querySelector('.side-nav__icon');
      if (icon) {
        icon.style.background = 'none'; icon.style.webkitMask = 'none'; icon.style.mask = 'none';
        icon.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" ' +
          'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 6"/>' +
          '<polyline points="15 6 21 6 21 12"/></svg>';
      }
    } catch (e) { /* keep clone icon */ }

    // Click handling is done by the delegated capture-phase listener in boot() (it can
    // stopImmediatePropagation so Allure doesn't re-render the nav and drop our item).
    overview.parentNode.insertBefore(clone, overview.nextSibling);
    return true;
  }

  function setNavActive(on) {
    var l = myLink();
    if (!l) return;
    if (on) {
      Array.prototype.forEach.call(document.querySelectorAll('.side-nav__link.' + ACTIVE_CLS), function (o) {
        if (o !== l) o.classList.remove(ACTIVE_CLS);
      });
      l.classList.add(ACTIVE_CLS);
    } else {
      l.classList.remove(ACTIVE_CLS);
    }
  }

  function activate() {
    active = true;
    var panel = ensurePanel();
    var v = viewEl();
    if (v) v.style.display = 'none';
    panel.classList.add('is-on');
    setNavActive(true);
    if (window.location.hash !== HASH) {
      try { window.location.hash = ROUTE; } catch (e) {}
    }
  }
  function deactivate() {
    if (!active) { setNavActive(false); return; }
    active = false;
    var panel = document.getElementById(PANEL_ID);
    if (panel) panel.classList.remove('is-on');
    var v = viewEl();
    if (v) v.style.display = '';
    setNavActive(false);
  }

  function isMyHash() { return window.location.hash === HASH; }

  function enhance() {
    ensureNavItem();
    ensurePanel();
    if (isMyHash()) activate();
    else if (active) deactivate();
    else setNavActive(false);   // keep our item un-highlighted while Allure owns the view
  }

  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () { scheduled = false; enhance(); }, 120);
  }

  function boot() {
    // Only add the tab when the weekly data file is present.
    loadData().then(function (b) {
      if (!b.trend || b.trend.unsupported) return;
      schedule();
      // Observe the whole document: Allure rebuilds the sidebar (dropping our item) and
      // can replace the .app / .app__content subtree on navigation. A body-level observer
      // survives those swaps and re-injects the nav item + panel. Debounced + idempotent,
      // so the mutation storm from Allure's own renders coalesces into cheap enhance() calls.
      if (window.MutationObserver) new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
      window.addEventListener('hashchange', function () { isMyHash() ? activate() : deactivate(); });
      // Sidebar clicks: mine -> activate; any other real tab -> hand the view back to Allure.
      document.addEventListener('click', function (e) {
        var link = e.target.closest ? e.target.closest('.side-nav__link') : null;
        if (!link) return;
        if (link.id === LINK_ID || link.getAttribute('href') === HASH) {
          // Take over completely: stop Allure's own nav handler so it neither routes
          // nor rebuilds the sidebar (which would drop our injected item).
          e.preventDefault(); e.stopImmediatePropagation(); activate();
        } else {
          deactivate();   // a real Allure tab — let it route, hand the view back
        }
      }, true);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
