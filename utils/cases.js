/**
 * 命例库的纯逻辑（T-3.1 / T-3.2 / T-3.3 / T-3.9）
 *
 * 与 `utils/almanac.js` 同样的分层：这里只做「接口数据 ↔ 界面数据」的加工与
 * 「筛选条件 ↔ 查询参数」的翻译，不碰 setData、不碰 wx API，所以能整条在 node 里断言。
 *
 * 三件容易搞错的事，都在这里集中处理：
 *
 *  1. **分页不能直接跟着 `next` 走**。后端返回的是 `http://` 绝对地址（小程序只认 https），
 *     而且地址里带着当时那批筛选条件——用户改了筛选却用旧 next 就会串数据。
 *     所以只用它「判断还有没有下一页」并取出 page 号，URL 一律用我们自己的筛选条件重拼。
 *  2. **label 是一个 JSON 字符串**，卡片徽章要按固定顺序从里面挑字段，
 *     不是 JSON 的老数据还要能按逗号兜底（网页端 `parseLabelTags` 的等价实现）。
 *  3. **筛选有两种语义**：五个枚举字段是 JSON 精确匹配（`chusheng=农村普通家庭`），
 *     关键词走 `label` 的 icontains（所以「职业细分」那 539 种取值用关键词而不是下拉）。
 */
import { elementOfChar, elementTextClass } from './theme.js'

export const ALL = 'ALL'
export const PAGE_SIZE = 12
export const EMPTY_FEEDBACK = '暂无反馈内容'

/** 卡片徽章的字段顺序，与网页端 `CaseLibrary.LABEL_KEYS` 一致 */
export const LABEL_KEYS = ['出身', '学历', '职业类别', '职业细分', '婚姻状态', '财富层次']

/**
 * 五个可下拉的枚举字段（T-3.9）。
 * 取值来自 2026-09-24 抽样 1200 条实测——后端是 `JSON_EXTRACT(...) = 值` 的**精确匹配**，
 * 所以选项必须与数据逐字一致，多一个空格都筛不出来。
 *
 * `职业细分` 故意不在这里：它有 539 种取值，走关键词输入（`label` icontains）。
 */
export const LABEL_FIELDS = [
  {
    key: 'chusheng',
    label: '出身',
    options: ['农村普通家庭', '城市小康家庭', '城市普通家庭', '富裕家庭', '单亲家庭']
  },
  {
    key: 'xueli',
    label: '学历',
    options: ['本科', '初中', '大专', '中专', '研究生', '高中', '博士', '技校']
  },
  {
    key: 'zhiye_leibie',
    label: '职业类别',
    options: ['自由职业', '经商', '私企白领', '医教金融', '公职', '国企']
  },
  {
    key: 'hunyin_zhuangtai',
    label: '婚姻状态',
    options: ['已婚(初婚)', '离异', '未婚', '二婚', '三婚及以上', '丧偶']
  },
  {
    key: 'caifu_cengci',
    label: '财富层次',
    options: ['小康', '温饱', '小富', '负债', '富裕', '富贵']
  }
]

export const PILLAR_KEYS = ['year', 'month', 'day', 'hour']
export const PILLAR_LABELS = { year: '年柱', month: '月柱', day: '日柱', hour: '时柱' }
export const KEYWORD_KEY = 'keyword'

/** 性别选项：网页端是「全部 / 乾造 / 坤造」三段 */
export const GENDER_OPTIONS = [
  { value: ALL, label: '全部' },
  { value: 'MALE', label: '乾造' },
  { value: 'FEMALE', label: '坤造' }
]

export const defaultFilters = () => ({
  gender: ALL,
  source: ALL,
  keyword: '',
  pillars: { year: '', month: '', day: '', hour: '' },
  labels: LABEL_FIELDS.reduce((acc, field) => {
    acc[field.key] = ALL
    return acc
  }, {})
})

/** 筛选条件里的「全部」用 ALL 表示，非法值一律当全部 */
const pickValue = (value, options) => (options.indexOf(value) >= 0 ? value : ALL)

/* ---------------- 接口 ↔ 界面 ---------------- */

/** 网页端 mapGenderToApi：乾造 = 1、坤造 = 0、全部 = 不带参数 */
export const genderForApi = (gender) =>
  gender === 'MALE' ? '1' : gender === 'FEMALE' ? '0' : ''

/** 网页端 mapApiToGender：容错「男 / 乾」这类历史写法 */
export const genderFromApi = (value) => {
  const raw = String(value)
  return raw === '1' || raw === '男' || raw === '乾' ? 'MALE' : 'FEMALE'
}

export const genderLabel = (gender) => (gender === 'MALE' ? '乾' : '坤')

/** 徽章去重：两个字段取值相同时只留一个（WXML 用 wx:key="*this"，重复值会产生告警） */
const uniqueTags = (tags) => tags.filter((tag, index) => tags.indexOf(tag) === index)

const hasText = (value) => value !== undefined && value !== null && value !== '' && value !== 0

const tryParseJson = (raw) => {
  try {
    return { ok: true, value: JSON.parse(raw) }
  } catch (e) {
    return { ok: false, value: null }
  }
}

/**
 * label JSON → 徽章数组。
 * 正常数据是 `{"出身":"农村普通家庭", ...}`；历史脏数据可能是逗号分隔的纯文本，
 * 所以这里对「对象 / 数组 / 字符串 / 非 JSON」四种情况分别兜底（网页端只兜了最后一种）。
 */
