# CRM-12653 Data Migration - Sales Data Parity Suite

## Purpose

This suite verifies **read-only parity** between pre-production (Odoo 12 Enterprise) and crm-mig (Odoo 12 Community) for the O12 CE → O12 CC data migration. Each spec confirms that sales data was migrated correctly without corruption, field loss, or linkage breaks. The suite creates no test data and mutates nothing on either server.

## Read-Only Contract

- **No creates**: no `create()` calls, no `write()`, no `unlink()`.
- **No clicks**: no `.click()` on buttons that mutate state, no form submissions.
- **No fills**: no `.fill()` on input fields to save data.
- **MigDataParityPage only**: all reads are RPC-based via the page object's `searchCount()`, `searchRead()`, and `countByField()` methods, guarded against false green (isAuthenticatedSession() + source > 0 before count comparison).
- **Sessions are closed**: both sourceContext and targetContext closed in finally blocks.

**Status**: No spec has been **executed yet**. The crm-mig QA password was reset during the 2026-09-13/14 database re-clone. All 45 specs are written and audit-clean, but await credential refresh before first run.

---

## Suite Structure

The suite is split into **8 blocks** across 8 folders, with **45 total specs**:

### A-Cross-cutting (4 specs written)
Pre-flight checks verifying environments are reachable and data models are present.
- **1.1.1**: `tc-datamig-1-1-1-environments-reachable-models-present.spec.ts`
  - Environments reachable (both login), models present (7 core models).
  
- **1.1.2**: `tc-datamig-1-1-2-establish-migration-cutoff.spec.ts`
  - Migration cut-off date is established on target; no data loss on either server post-cutoff.
  
- **1.1.3**: `tc-datamig-1-1-3-post-cutoff-source-data-absent.spec.ts`
  - Post-cutoff source data is NOT on target (expected behavior).
  
- **1.1.4**: `tc-datamig-1-1-4-target-local-testdata-excluded.spec.ts`
  - Target contains no local test data (only pre-cutoff migrated records).

**Status**: All 4 specs written and audit-clean.

### B-Partners (7 specs written)
Partner (company and individual contact) migration and linkage integrity.
- **2.1.1**: `tc-datamig-2-1-1-partner-total-count-parity.spec.ts` — total count parity
- **2.1.2**: `tc-datamig-2-1-2-partner-company-individual-split.spec.ts` — company vs. individual split
- **2.1.3**: `tc-datamig-2-1-3-archived-partners-still-archived.spec.ts` — archived status preserved
- **2.2.1**: `tc-datamig-2-2-1-partner-identity-fields-sample.spec.ts` — 5-sample field parity (name, email, phone)
- **2.2.2**: `tc-datamig-2-2-2-partner-address-commercial-fields-sample.spec.ts` — address and commercial fields
- **2.3.1**: `tc-datamig-2-3-1-company-child-contact-hierarchy.spec.ts` — child contact list and parent linkage
- **2.3.2**: `tc-datamig-2-3-2-ids-resequenced-join-on-natural-key.spec.ts` — ID re-sequencing; natural-key joins

**Status**: All 7 specs written and audit-clean.

### C-Leads (7 specs written)
Lead and opportunity migration.
- **3.1.1**: `tc-datamig-3-1-1-lead-opportunity-count-parity.spec.ts` — total lead and opportunity count parity
- **3.1.2**: `tc-datamig-3-1-2-lead-count-per-stage.spec.ts` — count per stage (New, Qualified, etc.)
- **3.1.3**: `tc-datamig-3-1-3-lead-count-per-salesperson-and-team.spec.ts` — distribution by owner and team
- **3.2.1**: `tc-datamig-3-2-1-lead-fields-sample.spec.ts` — 5-sample field parity (contact_name, email, expected_revenue)
- **3.2.2**: `tc-datamig-3-2-2-stored-revenue-not-stale.spec.ts` — expected_revenue matches lead_estimate
- **3.3.1**: `tc-datamig-3-3-1-opportunity-deal-element-chain.spec.ts` — opportunity ↔ deal element linkage
- **3.3.2**: `tc-datamig-3-3-2-lost-leads-keep-reason.spec.ts` — lost reason and stage preserved

**Status**: All 7 specs written and audit-clean.

### D-Orders (7 specs written)
Sales order migration and line-item integrity.
- **4.1.1**: `tc-datamig-4-1-1-order-count-per-status.spec.ts` — count per status (Draft, Quotation, Sale, Done, Cancel)
- **4.1.2**: `tc-datamig-4-1-2-deal-element-vs-quotation-split.spec.ts` — deal elements vs. quotations
- **4.1.3**: `tc-datamig-4-1-3-order-line-count-sample.spec.ts` — line count per order matches
- **4.2.1**: `tc-datamig-4-2-1-order-header-fields-sample.spec.ts` — 5-sample header field parity
- **4.2.2**: `tc-datamig-4-2-2-order-line-fields-sample.spec.ts` — line-item field parity (qty, price, discount, tax)
- **4.3.1**: `tc-datamig-4-3-1-order-amounts-and-currency-aggregate.spec.ts` — amount totals and currency parity
- **4.3.2**: `tc-datamig-4-3-2-cancelled-and-zero-amount-orders.spec.ts` — cancelled and zero-amount orders preserved

