# CRM-11806 - Subscription Management (Recurring Billing) - crm-mig suite

The crm-mig twin of the pre-production Subscriptions baseline. **47 specs, 13 blocks**, one
twin per baseline case, TC ids `CRM-11806_1.1` .. `CRM-11806_12.1`.

| | |
|---|---|
| Baseline (contract) | `tests/1.Project_CRM/9.CRM_Module/8.Subscriptions` - TC ids `subscription-<block>.<seq>`, runs on pre-production |
| This suite | `--project=O12` (testDir `tests/1.Project_CRM/O12_CE_to_O12_CC`), no config change needed |
| CRM | https://crm-mig.nakivo.site - Odoo **12 CE**, db `nakivoCE` |
| Subscription service | https://subscription-crm-mig.nakivo.site - Odoo **19**, db `odoo19` |
| Customer portal | https://subscription-crm-mig.nakivo.site/my |
| QA cards | "Subscription Test Cases" (CRM-12140, Nathan) - 34 cards SC-01..SC-34 |

Run the whole suite:

```bash
npx playwright test --project=O12 --grep "CRM-11806_1\."
```

## The port rule

Every spec is the baseline file with its `expect()` blocks copied **verbatim**. Only four
mechanical things were changed, and each spec lists them in its own docblock:

| Changed | To |
|---|---|
| `baseUrl` | `baseUrl_mig` |
| `users.admin_crm` | `users.admin_crm_mig` |
| `LoginPage` / `HomePage` | `LoginPageMig` / `HomePageMig` (the sidebar theme hides the navbar) |
| TC id / file name | `CRM-11806_<block>.<seq>` / `tc-crm-11806-<block>-<seq>-*.spec.ts` |

No expected value, count or string was adapted to what O12 CE happens to do. **Where crm-mig
behaves differently the assertion is meant to go RED - that red is the migration finding.**

## Blockers (verified 2026-10-08)

Every spec still ships `test.skip`: **B1 is cleared, B2 is not.**

**B1 - rights: CLEARED 2026-10-08.**
`Subscriptions / See Subscriptions` (`res.groups` **115**) and `Subscriptions / Manage Subscriptions`
(**116**) now both hold **uid 9685 `anh.ho@nakivo.com`**, next to `admin` (2),
`khang.nguyentd@nakivo.com` (8816) and `nathan.do@nakivo.com` (17668). All **ten** menus render again
(`ir.ui.menu` returned 0 rows before the grant):

```
Subscriptions (1436, seq 26)
  Subscriptions (1475)
    Subscriptions (1437)          ir.actions.server 2106 -> res.users.action_embed_subscriptions()
    To Renew     (1476)           ir.actions.server 2536
    Products     (1477)           ir.actions.act_window 2537   <- the only native act_window
  Configuration (1478)
    Subscription Templates (1479) server 2538 | Subscription Stages (1480) server 2539
    Close Reasons          (1481) server 2540 | Runs                (1482) server 2541
```

Two consequences for the page object still to be written:

- every embed menu is an **`ir.actions.server` (state=code)** calling `res.users.action_embed_*()`,
  **not** an `act_window` - so the `#menu_id=..&action_id=..` hash navigation the other mig page
  objects use does not address them the usual way;
- `nakivo.subscription.config` (992) and `nakivo.embed.host` (991) are **still `OdooAccessDenied`**
  for that account even with both groups. Assert through the UI or against the Odoo 19 service,
  never on the embed plumbing.

**Grounded test data.** The Subscriptionable flag is `product.template.nakivo_subscription_ok`;
**22 products** carry it, all `type=service` and active, including the two SKUs the baseline already
uses - `CP-NC-PM-ENT` ("min 50Ent Machines, 1Month Subscription") and `CP-NC-O365`
("Office 365 for CSP - No Commitment").

