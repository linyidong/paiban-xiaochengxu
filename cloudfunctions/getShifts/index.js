// 云函数 getShifts：查询排班（全员可读）+ 成员列表
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, msg: '未登录' };
  const { year, month, monthOnly, yearData } = event;

  const usersRes = await db.collection('users').limit(100).get();
  // 软删除的成员不进入成员列表与排班映射（旧数据无 isDeleted 字段视为未删除）
  const activeUsers = usersRes.data.filter(function (u) { return !u.isDeleted; });
  const members = activeUsers.map(function (u) { return { _id: u._id, name: u.name, role: u.role }; });

  if (monthOnly) return { ok: true, members: members };

  // yearData: 返回该年每个月是否有数据（用于月份选择器高亮）
  if (yearData && year) {
    const start = year + '-01-01';
    const end = year + '-12-31';
    const shiftRes = await db.collection('shifts')
      .where({ date: _.gte(start).and(_.lte(end)) })
      .limit(2000)
      .get();
    const idToName = {};
    activeUsers.forEach(function (u) { idToName[u._id] = u.name; });
    // 按成员 → 月份 聚合（跳过已删除成员的排班）
    const memberMonths = {};
    shiftRes.data.forEach(function (s) {
      const n = idToName[s.userId];
      if (!n) return;
      const m = parseInt(s.date.split('-')[1], 10);
      if (!memberMonths[n]) memberMonths[n] = [];
      if (memberMonths[n].indexOf(m) === -1) memberMonths[n].push(m);
    });
    return { ok: true, members: members, memberMonths: memberMonths };
  }

  // 校验月份参数
  if (!year || !month) return { ok: false, msg: '缺少月份参数' };
  const m = String(month).padStart(2, '0');
  const start = year + '-' + m + '-01';
  const end = year + '-' + m + '-31';
  const shiftRes = await db.collection('shifts')
    .where({ date: _.gte(start).and(_.lte(end)) })
    .limit(1000)
    .get();

  const idToName = {};
  activeUsers.forEach(function (u) { idToName[u._id] = u.name; });
  const shiftsMap = {};
  shiftRes.data.forEach(function (s) {
    const n = idToName[s.userId];
    if (!n) return;
    if (!shiftsMap[n]) shiftsMap[n] = {};
    shiftsMap[n][s.date] = s.shiftType;
  });
  return { ok: true, members: members, shiftsMap: shiftsMap };
};
