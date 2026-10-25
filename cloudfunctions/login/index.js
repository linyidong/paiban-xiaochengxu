// 云函数 login：登录鉴权，返回身份（admin/member）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ⚠️ 人工参数来源：本目录 config.json（由根目录《人工必填参数清单.json》同步），勿手改
const { ADMIN_OPENIDS } = require('./config.json');

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, msg: '无法获取用户身份' };
  const users = db.collection('users');
  // 彻底清理：只保留字母数字，去掉所有不可见字符（BOM、空格、零宽字符等）
  const cleanOpenid = OPENID.replace(/[^a-zA-Z0-9]/g, '');
  const cleanList = ADMIN_OPENIDS.map(function (s) { return String(s || '').replace(/[^a-zA-Z0-9]/g, ''); });
  const inWhitelist = cleanList.includes(cleanOpenid);

  const res = await users.where({ openid: OPENID }).get();
  let role = inWhitelist ? 'admin' : 'member';
  let name = '';
  let needBind = false;

  if (res.data.length === 0) {
    // 无记录
    if (inWhitelist) {
      // 管理员：自动建档
      await users.add({
        data: { openid: OPENID, name: '管理员', wxId: '', role: 'admin', createdAt: db.serverDate() }
      });
      name = '管理员';
      role = 'admin';
    } else {
      // 非管理员：不建档，要求绑定成员
      needBind = true;
    }
  } else if (res.data.length === 1) {
    name = res.data[0].name || '';
    // 白名单优先；不匹配时回退数据库已有角色
    if (!inWhitelist && res.data[0].role === 'admin') role = 'admin';
    await users.doc(res.data[0]._id).update({ data: { role: role } });
    // 名字为空或"新成员"说明还没绑定
    if (!name || name === '新成员') {
      needBind = true;
      name = '';
    }
  } else {
    // 同一 openid 绑定了多个成员 → 合并：保留有排班数据的那个，其余解绑
    const shifts = db.collection('shifts');
    let keepId = res.data[0]._id;
    let keepName = res.data[0].name || '';
    // 找有排班数据的成员
    for (const u of res.data) {
      const sRes = await shifts.where({ userId: u._id }).count();
      if (sRes.total > 0) {
        keepId = u._id;
        keepName = u.name || '';
        break;
      }
    }
    // 解绑其他成员
    for (const u of res.data) {
      if (u._id !== keepId) {
        await users.doc(u._id).update({ data: { openid: '' } });
      }
    }
    // 更新保留的成员角色
    if (!inWhitelist && res.data[0].role === 'admin') role = 'admin';
    await users.doc(keepId).update({ data: { role: role } });
    name = keepName;
    if (!name || name === '新成员') {
      needBind = true;
      name = '';
    }
  }
  return {
    ok: true,
    openid: OPENID,
    role: role,
    name: name,
    needBind: needBind
  };
};
