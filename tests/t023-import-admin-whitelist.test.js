// T-023 回归：管理员 openid 绑定在普通成员记录上时，仍可替成员导入（白名单优先）。
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { createState, loadWithMock } = require('./helpers/mock-cloud');

const ROOT = path.join(__dirname, '..');
const FN = path.join(ROOT, 'cloudfunctions', 'importShift', 'index.js');
const CFG = require(path.join(ROOT, 'cloudfunctions', 'importShift', 'config.json'));
const ADMIN = (CFG.ADMIN_OPENIDS || [])[0];

test('白名单管理员即使库内是 member，也能替测试成员导入', async function () {
  const state = createState();
  state.users = [
    { _id: 'u-admin-member', openid: ADMIN, name: '管理员绑定成员', role: 'member' },
    { _id: 'u-test', openid: '', name: '测试-甲', role: 'member' }
  ];
  state.openid = ADMIN;
  const main = loadWithMock(FN, state);
  const r = await main({
    commit: true,
    preview: [{ name: '测试-甲', rows: [{ date: '2024-01-05', shift: '正A' }] }]
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(state.shifts.length, 1);
  assert.strictEqual(state.shifts[0].userId, 'u-test');
  assert.strictEqual(state.shifts[0].shiftType, '正A');
});

test('普通成员仍不能替他人导入', async function () {
  const state = createState();
  state.openid = 'o-member-1';
  const main = loadWithMock(FN, state);
  const r = await main({
    commit: true,
    preview: [{ name: '乙', rows: [{ date: '2024-01-05', shift: '正A' }] }]
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /只能导入自己的排班/);
  assert.strictEqual(state.shifts.length, 0);
});
