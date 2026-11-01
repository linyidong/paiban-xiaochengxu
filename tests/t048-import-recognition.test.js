// T-048 真实姓名全表识别与成员直接导入匹配
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

test('AI 提示词要求逐行输出所有人员，并提高 token 上限', function () {
  const js = fs.readFileSync(path.join(ROOT, 'cloudfunctions', 'importShift', 'index.js'), 'utf8');
  assert.ok(js.includes('必须逐行识别表格中的每一个人'));
  assert.ok(js.includes('表格即使没有标题、没有昵称列，也必须输出所有人员行'));
  assert.ok(js.includes('max_tokens: 8192'));
  assert.ok(js.includes('attempt < 2'));
});

test('成员直接导入时也把绑定成员作为匹配目标', function () {
  const js = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'import', 'import.js'), 'utf8');
  assert.ok(js.includes('const matchTarget'));
  assert.ok(js.includes('!this.data.isAdmin ? this.data.boundMemberName'));
  assert.ok(js.includes('_useMatchedRows'));
  assert.ok(js.includes('_isBoundToOther'));
});
