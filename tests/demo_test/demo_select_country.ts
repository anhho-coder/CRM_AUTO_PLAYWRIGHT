import { test, expect, Page } from '@playwright/test';

/**
 * Method to select a country value in the address country field
 * @param page - Playwright page object
 * @param countryName - Name of the country to select (e.g., 'Albania')
 * @param fieldIndex - Index of the country field (default: 2)
 */
async function selectCountryField(page: Page, countryName: string, fieldIndex: number = 2): Promise<void> {
  const countryXPath = `(//div[contains(@class,'o_field_widget o_field_many2one o_address_country')])[${fieldIndex}]/div/input`;
  
  // Locate the country input field
  const countryInput = page.locator(`xpath=${countryXPath}`);
  
  // Click on the input field
  await countryInput.click();
  
  // Type the country name
  await countryInput.fill(countryName);
  
  // Wait for dropdown and select the option
  await page.getByRole('option', { name: countryName }).click();
  
  // Verify the value is set
  await expect(countryInput).toHaveValue(countryName);
}

test.describe('Demo Tests', () => {
  test('Select country value using XPath', async ({ page }) => {
    // Navigate to the CRM application
    await page.goto('http://10.220.222.100/');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Use the method to select country
    await selectCountryField(page, 'Albania');
  });
  
  test('Alternative: Select country using evaluate', async ({ page }) => {
    // Navigate to the CRM application
    await page.goto('http://10.220.222.100/');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Select country using JavaScript evaluation
    const result = await page.evaluate(() => {
      const xpath = "(//div[contains(@class,'o_field_widget o_field_many2one o_address_country')])[2]/div/input";
      const input = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue as HTMLInputElement;
      
      if (input) {
        input.click();
        input.value = 'Albania';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return 'Albania selected successfully';
      }
      return 'Element not found';
    });
    
    console.log(result);
    expect(result).toBe('Albania selected successfully');
  });
});
