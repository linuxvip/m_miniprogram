/**
 * 登录态测试（T-5.7）
 *
 * `wx.login` 与三个接口都被换成假实现，所以这里跑的是完整的登录 / 恢复 / 退出链路，
 * 只是不碰真网络。重点钉住四件在真机上很难复现的事：
 *  1. **并发只登一次**——`wx.login` 的 code 是一次性的，重复用必然失败；
 *  2. **失败不留半截登录态**——token 与内存里的用户要一起回滚；
 *  3. **网络错误不等于登录失效**——断网时不能把用户的 token 清掉；
 *  4. **退出登录不能卡住**——服务端拉黑失败也要在本地登出。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  login, logout, restore, ensureLogin, onAuthChange, currentUser, isLoggedIn,
  setAuthImpl, __resetAuthState, AUTH_PATHS
} from '../utils/auth.js'
import { ApiError } from '../utils/request.js'
import {
  getAccessToken, getRefreshToken, saveTokens, clearTokens, __resetMemory
} from '../utils/storage.js'

const USER = { id: 1, username: 'wx_abc', nickname: '张三', preferences: {} }
const TOKENS = { access: 'access-1', refresh: 'refresh-1' }

/** 装一套假实现，返回记录下来的调用 */
const install = (overrides = {}) => {
  const calls = { wxLogin: 0, wechat: [], profile: 0, revoke: [] }
  setAuthImpl({
    wxLogin: () => {
      calls.wxLogin += 1
      return Promise.resolve(overrides.code === undefined ? 'code-1' : overrides.code)
    },
    wechatLogin: (payload) => {
      calls.wechat.push(payload)
      if (overrides.loginError) return Promise.reject(overrides.loginError)
      return Promise.resolve({ tokens: overrides.tokens === undefined ? TOKENS : overrides.tokens, user: USER, created: true })
    },
    fetchProfile: () => {
      calls.profile += 1
      if (overrides.profileError) return Promise.reject(overrides.profileError)
      return Promise.resolve(USER)
    },
    revoke: (refresh) => {
      calls.revoke.push(refresh)
      if (overrides.revokeError) return Promise.reject(overrides.revokeError)
      return Promise.resolve({})
    }
  })
  return calls
}

const clean = (t) => {
  t.after(() => {
    __resetAuthState()
    __resetMemory()
  })
}

/* ==================== 登录 ==================== */

test('登录：code → 换 token → 存 token → 通知订阅者', async (t) => {
  clean(t)
  const calls = install()
  const seen = []
  onAuthChange((user) => seen.push(user))

  const user = await login()

  assert.equal(user.nickname, '张三')
  assert.equal(isLoggedIn(), true)
  assert.equal(getAccessToken(), 'access-1')
  assert.equal(getRefreshToken(), 'refresh-1', 'refresh 也要存（服务端会轮换，漏存第二次刷新必失败）')
  assert.deepEqual(calls.wechat, [{ code: 'code-1', nickname: '' }])
  assert.deepEqual(seen.map((u) => (u ? u.nickname : null)), [null, '张三'], '订阅时先给一次当前值，登录成功再给一次')
})

test('并发登录只发一次 wx.login（code 是一次性的）', async (t) => {
  clean(t)
  const calls = install()

  const [a, b, c] = await Promise.all([login(), login(), login()])

  assert.equal(calls.wxLogin, 1)
  assert.equal(calls.wechat.length, 1)
  assert.equal(a, b)
  assert.equal(b, c)
})

test('已登录时不会再登一次，force 才重新登', async (t) => {
  clean(t)
  const calls = install()
  await login()
  await login()
  assert.equal(calls.wxLogin, 1)

  await login({ force: true })
  assert.equal(calls.wxLogin, 2)
})

test('ensureLogin：已登录直接给用户，未登录才拉起登录', async (t) => {
  clean(t)
  const calls = install()
  await ensureLogin()
  assert.equal(calls.wxLogin, 1)

  await ensureLogin()
  assert.equal(calls.wxLogin, 1, '第二次不该再登')
})

