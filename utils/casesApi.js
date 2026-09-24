/**
 * 命例库接口（T-3.1 / T-3.5）
 *
 * 只做「路径 + 参数」这一层，鉴权、重试、错误分类全交给 `utils/request.js`。
 * `getImpl` 可注入，单测里塞假实现就能断言「发到哪个路径、带了哪些参数」。
 *
 * 命例库是公开数据，一律 `auth: false`：没登录也要能看，而且不该因为
 * 本地存了个过期 token 就多走一次刷新。
 */
import { get } from './request.js'

export const CASES_PATH = '/destiny-cases/'
export const SOURCES_PATH = '/destiny-cases/sources/'

/**
 * 默认实现注入点。与 `utils/request.js` 的 `createClient({ adapter })` 同一思路：
 * 页面代码照常调 `fetchCases(params)`，单测里换成假实现就能整页跑（见 tests/library-page.test.js）。
 */
let defaultGet = get

/** 单测用：传 null 复位 */
export const setGetImpl = (impl) => {
  defaultGet = impl || get
}

/** 列表一页：参数由 `utils/cases.js` 的 buildCaseQuery 生成 */
export const fetchCases = (params, getImpl = defaultGet) =>
  getImpl(CASES_PATH, { params, auth: false })

/** 来源下拉：后端已按命例数量降序返回 */
export const fetchCaseSources = (getImpl = defaultGet) =>
  getImpl(SOURCES_PATH, { auth: false }).then((data) => {
    const list = data && data.sources
    return Array.isArray(list) ? list.filter(Boolean) : []
  })