**B2 - crm-mig carries no `sale.subscription` model.**
`ir.model` holds only `nakivo.subscription.config` (992) and `nakivo.subscription.client`
(1012); `sale_subscription` is `state=uninstallable`. The installed CRM-side module is
`nakivo_subscription_integration` **12.0.1.20.1**, and every subscription screen is an **embed**
of the Odoo 19 service. So the baseline's `Subscriptions > CREATE` path does not exist here: on
crm-mig a subscription is born **only** by confirming a quotation that carries a
*Subscriptionable* product (CRM-12140 SC-01). The creation steps therefore need a
`SubscriptionPageMig` that drives the order path on the CRM and reads the Odoo 19 service over
its own authenticated JSON-RPC - the `MigPreSalePage` pattern (`web/session/authenticate` +
`web/dataset/call_kw` against `baseUrl_subscription_mig`). The screens ARE now reachable for that exploration, since B1 was cleared.

`config/users.config.ts` already carries what that page object will need:
`baseUrl_subscription_mig`, `baseUrl_subscription_portal_mig`, `admin_subscription_mig`,
`subscriptionDb_mig`.

## How the embed resolves - and the host the guides got wrong

Resolving any embed menu's server action on crm-mig returns the same client action (measured
2026-10-08):

```
type ir.actions.client · tag nakivo_remote_embed.embed · target current
params  { embed_model: res.users, embed_id: <uid>, embed_target: sale.subscription[.template] }
context { peer_origin: https://pre-sales-crm-mig.nakivo.site
          embed_url:   https://pre-sales-crm-mig.nakivo.site/nakivo/session-bootstrap/init?ret=... }
```

**The peer is `pre-sales-crm-mig.nakivo.site`, not the `subscription-crm-mig.nakivo.site` that both
hand-over PDFs name.** The subscription models therefore live on the **Pre-Sales Application host**,
which `MigPreSalePage` already signs in to. Verified methods, one per menu:
`action_embed_subscriptions`, `_subscriptions_to_renew`, `_subscription_templates`,
`_subscription_stages`, `_close_reasons`, `_subscription_runs`.

`pages/mig/SubscriptionPageMig.ts` is built on exactly this - it extends `MigPreSalePage` so the peer
session and `presalesCallKw` come for free. **Explored live on 2026-10-08; nothing in it is guesswork.**

> Always address the peer by **hostname**, never by IP.

### Peer gate - PASSED (2026-10-08)

`loginPresales()` returns **uid 67** on `baseUrl_presales_mig`, db `odoo19`, as `anh.ho@nakivo.com`.
Readable over `presalesCallKw`: `sale.subscription` **2 rows**, `sale.subscription.template`
**4 rows**, `sale.subscription.stage` **5 rows**. The four templates are exactly
*Monthly Sub/Invoice only · Monthly Subscription · Quarterly Subscription · Yearly Subscription*,
all active, **no "Daily(test)"**. `SUB00008` on the peer carries template *Monthly Sub/Invoice only*,
stage *In Progress*, start `2026-09-18`, next invoice `2026-12-18`.

So **the peer-RPC half of the suite is unblocked**: template settings, billing dates, stages, close
reasons and To Renew can all be asserted without touching the embed.

### The embed sends a valid user to a login page - SC-31 is RED

The client action mounts one element, `iframe.o_nakivo_embed_frame`. Its frame joins
`page.frames()` after ~5s and lands on
`<peer>/web/login?redirect=/nakivo/embed/open?model=sale.subscription&...` with Odoo's login form.

**Not a browser artifact:** the same bootstrap URL opened at *top level* in the same browser gives the
identical login page, so the cross-site cookie is not the cause - the session bootstrap does not
establish a peer session. Cause not isolated: broken for everyone, or a missing user mapping for CRM
uid 9685 (the peer knows that account as uid 67). Nathan or Khang can tell by trying their own account.

