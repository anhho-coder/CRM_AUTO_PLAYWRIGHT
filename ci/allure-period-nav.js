/*
 * CRM Allure customization (client-side, runs inside the generated report).
 *
 * Renders a period switcher at the top of the Overview: "Current · <period>" /
 * "Previous · <period>", so you can flip between the current and previous period
 * (day / week / month / quarter / year) without leaving the page. Config comes from
 * period-nav.json (written next to index.html by ci/allure-inject-period-nav.js),
 * so the hrefs + the period-type label are correct whether this report is the main
 * one (current) or the embedded previous/ copy.
 *
 * Idempotent; re-applies on SPA re-render via a MutationObserver. Theme-safe.
 */
(function () {
  'use strict';

  var ID = 'crm-period-nav';
  var STYLE_ID = 'crm-pn-style';
  var cfgPromise = null;

  function reportRoot() {
    var p = window.location.pathname;
    if (!/\/$/.test(p)) p = p.replace(/[^/]*$/, '');
    return p;
  }

  function loadCfg() {
    if (cfgPromise) return cfgPromise;
    cfgPromise = fetch(reportRoot() + 'period-nav.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
    return cfgPromise;
  }

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MON_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];

  // Format any period key into a human label, by scope key shape:
  //   yyyy-MM-dd -> "Jun 30, 2026" | yyyy-Www -> "Week 26, 2026" | yyyy-MM -> "June 2026"
  //   yyyy-Qn    -> "Q3 2026"      | yyyy      -> "2026"
  function fmt(key) {
    key = key || '';
    var m;
    if ((m = /^(\d{4})-Q([1-4])$/.exec(key)))          return 'Q' + m[2] + ' ' + m[1];
    if ((m = /^(\d{4})-W(\d{1,2})$/.exec(key)))         return 'Week ' + parseInt(m[2], 10) + ', ' + m[1];
    if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)))    return MON[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1];
    if ((m = /^(\d{4})-(\d{2})$/.exec(key)))            return MON_FULL[+m[2] - 1] + ' ' + m[1];
    if ((m = /^(\d{4})$/.exec(key)))                    return m[1];
    return key;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '#' + ID + '{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 0 16px;}' +
      '#' + ID + ' .crm-pn-lab{font-size:11px;font-weight:700;letter-spacing:.12em;' +
        'text-transform:uppercase;opacity:.55;margin-right:2px;}' +
      '#' + ID + ' .crm-pn-tab{font-size:12.5px;font-weight:600;text-decoration:none;color:inherit;' +
        'border:1px solid rgba(128,128,128,.35);border-radius:999px;padding:5px 14px;opacity:.82;}' +
      '#' + ID + ' .crm-pn-tab:hover{opacity:1;border-color:#4b6bfb;}' +
      '#' + ID + ' .crm-pn-tab.is-active{background:#4b6bfb;color:#fff;border-color:#4b6bfb;opacity:1;}';
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  }

  function build(cfg) {
    var bar = document.createElement('div');
    bar.id = ID;
    var lab = document.createElement('span');
    lab.className = 'crm-pn-lab';
    lab.textContent = cfg.label || 'Period';
    bar.appendChild(lab);
    cfg.items.forEach(function (it) {
      if (!it.href) return;                       // no previous frozen yet -> skip its tab
      var a = document.createElement('a');
      a.className = 'crm-pn-tab' + (it.role === cfg.active ? ' is-active' : '');
      var base = it.href === '.' ? './' : it.href.replace(/\/?$/, '/');
      a.href = base + 'index.html';
      a.textContent = (it.role === 'current' ? 'Current · ' : 'Previous · ') + fmt(it.key);
      bar.appendChild(a);
    });
    return bar;
  }

  function enhance() {
    loadCfg().then(function (cfg) {
      if (!cfg || !cfg.items) return;
      var content = document.getElementById('content');
      if (!content) return;
      if (document.getElementById(ID)) return;    // idempotent
      content.insertBefore(build(cfg), content.firstChild);
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
