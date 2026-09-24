/**
 * 日期时间弹层的「纯逻辑层」（T-1.19 / T-1.2 / T-1.3 的可测部分）
 *
 * 为什么要单独抽一层：微信开发者工具的自动化（miniprogram-automator）在
 * devtools 36.6.0 上**看不到自定义组件内部的节点**（`page.$$('.sheet')` 恒为 0，
 * 页面实例的 `selectComponent` 也拿不到组件），所以弹层里的滚轮夹取、12 位快填校验、
 * 闰月月份列、四柱六步状态机这些最容易出错的逻辑没法靠点界面来验证。
 *
 * 这里把它们做成纯函数：输入 → 输出，不碰 setData、不碰 wx API，可以直接在 node 里
 * 断言（tests/datetimeSheet.test.js）。组件 `components/datetime-sheet` 只负责
 * 把这里的返回值塞进 setData、把事件转成函数调用，保持「胖逻辑 / 瘦视图」。
 */
import {
  YEAR_MIN, YEAR_MAX, HOUR_LABELS, MINUTE_LABELS, MONTH_LABELS,
  LUNAR_DAY_NAMES, DIRECT_STEPS, STEP_PILLAR,
  daysInSolarMonth, isDirectComplete, buildLunarMonths, lunarDayCount,
  monthPillarList, hourPillarList, isYangStem, branchesForStem, pad2,
  solarToLunar, lunarToSolar
} from './calendar.js'
import { HEAVENLY_STEMS } from './bazi/constants.js'
import { charTextClass, elementBoxClass, elementOfChar } from './theme.js'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export const solarDayLabels = (year, month) => {
  const labels = []
  for (let d = 1; d <= daysInSolarMonth(year, month); d++) labels.push(pad2(d))
  return labels
}

/**
 * 把公历时间夹到合法区间，并算出五列滚轮的索引。
 * 用户在 2 月滚到 31 日、或输入超范围的年份时，都靠这里收敛。
 */
export const normalizeSolar = (solar) => {
  const year = clamp(solar.year, YEAR_MIN, YEAR_MAX)
  const month = clamp(solar.month, 1, 12)
  const day = clamp(solar.day, 1, daysInSolarMonth(year, month))
  const hour = clamp(solar.hour, 0, 23)
  const minute = clamp(solar.minute, 0, 59)
  return {
    solar: { year, month, day, hour, minute },
    index: [year - YEAR_MIN, month - 1, day - 1, hour, minute],
    dayLabels: solarDayLabels(year, month)
  }
}

/**
 * 解析公历「12 位数字快填」：YYYYMMDDHHMM。
 * 返回 { ok: true, solar } 或 { ok: false, error }，error 是给用户看的中文提示。
 */
export const parseSolarDigits = (text) => {
  const digits = String(text == null ? '' : text).replace(/\D/g, '')
  if (digits.length !== 12) {
    return { ok: false, error: '格式应为 12 位数字：YYYYMMDDHHMM，如 199101010255' }
  }
  const year = parseInt(digits.slice(0, 4), 10)
  const month = parseInt(digits.slice(4, 6), 10)
  const day = parseInt(digits.slice(6, 8), 10)
  const hour = parseInt(digits.slice(8, 10), 10)
  const minute = parseInt(digits.slice(10, 12), 10)
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || year < YEAR_MIN || year > YEAR_MAX) {
    return { ok: false, error: '时间不合法，请检查年月日时分' }
  }
  if (day < 1 || day > daysInSolarMonth(year, month)) {
    return { ok: false, error: '日期不合法，该月没有这一天' }
  }
  return { ok: true, solar: { year, month, day, hour, minute } }
}

/**
 * 把农历日期夹到合法区间。月份列含闰月（闰月用负数表示，见 buildLunarMonths），
 * 该年没有对应的闰月时回落到正月；日按当月大小月（29 / 30）收敛。
 */
export const normalizeLunar = (lunar) => {
  const year = clamp(lunar.year, YEAR_MIN, YEAR_MAX)
  const months = buildLunarMonths(year)
  const values = months.map((m) => m.v)
  let target = lunar.leap ? -lunar.month : lunar.month
  let index = values.indexOf(target)
  if (index < 0) {
    target = 1
    index = values.indexOf(1)
  }
  const monthValue = values[index]
  const day = clamp(lunar.day, 1, lunarDayCount(year, monthValue))
  const hour = clamp(lunar.hour, 0, 23)
  const minute = clamp(lunar.minute, 0, 59)
  return {
    lunar: { year, month: Math.abs(monthValue), leap: monthValue < 0, day, hour, minute },
    monthLabels: months.map((m) => m.label),
    monthValues: values,
    dayLabels: LUNAR_DAY_NAMES.slice(0, lunarDayCount(year, monthValue)),
    index: [year - YEAR_MIN, index, day - 1, hour, minute]
  }
}