Per SC-31, *"a login page inside the CRM page for a valid user is a fail; report it, do not fix it"* -
so `CRM-11806_11.4` is a confirmed migration finding, and every embed-UI case stays blocked on it.

**Trap:** waiting for the iframe *element* reports a mounted embed while the frame is still blank.
`isEmbedMounted()` waits for the *frame* instead.

**Tooling:** run Playwright from **PowerShell**. The Bash tool here is network-sandboxed
(`*.nakivo.site` = NXDOMAIN, every curl = 000) and that says nothing about the VPN.

### CRM-side fields the specs can assert on (all verified)

| Model | Field | What it is |
|---|---|---|
| `sale.order` | `contract_remote_ref` | the `SUB.....` on the Subscription smart button |
| `sale.order` | `contract_push_state` | the guide's *pending* until the service accepts |
| `sale.order` | `contract_push_message` | the reason the yellow banner shows |
| `sale.order` | `nakivo_subscription_renewal` | renewal quotation flag (SC-25) |
| `account.invoice` | `subscription_request_key` | `SUB00008/<md5>` - **one key per billed period** |
| `res.partner` | `subscription_count` | the Subscriptions smart-button number (SC-28/29) |
| `product.template` | `nakivo_subscription_ok` | the Subscriptionable flag |

### What is on the base today

- `upsell_enabled = 0`, `settle_charge_at_once = 0`; mail templates 138 / 139 / 1767 - matches the
  guide's section 10 exactly.
- **Exactly one order carries a subscription**: `SO217708` -> `SUB00008`, push state `done`, partner
  `0123456789` - Nathan's own demo record from the PDF screenshots.
- **4 subscription-raised invoices** over `SUB00007` and `SUB00008` (2 open, 2 draft).
  `SUB00007` has **no** order pointing at it.
- The push message on SO217708 reads *"on template Monthly Subscription"* while the PDF screenshot of
  SUB00008 shows *Monthly Sub/Invoice only*. **Unresolved - noted, not explained.**

## Conversion status (audited 2026-10-08)

`CRM-11806_1.1` and `CRM-11806_1.2` are **LIVE and green** - the positive and negative worked
examples. The other 45 still ship `test.skip` and need the same treatment. What each one hits:

