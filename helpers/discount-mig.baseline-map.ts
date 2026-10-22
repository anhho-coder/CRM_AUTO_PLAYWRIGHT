/**
 * CRM-12144 Discounts (Promotions) on crm-mig - which pre-production BASELINE each crm-mig spec was ported from.
 * ONE source of truth for the traceability shown in the reports (see baselineDetails() in discount-mig.helper.ts).
 *
 *  key           crm-mig Test Case ID (master "Migration - Discount", the spec's `const TC`)
 *  baselineTc    pre-production Test Case ID (tests/1.Project_CRM/10.Sales_Module/Discount, `const TC`)
 *  baselineJira  Xray "Post-EA - Test Case" of the baseline (summary "Discount_x.y ...", read on Jira 2026-10-22)
 *  baselineSpec  the baseline automation spec, repo-relative
 *  masterRow     row of the crm-mig manual TC in master tab "Migration - Discount"
 *  migJira       Xray key of the crm-mig manual TC - EMPTY until the 46 CRM-12144 TCs are imported (the master's
 *                Jira link column is empty on 2026-10-22); fill it in here, nowhere else
 */
import type { BaselineLink } from '@helpers/baseline-traceability';

export const CRM12144_BASELINE_MAP: Readonly<Record<string, BaselineLink>> = {
  'CRM-12144_1.1': { baselineTc: 'Discount_1.1', baselineJira: 'CRM-13764', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/tc-discount-1-1-create-program-with-condition-and-percent.spec.ts', masterRow: 18, migJira: '' },
  'CRM-12144_1.2': { baselineTc: 'Discount_1.2', baselineJira: 'CRM-13765', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/tc-discount-1-2-deal-element-before-valid-from.spec.ts', masterRow: 19, migJira: '' },
  'CRM-12144_1.3': { baselineTc: 'Discount_1.3', baselineJira: 'CRM-13766', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/tc-discount-1-3-quotation-program-ends-within-30-days.spec.ts', masterRow: 20, migJira: '' },
  'CRM-12144_1.4': { baselineTc: 'Discount_1.4', baselineJira: 'CRM-13767', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/tc-discount-1-4-one-customer-program-two-customers.spec.ts', masterRow: 21, migJira: '' },
  'CRM-12144_1.5': { baselineTc: 'Discount_1.5', baselineJira: 'CRM-13768', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/tc-discount-1-5-deal-registration-needs-listed-product.spec.ts', masterRow: 22, migJira: '' },
  'CRM-12144_1.6': { baselineTc: 'Discount_1.6', baselineJira: 'CRM-13769', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/tc-discount-1-6-minimum-quantity-exact.spec.ts', masterRow: 23, migJira: '' },
  'CRM-12144_1.7': { baselineTc: 'Discount_1.7', baselineJira: 'CRM-13770', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/tc-discount-1-7-minimum-amount-exact-and-one-cent-below.spec.ts', masterRow: 24, migJira: '' },
  'CRM-12144_1.8': { baselineTc: 'Discount_1.8', baselineJira: 'CRM-13771', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/tc-discount-1-8-foreign-currency-minimum-at-latest-rate.spec.ts', masterRow: 25, migJira: '' },
  'CRM-12144_1.9': { baselineTc: 'Discount_1.9', baselineJira: 'CRM-13772', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/tc-discount-1-9-minimum-compared-after-partner-discount.spec.ts', masterRow: 26, migJira: '' },
  'CRM-12144_1.10': { baselineTc: 'Discount_1.10', baselineJira: 'CRM-13773', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/tc-discount-1-10-one-of-two-conditions-met.spec.ts', masterRow: 27, migJira: '' },
  'CRM-12144_1.11': { baselineTc: 'Discount_1.11', baselineJira: 'CRM-13774', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/tc-discount-1-11-qty-below-minimum-drops-deal-registration.spec.ts', masterRow: 28, migJira: '' },
  'CRM-12144_1.12': { baselineTc: 'Discount_1.12', baselineJira: 'CRM-13775', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/tc-discount-1-12-price-just-below-minimum-keeps-reward.spec.ts', masterRow: 29, migJira: '' },
  'CRM-12144_1.13': { baselineTc: 'Discount_1.13', baselineJira: 'CRM-13776', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/tc-discount-1-13-archived-program-leaves-saved-deal-element.spec.ts', masterRow: 30, migJira: '' },
  'CRM-12144_1.15': { baselineTc: 'Discount_1.15', baselineJira: 'CRM-13777', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/tc-discount-1-15-salesperson-cannot-create-programs.spec.ts', masterRow: 32, migJira: '' },
  'CRM-12144_2.1': { baselineTc: 'Discount_2.1', baselineJira: 'CRM-13778', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/2. Applying discounts to orders/tc-discount-2-1-pick-eligible-program-on-deal-element.spec.ts', masterRow: 34, migJira: '' },
  'CRM-12144_2.2': { baselineTc: 'Discount_2.2', baselineJira: 'CRM-13779', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/2. Applying discounts to orders/tc-discount-2-2-eligible-not-picked-no-reward.spec.ts', masterRow: 35, migJira: '' },
  'CRM-12144_2.3': { baselineTc: 'Discount_2.3', baselineJira: 'CRM-13780', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/2. Applying discounts to orders/tc-discount-2-3-reward-line-shape-on-quotation.spec.ts', masterRow: 36, migJira: '' },
  'CRM-12144_2.4': { baselineTc: 'Discount_2.4', baselineJira: 'CRM-13781', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/2. Applying discounts to orders/tc-discount-2-4-confirm-and-invoice-deal-registration.spec.ts', masterRow: 37, migJira: '' },
  'CRM-12144_2.5': { baselineTc: 'Discount_2.5', baselineJira: 'CRM-13782', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/2. Applying discounts to orders/tc-discount-2-5-order-meeting-no-program.spec.ts', masterRow: 38, migJira: '' },
  'CRM-12144_2.6': { baselineTc: 'Discount_2.6', baselineJira: 'CRM-13783', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/2. Applying discounts to orders/tc-discount-2-6-two-programs-at-the-same-time.spec.ts', masterRow: 39, migJira: '' },
  'CRM-12144_2.7': { baselineTc: 'Discount_2.7', baselineJira: 'CRM-13784', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/2. Applying discounts to orders/tc-discount-2-7-eur-order-to-the-cent.spec.ts', masterRow: 40, migJira: '' },
  'CRM-12144_2.8': { baselineTc: 'Discount_2.8', baselineJira: 'CRM-13785', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/2. Applying discounts to orders/tc-discount-2-8-product-scope-base-excludes-support.spec.ts', masterRow: 41, migJira: '' },
  'CRM-12144_3.1': { baselineTc: 'Discount_3.1', baselineJira: 'CRM-13786', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/3. Seamless use & screens/tc-discount-3-1-new-quotation-keeps-deal-registration.spec.ts', masterRow: 43, migJira: '' },
  'CRM-12144_3.2': { baselineTc: 'Discount_3.2', baselineJira: 'CRM-13787', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/3. Seamless use & screens/tc-discount-3-2-duplicate-keeps-deal-registration.spec.ts', masterRow: 44, migJira: '' },
  'CRM-12144_3.3': { baselineTc: 'Discount_3.3', baselineJira: 'CRM-13788', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/3. Seamless use & screens/tc-discount-3-3-confirmed-order-shows-promotion-read-only.spec.ts', masterRow: 45, migJira: '' },
  'CRM-12144_3.4': { baselineTc: 'Discount_3.4', baselineJira: 'CRM-13790', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/3. Seamless use & screens/tc-discount-3-4-view-program-conditions-in-editor.spec.ts', masterRow: 46, migJira: '' },
  'CRM-12144_4.1': { baselineTc: 'Discount_4.1', baselineJira: 'CRM-13791', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/4. Scope boundary/tc-discount-4-1-crm-discounts-untouched-by-reward.spec.ts', masterRow: 48, migJira: '' },
  'CRM-12144_4.2': { baselineTc: 'Discount_4.2', baselineJira: 'CRM-13792', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/4. Scope boundary/tc-discount-4-2-gold-reseller-partner-discount-after-reward.spec.ts', masterRow: 49, migJira: '' },
  'CRM-12144_5.1': { baselineTc: 'Discount_5.1', baselineJira: 'CRM-13793', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/5. A clean set/tc-discount-5-1-promotion-list-of-qualifying-order.spec.ts', masterRow: 51, migJira: '' },
  'CRM-12144_5.2': { baselineTc: 'Discount_5.2', baselineJira: 'CRM-13795', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/5. A clean set/tc-discount-5-2-retired-and-expired-programs.spec.ts', masterRow: 52, migJira: '' },
  'CRM-12144_5.5': { baselineTc: 'Discount_5.5', baselineJira: 'CRM-13796', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/5. A clean set/tc-discount-5-5-coupon-codes-and-non-percentage-rewards.spec.ts', masterRow: 55, migJira: '' },
  'CRM-12144_6.1': { baselineTc: 'Discount_6.1', baselineJira: 'CRM-13798', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/6. Data & history/tc-discount-6-1-migrated-order-promotional-discount.spec.ts', masterRow: 57, migJira: '' },
  'CRM-12144_6.2': { baselineTc: 'Discount_6.2', baselineJira: 'CRM-13799', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/6. Data & history/tc-discount-6-2-migrated-orders-partner-grade.spec.ts', masterRow: 58, migJira: '' },
  'CRM-12144_6.3': { baselineTc: 'Discount_6.3', baselineJira: 'CRM-13801', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/6. Data & history/tc-discount-6-3-migrated-orders-pricelists.spec.ts', masterRow: 59, migJira: '' },
  'CRM-12144_6.4': { baselineTc: 'Discount_6.4', baselineJira: 'CRM-13802', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/6. Data & history/tc-discount-6-4-migrated-order-manual-line-discount.spec.ts', masterRow: 60, migJira: '' },
  'CRM-12144_7.1': { baselineTc: 'Discount_7.1', baselineJira: 'CRM-13804', baselineSpec: 'tests/1.Project_CRM/10.Sales_Module/Discount/7. Parity validation & cutover/tc-discount-7-1-same-order-crm-mig-and-reference.spec.ts', masterRow: 63, migJira: '' },
};
