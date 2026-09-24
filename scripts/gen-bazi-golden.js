/**
 * 重新生成排盘快照 tests/bazi-golden.json。
 *
 * 仅在「确认算法改动符合预期」时使用，否则等于把回归一并固化。
 * 改动原因请写进 commit message。
 */
import { writeFileSync } from 'node:fs'
import { calculateBaZi } from '../utils/bazi/baziCalc.js'
import { CASES } from '../tests/cases.js'

const golden = {}

for (const c of CASES) {
  try {
    golden[c.name] = JSON.parse(JSON.stringify(calculateBaZi(...c.args)))
  } catch (err) {
    console.error(`[gen-bazi-golden] ${c.name} 计算失败：${err.message}`)
    process.exitCode = 1
  }
}

const target = new URL('../tests/bazi-golden.json', import.meta.url)
writeFileSync(target, `${JSON.stringify(golden, null, 2)}\n`)
console.log(`[gen-bazi-golden] 已写入 ${Object.keys(golden).length} 个用例 -> tests/bazi-golden.json`)
