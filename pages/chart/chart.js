/**
 * 命盘结果页（T-1.10 ~ T-1.14 / T-1.23 / T-1.24 / T-1.17 / T-1.18）
 *
 * 对照网页端 components/BaZiChartDisplay.tsx：
 *   信息头 → 基本排盘 / 专业细盘 两个 Tab → 匹配失败告警条 → 六柱细盘 → 大运 / 流年交互 → 操作区
 * 页面参数自带全部输入（见 utils/chartRoute.js），所以这个页既能从输入页进来，
 * 也能被分享出去直接打开，还能被命例库直接跳进来。
 */
import {
  calculateBaZi, getElement, getShiShenByName, getXingYun,
  getNaYinByGanZhi, getXunKongByGanZhi, HIDE_STEMS
} from '../../utils/bazi/baziCalc.js'
import { Gender, CalendarType } from '../../utils/bazi/types.js'
import { elementTextClass } from '../../utils/theme.js'
import { parseChartQuery, chartShareTitle } from '../../utils/chartRoute.js'
import { caseContextFor } from '../../utils/cases.js'
import { ensureLogin } from '../../utils/auth.js'
import { createUserCase } from '../../utils/userApi.js'
import { canSaveCase, missingPillarsLabel, saveCasePayload } from '../../utils/account.js'

/** 保存按钮的三个文案（T-1.16）：与网页端 SaveCaseBar 一致 */
const SAVE_IDLE = '保存案例'
const SAVE_BUSY = '保存中...'
const SAVE_DONE = '已保存'

/** 神煞按柱归位（与网页端 pillarPos 一致） */
const SHENSHA_POS = [
  ['年干', '年支'],
  ['月干', '月支'],
  ['日干', '日支', '日柱'],
  ['时干', '时支']
]

const shenShaFor = (shenSha, idx) =>
  (shenSha || []).filter((s) => SHENSHA_POS[idx].indexOf(s.pos) >= 0).map((s) => s.name)

const endAgeOf = (lp) => lp.startAge + (lp.endYear - lp.startYear)

/** 由任意干支造一个展示用柱（流年 / 大运），与网页端 flowPillar 等价 */
const flowPillar = (gan, zhi, dm) => ({
  gan,
  zhi,
  ganElement: getElement(gan),
  zhiElement: getElement(zhi),
  shiShen: getShiShenByName(dm, gan),
  cangGan: HIDE_STEMS[zhi] || [],
  cangGanShiShen: (HIDE_STEMS[zhi] || []).map((h) => getShiShenByName(dm, h)),
  naYin: getNaYinByGanZhi(gan, zhi),
  xunKong: getXunKongByGanZhi(gan, zhi),
  xingYun: getXingYun(dm, zhi),
  ziZuo: getXingYun(gan, zhi)
})

const dashCell = () => ({ kind: 'dash', text: '—' })

const cellOf = (build) => (p) => (p ? build(p) : dashCell())

const RENDER_ROWS = [
  { key: 'master', label: '主星', render: null },
  { key: 'gan', label: '天干', render: cellOf((p) => ({ kind: 'big', text: p.gan, cls: elementTextClass(p.ganElement) })) },
  { key: 'zhi', label: '地支', render: cellOf((p) => ({ kind: 'big', text: p.zhi, cls: elementTextClass(p.zhiElement) })) },
  {
    key: 'cangGan',
    label: '藏干',
    render: cellOf((p) => ({ kind: 'list', items: (p.cangGan || []).map((h) => ({ t: h, cls: elementTextClass(getElement(h)) })) }))
  },
  {
    key: 'fuXing',
    label: '副星',
    render: cellOf((p) => ({ kind: 'list', items: (p.cangGanShiShen || []).map((s) => ({ t: s, cls: 'cell-sub' })) }))
  },
  { key: 'xingYun', label: '星运', render: cellOf((p) => ({ kind: 'text', text: p.xingYun, cls: 'cell-strong' })) },
  { key: 'ziZuo', label: '自坐', render: cellOf((p) => ({ kind: 'text', text: p.ziZuo, cls: 'cell-mid' })) },
  { key: 'xunKong', label: '空亡', render: cellOf((p) => ({ kind: 'text', text: p.xunKong, cls: 'cell-soft' })) },
  { key: 'naYin', label: '纳音', render: cellOf((p) => ({ kind: 'text', text: p.naYin, cls: 'cell-soft' })) },
  {
    key: 'shenSha',
    label: '神煞',
    renderWith: (col) => ({
      kind: 'tags',
      items: col.shenSha || [],
      empty: !(col.shenSha && col.shenSha.length)
    })
  }
]

