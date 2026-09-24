/**
 * 命例库**页面层**测试（T-3.1 / T-3.7 / T-3.8）
 *
 * 这一层没法靠界面 e2e 覆盖（开发者工具的自动化树点不到卡片、也扛不住多次重载），
 * 但恰恰是「错了会很难查」的地方，所以在这里用假接口把整页跑起来：
 *
 *  1. **请求序号**：筛选连着改时，先发的请求可能后回来 —— 丢掉过期响应，别让
 *     「条件是 A、列表是 B」这种脏状态留在页面上；
 *  2. **输入防抖**：关键词与四柱都是边打边筛，不防抖会把接口打爆；
 *  3. **加载更多去重**：连点两次不产生重复卡片；
 *  4. **失败后的重试语义**：首屏失败重拉第一页，「加载更多」失败续拉下一页；
 *  5. **跨页面状态保持**：筛选与已加载条数写进 `app.globalData`，回来能复原。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { PAGE_SIZE } from '../utils/cases.js'
import { setGetImpl, SOURCES_PATH as SOURCES } from '../utils/casesApi.js'
import { setUserApiImpl, USER_PATHS } from '../utils/userApi.js'
import { setAuthImpl, __resetAuthState, login, logout } from '../utils/auth.js'
import { __resetMemory } from '../utils/storage.js'

let pageConfig = null
let appStub = { globalData: {} }
const navigateCalls = []

globalThis.Page = (config) => {
  pageConfig = config
}
globalThis.getApp = () => appStub
const toasts = []
globalThis.wx = {
  stopPullDownRefresh() {},
  navigateTo(options) {
    navigateCalls.push(options)
  },
  showToast(options) {
    toasts.push(options && options.title)
  }
}

await import('../pages/library/library.js')

/* ---------------- 测试脚手架 ---------------- */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const rawCase = (id, extra = {}) => ({
  id,
  source: '巾箱秘术',
  gender: 1,
  year_ganzhi: '甲子',
  month_ganzhi: '丙寅',
  day_ganzhi: '戊午',
  hour_ganzhi: '庚申',
  feedback: '第 ' + id + ' 条反馈',
  label: JSON.stringify({ 出身: '农村普通家庭', 学历: '本科' }),
  ...extra
})

/** 造一页接口响应：ids 是这一页命例的 id */
const pagePayload = (ids, { count = 100, page = 1 } = {}) => ({
  count,
  next: page * PAGE_SIZE < count ? `http://www.minghaishiyi.cn/api/destiny-cases/?page=${page + 1}&page_size=${PAGE_SIZE}` : null,
  previous: null,
  results: ids.map((id) => rawCase(id))
})

/** 把 wxml 里的 `cases[0].expanded` 写法也支持上 */
const setByPath = (target, path, value) => {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.')
  let cursor = target
  for (let i = 0; i < parts.length - 1; i += 1) cursor = cursor[parts[i]]
  cursor[parts[parts.length - 1]] = value
}

const mount = () => {
  const page = { ...pageConfig, data: structuredClone(pageConfig.data) }
  page.setData = (patch) => {
    Object.keys(patch).forEach((key) => setByPath(page.data, key, patch[key]))
  }
  return page
}

/** 装一个假接口，返回它记录下来的调用 */
const install = (handler) => {
  const calls = []
  const fakeGet = (path, options) => {
    calls.push({ path, options })
    return Promise.resolve(handler(path, options, calls.length))
  }
  setGetImpl(fakeGet)
  return calls
}

/** 默认实现：第一页 12 条、来源正常返回 */
const normalHandler = (path, options) => {
  if (path === SOURCES) return { sources: ['巾箱秘术', '铁口擂台'] }
  const page = Number((options.params && options.params.page) || 1)
  const start = (page - 1) * PAGE_SIZE + 1
  return pagePayload(Array.from({ length: PAGE_SIZE }, (_, i) => start + i), { page })
}

const teardown = () => {
  setGetImpl(null)
  setUserApiImpl(null)
  __resetAuthState()
  __resetMemory()
  appStub = { globalData: {} }
  toasts.length = 0
}

/**
 * 每个用例都从干净状态开始。
 * 用 `t.after` 而不是在用例末尾手动调用：断言失败会直接抛出去，
 * 末尾那行清场就跑了 —— 上一个用例的接口实现与 globalData 会污染下一个用例
 * （真发生过：一个用例的缓存让下一个用例少发了一次请求）。
 */
