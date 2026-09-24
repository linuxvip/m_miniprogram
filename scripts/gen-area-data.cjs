/**
 * 生成 utils/areaData.js（T-1.6 地区选择器的经度数据源）
 *
 * 数据来源：网页端 minghaishiyi_frontend/utils/areaData.ts（省/市/区三级 + 高德经纬度）。
 * 小程序里三级全量 143KB 太重，而真太阳时只用到经度（0.1° ≈ 24 秒，市级精度足够），
 * 因此这里降为「省 → 市」两级，并压缩为短键 + 两位小数，产物约 20KB。
 *
 * 用法：node scripts/gen-area-data.cjs [源文件路径]
 */
const fs = require('fs')
const path = require('path')

const SRC = process.argv[2] || path.resolve(__dirname, '../../minghaishiyi_frontend/utils/areaData.ts')
const OUT = path.resolve(__dirname, '../utils/areaData.js')

const round2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : undefined)

const parseValue = (raw) => {
  const text = raw.trim().replace(/,$/, '')
  const jsonish = text.replace(/([{,]\s*)(n|l|lat|c)(\s*:)/g, '$1"$2"$3')
  return JSON.parse(jsonish)
}

const main = () => {
  const src = fs.readFileSync(SRC, 'utf8')
  const body = src.slice(src.indexOf('export const CHINA_AREA_DATA'), src.lastIndexOf(']') + 1)
  const lines = body.split('\n').filter((l) => l.trim().startsWith('{ n:'))
  const provinces = lines.map(parseValue)

  const compact = provinces.map((p) => {
    const out = { n: p.n }
    if (p.l !== undefined) out.l = round2(p.l)
    out.c = (p.c || []).map((c) => {
      const city = { n: c.n }
      const lng = c.l !== undefined ? c.l : p.l
      const lat = c.lat !== undefined ? c.lat : p.lat
      if (lng !== undefined) city.l = round2(lng)
      if (lat !== undefined) city.lat = round2(lat)
      return city
    })
    return out
  })

  const cities = compact.reduce((n, p) => n + p.c.length, 0)
  const js = `/**
 * 中国省 / 市经纬度简表（T-1.6）
 *
 * 由 scripts/gen-area-data.cjs 从网页端 utils/areaData.ts 生成，请勿手改。
 * 只保留到市级：真太阳时按经度推算，市级精度（0.1° ≈ 24 秒）已足够。
 * 统计：${compact.length} 省级 / ${cities} 市级。
 *
 * 键名：n = 名称，l = 经度，lat = 纬度，c = 下级
 */
export const CHINA_AREA = ${JSON.stringify(compact)}

/** 默认出生地：北京市 东城区（与网页端 DEFAULT_PREFERENCES 一致） */
export const DEFAULT_AREA = { province: '北京市', city: '北京市', district: '东城区', longitude: 116.42, latitude: 39.93 }

const findProvince = (name) => CHINA_AREA.find((p) => p.n === name)

/** 按「省 / 市 / 区」取经度：区不参与（数据只到市级），退回市级 → 省级 → 默认 */
export const lookupArea = (provinceName, cityName) => {
  const province = findProvince(provinceName)
  const city = province ? province.c.find((c) => c.n === cityName) || province.c[0] : null
  const longitude = (city && city.l) || (province && province.l)
  const latitude = (city && city.lat) || (province && province.lat)
  if (longitude === undefined) {
    return { province: DEFAULT_AREA.province, city: DEFAULT_AREA.city, longitude: DEFAULT_AREA.longitude, latitude: DEFAULT_AREA.latitude }
  }
  return {
    province: province.n,
    city: city ? city.n : province.c[0].n,
    longitude,
    latitude: latitude === undefined ? DEFAULT_AREA.latitude : latitude
  }
}
`
  fs.writeFileSync(OUT, js, 'utf8')
  console.log(`已生成 ${OUT}\n省级 ${compact.length} · 市级 ${cities} · ${(js.length / 1024).toFixed(1)} KB`)
}

main()
