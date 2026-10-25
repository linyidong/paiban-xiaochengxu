// T-015 回归测试：我的/备忘录/成员页旧色值清零、统计色用类名、触控目标。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const cssFiles = [
  path.join(ROOT, 'miniprogram', 'pages', 'mine', 'mine.wxss'),
  path.join(ROOT, 'miniprogram', 'pages', 'memo', 'memo.wxss'),
  path.join(ROOT, 'miniprogram', 'pages', 'members', 'members.wxss')
];
const all = cssFiles.map(function (f) { return fs.readFileSync(f, 'utf8'); }).join('\n')
  + fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'mine', 'mine.wxml'), 'utf8');

test('旧色值在三页中出现 0 次', function () {
  ['#3B82F6', '#6B7280', '#EF4444', '#9CA3AF', '#F59E0B', '#16A34A', '#111827'].forEach(function (c) {
    assert.strictEqual(all.toUpperCase().includes(c.toUpperCase()), false, c + ' 仍存在');
  });
});

test('我的页统计数字使用类名而非内联颜色', function () {
  assert.ok(/stat-num shu/.test(all));
  assert.ok(/stat-num bai/.test(all));
  assert.ok(/stat-num wan/.test(all));
  assert.strictEqual(/style="color:/.test(all), false);
});

test('关键操作触控目标 ≥88rpx（至少 5 处）', function () {
  const n = (all.match(/min-height:\s*88rpx/g) || []).length;
  assert.ok(n >= 5, '实际 ' + n);
});

test('最小字号 ≥24rpx', function () {
  const sizes = [];
  const re = /font-size:\s*(\d+)rpx/g;
  let m;
  while ((m = re.exec(all))) sizes.push(Number(m[1]));
  assert.ok(sizes.length > 0);
  assert.strictEqual(Math.min.apply(null, sizes) >= 24, true, '最小 ' + Math.min.apply(null, sizes));
});