**Status**: All 7 specs written and audit-clean.

### E-Invoices (7 specs written)
Invoice and credit note migration with payment linkage.
- **5.1.1**: `tc-datamig-5-1-1-invoice-count-per-status.spec.ts` — count per status (Draft, Posted, Paid, Cancelled)
- **5.1.2**: `tc-datamig-5-1-2-invoice-numbers-unique-and-continuous.spec.ts` — invoice number sequence integrity
- **5.1.3**: `tc-datamig-5-1-3-credit-notes-counted-separately.spec.ts` — credit notes (out_refund) counted separately
- **5.2.1**: `tc-datamig-5-2-1-invoice-header-fields-sample.spec.ts` — 5-sample header field parity
- **5.2.2**: `tc-datamig-5-2-2-invoice-lines-and-amounts-sample.spec.ts` — line-item amounts and totals
- **5.3.1**: `tc-datamig-5-3-1-paid-invoices-stay-paid.spec.ts` — paid status and payment records preserved
- **5.3.2**: `tc-datamig-5-3-2-invoice-to-sale-order-link.spec.ts` — invoice → sale order link maintained

**Status**: All 7 specs written and audit-clean.

### F-Chatter (5 specs written)
Message history, followers, and tracking values.
- **6.1.1**: `tc-datamig-6-1-1-chatter-message-count-sample.spec.ts` — message count sample per document
- **6.1.2**: `tc-datamig-6-1-2-chatter-body-author-timestamp.spec.ts` — message body, author, timestamp parity
- **6.1.3**: `tc-datamig-6-1-3-followers-preserved.spec.ts` — followers on documents preserved
- **6.2.1**: `tc-datamig-6-2-1-tracking-values-preserved.spec.ts` — tracking history preserved
- **6.2.2**: `tc-datamig-6-2-2-chatter-untouched-by-the-run.spec.ts` — chatter read-only; no messages added

**Status**: All 5 specs written and audit-clean.

### G-Attachments (5 specs written)
File attachment migration and linkage.
- **7.1.1**: `tc-datamig-7-1-1-attachment-count-per-record.spec.ts` — attachment count per document
- **7.1.2**: `tc-datamig-7-1-2-attachment-count-per-model.spec.ts` — count per model (crm.lead, sale.order, etc.)
- **7.1.3**: `tc-datamig-7-1-3-attachment-parent-linkage.spec.ts` — attachments linked to correct parents
- **7.2.1**: `tc-datamig-7-2-1-attachment-binary-present-and-sized.spec.ts` — file content present, size preserved
- **7.2.2**: `tc-datamig-7-2-2-attachments-untouched-by-the-run.spec.ts` — no attachments created/deleted

**Status**: All 5 specs written and audit-clean.

### H-Reconciliation (3 specs written)
Post-run verification that nothing was mutated.
- **8.1.2**: `tc-datamig-8-1-2-reconciliation-summary-reconciles.spec.ts` — exception summary counts match
- **8.1.3**: `tc-datamig-8-1-3-unreachable-target-skipped-not-zero.spec.ts` — unreachable target correctly skipped (not read as 0 records)
- **8.1.4**: `tc-datamig-8-1-4-run-changed-nothing-on-either-server.spec.ts` — no records created/modified/deleted

**Status**: All 3 specs written and audit-clean. Execute last.

**NOT AUTOMATED**: **8.1.1** (human exception register review)
- The manual TC 8.1.1 calls for a human to review exceptions flagged by the migration tool and verify they were resolved correctly.
- This is out of scope for automation: it requires domain knowledge (what is an acceptable exception?), manual judgment, and sign-off.
- Automation cannot verify human approval; it can only verify data consistency, which 8.1.4 handles.

---

## Migration Cut-Off Mechanism

**What is the cut-off?**
The cut-off date is the snapshot timestamp on the source server (pre-production) at which the data migration began. All records on or before this date are included in the migration; records created after are excluded.

**Why not compare raw totals?**
Raw total counts include post-cutoff records created on the source *after* migration started. Example:
- Pre-production has 1,000 orders as of cut-off.
- During the migration, 50 new orders are created on pre-production.
- crm-mig receives only 1,000 (the migrated set).
- Raw count: source 1,050 ≠ target 1,000 → false failure.

**How the spec resolves it:**
Each spec reads the cutoff date from the target server (crm-mig) via `MigDataParityPage.resolveCutoffDate()`, which fetches from the migration metadata. It then applies a filter on the source:
```python
# Source query: only records on or before cutoff
[('create_date', '<=', cutoff), ...]
# Target query: all records (already migrated, no post-cutoff data exists)
[...]
```
This ensures the comparison is apples-to-apples.

---

## Natural-Key Join Rule

**Problem**: Record IDs are re-sequenced on crm-mig.
- A partner with `id=123` on pre-production may have `id=456` on crm-mig.
- Joining on ID will fail.

