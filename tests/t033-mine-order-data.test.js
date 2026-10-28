// T-033 我的页顺序：添加备忘录 → 成员管理 → 技术栈 → 设置 → 数据；数据页存在且管理员限定。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'mine', 'mine.wxml'), 'utf8');
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'miniprogram', 'app.json'), 'utf8'));
const dataJs = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'data', 'data.js'), 'utf8');

test('我的页入口顺序正确', function () {
  const order = ['添加备忘录', '成员管理', '技术栈', '设置', '数据'];
  let last = -1;
  order.forEach(function (label) {
    const i = wxml.indexOf(label);
    assert.ok(i > last, label + ' 顺序正确');
    last = i;
  });
});

test('每个入口独立卡片（不再堆在同一卡片）', function () {
  const memoCard = wxml.indexOf('bindtap="goMemo"');
  const membersCard = wxml.indexOf('bindtap="goMembers"');
  assert.ok(memoCard > -1 && membersCard > memoCard);
  // 两个入口之间应出现新的 card 容器
  const between = wxml.slice(memoCard, membersCard);
  assert.ok(between.includes('class="card"'));
});

test('app.json 注册数据页，数据页仅管理员', function () {
  assert.ok(app.pages.includes('pages/data/data'));
  assert.ok(dataJs.includes("session.role !== 'admin'"));
});
