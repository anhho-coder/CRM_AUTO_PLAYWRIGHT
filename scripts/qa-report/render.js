'use strict';
/**
 * Render qa-report-out/data/latest.json into a self-contained dashboard
 * (qa-report-out/index.html + styles.css + app.js). No server, no external libs.
 *
 * Two views, toggled client-side (app.js), default = Quarterly KPI:
 *   - Quarterly KPI: per metric, a header (QoQ/QvG/QvQY) + a quarterly bar chart
 *     (trailing actual quarters + current Forecast/Actual/Goal) + per-tester table.
 *   - By range: per metric, totals for Last week / This month / quarter / year.
 *
 * Everything is pre-rendered server-side; app.js only toggles visibility, so it
 * works under Jenkins HTML Publisher's CSP and degrades to the defaults.
 *
 * Usage: node scripts/qa-report/render.js
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
const EMP_COLORS = ['#6a3093', '#1e7e34', '#c0392b', '#2c7be5'];
const RANGE_ORDER = ['lastWeek', 'thisMonth', 'thisQuarter', 'thisYear'];
// The Metrics "By range" view adds "Last quarter" (previous complete quarter, after
// This quarter) and "Last year" (full previous calendar year, at the end). The
// Worklog page stays on RANGE_ORDER — it only seeds this-year data, so those extra
// buttons would be empty there. Hence both are Metrics-Report-only.
const METRIC_RANGE_ORDER = ['lastWeek', 'thisMonth', 'thisQuarter', 'lastQuarter', 'thisYear', 'lastYear'];
// The QA CRM · Jira · Dashboard (STUCK) page offers only the two quarter ranges,
// default This quarter — matching the team's Q2 sample JQL.
const STUCK_RANGE_ORDER = ['thisQuarter', 'lastQuarter'];
const BAR_COLORS = { actual: '#1f4e96', forecast: '#1f4e96', current: '#27ae9a', goal: '#e8843c' };
// Worklog column colours (by config key); anything unmapped falls back to the palette.
const WL_COLORS = {
  featureVerif: '#e0413a', ticketVerif: '#f2b705', admin: '#2e9e5b', regression: '#6aaef0',
  smoke: '#8e7cc3', featureMaint: '#4a90d9', training: '#16a085', automation: '#f6d34a',
  frdSpec: '#7e57c2', supportNbr: '#26a69a', odoo12Migration: '#ef6c00', crmBaas: '#5c6bc0',
  claude: '#d81b60', crmSupportTicket: '#9e9d24',
  ftoSlHoliday: '#e8843c', nonCrm: '#ed7d31',
};
const WL_PALETTE = ['#6a3093', '#2c7be5', '#1e7e34', '#c0392b', '#f39c12', '#16a085', '#8e44ad', '#d35400'];
const wlColor = (key, i) => WL_COLORS[key] || WL_PALETTE[i % WL_PALETTE.length];
const pct1 = (v) => `${v}%`;

/* ------------------------------- Quarterly view ------------------------------ */

function quarterChart(bars) {
  if (!bars || !bars.length) return '<p class="muted">No quarterly data.</p>';
  const W = 640, H = 250, padL = 18, padR = 18, padT = 22, padB = 36, n = bars.length;
  const maxV = Math.max(1, ...bars.map((b) => b.value));
  const step = (W - padL - padR) / n;
  const bw = Math.min(56, step - 12);
  const base = H - padB;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px">`;
  // light baseline
  s += `<line x1="${padL}" y1="${base}" x2="${W - padR}" y2="${base}" stroke="#e3e3e3"/>`;
  bars.forEach((b, i) => {
    const bx = padL + i * step + (step - bw) / 2;
    const h = (b.value / maxV) * (H - padT - padB);
    s += `<rect x="${bx.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${BAR_COLORS[b.type] || '#1f4e96'}"/>`;
    s += `<text x="${(bx + bw / 2).toFixed(1)}" y="${(base - h - 5).toFixed(1)}" font-size="11" font-weight="700" text-anchor="middle" fill="#333">${b.value}</text>`;
    s += `<text x="${(bx + bw / 2).toFixed(1)}" y="${H - padB + 16}" font-size="8.5" text-anchor="middle" fill="#777">${esc(b.label)}</text>`;
  });
  return s + '</svg>';
}

function kpiBoxes(kpis) {
  const box = (label, v) => {
    const txt = v == null ? 'n/a' : `${v}%`;
    const cls = v == null ? 'na' : v >= 0 ? 'pos' : 'neg';
    return `<div class="qkpi ${cls}"><div class="qv">${esc(txt)}</div><div class="ql">${esc(label)}</div></div>`;
  };
  return `<div class="qkpis">${box('QoQ', kpis.qoq)}${box('QvG', kpis.qvg)}${box('QvQY', kpis.qvqy)}</div>`;
}

function testerTable(byTester, total, currentLabel) {
  const rows = byTester.map((t) =>
    `<tr><td>${esc(t.name)}</td><td class="num">${t.value}</td><td class="num">${t.pct}%</td></tr>`).join('');
  return `<table class="qtbl">
    <thead><tr><th></th><th>${esc(currentLabel)}</th><th>%</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td>Grand Total</td><td class="num">${total}</td><td class="num">100%</td></tr></tfoot>
  </table>`;
}

