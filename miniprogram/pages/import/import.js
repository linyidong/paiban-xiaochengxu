// 排班导入页：上传截图/表格 → 识别 → 单人自动导入 / 多人询问选谁 → 预览校对 → 确认入库
Page({
  data: {
    preview: null,  // [{name, rows:[{date, shift}]}]
    loading: false,
    sourceType: '',
    targetName: '',
    // 多人选择
    showMemberSelect: false,
    recognizedMembers: [],  // 识别到的成员列表 [{name}]
    fullPreview: null       // 首次识别的完整结果（用于本地过滤，避免重复调用 AI）
  },
  onShow() {
    const session = wx.getStorageSync('session');
    if (!session || !session.openid) wx.reLaunch({ url: '/pages/login/login' });
  },
  onChooseImage() {
    if (this.data.loading) return;
    wx.showActionSheet({
      itemList: ['从相册选择', '从聊天记录选择'],
      success: (res) => {
        if (res.tapIndex === 0) this.chooseFromAlbum();
        else this.chooseFromChat();
      }
    });
  },
  chooseFromAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => this.uploadAndRecognize(res.tempFiles[0].tempFilePath, 'image')
    });
  },
  // 从微信聊天文件里选排班截图（支持 jpg/jpeg/png/jfif/webp/gif/bmp 等）
  chooseFromChat() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['jpg', 'jpeg', 'png', 'jfif', 'webp', 'gif', 'bmp'],
      success: (res) => {
        const f = res.tempFiles[0];
        if (f.size > 10 * 1024 * 1024) { wx.showToast({ title: '文件过大（限10MB）', icon: 'none' }); return; }
        wx.compressImage({
          src: f.path,
          quality: 70,
          compressedWidth: 1000,
          success: (c) => { this.uploadAndRecognize(c.tempFilePath, 'image'); },
          fail: () => { this.uploadAndRecognize(f.path, 'image'); }
        });
      }
    });
  },
  onChooseExcel() {
    if (this.data.loading) return;
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xlsx', 'xls', 'csv'],
      success: (res) => {
        const f = res.tempFiles[0];
        if (f.size > 10 * 1024 * 1024) { wx.showToast({ title: '文件过大（限10MB）', icon: 'none' }); return; }
        this.uploadAndRecognize(f.path, 'excel');
      }
    });
  },
  // 上传并识别（不传 targetName，识别所有人）
  uploadAndRecognize(filePath, type) {
    this.setData({ loading: true, sourceType: type });
    let ext = '.xlsx';
    if (type === 'image') {
      const m = filePath.match(/\.([a-zA-Z0-9]+)$/);
      ext = '.' + (m ? m[1].toLowerCase() : 'jpg');
      if (ext === '.jfif') ext = '.jpg';
      if (!/^\.(jpg|jpeg|png|webp|gif|bmp)$/.test(ext)) ext = '.jpg';
    }
    const cloudPath = 'shift-import/' + Date.now() + ext;
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: (up) => {
        wx.cloud.callFunction({
          name: 'importShift',
          data: { fileID: up.fileID, sourceType: type },
          success: (res) => {
            const r = res.result || {};
            if (r.ok && r.preview && r.preview.length) {
              const fullPreview = r.preview;
              const members = fullPreview.map(function (p) { return { name: p.name }; });
              if (members.length === 1) {
                // 只有一人 → 直接显示该人预览
                this.setData({
                  preview: fullPreview,
                  fullPreview: fullPreview,
                  targetName: members[0].name
                });
                wx.showToast({ title: '识别成功', icon: 'success' });
                setTimeout(function () { wx.pageScrollTo({ scrollTop: 99999, duration: 300 }); }, 400);
              } else {
                // 多人 → 弹出选择器
                this.setData({
                  showMemberSelect: true,
                  recognizedMembers: members,
                  fullPreview: fullPreview
                });
              }
            } else {
              wx.showModal({ title: '未识别到内容', content: r.msg || '请检查图片/表格格式', showCancel: false });
            }
          },
          fail: (err) => wx.showModal({
            title: '识别失败',
            content: (err && err.errMsg) ? err.errMsg : '云函数调用失败，请检查网络或稍后重试',
            showCancel: false
          }),
          complete: () => this.setData({ loading: false })
        });
      },
      fail: () => {
        wx.showToast({ title: '上传失败', icon: 'none' });
        this.setData({ loading: false });
      }
    });
  },
  // 选择成员（多人识别时，从已识别结果中过滤，不重复调用 AI）
  onSelectMember(e) {
    const name = e.currentTarget.dataset.name;
    const filtered = (this.data.fullPreview || []).filter(function (p) { return p.name === name; });
    this.setData({
      showMemberSelect: false,
      preview: filtered,
      targetName: name,
      recognizedMembers: [],
      fullPreview: null
    });
    if (filtered.length) {
      wx.showToast({ title: '已选择 ' + name, icon: 'success' });
      setTimeout(function () { wx.pageScrollTo({ scrollTop: 99999, duration: 300 }); }, 400);
    }
  },
  onCancelSelect() {
    this.setData({ showMemberSelect: false, recognizedMembers: [], fullPreview: null });
  },
  // 人工校对：点按循环切换班次（按班次列表顺序循环，如 休→正A→正B→售A→售B→休）
  onFixShift(e) {
    const { idx, date } = e.currentTarget.dataset;
    const preview = this.data.preview;
    const row = preview[idx].rows.find(function (r) { return r.date === date; });
    if (!row) return;
    const SHIFT_TYPES = require('../../utils/shift.js').SHIFT_TYPES;
    const list = SHIFT_TYPES;
    const cur = list.indexOf(row.shift);
    row.shift = list[(cur + 1) % list.length];
    this.setData({ preview: preview });
  },
  onConfirm() {
    const preview = this.data.preview;
    if (!preview || !preview.length) return;
    const targetName = this.data.targetName;
    const who = (targetName && targetName !== '全部') ? '「' + targetName + '」' : preview.length + ' 位成员';
    wx.showModal({
      title: '确认导入',
      content: '将覆盖 ' + who + ' 的当月排班，是否继续？',
      success: (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '导入中...' });
        const now = new Date();
        wx.cloud.callFunction({
          name: 'importShift',
          data: { commit: true, preview: preview, year: now.getFullYear(), month: now.getMonth() + 1 },
          success: (res) => {
            wx.hideLoading();
            const r2 = res.result || {};
            if (r2.ok) {
              wx.showToast({ title: '导入成功', icon: 'success' });
              this.setData({ preview: null, targetName: '' });
              setTimeout(function () { wx.switchTab({ url: '/pages/calendar/calendar' }); }, 600);
            } else {
              wx.showToast({ title: r2.msg || '导入失败', icon: 'none' });
            }
          },
          fail: () => { wx.hideLoading(); wx.showToast({ title: '导入失败', icon: 'none' }); }
        });
      }
    });
  },
  onCancel() { this.setData({ preview: null, targetName: '', showMemberSelect: false, recognizedMembers: [], fullPreview: null }); }
});
