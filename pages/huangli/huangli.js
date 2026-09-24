/**
 * 黄历页（T-2.1 ~ T-2.6）
 *
 * 与网页端 components/HuangLi.tsx 一一对应：
 *   顶部四柱信息栏 → 月历卡片（月份导航 / 时辰条 / 星期表头 / 日期网格）→ 页脚
 *   两个弹层：年份纵向滚动（1900–2100，打开时滚到当前年）、月份 3 列网格
 *
 * 所有历法计算都在 utils/almanac.js（纯函数、有单测）；这里只管状态与交互。
 * 配色是黄历专用的深红（`--cinnabar` #8a1a1b），不要用排盘页的琥珀色系。
 */
import {
  BRANCHES, BRANCH_TO_HOUR, MONTH_OPTIONS, YEAR_OPTIONS, DEFAULT_FOOTER,
  nowInput, shiftMonth, withYearMonth, withBranchHour, buildHeader, buildMonth,
  backToToday, dayKey, yearKeyOf
} from '../../utils/almanac.js'

const TODAY_REFRESH_MS = 60000

Page({
  data: {
    input: nowInput(),
    header: {},
    month: {},
    branches: BRANCHES.map((b) => ({ b, hourText: `${BRANCH_TO_HOUR[b]}时` })),
    // 弹层
    showYear: false,
    showMonth: false,
    yearOptions: YEAR_OPTIONS,
    monthOptions: MONTH_OPTIONS,
    yearAnchor: '',
    footerText: DEFAULT_FOOTER,
    todayKey: ''
  },

  onLoad() {
    this.refresh(nowInput())
    // 页脚文案取站点配置（T-0.9），与网页端 `{config.footer_text}` 一致；
    // 配置没来 / 拉取失败时继续用 almanac 里的内置默认值
    const app = getApp()
    if (app && typeof app.onSiteConfig === 'function') {
      this._offConfig = app.onSiteConfig((config) => this.applyFooter(config))
    }
  },

  /** 站点配置里的页脚文案（空值不动，避免把默认文案擦掉） */
  applyFooter(config) {
    const text = config && config.footer_text
    if (text && text !== this.data.footerText) this.setData({ footerText: text })
  },

  // 「今」标记要跟着真实时间走：跨日后回到页面不能还标在昨天（T-2.6）
  onShow() {
    this._startClock()
    this.refreshToday()
  },

  onHide() {
    this._stopClock()
  },

  onUnload() {
    this._stopClock()
    if (this._offConfig) {
      this._offConfig()
      this._offConfig = null
    }
  },

  _startClock() {
    this._stopClock()
    this._timer = setInterval(() => this.refreshToday(), TODAY_REFRESH_MS)
  },

  _stopClock() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  },

  /** 选中时刻变了：标题栏与月历一起重算 */
  refresh(input) {
    const header = buildHeader(input)
    const month = buildMonth(input)
    this.setData({
      input,
      header,
      month,
      todayKey: month.todayKey
    })
  },

  /** 只刷新「今」标记：跨日了才整表重算，避免每分钟都跑一遍历法换算 */
  refreshToday() {
    const key = dayKey(nowInput())
    if (key === this.data.todayKey) return
    this.refresh(this.data.input)
  },

  /* ---------------- 月份导航 ---------------- */

  prevMonth() {
    this.refresh(shiftMonth(this.data.input, -1))
  },

  nextMonth() {
    this.refresh(shiftMonth(this.data.input, 1))
  },

  backToToday() {
    this.refresh(backToToday(this.data.input))
  },

  /* ---------------- 选日 / 选时辰 ---------------- */

  pickDay(e) {
    const day = Number(e.currentTarget.dataset.day)
    this.refresh({ ...this.data.input, day })
  },

  pickBranch(e) {
    const branch = e.currentTarget.dataset.branch
    this.refresh(withBranchHour(this.data.input, branch))
  },

  /* ---------------- 年 / 月弹层（T-2.2） ---------------- */

  openYear() {
    // scroll-into-view 认的是 id，打开时指向当前年，模拟网页端的 scrollIntoView
    this.setData({ showYear: true, yearAnchor: yearKeyOf(this.data.input.year) })
  },

  closeYear() {
    this.setData({ showYear: false })
  },

  pickYear(e) {
    const year = Number(e.currentTarget.dataset.year)
    this.setData({ showYear: false }, () => {
      this.refresh(withYearMonth(this.data.input, year, this.data.input.month))
    })
  },

  openMonth() {
    this.setData({ showMonth: true })
  },

  closeMonth() {
    this.setData({ showMonth: false })
  },

  pickMonth(e) {
    const month = Number(e.currentTarget.dataset.month)
    this.setData({ showMonth: false }, () => {
      this.refresh(withYearMonth(this.data.input, this.data.input.year, month))
    })
  }
})