/* ----------------------------- Deep-link anchors ----------------------------- */
// Give every metric card a stable #anchor (from its config key, else its label) plus
// a click-to-copy 🔗 link, so a shared URL like manual.html#m-uniqueTcExecuted opens
// scrolled to — and briefly highlighting — that metric. Applied by wrapping each
// section builder's OUTPUT (at the call sites in main), so the builders stay untouched.
// The matching scroll/copy behaviour lives in APP_JS (focusId + the data-anchor click
// branch). `suffix` keeps the id unique when the same metric is rendered in two views
// on one page (e.g. the Quarterly card uses '-q' so it does not clash with the By-range
// card of the same key).
function slugify(s) {
  return String(s == null ? '' : s).trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function metricId(meta) {
  // A config key (e.g. "uniqueTcExecuted") is already a valid id token — use it
  // verbatim so anchors stay recognizable; only slugify the label fallback.
  const key = meta && meta.key;
  if (key && /^[A-Za-z0-9_-]+$/.test(key)) return 'm-' + key;
  return 'm-' + (slugify(meta && meta.label) || 'metric');
}
function withAnchor(meta, html, suffix) {
  const id = metricId(meta) + (suffix || '');
  const link = `<a class="anchor" href="#${id}" data-anchor title="Copy link to this metric" aria-label="Copy link to this metric">🔗</a>`;
  const label = esc(meta && meta.label);
  let out = html.replace(/<section class="metric/, `<section id="${id}" class="metric`);
  // Place the 🔗 right AFTER the metric name (before the pill / the long "· KPI: …"
  // subtitle) so it reads as "beside the name", not buried at the end of the header.
  if (label && out.indexOf('<h2>' + label) !== -1) out = out.replace('<h2>' + label, '<h2>' + label + ' ' + link);
  else out = out.replace('</h2>', `${link}</h2>`); // fallback: end of the header
  return out;
}

function quarterlySection(meta, q, lead) {
  return `<section class="metric${lead ? ' lead' : ''}">
    <h2>${esc(meta.label)} ${lead ? '<span class="pill">primary</span>' : ''} <span class="muted">· KPI: ${esc(q.kpiName)}</span></h2>
    ${q.kpis ? kpiBoxes(q.kpis) : ''}
    <div class="qgrid">
      <div class="qchart">${quarterChart(q.bars)}</div>
      <div class="qside">
        <div class="subh">${esc(meta.byLabel || 'By tester')} · ${esc(q.currentLabel)} (actual)</div>
        ${testerTable(q.byTester, q.total, q.currentLabel)}
      </div>
    </div>
    ${meta.quarterlyNote ? `<p class="qnote">${esc(meta.quarterlyNote)}</p>` : ''}
  </section>`;
}

/* -------------------------------- Range view --------------------------------- */

// Trend bars, STACKED per tester (same colours as the "By tester" bars). Each
// bucket's height is its total; the segments split it by tester (bottom-up in
// `members` order). The total is labelled on top; each segment carries a hover
// title. Falls back to a single bar if per-tester data (byEmp) is unavailable.
function seriesChart(series, members) {
  if (!series || !series.length) return '<p class="muted">No data in this range.</p>';
  const emps = (members && members.length) ? members : null;
  const W = 680, H = 150, pad = 26, n = series.length, plot = H - 2 * pad;
  const maxV = Math.max(1, ...series.map((s) => s.value));
  const step = (W - 2 * pad) / n;
  const bw = Math.max(5, Math.min(40, step - 6));
  const labelEvery = Math.ceil(n / 14);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px">`;
  series.forEach((d, i) => {
    const bx = pad + i * step + (step - bw) / 2;
    const baseY = H - pad;
    const totalH = (d.value / maxV) * plot;
    if (emps && d.byEmp) {
      let yb = baseY; // stack bottom-up
      emps.forEach((name, j) => {
        const v = d.byEmp[name] || 0;
        if (v <= 0) return;
        const hh = (v / maxV) * plot;
        yb -= hh;
        s += `<rect x="${bx.toFixed(1)}" y="${yb.toFixed(1)}" width="${bw.toFixed(1)}" height="${hh.toFixed(1)}" fill="${EMP_COLORS[j % EMP_COLORS.length]}"><title>${esc(name)}: ${fmt(v)}</title></rect>`;
      });
    } else {
      s += `<rect x="${bx.toFixed(1)}" y="${(baseY - totalH).toFixed(1)}" width="${bw.toFixed(1)}" height="${totalH.toFixed(1)}" rx="2" fill="#a044ff"/>`;
    }
    if (d.value > 0) s += `<text x="${(bx + bw / 2).toFixed(1)}" y="${(baseY - totalH - 4).toFixed(1)}" font-size="9" text-anchor="middle" fill="#555">${fmt(d.value)}</text>`;
    if (i % labelEvery === 0) s += `<text x="${(bx + bw / 2).toFixed(1)}" y="${H - 6}" font-size="11" font-weight="700" text-anchor="middle" fill="#555">${esc(d.label)}</text>`;
  });
  s += '</svg>';
  if (emps) {
    s += '<div class="tlegend">' + emps.map((name, j) =>
      `<span class="tl"><span class="sw" style="background:${EMP_COLORS[j % EMP_COLORS.length]}"></span>${esc(name)}</span>`).join('') + '</div>';
  }
  return s;
}

function employeeBars(byEmployee) {
  const max = Math.max(1, ...byEmployee.map((e) => e.value));
  return '<div class="emps">' + byEmployee.map((e, i) => {
    const pct = (e.value / max) * 100;
    const color = EMP_COLORS[i % EMP_COLORS.length];
    return `<div class="emp"><div class="empname">${esc(e.name)}</div><div class="track"><div class="fill" style="width:${pct.toFixed(0)}%;background:${color}"></div></div><div class="empval">${fmt(e.value)}</div></div>`;
  }).join('') + '</div>';
}

function rangeBlock(agg, active, members, byLabel) {
  return `<div class="range-block${active ? ' is-active' : ''}" data-range="${esc(agg.key)}">
    <div class="grid">
      <div class="bignum"><div class="v">${fmt(agg.total)}</div><div class="l">${esc(agg.label.toLowerCase())}</div></div>
      <div class="bycol"><div class="subh">${esc(byLabel || 'By tester')}</div>${employeeBars(agg.byEmployee)}</div>
    </div>
    <div class="subh">Trend</div>${seriesChart(agg.series, members)}
  </div>`;
}

// Optional card-level ℹ️ hover, shown when a metric's config carries a `note` (a
// string or an array of bullet strings) — reuses the .wlnote popover style. Used e.g.
// by "Unique Executed Test Cases" to explain why its total (sum of per-tester distinct
// counts) can exceed a single combined worklogAuthor-in-(team) query.
function metricNote(meta) {
  if (!meta || !meta.note) return '';
  const items = Array.isArray(meta.note) ? meta.note : [meta.note];
  const title = meta.noteTitle || 'How this is counted';
  return `<div class="wlnote" tabindex="0">ℹ️ ${esc(title)}<span class="wlnote-hint"> (hover)</span>
    <div class="wlnote-pop">
      <div class="wlnote-h">${esc(title)}</div>
      <ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    </div>
  </div>`;
}

function rangeSection(meta, m, def, lead, members) {
  const blocks = METRIC_RANGE_ORDER.filter((k) => m.ranges[k]).map((k) => rangeBlock(m.ranges[k], k === def, members, meta.byLabel)).join('\n');
  return `<section class="metric${lead ? ' lead' : ''}">
    <h2>${esc(meta.label)} ${lead ? '<span class="pill">primary</span>' : ''} <span class="muted">· KPI: ${esc(m.kpiName)}</span></h2>
    ${metricNote(meta)}
    ${blocks}
  </section>`;
}

// --- Custom "By range" card for the DERIVED rate metric "Executed test cases per
// day" (config.perDay). Shows two headline rates — per calendar-day and per man-day
// — a per-tester table with the inputs behind each, and a per-calendar-day trend.
// See sources/executed-per-day.js for the range shape (workingDays, byTester,
// manDay, canonical total/byEmployee = the per-calendar-day rate).
function perDayBlock(agg, active, members) {
  const md = agg.manDay || { total: 0, byEmployee: [], manDaysTotal: 0 };
  const rows = (agg.byTester || []).map((r) => `<tr>` +
    `<td class="pdname">${esc(r.name)}</td>` +
    `<td>${fmt(r.executed)}</td>` +
    `<td>${fmt(agg.workingDays)}</td>` +
    `<td class="pdrate">${fmt(r.calPerDay)}</td>` +
    `<td>${fmt(r.execHours)}</td>` +
    `<td>${Math.round((r.workload || 0) * 100)}%</td>` +
    `<td>${fmt(r.manDays)}</td>` +
    `<td class="pdrate">${fmt(r.manDayPerDay)}</td></tr>`).join('');
  return `<div class="range-block${active ? ' is-active' : ''}" data-range="${esc(agg.key)}">
    <div class="grid">
      <div class="bignum"><div class="v">${fmt(agg.total)}</div><div class="l">executed / calendar-day</div></div>
      <div class="bignum"><div class="v">${fmt(md.total)}</div><div class="l">executed / man-day</div></div>
      <div class="pdmeta bycol">
        <div>Working days in range: <b>${fmt(agg.workingDays)}</b> <span class="muted">(Mon–Fri − VN public holidays)</span></div>
        <div>Test-case execution man-days (team): <b>${fmt(md.manDaysTotal)}</b></div>
      </div>
    </div>
    <div class="subh">By tester</div>
    <div class="pdwrap"><table class="pdtbl">
      <thead><tr><th>Tester</th><th>Executed</th><th>Working days</th><th>/ cal-day</th><th>Exec hours</th><th>Workload</th><th>Man-days</th><th>/ man-day</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="muted pdnote">Per calendar-day = executed ÷ working days (per-tester rates sum to the team total — shared denominator). Per man-day = executed ÷ (exec hours ÷ ${cfg.WORK_HOURS_PER_DAY} × workload); the team figure is the BLENDED rate (Σ executed ÷ Σ man-days), so it is not the sum of the per-tester rates.</p>
    <div class="subh">Trend · executed / calendar-day</div>${seriesChart(agg.series, members)}
  </div>`;
}

function perDayRangeSection(meta, m, def, lead, members) {
  const blocks = METRIC_RANGE_ORDER.filter((k) => m.ranges[k]).map((k) => perDayBlock(m.ranges[k], k === def, members)).join('\n');
  return `<section class="metric${lead ? ' lead' : ''}">
    <h2>${esc(meta.label)} ${lead ? '<span class="pill">primary</span>' : ''} <span class="muted">· KPI: ${esc(m.kpiName)}</span></h2>
    ${blocks}
  </section>`;
}

function selector(ranges, def) {
  return '<div class="ranges">' + METRIC_RANGE_ORDER.filter((k) => ranges[k]).map((k) =>
    `<button type="button" data-rangebtn="${k}" class="${k === def ? 'active' : ''}">${esc(ranges[k].label)}</button>`).join('') + '</div>';
}
// `order` defaults to the 4 base ranges (Worklog page); the Metrics view passes
// METRIC_RANGE_ORDER so its "Showing …" line includes the Last year window too.
function windowSpans(ranges, def, order = RANGE_ORDER) {
  return order.filter((k) => ranges[k]).map((k) =>
    `<span class="range-window${k === def ? ' is-active' : ''}" data-range="${k}"><b>${esc(ranges[k].from)}</b> → <b>${esc(ranges[k].to)}</b></span>`).join('');
}

// A hover note (like the Worklog "how columns are computed") that shows the query
// behind each metric, WITH the date window of the currently-selected range. The
// per-range variants are pre-rendered and toggled client-side via the same
// data-range mechanism as the metric cards, so switching range updates the JQL too.
// Query shape depends on the metric's source list in config: Odoo KPI (a DB query,
// not a JQL), a `created`-by-reporter Jira JQL, or the per-day worklog / status-
// transition JQL (which is run per day×tester and summed).
function jqlNote(metrics, ranges, def, kpiJql) {
  if (!metrics || !metrics.length) return '';
  const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
  const code = (s) => `<code>${esc(s)}</code>`;
  const reporters = cfg.MEMBERS.map((m) => m.jira).join(', ');
  const memberNames = cfg.MEMBERS.map((m) => m.name).join(', ');
  const byKey = (arr) => new Map((arr || []).map((m) => [m.key, m]));
  const odoo = byKey(cfg.KPI_METRICS), created = byKey(cfg.JIRA_METRICS),
    worklog = byKey(cfg.JIRA_WORKLOG_METRICS), unique = byKey(cfg.JIRA_UNIQUE_METRICS),
    frd = byKey(cfg.JIRA_FRD_METRICS),
    derived = byKey(cfg.JIRA_DERIVED_METRICS), trans = byKey(cfg.JIRA_TRANSITION_METRICS),
    split = byKey(cfg.JIRA_SPLIT_METRICS);
  // Day before an ISO date: worklogDate > (from − 1 day) == worklogDate >= from,
  // written the way the team's sample "Unique Executed Test Cases" JQL is.
  const dayBefore = (iso) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };

  const queryFor = (meta, r) => {
    if (odoo.has(meta.key)) {
      const raw = kpiJql && kpiJql[meta.kpiName];
      if (raw) {
        return `Odoo KPI — sums the daily count over date ∈ [${esc(r.from)} … ${esc(r.to)}]. Odoo runs this Jira filter ` +
          `per tester, per day, to fill ${code('nakivo.kpi.database')}:<br>${code(raw)}<br>` +
          `<span class="muted">Odoo substitutes: %(reported)s = tester’s Jira user, %(current_day)s = the day, %(during)s = the day window.</span>`;
      }
      return `Odoo ${code('nakivo.kpi.database')} · name = ${code(meta.kpiName)} · employee ∈ {${esc(memberNames)}}` +
        ` · date ∈ [${esc(r.from)} … ${esc(r.to)}] — sum of daily ${code('result_count')} (KPI’s own JQL not available this build).`;
    }
    if (created.has(meta.key)) {
      const m = created.get(meta.key);
      // Mirror sources/support-ticket.js buildJql, config-driven so both the type-based
      // metrics and the field-based leaked-defects metric render their real query.
      const parts = [];
      if (m.project) parts.push(`project = ${m.project}`);
      if (m.types) parts.push(`type in (${m.types.map(q).join(', ')})`);
      if (m.leakField) parts.push(`${q(m.leakField)} is not EMPTY`);
      (m.labels || []).forEach((l) => parts.push(`labels = ${q(l)}`));
      if (m.excludeResolutions && m.excludeResolutions.length)
        parts.push(`(resolution is EMPTY OR resolution not in (${m.excludeResolutions.map(q).join(', ')}))`);
      if (m.priorities) parts.push(`priority in (${m.priorities.map(q).join(', ')})`);
      parts.push(`createdDate >= ${q(r.from)}`, `createdDate <= ${q(r.to)}`);
      if (!m.splitOtherReporters) parts.push(`reporter in (${reporters})`);
      const suffix = m.splitOtherReporters
        ? ` <span class="muted">— counted by ${code('created')} day + reporter; non-team reporters grouped into “Other”${m.yearBucket === 'quarter' ? '. This year / Last year Trend is bucketed per QUARTER' : ''}.</span>`
        : '';
      return code(parts.join(' AND ')) + suffix;
    }
    if (worklog.has(meta.key)) {
      const m = worklog.get(meta.key);
      return `for each day D in [${esc(r.from)} … ${esc(r.to)}], per tester T: ` +
        code(`issuetype = ${q(m.issueType)} AND worklogAuthor in (T) AND worklogDate > "D−1" AND worklogDate <= "D"`) +
        ` <span class="muted">— daily counts summed</span>`;
    }
    if (unique.has(meta.key)) {
      const m = unique.get(meta.key);
      const proj = m.project ? `project = ${m.project} AND ` : '';
      return `per tester T, ONE window query: ` +
        code(`${proj}issuetype = ${q(m.issueType)} AND worklogAuthor in (T) AND worklogDate > ${q(dayBefore(r.from))} AND worklogDate <= ${q(r.to)}`) +
        ` <span class="muted">— DISTINCT test cases, counted once per range (not summed)</span>`;
    }
    if (frd.has(meta.key)) {
      const m = frd.get(meta.key);
      const labels = (m.labels || []).map((l) => `labels = ${q(l)}`).join(' AND ');
      const scope = labels ? `${labels} AND ` : '';
      const markers = (m.estimateMarkers || ['estimation', 'Manday']).map((x) => `comment ~ ${q(x)}`).join(' OR ');
      return `worked — ONE window query for the whole team: ` +
        code(`${scope}worklogAuthor in (${reporters}) AND worklogDate > ${q(dayBefore(r.from))} AND worklogDate <= ${q(r.to)}`) +
        `<br>done — the same, plus ` + code(`AND statusCategory = ${q(m.doneStatusCategory || 'Done')}`) +
        `<br>estimates provided — the same, plus ` + code(`AND (assignee not in (${reporters})${markers ? ` OR ${markers}` : ''})`) +
        `<br><span class="muted">in progress = worked − done. Worked is split FRD / Spec review / I2L by the QA activity in the summary. DISTINCT issues, counted once for the team per range (not per tester, not summed).</span>`;
    }
    if (trans.has(meta.key)) {
      const m = trans.get(meta.key);
      return `for each day D in [${esc(r.from)} … ${esc(r.to)}], per tester T: ` +
        code(`${m.scopeJql} AND status changed to (${m.changedToStatus}) during ("D 00:00", "D 23:59") BY T`) +
        ` <span class="muted">— daily counts summed</span>`;
    }
    if (split.has(meta.key)) {
      const m = split.get(meta.key);
      const src = trans.get(m.sourceKey) || {};
      const scope = src.scopeJql || '"Automation scope" = yes';
      const changed = src.changedToStatus || 'resolved';
      return `for each day D in [${esc(r.from)} … ${esc(r.to)}], per tester T: ` +
        code(`${scope} AND status changed to (${changed}) during ("D 00:00", "D 23:59") BY T`) +
        `<br><span class="muted">daily counts summed, then split at ${esc(m.claudeCutoff)}: with Claude = D ≥ ${esc(m.claudeCutoff)}, legacy = D &lt; ${esc(m.claudeCutoff)}, total = both (no extra query — reuses “Automation Test cases created”).</span>`;
    }
    if (derived.has(meta.key)) {
      const m = derived.get(meta.key);
      const proj = m.project ? `project = ${m.project} AND ` : '';
      const workloads = cfg.MEMBERS.map((mm) => `${esc(mm.name)} ${Math.round((mm.workload || 0) * 100)}%`).join(', ');
      return `a RATE — numerator is the DISTINCT executed count (per tester T, ONE window query): ` +
        code(`${proj}issuetype = ${q(m.issueType)} AND worklogAuthor in (T) AND worklogDate > ${q(dayBefore(r.from))} AND worklogDate <= ${q(r.to)}`) +
        `<br><span class="muted">Per calendar-day = executed ÷ working days (Mon–Fri in [${esc(r.from)} … ${esc(r.to)}] minus VN public holidays). ` +
        `Per man-day = executed ÷ (test-case worklog hours ÷ ${cfg.WORK_HOURS_PER_DAY} × workload; ${workloads}).</span>`;
    }
    return '<span class="muted">n/a</span>';
  };

  const rows = metrics.map((meta) => {
    const variants = METRIC_RANGE_ORDER.filter((k) => ranges[k]).map((k) =>
      `<div class="jqlv${k === def ? ' is-active' : ''}" data-range="${k}">${queryFor(meta, ranges[k])}</div>`).join('');
    return `<li><b>${esc(meta.label)}</b>${variants}</li>`;
  }).join('');

  const notes = [
    'The date window matches the range button selected above — switch the range to update every query.',
    `Team scope: reporter / worklogAuthor / “BY” ∈ {${esc(memberNames)}}.`,
    'Odoo KPI metrics show the Jira filter from the KPI’s Odoo definition (nakivo.kpi.category.employee · jira_filter), read live each build; Odoo runs it per tester per day and this report sums the resulting daily counts over the range.',
    'Worklog- & transition-based metrics run one count per day × tester and SUM them, so a test case active on N days counts N times — the range total can exceed the distinct-issue count of a single-window JQL.',
    '“Unique Executed Test Cases” instead runs ONE window query per tester over the whole range, so a test case worked on many days counts ONCE — it is the distinct-count counterpart of “Manual Test cases executed” (which sums per day and can be larger). Its trend bars are per-bucket distinct counts, so they need not sum to the range total.',
    '“Executed test cases per day” is a RATE derived from that distinct count: per calendar-day = executed ÷ working days (Mon–Fri minus VN public holidays), and per man-day = executed ÷ test-case-execution man-days, where man-days = test-case worklog hours ÷ 8 × the tester’s workload. The per-man-day team figure is the blended rate (Σ executed ÷ Σ man-days).',
    '“Test cases automated — with vs without Claude” adds no query: it re-uses the “Automation Test cases created” daily series and splits each range at the team’s Claude-adoption date (2026-06-05, first Claude co-authored commit) — with Claude = resolved on/after it, legacy = before it, Total = both (so Total matches that card for the same range).',
  ];

  return `<div class="wlnote wlnote-jql" tabindex="0">ℹ️ JQL for each metric<span class="wlnote-hint"> (for the selected range — hover)</span>
    <div class="wlnote-pop">
      <div class="wlnote-h">Query per metric</div>
      <ul class="jqllist">${rows}</ul>
      <div class="wlnote-h">Notes</div>
      <ul>${notes.map((n) => `<li>${n}</li>`).join('')}</ul>
    </div>
  </div>`;
}

function sourceBanner(sources) {
  const bad = Object.entries(sources).filter(([, v]) => v && v.status !== 'ok');
  if (!bad.length) return '';
  return `<div class="warn">⚠ Some sources failed: ` +
    bad.map(([k, v]) => `${esc(k)} (${esc(v.message || 'error')})`).join('; ') + '</div>';
}

/* --------------------- QA CRM · Jira · Dashboard (STUCK) ---------------------- */
// A LIST metric: the "STUCK — Dev done, QA not tested" card shows a headline total
// + a per-assignee split + a table of the Resolved-but-not-tested issues (data from
// sources/stuck.js: ranges[key] = { total, byEmployee, issues:[{key,summary,type,
// assignee,resolved,daysStuck}] }). Renders like slide 17 of the QA Quarterly deck.

// One row per stuck issue (most-stuck first). Key links to Jira; "days stuck" turns
// red past 30 days to flag the long-waiting ones.
function stuckIssueTable(agg, jiraBase) {
  if (!agg.issues || !agg.issues.length) {
    return '<p class="muted">No stuck issues in this range — nothing is waiting on QA. 🎉</p>';
  }
  const rows = agg.issues.map((it) => {
    const url = `${jiraBase}/browse/${encodeURIComponent(it.key)}`;
    const days = it.daysStuck == null ? '—' : it.daysStuck;
    const hot = it.daysStuck != null && it.daysStuck >= 30 ? ' stuck-hot' : '';
    return `<tr>
      <td class="skey"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(it.key)}</a></td>
      <td class="ssum">${esc(it.summary)}</td>
      <td class="stype">${esc(it.type)}</td>
      <td class="sasg">${esc(it.assignee)}</td>
      <td class="sres num">${esc(it.resolved || '—')}</td>
      <td class="sdays num${hot}">${days}</td>
    </tr>`;
  }).join('');
  return `<div class="stuckwrap"><table class="stucktbl">
    <thead><tr><th>Key</th><th>Summary</th><th>Type</th><th>Assignee</th><th class="num">Resolved</th><th class="num">Days stuck</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function stuckRangeBlock(agg, active, jiraBase) {
  return `<div class="range-block${active ? ' is-active' : ''}" data-range="${esc(agg.key)}">
    <div class="grid">
      <div class="bignum"><div class="v">${fmt(agg.total)}</div><div class="l">stuck</div></div>
      <div class="bycol"><div class="subh">By assignee</div>${employeeBars(agg.byEmployee)}</div>
    </div>
    <div class="subh">Dev done (Resolved) · waiting on QA — most stuck first</div>
    ${stuckIssueTable(agg, jiraBase)}
  </div>`;
}

function stuckSection(meta, m, def, jiraBase) {
  const blocks = STUCK_RANGE_ORDER.filter((k) => m.ranges[k]).map((k) => stuckRangeBlock(m.ranges[k], k === def, jiraBase)).join('\n');
  return `<section class="metric lead">
    <h2>${esc(meta.label)} <span class="pill">primary</span> <span class="muted">· ${esc(m.kpiName)}</span></h2>
    ${blocks}
  </section>`;
}

function stuckSelector(ranges, def) {
  return '<div class="ranges">' + STUCK_RANGE_ORDER.filter((k) => ranges[k]).map((k) =>
    `<button type="button" data-rangebtn="${k}" class="${k === def ? 'active' : ''}">${esc(ranges[k].label)}</button>`).join('') + '</div>';
}

// The JQL-per-range hover note for the STUCK metric (mirrors jqlNote's styling but
// for this single list metric, whose query is a status snapshot, not a daily count).
function stuckJqlNote(meta, ranges, def) {
  const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
  const code = (s) => `<code>${esc(s)}</code>`;
  const users = cfg.MEMBERS.map((m) => m.jira).join(', ');
  const names = cfg.MEMBERS.map((m) => m.name).join(', ');
  const excl = meta.excludeIssueTypes.map(q).join(', ');
  const variants = STUCK_RANGE_ORDER.filter((k) => ranges[k]).map((k) => {
    const r = ranges[k];
    const jql = `assignee in (${users}) AND status = ${meta.currentStatus} AND issuetype not in (${excl}) ` +
      `AND status changed to (${meta.changedToStatus}) during (${q(`${r.from} 00:00`)}, ${q(`${r.to} 23:59`)})`;
    return `<div class="jqlv${k === def ? ' is-active' : ''}" data-range="${k}">${code(jql)}</div>`;
  }).join('');
  const notes = [
    'A “stuck” issue = Dev has finished it (it is currently in <b>Resolved</b>) but QA has not yet verified/advanced it — assigned to the team, excluding the team’s own Test-Case / Support-Ticket issue types.',
    '“Days stuck” = today − the issue’s resolution date.',
    'The range window bounds WHEN the issue entered Resolved; the status = Resolved clause is point-in-time, so only issues STILL sitting in Resolved appear.',
    `Team scope: assignee ∈ {${esc(names)}}. Sorted most-stuck first.`,
  ];
  return `<div class="wlnote wlnote-jql" tabindex="0">ℹ️ JQL for this metric<span class="wlnote-hint"> (for the selected range — hover)</span>
    <div class="wlnote-pop">
      <div class="wlnote-h">Query</div>
      <ul class="jqllist"><li><b>${esc(meta.label)}</b>${variants}</li></ul>
      <div class="wlnote-h">Notes</div>
      <ul>${notes.map((n) => `<li>${n}</li>`).join('')}</ul>
    </div>
  </div>`;
}

/* ------------------- Defect quality — created (QUALITY) ---------------------- */
// Slide #10 of the QA Quarterly Review deck ("QUALITY — Defect quality — created in
// Q2 / Leaked defects list"), CRM-team version, shown on the Jira Dashboard page in
// its OWN full 6-range scope (independent of the STUCK metric's quarter-only one).
// Slide-style stat cards — Bugs created / Leaked defects / Leakage rate — plus a
// "Leaked defects list" table. Data per range from sources/defect-quality.js:
// ranges[key] = { bugsCreated, byEmployee, leaked, leakRate, priorityBreakdown, leakedIssues }.

// The "Leaked defects list" table (highest priority first). Reuses the .stucktbl style.
function defectLeakedTable(agg, jiraBase) {
  if (!agg.leakedIssues || !agg.leakedIssues.length) {
    return '<p class="muted">No leaked defects (P1–P3) classified in this range. 🎉</p>';
  }
  const rows = agg.leakedIssues.map((it) => {
    const url = `${jiraBase}/browse/${encodeURIComponent(it.key)}`;
    return `<tr>
      <td class="skey"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(it.key)}</a></td>
      <td class="ssum">${esc(it.summary)}</td>
      <td class="stype">${esc(it.priority)}</td>
      <td class="sasg">${esc(it.reporter)}</td>
      <td class="sres num">${esc(it.created || '—')}</td>
    </tr>`;
  }).join('');
  return `<div class="stuckwrap"><table class="stucktbl">
    <thead><tr><th>Key</th><th>Summary</th><th>Priority</th><th>Reporter</th><th class="num">Created</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function defectQualityBlock(agg, active, jiraBase) {
  // `v` is already display-formatted (a count or "N%"), so it is interpolated raw.
  const card = (v, label, sub, cls) =>
    `<div class="frdcard ${cls}"><div class="fv">${v}</div><div class="fl">${esc(label)}</div><div class="fsub">${esc(sub)}</div></div>`;
  const split = (agg.byEmployee || []).map((e) => `${e.name} ${e.value}`).join(' · ') || 'by reporter';
  const pr = agg.priorityBreakdown || { p1: 0, p2: 0, p3: 0 };
  const prLine = `${pr.p1} P1 · ${pr.p2} P2 · ${pr.p3} P3`;
  return `<div class="range-block${active ? ' is-active' : ''}" data-range="${esc(agg.key)}">
    <div class="frdcards">
      ${card(fmt(agg.bugsCreated), 'Bugs created', split, 'lead')}
      ${card(fmt(agg.leaked), 'Leaked defects', prLine, 'prog')}
      ${card(`${agg.leakRate}%`, 'Leakage rate', 'leaked ÷ bugs created', 'est')}
    </div>
    <div class="subh">Leaked defects list · highest priority first</div>
    ${defectLeakedTable(agg, jiraBase)}
  </div>`;
}

function defectQualitySection(meta, m, def, jiraBase) {
  const blocks = METRIC_RANGE_ORDER.filter((k) => m.ranges[k]).map((k) => defectQualityBlock(m.ranges[k], k === def, jiraBase)).join('\n');
  return `<section class="metric lead">
    <h2>${esc(meta.label)} <span class="pill">primary</span> <span class="muted">· KPI: ${esc(m.kpiName)}</span></h2>
    ${blocks}
    <p class="muted frdnote"><b>Bugs created</b> = the team's saved "bugs created" filter, split per tester by reporter and summed. <b>Leaked defects</b> = bugs labelled QA-Ticket_verification whose "Leaked defect priority" is set (a defect that escaped QA), prioritised P1–P3 — a whole-team classification, not per reporter. <b>Leakage rate</b> = leaked ÷ bugs created. Both queries reproduce the team's saved JQL verbatim (bugs created uses <code>created &gt; (from − 1 day)</code>, matching what Jira shows). The list shows every leaked defect in the range, highest priority first.</p>
  </section>`;
}

// The JQL-per-range hover note for the Defect-quality metric (mirrors stuckJqlNote).
function defectJqlNote(meta, ranges, def) {
  const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
  const code = (s) => `<code>${esc(s)}</code>`;
  const users = cfg.MEMBERS.map((m) => m.jira).join(', ');
  const names = cfg.MEMBERS.map((m) => m.name).join(', ');
  const dayBefore = (iso) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
  const types = meta.bugTypes.map(q).join(', ');
  const statuses = meta.bugStatuses.map(q).join(', ');
  const trans = meta.bugResolvedTransitions.map(q).join(', ');
  const prios = meta.leakPriorities.map(q).join(', ');
  const variants = METRIC_RANGE_ORDER.filter((k) => ranges[k]).map((k) => {
    const r = ranges[k];
    const bugs = `type in (${types}) AND created > ${q(dayBefore(r.from))} AND created <= ${q(r.to)} AND reporter in (${users}) AND (status in (${statuses}) OR resolution changed to (${trans}))`;
    const leaked = `labels in (${q(meta.leakLabel)}) AND ${q(meta.leakField)} is not EMPTY AND createdDate >= ${q(r.from)} AND createdDate <= ${q(r.to)} AND priority in (${prios})`;
    return `<div class="jqlv${k === def ? ' is-active' : ''}" data-range="${k}"><b>Bugs created</b> (per tester, summed):<br>${code(bugs)}<br><b>Leaked defects</b> (whole team):<br>${code(leaked)}</div>`;
  }).join('');
  const notes = [
    'Bugs created is split per tester by <b>reporter</b> and summed; leaked defects is a whole-team classification (the “Leaked defect priority” field is set), not per reporter.',
    'Leakage rate = leaked ÷ bugs created (P1–P3 leaked defects over all bugs created in the range).',
    'These reproduce the team’s saved filters verbatim: <b>bugs created</b> uses <code>created &gt; (from − 1 day)</code>, so it includes the day before the range start and, being a datetime compared to a bare date, drops the end day’s daytime — matching the count seen in Jira.',
    `Team scope: reporter ∈ {${esc(names)}}. Leaked defects sorted highest priority first.`,
  ];
  return `<div class="wlnote wlnote-jql" tabindex="0">ℹ️ JQL for this metric<span class="wlnote-hint"> (for the selected range — hover)</span>
    <div class="wlnote-pop">
      <div class="wlnote-h">Query</div>
      <ul class="jqllist"><li><b>${esc(meta.label)}</b>${variants}</li></ul>
      <div class="wlnote-h">Notes</div>
      <ul>${notes.map((n) => `<li>${n}</li>`).join('')}</ul>
    </div>
  </div>`;
}

/* ------------------------- FRD / Spec Review / I2L --------------------------- */
// Slide #15 of the QA Quarterly Review deck, whole-team. A slide-style stat-card card
// (NOT the count/trend layout): headline "worked" (with a FRD/Spec review/I2L split
// line, like the slide's "16 I2L + 5 FRD") + "done" + "in progress" + "estimates
// provided", range-selectable, defaulting to the previous complete quarter (the "Q2"
// snapshot). Data per range from sources/frd.js: ranges[key] =
// { worked, done, inProgress, estimates, breakdown:{frd,specReview,i2l,other} }.

// The sub-line under "worked": "N FRD · N Spec review · N I2L" (only non-zero buckets).
function frdBreakdownLine(bd) {
  if (!bd) return 'distinct issues logged';
  const parts = [];
  if (bd.frd) parts.push(`${bd.frd} FRD`);
  if (bd.specReview) parts.push(`${bd.specReview} Spec review`);
  if (bd.i2l) parts.push(`${bd.i2l} I2L`);
  if (bd.other) parts.push(`${bd.other} other`);
  return parts.length ? parts.join(' · ') : 'distinct issues logged';
}

function frdBlock(agg, active) {
  const card = (v, label, sub, cls) =>
    `<div class="frdcard ${cls}"><div class="fv">${fmt(v)}</div><div class="fl">${esc(label)}</div><div class="fsub">${esc(sub)}</div></div>`;
  return `<div class="range-block${active ? ' is-active' : ''}" data-range="${esc(agg.key)}">
    <div class="frdcards">
      ${card(agg.worked, 'FRD / I2L worked', frdBreakdownLine(agg.breakdown), 'lead')}
      ${card(agg.done, 'Done', 'resolved / closed', 'done')}
      ${card(agg.inProgress, 'In progress', 'open / in progress / reopened', 'prog')}
      ${card(agg.estimates || 0, 'Estimates provided', 'assignee ≠ QA, or QA gave an estimate', 'est')}
    </div>
  </div>`;
}

function frdSection(meta, m, def) {
  const blocks = METRIC_RANGE_ORDER.filter((k) => m.ranges[k]).map((k) => frdBlock(m.ranges[k], k === def)).join('\n');
  return `<section class="metric lead">
    <h2>${esc(meta.label)} <span class="pill">primary</span> <span class="muted">· KPI: ${esc(m.kpiName)}</span></h2>
    ${blocks}
    <p class="muted frdnote">Distinct Jira issues labelled QA-FRD/I2L/Spec that the team logged work on in the selected range — counted ONCE for the team (a spec worked on by both testers is not double-counted). <b>Worked</b> is split by the QA activity in the summary (FRD / Spec review / I2L). <b>Done</b> = statusCategory Done (Resolved / Closed); <b>In progress</b> = everything else (Open / In Progress / Reopened); Worked = Done + In progress. <b>Estimates provided</b> = worked specs whose assignee is not a QA team member (handed back after estimating) OR that carry a QA estimate comment.</p>
  </section>`;
}

/* --------- Test cases automated — with vs without Claude (SPLIT card) --------- */
// Slide #16 stat cards for the SPLIT metric (config.split): three cards — Legacy
// (without Claude) / With Claude / Total — partitioning a transition metric's daily
// series at the Claude-adoption cutoff. Reuses the .frdcards / .frdcard styles and the
// .range-block / data-range range switcher, so it reacts to the same range buttons as
// every other "By range" card. See sources/automation-split.js for the range shape.
function splitBlock(agg, active) {
  const card = (v, label, sub, cls) =>
    `<div class="frdcard ${cls}"><div class="fv">${fmt(v)}</div><div class="fl">${esc(label)}</div><div class="fsub">${esc(sub)}</div></div>`;
  return `<div class="range-block${active ? ' is-active' : ''}" data-range="${esc(agg.key)}">
    <div class="frdcards">
      ${card(agg.withoutClaude, 'Automated w/o Claude (legacy)', `${agg.pctWithout}% · resolved before ${esc(agg.claudeCutoff)}`, 'est')}
      ${card(agg.withClaude, 'Automated with Claude', `${agg.pctWith}% · resolved from ${esc(agg.claudeCutoff)}`, 'lead')}
      ${card(agg.total, 'Total automated', 'Automation scope = Yes', 'done')}
    </div>
  </div>`;
}

function splitRangeSection(meta, m, def, lead, members) {
  const blocks = METRIC_RANGE_ORDER.filter((k) => m.ranges[k]).map((k) => splitBlock(m.ranges[k], k === def)).join('\n');
  return `<section class="metric${lead ? ' lead' : ''}">
    <h2>${esc(meta.label)} ${lead ? '<span class="pill">primary</span>' : ''} <span class="muted">· KPI: ${esc(m.kpiName)}</span></h2>
    ${blocks}
    <p class="muted frdnote">Automation-scope test cases (<code>"Automation scope" = yes</code>) counted on the day their status changed to <b>Resolved</b>, summed over the selected range and split at the team's Claude-adoption date <b>${esc(meta.claudeCutoff)}</b> (first Claude co-authored commit in CRM_AUTO_PLAYWRIGHT). <b>With Claude</b> = resolved on/after the cutoff; <b>without Claude (legacy)</b> = before it; <b>Total</b> = both — the same signal as “Automation Test cases created”, so Total matches that card for the same range.</p>
  </section>`;
}

/* --------------------- Claude vs Legacy — automation velocity ---------------- */
// DERIVED, render-only: reuses the SPLIT metric's per-range figures
// (from / to / claudeCutoff / withClaude / withoutClaude — see
// sources/automation-split.js) and turns the raw counts into a RATE comparison
// (test cases automated per calendar day) so the two UNEQUAL windows — legacy =
// range start → day before the Claude-adoption cutoff; with Claude = cutoff →
// range end — are compared fairly. Adds no data and no Jira query. Reacts to the
// same .range-block / data-range switcher as every other "By range" card. Three
// shapes fall out of the windows: both present (full lift card), Claude-only (a
// range entirely after adoption → no legacy baseline), legacy-only (a pre-adoption
// range → no Claude activity). The 185.81h / 36%-effort line is a fixed annotation
// (that figure is tracked outside this report) shown only for the Apr–Jun (Last
// quarter) range it describes.
const DAY_MS = 86400000;
const isoToMs = (s) => { const p = String(s).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };
const isoFromMs = (ms) => { const d = new Date(ms), z = (n) => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}`; };
const daysInclusive = (from, to) => { const n = Math.round((isoToMs(to) - isoToMs(from)) / DAY_MS) + 1; return n > 0 ? n : 0; };
const rate2 = (n) => (Math.round(n * 100) / 100).toFixed(2);
const perMonth = (r) => fmt(Math.round(r * 30));
const perWeek = (r) => fmt(Math.round(r * 7));

function velocityBlock(agg, active) {
  const cutoff = agg.claudeCutoff;
  const legacyEnd = isoFromMs(isoToMs(cutoff) - DAY_MS);               // day before the cutoff
  const claudeStart = agg.from >= cutoff ? agg.from : cutoff;
  const legacyDays = agg.from <= legacyEnd ? daysInclusive(agg.from, agg.to < legacyEnd ? agg.to : legacyEnd) : 0;
  const claudeDays = agg.to >= claudeStart ? daysInclusive(claudeStart, agg.to) : 0;
  const legacyRate = legacyDays > 0 ? agg.withoutClaude / legacyDays : 0;
  const claudeRate = claudeDays > 0 ? agg.withClaude / claudeDays : 0;
  const maxRate = Math.max(legacyRate, claudeRate);

  let hero;
  if (legacyRate > 0 && claudeRate > 0) {
    const lift = Math.round((claudeRate / legacyRate - 1) * 100);
    const wouldTake = agg.withClaude / legacyRate;                    // days the legacy pace needs for Claude's output
    const daysSaved = Math.max(0, Math.round(wouldTake - claudeDays));
    const extraTcs = Math.max(0, Math.round(agg.withClaude - legacyRate * claudeDays));
    hero = `<div class="velo-hero">
      <div>
        <div class="velo-label">Velocity lift with Claude</div>
        <div class="velo-big">${lift >= 0 ? '+' : ''}${lift}%</div>
        <div class="velo-sub">≈ ${rate2(claudeRate / legacyRate)}× the legacy pace — ${rate2(legacyRate)} → ${rate2(claudeRate)} test cases per day</div>
      </div>
      <div class="velo-asides">
        <div class="velo-aside"><span class="n">~${fmt(daysSaved)}</span><span class="k">days saved</span></div>
        <div class="velo-aside"><span class="n">~${fmt(extraTcs)}</span><span class="k">extra TCs vs old pace</span></div>
      </div>
    </div>`;
  } else if (claudeRate > 0) {
    hero = `<div class="velo-hero one">
      <div>
        <div class="velo-label">With Claude — automation velocity</div>
        <div class="velo-big">${rate2(claudeRate)}<span class="unit">/day</span></div>
        <div class="velo-sub">No pre-Claude (legacy) resolutions in this range to compare against.</div>
      </div>
    </div>`;
  } else {
    hero = `<div class="velo-hero one">
      <div>
        <div class="velo-label">Legacy — automation velocity</div>
        <div class="velo-big">${rate2(legacyRate)}<span class="unit">/day</span></div>
        <div class="velo-sub">This range predates Claude adoption (${esc(cutoff)}) — no Claude activity to compare.</div>
      </div>
    </div>`;
  }

  const effort = agg.key === 'lastQuarter'
    ? `<div class="velo-effort"><span class="dot"></span>Claude output delivered on <b>185.81 hours</b> — <b>36% of effort</b> logged on automation tasks (Apr–Jun 2026)</div>`
    : '';

  const bar = (label, sub, rate, cls) => {
    const w = maxRate > 0 ? Math.max(3, Math.round((rate / maxRate) * 100)) : 0;
    return `<div class="velo-row">
      <div class="velo-name">${esc(label)}<span class="velo-days">${esc(sub)}</span></div>
      <div class="velo-track"><div class="velo-fill ${cls}" style="width:${w}%"></div></div>
      <div class="velo-rate">${rate2(rate)}<small>/day</small></div>
    </div>`;
  };
  const legacySpan = `${esc(agg.from)} → ${esc(legacyDays > 0 ? (agg.to < legacyEnd ? agg.to : legacyEnd) : agg.from)} · ${fmt(legacyDays)} days`;
  const claudeSpan = `${esc(claudeDays > 0 ? claudeStart : cutoff)} → ${esc(agg.to)} · ${fmt(claudeDays)} days`;
  const bars = `<div class="velo-bars">
      ${bar('Legacy', legacySpan, legacyRate, 'legacy')}
      ${bar('With Claude', claudeSpan, claudeRate, 'claude')}
    </div>
    <div class="velo-axis">Test cases automated per calendar day</div>`;

  const cardRaw = (disp, label, sub, cls, small) =>
    `<div class="frdcard ${cls}"><div class="fv"${small ? ' style="font-size:32px"' : ''}>${disp}</div><div class="fl">${esc(label)}</div><div class="fsub">${esc(sub)}</div></div>`;
  const cards = `<div class="frdcards">
      ${cardRaw(fmt(agg.withoutClaude), 'Automated w/o Claude (legacy)', `${fmt(legacyDays)} days · ~${perMonth(legacyRate)}/month`, 'est')}
      ${cardRaw(fmt(agg.withClaude), 'Automated with Claude', `${fmt(claudeDays)} days · ~${perMonth(claudeRate)}/month`, 'lead')}
      ${cardRaw(`${perWeek(legacyRate)} → ${perWeek(claudeRate)}`, 'Weekly throughput', 'TCs per week, legacy → Claude', 'done', true)}
    </div>`;

  return `<div class="range-block${active ? ' is-active' : ''}" data-range="${esc(agg.key)}">
    ${hero}
    ${effort}
    ${bars}
    ${cards}
  </div>`;
}

function velocitySection(meta, m, def) {
  const blocks = METRIC_RANGE_ORDER.filter((k) => m.ranges[k]).map((k) => velocityBlock(m.ranges[k], k === def)).join('\n');
  return `<section class="metric lead">
    <h2>Automation velocity — Claude vs Legacy <span class="pill">primary</span> <span class="muted">· KPI: ${esc(m.kpiName)}</span></h2>
    ${blocks}
    <p class="muted frdnote">Raw counts span unequal windows, so the fair comparison is <b>rate</b> — test cases automated per calendar day. <b>Legacy window</b> = range start → the day before the Claude-adoption cutoff <b>${esc(meta.claudeCutoff)}</b>; <b>with-Claude window</b> = cutoff → range end. <b>Velocity lift</b> = Claude rate ÷ legacy rate − 1. <b>Days saved</b> / <b>extra TCs</b> compare Claude's output against delivering the same work at the legacy pace over the same window. Counts reuse the “${esc(m.label)}” split (no extra query). The <b>185.81 h / 36%-effort</b> figure is tracked outside this report and shown for the Apr–Jun (Last quarter) range it describes.</p>
  </section>`;
}

/* ------------------ Executed Test Cases per main feature --------------------- */
// A grouped bar chart per Xray Test Repository module showing four outcomes —
// Executed, Passed, Failed, Aborted (Passed/Failed/Aborted from Xray TestRunStatus) —
// the CRM version of the OA report's "Executed test cases per feature" slide.
// Whole-team. Data per range from sources/feature-exec.js: featureExec.ranges[key] =
// { features:[{name, executed, passed, failed, aborted, isOther?}], totalExecuted,
// totalPassed, totalFailed, totalAborted }. Rendered ONLY on the Manual test page,
// "By range" view, reacting to the same range buttons as the other metrics (its
// per-range blocks share the .range-block / data-range mechanism).
const FEAT_SERIES = [
  { key: 'executed', label: 'Executed', color: '#2f6cb0' }, // blue
  { key: 'passed', label: 'Passed', color: '#2e8b4f' },     // green
  { key: 'failed', label: 'Failed', color: '#c0392b' },     // red
  { key: 'aborted', label: 'Aborted', color: '#9aa0a6' },   // grey
];

// Round a max value up to a "nice" axis top (5, 10, 20, 50, 100, 200, 500, 1000, …).
function niceCeil(v) {
  if (v <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function featureExecLegend() {
  return `<div class="flegend">` +
    FEAT_SERIES.map((sd) => `<span class="fl"><span class="sw" style="background:${sd.color}"></span>${esc(sd.label)}</span>`).join('') +
    `</div>`;
}

// Vertical grouped bars: one group per feature with an Executed / Passed / Failed /
// Aborted bar (FEAT_SERIES), value labels on top (0s omitted to cut clutter), and the
// (truncated, full-name-on-hover) module name rotated below. The SVG is sized to its
// content and lives in an overflow-x:auto wrapper so many modules scroll rather than
// squash. Passed/Failed/Aborted ⊆ Executed, so the y-axis top follows the executed max.
function featureExecChart(features) {
  if (!features || !features.length) return '<p class="muted">No executions in this range.</p>';
  const n = features.length;
  const padL = 40, padR = 16, padT = 22, padB = 96, bw = 16, gap = 4, ns = FEAT_SERIES.length;
  const groupInner = ns * bw + (ns - 1) * gap;
  const groupW = groupInner + 16;
  const W = padL + padR + n * groupW, H = 320;
  const base = H - padB, plotH = H - padT - padB;
  const top = niceCeil(Math.max(1, ...features.map((f) => f.executed || 0)));
  const yOf = (v) => base - (v / top) * plotH;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Executed / passed / failed / aborted per feature">`;
  const ticks = 4;
  for (let t = 0; t <= ticks; t++) {
    const val = Math.round((top * t) / ticks), yy = yOf(val);
    s += `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}" stroke="#ececec"/>`;
    s += `<text x="${padL - 6}" y="${(yy + 3).toFixed(1)}" font-size="9" text-anchor="end" fill="#aaa">${val}</text>`;
  }
  features.forEach((f, i) => {
    const gx = padL + i * groupW, startX = gx + (groupW - groupInner) / 2, cx = gx + groupW / 2;
    FEAT_SERIES.forEach((sd, j) => {
      const v = f[sd.key] || 0;
      const x = startX + j * (bw + gap), h = (v / top) * plotH;
      s += `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" fill="${sd.color}"><title>${esc(f.name)} — ${sd.label} ${v}</title></rect>`;
      if (v > 0) s += `<text x="${(x + bw / 2).toFixed(1)}" y="${(base - h - 4).toFixed(1)}" font-size="8" font-weight="700" text-anchor="middle" fill="${sd.color}">${v}</text>`;
    });
    const label = f.name.length > 20 ? `${f.name.slice(0, 19)}…` : f.name;
    s += `<text x="${cx.toFixed(1)}" y="${base + 12}" font-size="9" text-anchor="end" fill="#666" transform="rotate(-40 ${cx.toFixed(1)} ${base + 12})">${esc(label)}<title>${esc(f.name)}</title></text>`;
  });
  s += '</svg>';
  return `<div class="fchart-wrap">${s}</div>`;
}

