const { saveDraft } = require('../../utils/draft')
const { rowLabels } = require('../../utils/export-options')
const { editGrid, statsFor } = require('../../utils/editor')
const { createPatternPdf } = require('../../utils/pdf')
Page({
  data: {
    exportOpen: false,
    exportPreviewPath: '',
    exportShape: 'square',
    exportGrid: 'full',
    exportLabels: 'all',
    previewPath: '',
    showCodes: false,
    editorOpen: false,
    editMode: 'replace',
    selectedCodes: [],
    fromCode: '',
    targetCode: '',
    search: '',
    paletteView: [],
    paletteLoading: false,
    paletteError: false,
    canUndo: false,
    canRedo: false,
    grid: [],
    colorStats: [],
    gridWidth: 0,
    gridHeight: 0,
    cellSize: 20,
    zoomLevel: 1,
    zoomPercent: 100,
    canvasWidth: 0,
    canvasHeight: 0,
    totalCount: 0,
    saving: false
  },

  // ==================== 生命周期 ====================

  onLoad() {
    this._disposed = false
    this._previewRetries = 0
    const app = getApp()
    const data = app.globalData.resultData

    if (!data || !data.grid || data.grid.length === 0) {
      wx.showToast({ title: '数据丢失，请重新生成', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    this._palette = data.colorStats.map(c => ({ ...c }))
    this._undo = []
    this._redo = []
    this.loadPalette()
    let totalCount = 0
    data.colorStats.forEach(c => { totalCount += c.count })

    this.setData({
      grid: data.grid,
      colorStats: data.colorStats,
      gridWidth: data.width,
      gridHeight: data.height,
      totalCount
    })

    this.calcDisplayLayout()
  },

  async loadPalette() {
    if (this.data.paletteLoading || this._disposed) return
    this.setData({ paletteLoading: true, paletteError: false })
    this.refreshPalette()
    try {
      const res = await wx.cloud.callFunction({ name: 'generateBeadPattern', data: { action: 'palette' } })
      if (this._disposed) return
      if (!res.result || !res.result.success || !Array.isArray(res.result.data) || !res.result.data.length) throw new Error('色库加载失败')
      this._palette = Array.from(new Map([...res.result.data, ...this._palette].map(c => [c.code, c])).values())
    } catch (e) { if (!this._disposed) this.setData({ paletteError: true }) }
    if (!this._disposed) this.setData({ paletteLoading: false })
    if (!this._disposed) this.refreshPalette()
  },

  refreshPalette() {
    const q = this.data.search.toLowerCase()
    this.setData({ paletteView: this._palette.filter(c => String(c.code).toLowerCase().includes(q) || String(c.name || '').includes(q)) })
  },
  onSearch(e) { this.setData({ search: e.detail.value }); this.refreshPalette() },
  toggleEditor() { this.setData({ editorOpen: !this.data.editorOpen }) },
  setEditMode(e) { this.setData({ editMode: e.currentTarget.dataset.mode, selectedCodes: [], fromCode: '' }) },
  chooseUsed(e) {
    const code = e.currentTarget.dataset.code
    if (this.data.editMode === 'delete') {
      const selected = this.data.selectedCodes.slice(), i = selected.indexOf(code)
      if (i < 0) selected.push(code); else selected.splice(i, 1)
      this.setData({ selectedCodes: selected })
    } else this.setData({ fromCode: code })
  },
  chooseTarget(e) { this.setData({ targetCode: e.currentTarget.dataset.code }); if (this.data.editMode === 'paint') this.setData({ editorOpen: false }) },
  commitEdit(action) {
    this._undo.push(this.data.grid.map(row => row.slice()))
    if (this._undo.length > 30) this._undo.shift()
    this._redo = []
    this.applyGrid(editGrid(this.data.grid, action))
  },
  applyGrid(grid) {
    const colorStats = statsFor(grid, this._palette)
    this.setData({ grid, colorStats, totalCount: colorStats.reduce((n,c) => n+c.count,0), canUndo: this._undo.length > 0, canRedo: this._redo.length > 0 })
    getApp().globalData.resultData = { grid, colorStats, width: this.data.gridWidth, height: this.data.gridHeight }
    if (!saveDraft(getApp().globalData.resultData)) wx.showToast({ title: '草稿保存失败，请及时导出', icon: 'none' })
    this.drawDisplay()
  },
  undoEdit() { if (!this._undo.length) return; this._redo.push(this.data.grid); this.applyGrid(this._undo.pop()) },
  redoEdit() { if (!this._redo.length) return; this._undo.push(this.data.grid); this.applyGrid(this._redo.pop()) },
  mirrorGrid(e) { this.commitEdit({ type: 'mirror', axis: e.currentTarget.dataset.axis }) },
  confirmColorEdit() {
    const { editMode, selectedCodes, fromCode, targetCode } = this.data
    if (editMode === 'delete') {
      if (!selectedCodes.length) return
      const count = this.data.colorStats.filter(c => selectedCodes.includes(c.code)).reduce((n,c) => n+c.count,0)
      wx.showModal({ title: '删除颜色', content: '将清空 ' + selectedCodes.length + ' 种颜色，共 ' + count + ' 颗，可撤销。', success: res => {
        if (res.confirm) { this.commitEdit({ type: 'delete', codes: selectedCodes }); this.setData({ selectedCodes: [] }) }
      } })
    } else if (fromCode && targetCode && fromCode !== targetCode) this.commitEdit({ type: 'replace', from: fromCode, to: targetCode })
  },
  paintCell(e) {
    if (this.data.editMode !== 'paint' || !this.data.targetCode) return
    const touch = e.changedTouches && e.changedTouches[0]
    if (!touch) return
    wx.createSelectorQuery().select('#previewImage').boundingClientRect(rect => {
      if (!rect) return
      const x = Math.floor((touch.clientX-rect.left)/rect.width*this.data.gridWidth)
      const y = Math.floor((touch.clientY-rect.top)/rect.height*this.data.gridHeight)
      if (x>=0 && y>=0 && x<this.data.gridWidth && y<this.data.gridHeight) this.commitEdit({type:'paint', x,y,code:this.data.targetCode})
    }).exec()
  },

  onReady() {
    if (this.data.grid.length > 0) {
      wx.nextTick(() => this.drawDisplay())
    }
  },

  // ==================== 显示布局计算 ====================

  calcDisplayLayout() {
    const { gridWidth, zoomLevel } = this.data
    const sysInfo = wx.getSystemInfoSync()
    const maxWidth = (sysInfo.windowWidth * (750 - 48 - 64) / 750) - 4
    const maxHeight = sysInfo.windowWidth * 520 / 750 - 4
    const cellSize = Math.min(maxWidth / gridWidth, maxHeight / this.data.gridHeight)

    this.setData({
      cellSize,
      canvasWidth: cellSize * zoomLevel * gridWidth,
      canvasHeight: cellSize * zoomLevel * this.data.gridHeight,
      zoomPercent: Math.round(zoomLevel * 100)
    })
  },

  // ==================== 屏幕显示渲染（仅网格） ====================

  onPreviewMode(e) {
    this.setData({ showCodes: e.currentTarget.dataset.mode === 'pattern' })
    this.drawDisplay()
  },

  onUnload() {
    this._disposed = true
    clearTimeout(this._previewTimer)
  },

  drawDisplay() {
    if (this._disposed) return
    clearTimeout(this._previewTimer)
    const renderId = this._previewRenderId = (this._previewRenderId || 0) + 1
    const { grid, gridWidth, gridHeight, cellSize, zoomLevel, colorStats } = this.data
    const dcs = this.data.showCodes ? Math.max(24, cellSize * zoomLevel) : Math.max(4, cellSize * zoomLevel)
    const cw = dcs * gridWidth
    const ch = dcs * gridHeight

    const query = wx.createSelectorQuery()
    query.select('#gridCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (this._disposed || renderId !== this._previewRenderId) return
        if (!res || !res[0] || !res[0].node) {
          if ((this._previewRetries = (this._previewRetries || 0) + 1) <= 5) this._previewTimer = setTimeout(() => this.drawDisplay(), 150)
          else wx.showToast({ title: '预览画布不可用，请重新进入', icon: 'none' })
          return
        }

        this._previewRetries = 0
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = Math.min(2, wx.getSystemInfoSync().pixelRatio, 4096 / Math.max(cw, ch))

        canvas.width = cw * dpr
        canvas.height = ch * dpr
        ctx.scale(dpr, dpr)

        ctx.clearRect(0, 0, cw, ch)

        const colorMap = {}
        colorStats.forEach(c => { colorMap[c.code] = c.hex })

        this.drawGrid(ctx, 0, 0, dcs, gridWidth, gridHeight, grid, colorMap, this.data.showCodes)
        this._canvas = canvas
        wx.canvasToTempFilePath({
          canvas,
          success: ({ tempFilePath }) => { if (!this._disposed && renderId === this._previewRenderId) this.setData({ previewPath: tempFilePath }) },
          fail: () => { if (!this._disposed && renderId === this._previewRenderId) wx.showToast({ title: '预览生成失败，请重新生成', icon: 'none' }) }
        })
      })
  },

  // ==================== 网格绘制（显示+导出共用） ====================

  stopPanelTouch() {},
  openExport() {
    this.setData({ exportOpen: true })
    this.drawExportPreview()
  },
  closeExport() { this.setData({ exportOpen: false }) },
  drawExportPreview() {
    const renderId = this._exportRenderId = (this._exportRenderId || 0) + 1
    wx.createSelectorQuery().select('#exportCanvas').fields({ node: true }).exec(res => {
      if (this._disposed || renderId !== this._exportRenderId || !res || !res[0] || !res[0].node) return
      const canvas = res[0].node
      canvas.width = 600; canvas.height = 260
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0,0,600,260)
      const grid = [Array(12).fill('G10'), Array(12).fill('G10'), ['C16','C16','C16','C16','C16','C16','H19','H19','H19','H19','H19','H19'], Array(12).fill('H19')]
      this.drawGrid(ctx, 24, 30, 46, 12, 4, grid, { G10: '#C88731', C16: '#1757A8', H19: '#F4ECD9' }, true, { shape: this.data.exportShape, grid: this.data.exportGrid, labels: this.data.exportLabels })
      wx.canvasToTempFilePath({ canvas, success: r => { if (!this._disposed && renderId === this._exportRenderId) this.setData({ exportPreviewPath: r.tempFilePath }) } })
    })
  },

  setExportOption(e) {
    const { key, value } = e.currentTarget.dataset
    if (['exportShape', 'exportGrid', 'exportLabels'].includes(key)) { this.setData({ [key]: value }); this.drawExportPreview() }
  },

  drawGrid(ctx, ox, oy, cellSize, gw, gh, grid, colorMap, showCodes = true, options = {}) {
    // 1. 填充色块 + 色号文字
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const code = grid[y][x]
        if (!code) continue
        const hex = colorMap[code] || '#CCCCCC'
        const px = ox + x * cellSize
        const py = oy + y * cellSize

        ctx.fillStyle = hex
        if (!options.shape || options.shape === 'square') ctx.fillRect(px, py, cellSize, cellSize)
        else {
          ctx.beginPath()
          ctx.arc(px + cellSize/2, py + cellSize/2, cellSize*.44, 0, Math.PI*2)
          ctx.fill()
          if (options.shape === 'hollow') {
            ctx.fillStyle = '#FFFFFF'
            ctx.beginPath()
            ctx.arc(px + cellSize/2, py + cellSize/2, cellSize*.16, 0, Math.PI*2)
            ctx.fill()
          }
        }
      }
    }
    if (!showCodes) return
    const gridMode = options.grid || 'full'
    if (gridMode !== 'none') {
      for (let axis=0;axis<2;axis++) {
        const count=axis?gh:gw
        for(let i=0;i<=count;i++) {
          if(gridMode==='guides' && i%5 && i!==count) continue
          ctx.strokeStyle=i%10===0?'#B07B55':i%5===0?'#9B9290':'#CDD0D3'
          ctx.lineWidth=i%10===0?1.2:i%5===0?.8:.4
          ctx.beginPath()
          ctx.moveTo(ox+(axis?0:i*cellSize),oy+(axis?i*cellSize:0))
          ctx.lineTo(ox+(axis?gw*cellSize:i*cellSize),oy+(axis?i*cellSize:gh*cellSize))
          ctx.stroke()
        }
      }
    }
    for(let y=0;y<gh;y++) for(const label of rowLabels(grid[y], options.labels || 'all')) {
      const px=ox+label.x*cellSize, py=oy+y*cellSize
      const fontSize=Math.max(6,Math.min(12,Math.floor(cellSize*.42)))
      ctx.font=`bold ${fontSize}px sans-serif`
      ctx.textAlign='center';ctx.textBaseline='middle'
      if(label.span>1 || options.shape==='hollow') {
        const tw=ctx.measureText(label.text).width+10
        ctx.fillStyle='#FFFFFF'
        ctx.fillRect(px+label.span*cellSize/2-tw/2,py+cellSize/2-fontSize/2-2,tw,fontSize+4)
        ctx.fillStyle='#243247'
      } else ctx.fillStyle=this.getTextColor(colorMap[grid[y][label.x]] || '#FFFFFF')
      ctx.fillText(label.text,px+label.span*cellSize/2,py+cellSize/2)
    }
  },

  // ==================== 文字颜色适配 ====================

  getTextColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return lum > 0.45 ? '#1A1A1A' : '#FFFFFF'
  },

  // ==================== 色号统计栏绘制（导出用） ====================

  drawStats(ctx, x, y, w, h, colorStats, totalCount) {
    const cols = Math.max(1, Math.floor(w / 180))
    const colW = w / cols
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#243247'
    ctx.font = 'bold 18px sans-serif'
    ctx.fillText('色号清单 · ' + colorStats.length + ' 色 · 共 ' + totalCount + ' 颗', x, y + 20)
    colorStats.forEach((c, i) => {
      const px = x + (i % cols) * colW, py = y + 60 + Math.floor(i / cols) * 38
      ctx.fillStyle = i % 2 ? '#F4F6F9' : '#FAFBFC'
      ctx.fillRect(px, py - 15, colW - 12, 32)
      ctx.fillStyle = c.hex
      ctx.fillRect(px + 8, py - 10, 20, 20)
      ctx.strokeStyle = '#CCD2DC'
      ctx.strokeRect(px + 8, py - 10, 20, 20)
      ctx.fillStyle = '#243247'
      ctx.font = '14px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(c.code, px + 38, py)
      ctx.textAlign = 'right'
      ctx.fillText(c.count + '颗', px + colW - 24, py)
    })
  },

  async handleExportPdf() {
    if (this.data.saving) return
    this.setData({ saving: true })
    wx.showLoading({ title: '生成 PDF...', mask: true })
    try {
      const content = createPatternPdf(this.data.grid, this.data.colorStats, { shape: this.data.exportShape, grid: this.data.exportGrid, labels: this.data.exportLabels })
      const filePath = wx.env.USER_DATA_PATH + '/Mard-pattern.pdf'
      await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({ filePath, data: content, encoding: 'utf8', success: resolve, fail: reject }))
      await new Promise((resolve, reject) => wx.openDocument({ filePath, fileType: 'pdf', showMenu: true, success: resolve, fail: reject }))
    } catch (e) {
      wx.showToast({ title: 'PDF 导出失败，请重试', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ saving: false })
    }
  },

  // ==================== 缩放控制 ====================

  onZoomIn() {
    if (this.data.zoomLevel >= 5) return
    const zoomLevel = Math.min(5, +(this.data.zoomLevel + 0.25).toFixed(2))
    this.setData({ zoomLevel })
    this.calcDisplayLayout()
    wx.nextTick(() => this.drawDisplay())
  },

  onZoomOut() {
    if (this.data.zoomLevel <= 0.5) return
    const zoomLevel = Math.max(0.5, +(this.data.zoomLevel - 0.25).toFixed(2))
    this.setData({ zoomLevel })
    this.calcDisplayLayout()
    wx.nextTick(() => this.drawDisplay())
  },

  // ==================== 导出高清图纸 ====================

  async handleSaveImage() {
    if (this.data.saving) return
    this.setData({ saving: true })
    wx.showLoading({ title: '生成高清图纸...', mask: true })

    try {
      const { grid, gridWidth, gridHeight, colorStats, totalCount } = this.data

      // 导出专用格子大小
      const exportCellSize = Math.max(22, Math.min(32, Math.floor(700 / gridWidth)))
      const gridPxW = exportCellSize * gridWidth
      const gridPxH = exportCellSize * gridHeight

      const padding = 32
      const contentStartY = 100
      const totalW = Math.max(760, gridPxW) + padding * 2
      const statsY = contentStartY + gridPxH + 32
      const cols = Math.max(1, Math.floor((totalW - padding * 2) / 180))
      const totalH = statsY + 80 + Math.ceil(colorStats.length / cols) * 38 + padding
      // 限制单份像素约 16 MB，同时保留小图的两倍清晰度。
      const dpr = Math.min(2, 4096 / Math.max(totalW, totalH), Math.sqrt(4000000 / (totalW * totalH)))

      // 创建离屏 Canvas
      const canvas = wx.createOffscreenCanvas({
        type: '2d',
        width: Math.floor(totalW * dpr),
        height: Math.floor(totalH * dpr)
      })
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)

      // 白色背景
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, totalW, totalH)

      // ★ 顶部：尺寸标注
      ctx.fillStyle = '#333333'
      ctx.font = 'bold 16px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const labelText = '宽：' + gridWidth + '格 × 高：' + gridHeight + '格'
      ctx.fillText(labelText, totalW / 2, padding - 8)

      // 标注下浅色分隔线
      const labelLineY = 72
      ctx.strokeStyle = '#E5E5E5'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(padding, labelLineY)
      ctx.lineTo(totalW - padding, labelLineY)
      ctx.stroke()

      // 构建颜色映射
      const colorMap = {}
      colorStats.forEach(c => { colorMap[c.code] = c.hex })

      // 左侧：网格
      this.drawGrid(ctx, (totalW - gridPxW) / 2, contentStartY, exportCellSize, gridWidth, gridHeight, grid, colorMap, true, { shape: this.data.exportShape, grid: this.data.exportGrid, labels: this.data.exportLabels })

      this.drawStats(ctx, padding, statsY, totalW - padding * 2, totalH - statsY, colorStats, totalCount)

      // 导出为临时图片
      const tempFilePath = await new Promise((resolve, reject) => {
        wx.canvasToTempFilePath({ canvas, success: (res) => resolve(res.tempFilePath), fail: reject })
      })

      // 保存到相册
      await new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({ filePath: tempFilePath, success: resolve, fail: reject })
      })

      wx.hideLoading()
      wx.showToast({ title: '高清图纸已保存到相册', icon: 'success', duration: 2000 })
    } catch (e) {
      wx.hideLoading()
      if (e.errMsg && e.errMsg.includes('auth deny')) {
        wx.showModal({
          title: '授权提示',
          content: '保存图片需要相册权限，是否前往设置？',
          confirmText: '去设置',
          success: (res) => { if (res.confirm) wx.openSetting() }
        })
      } else {
        wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      }
    } finally {
      this.setData({ saving: false })
    }
  },

  // ==================== 导航 ====================

  onShareAppMessage() { return { title: '把喜欢的照片，变成一颗颗拼豆。', path: '/pages/index/index', imageUrl: '/images/beadlog.jpg' } },
  onShareTimeline() { return { title: '把喜欢的照片，变成一颗颗拼豆。', imageUrl: '/images/beadlog.jpg' } },

  handleRegenerate() {
    wx.navigateBack()
  }
})
