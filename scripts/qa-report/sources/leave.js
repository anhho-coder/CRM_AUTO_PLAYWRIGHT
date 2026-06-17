'use strict';
/**
 * Source: Odoo `hr.leave` — FTO + Sick-Leave hours for the QA ICs. These feed
 * the "QA-FTO/SL/Holiday" column on the Worklog allocation page (that column is
 * NOT a Jira label; leave is tracked in Odoo, not Jira).
 *
 * Business rule (confirmed + adversarially verified against the live model):
 * for each IC, sum the leave's "Duration in hours" for leave types in
 * cfg.LEAVE_TYPES, Approved only, bucketed by the leave's LOCAL start date.
 *
 * Field semantics pinned to Odoo 12 `hr.leave` (Nakivo01):
 *   employee_id             -> "Contractor"
 *   holiday_status_id       -> "Leave Type" (FTO=1, Sick Leaves=2; resolved by name below)
 *   number_of_hours_display -> "Duration in hours"  (use directly; NOT days*8 —
 *                              Odoo derives it from the work-calendar span)
 *   request_date_from       -> the local "Start Date" shown in the UI. We bucket
 *                              on this, NOT date_from (which is UTC and shifts a
 *                              few late-evening rows to the wrong local day).
 *   state == 'validate'     -> Approved
 *
 * Note: this DB has no "Holiday" leave type, so the column is FTO + Sick Leaves
 * only (the "Holiday" in the header has no source here).
 */
const { OdooClient } = require('../lib/odoo');
const { loadOdoo, MEMBERS, MODEL_LEAVE, LEAVE_TYPES } = require('../config');
const { isoDate } = require('../lib/ranges');

const EMP_IDS = MEMBERS.map((m) => m.employeeId);
const NAME_BY_ID = Object.fromEntries(MEMBERS.map((m) => [m.employeeId, m.name]));

/**
 * @param now Date — leaves whose local start date is in [Jan 1 this year, today].
 * @returns [{ date:'YYYY-MM-DD', tester, hours }]   (one entry per leave record)
 */
async function collectLeave(now) {
  const client = new OdooClient(loadOdoo());
  await client.login();

  // Resolve the configured leave-type names to ids (robust to label edits, and
  // avoids relying on dotted-path domains).
  const types = await client.searchRead('hr.leave.type', [['name', 'in', LEAVE_TYPES]], { fields: ['id', 'name'] });
  const typeIds = types.map((t) => t.id);
  if (!typeIds.length) throw new Error(`No hr.leave.type matched ${JSON.stringify(LEAVE_TYPES)}`);

  const fromIso = isoDate(new Date(Date.UTC(now.getUTCFullYear(), 0, 1)));
  const toIso = isoDate(now);
  const rows = await client.searchRead(
    MODEL_LEAVE,
    [
      ['employee_id', 'in', EMP_IDS],
      ['holiday_status_id', 'in', typeIds],
      ['state', '=', 'validate'],            // Approved only
      ['request_date_from', '>=', fromIso],
      ['request_date_from', '<=', toIso],
    ],
    { fields: ['employee_id', 'number_of_hours_display', 'request_date_from', 'date_from'] }
  );

  return rows.map((r) => ({
    // local start day; fall back to the UTC date only if request_date_from is missing
    date: String(r.request_date_from || r.date_from || '').slice(0, 10),
    tester: NAME_BY_ID[r.employee_id && r.employee_id[0]] ||
      String((r.employee_id && r.employee_id[1]) || 'Unknown'),
    hours: Number(r.number_of_hours_display) || 0,
  })).filter((e) => e.date && e.hours);
}

module.exports = { collectLeave };
