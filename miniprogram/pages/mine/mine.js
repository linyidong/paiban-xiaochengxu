// 我的页：身份 + 当月我的排班摘要 + 管理员入口
Page({
  data: { role: '', name: '', summary: null, isAdmin: false, hasBound: false },
  onShow() {
    const session = wx.getStorageSync('session');
    if (!session || !session.openid) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    const hasBound = !!session.name;
    this.setData({
      role: session.role === 'admin' ? '管理员' : '成员',
      name: session.name || '',
      isAdmin: session.role === 'admin',
      hasBound: hasBound
    });
    if (hasBound) {
      this.loadMySummary(session.name);
    }
  },
  loadMySummary(name) {
    const now = new Date();
    wx.cloud.callFunction({
      name: 'getShifts',
      data: { year: now.getFullYear(), month: now.getMonth() + 1 },
      success: (res) => {
        const r = res.result || {};
        const shiftsMap = r.shiftsMap || {};
        const myMap = shiftsMap[name] || {};
        // 统计归类：休=休；正A/正B=白班；售A/售B=晚班（售=晚班状态）
        const cnt = { '休': 0, '白': 0, '晚': 0 };
        Object.keys(myMap).forEach(function (d) {
          const t = myMap[d];
          if (t === '休') cnt['休'] += 1;
          else if (t.indexOf('正') > -1) cnt['白'] += 1;
          else if (t.indexOf('售') > -1) cnt['晚'] += 1;
        });
        this.setData({ summary: cnt });
      },
      fail: () => {}
    });
  },
  goMembers() { wx.navigateTo({ url: '/pages/members/members' }); },
  goMemo() { wx.navigateTo({ url: '/pages/memo/memo' }); },
  goBind() { wx.reLaunch({ url: '/pages/login/login' }); },
  onLogout() {
    const session = wx.getStorageSync('session');
    wx.setStorageSync('session', { openid: session.openid || '', name: '', role: session.role || '' });
    wx.reLaunch({ url: '/pages/login/login' });
  }
});
