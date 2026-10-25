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

test('班次选项 = 11 种配置班次 + 取消，共 12 项', function () {
  const opts = shiftUtil.getShiftOptions();
  assert.strictEqual(opts.length, 12);
  assert.strictEqual(opts[11].type, '取消');
  assert.deepStrictEqual(opts.slice(0, 11).map(function (o) { return o.type; }), shiftUtil.SHIFT_TYPES);
});

test('班次选项不再包含旧的白班/晚班', function () {
  const types = shiftUtil.getShiftOptions().map(function (o) { return o.type; });
  assert.strictEqual(types.includes('白班'), false);
  assert.strictEqual(types.includes('晚班'), false);
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
