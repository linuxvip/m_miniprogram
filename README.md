# 命海拾遗 · 微信小程序

`www.minghaishiyi.cn` 的微信小程序版本。定位是**传统文化与历法工具**：
四柱排盘、黄历、命例库（文章暂缓）。

当前进度：**功能开发已全部完成**（5 个页面 + 微信登录 + 分享 + 客服 / 公众号入口），
有单测 + 界面 e2e 兜底。剩下的是**代码之外的事**：服务器配 `WX_APPSECRET` 并 `migrate`
（见「微信登录」一节）、微信后台的域名 / 客服 / 隐私指引 / 类目配置、真机验收 ——
逐项清单见 [`docs/上线检查清单.md`](docs/上线检查清单.md)，进度见 [`docs/工作任务清单.md`](docs/工作任务清单.md)。

## 与网页端的关系

| | 仓库 | 说明 |
| --- | --- | --- |
| 网页前端 | `linuxvip/minghaishiyi_frontend` | React 19 + TypeScript + Vite + Tailwind |
| 后端 | `linuxvip/minghaishiyi_backend` | Django 4.2 + DRF + SimpleJWT |
| 小程序 | 本仓库 | 原生小程序，复用后端接口 |

小程序与网页端**共用同一套后端与同一批用户数据**，两边看到的收藏、案例是一致的。

完整的现状分析、迁移方案、风险清单见 [`docs/需求梳理与迁移方案.md`](docs/需求梳理与迁移方案.md)。

## 跑起来

```bash
npm install     # 会执行 postinstall，为 npm 包补齐入口（原因见下）
```

然后用微信开发者工具打开本目录，点击菜单 **工具 → 构建 npm**，即可编译预览。

小程序 AppID：`wx990ba3cc14bef05d`

### 为什么需要 postinstall

微信开发者工具的「构建 npm」在解析包入口时，会把不以 `.js` / `.json` 结尾的 `main`
字段强行补一个 `.js` 后缀。`lunar-typescript` 的入口是 `dist/index.cjs`，被解析成
`dist/index.cjs.js` 后文件不存在，**整个包会被静默跳过**，最终只报 `__NO_NODE_MODULES__`，
完全指不到真正原因。

`scripts/fix-npm-entry.cjs` 在安装后按工具期望的命名补一份入口来绕过。
若该库将来把入口改成 `.js` 结尾，脚本会自动跳过。

## 目录结构

```
app.js / app.json / app.wxss    全局入口、页面注册、全局样式与设计变量
pages/
  paipan/                       排盘输入页（姓名 / 性别 / 模式 / 日期 / 地点 / 高级设置 / 即时局）
  chart/                        命盘页（基本盘 / 专业细盘 / 大运流年 / 神煞 / 五行 / 命例反馈 / 分享）
  huangli/                      黄历（四柱信息栏 / 月历网格 / 时辰地支条 / 年·月弹层，零接口）
  library/                      命例库（筛选面板 / 卡片列表 / 内联展开 / 加载更多 / 三态）
  profile/                      我的（登录 / 我的案例 / 我的收藏 / 我的设置 / 作者·关于）
components/
  datetime-sheet/               日期时间弹层（公历 / 农历 / 四柱 三态）
  ui-icon/                      lucide 图标（SVG data URI，全局注册）
utils/
  bazi/                         排盘算法（由网页端转译而来，见下）
  calendar.js                   历法纯函数（农历换算 / 五虎遁 / 五鼠遁）
  almanac.js                    黄历纯逻辑（月历网格 / 月份导航 / 时辰条 / 四柱信息栏）
  datetimeSheet.js              弹层状态机（纯函数，单测覆盖）
  request.js                    请求层（baseURL / token 注入 / 401 刷新 / 错误分类）
  storage.js                    本地存储封装（统一 key 前缀，无 wx 环境降级内存）
  config.js                     站点配置（1 小时缓存 / 白名单字段 / 失败降级）
  cases.js                      命例库纯逻辑（标签字典与解析 / 查询参数 / 分页游标 / 视图模型）
  casesApi.js                   命例库接口封装（列表 + 来源，公开接口不带 token）
  auth.js                       登录态（wx.login 静默登录 / 并发去重 / 启动恢复 / 退出）
  userApi.js                    「我的」相关接口封装（资料 / 偏好 / 我的案例 / 收藏）
  profile.js                    「我的」页纯逻辑（字段映射 / 设置行翻译 / 收藏分类与跳转）
  account.js                    保存案例与收藏的纯逻辑（请求体拼装 / 收藏 id 查表）
  share.js                      分享卡片纯逻辑（五个页面的标题与路径 / 朋友圈 query / 黄历带日期）
  areaData.js                   省→市 + 经纬度（由网页端 areaData.ts 生成）
  chartRoute.js                 排盘参数 ↔ URL query（分享用）
  preferences.js                排盘偏好本地记忆
assets/tabbar/                  tabBar 图标（PNG，由脚本生成）
scripts/
  fix-npm-entry.cjs             绕过开发者工具的 npm 入口解析缺陷
  gen-bazi-golden.js            重新生成算法快照
  gen-tabbar-icons.cjs          生成 tabBar 图标
  gen-area-data.cjs             从网页端生成 areaData.js
  e2e/smoke.js                  界面 e2e（真点界面，176 项断言）
  e2e/shots.js                  界面截图留档
tests/
  bazi.test.js                  算法回归测试（快照比对）
  almanac.test.js               黄历测试（网格 / 导航 / 时辰条 / 与排盘算法等价）
  datetimeSheet.test.js         弹层状态机测试
  chartRoute.test.js            分享参数编解码测试
  request.test.js               请求层测试（401 刷新 / 并发去重 / 错误分类）
  config.test.js                站点配置测试（白名单字段 / 缓存过期 / 降级）
  cases.test.js                 命例库纯逻辑测试（标签解析与去重 / 查询参数 / 分页 / 去重追加）
  library-page.test.js          命例库页面测试（假接口把整页跑起来：请求序号 / 防抖 / 重试 / 状态保持）
  chart-page.test.js            命盘页测试（命例反馈的认领 / 分享路径 / 保存案例）
  auth.test.js                  登录态测试（并发登录去重 / 401 重放 / 退出 / 恢复失败不清 token）
  profile.test.js               「我的」页纯逻辑测试（字段映射 / 脏数据 / 设置行 / 收藏分类）
  account.test.js               保存案例与收藏的纯逻辑测试（四柱完整性 / 请求体 / 收藏查表）
  share.test.js                 分享卡片测试（标题 / 路径 / 朋友圈 query / 黄历分享参数 / 合规词守卫）
  huangli-page.test.js          黄历页测试（分享链接落到同一天 / 翻月后分享 / 坏参数不白屏）
docs/
  需求梳理与迁移方案.md          需求、方案、风险、实施记录
  工作任务清单.md                逐项任务、进度与变更记录
  上线检查清单.md                提审前后台配置、类目与简介、审核备注模板、隐私指引、真机检查项
```

