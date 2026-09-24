/**
 * 黄历页逻辑测试（T-2.1 ~ T-2.6）
 *
 * 重点钉住四件事：
 *  1. 月历网格的空位数与格内三段信息（节气 > 农历月首 > 农历日，外加日干支）
 *  2. 跨月 / 跨年与「日号超出当月天数」的收敛（1 月 31 日 → 2 月）
 *  3. 时辰条 → 整点时刻的映射
 *  4. **四柱与自家排盘算法等价**：黄历页用的是 lunar-typescript 的 getEightChar()，
 *     排盘页用的是 utils/bazi 的 calculateBaZi()，两条路径必须给出同样的干支，
 *     否则同一个时刻在两个页面会显示不同的四柱
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { Solar, SolarMonth } from 'lunar-typescript'
import {
  buildHeader, buildMonth, shiftMonth, withYearMonth, withBranchHour,
  backToToday, nowInput, yearKeyOf, BRANCH_TO_HOUR, YEAR_OPTIONS, YEAR_MIN_PICKER, YEAR_MAX_PICKER
} from '../utils/almanac.js'
import { calculateBaZi } from '../utils/bazi/baziCalc.js'
import { Gender } from '../utils/bazi/types.js'

const at = (year, month, day, hour = 12, minute = 0) => ({ year, month, day, hour, minute })

/* ==================== 顶部信息栏 ==================== */

test('四柱与自家排盘算法逐例一致（同一天在黄历页与命盘页必须一样）', () => {
  const cases = [
    [2026, 9, 24, 16], [1990, 1, 1, 12], [1990, 1, 1, 23], [1985, 12, 31, 23],
    [2024, 2, 29, 0], [1900, 1, 1, 0], [2100, 12, 31, 22], [2000, 1, 1, 13]
  ]
  for (const [y, m, d, h] of cases) {
    const header = buildHeader(at(y, m, d, h))
    const mine = calculateBaZi(y, m, d, h, 0, Gender.MALE, 'SOLAR', undefined, false, 120, { sect: 2 })
    const fromAlmanac = header.pillars.map((p) => p.gan + p.zhi).join(' ')
    const fromCalc = [mine.year, mine.month, mine.day, mine.hour].map((p) => p.gan + p.zhi).join(' ')
    assert.equal(fromAlmanac, fromCalc, `${y}-${m}-${d} ${h}时`)
  }
})

test('四柱带五行文字色，信息栏文案齐全', () => {
  const header = buildHeader(at(2026, 9, 24, 16))
  assert.deepEqual(header.pillars.map((p) => p.label), ['年', '月', '日', '时'])
  assert.equal(header.pillars[0].gan, '丙')
  assert.equal(header.pillars[0].ganCls, 'el-huo')
  assert.equal(header.pillars[2].zhi, '丑')
  assert.equal(header.pillars[2].zhiCls, 'el-tu')
  assert.equal(header.solarText, '2026.09.24')
  assert.equal(header.day, 24)
  assert.equal(header.week, '四')
  assert.match(header.lunarText, /^农历丙午 八月十四 · 马$/)
  assert.equal(header.timeBranch, '申')
})

test('时支跟着小时变：子时 → 时柱是子，且换日规则取子正（sect=2）', () => {
  assert.equal(buildHeader(at(2026, 9, 24, 0)).timeBranch, '子')
  assert.equal(buildHeader(at(2026, 9, 24, 23)).timeBranch, '子')
  assert.equal(buildHeader(at(2026, 9, 24, 2)).timeBranch, '丑')
  assert.equal(buildHeader(at(2026, 9, 24, 22)).timeBranch, '亥')
})

/* ==================== 月历网格 ==================== */

test('网格空位数等于当月 1 号是星期几，总格数 = 空位 + 当月天数', () => {
  for (const [y, m] of [[2026, 9], [2026, 2], [2024, 2], [2025, 3], [1900, 1], [2100, 12]]) {
    const grid = buildMonth(at(y, m, 1))
    assert.equal(grid.leadingCount, Solar.fromYmd(y, m, 1).getWeek(), `${y}-${m} 空位数`)
    assert.equal(grid.leadingCells.length, grid.leadingCount)
    // 天数用 SolarMonth 取：1 号所在的月有多少天，网格就该有多少格
    assert.equal(grid.cells.length, SolarMonth.fromYm(y, m).getDays().length, `${y}-${m} 天数`)
  }
})

test('格内三段信息：节气优先于农历月首，农历月首优先于农历日', () => {
  // 2026 年 9 月：9/7 白露、9/23 秋分；9/11 是八月初一
  const grid = buildMonth(at(2026, 9, 24))
  const byDay = (d) => grid.cells.find((c) => c.day === d)

  assert.equal(byDay(7).jieQi, '白露')
  assert.equal(byDay(7).sub, '白露', '有节气的日子显示节气')
  assert.equal(byDay(7).subCls, 'hl-sub-jq')

  const firstDay = grid.cells.find((c) => c.sub === '八月')
  assert.ok(firstDay, '应有一个格子显示农历月首「八月」')
  assert.equal(byDay(firstDay.day).jieQi, '')

  const plain = byDay(24)
  assert.equal(plain.jieQi, '')
  assert.equal(plain.sub, '十四', '既无节气也不是月首时显示农历日')
  assert.equal(plain.gz, '辛丑', '第三行是日干支')
})

