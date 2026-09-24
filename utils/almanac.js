/**
 * 黄历页的纯逻辑（T-2.1 ~ T-2.6）
 *
 * 与 `utils/datetimeSheet.js` 同样的思路：这一层只做「输入 → 输出」的数据加工，
 * 不碰 setData、不碰 wx API，可以直接在 node 里断言（tests/almanac.test.js）。
 * 页面的 wxml/js 只负责把这里的返回值铺到界面上。
 *
 * 四柱用 `lunar-typescript` 的 `getEightChar()`（与网页端 HuangLi.tsx 同一条路径），
 * 而不是我们自己的 `calculateBaZi` —— 后者会顺带把大运、神煞、流年全算一遍，
 * 对「只是显示当下四柱」来说太重。两者的等价性由单测钉住（tests/almanac.test.js
 * 里拿两个实现逐日比对），将来任一侧漂移都会被立刻发现。
 */
import { Solar, SolarMonth } from 'lunar-typescript'
import { EARTHLY_BRANCHES } from './bazi/constants.js'
import { charTextClass } from './theme.js'

/** 年 / 月选择弹层的可选区间（与网页端一致） */
export const YEAR_MIN_PICKER = 1900
export const YEAR_MAX_PICKER = 2100

export const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']

/** 时辰地支 → 起始小时（子时 23:00–00:59，这里按网页端取整点 0 点） */
export const BRANCH_TO_HOUR = {
  子: 0, 丑: 2, 寅: 4, 卯: 6, 辰: 8, 巳: 10,
  午: 12, 未: 14, 申: 16, 酉: 18, 戌: 20, 亥: 22
}

export const BRANCHES = EARTHLY_BRANCHES
export const MONTH_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

/** T-0.9 接上站点配置前先用内置默认值，接口挂掉时也走这里 */
export const DEFAULT_FOOTER = '命海拾遗 · 传统文化与历法工具'

export const YEAR_OPTIONS = (() => {
  const arr = []
  for (let y = YEAR_MIN_PICKER; y <= YEAR_MAX_PICKER; y++) arr.push(y)
  return arr
})()

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))
/** 当月天数（lunar-typescript 只给了 getDays() 列表，没有 getDayCount） */
const dayCountOf = (year, month) => SolarMonth.fromYm(year, month).getDays().length
const pad2 = (n) => String(n).padStart(2, '0')

/** 年份弹层里每一项的 id：scroll-into-view 靠它滚到当前年 */
export const yearKeyOf = (year) => `y${year}`

/** 选中时刻的字符串主键，用来判断「跨日了要重算今日标记」 */
export const dayKey = (input) => `${input.year}-${pad2(input.month)}-${pad2(input.day)}`

export const nowInput = () => {
  const d = new Date()
  return {
    year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
    hour: d.getHours(), minute: d.getMinutes()
  }
}

/** 月偏移：跨年自动进位，并夹在可选区间内 */
export const shiftMonth = (input, offset) => {
  const total = input.year * 12 + (input.month - 1) + offset
  const year = Math.floor(total / 12)
  const month = (total % 12 + 12) % 12 + 1
  const clampedYear = clamp(year, YEAR_MIN_PICKER, YEAR_MAX_PICKER)
  if (clampedYear !== year) return { ...input }
  return { ...input, year, month, day: clamp(input.day, 1, dayCountOf(year, month)) }
}

/** 换了年 / 月之后，原来的日号可能不存在（1 月 31 日 → 2 月） */
export const withYearMonth = (input, year, month) => {
  const y = clamp(year, YEAR_MIN_PICKER, YEAR_MAX_PICKER)
  const m = clamp(month, 1, 12)
  return { ...input, year: y, month: m, day: clamp(input.day, 1, dayCountOf(y, m)) }
}

/** 点时辰条：把选中时刻挪到该时辰的起始整点 */
export const withBranchHour = (input, branch) => {
  const hour = BRANCH_TO_HOUR[branch]
  if (hour === undefined) return { ...input }
  return { ...input, hour, minute: 0 }
}

