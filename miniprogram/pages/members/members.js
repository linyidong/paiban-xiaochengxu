// 成员管理页（仅管理员可见入口；云函数二次校验）
const { getDisplayName } = require('../../utils/shift.js');
Page({
  data: { members: [], inputName: '', inputWx: '' },
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
  onName(e) { this.setData({ inputName: e.detail.value }); },
  onWx(e) { this.setData({ inputWx: e.detail.value }); },
  onAdd() {
    const name = this.data.inputName.trim();
    if (!name) { wx.showToast({ title: '请输入姓名', icon: 'none' }); return; }
    wx.cloud.callFunction({
      name: 'manageMember',
      data: { action: 'add', name: name, wxId: this.data.inputWx.trim() },
      success: (res) => {
        const r = res.result || {};
        if (r.ok) { this.setData({ inputName: '', inputWx: '' }); this.loadMembers(); }
        else wx.showToast({ title: r.msg || '添加失败', icon: 'none' });
      },
      fail: () => wx.showToast({ title: '添加失败', icon: 'none' })
    });
  },
  onRemove(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showModal({
      title: '移除成员',
      content: '确定移除 ' + name + '？历史排班保留。',
      success: (r) => {
        if (!r.confirm) return;
        wx.cloud.callFunction({
          name: 'manageMember',
          data: { action: 'remove', id: id },
          success: (res) => {
            const r2 = res.result || {};
            if (r2.ok) this.loadMembers();
            else wx.showToast({ title: r2.msg || '移除失败', icon: 'none' });
          },
          fail: () => wx.showToast({ title: '移除失败', icon: 'none' })
        });
      }
    });
  }
});
