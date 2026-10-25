// T-010 回归测试：分页全量、AI 配置校验、批量上限。
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { createState, loadWithMock, loadModuleWithMock } = require('./helpers/mock-cloud');

const ROOT = path.join(__dirname, '..');
const GET_FN = path.join(ROOT, 'cloudfunctions', 'getShifts', 'index.js');
const IMPORT_FN = path.join(ROOT, 'cloudfunctions', 'importShift', 'index.js');
const UPDATE_FN = path.join(ROOT, 'cloudfunctions', 'updateShift', 'index.js');

function setup(fn, openid) {
  const state = createState();
  state.openid = openid;
  return { state: state, main: loadWithMock(fn, state) };
}

function pad(n) { return n < 10 ? '0' + n : String(n); }

test('100 人 × 31 天 = 3100 条排班，getShifts 不截断', async function () {
  const ctx = setup(GET_FN, 'o-admin');
  // 补足到 100 名成员
  for (let i = ctx.state.users.length; i < 100; i++) {
    ctx.state.users.push({ _id: 'u' + (i + 1), openid: 'o-' + i, name: '成员' + i, role: 'member' });
  }
  for (const u of ctx.state.users) {
    for (let d = 1; d <= 31; d++) {
      ctx.state.shifts.push({ _id: u._id + '-' + d, userId: u._id, date: '2026-10-' + pad(d), shiftType: '休' });
    }
  }
  assert.strictEqual(ctx.state.shifts.length, 3100);
  const r = await ctx.main({ year: 2026, month: 10 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.members.length, 100);
  let total = 0;
  Object.keys(r.shiftsMap).forEach(function (n) { total += Object.keys(r.shiftsMap[n]).length; });
  assert.strictEqual(total, 3100);
  assert.strictEqual(Object.keys(r.shiftsMap['成员4']).length, 31);
});

test('视觉配置校验：缺 Key 或占位端点均为 false', function () {
  const mod = loadModuleWithMock(IMPORT_FN, createState());
  const check = mod._isVisionConfigured;
  assert.strictEqual(check('key', 'https://ark.example.com', 'model'), true);
  assert.strictEqual(check('', 'https://ark.example.com', 'model'), false);
  assert.strictEqual(check('key', 'https://your-endpoint', 'model'), false);
  assert.strictEqual(check('key', 'https://ark.example.com', ''), false);
});

test('一次改 63 天被拒绝，31 天通过', async function () {
  const ctx = setup(UPDATE_FN, 'o-member-1');
  const many = [];
  for (let d = 1; d <= 31; d++) many.push('2026-10-' + pad(d));
  for (let d = 1; d <= 30; d++) many.push('2026-11-' + pad(d));
  many.push('2026-12-01'); many.push('2026-12-02');
  assert.strictEqual(many.length, 63);
  const r = await ctx.main({ name: '甲', shift: '休', dates: many });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /62/);

  const ok = await ctx.main({ name: '甲', shift: '休', dates: many.slice(0, 31) });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.count, 31);
});

test('一次导入超过 100 位成员被拒绝', async function () {
  const ctx = setup(IMPORT_FN, 'o-admin');
  const preview = [];
  for (let i = 0; i < 101; i++) preview.push({ name: '成员' + i, rows: [{ date: '2026-10-01', shift: '休' }] });
  const r = await ctx.main({ commit: true, preview: preview });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /100/);
  assert.strictEqual(ctx.state.shifts.length, 0);
});
