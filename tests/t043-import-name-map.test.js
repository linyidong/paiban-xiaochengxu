// T-043 目标昵称与排班表真实姓名不一致时，必须由用户显式确认映射。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

test('识别命中时提供“采用这一行”确认', function () {
  const js = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/import/import.js'), 'utf8');
  assert.ok(js.includes('成员匹配确认'));
  assert.ok(js.includes('采用这一行'));
  assert.ok(js.includes('_confirmMatchedRows'));
  assert.ok(js.includes('_rowMatchesTarget'));
});
