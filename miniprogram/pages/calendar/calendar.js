// 首页·日历视图：月历 + 班次标记 + 点击日期弹窗选班次（长按/批量按钮进入多选，统一设置）
const app = getApp();
const cal = require('../../utils/calendar.js');
const { SHIFT_TYPES, SHIFT_COLOR, getShiftColor, getDisplayName } = require('../../utils/shift.js');
const DEFAULT_SHIFTS = ['休', '正A', '正B', '售A', '售B', '年假'];
const ADMIN_SHIFTS = ['休', '白班', '晚班', '年假'];
const DEFAULT_SHIFT_COLORS = { '休': '#EF4444', '正A': '#3B82F6', '正B': '#3B82F6', '售A': '#111827', '售B': '#111827', '白班': '#3B82F6', '晚班': '#111827', '年假': '#10B981' };
Page({
  data: {
    year: 0,
    month: 0,
    cells: [],
    members: [],
    selectedMember: '',
    today: '',
    hasData: true,
    // 班次选择弹窗
    showPicker: false,
    pickerTitle: '',
    pendingDates: [],       // 弹窗确认时要设置的日期（单/多）
    shiftOptions: DEFAULT_SHIFTS.map(function (t) { return { type: t, color: DEFAULT_SHIFT_COLORS[t] || '#9CA3AF' }; }),
    // 底部图例
    legendItems: DEFAULT_SHIFTS.map(function (t) { return { type: t, color: DEFAULT_SHIFT_COLORS[t] || '#9CA3AF' }; }),
    // 多选模式
    multiSelect: false,
    selectedDates: [],
    isAdmin: false,
    // 年月选择弹窗
    showDatePicker: false,
    datePickMode: 'year',  // 'year' 选年份, 'month' 选月份
    tempYear: 0,
    yearList: [],
    // 月份网格数据
    monthGrid: [],
    memberMonths: {}
  },
  onShow() {
    const session = wx.getStorageSync('session');
    if (!session || !session.openid) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    app.globalData.name = session.name || '';
    const now = new Date();
    const currentYear = now.getFullYear();
    // 生成年份列表：当前年份前后各3年
    const yearList = [];
    for (let y = currentYear - 3; y <= currentYear + 3; y++) yearList.push(y);
    this.setData({
      year: currentYear,
      month: now.getMonth() + 1,
      today: cal.getToday(),
      selectedMember: session.name || '',
      isAdmin: session.role === 'admin',
      tempYear: currentYear,
      yearList: yearList
    });
    this.loadShifts();
  },
  // 加载某年各成员有数据的月份（用于月份选择器高亮）
  loadYearData(year) {
    wx.cloud.callFunction({
      name: 'getShifts',
      data: { year: year, yearData: true },
      success: (res) => {
        const r = res.result || {};
        if (r.memberMonths) {
          this.setData({ memberMonths: r.memberMonths });
        }
      }
    });
  },
  loadShifts() {
    wx.cloud.callFunction({
      name: 'getShifts',
      data: { year: this.data.year, month: this.data.month },
      success: (res) => {
        const r = res.result || {};
        const cells = cal.getMonthGrid(this.data.year, this.data.month);
        this._lastMap = r.shiftsMap || {};
        const members = (r.members || []).map(function (m) {
          m.displayName = getDisplayName(m.name);
          return m;
        });
        const session = wx.getStorageSync('session') || {};
        const currentUser = members.find(function (x) { return x.name === (session.name || ''); });
        const dbIsAdmin = currentUser && currentUser.role === 'admin';
        this.setData({
          members: members,
          isAdmin: dbIsAdmin || session.role === 'admin'
        });
        // 若当前成员无排班、但其他成员有排班 → 自动切换到第一个有排班的成员（导入后立即显示）
        const map = r.shiftsMap || {};
        const hasDataMembers = Object.keys(map).filter(function (n) { return n && Object.keys(map[n] || {}).length; });
        if (hasDataMembers.length && hasDataMembers.indexOf(this.data.selectedMember) === -1) {
          const name = hasDataMembers[0];
          const dm = members.find(function (x) { return x.name === name; });
          this.setData({ selectedMember: name });
          wx.showToast({ title: '已切换到 ' + (dm ? dm.displayName : name) + ' 的排班', icon: 'none' });
        }
        // 判断当前选中成员在该月是否有排班数据
        const myMap = map[this.data.selectedMember] || {};
        const hasData = Object.keys(myMap).some(function (d) { return myMap[d]; });
        this.setData({ hasData: hasData });
        this.applyShifts(cells);
      },
      fail: (err) => {
        console.error('loadShifts fail', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    });
  },
  applyShifts(cells) {
    const myMap = this._lastMap[this.data.selectedMember] || {};
    const sel = this.data.selectedDates || [];
    cells.forEach((c) => {
      // 显示层清理：白名单只保留中文/字母/数字，过滤所有乱码符号
      const raw = myMap[c.fullDate] || '';
      const t = String(raw).replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '').trim();
      c.shift = t;
      c.color = t ? getShiftColor(t) : '';
      c.selected = sel.indexOf(c.fullDate) > -1;
    });
    this.setData({ cells });
    // 根据当前成员的实际排班数据更新图例和弹窗选项
    this.updateShiftDisplay(myMap);
  },
  updateShiftDisplay(myMap) {
    // 判断选中成员是否为管理员
    const selectedMemberData = this.data.members.find(function (m) { return m.name === this.data.selectedMember; }.bind(this));
    const isSelectedAdmin = selectedMemberData && selectedMemberData.role === 'admin';
    
    var types;
    if (isSelectedAdmin) {
      // 管理员始终显示4个默认状态
      types = ADMIN_SHIFTS.slice();
    } else {
      // 其他成员：提取实际使用的班次类型
      var used = {};
      Object.keys(myMap).forEach(function (d) {
        var raw = myMap[d] || '';
        var t = String(raw).replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '').trim();
        if (t) used[t] = true;
      });
      types = Object.keys(used);
      // 如果没有排班数据，使用默认6个状态
      if (!types.length) {
        types = DEFAULT_SHIFTS.slice();
      } else {
        // 确保包含"年假"选项
        if (types.indexOf('年假') === -1) types.push('年假');
      }
    }
    var items = types.map(function (t) { return { type: t, color: SHIFT_COLOR[t] || DEFAULT_SHIFT_COLORS[t] || '#9CA3AF' }; });
    this.setData({ legendItems: items, shiftOptions: items });
  },
  onSelectMember(e) {
    const name = e.currentTarget.dataset.name;
    this.setData({ selectedMember: name });
    this.applyShifts(this.data.cells);
  },
  // 重新检测权限：实时调用 login 云函数，刷新本地 session（不用退出重登）
  refreshAuth() {
    wx.showLoading({ title: '检测中' });
    wx.cloud.callFunction({
      name: 'login',
      success: (res) => {
        wx.hideLoading();
        const r = res.result || {};
        if (!r.ok) { wx.showToast({ title: r.msg || '检测失败', icon: 'none' }); return; }
        const session = wx.getStorageSync('session') || {};
        session.openid = r.openid;
        session.role = r.role;
        session.name = r.name || session.name;
        wx.setStorageSync('session', session);
        const app = getApp();
        app.globalData.openid = r.openid;
        app.globalData.role = r.role;
        app.globalData.name = r.name;
        // 权限判断：优先用 members 列表中的数据库角色（比 session 可靠）
        const currentUser = this.data.members.find(function (x) { return x.name === (r.name || session.name || ''); });
        const dbIsAdmin = currentUser && currentUser.role === 'admin';
        this.setData({ isAdmin: dbIsAdmin || r.role === 'admin' });
        wx.showToast({ title: '权限已刷新：' + r.role, icon: 'none' });
        // 重新应用排班显示（根据选中成员的角色更新图例和弹窗）
        this.applyShifts(this.data.cells);
      },
      fail: () => { wx.hideLoading(); wx.showToast({ title: '检测失败', icon: 'none' }); }
    });
  },
  onDeleteMember() {
    if (!this.data.isAdmin) {
      wx.showModal({ title: '无权限', content: '仅管理员可删除成员。', showCancel: false });
      return;
    }
    const name = this.data.selectedMember;
    const m = this.data.members.find(function (x) { return x.name === name; });
    if (!m || !m._id) {
      wx.showToast({ title: '无法获取成员信息', icon: 'none' });
      return;
    }
    if (m.role === 'admin') {
      wx.showToast({ title: '不能删除管理员', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '删除成员',
      content: '确定删除「' + (m.displayName || m.name) + '」？该成员的历史排班将保留。',
      confirmColor: '#EF4444',
      success: (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '删除中' });
        wx.cloud.callFunction({
          name: 'manageMember',
          data: { action: 'remove', id: m._id },
          success: (res) => {
            wx.hideLoading();
            const r2 = res.result || {};
            if (r2.ok) {
              wx.showToast({ title: '已删除 ' + (m.displayName || m.name), icon: 'success' });
              // 如果删的是当前查看的成员，切换到第一个
              if (this.data.selectedMember === m.name) {
                const rest = this.data.members.filter(function (x) { return x._id !== m._id; });
                if (rest.length) this.setData({ selectedMember: rest[0].name });
              }
              this.loadShifts();
            } else {
              wx.showModal({ title: '删除失败', content: r2.msg || '未知错误', showCancel: false });
            }
          },
          fail: () => { wx.hideLoading(); wx.showToast({ title: '删除失败', icon: 'none' }); }
        });
      }
    });
  },

  // ---------- 日期交互：点选弹窗 / 长按多选 ----------
  onTapDay(e) {
    const date = e.detail.date;
    if (this.data.multiSelect) {
      this.toggleSelect(date);
      return;
    }
    // 单日期：直接打开班次选择弹窗
    this.openPicker([date], date + ' 排班');
  },
  onLongPressDay(e) {
    // 长按 → 进入多选模式并选中该日期
    if (!this.data.multiSelect) {
      this.setData({ multiSelect: true, selectedDates: [] });
    }
    this.toggleSelect(e.detail.date);
    wx.showToast({ title: '多选模式：点日期勾选', icon: 'none' });
  },
  toggleSelect(date) {
    const sel = this.data.selectedDates.slice();
    const i = sel.indexOf(date);
    if (i > -1) { sel.splice(i, 1); } else { sel.push(date); }
    this.setData({ selectedDates: sel });
    this.applyShifts(this.data.cells);
  },
  // 顶栏"批量"按钮：切换多选模式
  onToggleMulti() {
    const multi = !this.data.multiSelect;
    this.setData({ multiSelect: multi, selectedDates: [] });
    this.applyShifts(this.data.cells);
    if (multi) wx.showToast({ title: '多选模式：点日期勾选，再点批量设置', icon: 'none' });
  },
  // 批量设置：为所有选中日期打开弹窗（显示该成员实际使用的班次）
  onBatchSet() {
    const sel = this.data.selectedDates;
    if (!sel.length) { wx.showToast({ title: '请先勾选日期', icon: 'none' }); return; }
    this.openPicker(sel, '为 ' + sel.length + ' 天统一设置班次', true);
  },

  // ---------- 班次选择弹窗 ----------
  openPicker(dates, title, useMemberShifts) {
    // 使用已根据成员实际排班数据计算的选项
    var options = this.data.shiftOptions;
    if (!options.length) {
      // 兜底：管理员4个，其他成员6个
      var shifts = this.data.isAdmin ? ADMIN_SHIFTS : DEFAULT_SHIFTS;
      options = shifts.map(function (t) { return { type: t, color: SHIFT_COLOR[t] || DEFAULT_SHIFT_COLORS[t] || '#9CA3AF' }; });
    }
    this.setData({ showPicker: true, pickerTitle: title, pendingDates: dates, shiftOptions: options });
  },
  closePicker() {
    this.setData({ showPicker: false });
  },
  onPickShift(e) {
    const shift = e.currentTarget.dataset.type;
    const dates = this.data.pendingDates || [];
    const name = this.data.selectedMember;
    if (!name) {
      this.setData({ showPicker: false });
      wx.showModal({ title: '无法设置', content: '你还没登记为成员：请先到「我的」页添加自己为成员，再回来设置排班', showCancel: false });
      return;
    }
    wx.showLoading({ title: '保存中' });
    wx.cloud.callFunction({
      name: 'updateShift',
      data: { name: name, shift: shift, dates: dates },
      success: (res) => {
        const r = res.result || {};
        wx.hideLoading();
        if (r.ok) {
          wx.showToast({ title: '已设置 ' + (r.count || dates.length) + ' 天', icon: 'success' });
          this.setData({ showPicker: false, multiSelect: false, selectedDates: [] });
          this.loadShifts();
        } else {
          wx.showModal({ title: '设置失败', content: r.msg || '未知错误', showCancel: false });
        }
      },
      fail: (err) => { wx.hideLoading(); wx.showModal({ title: '设置失败', content: (err && err.errMsg) || '网络错误', showCancel: false }); }
    });
  },
  onPrevMonth() {
    let m = this.data.month - 1, y = this.data.year;
    if (m < 1) { m = 12; y -= 1; }
    this.setData({ year: y, month: m, selectedDates: [] });
    this.loadShifts();
  },
  onNextMonth() {
    let m = this.data.month + 1, y = this.data.year;
    if (m > 12) { m = 1; y += 1; }
    this.setData({ year: y, month: m, selectedDates: [] });
    this.loadShifts();
  },

  // ---------- 年月选择器 ----------
  onPickDate() {
    const y = this.data.year;
    this.setData({
      showDatePicker: true,
      datePickMode: 'month',
      tempYear: y
    });
    this.loadYearData(y);
  },
  closeDatePicker() {
    this.setData({ showDatePicker: false });
  },
  onPickYear(e) {
    const y = Number(e.currentTarget.dataset.year);
    this.setData({
      tempYear: y,
      datePickMode: 'month'
    });
    this.loadYearData(y);
  },
  onBackToYear() {
    this.setData({ datePickMode: 'year' });
  },
  onPickMonth(e) {
    const m = Number(e.currentTarget.dataset.month);
    this.setData({
      year: this.data.tempYear,
      month: m,
      showDatePicker: false,
      selectedDates: []
    });
    this.loadShifts();
  }
});
