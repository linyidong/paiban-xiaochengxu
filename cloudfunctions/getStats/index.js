// 云函数 getStats：管理员读取使用统计（累计用户/启动次数/近30天活跃/上线天数）
// 数据源：usageLogs（启动日志）+ users（最早成员时间）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const { ADMIN_OPENIDS } = require('./config.json');

function cleanOpenid(s) {
  return String(s || '').replace(/[^a-zA-Z0-9]/g, '');
}

async function checkAdmin(OPENID) {
  const cleanMe = cleanOpenid(OPENID);
  const admins = (ADMIN_OPENIDS || []).map(cleanOpenid);
  if (admins.indexOf(cleanMe) > -1) return true;
  const meRes = await db.collection('users').where({ openid: OPENID }).get();
  const me = meRes.data.filter(function (u) { return !u.isDeleted; })[0];
  return !!(me && me.role === 'admin');
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, msg: '未登录' };
  const isAdmin = await checkAdmin(OPENID);
  if (!isAdmin) return { ok: false, msg: '仅管理员可操作' };

  let launchCount = 0;
  let totalUsers = 0;
  let active30 = 0;
  let usageStart = 0;
  try {
    const cnt = await db.collection('usageLogs').count();
    launchCount = cnt.total || 0;
    const openids = {};
    const active = {};
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    const PAGE = 1000;
    const MAX = 20000;
    const total = Math.min(launchCount, MAX);
    for (let offset = 0; offset < total; offset += PAGE) {
      const r = await db.collection('usageLogs').orderBy('createdAt', 'asc').skip(offset).limit(PAGE).get();
      (r.data || []).forEach(function (d) {
        if (d.openid) openids[d.openid] = true;
        const t = new Date(d.createdAt).getTime();
        if (t && t >= cutoff && d.openid) active[d.openid] = true;
        if (t && (!usageStart || t < usageStart)) usageStart = t;
      });
    }
    totalUsers = Object.keys(openids).length;
    active30 = Object.keys(active).length;
  } catch (e) {
    // usageLogs 未创建：统计从 0 开始
  }

  // 上线天数：优先用最早成员记录（用户正式使用起点），没有则用最早启动日志
  let onlineDays = 0;
  let firstDate = '';
  try {
    const u = await db.collection('users').orderBy('createdAt', 'asc').limit(1).get();
    const first = (u.data || [])[0];
    const t = first && first.createdAt ? new Date(first.createdAt).getTime() : 0;
    if (t) { firstDate = new Date(t).toISOString().slice(0, 10); onlineDays = Math.max(1, Math.ceil((Date.now() - t) / 86400000)); }
  } catch (e) { /* ignore */ }
  if (!onlineDays && usageStart) {
    firstDate = new Date(usageStart).toISOString().slice(0, 10);
    onlineDays = Math.max(1, Math.ceil((Date.now() - usageStart) / 86400000));
  }

  return {
    ok: true,
    totalUsers: totalUsers,
    launchCount: launchCount,
    frequency: totalUsers ? Math.round((launchCount / totalUsers) * 10) / 10 : 0,
    active30: active30,
    onlineDays: onlineDays,
    firstDate: firstDate
  };
};