| TC | QA card | State | What must change |
|---|---|---|---|
| `CRM-11806_3.1` | SC-09, SC-11 | skip | Subscriptions > CREATE (absent on crm-mig), pre-prod SubscriptionPage, needs a dev-triggered run |
| `CRM-11806_3.2` | SC-11 | skip | pre-prod SubscriptionPage, needs a dev-triggered run |
| `CRM-11806_2.1` | SC-04 | skip | pre-prod SubscriptionPage, mail queue - name the host |
| `CRM-11806_2.2` | SC-04 | skip | Subscriptions > CREATE (absent on crm-mig), pre-prod SubscriptionPage, mail queue - name the host |
| `CRM-11806_1.1` | SC-01 | **LIVE** | pre-prod smart button |
| `CRM-11806_1.2` | SC-02 | **LIVE** | converted 2026-10-08, green |
| `CRM-11806_1.3` | SC-01 | skip | pre-prod SubscriptionPage, pre-prod smart button, stale status bar |
| `CRM-11806_3.3` | SC-10 | skip | pre-prod SubscriptionPage, needs a dev-triggered run |
| `CRM-11806_3.4` | SC-10 | skip | pre-prod SubscriptionPage, needs a dev-triggered run |
| `CRM-11806_3.5` | SC-04 | skip | pre-prod SubscriptionPage, mail queue - name the host, needs a dev-triggered run |
| `CRM-11806_3.6` | SC-09 | skip | pre-prod SubscriptionPage, needs a dev-triggered run |
| `CRM-11806_4.1` | SC-13 | skip | pre-prod SubscriptionPage, needs a dev-triggered run |
| `CRM-11806_4.2` | SC-14 | skip | pre-prod SubscriptionPage, needs a dev-triggered run |
| `CRM-11806_3.7` | SC-09 | skip | pre-prod SubscriptionPage, mail queue - name the host, needs a dev-triggered run |
| `CRM-11806_4.3` | SC-15 | skip | pre-prod SubscriptionPage, needs a dev-triggered run |
| `CRM-11806_4.4` | SC-12 | skip | mail queue - name the host, needs a dev-triggered run |
| `CRM-11806_4.5` | SC-15 | skip | pre-prod SubscriptionPage, needs a dev-triggered run |
| `CRM-11806_7.1` | SC-34 | skip | pre-prod SubscriptionPage, needs a dev-triggered run |
| `CRM-11806_7.2` | SC-25 | skip | Subscriptions > CREATE (absent on crm-mig), pre-prod SubscriptionPage, stale status bar |
| `CRM-11806_7.3` | SC-07 | skip | pre-prod SubscriptionPage, needs a dev-triggered run |
| `CRM-11806_7.4` | SC-06 | skip | pre-prod SubscriptionPage, needs a dev-triggered run |
| `CRM-11806_1.4` | SC-01 | skip | pre-prod SubscriptionPage, pre-prod smart button, mail queue - name the host |
| `CRM-11806_9.1` | - | skip | **NO SUBJECT** - see "The audit row that was wrong" below |
| `CRM-11806_9.2` | - | skip | **NO SUBJECT** - see below |
| `CRM-11806_12.1` | - | skip | **NO SUBJECT** - see below |
| `CRM-11806_9.3` | - | skip | **NO SUBJECT** - see below |
| `CRM-11806_3.8` | - | skip | pre-prod SubscriptionPage, needs a dev-triggered run |
| `CRM-11806_5.1` | SC-18 | skip | pre-prod SubscriptionPage, needs a dev-triggered run |
| `CRM-11806_5.2` | SC-19 | skip | pre-prod SubscriptionPage, needs a dev-triggered run |
| `CRM-11806_5.3` | SC-20 | skip | needs a dev-triggered run |
| `CRM-11806_10.1` | SC-28 | **LIVE** | converted 2026-10-09, green (5/5 VP, 3.3 min) |
| `CRM-11806_10.2` | SC-30 | skip | pre-prod SubscriptionPage, needs a dev-triggered run |
| `CRM-11806_11.1` | SC-33 | skip | **no see-only user exists** - groups 115 and 116 hold the same four users |
| `CRM-11806_1.5` | SC-03 | skip | pre-prod SubscriptionPage |
| `CRM-11806_7.5` | SC-05 | skip | Subscriptions > CREATE (absent on crm-mig), pre-prod SubscriptionPage, needs a dev-triggered run |
| `CRM-11806_11.2` | SC-08 | **LIVE** | converted 2026-10-09, green (5/5 VP, 1.5 min) |
| `CRM-11806_4.6` | SC-16 | skip | Subscriptions > CREATE (absent on crm-mig), pre-prod SubscriptionPage, needs a dev-triggered run |
| `CRM-11806_11.3` | SC-17 | skip | Subscriptions > CREATE (absent on crm-mig), pre-prod SubscriptionPage, needs a dev-triggered run |
| `CRM-11806_5.4` | SC-21 (DO NOT SCORE - spec vs delivered) | skip | Subscriptions > CREATE (absent on crm-mig), pre-prod SubscriptionPage, mail queue - name the host |
| `CRM-11806_6.1` | SC-22 | skip | Subscriptions > CREATE (absent on crm-mig), pre-prod SubscriptionPage, mail queue - name the host, needs a dev-triggered run |
| `CRM-11806_6.2` | SC-23 | skip | Subscriptions > CREATE (absent on crm-mig), pre-prod SubscriptionPage, mail queue - name the host, needs a dev-triggered run |
| `CRM-11806_6.3` | SC-24 | skip | Subscriptions > CREATE (absent on crm-mig), pre-prod SubscriptionPage, needs a dev-triggered run |
| `CRM-11806_7.6` | SC-26 | skip | Subscriptions > CREATE (absent on crm-mig), pre-prod SubscriptionPage |
| `CRM-11806_8.1` | SC-27 | skip | Subscriptions > CREATE (absent on crm-mig), pre-prod SubscriptionPage, mail queue - name the host, needs a dev-triggered run |
| `CRM-11806_10.3` | SC-29 | skip | Subscriptions > CREATE (absent on crm-mig), pre-prod SubscriptionPage, pre-prod smart button |
| `CRM-11806_11.4` | SC-31 | skip | Subscriptions > CREATE (absent on crm-mig), pre-prod SubscriptionPage |
| `CRM-11806_11.5` | SC-32 | skip | pre-prod SubscriptionPage |

