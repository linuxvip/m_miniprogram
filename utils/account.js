/**
 * 账号相关的纯逻辑（T-1.16 保存案例 / T-3.6 收藏）
 *
 * 与 `utils/profile.js` 的分工：那里管「我的」页面的渲染模型，这里管两件
 * 跨页面都要做的事 —— 把命盘压成保存请求体、把收藏列表压成「哪些已收藏」的查表。
 * 都是纯函数，单测覆盖，页面只管调用与提示。
 *
 * 两个和后端对不齐的坑，都在这里收口：
 *  1. **四柱必须是 4 个 2 字干支**：后端 `UserCaseSerializer` 逐柱校验天干地支，
 *     缺一柱或算不出（1900-2100 之外无解）会直接 400。所以保存前先自查完整性，
 *     不完整就在本地拦下，别把注定失败的请求打出去。
 *  2. **gender 是 1 / 0**（1 = 乾造），不是 'MALE' / 'FEMALE'：命盘页用的是后者。
 */

/** 四柱在命盘对象里的字段名 */
export const PILLAR_KEYS = ['year', 'month', 'day', 'hour']

const PILLAR_FIELD = {
  year: 'year_ganzhi',
  month: 'month_ganzhi',
  day: 'day_ganzhi',
  hour: 'hour_ganzhi'
}

const PILLAR_LABEL = { year: '年柱', month: '月柱', day: '日柱', hour: '时柱' }

const text = (value) => (typeof value === 'string' ? value : '')

/** 命盘的一柱 → '甲子'；算不出（柱为空）时给空串 */
export const ganzhiOf = (chart, key) => {
  const pillar = chart && chart[key]
  if (!pillar || !pillar.gan || !pillar.zhi) return ''
  return `${pillar.gan}${pillar.zhi}`
}

/** 缺哪几柱（空数组 = 可以保存），用来决定要不要发这次请求 */
export const missingPillars = (chart) => PILLAR_KEYS.filter((key) => !ganzhiOf(chart, key))

export const canSaveCase = (chart) => missingPillars(chart).length === 0

/** 缺柱的中文提示，形如「时柱」，给用户看的 */
export const missingPillarsLabel = (chart) =>
  missingPillars(chart).map((key) => PILLAR_LABEL[key]).join('、')

/**
 * 排盘输入 → `input_snapshot`。
 *
 * 只存排盘本身用得上的字段：`cid` / 命例原文这类东西不进快照 ——
 * 快照会上云，没必要把别人的命例原文也带进自己的案例里。
 */
export const snapshotOf = (input) => {
  const src = input || {}
  const out = {
    type: src.type || 'SOLAR',
    gender: src.gender === 'FEMALE' ? 'FEMALE' : 'MALE',
    year: src.year,
    month: src.month,
    day: src.day,
    hour: src.hour,
    minute: src.minute,
    useTrueSolarTime: !!src.useTrueSolarTime,
    timezoneOffset: src.timezoneOffset,
    sect: src.sect
  }
  if (src.name) out.name = src.name
  if (src.longitude !== undefined && src.longitude !== null && src.longitude !== '') {
    out.longitude = src.longitude
  }
  if (src.direct) out.direct = { ...src.direct }
  return out
}

/**
 * 命盘 + 输入 → `POST /user/cases/` 的请求体。
 * `notes` 传命例原文（从命例库跳进来时），自行排盘时为空串。
 */
export const saveCasePayload = (chart, input, notes) => {
  const payload = {
    gender: (input && input.gender) === 'FEMALE' ? 0 : 1,
    subject_name: text(input && input.name).trim(),
    notes: text(notes),
    input_snapshot: snapshotOf(input)
  }
  PILLAR_KEYS.forEach((key) => {
    payload[PILLAR_FIELD[key]] = ganzhiOf(chart, key)
  })
  return payload
}

/* ---------------- 收藏（T-3.6） ---------------- */

/** 收藏目标类型，与后端 `OBJECT_TYPE_MAP` 的 key 一一对应 */
export const OBJECT_TYPES = {
  destinyCase: 'destiny_case',
  article: 'article',
  userCase: 'user_case'
}

/** 一次收藏操作的结果文案（取服务端返回的 favorited，不看本地猜测） */
export const favoriteToast = (favorited) => (favorited ? '已收藏' : '已取消收藏')

/** 服务端的收藏 id 可能是数字，统一成字符串，免得 `1` 与 `'1'` 对不上 */
export const favoriteKey = (value) => String(value === undefined || value === null ? '' : value)

/**
 * 收藏列表 → `{ '<object_id>': true }` 查表。
 * 用普通对象而不是 Set：对象可以直接进 `setData` / globalData，Set 不行。
 */
export const favoriteIdsOf = (list) => {
  const out = {}
  ;(Array.isArray(list) ? list : []).forEach((item) => {
    const id = favoriteKey(item && item.object_id)
    if (id) out[id] = true
  })
  return out
}

export const isFavorited = (ids, id) => !!(ids && ids[favoriteKey(id)])

/** 本地更新一个收藏标记，返回新对象（不改原对象，setData 才好判断） */
export const withFavorite = (ids, id, favorited) => {
  const next = { ...(ids || {}) }
  const key = favoriteKey(id)
  if (!key) return next
  if (favorited) next[key] = true
  else delete next[key]
  return next
}

/** 给命例卡片刷上 `favorited`，其余字段原样保留 */
export const markFavorites = (cases, ids) =>
  (Array.isArray(cases) ? cases : []).map((item) => ({
    ...item,
    favorited: isFavorited(ids, item && item.id)
  }))
