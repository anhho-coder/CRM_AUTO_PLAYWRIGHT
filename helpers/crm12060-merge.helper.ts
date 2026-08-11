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