// The JQL-per-range hover note (mirrors jqlNote's styling), toggled per range with the
// same data-range mechanism as the chart blocks.
function featureExecNote(fe, def) {
  const fx = cfg.FEATURE_EXEC;
  const users = cfg.MEMBERS.map((m) => m.jira).join(', ');
  const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
  const code = (s) => `<code>${esc(s)}</code>`;
  const dayBefore = (iso) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
  const variants = METRIC_RANGE_ORDER.filter((k) => fe.ranges[k]).map((k) => {
    const r = fe.ranges[k];
    const base = `project = ${fx.project} AND issuetype = ${q(fx.issueType)} AND worklogAuthor in (<tester>) AND worklogDate > ${q(dayBefore(r.from))} AND worklogDate <= ${q(r.to)}`;
    const exec = `${base} AND issue in testRepositoryFolderTests(${q(fx.project)}, ${q(`${fx.repoRoot}/<module>`)}, "true")`;
    return `<div class="jqlv${k === def ? ' is-active' : ''}" data-range="${k}">` +
      `<div><b>Executed</b> (per feature — run once per tester [${esc(users)}], then summed): ${code(exec)}</div>` +
      `<div><b>Passed</b>: ${code(`… AND ${fx.passedJql}`)} &nbsp;·&nbsp; <b>Failed</b>: ${code(`… AND ${fx.failedJql}`)} &nbsp;·&nbsp; <b>Aborted</b>: ${code(`… AND ${fx.abortedJql}`)}</div>` +
      `<div><b>Other</b> = grand total (same window, no folder clause) − Σ of all feature bars.</div>` +
      `</div>`;
  }).join('');
  const notes = [
    'Counts distinct test cases PER TESTER and sums them (one JQL per feature × outcome × tester), so a test case executed by BOTH testers counts once per tester (i.e. twice). This matches the per-person figures and the “Unique Executed Test Cases” card (Σ per-tester distinct = 802 in Q2), NOT the whole-team distinct union (782), and NOT the per-day sum used by “Manual Test cases executed”.',
    'Passed / Failed / Aborted come from the Xray run outcome (TestRunStatus = PASS / FAIL / aborted), NOT the Jira workflow status. A test case worked on but not yet run (TestRunStatus TODO/EXECUTING) counts in Executed only, so Passed+Failed+Aborted can be ≤ Executed.',
    'A feature (bar) maps to one or more Xray Test Repository folders (current membership): “CRM module” also counts its automation folder (CRM automation/CRM module); “Migration Odoo 12CE to 12CC” is its own top-level folder. A bar with 0 executed in the range is not drawn.',
    '“Other” = the range grand total minus the sum of the bars (computed per outcome). Σ(bars) + Other = the grand total.',
    'Counted per tester (worklogAuthor = each of the QA team) and summed. The date window follows the range button selected above.',
  ];
  return `<div class="wlnote wlnote-jql" tabindex="0">ℹ️ How executed / passed / failed / aborted are counted<span class="wlnote-hint"> (per selected range — hover)</span>
    <div class="wlnote-pop">
      <div class="wlnote-h">Query per feature (module)</div>
      ${variants}
      <div class="wlnote-h">Notes</div>
      <ul>${notes.map((x) => `<li>${x}</li>`).join('')}</ul>
    </div>
  </div>`;
}

