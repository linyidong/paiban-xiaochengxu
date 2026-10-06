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
  let name = '新成员';
  let needBind = false;
  if (res.data.length === 0) {
    // 新用户：先按"新成员"建档，需要绑定昵称
    await users.add({
      data: { openid: OPENID, name: name, wxId: '', role: role, createdAt: db.serverDate() }
    });
    needBind = true;
  } else {
    name = res.data[0].name || name;
    // 白名单优先；不匹配时回退数据库已有角色（防止因 openid 细微差异导致管理员被降级）
    if (!inWhitelist && res.data[0].role === 'admin') role = 'admin';
    await users.doc(res.data[0]._id).update({ data: { role: role } });
    // 如果名字仍是"新成员"，说明还没绑定昵称
    if (name === '新成员') needBind = true;
  }
  return {
    ok: true,
    openid: OPENID,
    role: role,
    name: name,
    needBind: needBind
  };
};
