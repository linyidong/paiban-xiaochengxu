// T-037 批量/导入追加在月末日期之后：不覆盖 29/30/31，伪格使用唯一 key。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const cal = require('../miniprogram/utils/calendar');

const ROOT = path.join(__dirname, '..');

function november() {
  return cal.getMonthGrid(2026, 11);
}

test('2026-11 网格保留 29/30，批量/导入追加在最后', function () {
  const cells = november();
  const dates = cells.filter(function (c) { return c.inMonth; }).map(function (c) { return c.fullDate; });
  assert.ok(dates.includes('2026-11-29'));
  assert.ok(dates.includes('2026-11-30'));
  const out = cal.withBatchCell(cells, '批量', false, true);
  assert.strictEqual(out.length, cells.length + 2);
  assert.strictEqual(out[cells.length].isBatch, true);
  assert.strictEqual(out[cells.length + 1].isImport, true);
  assert.strictEqual(out[cells.length].fullDate, '__batch__');
  assert.strictEqual(out[cells.length + 1].fullDate, '__import__');
  assert.strictEqual(new Set(out.map(function (c) { return c.fullDate; })).size, out.length);
});

test('批量按钮不替换最后一天（31 号仍在）', function () {
  const cells = [];
  for (let d = 1; d <= 31; d++) cells.push({ day: d, fullDate: '2026-10-' + String(d).padStart(2, '0'), inMonth: true, shift: d === 31 ? '正' : '' });
  const out = cal.withBatchCell(cells, '批量', false, false);
  assert.strictEqual(out[30].day, 31);
  assert.strictEqual(out[30].shift, '正');
  assert.strictEqual(out[31].isBatch, true);
});
