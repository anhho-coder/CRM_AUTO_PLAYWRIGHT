/**
 * Integration Hub (CRM-11858) - the delivery inputs QA needs before the hub specs can run.
 *
 * Every value below is DELIBERATELY EMPTY. They are the artefacts the specification requires the
 * delivery to hand over, and which are still OPEN on CRM-12069 as of 2026-09-16:
 *
 *   IS-CRM-SUPP-0011 - "documented pre-production simulation entry points - one to submit an
 *                       inbound lead as the web-form delivery service would, and one to enqueue an
 *                       outbound entry - each with its authentication mechanism stated."
 *   IS-CRM-SUPP-0012 - "a simulated marketing-platform endpoint for pre-production testing,
 *                       recording each delivered entry and each automation trigger request."
 *
 * NOTHING HERE MAY BE GUESSED. A fabricated URL would let a spec report PASS against the wrong
 * thing, or FAIL for a reason that has nothing to do with the product. A spec that needs a value
 * that is still empty must report BLOCKED with the requirement id - never a pass, never a fail.
 *
 * To enable the specs: set the environment variables below (or fill the defaults in) the moment Dev
 * records the real values on CRM-12069.
 */

/** The delivery-provided endpoints. Empty string = not yet delivered. */
export const hubConfig = {
  /** Entry point that submits an inbound lead the way the web-form delivery service would. */
  inboundSimulationUrl: process.env.HUB_INBOUND_URL ?? '',
  /** Authentication for the inbound entry point, e.g. "Bearer <token>" or "x-api-key: <key>". */
  inboundSimulationAuth: process.env.HUB_INBOUND_AUTH ?? '',
  /** Entry point that enqueues one outbound queue entry. */
  outboundEnqueueUrl: process.env.HUB_ENQUEUE_URL ?? '',
  /** Authentication for the outbound enqueue entry point. */
  outboundEnqueueAuth: process.env.HUB_ENQUEUE_AUTH ?? '',
  /** Simulated marketing-platform endpoint that records deliveries and automation triggers. */
  simulatedMarketingUrl: process.env.HUB_SIMULATOR_URL ?? '',
  /** Authentication for reading the simulated marketing-platform record. */
  simulatedMarketingAuth: process.env.HUB_SIMULATOR_AUTH ?? '',
} as const;

export type HubInput = keyof typeof hubConfig;

/** Which specification requirement owes each input, for the BLOCKED message. */
const OWED_BY: Record<HubInput, string> = {
  inboundSimulationUrl: 'IS-CRM-SUPP-0011 (inbound simulation entry point)',
  inboundSimulationAuth: 'IS-CRM-SUPP-0011 (inbound entry point authentication mechanism)',
  outboundEnqueueUrl: 'IS-CRM-SUPP-0011 (outbound enqueue entry point)',
  outboundEnqueueAuth: 'IS-CRM-SUPP-0011 (outbound entry point authentication mechanism)',
  simulatedMarketingUrl: 'IS-CRM-SUPP-0012 (simulated marketing-platform endpoint)',
  simulatedMarketingAuth: 'IS-CRM-SUPP-0012 (simulated marketing-platform read access)',
};

/** The inputs from `required` that the delivery has not provided yet. */
export function missingHubInputs(required: readonly HubInput[]): HubInput[] {
  return required.filter((key) => !hubConfig[key] || hubConfig[key].trim() === '');
}

/**
 * A single BLOCKED line naming exactly what is missing and who owes it.
 * Returns '' when every required input is present.
 */
export function hubBlockedReason(required: readonly HubInput[]): string {
  const missing = missingHubInputs(required);
  if (missing.length === 0) return '';
  return (
    'BLOCKED - the delivery has not provided these inputs on CRM-12069: ' +
    missing.map((key) => `${key} [owed by ${OWED_BY[key]}]`).join('; ') +
    '. Record this run as SKIPPED with this reason - it is neither a pass nor a product failure.'
  );
}

/** Print the BLOCKED banner. Returns true when the spec must stop. */
export function reportHubBlocked(required: readonly HubInput[]): boolean {
  const reason = hubBlockedReason(required);
  if (!reason) return false;
  console.log('\n==================== BLOCKED ====================');
  console.log(reason);
  console.log('Set the matching HUB_* environment variables once Dev records the real values.');
  console.log('================================================');
  return true;
}
