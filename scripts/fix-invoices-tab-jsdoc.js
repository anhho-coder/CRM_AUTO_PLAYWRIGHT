const fs = require('fs');
const path = require('path');

const dir = path.join(
  __dirname, '..', 'tests', '1.Project_CRM', '4.Investments',
  'CRM-2482_Investments_module-General_fields', '2.Investment_record',
  '2.2.Tabs', '2.2.10.Invoices_tab'
);

const files = fs.readdirSync(dir)
  .filter(f => f.endsWith('.spec.ts') && !f.includes('2-2-10-1-Verify'));

let count = 0;
for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Detect line ending
  const eol = content.includes('\r\n') ? '\r\n' : '\n';

  // JSDoc 5.1: add "Investment ID" = test after "Tags" = test (before 5.2)
  const tags51 = ' *         - "Tags" = test' + eol + ' *    5.2. Use the template CSV file';
  const tags51New = ' *         - "Tags" = test' + eol + ' *         - "Investment ID" = test' + eol + ' *    5.2. Use the template CSV file';
  if (content.includes(tags51)) {
    content = content.replace(tags51, tags51New);
    changed = true;
    console.log('  [5.1 JSDoc] Updated: ' + file);
  } else {
    console.log('  [5.1 JSDoc] Already updated or pattern not found: ' + file);
  }

  // JSDoc 5.3: add "Investment ID" = test after "Tags" = test (before 5.4)
  const tags53 = ' *         - "Tags" = test' + eol + ' *    5.4. Save the file';
  const tags53New = ' *         - "Tags" = test' + eol + ' *         - "Investment ID" = test' + eol + ' *    5.4. Save the file';
  if (content.includes(tags53)) {
    content = content.replace(tags53, tags53New);
    changed = true;
    console.log('  [5.3 JSDoc] Updated: ' + file);
  } else {
    console.log('  [5.3 JSDoc] Already updated or pattern not found: ' + file);
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    count++;
  }
}

console.log('\nTotal files updated: ' + count);
