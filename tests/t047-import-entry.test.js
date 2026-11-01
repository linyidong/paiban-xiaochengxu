// T-047 导入入口区分：日历带入显示目标/月份；直接点底部导入显示默认入口。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

test('直接点底部导入会清空目标/月份', function () {
  const js = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'import', 'import.js'), 'utf8');
  assert.ok(js.includes('onTabItemTap'));
  assert.ok(js.includes('_clearEntry'));
  assert.ok(js.includes('_fromDirectTab'));
  assert.ok(js.includes('prefillName: \'\''));
});

test('目标卡仍然只在 prefillName 存在时显示', function () {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'import', 'import.wxml'), 'utf8');
  assert.ok(wxml.includes('wx:if="{{prefillName}}"'));
  assert.ok(wxml.includes('目标：{{prefillName}} · {{targetMonth}}'));
});
