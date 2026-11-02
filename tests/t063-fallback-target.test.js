// T-063 兜底候选列表必须保留当前成员作为映射目标
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

test('兜底列表设置 mappingTargetName', function () {
  const js = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'import', 'import.js'), 'utf8');
  assert.ok(js.includes('fallbackTarget'));
  assert.ok(js.includes('mappingTargetName: fallbackTarget'));
});
