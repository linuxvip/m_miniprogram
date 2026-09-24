/**
 * 站点配置（T-0.9）
 *
 * 网页端 `admin/contexts/ConfigContext.tsx` 的做法：启动时拉一次 `GET /api/system-configs/`，
 * 存 localStorage 缓存 1 小时，失败就用内置默认值。这里照搬，只是存储换成 `utils/storage.js`。
 *
 * 两个刻意的设计：
 *  1. **只取白名单字段**（`pickConfig`）。该接口目前会明文返回 `deepseek_api_key`（已记为 P0），
 *     我们既不落盘也不往上抛——将来后端修好或再漏别的字段，小程序这边都不会被带出去。
 *  2. **失败永不抛**。配置只影响站名 / 页脚这类装饰性文案，接口挂了必须照常能用，
 *     所以失败时依次退回「缓存 → 内置默认值」。
 */
import { get as storageGet, set as storageSet, KEYS } from './storage.js'
import { get as httpGet } from './request.js'

export const CONFIG_PATH = '/system-configs/'
export const CACHE_TTL = 60 * 60 * 1000

/** 与网页端 ConfigContext 的 defaults 逐字段一致 */
export const DEFAULT_CONFIG = {
  site_name: '命海拾遗',
  // T-6.1 合规：不用「玄机 / 运势 / 预测」这类表述，统一为工具口径
  site_subtitle: '传统历法 · 四柱排盘工具',
  footer_text: 'Ming Hai Shi Yi · 命海拾遗',
  qrcode_url: '/qrcode.jpg',
  avatar_url: '/avatar.jpg',
  wx_qrcode_url: '/wx_qrcode.jpg'
}

export const CONFIG_KEYS = Object.keys(DEFAULT_CONFIG)

/**
 * 站点静态资源的基地址。
 * 后端的 avatar_url / qrcode_url 存的是**相对路径**（网页端挂在同源下就能用），
 * 小程序里必须拼成绝对 https 地址，image 组件才加载得出来。
 */
export const ASSET_BASE = 'https://www.minghaishiyi.cn'

/** 相对路径 → 绝对地址；已经是绝对地址（或 data:）就原样返回 */
export const assetUrl = (path) => {
  const raw = typeof path === 'string' ? path.trim() : ''
  if (!raw) return ''
  if (/^(https?:)?\/\//.test(raw) || raw.indexOf('data:') === 0) return raw
  return ASSET_BASE + (raw.charAt(0) === '/' ? raw : '/' + raw)
}

/** 只保留白名单字段，空值 / 非字符串一律退回默认值 */
export const pickConfig = (raw) => {
  const out = { ...DEFAULT_CONFIG }
  if (!raw || typeof raw !== 'object') return out
  CONFIG_KEYS.forEach((key) => {
    const value = raw[key]
    if (typeof value === 'string' && value.trim()) out[key] = value.trim()
  })
  return out
}

/** 读缓存；过期（>1 小时）或结构损坏都当没有 */
const readEntry = () => {
  const entry = storageGet(KEYS.siteConfig)
  if (!entry || typeof entry !== 'object' || !entry.data) return null
  return entry
}

export const readCachedConfig = (now = Date.now()) => {
  const entry = readEntry()
  if (!entry) return null
  const ts = Number(entry.ts) || 0
  if (!ts || now < ts || now - ts > CACHE_TTL) return null
  return pickConfig(entry.data)
}

/** 忽略过期时间的缓存：只在接口挂掉时用——旧配置也比凭空的内置默认值准 */
export const readStaleConfig = () => {
  const entry = readEntry()
  return entry ? pickConfig(entry.data) : null
}

export const writeCachedConfig = (data, now = Date.now()) =>
  storageSet(KEYS.siteConfig, { ts: now, data: pickConfig(data) })

/**
 * 拿站点配置。`fetcher` / `now` 可注入，方便单测构造「接口挂了」「缓存过期」这些场景。
 * 返回 `{ config, from }`，from ∈ network | cache | default，便于页面日志与测试断言。
 */
export const loadSiteConfig = async ({ fetcher = httpGet, now = Date.now(), force = false } = {}) => {
  if (!force) {
    const cached = readCachedConfig(now)
    if (cached) return { config: cached, from: 'cache' }
  }
  try {
    const raw = await fetcher(CONFIG_PATH, { auth: false, timeout: 8000 })
    const config = pickConfig(raw)
    writeCachedConfig(config, now)
    return { config, from: 'network' }
  } catch (error) {
    const stale = readStaleConfig()
    if (stale) return { config: stale, from: 'stale', error }
    return { config: { ...DEFAULT_CONFIG }, from: 'default', error }
  }
}
