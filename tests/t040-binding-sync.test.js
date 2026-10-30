// T-040 绑定唯一性与管理员/成员同步：
// - 绑定页只返回未绑定成员（自己的记录除外）；
// - 管理员导入的成员被绑定后，成员改班管理员能看到同一 userId 的最新值。
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { createState, loadWithMock } = require('./helpers/mock-cloud');

const ROOT = path.join(__dirname, '..');
const MANAGE = path.join(ROOT, 'cloudfunctions', 'manageMember', 'index.js');
const IMPORT = path.join(ROOT, 'cloudfunctions', 'importShift', 'index.js');
const UPDATE = path.join(ROOT, 'cloudfunctions', 'updateShift', 'index.js');
const GET = path.join(ROOT, 'cloudfunctions', 'getShifts', 'index.js');

test('绑定页只列未绑定成员，自己的记录仍返回', async function () {
  const state = createState();
  state.users.push({ _id: 'u4', openid: '', name: '丙', role: 'member' });
  state.openid = 'o-member-1'; // 自己的 u1 已绑定
  const list = loadWithMock(MANAGE, state);
  const r = await list({ action: 'list', bindable: true });
  const names = r.members.map(function (m) { return m.name; });
  assert.ok(names.includes('甲')); // 自己
  assert.ok(names.includes('丙')); // 未绑定
  assert.strictEqual(names.includes('乙'), false); // 别人已绑定
});

test('同一成员只能被一个微信绑定', async function () {
  const state = createState();
  state.users.push({ _id: 'u4', openid: '', name: '丙', role: 'member' });
  state.openid = 'o-new-1';
  let main = loadWithMock(MANAGE, state);
  assert.strictEqual((await main({ action: 'bindWechat', name: '丙' })).ok, true);
  state.openid = 'o-new-2';
  main = loadWithMock(MANAGE, state);
  const r = await main({ action: 'bindWechat', name: '丙' });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /已被其他用户绑定/);
});

test('管理员导入 -> 成员绑定 -> 成员改班 -> 管理员看到同步', async function () {
  const state = createState();
  state.openid = 'o-admin';
  const importMain = loadWithMock(IMPORT, state);
  const imported = await importMain({
    commit: true, year: 2026, month: 11,
    preview: [{ name: '丙', rows: [{ date: '2026-11-01', shift: '正A' }] }]
  });
  assert.strictEqual(imported.ok, true);
  const importedUser = state.users.find(function (u) { return u.name === '丙'; });
  assert.ok(importedUser);
  assert.strictEqual(importedUser.openid, '');

  state.openid = 'o-member-new';
  const manage = loadWithMock(MANAGE, state);
  const bound = await manage({ action: 'bindWechat', name: '丙' });
  assert.strictEqual(bound.ok, true);
  assert.strictEqual(importedUser.openid, 'o-member-new');

  const update = loadWithMock(UPDATE, state);
  const changed = await update({ name: '丙', shift: '休', dates: ['2026-11-01'] });
  assert.strictEqual(changed.ok, true);

  state.openid = 'o-admin';
  const get = loadWithMock(GET, state);
  const res = await get({ year: 2026, month: 11 });
  assert.strictEqual(res.shiftsMap['丙']['2026-11-01'], '休');
  const rows = state.shifts.filter(function (s) { return s.userId === importedUser._id; });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].shiftType, '休');
});
