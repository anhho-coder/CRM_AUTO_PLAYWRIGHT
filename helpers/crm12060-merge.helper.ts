import { Page } from '@playwright/test';
import { ContactPage } from '@pages';

/**
 * CRM-12060 shared setup helper.
 *
 * The 3 CRM-12060 specs all need the SAME precondition: two Company-type Contacts that share
 * one identical Company Name (Name) but have distinct emails - the "same name, indistinguishable
 * in the merge selector" situation the ticket is about. This helper builds ONE such contact; the
 * specs call it twice with the SAME name and different emails to create the pair.
 *
 * It is a grouped setup block (not what any TC verifies), so it is kept out of the numbered
 * verification steps (skill REQUIREMENT #1 grouping allowance). Each spec passes freshly
 * generated, unique data every run (REQUIREMENT #2).
 */
export interface CreatedContact {
  id: string;
  url: string;
  name: string;
  email: string;
}

/**
 * Create ONE contact of the given type (`Company` or `Individual`) and return its id + backend
 * form URL. Assumes the caller is logged in. Navigates to the Contacts list, opens a new contact
 * form, fills the required fields and saves.
 */
export async function createContactOfType(
  page: Page,
  contactPage: ContactPage,
  contactType: 'Company' | 'Individual',
  name: string,
  email: string,
  country: string = 'United States',
  salesTeam: string = 'CMR',
  state: string = 'Maryland'
): Promise<CreatedContact> {
  await contactPage.openContactsList();
  await contactPage.openNewContactForm();
  const res = await contactPage.createContact(contactType, name, email, country, salesTeam, state);
  const created: CreatedContact = { id: res.contactId, url: page.url(), name, email };
  console.log(`  - Created ${contactType} contact "${name}" id=${created.id} email=${email}`);
  console.log(`      url = ${created.url}`);
  return created;
}

/**
 * Public / free email domains. A manual "Merge Contacts" is keyed on a SHARED EMAIL DOMAIN, so a
 * historical contact sitting on a public domain is unusable as a merge destination for these tests:
 * the domain is shared by hundreds of unrelated contacts, which makes the merge selection ambiguous.
 * Discovery skips any candidate whose email is on one of these domains.
 */
export const PUBLIC_EMAIL_DOMAINS: readonly string[] = [
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'outlook.com',
  'live.com', 'msn.com', 'aol.com', 'icloud.com', 'me.com', 'mail.com', 'gmx.com', 'gmx.de',
  'yandex.ru', 'mail.ru', 'protonmail.com', 'proton.me', 'qq.com', '163.com', 'web.de',
];

/** Whether `domain` is a public / free email domain (case-insensitive). */
export function isPublicEmailDomain(domain: string): boolean {
  return PUBLIC_EMAIL_DOMAINS.includes(domain.trim().toLowerCase());
}

/**
 * Pull the domain out of an email address ("info@acme.com" -> "acme.com"). Tolerates the raw text
 * of a readonly Odoo email cell (surrounding whitespace, a trailing comma). Returns '' when the
 * value holds no usable domain.
 */
export function extractEmailDomain(email: string): string {
  const m = (email || '').replace(/\s+/g, ' ').trim().match(/@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  return m ? m[1].toLowerCase().replace(/[.,;]+$/, '') : '';
}

/**
 * Build a fresh, unique email address INSIDE an existing domain - the merge-eligibility key
 * ("only the domain must match"). e.g. buildEmailInDomain('crm12059-src', 'acme.com')
 * -> "crm12059-src-1754...@acme.com".
 */
export function buildEmailInDomain(prefix: string, domain: string): string {
  return `${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}@${domain.replace(/^@/, '')}`;
}

/** Convenience wrapper: create a Company-type contact (Company Name = `name`). */
export async function createCompanyContact(
  page: Page,
  contactPage: ContactPage,
  name: string,
  email: string,
  country: string = 'United States',
  salesTeam: string = 'CMR',
  state: string = 'Maryland'
): Promise<CreatedContact> {
  return createContactOfType(page, contactPage, 'Company', name, email, country, salesTeam, state);
}
