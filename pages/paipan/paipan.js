/**
 * 排盘输入页（T-1.1 / T-1.4 / T-1.5 / T-1.6 / T-1.7 / T-1.8 / T-1.20 / T-1.21 / T-1.22）
 *
 * 结构对照网页端 components/InputForm.tsx：
 *   姓名 → 性别 → 排盘模式 → 出生日期（底部弹层）→ 出生地点 → 高级设置 → 开始排盘 → 即时局预览
 * 「开始排盘」不在这里算，而是带着输入跳到 pages/chart/chart —— 这样命盘页能被分享 /
 * 从命例库直达，不必先把输入塞进全局变量。
 */
import { Solar, Lunar } from 'lunar-typescript'
import { GENDERS, charTextClass } from '../../utils/theme.js'
import { TIMEZONE_LABELS, loadPreferences, savePreferences, timezoneIndex, lookupArea, formatArea } from '../../utils/preferences.js'
import { buildChartQuery } from '../../utils/chartRoute.js'
import {
  emptyDirect, solarToLunar, lunarToSolar, formatSolar, formatLunar
} from '../../utils/calendar.js'
import { paipanShare, timelineOf } from '../../utils/share.js'

const CLOCK_TICK_MS = 1000

const nowSolar = () => {
  const d = new Date()
  return {
    year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
    hour: d.getHours(), minute: d.getMinutes()
  }
}

