// 日历组件：渲染月历网格；批量/导入按钮放在网格外的操作条
// props: cells / batchLabel / batchOn / showImport
// events: selectday / longpressday / batch / import
Component({
  properties: {
    cells: { type: Array, value: [] },
    batchLabel: { type: String, value: '批量' },
    batchOn: { type: Boolean, value: false },
    showImport: { type: Boolean, value: false }
  },
  methods: {
    onTap(e) {
      this.triggerEvent('selectday', {
        date: e.currentTarget.dataset.date,
        shift: e.currentTarget.dataset.shift || '',
        inMonth: e.currentTarget.dataset.inmonth
      });
    },
    onLongPress(e) {
      // 长按 → 进入多选模式（由父页面处理）
      this.triggerEvent('longpressday', {
        date: e.currentTarget.dataset.date,
        inMonth: e.currentTarget.dataset.inmonth
      });
    },
    onBatch() {
      this.triggerEvent('batch');
    },
    onImport() {
      this.triggerEvent('import');
    }
  }
});
