import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

/**
 * Source of the Helpdesk A/B test cases (CRM-11859, Customer Support migration): the CSV the DEV hands over, kept in
 * the repo so every spec can be checked against the exact text it was written from (automate_manual_tc_from_jira
 * skill, REQUIREMENT #7 - pin the source version, re-check it before trusting the spec).
 *
 * A spec pins a FINGERPRINT of the CSV fields it mirrors (sha256 of those fields, first 16 hex chars). Before the test
 * runs, assertHelpdeskAbSourceInSync() recomputes it from the CSV on disk: a different value means somebody edited that
 * TC's text after the spec was written, and the spec refuses to report anything until a human has re-read both.
 */
export const HELPDESK_AB_CSV = path.resolve(
  __dirname,
  '..',
  'test-data',
  'CRM-11859-[Odoo migration] Customer Support module - Test cases',
  'Helpdesk-AB-Test-Cases - Pre-pro.csv'
);

/** The CSV columns a side-A (Odoo 12) spec mirrors. */
export const AB_FIELDS_SIDE_A = ['Preconditions', 'Steps', 'A expected (Odoo 12)', 'Test data'] as const;
/** The CSV columns a side-B (Frappe Helpdesk) spec mirrors. */
export const AB_FIELDS_SIDE_B = ['Preconditions', 'Steps', 'B expected (Frappe Helpdesk)', 'Test data'] as const;

/** Minimal RFC 4180 parser: quoted fields, "" escapes, commas and line breaks inside quotes, CRLF or LF rows. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v !== ''));
}

/** One CSV row as {column: value}. Throws when the ID is missing or appears more than once. */
export function readHelpdeskAbRow(id: string): Record<string, string> {
  if (!fs.existsSync(HELPDESK_AB_CSV)) throw new Error(`Helpdesk A/B source CSV not found: ${HELPDESK_AB_CSV}`);
  const [header, ...rows] = parseCsv(fs.readFileSync(HELPDESK_AB_CSV, 'utf8').replace(/^﻿/, ''));
  const idCol = header.indexOf('ID');
  const hits = rows.filter((r) => r[idCol] === id);
  if (hits.length !== 1) throw new Error(`${id}: ${hits.length} rows in ${path.basename(HELPDESK_AB_CSV)} (expected exactly 1)`);
  return Object.fromEntries(header.map((h, i) => [h, hits[0][i] ?? '']));
}

/** sha256 (first 16 hex chars) of the given columns of one row. Line endings are normalised so a git CRLF/LF
 *  conversion of the CSV is not mistaken for an edit. */
export function helpdeskAbFingerprint(id: string, fields: readonly string[]): string {
  const row = readHelpdeskAbRow(id);
  const missing = fields.filter((f) => !(f in row));
  if (missing.length) throw new Error(`${id}: the CSV has no column(s) ${missing.join(', ')}`);
  const payload = JSON.stringify(fields.map((f) => [f, row[f].replace(/\r\n?/g, '\n')]));
  return createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 16);
}

/** Recompute the fingerprint and THROW when it differs from the one pinned in the spec header. */
export function assertHelpdeskAbSourceInSync(id: string, fields: readonly string[], pinned: string): void {
  const now = helpdeskAbFingerprint(id, fields);
  console.log(`  Source check - ${id} in ${path.basename(HELPDESK_AB_CSV)}`);
  console.log(`     columns  : ${fields.join(' | ')}`);
  console.log(`     pinned   : ${pinned}`);
  console.log(`     current  : ${now}`);
  console.log(`     result   : ${now === pinned ? 'IN SYNC' : 'OUT OF SYNC'}`);
  if (now !== pinned) {
    throw new Error(
      `${id} is OUT OF SYNC with its source: the CSV text of ${fields.join(', ')} changed after the spec was written ` +
        `(pinned ${pinned}, now ${now}). Re-read the CSV row, re-sync the spec, then update its pinned fingerprint.`
    );
  }
}