Page({
  data: {
    name: '',
    gender: 'MALE',
    calendarType: 'SOLAR',
    genderOptions: [
      { key: 'MALE', label: '乾造' },
      { key: 'FEMALE', label: '坤造' }
    ],
    modeOptions: [
      { key: 'SOLAR', label: '公历' },
      { key: 'LUNAR', label: '农历' },
      { key: 'DIRECT', label: '四柱' }
    ],
    // 出生日期摘要：「2019-02-05 12:00」或带五行色的八字
    summaryNodes: [],
    summaryPlain: '',
    // 出生地点
    region: ['北京市', '北京市', '东城区'],
    regionText: '北京市 东城区',
    longitude: '116.42',
    latitude: '39.93',
    // 高级设置
    showAdvanced: false,
    useTrueSolarTime: true,
    timezoneLabels: TIMEZONE_LABELS,
    timezoneIndex: 20,
    timezoneText: 'UTC+8 (北京, 默认)',
    sect: 2,
    useManualLongitude: false,
    manualLongitude: '',
    // 弹层
    showSheet: false,
    sheetTab: 'SOLAR',
    solar: null,
    lunar: null,
    direct: emptyDirect(),
    // 即时局预览
    hourDeg: 0,
    minuteDeg: 0,
    nowPillars: [],
    nowLunar: '',
    nowSolar: ''
  },

  onLoad() {
    const prefs = loadPreferences()
    const solar = nowSolar()
    const patch = {
      name: '',
      gender: prefs.gender,
      calendarType: prefs.calendarType,
      solar,
      lunar: solarToLunar(solar),
      direct: emptyDirect(),
      region: prefs.region || this.data.region,
      longitude: prefs.longitude,
      latitude: prefs.latitude,
      useTrueSolarTime: prefs.useTrueSolarTime,
      timezoneIndex: timezoneIndex(prefs.timezoneOffset),
      timezoneText: TIMEZONE_LABELS[timezoneIndex(prefs.timezoneOffset)],
      sect: prefs.sect === 1 ? 1 : 2,
      useManualLongitude: prefs.useManualLongitude,
      manualLongitude: prefs.manualLongitude,
      showSheet: false
    }
    const area = lookupArea(patch.region[0], patch.region[1])
    patch.regionText = formatArea(patch.region[0], patch.region[1], patch.region[2])
    if (!prefs.useManualLongitude) {
      patch.longitude = String(area.longitude)
      patch.latitude = String(area.latitude)
    }
    this.setData(patch, () => this.refreshSummary())
    this.startClock()
  },

  onShow() {
    if (!this._timer) this.startClock()
  },

  onHide() {
    this.stopClock()
  },

  onUnload() {
    this.stopClock()
  },

  /* ---------------- 即时局预览（T-1.20）---------------- */

  startClock() {
    this.stopClock()
    this._minuteKey = null
    this.tickClock()
    this._timer = setInterval(() => this.tickClock(), CLOCK_TICK_MS)
  },

  stopClock() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  },

  tickClock() {
    const now = new Date()
    const hourDeg = ((now.getHours() % 12) + now.getMinutes() / 60) * 30
    const minuteDeg = (now.getMinutes() + now.getSeconds() / 60) * 6
    const patch = { hourDeg, minuteDeg }
    // 四柱按分钟惰性重算：每秒只更新两根指针的角度，避免每秒重建 Solar/Lunar/EightChar
    const minuteKey = Math.floor(now.getTime() / 60000)
    if (minuteKey !== this._minuteKey) {
      this._minuteKey = minuteKey
      const solar = Solar.fromDate(now)
      const lunar = solar.getLunar()
      const ec = lunar.getEightChar()
      patch.nowPillars = [
        { label: '年', gan: ec.getYearGan(), zhi: ec.getYearZhi() },
        { label: '月', gan: ec.getMonthGan(), zhi: ec.getMonthZhi() },
        { label: '日', gan: ec.getDayGan(), zhi: ec.getDayZhi() },
        { label: '时', gan: ec.getTimeGan(), zhi: ec.getTimeZhi() }
      ].map((p) => ({
        ...p,
        ganCls: charTextClass(p.gan, true),
        zhiCls: charTextClass(p.zhi, false)
      }))
      patch.nowLunar = `${lunar.getYearInGanZhi()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()} ${lunar.getTimeZhi()}时`
      patch.nowSolar = solar.toYmdHms()
    }
    this.setData(patch)
  },

  /* ---------------- 表单 ---------------- */

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  onGenderTap(e) {
    this.setData({ gender: e.currentTarget.dataset.key })
  },

  onModeTap(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ calendarType: key, sheetTab: key, showSheet: true })
  },

  openSheet() {
    this.setData({ sheetTab: this.data.calendarType, showSheet: true })
  },

  onSheetClose() {
    this.setData({ showSheet: false })
  },

  onSheetConfirm(e) {
    const { tab, solar, lunar, direct } = e.detail
    const patch = { showSheet: false, calendarType: tab }
    if (tab === 'DIRECT') {
      patch.direct = direct
      if (solar) {
        patch.solar = solar
        patch.lunar = lunar || solarToLunar(solar)
      }
    } else {
      patch.solar = solar
      patch.lunar = lunar
    }
    this.setData(patch, () => this.refreshSummary())
  },

  onRegionChange(e) {
    const region = e.detail.value
    const area = lookupArea(region[0], region[1])
    const patch = {
      region,
      regionText: formatArea(region[0], region[1], region[2]),
      latitude: String(area.latitude)
    }
    if (!this.data.useManualLongitude) patch.longitude = String(area.longitude)
    this.setData(patch, () => this.persist())
  },

  onToggleAdvanced() {
    this.setData({ showAdvanced: !this.data.showAdvanced })
  },

  onToggleTrueSolar() {
    this.setData({ useTrueSolarTime: !this.data.useTrueSolarTime }, () => this.persist())
  },

  onToggleSect() {
    this.setData({ sect: this.data.sect === 1 ? 2 : 1 }, () => this.persist())
  },

  onToggleManualLongitude() {
    const next = !this.data.useManualLongitude
    const area = lookupArea(this.data.region[0], this.data.region[1])
    const patch = { useManualLongitude: next }
    if (!next) {
      patch.longitude = String(area.longitude)
      patch.latitude = String(area.latitude)
    }
    this.setData(patch, () => this.persist())
  },

  onManualLongitudeInput(e) {
    this.setData({ manualLongitude: e.detail.value }, () => this.persist())
  },

  onTimezoneChange(e) {
    const idx = Number(e.detail.value)
    this.setData({
      timezoneIndex: idx,
      timezoneText: TIMEZONE_LABELS[idx]
    }, () => this.persist())
  },

  /* ---------------- 摘要 ---------------- */

  refreshSummary() {
    const { calendarType, solar, lunar, direct } = this.data
    if (calendarType === 'DIRECT') {
      const chars = [
        [direct.yearGan, true], [direct.yearZhi, false],
        [direct.monthGan, true], [direct.monthZhi, false],
        [direct.dayGan, true], [direct.dayZhi, false],
        [direct.hourGan, true], [direct.hourZhi, false]
      ]
      const nodes = []
      chars.forEach(([c], i) => {
        nodes.push({ t: c || '—', cls: c ? charTextClass(c, chars[i][1]) : 'muted' })
        if (i === 1 || i === 3 || i === 5) nodes.push({ t: ' ', cls: '' })
      })
      this.setData({ summaryNodes: nodes, summaryPlain: '' })
      return
    }
    const text = calendarType === 'LUNAR' ? formatLunar(lunar) : formatSolar(solar)
    this.setData({ summaryNodes: [], summaryPlain: text })
  },

  /* ---------------- 提交 ---------------- */

  persist() {
    savePreferences({
      gender: this.data.gender,
      calendarType: this.data.calendarType,
      timezoneOffset: TIMEZONE_LABELS[this.data.timezoneIndex].match(/UTC([+-]\d+)/)[1],
      sect: this.data.sect,
      useTrueSolarTime: this.data.useTrueSolarTime,
      useManualLongitude: this.data.useManualLongitude,
      manualLongitude: this.data.manualLongitude,
      locationName: this.data.regionText,
      region: this.data.region,
      longitude: this.data.longitude,
      latitude: this.data.latitude
    })
  },

  onCalculate() {
    const { calendarType, solar, lunar, direct, gender, useTrueSolarTime, timezoneIndex, sect } = this.data
    if (calendarType === 'DIRECT') {
      const complete = direct.yearGan && direct.yearZhi && direct.monthGan && direct.monthZhi &&
        direct.dayGan && direct.dayZhi && direct.hourGan && direct.hourZhi
      if (!complete) {
        wx.showToast({ title: '请先完成四柱选择', icon: 'none' })
        return
      }
    }
    const manual = String(this.data.manualLongitude).trim()
    const useManual = this.data.useManualLongitude && manual !== ''
    const longitude = useManual ? Number(manual) : Number(this.data.longitude)
    // 按类型传原始输入：公历传公历、农历传农历（闰月为负），四柱传八字
    // —— calculateBaZi 的 year/month/day 语义随 type 变化，这里不能图省事一律传公历
    const base = calendarType === 'LUNAR'
      ? { year: lunar.year, month: lunar.leap ? -lunar.month : lunar.month, day: lunar.day, hour: lunar.hour, minute: lunar.minute }
      : { year: solar.year, month: solar.month, day: solar.day, hour: solar.hour, minute: solar.minute }
    const query = buildChartQuery({
      type: calendarType,
      year: base.year, month: base.month, day: base.day, hour: base.hour, minute: base.minute,
      gender,
      name: this.data.name.trim(),
      useTrueSolarTime,
      longitude: Number.isFinite(longitude) ? longitude : 120,
      timezoneOffset: TIMEZONE_LABELS[timezoneIndex].match(/UTC([+-]\d+)/)[1],
      sect,
      direct: calendarType === 'DIRECT' ? direct : null
    })
    this.persist()
    wx.navigateTo({ url: `/pages/chart/chart?${query}` })
  },

  /* ---------------- 分享（T-6.9） ---------------- */

  /** 输入页的分享是「工具推荐」，不带用户填的内容（姓名 / 生辰不上卡） */
  onShareAppMessage() {
    return paipanShare()
  },

  onShareTimeline() {
    return timelineOf(paipanShare())
  }
})
