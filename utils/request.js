/**
 * 请求层（T-0.3）
 *
 * 网页端用 axios + 两个拦截器（`user/api/client.ts`）；小程序没有 axios，
 * 这里用 `wx.request` 手写等价能力，一条条对齐：
 *
 * | 能力 | 网页端 | 这里 |
 * | --- | --- | --- |
 * | baseURL | `/api`（nginx 反代） | `https://www.minghaishiyi.cn/api`（小程序没有反代，必须绝对地址） |
 * | token 注入 | 请求拦截器读 localStorage | `getAccessToken()`，key 见 `utils/storage.js` |
 * | 401 刷新 | 响应拦截器 + failedQueue | `ensureRefreshed()`——**同一个 Promise 复用**，天然去重 |
 * | 刷新后重放 | 重发原 config | `doRequest({ ...opts, retryOn401: false })`，重放时重新读 token |
 *
 * 有两点是网页端**没做对**、这里必须做对的（服务端 `settings.SIMPLE_JWT` 里
 * `ROTATE_REFRESH_TOKENS=True` + `BLACKLIST_AFTER_ROTATION=True`）：
 *
 *  1. **刷新后要存新的 refresh**：每次刷新服务端都会返回新的 refresh 并把旧的拉黑。
 *     网页端 `client.ts` 只存了 `data.access`，于是第二次刷新会拿已作废的 refresh 去换，
 *     必然失败、直接登出。这里用 `saveTokens({ access, refresh })` 一起存。
 *  2. **登录接口的 401 不能触发刷新**：密码错也是 401，拿 refresh 去换毫无意义，
 *     还会把用户原本有效的登录态清掉。登录/注册/刷新这三个接口显式传 `retryOn401: false`。
 *
 * 与其余 utils 一样，这一层不碰 setData，纯逻辑可被 `tests/request.test.js`
 * 用假 adapter 在 node 里完整跑一遍（含并发去重）。
 */
import { getAccessToken, getRefreshToken, saveTokens, clearTokens } from './storage.js'

/** 小程序没有 nginx 反代，必须写死绝对地址；同时要在后台配 request 合法域名 */
export const API_BASE = 'https://www.minghaishiyi.cn/api'
export const TIMEOUT_MS = 15000

/** 统一错误对象：调用方只看 `kind` / `status` 就能决定怎么提示 */
export class ApiError extends Error {
  constructor(message, { kind = 'http', status = 0, data = null, code = '' } = {}) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind // http | network | timeout | auth | config
    this.status = status
    this.data = data
    this.code = code
  }
}

/* ---------------- URL 拼装 ---------------- */

/** 只拼有值的参数；数组按同名重复展开（DRF 的 source 就是这种） */
export const buildQuery = (params) => {
  if (!params) return ''
  const parts = []
  Object.keys(params).forEach((key) => {
    const value = params[key]
    if (value === undefined || value === null || value === '') return
    const enc = (v) => `${encodeURIComponent(key)}=${encodeURIComponent(v)}`
    if (Array.isArray(value)) value.forEach((v) => parts.push(enc(v)))
    else parts.push(enc(value))
  })
  return parts.join('&')
}

export const buildUrl = (path, params, baseUrl = API_BASE) => {
  const raw = String(path === undefined || path === null ? '' : path)
  const full = /^https?:\/\//i.test(raw)
    ? raw
    : `${baseUrl}${raw.charAt(0) === '/' ? '' : '/'}${raw}`
  const qs = buildQuery(params)
  if (!qs) return full
  return `${full}${full.indexOf('?') >= 0 ? '&' : '?'}${qs}`
}

/**
 * DRF 分页返回的 `next` 是**绝对地址**，而且线上实测是 `http://`（不是 https）。
 * 小程序只允许 https，直接拿着 next 请求会被拦，所以统一改写。
 * 同时把可能写错的 host（比如内网地址）拉回我们的正式域名。
 */
export const normalizeNextUrl = (next, baseUrl = API_BASE) => {
  const raw = String(next || '').trim()
  if (!raw) return ''
  const marker = raw.indexOf('/api/')
  const pathAndQuery = marker >= 0 ? raw.slice(marker) : `/api/${raw.replace(/^\/+/, '')}`
  return `${baseUrl.replace(/\/api$/, '')}${pathAndQuery}`
}

/* ---------------- 错误信息 ---------------- */

/** DRF 的报错体形状有好几种：`{detail}` / `{message}` / `{字段: [错误]}` */
export const messageFromBody = (body, status) => {
  const fallback = `请求失败（HTTP ${status || 0}）`
  if (typeof body === 'string') return body.trim() ? body.trim().slice(0, 200) : fallback
  if (!body || typeof body !== 'object') return fallback
  if (typeof body.message === 'string' && body.message) return body.message
  if (typeof body.detail === 'string' && body.detail) return body.detail
  const keys = Object.keys(body)
  for (let i = 0; i < keys.length; i++) {
    const value = body[keys[i]]
    if (Array.isArray(value) && value.length) return `${keys[i]}：${String(value[0])}`
    if (typeof value === 'string' && value) return `${keys[i]}：${value}`
  }
  return fallback
}

