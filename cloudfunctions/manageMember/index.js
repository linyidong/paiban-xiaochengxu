// 云函数 manageMember：成员管理
// 权限：list/bindWechat/createAndBind 全员可用；add/remove/unbind 仅管理员
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ⚠️ 人工参数来源：本目录 config.json（由根目录《人工必填参数清单.json》同步），勿手改
const { ADMIN_OPENIDS } = require('./config.json');

async function checkAdmin(OPENID) {
  const cleanOpenid = OPENID.replace(/[^a-zA-Z0-9]/g, '');
  const cleanAdmins = ADMIN_OPENIDS.map(function (s) { return String(s || '').replace(/[^a-zA-Z0-9]/g, ''); });
  let isAdmin = cleanAdmins.includes(cleanOpenid);
  if (!isAdmin) {
    const meRes = await db.collection('users').where({ openid: OPENID }).get();
    if (meRes.data.length && meRes.data[0].role === 'admin') isAdmin = true;
  }
  return isAdmin;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, msg: '未登录' };

  const { action } = event;

  // 全员可用：list / bindWechat / createAndBind
  if (action === 'list') {
    const res = await db.collection('users').orderBy('createdAt', 'asc').limit(100).get();
    return {
      ok: true,
      members: res.data.map(function (u) {
        return { _id: u._id, name: u.name, wxId: u.wxId || '', role: u.role, openid: u.openid || '', createdAt: u.createdAt };
      })
    };
  }

  if (action === 'bindWechat') {
    const bindName = (event.name || '').trim();
    if (!bindName) return { ok: false, msg: '请选择成员' };
    const target = await db.collection('users').where({ name: bindName }).get();
    if (!target.data.length) return { ok: false, msg: '成员不存在' };
    const doc = target.data[0];
    if (doc.openid && doc.openid !== OPENID) return { ok: false, msg: '该成员已被其他用户绑定，请联系管理员解绑' };
    await db.collection('users').doc(doc._id).update({
      data: { openid: OPENID, role: doc.role || 'member' }
    });
    return { ok: true, openid: OPENID, name: doc.name, role: doc.role || 'member' };
  }

  if (action === 'createAndBind') {
    const myBound = await db.collection('users').where({ openid: OPENID }).get();
    if (myBound.data.length) {
      return { ok: false, msg: 'alreadyBound', boundName: myBound.data[0].name };
    }
    const newName = (event.name || '').trim();
    if (!newName) return { ok: false, msg: '请输入成员昵称' };
    const dup = await db.collection('users').where({ name: newName }).get();
    if (dup.data.length) {
      if (!dup.data[0].openid || dup.data[0].openid === OPENID) {
        await db.collection('users').doc(dup.data[0]._id).update({
          data: { openid: OPENID, role: dup.data[0].role || 'member' }
        });
        return { ok: true, openid: OPENID, name: dup.data[0].name, role: dup.data[0].role || 'member' };
      }
      return { ok: false, msg: '该昵称已被使用' };
    }
    const addRes = await db.collection('users').add({
      data: { name: newName, wxId: '', role: 'member', openid: OPENID, createdAt: db.serverDate() }
    });
    return { ok: true, openid: OPENID, name: newName, role: 'member', _id: addRes._id };
  }

  // 以下操作仅管理员可用
  const isAdmin = await checkAdmin(OPENID);
  if (!isAdmin) return { ok: false, msg: '仅管理员可操作' };

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
    await db.collection('shifts').where({ userId: id }).remove();
    await db.collection('users').doc(id).remove();
    return { ok: true };
  }

  if (action === 'unbind') {
    const id = event.id;
    if (!id) return { ok: false, msg: '缺少成员id' };
    const target = await db.collection('users').doc(id).get().catch(function () { return { data: null }; });
    if (!target.data) return { ok: false, msg: '成员不存在' };
    await db.collection('users').doc(id).update({
      data: { openid: '' }
    });
    return { ok: true, name: target.data.name };
  }

  return { ok: false, msg: '未知操作' };
};
