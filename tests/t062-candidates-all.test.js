// T-062 无命中时必须列出表内所有人员（不排除已绑定）
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

test('目标未命中时候选不按已绑定过滤', function () {
  const js = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'import', 'import.js'), 'utf8');
  assert.ok(!js.includes('filter((p) => !this._isBoundToOther(p, targetName))'));
  assert.ok(!js.includes('filter((p) => !this._isBoundToOther(p, wanted))'));
  assert.ok(js.includes('const candidates = fullPreview.slice();'));
});
