/**
 * 排盘偏好（T-1.8 本地部分）
 *
 * 字段与网页端 user/preferences.ts 的 DEFAULT_PREFERENCES 一一对应，
 * 这样 T-5.11 做云端同步时可以直接对拷，不需要再做映射。
 * 云端同步（登录后跨设备一致）依赖 T-0.3 请求层与 T-5.11，本文件先只做本地记忆。
 */
import { DEFAULT_AREA, lookupArea, formatArea } from './areaData.js'

const STORAGE_KEY = 'mhsy:paiPanPreferences'

/** 出生时区选项（对应网页端 TIMEZONE_OPTIONS；UTC-2 为上游遗漏，此处补齐） */
export const TIMEZONE_OPTIONS = [
  { v: '-12', l: 'UTC-12' },
  { v: '-11', l: 'UTC-11' },
  { v: '-10', l: 'UTC-10' },
  { v: '-9', l: 'UTC-9' },
  { v: '-8', l: 'UTC-8 (美西)' },
  { v: '-7', l: 'UTC-7' },
  { v: '-6', l: 'UTC-6 (美中)' },
  { v: '-5', l: 'UTC-5 (美东)' },
  { v: '-4', l: 'UTC-4' },
  { v: '-3', l: 'UTC-3' },
  { v: '-2', l: 'UTC-2' },
  { v: '-1', l: 'UTC-1' },
  { v: '0', l: 'UTC+0 (伦敦)' },
  { v: '1', l: 'UTC+1' },
  { v: '2', l: 'UTC+2' },
  { v: '3', l: 'UTC+3' },
  { v: '4', l: 'UTC+4' },
  { v: '5', l: 'UTC+5' },
  { v: '6', l: 'UTC+6' },
  { v: '7', l: 'UTC+7' },
  { v: '8', l: 'UTC+8 (北京, 默认)' },
  { v: '9', l: 'UTC+9 (东京)' },
  { v: '10', l: 'UTC+10 (悉尼)' },
  { v: '11', l: 'UTC+11' },
  { v: '12', l: 'UTC+12' },
  { v: '13', l: 'UTC+13' },
  { v: '14', l: 'UTC+14' }
]

export const TIMEZONE_LABELS = TIMEZONE_OPTIONS.map((o) => o.l)

/** 与网页端 DEFAULT_PREFERENCES 一致 */
export const DEFAULT_PREFERENCES = {
  gender: 'MALE',
  calendarType: 'SOLAR',
  timezoneOffset: '8',
  sect: 2,
  useTrueSolarTime: true,
  useManualLongitude: false,
  manualLongitude: '',
  locationName: `${DEFAULT_AREA.province} ${DEFAULT_AREA.city}`,
  region: [DEFAULT_AREA.province, DEFAULT_AREA.city, DEFAULT_AREA.district],
  longitude: String(DEFAULT_AREA.longitude),
  latitude: String(DEFAULT_AREA.latitude)
}

/** 读取本地偏好，缺字段用默认值补齐；坏数据直接忽略 */
export const loadPreferences = () => {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY)
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_PREFERENCES }
    return { ...DEFAULT_PREFERENCES, ...raw }
  } catch (e) {
    return { ...DEFAULT_PREFERENCES }
  }
}

export const savePreferences = (prefs) => {
  try {
    wx.setStorageSync(STORAGE_KEY, { ...DEFAULT_PREFERENCES, ...prefs })
  } catch (e) {
    /* 存储写满等情况静默失败，不影响排盘 */
  }
}

/** 时区索引 ↔ 值 */
export const timezoneIndex = (value) => {
  const idx = TIMEZONE_OPTIONS.findIndex((o) => o.v === String(value))
  return idx < 0 ? TIMEZONE_OPTIONS.findIndex((o) => o.v === '8') : idx
}

export { lookupArea, formatArea, DEFAULT_AREA }
