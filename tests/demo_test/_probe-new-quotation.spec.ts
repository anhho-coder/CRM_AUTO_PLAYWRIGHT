import { test } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { LoginPage } from '@pages';

test.setTimeout(300000);

test('PROBE: what happens after "New quotation" on a Deal Element', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const loginPage = new LoginPage(page);
  await loginPage.navigateTo(baseUrl);
  await loginPage.login(users.sale_ic_thomas.username, users.sale_ic_thomas.password);
  await loginPage.dismissLocationPermissionDialog();

  const rpc = async (model: string, method: string, args: any[], kwargs: any = {}) =>
    await page.evaluate(async ({ model, method, args, kwargs }) => {
      const r = await fetch('/web/dataset/call_kw', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } }),
      });
      const j = await r.json();
      return j.error ? { __error: j.error.data?.message || j.error.message } : j.result;
    }, { model, method, args, kwargs });

  // 1) Does sale.order even HAVE need_approve, and what hides "TO APPROVE"?
  const soFields: any = await rpc('sale.order', 'fields_get', [[], ['string', 'type']], {});
  console.log('PROBE need_approve field present:', Object.keys(soFields || {}).includes('need_approve'));

  // 2) The SO the failed run created (partner from the failing test)
  const orders: any = await rpc('sale.order', 'search_read',
    [[['partner_id.name', 'like', 'company20260826084741.com']],
     ['name', 'state', 'amount_total', 'partner_id', 'create_date']], { limit: 10 });
  console.log('PROBE orders for the failed run:', JSON.stringify(orders, null, 2));

  const ids = (orders || []).map((o: any) => o.id);
  if (ids.length) {
    const approvalish = Object.keys(soFields || {}).filter(f => /approv/i.test(f));
    console.log('PROBE approval-ish fields on sale.order:', JSON.stringify(approvalish));
    const detail: any = await rpc('sale.order', 'read', [ids, approvalish.concat(['name', 'state'])], {});
    console.log('PROBE approval values:', JSON.stringify(detail, null, 2));
  }

  // 3) What does the button action return? Read its ir.model.data / server action definition.
  const btn: any = await rpc('ir.model.fields', 'search_read',
    [[['model', '=', 'x_deal_element'], ['name', 'like', 'quote']], ['name', 'field_description']], { limit: 20 });
  console.log('PROBE deal-element quote fields:', JSON.stringify(btn));
});
