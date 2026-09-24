# 命海拾遗 · 微信小程序

`www.minghaishiyi.cn` 的微信小程序版本。定位是**传统文化与历法工具**：
四柱排盘、黄历、命例库（文章暂缓）。

当前进度：**排盘主链路已完工**（输入页 / 三态日期弹层 / 命盘页），并有单测 + 界面 e2e 兜底；
黄历、命例库、微信登录尚未开始。逐项进度见 [`docs/工作任务清单.md`](docs/工作任务清单.md)。

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
  chart/                        命盘页（基本盘 / 专业细盘 / 大运流年 / 神煞 / 五行 / 分享）
  huangli/ library/ profile/    黄历 / 命例库 / 我的（占位页）
components/
  datetime-sheet/               日期时间弹层（公历 / 农历 / 四柱 三态）
  ui-icon/                      lucide 图标（SVG data URI，全局注册）
utils/
  bazi/                         排盘算法（由网页端转译而来，见下）
  calendar.js                   历法纯函数（农历换算 / 五虎遁 / 五鼠遁）
  datetimeSheet.js              弹层状态机（纯函数，单测覆盖）
  areaData.js                   省→市 + 经纬度（由网页端 areaData.ts 生成）
  chartRoute.js                 排盘参数 ↔ URL query（分享用）
  preferences.js                排盘偏好本地记忆
assets/tabbar/                  tabBar 图标（PNG，由脚本生成）
scripts/
  fix-npm-entry.cjs             绕过开发者工具的 npm 入口解析缺陷
  gen-bazi-golden.js            重新生成算法快照
  gen-tabbar-icons.cjs          生成 tabBar 图标
  gen-area-data.cjs             从网页端生成 areaData.js
  e2e/smoke.js                  界面 e2e（真点界面，84 项断言）
  e2e/shots.js                  界面截图留档
tests/
  bazi.test.js                  算法回归测试（快照比对）
  datetimeSheet.test.js         弹层状态机测试
  chartRoute.test.js            分享参数编解码测试
docs/
  需求梳理与迁移方案.md          需求、方案、风险、实施记录
  工作任务清单.md                逐项任务、进度与变更记录
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
npm test             # 算法 + 弹层状态机 + 分享参数单测（31 项，0.2 秒）
npm run gen:golden   # 重新生成算法快照

# 界面 e2e 与截图：要先给开发者工具开自动化通道
/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
  --project "$PWD" --auto-port 9530
npm run e2e          -- --ws=ws://127.0.0.1:9530   # 84 项断言，约 45 秒
npm run e2e:shots    -- --ws=ws://127.0.0.1:9530   # 12 张截图 → artifacts/e2e/shots/
```

> 开发者工具的自动化有两个硬限制：**看不到自定义组件内部的节点**（所以弹层的滚轮、
> 快填框只能靠 `tests/datetimeSheet.test.js` 覆盖），以及**一个会话只能扛三四次页面重载**
> （所以截图脚本每张图都要重启一次工具）。细节见方案文档 8.2 节。
