/**
 * 黄历页页面层测试（T-2.x / T-6.9）
 *
 * 历法计算全在 `utils/almanac.js`（另有单测），这里只钉两件**页面侧**的事：
 *  1. **分享链接能把接收方带到同一天**：`onLoad(options)` 要认 `y/m/d`，
 *     并且用不合法参数打开时不能白屏、不能跳到 1900 年；
 *  2. **分享卡片用的是当前选中的那一天**，不是「今天」——用户翻到别的月份再分享，
 *     对方看到的应该是同一张黄历。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

let pageConfig = null
const appStub = { onSiteConfig: () => () => {} }

globalThis.Page = (config) => {
  pageConfig = config
}
globalThis.getApp = () => appStub
globalThis.wx = globalThis.wx || {}

await import('../pages/huangli/huangli.js')

const mount = () => {
  const page = { ...pageConfig, data: structuredClone(pageConfig.data) }
  page.setData = (patch) => Object.assign(page.data, patch)
  return page
}

test('onLoad 带 y/m/d：直接落到分享的那一天', () => {
  const page = mount()
  page.onLoad({ y: '2026', m: '9', d: '24' })

  assert.deepEqual(
    { year: page.data.input.year, month: page.data.input.month, day: page.data.input.day },
    { year: 2026, month: 9, day: 24 }
  )
  assert.equal(page.data.header.solarText, '2026.09.24')
  assert.equal(page.data.month.cells.length > 0, true, '月历网格要算出来，不能是空页')
})

test('onLoad 没有参数（tabBar 进入）用当前时刻', () => {
  const page = mount()
  page.onLoad({})
  const now = new Date()

  assert.equal(page.data.input.year, now.getFullYear())
  assert.equal(page.data.input.month, now.getMonth() + 1)
  assert.equal(page.data.input.day, now.getDate())
})

test('链接参数被手改坏：照常渲染今天，不抛错', () => {
  const page = mount()
  page.onLoad({ y: '1899', m: '99', d: 'x' })
  const now = new Date()

  assert.equal(page.data.input.year, now.getFullYear())
  assert.equal(page.data.input.day, now.getDate())
  assert.equal(page.data.month.cells.length > 0, true)
})

test('分享卡片用当前选中的那一天（不是今天）', () => {
  const page = mount()
  page.onLoad({ y: '2024', m: '2', d: '29' })

  const card = page.onShareAppMessage()
  assert.equal(card.path, '/pages/huangli/huangli?y=2024&m=2&d=29')
  assert.equal(card.title, '2024年2月29日 · 黄历与四柱')

  const timeline = page.onShareTimeline()
  assert.equal(timeline.query, 'y=2024&m=2&d=29')
  assert.equal(timeline.query.indexOf('?') === -1, true)
})

test('翻月后分享的是翻到的那一天', () => {
  const page = mount()
  page.onLoad({ y: '2026', m: '9', d: '30' })

  page.nextMonth()
  assert.equal(page.data.input.month, 10)
  assert.equal(page.onShareAppMessage().path, '/pages/huangli/huangli?y=2026&m=10&d=30')

  page.backToToday()
  const card = page.onShareAppMessage()
  const now = new Date()
  assert.equal(card.path, `/pages/huangli/huangli?y=${now.getFullYear()}&m=${now.getMonth() + 1}&d=${now.getDate()}`)
})
