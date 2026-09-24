#!/usr/bin/env node
/**
 * 生成 tabBar 图标 PNG（T-0.4 / T-0.5）
 *
 * 为什么需要这个脚本：
 *   微信 tabBar 的 iconPath 只认本地 PNG/JPG，不支持 SVG，也不支持 base64。
 *   而网页端用的是 lucide-react 图标，小程序里没有等价物。
 *   这里把 lucide 的原始路径数据固化成 SVG 再转 PNG，保证图标几何与网页端
 *   完全一致（同一套 path data、同样的 strokeWidth=1.5）。
 *
 * 颜色取自网页端底部导航：
 *   未选中 #a8a29e（stone-400） / 选中 #2b2320（墨色）
 *
 * 输出：assets/tabbar/{name}.png 与 {name}-active.png，81×81（微信推荐尺寸），
 *       glyph 占画布 80%，留白比例与微信原生图标接近。
 *
 * 依赖 macOS 自带的 qlmanage 做 SVG→PNG 转换，因此只能在 macOS 上运行。
 * 用法：node scripts/gen-tabbar-icons.cjs
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'assets', 'tabbar')

const COLOR_NORMAL = '#a8a29e' // stone-400
const COLOR_ACTIVE = '#2b2320' // ink

const SIZE = 81
// viewBox 外扩，让 glyph 约占画布 80%（留白观感接近微信原生 tabBar 图标）
const PADDING = 3
const VIEW_BOX = `${-PADDING} ${-PADDING} ${24 + PADDING * 2} ${24 + PADDING * 2}`
const STROKE_WIDTH = 1.5 // 与网页端 strokeWidth={1.5} 一致

/**
 * 图标几何数据，逐字取自 lucide-react v0.454.0：
 *   layout-grid   → 网页端「排盘」    (App.tsx: LayoutGrid)
 *   calendar-days → 网页端「黄历」    (App.tsx: CalendarDays)
 *   library       → 网页端「命例库」  (App.tsx: Library)
 *   user          → 网页端「我的」    (App.tsx: User)
 * 对应文件：node_modules/lucide-react/dist/esm/icons/<name>.js
 */
const ICONS = {
  paipan: [
    ['rect', { width: '7', height: '7', x: '3', y: '3', rx: '1' }],
    ['rect', { width: '7', height: '7', x: '14', y: '3', rx: '1' }],
    ['rect', { width: '7', height: '7', x: '14', y: '14', rx: '1' }],
    ['rect', { width: '7', height: '7', x: '3', y: '14', rx: '1' }]
  ],
  huangli: [
    ['path', { d: 'M8 2v4' }],
    ['path', { d: 'M16 2v4' }],
    ['rect', { width: '18', height: '18', x: '3', y: '4', rx: '2' }],
    ['path', { d: 'M3 10h18' }],
    ['path', { d: 'M8 14h.01' }],
    ['path', { d: 'M12 14h.01' }],
    ['path', { d: 'M16 14h.01' }],
    ['path', { d: 'M8 18h.01' }],
    ['path', { d: 'M12 18h.01' }],
    ['path', { d: 'M16 18h.01' }]
  ],
  library: [
    ['path', { d: 'm16 6 4 14' }],
    ['path', { d: 'M12 6v14' }],
    ['path', { d: 'M8 8v12' }],
    ['path', { d: 'M4 4v16' }]
  ],
  profile: [
    ['path', { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }],
    ['circle', { cx: '12', cy: '7', r: '4' }]
  ]
}

/** 把 [标签, 属性] 数组渲染成 SVG 子元素 */
const renderNode = ([tag, attrs]) => {
  const a = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')
  return `  <${tag} ${a}/>`
}

// 注意：这里刻意不写 width/height。
// qlmanage 遇到显式 width/height 时会按 1:1 用户单位绘制（图标缩成左上角一小块），
// 只给 viewBox 时才会把内容缩放到 -s 指定的尺寸。输出大小由 qlmanage 的 -s 决定。
const buildSvg = (nodes, color) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}" fill="none" stroke="${color}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round">
${nodes.map(renderNode).join('\n')}
</svg>
`

const main = () => {
  if (process.platform !== 'darwin') {
    console.error('本脚本依赖 macOS 的 qlmanage，当前系统不支持。')
    process.exit(1)
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tabbar-icons-'))

  // 1) 先把所有图标写成 SVG
  const jobs = []
  for (const [name, nodes] of Object.entries(ICONS)) {
    for (const [suffix, color] of [['', COLOR_NORMAL], ['-active', COLOR_ACTIVE]]) {
      const svgPath = path.join(tmp, `${name}${suffix}.svg`)
      fs.writeFileSync(svgPath, buildSvg(nodes, color))
      jobs.push({ svgPath, outName: `${name}${suffix}.png` })
    }
  }

  // 2) 一次调用 qlmanage 批量转换（输出名为 <原文件名>.png）
  execFileSync('qlmanage', ['-t', '-s', String(SIZE), '-o', tmp, ...jobs.map(j => j.svgPath)], {
    stdio: 'ignore'
  })

  // 3) 改名并落到 assets/tabbar/
  for (const { svgPath, outName } of jobs) {
    const produced = `${svgPath}.png`
    if (!fs.existsSync(produced)) {
      console.error(`转换失败：${produced} 未生成`)
      process.exit(1)
    }
    fs.copyFileSync(produced, path.join(OUT_DIR, outName))
    const { size } = fs.statSync(path.join(OUT_DIR, outName))
    console.log(`  ${outName.padEnd(22)} ${String(size).padStart(6)} B`)
  }

  // 4) 清理临时目录
  fs.rmSync(tmp, { recursive: true, force: true })
  console.log(`\n已生成 ${jobs.length} 个图标 → assets/tabbar/`)
}

main()
