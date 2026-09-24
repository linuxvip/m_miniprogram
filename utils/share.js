/**
 * 分享卡片（T-6.9）
 *
 * 为什么单独一层：五个页面的 `onShareAppMessage` / `onShareTimeline` 返回值形状不一样
 * （朋友圈是 `query` 字符串、没有前导 `?`，好友是 `path`），**卡片标题写错在代码里看不出来**，
 * 只有真机转发一次才发现。所以标题与路径都在这里拼好，页面只负责把当前状态传进来。
 *
 * 三条约定：
 *  1. **标题以内容开头**：微信的卡片本来就会在标题下面渲染小程序名，标题里再带一遍
 *     「命海拾遗」纯属重复占字（朋友圈卡片更窄）。只有「我的」这类没有具体内容的页面才用站点名兜底。
 *  2. **路径必须能被接收方打开**：黄历分享带上 `y/m/d`，让对方看到的是同一张黄历；
 *     命盘页的分享路径由 `utils/chartRoute.js` 自己拼（要带四柱）。
 *  3. **朋友圈的 query 不带 `?`**（`timelineOf` 负责转换），带错了微信会把问号当成参数名的一部分。
 */
import { nowInput, withYearMonth } from './almanac.js'

export const SHARE_PATHS = {
  paipan: '/pages/paipan/paipan',
  chart: '/pages/chart/chart',
  huangli: '/pages/huangli/huangli',
  library: '/pages/library/library',
  profile: '/pages/profile/profile'
}

/** 四个 tab 页的默认标题（内容优先，见文件头第 1 条） */
export const SHARE_TITLES = {
  paipan: '四柱排盘 · 输入生辰查看干支与大运',
  library: '古籍命例库 · 按四柱与标签检索',
  profile: '命海拾遗 · 传统文化与历法工具'
}

export const shareCard = (path, title) => ({ title, path })

export const paipanShare = () => shareCard(SHARE_PATHS.paipan, SHARE_TITLES.paipan)
export const libraryShare = () => shareCard(SHARE_PATHS.library, SHARE_TITLES.library)
export const profileShare = () => shareCard(SHARE_PATHS.profile, SHARE_TITLES.profile)

/* ---------------- 黄历：分享的那一天要跟着接收方一起过去 ---------------- */

const pad2 = (n) => String(n).padStart(2, '0')

export const huangliShareTitle = (input) => {
  const i = input || nowInput()
  return `${i.year}年${i.month}月${i.day}日 · 黄历与四柱`
}

/** 只带年月日：时刻不参与月历，带上只是噪音（也短一点） */
export const huangliShareQuery = (input) => {
  const i = input || nowInput()
  return `y=${i.year}&m=${i.month}&d=${i.day}`
}

export const huangliShare = (input) =>
  shareCard(`${SHARE_PATHS.huangli}?${huangliShareQuery(input)}`, huangliShareTitle(input))

/** 年月的合法区间与 almanac 的选择器保持一致（1900–2100） */
const YEAR_MIN = 1900
const YEAR_MAX = 2100

const intIn = (value, min, max) => {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || Math.floor(n) !== n) return null
  return n >= min && n <= max ? n : null
}

/**
 * 分享链接里的年月日 → 页面输入。
 *
 * 全部走白名单校验后**再交给 almanac 的 `withYearMonth` 收口**（它会把 2 月 31 日这种
 * 不存在的日子夹到当月最后一天）。任何一项不合法就退回 `fallback` 的那一项，
 * 而不是整份丢掉——手改过的链接不该让页面白屏或跳到 1900 年。
 */
export const huangliInputFrom = (query, fallback) => {
  const base = fallback || nowInput()
  const q = query || {}
  const year = intIn(q.y, YEAR_MIN, YEAR_MAX)
  const month = intIn(q.m, 1, 12)
  const day = intIn(q.d, 1, 31)
  if (year === null && month === null && day === null) return { ...base }
  return withYearMonth(
    { ...base, day: day === null ? base.day : day },
    year === null ? base.year : year,
    month === null ? base.month : month
  )
}

/**
 * 好友分享卡片 → 朋友圈卡片。
 * 朋友圈的返回体是 `{ title, query }`，且 query 不能带前导 `?`。
 */
export const timelineOf = (card) => {
  const path = (card && card.path) || ''
  const at = path.indexOf('?')
  if (at < 0 || at === path.length - 1) return { title: (card && card.title) || '' }
  return { title: card.title, query: path.slice(at + 1) }
}
