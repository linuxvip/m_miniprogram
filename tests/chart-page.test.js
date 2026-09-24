/**
 * 命盘页里与「命例库跳进来」有关的那一小段（T-3.4 / T-1.15）。
 *
 * 整页渲染靠肉眼验收（这里不重复算一遍命盘），但有两件事必须钉住：
 *  1. **反馈认不回来时不能显示**：手动排盘没有 cid，如果只要 globalData 里
 *     还留着上一条命例就渲染，用户从命例库返回后再自己排一次盘，会看到别人的原文；
 *  2. **分享链接不能带上 cid**：接收方本地没有那条命例，带上它只是把命例 id 泄出去。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

let pageConfig = null
let appStub = { globalData: {} }

globalThis.Page = (config) => {
  pageConfig = config
}
globalThis.getApp = () => appStub

await import('../pages/chart/chart.js')

const mount = () => {
  const page = { ...pageConfig, data: structuredClone(pageConfig.data) }
  page.setData = (patch) => Object.assign(page.data, patch)
  return page
}

test('cid 对得上时才把命例原文与来源铺到页面上', () => {
  appStub = { globalData: { pendingCase: { id: 3699, feedback: '原文很长…', source: '巾箱秘术' } } }
  const page = mount()
  page._query = { t: 'DIRECT', cid: '3699' }

  page.loadCaseContext()
  assert.equal(page.data.caseFeedback, '原文很长…')
  assert.equal(page.data.caseSource, '巾箱秘术')
})

test('cid 对不上 / 没有 cid / 本地没有命例，都不渲染板块', () => {
  appStub = { globalData: { pendingCase: { id: 3699, feedback: '原文', source: '巾箱秘术' } } }

  const otherCase = mount()
  otherCase._query = { t: 'DIRECT', cid: '1' }
  otherCase.loadCaseContext()
  assert.equal(otherCase.data.caseFeedback, '')

  // 从命例库返回后再自己排一次盘：URL 里没有 cid，不能翻出上一条命例
  const manual = mount()
  manual._query = { t: 'SOLAR', y: '1990' }
  manual.loadCaseContext()
  assert.equal(manual.data.caseFeedback, '')
  assert.equal(manual.data.caseSource, '')

  appStub = { globalData: {} }
  const cold = mount()
  cold._query = { t: 'DIRECT', cid: '3699' }
  cold.loadCaseContext()
  assert.equal(cold.data.caseFeedback, '', '小程序被回收过（globalData 没了）也要安静降级')
})

test('分享路径丢掉 cid，其余参数原样带出去', () => {
  const page = mount()
  page._query = { t: 'DIRECT', g: 'MALE', yg: '%E7%94%B2', yz: '%E5%AD%90', cid: '3699' }

  const query = page.serializeQuery()
  assert.equal(query.indexOf('cid') === -1, true)
  assert.equal(query.indexOf('t=DIRECT') >= 0, true)
  assert.equal(query.indexOf('yg=%E7%94%B2') >= 0, true, '已经编码过的值不能再动')
})
