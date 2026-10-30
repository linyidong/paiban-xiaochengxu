// T-037 批量/导入操作条：按钮不再写入日期格，29/30 号不被覆盖。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const cal = require('../miniprogram/utils/calendar');

const ROOT = path.join(__dirname, '..');

test('2026-11 网格保留 29/30 号', function () {
  const cells = cal.getMonthGrid(2026, 11);
  const dates = cells.filter(function (c) { return c.inMonth; }).map(function (c) { return c.fullDate; });
  assert.ok(dates.includes('2026-11-29'));
  assert.ok(dates.includes('2026-11-30'));
  assert.strictEqual(cells.filter(function (c) { return c.isBatch || c.isImport; }).length, 0);
});

test('页面不再把批量/导入塞进日期格', function () {
  const pageJs = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'calendar', 'calendar.js'), 'utf8');
  assert.ok(!pageJs.includes('withBatchCell'));
  const comp = fs.readFileSync(path.join(ROOT, 'miniprogram', 'components', 'calendar', 'calendar.wxml'), 'utf8');
  assert.ok(comp.includes('cal-actions'));
  assert.ok(!comp.includes('isBatch'));
});

test('页面把批量/导入状态传给组件', function () {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'calendar', 'calendar.wxml'), 'utf8');
  assert.ok(wxml.includes('batch-label='));
  assert.ok(wxml.includes('show-import='));
});