/** 农历滚轮：把列索引翻成农历日期（再交给 normalizeLunar 收敛大小月） */
export const lunarFromWheel = (index) => {
  const [yi, mi, di, hi, mii] = index
  const year = YEAR_MIN + yi
  const values = buildLunarMonths(year).map((m) => m.v)
  const monthValue = values[clamp(mi, 0, values.length - 1)]
  return {
    year,
    month: Math.abs(monthValue),
    leap: monthValue < 0,
    day: di + 1,
    hour: hi,
    minute: mii
  }
}

export const solarFromWheel = (index) => {
  const [yi, mi, di, hi, mii] = index
  return { year: YEAR_MIN + yi, month: mi + 1, day: di + 1, hour: hi, minute: mii }
}

/** 公历滚轮 / 农历滚轮 / 快填是三套入口，统一从这里取「公历 ↔ 农历」互切结果 */
export const switchCalendarTab = (inner, tab) => {
  const next = { ...inner, tab }
  // 互切回填：公历 ↔ 农历。农历侧要再走一次 normalizeLunar，闰月标记才不会被带错
  if (tab === 'LUNAR') next.lunar = normalizeLunar(solarToLunar(inner.solar)).lunar
  if (tab === 'SOLAR') next.solar = normalizeSolar(lunarToSolar(inner.lunar)).solar
  return next
}

/** 四柱匹配区间签名：变了才重算 findAllSolarDatesFromBaZi（那一步很重） */
export const directSignature = (direct, sect) =>
  `${direct.yearGan}${direct.yearZhi}${direct.monthGan}${direct.monthZhi}` +
  `${direct.dayGan}${direct.dayZhi}${direct.hourGan}${direct.hourZhi}|${sect}`

/** 六步状态机里每一步的提示语；返回 '' 表示这一步可以选 */
const stepBlocker = (direct, stepKey) => {
  if (stepKey === 'yearZhi' && !direct.yearGan) return '请先选择年柱天干，再选择地支'
  if (stepKey === 'month' && !direct.yearZhi) return '请先选择年柱地支，再选择月柱'
  if (stepKey === 'dayGan' && !(direct.monthGan && direct.monthZhi)) return '请先选择月柱，再选择日柱天干'
  if (stepKey === 'dayZhi' && !direct.dayGan) return '请先选择日柱天干，再选择地支'
  if (stepKey === 'hour' && !direct.dayZhi) return '请先选择日柱地支，再选时柱'
  return ''
}

/**
 * 四柱总览 + 当前步的可选项。
 * 返回的对象键名与组件 data 一一对应，组件直接 setData(view) 即可。
 * `editing` 为真时（用户点了总览某一格回去改）即使已经选齐也停在选择态。
 */
