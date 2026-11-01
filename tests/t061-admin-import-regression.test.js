// T-061 回归：无 target 的整表导入不能过滤已绑定成员
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

test('整表导入保留已绑定成员，不再生成空 matched', function () {
  const js = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'import', 'import.js'), 'utf8');
  assert.ok(!js.includes("!this._isBoundToOther(p, '')"));
  assert.ok(js.includes('preview: previewAll'));
});
