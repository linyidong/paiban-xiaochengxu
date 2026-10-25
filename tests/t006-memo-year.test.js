// T-006 回归测试：备忘录年份解析、旧数据回退、时间格式化。
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { createState, loadWithMock } = require('./helpers/mock-cloud');

const FN = path.join(__dirname, '..', 'cloudfunctions', 'manageMemo', 'index.js');

function setup(openid) {
  const state = createState();
  state.openid = openid;
  return { state: state, main: loadWithMock(FN, state) };
}

test('文本含“2025年”时 year=2025', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({ action: 'add', text: '2025年12月1号 值班' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.year, 2025);
  assert.strictEqual(ctx.state.memos[0].year, 2025);
});

test('文本不含年份时使用当前年', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.main({ action: 'add', text: '10月1号 国庆' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.year, new Date().getFullYear());
});

test('修改文本时重新计算年份', async function () {
  const ctx = setup('o-member-1');
  await ctx.main({ action: 'add', text: '2025年12月1号 值班' });
  const id = ctx.state.memos[0]._id;
  const r = await ctx.main({ action: 'update', id: id, text: '2027年1月1号 换班' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(ctx.state.memos[0].year, 2027);
});

test('旧数据无 year 字段时回退 createdAt 年份', async function () {
  const ctx = setup('o-member-1');
  ctx.state.memos.push({
    _id: 'm1',
    openid: 'o-member-1',
    text: '6月1号 旧备忘',
    createdAt: new Date(2024, 5, 1, 9, 5)
  });
  const r = await ctx.main({ action: 'list' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.memos[0].year, 2024);
});

test('createdAtStr 非空且格式为 YYYY-MM-DD HH:mm', async function () {
  const ctx = setup('o-member-1');
  ctx.state.memos.push({
    _id: 'm2',
    openid: 'o-member-1',
    text: '6月1号 旧备忘',
    createdAt: new Date(2024, 5, 1, 9, 5)
  });
  const r = await ctx.main({ action: 'list' });
  assert.strictEqual(r.memos[0].createdAtStr, '2024-06-01 09:05');
});

test('只能修改自己的备忘录', async function () {
  const ctx = setup('o-member-1');
  ctx.state.memos.push({ _id: 'm3', openid: 'other', text: '10月1号 别人的', year: 2026, createdAt: new Date() });
  const r = await ctx.main({ action: 'update', id: 'm3', text: '2026年10月2号 改' });
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /无权限/);
});
