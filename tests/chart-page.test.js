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
import { setAuthImpl, __resetAuthState } from '../utils/auth.js'
import { setUserApiImpl } from '../utils/userApi.js'
import { __resetMemory } from '../utils/storage.js'

let pageConfig = null
let appStub = { globalData: {} }

globalThis.Page = (config) => {
  pageConfig = config
}
globalThis.getApp = () => appStub

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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

/* ==================== 保存到我的案例（T-1.16） ==================== */

/**
 * 这一段的重点是**别把注定失败的请求打出去**：后端逐柱校验干支、gender 只认 1/0，
 * 四柱不全（1900-2100 之外无解）时应该本地拦下并说清楚缺哪一柱。
 */
const toasts = []
globalThis.wx = globalThis.wx || {}
globalThis.wx.showToast = (options) => toasts.push(options && options.title)

const fullChart = {
  year: { gan: '甲', zhi: '子' },
  month: { gan: '丙', zhi: '寅' },
  day: { gan: '戊', zhi: '午' },
  hour: { gan: '庚', zhi: '申' }
}

/** 装一个假的「登录 + 保存案例」，返回记录下来的调用 */
const installSave = (response = { id: 1, created: true }) => {
  const calls = []
  setAuthImpl({
    wxLogin: () => Promise.resolve('code-1'),
    wechatLogin: () => Promise.resolve({ tokens: { access: 'a', refresh: 'r' }, user: { id: 1 } })
  })
  setUserApiImpl({
    post: (path, data) => {
      calls.push({ path, data })
      return Promise.resolve(response)
    }
  })
  return calls
}

const teardownSave = () => {
  setAuthImpl(null)
  setUserApiImpl(null)
  __resetAuthState()
  __resetMemory()
  toasts.length = 0
}

const save = (name, fn) =>
  test(name, async (t) => {
    t.after(teardownSave)
    teardownSave()
    await fn(t)
  })

save('未登录 → 先静默登录 → 保存成功，按钮变「已保存」', async () => {
  const calls = installSave()
  const page = mount()
  page._chart = fullChart
  page._input = { type: 'SOLAR', gender: 'MALE', year: 1990, month: 1, day: 1, hour: 12, minute: 0, name: '张某', sect: 2, timezoneOffset: 8 }

  page.onSaveCase()
  assert.equal(page.data.saveState, 'saving', '请求期间要挡住重复点击')
  assert.equal(page.data.saveLabel, '保存中...')

  await sleep(5)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].path, '/user/cases/')
  assert.equal(calls[0].data.gender, 1)
  assert.equal(calls[0].data.day_ganzhi, '戊午')
  assert.equal(calls[0].data.subject_name, '张某')
  assert.equal(page.data.saveState, 'saved')
  assert.equal(page.data.saveLabel, '已保存')
  assert.deepEqual(toasts, ['已保存到我的案例'])

  // 已保存后再点不再发请求
  page.onSaveCase()
  await sleep(2)
  assert.equal(calls.length, 1)
})

save('同一条命盘再存一次：文案按服务端 created=false 说「已更新」', async () => {
  installSave({ id: 1, created: false })
  const page = mount()
  page._chart = fullChart
  page._input = { type: 'SOLAR', gender: 'FEMALE', sect: 2 }

  page.onSaveCase()
  await sleep(5)
  assert.deepEqual(toasts, ['已在你的案例中，已更新信息'])
})

save('四柱不全：本地拦下，不发请求并说清缺哪一柱', async () => {
  const calls = installSave()
  const page = mount()
  page._chart = { ...fullChart, hour: null }
  page._input = { type: 'SOLAR', gender: 'MALE', sect: 2 }

  page.onSaveCase()
  await sleep(5)
  assert.equal(calls.length, 0, '缺柱的请求发出去也只会 400')
  assert.equal(page.data.saveState, 'idle')
  assert.equal(toasts.length, 1)
  assert.equal(toasts[0].indexOf('时柱') >= 0, true)
})

save('保存失败：回到可点状态并提示原因', async () => {
  setAuthImpl({
    wxLogin: () => Promise.resolve('code-1'),
    wechatLogin: () => Promise.resolve({ tokens: { access: 'a', refresh: 'r' }, user: { id: 1 } })
  })
  setUserApiImpl({ post: () => Promise.reject(new Error('网络连接失败')) })
  const page = mount()
  page._chart = fullChart
  page._input = { type: 'SOLAR', gender: 'MALE', sect: 2 }

  page.onSaveCase()
  await sleep(5)
  assert.equal(page.data.saveState, 'idle')
  assert.equal(page.data.saveLabel, '保存案例')
  assert.deepEqual(toasts, ['网络连接失败'], '失败要说清原因，不能静默')
})
