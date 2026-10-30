// T-043 目标昵称与排班表真实姓名不一致时，必须由用户显式确认映射。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

test('识别到单个真实姓名时提供“按目标成员导入”确认', function () {
  const js = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/import/import.js'), 'utf8');
  assert.ok(js.includes('成员名不一致'));
  assert.ok(js.includes('按' + '目标成员导入') || js.includes("confirmText: '按' + wanted + '导入'"));
  assert.ok(js.includes('已按「'));
  assert.ok(js.includes('fullPreview.length === 1'));
});
