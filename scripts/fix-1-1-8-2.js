const fs = require('fs');
const src = 'D:\\II. Automation\\CRM_AUTO\\tests\\1.Project_CRM\\9.CRM_Module\\CRM_2338_Opportunity-Expected-Revenue-Calculation\\1.Deal_Elements-tab-to-Opportunities\\1.1.8.Deal_Element_Validity\\tc-crm-2338-1-1-8-2-Verify-the-value-of-Deal_Element-Validity-is-required-field.spec.ts';

let c = fs.readFileSync(src, 'utf8');

const r = (a, b) => { c = c.replace(a, b); };

// JSDoc header
r('Test Case ID: CRM-2338_1.1.7.4', 'Test Case ID: CRM-2338_1.1.8.2');
r('Summary: Verify the Deal Element.Pricelist is a required field', 'Summary: Verify the Deal Element.Validity is a required field');
r('npx playwright test --grep "CRM-2338_1\\.1\\.7\\.4:" --project=chromium', 'npx playwright test --grep "CRM-2338_1\\.1\\.8\\.2:" --project=chromium');
r('* 3. Set Pricelist field = [BLANK]', '* 3. Set Validity field = [BLANK]');
r('* 1. Error message: "The following fields are invalid: Pricelist"', '* 1. Error message: "The following fields are invalid: Validity"');

// test.describe / test()
r("test.describe('CRM-2338_1.1.7.4 - Verify the Deal Element.Pricelist is a required field'", "test.describe('CRM-2338_1.1.8.2 - Verify the Deal Element.Validity is a required field'");
r("test('CRM-2338_1.1.7.4: Verify the Deal Element.Pricelist is a required field'", "test('CRM-2338_1.1.8.2: Verify the Deal Element.Validity is a required field'");

// tcId
r("const tcId        = 'CRM-2338_1.1.7.4';", "const tcId        = 'CRM-2338_1.1.8.2';");

// Step VII.3
r("await test.step('Step VII.3: Set Pricelist field = [BLANK]'", "await test.step('Step VII.3: Set Validity field = [BLANK]'");
r("console.log('Step VII.3: Clearing Pricelist field');", "console.log('Step VII.3: Clearing Validity field');");
r('await dealElementPage.clearPricelistField();', 'await dealElementPage.clearValidityField();');
r("console.log('\u2713 Pricelist field cleared (set to blank)');", "console.log('\u2713 Validity field cleared (set to blank)');");
r("'VII.3 - Pricelist cleared'", "'VII.3 - Validity cleared'");

// VIII verification
r("await test.step('VIII.1: Verify error message \"The following fields are invalid: Pricelist\"'", "await test.step('VIII.1: Verify error message \"The following fields are invalid: Validity\"'");
r("expect(errorMessage).toContain('Pricelist');", "expect(errorMessage).toContain('Validity');");
r("console.log('\u2713 VIII.1: Error message confirmed - \"The following fields are invalid: Pricelist\"');", "console.log('\u2713 VIII.1: Error message confirmed - \"The following fields are invalid: Validity\"');");

// Final summary
r("console.log('\n\u2705 TEST PASSED: CRM-2338_1.1.7.4 verification completed successfully');", "console.log('\n\u2705 TEST PASSED: CRM-2338_1.1.8.2 verification completed successfully');");
r("console.log('   VIII.1: Error message \"The following fields are invalid: Pricelist\" confirmed');", "console.log('   VIII.1: Error message \"The following fields are invalid: Validity\" confirmed');");

fs.writeFileSync(src, c, 'utf8');
console.log('Done. Length: ' + c.length);
