/**
 * 请求层测试（T-0.3）
 *
 * 请求层的价值全在「出错时」：token 注入对不对、401 会不会自动刷新并重放、
 * 并发 401 会不会打出一堆刷新、刷新失败有没有把脏 token 清掉、超时和域名没配
 * 能不能给出可读的提示。这些在真机上很难复现（要等 access token 过期 2 小时），
 * 所以这里注入一个假 adapter，把整条链路在 node 里跑穿。
 *
 * 顺带钉住一条服务端行为：`SIMPLE_JWT.ROTATE_REFRESH_TOKENS = True`，刷新接口
 * 会返回**新的 refresh** 并把旧的拉黑，所以刷新成功后必须把新 refresh 存下来。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createClient, buildUrl, buildQuery, normalizeNextUrl, messageFromBody, ApiError, API_BASE
} from '../utils/request.js'
import { saveTokens, getAccessToken, getRefreshToken, __resetMemory, KEYS } from '../utils/storage.js'

const REFRESH_URL = `${API_BASE}/auth/refresh/`
const ME_URL = `${API_BASE}/auth/me/`

const reply = (statusCode, data) => ({ statusCode, data })

/** 假 adapter：记录每次调用，按 handler 返回（抛 Error 表示网络层失败） */
const makeAdapter = (handler) => {
  const calls = []
  const adapter = async (options) => {
    calls.push(options)
    const res = await handler(options, calls.length)
    if (res instanceof Error) throw res
    return res
  }
  adapter.calls = calls
  adapter.refreshCalls = () => calls.filter((c) => c.url === REFRESH_URL)
  return adapter
}

const fresh = (handler) => {
  __resetMemory()
  const adapter = makeAdapter(handler)
  return { adapter, client: createClient({ adapter }) }
}

/* ==================== URL 拼装 ==================== */

test('buildQuery 跳过空值并按 URL 规则编码', () => {
  assert.equal(buildQuery({ a: 1, b: '', c: null, d: undefined, e: '甲 乙' }), 'a=1&e=%E7%94%B2%20%E4%B9%99')
  assert.equal(buildQuery({ page_size: 12, label: '出身=高' }), 'page_size=12&label=%E5%87%BA%E8%BA%AB%3D%E9%AB%98')
  assert.equal(buildQuery(null), '')
})

test('buildQuery 数组按同名重复展开（DRF 的多值参数）', () => {
  assert.equal(buildQuery({ tag: ['a', 'b'] }), 'tag=a&tag=b')
})

test('buildUrl 拼绝对地址、补斜杠、带 query', () => {
  assert.equal(buildUrl('/system-configs/'), `${API_BASE}/system-configs/`)
  assert.equal(buildUrl('system-configs/'), `${API_BASE}/system-configs/`)
  assert.equal(buildUrl('/destiny-cases/', { page_size: 12 }), `${API_BASE}/destiny-cases/?page_size=12`)
  assert.equal(buildUrl('/a/', { x: 1 }, 'https://x.cn/api'), 'https://x.cn/api/a/?x=1')
  // 已经是绝对地址就原样用
  assert.equal(buildUrl('https://x.cn/api/a/'), 'https://x.cn/api/a/')
})

test('normalizeNextUrl 把 DRF 分页的 next 拉回正式域名（线上实测是 http://）', () => {
  const next = 'http://www.minghaishiyi.cn/api/destiny-cases/?page=2&page_size=12'
  assert.equal(normalizeNextUrl(next), `${API_BASE}/destiny-cases/?page=2&page_size=12`)
  // 内网 / 旧 IP 也要拉回来
  assert.equal(normalizeNextUrl('http://101.200.89.198/api/destiny-cases/?page=3'),
    `${API_BASE}/destiny-cases/?page=3`)
  // 只给了相对路径
  assert.equal(normalizeNextUrl('/api/destiny-cases/?page=2'), `${API_BASE}/destiny-cases/?page=2`)
  assert.equal(normalizeNextUrl(''), '')
})

/* ==================== 错误信息 ==================== */

test('messageFromBody 认得住 DRF 的几种报错形状', () => {
  assert.equal(messageFromBody({ detail: '登录已过期' }, 401), '登录已过期')
  assert.equal(messageFromBody({ status: 'error', message: '请求的资源不存在' }, 404), '请求的资源不存在')
  assert.equal(messageFromBody({ username: ['该字段是必填项。'] }, 400), 'username：该字段是必填项。')
  assert.equal(messageFromBody('plain text', 500), 'plain text')
  assert.equal(messageFromBody({}, 502), '请求失败（HTTP 502）')
  assert.equal(messageFromBody(null, 0), '请求失败（HTTP 0）')
})

/* ==================== 注入与正常返回 ==================== */

