/**
 * 日期时间弹层的逻辑测试（T-1.2 / T-1.3 / T-1.19）
 *
 * 为什么用 node 单测而不是点界面：开发者工具的自动化在 devtools 36.6.0 上
 * **看不到自定义组件内部的节点**（实测 `page.$$('.sheet')` 恒为 0，
 * 页面实例的 `selectComponent('datetime-sheet')` 也拿不到组件），
 * 所以弹层里的滚轮夹取、12 位快填校验、闰月月份列、四柱六步状态机
 * 只能在这一层验证 —— 这些恰好也是整个排盘模块里最容易出错的地方。
 *
 * 组件 components/datetime-sheet 与这里共用 utils/datetimeSheet.js，
 * 有任何一方的行为漂移都会在 e2e 的截图与这里的断言之间暴露出来。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeSolar, parseSolarDigits, solarDayLabels, solarFromWheel,
  normalizeLunar, lunarFromWheel, switchCalendarTab,
  directStepView, applyDirectPick, directSignature
} from '../utils/datetimeSheet.js'
import {
  emptyDirect, buildLunarMonths, lunarDayCount, YEAR_MIN, YEAR_MAX, DIRECT_STEPS
} from '../utils/calendar.js'
import { HEAVENLY_STEMS } from '../utils/bazi/constants.js'

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']

/* ==================== 公历 ==================== */

test('公历越界值被夹回合法区间', () => {
  const { solar, index } = normalizeSolar({ year: 1200, month: 15, day: 40, hour: 30, minute: 90 })
  assert.deepEqual(solar, { year: YEAR_MIN, month: 12, day: 31, hour: 23, minute: 59 })
  assert.deepEqual(index, [0, 11, 30, 23, 59])

  const high = normalizeSolar({ year: 9999, month: 0, day: 0, hour: -1, minute: -1 })
  assert.deepEqual(high.solar, { year: YEAR_MAX, month: 1, day: 1, hour: 0, minute: 0 })
})

test('大小月与闰年二月：2 月 31 日被夹到当月最后一天', () => {
  assert.equal(normalizeSolar({ year: 2023, month: 2, day: 31, hour: 0, minute: 0 }).solar.day, 28)
  assert.equal(normalizeSolar({ year: 2024, month: 2, day: 31, hour: 0, minute: 0 }).solar.day, 29)
  assert.equal(normalizeSolar({ year: 2023, month: 4, day: 31, hour: 0, minute: 0 }).solar.day, 30)
  assert.equal(solarDayLabels(2024, 2).length, 29)
  assert.equal(solarDayLabels(2023, 2).length, 28)
})

test('公历滚轮：日列索引超出当月天数时回落到月末', () => {
  // 先在 1 月滚到 31 日（索引 30），再把月份拨到 2 月
  const { solar } = normalizeSolar(solarFromWheel([YEAR_MAX - YEAR_MIN, 1, 30, 12, 0]))
  assert.deepEqual(solar, { year: YEAR_MAX, month: 2, day: 28, hour: 12, minute: 0 })
})

test('12 位快填：位数不足与非法值都有中文提示', () => {
  assert.match(parseSolarDigits('19910101').error, /12 位/)
  assert.equal(parseSolarDigits('').ok, false)
  assert.match(parseSolarDigits('199113010255').error, /时间不合法/)
  assert.match(parseSolarDigits('199101012555').error, /时间不合法/)
  assert.match(parseSolarDigits('199101010299').error, /时间不合法/)
  assert.match(parseSolarDigits('180001010255').error, /时间不合法/)
  assert.match(parseSolarDigits('210101010255').error, /时间不合法/)
  assert.match(parseSolarDigits('199102300255').error, /该月没有这一天/)
  assert.match(parseSolarDigits('199104310255').error, /该月没有这一天/)
})

test('12 位快填：合法输入按位拆出年月日时分', () => {
  const parsed = parseSolarDigits('199101010255')
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.solar, { year: 1991, month: 1, day: 1, hour: 2, minute: 55 })
  // 波浪号（iOS 数字键盘会输入）与空格应当被忽略
  assert.deepEqual(parseSolarDigits('1991 0101 0255').solar, parsed.solar)
})

/* ==================== 农历 ==================== */

test('农历闰月：2023 年闰 2 月在月份列里单独占一档', () => {
  const labels = buildLunarMonths(2023).map((m) => m.label)
  assert.ok(labels.includes('闰2月'), labels.join(','))

  const leap = normalizeLunar({ year: 2023, month: 2, leap: true, day: 1, hour: 12, minute: 0 })
  assert.deepEqual(leap.lunar, { year: 2023, month: 2, leap: true, day: 1, hour: 12, minute: 0 })
  assert.equal(leap.monthLabels[leap.index[1]], '闰2月')
})

