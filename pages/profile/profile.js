/**
 * 我的（T-5.8 ~ T-5.15）
 *
 * 四个子栏目：我的案例 / 我的收藏 / 我的设置 / 作者·关于。
 * 登录态全部来自 `utils/auth.js`（订阅制，页面不自己读 storage），
 * 接口在 `utils/userApi.js`，字段翻译与设置面板的显示值在 `utils/profile.js`。
 *
 * 三处刻意的设计：
 *  1. **未登录不空白**：四个栏目都渲染，内容位置放「登录后可用」的引导卡，
 *     而不是整页换成登录页——用户至少能看到这个页面有哪些能力；
 *  2. **设置改一下发一次**：本地立刻生效（排盘页读本地偏好），云端用 600ms 防抖推送；
 *     推送失败不回滚本地，只提示，避免「改了半天白改」；
 *  3. **收藏里的文章打不开**：小程序不能开外链（P1 已暂缓），点了给明确提示，
 *     不做无声失败。
 */
import { onAuthChange, login, logout, restore, setUser, currentUser } from '../../utils/auth.js'
import {
  fetchUserCases, deleteUserCase, fetchFavorites, deleteFavorite,
  fetchUserConfig, saveUserConfig, updateProfile
} from '../../utils/userApi.js'
import {
  PROFILE_TABS, isProfileTab, normalizeUserCases, normalizeFavorites,
  userCaseChartQuery, settingsRows, applySetting, mergePreferences, toCloudPreferences, dropById
} from '../../utils/profile.js'
import { loadPreferences, savePreferences, TIMEZONE_OPTIONS } from '../../utils/preferences.js'
import { DEFAULT_CONFIG, assetUrl } from '../../utils/config.js'
import { profileShare, timelineOf } from '../../utils/share.js'

const SYNC_DEBOUNCE_MS = 600

const IDLE = 'idle'
const LOADING = 'loading'
const READY = 'ready'
const ERROR = 'error'

const errorText = (err, fallback) => (err && err.message) || fallback