/** wx.request 的失败回调 → 可提示的错误；三种常见原因分开，便于排查 */
const toWxError = (err) => {
  const msg = String((err && (err.errMsg || err.message)) || '')
  if (msg.indexOf('timeout') >= 0) {
    return new ApiError('请求超时，请检查网络后重试', { kind: 'timeout' })
  }
  // 「url not in domain list」= 后台服务器域名没配，是最容易踩且最难自己发现的一种
  if (msg.indexOf('domain list') >= 0 || msg.indexOf('合法域名') >= 0) {
    return new ApiError('请求域名未加入后台「服务器域名」白名单', { kind: 'config' })
  }
  return new ApiError('网络连接失败，请稍后重试', { kind: 'network' })
}

const toApiError = (err) => {
  if (err instanceof ApiError) return err
  return toWxError(err)
}

const errorFromResponse = (res) => {
  const status = (res && res.statusCode) || 0
  const body = res && res.data
  if (status === 401 || status === 403) {
    return new ApiError(messageFromBody(body, status), { kind: 'auth', status, data: body })
  }
  return new ApiError(messageFromBody(body, status), { kind: 'http', status, data: body })
}

/* ---------------- adapter ---------------- */

/** `wx.request` 的 Promise 包装：把回调式错误转成 reject(ApiError) */
export const wxAdapter = ({ url, method, header, data, timeout }) =>
  new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      header,
      data,
      timeout,
      success: (res) => resolve({ statusCode: res.statusCode, data: res.data, header: res.header }),
      fail: (err) => reject(toWxError(err))
    })
  })

/* ---------------- client ---------------- */

const JSON_HEADER = { 'Content-Type': 'application/json' }

/**
 * 创建一个请求客户端。`adapter` 可注入——单测塞假实现，运行时用 `wxAdapter`。
 */
export const createClient = ({ adapter = wxAdapter, baseUrl = API_BASE, timeout = TIMEOUT_MS } = {}) => {
  // 刷新中的 Promise：并发 401 共用同一个，保证「3 个请求只刷新一次」
  let refreshing = null

  const refreshAccessToken = async () => {
    const refresh = getRefreshToken()
    if (!refresh) {
      throw new ApiError('登录已过期，请重新登录', { kind: 'auth', status: 401 })
    }
    let res
    try {
      res = await adapter({
        url: buildUrl('/auth/refresh/', null, baseUrl),
        method: 'POST',
        header: JSON_HEADER,
        data: { refresh },
        timeout
      })
    } catch (e) {
      throw toApiError(e)
    }
    const status = (res && res.statusCode) || 0
    const body = res && res.data
    if (status < 200 || status >= 300 || !body || !body.access) {
      throw new ApiError(messageFromBody(body, status), { kind: 'auth', status: status || 401, data: body })
    }
    saveTokens({ access: body.access, refresh: body.refresh || refresh })
    return body.access
  }

  const ensureRefreshed = () => {
    if (refreshing) return refreshing
    refreshing = refreshAccessToken()
    const done = () => {
      refreshing = null
    }
    refreshing.then(done, done)
    // 刷新失败 = 登录态真的废了：清干净 token，让页面回到未登录态
    return refreshing.catch((err) => {
      clearTokens()
      throw err
    })
  }

  const doRequest = async (options) => {
    const {
      path,
      method = 'GET',
      data,
      params,
      header,
      auth = true,
      retryOn401 = true,
      timeout: perRequestTimeout
    } = options

    const url = buildUrl(path, params, baseUrl)
    const finalHeader = { ...JSON_HEADER, ...header }
    if (auth) {
      const token = getAccessToken()
      if (token) finalHeader.Authorization = `Bearer ${token}`
    }

    let res
    try {
      res = await adapter({
        url,
        method: String(method).toUpperCase(),
        header: finalHeader,
        data,
        timeout: perRequestTimeout || timeout
      })
    } catch (e) {
      throw toApiError(e)
    }

    // 401：先刷新再重放一次（重放时重新从存储里读 token，不缓存旧的）
    if (res.statusCode === 401 && auth && retryOn401) {
      await ensureRefreshed()
      return doRequest({ ...options, retryOn401: false })
    }

    if (res.statusCode >= 200 && res.statusCode < 300) return res.data
    throw errorFromResponse(res)
  }

  const request = (options) => {
    if (!options || !options.path) {
      return Promise.reject(new ApiError('缺少请求路径', { kind: 'config' }))
    }
    return doRequest(options)
  }

  return {
    request,
    get: (path, options = {}) => request({ ...options, path, method: 'GET' }),
    post: (path, data, options = {}) => request({ ...options, path, method: 'POST', data }),
    put: (path, data, options = {}) => request({ ...options, path, method: 'PUT', data }),
    patch: (path, data, options = {}) => request({ ...options, path, method: 'PATCH', data }),
    del: (path, options = {}) => request({ ...options, path, method: 'DELETE' }),
    /** 供测试替换 adapter（运行时不要用） */
    setAdapter: (next) => {
      adapter = next
    }
  }
}

/** 全项目共用的默认实例 */
export const client = createClient()

export const request = (options) => client.request(options)
export const get = (path, options) => client.get(path, options)
export const post = (path, data, options) => client.post(path, data, options)
export const put = (path, data, options) => client.put(path, data, options)
export const patch = (path, data, options) => client.patch(path, data, options)
export const del = (path, options) => client.del(path, options)
