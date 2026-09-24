/**
 * 小程序端到端冒烟测试（开发者工具 + 自动化）
 *
 * 为什么要有这个：算法有 node 单测（tests/*.test.js）兜底，但界面是「点出来的」——
 * 排盘按钮跳不跳、参数有没有带过去、命盘页渲染的干支是不是真等于算法结果，
 * 这些只能真把界面点一遍。断言尽量读「用户看得见的东西」（DOM 文本 / 页面 data）。
 *
 * ⚠️ 能力边界（2026-09-24 实测 devtools 36.6.0）：
 *   自动化树里**不含自定义组件内部节点** —— `page.$$('.sheet')` 恒为 0，
 *   `page.$('ui-icon')` 恒为 0，页面实例的 `selectComponent('datetime-sheet')`
 *   也拿不到组件（`page.getElementsByXpath` 在这个版本直接抛异常）。
 *   所以「日期弹层」只能验证到：能打开 / 受控属性灌进去不崩 / 确认结果正确回填页面；
 *   弹层内部的滚轮夹取、12 位快填校验、闰月列、四柱六步状态机由
 *   tests/datetimeSheet.test.js 覆盖（两边共用 utils/datetimeSheet.js）。
 *
 * 跑法：
 *   1) 开自动化通道： /Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
 *        --project <项目路径> --auto-port 9530
 *   2) node scripts/e2e/smoke.js --ws=ws://127.0.0.1:9530
 *      （不带 --ws 时脚本自己用 cli 启动，慢一些）
 * 不含截图 —— 截图在 scripts/e2e/shots.js。
 */
import automator from 'miniprogram-automator'
import { Solar, SolarMonth } from 'lunar-typescript'
import { Gender } from '../../utils/bazi/types.js'
import { calculateBaZi } from '../../utils/bazi/baziCalc.js'

const PROJECT = '/Users/Admin1/code/m_miniprogram'
const CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'

const results = []
let mp = null
const startedAt = Date.now()

const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail })
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? `  ${ok ? '· ' : '→ '}${detail}` : ''}`)
}
const step = (title) => console.log(`\n▶ ${title}`)
const trace = (msg) => {
  if (process.env.E2E_DEBUG) console.log(`     · ${msg}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const RETRYABLE = ['not on top', 'node not found', 'timeout waiting', 'Connection closed']
const withPage = async (page, fn) => {
  let lastErr = null
  for (let i = 0; i < 4; i++) {
    let target = null
    try {
      target = await mp.currentPage()
    } catch (e) {
      /* 取不到就用传进来的 */
    }
    if (!target) target = page
    try {
      return await fn(target)
    } catch (e) {
      lastErr = e
      const msg = String((e && e.message) || '')
      if (!RETRYABLE.some((k) => msg.indexOf(k) >= 0)) throw e
      trace(`工具侧抖动（${msg || '空错误'}），重试 ${i + 1}/4`)
      await sleep(1000)
    }
  }
  throw lastErr
}

const dataOf = (page) => withPage(page, (p) => p.data())
const wait = (page, ms) => withPage(page, (p) => p.waitFor(ms))
const firstOf = (page, selector) => withPage(page, (p) => p.$(selector))
const allOf = (page, selector) => withPage(page, (p) => p.$$(selector))

const textsOf = async (page, selector) => {
  trace(`取文本 ${selector}`)
  return withPage(page, async (p) => {
    const list = await p.$$(selector)
    const out = []
    for (const el of list) out.push((await el.text()).trim())
    return out
  })
}

const tapByText = async (page, selector, text) => {
  trace(`点击 ${selector} → ${text}`)
  return withPage(page, async (p) => {
    const list = await p.$$(selector)
    for (const el of list) {
      if ((await el.text()).trim() === text) {
        await el.tap()
        return true
      }
    }
    return false
  })
}

/** 高级设置里的开关在行内的 .switch 上，点整行没有事件，要精确点到开关 */
const toggleRowSwitch = async (page, keyword) => {
  const rows = await allOf(page, '.adv-row')
  for (const row of rows) {
    const t = (await row.text()).trim()
    if (t.indexOf(keyword) >= 0) {
      const sw = await row.$('.switch')
      if (sw) {
        await sw.tap()
        return true
      }
    }
  }
  return false
}

const textOf = async (page, selector) => {
  trace(`取单元素 ${selector}`)
  return withPage(page, async (p) => {
    const el = await p.$(selector)
    return el ? (await el.text()).trim() : ''
  })
}

/**
 * 打开日期弹层（点「出生日期」那一行）。
 * `.field-picker` 在 wxml 里有两处（出生日期 / 出生地点），[0] 才是日期。
 */
const openSheet = async (page) => {
  const row = await firstOf(page, '.field-picker')
  await row.tap()
  await wait(page, 700)
}

/**
 * 把弹层切到指定页签 / 指定输入。
 * 组件内部点不到，只能改「受控属性」再触发一次 show 的 false → true，
 * 让组件在 observers.show 里重新 reset() —— 这条正好也验证了属性注入链路。
 */
const driveSheet = async (page, { tab, solar, direct }) => {
  const patch = { showSheet: false }
  if (tab) patch.sheetTab = tab
  if (solar) patch.solar = solar
  if (direct) patch.direct = direct
  await withPage(page, (p) => p.setData(patch))
  await wait(page, 300)
  await withPage(page, (p) => p.setData({ showSheet: true }))
  await wait(page, 700)
}

/** 模拟弹层「确定」：直接调页面的事件处理函数，走真实的回填逻辑 */
const confirmSheet = (page, detail) =>
  withPage(page, (p) => p.callMethod('onSheetConfirm', { detail }))

/** 从命盘页的表格行里取一行的文本 */
const rowTexts = (data, key) => {
  const row = (data.gridRows || []).find((r) => r.key === key)
  return row ? row.cells.map((c) => c.text) : []
}

