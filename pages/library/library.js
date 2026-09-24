/**
 * 命例库（T-3.1 / T-3.2 / T-3.3 / T-3.5 / T-3.7 / T-3.8）
 *
 * 对应网页端 `components/CaseLibrary.tsx`：筛选面板 → 列表（卡片内联展开）→「加载更多」。
 * 所有历法/参数翻译都在 `utils/cases.js`（纯函数、有单测），接口调用在 `utils/casesApi.js`，
 * 这里只管状态与交互。
 *
 * 三个自己加的保护，网页端没有：
 *  1. **请求序号**：筛选连着改时，先发出的请求可能后回来，用 `_seq` 丢掉过期响应，
 *     否则会出现「筛选条件已经是 A，列表却是 B 的结果」。
 *  2. **输入防抖 400ms**：关键词与四柱都是边打边筛，不防抖会把接口打爆。
 *  3. **加载更多去重**：连点两次不产生重复卡片（`appendCases` 按 id 去重，配合 `appending` 闸门）。
 */
import { fetchCases, fetchCaseSources } from '../../utils/casesApi.js'
import {
  ALL, GENDER_OPTIONS, PILLAR_KEYS, PILLAR_LABELS,
  defaultFilters, buildCaseQuery, pageFromNext, normalizeCase, filtersActive,
  appendCases, labelPickerRows, sourcePickerRow, pickerValueAt
} from '../../utils/cases.js'

const DEBOUNCE_MS = 400
/** 跨页面保存的 key：从命例进排盘再回来，筛选与列表不能丢（T-3.8） */
const STATE_KEY = 'libraryState'
/** 超过这个条数就只存筛选、不存列表（重新拉第一页），避免把内存和恢复逻辑都撑大 */
const MAX_PERSISTED_CASES = 60

const pillarRowsOf = (filters) =>
  PILLAR_KEYS.map((key) => ({ key, label: PILLAR_LABELS[key], value: (filters.pillars && filters.pillars[key]) || '' }))

const appOf = () => {
  try {
    return getApp()
  } catch (e) {
    return null
  }
}

const readState = () => {
  const app = appOf()
  return (app && app.globalData && app.globalData[STATE_KEY]) || null
}

const writeState = (state) => {
  const app = appOf()
  if (app && app.globalData) app.globalData[STATE_KEY] = state
}

