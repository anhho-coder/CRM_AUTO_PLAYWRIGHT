import { test } from '@playwright/test';
import { users, baseUrl_support_mig } from '@config/users.config';
import { deleteRunRowsByMarkerAsAdmin } from '@helpers/support-desk-cleanup.helper';

/**
 * CLEANUP (kept per the never-delete-explore rule) - 2026-11-04: the HD Saved Reply rows the G2 explorations saved as Giang
 * ("QA code test AUTO-G2-<run>"). Deny-list: title contains this day's explore marker "QA code test AUTO-G2-mw2"; at most 4.
 */
test('CLEANUP-G2: explore saved replies', async () => {
  for (const l of await deleteRunRowsByMarkerAsAdmin(baseUrl_support_mig, users.admin_support_mig, 'HD Saved Reply', 'title', 'QA code test AUTO-G2-mw2', 4)) console.log(l);
});

test('CLEANUP-G2b: explore saved replies as their owner Giang (Personal scope)', async () => {
  const { request } = await import('@playwright/test');
  const api = await request.newContext({ baseURL: baseUrl_support_mig.replace(/\/$/, ''), ignoreHTTPSErrors: true });
  const me = users.support_l1_giang_support_mig;
  await api.post('/api/method/login', { data: { usr: me.username, pwd: me.password } });
  const enc = (o: unknown) => encodeURIComponent(JSON.stringify(o));
  const r = await api.get(`/api/resource/HD Saved Reply?fields=${enc(['name', 'title', 'scope', 'owner', 'creation'])}&filters=${enc([['title', 'like', '%QA code test AUTO-G2-mw2%']])}&limit_page_length=5`);
  const rows: Array<Record<string, string>> = (await r.json()).data || [];
  console.log(`as Giang: HTTP ${r.status()} rows ${JSON.stringify(rows)}`);
  const g = await api.get(`/api/method/frappe.client.get_count?doctype=HD%20Saved%20Reply&filters=${enc([['scope', '=', 'Personal']])}`);
  console.log('Personal saved replies visible to Giang:', JSON.stringify(await g.json()));
  if (rows.length > 4) throw new Error('more rows than the explore runs created - nothing deleted');
  for (const row of rows) {
    if (!row.title.startsWith('QA code test AUTO-G2-mw2')) continue;
    const d = await api.delete(`/api/resource/HD Saved Reply/${encodeURIComponent(row.name)}`);
    console.log(`delete "${row.name}": HTTP ${d.status()}`);
  }
  await api.dispose();
});
