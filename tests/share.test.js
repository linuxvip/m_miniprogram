/**
 * 分享卡片测试（T-6.9）
 *
 * 分享是**只有真机转发一次才能看到**的东西，所以这里把「卡片长什么样」钉住：
 *  1. 标题是中文内容、不是空的（空标题会让微信渲染成「某某的小程序」）；
 *  2. 朋友圈的 `query` 不能带前导 `?`（带了微信会把问号当成第一个参数名的一部分）；
 *  3. 黄历分享要把选中的那一天带过去，手改过的链接不能把页面带到 1900 年或白屏。
 *
 * 最后一条是本轮 T-6.1 的守卫：标题与默认配置里出现「算命 / 运势 / 玄机 / 改运」这类
 * 表述是**审核级事故**，用测试挡住比靠人记着可靠。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SHARE_PATHS, SHARE_TITLES, shareCard, paipanShare, libraryShare, profileShare,
  huangliShareTitle, huangliShareQuery, huangliShare, huangliInputFrom, timelineOf
} from '../utils/share.js'
import { DEFAULT_CONFIG } from '../utils/config.js'

const DAY = { year: 2026, month: 9, day: 24, hour: 15, minute: 30 }

/* ==================== 四个 tab 页 ==================== */

test('五个页面的路径都是绝对路径，且与 app.json 的页面注册一致', () => {
  assert.deepEqual(SHARE_PATHS, {
    paipan: '/pages/paipan/paipan',
    chart: '/pages/chart/chart',
    huangli: '/pages/huangli/huangli',
    library: '/pages/library/library',
    profile: '/pages/profile/profile'
  })
})

test('三个默认分享卡片：中文标题 + 正确路径', () => {
  assert.deepEqual(paipanShare(), { title: SHARE_TITLES.paipan, path: SHARE_PATHS.paipan })
  assert.deepEqual(libraryShare(), { title: SHARE_TITLES.library, path: SHARE_PATHS.library })
  assert.deepEqual(profileShare(), { title: SHARE_TITLES.profile, path: SHARE_PATHS.profile })

  Object.values(SHARE_TITLES).forEach((title) => {
    assert.equal(typeof title, 'string')
    assert.equal(title.trim().length > 0, true)
    assert.equal(/^[\u4e00-\u9fa5]/.test(title), true, '标题要以中文开头，不能是空的或纯符号')
  })
})

test('shareCard 按「路径 + 标题」组装，不做隐式改写', () => {
  assert.deepEqual(shareCard('/a/b', '标题'), { title: '标题', path: '/a/b' })
})

/* ==================== 朋友圈转换 ==================== */

test('timelineOf：path 的 query 原样搬到 query，且不带前导问号', () => {
  const card = huangliShare(DAY)
  const timeline = timelineOf(card)

  assert.equal(timeline.title, card.title)
  assert.equal(timeline.query, 'y=2026&m=9&d=24')
  assert.equal(timeline.query.indexOf('?') === -1, true, '朋友圈的 query 带问号会被当成参数名的一部分')
  assert.equal('path' in timeline, false, '朋友圈的返回体没有 path 字段')
})

test('timelineOf：没有 query 的页面只给标题（不要留一个空的 query）', () => {
  assert.deepEqual(timelineOf(paipanShare()), { title: SHARE_TITLES.paipan })
  assert.deepEqual(timelineOf({ title: '只有标题' }), { title: '只有标题' })
  assert.deepEqual(timelineOf({ title: '尾巴带问号', path: '/a/b?' }), { title: '尾巴带问号' })
  assert.deepEqual(timelineOf(null), { title: '' })
})

/* ==================== 黄历：分享的那一天 ==================== */

test('黄历分享标题与 query 用选中的那一天，不含时分', () => {
  assert.equal(huangliShareTitle(DAY), '2026年9月24日 · 黄历与四柱')
  assert.equal(huangliShareQuery(DAY), 'y=2026&m=9&d=24')
  assert.equal(huangliShare(DAY).path, '/pages/huangli/huangli?y=2026&m=9&d=24')
})

test('黄历分享链接能被自己读回来（往返一致）', () => {
  const input = huangliInputFrom({ y: '2026', m: '9', d: '24' }, { year: 2000, month: 1, day: 1 })
  assert.deepEqual(input, { year: 2026, month: 9, day: 24 })
})

test('链接参数不合法时逐项退回当前值，而不是整份丢掉或跳到 1900 年', () => {
  const base = { year: 2026, month: 9, day: 24 }

  assert.deepEqual(huangliInputFrom({}, base), base, '没有参数就是原样')
  assert.deepEqual(huangliInputFrom({ y: 'abc', m: '9' }, base), { year: 2026, month: 9, day: 24 })
  assert.deepEqual(huangliInputFrom({ y: '1899', m: '13', d: '0' }, base), base, '越界值一律忽略')
  assert.deepEqual(huangliInputFrom({ y: '2024', m: '9.5' }, base), { year: 2024, month: 9, day: 24 })
  assert.deepEqual(
    huangliInputFrom({ y: '2024', m: '2', d: '31' }, base),
    { year: 2024, month: 2, day: 29 },
    '2 月 31 日要夹到当月最后一天（交给 almanac 算，别自己写闰年判断）'
  )
  assert.deepEqual(huangliInputFrom({ y: '2024', m: '2', d: 'abc' }, base), { year: 2024, month: 2, day: 24 })
})

/* ==================== 合规守卫（T-6.1） ==================== */

test('分享标题与默认站点配置里不含违禁表述', () => {
  const banned = /算命|预测|运势|凶吉|吉凶|改运|转运|开运|招财|化解|占卜|风水|玄机|大师|化解/
  const texts = [...Object.values(SHARE_TITLES), huangliShareTitle(DAY), DEFAULT_CONFIG.site_subtitle]

  texts.forEach((text) => {
    assert.equal(banned.test(text), false, `文案「${text}」命中违禁词，见任务清单 T-6.1`)
  })
})