test('登录失败：不留 token、可重试、错误上抛', async (t) => {
  clean(t)
  const boom = new ApiError('登录凭证已失效，请重新登录', { kind: 'auth', status: 400 })
  const calls = install({ loginError: boom })

  await assert.rejects(() => login(), (err) => err.message === '登录凭证已失效，请重新登录')

  assert.equal(getAccessToken(), '', '失败不能留半截登录态')
  assert.equal(isLoggedIn(), false)

  install() // 换一套成功的
  await login()
  assert.equal(isLoggedIn(), true, '失败之后还要能重试')
  assert.equal(calls.wechat.length, 1)
})

test('wx.login 没给 code 就不去换 token', async (t) => {
  clean(t)
  const calls = install({ code: '' })
  await assert.rejects(() => login(), /没有拿到微信登录凭证/)
  assert.equal(calls.wechat.length, 0)
})

test('服务端没返回 access 视为失败', async (t) => {
  clean(t)
  install({ tokens: { refresh: 'r' } })
  await assert.rejects(() => login(), /服务端没有返回凭证/)
  assert.equal(isLoggedIn(), false)
  assert.equal(getRefreshToken(), '', '半个 token 也不留')
})

/* ==================== 恢复登录态 ==================== */

test('restore：本地没有 token 时直接给未登录，不发请求', async (t) => {
  clean(t)
  const calls = install()
  assert.equal(await restore(), null)
  assert.equal(calls.profile, 0)
  assert.equal(isLoggedIn(), false)
})

test('restore：本地有 token 就换一次用户资料', async (t) => {
  clean(t)
  saveTokens(TOKENS)
  const calls = install()

  const user = await restore()
  assert.equal(user.nickname, '张三')
  assert.equal(calls.profile, 1)
  assert.equal(isLoggedIn(), true)
})

test('restore：网络错误保留 token（断网不等于登录失效）', async (t) => {
  clean(t)
  saveTokens(TOKENS)
  install({ profileError: new ApiError('网络连接失败', { kind: 'network' }) })

  assert.equal(await restore(), null)
  assert.equal(getAccessToken(), 'access-1', '断网不能把用户的登录态清掉')
})

test('restore：服务端说鉴权失败才清 token', async (t) => {
  clean(t)
  saveTokens(TOKENS)
  install({ profileError: new ApiError('登录已过期，请重新登录', { kind: 'auth', status: 401 }) })

  await restore()
  assert.equal(getAccessToken(), '')
  assert.equal(isLoggedIn(), false)
})

/* ==================== 退出登录 ==================== */

test('logout：请服务端拉黑 refresh，并清掉本地登录态', async (t) => {
  clean(t)
  const calls = install()
  await login()

  const seen = []
  onAuthChange((user) => seen.push(user))
  await logout()

  assert.deepEqual(calls.revoke, ['refresh-1'])
  assert.equal(getAccessToken(), '')
  assert.equal(isLoggedIn(), false)
  assert.equal(seen[seen.length - 1], null)
})

test('logout：服务端拉黑失败也要在本地登出（不能卡住）', async (t) => {
  clean(t)
  install({ revokeError: new ApiError('网络连接失败', { kind: 'network' }) })
  await login()

  await logout()
  assert.equal(getAccessToken(), '')
  assert.equal(isLoggedIn(), false)
})

test('logout：没有 token 时不发请求', async (t) => {
  clean(t)
  const calls = install()
  await logout()
  assert.deepEqual(calls.revoke, [])
})

/* ==================== 订阅 ==================== */

test('onAuthChange 立刻回调当前值，退订后不再收到', async (t) => {
  clean(t)
  install()

  const seen = []
  const off = onAuthChange((user) => seen.push(user))
  assert.deepEqual(seen, [null], '订阅时先给一次当前值')

  await login()
  assert.equal(seen.length, 2)

  off()
  await logout()
  assert.equal(seen.length, 2, '退订后不该再收到')
})

test('接口路径固定，不随实现漂移', () => {
  assert.equal(AUTH_PATHS.wechat, '/auth/wechat/')
  assert.equal(AUTH_PATHS.me, '/auth/me/')
  assert.equal(AUTH_PATHS.logout, '/auth/logout/')
})

test('currentUser 反映当前登录态', async (t) => {
  clean(t)
  install()
  assert.equal(currentUser(), null)
  await login()
  assert.equal(currentUser().nickname, '张三')
  clearTokens()
})