const it = (name, fn) =>
  test(name, async (t) => {
    t.after(teardown)
    appStub = { globalData: {} }
    navigateCalls.length = 0
    toasts.length = 0
    setGetImpl(null)
    setUserApiImpl(null)
    __resetAuthState()
    __resetMemory()
    await fn(t)
  })

/* ==================== 首次加载 ==================== */

it('onLoad 拉第一页 + 来源，并展开成卡片视图模型', async () => {
  const calls = install(normalHandler)
  const page = mount()
  page.onLoad()
  await sleep(5)

  assert.equal(page.data.cases.length, PAGE_SIZE)
  assert.equal(page.data.count, 100)
  assert.equal(page.data.hasMore, true, '有下一页时「加载更多」要露出来')
  assert.equal(page.data.nextPage, 2)
  assert.equal(page.data.loading, false)
  assert.equal(page.data.error, '')
  assert.equal(page.data.isFiltered, false, '默认筛选不算「筛过」')
  assert.equal(page.data.cases[0].genderLabel, '乾')
  assert.equal(page.data.cases[0].pillars.length, 4)
  assert.equal(page.data.sourceRow.range.length, 3, '全部来源 + 两个来源')
  assert.equal(calls.length, 2)

  teardown()
})

it('末页没有 next 时按钮消失，并显示总数', async () => {
  install((path, options) => {
    if (path === SOURCES) return { sources: [] }
    const page = Number((options.params && options.params.page) || 1)
    return pagePayload([7, 8], { count: 8, page })
  })
  const page = mount()
  page.onLoad()
  await sleep(5)

  assert.equal(page.data.hasMore, false)
  assert.equal(page.data.nextPage, null)
  assert.equal(page.data.cases.length, 2)

  const before = page.data.cases.length
  page.onLoadMore()
  await sleep(5)
  assert.equal(page.data.cases.length, before, '没有下一页时点「加载更多」不发请求')
  teardown()
})

/* ==================== 请求序号：过期响应必须丢掉 ==================== */

it('筛选连改时，先发出但后回来的响应会被丢弃', async () => {
  const pending = []
  install((path, options) => {
    if (path === SOURCES) return { sources: [] }
    // 把每个列表请求挂起来，由测试决定谁先回
    return new Promise((resolve) => {
      pending.push({ params: options.params, resolve })
    })
  })

  const page = mount()
  page.onLoad() // 第 1 个请求（默认筛选）
  await sleep(0)
  page.onGenderTap({ currentTarget: { dataset: { gender: 'FEMALE' } } }) // 第 2 个请求（坤造）
  await sleep(0)

  assert.equal(pending.length, 2)
  assert.equal(pending[1].params.gender, '0')

  // 后发的先回
  pending[1].resolve(pagePayload([201, 202], { count: 2 }))
  await sleep(0)
  // 先发的后回 —— 这一份必须被丢掉
  pending[0].resolve(pagePayload([101, 102], { count: 2 }))
  await sleep(0)

  assert.deepEqual(page.data.cases.map((c) => c.id), ['201', '202'], '页面上的必须是最后一次筛选的结果')
  assert.equal(page.data.loading, false, '过期响应不能把 loading 留在原地')
  teardown()
})

/* ==================== 防抖 ==================== */

it('连打关键词只发一次请求（400ms 防抖）', async () => {
  let keywordCalls = 0
  install((path, options) => {
    if (path === SOURCES) return { sources: [] }
    if (options.params && options.params.label) keywordCalls += 1
    return pagePayload([1, 2], { count: 2 })
  })

  const page = mount()
  page.onLoad()
  await sleep(5)
  const before = keywordCalls

  page.onKeywordInput({ detail: { value: '教' } })
  page.onKeywordInput({ detail: { value: '教师' } })
  page.onKeywordInput({ detail: { value: '教师岗' } })
  await sleep(120)
  assert.equal(keywordCalls, before, '防抖窗口内不该发请求')

  await sleep(400)
  assert.equal(keywordCalls, before + 1, '窗口结束后只发一次，且带的是最后一个关键词')
  assert.equal(page.data.filters.keyword, '教师岗')
  teardown()
})

