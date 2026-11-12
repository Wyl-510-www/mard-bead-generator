const { saveDraft, readDraft } = require('../../utils/draft')
const { sampleRgb } = require('../../utils/image')
Page({
  data: {
    hasDraft: false,
    imageUrl: '',
    imageRatio: 1,
    width: 100,
    height: 100,
    lockRatio: false,
    mode: 'photo',
    maxColors: 48,
    limitColors: false,
    dither: false,
    generating: false
  },

  onShow() { this.setData({ hasDraft: !!readDraft() }) },
  restoreDraft() {
    const draft = readDraft()
    if (!draft) { this.setData({ hasDraft: false }); return }
    getApp().globalData.resultData = draft
    wx.navigateTo({ url: '/pages/result/result' })
  },
  onShareAppMessage() { return { title: '把喜欢的照片，变成一颗颗拼豆。', path: '/pages/index/index', imageUrl: '/images/beadlog.jpg' } },
  onShareTimeline() { return { title: '把喜欢的照片，变成一颗颗拼豆。', imageUrl: '/images/beadlog.jpg' } },

  // ========== 图片选择 ==========

  handleChooseImage() {
    wx.showActionSheet({
      itemList: ['从相册选择', '拍照'],
      success: (res) => {
        const sourceType = res.tapIndex === 0 ? ['album'] : ['camera']
        wx.chooseImage({
          count: 1,
          sizeType: ['compressed'],
          sourceType,
          success: async (chooseRes) => {
            const tempFilePath = chooseRes.tempFilePaths[0]
            this.setData({ imageUrl: tempFilePath })
            try {
              const imgInfo = await wx.getImageInfo({ src: tempFilePath })
              this.setData({ imageRatio: imgInfo.width / imgInfo.height })
            } catch (e) { /* 忽略 */ }
          }
        })
      }
    })
  },

  onLimitColorsChange(e) { this.setData({ limitColors: e.detail.value }) },
  onColorsChange(e) { this.setData({ maxColors: Number(e.detail.value) }) },
  onDitherChange(e) { this.setData({ dither: e.detail.value }) },

  handleRemoveImage() {
    this.setData({ imageUrl: '', imageRatio: 1, lockRatio: false })
  },

  // ========== 尺寸输入 ==========

  onWidthInput(e) {
    const val = parseInt(e.detail.value) || 0
    if (this.data.lockRatio && this.data.imageRatio && val > 0) {
      const h = Math.round(val / this.data.imageRatio)
      this.setData({ width: val, height: this.clamp(h) })
    } else {
      this.setData({ width: val })
    }
  },

  onHeightInput(e) {
    const val = parseInt(e.detail.value) || 0
    if (this.data.lockRatio && this.data.imageRatio && val > 0) {
      const w = Math.round(val * this.data.imageRatio)
      this.setData({ height: val, width: this.clamp(w) })
    } else {
      this.setData({ height: val })
    }
  },

  // ========== 失焦校验 ==========

  onWidthBlur(e) {
    let val = parseInt(e.detail.value)
    if (isNaN(val) || val < 5) {
      wx.showToast({ title: '最小尺寸为5', icon: 'none', duration: 1200 })
      val = 5
    } else if (val > 100) {
      wx.showToast({ title: '最大尺寸为100', icon: 'none', duration: 1200 })
      val = 100
    }
    if (this.data.lockRatio && this.data.imageRatio) {
      const h = Math.round(val / this.data.imageRatio)
      this.setData({ width: val, height: this.clamp(h) })
    } else {
      this.setData({ width: val })
    }
  },

  onHeightBlur(e) {
    let val = parseInt(e.detail.value)
    if (isNaN(val) || val < 5) {
      wx.showToast({ title: '最小尺寸为5', icon: 'none', duration: 1200 })
      val = 5
    } else if (val > 100) {
      wx.showToast({ title: '最大尺寸为100', icon: 'none', duration: 1200 })
      val = 100
    }
    if (this.data.lockRatio && this.data.imageRatio) {
      const w = Math.round(val * this.data.imageRatio)
      this.setData({ height: val, width: this.clamp(w) })
    } else {
      this.setData({ height: val })
    }
  },

  // ========== 加减按钮 ==========

  onWidthUp() {
    this.adjustWidth(1)
  },

  onWidthDown() {
    this.adjustWidth(-1)
  },

  onHeightUp() {
    this.adjustHeight(1)
  },

  onHeightDown() {
    this.adjustHeight(-1)
  },

  adjustWidth(delta) {
    let w = (this.data.width || 20) + delta
    if (w < 5) { wx.showToast({ title: '最小尺寸为5', icon: 'none', duration: 1000 }); w = 5 }
    if (w > 100) { wx.showToast({ title: '最大尺寸为100', icon: 'none', duration: 1000 }); w = 100 }
    if (this.data.lockRatio && this.data.imageRatio) {
      const h = Math.round(w / this.data.imageRatio)
      this.setData({ width: w, height: this.clamp(h) })
    } else {
      this.setData({ width: w })
    }
  },

  adjustHeight(delta) {
    let h = (this.data.height || 20) + delta
    if (h < 5) { wx.showToast({ title: '最小尺寸为5', icon: 'none', duration: 1000 }); h = 5 }
    if (h > 100) { wx.showToast({ title: '最大尺寸为100', icon: 'none', duration: 1000 }); h = 100 }
    if (this.data.lockRatio && this.data.imageRatio) {
      const w = Math.round(h * this.data.imageRatio)
      this.setData({ height: h, width: this.clamp(w) })
    } else {
      this.setData({ height: h })
    }
  },

  clamp(val) {
    return Math.max(5, Math.min(100, val))
  },

  // ========== 快捷尺寸 ==========

  onPreset(e) {
    const w = parseInt(e.currentTarget.dataset.w)
    const h = parseInt(e.currentTarget.dataset.h)
    this.setData({ width: w, height: h, lockRatio: false })
  },

  // ========== 锁定比例 ==========

  onLockRatioChange(e) {
    const lockRatio = e.detail.value
    this.setData({ lockRatio })
    if (lockRatio && this.data.imageRatio) {
      const h = Math.round(this.data.width / this.data.imageRatio)
      this.setData({ height: this.clamp(h) })
    }
  },

  // ========== 像素提取 ==========

  extractPixelData(tempFilePath, width, height, mode = this.data.mode) {
    return new Promise((resolve, reject) => {
      const sw = width * 2, sh = height * 2
      const canvas = wx.createOffscreenCanvas({ type: '2d', width: sw, height: sh })
      const ctx = canvas.getContext('2d')
      const img = canvas.createImage()

      img.onload = () => {
        try {
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, 0, sw, sh)
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          const scale = Math.min(sw / img.width, sh / img.height)
          const dw = img.width * scale, dh = img.height * scale
          ctx.drawImage(img, (sw - dw) / 2, (sh - dh) / 2, dw, dh)
          const imageData = ctx.getImageData(0, 0, sw, sh)
          const rgbBuffer = sampleRgb(imageData.data, width, height, false)
          const base64 = wx.arrayBufferToBase64(rgbBuffer)
          resolve(base64)
        } catch (e) { reject(e) }
      }

      img.onerror = () => reject(new Error('图片加载失败'))
      img.src = tempFilePath
    })
  },

  // ========== 一键生成 ==========

  async handleGenerate() {
    if (this.data.generating) return
    if (!this.data.imageUrl) {
      wx.showToast({ title: '请先选择图片', icon: 'none' })
      return
    }

    if (![this.data.width, this.data.height].every(v => Number.isInteger(v) && v >= 5 && v <= 100)) {
      wx.showToast({ title: '尺寸请输入 5–100', icon: 'none' })
      return
    }
    const { imageUrl, width, height, mode, maxColors, dither } = this.data
    const options = { mode, maxColors: this.data.limitColors ? maxColors : null, dither }
    this.setData({ generating: true })

    try {
      const pixelBase64 = await this.extractPixelData(
        imageUrl, width, height, mode
      )

      wx.cloud.callFunction({
        name: 'generateBeadPattern',
        data: { pixelBase64, width, height, options },
        success: (res) => {
          if (!res.result || !res.result.success) {
            const errMsg = (res.result && res.result.error) ? res.result.error : '云函数返回异常'
            wx.showToast({ title: errMsg, icon: 'none', duration: 2500 })
            return
          }
          const app = getApp()
          app.globalData.resultData = res.result.data
          if (!saveDraft(res.result.data)) wx.showToast({ title: '草稿保存失败，请及时导出', icon: 'none' })
          wx.navigateTo({ url: '/pages/result/result' })
        },
        fail: (err) => {
          wx.showModal({
            title: '调用失败',
            content: err.errMsg || JSON.stringify(err),
            showCancel: false
          })
        },
        complete: () => { this.setData({ generating: false }) }
      })
    } catch (e) {
      this.setData({ generating: false })
      wx.showToast({ title: '图片处理失败，请重试', icon: 'none' })
    }
  }
})
