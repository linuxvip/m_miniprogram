/**
 * 排盘算法回归测试。
 *
 * 测试分两层：
 *  1. 关键断言：直接比对四柱干支，人可读，意图明确。
 *  2. 快照比对：与 tests/bazi-golden.json 做整对象深比对，能捕捉任何字段级的回归。
 *
 * 快照的正确性来源：这套实现曾与上游 TS 版本做过整对象深比对（14 例字节级一致），
 * 并在真实小程序运行时验证过。因此快照是「已校验的基准」，之后任何不一致都视为回归。
 *
 * 若确属有意修改算法，运行 `node scripts/gen-bazi-golden.js` 重新生成快照，
 * 并在 commit message 里说明改动原因。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { calculateBaZi } from '../utils/bazi/baziCalc.js'
import { CASES, EXPECTED_PILLARS } from './cases.js'

const golden = JSON.parse(
  readFileSync(new URL('./bazi-golden.json', import.meta.url), 'utf8')
)

const normalize = (chart) => JSON.parse(JSON.stringify(chart))

const pillarsOf = (chart) =>
  [chart.year, chart.month, chart.day, chart.hour]
    .map((p) => p.gan + p.zhi)
    .join(' ')

test('四柱干支与预期一致', () => {
  for (const c of CASES) {
    const chart = calculateBaZi(...c.args)
    assert.equal(pillarsOf(chart), EXPECTED_PILLARS[c.name], c.name)
  }
})

test('完整结果与已校验快照一致', () => {
  for (const c of CASES) {
    const chart = normalize(calculateBaZi(...c.args))
    assert.deepEqual(chart, golden[c.name], c.name)
  }
})

test('快照覆盖全部用例，无遗漏', () => {
  const missing = CASES.filter((c) => !(c.name in golden)).map((c) => c.name)
  assert.deepEqual(missing, [], '以下用例缺少快照')
})