Totals: **39** pre-prod SubscriptionPage · **27** needs a dev-triggered run · **17** Subscriptions > CREATE (absent on crm-mig) · **10** mail queue - name the host · **6** pre-prod smart button · **3** stale status bar.

**The 28 `needs a dev-triggered run` cases can never be fully autonomous** - CRM-12140 and
Nathan's card set both state QA does not run the billing / reminder / close jobs. Those become
deferred-verification specs: dev runs the named day, the spec reads the result.

## The audit row that was wrong - read this before trusting the table

`audit-mig-specs.js` scanned only for MECHANICAL blockers (pre-prod `SubscriptionPage`,
`Subscriptions > CREATE`, dev-run, mail queue). `CRM-11806_9.1`-`1.3.4` and `1.4.3` are bare
`test.skip` STUBS with no test body, so the script found nothing and printed
*"nothing detected - closest to runnable"*. They are the opposite of runnable.

Measured 2026-10-09:

| Read | Result |
|---|---|
| peer `sale.subscription` | **7** rows; the only two that pre-date the test runs are `SUB00007` / `SUB00008`, created 2026-09-17/18 on the test contact `0123456789` - Nathan's demo records |
| peer `account.move` (all types) | **0** |
| crm-mig `contract.contract` (the Odoo-12 recurring-billing records = the BEFORE half) | **0** |
| crm-mig `res.groups` 115 "See Subscriptions" / 116 "Manage Subscriptions" | the **same four** users `[2, 9685, 8816, 17668]`; 116 implies 115 |

So **no subscription or contract corpus was migrated** to either side: `1.3.1`-`1.3.4` are
BEFORE/AFTER cut-over comparisons with nothing to compare. And granting BOTH Subscriptions groups
to anh.ho on 2026-10-08 is exactly what leaves `1.4.3` with **no see-only user** to run as; it needs
a dedicated account holding group 115 only, from the CRM admin team - do not downgrade a shared one.

**The scheduler is dead on both sides** (2026-10-09): the peer's `ir.cron` has 24 active rows, all
overdue, newest `lastcall` across all of them `2026-09-18 02:27:48`, and 21 of 24 have never run;
crm-mig's own crons are stuck at `2026-08-25`..`2026-08-27`. No billing run, no reminder, no
auto-close, no mail. The 28 `@blocked-devrun` specs cannot be meaningful until that is answered.

## The conversion recipe (from CRM-11806_1.1)

0. **Pick the product with `DealElementPage.addProductBySku(sku, qty)`**, not `addProduct(name)`.
   `addProduct` clicks the empty product m2o and then waits the full 30 s `abnormalWait` for an
   UNFILTERED dropdown to offer the SKU - which it never can, so every run paid 30 s and sat on a
   list of unrelated products before falling through to type-and-Enter. `addProductBySku` types the
   SKU first, so the dropdown is already filtered. Measured on `CRM-11806_1.1`: **3.6 min -> 2.8 min**.
   `addDealElementOnO12CE` uses it automatically when the caller passes `product`.