Page({
  data: {
    tabs: PROFILE_TABS,
    tab: 'CASES',

    loggedIn: false,
    busy: false,
    user: null,
    name: '未登录',
    initial: '拾',
    joined: '',

    cases: [],
    casesState: IDLE,
    casesError: '',

    favorites: [],
    favState: IDLE,
    favError: '',

    settings: [],
    prefs: {},
    syncText: '',

    siteName: DEFAULT_CONFIG.site_name,
    footerText: DEFAULT_CONFIG.footer_text,
    avatarUrl: '',
    avatarFailed: false,
    qrUrl: '',
    wxQrUrl: ''
  },

  onLoad() {
    this._offAuth = onAuthChange((user) => this.applyUser(user))
    this.applySite(getApp())
    // 启动时若本地有 token，静默恢复一次；失败不影响页面（未登录就是未登录）
    if (!currentUser()) restore({}).catch(() => null)
  },

  onUnload() {
    if (this._offAuth) this._offAuth()
    if (this._offSite) this._offSite()
    if (this._syncTimer) clearTimeout(this._syncTimer)
  },

  onPullDownRefresh() {
    const done = () => wx.stopPullDownRefresh()
    if (!this.data.loggedIn) {
      done()
      return
    }
    Promise.all([this.loadCases(), this.loadFavorites(), this.syncPreferences()]).then(done, done)
  },

  /* ---------------- 站点配置（T-0.9） ---------------- */

  applySite(app) {
    if (app && typeof app.onSiteConfig === 'function') {
      this._offSite = app.onSiteConfig((config) => this.applyConfig(config))
      return
    }
    this.applyConfig(DEFAULT_CONFIG)
  },

  applyConfig(config) {
    const c = config || DEFAULT_CONFIG
    this.setData({
      siteName: c.site_name || DEFAULT_CONFIG.site_name,
      footerText: c.footer_text || DEFAULT_CONFIG.footer_text,
      avatarUrl: assetUrl(c.avatar_url),
      qrUrl: assetUrl(c.qrcode_url),
      wxQrUrl: assetUrl(c.wx_qrcode_url)
    })
  },

  /* ---------------- 登录态 ---------------- */

  applyUser(user) {
    const loggedIn = !!user
    this.setData({
      loggedIn,
      user: user || null,
      name: user ? user.nickname || user.username || '微信用户' : '未登录',
      initial: user && (user.nickname || user.username) ? (user.nickname || user.username).charAt(0) : '拾',
      joined: user && user.created_time ? String(user.created_time).slice(0, 10) : ''
    })
    if (loggedIn) {
      this.loadCases()
      this.loadFavorites()
      this.syncPreferences()
    } else {
      this.setData({
        cases: [], casesState: IDLE, casesError: '',
        favorites: [], favState: IDLE, favError: '',
        settings: settingsRows(loadPreferences()), syncText: ''
      })
    }
  },

  onLogin() {
    if (this.data.busy) return
    this.setData({ busy: true })
    login()
      .then(() => {
        this.setData({ busy: false })
        wx.showToast({ title: '登录成功', icon: 'success' })
      })
      .catch((err) => {
        this.setData({ busy: false })
        wx.showToast({ title: errorText(err, '登录失败，请重试'), icon: 'none' })
      })
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后「我的案例」「收藏」与云端设置将不再显示，本地排盘偏好会保留。',
      confirmText: '退出',
      confirmColor: '#b91c1c',
      success: (res) => {
        if (!res.confirm) return
        logout().then(() => wx.showToast({ title: '已退出', icon: 'none' }))
      }
    })
  },

  /* ---------------- 我的案例（T-5.9） ---------------- */

  loadCases() {
    this.setData({ casesState: LOADING, casesError: '' })
    return fetchUserCases()
      .then((list) => {
        this.setData({ cases: normalizeUserCases(list), casesState: READY })
      })
      .catch((err) => {
        this.setData({ casesState: ERROR, casesError: errorText(err, '加载失败，请下拉重试') })
      })
  },

  onOpenCase(e) {
    const id = String(e.currentTarget.dataset.id)
    const item = this.data.cases.filter((c) => c.id === id)[0]
    if (!item) return
    wx.navigateTo({ url: `/pages/chart/chart?${userCaseChartQuery(item.raw)}` })
  },

  onDeleteCase(e) {
    const id = String(e.currentTarget.dataset.id)
    const item = this.data.cases.filter((c) => c.id === id)[0]
    if (!item) return
    wx.showModal({
      title: '删除案例',
      content: `确定删除「${item.displayName}」吗？删除后无法恢复。`,
      confirmText: '删除',
      confirmColor: '#b91c1c',
      success: (res) => {
        if (!res.confirm) return
        deleteUserCase(id)
          .then(() => {
            this.setData({ cases: this.data.cases.filter((c) => c.id !== id) })
            wx.showToast({ title: '已删除', icon: 'none' })
          })
          .catch((err) => wx.showToast({ title: errorText(err, '删除失败'), icon: 'none' }))
      }
    })
  },

  /* ---------------- 我的收藏（T-5.10） ---------------- */

  loadFavorites() {
    this.setData({ favState: LOADING, favError: '' })
    return fetchFavorites()
      .then((list) => {
        this.setData({ favorites: normalizeFavorites(list), favState: READY })
      })
      .catch((err) => {
        this.setData({ favState: ERROR, favError: errorText(err, '加载失败，请下拉重试') })
      })
  },

  onOpenFavorite(e) {
    const id = String(e.currentTarget.dataset.id)
    const item = this.data.favorites.filter((f) => f.id === id)[0]
    if (!item) return
    if (!item.chartQuery) {
      wx.showToast({ title: '文章在小程序里暂不支持打开', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/chart/chart?${item.chartQuery}` })
  },

  /**
   * 取消收藏：乐观更新 + 失败回滚（与网页端 ProfilePage 的 handleUnfavorite 一致）。
   * 先移掉再发请求 —— 取消收藏是「用户已经决定了」的动作，让按钮等一个来回没有必要；
   * 失败时把原来的列表整份放回去，比逐条回滚更不容易漏。
   */
  onDeleteFavorite(e) {
    const id = String(e.currentTarget.dataset.id)
    const item = this.data.favorites.filter((f) => f.id === id)[0]
    if (!item) return
    const prev = this.data.favorites
    this.setData({ favorites: dropById(prev, id) })
    wx.showToast({ title: '已取消收藏', icon: 'none' })
    deleteFavorite(id).catch((err) => {
      this.setData({ favorites: prev })
      wx.showToast({ title: errorText(err, '操作失败'), icon: 'none' })
    })
  },

  /* ---------------- 我的设置（T-5.11 / T-5.13） ---------------- */

  /** 登录后：云端的偏好覆盖本地（云端是自由 JSON，坏值由 mergePreferences 挡掉） */
  syncPreferences() {
    return fetchUserConfig()
      .then((cloud) => {
        const merged = mergePreferences(cloud, loadPreferences())
        savePreferences(merged)
        this.setData({ prefs: merged, settings: settingsRows(merged), syncText: '已同步' })
        return merged
      })
      .catch(() => {
        const local = loadPreferences()
        this.setData({ prefs: local, settings: settingsRows(local), syncText: '离线（未同步）' })
        return local
      })
  },

  /** 改一项：本地立刻生效 + 云端防抖推送 */
  updatePref(patch) {
    const next = { ...this.data.prefs, ...patch }
    savePreferences(next)
    this.setData({ prefs: next, settings: settingsRows(next), syncText: '同步中…' })
    if (this._syncTimer) clearTimeout(this._syncTimer)
    this._syncTimer = setTimeout(() => {
      this._syncTimer = null
      if (!this.data.loggedIn) {
        this.setData({ syncText: '未登录（只存在本机）' })
        return
      }
      saveUserConfig(toCloudPreferences(next))
        .then(() => this.setData({ syncText: '已同步' }))
        .catch(() => this.setData({ syncText: '同步失败（已存在本机）' }))
    }, SYNC_DEBOUNCE_MS)
  },

  /** 分段选择 / 开关：data-key + data-value，取值一律交给 utils/profile.js 翻译 */
  onSettingTap(e) {
    const { key, value } = e.currentTarget.dataset
    if (!key) return
    this.updatePref(applySetting(this.data.prefs, key, value))
  },

  onSettingToggle(e) {
    const key = e.currentTarget.dataset.key
    const row = this.data.settings.filter((r) => r.key === key)[0]
    if (!row) return
    this.updatePref(applySetting(this.data.prefs, key, !row.on))
  },

  onLongitudeInput(e) {
    this.updatePref(applySetting(this.data.prefs, 'manualLongitude', e.detail.value))
  },

  onTimezoneChange(e) {
    const value = (TIMEZONE_OPTIONS[Number(e.detail.value)] || {}).v
    if (value === undefined) return
    this.updatePref(applySetting(this.data.prefs, 'timezoneOffset', value))
  },

  /* ---------------- 昵称（T-5.15） ---------------- */

  onEditNickname() {
    const self = this
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '请输入昵称（最多 24 字）',
      success(res) {
        if (!res.confirm) return
        const nickname = String(res.content || '').trim()
        if (!nickname) {
          wx.showToast({ title: '昵称不能为空', icon: 'none' })
          return
        }
        if (nickname.length > 24) {
          wx.showToast({ title: '昵称最多 24 个字', icon: 'none' })
          return
        }
        updateProfile({ nickname })
          .then((user) => {
            setUser(user)
            wx.showToast({ title: '已更新', icon: 'success' })
          })
          .catch((err) => wx.showToast({ title: errorText(err, '修改失败'), icon: 'none' }))
      }
    })
  },

  /* ---------------- 其它 ---------------- */

  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (!isProfileTab(tab) || tab === this.data.tab) return
    this.setData({ tab })
  },

  onAvatarError() {
    this.setData({ avatarFailed: true })
  },

  /* ---------------- 分享（T-6.9） ---------------- */

  /** 「我的」页没有可分享的内容，分享的是这个工具本身（标题用站点名兜底） */
  onShareAppMessage() {
    return profileShare()
  },

  onShareTimeline() {
    return timelineOf(profileShare())
  }
})
