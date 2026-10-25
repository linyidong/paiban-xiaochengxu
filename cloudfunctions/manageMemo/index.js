// 云函数 manageMemo：个人备忘录 add / update / remove / list
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, msg: '未登录' };

  const { action } = event;

  if (action === 'list') {
    console.log('[manageMemo] list, openid=' + OPENID);
    const res = await db.collection('memos')
      .where({ openid: OPENID })
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();
    console.log('[manageMemo] list result: ' + res.data.length + ' memos for openid=' + OPENID);
    return {
      ok: true,
      memos: res.data.map(function (m) {
        const d = m.createdAt || {};
        const dateStr = d.$date ? new Date(d.$date).toLocaleString('zh-CN') : '';
        return { _id: m._id, text: m.text, createdAtStr: dateStr };
      })
    };
  }

  if (action === 'add') {
    const text = (event.text || '').trim();
    if (!text) return { ok: false, msg: '内容为空' };
    console.log('[manageMemo] add, openid=' + OPENID + ', text=' + text);
    await db.collection('memos').add({
      data: { openid: OPENID, text: text, createdAt: db.serverDate() }
    });
    return { ok: true };
  }

  if (action === 'update') {
    const id = event.id;
    const text = (event.text || '').trim();
    if (!id) return { ok: false, msg: '缺少id' };
    if (!text) return { ok: false, msg: '内容为空' };
    // 只能修改自己的备忘录
    const target = await db.collection('memos').doc(id).get().catch(function () { return { data: null }; });
    if (!target.data) return { ok: false, msg: '备忘录不存在' };
    if (target.data.openid !== OPENID) return { ok: false, msg: '无权限修改' };
    await db.collection('memos').doc(id).update({ data: { text: text } });
    return { ok: true };
  }

  if (action === 'remove') {
    const id = event.id;
    if (!id) return { ok: false, msg: '缺少id' };
    // 只能删除自己的备忘录
    const target = await db.collection('memos').doc(id).get().catch(function () { return { data: null }; });
    if (!target.data) return { ok: false, msg: '备忘录不存在' };
    if (target.data.openid !== OPENID) return { ok: false, msg: '无权限删除' };
    await db.collection('memos').doc(id).remove();
    return { ok: true };
  }

  return { ok: false, msg: '未知操作' };
};
