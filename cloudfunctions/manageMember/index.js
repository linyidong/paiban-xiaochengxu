// 云函数 manageMember：成员管理（仅管理员）add / remove / list
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ⚠️ 人工参数来源：本目录 config.json（由根目录《人工必填参数清单.json》同步），勿手改
const { ADMIN_OPENIDS } = require('./config.json');

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, msg: '未登录' };
  const cleanOpenid = OPENID.replace(/[^a-zA-Z0-9]/g, '');
  const cleanAdmins = ADMIN_OPENIDS.map(function (s) { return String(s || '').replace(/[^a-zA-Z0-9]/g, ''); });
  let isAdmin = cleanAdmins.includes(cleanOpenid);
  if (!isAdmin) {
    const meRes = await db.collection('users').where({ openid: OPENID }).get();
    if (meRes.data.length && meRes.data[0].role === 'admin') isAdmin = true;
  }
  if (!isAdmin) return { ok: false, msg: '仅管理员可操作' };

  const { action } = event;
  if (action === 'list') {
    const res = await db.collection('users').orderBy('createdAt', 'asc').limit(100).get();
    return {
      ok: true,
      members: res.data.map(function (u) {
        return { _id: u._id, name: u.name, wxId: u.wxId || '', role: u.role, openid: u.openid || '', createdAt: u.createdAt };
      })
    };
  }
  if (action === 'add') {
    const name = (event.name || '').trim();
    if (!name) return { ok: false, msg: '缺少姓名' };
    const dup = await db.collection('users').where({ name: name }).get();
    if (dup.data.length) return { ok: false, msg: '该姓名已存在' };
    await db.collection('users').add({
      data: { name: name, wxId: (event.wxId || '').trim(), role: 'member', openid: '', createdAt: db.serverDate() }
    });
    return { ok: true };
  }
  if (action === 'remove') {
    const id = event.id;
    if (!id) return { ok: false, msg: '缺少id' };
    const target = await db.collection('users').doc(id).get().catch(function () { return { data: null }; });
    if (!target.data) return { ok: false, msg: '成员不存在' };
    if (target.data.role === 'admin') return { ok: false, msg: '不能移除管理员' };
    await db.collection('users').doc(id).remove();
    return { ok: true };
  }
  if (action === 'bindWechat') {
    // 新用户绑定：根据昵称找到成员记录，绑定 openid
    const bindName = (event.name || '').trim();
    if (!bindName) return { ok: false, msg: '请选择成员' };
    const target = await db.collection('users').where({ name: bindName }).get();
    if (!target.data.length) return { ok: false, msg: '成员不存在' };
    const doc = target.data[0];
    // 已被其他人绑定
    if (doc.openid && doc.openid !== OPENID) return { ok: false, msg: '该成员已被绑定，请联系管理员' };
    await db.collection('users').doc(doc._id).update({
      data: { openid: OPENID, role: doc.role || 'member' }
    });
    return { ok: true, openid: OPENID, name: doc.name, role: doc.role || 'member' };
  }
  return { ok: false, msg: '未知操作' };
};