const buildGrid = (cols, isMale) => {
  const rows = RENDER_ROWS.map((row) => {
    let cells
    if (row.key === 'master') {
      cells = cols.map((c) => {
        if (!c.data) return dashCell()
        if (c.isDayMaster) {
          return { kind: 'badge', text: isMale ? '元男' : '元女', cls: isMale ? 'badge-male' : 'badge-female' }
        }
        return { kind: 'badge', text: c.data.shiShen, cls: 'badge-plain' }
      })
    } else if (row.renderWith) {
      cells = cols.map((c) => row.renderWith(c))
    } else {
      cells = cols.map((c) => row.render(c.data))
    }
    return { key: row.key, label: row.label, cells }
  })
  return { cols: cols.map((c) => ({ label: c.label, sub: c.sub || '' })), rows }
}

Page({
  data: {
    ready: false,
    error: '',
    isMale: true,
    genderLabel: '乾造',
    name: '',
    jieQi: '',
    lunarDate: '',
    solarDate: '',
    failed: false,
    viewTab: 'PRO',
    proExpanded: true,
    colCount: 4,
    cellWidth: '',
    gridCols: [],
    gridRows: [],
    colCls: [],
    // 大运 / 流年
    hasLuck: false,
    luckDirection: '',
    qiYunText: '',
    jiaoYunText: '',
    siLingText: '',
    luckPillars: [],
    curYear: 0,
    selYear: 0,
    xuSui: 0,
    // 辅助信息
    wuXing: [],
    wuXingTotal: 0,
    strengthLevel: '',
    strengthDesc: '',
    // 从命例库跳进来时，命例原文与来源（T-1.15）—— 自行排盘时为空，板块不渲染
    caseFeedback: '',
    caseSource: '',
    zodiac: '',
    constellation: '',
    // 保存到我的案例（T-1.16）
    saveState: 'idle',
    saveLabel: SAVE_IDLE
  },

  onLoad(options) {
    this._query = options || {}
    this.shareTitle = '四柱命盘'
    try {
      this.build(this._query)
    } catch (e) {
      this.setData({ error: `排盘失败：${e && e.message ? e.message : e}` })
    }
    this.loadCaseContext()
  },

  /**
   * 命例库跳过来时（T-3.4），把命例原文与来源取回来渲染。
   * 只认 `cid` 对得上的那一条：手动排盘没有 cid，回到命盘页也不该翻出上一条命例的旧文本。
   */
  loadCaseContext() {
    let app = null
    try {
      app = getApp()
    } catch (e) {
      app = null
    }
    const store = app && app.globalData ? app.globalData.pendingCase : null
    const ctx = caseContextFor(this._query.cid, store)
    if (!ctx) return
    this.setData({ caseFeedback: ctx.feedback, caseSource: ctx.source })
  },

  build(query) {
    const input = parseChartQuery(query)
    // 保存案例要用它做 input_snapshot（T-1.16），分享参数自带全部输入，直接复用
    this._input = input
    const gender = input.gender === 'MALE' ? Gender.MALE : Gender.FEMALE
    const type = input.type === 'LUNAR'
      ? CalendarType.LUNAR
      : input.type === 'DIRECT' ? CalendarType.DIRECT : CalendarType.SOLAR

    const chart = calculateBaZi(
      input.year, input.month, input.day, input.hour, input.minute,
      gender, type, input.direct || undefined,
      input.useTrueSolarTime, input.longitude,
      { sect: input.sect, timezoneOffset: input.timezoneOffset }
    )

    const isMale = input.gender === 'MALE'
    const failed = String(chart.solarDate || '').indexOf('失败') >= 0
    const curYear = new Date().getFullYear()
    const luckPillars = Array.isArray(chart.luckPillars) ? chart.luckPillars : []

    this._chart = chart
    this._isMale = isMale
    this._dm = chart.day ? chart.day.gan : ''

    this._baseCols = [
      { label: '年柱', data: chart.year, shenSha: shenShaFor(chart.shenSha, 0) },
      { label: '月柱', data: chart.month, shenSha: shenShaFor(chart.shenSha, 1) },
      { label: '日柱', data: chart.day, isDayMaster: true, shenSha: shenShaFor(chart.shenSha, 2) },
      { label: '时柱', data: chart.hour, shenSha: shenShaFor(chart.shenSha, 3) }
    ]

    const birthYear = luckPillars[0] && luckPillars[0].liuNian && luckPillars[0].liuNian.length
      ? luckPillars[0].liuNian[0].year
      : undefined
    let selLuckIdx = luckPillars.findIndex((lp) => curYear >= lp.startYear && curYear <= lp.endYear)
    if (selLuckIdx < 0) selLuckIdx = luckPillars.length ? 0 : -1

    this._birthYear = birthYear
    this._selLuckIdx = selLuckIdx

    const wuXing = (chart.wuXing || []).map((w) => ({
      element: w.element,
      count: w.count,
      cls: elementTextClass(w.element)
    }))

    this.setData({
      ready: true,
      error: '',
      isMale,
      genderLabel: isMale ? '乾造' : '坤造',
      name: input.name || '',
      jieQi: chart.jieQi || '',
      lunarDate: chart.lunarDate || '',
      solarDate: chart.solarDate || '',
      failed,
      hasLuck: luckPillars.length > 0,
      luckDirection: chart.yunDirection || '',
      qiYunText: chart.qiYunDesc || chart.qiYunText || '',
      jiaoYunText: chart.jiaoYunDesc ? `${chart.jiaoYunDesc}（${chart.qiYunDate || ''}）` : (chart.qiYunDate || ''),
      siLingText: chart.siLingDesc || '',
      curYear,
      selYear: curYear,
      xuSui: birthYear ? curYear - birthYear + 1 : 0,
      wuXing,
      wuXingTotal: wuXing.reduce((n, w) => n + w.count, 0),
      strengthLevel: chart.dayMasterStrength ? chart.dayMasterStrength.level : '',
      strengthDesc: chart.dayMasterStrength ? chart.dayMasterStrength.description : '',
      zodiac: chart.zodiac || '',
      constellation: chart.constellation || ''
    }, () => this.refreshGrid(selLuckIdx))

    this.shareTitle = chartShareTitle(input)
  },

  /** 按当前选中的大运 / 流年重建六柱细盘 */
  refreshGrid(selLuckIdx) {
    const chart = this._chart
    if (!chart || !chart.day) return
    const luckPillars = Array.isArray(chart.luckPillars) ? chart.luckPillars : []
    const idx = selLuckIdx === undefined || selLuckIdx === null ? this._selLuckIdx : selLuckIdx
    this._selLuckIdx = idx

    const allLiuNian = luckPillars.reduce((acc, lp) => acc.concat(lp.liuNian || []), [])
    const selYear = this.data.selYear
    const curYear = this.data.curYear
    const selectedLiuNian = allLiuNian.filter((ln) => ln.year === selYear)[0]
    const currentLiuNian = allLiuNian.filter((ln) => ln.year === curYear)[0]
    const luck = idx >= 0 ? luckPillars[idx] : null
    const currentLuck = luckPillars.filter((lp) => curYear >= lp.startYear && curYear <= lp.endYear)[0]
    const effectiveLiuNian = selectedLiuNian || currentLiuNian
    const effectiveLuck = luck || currentLuck
    const dm = this._dm

    const proCols = [
      {
        label: '流年',
        sub: effectiveLiuNian ? `${effectiveLiuNian.year}年` : `${curYear}年`,
        data: effectiveLiuNian ? flowPillar(effectiveLiuNian.gan, effectiveLiuNian.zhi, dm) : null
      },
      {
        label: '大运',
        sub: effectiveLuck ? `${effectiveLuck.startAge}–${endAgeOf(effectiveLuck)}岁` : '',
        data: effectiveLuck ? flowPillar(effectiveLuck.gan, effectiveLuck.zhi, dm) : null
      },
      { label: '年柱', data: chart.year, shenSha: shenShaFor(chart.shenSha, 0) },
      { label: '月柱', data: chart.month, shenSha: shenShaFor(chart.shenSha, 1) },
      { label: '日柱', data: chart.day, isDayMaster: true, shenSha: shenShaFor(chart.shenSha, 2) },
      { label: '时柱', data: chart.hour, shenSha: shenShaFor(chart.shenSha, 3) }
    ]

    const isPro = this.data.viewTab !== 'BASIC'
    const cols = isPro ? proCols : this._baseCols
    const fourPillarLabels = ['年柱', '月柱', '日柱', '时柱']
    const colCls = cols.map((c) => {
      const parts = []
      if (isPro && fourPillarLabels.indexOf(c.label) >= 0) parts.push('col-four')
      if (isPro && c.label === '年柱') parts.push('col-first')
      if (isPro && c.label === '时柱') parts.push('col-last')
      return parts.join(' ')
    })

    const grid = buildGrid(cols, this.data.isMale)
    const activeLuck = luckPillars.map((lp, i) => ({
      idx: i,
      key: `lp${i}`,
      year: lp.startYear,
      label: lp.type === 'PRE_LUCK' ? '小运' : `${lp.gan}${lp.zhi}`,
      startAge: lp.startAge,
      isCurrent: curYear >= lp.startYear && curYear <= lp.endYear,
      isSelected: i === this._selLuckIdx,
      liuNian: (lp.liuNian || []).map((ln) => ({
        key: `${i}-${ln.year}`,
        year: ln.year,
        ganZhi: `${ln.gan}${ln.zhi}`,
        cls: ln.year === selYear ? 'ln-sel' : (ln.year === curYear ? 'ln-now' : '')
      }))
    }))

    this.setData({
      gridCols: grid.cols,
      gridRows: grid.rows,
      colCls,
      colCount: cols.length,
      cellWidth: `calc((100% - 72rpx) * ${(1 / cols.length).toFixed(4)})`,
      luckPillars: activeLuck
    })
  },

  onSwitchView(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.viewTab) return
    this.setData({ viewTab: tab }, () => this.refreshGrid())
  },

  onTogglePro() {
    this.setData({ proExpanded: !this.data.proExpanded })
  },

  onPickLuck(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const lp = this.data.luckPillars[idx]
    let selYear = this.data.selYear
    if (lp && lp.liuNian && lp.liuNian.length) {
      const hit = lp.liuNian.filter((ln) => ln.year === selYear)[0]
      if (!hit) selYear = lp.liuNian[0].year
    }
    this.setData({ selYear, xuSui: this._birthYear ? selYear - this._birthYear + 1 : 0 }, () => this.refreshGrid(idx))
  },

  onPickLiuNian(e) {
    const year = Number(e.currentTarget.dataset.year)
    const idx = Number(e.currentTarget.dataset.idx)
    this.setData({ selYear: year, xuSui: this._birthYear ? year - this._birthYear + 1 : 0 }, () => this.refreshGrid(idx))
  },

  /**
   * 保存到我的案例（T-1.16 / T-1.17）
   *
   * 与网页端 SaveCaseBar 的差别：那边没登录会弹注册框，这边直接走微信登录
   * （`ensureLogin`）—— 小程序里登录是静默的，不该让用户先填一遍表单。
   * 服务端按「性别 + 四柱」去重，同一条再存一次返回 `created: false`（更新备注），
   * 所以文案要按返回值区分，不能一律说「已保存」。
   */
  onSaveCase() {
    if (this.data.saveState !== 'idle') return
    const chart = this._chart
    if (!chart) return
    if (!canSaveCase(chart)) {
      wx.showToast({
        title: `${missingPillarsLabel(chart)}没有算出干支，无法保存`,
        icon: 'none'
      })
      return
    }

    const payload = saveCasePayload(chart, this._input, this.data.caseFeedback)
    this.setData({ saveState: 'saving', saveLabel: SAVE_BUSY })

    const failed = (err) => {
      this.setData({ saveState: 'idle', saveLabel: SAVE_IDLE })
      wx.showToast({ title: (err && err.message) || '保存失败，请稍后重试', icon: 'none' })
    }

    ensureLogin()
      .then(() => createUserCase(payload))
      .then((res) => {
        const updated = res && res.created === false
        this.setData({ saveState: 'saved', saveLabel: SAVE_DONE })
        wx.showToast({
          title: updated ? '已在你的案例中，已更新信息' : '已保存到我的案例',
          icon: 'none'
        })
      })
      .catch(failed)
  },

  onBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
      return
    }
    wx.switchTab({ url: '/pages/paipan/paipan' })
  },

  /** 分享时丢掉 cid：接收方本地没有那条命例，带上它只会得到一个认不回来的参数 */
  serializeQuery() {
    const q = this._query || {}
    return Object.keys(q)
      .filter((k) => k !== 'cid')
      .map((k) => `${k}=${q[k]}`)
      .join('&')
  },

  onShareAppMessage() {
    return {
      title: this.shareTitle || '四柱命盘',
      path: `/pages/chart/chart?${this.serializeQuery()}`
    }
  },

  onShareTimeline() {
    return {
      title: this.shareTitle || '四柱命盘',
      query: this.serializeQuery()
    }
  }
})