it('改筛选芯片会取消排队中的防抖请求，不重复拉同一页', async () => {
  let listCalls = 0
  install((path) => {
    if (path === SOURCES) return { sources: [] }
    listCalls += 1
    return pagePayload([1], { count: 1 })
  })

  const page = mount()
  page.onLoad()
  await sleep(5)
  const before = listCalls

  page.onKeywordInput({ detail: { value: '教师' } })
  page.onGenderTap({ currentTarget: { dataset: { gender: 'MALE' } } }) // 立刻改条件
  await sleep(500)

  assert.equal(listCalls, before + 1, '只该有「改芯片」那一次请求')
  assert.equal(page.data.filters.keyword, '教师', '关键词仍然要保留在筛选条件里')
  teardown()
})

/* ==================== 加载更多 ==================== */

it('「加载更多」按 id 去重，连点两次也不会出现重复卡片', async () => {
  install((path, options) => {
    if (path === SOURCES) return { sources: [] }
    const page = Number((options.params && options.params.page) || 1)
    if (page === 1) return pagePayload([1, 2, 3], { count: PAGE_SIZE + 1, page })
    // 第二页故意与第一页重复一条
    return pagePayload([3, 4, 5], { count: PAGE_SIZE + 1, page: 2 })
  })

  const page = mount()
  page.onLoad()
  await sleep(5)

  page.onLoadMore()
  page.onLoadMore() // 第二下应被 appending 闸门挡掉
  await sleep(5)

  assert.deepEqual(page.data.cases.map((c) => c.id), ['1', '2', '3', '4', '5'], '重复的 3 只留一条')
  assert.equal(page.data.hasMore, false)
  assert.equal(page.data.appending, false)
  teardown()
})

/* ==================== 三态 ==================== */

it('首屏失败给出错误文案；重试重拉第一页', async () => {
  let fail = true
  install((path) => {
    if (path === SOURCES) return { sources: [] }
    if (fail) return Promise.reject(new Error('request:fail timeout'))
    return pagePayload([1, 2], { count: 2 })
  })

  const page = mount()
  page.onLoad()
  await sleep(5)

  assert.equal(page.data.error, 'request:fail timeout')
  assert.equal(page.data.loading, false)
  assert.deepEqual(page.data.cases, [])

  fail = false
  page.onRetry()
  await sleep(5)
  assert.equal(page.data.error, '')
  assert.deepEqual(page.data.cases.map((c) => c.id), ['1', '2'])
  teardown()
})

it('「加载更多」失败时，重试续拉下一页而不是回到第一页', async () => {
  const seen = []
  let failSecond = true
  install((path, options) => {
    if (path === SOURCES) return { sources: [] }
    const page = Number((options.params && options.params.page) || 1)
    seen.push(page)
    if (page === 2 && failSecond) return Promise.reject(new Error('request:fail timeout'))
    return pagePayload(page === 1 ? [1, 2, 3] : [4, 5], { count: PAGE_SIZE + 1, page })
  })

  const page = mount()
  page.onLoad()
  await sleep(5)

  page.onLoadMore()
  await sleep(5)
  assert.equal(page.data.error, 'request:fail timeout')
  assert.deepEqual(page.data.cases.map((c) => c.id), ['1', '2', '3'], '失败不该清空已有结果')

  failSecond = false
  page.onRetry()
  await sleep(5)
  assert.equal(seen[seen.length - 1], 2, '重试要续拉第 2 页')
  assert.deepEqual(page.data.cases.map((c) => c.id), ['1', '2', '3', '4', '5'])
  teardown()
})

/* ==================== 卡片与状态保持 ==================== */

it('展开只影响被点的那张卡片', async () => {
  install(normalHandler)
  const page = mount()
  page.onLoad()
  await sleep(5)

  const id = page.data.cases[1].id
  page.onToggleExpand({ currentTarget: { dataset: { id } } })

  assert.equal(page.data.cases[1].expanded, true)
  assert.equal(page.data.cases[0].expanded, false)
  assert.equal(page.data.cases[2].expanded, false)

  page.onToggleExpand({ currentTarget: { dataset: { id } } })
  assert.equal(page.data.cases[1].expanded, false)
  teardown()
})

