import { DEFAULT_CONFIG, loadSiteConfig } from './utils/config.js'

App({
  globalData: {
    appName: DEFAULT_CONFIG.site_name,
    launchTime: 0,
    /** 站点配置（T-0.9）：启动时由 loadSiteConfig 填充，失败则保持默认值 */
    siteConfig: { ...DEFAULT_CONFIG },
    siteConfigReady: false
  },

  onLaunch() {
    this.globalData.launchTime = Date.now()
    this._configWaiters = []
    // 不 await：配置只影响站名 / 页脚这类文案，不能挡住首屏
    this.siteConfigPromise = this._loadSiteConfig()
  },

  _loadSiteConfig() {
    return loadSiteConfig().then(({ config, from }) => {
      this.globalData.siteConfig = config
      this.globalData.siteConfigReady = true
      console.log(`[app] 站点配置就绪（来源：${from}）`)
      const waiters = this._configWaiters || []
      this._configWaiters = []
      waiters.forEach((cb) => {
        try {
          cb(config)
        } catch (e) {
          console.error('[app] 站点配置订阅回调出错', e)
        }
      })
      return config
    })
  },

  /**
   * 页面订阅站点配置：配置已就绪时立刻执行一次，否则等拉取完成。
   * 返回取消订阅函数（页面 onUnload 里调用）。
   */
  onSiteConfig(callback) {
    if (typeof callback !== 'function') return () => {}
    if (this.globalData.siteConfigReady) {
      callback(this.globalData.siteConfig)
      return () => {}
    }
    if (!this._configWaiters) this._configWaiters = []
    this._configWaiters.push(callback)
    return () => {
      this._configWaiters = (this._configWaiters || []).filter((fn) => fn !== callback)
    }
  },

  onShow() {
    console.log('[app] 进入前台')
  },

  onHide() {
    console.log('[app] 进入后台')
  },

  onError(err) {
    console.error('[app] 未捕获的错误', err)
  }
})