test('有 token 时注入 Authorization，没有时不带这个头', async () => {
  const { adapter, client } = fresh(() => reply(200, { ok: true }))
  saveTokens({ access: 'a1', refresh: 'r1' })
  await client.get('/auth/me/')
  assert.equal(adapter.calls[0].header.Authorization, 'Bearer a1')

  __resetMemory()
  const c2 = createClient({ adapter })
  await c2.get('/system-configs/')
  assert.equal(adapter.calls[1].header.Authorization, undefined)
})

test('公开接口可以显式关掉 token（auth: false）', async () => {
  const { adapter, client } = fresh(() => reply(200, {}))
  saveTokens({ access: 'a1', refresh: 'r1' })
  await client.get('/system-configs/', { auth: false })
  assert.equal(adapter.calls[0].header.Authorization, undefined)
})

test('200 直接返回 body，方法名大写，data 原样传给 adapter', async () => {
  const { adapter, client } = fresh(() => reply(200, { id: 1 }))
  const data = await client.post('/auth/login/', { username: 'u', password: 'p' })
  assert.deepEqual(data, { id: 1 })
  assert.equal(adapter.calls[0].method, 'POST')
  assert.deepEqual(adapter.calls[0].data, { username: 'u', password: 'p' })
  assert.equal(adapter.calls[0].header['Content-Type'], 'application/json')
})

test('per-request timeout 覆盖默认值', async () => {
  const { adapter, client } = fresh(() => reply(200, {}))
  await client.get('/system-configs/', { timeout: 3000 })
  assert.equal(adapter.calls[0].timeout, 3000)
})

/* ==================== 401 → 刷新 → 重放 ==================== */

/** access 过期、refresh 有效的服务端行为；刷新后旧的 access 立刻作废 */
const expiringServer = (callsFor = {}) => {
  const state = { access: 'old-access', valid: false, ...callsFor }
  const handler = (options) => {
    if (options.url === REFRESH_URL) {
      if (options.data && options.data.refresh === 'refresh-1') {
        state.valid = true
        return reply(200, { access: 'new-access', refresh: 'refresh-2' })
      }
      return reply(401, { detail: 'Token is invalid or expired', code: 'token_not_valid' })
    }
    if (options.header.Authorization !== 'Bearer new-access') {
      return reply(401, { detail: 'Given token not valid for any token type', code: 'token_not_valid' })
    }
    return reply(200, { id: 7, nickname: '甲' })
  }
  return { state, handler }
}

test('access 过期 → 自动刷新 → 用新 token 重放，并保存轮换后的 refresh', async () => {
  const { handler } = expiringServer()
  const { adapter, client } = fresh(handler)
  saveTokens({ access: 'old-access', refresh: 'refresh-1' })

  const data = await client.get('/auth/me/')
  assert.deepEqual(data, { id: 7, nickname: '甲' })
  assert.equal(adapter.refreshCalls().length, 1, '应该只刷新一次')
  assert.deepEqual(adapter.refreshCalls()[0].data, { refresh: 'refresh-1' })
  // 调用顺序：原请求(401) → 刷新 → 重放；重放时带的是新 access
  assert.equal(adapter.calls[2].url, ME_URL)
  assert.equal(adapter.calls[2].header.Authorization, 'Bearer new-access')
  // 服务端开了 ROTATE_REFRESH_TOKENS：新 refresh 必须落盘，否则下次刷新必失败
  assert.equal(getAccessToken(), 'new-access')
  assert.equal(getRefreshToken(), 'refresh-2')
})

test('并发 3 个 401 只触发一次刷新，三个请求都拿到结果', async () => {
  const { handler } = expiringServer()
  const { adapter, client } = fresh(handler)
  saveTokens({ access: 'old-access', refresh: 'refresh-1' })

  const [a, b, c] = await Promise.all([
    client.get('/auth/me/'),
    client.get('/user/config/'),
    client.get('/user/cases/')
  ])
  assert.deepEqual([a.id, b.id, c.id], [7, 7, 7])
  assert.equal(adapter.refreshCalls().length, 1, `刷新次数应为 1，实际 ${adapter.refreshCalls().length}`)
  const replayed = adapter.calls.slice(-3)
  assert.ok(replayed.every((call) => call.header.Authorization === 'Bearer new-access'))
})

test('重放只用一次：刷新后仍是 401 就直接报错，不再刷新第二次', async () => {
  const { adapter, client } = fresh((options) => {
    if (options.url === REFRESH_URL) return reply(200, { access: 'new-access', refresh: 'refresh-2' })
    return reply(401, { detail: '还是不行' })
  })
  saveTokens({ access: 'old-access', refresh: 'refresh-1' })

  await assert.rejects(() => client.get('/auth/me/'), (err) => {
    assert.ok(err instanceof ApiError)
    assert.equal(err.kind, 'auth')
    assert.equal(err.status, 401)
    assert.equal(err.message, '还是不行')
    return true
  })
  assert.equal(adapter.refreshCalls().length, 1)
})

