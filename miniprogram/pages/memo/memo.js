// 备忘录页：用户个人备忘录
function normalizeText(text) {
  // 全角数字转半角
  text = text.replace(/[\uff10-\uff19]/g, function (ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
  });
  // 去掉数字和月/号/日之间的空格（中文输入法自动加的空格）
  text = text.replace(/(\d)\s+(月|号|日)/g, '$1$2');
  text = text.replace(/(月|号|日)\s+(\d)/g, '$1$2');
  return text;
}
function extractMonth(text) {
  var t = normalizeText(text);
  var m = t.match(/(\d{1,2})月/);
  return m ? parseInt(m[1]) : 0;
}
function extractDay(text) {
  var t = normalizeText(text);
  var m = t.match(/月\s*(\d{1,2})\s*[号日]/);
  return m ? parseInt(m[1]) : 999;
}
function getMaxDays(month) {
  // 返回某月的最大天数
  var days = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12) return 0;
  return days[month];
}
Page({
  data: { memos: [], inputText: '', editingId: '', groupedMemos: [] },
  onShow() {
    const session = wx.getStorageSync('session');
    if (!session || !session.openid) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    this.loadMemos();
  },
  loadMemos() {
    wx.cloud.callFunction({
      name: 'manageMemo',
      data: { action: 'list' },
      success: (res) => {
        const r = res.result || {};
        if (r.memos) {
          const memos = r.memos;
          const grouped = this.groupByMonth(memos);
          this.setData({ memos: memos, groupedMemos: grouped });
        }
      },
      fail: (err) => {
        console.error('loadMemos fail', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    });
  },
  groupByMonth(memos) {
    const groups = {};
    memos.forEach(function (m) {
      const month = extractMonth(m.text);
      if (!groups[month]) groups[month] = [];
      groups[month].push(m);
    });
    const months = Object.keys(groups).map(Number).sort(function (a, b) { return a - b; });
    return months.map(function (m) {
      const items = groups[m].sort(function (a, b) { return extractDay(a.text) - extractDay(b.text); });
      return { month: m, label: m === 0 ? '其他' : m + '月份', items: items };
    });
  },
  onInput(e) { this.setData({ inputText: e.detail.value }); },
  onAdd() {
    const raw = (this.data.inputText || '').trim();
    if (!raw) { wx.showToast({ title: '请输入内容', icon: 'none' }); return; }
    const text = normalizeText(raw);
    // 检查格式：必须以"几月几号"或"几月几日"开头
    var match = text.match(/^[\d０-９]{1,2}\s*月\s*[\d０-９]{1,2}\s*[号日]/);
    if (!match) {
      this.setData({ inputText: '' });
      wx.showToast({ title: '输入的格式不对，示例：10月1号国庆节放假回家', icon: 'none', duration: 2000 });
      return;
    }
    // 提取月份和日期，验证日期是否合法
    var month = extractMonth(text);
    var day = extractDay(text);
    var maxDays = getMaxDays(month);
    if (month < 1 || month > 12) {
      this.setData({ inputText: '' });
      wx.showToast({ title: '月份不对，请输入1-12月', icon: 'none', duration: 2000 });
      return;
    }
    if (day < 1 || day > maxDays) {
      this.setData({ inputText: '' });
      wx.showToast({ title: month + '月没有' + day + '号，请检查日期', icon: 'none', duration: 2000 });
      return;
    }
    const session = wx.getStorageSync('session');
    if (!session || !session.openid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    // 如果是修改模式
    if (this.data.editingId) {
      wx.cloud.callFunction({
        name: 'manageMemo',
        data: { action: 'update', id: this.data.editingId, text: text },
        success: (res) => {
          const r = res.result || {};
          if (r.ok) {
            this.setData({ inputText: '', editingId: '' });
            this.loadMemos();
            wx.showToast({ title: '修改成功', icon: 'success' });
          } else {
            wx.showToast({ title: r.msg || '修改失败', icon: 'none' });
          }
        },
        fail: (err) => {
          console.error('update fail', err);
          wx.showToast({ title: '修改失败', icon: 'none' });
        }
      });
      return;
    }
    // 新增模式
    wx.cloud.callFunction({
      name: 'manageMemo',
      data: { action: 'add', text: text },
      success: (res) => {
        const r = res.result || {};
        if (r.ok) {
          this.setData({ inputText: '' });
          this.loadMemos();
          wx.showToast({ title: '添加成功', icon: 'success' });
        } else {
          wx.showToast({ title: r.msg || '添加失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('add fail', err);
        wx.showToast({ title: '添加失败：' + (err.errMsg || ''), icon: 'none', duration: 3000 });
      }
    });
  },
  onEdit(e) {
    const id = e.currentTarget.dataset.id;
    const text = e.currentTarget.dataset.text;
    this.setData({ inputText: text, editingId: id });
    wx.showToast({ title: '修改模式', icon: 'none' });
  },
  onCancelEdit() {
    this.setData({ inputText: '', editingId: '' });
  },
  onRemove(e) {
    const id = e.currentTarget.dataset.id;
    wx.cloud.callFunction({
      name: 'manageMemo',
      data: { action: 'remove', id: id },
      success: (res) => {
        const r = res.result || {};
        if (r.ok) {
          this.loadMemos();
          wx.showToast({ title: '删除成功', icon: 'success' });
        } else {
          wx.showToast({ title: r.msg || '删除失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('remove fail', err);
        wx.showToast({ title: '删除失败', icon: 'none' });
      }
    });
  }
});
