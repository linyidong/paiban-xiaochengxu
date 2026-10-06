// 班次标签组件（props: type）
const { SHIFT_COLOR, SHIFT_LABEL } = require('../../utils/shift.js');
Component({
  properties: {
    type: { type: String, value: '' }
  },
  data: { color: '', label: '' },
  observers: {
    'type': function (t) {
      this.setData({ color: SHIFT_COLOR[t] || '#9CA3AF', label: SHIFT_LABEL[t] || t });
    }
  }
});
