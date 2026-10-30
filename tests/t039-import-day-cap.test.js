// T-039 导入天数上限：50+ 天/跨月/重复日期只能保留目标月实际天数。
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { createState, loadWithMock } = require('./helpers/mock-cloud');
const { normalizePreviewToMonth } = require('../miniprogram/utils/month.js');

const FN = path.join(__dirname, '..', 'cloudfunctions', 'importShift', 'index.js');

function rowsForDays(count, monthPrefix) {
  const rows = [];
  for (let d = 1; d <= count; d++) {
    const mm = String(monthPrefix).padStart(2, '0');
    const day = ((d - 1) % 30) + 1;
    const month = d <= 30 ? 11 : 12;
    rows.push({ date: '2026-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0'), shift: '休' });
  }
  return rows;
}

test('客户端归一化：50 条/跨月/重复只留 30 天', function () {
  const rows = rowsForDays(50, 11);
  rows.push({ date: '2026-11-05', shift: '正' }); // 重复日
  rows.push({ date: '2026-11-31', shift: '休' }); // 不存在
  const r = normalizePreviewToMonth([{ name: '甲', rows: rows }], '2026-11');
  assert.strictEqual(r.preview[0].rows.length, 30);
  assert.ok(r.dropped >= 20);
  r.preview[0].rows.forEach(function (x) {
    assert.ok(x.date.startsWith('2026-11-'));
    const day = parseInt(x.date.slice(8, 10), 10);
    assert.ok(day >= 1 && day <= 30);
  });
});

test('云函数写库前再截断：50 条只写 30 条', async function () {
  const state = createState();
  state.openid = 'o-admin';
  const main = loadWithMock(FN, state);
  const r = await main({
    commit: true, year: 2026, month: 11,
    preview: [{ name: '甲', rows: rowsForDays(50, 11) }]
  });
  assert.strictEqual(r.ok, true);
  assert.ok(r.dropped >= 20);
  assert.strictEqual(state.shifts.length, 30);
  state.shifts.forEach(function (s) {
    assert.ok(s.date.startsWith('2026-11-'));
    const day = parseInt(s.date.slice(8, 10), 10);
    assert.ok(day >= 1 && day <= 30);
  });
});