it('筛选与列表写进 globalData，下次进页面直接复原（不再打接口）', async () => {
  install(normalHandler)
  const page = mount()
  page.onLoad()
  await sleep(5)

  page.onGenderTap({ currentTarget: { dataset: { gender: 'FEMALE' } } })
  await sleep(5)

  const saved = appStub.globalData.libraryState
  assert.ok(saved, '筛选要落进 globalData')
  assert.equal(saved.filters.gender, 'FEMALE')
  assert.equal(saved.cases.length, PAGE_SIZE)

  // 再进一次页面：不该发列表请求
  const calls = install(normalHandler)
  const page2 = mount()
  page2.onLoad()
  await sleep(5)

  assert.equal(page2.data.filters.gender, 'FEMALE', '筛选条件要复原')
  assert.equal(page2.data.cases.length, PAGE_SIZE, '已加载的列表要复原')
  assert.equal(page2.data.isFiltered, true)
  assert.equal(calls.filter((c) => c.path !== SOURCES).length, 0, '有缓存就不该再拉第一页')
  teardown()
})

it('列表太长时只保存筛选，回来重拉第一页', async () => {
  install((path, options) => {
    if (path === SOURCES) return { sources: [] }
    const page = Number((options.params && options.params.page) || 1)
    return pagePayload(Array.from({ length: PAGE_SIZE }, (_, i) => (page - 1) * PAGE_SIZE + i + 1), { count: 500, page })
  })

  const page = mount()
  page.onLoad()
  await sleep(5)
  page.onLoadMore()
  await sleep(5)
  page.onLoadMore()
  await sleep(5)
  page.onLoadMore()
  await sleep(5)
  page.onLoadMore()
  await sleep(5)
  page.onLoadMore()
  await sleep(5)

  assert.equal(page.data.cases.length, PAGE_SIZE * 6, '先确认确实超过 60 条')
  assert.equal(appStub.globalData.libraryState.cases, null, '超过 60 条就只存筛选')
  assert.equal(appStub.globalData.libraryState.filters.gender, 'ALL')
  teardown()
})


/* ==================== 跳到命盘页（T-3.4） ==================== */

it('点卡片跳命盘页：url 带 DIRECT 四柱，反馈走 globalData 不带进 url', async () => {
  install(normalHandler)
  const page = mount()
  page.onLoad()
  await sleep(5)

  const item = page.data.cases[0]
  page.onOpenCase({ currentTarget: { dataset: { id: item.id } } })

  assert.equal(navigateCalls.length, 1)
  const url = navigateCalls[0].url
  assert.equal(url.indexOf('/pages/chart/chart?t=DIRECT') === 0, true)
  assert.equal(url.indexOf('cid=' + item.id) > 0, true)
  assert.equal(url.indexOf('yg=') > 0, true)
  assert.equal(url.indexOf('feedback') === -1, true, '原文不进 url')

  const saved = appStub.globalData.pendingCase
  assert.equal(saved.id, item.id)
  assert.equal(saved.feedback, item.feedback)
  assert.equal(saved.source, item.source)
})

it('点已在的卡片但 id 找不到时不跳转（防御性）', async () => {
  install(normalHandler)
  const page = mount()
  page.onLoad()
  await sleep(5)

  page.onOpenCase({ currentTarget: { dataset: { id: '不存在的 id' } } })
  assert.equal(navigateCalls.length, 0)
})

/* ==================== 卡片收藏（T-3.6） ==================== */

/**
 * 为什么值得单独测：
 *  - 一页 12 张卡片，照网页端「每张卡查一次 status」就是 12 个请求，
 *    这里改成一次列表请求，容易写成「只有第一张卡亮」；
 *  - 未登录点心形要**静默登录后再收藏**，不能只弹个登录提示就完事；
 *  - 退出登录后不能把上一位用户的收藏留在卡片上（这台手机可能换人用）。
 */
const loginStub = () =>
  setAuthImpl({
    wxLogin: () => Promise.resolve('code-1'),
    wechatLogin: () => Promise.resolve({ tokens: { access: 'a', refresh: 'r' }, user: { id: 1 } })
  })

/** 假的收藏接口；toggleResult 是 toggle 接口的返回，fail 让它整个失败 */
const installUserApi = ({ favorites = [], toggleResult = { favorited: true, id: 9 }, fail = false } = {}) => {
  const calls = []
  setUserApiImpl({
    get: (path, options) => {
      calls.push({ method: 'get', path, options })
      return Promise.resolve(path === USER_PATHS.favorites ? favorites : [])
    },
    post: (path, data) => {
      calls.push({ method: 'post', path, data })
      if (fail) return Promise.reject(new Error('操作失败'))
      return Promise.resolve(path === USER_PATHS.favoriteToggle ? toggleResult : {})
    }
  })
  return calls
}

