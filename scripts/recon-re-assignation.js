const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();

  // Login
  await page.goto('http://10.220.222.100/web', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="login"]').fill('anh.ho@nakivo.com');
  await page.locator('input[name="password"]').fill('AUaT@H0123456789012');
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(3000);

  // Navigate to Re-assignation form
  await page.goto('http://10.220.222.100/web?#id=8&action=1705&model=nakivo.crm.re.assignation&view_type=form&menu_id=111', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Extract field labels
  const fields = await page.evaluate(() => {
    const seen = new Set();
    const results = [];
    const selectors = [
      '.o_form_view label',
      '.o_form_view td.o_td_label',
      '.o_form_view .o_wrap_label',
      '.o_form_label',
    ];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.length > 0 && text.length < 100 && !seen.has(text)) {
          seen.add(text);
          results.push(text);
        }
      });
    });
    return results;
  });

  console.log('\n=== RE-ASSIGNATION FORM FIELDS ===');
  fields.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  console.log(`\nTotal: ${fields.length} field(s)`);

  await page.screenshot({ path: path.join(__dirname, 'recon-re-assignation.png'), fullPage: true });
  console.log('Screenshot saved: scripts/recon-re-assignation.png');

  await browser.close();
})();