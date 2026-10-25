// 成员选择工具：过滤管理员记录，选出日历默认展示成员。
function selectableMembers(members) {
  return (members || []).filter(function (m) { return m && m.role !== 'admin'; });
}

// 优先使用当前选中/导入目标的成员；否则取第一个可展示成员
function pickDefaultMember(members, preferredName) {
  const list = selectableMembers(members);
  if (preferredName) {
    const hit = list.filter(function (m) { return m.name === preferredName; })[0];
    if (hit) return hit.name;
  }
  return list.length ? list[0].name : '';
}

// 优先使用当前选中成员（允许管理员）；否则取第一个真实成员
function pickMember(members, preferredName) {
  const list = (members || []).filter(function (m) { return m; });
  if (preferredName) {
    const hit = list.filter(function (m) { return m.name === preferredName; })[0];
    if (hit) return hit.name;
  }
  const real = list.filter(function (m) { return m.role !== 'admin'; });
  if (real.length) return real[0].name;
  return list.length ? list[0].name : '';
}

module.exports = { selectableMembers, pickDefaultMember, pickMember };
