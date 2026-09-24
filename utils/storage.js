/**
 * 本地存储封装（T-0.10）
 *
 * 为什么要多这一层：
 *  1. **key 前缀统一**（`mhsy:`）——全项目不再散落字面量 key，改名不会漏改，
 *     也不会和将来接入的第三方 SDK 抢 key；
 *  2. **命名空间隔离**——token 与排盘偏好分开，退出登录只清 token，不误伤偏好；
 *  3. **能在 node 里跑**——`npm test` 的环境没有 `wx`，这里降级成内存 Map，
 *     于是请求层的「401 → 刷新 → 重放」这条链路可以完全不依赖运行时地单测。
 *
 * 注意：小程序里 `wx.getStorageSync` 读不存在的 key 返回 `''`（不是 undefined），
 * 所以下面统一把 `''` 也当成「没有值」。
 */

export const PREFIX = 'mhsy:'

/** 全项目唯一的 key 清单，要用存储就查这里，别再手写字符串 */
export const KEYS = {
  accessToken: 'mhsy:user:access',
  refreshToken: 'mhsy:user:refresh',
  paiPanPreferences: 'mhsy:paiPanPreferences',
  siteConfig: 'mhsy:config:site'
}

/** node 单测 / 无 wx 环境下的替身，避免测试去 mock 整个存储 API */
const memory = new Map()
const hasWx = () => typeof wx !== 'undefined' && !!wx && typeof wx.getStorageSync === 'function'

export const get = (key, fallback = null) => {
  try {
    const raw = hasWx() ? wx.getStorageSync(key) : memory.get(key)
    return raw === '' || raw === undefined || raw === null ? fallback : raw
  } catch (e) {
    return fallback
  }
}

export const set = (key, value) => {
  try {
    if (hasWx()) wx.setStorageSync(key, value)
    else memory.set(key, value)
    return true
  } catch (e) {
    return false
  }
}

export const remove = (key) => {
  try {
    if (hasWx()) wx.removeStorageSync(key)
    else memory.delete(key)
    return true
  } catch (e) {
    return false
  }
}

/** 只清我们自己前缀下的 key（不要用 wx.clearStorageSync） */
export const clearByPrefix = (prefix = PREFIX) => {
  try {
    if (!hasWx()) {
      for (const k of Array.from(memory.keys())) if (k.indexOf(prefix) === 0) memory.delete(k)
      return true
    }
    const info = wx.getStorageInfoSync() || {}
    const keys = info.keys || []
    keys.forEach((k) => {
      if (k.indexOf(prefix) === 0) wx.removeStorageSync(k)
    })
    return true
  } catch (e) {
    return false
  }
}

/* ---------------- token ---------------- */

export const getAccessToken = () => get(KEYS.accessToken, '')
export const getRefreshToken = () => get(KEYS.refreshToken, '')

/**
 * 服务端开了 `ROTATE_REFRESH_TOKENS`，每次刷新都会**作废旧 refresh**，
 * 所以这里必须支持把新的 refresh 一起写回去，否则第二次刷新必然失败。
 */
export const saveTokens = ({ access, refresh } = {}) => {
  if (access) set(KEYS.accessToken, access)
  if (refresh) set(KEYS.refreshToken, refresh)
}

export const clearTokens = () => {
  remove(KEYS.accessToken)
  remove(KEYS.refreshToken)
}

/** 仅供单测：清空内存替身，避免用例之间互相污染 */
export const __resetMemory = () => memory.clear()
