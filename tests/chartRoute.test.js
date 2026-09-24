/**
 * 排盘参数与 URL query 的互转测试（T-1.17 / T-1.18）
 *
 * 命盘页的分享卡片、命例库直达都靠这条 query 还原输入，所以「拼出来能不能被
 * 原样读回去」是硬要求。这里用 URLSearchParams 当裁判 —— 它跟微信解析 query 的
 * 规则一致，能抓出 `tz=+8` 被解成 `" 8"` 这类肉眼看不出的问题。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildChartQuery, parseChartQuery, chartShareTitle } from '../utils/chartRoute.js'

const SOLAR_INPUT = {
  type: 'SOLAR',
  year: 1991, month: 1, day: 1, hour: 2, minute: 55,
  gender: 'MALE',
  name: '测试',
  useTrueSolarTime: true,
  longitude: 116.42,
  timezoneOffset: '+8',
  sect: 2
}

test('公历输入经 query 往返后完全一致', () => {
  const query = buildChartQuery(SOLAR_INPUT)
  const parsed = parseChartQuery(Object.fromEntries(new URLSearchParams(query)))
  assert.deepEqual(parsed, {
    type: 'SOLAR',
    year: 1991, month: 1, day: 1, hour: 2, minute: 55,
    gender: 'MALE',
    name: '测试',
    useTrueSolarTime: true,
    longitude: 116.42,
    timezoneOffset: 8,
    sect: 2,
    direct: null
  })
})

test('时区偏移里的加号不被解成空格', () => {
  const params = new URLSearchParams(buildChartQuery({ ...SOLAR_INPUT, timezoneOffset: '+8' }))
  assert.equal(params.get('tz'), '+8')

  for (const tz of ['+14', '-11', '+5.5', '-3']) {
    const parsed = parseChartQuery(Object.fromEntries(new URLSearchParams(
      buildChartQuery({ ...SOLAR_INPUT, timezoneOffset: tz })
    )))
    assert.equal(parsed.timezoneOffset, Number(tz), tz)
  }
})

test('姓名里的特殊字符不影响解析（options 里是未解码的原始值）', () => {
  // 微信给页面的 options 不做解码（实测 options.n 是 %E6%B5%8B...），
  // 所以这里刻意用「原始值」喂进去，跟线上路径一致
  for (const name of ['张三', 'a+b', '100%', 'a&b=c', '空格 名字', '李雷 & 韩梅梅', '100%25']) {
    // 取 query 里 n= 后面的原始片段（不能用 URLSearchParams.get，它会先解一次码）
    const raw = buildChartQuery({ ...SOLAR_INPUT, name }).split('&')
      .find((kv) => kv.startsWith('n=')).slice(2)
    assert.equal(parseChartQuery({ n: raw }).name, name, name)
  }
})

test('被人手改坏的百分号不会让页面崩', () => {
  assert.equal(parseChartQuery({ n: '100%' }).name, '100%')
  assert.equal(parseChartQuery({ n: '%E4%B8' }).name, '%E4%B8')
})

test('四柱模式带八字参数往返一致', () => {
  const input = {
    ...SOLAR_INPUT,
    type: 'DIRECT',
    year: 1990, month: 1, day: 1, hour: 12, minute: 0,
    direct: {
      yearGan: '己', yearZhi: '巳', monthGan: '丙', monthZhi: '子',
      dayGan: '甲', dayZhi: '子', hourGan: '庚', hourZhi: '午'
    }
  }
  const parsed = parseChartQuery(Object.fromEntries(new URLSearchParams(buildChartQuery(input))))
  assert.equal(parsed.type, 'DIRECT')
  assert.deepEqual(parsed.direct, input.direct)
  assert.deepEqual([parsed.year, parsed.month, parsed.day, parsed.hour, parsed.minute], [1990, 1, 1, 12, 0])
})

test('缺参数时回落到安全默认值', () => {
  const parsed = parseChartQuery({})
  assert.equal(parsed.type, 'SOLAR')
  assert.equal(parsed.hour, 12)
  assert.equal(parsed.minute, 0)
  assert.equal(parsed.gender, 'MALE')
  assert.equal(parsed.name, '')
  assert.equal(parsed.useTrueSolarTime, true)
  assert.equal(parsed.longitude, undefined)
  assert.equal(parsed.timezoneOffset, 8)
  assert.equal(parsed.sect, 2)
  assert.equal(parsed.direct, null)
  // 换日规则只认 1，其余一律按子正（2）
  assert.equal(parseChartQuery({ s: '1' }).sect, 1)
  assert.equal(parseChartQuery({ s: '7' }).sect, 2)
  assert.equal(parseChartQuery({ tst: '0' }).useTrueSolarTime, false)
})

test('空值参数不写进 query（避免分享链接里出现空段）', () => {
  const query = buildChartQuery({ type: 'SOLAR', year: 1990, month: 1, day: 1, hour: 12, minute: 0, gender: 'FEMALE', name: '', useTrueSolarTime: false, longitude: undefined, timezoneOffset: '+8', sect: 2 })
  assert.ok(query.indexOf('n=') < 0)
  assert.ok(query.indexOf('lng=') < 0)
  assert.ok(query.indexOf('tst=0') >= 0)
})

test('分享标题带上姓名与四柱', () => {
  assert.equal(chartShareTitle({ year: 1991, month: 1, day: 1, hour: 2, minute: 55 }),
    '1991-01-01 02:55 · 四柱命盘')
  assert.equal(chartShareTitle({ name: '张三', year: 1991, month: 1, day: 1, hour: 2, minute: 55 }),
    '张三 · 1991-01-01 02:55 · 四柱命盘')
  assert.equal(chartShareTitle({
    name: '张三',
    direct: { yearGan: '甲', yearZhi: '子', monthGan: '丙', monthZhi: '寅', dayGan: '甲', dayZhi: '子', hourGan: '甲', hourZhi: '子' }
  }), '张三 · 甲子 丙寅 甲子 甲子 · 四柱命盘')
})