function featureExecSection(fe, def) {
  const blocks = METRIC_RANGE_ORDER.filter((k) => fe.ranges[k]).map((k) => {
    const r = fe.ranges[k];
    const caption = r.features.length
      ? `<div class="fcaption">Total: <b>${fmt(r.totalExecuted)}</b> executed · <b>${fmt(r.totalPassed)}</b> passed · <b>${fmt(r.totalFailed)}</b> failed · <b>${fmt(r.totalAborted)}</b> aborted · ${r.features.length} feature${r.features.length === 1 ? '' : 's'}</div>`
      : '';
    return `<div class="range-block${k === def ? ' is-active' : ''}" data-range="${esc(k)}">
      ${featureExecLegend()}
      ${featureExecChart(r.features)}
      ${caption}
    </div>`;
  }).join('\n');
  return `<section class="metric lead">
    <h2>${esc(fe.label)} <span class="pill">Σ per tester</span> <span class="muted">· Post-EA Test Cases with a worklog in range, counted per tester and summed, by Xray Test Repository module · Passed/Failed/Aborted = Xray TestRunStatus</span></h2>
    ${featureExecNote(fe, def)}
    ${blocks}
  </section>`;
}

/* ------------- Valid bug reported - by Priority of bug (Manual test) --------- */
// A table of the VALID bugs the QA team REPORTED (created in range), by PRIORITY
// (rows) across three columns — Total / Backlog / Resolved-waiting-for-verification.
// Whole-team. Data per range from sources/bug-by-priority.js: bugByPriority.ranges[key]
// = { rows:[{priority, cells:{total,backlog,resolved}}], totalRow:{total,backlog,resolved} }.
// Rendered ONLY on the Manual test page, "By range" view, reacting to the same range
// buttons as the other metrics (its per-range blocks share the .range-block / data-range
// mechanism).
function bugByPriorityTable(bx, block) {
  const cols = bx.columns;
  const head = `<tr><th>Priority</th>${cols.map((c) => `<th class="num">${esc(c.label)}</th>`).join('')}</tr>`;
  const row = (label, cells, isTotal) =>
    `<tr${isTotal ? ' class="bp-total"' : ''}><td class="bp-pri">${esc(label)}</td>` +
    cols.map((c) => `<td class="num">${fmt(cells[c.key] || 0)}</td>`).join('') + `</tr>`;
  const body = block.rows.map((r) => row(r.priority, r.cells, false)).join('') +
    row('Total', block.totalRow, true);
  return `<div class="stuckwrap"><table class="stucktbl bptbl"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

// The JQL-per-range hover note (mirrors featureExecNote), toggled per range with the
// same data-range mechanism as the table blocks.
function bugByPriorityNote(bp, def) {
  const bx = cfg.BUG_BY_PRIORITY;
  const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
  const code = (s) => `<code>${esc(s)}</code>`;
  const reporters = cfg.MEMBERS.map((m) => m.jira).join(', ');
  const names = cfg.MEMBERS.map((m) => m.name).join(', ');
  const types = bx.types.map(q).join(', ');
  const variants = METRIC_RANGE_ORDER.filter((k) => bp.ranges[k]).map((k) => {
    const r = bp.ranges[k];
    const base = `issuetype in (${types}) AND createdDate >= ${q(r.from)} AND createdDate <= ${q(r.to)} AND reporter in (${reporters})`;
    const lines = bx.columns.map((c) => `<div><b>${esc(c.label)}</b>: ${code(`${base} AND ${c.clause}`)}</div>`).join('');
    return `<div class="jqlv${k === def ? ' is-active' : ''}" data-range="${k}">${lines}` +
      `<div class="muted" style="margin-top:5px">Each priority row appends ${code('AND priority in (<priorities of that row>)')}; the <b>Total</b> row is the column query above with no priority filter.</div></div>`;
  }).join('');
  const notes = [
    'Counts the VALID bugs the QA team REPORTED (created within the selected range), by the bug’s priority. Same issue-type set and reporter scope as the QA Ranking “Create Valid bugs” metric.',
    '<b>Total</b> = every valid reported bug: still-open (Open / Reopened / In Progress) OR one whose resolution was set to Fixed / Done / Won’t fix / Unresolved / Won’t Do. <b>Backlog</b> = the still-open subset (Open / Reopened / In Progress). <b>Resolved - waiting for verification</b> = currently in the Resolved status, awaiting QA verification.',
    'The three columns are independent status filters, so a bug can appear in both Total and Backlog (or Resolved). The priority rows sum to the Total row of each column.',
    `Team scope: reporter ∈ {${esc(names)}}. The date window follows the range button selected above.`,
  ];
  return `<div class="wlnote wlnote-jql" tabindex="0">ℹ️ How valid bugs by priority are counted<span class="wlnote-hint"> (per selected range — hover)</span>
    <div class="wlnote-pop">
      <div class="wlnote-h">Query per column</div>
      ${variants}
      <div class="wlnote-h">Notes</div>
      <ul>${notes.map((x) => `<li>${x}</li>`).join('')}</ul>
    </div>
  </div>`;
}

function bugByPrioritySection(bp, def) {
  const bx = cfg.BUG_BY_PRIORITY;
  const blocks = METRIC_RANGE_ORDER.filter((k) => bp.ranges[k]).map((k) => {
    const r = bp.ranges[k];
    const t = r.totalRow;
    const caption = `<div class="fcaption">Total valid bugs: <b>${fmt(t.total)}</b> · Backlog: <b>${fmt(t.backlog)}</b> · Resolved (waiting for verification): <b>${fmt(t.resolved)}</b></div>`;
    return `<div class="range-block${k === def ? ' is-active' : ''}" data-range="${esc(k)}">
      ${bugByPriorityTable(bx, r)}
      ${caption}
    </div>`;
  }).join('\n');
  return `<section class="metric bugpri">
    <h2>${esc(bp.label)} <span class="pill">by priority</span> <span class="muted">· Valid bugs the QA team reported (created in range), split by priority · Total / Backlog / Resolved-waiting-for-verification</span></h2>
    ${bugByPriorityNote(bp, def)}
    ${blocks}
  </section>`;
}

/* ----------------------------- Worklog allocation ---------------------------- */

function pageNav(active) {
  const tab = (href, key, label) =>
    `<a href="${href}" class="pgtab${active === key ? ' active' : ''}">${esc(label)}</a>`;
  return `<div class="pagenav">` +
    tab('index.html', 'jiraDashboard', 'QA CRM - Jira - Dashboard') +
    tab('frd.html', 'frd', 'FRD/Spec Review/I2L') +
    tab('manual.html', 'manual', 'Manual test') +
    tab('automation.html', 'automation', 'Automation test') +
    tab('worklog.html', 'worklog', 'Worklog allocation') +
    tab('claude.html', 'claude', 'Claude vs Legacy') +
    tab('ranking.html', 'ranking', 'QA Ranking') +
    `</div>`;
}

// Allow header wrapping only after '_' and '/' (and spaces) so multi-word labels
// like "QA-Feature_verification" break cleanly into segments, never mid-word.
const wbrLabel = (s) => esc(s).replace(/([_/])/g, '$1<wbr>');

// Natural-language explanation of how each column is computed, derived from the
// live config (labels + comment rules + excludes) so it always matches the logic.
function worklogHelp(columns) {
  const rules = cfg.WORKLOG_COMMENT_RULES || [];
  const byCol = {};
  rules.forEach((r) => { (byCol[r.column] = byCol[r.column] || []).push(r.contains); });
  const map = {};
  for (const c of columns) {
    if (c.kind === 'total') map[c.key] = 'Total of all Jira columns (EXCLUDES QA-FTO/SL/Holiday).';
    else if (c.kind === 'leave') map[c.key] = 'FTO + Sick Leave hours from Odoo hr.leave (approved only, by start date) + Vietnamese public holidays falling on a working day (Mon–Fri, 8h/day). Not Jira worklogs.';
    else if (c.kind === 'other') map[c.key] = 'Worklogs whose issue matches none of the label columns above (catch-all).';
    else if (byCol[c.key]) map[c.key] = `Worklogs whose comment contains ${byCol[c.key].map((k) => '“' + k + '”').join(' or ')} (checked before the label, case-insensitive), or issues labelled ${c.label}.`;
    else {
      let d = `Worklog hours on issues labelled ${c.label}.`;
      if (rules.length && /Feature_verification/.test(c.label)) d += ' Minus the worklogs whose comment contains “Smoke”/“Regression” (moved to those two columns).';
      map[c.key] = d;
    }
  }
  const notes = [
    'Each worklog is counted in exactly one column.',
    'A comment containing “Smoke”/“Regression” is checked BEFORE the label → it is split out of the label column (usually out of QA-Feature_verification).',
    'Issues labelled QA-FTO/SL: their Jira worklogs are dropped entirely (leave time comes from Odoo).',
    'Multi-label issues: only labels that have a column are counted; if several match, the earliest column wins.',
    'Figures are by the worklog / leave date, within the selected period.',
  ];
  return { map, notes };
}

function worklogTable(wl, agg, help) {
  const h = help || {};
  const cell = (c, v) => `<td class="num ${c.kind} ${c.key}">${fmt(v)}</td>`;
  const head = wl.columns.map((c) =>
    `<th class="${c.kind} ${c.key}"${h[c.key] ? ` title="${esc(h[c.key])}"` : ''}>${wbrLabel(c.label)}</th>`).join('');
  const body = agg.byTester.map((t) =>
    `<tr><td class="wname">${esc(t.name)}</td>${wl.columns.map((c) => cell(c, t.cols[c.key])).join('')}</tr>`).join('');
  const totalRow = `<tr class="wtotal"><td class="wname">Total</td>` +
    wl.columns.map((c) => cell(c, agg.totals[c.key])).join('') + `</tr>`;
  const pctRow = `<tr class="wpct"><td class="wname"></td>` +
    wl.columns.map((c) => `<td class="num ${c.kind} ${c.key}">${pct1(agg.pct[c.key])}</td>`).join('') + `</tr>`;
  return `<div class="wtblwrap"><table class="wtbl">
    <thead><tr><th class="wname">QA Name</th>${head}</tr></thead>
    <tbody>${body}${totalRow}${pctRow}</tbody>
  </table></div>`;
}

function piePath(cx, cy, r, a0, a1) {
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${cx},${cy} L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`;
}

