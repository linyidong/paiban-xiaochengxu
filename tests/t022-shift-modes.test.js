// T-024 回归：管理员也能看到并使用 4/6 状态切换（默认仍 4 状态）。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'calendar', 'calendar.wxml'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'calendar', 'calendar.js'), 'utf8');
const shift = require(path.join(ROOT, 'miniprogram', 'utils', 'shift.js'));

test('4/6 切换不再对管理员隐藏', function () {
  assert.strictEqual(wxml.includes('wx:if="{{!selectedIsAdmin}}"'), false);
  assert.ok(wxml.includes('4 状态'));
  assert.ok(wxml.includes('6 状态'));
});

test('管理员默认仍是 4 状态', function () {
  assert.strictEqual(shift.detectShiftMode(['休', '正A'], true), 'basic');
  assert.strictEqual(shift.getShiftOptions('basic').length, 5);
  assert.strictEqual(shift.getShiftOptions('special').length, 7);
});

test('手动切换后跨月保持（loadShifts 不再强制清空 _modeManual）', function () {
  assert.strictEqual(/this\._modeManual\s*=\s*false;/.test(js.split('loadShifts()')[1].split('applyShifts')[0]), false);
});
