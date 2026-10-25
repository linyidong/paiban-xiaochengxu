// T-017 回归测试：批量按钮与 31 号列对齐、浅蓝底、选中态对比度。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'calendar', 'calendar.wxss'), 'utf8');

function block(selector) {
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

test('批量按钮与 31 号格同宽（14.28%）并右对齐', function () {
  const b = block('.multi-btn');
  assert.match(b, /width:\s*14\.28%/);
  assert.match(b, /margin:\s*16rpx 0 0 auto/);
});

test('批量按钮浅蓝底 + 深蓝字', function () {
  const b = block('.multi-btn');
  assert.match(b, /background:\s*var\(--color-blue-tint\)/);
  assert.match(b, /color:\s*var\(--color-blue-text\)/);
});

test('成员标签与当前成员区域使用浅蓝底', function () {
  assert.match(block('.member-item'), /background:\s*var\(--color-blue-tint\)/);
  assert.match(block('.member-current'), /background:\s*var\(--color-blue-tint\)/);
});

test('选中态仍可区分（更深浅蓝 + 主色描边）', function () {
  const b = block('.member-item.active');
  assert.match(b, /background:\s*var\(--color-blue-tint-strong\)/);
  assert.match(b, /border-color:\s*var\(--color-blue\)/);
});

test('浅蓝组合对比度 ≥4.5:1', function () {
  assert.ok(ratio('#1E40AF', '#EFF6FF') >= 4.5);
  assert.ok(ratio('#1E3A8A', '#DBEAFE') >= 4.5);
  assert.ok(ratio('#FFFFFF', '#1D4ED8') >= 4.5);
});
