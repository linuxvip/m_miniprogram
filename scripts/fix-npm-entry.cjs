/**
 * 微信开发者工具「构建 npm」的入口解析缺陷的临时绕过。
 *
 * 工具的 packJs 实现里会执行：main 字段不以 .js / .json 结尾时，直接补一个 .js 后缀。
 * lunar-typescript 的 main 是 "./dist/index.cjs"，于是被解析成 "dist/index.cjs.js"。
 * 该文件不存在 -> 入口查找失败 -> 整个包被静默跳过 -> 最终报 __NO_NODE_MODULES__。
 *
 * 这里按工具期望的命名补一份入口文件，install 后自动执行。
 * 若 lunar-typescript 未来把 main 改成 .js 结尾，本脚本会自动跳过。
 */
const fs = require('fs')
const path = require('path')

const pkgDir = path.join(__dirname, '..', 'node_modules', 'lunar-typescript')
const pkgJsonPath = path.join(pkgDir, 'package.json')

if (!fs.existsSync(pkgJsonPath)) {
  console.log('[fix-npm-entry] 未找到 lunar-typescript，跳过')
  process.exit(0)
}

const { main } = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
if (!main || main.endsWith('.js') || main.endsWith('.json')) {
  console.log('[fix-npm-entry] 入口已是 .js / .json，无需处理')
  process.exit(0)
}

const src = path.join(pkgDir, main)
const dest = `${src}.js`

if (!fs.existsSync(src)) {
  console.error('[fix-npm-entry] 入口文件不存在：', src)
  process.exit(1)
}

if (fs.existsSync(dest)) {
  console.log('[fix-npm-entry] 入口补齐已存在，跳过')
  process.exit(0)
}

fs.copyFileSync(src, dest)
console.log('[fix-npm-entry] 已补齐入口：', path.relative(process.cwd(), dest))
