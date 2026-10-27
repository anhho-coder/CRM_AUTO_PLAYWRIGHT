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
  'TC-FLOW-001_B': {
    baselineTc: 'TC-FLOW-001_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/Lifecycle & escalation/tc-flow-001-a-preprod-cs-stage-list-and-order.spec.ts',
    masterRow: 90,
    migJira: '',
  },
  'TC-FLOW-002_B': {
    baselineTc: 'TC-FLOW-002_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/Lifecycle & escalation/tc-flow-002-a-preprod-l2-handoff-stage-moves.spec.ts',
    masterRow: 91,
    migJira: '',
  },
  'TC-FLOW-030_B': {
    baselineTc: 'TC-FLOW-030_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/Lifecycle & escalation/tc-flow-030-a-preprod-hibernate-a-ticket.spec.ts',
    masterRow: 119,
    migJira: '',
  },
  'TC-FLOW-032_B': {
    baselineTc: 'TC-FLOW-032_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/Lifecycle & escalation/tc-flow-032-a-preprod-direct-hibernate-refused.spec.ts',
    masterRow: 121,
    migJira: '',
  },
  'TC-FLOW-058_B': {
    baselineTc: 'TC-FLOW-058_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/Lifecycle & escalation/tc-flow-058-a-preprod-archive-noise-ticket.spec.ts',
    masterRow: 147,
    migJira: '',
  },
  'TC-UI-063_B': {
    baselineTc: 'TC-UI-063_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/Lifecycle & escalation/tc-ui-063-a-preprod-kanban-drag-hibernate-refused.spec.ts',
    masterRow: 282,
    migJira: '',
  },
  'TC-FLOW-038_B': {
    baselineTc: 'TC-FLOW-038_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/Lifecycle & escalation/tc-flow-038-a-preprod-close-gate-nothing-filled.spec.ts',
    masterRow: 127,
    migJira: '',
  },
  'TC-FLOW-039_B': {
    baselineTc: 'TC-FLOW-039_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/Lifecycle & escalation/tc-flow-039-a-preprod-close-gate-some-fields-missing.spec.ts',
    masterRow: 128,
    migJira: '',
  },
  'TC-FLOW-040_B': {
    baselineTc: 'TC-FLOW-040_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/Lifecycle & escalation/tc-flow-040-a-preprod-close-gate-assignee-missing.spec.ts',
    masterRow: 129,
    migJira: '',
  },
  'TC-FLOW-041_B': {
    baselineTc: 'TC-FLOW-041_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/Lifecycle & escalation/tc-flow-041-a-preprod-close-fully-classified-ticket.spec.ts',
    masterRow: 130,
    migJira: '',
  },
  'TC-UI-059_B': {
    baselineTc: 'TC-UI-059_A',
    baselineJira: '',
    baselineSpec: 'tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/Lifecycle & escalation/tc-ui-059-a-preprod-set-stage-on-three-tickets.spec.ts',
    masterRow: 278,
    migJira: '',
  },
};
