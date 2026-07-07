# Lead Merging — Test-Case Construction Rules

Authoritative rules for building **Lead Merging** test cases (CRM-2178 rule set, CRM-9059 Rule 7).
These govern every spec under `3.Lead_Merging/` — especially the `CRM-9059_(Rule7)_...` suite.

---

## 1. Merge-eligibility recipe (how to build the two leads)

When a test needs two **same-company-email** leads to (attempt to) auto-merge, build each lead as
follows. Both leads use the **SAME company email**; give each the address / company-name / country
fields the scenario requires.

### 1a. The lead that is "Manually created"
- **Created Manually** checkbox = **TRUE**
- **Tags** = **`Can_Merge`**
- **CRM Developer** tab → **Lead form** textbox = **BLANK**

### 1b. The OTHER lead
- **Created Manually** checkbox = **FALSE**
- **CRM Developer** tab → **Lead form** textbox = a **non-blank** value (tests use **`License`**)

> Only these fields control merge-eligibility. All the other fields (Company Name, Street, Country,
> State, Sales Team, Salesperson, …) are set per the specific test scenario.

---

## 2. Merge signals (how to detect a merge happened)

After the async merge window (`CommonUtils.waitTimes.leadMergeObservation`, 5 min):

| | Survivor (target) lead | Merged-away (source) lead |
|---|---|---|
| Active | TRUE | **FALSE** |
| Is Won | Pending | **Lost** |
| Lost Reason | (blank) | **Duplicate** |
| Log note | `"<source>, has been merged into this lead."` | `"This lead has been merged into <target>."` |

Page-object helpers: `leadPage.isActiveChecked()`, `getIsWonValue()`,
`getLostReasonValueViaTextContent()`, `hasSourceLeadMergeMessage(sourceName)` (on the survivor),
`hasTargetLeadMergeMessage(targetName)` (on the merged-away lead).

---

## 3. Rule 7 (CRM-9059) — Sales Team / Salesperson block

> "If **Lead.Sales team** OR **Lead.Salesperson** is not empty for **both** leads **and different**,
> such leads shall **NOT** be merged."
> — https://confluence.nakivo.com/display/CRM/Lead+merging+rules

- **Empty** on both, **one empty**, or the **same** value → does **not** block → the leads merge.
- **Both non-empty AND different** → Rule 7 blocks → the leads must **NOT** merge.
- **CRM-9059** = this guard is currently **broken** (the leads still merge). Every "must NOT merge"
  spec is therefore `test.skip` with `[CRM-9059]` in its title until the bug is fixed.

### Rule 7 test matrix (`CRM-9059_(Rule7)_...`)

| TC | Sales Team (L1 / L2) | Salesperson (L1 / L2) | Expected | State |
|---|---|---|---|---|
| 7.1.1 | empty / empty | empty / empty | MERGE | run |
| 7.1.2 | BDEU / empty | empty / empty | MERGE | run |
| 7.1.3 | BDEU / BDEU | empty / empty | MERGE | run |
| 7.1.4 | BDEU / CMR | empty / empty | NO merge | skip [CRM-9059] |
| 7.2.1 | empty / empty | empty / empty | MERGE | run |
| 7.2.2 | empty / empty | Thomas / empty | MERGE | run |
| 7.2.3 | empty / empty | Thomas / Thomas | MERGE | run |
| 7.2.4 | empty / empty | Thomas / Mark | NO merge | skip [CRM-9059] |
| 7.3.1 | BDEU / BDEU | Thomas / Mark | NO merge | skip [CRM-9059] |
| 7.3.2 | BDEU / CMR | Thomas / Thomas | NO merge | skip [CRM-9059] |
| 7.3.3 | BDEU / CMR | Thomas / Mark | NO merge | skip [CRM-9059] |
| 7.3.4 | BDEU / BDEU | Thomas / Thomas | MERGE | run |

---

## Notes

- The older example spec `1.1.1/tc-crm-2178-1-1-1-1-...` uses the **reverse** placement of §1
  (`Can_Merge` + blank form on the FALSE lead; "Download Free Trial" on the TRUE lead). Per the team
  rule in §1, new CRM-9059 specs standardize on **`Can_Merge` + blank form on the TRUE (manual) lead**.
- Merging is async (queue job / cron). Poll the merge signals with a generous budget; never blind-sleep.
- Do not weaken a merge/no-merge assertion just to make a red test green.
- Recipe status: §1 (Can_Merge on the TRUE/manual lead) is the team standard; being re-validated by a
  live pilot of 7.1.1 on 2026-07-07.
