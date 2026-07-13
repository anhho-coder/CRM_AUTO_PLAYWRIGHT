/*
 * CRM Allure customization (client-side, runs inside the generated report).
 *
 * Adds ONE Overview card, "Skipped Test cases", that explains the grey "skipped"
 * block of the Suites widget by splitting it into its two real causes:
 *
 *   1.1 Skipped by reported bugs  — tests DELIBERATELY skipped in code
 *       (test.skip / describe.skip), each blocked by a Jira bug. Reason + bug +
 *       live Jira status/assignee/updated come from the sources + Jira, baked into
 *       crm-skips.json by:
 *         - ci/allure-build-skip-index.js  -> crm-skips.json (suites[].bugRows[])
 *         - ci/allure-fetch-jira-meta.js   -> crm-skips.json bugMeta{}
 *
 *   1.2 Did-not-run                — tests that were queued but never executed
 *       (job/build timeout, aborted run, or an earlier failure in the same spec).
 *       Allure records no reason for these, so the cause is inferred and baked into
 *       crm-didnotrun.json by:
 *         - ci/allure-build-didnotrun-index.js -> crm-didnotrun.json (suites[].reasons[])
 *       Each reason carries a "suggestion to resolve".
 *
 * Per suite: grey "skipped" = (1.1 deliberate) + (1.2 did-not-run). This script
 * only RENDERS those two files; it computes nothing itself.
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
    var root = reportRoot();
    var getJson = function (url) {
      return fetch(root + url).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    };
    dataPromise = Promise.all([getJson('crm-skips.json'), getJson('crm-didnotrun.json')])
      .then(function (res) { return { skips: res[0], dnr: res[1] }; });
    return dataPromise;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      // Text is solid (no opacity dimming) so it reads black in light mode and
      // stays readable in dark mode; every font-size is +15% vs the original.
      '#' + WIDGET_ID + '{padding:16px 20px;margin-bottom:20px;}' +
      '#' + WIDGET_ID + ' .crm-skips-h{font-size:18px;font-weight:700;margin:0 0 2px;}' +
      '#' + WIDGET_ID + ' .crm-skips-sub{font-size:14px;margin:0 0 6px;}' +
      '#' + WIDGET_ID + ' .crm-skips-sub b{font-weight:700;}' +
      '#' + WIDGET_ID + ' .crm-sec{margin-top:18px;}' +
      '#' + WIDGET_ID + ' .crm-sec-h{font-size:15px;font-weight:700;margin:0 0 2px;letter-spacing:.01em;}' +
      '#' + WIDGET_ID + ' .crm-sec-h .n{font-weight:700;margin-right:5px;}' +
      '#' + WIDGET_ID + ' .crm-sec-sub{font-size:13px;margin:0 0 10px;}' +
      '#' + WIDGET_ID + ' .crm-scroll{overflow-x:auto;}' +
      '#' + WIDGET_ID + ' table{width:100%;border-collapse:collapse;font-size:15px;min-width:720px;}' +
      '#' + WIDGET_ID + ' th{text-align:left;font-size:13px;text-transform:uppercase;letter-spacing:.03em;' +
        'font-weight:700;padding:4px 10px 6px 0;border-bottom:1px solid rgba(127,127,127,.25);white-space:nowrap;}' +
      '#' + WIDGET_ID + ' th.num,#' + WIDGET_ID + ' td.num{text-align:right;width:60px;white-space:nowrap;}' +
      '#' + WIDGET_ID + ' td{padding:7px 10px 7px 0;vertical-align:top;border-bottom:1px solid rgba(127,127,127,.10);}' +
      '#' + WIDGET_ID + ' tr.grp-first td{border-top:2px solid rgba(127,127,127,.22);}' +
      '#' + WIDGET_ID + ' .crm-suite{font-weight:700;white-space:nowrap;}' +
      '#' + WIDGET_ID + ' .crm-suite .tot{font-weight:400;font-size:13px;display:block;}' +
      '#' + WIDGET_ID + ' .crm-bug-cell{white-space:nowrap;cursor:pointer;user-select:none;}' +
      '#' + WIDGET_ID + ' .crm-bug-cell .caret,#' + WIDGET_ID + ' .crm-reason-cell .caret{display:inline-block;width:11px;opacity:.55;font-size:10px;}' +
      '#' + WIDGET_ID + ' tr.open .caret{transform:rotate(90deg);}' +
      '#' + WIDGET_ID + ' .crm-bug{display:inline-block;padding:1px 7px;border-radius:10px;font-size:14px;font-weight:600;' +
        'text-decoration:none;background:rgba(217,83,79,.14);color:#c9302c;border:1px solid rgba(217,83,79,.30);}' +
      '#' + WIDGET_ID + ' .crm-bug:hover{background:rgba(217,83,79,.24);}' +
      '#' + WIDGET_ID + ' .crm-nobug{font-style:italic;}' +
      '#' + WIDGET_ID + ' .crm-none{opacity:.55;}' +
      '#' + WIDGET_ID + ' .crm-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle;}' +
      '#' + WIDGET_ID + ' .cat-done{background:#3ca25b;}' +
      '#' + WIDGET_ID + ' .cat-indeterminate{background:#2f7ed8;}' +
      '#' + WIDGET_ID + ' .cat-new{background:#c99a2e;}' +
      '#' + WIDGET_ID + ' .cat-unknown{background:#9aa0a6;}' +
      '#' + WIDGET_ID + ' .crm-status{white-space:nowrap;}' +
      '#' + WIDGET_ID + ' .crm-inactive{font-size:13px;}' +
      '#' + WIDGET_ID + ' .crm-upd{white-space:nowrap;}' +
      '#' + WIDGET_ID + ' .crm-reason{min-width:180px;}' +
      // section 1.2 specifics
      '#' + WIDGET_ID + ' .crm-reason-cell{cursor:pointer;user-select:none;min-width:230px;}' +
      '#' + WIDGET_ID + ' .crm-tag{display:inline-block;padding:1px 7px;border-radius:10px;font-size:12px;font-weight:700;' +
        'text-transform:uppercase;letter-spacing:.03em;margin-right:6px;vertical-align:middle;}' +
      '#' + WIDGET_ID + ' .tag-not-reached{background:rgba(201,154,46,.16);color:#a9791f;border:1px solid rgba(201,154,46,.35);}' +
      '#' + WIDGET_ID + ' .tag-cascade{background:rgba(217,83,79,.14);color:#c9302c;border:1px solid rgba(217,83,79,.30);}' +
      '#' + WIDGET_ID + ' .crm-reason-txt{font-size:14px;display:block;margin-top:3px;}' +
      '#' + WIDGET_ID + ' .crm-suggest{font-size:14px;min-width:230px;}' +
      // Current Status pills
      '#' + WIDGET_ID + ' .crm-cs-cell{white-space:nowrap;min-width:110px;}' +
      '#' + WIDGET_ID + ' .crm-cs{display:inline-block;padding:1px 7px;border-radius:10px;font-size:13px;font-weight:700;' +
        'white-space:nowrap;margin:1px 3px 1px 0;}' +
      '#' + WIDGET_ID + ' .crm-cs.crm-cs-sm{font-size:11.5px;padding:0 6px;font-weight:600;}' +
      '#' + WIDGET_ID + ' .cs-unskipped{background:rgba(60,162,91,.15);color:#2f8049;border:1px solid rgba(60,162,91,.35);}' +
      '#' + WIDGET_ID + ' .cs-removed{background:rgba(154,160,166,.18);color:#6b7075;border:1px solid rgba(154,160,166,.4);}' +
      '#' + WIDGET_ID + ' .cs-skipped{background:rgba(201,154,46,.16);color:#a9791f;border:1px solid rgba(201,154,46,.35);}' +
      '#' + WIDGET_ID + ' .crm-detail{display:none;}' +
      '#' + WIDGET_ID + ' tr.open + tr.crm-detail{display:table-row;}' +
      '#' + WIDGET_ID + ' .crm-detail td{padding-top:2px;}' +
      '#' + WIDGET_ID + ' .crm-detail ol{margin:2px 0 6px;padding-left:22px;}' +
      '#' + WIDGET_ID + ' .crm-detail li{padding:2px 0;font-size:14px;}' +
      '#' + WIDGET_ID + ' .crm-detail .more{opacity:.55;font-style:italic;list-style:none;margin-left:-14px;}' +
      '#' + WIDGET_ID + ' .crm-foot{font-size:13px;opacity:.6;margin-top:10px;}';
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
  function testListRows(tests, more) {
    var items = (tests || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
    if (more > 0) items += '<li class="more">…and ' + more + ' more</li>';
    return items;
  }

  // ---- Section 1.1: deliberate skips, blocked by a bug (from crm-skips.json) ----
  function section11(data) {
    if (!data || !data.suites || !data.suites.length) return '';
    var jira = data.jiraBase || 'http://jira.nakivo.com/browse/';
    var meta = data.bugMeta || {};
    var html = '<div class="crm-sec">';
    html += '<div class="crm-sec-h"><span class="n">1.1</span>Skipped by reported bugs</div>';
    html += '<div class="crm-sec-sub">Deliberate skips in code &mdash; <b>' + data.totalSkipped +
            '</b> test case(s) across <b>' + data.suites.length + '</b> suite(s), blocked by <b>' +
            data.totalBugs + '</b> bug(s). Click a bug to list its tests.</div>';
    html += '<div class="crm-scroll"><table><thead><tr>' +
              '<th>Suite</th><th class="num">Skipped</th><th>Bug</th>' +
              '<th>Bug Status</th><th>Assignee</th><th>Latest Update</th><th>Reason</th>' +
            '</tr></thead><tbody>';
    data.suites.forEach(function (s) {
      (s.bugRows || []).forEach(function (br, ri) {
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
        html += '<tr class="crm-bugrow' + (first ? ' grp-first' : '') + '">' +
                  '<td>' + suiteCell + '</td>' +
                  '<td class="num">' + br.count + '</td>' +
                  '<td class="crm-bug-cell">' + bugCell + '</td>' +
                  '<td>' + statusCell + '</td>' +
                  '<td>' + assigneeCell + '</td>' +
                  '<td>' + updCell + '</td>' +
                  '<td class="crm-reason">' + reason + '</td>' +
                '</tr>';
        html += '<tr class="crm-detail"><td></td><td></td><td colspan="5"><ol>' +
                testListRows(br.tests, 0) + '</ol></td></tr>';
      });
    });
    html += '</tbody></table></div>';
    var srcLabel = data.bugMetaSource === 'jira-live' ? 'live from Jira'
                 : data.bugMetaSource === 'cache' ? 'cached snapshot'
                 : 'unavailable';
    html += '<div class="crm-foot">Jira data: ' + srcLabel +
            (data.bugMetaAsOf ? ' &middot; as of ' + fmtDate(data.bugMetaAsOf) : '') + '</div>';
    html += '</div>';
    return html;
  }

  // ---- Section 1.2: did-not-run skips, inferred reason + fix (from crm-didnotrun.json) ----
  function section12(dnr) {
    if (!dnr || !dnr.suites || !dnr.suites.length) return '';
    var csLabel = {};
    var cat = dnr.statusCatalog || {};
    Object.keys(cat).forEach(function (k) { csLabel[k] = cat[k].label || k; });
    function csList(tests, more) {
      var items = (tests || []).map(function (t) {
        var cs = t.cs || 'unskipped';
        return '<li><span class="crm-cs crm-cs-sm cs-' + cs + '">' + esc(csLabel[cs] || cs) + '</span> ' + esc(t.n) + '</li>';
      }).join('');
      if (more > 0) items += '<li class="more">…and ' + more + ' more</li>';
      return items;
    }
    var html = '<div class="crm-sec">';
    html += '<div class="crm-sec-h"><span class="n">1.2</span>Did-not-run (timeout, cascade failures, aborted runs)</div>';
    html += '<div class="crm-sec-sub">Tests that produced no result &mdash; <b>' + dnr.totalDidNotRun +
            '</b> test case(s) across <b>' + dnr.suites.length + '</b> suite(s). ' +
            'These are NOT deliberate skips; they never executed. ' +
            '<b>Current Status</b> shows each test in TODAY&rsquo;s code. Click a reason to list its tests.</div>';
    html += '<div class="crm-scroll"><table><thead><tr>' +
              '<th>Suite</th><th class="num">Did-not-run</th><th>Current Status</th>' +
              '<th>Reason</th><th>Suggestion to resolve</th>' +
            '</tr></thead><tbody>';
    dnr.suites.forEach(function (s) {
      var reasons = s.reasons || [];
      reasons.forEach(function (r, ri) {
        var first = ri === 0;
        var suiteCell = first
          ? '<span class="crm-suite">' + esc(s.suite) +
            '<span class="tot">' + (s.greyBarSkipped != null ? s.greyBarSkipped + ' skipped = ' : '') +
            s.intentional + ' deliberate + ' + s.didNotRun + ' did-not-run</span></span>'
          : '';
        var tagCls = r.key === 'cascade' ? 'tag-cascade' : 'tag-not-reached';
        var tagTxt = r.key === 'cascade' ? 'Cascade' : (r.key === 'not-reached' ? 'Timeout / aborted' : r.key);
        var reasonCell = '<span class="caret">▶</span> <span class="crm-tag ' + tagCls + '">' + esc(tagTxt) + '</span>' +
                         '<span class="crm-reason-txt">' + esc(r.label) + '</span>';
        var statusCell = (r.status && r.status.length)
          ? r.status.map(function (st) {
              return '<span class="crm-cs cs-' + st.key + '">' + esc(st.label) + ' ' + st.count + '</span>';
            }).join('')
          : '<span class="crm-none">—</span>';
        html += '<tr class="crm-dnrrow' + (first ? ' grp-first' : '') + '">' +
                  '<td>' + suiteCell + '</td>' +
                  '<td class="num">' + r.count + '</td>' +
                  '<td class="crm-cs-cell">' + statusCell + '</td>' +
                  '<td class="crm-reason-cell">' + reasonCell + '</td>' +
                  '<td class="crm-suggest">' + esc(r.suggestion) + '</td>' +
                '</tr>';
        html += '<tr class="crm-detail"><td></td><td></td><td colspan="3"><ol>' +
                csList(r.tests, r.more) + '</ol></td></tr>';
      });
    });
    html += '</tbody></table></div>';
    html += '<div class="crm-foot">Reasons are inferred at build time (Allure records no reason for a skipped test): ' +
            'a skip in a spec that also has a failed test &rarr; cascade, otherwise &rarr; the run ended before it ran. ' +
            '<b>The reason is exact only on Daily/Weekly reports</b> (today&rsquo;s code matches that run); on longer ' +
            'periods some tests were skipped on purpose in older runs &mdash; the <b>Current Status</b> column shows ' +
            'their state in today&rsquo;s code (e.g. <span class="crm-cs crm-cs-sm cs-unskipped">Un-skipped</span> = no ' +
            'longer skipped, would run now).</div>';
    html += '</div>';
    return html;
  }

  function buildCard(bundle) {
    var card = document.createElement('div');
    card.id = WIDGET_ID;
    card.className = 'widget island';   // reuse Allure's themed card chrome (bg/radius/shadow)

    var html = '';
    html += '<div class="crm-skips-h">Skipped Test cases</div>';
    html += '<div class="crm-skips-sub">The Suites bar counts every skipped test as one grey block, but skips ' +
            'have two causes. Per suite: <b>grey skipped = deliberate (1.1) + did-not-run (1.2)</b>.</div>';
    html += section11(bundle.skips);
    html += section12(bundle.dnr);

    card.innerHTML = html;

    // Expand/collapse any row (section 1.1 bug rows, section 1.2 reason rows).
    Array.prototype.forEach.call(card.querySelectorAll('.crm-bug-cell, .crm-reason-cell'), function (cell) {
      cell.addEventListener('click', function () { cell.parentNode.classList.toggle('open'); });
    });
    return card;
  }

  function enhance() {
    loadData().then(function (bundle) {
      var hasSkips = bundle.skips && bundle.skips.suites && bundle.skips.suites.length;
      var hasDnr = bundle.dnr && bundle.dnr.suites && bundle.dnr.suites.length;
      if (!hasSkips && !hasDnr) return;
      if (document.getElementById(WIDGET_ID)) return;
      if (!document.querySelector('a.table__row[href^="#suites/"]')) return;   // Overview only
      injectStyle();
      var card = buildCard(bundle);
      // Place the card directly AFTER the Suites widget (so it sits under Suites and
      // above Environment in the same column). Tables scroll horizontally inside
      // their own .crm-scroll box on narrow columns.
      var suiteRow = document.querySelector('a.table__row[href^="#suites/"]');
      var w = suiteRow && suiteRow.closest ? suiteRow.closest('.widget') : null;
      if (w && w.parentNode) { w.parentNode.insertBefore(card, w.nextSibling); return; }
      // Fallbacks: below the widgets grid, else the content area.
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
