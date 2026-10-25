// 云函数 updateShift：修改排班（所有登录用户均可）+ 写 changeLog
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { name, shift, dates } = event;
  if (!OPENID) return { ok: false, msg: '未登录' };
  const dateList = Array.isArray(dates) && dates.length ? dates : (event.date ? [event.date] : []);
  if (!name || !dateList.length) return { ok: false, msg: '参数不完整' };

  const meRes = await db.collection('users').where({ openid: OPENID }).get();
  if (!meRes.data.length) return { ok: false, msg: '用户不存在，请先登录' };
  const me = meRes.data[0];

  const targetRes = await db.collection('users').where({ name: name }).get();
  if (!targetRes.data.length) return { ok: false, msg: '目标成员不存在' };
  const target = targetRes.data[0];

  // 所有登录用户均可修改排班（权限由前端控制入口，后端仅校验登录态）

  // 覆盖式写入（upsert，支持单日期/多日期批量）；shift 为空时删除记录（即"取消"排班）
  let count = 0;
  for (const d of dateList) {
    const exist = await db.collection('shifts').where({ userId: target._id, date: d }).get();
    const oldShift = exist.data.length ? exist.data[0].shiftType : '';
    if (!shift) {
      // 取消排班：有记录则删除，无记录则跳过
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
          userId: target._id, date: d, oldShift: oldShift, newShift: shift,
          operator: me._id, time: db.serverDate()
        }
      });
    } catch (e) { /* 日志失败忽略，不影响排班保存 */ }
    count += 1;
  }
  return { ok: true, count: count };
};
