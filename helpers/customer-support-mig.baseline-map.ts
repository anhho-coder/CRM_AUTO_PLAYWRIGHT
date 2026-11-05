import type { BaselineLink } from '@helpers/baseline-traceability';

/**
 * CRM-11859 Customer Support migration - every migration-side spec (B: Support service, Frappe Helpdesk) mapped to the
 * pre-production baseline spec (A: Odoo 12) of the SAME CSV row (automate_manual_tc_from_jira, REQUIREMENT #8).
 *
 * Source rows: test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/Helpdesk-AB-Test-Cases - Pre-pro.csv
 *  - masterRow    = the row's record number in that CSV (header excluded) - these cases have no master-file tab
 *  - baselineJira = '' and migJira = '' until the cases are imported to Xray (tester decision 2026-10-23);
 *                   fill them here, nowhere else, when the keys exist
 * The B spec asserts its own CSV "B expected" column; where A and B expect the same thing the values are identical.
 */
export const CUSTOMER_SUPPORT_BASELINE_MAP: Readonly<Record<string, BaselineLink>> = {
  // ── 2026-10-30: spec area "1. Ticket ownership" (added to the master on the tester's request) ──
  'TC-SEC-066_B': {
    baselineTc: 'TC-SEC-066_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/1. Ticket ownership/tc-sec-066-a-preprod-migrated-ticket-header.spec.ts',
    masterRow: 572,
    migJira: '',
  },
  'TC-SEC-080_B': {
    baselineTc: 'TC-SEC-080_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/1. Ticket ownership/tc-sec-080-a-preprod-archived-and-old-open-tickets.spec.ts',
    masterRow: 586,
    migJira: '',
  },
  'TC-FLOW-001_B': {
    baselineTc: 'TC-FLOW-001_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/4. Lifecycle & escalation/tc-flow-001-a-preprod-cs-stage-list-and-order.spec.ts',
    masterRow: 90,
    migJira: '',
  },
  'TC-FLOW-002_B': {
    baselineTc: 'TC-FLOW-002_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/4. Lifecycle & escalation/tc-flow-002-a-preprod-l2-handoff-stage-moves.spec.ts',
    masterRow: 91,
    migJira: '',
  },
  'TC-FLOW-030_B': {
    baselineTc: 'TC-FLOW-030_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/4. Lifecycle & escalation/tc-flow-030-a-preprod-hibernate-a-ticket.spec.ts',
    masterRow: 119,
    migJira: '',
  },
  'TC-FLOW-032_B': {
    baselineTc: 'TC-FLOW-032_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/4. Lifecycle & escalation/tc-flow-032-a-preprod-direct-hibernate-refused.spec.ts',
    masterRow: 121,
    migJira: '',
  },
  'TC-FLOW-058_B': {
    baselineTc: 'TC-FLOW-058_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/4. Lifecycle & escalation/tc-flow-058-a-preprod-archive-noise-ticket.spec.ts',
    masterRow: 147,
    migJira: '',
  },
  'TC-UI-063_B': {
    baselineTc: 'TC-UI-063_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/4. Lifecycle & escalation/tc-ui-063-a-preprod-kanban-drag-hibernate-refused.spec.ts',
    masterRow: 282,
    migJira: '',
  },
  'TC-FLOW-038_B': {
    baselineTc: 'TC-FLOW-038_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/4. Lifecycle & escalation/tc-flow-038-a-preprod-close-gate-nothing-filled.spec.ts',
    masterRow: 127,
    migJira: '',
  },
  'TC-FLOW-039_B': {
    baselineTc: 'TC-FLOW-039_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/4. Lifecycle & escalation/tc-flow-039-a-preprod-close-gate-some-fields-missing.spec.ts',
    masterRow: 128,
    migJira: '',
  },
  'TC-FLOW-040_B': {
    baselineTc: 'TC-FLOW-040_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/4. Lifecycle & escalation/tc-flow-040-a-preprod-close-gate-assignee-missing.spec.ts',
    masterRow: 129,
    migJira: '',
  },
  'TC-FLOW-041_B': {
    baselineTc: 'TC-FLOW-041_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/4. Lifecycle & escalation/tc-flow-041-a-preprod-close-fully-classified-ticket.spec.ts',
    masterRow: 130,
    migJira: '',
  },
  'TC-UI-059_B': {
    baselineTc: 'TC-UI-059_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/4. Lifecycle & escalation/tc-ui-059-a-preprod-set-stage-on-three-tickets.spec.ts',
    masterRow: 278,
    migJira: '',
  },
  // ── batch 2 (2026-10-28): spec area "5. Service-level targets" ──
  'TC-FLOW-013_B': {
    baselineTc: 'TC-FLOW-013_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/5. Service-level targets/tc-flow-013-a-preprod-due-date-on-l2-by-priority.spec.ts',
    masterRow: 102,
    migJira: '',
  },
  'TC-FLOW-015_B': {
    baselineTc: 'TC-FLOW-015_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/5. Service-level targets/tc-flow-015-a-preprod-due-date-on-customer.spec.ts',
    masterRow: 104,
    migJira: '',
  },
  'TC-FLOW-018_B': {
    baselineTc: 'TC-FLOW-018_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/5. Service-level targets/tc-flow-018-a-preprod-other-moves-keep-due-date.spec.ts',
    masterRow: 107,
    migJira: '',
  },
  'TC-FLOW-020_B': {
    baselineTc: 'TC-FLOW-020_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/5. Service-level targets/tc-flow-020-a-preprod-overdue-flag-and-filter.spec.ts',
    masterRow: 109,
    migJira: '',
  },
  // ── batch 2 (2026-10-28): spec area "3. Queue, ownership & team" ──
  'TC-FLOW-003_B': {
    baselineTc: 'TC-FLOW-003_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/3. Queue, ownership & team/tc-flow-003-a-preprod-assignment-keeps-stage.spec.ts',
    masterRow: 92,
    migJira: '',
  },
  'TC-UI-038_B': {
    baselineTc: 'TC-UI-038_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/3. Queue, ownership & team/tc-ui-038-a-preprod-agent-creates-ticket.spec.ts',
    masterRow: 257,
    migJira: '',
  },
  'TC-SEC-018_B': {
    baselineTc: 'TC-SEC-018_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/3. Queue, ownership & team/tc-sec-018-a-preprod-assigned-to-only-team-members.spec.ts',
    masterRow: 524,
    migJira: '',
  },
  'TC-SEC-019_B': {
    baselineTc: 'TC-SEC-019_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/3. Queue, ownership & team/tc-sec-019-a-preprod-no-auto-assignment-claim.spec.ts',
    masterRow: 525,
    migJira: '',
  },
  // ── batch 2 (2026-10-28): spec area "18. User interface" ──
  'TC-UI-015_B': {
    baselineTc: 'TC-UI-015_A',
    baselineJira: 'CRM-13974',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/18. User interface/tc-ui-015-a-preprod-side-panel-field-order.spec.ts',
    masterRow: 78,
    migJira: 'CRM-14024',
  },
  'TC-UI-043_B': {
    baselineTc: 'TC-UI-043_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/18. User interface/tc-ui-043-a-preprod-all-tickets-list-and-columns.spec.ts',
    masterRow: 262,
    migJira: '',
  },
  'TC-UI-045_B': {
    baselineTc: 'TC-UI-045_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/18. User interface/tc-ui-045-a-preprod-filters-menu-entries.spec.ts',
    masterRow: 264,
    migJira: '',
  },
  'TC-UI-046_B': {
    baselineTc: 'TC-UI-046_A',
    baselineJira: 'CRM-13977',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/18. User interface/tc-ui-046-a-preprod-four-basic-filters.spec.ts',
    masterRow: 81,
    migJira: 'CRM-14027',
  },
  'TC-UI-050_B': {
    baselineTc: 'TC-UI-050_A',
    baselineJira: 'CRM-13978',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/18. User interface/tc-ui-050-a-preprod-all-quick-search.spec.ts',
    masterRow: 82,
    migJira: 'CRM-14028',
  },
  'TC-UI-061_B': {
    baselineTc: 'TC-UI-061_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/18. User interface/tc-ui-061-a-preprod-kanban-columns-and-counts.spec.ts',
    masterRow: 280,
    migJira: '',
  },
  // ── batch 2 (2026-10-28): spec area "15. Data & history migration" ──
  'TC-UI-010_B': {
    baselineTc: 'TC-UI-010_A',
    baselineJira: 'CRM-13965',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/15. Data & history migration/tc-ui-010-a-preprod-find-ticket-by-odoo-number.spec.ts',
    masterRow: 67,
    migJira: 'CRM-14015',
  },
  // ── batch 2 (2026-10-28): spec area "17. Access, security & scale" ──
  'TC-SEC-047_B': {
    baselineTc: 'TC-SEC-047_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/17. Access, security & scale/tc-sec-047-a-preprod-unterminated-html-subject.spec.ts',
    masterRow: 553,
    migJira: '',
  },
  // ── batch 2 (2026-10-28): spec area "10. Response templates" ──
  'TC-SEC-052_B': {
    baselineTc: 'TC-SEC-052_A',
    baselineJira: 'CRM-13953',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/10. Response templates/tc-sec-052-a-preprod-reply-template-no-code.spec.ts',
    masterRow: 50,
    migJira: 'CRM-14003',
  },
  // ── batch 2 (2026-10-28): spec area "11. CRM context & adjacent workflows" ──
  'TC-CUST-051_B': {
    baselineTc: 'TC-CUST-051_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/11. CRM context & adjacent workflows/tc-cust-051-a-preprod-meeting-needs-engineer.spec.ts',
    masterRow: 381,
    migJira: '',
  },
  'TC-CUST-074_B': {
    baselineTc: 'TC-CUST-074_A',
    baselineJira: 'CRM-13955',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/11. CRM context & adjacent workflows/tc-cust-074-a-preprod-jira-reference-format.spec.ts',
    masterRow: 53,
    migJira: 'CRM-14005',
  },
  // ── batch 2 (2026-10-28): spec area "2. Intake & correspondence" ──
  'TC-MAIL-059_B': {
    baselineTc: 'TC-MAIL-059_A',
    baselineJira: 'CRM-13930',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/2. Intake & correspondence/tc-mail-059-a-preprod-reply-editor-defaults.spec.ts',
    masterRow: 21,
    migJira: 'CRM-13980',
  },
  'TC-MAIL-061_B': {
    baselineTc: 'TC-MAIL-061_A',
    baselineJira: 'CRM-13931',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/2. Intake & correspondence/tc-mail-061-a-preprod-reply-subject-ticket-number.spec.ts',
    masterRow: 22,
    migJira: 'CRM-13981',
  },
  'TC-MAIL-062_B': {
    baselineTc: 'TC-MAIL-062_A',
    baselineJira: 'CRM-13932',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/2. Intake & correspondence/tc-mail-062-a-preprod-edited-reply-is-sent.spec.ts',
    masterRow: 23,
    migJira: 'CRM-13982',
  },
  // ── batch 2 (2026-10-28): spec area "8. Satisfaction ratings" ──
  'TC-MAIL-070_B': {
    baselineTc: 'TC-MAIL-070_A',
    baselineJira: 'CRM-13952',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/8. Satisfaction ratings/tc-mail-070-a-preprod-satisfaction-mail.spec.ts',
    masterRow: 48,
    migJira: 'CRM-14002',
  },
  // ── batch 2 (2026-10-28): spec area "12. Reporting & oversight" ──
  'TC-REP-006_B': {
    baselineTc: 'TC-REP-006_A',
    baselineJira: 'CRM-13956',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/12. Reporting & oversight/tc-rep-006-a-preprod-ticket-analysis-default-layout.spec.ts',
    masterRow: 57,
    migJira: 'CRM-14006',
  },
  'TC-REP-013_B': {
    baselineTc: 'TC-REP-013_A',
    baselineJira: 'CRM-13957',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/12. Reporting & oversight/tc-rep-013-a-preprod-pivot-cell-drilldown.spec.ts',
    masterRow: 58,
    migJira: 'CRM-14007',
  },
  'TC-REP-029_B': {
    baselineTc: 'TC-REP-029_A',
    baselineJira: 'CRM-13958',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/12. Reporting & oversight/tc-rep-029-a-preprod-overview-tiles.spec.ts',
    masterRow: 59,
    migJira: 'CRM-14008',
  },
  'TC-REP-033_B': {
    baselineTc: 'TC-REP-033_A',
    baselineJira: 'CRM-13959',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/12. Reporting & oversight/tc-rep-033-a-preprod-report-speed.spec.ts',
    masterRow: 60,
    migJira: 'CRM-14009',
  },
  'TC-REP-035_B': {
    baselineTc: 'TC-REP-035_A',
    baselineJira: 'CRM-13960',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/12. Reporting & oversight/tc-rep-035-a-preprod-ticket-cycle-defaults.spec.ts',
    masterRow: 61,
    migJira: 'CRM-14010',
  },
  'TC-REP-038_B': {
    baselineTc: 'TC-REP-038_A',
    baselineJira: 'CRM-13961',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/12. Reporting & oversight/tc-rep-038-a-preprod-ticket-cycle-row-per-move.spec.ts',
    masterRow: 62,
    migJira: 'CRM-14011',
  },
  'TC-REP-041_B': {
    baselineTc: 'TC-REP-041_A',
    baselineJira: 'CRM-13962',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/12. Reporting & oversight/tc-rep-041-a-preprod-messages-report-defaults.spec.ts',
    masterRow: 63,
    migJira: 'CRM-14012',
  },
  'TC-REP-044_B': {
    baselineTc: 'TC-REP-044_A',
    baselineJira: 'CRM-13963',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/12. Reporting & oversight/tc-rep-044-a-preprod-messages-count-agent-actions.spec.ts',
    masterRow: 64,
    migJira: 'CRM-14013',
  },
  'TC-REP-046_B': {
    baselineTc: 'TC-REP-046_A',
    baselineJira: 'CRM-13964',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/12. Reporting & oversight/tc-rep-046-a-preprod-message-history-grid.spec.ts',
    masterRow: 65,
    migJira: 'CRM-14014',
  },
  // ── 2026-11-03: written from Confluence 231246777 v9 (Aiva's answers on CRM-13842/13843/13845/13846) - NO CSV row, so
  //    masterRow = the row on master tab 'Migration - Customer Support' (written 2026-11-03), keys = the Xray Tests ──
  'TC-UI-112_B': {
    baselineTc: 'TC-UI-112_A',
    baselineJira: 'CRM-14105',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/18. User interface/tc-ui-112-a-preprod-two-filters-together.spec.ts',
    masterRow: 84,
    migJira: 'CRM-14106',
  },
  'TC-UI-113_B': {
    baselineTc: 'TC-UI-113_A',
    baselineJira: 'CRM-14107',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/18. User interface/tc-ui-113-a-preprod-new-ticket-required-marks.spec.ts',
    masterRow: 85,
    migJira: 'CRM-14108',
  },
  'TC-UI-114_B': {
    baselineTc: 'TC-UI-114_A',
    baselineJira: 'CRM-14109',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/18. User interface/tc-ui-114-a-preprod-customer-picker-name-domain.spec.ts',
    masterRow: 86,
    migJira: 'CRM-14110',
  },
  'TC-FLOW-131_B': {
    baselineTc: 'TC-FLOW-131_A',
    baselineJira: 'CRM-14111',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/3. Queue, ownership & team/tc-flow-131-a-preprod-manual-ticket-required-fields.spec.ts',
    masterRow: 29,
    migJira: 'CRM-14112',
  },
  'TC-CUST-099_B': {
    baselineTc: 'TC-CUST-099_A',
    baselineJira: 'CRM-14113',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/11. CRM context & adjacent workflows/tc-cust-099-a-preprod-my-meetings-by-date.spec.ts',
    masterRow: 54,
    migJira: 'CRM-14114',
  },
  'TC-CUST-100_B': {
    baselineTc: 'TC-CUST-100_A',
    baselineJira: 'CRM-14115',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/11. CRM context & adjacent workflows/tc-cust-100-a-preprod-meeting-report-on-ticket.spec.ts',
    masterRow: 55,
    migJira: 'CRM-14116',
  },
};
