/**
 * CRM-11857_3.3.x (crm-mig, folder "3. Conversion & stability of values") - which pre-production BASELINE each spec was
 * ported from. ONE source of truth for the traceability shown in the reports (baselineDetails() in fx-quotation-mig.helper.ts).
 *
 *  key           crm-mig Test Case ID (the spec's `const TC`), children of CRM-11857_3.3 (CRM-13394)
 *  baselineTc    pre-production Test Case ID (tests/1.Project_CRM/8.Invoicing_Module/ExchangeRate/1.3 US3 ..., `const TC`)
 *  baselineJira  '' - the 15 Exchange-rate_1.3.x baselines are not imported to Xray yet (2026-10-26)
 *  baselineSpec  the baseline automation spec, repo-relative
 *  masterRow     row of the crm-mig TC in master tab "Migration - Exchange Rate" (rows 31-45, written 2026-10-27)
 *  migJira       Xray key of the crm-mig manual TC - '' until imported; fill it in here, nowhere else
 */
import type { BaselineLink } from '@helpers/baseline-traceability';

export const CRM11857_33_BASELINE_MAP: Readonly<Record<string, BaselineLink>> = {
  'CRM-11857_3.3.1': { baselineTc: 'Exchange-rate_1.3.1', baselineJira: '', baselineSpec: 'tests/1.Project_CRM/8.Invoicing_Module/ExchangeRate/1.3 US3 - Everything that uses the conversion keeps working/tc-exchange-rate-1-3-1-quantity-change-recomputes-company-total.spec.ts', masterRow: 31, migJira: '' },
  'CRM-11857_3.3.2': { baselineTc: 'Exchange-rate_1.3.2', baselineJira: '', baselineSpec: 'tests/1.Project_CRM/8.Invoicing_Module/ExchangeRate/1.3 US3 - Everything that uses the conversion keeps working/tc-exchange-rate-1-3-2-order-date-then-quantity-uses-new-date-rate.spec.ts', masterRow: 32, migJira: '' },
  'CRM-11857_3.3.3': { baselineTc: 'Exchange-rate_1.3.3', baselineJira: '', baselineSpec: 'tests/1.Project_CRM/8.Invoicing_Module/ExchangeRate/1.3 US3 - Everything that uses the conversion keeps working/tc-exchange-rate-1-3-3-line-description-edit-keeps-company-total.spec.ts', masterRow: 33, migJira: '' },
  'CRM-11857_3.3.4': { baselineTc: 'Exchange-rate_1.3.4', baselineJira: '', baselineSpec: 'tests/1.Project_CRM/8.Invoicing_Module/ExchangeRate/1.3 US3 - Everything that uses the conversion keeps working/tc-exchange-rate-1-3-4-line-discount-recomputes-company-total.spec.ts', masterRow: 34, migJira: '' },
  'CRM-11857_3.3.5': { baselineTc: 'Exchange-rate_1.3.5', baselineJira: '', baselineSpec: 'tests/1.Project_CRM/8.Invoicing_Module/ExchangeRate/1.3 US3 - Everything that uses the conversion keeps working/tc-exchange-rate-1-3-5-added-line-recomputes-whole-order.spec.ts', masterRow: 35, migJira: '' },
  'CRM-11857_3.3.6': { baselineTc: 'Exchange-rate_1.3.6', baselineJira: '', baselineSpec: 'tests/1.Project_CRM/8.Invoicing_Module/ExchangeRate/1.3 US3 - Everything that uses the conversion keeps working/tc-exchange-rate-1-3-6-removed-line-recomputes-company-total.spec.ts', masterRow: 36, migJira: '' },
  'CRM-11857_3.3.7': { baselineTc: 'Exchange-rate_1.3.7', baselineJira: '', baselineSpec: 'tests/1.Project_CRM/8.Invoicing_Module/ExchangeRate/1.3 US3 - Everything that uses the conversion keeps working/tc-exchange-rate-1-3-7-unit-price-change-recomputes-company-total.spec.ts', masterRow: 37, migJira: '' },
  'CRM-11857_3.3.8': { baselineTc: 'Exchange-rate_1.3.8', baselineJira: '', baselineSpec: 'tests/1.Project_CRM/8.Invoicing_Module/ExchangeRate/1.3 US3 - Everything that uses the conversion keeps working/tc-exchange-rate-1-3-8-reseller-partner-discount-recomputes-company-total.spec.ts', masterRow: 38, migJira: '' },
  'CRM-11857_3.3.9': { baselineTc: 'Exchange-rate_1.3.9', baselineJira: '', baselineSpec: 'tests/1.Project_CRM/8.Invoicing_Module/ExchangeRate/1.3 US3 - Everything that uses the conversion keeps working/tc-exchange-rate-1-3-9-applied-promotion-recomputes-company-total.spec.ts', masterRow: 39, migJira: '' },
  'CRM-11857_3.3.10': { baselineTc: 'Exchange-rate_1.3.10', baselineJira: '', baselineSpec: 'tests/1.Project_CRM/8.Invoicing_Module/ExchangeRate/1.3 US3 - Everything that uses the conversion keeps working/tc-exchange-rate-1-3-10-removed-promotion-recomputes-company-total.spec.ts', masterRow: 40, migJira: '' },
  'CRM-11857_3.3.11': { baselineTc: 'Exchange-rate_1.3.11', baselineJira: '', baselineSpec: 'tests/1.Project_CRM/8.Invoicing_Module/ExchangeRate/1.3 US3 - Everything that uses the conversion keeps working/tc-exchange-rate-1-3-11-pricelist-change-to-gbp-after-order-date.spec.ts', masterRow: 41, migJira: '' },
  'CRM-11857_3.3.12': { baselineTc: 'Exchange-rate_1.3.12', baselineJira: '', baselineSpec: 'tests/1.Project_CRM/8.Invoicing_Module/ExchangeRate/1.3 US3 - Everything that uses the conversion keeps working/tc-exchange-rate-1-3-12-payment-term-change-keeps-company-total.spec.ts', masterRow: 42, migJira: '' },
  'CRM-11857_3.3.13': { baselineTc: 'Exchange-rate_1.3.13', baselineJira: '', baselineSpec: 'tests/1.Project_CRM/8.Invoicing_Module/ExchangeRate/1.3 US3 - Everything that uses the conversion keeps working/tc-exchange-rate-1-3-13-duplicate-quotation-company-total.spec.ts', masterRow: 43, migJira: '' },
  'CRM-11857_3.3.14': { baselineTc: 'Exchange-rate_1.3.14', baselineJira: '', baselineSpec: 'tests/1.Project_CRM/8.Invoicing_Module/ExchangeRate/1.3 US3 - Everything that uses the conversion keeps working/tc-exchange-rate-1-3-14-confirm-keeps-company-total.spec.ts', masterRow: 44, migJira: '' },
  'CRM-11857_3.3.15': { baselineTc: 'Exchange-rate_1.3.15', baselineJira: '', baselineSpec: 'tests/1.Project_CRM/8.Invoicing_Module/ExchangeRate/1.3 US3 - Everything that uses the conversion keeps working/tc-exchange-rate-1-3-15-new-rate-row-applies-on-next-line-edit.spec.ts', masterRow: 45, migJira: '' },
};
