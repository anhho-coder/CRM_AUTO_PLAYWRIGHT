import { baselineDetailsFrom, BaselineTestDetails } from '@helpers/baseline-traceability';
import { CUSTOMER_SUPPORT_BASELINE_MAP } from '@helpers/customer-support-mig.baseline-map';

/** Test details (tags + annotations) naming the pre-production baseline of a CRM-11859 Support-service spec. */
export function customerSupportBaselineDetails(tc: string): BaselineTestDetails {
  return baselineDetailsFrom(CUSTOMER_SUPPORT_BASELINE_MAP, tc, {
    mapFile: 'helpers/customer-support-mig.baseline-map.ts',
    masterTab: 'Helpdesk-AB-Test-Cases - Pre-pro.csv',
  });
}
