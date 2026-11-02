// 隐私授权兜底：微信原生隐私弹窗用户误点拒绝后，允许再询问，最多 3 次。
// 已授权/不支持隐私 API 时直接放行。
function ensurePrivacy(onPass, onFinalFail) {
  if (!wx.getPrivacySetting || !wx.requirePrivacyAuthorize) {
    onPass();
    return;
  }
  wx.getPrivacySetting({
    success: function (res) {
      if (!res.needAuthorization) {
        onPass();
        return;
      }
      ask(3);
    },
    fail: function () { onPass(); }
  });

  function ask(left) {
    wx.showModal({
      title: '隐私保护提示',
      content: '使用选择图片、导入排班等功能前，需要同意《用户隐私保护指引》。是否同意？',
      confirmText: '同意',
      cancelText: '拒绝',
      success: function (r) {
        if (r.confirm) {
          wx.requirePrivacyAuthorize({
            success: function () { onPass(); },
            fail: function () {
              if (left > 1) ask(left - 1);
              else if (onFinalFail) onFinalFail();
            }
          });
          return;
        }
        if (left > 1) ask(left - 1);
        else if (onFinalFail) onFinalFail();
      },
      fail: function () {
        if (left > 1) ask(left - 1);
        else if (onFinalFail) onFinalFail();
      }
    });
  }
}

module.exports = { ensurePrivacy };
