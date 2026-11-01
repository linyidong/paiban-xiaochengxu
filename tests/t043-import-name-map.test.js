// T-043 目标昵称与排班表真实姓名不一致时，必须由用户显式确认映射。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

test('昵称/真实姓名命中时直接采用，不弹确认', function () {
  const js = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/import/import.js'), 'utf8');
  assert.ok(js.includes('_useMatchedRows'));
  assert.ok(js.includes('nicknameHits'));
  assert.ok(!js.includes('_confirmMatchedRows'));
});
