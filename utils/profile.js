/**
 * 「我的」页面的纯逻辑（T-5.8 ~ T-5.15）
 *
 * 与 `utils/cases.js` 同样的分工：接口形状 → 页面要的视图模型、以及
 * 「点一条记录该跳到哪儿」这类判断，全部放在这里，单测覆盖；
 * 页面只负责渲染与交互。
 *
 * 命名对齐：后端用户案例 / 收藏的字段与命例库不同名（`year_ganzhi` vs `ganzhi`），
 * 这里统一成命盘页要的四柱数组，好复用 `utils/cases.js` 的 `chartQueryForCase`。
 */
import { chartQueryForCase } from './cases.js'
import { DEFAULT_PREFERENCES, TIMEZONE_OPTIONS, timezoneIndex } from './preferences.js'

/** 「我的」页面的四个子栏目（T-5.12，与网页端 ProfilePage 的 SubTab 一致） */
export const PROFILE_TABS = [
  { key: 'CASES', label: '我的案例', icon: 'layout-grid' },
  { key: 'FAVORITES', label: '我的收藏', icon: 'heart' },
  { key: 'SETTINGS', label: '我的设置', icon: 'sliders-horizontal' },
  { key: 'ABOUT', label: '作者·关于', icon: 'book-open' }
]

export const isProfileTab = (key) => PROFILE_TABS.some((tab) => tab.key === key)

/* ---------------- 通用 ---------------- */

/** 后端的 gender 是 1 / 0（1 = 乾造） */
export const genderOf = (value) => (Number(value) === 1 ? 'MALE' : 'FEMALE')

/** 卡片左上角的性别徽章 */
export const genderBadge = (value) =>
  Number(value) === 1
    ? { text: '乾', cls: 'pf-badge-male' }
    : { text: '坤', cls: 'pf-badge-female' }

const PILLAR_FIELDS = ['year_ganzhi', 'month_ganzhi', 'day_ganzhi', 'hour_ganzhi']

/** 后端记录 → 四柱数组（缺的那一柱给空串，不做 '?' 占位，避免和真干支混淆） */
export const pillarsOf = (raw) => PILLAR_FIELDS.map((key) => String((raw && raw[key]) || ''))

export const caseSummary = (raw) => pillarsOf(raw).filter(Boolean).join(' ')

/** ISO 时间 → 本地 YYYY-MM-DD；解析不了就退化成前 10 个字符 */
export const formatDay = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const text = (value) => (typeof value === 'string' ? value.trim() : '')

/* ---------------- 我的案例（T-5.9） ---------------- */

export const normalizeUserCase = (raw) => {
  const item = raw || {}
  const badge = genderBadge(item.gender)
  const name = text(item.subject_name)
  return {
    id: String(item.id === undefined || item.id === null ? '' : item.id),
    gender: genderOf(item.gender),
    badge: badge.text,
    badgeCls: badge.cls,
    name,
    displayName: name || '未命名案例',
    summary: caseSummary(item),
    notes: text(item.notes),
    hasNotes: !!text(item.notes),
    day: formatDay(item.created_time),
    raw: item
  }
}

export const normalizeUserCases = (list) => (Array.isArray(list) ? list.map(normalizeUserCase) : [])

/** 我的案例 → 命盘页 DIRECT 的 query（与命例库跳排盘走同一条路） */
export const userCaseChartQuery = (raw) =>
  chartQueryForCase({ gender: genderOf(raw && raw.gender), ganzhi: pillarsOf(raw) })

/* ---------------- 我的收藏（T-5.10） ---------------- */

export const FAVORITE_KINDS = {
  destiny_case: { label: '命例', cls: 'pf-fav-case' },
  article: { label: '文章', cls: 'pf-fav-article' },
  user_case: { label: '我的案例', cls: 'pf-fav-mine' }
}

const FAVORITE_TITLES = {
  article: (s) => text(s.title) || '未命名文章',
  user_case: (s) => text(s.subject_name) || '未命名案例',
  destiny_case: (s) => text(s.source) || '命例库'
}

export const favoriteTitle = (summary) => {
  const s = summary || {}
  const pick = FAVORITE_TITLES[s.kind]
  return pick ? pick(s) : '收藏'
}

/** 卡片第二行：命例 / 我的案例给四柱，文章给摘要 */
export const favoriteDetail = (summary) => {
  const s = summary || {}
  if (s.kind === 'article') return text(s.summary)
  return caseSummary(s)
}

/**
 * 收藏 → 命盘页 query。只有命例与我的案例能进命盘；
 * 文章在小程序里打不开外链（见任务清单 P1），返回空串由页面提示。
 */
export const favoriteChartQuery = (summary) => {
  const s = summary || {}
  if (s.kind !== 'destiny_case' && s.kind !== 'user_case') return ''
  return chartQueryForCase({ gender: genderOf(s.gender), ganzhi: pillarsOf(s) })
}

export const normalizeFavorite = (raw) => {
  const item = raw || {}
  const summary = item.object_summary || {}
  const kind = FAVORITE_KINDS[summary.kind] || { label: '收藏', cls: '' }
  return {
    id: String(item.id === undefined || item.id === null ? '' : item.id),
    kind: summary.kind || '',
    kindLabel: kind.label,
    kindCls: kind.cls,
    title: favoriteTitle(summary),
    detail: favoriteDetail(summary),
    hasDetail: !!favoriteDetail(summary),
    chartQuery: favoriteChartQuery(summary),
    day: formatDay(item.created_time),
    raw: item
  }
}

export const normalizeFavorites = (list) => (Array.isArray(list) ? list.map(normalizeFavorite) : [])