test('周末与今日的标记', () => {
  const grid = buildMonth(at(2026, 9, 24), at(2026, 9, 24))
  const sat = grid.cells.find((c) => c.week === 6)
  const sun = grid.cells.find((c) => c.week === 0)
  assert.match(sat.cls, /hl-weekend/)
  assert.match(sun.cls, /hl-weekend/)
  assert.doesNotMatch(grid.cells.find((c) => c.week === 3).cls, /hl-weekend/)

  const today = grid.cells.find((c) => c.today)
  assert.equal(today.day, 24)
  assert.match(today.cls, /hl-td/)
  assert.equal(grid.todayKey, '2026-09-24')
  assert.equal(grid.selectedKey, '2026-09-24')
})

test('选中日高亮：只有被选中的那格带 hl-on，且文字换成反白 class', () => {
  const grid = buildMonth(at(2026, 9, 10))
  const selected = grid.cells.filter((c) => c.selected)
  assert.equal(selected.length, 1)
  assert.equal(selected[0].day, 10)
  assert.match(selected[0].cls, /hl-on/)
  assert.equal(selected[0].subCls, 'hl-sub-on')
  assert.equal(selected[0].gzCls, 'hl-gz-on')
  assert.equal(grid.cells.filter((c) => c.cls.indexOf('hl-on') >= 0).length, 1)
})

test('星期表头：只有周日与周六是红的', () => {
  const grid = buildMonth(at(2026, 9, 1))
  assert.deepEqual(grid.weekLabels.map((w) => w.label), ['日', '一', '二', '三', '四', '五', '六'])
  assert.deepEqual(grid.weekLabels.map((w) => w.weekend), [true, false, false, false, false, false, true])
})

test('跨日刷新：今天变了，「今」标记要跟着挪到新的一天', () => {
  const input = at(2026, 9, 24)
  const before = buildMonth(input, at(2026, 9, 24))
  assert.equal(before.todayKey, '2026-09-24')
  assert.equal(before.cells.filter((c) => c.today).length, 1)
  assert.equal(before.cells.find((c) => c.today).day, 24)

  // 跨过零点后重算：标记只应在 25 号，24 号不再是「今」
  const after = buildMonth(input, at(2026, 9, 25))
  assert.equal(after.todayKey, '2026-09-25')
  assert.equal(after.cells.filter((c) => c.today).length, 1)
  assert.equal(after.cells.find((c) => c.today).day, 25)
})

/* ==================== 月份导航 ==================== */

test('上 / 下月：跨年进位正确', () => {
  assert.deepEqual(pick(shiftMonth(at(2026, 1, 15), -1)), [2025, 12, 15])
  assert.deepEqual(pick(shiftMonth(at(2026, 12, 15), 1)), [2027, 1, 15])
  assert.deepEqual(pick(shiftMonth(at(2026, 9, 15), 1)), [2026, 10, 15])
})

test('日号超出目标月天数时收敛到月末（1 月 31 日 → 2 月）', () => {
  assert.deepEqual(pick(shiftMonth(at(2026, 1, 31), 1)), [2026, 2, 28])
  assert.deepEqual(pick(shiftMonth(at(2024, 1, 31), 1)), [2024, 2, 29])
  assert.deepEqual(pick(withYearMonth(at(2026, 3, 31), 2026, 4)), [2026, 4, 30])
  assert.deepEqual(pick(withYearMonth(at(2026, 5, 31), 2026, 6)), [2026, 6, 30])
})

test('年 / 月被夹在可选区间内（1900-01 ~ 2100-12）', () => {
  assert.deepEqual(pick(shiftMonth(at(YEAR_MIN_PICKER, 1, 15), -1)), [YEAR_MIN_PICKER, 1, 15])
  assert.deepEqual(pick(shiftMonth(at(YEAR_MAX_PICKER, 12, 15), 1)), [YEAR_MAX_PICKER, 12, 15])
  assert.deepEqual(pick(withYearMonth(at(2026, 9, 24), 1800, 5)), [YEAR_MIN_PICKER, 5, 24])
  assert.deepEqual(pick(withYearMonth(at(2026, 9, 24), 2200, 13)), [YEAR_MAX_PICKER, 12, 24])
  assert.equal(YEAR_OPTIONS.length, 201)
  assert.equal(YEAR_OPTIONS[0], 1900)
  assert.equal(YEAR_OPTIONS[200], 2100)
  assert.equal(yearKeyOf(2026), 'y2026', '年份弹层靠这个 id 滚到当前年')
})

/* ==================== 时辰条 ==================== */

test('12 个地支都能落到整点，且分钟归零', () => {
  assert.deepEqual(Object.values(BRANCH_TO_HOUR), [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22])
  const base = at(2026, 9, 24, 15, 37)
  assert.deepEqual(withBranchHour(base, '子'), { year: 2026, month: 9, day: 24, hour: 0, minute: 0 })
  assert.deepEqual(withBranchHour(base, '午'), { year: 2026, month: 9, day: 24, hour: 12, minute: 0 })
  assert.deepEqual(withBranchHour(base, '亥'), { year: 2026, month: 9, day: 24, hour: 22, minute: 0 })
  // 未知地支不动
  assert.deepEqual(withBranchHour(base, 'X'), base)
})

test('点时辰后顶部时柱跟着变', () => {
  const base = at(2026, 9, 24, 16)
  const before = buildHeader(base).pillars[3]
  const after = buildHeader(withBranchHour(base, '午')).pillars[3]
  assert.equal(before.zhi, '申')
  assert.equal(after.zhi, '午')
})

/* ==================== 「今」 ==================== */

test('回到今天只改日期，保留当前时分', () => {
  const input = at(2020, 3, 5, 17, 42)
  const back = backToToday(input)
  const now = nowInput()
  assert.deepEqual(pick(back), [now.year, now.month, now.day])
  assert.equal(back.hour, 17)
  assert.equal(back.minute, 42)
})

const pick = (input) => [input.year, input.month, input.day]
