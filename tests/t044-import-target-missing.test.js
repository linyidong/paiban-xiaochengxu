// T-044 识别阶段目标未命中时不能直接失败：返回整表，交给前端做“真实姓名→目标成员”确认。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

test('识别阶段保留 targetMissing，不提前返回未识别错误', function () {
  const js = fs.readFileSync(path.join(ROOT, 'cloudfunctions', 'importShift', 'index.js'), 'utf8');
  assert.ok(js.includes('targetMissing'));
  assert.ok(js.includes('return { ok: true, preview: preview, targetMissing: targetMissing }'));
  assert.ok(!js.includes("return { ok: false, msg: '未识别到「' + t + '」的排班"));
});