test('农历该年没有闰月时回落到正月', () => {
  const noLeap = buildLunarMonths(2024).every((m) => m.v > 0)
  assert.ok(noLeap, '2024 年不应有闰月')
  const view = normalizeLunar({ year: 2024, month: 5, leap: true, day: 10, hour: 8, minute: 0 })
  assert.equal(view.lunar.leap, false)
  assert.equal(view.lunar.month, 1)
})

test('农历小月只有 29 天，日列与索引一起收敛', () => {
  // 2023 年二月（含闰二月）用小月做断言
  const months = buildLunarMonths(2023)
  const small = months.find((m) => lunarDayCount(2023, m.v) === 29)
  assert.ok(small, '2023 年应存在 29 天的小月')
  const view = normalizeLunar({ year: 2023, month: Math.abs(small.v), leap: small.v < 0, day: 30, hour: 0, minute: 0 })
  assert.equal(view.lunar.day, 29)
  assert.equal(view.dayLabels.length, 29)
  assert.equal(view.index[2], 28)
})

test('农历滚轮往返：拨到闰 2 月后索引与标签自洽', () => {
  const values = buildLunarMonths(2023).map((m) => m.v)
  const leapIdx = values.indexOf(-2)
  assert.ok(leapIdx > 0)
  const raw = lunarFromWheel([2023 - YEAR_MIN, leapIdx, 0, 12, 0])
  const view = normalizeLunar(raw)
  assert.deepEqual(view.lunar, { year: 2023, month: 2, leap: true, day: 1, hour: 12, minute: 0 })
  assert.equal(view.index[1], leapIdx)
})

test('公历 ↔ 农历互切保持同一时刻', () => {
  const inner = {
    tab: 'SOLAR',
    solar: { year: 2023, month: 3, day: 22, hour: 12, minute: 0 },
    lunar: { year: 2023, month: 2, leap: false, day: 1, hour: 12, minute: 0 },
    direct: emptyDirect()
  }
  const lunarTab = switchCalendarTab(inner, 'LUNAR')
  assert.deepEqual(lunarTab.lunar, { year: 2023, month: 2, leap: true, day: 1, hour: 12, minute: 0 })

  const back = switchCalendarTab(lunarTab, 'SOLAR')
  assert.deepEqual(back.solar, inner.solar)
})

/* ==================== 四柱六步状态机 ==================== */

const pick = (state, value) => applyDirectPick(state.direct, state.step, value)

test('四柱第一步：给出 10 个天干，未选年干时后续步骤被拦截', () => {
  const view = directStepView(emptyDirect(), 0)
  assert.equal(view.stepIsStem, true)
  assert.equal(view.stepTitle, '选择天干')
  assert.deepEqual(view.ganOptions.map((o) => o.v), HEAVENLY_STEMS)
  assert.equal(view.directComplete, false)
  assert.equal(view.pickerVisible, true)

  const blocked = directStepView(emptyDirect(), 1)
  assert.match(blocked.stepBlocker, /先选择年柱天干/)
  assert.equal(blocked.zhiOptions.length, 0)
})

test('四柱第二步：阳干只配阳支，六个分支里没有丑', () => {
  const afterGan = pick({ direct: emptyDirect(), step: 0 }, '甲')
  assert.equal(afterGan.direct.yearGan, '甲')
  assert.equal(afterGan.step, 1)

  const view = directStepView(afterGan.direct, afterGan.step)
  assert.equal(view.stepIsBranch, true)
  assert.deepEqual(view.zhiOptions.map((o) => o.v), ['子', '寅', '辰', '午', '申', '戌'])
  assert.ok(view.zhiOptions.every((o) => o.cls.startsWith('opt ')))
})

test('四柱第三步：月柱按五虎遁给 12 根，甲年起丙寅', () => {
  let state = { direct: emptyDirect(), step: 0 }
  state = { ...pick(state, '甲') }
  state = { ...pick({ direct: state.direct, step: state.step }, '子') }
  const view = directStepView(state.direct, state.step)
  assert.equal(view.stepIsMonth, true)
  assert.match(view.stepTitle, /五虎遁/)
  assert.equal(view.pillarOptions.length, 12)
  assert.equal(view.pillarOptions[0].key, '丙寅')
  assert.equal(view.pillarOptions.map((o) => o.zhi).join(''), '寅卯辰巳午未申酉戌亥子丑')
  assert.equal(view.pillarOptions.every((o) => o.ganCls.startsWith('el-')), true)
})