const favoriteCalls = (calls) => calls.filter((c) => c.path === USER_PATHS.favorites)

it('登录后只拉一次收藏列表，命例卡片按 object_id 点亮', async () => {
  install(normalHandler)
  const calls = installUserApi({ favorites: [{ id: 7, object_id: 1 }, { id: 8, object_id: 3 }] })
  const page = mount()
  page.onLoad()
  await sleep(5)

  loginStub()
  await login()
  await sleep(5)

  const gets = favoriteCalls(calls).filter((c) => c.method === 'get')
  assert.equal(gets.length, 1, '12 张卡片不能变成 12 个请求')
  assert.equal(gets[0].options.params.object_type, 'destiny_case')
  assert.deepEqual(
    page.data.cases.slice(0, 4).map((c) => c.favorited),
    [true, false, true, false]
  )
})

it('冷启动（onLoad + onShow）不会把收藏列表拉两遍', async () => {
  install(normalHandler)
  const calls = installUserApi({ favorites: [{ id: 7, object_id: 1 }] })
  loginStub()
  await login()

  const page = mount()
  page.onLoad()
  page.onShow()
  await sleep(5)

  assert.equal(favoriteCalls(calls).length, 1)
  assert.equal(page.data.cases[0].favorited, true)
})

it('未登录点心形：先静默登录，再收藏，标记与文案一起更新', async () => {
  install(normalHandler)
  const calls = installUserApi({ toggleResult: { favorited: true, id: 9 } })
  const page = mount()
  page.onLoad()
  await sleep(5)

  loginStub()
  page.onToggleFavorite({ currentTarget: { dataset: { id: '5' } } })
  await sleep(10)

  const post = calls.filter((c) => c.method === 'post')[0]
  assert.equal(post.path, USER_PATHS.favoriteToggle)
  assert.deepEqual(post.data, { object_type: 'destiny_case', object_id: 5 })
  assert.equal(page.data.cases[4].favorited, true)
  assert.deepEqual(toasts, ['已收藏'])

  // 连点两次只发一个请求
  page.onToggleFavorite({ currentTarget: { dataset: { id: '5' } } })
  assert.equal(calls.filter((c) => c.method === 'post').length, 1)
})

it('已收藏的点一下取消：按服务端返回的 favorited 关掉心形', async () => {
  install(normalHandler)
  const calls = installUserApi({
    favorites: [{ id: 7, object_id: 2 }],
    toggleResult: { favorited: false, id: null }
  })
  const page = mount()
  page.onLoad()
  await sleep(5)

  loginStub()
  await login()
  await sleep(5)
  assert.equal(page.data.cases[1].favorited, true)

  page.onToggleFavorite({ currentTarget: { dataset: { id: '2' } } })
  await sleep(10)
  assert.equal(page.data.cases[1].favorited, false)
  assert.deepEqual(toasts, ['已取消收藏'])
})

it('退出登录后清掉卡片上的收藏标记', async () => {
  install(normalHandler)
  installUserApi({ favorites: [{ id: 7, object_id: 1 }] })
  const page = mount()
  page.onLoad()
  await sleep(5)

  loginStub()
  await login()
  await sleep(5)
  assert.equal(page.data.cases[0].favorited, true)

  await logout()
  await sleep(5)
  assert.equal(page.data.cases[0].favorited, false, '换人用这台手机时不该看到上一位的收藏')
})

it('收藏接口失败：卡片标记不变，但要给出提示', async () => {
  install(normalHandler)
  const calls = installUserApi({ fail: true })
  const page = mount()
  page.onLoad()
  await sleep(5)

  loginStub()
  await login()
  await sleep(5)

  page.onToggleFavorite({ currentTarget: { dataset: { id: '4' } } })
  await sleep(10)
  assert.equal(calls.filter((c) => c.method === 'post').length, 1)
  assert.equal(page.data.cases[3].favorited, false)
  assert.deepEqual(toasts, ['操作失败'], '失败不能静默，用户会以为收藏成功了')
})