// 干支的五行文字色复用 theme.js 的那张表，避免这里再抄一份
const pillarOf = (label, gan, zhi) => ({
  label,
  gan,
  zhi,
  ganCls: charTextClass(gan, true),
  zhiCls: charTextClass(zhi, false)
})

/** 顶部信息栏：四柱 + 公历 / 星期 + 农历 + 生肖 + 大日号 */
export const buildHeader = (input) => {
  const solar = Solar.fromYmdHms(input.year, input.month, input.day, input.hour, input.minute || 0, 0)
  const lunar = solar.getLunar()
  const ec = lunar.getEightChar()
  return {
    pillars: [
      pillarOf('年', ec.getYearGan(), ec.getYearZhi()),
      pillarOf('月', ec.getMonthGan(), ec.getMonthZhi()),
      pillarOf('日', ec.getDayGan(), ec.getDayZhi()),
      pillarOf('时', ec.getTimeGan(), ec.getTimeZhi())
    ],
    day: input.day,
    solarText: `${input.year}.${pad2(input.month)}.${pad2(input.day)}`,
    week: solar.getWeekInChinese(),
    lunarText: `农历${lunar.getYearInGanZhi()} ${lunar.getMonthInChinese()}月${lunar.getDayInChinese()} · ${lunar.getYearShengXiao()}`,
    timeBranch: lunar.getTimeZhi()
  }
}

/**
 * 月历网格（T-2.1）。
 * 每格三个信息：公历日 / 节气（优先）或农历月首「X月」或农历日 / 日干支。
 * 空格数 = 当月 1 号是星期几（0 起算，周日打头）。
 */
export const buildMonth = (input, today = nowInput()) => {
  const { year, month } = input
  const days = SolarMonth.fromYm(year, month).getDays()
  const leading = days[0].getWeek()
  const isToday = (d) => d.getYear() === today.year && d.getMonth() === today.month && d.getDay() === today.day
  const isSelected = (d) => d.getYear() === input.year && d.getMonth() === input.month && d.getDay() === input.day

  const cells = days.map((d) => {
    const lunar = d.getLunar()
    const jieQi = lunar.getJieQi()
    const lunarDay = lunar.getDayInChinese()
    const isFirstDay = lunarDay === '初一'
    const weekend = d.getWeek() === 0 || d.getWeek() === 6
    const selected = isSelected(d)
    const isTd = isToday(d)
    return {
      day: d.getDay(),
      week: d.getWeek(),
      weekend,
      jieQi,
      // 节气优先，其次是农历月首，最后才是农历日
      sub: jieQi || (isFirstDay ? `${lunar.getMonthInChinese()}月` : lunarDay),
      gz: lunar.getDayInGanZhi(),
      selected,
      today: isTd,
      cls: ['hl-cell', selected ? 'hl-on' : '', weekend ? 'hl-weekend' : '', isTd ? 'hl-td' : '']
        .filter(Boolean).join(' '),
      subCls: selected ? 'hl-sub-on' : (jieQi ? 'hl-sub-jq' : 'hl-sub'),
      gzCls: selected ? 'hl-gz-on' : (jieQi ? 'hl-gz-jq' : 'hl-gz')
    }
  })

  return {
    year,
    month,
    // wx:for 只认数组，空格要自己补成数组
    leadingCells: Array.from({ length: leading }, (_, i) => i),
    leadingCount: leading,
    cells,
    weekLabels: WEEK_LABELS.map((label, i) => ({ label, weekend: i === 0 || i === 6 })),
    todayKey: dayKey(today),
    selectedKey: dayKey(input)
  }
}

/** 「今」按钮 / 跨日刷新后回到今天（保留当前时分） */
export const backToToday = (input) => {
  const t = nowInput()
  return { ...input, year: t.year, month: t.month, day: t.day }
}
