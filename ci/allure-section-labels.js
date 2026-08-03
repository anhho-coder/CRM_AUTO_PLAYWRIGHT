/*
 * CRM Allure customization (client-side, runs inside the generated report).
 *
 * Labels the two sections the QA team cares about on the Overview:
 *   Section 1 -> the summary widget (EVERY run this period incl. reruns + donut)
 *   Section 2 -> the "Suites" widget (latest result per suite, one row per unique test case)
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
  var QA_MARK = 'crm-qa-split';
  // Accent colors cycled per QA bucket (read on both light and dark themes).
  var QA_COLORS = ['#4b6bfb', '#e0743a', '#2ea36f', '#a256c9', '#c0392b', '#0e8fa8'];

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.' + MARK + '{display:flex;align-items:center;gap:9px;padding:12px 16px 2px;' +
        'font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.8;}' +
      '.' + MARK + ' .crm-sec-num{background:#4b6bfb;color:#fff;border-radius:5px;' +
        'padding:2px 8px;letter-spacing:.05em;flex:0 0 auto;}' +
      '.' + MARK + ' .crm-sec-desc{font-weight:600;font-size:12px;letter-spacing:.02em;' +
        'text-transform:none;opacity:.75;}' +
      '.' + QA_MARK + '{display:flex;flex-wrap:wrap;align-items:center;gap:8px;' +
        'padding:4px 16px 12px;}' +
      '.' + QA_MARK + ' .crm-qa-title{font-size:11px;font-weight:700;letter-spacing:.08em;' +
        'text-transform:uppercase;opacity:.6;margin-right:2px;}' +
      '.' + QA_MARK + ' .crm-qa-chip{display:inline-flex;align-items:center;gap:7px;' +
        'border:1px solid rgba(128,128,128,.35);border-radius:14px;padding:3px 11px;font-size:12px;}' +
      '.' + QA_MARK + ' .crm-qa-dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;}' +
      '.' + QA_MARK + ' .crm-qa-name{font-weight:600;opacity:.85;}' +
      '.' + QA_MARK + ' .crm-qa-n{font-weight:700;}';
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  }

  // Section 1 sub-header: "Executed by  <QA> N  <QA> M" from window.CRM_QA_BREAKDOWN.
  function qaSplit() {
    var data = window.CRM_QA_BREAKDOWN;
    if (!data || typeof data !== 'object') return null;
    var names = Object.keys(data);
    if (!names.length) return null;
    // Anh Ho first, then remaining buckets by descending executed total.
    names.sort(function (a, b) {
      if (a === 'Anh Ho') return -1;
      if (b === 'Anh Ho') return 1;
      return (data[b].total || 0) - (data[a].total || 0);
    });
    var wrap = document.createElement('div');
    wrap.className = QA_MARK;
    var title = document.createElement('span');
    title.className = 'crm-qa-title';
    title.textContent = 'Executed by';
    wrap.appendChild(title);
    names.forEach(function (name, i) {
      var chip = document.createElement('span');
      chip.className = 'crm-qa-chip';
      var dot = document.createElement('span');
      dot.className = 'crm-qa-dot';
      dot.style.background = QA_COLORS[i % QA_COLORS.length];
      var nm = document.createElement('span');
      nm.className = 'crm-qa-name';
      nm.textContent = name;
      var n = document.createElement('span');
      n.className = 'crm-qa-n';
      n.textContent = String(data[name].total || 0);
      chip.appendChild(dot); chip.appendChild(nm); chip.appendChild(n);
      wrap.appendChild(chip);
    });
    return wrap;
  }

  function addQaSplit(widget) {
    if (!widget || widget.querySelector('.' + QA_MARK)) return; // idempotent
    var split = qaSplit();
    if (!split) return;
    var eb = widget.querySelector('.' + MARK);
    if (eb && eb.nextSibling) widget.insertBefore(split, eb.nextSibling);
    else widget.insertBefore(split, widget.firstChild);
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

  // Rename the Overview "Categories" widget title (NOT the left-sidebar nav tab).
  // Match the widget header whose trimmed text is exactly "Categories" so the
  // rename is idempotent (after renaming it no longer equals "Categories").
  var CAT_TITLE = 'Categories - list of failed cases';
  function renameCategories() {
    var titles = document.querySelectorAll('.widget__title, .pane__title, .widget h2');
    for (var i = 0; i < titles.length; i++) {
      var el = titles[i];
      // The Allure title node also holds an "N items total" counter span; read
      // only the leading text node so the counter is preserved untouched.
      var first = el.firstChild;
      if (first && first.nodeType === 3 && first.nodeValue.trim() === 'Categories') {
        first.nodeValue = CAT_TITLE;
      } else if (el.childNodes.length === 1 && el.textContent.trim() === 'Categories') {
        el.textContent = CAT_TITLE;
      }
    }
  }

  function enhance() {
    renameCategories();

    // Section 2: the Suites widget (its rows link to #suites/<uid>)
    var suitesRow = document.querySelector('a.table__row[href^="#suites/"]');
    if (suitesRow) label(suitesRow.closest('.widget'), 'Section 2', 'Latest result per suite by unique test case');

    // Section 1: the summary widget = the one showing "N test cases" + the donut chart
    var widgets = document.querySelectorAll('.widget');
    for (var i = 0; i < widgets.length; i++) {
      var w = widgets[i];
      // Skip the "Failed cases trend" tab's own cards: they reuse .widget/.island for
      // theme chrome and contain charts + "case(s)" text, which would otherwise be
      // mislabeled "Section 1 / Total test cases run this period".
      if (w.closest && w.closest('#crm-fct-panel')) continue;
      if (/test cases/i.test(w.textContent) && w.querySelector('svg, .chart, canvas')) {
        label(w, 'Section 1', 'Total test cases run this period');
        addQaSplit(w); // per-QA "Executed by" split (host -> QA)
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
