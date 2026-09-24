/**
 * 界面留档截图（与 smoke.js 分开跑）
 *
 * 跑法： node scripts/e2e/shots.js --ws=ws://127.0.0.1:9530
 *       node scripts/e2e/shots.js          # 自己用 cli 起一个开发者工具
 * 输出： artifacts/e2e/shots/*.png（整页 PNG，可直接肉眼验收）
 *
 * 三个踩过的坑，别改回去：
 *  1. 一个开发者工具**会话只能扛 3~4 次页面重载**，之后渲染层就废了 —— 表现为
 *     `page.$('.field-picker')` 恒为 null（但 currentPage() 还说在 paipan 页）、
 *     命盘页永远 `ready === false`、截图变成空白。实测单进程也一样，跟并发无关。
 *     所以这里**每张图都重启一次自动化通道**（耗时约 25 秒，12 张图 5 分钟，
 *     换来的是稳定出图）。只重连不重启是不够的。
 *  2. `mp.reLaunch` 是间歇性生效的（实测隔一条不跳）。所以 go() 里轮询确认页面真的
 *     换了才截图 —— 否则会存下一张「看着正常但根本不是这张表」的图。
 *  3. 往项目目录里写 PNG 有可能触发开发者工具重新编译，所以先攒在 /tmp 再搬进来。
 *
 * 另：弹层内部的页签点不到（自定义组件内部节点不在自动化树里，见 smoke.js 文件头），
 * 所以用「改受控属性 → 触发 show 的 false/true」把组件驱动到目标页签。
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import automator from 'miniprogram-automator'
import { Gender } from '../../utils/bazi/types.js'
import { calculateBaZi } from '../../utils/bazi/baziCalc.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = path.resolve(__dirname, '../..')
const CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const OUT_DIR = path.join(PROJECT, 'artifacts/e2e/shots')
// 先写到项目外再搬进来：往项目目录里写文件会触发开发者工具重新编译，
// 编译期间自动化会「假死」（page.$ 返回 null、命盘页 ready 永远为 false）。
// 实测把 PNG 直接写进项目目录时，从第 5 张截图开始必挂。
const STAGE_DIR = '/tmp/mh-shots-staging'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const wsArg = process.argv.find((a) => a.startsWith('--ws='))
const wsEndpoint = wsArg ? wsArg.slice('--ws='.length) : null
const PORT = wsEndpoint ? Number(wsEndpoint.split(':').pop()) || 9530 : 9530

/** 重启开发者工具并重建自动化通道（见文件头第 1 条） */
const restartChannel = () => {
  spawnSync(CLI, ['quit'], { stdio: 'ignore' })
  spawnSync('sleep', ['5'])
  const child = spawnSync(CLI, ['auto', '--project', PROJECT, '--auto-port', PORT], {
    stdio: 'ignore',
    detached: true
  })
  void child
}

