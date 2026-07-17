// Mở report Playwright mới nhất.
// Config đặt mỗi lần chạy vào một thư mục con có timestamp trong playwright-report/,
// nên `playwright show-report` mặc định (tìm index.html ở gốc) sẽ báo "page can't be found".
// Script này tìm thư mục con mới nhất và trỏ show-report vào đó.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const reportRoot = path.resolve(__dirname, '..', 'playwright-report');

if (!fs.existsSync(reportRoot)) {
  console.error('Khong tim thay thu muc playwright-report/. Hay chay test truoc (npm test).');
  process.exit(1);
}

const dirs = fs
  .readdirSync(reportRoot)
  .map((name) => path.join(reportRoot, name))
  .filter((full) => fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'index.html')))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

if (dirs.length === 0) {
  console.error('Khong tim thay report nao (khong co index.html). Hay chay test truoc (npm test).');
  process.exit(1);
}

const latest = dirs[0];
console.log('Dang mo report moi nhat: ' + path.basename(latest));

const result = spawnSync('npx', ['playwright', 'show-report', latest], {
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status ?? 0);