export const directStepView = (direct, step, { editing = false } = {}) => {
  const stepKey = DIRECT_STEPS[step]
  const complete = isDirectComplete(direct)
  const cells = [
    { key: 'year', label: '年柱', ganKey: 'yearGan', zhiKey: 'yearZhi', gan: direct.yearGan, zhi: direct.yearZhi },
    { key: 'month', label: '月柱', ganKey: 'monthGan', zhiKey: 'monthZhi', gan: direct.monthGan, zhi: direct.monthZhi },
    { key: 'day', label: '日柱', ganKey: 'dayGan', zhiKey: 'dayZhi', gan: direct.dayGan, zhi: direct.dayZhi },
    { key: 'hour', label: '时柱', ganKey: 'hourGan', zhiKey: 'hourZhi', gan: direct.hourGan, zhi: direct.hourZhi }
  ].map((c) => ({
    ...c,
    ganCls: c.gan ? elementBoxClass(elementOfChar(c.gan, true)) : 'box-empty',
    zhiCls: c.zhi ? elementBoxClass(elementOfChar(c.zhi, false)) : 'box-empty',
    active: STEP_PILLAR[stepKey] === c.key
  }))

  const stepIsStem = stepKey === 'yearGan' || stepKey === 'dayGan'
  const stepIsBranch = stepKey === 'yearZhi' || stepKey === 'dayZhi'
  const stepIsMonth = stepKey === 'month'
  const stepIsHour = stepKey === 'hour'
  const blocker = stepBlocker(direct, stepKey)

  const view = {
    directCells: cells,
    directComplete: complete,
    pickerVisible: editing || !complete,
    stepIsStem,
    stepIsBranch,
    stepIsMonth,
    stepIsHour,
    stepTitle: '',
    stepBlocker: blocker,
    ganOptions: [],
    zhiOptions: [],
    pillarOptions: []
  }

  if (blocker) return view

  if (stepIsStem) {
    view.stepTitle = '选择天干'
    const current = stepKey === 'yearGan' ? direct.yearGan : direct.dayGan
    view.ganOptions = HEAVENLY_STEMS.map((s) => ({
      v: s,
      cls: s === current ? 'opt opt-on' : `opt ${elementBoxClass(elementOfChar(s, true))}`
    }))
  }
  if (stepIsBranch) {
    const stem = stepKey === 'yearZhi' ? direct.yearGan : direct.dayGan
    const current = stepKey === 'yearZhi' ? direct.yearZhi : direct.dayZhi
    view.stepTitle = `${isYangStem(stem) ? '阳干配阳支' : '阴干配阴支'} · 选择地支`
    view.zhiOptions = branchesForStem(stem).map((b) => ({
      v: b,
      cls: b === current ? 'opt opt-on' : `opt ${elementBoxClass(elementOfChar(b, false))}`
    }))
  }
  const pillarOption = (p, selected) => ({
    key: p.gan + p.zhi,
    gan: p.gan,
    zhi: p.zhi,
    cls: selected ? 'opt opt-on' : 'opt opt-plain',
    ganCls: selected ? 'opt-on-text' : charTextClass(p.gan, true),
    zhiCls: selected ? 'opt-on-text' : charTextClass(p.zhi, false)
  })
  if (stepIsMonth) {
    view.stepTitle = '十二个月柱 · 按五虎遁推算'
    view.pillarOptions = monthPillarList(direct.yearGan)
      .map((p) => pillarOption(p, p.gan === direct.monthGan && p.zhi === direct.monthZhi))
  }
  if (stepIsHour) {
    view.stepTitle = '十二个时柱 · 按五鼠遁推算'
    view.pillarOptions = hourPillarList(direct.dayGan)
      .map((p) => pillarOption(p, p.gan === direct.hourGan && p.zhi === direct.hourZhi))
  }
  return view
}

/**
 * 六步状态机落子。改年干会清掉年支与整根月柱，改日干会清掉日支与整根时柱——
 * 因为下游干支靠五虎遁 / 五鼠遁推出来，上游一变下游就不成立了。
 * 返回 { direct, step }（step 是落子后的下一步索引，选完一圈回到起点，配合 editing 继续停留在选择态）。
 */
export const applyDirectPick = (direct, step, value) => {
  const stepKey = DIRECT_STEPS[step]
  const prev = direct
  const next = { ...prev }
  if (stepKey === 'yearGan') {
    next.yearGan = value
    if (value !== prev.yearGan) {
      next.yearZhi = ''
      next.monthGan = ''
      next.monthZhi = ''
    }
  } else if (stepKey === 'yearZhi') {
    next.yearZhi = value
  } else if (stepKey === 'month') {
    next.monthGan = value[0]
    next.monthZhi = value[1]
  } else if (stepKey === 'dayGan') {
    next.dayGan = value
    if (value !== prev.dayGan) {
      next.dayZhi = ''
      next.hourGan = ''
      next.hourZhi = ''
    }
  } else if (stepKey === 'dayZhi') {
    next.dayZhi = value
  } else if (stepKey === 'hour') {
    next.hourGan = value[0]
    next.hourZhi = value[1]
  }
  const idx = DIRECT_STEPS.indexOf(stepKey)
  return { direct: next, step: idx >= 0 ? (idx + 1) % DIRECT_STEPS.length : 0 }
}

/** 三列滚轮的位置（供 wxml 直接渲染，省得在页面里再拼） */
export const WHEEL_LABELS = {
  year: null,
  month: MONTH_LABELS,
  hour: HOUR_LABELS,
  minute: MINUTE_LABELS
}