**Solution**: Join on natural keys (field combinations that uniquely identify a record across both systems).
- **Partners**: `(name, email)` — e.g., "Acme Corp", "contact@acme.com"
- **Orders**: `(name)` — e.g., `SO003421`, `DE00123`
- **Invoices**: `(name, move_type)` — e.g., `INV/2025/001` (out_invoice), `CINV/2025/002` (out_refund)
- **Attachments**: `(checksum, res_model, res_id_source_name)` — checksum + document type + source record name

Each spec documents its join strategy in the header comments.

---

## Open Questions Carried in Master Rows

### 1. Migration Snapshot Date (UNCONFIRMED)
**Status**: The exact timestamp of the migration snapshot on the source is not yet confirmed in the master sheet.
- **Impact**: All specs use `resolveCutoffDate()` to fetch it dynamically from crm-mig metadata, so this does not block execution.
- **Action**: Confirm snapshot date with migration team and update the master sheet row 1.1.2 once migration data becomes available.

### 2. Vendor Bills In Scope? (UNRESOLVED)
**Status**: The scope document does not explicitly state whether vendor bills (incoming invoices, `account.move` with `move_type='in_invoice'`) are included in the migration.
- **Current assumption**: Only sales documents (sale orders, customer invoices, credit notes) are in scope; vendor bills are excluded.
- **Impact**: Spec 5.1.1 (invoice count) counts only `move_type` in `['out_invoice', 'out_refund']`. If vendor bills are in scope, the query must be updated.
- **Action**: Confirm with Odoo lead whether vendor bills are migrated, and update scope documentation and specs accordingly.

---

## Run Commands

### List all specs in this suite
```bash
cd D:/Automation_CRM/CRM_AUTO_PLAYWRIGHT
npx playwright test "tests/1.Project_CRM/O12_CE_to_O12_CC/Data_Migration/CRM-12653_Sales-data-to-Odoo-12-CE/**/*.spec.ts" --list
```

### Run a single spec
```bash
npx playwright test --grep "CRM-12653_2\.1\.1:" --project=chromium
```

### Run all specs in a block (e.g., B-Partners)
```bash
npx playwright test --grep "CRM-12653_2\." --project=chromium
```

### Run all specs in this suite
```bash
npx playwright test "tests/1.Project_CRM/O12_CE_to_O12_CC/Data_Migration/CRM-12653_Sales-data-to-Odoo-12-CE/**/*.spec.ts" --project=chromium
```

### Run with video (all platforms)
```bash
VIDEO=on npx playwright test "tests/1.Project_CRM/O12_CE_to_O12_CC/Data_Migration/CRM-12653_Sales-data-to-Odoo-12-CE/**/*.spec.ts" --project=chromium
```

### Run with custom timeout (in milliseconds)
```bash
npx playwright test --grep "CRM-12653_2\." --timeout=120000 --project=chromium
```

---

## Audit Status

All **45 implemented specs** pass the O12 data parity audit criteria:
- ✓ **Read-Only**: No mutations (create, write, unlink, click on buttons, fill forms). Verified via grep audit 2026-09-14.
- ✓ **Bounded Reads**: All RPC queries include `limit ≤ 500` and narrow filters (e.g., date range, natural keys, name equality).
- ✓ **Assertions**: Each spec has `expect()` calls with message arguments; count ≥ 3 per spec.
- ✓ **No False Green**: Specs include guards (e.g., `isAuthenticatedSession()` before proceeding, `sourceCount > 0` before comparison).
- ✓ **Natural Keys**: All joins use field combinations, not IDs.
- ✓ **Cut-Off**: Cut-off date resolved from target and applied to source queries.
- ✓ **Conventions**: Test steps mirror manual TC in order; fidelity verified.
- ✓ **Compiles**: No syntax errors; imports and page objects resolve.

**Grep Audit Result** (2026-09-14): No genuine mutations found in any .spec.ts file. All 45 specs are read-only clean.

---

## Jenkins Integration

### SPEC Glob for CRM_O12_MIG_ReadOnly Job
```
tests/1.Project_CRM/O12_CE_to_O12_CC/Data_Migration/CRM-12653_Sales-data-to-Odoo-12-CE/**/*.spec.ts
```

### Local Command to List Matching Specs
```bash
cd D:/Automation_CRM/CRM_AUTO_PLAYWRIGHT
npx playwright test "tests/1.Project_CRM/O12_CE_to_O12_CC/Data_Migration/CRM-12653_Sales-data-to-Odoo-12-CE/**/*.spec.ts" --list
```

This glob matches all 45 specs across 8 folders (A through H).

---

## Contact & Status

**Automation Owner**: anh.ho@nakivo.com  
**Ticket**: CRM-12653  
**Last Updated**: 2026-09-14  
**Execution Status**: **BLOCKED** — awaiting crm-mig QA credential refresh after 2026-09-13/14 database re-clone.  
**Next Step**: Refresh crm-mig QA password and execute suite on crm-mig environment.