0b. **Two creation paths, and they are not interchangeable.**
   - A case whose subject is the ORDER (SC-01, SC-02, SC-28, SC-29) builds through
     Opportunity > Deal Element > New quotation > Confirm - step 1 below.
   - A case whose subject is the SUBSCRIPTION ITSELF builds it in the embed:
     `createSubscriptionViaEmbed()` (helpers/crm-11806-mig-subscription.helper.ts) =
     **New** (`button.o-kanban-button-new`) -> fill -> **cloud save**
     (`button.o_form_button_save`, `aria-label="Save manually"`). That is the crm-mig stand-in for
     the baseline's `Subscriptions > CREATE` + `SAVE`.
   - The embed needs a PEER SESSION first; `openSubscriptionsEmbed()` signs in for you. The root
     menu 1436 has no action - use 1437.
   - Fields on that form are the peer's: **`remote_partner_id`** (Customer),
     **`remote_pricelist_id`** (Pricelist), `template_id`, `date_start`, `sale_subscription_line_ids`.
   - **A date renders as `button.o_daterange_start`, not an input** - click it before typing.
   - **The Customer must already exist.** `remote_partner_id` resolves against real partners, so a
     generated "Cust-<unique>" cannot be accepted. Borrow `MIG_TEST_CUSTOMER` ("0123456789") and key
     teardown on the subscription id, stating it as a deviation.
1. **Build the record through the order path**, never `Subscriptions > CREATE`:
   `loginToO12CE` -> **`openOpportunitiesListOnO12CE`** (the chain's create steps assume the list
   is open) -> `createOpportunityOnO12CE` -> `addDealElementOnO12CE({ product: <Subscriptionable SKU> })`
   -> `pressNewQuotationOnO12CE({ opportunityId })`.
2. **Key every lookup on the record ID.** `pressNewQuotationOnO12CE` returns an empty
   `quotationName`; use `quotationId` with `getOrderSubscriptionLinkById` /
   `waitForSubscriptionPushById`. By name the poll runs against `[['name','=','']]` and finds
   nothing, for as long as you let it.
3. **Wait for the push.** Confirm returns before the subscription exists; it settles in ~3.5 s.
4. **Read the status from the server** - `getQuotationStatusFromServer()`, not
   `getQuotationStatus()`, which keeps showing *Quotation* after CONFIRM.
5. **Read the smart button the crm-mig way** - `SubscriptionPageMig.getSubscriptionSmartButtonRef()`
   (`action_embed_remote_subscription`, singular, shows `SUB000xx`). The pre-prod reader returns 0
   here and manufactures a product bug; it already did once.
6. **Read the subscription itself off the peer** - `loginPresales()` +
   `remoteSubscriptionByRef` / `sale.subscription.line`. Fields: `code`, `partner_id`,
   `pricelist_id`, `user_id`, `stage_id`, `template_id`, `date_start`, `recurring_next_date`,
   `sale_subscription_line_ids` -> `product_id`, `product_uom_qty`.
7. **Teardown both sides, guarded on what the run CREATED** - never on having read it back, or
   a failing test leaves a subscription on the peer (it left five). The CRM-side
   `teardownMigRecords` fails as a Salesperson; `sweepMigLeftoversAfterAll` is what clears it.
8. **Declare every deviation in the docblock** (D1 creation path, D2 where the subscription is
   read, D3 smart-button shape). Expected VALUES stay the baseline's.
9. **On a NEGATIVE case, pin the data the case rests on.** The Deal Element's product picker reports
   its own label - a run that asked for `A2149B` logged `Product line : "first product"` - so a
   negative test that only checks "no subscription appeared" also passes when the wrong product was
   added. `SubscriptionPageMig.getOrderLineProductFlags(orderId)` reads the line back and pins the
   SKU and its `nakivo_subscription_ok` flag.
## The 47 cases

### 1.1.Cross-cutting