function pieChart(title, slices) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (!total) return `<div class="pie"><div class="pietitle">${esc(title)}</div><p class="muted">No worklog in this range.</p></div>`;
  const cx = 90, cy = 90, r = 84;
  let svg = `<svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label="${esc(title)}">`;
  if (slices.length === 1) {
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${slices[0].color}"/>`;
  } else {
    let a = -Math.PI / 2;
    for (const s of slices) { const a1 = a + (s.value / total) * 2 * Math.PI; svg += `<path d="${piePath(cx, cy, r, a, a1)}" fill="${s.color}"/>`; a = a1; }
  }
  svg += '</svg>';
  const legend = slices.map((s) =>
    `<li><span class="sw" style="background:${s.color}"></span>${esc(s.label)} <b>${fmt(s.value)}</b> <span class="muted">${Math.round((s.value / total) * 100)}%</span></li>`).join('');
  return `<div class="pie"><div class="pietitle">${esc(title)}</div>
    <div class="pierow">${svg}<ul class="legend">${legend}</ul></div></div>`;
}

function piesFor(wl, agg) {
  const buckets = wl.columns.filter((c) => c.kind !== 'total');
  return '<div class="pies">' + agg.byTester.map((t) => {
    const slices = buckets
      .map((c, i) => ({ label: c.label, value: t.cols[c.key], color: wlColor(c.key, i) }))
      .filter((s) => s.value > 0)
      .sort((a, b) => b.value - a.value); // biggest task first (highest % on top)
    return pieChart(`${t.name} — ${agg.label}`, slices);
  }).join('') + '</div>';
}

function worklogView(wl, ranges, def, help) {
  if (!wl || !wl.columns) return '<p class="muted">No worklog data available.</p>';
  const h = help || worklogHelp(wl.columns);
  const blocks = RANGE_ORDER.filter((k) => wl.ranges[k]).map((k) => {
    const agg = wl.ranges[k];
    return `<div class="range-block${k === def ? ' is-active' : ''}" data-range="${esc(k)}">
      <section class="metric">
        <div class="subh">Team · hours logged in Jira (${esc(agg.from)} → ${esc(agg.to)})</div>
        ${worklogTable(wl, agg, h.map)}
      </section>
      <section class="metric">
        <div class="subh">Worklog by main tasks</div>
        ${piesFor(wl, agg)}
      </section>
    </div>`;
  }).join('\n');

  // Custom date range: the block is filled client-side (app.js) from the embedded
  // daily data when the user picks a start/end date.
  const minD = ranges.thisYear ? ranges.thisYear.from : '';
  const maxD = ranges.thisYear ? ranges.thisYear.to : '';
  const presetBtns = RANGE_ORDER.filter((k) => ranges[k]).map((k) =>
    `<button type="button" data-rangebtn="${k}" class="${k === def ? 'active' : ''}">${esc(ranges[k].label)}</button>`).join('');
  const spans = windowSpans(ranges, def) +
    `<span class="range-window" data-range="custom" id="wl-custom-window"></span>`;
  const customBlock = `<div class="range-block" data-range="custom">
      <section class="metric">
        <div class="subh">Team · hours logged in Jira <span id="wl-custom-sub" class="muted"></span></div>
        <div id="wl-custom-table"><p class="muted">Pick a Start and End date to see a custom range.</p></div>
      </section>
      <section class="metric">
        <div class="subh">Worklog by main tasks</div>
        <div id="wl-custom-pies"></div>
      </section>
    </div>`;
  const colHelp = wl.columns.map((c) => `<li><b>${esc(c.label)}</b> — ${esc(h.map[c.key] || '')}</li>`).join('');
  const genHelp = (h.notes || []).map((n) => `<li>${esc(n)}</li>`).join('');
  const note = `<div class="wlnote" tabindex="0">ℹ️ How columns are computed<span class="wlnote-hint"> (hover to see)</span>
    <div class="wlnote-pop">
      <div class="wlnote-h">How each column is computed</div>
      <ul>${colHelp}</ul>
      <div class="wlnote-h">General rules</div>
      <ul>${genHelp}</ul>
    </div>
  </div>`;
  const skipNote = wl.skipped
    ? `<div class="warn">⚠ ${wl.skipped} issue(s) were skipped on worklog read (no permission / read error); their hours are not counted.</div>`
    : '';
  // A copy-link 🔗 like the metric cards. It has no inner range-block, so the click
  // handler reads the page-level active range button — the copied URL keeps the
  // selected range (e.g. …#m-worklog&r=thisYear), and a custom range also carries &s/&e.
  const anchor = `<a class="anchor" href="#m-worklog" data-anchor title="Copy link to this view (keeps the selected range)" aria-label="Copy link to this view">🔗</a>`;
  return `${skipNote}<div class="wlhead" id="m-worklog"><span class="wlhead-t">Worklog allocation</span>${anchor}</div>
    <div class="sub muted" style="margin:4px 0 2px">Showing ${spans}</div>
    <div class="ranges">${presetBtns}<button type="button" data-rangebtn="custom" id="wl-custom-btn">Custom date</button></div>
    <div class="wl-dates">
      <label>Start <input type="date" id="wl-start" min="${esc(minD)}" max="${esc(maxD)}"></label>
      <label>End <input type="date" id="wl-end" min="${esc(minD)}" max="${esc(maxD)}"></label>
    </div>
    ${note}
    ${blocks}
    ${customBlock}`;
}

/* ---------------------------------- assets ----------------------------------- */