Page({
  data: {
    genderOptions: GENDER_OPTIONS,
    filters: defaultFilters(),
    labelRows: labelPickerRows(defaultFilters()),
    pillarRows: pillarRowsOf(defaultFilters()),
    sourceRow: sourcePickerRow(defaultFilters(), []),
    cases: [],
    count: 0,
    loading: false,
    appending: false,
    error: '',
    nextPage: null,
    hasMore: false,
    isFiltered: false,
    skeletonRows: [1, 2, 3]
  },

  onLoad() {
    this._seq = 0
    this._sources = []

    const saved = readState()
    if (saved && saved.filters) {
      // 先恢复筛选，列表能恢复就恢复，不能就按同一套筛选重拉第一页
      const filters = saved.filters
      this.setData({
        filters,
        labelRows: labelPickerRows(filters),
        pillarRows: pillarRowsOf(filters),
        sourceRow: sourcePickerRow(filters, []),
        isFiltered: filtersActive(filters)
      })
      if (Array.isArray(saved.cases) && saved.cases.length) {
        this.setData({
          cases: saved.cases,
          count: saved.count || saved.cases.length,
          nextPage: saved.nextPage || null,
          hasMore: !!saved.hasMore
        })
      } else {
        this.load(1)
      }
    } else {
      this.load(1)
    }
    this.loadSources()
  },

  onUnload() {
    if (this._timer) clearTimeout(this._timer)
  },

  onPullDownRefresh() {
    this.loadSources()
    this.load(1).then(() => wx.stopPullDownRefresh())
  },

  /* ---------------- 数据 ---------------- */

  loadSources() {
    return fetchCaseSources()
      .then((sources) => {
        this._sources = sources
        this.setData({ sourceRow: sourcePickerRow(this.data.filters, sources) })
        return sources
      })
      .catch(() => {
        // 来源拉不到不影响列表，下拉里只有「全部来源」
        this._sources = []
        return []
      })
  },

  /** 拉第 page 页；append=true 表示「加载更多」 */
  load(page = 1, append = false) {
    const seq = ++this._seq
    const params = buildCaseQuery(this.data.filters, page)
    this.setData(append ? { appending: true, error: '' } : { loading: true, error: '' })

    return fetchCases(params)
      .then((payload) => {
        if (seq !== this._seq) return null // 已被更新的筛选覆盖，丢弃
        const fresh = ((payload && payload.results) || []).map(normalizeCase)
        const cases = append ? appendCases(this.data.cases, fresh) : fresh
        const nextPage = pageFromNext(payload && payload.next)
        this.setData({
          cases,
          count: (payload && payload.count) || 0,
          nextPage,
          hasMore: nextPage !== null,
          loading: false,
          appending: false,
          error: '',
          isFiltered: filtersActive(this.data.filters)
        })
        this.persist()
        return payload
      })
      .catch((err) => {
        if (seq !== this._seq) return null
        this.setData({
          loading: false,
          appending: false,
          error: (err && err.message) || '网络连接失败'
        })
        return null
      })
  },

  /** 保存筛选与已加载内容（T-3.8）。列表太长时只存筛选，回来重拉第一页 */
  persist() {
    const state = {
      filters: this.data.filters,
      count: this.data.count,
      nextPage: this.data.nextPage,
      hasMore: this.data.hasMore,
      cases: null
    }
    if (this.data.cases.length <= MAX_PERSISTED_CASES) state.cases = this.data.cases
    writeState(state)
  },

  /* ---------------- 筛选 ---------------- */

  applyFilters(filters) {
    // 手动改条件时，丢掉还在排队的那次防抖请求，免得重复拉同一页
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
    this.setData({
      filters,
      labelRows: labelPickerRows(filters),
      pillarRows: pillarRowsOf(filters),
      sourceRow: sourcePickerRow(filters, this._sources)
    })
    this.load(1)
  },

  onGenderTap(e) {
    const gender = e.currentTarget.dataset.gender
    if (gender === this.data.filters.gender) return
    this.applyFilters({ ...this.data.filters, gender })
  },

  onPickerChange(e) {
    const { kind, key } = e.currentTarget.dataset
    const values = kind === 'source'
      ? this.data.sourceRow.values
      : ((this.data.labelRows.find((row) => row.key === key) || {}).values)
    const value = pickerValueAt(values, e.detail.value)

    if (kind === 'source') {
      if (value === this.data.filters.source) return
      this.applyFilters({ ...this.data.filters, source: value })
      return
    }
    if (value === this.data.filters.labels[key]) return
    this.applyFilters({
      ...this.data.filters,
      labels: { ...this.data.filters.labels, [key]: value }
    })
  },

  onKeywordInput(e) {
    const keyword = e.detail.value
    this.setData({ filters: { ...this.data.filters, keyword } })
    this.debounce(() => this.load(1))
  },

  onPillarInput(e) {
    const key = e.currentTarget.dataset.key
    const value = e.detail.value
    const pillars = { ...this.data.filters.pillars, [key]: value }
    this.setData({
      filters: { ...this.data.filters, pillars },
      pillarRows: this.data.pillarRows.map((row) => (row.key === key ? { ...row, value } : row))
    })
    this.debounce(() => this.load(1))
  },

  onReset() {
    this.applyFilters(defaultFilters())
  },

  onRetry() {
    if (this.data.cases.length && this.data.nextPage) this.load(this.data.nextPage, true)
    else this.load(1)
  },

  onLoadMore() {
    if (!this.data.hasMore || this.data.appending || this.data.loading) return
    this.load(this.data.nextPage, true)
  },

  /* ---------------- 卡片 ---------------- */

  onToggleExpand(e) {
    const id = e.currentTarget.dataset.id
    const index = this.data.cases.findIndex((item) => item.id === id)
    if (index < 0) return
    this.setData({ [`cases[${index}].expanded`]: !this.data.cases[index].expanded })
    this.persist()
  },

  debounce(fn) {
    if (this._timer) clearTimeout(this._timer)
    this._timer = setTimeout(() => {
      this._timer = null
      fn()
    }, DEBOUNCE_MS)
  }
})
