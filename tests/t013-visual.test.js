// T-013 回归测试：日历页/组件 WXSS 旧色值清零、批量按钮不再绝对定位、当前月对比度规则存在。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const pageCss = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'calendar', 'calendar.wxss'), 'utf8');
const compCss = fs.readFileSync(path.join(ROOT, 'miniprogram', 'components', 'calendar', 'calendar.wxss'), 'utf8');
const all = pageCss + '\n' + compCss;

test('旧色值在日历页/组件中出现 0 次', function () {
  ['#3B82F6', '#F7F8FA', '#1F2937', '#9CA3AF', '#6B7280', '#EF4444'].forEach(function (c) {
    assert.strictEqual(all.toUpperCase().includes(c.toUpperCase()), false, c + ' 仍存在');
  });
});

test('批量按钮在日期网格内且不使用绝对定位', function () {
  assert.strictEqual(/\.multi-btn\s*\{/.test(pageCss), false);
  const m = compCss.match(/\.batch-btn\s*\{[^}]*\}/);
  assert.ok(m, 'batch-btn 规则存在');
  assert.strictEqual(/position\s*:\s*absolute/.test(m[0]), false);
});

test('当前月 + 有数据的对比度覆盖规则存在', function () {
  assert.ok(/\.month-cell\.current\.has-data\s*\{/.test(pageCss));
  const m = pageCss.match(/\.month-cell\.current\.has-data\s*\{[^}]*\}/);
  assert.match(m[0], /background:\s*var\(--color-primary\)/);
  assert.match(m[0], /color:\s*#FFFFFF/);
});

test('图例支持换行，避免 12 项溢出', function () {
  const m = pageCss.match(/\.legend-row\s*\{[^}]*\}/);
  assert.ok(m);
  assert.match(m[0], /flex-wrap:\s*wrap/);
});