const run = async () => {
  const wsArg = process.argv.find((a) => a.startsWith('--ws='))
  mp = wsArg
    ? await automator.connect({ wsEndpoint: wsArg.slice('--ws='.length) })
    : await automator.launch({ cliPath: CLI, projectPath: PROJECT, timeout: 120000 })

  /* ===================== 输入页 ===================== */
  step('输入页 · 基本渲染')
  // 排盘偏好是本地记忆的（T-1.8），上一轮的取值会带进这一轮，先清干净再断言默认值
  await mp.evaluate(() => wx.clearStorageSync())
  const paipan = await mp.reLaunch('/pages/paipan/paipan')
  await wait(paipan, 900)
  const pdata = await dataOf(paipan)
  const today = new Date()
  const expectToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  check('排盘页可打开', paipan.path === 'pages/paipan/paipan', paipan.path)
  check('性别默认乾造', pdata.gender === 'MALE', pdata.gender)
  check('模式默认公历', pdata.calendarType === 'SOLAR', pdata.calendarType)
  check('日期摘要取今天', String(pdata.summaryPlain).indexOf(expectToday) === 0, pdata.summaryPlain)
  check('默认出生地带经度', String(pdata.longitude).indexOf('116.4') === 0, pdata.longitude)
  check('出生地点显示为「省 区」', pdata.regionText === '北京市 东城区', pdata.regionText)
  check('即时局四柱 4 根且带五行色',
    Array.isArray(pdata.nowPillars) && pdata.nowPillars.length === 4 && !!pdata.nowPillars[0].ganCls,
    pdata.nowPillars.map((p) => p.gan + p.zhi).join(' '))
  check('即时局农历文案非空', !!pdata.nowLunar, pdata.nowLunar)
  check('即时局渲染出 8 个字', (await textsOf(paipan, '.char-box')).length === 8)

  step('高级设置（T-1.21）')
  check('默认折叠', pdata.showAdvanced === false)
  await tapByText(paipan, '.adv-head', '高级设置▾')
  await wait(paipan, 300)
  let d = await dataOf(paipan)
  check('点开后可展开', d.showAdvanced === true)
  check('时区默认东八区', String(d.timezoneText).indexOf('UTC+8') === 0, d.timezoneText)
  check('真太阳时默认开', d.useTrueSolarTime === true)
  check('换日规则默认子正（sect=2）', d.sect === 2, String(d.sect))
  check('高级项渲染 4 行', (await allOf(paipan, '.adv-row')).length === 4)
  await tapByText(paipan, '.adv-head', '高级设置▾')
  await wait(paipan, 300)
  check('再点收起', (await dataOf(paipan)).showAdvanced === false)

  step('排盘偏好本地记忆（T-1.8 本地部分）')
  await tapByText(paipan, '.segmented-item', '坤造')
  await tapByText(paipan, '.segmented-item', '农历')
  await tapByText(paipan, '.adv-head', '高级设置▾')
  await wait(paipan, 300)
  await toggleRowSwitch(paipan, '真太阳时校正')
  await wait(paipan, 300)
  const before = await dataOf(paipan)
  check('改后真太阳时已关', before.useTrueSolarTime === false)
  const paipan2 = await mp.reLaunch('/pages/paipan/paipan')
  await wait(paipan2, 1200)
  const restored = await dataOf(paipan2)
  check('重进页面回填性别', restored.gender === 'FEMALE', restored.gender)
  check('重进页面回填排盘模式', restored.calendarType === 'LUNAR', restored.calendarType)
  check('重进页面回填真太阳时开关', restored.useTrueSolarTime === false, String(restored.useTrueSolarTime))
  // 复位，免得影响后面的断言
  await tapByText(paipan2, '.segmented-item', '乾造')
  await tapByText(paipan2, '.segmented-item', '公历')
  await tapByText(paipan2, '.adv-head', '高级设置▾')
  await wait(paipan2, 300)
  await toggleRowSwitch(paipan2, '真太阳时校正')
  await wait(paipan2, 300)
  const reset = await dataOf(paipan2)
  check('复位回乾造 / 公历 / 真太阳时开',
    reset.gender === 'MALE' && reset.calendarType === 'SOLAR' && reset.useTrueSolarTime === true,
    `${reset.gender}/${reset.calendarType}/${reset.useTrueSolarTime}`)
  await tapByText(paipan2, '.adv-head', '高级设置▾')
  await wait(paipan2, 300)

  step('输入页 · 姓名与出生地点（T-1.22 / T-1.6）')
  await (await firstOf(paipan2, '.name-input')).input('测试甲')
  await wait(paipan2, 300)
  check('姓名输入回填到 data', (await dataOf(paipan2)).name === '测试甲', (await dataOf(paipan2)).name)
  await (await firstOf(paipan2, 'picker')).trigger('change', { value: ['广东省', '深圳市', '南山区'] })
  await wait(paipan2, 500)
  d = await dataOf(paipan2)
  check('地区选择更新文案', d.regionText === '广东省 深圳市', d.regionText)
  check('地区带出经度', String(d.longitude) === '114.06', String(d.longitude))
  check('地区带出纬度', String(d.latitude) === '22.54', String(d.latitude))

  /* ===================== 日期弹层 ===================== */
  step('日期弹层 · 开合与受控属性（T-1.19）')
  await openSheet(paipan2)
  d = await dataOf(paipan2)
  check('点出生日期可打开弹层', d.showSheet === true)
  // 弹层内部节点工具侧看不到（见文件头说明），这里验证组件确实被喂到了模式
  await driveSheet(paipan2, { tab: 'LUNAR', solar: { year: 2023, month: 3, day: 22, hour: 12, minute: 0 } })
  check('切到农历页签不炸', (await dataOf(paipan2)).showSheet === true)
  await driveSheet(paipan2, { tab: 'DIRECT' })
  check('切到四柱页签不炸', (await dataOf(paipan2)).showSheet === true)
  await withPage(paipan2, (p) => p.setData({ showSheet: false }))
  await wait(paipan2, 300)
  check('关掉弹层', (await dataOf(paipan2)).showSheet === false)

  step('日期弹层 · 确认结果回填（手递手）')
  await confirmSheet(paipan2, {
    tab: 'LUNAR',
    solar: { year: 2023, month: 3, day: 22, hour: 12, minute: 0 },
    lunar: { year: 2023, month: 2, leap: true, day: 1, hour: 12, minute: 0 },
    direct: null
  })
  await wait(paipan2, 400)
  d = await dataOf(paipan2)
  check('确认后关闭弹层', d.showSheet === false)
  check('确认后模式为农历', d.calendarType === 'LUNAR', d.calendarType)
  check('确认后摘要显示闰二月初一', d.summaryPlain.indexOf('闰二月初一') > 0, d.summaryPlain)

  const directBazi = { yearGan: '己', yearZhi: '巳', monthGan: '丙', monthZhi: '子', dayGan: '甲', dayZhi: '子', hourGan: '庚', hourZhi: '午' }
  await confirmSheet(paipan2, {
    tab: 'DIRECT',
    solar: { year: 1990, month: 1, day: 1, hour: 12, minute: 0 },
    lunar: null,
    direct: directBazi
  })
  await wait(paipan2, 400)
  d = await dataOf(paipan2)
  check('确认后模式为四柱', d.calendarType === 'DIRECT', d.calendarType)
  const summaryChars = (d.summaryNodes || []).filter((n) => n.t !== ' ').map((n) => n.t).join('')
  check('四柱摘要显示 8 个字', summaryChars.length === 8, summaryChars)
  check('四柱摘要与传入一致', summaryChars === '己巳丙子甲子庚午', summaryChars)

  /* ===================== 跳转命盘页 ===================== */
  step('输入页 → 命盘页（T-1.20 / T-1.17）')
  const goBtn = await firstOf(paipan2, '.btn.primary.block')
  await goBtn.tap()
  await wait(paipan2, 2000)
  const chart = await mp.currentPage()
  check('点开始排盘进入命盘页', chart.path === 'pages/chart/chart', chart.path)
  const q = chart.query || {}
  const qa = (v) => (v === undefined ? '' : decodeURIComponent(v))
  const qBazi = ['yg', 'yz', 'mg', 'mz', 'dg', 'dz', 'hg', 'hz'].map((k) => qa(q[k])).join('')
  check('query 带上四柱八字', qBazi === '己巳丙子甲子庚午', qBazi)
  check('query 带上姓名（已编码）', String(q.n).length > 0, q.n)
  check('姓名解码后正确', qa(q.n) === '测试甲', qa(q.n))
  check('query 带上时间与时区', q.y === '1990' && q.mi === '0', `${q.y}-${q.m}-${q.d} ${q.tz}`)
  check('query 里时区不出现裸加号', String(q.tz).indexOf(' ') < 0, q.tz)

  /* ===================== 命盘页 ===================== */
  step('命盘页 · 公历排盘（T-1.10 ~ T-1.14 / T-1.23）')
  const qs = 't=SOLAR&y=1991&m=1&d=1&h=2&mi=55&g=MALE&n=%E6%B5%8B%E8%AF%95&tst=1&lng=116.42&tz=%2B8&s=2'
  const chartSolar = await mp.navigateTo(`/pages/chart/chart?${qs}`)
  await wait(chartSolar, 1800)
  const cdata = await dataOf(chartSolar)
  const expected = calculateBaZi(1991, 1, 1, 2, 55, Gender.MALE, 'SOLAR', undefined, true, 116.42, { sect: 2 })
  const pillars = [expected.year, expected.month, expected.day, expected.hour]
  check('命盘页可打开', cdata.ready === true, String(cdata.error || ''))
  check('姓名回显', cdata.name === '测试', cdata.name)
  check('默认进专业细盘', cdata.viewTab === 'PRO')
  check('专业细盘 6 列', cdata.colCount === 6, String(cdata.colCount))
  check('六柱表头正确',
    (cdata.gridCols || []).map((c) => c.label).join(',') === '流年,大运,年柱,月柱,日柱,时柱',
    (cdata.gridCols || []).map((c) => c.label).join(','))
  check('四柱天干与算法一致', rowTexts(cdata, 'gan').slice(2).join('') === pillars.map((p) => p.gan).join(''),
    `${rowTexts(cdata, 'gan').slice(2).join('')} vs ${pillars.map((p) => p.gan).join('')}`)
  check('四柱地支与算法一致', rowTexts(cdata, 'zhi').slice(2).join('') === pillars.map((p) => p.zhi).join(''),
    `${rowTexts(cdata, 'zhi').slice(2).join('')} vs ${pillars.map((p) => p.zhi).join('')}`)
  check('主星行日柱为元男', (rowTexts(cdata, 'master')[4] || '') === '元男', rowTexts(cdata, 'master').join(','))
  check('主星行年柱十神与算法一致', rowTexts(cdata, 'master')[2] === expected.year.shiShen, rowTexts(cdata, 'master')[2])
  // 藏干/副星行是「列表」型 cell，文本在 items 里而不是 text
  const listTexts = (data, key) => {
    const row = (data.gridRows || []).find((r) => r.key === key)
    return row ? row.cells.map((c) => (c.items ? c.items.map((i) => i.t).join('') : c.text)) : []
  }
  check('藏干行与算法一致',
    listTexts(cdata, 'cangGan').slice(2).join('|') ===
      pillars.map((p) => (p.cangGan || []).join('')).join('|'),
    listTexts(cdata, 'cangGan').slice(2).join('|'))
  check('副星行非空', listTexts(cdata, 'fuXing').slice(2).every((t) => !!t), listTexts(cdata, 'fuXing').join('|'))
  check('纳音行与算法一致', rowTexts(cdata, 'naYin')[2] === expected.year.naYin, rowTexts(cdata, 'naYin')[2])
  check('空亡行与算法一致', rowTexts(cdata, 'xunKong')[2] === expected.year.xunKong, rowTexts(cdata, 'xunKong')[2])
  check('五行统计与算法一致',
    cdata.wuXing.map((w) => `${w.element}${w.count}`).join(',') ===
      (expected.wuXing || []).map((w) => `${w.element}${w.count}`).join(','),
    cdata.wuXing.map((w) => `${w.element}${w.count}`).join(','))
  check('大运 9 步', cdata.luckPillars.length === 9, String(cdata.luckPillars.length))
  check('首步是小运', cdata.luckPillars[0].label === '小运', cdata.luckPillars[0].label)
  check('小运只有 1 年（前置柱）', cdata.luckPillars[0].liuNian.length === 1, String(cdata.luckPillars[0].liuNian.length))
  check('其余每步 10 年流年', cdata.luckPillars.slice(1).every((lp) => lp.liuNian.length === 10),
    cdata.luckPillars.map((lp) => lp.liuNian.length).join(','))
  check('大运年份连续不断档',
    cdata.luckPillars.slice(1).every((lp, i, arr) => i === 0 || lp.liuNian[0].year === arr[i - 1].liuNian[9].year + 1),
    cdata.luckPillars.map((lp) => `${lp.liuNian[0].year}~${lp.liuNian[lp.liuNian.length - 1].year}`).join(' '))
  check('生肖/星座有值', !!cdata.zodiac && !!cdata.constellation, `${cdata.zodiac}/${cdata.constellation}`)
  check('气数非空', !!cdata.jieQi, cdata.jieQi)
  check('匹配失败告警条不出现', cdata.failed === false)

  step('命盘页 · 农历闰月排盘（年份/月序不能搞反）')
  // 2023 农历闰二月初一 12:00 —— 闰月用负数传给算法，这条最容易写错
  const leapQs = 't=LUNAR&y=2023&m=-2&d=1&h=12&mi=0&g=FEMALE&tst=1&lng=116.42&tz=%2B8&s=2'
  const leapPage = await mp.navigateTo(`/pages/chart/chart?${leapQs}`)
  await wait(leapPage, 1800)
  const ldata = await dataOf(leapPage)
  const expectLeap = calculateBaZi(2023, -2, 1, 12, 0, Gender.FEMALE, 'LUNAR', undefined, true, 116.42, { sect: 2 })
  check('农历命盘可打开', ldata.ready === true, String(ldata.error || ''))
  const leapPillars = [expectLeap.year, expectLeap.month, expectLeap.day, expectLeap.hour]
  check('农历闰二月四柱与算法一致',
    rowTexts(ldata, 'gan').slice(2).join('') === leapPillars.map((p) => p.gan).join('') &&
      rowTexts(ldata, 'zhi').slice(2).join('') === leapPillars.map((p) => p.zhi).join(''),
    `${rowTexts(ldata, 'gan').slice(2).join('')}${rowTexts(ldata, 'zhi').slice(2).join('')}` +
    ` vs ${leapPillars.map((p) => p.gan + p.zhi).join('')}`)
  check('闰月换算出的公历日期正确',
    String(ldata.solarDate || '').indexOf('2023-03-22') >= 0, ldata.solarDate)
  check('坤造主星为元女', (rowTexts(ldata, 'master')[4] || '') === '元女', rowTexts(ldata, 'master')[4])
  check('农历命盘头显示农历日期', String(ldata.lunarDate || '').indexOf('闰') >= 0, ldata.lunarDate)

  step('命盘页 · 大运流年交互（T-1.11）')
  const yearBefore = cdata.selYear
  await (await firstOf(chartSolar, '.lc-item')).tap()
  await wait(chartSolar, 600)
  let after = await dataOf(chartSolar)
  check('点流年切换选中年份', after.selYear !== yearBefore, `${yearBefore} → ${after.selYear}`)
  check('虚岁随之变化', after.xuSui > 0, String(after.xuSui))
  const luckCols = await allOf(chartSolar, '.luck-col')
  await luckCols[2].tap()
  await wait(chartSolar, 600)
  after = await dataOf(chartSolar)
  check('点大运列切换选中大运', after.luckPillars[2].isSelected === true,
    after.luckPillars.map((l) => l.isSelected).join(','))
  check('六柱大运列副标题跟着变', String(after.gridCols[1].sub).indexOf('岁') > 0, after.gridCols[1].sub)

  step('命盘页 · 基本盘切换与折叠（T-1.10）')
  await tapByText(chartSolar, '.view-tab', '基本排盘')
  await wait(chartSolar, 600)
  const basic = await dataOf(chartSolar)
  check('切到基本排盘', basic.viewTab === 'BASIC')
  check('基本盘 4 列', basic.colCount === 4, String(basic.colCount))
  check('基本盘无流年/大运列',
    (basic.gridCols || []).map((c) => c.label).join(',') === '年柱,月柱,日柱,时柱',
    (basic.gridCols || []).map((c) => c.label).join(','))
  check('基本盘含 9 行基础项 + 神煞',
    (basic.gridRows || []).map((r) => r.label).join(',') === '主星,天干,地支,藏干,副星,星运,自坐,空亡,纳音,神煞',
    (basic.gridRows || []).map((r) => r.label).join(','))

  await tapByText(chartSolar, '.view-tab', '专业细盘')
  await wait(chartSolar, 600)
  const rowsBefore = (await allOf(chartSolar, '.grid-row')).length
  await tapByText(chartSolar, '.grid-label-tap', '日期')
  await wait(chartSolar, 500)
  const rowsAfter = (await allOf(chartSolar, '.grid-row')).length
  check('折叠后行数变少', rowsAfter > 0 && rowsAfter < rowsBefore, `${rowsBefore} → ${rowsAfter}`)
  await tapByText(chartSolar, '.grid-label-tap', '日期')
  await wait(chartSolar, 500)
  check('再点恢复全部行', (await allOf(chartSolar, '.grid-row')).length === rowsBefore)

  step('命盘页 · 无解八字的告警条（T-1.24）')
  const failQs = 't=DIRECT&y=0&m=0&d=0&h=0&mi=0&g=FEMALE&tst=0&tz=8&s=2' +
    '&yg=%E7%94%B2&yz=%E5%AD%90&mg=%E7%94%B2&mz=%E5%AD%90&dg=%E7%94%B2&dz=%E5%AD%90&hg=%E7%94%B2&hz=%E5%AD%90'
  const failPage = await mp.navigateTo(`/pages/chart/chart?${failQs}`)
  await wait(failPage, 1800)
  const fdata = await dataOf(failPage)
  check('触发匹配失败告警', fdata.failed === true, fdata.solarDate)
  check('告警条渲染出来', (await allOf(failPage, '.fail-bar')).length === 1)
  check('无解时仍渲染四柱', (fdata.gridRows || []).length > 0)
  check('坤造主星显示元女',
    (fdata.gridRows || []).find((r) => r.key === 'master').cells[4].text === '元女')

  step('命盘页 · 页面栈与返回（T-1.17）')
  const stack = await mp.pageStack()
  check('页面栈里命盘页存在', stack.some((p) => p.path === 'pages/chart/chart'), String(stack.length))
  await mp.navigateBack()
  await wait(null, 900)
  const back = await mp.currentPage()
  check('返回回到上一页', back.path === 'pages/chart/chart' || back.path === 'pages/paipan/paipan', back.path)

  /* ===================== 黄历页（T-2.1 ~ T-2.6） ===================== */
  /** tabBar 页只能 switchTab；刚切完 currentPage() 偶尔还抛错，所以轮询确认 */
  const openTab = async (url, expect) => {
    for (let i = 0; i < 3; i++) {
      try {
        await mp.switchTab(url)
      } catch (e) {
        trace(`switchTab 抖动：${e && e.message}`)
      }
      for (let j = 0; j < 12; j++) {
        await sleep(500)
        let p = null
        try {
          p = await mp.currentPage()
        } catch (e) {
          continue
        }
        if (p && p.path === expect) return p
      }
    }
    throw new Error(`switchTab 之后没停在 ${expect}`)
  }
  const daysInMonth = (y, m) => SolarMonth.fromYm(y, m).getDays().length

  step('黄历页 · 打开与顶部四柱信息栏（T-2.3）')
  const hlPage = await openTab('/pages/huangli/huangli', 'pages/huangli/huangli')
  check('黄历页可打开', hlPage.path === 'pages/huangli/huangli', hlPage.path)
  await wait(hlPage, 900)

  const nowD = new Date()
  let hd = await dataOf(hlPage)
  const hlInput = hd.input
  check('默认停在今天',
    hlInput.year === nowD.getFullYear() && hlInput.month === nowD.getMonth() + 1 && hlInput.day === nowD.getDate(),
    `${hlInput.year}-${hlInput.month}-${hlInput.day}`)
  check('四柱 4 根、标签为「年月日时」',
    (hd.header.pillars || []).map((p) => p.label).join('') === '年月日时',
    (hd.header.pillars || []).map((p) => p.label).join(''))
  check('四柱带五行文字色',
    (hd.header.pillars || []).every((p) => !!p.ganCls && !!p.zhiCls),
    (hd.header.pillars || []).map((p) => `${p.gan}:${p.ganCls}`).join(' '))
  // 黄历页走 lunar-typescript 的 getEightChar()，这一侧独立算一遍比对（防两侧漂移）
  const hlEight = (input) => Solar.fromYmdHms(input.year, input.month, input.day, input.hour, input.minute || 0, 0)
    .getLunar().getEightChar()
  const hlLunar = (input) => {
    const l = Solar.fromYmdHms(input.year, input.month, input.day, input.hour, input.minute || 0, 0).getLunar()
    return `农历${l.getYearInGanZhi()} ${l.getMonthInChinese()}月${l.getDayInChinese()} · ${l.getYearShengXiao()}`
  }
  const hlWant = (() => {
    const ec = hlEight(hlInput)
    return [ec.getYearGan() + ec.getYearZhi(), ec.getMonthGan() + ec.getMonthZhi(),
      ec.getDayGan() + ec.getDayZhi(), ec.getTimeGan() + ec.getTimeZhi()]
  })()
  const domPillars = (await textsOf(hlPage, '.hl-pbig')).join('')
  check('顶部四柱与历法库一致',
    (hd.header.pillars || []).map((p) => p.gan + p.zhi).join('') === hlWant.join(''), 
    `${(hd.header.pillars || []).map((p) => p.gan + p.zhi).join('')} vs ${hlWant.join('')}`)
  check('DOM 里渲染出 8 个柱子文字', domPillars === hlWant.join(''), domPillars)
  check('渲染出 4 个柱位', (await allOf(hlPage, '.hl-pillar')).length === 4)
  check('公历文案 = 年.月.日',
    hd.header.solarText === `${hlInput.year}.${String(hlInput.month).padStart(2, '0')}.${String(hlInput.day).padStart(2, '0')}`,
    hd.header.solarText)
  check('星期显示中文星期', /^[日一二三四五六]$/.test(hd.header.week), hd.header.week)
  check('农历文案与历法库一致', hd.header.lunarText === hlLunar(hlInput), hd.header.lunarText)
  check('时支与历法库一致', hd.header.timeBranch === hlEight(hlInput).getTimeZhi(),
    `${hd.header.timeBranch}/${hlEight(hlInput).getTimeZhi()}`)
  check('大日号 = 选中日', hd.header.day === hlInput.day, String(hd.header.day))
  const footText = await textOf(hlPage, '.hl-foot')
  const cfgFooter = await mp.evaluate(() => getApp().globalData.siteConfig.footer_text)
  check('页脚文案非空', !!footText, footText)
  check('页脚文案取自站点配置（T-0.9）', footText === cfgFooter, `${footText} vs ${cfgFooter}`)

  step('黄历页 · 月历网格与 DOM 对齐（T-2.1 / T-2.5）')
  let grid = hd.month
  check('网格天数 = 当月天数', grid.cells.length === daysInMonth(grid.year, grid.month),
    `${grid.cells.length}/${daysInMonth(grid.year, grid.month)}`)
  check('空位数 = 当月 1 号星期几', grid.leadingCount === Solar.fromYmd(grid.year, grid.month, 1).getWeek(),
    `${grid.leadingCount}/${Solar.fromYmd(grid.year, grid.month, 1).getWeek()}`)
  check('DOM 空格子数 = 空位数', (await allOf(hlPage, '.hl-cell-empty')).length === grid.leadingCount)
  check('DOM 日格子数 = 当月天数', (await allOf(hlPage, '.hl-cell-inner')).length === grid.cells.length)
  const domDays = (await textsOf(hlPage, '.hl-solar')).join(',')
  check('DOM 日号与数据一致', domDays === grid.cells.map((c) => String(c.day)).join(','), domDays)
  const domSubs = (await textsOf(hlPage, '.hl-sub-line')).join(',')
  check('副行（节气 / 农历）与数据一致', domSubs === grid.cells.map((c) => c.sub).join(','), domSubs)
  const domGz = (await textsOf(hlPage, '.hl-gz-line')).join(',')
  check('日干支行与数据一致', domGz === grid.cells.map((c) => c.gz).join(','), domGz)
  check('星期表头 7 列', (await allOf(hlPage, '.hl-weekcell')).length === 7)
  const weekendCells = grid.cells.filter((c) => c.weekend)
  const selCell = grid.cells.find((c) => c.selected)
  check('周六周日格合计不少于 8 个', weekendCells.length >= 8, String(weekendCells.length))
  const redCount = (await allOf(hlPage, '.hl-solar-red')).length
  check('周末日号染红（选中日在周末时少一个）',
    redCount === weekendCells.length - (selCell && selCell.weekend ? 1 : 0), String(redCount))
  const jqCell = grid.cells.find((c) => c.jieQi)
  check('当月有节气格且副行显示节气名', !!jqCell && domSubs.indexOf(jqCell.jieQi) >= 0,
    jqCell ? `${jqCell.day}日 ${jqCell.jieQi}` : '当月无节气')
  check('节气格副行走深红样式', !!jqCell && jqCell.subCls === 'hl-sub-jq', jqCell && jqCell.subCls)
  check('选中格唯一', grid.cells.filter((c) => c.selected).length === 1)
  check('选中的就是今天', selCell.day === hlInput.day, `${selCell.day}/${hlInput.day}`)
  check('DOM 里只有一个高亮格', (await allOf(hlPage, '.hl-on')).length === 1)
  check('「今」标记唯一', (await allOf(hlPage, '.hl-td')).length === 1)
  check('年月按钮显示当前年月',
    (await textsOf(hlPage, '.hl-ym-btn')).join('') === `${grid.year}年${grid.month}月`,
    (await textsOf(hlPage, '.hl-ym-btn')).join(''))

  step('黄历页 · 时辰条（T-2.4）')
  check('12 个地支', (await allOf(hlPage, '.hl-branch')).length === 12)
  check('时辰条带小时文案', (hd.branches || []).every((b) => /^\d+时$/.test(b.hourText)),
    (hd.branches || []).map((b) => b.hourText).join(','))
  check('当前时支高亮唯一', (await allOf(hlPage, '.hl-branch-on')).length === 1)
  check('高亮的就是当前时支', (await textOf(hlPage, '.hl-branch-on')) === hd.header.timeBranch,
    `${await textOf(hlPage, '.hl-branch-on')}/${hd.header.timeBranch}`)
  await tapByText(hlPage, '.hl-branch', '午')
  await wait(hlPage, 600)
  hd = await dataOf(hlPage)
  check('点时辰条把时刻挪到整点', hd.input.hour === 12 && hd.input.minute === 0, `${hd.input.hour}:${hd.input.minute}`)
  check('时柱随之变为午', hd.header.timeBranch === '午', hd.header.timeBranch)
  check('高亮跟着挪到午', (await textOf(hlPage, '.hl-branch-on')) === '午', await textOf(hlPage, '.hl-branch-on'))
  check('点时辰不改日期', hd.input.day === hlInput.day, String(hd.input.day))

  step('黄历页 · 选日（T-2.1）')
  grid = hd.month
  const targetDay = grid.cells.find((c) => c.day !== hd.input.day).day
  const innerEls = await allOf(hlPage, '.hl-cell-inner')
  await innerEls[grid.cells.findIndex((c) => c.day === targetDay)].tap()
  await wait(hlPage, 700)
  hd = await dataOf(hlPage)
  check('点日期切换选中日', hd.input.day === targetDay, `点 ${targetDay} → 选中 ${hd.input.day}`)
  check('高亮格仍然唯一', (await allOf(hlPage, '.hl-on')).length === 1)
  check('高亮格就是刚点的那天', (await textOf(hlPage, '.hl-on')).indexOf(String(targetDay)) === 0, await textOf(hlPage, '.hl-on'))
  check('顶部大日号跟着变', hd.header.day === targetDay, String(hd.header.day))
  check('日柱跟着变且与历法库一致',
    hd.header.pillars[2].gan + hd.header.pillars[2].zhi === hlEight(hd.input).getDayGan() + hlEight(hd.input).getDayZhi(),
    hd.header.pillars[2].gan + hd.header.pillars[2].zhi)

  step('黄历页 · 上下月与「今」（T-2.6）')
  const tapArrow = async (idx) => {
    const els = await allOf(hlPage, '.hl-arrow')
    await els[idx].tap()
    await wait(hlPage, 600)
  }
  const baseYM = [hd.input.year, hd.input.month]
  await tapArrow(0)
  hd = await dataOf(hlPage)
  const prevWant = baseYM[1] === 1 ? [baseYM[0] - 1, 12] : [baseYM[0], baseYM[1] - 1]
  check('上个月按钮后退一月', hd.input.year === prevWant[0] && hd.input.month === prevWant[1],
    `${hd.input.year}-${hd.input.month}`)
  check('换月后网格按新月重算', hd.month.cells.length === daysInMonth(hd.input.year, hd.input.month),
    `${hd.month.cells.length}/${daysInMonth(hd.input.year, hd.input.month)}`)
  check('换月后高亮格仍唯一', (await allOf(hlPage, '.hl-on')).length === 1)
  await tapArrow(1)
  hd = await dataOf(hlPage)
  check('下个月按钮回到原月', hd.input.year === baseYM[0] && hd.input.month === baseYM[1],
    `${hd.input.year}-${hd.input.month}`)
  await tapArrow(0)
  await tapArrow(0)
  await (await firstOf(hlPage, '.hl-today')).tap()
  await wait(hlPage, 800)
  hd = await dataOf(hlPage)
  check('点「今」回到今天',
    hd.input.year === nowD.getFullYear() && hd.input.month === nowD.getMonth() + 1 && hd.input.day === nowD.getDate(),
    `${hd.input.year}-${hd.input.month}-${hd.input.day}`)
  check('回到今天后「今」标记还在', (await allOf(hlPage, '.hl-td')).length === 1)
  check('回到今天后选中今日', hd.month.selectedKey === hd.month.todayKey,
    `${hd.month.selectedKey}/${hd.month.todayKey}`)

  step('黄历页 · 年 / 月弹层（T-2.2）')
  check('年 / 月两个按钮', (await allOf(hlPage, '.hl-ym-btn')).length === 2)
  await (await allOf(hlPage, '.hl-ym-btn'))[0].tap()
  await wait(hlPage, 800)
  hd = await dataOf(hlPage)
  check('点年份打开弹层', hd.showYear === true)
  check('弹层标题为「选择年份」', (await textOf(hlPage, '.hl-modal-title')) === '选择年份', await textOf(hlPage, '.hl-modal-title'))
  check('年份弹层 1900–2100 共 201 项',
    hd.yearOptions.length === 201 && (await allOf(hlPage, '.hl-year')).length === 201,
    `${hd.yearOptions.length}/${(await allOf(hlPage, '.hl-year')).length}`)
  check('打开时滚动锚点指向当前年', hd.yearAnchor === `y${hd.month.year}`, hd.yearAnchor)
  check('当前年在弹层里高亮唯一', (await allOf(hlPage, '.hl-year-on')).length === 1)
  check('高亮项就是当前年', (await textOf(hlPage, '.hl-year-on')) === String(hd.month.year),
    await textOf(hlPage, '.hl-year-on'))
  const prevYear = String(hd.month.year - 1)
  await tapByText(hlPage, '.hl-year', prevYear)
  await wait(hlPage, 900)
  hd = await dataOf(hlPage)
  check('选年后弹层关闭', hd.showYear === false)
  check('选年生效', String(hd.input.year) === prevYear, String(hd.input.year))
  check('换年后网格天数正确', hd.month.cells.length === daysInMonth(hd.input.year, hd.input.month),
    `${hd.month.cells.length}/${daysInMonth(hd.input.year, hd.input.month)}`)
  check('换年后农历文案跟着重算', hd.header.lunarText === hlLunar(hd.input), hd.header.lunarText)
  // 蒙层关闭
  await (await allOf(hlPage, '.hl-ym-btn'))[0].tap()
  await wait(hlPage, 700)
  check('再点年份可再次打开', (await dataOf(hlPage)).showYear === true)
  await (await firstOf(hlPage, '.hl-mask')).tap()
  await wait(hlPage, 600)
  check('点蒙层关闭年份弹层', (await dataOf(hlPage)).showYear === false)

  await (await allOf(hlPage, '.hl-ym-btn'))[1].tap()
  await wait(hlPage, 800)
  hd = await dataOf(hlPage)
  check('点月份打开弹层', hd.showMonth === true)
  check('弹层标题为「选择月份」', (await textOf(hlPage, '.hl-modal-title')) === '选择月份', await textOf(hlPage, '.hl-modal-title'))
  check('月份弹层 12 项', (await allOf(hlPage, '.hl-month')).length === 12)
  check('当前月高亮唯一', (await allOf(hlPage, '.hl-month-on')).length === 1)
  check('高亮项就是当前月', (await textOf(hlPage, '.hl-month-on')) === `${hd.month.month}月`,
    await textOf(hlPage, '.hl-month-on'))
  await tapByText(hlPage, '.hl-month', '2月')
  await wait(hlPage, 900)
  hd = await dataOf(hlPage)
  check('选月后弹层关闭', hd.showMonth === false)
  check('选月生效', hd.input.month === 2, String(hd.input.month))
  check('2 月网格天数正确', hd.month.cells.length === daysInMonth(hd.input.year, 2),
    `${hd.month.cells.length}/${daysInMonth(hd.input.year, 2)}`)
  check('日号超出目标月天数时收敛到月末',
    hd.input.day === Math.min(nowD.getDate(), daysInMonth(hd.input.year, 2)), String(hd.input.day))
  await (await firstOf(hlPage, '.hl-today')).tap()
  await wait(hlPage, 800)
  hd = await dataOf(hlPage)
  check('弹层试完能回到今天', hd.month.selectedKey === hd.month.todayKey, `${hd.month.selectedKey}/${hd.month.todayKey}`)

  /* ============== 站点配置与请求层（T-0.9 / T-0.3） ============== */
  // 这一段是**真打线上**：GET 公开接口（读）、带假 token 请求 /auth/me/（必然 401）。
  // 除了 401 那次刷新尝试，不会在服务端产生任何数据。所以它需要有网络。
  //
  // ⚠️ 域名白名单的边界（2026-09-24 实测）：模拟器的域名校验由 project.config.json 的
  // `urlCheck` 决定，本项目是 false（不校验）——**此时请求能通只能说明「运行时能打通线上域名」，
  // 不能证明后台「服务器域名」配好了**。而把它打开（urlCheck: true）在本机自动化会话里连
  // `https://servicewechat.com/` 都报 `url not in domain list`，即这个会话拿不到应用的域名列表，
  // 所以这项只能在**真机预览 / 登录着开发者工具的预览**里验证。详见文档。
  step('站点配置 · app 启动即拉取（T-0.9）')
  const cfgState = await mp.evaluate(() => new Promise((resolve) => {
    const app = getApp()
    const done = () => resolve({
      ready: app.globalData.siteConfigReady === true,
      config: app.globalData.siteConfig,
      keys: Object.keys(app.globalData.siteConfig || {})
    })
    if (app.globalData.siteConfigReady) done()
    else app.onSiteConfig(done)
  }))
  check('app 启动后站点配置就绪', cfgState.ready === true)
  check('站名来自接口而不是写死', cfgState.config.site_name === '命海拾遗', cfgState.config.site_name)
  check('只保留白名单字段（密钥不进内存）', cfgState.keys.indexOf('deepseek_api_key') < 0, cfgState.keys.join(','))
  check('页脚文案来自接口', cfgState.config.footer_text === 'Ming Hai Shi Yi · 命海拾遗', cfgState.config.footer_text)

  step('请求层 · 线上域名与分页（T-0.3）')
  const net = await mp.evaluate(() => {
    const req = require('utils/request.js')
    const cfg = require('utils/config.js')
    const panel = async () => {
      const out = {}
      // 1) 公开接口能通（urlCheck=false，所以这只证明运行时能打通线上，不代表白名单已配）
      const site = await req.get('/system-configs/', { auth: false })
      out.siteName = site.site_name
      // 2) 强制重拉配置：验证缓存落盘 + 白名单过滤在真实运行时也生效
      const loaded = await cfg.loadSiteConfig({ force: true })
      out.from = loaded.from
      const entry = wx.getStorageSync('mhsy:config:site') || {}
      out.cached = !!entry.data && !!entry.ts
      out.cachedHasSecret = JSON.stringify(entry).indexOf('sk-') >= 0
      // 3) 分页：第一页 + 用 next 游标拿第二页
      const page1 = await req.get('/destiny-cases/', { params: { page_size: 2 }, auth: false })
      out.count = page1.count
      out.page1 = (page1.results || []).map((r) => r.id)
      out.nextRaw = page1.next || ''
      out.next = req.normalizeNextUrl(page1.next)
      const page2 = await req.get(out.next, { auth: false })
      out.page2 = (page2.results || []).map((r) => r.id)
      const first = (page1.results || [])[0] || {}
      out.filled = typeof first.feedback === 'string'
      return out
    }
    return panel()
  })
  check('从运行时能打通线上接口', net.siteName === '命海拾遗', net.siteName)
  check('强制重拉走的是网络', net.from === 'network', net.from)
  check('配置写进了本地缓存', net.cached === true)
  check('缓存里不含密钥', net.cachedHasSecret === false)
  check('命例库总数 > 1000', net.count > 1000, String(net.count))
  check('第一页按 page_size 返回 2 条', net.page1.length === 2, net.page1.join(','))
  check('服务端 next 是 http 绝对地址（所以要改写）', net.nextRaw.indexOf('http://') === 0, net.nextRaw)
  check('normalizeNextUrl 改写为 https 正式域名', net.next.indexOf('https://www.minghaishiyi.cn/api/') === 0, net.next)
  check('第二页能取回且与第一页不重复',
    net.page2.length === 2 && net.page2.every((id) => net.page1.indexOf(id) < 0),
    `${net.page1.join(',')} vs ${net.page2.join(',')}`)
  check('命例记录带反馈文本字段', net.filled === true)

  step('请求层 · 401 自动刷新与并发去重（T-0.3）')
  const authFlow = await mp.evaluate(() => {
    const req = require('utils/request.js')
    const st = require('utils/storage.js')
    const calls = []
    // 数一数到底打了几次刷新接口（页面里没法直接观察，所以在 adapter 上挂计数器）
    req.client.setAdapter((opts) => {
      calls.push(opts.url)
      return req.wxAdapter(opts)
    })
    return (async () => {
      st.saveTokens({ access: 'e2e-bogus-access', refresh: 'e2e-bogus-refresh' })
      const one = () => req.get('/auth/me/').then(
        (data) => ({ ok: true, data }),
        (err) => ({ ok: false, kind: err.kind, status: err.status, message: err.message })
      )
      const results = await Promise.all([one(), one(), one()])
      const out = {
        results,
        refreshCalls: calls.filter((u) => u.indexOf('/auth/refresh/') >= 0).length,
        meCalls: calls.filter((u) => u.indexOf('/auth/me/') >= 0).length,
        access: st.getAccessToken(),
        refresh: st.getRefreshToken()
      }
      st.clearTokens()
      req.client.setAdapter(req.wxAdapter)
      return out
    })()
  })
  check('登录态失效时三个请求都被拒', authFlow.results.every((r) => r.ok === false), JSON.stringify(authFlow.results))
  check('错误类型是 auth（不是 http/network）', authFlow.results.every((r) => r.kind === 'auth'),
    authFlow.results.map((r) => r.kind).join(','))
  // 三个请求共用同一个刷新 Promise，所以中间那个拿到的是刷新接口的原始报错；
  // 第三个可能在「刷新已失败 + token 已清」之后才轮到，于是拿到本地的「登录已过期」。
  // 两者都是 auth，都是要的结论——这里要钉住的是「网络上的刷新只发生一次」。
  check('并发 3 个 401 只刷新一次', authFlow.refreshCalls === 1, `刷新 ${authFlow.refreshCalls} 次`)
  check('刷新失败后清空本地 token', authFlow.access === '' && authFlow.refresh === '',
    `access=${authFlow.access} refresh=${authFlow.refresh}`)


  const failed = results.filter((r) => !r.ok)
  console.log(`\n${'='.repeat(64)}`)
  console.log(`共 ${results.length} 项检查 · 通过 ${results.length - failed.length} · 失败 ${failed.length}`)
  if (failed.length) {
    console.log('失败项：')
    failed.forEach((f) => console.log(`  - ${f.name}${f.detail ? `  [${f.detail}]` : ''}`))
  }
  console.log(`耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
  return failed.length
}

let exitCode = 1
try {
  const failedCount = await run()
  exitCode = failedCount ? 1 : 0
} catch (e) {
  console.error('\n💥 运行出错：', e && e.message ? e.message : e)
  if (e && e.stack) console.error(e.stack.split('\n').slice(0, 6).join('\n'))
} finally {
  try {
    if (mp) mp.disconnect()
  } catch (e) {
    /* ignore */
  }
  process.exit(exitCode)
}
