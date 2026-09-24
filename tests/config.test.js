/**
 * 站点配置测试（T-0.9）
 *
 * 重点不是「能不能拉到」，而是三种「拉不到 / 拉到奇怪的」情况下的行为：
 *  1. 接口里混着不该要的字段（现在真的混着 deepseek_api_key）→ 只取白名单；
 *  2. 接口挂了 → 依次退回缓存、内置默认值，**绝不抛错**；
 *  3. 缓存过期 → 重新拉；没过期 → 一个请求都不发。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  pickConfig, readCachedConfig, writeCachedConfig, loadSiteConfig,
  DEFAULT_CONFIG, CONFIG_PATH, CACHE_TTL
} from '../utils/config.js'
import { get as storageGet, set as storageSet, __resetMemory, KEYS } from '../utils/storage.js'

const HOUR = 60 * 60 * 1000

/** 假 fetcher：记录调用，按 handler 返回或抛错 */
const makeFetcher = (handler) => {
  const calls = []
  const fetcher = async (path, options) => {
    calls.push({ path, options })
    const res = await handler(path, options)
    if (res instanceof Error) throw res
    return res
  }
  fetcher.calls = calls
  return fetcher
}

const NETWORK_BODY = {
  site_name: '命海拾遗',
  site_subtitle: '探索八字玄机 · 洞悉人生运势',
  footer_text: 'Ming Hai Shi Yi · 命海拾遗',
  qrcode_url: '/qrcode.jpg',
  avatar_url: '/avatar.jpg',
  wx_qrcode_url: '/data/wx.jpg',
  deepseek_api_key: 'sk-should-never-be-stored',
  deepseek_api_url: 'https://api.deepseek.com',
  something_new: '未来后端新增的字段'
}

test('pickConfig 只取白名单字段，密钥与未知字段一律丢掉', () => {
  const config = pickConfig(NETWORK_BODY)
  assert.deepEqual(Object.keys(config).sort(), Object.keys(DEFAULT_CONFIG).sort())
  assert.equal(config.wx_qrcode_url, '/data/wx.jpg')
  assert.equal(config.deepseek_api_key, undefined)
  assert.equal(config.something_new, undefined)
  assert.equal(JSON.stringify(config).indexOf('sk-'), -1, '序列化后不能出现密钥')
})

test('pickConfig 对空值 / 非字符串 / 整个 body 缺失都退回默认值', () => {
  assert.deepEqual(pickConfig(null), DEFAULT_CONFIG)
  assert.deepEqual(pickConfig('boom'), DEFAULT_CONFIG)
  assert.deepEqual(pickConfig({}), DEFAULT_CONFIG)
  assert.deepEqual(pickConfig({ site_name: '   ', footer_text: 123 }), DEFAULT_CONFIG)
  assert.equal(pickConfig({ site_name: '  命海  ' }).site_name, '命海', '顺手 trim')
})

test('缓存往返：写进去能读回来，且读出来也是白名单后的结果', () => {
  __resetMemory()
  assert.equal(readCachedConfig(), null)
  writeCachedConfig(NETWORK_BODY)
  const cached = readCachedConfig()
  assert.equal(cached.site_name, '命海拾遗')
  assert.equal(cached.deepseek_api_key, undefined)
  const entry = storageGet(KEYS.siteConfig)
  assert.ok(entry.ts > 0, '要记时间戳，否则没法判过期')
})

test('缓存过期（>1 小时）或时间戳坏掉都视为没有', () => {
  __resetMemory()
  const t0 = 1_700_000_000_000
  writeCachedConfig(NETWORK_BODY, t0)
  assert.ok(readCachedConfig(t0 + CACHE_TTL - 1000), '没过期要能读到')
  assert.equal(readCachedConfig(t0 + CACHE_TTL + 1000), null, '过期当没有')
  assert.equal(readCachedConfig(t0 - 1000), null, '时间戳比现在还晚 = 坏数据')

  // 时间戳不是数字（存储被外部写坏）也要当没有
  __resetMemory()
  storageSet(KEYS.siteConfig, { ts: 'not-a-number', data: NETWORK_BODY })
  assert.equal(readCachedConfig(), null)
})

test('拉取成功：走 network，落缓存，并把新配置给出去', async () => {
  __resetMemory()
  const fetcher = makeFetcher(() => NETWORK_BODY)
  const { config, from } = await loadSiteConfig({ fetcher })
  assert.equal(from, 'network')
  assert.equal(config.wx_qrcode_url, '/data/wx.jpg')
  assert.equal(fetcher.calls.length, 1)
  assert.equal(fetcher.calls[0].path, CONFIG_PATH)
  assert.equal(fetcher.calls[0].options.auth, false, '公开接口不该带 token')
  assert.ok(readCachedConfig(), '要落缓存')
})

test('1 小时内的第二次调用直接用缓存，一个请求都不发', async () => {
  __resetMemory()
  const fetcher = makeFetcher(() => NETWORK_BODY)
  const first = await loadSiteConfig({ fetcher })
  const second = await loadSiteConfig({ fetcher })
  assert.equal(first.from, 'network')
  assert.equal(second.from, 'cache')
  assert.equal(fetcher.calls.length, 1, `只应发一次请求，实际 ${fetcher.calls.length}`)
})

test('接口挂了：没有缓存就用内置默认值，绝不抛错', async () => {
  __resetMemory()
  const fetcher = makeFetcher(() => Object.assign(new Error('网络连接失败'), { kind: 'network' }))
  const { config, from, error } = await loadSiteConfig({ fetcher })
  assert.equal(from, 'default')
  assert.deepEqual(config, DEFAULT_CONFIG)
  assert.ok(error, '要把错误带出来，便于打日志')
})

test('接口挂了但有过期缓存：仍用旧缓存（stale），不退回内置默认值', async () => {
  __resetMemory()
  const t0 = 1_700_000_000_000
  writeCachedConfig({ ...NETWORK_BODY, footer_text: '旧页脚' }, t0)
  const fetcher = makeFetcher(() => new Error('boom'))
  const { config, from } = await loadSiteConfig({ fetcher, now: t0 + CACHE_TTL + 1 })
  assert.equal(from, 'stale')
  assert.equal(config.footer_text, '旧页脚')
  assert.equal(fetcher.calls.length, 1)
})

test('force: true 跳过缓存强制重拉', async () => {
  __resetMemory()
  const fetcher = makeFetcher(() => NETWORK_BODY)
  await loadSiteConfig({ fetcher })
  const again = await loadSiteConfig({ fetcher, force: true })
  assert.equal(again.from, 'network')
  assert.equal(fetcher.calls.length, 2)
})
