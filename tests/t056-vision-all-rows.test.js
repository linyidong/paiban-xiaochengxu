// T-056 视觉识别必须返回整表，不能因 targetName 只识别目标行
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

test('视觉提示词不再按 targetName 锁定单人', function () {
  const js = fs.readFileSync(path.join(ROOT, 'cloudfunctions', 'importShift', 'index.js'), 'utf8');
  assert.ok(!js.includes('只识别「'));
  assert.ok(!js.includes('只输出这一个人的数据'));
  assert.ok(js.includes('必须逐行识别表格中的每一个人'));
});
