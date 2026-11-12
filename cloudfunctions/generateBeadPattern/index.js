const { generatePattern } = require('./pattern')
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return { success: false, error: '请求参数无效' }
  }
  const { pixelBase64, width: w, height: h } = event
  let pixelBuffer
  if (event.action !== 'palette') {
    if (![w, h].every(v => Number.isInteger(v) && v >= 5 && v <= 100)) {
      return { success: false, error: '尺寸应为5-100之间的整数' }
    }
    const expectedBytes = w * h * 3
    if (typeof pixelBase64 !== 'string' ||
        pixelBase64.length !== 4 * Math.ceil(expectedBytes / 3) ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(pixelBase64)) {
      return { success: false, error: '图片数据编码或长度无效' }
    }
    pixelBuffer = Buffer.from(pixelBase64, 'base64')
    if (pixelBuffer.length !== expectedBytes) {
      return { success: false, error: '图片数据长度无效' }
    }
  }

  try {
    // 1. 分批读取色号数据库
    const countRes = await db.collection('mard-colors').count()
    const total = countRes.total
    const MAX_LIMIT = 100
    const batchTimes = Math.ceil(total / MAX_LIMIT)
    const tasks = []
    for (let i = 0; i < batchTimes; i++) {
      tasks.push(
        db.collection('mard-colors').skip(i * MAX_LIMIT).limit(MAX_LIMIT).get()
      )
    }
    const batchResults = await Promise.all(tasks)
    const colorList = []
    batchResults.forEach(res => {
      if (res.data) colorList.push(...res.data)
    })

    if (colorList.length === 0) {
      return { success: false, error: '色号数据库为空，请先导入色号数据' }
    }

    if (event.action === 'palette') return { success: true, data: colorList.map(({code,name,hex}) => ({code,name,hex})) }

    return { success: true, data: generatePattern(pixelBuffer, w, h, colorList, event.options || {}) }
  } catch (err) {
    return { success: false, error: '生成失败：' + (err.message || '未知错误') }
  }
}
