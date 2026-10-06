// 排班编辑页：点日期改班次（成员改自己；管理员可改任何人）
const { SHIFT_TYPES, getShiftColor } = require('../../utils/shift.js');
Page({
  data: {
    date: '',
    name: '',
    shift: '',
    members: [],
    canEditOther: false,
    shiftOptions: SHIFT_TYPES.map(function (t) { return { type: t, color: getShiftColor(t) }; })
  },
  onLoad(options) {
    const session = wx.getStorageSync('session');
    if (!session || !session.openid) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    const role = session.role || 'member';
    this.setData({
      date: options.date || '',
      name: decodeURIComponent(options.name || session.name || ''),
      shift: options.shift || '',
      canEditOther: role === 'admin'
    });
    if (role === 'admin') this.loadMembers();
  },
  loadMembers() {
    wx.cloud.callFunction({
      name: 'getShifts',
      data: { monthOnly: true },
      success: (res) => {
        const r = res.result || {};
        if (r.members) this.setData({ members: r.members });
      },
      fail: () => {}
    });
  },
  onSelectMember(e) { this.setData({ name: e.currentTarget.dataset.name }); },
  onSelectShift(e) { this.setData({ shift: e.currentTarget.dataset.type }); },
  onSave() {
    if (!this.data.name || !this.data.date || !this.data.shift) {
      wx.showToast({ title: '请选择完整', icon: 'none' });
      return;
    }
    wx.cloud.callFunction({
      name: 'updateShift',
      data: { name: this.data.name, date: this.data.date, shift: this.data.shift },
      success: (res) => {
        const r = res.result || {};
        if (r.ok) {
          wx.showToast({ title: '已保存', icon: 'success' });
          setTimeout(function () { wx.navigateBack(); }, 600);
        } else {
          wx.showToast({ title: r.msg || '无权限', icon: 'none' });
        }
      },
      fail: () => wx.showToast({ title: '保存失败', icon: 'none' })
    });
  }
});
