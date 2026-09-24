# 命海拾遗 · 微信小程序

`www.minghaishiyi.cn` 的微信小程序版本。定位是**传统文化与历法工具**：
四柱排盘、黄历、命例库、文章。

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
  paipan/                       四柱排盘（输入 + 命盘展示）
utils/
  bazi/                         排盘算法（由网页端转译而来，见下）
scripts/
  fix-npm-entry.cjs             绕过开发者工具的 npm 入口解析缺陷
  gen-bazi-golden.js            重新生成算法快照
tests/
  cases.js                      回归用例与预期四柱
  bazi.test.js                  算法回归测试
  bazi-golden.json              已校验的快照基准
docs/
  需求梳理与迁移方案.md          需求、方案、风险、实施记录
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
npm test             # 算法回归测试
npm run gen:golden   # 重新生成算法快照
```