/** 从列表里去掉一条（取消收藏的乐观更新用），id 一律按字符串比 */
export const dropById = (list, id) => {
  const key = String(id === undefined || id === null ? '' : id)
  return (Array.isArray(list) ? list : []).filter((item) => String(item && item.id) !== key)
}

/* ---------------- 设置面板（T-5.11 / T-5.13） ---------------- */

/**
 * 云端偏好 → 本地偏好。云端是自由 JSON，可能缺字段 / 类型不对，
 * 所以逐字段校验后再覆盖，坏值一律退回本地（而不是默认）值。
 */
export const mergePreferences = (cloud, local) => {
  const base = { ...DEFAULT_PREFERENCES, ...(local || {}) }
  const raw = cloud && typeof cloud === 'object' ? cloud : {}

  if (raw.gender === 'MALE' || raw.gender === 'FEMALE') base.gender = raw.gender
  if (['SOLAR', 'LUNAR', 'DIRECT'].indexOf(raw.calendarType) >= 0) base.calendarType = raw.calendarType
  if (TIMEZONE_OPTIONS.some((o) => o.v === String(raw.timezoneOffset))) {
    base.timezoneOffset = String(raw.timezoneOffset)
  }
  if (Number(raw.sect) === 1 || Number(raw.sect) === 2) base.sect = Number(raw.sect)
  if (typeof raw.useTrueSolarTime === 'boolean') base.useTrueSolarTime = raw.useTrueSolarTime
  if (typeof raw.useManualLongitude === 'boolean') base.useManualLongitude = raw.useManualLongitude
  if (typeof raw.manualLongitude === 'string' || typeof raw.manualLongitude === 'number') {
    base.manualLongitude = String(raw.manualLongitude)
  }
  return base
}

/** 设置面板的一行：分段选择 / 开关 / 输入框 */
export const SETTING_ROWS = [
  {
    key: 'gender',
    title: '默认性别',
    desc: '排盘页默认选中的性别',
    kind: 'segment',
    options: [{ v: 'MALE', l: '乾造' }, { v: 'FEMALE', l: '坤造' }]
  },
  {
    key: 'calendarType',
    title: '默认排盘模式',
    desc: '打开排盘页默认使用的输入方式',
    kind: 'segment',
    options: [{ v: 'SOLAR', l: '公历' }, { v: 'LUNAR', l: '农历' }, { v: 'DIRECT', l: '四柱' }]
  },
  { key: 'useTrueSolarTime', title: '真太阳时', desc: '按出生地经度校正时刻', kind: 'toggle' },
  { key: 'sect', title: '晚子时换日', desc: '开启时 23:00 后算次日', kind: 'sect' },
  { key: 'useManualLongitude', title: '手动经度', desc: '开启后可手填经度，忽略地区', kind: 'toggle' },
  {
    key: 'manualLongitude',
    title: '经度数值',
    desc: '东经为正，例如 116.4',
    kind: 'input',
    placeholder: '例如 116.4',
    visibleWhen: 'useManualLongitude'
  },
  { key: 'timezoneOffset', title: '出生时区', desc: '出生地采用的时区', kind: 'timezone' }
]

/** 偏好 → 设置面板每一行的显示值（含「当前选项在第几个」这类下标） */
export const settingsRows = (prefs) => {
  const p = prefs || DEFAULT_PREFERENCES
  return SETTING_ROWS.map((row) => {
    const value = p[row.key]
    const out = { ...row, value: value === undefined || value === null ? '' : value }
    if (row.kind === 'segment') {
      const index = row.options.findIndex((o) => o.v === value)
      out.index = index < 0 ? 0 : index
      out.label = (row.options[out.index] || {}).l || ''
    }
    if (row.kind === 'sect') {
      out.on = Number(value) === 1
      out.label = out.on ? '开启' : '关闭'
    }
    if (row.kind === 'toggle') {
      out.on = !!value
      out.label = out.on ? '开启' : '关闭'
    }
    if (row.kind === 'timezone') {
      const label = (TIMEZONE_OPTIONS[timezoneIndex(value)] || {}).l || ''
      out.index = timezoneIndex(value)
      out.range = TIMEZONE_OPTIONS.map((o) => o.l)
      out.label = label
    }
    if (row.kind === 'input') {
      out.show = row.visibleWhen ? !!p[row.visibleWhen] : true
      out.label = out.value
    }
    return out
  })
}

/** 按 key 改一个偏好值，返回新的偏好对象（不改原对象） */
export const applySetting = (prefs, key, value) => {
  const next = { ...(prefs || DEFAULT_PREFERENCES) }
  if (key === 'sect') next.sect = value ? 1 : 2
  else if (key === 'useTrueSolarTime' || key === 'useManualLongitude') next[key] = !!value
  else if (key === 'timezoneOffset') next.timezoneOffset = String(value)
  else if (key === 'manualLongitude') next.manualLongitude = String(value === undefined || value === null ? '' : value)
  else if (key === 'gender' || key === 'calendarType') next[key] = value
  else next[key] = value
  return next
}

/** 云端只该收到偏好字段，别把经纬度字符串这类本地推断一起推上去（体积与隐私） */
export const CLOUD_PREFERENCE_KEYS = [
  'gender', 'calendarType', 'timezoneOffset', 'sect',
  'useTrueSolarTime', 'useManualLongitude', 'manualLongitude'
]

export const toCloudPreferences = (prefs) => {
  const p = prefs || DEFAULT_PREFERENCES
  return CLOUD_PREFERENCE_KEYS.reduce((acc, key) => {
    if (p[key] !== undefined) acc[key] = p[key]
    return acc
  }, {})
}
