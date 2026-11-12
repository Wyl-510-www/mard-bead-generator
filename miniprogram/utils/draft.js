const KEY = 'mard.latestPattern'
function saveDraft(data) {
  try { wx.setStorageSync(KEY, data); return true } catch (e) { return false }
}
function readDraft() {
  try {
    const d = wx.getStorageSync(KEY)
    if (!d || !Number.isInteger(d.width) || !Number.isInteger(d.height) || d.width < 5 || d.width > 100 || d.height < 5 || d.height > 100 || !Array.isArray(d.grid) || d.grid.length !== d.height || !Array.isArray(d.colorStats)) return null
    const codes = new Set()
    for (const c of d.colorStats) {
      if (!c || typeof c.code !== 'string' || !c.code.trim() || codes.has(c.code) || typeof c.hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(c.hex)) return null
      codes.add(c.code)
    }
    const counts = new Map()
    for (const row of d.grid) {
      if (!Array.isArray(row) || row.length !== d.width) return null
      for (const code of row) {
        if (code === null) continue
        if (!codes.has(code)) return null
        counts.set(code, (counts.get(code) || 0) + 1)
      }
    }
    const colorStats = d.colorStats.filter(c => counts.has(c.code))
      .map(c => ({ ...c, count: counts.get(c.code) })).sort((a, b) => b.count - a.count)
    return { ...d, colorStats }
  } catch (e) { return null }
}
module.exports = { saveDraft, readDraft }
