// T-031 回归：识别出的 31 天月份 → 目标 30 天月份时，预览按目标月重写并丢弃 31 号。
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { normalizePreviewToMonth } = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'month.js'));

function preview(days) {
  const rows = [];
  for (let d = 1; d <= days; d++) {
    rows.push({ date: '2025-12-' + String(d).padStart(2, '0'), shift: d === 31 ? '正A' : '休' });
  }
  return [{ name: '成员A', rows: rows }];
}

test('2025-12（31 天）→ 2026-11（30 天）：重写日期并丢弃 31 号', function () {
  const r = normalizePreviewToMonth(preview(31), '2026-11');
  assert.strictEqual(r.rewritten, true);
  assert.strictEqual(r.dropped, 1);
  assert.strictEqual(r.preview[0].rows.length, 30);
  assert.strictEqual(r.preview[0].rows[0].date, '2026-11-01');
  assert.strictEqual(r.preview[0].rows[29].date, '2026-11-30');
  assert.strictEqual(r.preview[0].rows.some(function (x) { return x.date === '2026-11-31'; }), false);
});

test('目标 2 月（非闰年）丢弃 29/30/31', function () {
  const r = normalizePreviewToMonth(preview(31), '2027-02');
  assert.strictEqual(r.dropped, 3);
  assert.strictEqual(r.preview[0].rows.length, 28);
  assert.strictEqual(r.preview[0].rows[27].date, '2027-02-28');
});

test('闰年 2 月保留 29 号', function () {
  const r = normalizePreviewToMonth(preview(31), '2028-02');
  assert.strictEqual(r.dropped, 2);
  assert.strictEqual(r.preview[0].rows[28].date, '2028-02-29');
});

test('未选月份时原样返回', function () {
  const src = preview(5);
  const r = normalizePreviewToMonth(src, '');
  assert.strictEqual(r.rewritten, false);
  assert.strictEqual(r.dropped, 0);
  assert.strictEqual(r.preview, src);
});