const CSS = `:root{font-family:Segoe UI,Arial,sans-serif;color:#222}
body{margin:0;background:#f4f5f7}
.hero{background:linear-gradient(135deg,#6a3093,#a044ff);color:#fff;padding:22px 28px}
.hero h1{margin:0;font-size:22px}.hero .sub{opacity:.92;font-size:13px;margin-top:6px}
.wrap{max-width:1000px;margin:0 auto;padding:14px 28px 60px}
.wrap.wide{max-width:1340px}
.wlhead{display:flex;align-items:center;gap:2px;margin:8px 0 2px}
.wlhead-t{font-size:16px;font-weight:700;color:#6a3093}
.wl-dates{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin:2px 0 4px;font-size:13px;color:#555}
.wl-dates label{display:flex;gap:6px;align-items:center}
.wl-dates input[type=date]{font-family:inherit;font-size:13px;padding:5px 9px;border:1px solid #d9c9ee;border-radius:8px;color:#444;background:#fff}
.wlnote{position:relative;display:inline-block;margin:2px 0 6px;font-size:12px;font-weight:600;color:#6a3093;background:#f3eefc;border:1px solid #d9c9ee;border-radius:14px;padding:5px 13px;cursor:help}
.wlnote-hint{font-weight:400;opacity:.8}
.wlnote-pop{display:none;position:absolute;z-index:30;left:0;top:calc(100% + 6px);width:min(620px,92vw);background:#fff;border:1px solid #d9c9ee;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.18);padding:12px 16px;font-weight:400;color:#333;text-align:left}
.wlnote:hover .wlnote-pop,.wlnote:focus .wlnote-pop,.wlnote:focus-within .wlnote-pop{display:block}
.wlnote-pop .wlnote-h{font-weight:700;color:#6a3093;font-size:11px;margin:6px 0 3px;text-transform:uppercase;letter-spacing:.04em}
.wlnote-pop ul{margin:0 0 6px;padding-left:18px}
.wlnote-pop li{margin:3px 0;font-size:12.5px;line-height:1.45}
.wlnote-pop b{color:#222}
.wlnote-jql .wlnote-pop{width:min(800px,94vw)}
.wlnote-pop .jqllist li{margin:9px 0}
.wlnote-pop code{font-family:Consolas,Menlo,monospace;font-size:11px;background:#f3eefc;color:#4a2072;padding:2px 6px;border-radius:4px;white-space:pre-wrap;word-break:break-word;line-height:1.55;display:inline-block;margin-top:3px}
.jqlv{display:none}.jqlv.is-active{display:block}
.wtbl thead th[title]{cursor:help}
.warn{background:#fff4e0;border-left:4px solid #f0a030;padding:10px 14px;border-radius:6px;margin:12px 0;font-size:13px;color:#8a5a00}
.viewtabs{display:flex;gap:6px;margin:14px 0 8px}
.viewtabs button{font-family:inherit;font-size:13px;font-weight:600;padding:8px 16px;border:1px solid #d9c9ee;background:#fff;color:#6a3093;border-radius:8px 8px 0 0;cursor:pointer}
.viewtabs button.active{background:#6a3093;color:#fff;border-color:#6a3093}
.view{display:none}
.view.is-active{display:block}
.ranges{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 4px}
.ranges button{font-family:inherit;font-size:13px;padding:7px 14px;border:1px solid #d9c9ee;background:#fff;color:#6a3093;border-radius:20px;cursor:pointer}
.ranges button:hover{background:#f3eefc}
.ranges button.active{background:#6a3093;color:#fff;border-color:#6a3093}
section.metric{background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.08);padding:16px 20px;margin:16px 0;scroll-margin-top:16px}
section.metric.lead{border:2px solid #a044ff}
.anchor{margin-left:6px;font-size:15px;line-height:1;text-decoration:none;opacity:.6;cursor:pointer;vertical-align:middle}
.anchor:hover,.anchor:focus{opacity:1}
@keyframes cardflash{0%{box-shadow:0 0 0 3px #a044ff,0 1px 4px rgba(0,0,0,.08)}100%{box-shadow:0 0 0 0 rgba(160,68,255,0),0 1px 4px rgba(0,0,0,.08)}}
section.metric.anchor-flash{animation:cardflash 1.7s ease-out}
.copytoast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#6a3093;color:#fff;font-size:13px;font-weight:600;padding:9px 18px;border-radius:20px;box-shadow:0 6px 20px rgba(0,0,0,.25);opacity:0;transition:opacity .2s;z-index:100;pointer-events:none}
.copytoast.show{opacity:1}
h2{margin:0 0 12px;font-size:17px}
.muted{color:#999;font-weight:400;font-size:12px}
.pill{background:#f3eefc;color:#8e44ad;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;vertical-align:middle}
.range-block{display:none}.range-block.is-active{display:block}
.range-window{display:none}.range-window.is-active{display:inline}
.qkpis{display:flex;gap:10px;margin:2px 0 10px;flex-wrap:wrap}
.qkpi{min-width:96px;text-align:center;border-radius:8px;padding:8px 14px;color:#fff}
.qkpi .qv{font-size:20px;font-weight:800;line-height:1}.qkpi .ql{font-size:11px;opacity:.92;margin-top:3px}
.qkpi.pos{background:#27ae9a}.qkpi.neg{background:#c0392b}.qkpi.na{background:#9aa0a6}
.qgrid{display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start}
.qchart{flex:2;min-width:340px}
.qside{flex:1;min-width:220px}
.qtbl{width:100%;border-collapse:collapse;font-size:13px}
.qtbl th,.qtbl td{padding:6px 8px;border-bottom:1px solid #eee;text-align:left}
.qtbl th{color:#777;font-size:11px;text-transform:uppercase;letter-spacing:.03em}
.qtbl td.num,.qtbl th.num{text-align:right;font-variant-numeric:tabular-nums}
.qtbl tfoot td{font-weight:700;border-top:2px solid #ccc;border-bottom:none}
.subh{font-size:12px;color:#777;text-transform:uppercase;letter-spacing:.04em;margin:14px 0 6px;font-weight:700}
.qnote{margin:16px 0 0;padding:10px 14px;background:#f5f2fb;border:1px solid #e4d9f4;border-radius:10px;color:#555;font-size:12.5px;line-height:1.55}
.grid{display:flex;gap:24px;flex-wrap:wrap;align-items:center}
.bignum{min-width:140px}.bignum .v{font-size:44px;font-weight:800;color:#6a3093;line-height:1}.bignum .l{font-size:12px;color:#777;margin-top:4px}
.bycol{flex:1;min-width:240px}
.emps{display:flex;flex-direction:column;gap:6px}
.emp{display:flex;align-items:center;gap:10px}
.empname{width:110px;font-size:13px;color:#444}
.track{flex:1;background:#eee;border-radius:6px;height:14px;overflow:hidden}
.fill{height:100%;border-radius:6px}
.empval{width:42px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;font-size:13px}
.tlegend{display:flex;gap:16px;flex-wrap:wrap;margin:6px 0 2px;font-size:12px;color:#555}
.tlegend .tl{display:flex;align-items:center;gap:6px}
.tlegend .sw{width:11px;height:11px;border-radius:2px;display:inline-block}
.pdmeta{font-size:13px;color:#444;display:flex;flex-direction:column;gap:6px}
.pdwrap{overflow-x:auto}
.pdtbl{border-collapse:collapse;font-size:13px;min-width:520px}
.pdtbl th,.pdtbl td{padding:6px 12px;text-align:right;border-bottom:1px solid #eee;font-variant-numeric:tabular-nums}
.pdtbl th:first-child,.pdtbl td:first-child{text-align:left}
.pdtbl thead th{font-size:11px;color:#777;text-transform:uppercase;letter-spacing:.03em}
.pdtbl .pdname{font-weight:700}
.pdtbl .pdrate{font-weight:800;color:#6a3093}
.pdnote{font-size:11px;margin:8px 0 0}
.stuckwrap{overflow-x:auto}
.stucktbl{width:100%;border-collapse:collapse;font-size:13px;margin:6px 0 4px}
.stucktbl th,.stucktbl td{padding:7px 9px;border-bottom:1px solid #eee;text-align:left;vertical-align:top}
.stucktbl thead th{color:#555;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;background:#f3eefc;border-bottom:2px solid #d9c9ee;white-space:nowrap}
.stucktbl td.num,.stucktbl th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.stucktbl td.skey{white-space:nowrap;font-weight:700}
.stucktbl td.skey a{color:#6a3093;text-decoration:none}
.stucktbl td.skey a:hover{text-decoration:underline}
.stucktbl td.ssum{min-width:280px;color:#333}
.stucktbl td.stype,.stucktbl td.sasg{white-space:nowrap;color:#555}
.stucktbl td.sdays{font-weight:700;color:#444}
.stucktbl td.sdays.stuck-hot{color:#c0392b}
.stucktbl tbody tr:hover{background:#faf7ff}
.bptbl{max-width:660px}
.bptbl td.bp-pri{font-weight:600;white-space:nowrap;color:#333}
.bptbl tr.bp-total td{font-weight:800;color:#222;border-top:2px solid #d9c9ee;background:#faf7ff}
.bptbl tr.bp-total:hover td{background:#f3eefc}
/* "Valid bug reported - by Priority of bug": black (not grey) text, +10% size,
   scoped to this section so the shared .muted/.stucktbl/.fcaption stay unchanged elsewhere. */
.bugpri .muted{color:#111;font-size:13.2px}
.bugpri .stucktbl thead th{color:#111;font-size:12.1px}
.bugpri .stucktbl th,.bugpri .stucktbl td{font-size:14.3px;color:#111}
.bugpri .bptbl td.bp-pri{color:#111}
.bugpri .bptbl tr.bp-total td{color:#111}
.bugpri .fcaption{color:#111;font-size:13.75px}
.bugpri .fcaption b{color:#111}
.frdcards{display:flex;gap:16px;flex-wrap:wrap;margin:6px 0 4px}
.frdcard{flex:1;min-width:170px;background:#faf7fe;border:1px solid #ece3fa;border-radius:12px;padding:18px 22px}
.frdcard.lead{background:linear-gradient(135deg,#6a3093,#a044ff);border:none;color:#fff}
.frdcard .fv{font-size:48px;font-weight:800;line-height:1;color:#6a3093}
.frdcard.lead .fv{color:#fff}
.frdcard.done .fv{color:#1e7e34}
.frdcard.prog .fv{color:#e8843c}
.frdcard.est .fv{color:#2c7be5}
.frdcard .fl{font-size:14px;font-weight:700;margin-top:10px;color:#444}
.frdcard.lead .fl{color:#fff}
.frdcard .fsub{font-size:11px;color:#8a8a8a;margin-top:3px}
.frdcard.lead .fsub{color:rgba(255,255,255,.85)}
.frdnote{font-size:11px;margin:14px 0 0;line-height:1.5}
.velo-hero{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:18px;border-radius:14px;padding:22px 26px;margin:6px 0 16px;background:linear-gradient(135deg,#6a3093,#a044ff);color:#fff;box-shadow:0 10px 28px rgba(106,48,147,.28)}
.velo-hero.one{padding:20px 26px}
.velo-label{font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;opacity:.9}
.velo-big{font-size:60px;font-weight:800;line-height:1;letter-spacing:-.02em;margin-top:4px;font-variant-numeric:tabular-nums}
.velo-big .unit{font-size:22px;font-weight:700;opacity:.85;margin-left:4px}
.velo-sub{font-size:14px;opacity:.92;margin-top:8px;font-weight:500}
.velo-asides{display:flex;gap:30px}
.velo-aside{text-align:right}
.velo-aside .n{display:block;font-size:26px;font-weight:800;font-variant-numeric:tabular-nums}
.velo-aside .k{font-size:12px;opacity:.85}
.velo-effort{display:inline-flex;align-items:center;gap:9px;margin:0 0 16px;padding:9px 15px;border-radius:999px;background:#eafaf0;border:1px solid #bfe6cd;color:#1e5631;font-size:13px;font-weight:600}
.velo-effort b{color:#1e7e34;font-weight:800}
.velo-effort .dot{width:8px;height:8px;border-radius:50%;background:#1e9e4a;box-shadow:0 0 0 4px rgba(30,158,74,.18);flex:none}
.velo-bars{display:grid;gap:14px;margin:4px 0 6px}
.velo-row{display:grid;grid-template-columns:150px 1fr auto;align-items:center;gap:14px}
.velo-name{font-size:14px;font-weight:700;color:#444}
.velo-days{display:block;font-size:11px;font-weight:500;color:#999;margin-top:2px}
.velo-track{background:#efe9f7;border-radius:8px;height:28px;overflow:hidden}
.velo-fill{height:100%;border-radius:8px}
.velo-fill.legacy{background:#2c7be5}
.velo-fill.claude{background:linear-gradient(90deg,#6a3093,#a044ff)}
.velo-rate{font-size:20px;font-weight:800;color:#333;font-variant-numeric:tabular-nums;white-space:nowrap}
.velo-rate small{font-size:12px;font-weight:600;color:#888}
.velo-axis{font-size:11px;color:#999;font-weight:600;margin:2px 0 4px 164px}
@media (max-width:640px){.velo-row{grid-template-columns:96px 1fr auto;gap:9px}.velo-axis{margin-left:105px}.velo-big{font-size:46px}.velo-asides{gap:20px}}
.foot{margin-top:24px;color:#999;font-size:11px}
.pagenav{display:flex;gap:8px;margin-top:12px}
.pagenav .pgtab{font-size:13px;font-weight:600;padding:7px 14px;border-radius:8px;text-decoration:none;color:#fff;background:rgba(255,255,255,.18)}
.pagenav .pgtab:hover{background:rgba(255,255,255,.3)}
.pagenav .pgtab.active{background:#fff;color:#6a3093}
.wtblwrap{overflow-x:auto}
.wtbl{width:100%;border-collapse:collapse;font-size:13px;margin:6px 0 4px;table-layout:fixed}
.wtbl th,.wtbl td{padding:6px 7px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap}
.wtbl th{white-space:normal;word-break:normal;overflow-wrap:normal;line-height:1.25}
.wtbl th.wname,.wtbl td.wname{text-align:left;font-weight:600;color:#444;width:104px}
.wtbl thead th{color:#555;font-size:11px;font-weight:700;background:#f3eefc;border-bottom:2px solid #d9c9ee;vertical-align:bottom}
.wtbl td.num{font-variant-numeric:tabular-nums}
.wtbl tr.wtotal td{font-weight:700;border-top:2px solid #ccc}
.wtbl tr.wpct td{color:#2c7be5;font-size:12px;border-bottom:none}
.wtbl .ftoSlHoliday{background:#fef0e2}
.wtbl .nonCrm{background:#eef4fb}
.wtbl .total{background:#f7ecff}
.wtbl tr.wtotal .total,.wtbl thead .total{font-weight:800}
.pies{display:flex;gap:28px;flex-wrap:wrap}
.pie{flex:1;min-width:320px}
.pietitle{font-size:13px;font-weight:700;margin-bottom:8px;color:#444}
.pierow{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.legend{list-style:none;margin:0;padding:0;font-size:12px}
.legend li{display:flex;align-items:center;gap:7px;margin:4px 0}
.legend .sw{width:12px;height:12px;border-radius:2px;display:inline-block;flex:none}
.fchart-wrap{overflow-x:auto;padding-bottom:4px}
.flegend{display:flex;gap:18px;margin:2px 0 8px;font-size:12px;color:#555}
.flegend .fl{display:flex;align-items:center;gap:6px}
.flegend .sw{width:12px;height:12px;border-radius:2px;display:inline-block}
.fcaption{margin-top:8px;font-size:12.5px;color:#555}
.fcaption b{color:#333}
`;

