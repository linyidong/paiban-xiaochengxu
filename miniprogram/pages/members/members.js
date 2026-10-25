// 成员管理页（仅管理员可见入口；云函数二次校验）
const { getDisplayName } = require('../../utils/shift.js');
const { selectableMembers } = require('../../utils/member.js');
Page({
  data: { members: [], showAdd: false, newName: '', adding: false },
  onShow() {
    const session = wx.getStorageSync('session');
    if (!session || !session.openid) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    if (session.role !== 'admin') {
      wx.showToast({ title: '仅管理员可用', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 600);
      return;
    }
    this.loadMembers();
  },
  loadMembers() {
    wx.cloud.callFunction({
      name: 'manageMember',
      data: { action: 'list' },
      success: (res) => {
        const r = res.result || {};
        if (r.members) {
          // 客户端也过滤管理员伪成员；后端部署后双重保证
          const members = selectableMembers(r.members).map(function (m) {
            m.displayName = getDisplayName(m.name);
            return m;
          });
          this.setData({ members: members });
        }
      },
      fail: () => wx.showToast({ title: '加载失败', icon: 'none' })
    });
  },
  onToggleAdd() {
    this.setData({ showAdd: !this.data.showAdd, newName: '' });
  },
  onNewNameInput(e) {
    this.setData({ newName: e.detail.value });
  },
  onAddMember() {
    const name = (this.data.newName || '').trim();
    if (!name) { wx.showToast({ title: '请输入成员姓名', icon: 'none' }); return; }
    if (this.data.adding) return;
    this.setData({ adding: true });
    wx.cloud.callFunction({
      name: 'manageMember',
      data: { action: 'add', name: name },
      success: (res) => {
        const r = res.result || {};
        if (r.ok) {
          wx.showToast({ title: '已新增', icon: 'success' });
          this.setData({ showAdd: false, newName: '' });
          this.loadMembers();
        } else {
          wx.showToast({ title: r.msg || '新增失败', icon: 'none' });
        }
      },
      fail: () => wx.showToast({ title: '新增失败，请重试', icon: 'none' }),
      complete: () => this.setData({ adding: false })
    });
  },
  onRemove(e) {    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showModal({
      title: '移除成员',
      content: '确定移除 ' + name + '？成员将从列表隐藏，历史排班保留。',
      confirmColor: '#EF4444',
      success: (r) => {
        if (!r.confirm) return;
        wx.cloud.callFunction({
          name: 'manageMember',
          data: { action: 'remove', id: id },
          success: (res) => {
            const r2 = res.result || {};
            if (r2.ok) {
              wx.showToast({ title: '已移除', icon: 'success' });
              this.loadMembers();
            } else {
              wx.showToast({ title: r2.msg || '移除失败', icon: 'none' });
            }
          },
          fail: () => wx.showToast({ title: '移除失败', icon: 'none' })
        });
      }
    });
  },
  onUnbind(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showModal({
      title: '解除绑定',
      content: '确定解除 ' + name + ' 的微信绑定？该用户需要重新选择绑定成员。',
      success: (r) => {
        if (!r.confirm) return;
        wx.cloud.callFunction({
          name: 'manageMember',
          data: { action: 'unbind', id: id },
          success: (res) => {
            const r2 = res.result || {};
            if (r2.ok) {
              wx.showToast({ title: '已解绑', icon: 'success' });
              this.loadMembers();
            } else {
              wx.showToast({ title: r2.msg || '解绑失败', icon: 'none' });
            }
          },
          fail: () => wx.showToast({ title: '解绑失败', icon: 'none' })
        });
      }
    });
  }
});
