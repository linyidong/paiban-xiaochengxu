// T-011 回归测试：成员选择工具（过滤管理员、默认成员）。
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const util = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'member.js'));

const members = [
  { name: '管理员', role: 'admin' },
  { name: '甲', role: 'member' },
  { name: '乙', role: 'member' }
];

test('selectableMembers 过滤管理员记录', function () {
  const list = util.selectableMembers(members);
  assert.strictEqual(list.length, 2);
  assert.deepStrictEqual(list.map(function (m) { return m.name; }), ['甲', '乙']);
});

test('管理员首选“管理员”时回退到第一个真实成员', function () {
  assert.strictEqual(util.pickDefaultMember(members, '管理员'), '甲');
});

test('优先保留当前选中成员', function () {
  assert.strictEqual(util.pickDefaultMember(members, '乙'), '乙');
});

test('没有成员时返回空字符串', function () {
  assert.strictEqual(util.pickDefaultMember([], '甲'), '');
  assert.strictEqual(util.pickDefaultMember([{ name: '管理员', role: 'admin' }], '管理员'), '');
});

test('pickMember 允许选中管理员，默认仍取真实成员', function () {
  assert.strictEqual(util.pickMember(members, '管理员'), '管理员');
  assert.strictEqual(util.pickMember(members, ''), '甲');
  assert.strictEqual(util.pickMember(members, '不存在'), '甲');
});
