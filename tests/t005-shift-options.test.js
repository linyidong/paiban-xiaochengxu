// T-005 回归测试：统一班次选项（含取消）与“取消”清空语义。
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { createState, loadWithMock } = require('./helpers/mock-cloud');

const ROOT = path.join(__dirname, '..');
const shiftUtil = require(path.join(ROOT, 'miniprogram', 'utils', 'shift.js'));
const IMPORT_FN = path.join(ROOT, 'cloudfunctions', 'importShift', 'index.js');

function setup(openid) {
  const state = createState();
  state.openid = openid;
  return { state: state, main: loadWithMock(IMPORT_FN, state) };
}

test('4 状态 = 休/白班/晚班/年假 + 取消，共 5 项', function () {
  const types = shiftUtil.getShiftOptions('basic').map(function (o) { return o.type; });
  assert.deepStrictEqual(types, ['休', '白班', '晚班', '年假', '取消']);
});

test('6 状态 = 休/正A/正B/售A/售B/年假 + 取消，共 7 项', function () {
  const types = shiftUtil.getShiftOptions('special').map(function (o) { return o.type; });
  assert.deepStrictEqual(types, ['休', '正A', '正B', '售A', '售B', '年假', '取消']);
});

test('默认模式：管理员 4 状态，成员出现非基础班次则 6 状态', function () {
  assert.strictEqual(shiftUtil.detectShiftMode(['休', '正A'], false), 'special');
  assert.strictEqual(shiftUtil.detectShiftMode(['休', 'A'], false), 'special');
  assert.strictEqual(shiftUtil.detectShiftMode(['休', '白班', '晚班'], false), 'basic');
  assert.strictEqual(shiftUtil.detectShiftMode(['休', '正A'], true), 'basic');
});

test('6 状态可追加成员历史班次；4 状态严格 4 项；管理员不追加', function () {
  const member = shiftUtil.getShiftOptions('special', ['正', '售后'], true).map(function (o) { return o.type; });
  assert.ok(member.includes('正'));
  assert.ok(member.includes('售后'));
  const basic = shiftUtil.getShiftOptions('basic', ['正', '售后'], true).map(function (o) { return o.type; });
  assert.deepStrictEqual(basic, ['休', '白班', '晚班', '年假', '取消']);
  const admin = shiftUtil.getShiftOptions('special', ['正', '售后'], false).map(function (o) { return o.type; });
  assert.strictEqual(admin.includes('正'), false);
  assert.strictEqual(admin.includes('售后'), false);
});

test('班次列表不再包含 IEB', function () {
  assert.strictEqual(shiftUtil.SHIFT_TYPES.includes('IEB'), false);
  ['basic', 'special'].forEach(function (mode) {
    assert.strictEqual(shiftUtil.getShiftOptions(mode).some(function (o) { return o.type === 'IEB'; }), false);
  });
});

test('取消有独立颜色且不为灰兜底以外的空值', function () {
  assert.strictEqual(shiftUtil.getShiftColor('取消'), shiftUtil.SHIFT_COLOR['取消']);
  assert.strictEqual(shiftUtil.getShiftColor('不存在的班次'), '#9CA3AF');
});

test('预览全部标记“取消”时清空该月旧记录，不写入取消', async function () {
  const ctx = setup('o-member-1');
  ctx.state.shifts.push({ _id: 's1', userId: 'u1', date: '2026-10-01', shiftType: '休' });
  const r = await ctx.main({
    commit: true,
    preview: [{ name: '甲', rows: [
      { date: '2026-10-01', shift: '取消' },
      { date: '2026-10-02', shift: '取消' }
    ] }]
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.added, 0);
  assert.strictEqual(r.updated, 0);
  assert.strictEqual(r.removed, 1);
  assert.strictEqual(ctx.state.shifts.length, 0);
  assert.strictEqual(ctx.state.shifts.some(function (s) { return s.shiftType === '取消'; }), false);
});

test('部分取消 + 部分班次：取消日删除、班次日更新', async function () {
  const ctx = setup('o-member-1');
  ctx.state.shifts.push(
    { _id: 's1', userId: 'u1', date: '2026-10-01', shiftType: '休' },
    { _id: 's2', userId: 'u1', date: '2026-10-02', shiftType: '休' }
  );
  const r = await ctx.main({
    commit: true,
    preview: [{ name: '甲', rows: [
      { date: '2026-10-01', shift: '取消' },
      { date: '2026-10-02', shift: '正A' }
    ] }]
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.removed, 1);
  assert.strictEqual(r.updated, 1);
  assert.strictEqual(ctx.state.shifts.length, 1);
  assert.strictEqual(ctx.state.shifts[0].date, '2026-10-02');
  assert.strictEqual(ctx.state.shifts[0].shiftType, '正A');
});