test('四柱六步走完一轮后回到第一格', () => {
  let state = { direct: emptyDirect(), step: 0 }
  for (const [value, expectStep] of [['甲', 1], ['子', 2], ['丙寅', 3], ['甲', 4], ['子', 5], ['甲子', 0]]) {
    state = pick(state, value)
    assert.equal(state.step, expectStep, `选了 ${value} 之后应停在 ${DIRECT_STEPS[expectStep]}`)
  }
  assert.deepEqual(state.direct, {
    yearGan: '甲', yearZhi: '子',
    monthGan: '丙', monthZhi: '寅',
    dayGan: '甲', dayZhi: '子',
    hourGan: '甲', hourZhi: '子'
  })
})

test('选齐后不再停留在选择态，除非用户回去改（editing）', () => {
  const full = {
    yearGan: '甲', yearZhi: '子', monthGan: '丙', monthZhi: '寅',
    dayGan: '甲', dayZhi: '子', hourGan: '甲', hourZhi: '子'
  }
  const view = directStepView(full, 0)
  assert.equal(view.directComplete, true)
  assert.equal(view.pickerVisible, false)
  assert.equal(view.directCells.map((c) => c.gan + c.zhi).join(''), '甲子丙寅甲子甲子')

  // 第 3 步是日干，总览上高亮的是日柱
  const editing = directStepView(full, 3, { editing: true })
  assert.equal(editing.pickerVisible, true)
  assert.equal(editing.directCells[2].active, true, '当前步应落在日柱')
  assert.equal(directStepView(full, 2, { editing: true }).directCells[1].active, true)
})

test('改年干会清空年支与整根月柱', () => {
  const before = {
    yearGan: '甲', yearZhi: '子', monthGan: '丙', monthZhi: '寅',
    dayGan: '甲', dayZhi: '子', hourGan: '甲', hourZhi: '子'
  }
  const after = applyDirectPick(before, 0, '乙').direct
  assert.deepEqual(after, {
    yearGan: '乙', yearZhi: '', monthGan: '', monthZhi: '',
    dayGan: '甲', dayZhi: '子', hourGan: '甲', hourZhi: '子'
  })
  // 阴干之后，地支候选也跟着变成阴支
  const view = directStepView(after, 1)
  assert.deepEqual(view.zhiOptions.map((o) => o.v), ['丑', '卯', '巳', '未', '酉', '亥'])
})

test('改日干会清空日支与整根时柱', () => {
  const before = {
    yearGan: '甲', yearZhi: '子', monthGan: '丙', monthZhi: '寅',
    dayGan: '甲', dayZhi: '子', hourGan: '甲', hourZhi: '子'
  }
  const after = applyDirectPick(before, 3, '丙').direct
  assert.deepEqual(after, {
    yearGan: '甲', yearZhi: '子', monthGan: '丙', monthZhi: '寅',
    dayGan: '丙', dayZhi: '', hourGan: '', hourZhi: ''
  })
})

test('时柱按五鼠遁给 12 根，甲日甲子时起', () => {
  const day = {
    yearGan: '甲', yearZhi: '子', monthGan: '丙', monthZhi: '寅',
    dayGan: '甲', dayZhi: '子', hourGan: '', hourZhi: ''
  }
  const view = directStepView(day, 5)
  assert.equal(view.stepIsHour, true)
  assert.match(view.stepTitle, /五鼠遁/)
  assert.equal(view.pillarOptions.length, 12)
  assert.equal(view.pillarOptions[0].key, '甲子')
  assert.equal(view.pillarOptions[0].zhi, '子')
  assert.equal(view.pillarOptions.map((o) => o.zhi).join(''), BRANCHES.join(''))
})

test('总览格的五行配色与位置标记正确', () => {
  const partial = { ...emptyDirect(), yearGan: '甲', yearZhi: '子' }
  const view = directStepView(partial, 0)
  assert.equal(view.directCells[0].ganCls, 'box-mu')
  assert.equal(view.directCells[0].zhiCls, 'box-shui')
  assert.equal(view.directCells[1].ganCls, 'box-empty')
  assert.equal(view.directCells[0].active, true)
  assert.equal(view.directCells[1].active, false)
  assert.deepEqual(view.directCells.map((c) => c.label), ['年柱', '月柱', '日柱', '时柱'])
})

test('匹配签名只随四柱与 sect 变化', () => {
  const d = { yearGan: '甲', yearZhi: '子', monthGan: '丙', monthZhi: '寅', dayGan: '甲', dayZhi: '子', hourGan: '甲', hourZhi: '子' }
  assert.equal(directSignature(d, 2), directSignature({ ...d }, 2))
  assert.notEqual(directSignature(d, 2), directSignature({ ...d, hourGan: '乙' }, 2))
  assert.notEqual(directSignature(d, 1), directSignature(d, 2))
})
