/**
 * Page Object Model - O12 Migration server (crm-mig.nakivo.site) variants.
 *
 * The Migration server is a fresh Odoo 12 *Community* base (CRM-12124) with a different UI: a
 * SIDEBAR backend theme (body `mk_sidebar_type_large`) plus NAKIVO custom screens. BUT the core Odoo
 * widgets (forms, lists, kanban, many2one, save button) come from the base `web` module and are the
 * SAME as pre-prod - so REUSE the base page objects from `@pages` wherever they work, and only add a
 * variant here when a screen GENUINELY differs on Mig.
 *
 * Pattern - subclass the base page object and override the PUBLIC method (base locators are
 * `private`, so define Mig-local locators in the subclass). See LoginPageMig / HomePageMig: both
 * exist only because the sidebar THEME hides the navbar the base objects target.
 *
 * Keep these THIN and additive - the Mig base is a moving target as custom modules are installed
 * incrementally per the migration plan.
 */

export { LoginPageMig } from './LoginPageMig';
export { HomePageMig } from './HomePageMig';
export { MigPlatformPage } from './MigPlatformPage';
export type { VersionInfo, ModuleInfo } from './MigPlatformPage';
