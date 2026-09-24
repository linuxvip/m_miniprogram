/**
 * 「我的」相关接口（T-5.9 / T-5.10 / T-5.11 / T-5.15）
 *
 * 与 `utils/casesApi.js` 的分工一样：这里只管「路径 + 参数 + 形状兜底」，
 * 鉴权 / 401 刷新 / 错误分类全在 `utils/request.js`。
 * 这些接口**都要登录**，所以不传 `auth: false`（默认就是要 token）。
 *
 * `defaultImpl` 可注入：单测里换掉就能断言「打到哪个路径、带什么 body」。
 */
import { get, post, put, del } from './request.js'

export const USER_PATHS = {
  me: '/auth/me/',
  config: '/user/config/',
  cases: '/user/cases/',
  favorites: '/user/favorites/',
  favoriteStatus: '/user/favorites/status/',
  favoriteToggle: '/user/favorites/toggle/'
}

/** 收藏目标类型（与后端 OBJECT_TYPE_MAP 对齐，T-3.6） */
export const FAVORITE_TYPES = {
  destinyCase: 'destiny_case',
  article: 'article',
  userCase: 'user_case'
}

let impl = { get, post, put, del }

/** 单测用：只覆盖给到的键，传 null 复位 */
export const setUserApiImpl = (overrides) => {
  impl = overrides ? { ...{ get, post, put, del }, ...overrides } : { get, post, put, del }
}

const asArray = (data) => (Array.isArray(data) ? data : [])

/** 用户资料（昵称 / 偏好） */
export const fetchProfile = () => impl.get(USER_PATHS.me)

/** 改昵称（T-5.15）：服务端是 partial update */
export const updateProfile = (payload) => impl.put(USER_PATHS.me, payload)

/** 云端排盘偏好（T-5.11）。服务端存的就是一个自由 JSON 对象 */
export const fetchUserConfig = () => impl.get(USER_PATHS.config)

export const saveUserConfig = (preferences) => impl.put(USER_PATHS.config, preferences)

/** 我的案例（T-5.9） */
export const fetchUserCases = () => impl.get(USER_PATHS.cases).then(asArray)

/**
 * 新建 / 更新我的案例（T-1.16）。
 * 服务端按「性别 + 四柱」去重：同一条再存一次是 200 + `created: false`（更新备注），
 * 所以按钮文案要看返回里的 `created`，不能只看请求成功。
 */
export const createUserCase = (payload) => impl.post(USER_PATHS.cases, payload)

export const deleteUserCase = (id) => impl.del(`${USER_PATHS.cases}${id}/`)

/** 收藏（T-5.10）/ 命例卡片收藏（T-3.6） */
export const fetchFavorites = (objectType) =>
  impl
    .get(USER_PATHS.favorites, objectType ? { params: { object_type: objectType } } : undefined)
    .then(asArray)

export const createFavorite = (objectType, objectId) =>
  impl.post(USER_PATHS.favorites, { object_type: objectType, object_id: objectId })

export const favoriteStatus = (objectType, objectId) =>
  impl.get(USER_PATHS.favoriteStatus, { params: { object_type: objectType, object_id: objectId } })

/** 已收藏就取消、没收藏就收藏，一步到位（服务端返回最终状态） */
export const toggleFavorite = (objectType, objectId) =>
  impl.post(USER_PATHS.favoriteToggle, { object_type: objectType, object_id: objectId })

export const deleteFavorite = (id) => impl.del(`${USER_PATHS.favorites}${id}/`)
