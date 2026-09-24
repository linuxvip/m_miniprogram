import {
  YEAR_LABELS, MONTH_LABELS, HOUR_LABELS, MINUTE_LABELS, LUNAR_DAY_NAMES,
  DIRECT_STEPS, emptyDirect, isDirectComplete, solarToLunar
} from '../../utils/calendar.js'
import { findAllSolarDatesFromBaZi } from '../../utils/bazi/baziCalc.js'
import {
  normalizeSolar, parseSolarDigits, normalizeLunar, solarFromWheel, lunarFromWheel,
  directStepView, applyDirectPick, directSignature, switchCalendarTab
} from '../../utils/datetimeSheet.js'

Component({
  options: { styleIsolation: 'apply-shared' },

  properties: {
    show: { type: Boolean, value: false },
    tab: { type: String, value: 'SOLAR' },
    solar: { type: Object, value: null },
    lunar: { type: Object, value: null },
    direct: { type: Object, value: null },
    sect: { type: Number, value: 2 }
  },

  data: {
    inner: {
      tab: 'SOLAR',
      solar: { year: 1990, month: 1, day: 1, hour: 12, minute: 0 },
      lunar: { year: 1990, month: 1, leap: false, day: 1, hour: 12, minute: 0 },
      direct: emptyDirect()
    },
    // 公历滚轮
    yearLabels: YEAR_LABELS,
    monthLabels: MONTH_LABELS,
    hourLabels: HOUR_LABELS,
    minuteLabels: MINUTE_LABELS,
    solarDayLabels: [],
    solarIdx: [0, 0, 0, 12, 0],
    // 农历滚轮
    lunarMonthLabels: [],
    lunarMonthValues: [],
    lunarDayLabels: LUNAR_DAY_NAMES.slice(),
    lunarIdx: [0, 0, 0, 12, 0],
    // 快填
    solarInput: '',
    inputError: '',
    // 四柱
    directStep: 0,
    directEditing: false,
    directCells: [],
    stepIsStem: false,
    stepIsBranch: false,
    stepIsMonth: false,
    stepIsHour: false,
    stepTitle: '',
    stepBlocker: '',
    ganOptions: [],
    zhiOptions: [],
    pillarOptions: [],
    matches: [],
    matchEmpty: false
  },

  observers: {
    show(visible) {
      if (visible) this.reset()
    }
  },

  methods: {
    /** 每次打开都从外部属性重新灌入状态，保证「取消」不留痕 */
    reset() {
      const now = new Date()
      const solar = this.data.solar || {
        year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(),
        hour: now.getHours(), minute: now.getMinutes()
      }
      const lunar = this.data.lunar || solarToLunar(solar)
      const direct = this.data.direct || emptyDirect()
      const tab = this.data.tab || 'SOLAR'
      this._matches = []
      this.setData({
        solarInput: '',
        inputError: '',
        directStep: 0,
        directEditing: false,
        inner: { tab, solar, lunar, direct }
      }, () => this.refreshAll())
    },

    refreshAll() {
      this.refreshSolar()
      this.refreshLunar()
      this.refreshDirect()
    },

    /* ---------------- 公历 ---------------- */

    refreshSolar() {
      const { solar, index, dayLabels } = normalizeSolar(this.data.inner.solar)
      this.setData({ 'inner.solar': solar, solarIdx: index, solarDayLabels: dayLabels })
    },

    onSolarWheel(e) {
      this.setData({ 'inner.solar': solarFromWheel(e.detail.value) }, () => this.refreshSolar())
    },

    onSolarInput(e) {
      this.setData({ solarInput: e.detail.value, inputError: '' })
    },

    parseSolarInput() {
      const parsed = parseSolarDigits(this.data.solarInput)
      if (!parsed.ok) {
        this.setData({ inputError: parsed.error })
        return
      }
      this.setData({ 'inner.solar': parsed.solar, solarInput: '', inputError: '' }, () => this.refreshSolar())
    },

    /* ---------------- 农历 ---------------- */

    refreshLunar() {
      const view = normalizeLunar(this.data.inner.lunar)
      this.setData({
        'inner.lunar': view.lunar,
        lunarMonthLabels: view.monthLabels,
        lunarMonthValues: view.monthValues,
        lunarDayLabels: view.dayLabels,
        lunarIdx: view.index
      })
    },

    onLunarWheel(e) {
      this.setData({ 'inner.lunar': lunarFromWheel(e.detail.value) }, () => this.refreshLunar())
    },

    /* ---------------- 四柱 ---------------- */

    refreshDirect() {
      const d = this.data.inner.direct
      const view = directStepView(d, this.data.directStep, { editing: this.data.directEditing })
      const patch = { ...view }

      // 匹配时间：只有选齐且不在编辑态时才计算（这个计算很重，别在每次 setData 时跑）
      const shouldMatch = view.directComplete && !this.data.directEditing
      if (shouldMatch) {
        const signature = directSignature(d, this.data.sect)
        if (!this._matchSignature || this._matchSignature !== signature) {
          this._matchSignature = signature
          try {
            this._matches = findAllSolarDatesFromBaZi(
              d.yearGan + d.yearZhi, d.monthGan + d.monthZhi,
              d.dayGan + d.dayZhi, d.hourGan + d.hourZhi,
              this.data.sect
            )
          } catch (e) {
            this._matches = []
          }
          this._selectedMatchKey = this._matches.length ? this._matches[0].toYmdHms() : ''
        }
        let selectedIdx = this._matches.findIndex((m) => m.toYmdHms() === this._selectedMatchKey)
        if (selectedIdx < 0) selectedIdx = 0
        patch.matches = this._matches.map((m, i) => {
          const l = m.getLunar()
          return {
            key: m.toYmdHms(),
            solar: m.toYmdHms().slice(0, 16),
            lunar: `${l.getYearInChinese()}年${l.getMonthInChinese()}月${l.getDayInChinese()} ${l.getTimeZhi()}时`,
            selected: i === selectedIdx
          }
        })
        patch.matchEmpty = patch.matches.length === 0
      } else {
        this._matches = []
        this._matchSignature = ''
        patch.matches = []
        patch.matchEmpty = false
      }

      this.setData(patch)
    },

    pickDirect(e) {
      const { direct, step } = applyDirectPick(
        this.data.inner.direct, this.data.directStep, e.currentTarget.dataset.v
      )
      this.setData({
        'inner.direct': direct,
        directStep: step,
        directEditing: false
      }, () => this.refreshDirect())
    },

    jumpToStep(e) {
      const step = e.currentTarget.dataset.step
      const idx = DIRECT_STEPS.indexOf(step)
      if (idx < 0) return
      this.setData({ directStep: idx, directEditing: true }, () => this.refreshDirect())
    },

    clearDirect() {
      this._matches = []
      this._matchSignature = ''
      this._selectedMatchKey = ''
      this.setData({
        'inner.direct': emptyDirect(),
        directStep: 0,
        directEditing: false
      }, () => this.refreshDirect())
    },

    /** 总览格里的「确认」：把匹配到的公历日期带回给页面 */
    confirmDirectMatch() {
      const idx = this.data.matches.findIndex((m) => m.selected)
      const match = this._matches[idx >= 0 ? idx : 0]
      if (!match) return null
      return {
        year: match.getYear(), month: match.getMonth(), day: match.getDay(),
        hour: match.getHour(), minute: match.getMinute()
      }
    },

    selectMatch(e) {
      const key = e.currentTarget.dataset.key
      this._selectedMatchKey = key
      this.setData({
        matches: this.data.matches.map((m) => ({ ...m, selected: m.key === key }))
      })
    },

    /** 四柱总览上的「确认」：选齐后跳到匹配列表 */
    confirmDirect() {
      if (!isDirectComplete(this.data.inner.direct)) return
      this.setData({ directEditing: false }, () => this.refreshDirect())
    },

    /* ---------------- Tab 与提交 ---------------- */

    switchTab(e) {
      const next = switchCalendarTab(this.data.inner, e.currentTarget.dataset.tab)
      this.setData({ inner: next, inputError: '' }, () => this.refreshAll())
    },

    onClose() {
      this.triggerEvent('close')
    },

    onConfirm() {
      const inner = this.data.inner
      if (inner.tab === 'DIRECT') {
        if (!isDirectComplete(inner.direct)) {
          wx.showToast({ title: '请先完成四柱选择', icon: 'none' })
          return
        }
        const matchedSolar = this.confirmDirectMatch()
        this.triggerEvent('confirm', {
          tab: 'DIRECT',
          solar: matchedSolar,
          lunar: inner.lunar,
          direct: { ...inner.direct, matchedSolar: matchedSolar || undefined }
        })
        return
      }
      const solar = inner.tab === 'LUNAR' ? lunarToSolar(inner.lunar) : inner.solar
      const lunar = inner.tab === 'LUNAR' ? inner.lunar : solarToLunar(inner.solar)
      this.triggerEvent('confirm', { tab: inner.tab, solar, lunar, direct: inner.direct })
    },

    noop() {}
  }
})
