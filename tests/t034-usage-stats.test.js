// T-034 使用统计：启动埋点、累计用户、使用频次、最近30天活跃、上线天数。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createState, loadWithMock } = require('./helpers/mock-cloud');

const ROOT = path.join(__dirname, '..');
const TRACK = path.join(ROOT, 'cloudfunctions', 'trackUsage', 'index.js');
const STATS = path.join(ROOT, 'cloudfunctions', 'getStats', 'index.js');

function setup(openid) {
  const state = createState();
  state.openid = openid;
  return { state: state, track: loadWithMock(TRACK, state), stats: loadWithMock(STATS, state) };
}

test('启动埋点写入 usageLogs', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.track({ event: 'launch' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(ctx.state.usageLogs.length, 1);
  assert.strictEqual(ctx.state.usageLogs[0].openid, 'o-member-1');
});

test('管理员统计累计用户/启动次数/近30天活跃/上线天数', async function () {
  const ctx = setup('o-admin');
  const now = new Date();
  const old = new Date(Date.now() - 40 * 86400000);
  ctx.state.usageLogs = [
    { openid: 'o-a', createdAt: now },
    { openid: 'o-a', createdAt: now },
    { openid: 'o-b', createdAt: old }
  ];
  ctx.state.users = ctx.state.users.map(function (u) {
    if (u._id === 'u1') u.createdAt = new Date(Date.now() - 10 * 86400000);
    return u;
  });
  const r = await ctx.stats({});
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.totalUsers, 2);
  assert.strictEqual(r.launchCount, 3);
  assert.strictEqual(r.active30, 1);
  assert.ok(r.onlineDays >= 10 && r.onlineDays <= 11, 'onlineDays 约 10 天');
});

test('非管理员不能读取统计', async function () {
  const ctx = setup('o-member-1');
  const r = await ctx.stats({});
  assert.strictEqual(r.ok, false);
});

test('app.js 启动时调用 trackUsage，数据页调用 getStats', function () {
  const app = fs.readFileSync(path.join(ROOT, 'miniprogram', 'app.js'), 'utf8');
  const data = fs.readFileSync(path.join(ROOT, 'miniprogram', 'pages', 'data', 'data.js'), 'utf8');
  assert.ok(app.includes("name: 'trackUsage'"));
  assert.ok(data.includes("name: 'getStats'"));
});
