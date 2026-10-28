// 数据页（仅管理员）：成员数、当月有排班成员、排班条数、我的备忘录数
Page({
  data: {
    year: 0,
    month: 0,
    memberCount: 0,
    boundCount: 0,
    totalUsers: 0,
    launchCount: 0,
    frequency: 0,
    active30: 0,
    onlineDays: 0,
    firstDate: '',
    activeMembers: 0,
    shiftCount: 0,
    memoCount: 0,
    isAdmin: false
  },
  onShow() {
    const session = wx.getStorageSync('session') || {};
    if (session.role !== 'admin') {
      wx.showToast({ title: '仅管理员可访问', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 800);
      return;
    }
    const now = new Date();
    this.setData({
      isAdmin: true,
      year: now.getFullYear(),
      month: now.getMonth() + 1
    });
    this.load();
  },
  load() {
    const self = this;
    // 成员数
    wx.cloud.callFunction({
      name: 'manageMember',
      data: { action: 'list' },
      success: (res) => {
        const r = res.result || {};
        if (r.ok) {
          const list = r.members || [];
          self.setData({
            memberCount: list.length,
            boundCount: list.filter(function (m) { return m.isBound; }).length
          });
        }
      }
    });
    // 使用统计：累计用户/启动次数/近30天活跃/上线天数
    wx.cloud.callFunction({
      name: 'getStats',
      data: {},
      success: (res) => {
        const r = res.result || {};
        if (r.ok) {
          self.setData({
            totalUsers: r.totalUsers || 0,
            launchCount: r.launchCount || 0,
            frequency: r.frequency || 0,
            active30: r.active30 || 0,
            onlineDays: r.onlineDays || 0,
            firstDate: r.firstDate || ''
          });
        }
      }
    });
    // 当月排班：条数 + 有排班成员数
    wx.cloud.callFunction({
      name: 'getShifts',
      data: { year: this.data.year, month: this.data.month },
      success: (res) => {
        const map = (res.result || {}).shiftsMap || {};
        let shiftCount = 0;
        let activeMembers = 0;
        Object.keys(map).forEach(function (name) {
          const days = map[name] || {};
          const n = Object.keys(days).filter(function (d) { return days[d]; }).length;
          if (n > 0) { activeMembers += 1; shiftCount += n; }
        });
        self.setData({ shiftCount: shiftCount, activeMembers: activeMembers });
      }
    });
    // 我的备忘录
    wx.cloud.callFunction({
      name: 'manageMemo',
      data: { action: 'list' },
      success: (res) => {
        const r = res.result || {};
        if (r.ok) self.setData({ memoCount: (r.memos || []).length });
      }
    });
  }
});