const APP_JS = `(function () {
  function toggleGroup(attr, val, selector) {
    var btns = document.querySelectorAll('[' + attr + ']');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].getAttribute(attr) === val);
    var els = document.querySelectorAll(selector);
    for (var j = 0; j < els.length; j++) els[j].classList.toggle('is-active', els[j].getAttribute('data-view') === val || els[j].getAttribute('data-range') === val);
  }
  // Range switching is normally page-global (one selector drives every metric on the
  // page). When a range button lives inside a .rangescope, it drives ONLY the blocks in
  // that scope — so a page can carry two independent range selectors (e.g. the Jira
  // Dashboard's quarter-only STUCK metric alongside the full-range Defect-quality one).
  function toggleRangeScoped(scope, val) {
    var btns = scope.querySelectorAll('[data-rangebtn]');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].getAttribute('data-rangebtn') === val);
    var els = scope.querySelectorAll('.range-block, .range-window, .jqlv');
    for (var j = 0; j < els.length; j++) els[j].classList.toggle('is-active', els[j].getAttribute('data-range') === val);
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t.getAttribute) {
      if (t.hasAttribute && t.hasAttribute('data-anchor')) {
        e.preventDefault();
        var aid = (t.getAttribute('href') || '').replace(/^#/, '');
        var sec = t.closest ? t.closest('section.metric') : null;
        var rng = activeRangeOf(sec);                 // preserve the SELECTED range in the link
        if (!rng && !sec) {                           // worklog page: range buttons are page-level, not inside a card
          var abtn = document.querySelector('[data-rangebtn].active');
          if (abtn) rng = abtn.getAttribute('data-rangebtn') || '';
        }
        var frag = '#' + aid + (rng ? '&r=' + encodeURIComponent(rng) : '');
        if (rng === 'custom') {                        // carry the picked dates so the custom range is reproducible
          var sV = document.getElementById('wl-start'), eV = document.getElementById('wl-end');
          if (sV && eV && sV.value && eV.value) frag += '&s=' + encodeURIComponent(sV.value) + '&e=' + encodeURIComponent(eV.value);
        }
        var lbl = '';
        if (rng) {
          var sc = sec && sec.closest ? sec.closest('.rangescope') : null;
          var btn = (sc || document).querySelector('[data-rangebtn="' + rng + '"]');
          if (btn) lbl = btn.textContent;
        }
        copyText(location.origin + location.pathname + location.search + frag);
        toast('Link copied' + (lbl ? ' · ' + lbl : ''));
        if (history.replaceState) history.replaceState(null, '', frag);
        focusId(aid, rng);
        return;
      }
      var v = t.getAttribute('data-viewbtn');
      if (v) { toggleGroup('data-viewbtn', v, '.view'); return; }
      var r = t.getAttribute('data-rangebtn');
      if (r) {
        var scope = t.closest ? t.closest('.rangescope') : null;
        if (scope) toggleRangeScoped(scope, r);
        else toggleGroup('data-rangebtn', r, '.range-block, .range-window, .jqlv');
        return;
      }
      t = t.parentNode;
    }
  });

  // --- Custom date range (worklog page) -------------------------------------
  var WL = null;
  var dataEl = document.getElementById('wl-data');
  if (dataEl) { try { WL = JSON.parse(dataEl.textContent); } catch (err) { WL = null; } }
  var startEl = document.getElementById('wl-start');
  var endEl = document.getElementById('wl-end');

  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function fmt(n) { return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function wbr(s) { return esc(s).replace(/([_\\/])/g, '$1<wbr>'); }

  function agg(from, to) {
    var jira = [], leaveKey = null, totalKey = null;
    WL.columns.forEach(function (c) {
      if (c.kind === 'total') totalKey = c.key;
      else if (c.kind === 'leave') leaveKey = c.key;
      else jira.push(c.key);
    });
    var valueKeys = leaveKey ? jira.concat([leaveKey]) : jira;
    var byT = {};
    WL.members.forEach(function (m) { byT[m] = {}; valueKeys.forEach(function (k) { byT[m][k] = 0; }); });
    WL.daily.forEach(function (e) {
      if (e.d < from || e.d > to) return;
      if (!byT[e.t] || byT[e.t][e.c] == null) return;
      byT[e.t][e.c] += e.h;
    });
    var rows = WL.members.map(function (m) {
      var co = {}, total = 0;
      jira.forEach(function (k) { var v = round2(byT[m][k]); co[k] = v; total += v; });
      total = round2(total);
      if (leaveKey) co[leaveKey] = round2(byT[m][leaveKey]);
      if (totalKey) co[totalKey] = total;
      return { name: m, cols: co, total: total };
    });
    var totals = {}, grand = 0;
    jira.forEach(function (k) { var v = round2(rows.reduce(function (s, r) { return s + r.cols[k]; }, 0)); totals[k] = v; grand += v; });
    grand = round2(grand);
    if (leaveKey) totals[leaveKey] = round2(rows.reduce(function (s, r) { return s + r.cols[leaveKey]; }, 0));
    if (totalKey) totals[totalKey] = grand;
    var pct = {};
    jira.forEach(function (k) { pct[k] = grand ? Math.round(totals[k] / grand * 1000) / 10 : 0; });
    if (leaveKey) pct[leaveKey] = grand ? Math.round(totals[leaveKey] / grand * 1000) / 10 : 0;
    if (totalKey) pct[totalKey] = grand ? 100 : 0;
    return { byTester: rows, totals: totals, grandTotal: grand, pct: pct };
  }

  function tableHtml(a) {
    var cols = WL.columns;
    function cell(c, v) { return '<td class="num ' + c.kind + ' ' + c.key + '">' + fmt(v) + '</td>'; }
    var head = cols.map(function (c) { var t = (WL.help && WL.help[c.key]) ? ' title="' + esc(WL.help[c.key]) + '"' : ''; return '<th class="' + c.kind + ' ' + c.key + '"' + t + '>' + wbr(c.label) + '</th>'; }).join('');
    var body = a.byTester.map(function (t) { return '<tr><td class="wname">' + esc(t.name) + '</td>' + cols.map(function (c) { return cell(c, t.cols[c.key]); }).join('') + '</tr>'; }).join('');
    var tot = '<tr class="wtotal"><td class="wname">Total</td>' + cols.map(function (c) { return cell(c, a.totals[c.key]); }).join('') + '</tr>';
    var pc = '<tr class="wpct"><td class="wname"></td>' + cols.map(function (c) { return '<td class="num ' + c.kind + ' ' + c.key + '">' + a.pct[c.key] + '%</td>'; }).join('') + '</tr>';
    return '<div class="wtblwrap"><table class="wtbl"><thead><tr><th class="wname">QA Name</th>' + head + '</tr></thead><tbody>' + body + tot + pc + '</tbody></table></div>';
  }

  function piePath(cx, cy, r, a0, a1) {
    var x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1), large = (a1 - a0) > Math.PI ? 1 : 0;
    return 'M' + cx + ',' + cy + ' L' + x0.toFixed(2) + ',' + y0.toFixed(2) + ' A' + r + ',' + r + ' 0 ' + large + ' 1 ' + x1.toFixed(2) + ',' + y1.toFixed(2) + ' Z';
  }
  function pie(title, slices) {
    var total = slices.reduce(function (s, x) { return s + x.value; }, 0);
    if (!total) return '<div class="pie"><div class="pietitle">' + esc(title) + '</div><p class="muted">No worklog in this range.</p></div>';
    var cx = 90, cy = 90, r = 84, svg = '<svg viewBox="0 0 180 180" width="180" height="180">', a = -Math.PI / 2;
    if (slices.length === 1) { svg += '<circle cx="90" cy="90" r="84" fill="' + slices[0].color + '"/>'; }
    else { slices.forEach(function (s) { var a1 = a + (s.value / total) * 2 * Math.PI; svg += '<path d="' + piePath(cx, cy, r, a, a1) + '" fill="' + s.color + '"/>'; a = a1; }); }
    svg += '</svg>';
    var legend = slices.map(function (s) { return '<li><span class="sw" style="background:' + s.color + '"></span>' + esc(s.label) + ' <b>' + fmt(s.value) + '</b> <span class="muted">' + Math.round(s.value / total * 100) + '%</span></li>'; }).join('');
    return '<div class="pie"><div class="pietitle">' + esc(title) + '</div><div class="pierow">' + svg + '<ul class="legend">' + legend + '</ul></div></div>';
  }
  function piesHtml(a, label) {
    var buckets = WL.columns.filter(function (c) { return c.kind !== 'total'; });
    return '<div class="pies">' + a.byTester.map(function (t) {
      var slices = buckets.map(function (c) { return { label: c.label, value: t.cols[c.key], color: WL.colors[c.key] }; }).filter(function (s) { return s.value > 0; }).sort(function (x, y) { return y.value - x.value; });
      return pie(t.name + ' — ' + label, slices);
    }).join('') + '</div>';
  }

  function compute() {
    if (!WL || !startEl || !endEl) return;
    var s = startEl.value, e = endEl.value;
    var tbl = document.getElementById('wl-custom-table'), pies = document.getElementById('wl-custom-pies'),
        sub = document.getElementById('wl-custom-sub'), win = document.getElementById('wl-custom-window');
    if (!s || !e) { tbl.innerHTML = '<p class="muted">Pick a Start and End date.</p>'; pies.innerHTML = ''; sub.textContent = ''; win.innerHTML = ''; return; }
    if (s > e) { tbl.innerHTML = '<p class="muted">Start date must be on or before End date.</p>'; pies.innerHTML = ''; sub.textContent = ''; win.innerHTML = '<b>' + esc(s) + '</b> → <b>' + esc(e) + '</b>'; return; }
    var a = agg(s, e), label = s + ' → ' + e;
    tbl.innerHTML = tableHtml(a);
    pies.innerHTML = piesHtml(a, label);
    sub.textContent = '(' + label + ')';
    win.innerHTML = '<b>' + esc(s) + '</b> → <b>' + esc(e) + '</b>';
  }
  function onPick() { compute(); toggleGroup('data-rangebtn', 'custom', '.range-block, .range-window'); }
  if (startEl && endEl) { startEl.addEventListener('change', onPick); endEl.addEventListener('change', onPick); }

  // --- Deep-link anchors (scroll + click-to-copy) ---------------------------
  // A shared URL like manual.html#m-uniqueTcExecuted opens scrolled to that metric.
  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
        navigator.clipboard.writeText(text)['catch'](function () { legacyCopy(text); });
        return;
      }
    } catch (err) {}
    legacyCopy(text); // http (e.g. the Jenkins host) has no Clipboard API → execCommand
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '0'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand('copy'); } catch (err) {}
    document.body.removeChild(ta);
  }
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'copytoast'; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1600);
  }
  function flash(el) {
    el.classList.remove('anchor-flash');
    void el.offsetWidth; // reflow so the animation restarts on a repeat click
    el.classList.add('anchor-flash');
    setTimeout(function () { el.classList.remove('anchor-flash'); }, 1800);
  }
  // Parse "#<id>&r=<rangeKey>" → {id, range}. Bare "#<id>" (old links) → range ''.
  function parseHash(h) {
    h = (h || '').replace(/^#/, '');
    if (!h) return { id: '', range: '' };
    var parts = h.split('&'), out = { id: parts[0], range: '', start: '', end: '' };
    for (var i = 1; i < parts.length; i++) {
      var kv = parts[i].split('='), k = kv[0], v = '';
      if (kv[1]) { try { v = decodeURIComponent(kv[1]); } catch (err) { v = kv[1]; } }
      if (k === 'r') out.range = v; else if (k === 's') out.start = v; else if (k === 'e') out.end = v;
    }
    return out;
  }
  // The range currently shown for a metric card (its active .range-block); '' for a
  // Quarterly card (no range-block).
  function activeRangeOf(section) {
    if (!section || !section.querySelector) return '';
    var b = section.querySelector('.range-block.is-active');
    return b ? (b.getAttribute('data-range') || '') : '';
  }
  // Select a range for the metric's scope (rangescope-aware) — reuses the SAME toggles
  // the range buttons use, so buttons + "Showing …" windows + JQL notes update too.
  function applyRange(section, range) {
    // Guard against a tampered/old/typo'd hash: reject a non-token range (also keeps it
    // safe to embed in the querySelector below), and ignore a range that has no button on
    // this page/scope — leave the server default rather than toggling every block off.
    if (!section || !range || !/^[A-Za-z0-9_-]+$/.test(range)) return;
    var scope = section.closest ? section.closest('.rangescope') : null;
    var root = scope || document;
    if (!root.querySelector('[data-rangebtn="' + range + '"]')) return;
    if (scope) toggleRangeScoped(scope, range);
    else toggleGroup('data-rangebtn', range, '.range-block, .range-window, .jqlv');
  }
  function focusId(id, range, start, end) {
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    // If the card sits in a hidden "Quarterly KPI / By range" view tab, activate it first.
    var view = el.closest ? el.closest('.view') : null;
    if (view && !view.classList.contains('is-active')) {
      var vkey = view.getAttribute('data-view');
      if (vkey) toggleGroup('data-viewbtn', vkey, '.view');
    }
    if (range === 'custom' && start && end && startEl && endEl) {
      // Worklog custom range: restore the dates, recompute client-side, show the custom block.
      startEl.value = start; endEl.value = end; compute();
      toggleGroup('data-rangebtn', 'custom', '.range-block, .range-window');
    } else if (range) applyRange(el, range); // el IS the <section>; restore the shared range
    setTimeout(function () {
      try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      catch (err) { el.scrollIntoView(); }
      flash(el);
    }, 60);
  }
  function focusHash() { var p = parseHash(location.hash); focusId(p.id, p.range, p.start, p.end); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', focusHash);
  else focusHash();
  window.addEventListener('hashchange', focusHash);
})();
`;

/* ---------------------------------- main ------------------------------------- */