| TC ID | What it checks | QA card | Baseline twin |
|---|---|---|---|
| `CRM-11806_3.1` | One due cycle produces exactly one recurring invoice | SC-09, SC-11 | `subscription-3.1` |
| `CRM-11806_3.2` | A second billing run on the same day raises no second invoice | SC-11 | `subscription-3.2` |
| `CRM-11806_2.1` | The four delivered subscription templates carry their exact billing settings | SC-04 | `subscription-2.1` |
| `CRM-11806_2.2` | An archived subscription template cannot be selected | SC-04 | `subscription-2.2` |

### 1.2.Lifecycle-and-billing

| TC ID | What it checks | QA card | Baseline twin |
|---|---|---|---|
| `CRM-11806_1.1` | Confirming a subscription order creates exactly one subscription | SC-01 | `subscription-1.1` |
| `CRM-11806_1.2` | An order with no subscription product creates no subscription | SC-02 | `subscription-1.2` |
| `CRM-11806_1.3` | Two subscription lines land on one subscription | SC-01 | `subscription-1.3` |
| `CRM-11806_3.3` | A monthly subscription advances its next invoice date by one month | SC-10 | `subscription-3.3` |
| `CRM-11806_3.4` | A quarterly subscription advances its next invoice date by three months | SC-10 | `subscription-3.4` |
| `CRM-11806_3.5` | A yearly subscription produces a draft invoice only | SC-04 | `subscription-3.5` |
| `CRM-11806_3.6` | A EUR subscription invoices in EUR | SC-09 | `subscription-3.6` |
| `CRM-11806_4.1` | A saved card is charged automatically | SC-13 | `subscription-4.1` |
| `CRM-11806_4.2` | No saved card leaves the invoice uncollected | SC-14 | `subscription-4.2` |
| `CRM-11806_3.7` | Invoice-only mode issues an open invoice and emails it | SC-09 | `subscription-3.7` |
| `CRM-11806_4.3` | Registering a payment settles the invoice only | SC-15 | `subscription-4.3` |
| `CRM-11806_4.4` | Portal card payment saves the card for next cycles | SC-12 | `subscription-4.4` |
| `CRM-11806_4.5` | Manual payment saves no card on file | SC-15 | `subscription-4.5` |
| `CRM-11806_7.1` | Upsell is off; lines are the mid-period path | SC-34 | `subscription-7.1` |
| `CRM-11806_7.2` | A renewal extends the same subscription | SC-25 | `subscription-7.2` |
| `CRM-11806_7.3` | Closing a subscription stops billing | SC-07 | `subscription-7.3` |
| `CRM-11806_7.4` | A Draft subscription stops billing silently | SC-06 | `subscription-7.4` |
| `CRM-11806_1.4` | A reseller deal-registration order creates a matching subscription | SC-01 | `subscription-1.4` |

### 1.3.Data-and-continuity

| TC ID | What it checks | QA card | Baseline twin |
|---|---|---|---|
| `CRM-11806_9.1` | A subscription and its invoice history survive the migration | (migration continuity - no SC card) | `subscription-9.1` |
| `CRM-11806_9.2` | Every stage comes across the migration | (migration continuity - no SC card) | `subscription-9.2` |
| `CRM-11806_12.1` | The first cycle after cut-over bills once | (migration continuity - no SC card) | `subscription-12.1` |
| `CRM-11806_9.3` | The real invoice history beats the template recurrence | (migration continuity - no SC card) | `subscription-9.3` |
| `CRM-11806_3.8` | An overdue cycle bills once, not once per missed month | (migration continuity - no SC card) | `subscription-3.8` |
| `CRM-11806_5.1` | A declined charge leaves the cycle outstanding | SC-18 | `subscription-5.1` |
| `CRM-11806_5.2` | A retry reuses the same invoice | SC-19 | `subscription-5.2` |
| `CRM-11806_5.3` | Dunning limit auto-closes the subscription | SC-20 | `subscription-5.3` |

