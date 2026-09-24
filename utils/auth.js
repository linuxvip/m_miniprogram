/**
 * 登录态管理（T-5.7）
 *
 * 为什么单独一层：登录态要被「我的」「收藏」「保存案例」三处共用，且必须满足
 *  1. **同一时刻只有一个登录请求**：用户连点两次收藏不能发两次 `wx.login()`
 *     （code 是一次性的，重复用第二次必然失败）；
 *  2. **登录态只有一份**：页面通过 `onAuthChange` 订阅，而不是各自读 storage；
 *  3. **退出登录要清干净**：本地 token 与服务端 refresh 黑名单都要处理，
 *     但服务端拉黑失败不能把用户卡在「退不出去」的状态；
 *  4. **能在 node 里跑**：`wx.login` 与三个接口都可注入，单测里换成假实现，
 *     否则这条链路只有在真机上才验证得了。
 *
 * 与网页端的关系：两边共用同一批用户与同一套 JWT，昵称 / 收藏 / 我的案例互通。
 */
import { get, post, ApiError } from './request.js'
import { getAccessToken, getRefreshToken, saveTokens, clearTokens } from './storage.js'

export const AUTH_PATHS = {
  wechat: '/auth/wechat/',
  me: '/auth/me/',
  logout: '/auth/logout/'
}

const defaultImpl = {
  /** wx.login 的 Promise 封装：只取 code，其余信息用不上 */
  wxLogin: () =>
    new Promise((resolve, reject) => {
      wx.login({
        success: (res) => resolve((res && res.code) || ''),
        fail: (err) => reject(wxError('微信登录失败，请重试', err))
      })
    }),
  wechatLogin: (payload) => post(AUTH_PATHS.wechat, payload, { auth: false }),
  fetchProfile: () => get(AUTH_PATHS.me),
  revoke: (refresh) => post(AUTH_PATHS.logout, { refresh })
}

let impl = { ...defaultImpl }

/** 单测用：只覆盖给了的键，传 null 复位 */
export const setAuthImpl = (overrides) => {
  impl = overrides ? { ...defaultImpl, ...overrides } : { ...defaultImpl }
}

/** 把 wx 的失败对象转成带可读文案的 ApiError（wx 的 errMsg 直接给用户看不合适） */
const wxError = (message, cause) => {
  const err = new ApiError(message, { kind: 'network' })
  err.cause = cause
  return err
}

const state = { user: null, loading: false }
let subscribers = []
let pending = null

const notify = () => {
  subscribers.slice().forEach((callback) => {
    try {
      callback(state.user)
    } catch (e) {
      console.error('[auth] 登录态订阅回调出错', e)
    }
  })
}

/** 订阅登录态变化，立刻回调一次当前值；返回取消订阅函数 */
export const onAuthChange = (callback) => {
  if (typeof callback !== 'function') return () => {}
  subscribers.push(callback)
  callback(state.user)
  return () => {
    subscribers = subscribers.filter((fn) => fn !== callback)
  }
}

export const currentUser = () => state.user
export const isLoggedIn = () => !!state.user
export const isLoading = () => state.loading

/**
 * 登录：wx.login 的 code → 服务端换 JWT。
 * 已登录时直接返回当前用户；正在登录时复用同一个 Promise（见文件头第 1 条）。
 */
export const login = (options = {}) => {
  if (state.user && !options.force) return Promise.resolve(state.user)
  if (pending) return pending

  state.loading = true

  const task = impl.wxLogin()
    .then((code) => {
      if (!code) throw new ApiError('没有拿到微信登录凭证，请重试', { kind: 'auth' })
      return impl.wechatLogin({ code, nickname: options.nickname || '' })
    })
    .then((res) => {
      const tokens = (res && res.tokens) || {}
      if (!tokens.access) throw new ApiError('登录失败：服务端没有返回凭证', { kind: 'auth' })
      // refresh 也一起存：服务端开了 ROTATE_REFRESH_TOKENS，漏存第二次刷新必失败
      saveTokens({ access: tokens.access, refresh: tokens.refresh })
      state.user = (res && res.user) || null
      state.loading = false
      notify()
      return state.user
    })
    .catch((err) => {
      state.loading = false
      // 失败时不留半截登录态：token 可能已经写进去了（比如响应中途出错）
      clearTokens()
      throw err
    })

  const clear = () => {
    pending = null
  }
  task.then(clear, clear)
  pending = task
  return task
}

/** 需要登录才能做的事统一走这里：已登录直接给用户，未登录就拉起登录 */
export const ensureLogin = (options) => (isLoggedIn() ? Promise.resolve(state.user) : login(options))

/**
 * 启动时恢复登录态：本地有 token 就拿它换一次用户资料。
 * 网络错误不算登录失效（不清 token），只有服务端明确说鉴权失败才清。
 */
export const restore = (options = {}) => {
  if (!getAccessToken()) {
    state.user = null
    notify()
    return Promise.resolve(null)
  }
  state.loading = true
  return impl
    .fetchProfile()
    .then((user) => {
      state.user = user || null
      state.loading = false
      notify()
      return state.user
    })
    .catch((err) => {
      state.loading = false
      if (err && err.kind === 'auth') {
        clearTokens()
        state.user = null
        notify()
      } else if (options.strict) {
        throw err
      }
      return null
    })
}

/** 退出登录：先请服务端拉黑 refresh，失败也照样在本地登出 */
export const logout = () => {
  const refresh = getRefreshToken()
  const finish = () => {
    clearTokens()
    state.user = null
    state.loading = false
    notify()
  }
  if (!refresh) {
    finish()
    return Promise.resolve()
  }
  return impl.revoke(refresh).then(finish, finish)
}

/**
 * 直接用服务端返回的资料覆盖内存里的用户（改昵称后用，省一次 GET）。
 * 只覆盖登录态，不碰 token。
 */
export const setUser = (user) => {
  state.user = user || null
  notify()
  return state.user
}

/** 供单测复位：不碰 storage，只清内存态 */
export const __resetAuthState = () => {
  state.user = null
  state.loading = false
  pending = null
  subscribers = []
  setAuthImpl(null)
}
