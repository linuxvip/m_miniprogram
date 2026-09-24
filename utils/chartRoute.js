/**
 * 排盘参数 ↔ URL query（T-1.17 / T-1.18）
 *
 * 为什么用 URL 传参而不是全局变量：分享出去的卡片要能在对方点开时直接复原命盘，
 * 路径里必须自带全部输入。参数都是数字 / 短枚举，长度可控。
 *
 * 参数表：
 *   t  类型 SOLAR | LUNAR | DIRECT
 *   y m d h mi  年月日时分（DIRECT 模式下 h/mi 表示匹配到的公历时间，可缺省）
 *   g  性别 MALE | FEMALE
 *   n  姓名（可选，encodeURIComponent）
 *   tst 真太阳时 1|0      lng 经度     tz 时区偏移    s 换日规则 1|2
 *   DIRECT 追加：yg yz mg mz dg dz hg hz（四柱八字）
 *
 * 值一律经 encodeURIComponent 再拼：时区偏移长得像 `+8`，而 `+` 在 query 里
 * 会被解析成空格（`tz=+8` 读出来是 `" 8"`），姓名里也可能出现 `+ & = %`。
 * 这条由 tests/chartRoute.test.js 用 URLSearchParams 反向校验兜住。
 */
const pad2 = (n) => String(n).padStart(2, '0')

export const buildChartQuery = (input) => {
  const parts = []
  const push = (k, v) => {
    if (v === undefined || v === null || v === '') return
    parts.push(`${k}=${encodeURIComponent(v)}`)
  }
  push('t', input.type)
  push('y', input.year)
  push('m', input.month)
  push('d', input.day)
  push('h', input.hour)
  push('mi', input.minute)
  push('g', input.gender)
  push('n', input.name || '')
  push('tst', input.useTrueSolarTime ? 1 : 0)
  push('lng', input.longitude)
  push('tz', input.timezoneOffset)
  push('s', input.sect)
  if (input.direct) {
    const d = input.direct
    push('yg', d.yearGan)
    push('yz', d.yearZhi)
    push('mg', d.monthGan)
    push('mz', d.monthZhi)
    push('dg', d.dayGan)
    push('dz', d.dayZhi)
    push('hg', d.hourGan)
    push('hz', d.hourZhi)
  }
  return parts.join('&')
}

const num = (v, fallback) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/**
 * 页面的 options 拿到的是**未解码**的原始值（实测 devtools：`options.n` 是
 * `%E6%B5%8B...`），所以要在这里解一次。用 try 兜底是因为分享链接可能被人手改过，
 * 裸 `%` 会让 decodeURIComponent 抛 URIError —— 那种情况宁可原样显示，也不该白屏。
 */
const decode = (v) => {
  try {
    return decodeURIComponent(v)
  } catch (e) {
    return v
  }
}

export const parseChartQuery = (query) => {
  const q = query || {}
  const type = q.t === 'LUNAR' || q.t === 'DIRECT' ? q.t : 'SOLAR'
  const direct = q.yg
    ? {
        yearGan: q.yg, yearZhi: q.yz || '',
        monthGan: q.mg, monthZhi: q.mz || '',
        dayGan: q.dg, dayZhi: q.dz || '',
        hourGan: q.hg, hourZhi: q.hz || ''
      }
    : null
  return {
    type,
    year: num(q.y, 1990),
    month: num(q.m, 1),
    day: num(q.d, 1),
    hour: num(q.h, 12),
    minute: num(q.mi, 0),
    gender: q.g === 'FEMALE' ? 'FEMALE' : 'MALE',
    name: q.n ? decode(q.n) : '',
    useTrueSolarTime: q.tst !== '0',
    longitude: q.lng === undefined || q.lng === '' ? undefined : num(q.lng, 120),
    timezoneOffset: num(q.tz, 8),
    sect: num(q.s, 2) === 1 ? 1 : 2,
    direct
  }
}

/** 命盘页分享用的标题 */
export const chartShareTitle = (input) => {
  const name = input.name ? `${input.name} · ` : ''
  if (input.direct) {
    const d = input.direct
    return `${name}${d.yearGan}${d.yearZhi} ${d.monthGan}${d.monthZhi} ${d.dayGan}${d.dayZhi} ${d.hourGan}${d.hourZhi} · 四柱命盘`
  }
  return `${name}${input.year}-${pad2(input.month)}-${pad2(input.day)} ${pad2(input.hour)}:${pad2(input.minute)} · 四柱命盘`
}
