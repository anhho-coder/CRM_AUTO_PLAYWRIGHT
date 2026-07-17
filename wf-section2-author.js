export const meta = {
  name: 'crm10780-section2-author',
  description: 'Author the 17 CRM-10780 Apply-Promotion specs from the CRM-10861 reference',
  phases: [{ title: 'Author', detail: 'one agent per apply TC: read reference + fetch Jira + write spec' }],
}

const REF = 'tests/1.Project_CRM/9.CRM_Module/CRM-10780_Create-Promo-campaign-setup-for-Sales-order-Apply-Promotion/Apply-Promotion/tc-crm-10780-2-1-1-1-apply-promotion-qualifying-order.spec.ts'

const KEYS = [
  'CRM-10862','CRM-10863','CRM-10864','CRM-10865','CRM-10866','CRM-10867','CRM-10868','CRM-10869',
  'CRM-10870','CRM-10871','CRM-10872','CRM-10873','CRM-10874','CRM-10875','CRM-10876','CRM-10877','CRM-10878',
]

const SCHEMA = {
  type: 'object',
  required: ['key', 'tcId', 'file', 'verificationType', 'needsManualWork'],
  properties: {
    key: { type: 'string' },
    tcId: { type: 'string' },
    title: { type: 'string' },
    file: { type: 'string' },
    promoConfig: { type: 'string' },
    orderSetup: { type: 'string' },
    verificationType: { type: 'string', enum: ['positive', 'negative', 'complex'] },
    needsManualWork: { type: 'boolean' },
    notes: { type: 'string' },
  },
}

phase('Author')
const results = await parallel(KEYS.map((key) => () => agent(
`Author ONE Playwright + TypeScript spec for a CRM-10780 "Apply Promotion" manual test case, in repo D:\\Automation_CRM\\CRM_AUTO_PLAYWRIGHT.

TARGET JIRA ISSUE: ${key}

STEP A - read the REFERENCE spec (the green pilot CRM-10861) and use it as your structural template:
  ${REF}
It logs in as Sales Manager (users.manager_max) and creates "Promotion A" via promotionPage.createPromotion({...}); re-logs in as the Salesperson (users.sale_ic_thomas); creates an EndUser Contact (with Pricelist) + a qualifying Opp (by that contact's email); then Steps 1-4: open CRM, open Deal Element, add product, apply promotion. Reuse its imports, beforeEach/afterEach (teardown deletes Opp+Contact via CommonUtils.deleteRecordByUrl and archives the promo as Max), and its exact setup blocks. Keep all that the same.

STEP B - fetch your TC: run ToolSearch "select:mcp__jira__get_issue", then mcp__jira__get_issue(issue_key="${key}", fields="summary,description,customfield_10704").
 - TCID = token before the TAB in summary (e.g. CRM-10780_2.1.1.3). Title = after the tab.
 - description = "Pre-conditions" incl. the full "Promotion A with: ..." definition (the promo to create). customfield_10704.steps = the 4 manual steps + step 4's Expected Result.

STEP C - map the precondition "Promotion A with: ..." to a promotionPage.createPromotion({...}) config:
 - "Apply Discount = Percentage - X%" -> { discountPercentage: X }   (Percentage is the default applyDiscount)
 - "Apply Discount = Fixed Amount - Y$" -> { applyDiscount: 'Fixed Amount', discountFixedAmount: Y }
 - "Apply Discount = Fixed Amount" (no value) + "Max Discount Amount = Z$" -> { applyDiscount: 'Fixed Amount', discountFixedAmount: 100, maxDiscountAmount: Z }
 - "Discount Apply On = On Order" -> { } (default); "On Cheapest Product" -> { discountApplyOn: 'On Cheapest Product' }; "On Specific Product (...)" -> { discountApplyOn: 'On Specific Product', specificProduct: '[A2144B]' }
 - "Minimum Purchase Of = W$" -> { minPurchaseAmount: W }
 - "Quantity = N" -> { minQuantity: N }
 - "Apply on first = N" -> { maximumUseNumber: N }
 - "To Reseller = TRUE" -> { forReseller: true }
 - Always include namePrefix, e.g. namePrefix: 'TEST- 2-1-1-3 ' (ASCII).
 - INACTIVE promotion: create it normally, then BEFORE applying, archive it (so it is inactive). This is a complex case (see STEP E).

STEP D - choose the order + verification from step 4's Expected Result:
 - The default product is addProductLine('[A2144B]', 1, 'Socket') = $329 (one line). To exceed a Minimum Purchase Of = 1000$, use quantity 4 (4 x $329 = $1316). To meet Quantity = N, use that quantity.
 - POSITIVE (Expected says the promo IS applied / total reduced / discount applied): set verificationType='positive' and assert (like the reference) that a promo discount line appears (isProductInOrderLines(promoName) OR order-line count increased) AND getAmountTotal() AFTER < BEFORE.
 - NEGATIVE (Expected says NOT applied / not eligible / no discount / order does not qualify / inactive / wrong domain): set verificationType='negative'. Build a NON-qualifying order (small, qty 1) or apply the inactive/ineligible promo, then assert NO promo line was added AND getAmountTotal() AFTER == BEFORE (no discount). Adapt step 4 to attempt the apply and verify it had no effect.

STEP E - COMPLEX cases - if the TC is one of these, author your best-effort draft, add a clear "// TODO (manual): ..." in the relevant step, set verificationType='complex' and needsManualWork=true, and explain in notes:
 - multiple promotions A & B simultaneously (create two promos, apply both)
 - remove an applied promotion (apply, then clear the Promotion field + save, verify total restored)
 - apply to a confirmed/locked order (needs the quotation Confirm/approval workflow)
 - verify order count on the Promotion Program after applying
 - deactivate the Promotion Program after applying
 - "Supported to customer domain" (customer-domain targeting has no simple setter)
 For non-complex TCs set needsManualWork=false.

STEP F - write the file with the Write tool at:
 D:\\Automation_CRM\\CRM_AUTO_PLAYWRIGHT\\tests\\1.Project_CRM\\9.CRM_Module\\CRM-10780_Create-Promo-campaign-setup-for-Sales-order-Apply-Promotion\\Apply-Promotion\\tc-crm-10780-<DASHED-TCID>-<short-action>.spec.ts
 (<DASHED-TCID> = the x.x.x.x part with dots->dashes, e.g. 2-1-1-3). Header must have: Test Case ID, Jira: ${key}, Automation-Type: new, Automation-Date: 2026-06-22, a Source manual TC block (preconditions + the 4 steps + Expected, verbatim/in order), and a Command to run with the escaped grep. The test title MUST start with "<TCID>: ". test.step labels mirror the 4 manual steps in order, ASCII only. Use config.timeouts.test and viewport 1920x1080. Do NOT run anything.

Return the structured result.`,
  { label: `author:${key}`, phase: 'Author', schema: SCHEMA }
)))

const ok = results.filter(Boolean)
log(`Authored ${ok.length}/${KEYS.length} Section-2 specs; complex/manual: ${ok.filter((r) => r.needsManualWork).map((r) => r.tcId).join(', ')}`)
return ok
