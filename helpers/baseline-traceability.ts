/**
 * Traceability of a crm-mig spec to the pre-production BASELINE spec it was ported from
 * (automate_manual_tc_from_jira skill, REQUIREMENT #8).
 *
 * A crm-mig feature ported from a baseline keeps ONE map file, `helpers/<feature>-mig.baseline-map.ts`:
 *
 *   export const <FEATURE>_BASELINE_MAP: Readonly<Record<string, BaselineLink>> = {
 *     '<crm-mig TC id>': { baselineTc, baselineJira, baselineSpec, masterRow, migJira },
 *     ...
 *   };
 *
 * and every spec of the feature declares its test as `test(title, <feature>BaselineDetails(TC), body)` - a thin
 * feature wrapper over baselineDetailsFrom() below (reference: baselineDetails() in helpers/discount-mig.helper.ts).
 * The map is the only place a key is written; the specs never repeat it.
 */
export interface BaselineLink {
  /** pre-production Test Case ID - the baseline spec's `const TC` */
  baselineTc: string;
  /** Xray key of the baseline TC (checked on Jira when the map is written: issue exists, summary starts with baselineTc) */
  baselineJira: string;
  /** the baseline automation spec, repo-relative */
  baselineSpec: string;
  /** row of the crm-mig manual TC in its master-file tab */
  masterRow: number;
  /** Xray key of the crm-mig manual TC - '' until it is imported; fill it in the map, nowhere else */
  migJira: string;
}

/** Where a feature's map lives and which master tab its masterRow refers to (used in messages and annotations). */
export interface BaselineMapInfo {
  mapFile: string;
  masterTab: string;
}

/** Test details as Playwright's test(title, details, body) takes them. */
export interface BaselineTestDetails {
  tag: string[];
  annotation: Array<{ type: string; description: string }>;
}

const JIRA_BROWSE = 'http://jira.nakivo.com/browse/';

/**
 * Tags + annotations naming the baseline of one crm-mig TC. Tags: @baseline-preprod, @<baselineJira>,
 * @<baselineTc> (select with --grep). Annotations: baseline, baseline-jira (URL), baseline-spec, manual-tc.
 * Throws for a TC missing from the map, so a new spec cannot ship without its traceability.
 */
export function baselineDetailsFrom(
  map: Readonly<Record<string, BaselineLink>>,
  tc: string,
  info: BaselineMapInfo
): BaselineTestDetails {
  const link = map[tc];
  if (!link) throw new Error(`${tc} has no entry in ${info.mapFile} - add its pre-production baseline there`);
  return {
    tag: ['@baseline-preprod', `@${link.baselineJira}`, `@${link.baselineTc}`],
    annotation: [
      { type: 'baseline', description: `${link.baselineTc} (pre-production)` },
      { type: 'baseline-jira', description: `${JIRA_BROWSE}${link.baselineJira}` },
      { type: 'baseline-spec', description: link.baselineSpec },
      {
        type: 'manual-tc',
        description: link.migJira
          ? `${JIRA_BROWSE}${link.migJira}`
          : `${tc} - master "${info.masterTab}" row ${link.masterRow} (not imported to Xray yet)`,
      },
    ],
  };
}
