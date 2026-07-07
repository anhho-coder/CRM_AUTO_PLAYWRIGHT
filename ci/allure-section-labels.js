/*
 * CRM Allure customization (client-side, runs inside the generated report).
 *
 * Labels the two sections the QA team cares about on the Overview:
 *   Section 1 -> the summary widget (total test cases run in the period + donut)
 *   Section 2 -> the "Suites" widget (latest result per suite)
 * by prepending a small eyebrow header to each of those two widgets.
 *
 * Pure DOM enhancement, no build step. Idempotent, and re-applies itself when
 * the Overview re-renders (hash navigation) via a MutationObserver. Theme-safe
 * (inherits the text color; the number chip uses a fixed blue that reads on both
 * light and dark).
 */
(function () {
  'use strict';

  var STYLE_ID = 'crm-sec-style';
  var MARK = 'crm-sec-eyebrow';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.' + MARK + '{display:flex;align-items:center;gap:9px;padding:12px 16px 2px;' +
        'font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.8;}' +
      '.' + MARK + ' .crm-sec-num{background:#4b6bfb;color:#fff;border-radius:5px;' +
        'padding:2px 8px;letter-spacing:.05em;flex:0 0 auto;}' +
      '.' + MARK + ' .crm-sec-desc{font-weight:600;font-size:12px;letter-spacing:.02em;' +
        'text-transform:none;opacity:.75;}';
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  }

  function eyebrow(num, desc) {
    var d = document.createElement('div');
    d.className = MARK;
    var n = document.createElement('span');
    n.className = 'crm-sec-num';
    n.textContent = num;
    var t = document.createElement('span');
    t.className = 'crm-sec-desc';
    t.textContent = desc;
    d.appendChild(n);
    d.appendChild(t);
    return d;
  }

  function label(widget, num, desc) {
    if (!widget || widget.querySelector('.' + MARK)) return; // idempotent
    widget.insertBefore(eyebrow(num, desc), widget.firstChild);
  }

  function enhance() {
    // Section 2: the Suites widget (its rows link to #suites/<uid>)
    var suitesRow = document.querySelector('a.table__row[href^="#suites/"]');
    if (suitesRow) label(suitesRow.closest('.widget'), 'Section 2', 'Latest result per suite');

    // Section 1: the summary widget = the one showing "N test cases" + the donut chart
    var widgets = document.querySelectorAll('.widget');
    for (var i = 0; i < widgets.length; i++) {
      var w = widgets[i];
      if (/test cases/i.test(w.textContent) && w.querySelector('svg, .chart, canvas')) {
        label(w, 'Section 1', 'Total test cases run this period');
        break;
      }
    }
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
