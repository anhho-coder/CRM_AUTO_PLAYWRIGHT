'use strict';
/**
 * Source: Vietnamese public holidays — the "Holiday" part of the FTO/SL/Holiday
 * column (Odoo has no Holiday leave type). Read from the public Google
 * "Vietnamese Holidays" ICS feed (no API key). Each public-holiday day that
 * falls on a working day (Mon-Fri) credits cfg.HOLIDAY_WORKDAY_HOURS hours to
 * BOTH testers, bucketed by that date — same shape as leave entries, so it
 * merges into the same column.
 *
 * The Google feed is noisy, so we filter to actual days off:
 *   KEEP  real public holidays AND compensatory days OFF ("Day off for ...",
 *         i.e. "nghỉ bù") — matched via HOLIDAY_INCLUDE.
 *   DROP  make-up WORKING days ("Working day for ...", i.e. "làm bù") and
 *         non-VN-holidays (Easter, Christmas, Vietnam Culture Day, the int'l
 *         New Year's Eve) — via HOLIDAY_EXCLUDE + the Eve rule below.
 * Weekend holidays contribute 0 hours (no working day). Days are read only up to
 * `now` so the figure reflects holidays that have already occurred.
 */
const {
  HOLIDAY_ICS_URL, HOLIDAY_WORKDAY_HOURS, HOLIDAY_INCLUDE, HOLIDAY_EXCLUDE, MEMBERS,
} = require('../config');
const { isoDate } = require('../lib/ranges');

const inc = HOLIDAY_INCLUDE.map((s) => s.toLowerCase());
const exc = HOLIDAY_EXCLUDE.map((s) => s.toLowerCase());

function isDayOff(summary) {
  const s = (summary || '').toLowerCase();
  if (exc.some((k) => s.includes(k))) return false;             // make-up workday / non-holiday
  // "...New Year's Eve" is an int'l observance (not a day off) — but the
  // Vietnamese / Tet eve (Giao thừa) IS a day off, so keep those.
  if (s.includes('eve') && !s.includes('vietnamese') && !s.includes('tet') && !s.includes('tết')) return false;
  return inc.some((k) => s.includes(k));
}

const d8ToIso = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const isWorkday = (iso) => { const g = new Date(iso + 'T00:00:00Z').getUTCDay(); return g !== 0 && g !== 6; };

/** Distinct day-off dates (YYYY-MM-DD) for `year`, expanding any multi-day events. */
async function fetchHolidayDates(year) {
  const res = await fetch(HOLIDAY_ICS_URL);
  if (!res.ok) throw new Error(`Holiday ICS HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  const dates = new Set();
  for (const chunk of text.split('BEGIN:VEVENT').slice(1)) {
    const ev = chunk.split('END:VEVENT')[0];
    const sm = ev.match(/(?:^|\n)SUMMARY:(.*)/);
    const ds = ev.match(/DTSTART[^:\n]*:(\d{8})/);
    if (!ds || !isDayOff(sm ? sm[1].trim() : '')) continue;
    const de = ev.match(/DTEND[^:\n]*:(\d{8})/);          // DTEND is exclusive for all-day events
    const start = new Date(d8ToIso(ds[1]) + 'T00:00:00Z');
    const end = de ? new Date(d8ToIso(de[1]) + 'T00:00:00Z') : null;
    if (!end || end <= start) { dates.add(d8ToIso(ds[1])); continue; }
    for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) dates.add(isoDate(d));
  }
  return [...dates].filter((iso) => iso.startsWith(String(year)));
}

/**
 * @param now Date
 * @returns [{ date:'YYYY-MM-DD', tester, hours }] — one entry per (working-day holiday × tester)
 */
async function collectHolidays(now) {
  const toIso = isoDate(now);
  const dates = (await fetchHolidayDates(now.getUTCFullYear()))
    .filter((iso) => iso <= toIso && isWorkday(iso));
  const entries = [];
  for (const date of dates) for (const m of MEMBERS) entries.push({ date, tester: m.name, hours: HOLIDAY_WORKDAY_HOURS });
  return entries;
}

module.exports = { collectHolidays, fetchHolidayDates };
