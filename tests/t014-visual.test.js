// T-014 回归测试：导入/登录页 WXSS 旧色值清零、token 使用、触控目标。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const files = [
  path.join(ROOT, 'miniprogram', 'pages', 'import', 'import.wxss'),
  path.join(ROOT, 'miniprogram', 'pages', 'login', 'login.wxss')
];
const all = files.map(function (f) { return fs.readFileSync(f, 'utf8'); }).join('\n');

test('旧色值在导入/登录页出现 0 次', function () {
  ['#3B82F6', '#F7F8FA', '#1F2937', '#9CA3AF', '#6B7280', '#EF4444', '#F59E0B', '#EFF6FF', '#F3F4F6', '#E5E7EB'].forEach(function (c) {
    assert.strictEqual(all.toUpperCase().includes(c.toUpperCase()), false, c + ' 仍存在');
  });
});

test('提示文字使用 warning token（对比度 ≥4.5）', function () {
  const m = all.match(/\.preview-tip\s*\{[^}]*\}/);
  assert.ok(m);
  assert.match(m[0], /var\(--color-warning\)/);
});

test('选中项使用主色 token', function () {
  const m = all.match(/\.bind-item\.active\s*\{[^}]*\}/);
  assert.ok(m);
  assert.match(m[0], /var\(--color-primary\)/);
});

test('关键控件触控目标 ≥88rpx（至少 5 处）', function () {
  const n = (all.match(/min-height:\s*88rpx/g) || []).length;
  assert.ok(n >= 5, '实际 ' + n);
});

test('不存在小于 24rpx 的字号', function () {
  const sizes = [];
  const re = /font-size:\s*(\d+)rpx/g;
  let m;
  while ((m = re.exec(all))) sizes.push(Number(m[1]));
  assert.ok(sizes.length > 0);
  assert.strictEqual(Math.min.apply(null, sizes) >= 24, true, '最小 ' + Math.min.apply(null, sizes));
});