test('刷新失败：清空本地 token 并抛 auth 错误', async () => {
  const { client } = fresh((options) => {
    if (options.url === REFRESH_URL) return reply(401, { detail: 'Token is invalid or expired' })
    return reply(401, { detail: 'Given token not valid for any token type' })
  })
  saveTokens({ access: 'old-access', refresh: 'refresh-1' })

  await assert.rejects(() => client.get('/auth/me/'), (err) => {
    assert.equal(err.kind, 'auth')
    return true
  })
  assert.equal(getAccessToken(), '')
  assert.equal(getRefreshToken(), '')
})

test('刷新接口返回 200 但没有 access 字段 → 按失败处理', async () => {
  const { client } = fresh((options) => {
    if (options.url === REFRESH_URL) return reply(200, { nope: 1 })
    return reply(401, { detail: 'expired' })
  })
  saveTokens({ access: 'old-access', refresh: 'refresh-1' })
  await assert.rejects(() => client.get('/auth/me/'), (err) => err.kind === 'auth')
  assert.equal(getAccessToken(), '')
})

test('没有 refresh token 时不做刷新请求，直接报登录过期', async () => {
  const { adapter, client } = fresh(() => reply(401, { detail: 'expired' }))
  saveTokens({ access: 'old-access' })
  await assert.rejects(() => client.get('/auth/me/'), (err) => {
    assert.equal(err.kind, 'auth')
    assert.equal(err.message, '登录已过期，请重新登录')
    return true
  })
  assert.equal(adapter.refreshCalls().length, 0)
})

test('登录接口的 401 不触发刷新（密码错不该去换 token）', async () => {
  const { adapter, client } = fresh(() => reply(401, { detail: 'No active account found' }))
  saveTokens({ access: 'a1', refresh: 'r1' })
  await assert.rejects(() => client.post('/auth/login/', { username: 'u', password: 'x' },
    { auth: false, retryOn401: false }), (err) => {
    assert.equal(err.kind, 'auth')
    return true
  })
  assert.equal(adapter.refreshCalls().length, 0)
  // 而且不能把已有的登录态清掉
  assert.equal(getAccessToken(), 'a1')
})

/* ==================== 其他失败形态 ==================== */

test('4xx / 5xx 抛 http 错误并带上状态码', async () => {
  const { client } = fresh(() => reply(500, { detail: '服务器开小差了' }))
  await assert.rejects(() => client.get('/destiny-cases/'), (err) => {
    assert.equal(err.kind, 'http')
    assert.equal(err.status, 500)
    assert.equal(err.message, '服务器开小差了')
    assert.deepEqual(err.data, { detail: '服务器开小差了' })
    return true
  })
})

test('超时 / 域名未配 / 其他网络错误给不同提示', async () => {
  const cases = [
    [{ errMsg: 'request:fail timeout' }, 'timeout', '请求超时，请检查网络后重试'],
    [{ errMsg: 'request:fail url not in domain list' }, 'config', '请求域名未加入后台「服务器域名」白名单'],
    [{ errMsg: 'request:fail' }, 'network', '网络连接失败，请稍后重试']
  ]
  for (const [fail, kind, message] of cases) {
    __resetMemory()
    const client = createClient({
      adapter: async () => {
        throw Object.assign(new Error(fail.errMsg), { errMsg: fail.errMsg })
      }
    })
    await assert.rejects(() => client.get('/system-configs/'), (err) => {
      assert.equal(err.kind, kind, fail.errMsg)
      assert.equal(err.message, message)
      return true
    })
  }
})

test('wxAdapter 的域名错误也会被刷新流程识别（刷新接口同样可能被拦）', async () => {
  const adapter = async () => {
    throw Object.assign(new Error('request:fail url not in domain list'), {
      errMsg: 'request:fail url not in domain list'
    })
  }
  const client = createClient({ adapter })
  __resetMemory()
  saveTokens({ access: 'a1', refresh: 'r1' })
  await assert.rejects(() => client.get('/auth/me/'), (err) => {
    assert.equal(err.kind, 'config')
    return true
  })
})

test('缺少 path 时立刻拒绝，不发请求', async () => {
  const { adapter, client } = fresh(() => reply(200, {}))
  await assert.rejects(() => client.request({ method: 'GET' }), (err) => err.kind === 'config')
  assert.equal(adapter.calls.length, 0)
})

test('存储 key 固定，不随实现漂移', () => {
  assert.equal(KEYS.accessToken, 'mhsy:user:access')
  assert.equal(KEYS.refreshToken, 'mhsy:user:refresh')
  assert.ok(KEYS.accessToken.indexOf('mhsy:') === 0)
})
