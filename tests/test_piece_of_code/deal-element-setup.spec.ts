// spec: Open Chrome browser for testing
// seed: tests/seed.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Deal Element Setup', () => {
  test('Configure Deal Element with Pricelist and Payment Terms', async ({ page }) => {
    // 1. Press "DEAL ELEMENT" button
    await page.getByRole('button', { name: 'DEAL ELEMENT' }).click();

    // 2. Wait for Deal Element screen to load
    await new Promise(f => setTimeout(f, 3 * 1000));

    // 2. Click on Payment Terms field to select "Immediate Payment"
    await page.getByRole('textbox', { name: 'Payment Terms' }).click();

    // 2. Select "Immediate Payment" from Payment Terms dropdown
    await page.locator('#ui-id-45').getByText('Immediate Payment').click();

    // Verify Pricelist is set to Public Pricelist_USD (USD)
    const pricelistInput = page.getByRole('textbox', { name: 'Pricelist' });
    await expect(pricelistInput).toHaveValue('Public Pricelist_USD (USD)');

    // Verify Payment Terms is set to Immediate Payment
    const paymentTermsInput = page.getByRole('textbox', { name: 'Payment Terms' });
    await expect(paymentTermsInput).toHaveValue('Immediate Payment');
  });
});
