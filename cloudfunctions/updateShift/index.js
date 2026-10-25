// 云函数 updateShift：修改排班（成员仅本人，管理员可改全部）+ 写 changeLog
// 权限：调用者 = 目标成员本人，或命中管理员白名单 / users.role === 'admin'
// 入参保持不变：{ name, shift, dates[] | date }；shift 为空表示清空该日排班
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ⚠️ 人工参数来源：本目录 config.json（由根目录《人工必填参数清单.json》同步），勿手改
const { ADMIN_OPENIDS } = require('./config.json');

const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// 校验 YYYY-MM-DD 是否存在（含闰年 2 月 29 日）
function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const parts = s.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (m < 1 || m > 12 || d < 1) return false;
  const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const max = m === 2 && isLeap ? 29 : DAYS_IN_MONTH[m];
  return d <= max;
}

// openid 清洗：与 login/manageMember 保持同一规则（去不可见字符）
function cleanOpenid(s) {
  return String(s || '').replace(/[^a-zA-Z0-9]/g, '');
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { name, shift, dates } = event;
  if (!OPENID) return { ok: false, msg: '未登录' };

  // 兼容单日期与多日期；去重，避免同一日期重复写入
  const rawList = Array.isArray(dates) && dates.length ? dates : (event.date ? [event.date] : []);
  const dateList = [];
  rawList.forEach(function (d) { if (dateList.indexOf(d) === -1) dateList.push(d); });
  if (!name || !dateList.length) return { ok: false, msg: '参数不完整' };
  if (dateList.length > 62) return { ok: false, msg: '一次最多设置 62 天' };

  // 先整体校验日期：只要有一个非法就整批拒绝，避免部分写入
  const badDates = dateList.filter(function (d) { return !isValidDate(d); });
  if (badDates.length) {
    return { ok: false, msg: '日期不合法：' + badDates.slice(0, 3).join('、') };
  }

  const meRes = await db.collection('users').where({ openid: OPENID }).get();
  const meActive = meRes.data.filter(function (u) { return !u.isDeleted; });
  if (!meActive.length) return { ok: false, msg: '用户不存在或已被移除，请先登录' };
  const me = meActive[0];

  const targetRes = await db.collection('users').where({ name: name }).get();
  const targetActive = targetRes.data.filter(function (u) { return !u.isDeleted; });
  if (!targetActive.length) return { ok: false, msg: '目标成员不存在或已删除' };
  if (targetActive.length > 1) return { ok: false, msg: '成员姓名重复，请联系管理员处理' };
  const target = targetActive[0];

  // 权限：本人，或管理员（白名单优先，兼容库内 role）
  const cleanMe = cleanOpenid(OPENID);
  const adminList = (ADMIN_OPENIDS || []).map(cleanOpenid);
  const isAdmin = adminList.indexOf(cleanMe) > -1 || me.role === 'admin';
  if (!isAdmin && target._id !== me._id) {
    return { ok: false, msg: '只能修改自己的排班' };
  }

  // 覆盖式写入（upsert）；shift 为空时删除记录（取消排班）
  let count = 0;
  for (const d of dateList) {
    const exist = await db.collection('shifts').where({ userId: target._id, date: d }).get();
    const oldShift = exist.data.length ? exist.data[0].shiftType : '';
    if (!shift) {
      if (exist.data.length) {
        await db.collection('shifts').doc(exist.data[0]._id).remove();
      }
    } else if (exist.data.length) {
      await db.collection('shifts').doc(exist.data[0]._id).update({
        data: { shiftType: shift, updatedBy: me._id, updatedAt: db.serverDate() }
      });
    } else {
      await db.collection('shifts').add({
        data: { userId: target._id, date: d, shiftType: shift, updatedBy: me._id, updatedAt: db.serverDate() }
      });
    }
    // 修改日志（追溯）；日志失败不影响排班更新（changeLog 集合未创建时自动容错）
    try {
      await db.collection('changeLog').add({
        data: {
          userId: target._id, date: d, oldShift: oldShift, newShift: shift || '',
          operator: me._id, time: db.serverDate()
        }
      });
    } catch (e) { /* 日志失败忽略，不影响排班保存 */ }
    count += 1;
  }
  return { ok: true, count: count };
};
