// 首页·日历视图：月历 + 班次标记 + 点击日期弹窗选班次（长按/批量按钮进入多选，统一设置）
const app = getApp();
const cal = require('../../utils/calendar.js');
const { getShiftColor, getShiftOptions, getDisplayName } = require('../../utils/shift.js');
function normalizeDigits(text) {
  text = String(text).replace(/[\uff10-\uff19]/g, function (ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
  });
  // 去掉数字和月/号/日之间的空格（中文输入法自动加的空格）
  text = text.replace(/(\d)\s+(月|号|日)/g, '$1$2');
  text = text.replace(/(月|号|日)\s+(\d)/g, '$1$2');
  return text;
}
function extractMonth(text) {
  var m = normalizeDigits(text).match(/(\d{1,2})\s*月/);
  return m ? parseInt(m[1]) : 0;
}
function extractDay(text) {
  var m = normalizeDigits(text).match(/月\s*(\d{1,2})\s*[号日]/);
  return m ? parseInt(m[1]) : 999;
}
Page({
  data: {
    year: 0,
    month: 0,
    cells: [],
    members: [],
    selectedMember: '',
    today: '',
    hasData: true,
    memos: [],
    emptyText: '',
    // 班次选择弹窗
    showPicker: false,
    pickerTitle: '',
    pendingDates: [],       // 弹窗确认时要设置的日期（单/多）
    shiftOptions: getShiftOptions(),
    // 底部图例
    legendItems: getShiftOptions(),
    // 多选模式
    multiSelect: false,
    selectedDates: [],
    isAdmin: false,
    // 年月选择弹窗
    showDatePicker: false,
    datePickMode: 'year',  // 'year' 选年份, 'month' 选月份
    tempYear: 0,
    yearList: [],
    memberMonths: {}
  },
  onShow() {
    const session = wx.getStorageSync('session');
    if (!session || !session.openid) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    // 非管理员未绑定成员 → 跳转登录页绑定
    if (session.role !== 'admin' && !session.name) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    app.globalData.name = session.name || '';
    const now = new Date();
    const currentYear = now.getFullYear();
    const yearList = [];
    for (let y = currentYear - 3; y <= currentYear + 3; y++) yearList.push(y);
    // 导入成功后需要定位到“被导入成员 + 对应年月”
    const pending = wx.getStorageSync('importTarget');
    if (pending) wx.removeStorageSync('importTarget');
    const year = pending && pending.year ? Number(pending.year) : currentYear;
    const month = pending && pending.month ? Number(pending.month) : now.getMonth() + 1;
    this.setData({
      year: year,
      month: month,
      today: cal.getToday(),
      selectedMember: (pending && pending.name) || session.name || '',
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
        // 检查是否有导入后需要切换到的成员
        const importTarget = wx.getStorageSync('importTargetMember');
        if (importTarget) {
          wx.removeStorageSync('importTargetMember');
          const tm = members.find(function (x) { return x.name === importTarget; });
          if (tm) {
            this.setData({ selectedMember: importTarget });
          }
        }
        // 判断当前选中成员在该月是否有排班数据
        const map = r.shiftsMap || {};
        const myMap = map[this.data.selectedMember] || {};
        const hasData = Object.keys(myMap).some(function (d) { return myMap[d]; });
        // 立即更新 hasData，不等待备忘录加载
        this.setData({ hasData: hasData });
        this._loadMemosForMonth(hasData);
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
    // 统一班次源：config.SHIFT_TYPES + 取消；图例与弹窗同源，不再按“已用班次”裁剪
    const items = getShiftOptions();
    this.setData({ legendItems: items, shiftOptions: items });
  },
  onSelectMember(e) {
    const name = e.currentTarget.dataset.name;
    this.setData({ selectedMember: name });
    this.applyShifts(this.data.cells);
    const myMap = this._lastMap[name] || {};
    const hasData = Object.keys(myMap).some(function (d) { return myMap[d]; });
    this.setData({ hasData: hasData });
    this._loadMemosForMonth(hasData);
  },
  _loadMemosForMonth(hasData) {
    var self = this;
    var currentMonth = this.data.month;
    var session = wx.getStorageSync('session') || {};
    // 备忘录属于个人：只有查看自己的排班时才显示自己的备忘录，
    // 查看其他成员的排班时不显示（避免把当前登录用户的备忘录展示在成员日历里）
    if (this.data.selectedMember !== (session.name || '')) {
      var emptyText = '';
      if (!hasData) {
        emptyText = self.data.year + '年' + self.data.month + '月暂无排班信息';
      }
      self.setData({ memos: [], emptyText: emptyText });
      return;
    }
    wx.cloud.callFunction({
      name: 'manageMemo',
      data: { action: 'list' },
      success: function (memoRes) {
        var mr = memoRes.result || {};
        var allMemos = mr.memos || [];
        var memos = allMemos.filter(function (m) {
          return extractMonth(m.text) === currentMonth;
        }).sort(function (a, b) { return extractDay(a.text) - extractDay(b.text); });
        var emptyText = '';
        if (!hasData && !memos.length) {
          emptyText = self.data.year + '年' + self.data.month + '月暂无排班信息和备忘录';
        } else if (hasData && !memos.length) {
          emptyText = '当前月份没有备忘录';
        }
        self.setData({ memos: memos, emptyText: emptyText });
      },
      fail: function () {
        self.setData({ memos: [], emptyText: '' });
      }
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
      content: '确定删除「' + (m.displayName || m.name) + '」？成员将从列表隐藏，历史排班保留。',
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
      options = getShiftOptions();
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
    // "取消" = 清空排班，传空字符串给云函数
    const finalShift = shift === '取消' ? '' : shift;
    wx.showLoading({ title: '保存中' });
    wx.cloud.callFunction({
      name: 'updateShift',
      data: { name: name, shift: finalShift, dates: dates },
      success: (res) => {
        const r = res.result || {};
        wx.hideLoading();
        if (r.ok) {
          const msg = finalShift ? ('已设置 ' + (r.count || dates.length) + ' 天') : ('已取消 ' + (r.count || dates.length) + ' 天排班');
          wx.showToast({ title: msg, icon: 'success' });
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