export const parseLabelTags = (label) => {
  if (label === undefined || label === null || label === '') return []
  const raw = String(label).trim()
  if (!raw) return []

  const parsed = tryParseJson(raw)
  if (parsed.ok) {
    const value = parsed.value
    if (Array.isArray(value)) return uniqueTags(value.filter(hasText).map((v) => String(v).trim()).filter(Boolean))
    if (value && typeof value === 'object') {
      return uniqueTags(LABEL_KEYS.map((key) => value[key]).filter(hasText).map((v) => String(v)))
    }
    if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  }
  return uniqueTags(raw.split(/[，,]/).map((s) => s.trim()).filter(Boolean))
}

/** 一个干支（如「甲子」）→ 界面需要的一组信息，含五行文字色 */
export const splitGanzhi = (ganzhi) => {
  const raw = String(ganzhi || '')
  const gan = raw.charAt(0) || '?'
  const zhi = raw.charAt(1) || '?'
  return {
    gan,
    zhi,
    ganCls: elementTextClass(elementOfChar(gan, true)),
    zhiCls: elementTextClass(elementOfChar(zhi, false))
  }
}

/** 列表项 → 卡片视图模型 */
export const normalizeCase = (raw) => {
  const item = raw || {}
  const gender = genderFromApi(item.gender)
  const feedback = typeof item.feedback === 'string' && item.feedback.trim() ? item.feedback : EMPTY_FEEDBACK
  const ganzhi = [item.year_ganzhi, item.month_ganzhi, item.day_ganzhi, item.hour_ganzhi].map((v) => String(v || ''))
  const tags = parseLabelTags(item.label)
  return {
    id: String(item.id === undefined || item.id === null ? '' : item.id),
    source: item.source || '未知来源',
    gender,
    genderLabel: genderLabel(gender),
    // 网页端：乾造 = sky 系、坤造 = rose 系
    genderCls: gender === 'MALE' ? 'lib-gender-male' : 'lib-gender-female',
    ganzhi,
    pillars: ganzhi.map((value, index) => ({ ...splitGanzhi(value), key: PILLAR_KEYS[index] })),
    tags,
    // 网页端只铺前 6 个徽章，多出来的折成「+N」
    shownTags: tags.slice(0, 6),
    moreTags: Math.max(0, tags.length - 6),
    feedback,
    expanded: false
  }
}

/* ---------------- 筛选 ↔ 查询参数 ---------------- */

export const buildCaseQuery = (filters, page = 1) => {
  const f = filters || defaultFilters()
  const params = { page_size: PAGE_SIZE }

  const gender = genderForApi(f.gender)
  if (gender) params.gender = gender
  if (f.source && f.source !== ALL) params.source = f.source

  const keyword = (f.keyword || '').trim()
  if (keyword) params.label = keyword

  PILLAR_KEYS.forEach((key) => {
    const value = (f.pillars && f.pillars[key]) || ''
    if (value.trim()) params[`${key}_ganzhi`] = value.trim()
  })

  LABEL_FIELDS.forEach((field) => {
    const value = f.labels && f.labels[field.key]
    if (value && value !== ALL) params[field.key] = value
  })

  const pageNo = Number(page) || 1
  if (pageNo > 1) params.page = pageNo
  return params
}

/** 从接口的 next 里取出下一页页码（拿不到就返回 null） */
export const pageFromNext = (nextUrl) => {
  const raw = String(nextUrl === undefined || nextUrl === null ? '' : nextUrl)
  const matched = raw.match(/[?&]page=(\d+)/)
  if (!matched) return null
  const page = Number(matched[1])
  return page > 1 ? page : null
}

export const filtersActive = (filters) => {
  const f = filters || defaultFilters()
  if (f.gender !== ALL) return true
  if (f.source && f.source !== ALL) return true
  if ((f.keyword || '').trim()) return true
  if (PILLAR_KEYS.some((key) => ((f.pillars && f.pillars[key]) || '').trim())) return true
  return LABEL_FIELDS.some((field) => f.labels && f.labels[field.key] && f.labels[field.key] !== ALL)
}

/** 去重：同一个「加载更多」被连点两次时，后到的响应不该把前一次的结果再叠一遍 */
export const appendCases = (prev, fresh) => {
  const seen = {}
  const out = []
  ;(prev || []).concat(fresh || []).forEach((item) => {
    if (!item || seen[item.id]) return
    seen[item.id] = true
    out.push(item)
  })
  return out
}

/* ---------------- picker 视图模型 ---------------- */

/** 某个枚举字段 → `<picker>` 需要的 range / index / 当前值 */
export const labelPickerRow = (field, filters) => {
  const current = (filters && filters.labels && filters.labels[field.key]) || ALL
  const values = [ALL].concat(field.options)
  const index = Math.max(0, values.indexOf(pickValue(current, field.options)))
  return {
    key: field.key,
    label: field.label,
    values,
    range: ['全部'].concat(field.options),
    index,
    value: values[index],
    active: values[index] !== ALL
  }
}

export const labelPickerRows = (filters) => LABEL_FIELDS.map((field) => labelPickerRow(field, filters))

/** 来源下拉（后端已按数量降序返回） */
export const sourcePickerRow = (filters, sources) => {
  const list = (sources || []).filter(Boolean)
  const current = (filters && filters.source) || ALL
  const values = [ALL].concat(list)
  const index = Math.max(0, values.indexOf(list.indexOf(current) >= 0 ? current : ALL))
  return {
    values,
    range: ['全部来源'].concat(list),
    index,
    value: values[index],
    active: values[index] !== ALL
  }
}

export const pickerValueAt = (values, index) => {
  const list = values || []
  const i = Number(index)
  return i >= 0 && i < list.length ? list[i] : ALL
}