## 排盘算法

`utils/bazi/` 下的文件**不是手写的**，是从网页前端仓库机械转译得到的
（`types.ts`、`constants.ts`、`utils/baziHelper.ts`、`utils/baziCalc.ts`），
避免几百行逻辑在手抄过程中出错。

转译后需要把 `../types`、`../constants` 改成 `./types.js`、`./constants.js`
（目录扁平化 + Node ESM 要求显式扩展名）。

算法结果曾与网页端实现做过**整对象深比对**，15 组用例字节级一致，并在真实小程序运行时验证过。

### 改算法后怎么验证

```bash
npm test                                    # 与快照比对，捕捉回归
node scripts/gen-bazi-golden.js             # 确认改动符合预期时，更新快照
```

更新快照等于把当前行为固化为基准，**只在确认改动正确时使用**，并在 commit message 里说明原因。

## 微信登录

登录走 **微信静默登录**，用户不需要填任何表单：

```
点需要登录的动作（收藏 / 保存案例 / 进「我的」）
  → utils/auth.js 的 ensureLogin()
  → wx.login() 拿一次性 code
  → POST https://www.minghaishiyi.cn/api/auth/wechat/  （code → 服务端换 openid → 建号）
  → 拿到与网页端同一套 JWT，之后所有请求自动带 Authorization
```

几个刻意的设计：

- **冷启动不自动建号**：`app.js` 只 `restore()`（本地有 token 才换一次资料）。无条件静默登录
  会给每个路过的访客都建一个空账号，除了脏数据没有收益。
- **同一时刻只发一次 `wx.login`**：code 是一次性的，连点两次收藏不能拿同一个 code 发两次请求。
- **`refresh` 与 `access` 一起存**：服务端开了 `ROTATE_REFRESH_TOKENS`，漏存新的 refresh
  第二次刷新必定失败（网页端就有这个 bug，小程序端按正确方式存）。
- 用户数据与网页端**共用同一张表**，两边的收藏与「我的案例」是同一批数据。

### 服务端要配什么

| 项 | 位置 | 说明 |
| --- | --- | --- |
| `WX_APPID` | 后端 `.env` | `wx990ba3cc14bef05d` |
| `WX_APPSECRET` | 后端 `.env` | **不要进仓库**。缺失时 `/auth/wechat/` 返回 503，其余功能不受影响 |
| 数据库迁移 | 部署时 | `python manage.py migrate`（新增 `userapi/migrations/0002_*`，给 `UserProfile` 加 `openid` / `unionid`） |

## 一些约束

- 主包上限 2 MB。`lunar-typescript` 压缩后约 325 KB（gzip 98 KB），占约 16%，
  因此 `project.config.json` 里排除了 `node_modules` 与 `*.map`
  （该库的 source map 单独就有 515 KB）。
- 小程序不支持 Google Fonts。网页端用的 `Ma Shan Zheng`、`ZCOOL XiaoWei`、`Noto Serif SC`
  需要改用 `wx.loadFontFace` 加载自有域名下的字体，或退回系统字体。
- 小程序里二维码**不能长按识别**，网页端的「长按关注公众号」在迁移时需换成
  `official-account` 组件或客服消息。

## 开发命令

```bash
npm install          # 安装依赖并补齐 npm 入口
npm test             # 算法 / 历法 / 黄历 / 弹层 / 分享参数 / 请求层 / 站点配置 / 命例库 /
                     # 登录态 / 我的页 / 保存案例与收藏 / 分享（182 项，约 1.5 秒）
npm run gen:golden   # 重新生成算法快照

# 界面 e2e 与截图：要先给开发者工具开自动化通道
/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
  --project "$PWD" --auto-port 9530
npm run e2e          -- --ws=ws://127.0.0.1:9530   # 176 项断言，约 60 秒（末两组要联网）
npm run e2e:shots    -- --ws=ws://127.0.0.1:9530   # 14 张截图 → artifacts/e2e/shots/
```

> 开发者工具的自动化有两个硬限制：**看不到自定义组件内部的节点**（所以弹层的滚轮、
> 快填框只能靠 `tests/datetimeSheet.test.js` 覆盖），以及**一个会话只能扛三四次页面重载**
> （所以截图脚本每张图都要重启一次工具）。细节见方案文档 8.2 节。
