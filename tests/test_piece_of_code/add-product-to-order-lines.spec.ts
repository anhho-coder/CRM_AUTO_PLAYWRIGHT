// spec: Open Chrome browser for testing
// seed: tests/seed.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Add Product to Order Lines', () => {
  test('Add product and attempt to save', async ({ page }) => {
    // Press "Add a product" link in Order Lines section
    await page.getByRole('button', { name: 'Add a product' }).click();

    // Click on Product field to display dropdown list
    await page.locator('.o_data_cell > .o_field_widget > .o_input_dropdown > .o_input').first().click();

    // Select the first product from the dropdown list
    await page.locator('#ui-id-26').getByText('[A2144B] NAKIVO Backup &').click();

    // Press "SAVE" button on top page
    await page.getByRole('button', { name: 'Save' }).click();

    // Verify that validation error appears for Payment Terms
    await expect(page.getByText('The following fields are invalid:')).toBeVisible();
    await expect(page.getByText('Payment Terms')).toBeVisible();
  });
});
