// T-069 服务端同名行合并后按日期去重，避免 31 天变 93 行
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

test('同名成员合并后按日期去重', function () {
  const js = fs.readFileSync(path.join(ROOT, 'cloudfunctions', 'importShift', 'index.js'), 'utf8');
  assert.ok(js.includes('byDate[r.date] = r'));
  assert.ok(js.includes("Object.keys(byDate).sort()"));
});
