const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('upload package excludes unused assets and stays within scan budgets', () => {
  const config = JSON.parse(fs.readFileSync('project.config.json', 'utf8'))
  const privateConfig = fs.existsSync('project.private.config.json') ? JSON.parse(fs.readFileSync('project.private.config.json', 'utf8')) : { setting: {} }
  const settings = { ...config.setting, ...privateConfig.setting }
  for (const key of ['minified', 'minifyWXML', 'minifyWXSS', 'ignoreUploadUnusedFiles']) assert.equal(settings[key], true, key)
  const app = JSON.parse(fs.readFileSync('miniprogram/app.json', 'utf8'))
  assert.equal(app.lazyCodeLoading, 'requiredComponents')
  const ignored = name => config.packOptions.ignore.some(rule => rule.type === 'folder' ? name.startsWith(rule.value + '/') : rule.type === 'file' && name === rule.value)
  for (const name of ['miniprogram_npm/x', 'node_modules/x', 'components/cloudTipModal/index.js', 'envList.js', 'images/beadlog.png', 'images/create_cbr.png']) assert.ok(ignored(name), name)
  function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const file = path.join(dir, entry.name)
      const name = path.relative('miniprogram', file).replaceAll('\\', '/')
      if (ignored(name) || ignored(name + '/')) return []
      return entry.isDirectory() ? walk(file) : [file]
    })
  }
  const files = walk('miniprogram')
  let bytes = 0
  for (const file of files) {
    const size = fs.statSync(file).size
    bytes += size
    if (/\.(png|jpe?g|mp3|wav)$/i.test(file)) assert.ok(size < 200 * 1024, file)
    if (/\.(js|wxml|wxss)$/.test(file)) {
      const content = fs.readFileSync(file, 'utf8')
      for (const match of content.matchAll(/['"](\/images\/[^'"]+)['"]/g)) {
        assert.ok(files.includes(path.join('miniprogram', match[1])), match[1])
      }
    }
  }
  assert.ok(bytes < 1.5 * 1024 * 1024, `package source bytes: ${bytes}`)
  console.log(`Upload source estimate: ${files.length} files, ${bytes} bytes (before WeChat compilation)`)
})