### 1.4.Visibility-and-experience

| TC ID | What it checks | QA card | Baseline twin |
|---|---|---|---|
| `CRM-11806_10.1` | Order and subscription reach each other inside the CRM | SC-28 | `subscription-10.1` |
| `CRM-11806_10.2` | One invoice is the single source of truth | SC-30 | `subscription-10.2` |
| `CRM-11806_11.1` | A see-only user cannot change a subscription | SC-33 | `subscription-11.1` |

### 1.5.Order-and-subscription-screen

| TC ID | What it checks | QA card | Baseline twin |
|---|---|---|---|
| `CRM-11806_1.5` | First billing date = End Date, else +1 interval | SC-03 | `subscription-1.5` |
| `CRM-11806_7.5` | Changing a Subscription line applies from the next period | SC-05 | `subscription-7.5` |
| `CRM-11806_11.2` | The subscription list, the kanban and the subscription form show the fields finance needs to work a subscription | SC-08 | `subscription-11.2` |

### 1.6.Payment-outcome-and-dunning-limit

| TC ID | What it checks | QA card | Baseline twin |
|---|---|---|---|
| `CRM-11806_4.6` | Payment outcome written on the invoice | SC-16 | `subscription-4.6` |
| `CRM-11806_11.3` | Stored card is a masked number only | SC-17 | `subscription-11.3` |
| `CRM-11806_5.4` | Record what day 15 produces on a Monthly Subscription with no closing limit | SC-21 (DO NOT SCORE - spec vs delivered) | `subscription-5.4` |

### 1.7.Reminder-cycle

| TC ID | What it checks | QA card | Baseline twin |
|---|---|---|---|
| `CRM-11806_6.1` | Salesperson reminded before the billing date | SC-22 | `subscription-6.1` |
| `CRM-11806_6.2` | Manual invoicing reminder parks it in Draft | SC-23 | `subscription-6.2` |
| `CRM-11806_6.3` | A subscription put back to In Progress before billing date bills once | SC-24 | `subscription-6.3` |

### 1.8.End-date-and-notifications

| TC ID | What it checks | QA card | Baseline twin |
|---|---|---|---|
| `CRM-11806_7.6` | Weekly run closes a subscription past its end date | SC-26 | `subscription-7.6` |
| `CRM-11806_8.1` | Five subscription mail moments, each queued exactly once | SC-27 | `subscription-8.1` |

### 1.9.CRM-reflection-and-portal

| TC ID | What it checks | QA card | Baseline twin |
|---|---|---|---|
| `CRM-11806_10.3` | Order Subscription smart button matches linked subscriptions | SC-29 | `subscription-10.3` |
| `CRM-11806_11.4` | Screens open inside the CRM, no second sign-in | SC-31 | `subscription-11.4` |
| `CRM-11806_11.5` | Portal customer sees only their own subscriptions, read-only | SC-32 | `subscription-11.5` |

_47 cases._

## Notes carried over from the baseline

- `CRM-11806_3.2` and `CRM-11806_3.4` keep the baseline's known-defect tag `[CRM-12188]`
  between the TC id and the colon. The custom reporter's regex `^([A-Z]+-\d+_[\d.]+):` does not
  parse that shape - it is inherited verbatim and was deliberately not "fixed" here.
- `CRM-11806_5.4` (SC-21) and `CRM-11806_7.1` (SC-34) are the two cards Nathan marks
  **DO NOT SCORE** - record the outcome for the PM instead of passing or failing them.
- Four specs still reference `users.sale_ic_thomas`. Whether that Salesperson exists on crm-mig
  is **unverified** - check before the first run.
- Sections 1.3.1-1.3.5 are migration-continuity cases with no SC card; they assert that
  migrated subscriptions and their invoice history survived, which is crm-mig's own subject.
