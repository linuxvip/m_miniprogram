App({
  globalData: {
    appName: '命海拾遗',
    launchTime: 0
  },

  onLaunch() {
    this.globalData.launchTime = Date.now()
    console.log('[app] 启动完成')
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