function main() {
  const data = JSON.parse(fs.readFileSync(path.join(cfg.DATA_DIR, 'latest.json'), 'utf8'));
  const defView = data.defaultView || 'range';
  const defRange = data.defaultRange || 'lastWeek';

  // Metric metadata by key (Odoo KPI + all Jira-sourced metrics) so each section
  // page can pull exactly the metrics it lists in config.SECTIONS, in that order.
  const metaByKey = {};
  [...cfg.KPI_METRICS, ...cfg.JIRA_METRICS, ...cfg.JIRA_WORKLOG_METRICS, ...cfg.JIRA_UNIQUE_METRICS, ...cfg.JIRA_FRD_METRICS, ...cfg.JIRA_TRANSITION_METRICS, ...cfg.JIRA_SPLIT_METRICS, ...cfg.JIRA_DERIVED_METRICS, ...cfg.JIRA_LIST_METRICS, ...cfg.JIRA_DEFECT_METRICS]
    .forEach((m) => { metaByKey[m.key] = m; });

  const subline = `Team: ${esc(data.members.join(', '))} · Manager: Anh Ho` +
    ` · Generated ${esc(data.generatedAt.replace('T', ' ').slice(0, 16))} UTC`;
  const docHead = (title) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="styles.css">
</head><body>`;
  const metricsFoot = 'Sources: Odoo <code>nakivo.kpi.database</code> + <code>nakivo.quarterly.kpi.detail</code> and <code>Jira</code> (support tickets, automation, worklog-based counts) · regenerated daily · self-contained page.';

  // One metrics page per section (Manual test / Automation test). Each keeps the
  // Quarterly KPI + By range sub-views but renders ONLY that section's metrics.
  const metricsPageHtml = (section, navKey, title) => {
    const metrics = section.metricKeys.map((k) => metaByKey[k]).filter(Boolean);
    const quarterlySections = metrics.filter((m) => data.quarterly && data.quarterly[m.key])
      .map((m, i) => withAnchor(m, quarterlySection(m, data.quarterly[m.key], i === 0), '-q')).join('\n');
    const rangeSections = metrics.filter((m) => data.metrics[m.key])
      .map((m, i) => {
        const fn = m.split ? splitRangeSection : m.perDay ? perDayRangeSection : rangeSection;
        // A metric may override the by-tester/stacking member list (e.g. leaked defects
        // adds an "Other" bucket for non-team reporters); fall back to the team members.
        const mem = data.metrics[m.key].members || data.members;
        return withAnchor(m, fn(m, data.metrics[m.key], defRange, i === 0, mem));
      }).join('\n');
    // The "Executed Test Cases per main feature" grouped bar chart is a Manual-test-page
    // extra (its own data shape), shown at the top of the "By range" view only.
    const featureExecHtml = (navKey === 'manual' && data.featureExec && data.featureExec.ranges)
      ? withAnchor(data.featureExec, featureExecSection(data.featureExec, defRange)) : '';
    // "Valid bug reported - by Priority of bug" — another Manual-test-page extra
    // (its own data shape), shown in the "By range" view only.
    const bugByPriorityHtml = (navKey === 'manual' && data.bugByPriority && data.bugByPriority.ranges)
      ? withAnchor(data.bugByPriority, bugByPrioritySection(data.bugByPriority, defRange)) : '';
    return `${docHead(title)}
<div class="hero">
  <h1>CRM QA Team — ${esc(section.label)}</h1>
  <div class="sub">${subline}</div>
  ${pageNav(navKey)}
</div>
<div class="wrap">
  ${sourceBanner(data.sources)}
  <div class="viewtabs">
    <button type="button" data-viewbtn="quarterly" class="${defView === 'quarterly' ? 'active' : ''}">Quarterly KPI</button>
    <button type="button" data-viewbtn="range" class="${defView === 'range' ? 'active' : ''}">By range</button>
  </div>

  <div class="view${defView === 'quarterly' ? ' is-active' : ''}" data-view="quarterly">
    ${quarterlySections || '<p class="muted">No quarterly data available.</p>'}
  </div>

  <div class="view${defView === 'range' ? ' is-active' : ''}" data-view="range">
    <div class="sub muted" style="margin:4px 0 2px">Showing ${windowSpans(data.ranges, defRange, METRIC_RANGE_ORDER)}</div>
    ${selector(data.ranges, defRange)}
    ${jqlNote(metrics, data.ranges, defRange, data.kpiJql || {})}
    ${featureExecHtml}
    ${bugByPriorityHtml}
    ${rangeSections || '<p class="muted">No range data available.</p>'}
  </div>

  <div class="foot">${metricsFoot}</div>
</div>
<script src="app.js"></script>
</body></html>`;
  };

  const manualSec = cfg.SECTIONS.find((s) => s.key === 'manual');
  const automationSec = cfg.SECTIONS.find((s) => s.key === 'automation');
  const manualHtml = metricsPageHtml(manualSec, 'manual', 'CRM QA — Manual test');
  const automationHtml = metricsPageHtml(automationSec, 'automation', 'CRM QA — Automation test');

  // --- QA CRM · Jira · Dashboard page (index.html — the leftmost / default landing).
  // A list-style page (not the count-card layout): each JIRA_LIST_METRICS metric
  // (currently just STUCK) renders as a headline total + per-assignee split + a table
  // of the matching issues, over This/Last quarter. See stuckSection above.
  const jiraDashSec = cfg.SECTIONS.find((s) => s.key === 'jiraDashboard');
  const jiraBase = data.jiraBaseUrl || 'http://jira.nakivo.com';

  // Defect quality — created (Slide #10): its OWN full 6-range scope, defaulting to
  // the dashboard's default range (Last week). Wrapped in .rangescope so its selector
  // drives only its own cards — independent of the STUCK metric's quarter-only one.
  const dqDef = data.ranges[defRange] ? defRange : 'lastQuarter';
  const dqMetrics = cfg.JIRA_DEFECT_METRICS.map((m) => metaByKey[m.key]).filter((m) => m && data.metrics[m.key]);
  const defectScope = dqMetrics.map((meta) => `<div class="rangescope">
  <div class="sub muted" style="margin:10px 0 2px">Showing ${windowSpans(data.ranges, dqDef, METRIC_RANGE_ORDER)}</div>
  ${selector(data.ranges, dqDef)}
  ${defectJqlNote(meta, data.ranges, dqDef)}
  ${withAnchor(meta, defectQualitySection(meta, data.metrics[meta.key], dqDef, jiraBase))}
</div>`).join('\n');

  // STUCK — Dev done, QA not tested: its own quarter-only scope (This/Last quarter).
  const stuckDef = 'thisQuarter';
  const jdMetrics = jiraDashSec ? jiraDashSec.metricKeys.map((k) => metaByKey[k]).filter(Boolean) : [];
  const stuckSections = jdMetrics.filter((m) => data.metrics[m.key])
    .map((m) => withAnchor(m, stuckSection(m, data.metrics[m.key], stuckDef, jiraBase))).join('\n');
  const stuckNotes = jdMetrics.filter((m) => data.metrics[m.key])
    .map((m) => stuckJqlNote(m, data.ranges, stuckDef)).join('\n');
  const stuckScope = stuckSections ? `<div class="rangescope">
  <div class="sub muted" style="margin:10px 0 2px">Showing ${windowSpans(data.ranges, stuckDef, STUCK_RANGE_ORDER)}</div>
  ${stuckSelector(data.ranges, stuckDef)}
  ${stuckNotes}
  ${stuckSections}
</div>` : '';

  const jiraDashBody = [defectScope, stuckScope].filter(Boolean).join('\n') ||
    '<p class="muted">No Jira dashboard data available.</p>';
  const jiraDashboardHtml = `${docHead('CRM QA — Jira Dashboard')}
<div class="hero">
  <h1>CRM QA Team — ${esc(jiraDashSec ? jiraDashSec.label : 'QA CRM - Jira - Dashboard')}</h1>
  <div class="sub">${subline}</div>
  ${pageNav('jiraDashboard')}
</div>
<div class="wrap">
  ${sourceBanner(data.sources)}
  ${jiraDashBody}
  <div class="foot">Source: Jira — “Defect quality — created” (bugs created by reporter vs leaked defects labelled QA-Ticket_verification, P1–P3) and “STUCK — Dev done, QA not tested” (issues still in <code>Resolved</code> awaiting QA) · regenerated daily · self-contained page.</div>
</div>
<script src="app.js"></script>
</body></html>`;

  // --- FRD / Spec Review / I2L page (frd.html) -------------------------------
  // Slide #15 stat cards (worked / done / in progress), range-selectable, defaulting
  // to the previous complete quarter (the "Q2" snapshot). Sits left of Manual test,
  // right of the Jira Dashboard landing. Whole-team; no Quarterly-KPI sub-view.
  const frdSec = cfg.SECTIONS.find((s) => s.key === 'frd');
  const frdDef = (frdSec && frdSec.defaultRange && data.ranges[frdSec.defaultRange]) ? frdSec.defaultRange : defRange;
  const frdMetrics = frdSec ? frdSec.metricKeys.map((k) => metaByKey[k]).filter(Boolean) : [];
  const frdSections = frdMetrics.filter((m) => data.metrics[m.key])
    .map((m) => withAnchor(m, frdSection(m, data.metrics[m.key], frdDef))).join('\n');
  const frdHtml = `${docHead('CRM QA — FRD/Spec Review/I2L')}
<div class="hero">
  <h1>CRM QA Team — ${esc(frdSec ? frdSec.label : 'FRD/Spec Review/I2L')}</h1>
  <div class="sub">${subline}</div>
  ${pageNav('frd')}
</div>
<div class="wrap">
  ${sourceBanner(data.sources)}
  <div class="sub muted" style="margin:10px 0 2px">Showing ${windowSpans(data.ranges, frdDef, METRIC_RANGE_ORDER)}</div>
  ${selector(data.ranges, frdDef)}
  ${jqlNote(frdMetrics, data.ranges, frdDef, data.kpiJql || {})}
  ${frdSections || '<p class="muted">No FRD/I2L data available.</p>'}
  <div class="foot">Source: Jira — distinct issues labelled QA-FRD/I2L/Spec with a team worklog in the selected range, split by status category (Done vs in progress) · regenerated daily · self-contained page.</div>
</div>
<script src="app.js"></script>
</body></html>`;

  // --- Worklog allocation page (worklog.html) --------------------------------
  // Embed the per-day worklog data + per-column colours so app.js can recompute
  // a custom date range client-side (column colours match the server-rendered pies).
  const wlCols = (data.worklog && data.worklog.columns) ? data.worklog.columns : [];
  const wlColors = {};
  wlCols.filter((c) => c.kind !== 'total').forEach((c, i) => { wlColors[c.key] = wlColor(c.key, i); });
  const wlHelp = (data.worklog && data.worklog.columns) ? worklogHelp(data.worklog.columns) : { map: {}, notes: [] };
  const wlData = data.worklog ? {
    columns: data.worklog.columns,
    members: data.members,
    colors: wlColors,
    help: wlHelp.map,
    daily: data.worklog.daily || [],
  } : null;
  const wlDataScript = wlData
    ? `<script id="wl-data" type="application/json">${JSON.stringify(wlData).replace(/</g, '\\u003c')}</script>`
    : '';

  const worklogHtml = `${docHead('CRM QA — Worklog allocation')}
<div class="hero">
  <h1>CRM QA Team — Worklog allocation</h1>
  <div class="sub">${subline}</div>
  ${pageNav('worklog')}
</div>
<div class="wrap wide">
  ${sourceBanner(data.sources)}
  ${worklogView(data.worklog, data.ranges, defRange, wlHelp)}
  <div class="foot">Source: Jira worklogs (bucketed by issue label) + Odoo <code>hr.leave</code> &amp; VN public holidays (FTO/SL/Holiday column) · regenerated daily · self-contained page.</div>
</div>
${wlDataScript}
<script src="app.js"></script>
</body></html>`;

  // --- Claude vs Legacy page (claude.html) -----------------------------------
  // A derived, render-only view: reuses the "Test cases automated — with vs without
  // Claude" split data and recasts it as an automation-velocity (TCs/day) comparison.
  // Defaults to Last quarter (Apr–Jun) — the range the 159/145/304 card describes and
  // the only current range with both a legacy and a with-Claude window.
  const splitMeta = cfg.JIRA_SPLIT_METRICS[0];
  const splitData = splitMeta ? data.metrics[splitMeta.key] : null;
  const claudeDef = (splitData && splitData.ranges && splitData.ranges.lastQuarter) ? 'lastQuarter' : defRange;
  const claudeBody = splitData
    ? `<div class="sub muted" style="margin:10px 0 2px">Showing ${windowSpans(data.ranges, claudeDef, METRIC_RANGE_ORDER)}</div>
  ${selector(data.ranges, claudeDef)}
  ${withAnchor({ key: 'automationVelocity', label: 'Automation velocity — Claude vs Legacy' }, velocitySection(splitMeta, splitData, claudeDef))}`
    : '<p class="muted">No Claude-split data available.</p>';
  const claudeHtml = `${docHead('CRM QA — Claude vs Legacy')}
<div class="hero">
  <h1>CRM QA Team — Claude vs Legacy</h1>
  <div class="sub">${subline}</div>
  ${pageNav('claude')}
</div>
<div class="wrap">
  ${sourceBanner(data.sources)}
  ${claudeBody}
  <div class="foot">Source: Jira — automation-scope test cases resolved per day, split at the team's Claude-adoption date (2026-06-05) and compared as a rate (TCs/day) · regenerated daily · self-contained page.</div>
</div>
<script src="app.js"></script>
</body></html>`;

  // --- QA Ranking page (ranking.html) ---------------------------------------
  // Monthly per-tester ranking. Score = 3·(Create P1/2) + 2·(Create P3) +
  // 1·(Create P4) + 3·(Verified P1/2) + 2·(Verified P3) + 1·(Verified P4) +
  // 1·(Executed TC) + 1·(Maintenance/Created TC). Executed Automation TC comes
  // from the Allure monthly report (Section 1); every other cell is the team's
  // saved Jira JQL. Figures below are the Jun-2026 snapshot.
  const rkStyle = `<style>
  .rkwrap{overflow-x:auto}
  .rk{width:100%;border-collapse:collapse;font-size:13px;min-width:820px;margin:4px 0}
  .rk th,.rk td{padding:8px 9px;border-bottom:1px solid #eee;text-align:center;white-space:nowrap;font-variant-numeric:tabular-nums}
  .rk thead .grp th{color:#fff;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.03em;border-right:2px solid #fff}
  .rk thead .sub th{color:#555;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;background:#f3eefc;border-bottom:2px solid #d9c9ee}
  .rk .g-create{background:#e0872a}.rk .g-verify{background:#3d78ad}.rk .g-exec{background:#b8382f}.rk .g-maint{background:#9c4489}.rk .g-score{background:#e39a17}.rk .g-rank{background:#3f8542}
  .rk td.nm{text-align:left;font-weight:700;padding-left:14px}
  .rk td.val{font-weight:800;background:#faf7fe}
  .rk td.dim{color:#bbb}
  .rk td.sc{font-weight:800;font-size:15px;color:#4b2170}
  .rk td.dv{border-left:2px solid #e7dcf6}
  .rk .rk1{display:inline-block;min-width:26px;padding:2px 9px;border-radius:7px;font-weight:800;background:#f4b731;color:#6b4a00}
  .rk .rk2{display:inline-block;min-width:26px;padding:2px 9px;border-radius:7px;font-weight:800;border:1px solid #e5e0ee;color:#555}
  .rkeq{font-family:ui-monospace,Consolas,monospace;font-size:12.5px;background:#f3eefc;border:1px solid #d9c9ee;border-radius:8px;padding:11px 13px;line-height:1.85;color:#333;overflow-x:auto}
  .rkeq b{color:#8e44ad}
  .wlnote-pop pre{margin:0;font-family:ui-monospace,Consolas,monospace;font-size:11.5px;line-height:1.5;background:#faf7fe;border:1px solid #ece3fa;border-radius:7px;padding:9px 11px;white-space:pre-wrap;word-break:break-word;color:#333}
  .wlnote-pop .mn{font-size:11px;font-weight:700;color:#8e44ad;text-transform:uppercase;letter-spacing:.03em;margin:12px 0 5px}
  </style>`;
  const rkHead = `<thead>
      <tr class="grp"><th></th><th class="g-create" colspan="4">Create bugs</th><th class="g-verify" colspan="4">Verified bugs</th><th class="g-exec">Executed</th><th class="g-maint">Maint / Created</th><th class="g-score">Score</th><th class="g-rank">Rank</th></tr>
      <tr class="sub"><th>Name</th><th>P1/2</th><th>P3</th><th>P4</th><th>Valid bugs</th><th class="dv">P1/2</th><th>P3</th><th>P4</th><th>Total bugs &amp; Tickets</th><th class="dv">TC_LBL</th><th>TC_LBL</th><th class="dv">Score</th><th>Rank</th></tr>
    </thead>`;
  const rankingHtml = `${docHead('CRM QA — QA Ranking')}
${rkStyle}
<div class="hero">
  <h1>CRM QA Team — QA Ranking</h1>
  <div class="sub">${subline}</div>
  ${pageNav('ranking')}
</div>
<div class="wrap">
  ${sourceBanner(data.sources)}
  <div class="sub muted" style="margin:4px 0 2px">Monthly ranking · Period: <b>Jun 01 – 30, 2026</b></div>
  <div class="wlnote" tabindex="0">JQL for each metric <span class="wlnote-hint">(for the selected range — hover)</span>
    <span class="wlnote-pop">
      <div class="wlnote-h">Query</div>
      <div class="mn">Create Valid bugs — manual</div>
      <pre>type in ("Bug [uncategorised]", "Bug [Maintenance]", Bug, Sub-Bug, "Post-EA - Support Ticket")
AND created &gt;= 2026-06-01 AND created &lt;= 2026-06-30 AND reporter in (&lt;user&gt;)
AND (status in (Open, Reopened, "In Progress")
     OR resolution changed to (Fixed, Done, "Won't fix", Unresolved, "Won't Do"))</pre>
      <div class="mn">Verified bugs — manual</div>
      <pre>issuetype in ("Bug [uncategorised]", Bug, "Bug [Maintenance]", Sub-Bug, improvement, "Post-EA - Support Ticket", "Post-EA - Task")
AND status changed to (reopened, closed) DURING ("2026-06-01 00:00", "2026-06-30 21:00") BY (&lt;user&gt;)
AND priority not in ("Blocker (P1)", "Critical (P2)")</pre>
      <div class="mn">Executed Test cases — manual</div>
      <pre>project = CRM AND issuetype = "Post-EA - Test Case" AND worklogAuthor in (&lt;user&gt;)
AND worklogDate &gt;= 2026-06-01 AND worklogDate &lt;= 2026-06-30</pre>
      <div class="mn">Maintenance / Created Test cases — manual</div>
      <pre>project = CRM AND issuetype = "Post-EA - Test Case" AND reporter = &lt;user&gt;
AND createdDate &gt;= "2026-06-01 00:00" AND createdDate &lt;= "2026-06-30 21:00"</pre>
      <div class="mn">Create / Verified bugs — automation</div>
      <pre>labels in (QA-CRM_Automation) AND ...  (same as manual, plus the QA-CRM_Automation label)</pre>
      <div class="mn">Maintenance / Created Automation TC</div>
      <pre>"Automation scope" = yes
AND status changed to (resolved) DURING ("2026-06-01 00:00", "2026-06-30 21:00") BY &lt;user&gt;</pre>
      <div class="wlnote-h">Notes</div>
      <ul>
        <li>Per tester: bugs by <b>reporter</b> (create) / <b>actor</b> of the status change (verify); TCs by <b>worklogAuthor</b> (executed) / <b>reporter</b> (created).</li>
        <li>Verified headline count uses <b>priority not in (P1,P2)</b>; the P1/2 &amp; P3 columns are the full priority breakdown.</li>
        <li>Date bounds follow the sheet convention (<b>&le; "…21:00"</b>) — entries after 21:00 on the last day are dropped; use 23:59 for the full day.</li>
        <li><b>Executed Automation TC</b> is not a Jira metric — read from the Allure monthly report (Section 1) of the reported month.</li>
      </ul>
    </span>
  </div>

  <section id="m-ranking-manual" class="metric">
    <h2>CRM Manual <a class="anchor" href="#m-ranking-manual" data-anchor title="Copy link to this metric" aria-label="Copy link to this metric">🔗</a> <span class="pill">2 members</span></h2>
    <div class="rkwrap"><table class="rk">${rkHead.replace(/TC_LBL/g, 'Test cases')}
      <tbody>
        <tr><td class="nm">Thuat Phung</td><td>17</td><td>15</td><td class="dim">0</td><td class="val">32</td><td class="dv">31</td><td>18</td><td class="dim">0</td><td class="val">49</td><td class="dv">219</td><td>143</td><td class="sc dv">572</td><td><span class="rk1">1</span></td></tr>
        <tr><td class="nm">Anh Ho</td><td>5</td><td class="dim">0</td><td class="dim">0</td><td class="val">5</td><td class="dv">5</td><td>3</td><td class="dim">0</td><td class="val">8</td><td class="dv">27</td><td>179</td><td class="sc dv">242</td><td><span class="rk2">2</span></td></tr>
      </tbody>
    </table></div>
  </section>

  <section id="m-ranking-automation" class="metric">
    <h2>CRM Automation <a class="anchor" href="#m-ranking-automation" data-anchor title="Copy link to this metric" aria-label="Copy link to this metric">🔗</a> <span class="pill">2 members</span></h2>
    <div class="rkwrap"><table class="rk">${rkHead.replace(/TC_LBL/g, 'Automation TC')}
      <tbody>
        <tr><td class="nm">Thuat Phung</td><td class="dim">0</td><td class="dim">0</td><td class="dim">0</td><td class="val">0</td><td class="dv dim">0</td><td class="dim">0</td><td class="dim">0</td><td class="val">0</td><td class="dv dim">0</td><td class="dim">0</td><td class="sc dv">0</td><td><span class="rk2">2</span></td></tr>
        <tr><td class="nm">Anh Ho</td><td>2</td><td class="dim">0</td><td class="dim">0</td><td class="val">2</td><td class="dv dim">0</td><td class="dim">0</td><td class="dim">0</td><td class="val">0</td><td class="dv">530</td><td>145</td><td class="sc dv">681</td><td><span class="rk1">1</span></td></tr>
      </tbody>
    </table></div>
  </section>

  <section id="m-ranking-score" class="metric">
    <h2>Score formula <a class="anchor" href="#m-ranking-score" data-anchor title="Copy link to this metric" aria-label="Copy link to this metric">🔗</a></h2>
    <div class="rkeq">SCORE = <b>3</b>·(Create P1/2) + <b>2</b>·(Create P3) + <b>1</b>·(Create P4)
      + <b>3</b>·(Verified P1/2) + <b>2</b>·(Verified P3) + <b>1</b>·(Verified P4)
      + <b>1</b>·(Executed TC) + <b>1</b>·(Maintenance/Created TC)</div>
    <p class="muted" style="font-size:12px;margin:8px 0 0">Check: Thuat manual 81+129+219+143=572 · Anh manual 15+21+27+179=242 · Anh automation 6+0+530+145=681.</p>
  </section>

  <div class="foot">Bug &amp; test-case counts from Jira (team JQL, hover above) · Executed Automation TC from the Allure monthly report · Jun-2026 snapshot · self-contained page.</div>
</div>
<script src="app.js"></script>
</body></html>`;

  fs.mkdirSync(cfg.OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(cfg.OUT_DIR, 'styles.css'), CSS);
  fs.writeFileSync(path.join(cfg.OUT_DIR, 'app.js'), APP_JS);
  fs.writeFileSync(path.join(cfg.OUT_DIR, 'index.html'), jiraDashboardHtml);
  fs.writeFileSync(path.join(cfg.OUT_DIR, 'frd.html'), frdHtml);
  fs.writeFileSync(path.join(cfg.OUT_DIR, 'manual.html'), manualHtml);
  fs.writeFileSync(path.join(cfg.OUT_DIR, 'automation.html'), automationHtml);
  fs.writeFileSync(path.join(cfg.OUT_DIR, 'worklog.html'), worklogHtml);
  fs.writeFileSync(path.join(cfg.OUT_DIR, 'claude.html'), claudeHtml);
  fs.writeFileSync(path.join(cfg.OUT_DIR, 'ranking.html'), rankingHtml);
  console.log(`[render] Wrote index.html (Jira Dashboard) + frd.html + manual.html + automation.html + worklog.html + claude.html + ranking.html (+ styles.css, app.js)`);
}

main();