const waitForPort = async (timeoutMs = 45000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const probe = spawnSync('lsof', ['-nP', `-iTCP:${PORT}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
    if (probe.stdout && probe.stdout.indexOf('LISTEN') >= 0) return true
    await sleep(1000)
  }
  return false
}

const connect = async () => {
  if (!wsEndpoint) return automator.launch({ cliPath: CLI, projectPath: PROJECT, timeout: 120000 })
  if (!(await waitForPort(20000))) {
    restartChannel()
    if (!(await waitForPort())) throw new Error(`自动化端口 ${PORT} 没起来`)
  }
  return automator.connect({ wsEndpoint })
}

/**
 * 连上之后还要等模拟器把页面渲染出来。
 * 刚 `cli auto` 完的两三秒里 currentPage() 会抛
 * `Cannot destructure property 'rawPath' of 'getPageMetaByWebviewId(...)' as it is null`
 * —— 那是「页面还没起来」，不是「页面找不到」，所以这里要轮询等。
 */
const waitAnyPage = async (mp, timeoutMs = 90000) => {
  const deadline = Date.now() + timeoutMs
  let lastErr = null
  while (Date.now() < deadline) {
    try {
      const page = await mp.currentPage()
      if (page && page.path) return page
    } catch (e) {
      lastErr = e
    }
    await sleep(1500)
  }
  throw new Error(`连上了但页面一直没就绪${lastErr ? `（${lastErr.message}）` : ''}`)
}

/** 选择器带重试：刚 reLaunch 完的瞬间常常还查不到节点 */
const pick = async (page, selector, tries = 6) => {
  for (let i = 0; i < tries; i++) {
    try {
      const el = await page.$(selector)
      if (el) return el
    } catch (e) {
      /* 抖动，重试 */
    }
    await sleep(400)
  }
  throw new Error(`找不到元素 ${selector}`)
}

const tapText = async (mp, selector, text) => {
  const page = await mp.currentPage()
  const list = await page.$$(selector)
  for (const el of list) {
    if ((await el.text()).trim() === text) {
      await el.tap()
      return true
    }
  }
  return false
}

/** 跳到目标页并确认真的到了（reLaunch 会间歇性不生效） */
const go = async (mp, url, expectPath) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    await mp.reLaunch(url)
    for (let i = 0; i < 12; i++) {
      await sleep(400)
      let page = null
      try {
        page = await mp.currentPage()
      } catch (e) {
        continue
      }
      if (page && page.path === expectPath) return page
    }
  }
  throw new Error(`期望停在 ${expectPath}，重试 3 次都没到`)
}

/** 命盘页要等算完（ready）再截图，否则拍到的是半张空表 */
const waitReady = async (page, timeoutMs = 8000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    let d = null
    try {
      d = await page.data()
    } catch (e) {
      d = null
    }
    if (d && d.ready === true) return d
    await sleep(400)
  }
  throw new Error('命盘页 8 秒内没 ready')
}

const openSheet = async (mp, patch = {}) => {
  await mp.evaluate(() => wx.clearStorageSync())
  const page = await go(mp, '/pages/paipan/paipan', 'pages/paipan/paipan')
  await sleep(600)
  const row = await pick(page, '.field-picker')
  await row.tap()
  await sleep(900)
  if (Object.keys(patch).length) {
    await page.setData({ ...patch, showSheet: false })
    await sleep(300)
    await page.setData({ showSheet: true })
    await sleep(900)
  }
  return page
}

const CHART_QS = 't=SOLAR&y=1991&m=1&d=1&h=2&mi=55&g=MALE&n=%E6%B5%8B%E8%AF%95&tst=1&lng=116.42&tz=%2B8&s=2'
const FAIL_QS = 't=DIRECT&y=0&m=0&d=0&h=0&mi=0&g=FEMALE&tst=0&tz=8&s=2' +
  '&yg=%E7%94%B2&yz=%E5%AD%90&mg=%E7%94%B2&mz=%E5%AD%90&dg=%E7%94%B2&dz=%E5%AD%90&hg=%E7%94%B2&hz=%E5%AD%90'

// 四柱页签要展示「匹配时间」列表，用 1990-01-01 12:00 的八字（区间内有解）
const probe = calculateBaZi(1990, 1, 1, 12, 0, Gender.MALE, 'SOLAR', undefined, false, 120, { sect: 2 })
const DIRECT_FULL = {
  yearGan: probe.year.gan, yearZhi: probe.year.zhi,
  monthGan: probe.month.gan, monthZhi: probe.month.zhi,
  dayGan: probe.day.gan, dayZhi: probe.day.zhi,
  hourGan: probe.hour.gan, hourZhi: probe.hour.zhi
}

const SHOTS = [
  { name: '01-paipan', run: async (mp) => {
    await mp.evaluate(() => wx.clearStorageSync())
    await go(mp, '/pages/paipan/paipan', 'pages/paipan/paipan')
    await sleep(800)
  } },
  { name: '02-paipan-advanced', run: async (mp) => {
    await mp.evaluate(() => wx.clearStorageSync())
    await go(mp, '/pages/paipan/paipan', 'pages/paipan/paipan')
    await sleep(600)
    await tapText(mp, '.adv-head', '高级设置▾')
    await sleep(700)
  } },
  { name: '03-sheet-solar', run: (mp) => openSheet(mp) },
  { name: '04-sheet-lunar', run: (mp) => openSheet(mp, {
    sheetTab: 'LUNAR',
    solar: { year: 2023, month: 3, day: 22, hour: 12, minute: 0 }
  }) },
  { name: '05-sheet-direct', run: (mp) => openSheet(mp, { sheetTab: 'DIRECT' }) },
  { name: '06-sheet-direct-partial', run: (mp) => openSheet(mp, {
    sheetTab: 'DIRECT',
    direct: { ...DIRECT_FULL, monthGan: '', monthZhi: '', dayGan: '', dayZhi: '', hourGan: '', hourZhi: '' }
  }) },
  { name: '07-sheet-match', run: async (mp) => {
    await openSheet(mp, { sheetTab: 'DIRECT', direct: DIRECT_FULL })
    await sleep(3500)
  } },
  { name: '08-paipan-filled', run: async (mp) => {
    const page = await openSheet(mp)
    await page.setData({ showSheet: false, name: '测试甲' })
    await page.callMethod('onSheetConfirm', {
      detail: {
        tab: 'DIRECT',
        solar: { year: 1990, month: 1, day: 1, hour: 12, minute: 0 },
        lunar: null,
        direct: DIRECT_FULL
      }
    })
    await sleep(900)
  } },
  { name: '09-chart-pro', run: async (mp) => {
    const page = await go(mp, `/pages/chart/chart?${CHART_QS}`, 'pages/chart/chart')
    await waitReady(page)
    await sleep(600)
  } },
  { name: '10-chart-basic', run: async (mp) => {
    const page = await go(mp, `/pages/chart/chart?${CHART_QS}`, 'pages/chart/chart')
    await waitReady(page)
    await tapText(mp, '.view-tab', '基本排盘')
    await sleep(800)
  } },
  { name: '11-chart-luck', run: async (mp) => {
    const page = await go(mp, `/pages/chart/chart?${CHART_QS}`, 'pages/chart/chart')
    await waitReady(page)
    const cols = await page.$$('.luck-col')
    if (cols[2]) await cols[2].tap()
    await sleep(700)
    const rows = await page.$$('.lc-item')
    if (rows[3]) await rows[3].tap()
    await sleep(700)
  } },
  { name: '12-chart-fail', run: async (mp) => {
    const page = await go(mp, `/pages/chart/chart?${FAIL_QS}`, 'pages/chart/chart')
    await waitReady(page)
    await sleep(600)
  } },
  { name: '13-huangli', run: async (mp) => {
    await go(mp, '/pages/huangli/huangli', 'pages/huangli/huangli')
    await sleep(1200)
  } },
  { name: '14-huangli-year-picker', run: async (mp) => {
    await go(mp, '/pages/huangli/huangli', 'pages/huangli/huangli')
    await sleep(1000)
    await tapText(mp, '.hl-ym-btn', `${new Date().getFullYear()}年`)
    await sleep(1100)
  } }
]

/** 每条截图：先重启一次开发者工具（只有头几次页面重载是可靠的），再连上拍 */
const captureOne = async (item) => {
  const file = path.join(STAGE_DIR, `${item.name}.png`)
  let lastErr = null
  for (let attempt = 0; attempt < 2; attempt++) {
    let mp = null
    try {
      if (wsEndpoint) {
        restartChannel()
        if (!(await waitForPort())) throw new Error(`自动化端口 ${PORT} 没起来`)
      }
      mp = await connect()
      await waitAnyPage(mp)
      await item.run(mp)
      await mp.screenshot({ path: file })
      const size = fs.statSync(file).size
      if (size < 2000) throw new Error(`截图疑似空白（${size} 字节）`)
      return size
    } catch (e) {
      lastErr = e
    } finally {
      try {
        if (mp) mp.disconnect()
      } catch (e) {
        /* ignore */
      }
      await sleep(500)
    }
  }
  throw lastErr
}

const onlyArg = process.argv.find((a) => a.startsWith('--only='))
const only = onlyArg ? onlyArg.slice('--only='.length).split(',') : null

const main = async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.mkdirSync(STAGE_DIR, { recursive: true })
  const list = only ? SHOTS.filter((s) => only.indexOf(s.name) >= 0) : SHOTS
  const ok = []
  const bad = []
  for (const item of list) {
    try {
      const size = await captureOne(item)
      ok.push(item.name)
      fs.copyFileSync(path.join(STAGE_DIR, `${item.name}.png`), path.join(OUT_DIR, `${item.name}.png`))
      console.log(`  ✅ ${item.name}  ${(size / 1024).toFixed(0)}KB`)
    } catch (e) {
      bad.push(`${item.name}: ${(e && e.message) || '(空错误)'}`)
      console.log(`  ❌ ${item.name} → ${(e && e.message) || '(空错误)'}`)
    }
  }
  console.log(`\n截图完成：成功 ${ok.length} / ${list.length}，输出目录 ${OUT_DIR}`)
  if (bad.length) console.log('失败：\n  ' + bad.join('\n  '))
  return bad.length
}

process.exit((await main()) ? 1 : 0)
