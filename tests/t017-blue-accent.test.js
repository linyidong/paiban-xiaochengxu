// T-017/T-018 回归测试：批量按钮进入日历最后一排、成员浅蓝无边框。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const pageCss = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'calendar', 'calendar.wxss'), 'utf8');
const compCss = fs.readFileSync(path.join(ROOT, 'miniprogram', 'components', 'calendar', 'calendar.wxss'), 'utf8');
const cal = require(path.join(ROOT, 'miniprogram', 'utils', 'calendar.js'));

function block(css, selector) {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*\\}');
  const m = css.match(re);
  assert.ok(m, selector + ' 规则存在');
  return m[0];
}

function lum(hex) {
  const c = hex.replace('#', '').match(/../g).map(function (x) { return parseInt(x, 16) / 255; })
    .map(function (v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const l1 = lum(a), l2 = lum(b);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

test('批量按钮已进入日期网格（组件内），页面不再有独立 multi-btn', function () {
  assert.strictEqual(pageCss.includes('.multi-btn'), false);
  const b = block(compCss, '.batch-btn');
  assert.match(b, /background:\s*#EAF2FF/i);
  assert.match(b, /color:\s*#1E40AF/i);
});

test('withBatchCell 把批量放在最后一天右侧一格', function () {
  const cells = [];
  for (let d = 1; d <= 31; d++) cells.push({ day: d, fullDate: '2026-10-' + (d < 10 ? '0' + d : d), inMonth: true });
  const out = cal.withBatchCell(cells, '批量', false);
  assert.strictEqual(out.length, 32);
  assert.strictEqual(out[31].isBatch, true);
  assert.strictEqual(out[31].batchLabel, '批量');
  assert.strictEqual(out[30].day, 31);
});

test('最后一天是周日时批量紧随其后（下一排第一格）', function () {
  const cells = [];
  for (let d = 1; d <= 30; d++) cells.push({ day: d, fullDate: 'x', inMonth: true });
  const out = cal.withBatchCell(cells, '完成', true);
  assert.strictEqual(out.length, 31);
  assert.strictEqual(out[30].isBatch, true);
  assert.strictEqual(out[30].batchOn, true);
});

test('成员标签/当前成员只有浅蓝底，没有边框', function () {
  assert.strictEqual(/border\s*:/.test(block(pageCss, '.member-item')), false);
  assert.strictEqual(/border-color\s*:/.test(block(pageCss, '.member-item.active')), false);
  assert.strictEqual(/border\s*:/.test(block(pageCss, '.member-current')), false);
});

test('浅蓝组合对比度 ≥4.5:1', function () {
  assert.ok(ratio('#1E40AF', '#EAF2FF') >= 4.5);
  assert.ok(ratio('#1E3A8A', '#DBEAFE') >= 4.5);
  assert.ok(ratio('#FFFFFF', '#1D4ED8') >= 4.5);
});
