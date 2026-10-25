// 成员管理页（仅管理员可见入口；云函数二次校验）
const { getDisplayName } = require('../../utils/shift.js');
Page({
  data: { members: [] },
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
          const members = r.members.map(function (m) {
            m.displayName = getDisplayName(m.name);
            return m;
          });
          this.setData({ members: members });
        }
      },
      fail: () => wx.showToast({ title: '加载失败', icon: 'none' })
    });
  },
  onRemove(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showModal({
      title: '移除成员',
      content: '确定移除 ' + name + '？该成员的排班记录也将被删除。',
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
