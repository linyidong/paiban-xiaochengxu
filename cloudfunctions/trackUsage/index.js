// 云函数 trackUsage：记录小程序启动，用于“用户数/使用频次/最近30天活跃”统计。
// 只写聚合所需字段；openid 不返回给客户端，仅管理员统计时服务端聚合。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, msg: '未登录' };
  const now = new Date(Date.now() + 8 * 3600 * 1000); // 东八区日期串
  const day = now.toISOString().slice(0, 10);
  try {
    await db.collection('usageLogs').add({
      data: {
        openid: OPENID,
        event: event.event || 'launch',
        day: day,
        version: event.version || '',
        createdAt: db.serverDate()
      }
    });
  } catch (e) {
    return { ok: false, msg: String(e && e.message || e) };
  }
  return { ok: true };
};
