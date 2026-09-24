/**
 * 历法相关的纯函数与常量（T-1.2 / T-1.3 的共享底座）
 *
 * 这些函数原先散在网页端 InputForm.tsx 的模块顶层，小程序这边抽出来，
 * 让「输入页」「日期选择弹层」「命盘页」三处共用同一份实现，避免三处各写一遍再对不齐。
 * 全部是纯函数，不碰 wx API，可以在 node 里直接跑测试（见 tests/calendar.test.js）。
 */
import { Solar, Lunar, LunarYear, LunarMonth } from 'lunar-typescript'
import { HEAVENLY_STEMS, EARTHLY_BRANCHES } from './bazi/constants.js'
import { getMonthStem, getHourStem } from './bazi/baziHelper.js'

export const pad2 = (n) => String(n).padStart(2, '0')

/** 与网页端一致的可选年份区间 */
export const YEAR_MIN = 1850
export const YEAR_MAX = 2100
/** 四柱反查匹配区间（网页端写死 1900–2100） */
export const MATCH_MIN = 1900
export const MATCH_MAX = 2100

/** 月柱地支顺序：寅月为岁首 */
export const MONTH_BRANCHES = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑']

export const LUNAR_DAY_NAMES = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'
]

/** 四柱直选六步：年干 → 年支 → 月柱 → 日干 → 日支 → 时柱 */
export const DIRECT_STEPS = ['yearGan', 'yearZhi', 'month', 'dayGan', 'dayZhi', 'hour']

export const STEP_PILLAR = {
  yearGan: 'year', yearZhi: 'year', month: 'month',
  dayGan: 'day', dayZhi: 'day', hour: 'hour'
}

const YANG_BRANCHES = ['子', '寅', '辰', '午', '申', '戌']
const YIN_BRANCHES = ['丑', '卯', '巳', '未', '酉', '亥']

export const isYangStem = (s) => HEAVENLY_STEMS.indexOf(s) % 2 === 0
/** 阳干只能配阳支，阴干只能配阴支 */
export const branchesForStem = (s) => (isYangStem(s) ? YANG_BRANCHES : YIN_BRANCHES)

export const YEAR_LABELS = (() => {
  const arr = []
  for (let y = YEAR_MIN; y <= YEAR_MAX; y++) arr.push(String(y))
  return arr
})()

const numberLabels = (count, offset = 0) => {
  const arr = []
  for (let i = 0; i < count; i++) arr.push(pad2(i + offset))
  return arr
}

export const HOUR_LABELS = numberLabels(24)
export const MINUTE_LABELS = numberLabels(60)
export const MONTH_LABELS = numberLabels(12, 1)

/** 公历某年某月天数 */
export const daysInSolarMonth = (year, month) => new Date(year, month, 0).getDate()

export const emptyDirect = () => ({
  yearGan: '', yearZhi: '', monthGan: '', monthZhi: '',
  dayGan: '', dayZhi: '', hourGan: '', hourZhi: ''
})

export const isDirectComplete = (d) =>
  !!(d && d.yearGan && d.yearZhi && d.monthGan && d.monthZhi && d.dayGan && d.dayZhi && d.hourGan && d.hourZhi)

export const solarToLunar = (s) => {
  const l = Solar.fromYmdHms(s.year, s.month, s.day, s.hour, s.minute, 0).getLunar()
  return {
    year: l.getYear(),
    month: Math.abs(l.getMonth()),
    leap: l.getMonth() < 0,
    day: l.getDay(),
    hour: s.hour,
    minute: s.minute
  }
}

export const lunarToSolar = (l) => {
  const s = Lunar.fromYmdHms(l.year, l.leap ? -l.month : l.month, l.day, l.hour, l.minute, 0).getSolar()
  return { year: s.getYear(), month: s.getMonth(), day: s.getDay(), hour: l.hour, minute: l.minute }
}

/** 某农历年的月份列表（含闰月，闰月用负数表示） */
export const buildLunarMonths = (year) => {
  let leap = 0
  try {
    leap = LunarYear.fromYear(year).getLeapMonth()
  } catch (e) {
    leap = 0
  }
  const months = []
  for (let m = 1; m <= 12; m++) months.push({ v: m, label: `${m}月` })
  if (leap) months.splice(leap, 0, { v: -leap, label: `闰${leap}月` })
  return months
}

/** 某农历月的天数（闰月传负值） */
export const lunarDayCount = (year, monthValue) => {
  try {
    const lm = LunarMonth.fromYm(year, monthValue)
    return lm ? lm.getDayCount() : 30
  } catch (e) {
    return 30
  }
}

/** 五虎遁：以年干推寅月天干，地支寅→丑顺排，天干逐月 +1 */
export const monthPillarList = (yearGan) => {
  let stemIdx = HEAVENLY_STEMS.indexOf(getMonthStem(yearGan, '寅'))
  if (stemIdx < 0) return []
  return MONTH_BRANCHES.map((zhi) => {
    const gan = HEAVENLY_STEMS[stemIdx]
    stemIdx = (stemIdx + 1) % 10
    return { gan, zhi }
  })
}

/** 五鼠遁：以日干推子时天干，地支子→亥顺排，天干逐时 +1 */
export const hourPillarList = (dayGan) => {
  let stemIdx = HEAVENLY_STEMS.indexOf(getHourStem(dayGan, '子'))
  if (stemIdx < 0) return []
  return EARTHLY_BRANCHES.map((zhi) => {
    const gan = HEAVENLY_STEMS[stemIdx]
    stemIdx = (stemIdx + 1) % 10
    return { gan, zhi }
  })
}

/** 一条四柱选择记录 → 八字字符串，用于匹配时间反查 */
export const directToBaZi = (d) => ({
  yearGZ: d.yearGan + d.yearZhi,
  monthGZ: d.monthGan + d.monthZhi,
  dayGZ: d.dayGan + d.dayZhi,
  hourGZ: d.hourGan + d.hourZhi
})

/** 把日期时间格式化成「1991-01-01 02:55」 */
export const formatSolar = (s) =>
  `${s.year}-${pad2(s.month)}-${pad2(s.day)} ${pad2(s.hour)}:${pad2(s.minute)}`

/** 农历文字：「辛未年 正月初一 丑时」 */
export const formatLunar = (l) => {
  const lunar = Lunar.fromYmdHms(l.year, l.leap ? -l.month : l.month, l.day, l.hour, l.minute, 0)
  return `${lunar.getYearInGanZhi()}年 ${lunar.getMonthInChinese()}月${lunar.getDayInChinese()} ${lunar.getTimeZhi()}时`
}
