/**
 * 页内图标（T-0.5）
 *
 * 背景：网页端用 lucide-react，小程序里既装不了 React，也不能用外部图标字体。
 * 这里把 lucide 的原始路径数据固化下来，运行时拼成 SVG data URI，通过 CSS
 * background-image 渲染 —— WXSS 的 background-image 支持 SVG data URI。
 *
 * 图标几何取自 lucide-react v0.454.0（与网页端同一版本）、同样的 strokeWidth=1.5，
 * 因此字形与网页端一致。生成过程见 git 历史中的提取命令。
 *
 * 为什么不用 <image src="data:image/svg+xml,...">：
 * 小程序 image 组件在部分机型（尤其 Android）不解码 SVG，
 * 而 CSS 背景走 WebView 渲染引擎，兼容性稳定。
 *
 * 用法（WXML 不能调用函数，所以样式串要在 JS 里先算好）：
 *   import { iconStyle } from '../../utils/icons.js'
 *   this.setData({ closeIcon: iconStyle('x', '#78716c', { size: 40 }) })
 *   <view class="icon" style="{{closeIcon}}"></view>
 *
 * 更省事的方式是用 components/icon 组件：
 *   <ui-icon name="x" color="#78716c" size="{{40}}" />
 */

/** 图标路径数据：name → [标签, 属性] 数组 */
export const ICONS = {
  "x": [["path",{"d":"M18 6 6 18"}],["path",{"d":"m6 6 12 12"}]],
  "chevron-down": [["path",{"d":"m6 9 6 6 6-6"}]],
  "chevron-up": [["path",{"d":"m18 15-6-6-6 6"}]],
  "chevron-right": [["path",{"d":"m9 18 6-6-6-6"}]],
  "chevron-left": [["path",{"d":"m15 18-6-6 6-6"}]],
  "arrow-left": [["path",{"d":"m12 19-7-7 7-7"}],["path",{"d":"M19 12H5"}]],
  "calendar": [["path",{"d":"M8 2v4"}],["path",{"d":"M16 2v4"}],["rect",{"width":"18","height":"18","x":"3","y":"4","rx":"2"}],["path",{"d":"M3 10h18"}]],
  "calendar-days": [["path",{"d":"M8 2v4"}],["path",{"d":"M16 2v4"}],["rect",{"width":"18","height":"18","x":"3","y":"4","rx":"2"}],["path",{"d":"M3 10h18"}],["path",{"d":"M8 14h.01"}],["path",{"d":"M12 14h.01"}],["path",{"d":"M16 14h.01"}],["path",{"d":"M8 18h.01"}],["path",{"d":"M12 18h.01"}],["path",{"d":"M16 18h.01"}]],
  "search": [["circle",{"cx":"11","cy":"11","r":"8"}],["path",{"d":"m21 21-4.3-4.3"}]],
  "map-pin": [["path",{"d":"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"}],["circle",{"cx":"12","cy":"10","r":"3"}]],
  "heart": [["path",{"d":"M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"}]],
  "loader": [["path",{"d":"M12 2v4"}],["path",{"d":"m16.2 7.8 2.9-2.9"}],["path",{"d":"M18 12h4"}],["path",{"d":"m16.2 16.2 2.9 2.9"}],["path",{"d":"M12 18v4"}],["path",{"d":"m4.9 19.1 2.9-2.9"}],["path",{"d":"M2 12h4"}],["path",{"d":"m4.9 4.9 2.9 2.9"}]],
  "trash-2": [["path",{"d":"M3 6h18"}],["path",{"d":"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"}],["path",{"d":"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"}],["line",{"x1":"10","x2":"10","y1":"11","y2":"17"}],["line",{"x1":"14","x2":"14","y1":"11","y2":"17"}]],
  "bookmark-plus": [["path",{"d":"m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"}],["line",{"x1":"12","x2":"12","y1":"7","y2":"13"}],["line",{"x1":"15","x2":"9","y1":"10","y2":"10"}]],
  "check": [["path",{"d":"M20 6 9 17l-5-5"}]],
  "share": [["path",{"d":"M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"}],["polyline",{"points":"16 6 12 2 8 6"}],["line",{"x1":"12","x2":"12","y1":"2","y2":"15"}]],
  "triangle-alert": [["path",{"d":"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"}],["path",{"d":"M12 9v4"}],["path",{"d":"M12 17h.01"}]],
  "user": [["path",{"d":"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"}],["circle",{"cx":"12","cy":"7","r":"4"}]],
  "sliders-horizontal": [["line",{"x1":"21","x2":"14","y1":"4","y2":"4"}],["line",{"x1":"10","x2":"3","y1":"4","y2":"4"}],["line",{"x1":"21","x2":"12","y1":"12","y2":"12"}],["line",{"x1":"8","x2":"3","y1":"12","y2":"12"}],["line",{"x1":"21","x2":"16","y1":"20","y2":"20"}],["line",{"x1":"12","x2":"3","y1":"20","y2":"20"}],["line",{"x1":"14","x2":"14","y1":"2","y2":"6"}],["line",{"x1":"8","x2":"8","y1":"10","y2":"14"}],["line",{"x1":"16","x2":"16","y1":"18","y2":"22"}]],
  "layout-grid": [["rect",{"width":"7","height":"7","x":"3","y":"3","rx":"1"}],["rect",{"width":"7","height":"7","x":"14","y":"3","rx":"1"}],["rect",{"width":"7","height":"7","x":"14","y":"14","rx":"1"}],["rect",{"width":"7","height":"7","x":"3","y":"14","rx":"1"}]],
  "library": [["path",{"d":"m16 6 4 14"}],["path",{"d":"M12 6v14"}],["path",{"d":"M8 8v12"}],["path",{"d":"M4 4v16"}]],
  "book-open": [["path",{"d":"M12 7v14"}],["path",{"d":"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"}]],
  "external-link": [["path",{"d":"M15 3h6v6"}],["path",{"d":"M10 14 21 3"}],["path",{"d":"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"}]],
  "filter": [["polygon",{"points":"22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"}]],
  "plus": [["path",{"d":"M5 12h14"}],["path",{"d":"M12 5v14"}]],
  "minus": [["path",{"d":"M5 12h14"}]],
  "clock": [["circle",{"cx":"12","cy":"12","r":"10"}],["polyline",{"points":"12 6 12 12 16 14"}]],
  "info": [["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"M12 16v-4"}],["path",{"d":"M12 8h.01"}]],
  "refresh-cw": [["path",{"d":"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"}],["path",{"d":"M21 3v5h-5"}],["path",{"d":"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"}],["path",{"d":"M8 16H3v5"}]],
  "star": [["path",{"d":"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"}]]
}

/** 默认色 stone-500 */
export const DEFAULT_COLOR = '#78716c'
/** 默认尺寸（rpx） */
export const DEFAULT_SIZE = 40
/** 默认线宽，与网页端 strokeWidth={1.5} 一致 */
export const DEFAULT_STROKE = 1.5

/** 判断图标是否存在，避免拼出空白图 */
export const hasIcon = (name) => Object.prototype.hasOwnProperty.call(ICONS, name)

const renderNode = ([tag, attrs]) => {
  const a = Object.keys(attrs).map((k) => k + '="' + attrs[k] + '"').join(' ')
  return '<' + tag + ' ' + a + '/>'
}

const buildSvg = (name, color, stroke) =>
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"' +
  ' stroke="' + color + '" stroke-width="' + stroke + '"' +
  ' stroke-linecap="round" stroke-linejoin="round">' +
  ICONS[name].map(renderNode).join('') +
  '</svg>'

/**
 * SVG 文字 → data URI 编码
 *
 * 两个坑：
 * 1) 小程序没有 btoa，所以走 encodeURIComponent 而不是 base64。
 * 2) encodeURIComponent 不编码 ! ' ( ) * —— 这些字符若出现在 SVG 里，
 *    会让 data URI 在 CSS 中提前结束。这里补编码，确保结果能安全放进 url()。
 *    编码后整个 URI 不含引号、空格、括号，所以 CSS 里可以不写引号：
 *      background-image:url(data:image/svg+xml,...)
 *    顺带避免了 style 属性内外层引号嵌套被截断的问题。
 */
const encodeSvg = (svg) =>
  encodeURIComponent(svg)
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/!/g, '%21')
    .replace(/\*/g, '%2A')

/**
 * 生成可直接放进 CSS 的 data URI
 */
export const iconUri = (name, color = DEFAULT_COLOR, opts = {}) => {
  if (!hasIcon(name)) {
    console.warn('[icons] 未知图标:', name)
    return ''
  }
  const stroke = opts.stroke === undefined ? DEFAULT_STROKE : opts.stroke
  return 'data:image/svg+xml,' + encodeSvg(buildSvg(name, color, stroke))
}

/**
 * 生成图标容器的完整 style 串
 * @param {string} name   图标名，见 ICONS
 * @param {string} color  描边色
 * @param {object} opts   { size: rpx, stroke: 线宽 }
 */
export const iconStyle = (name, color = DEFAULT_COLOR, opts = {}) => {
  const uri = iconUri(name, color, opts)
  if (!uri) return 'display:none'
  const size = opts.size === undefined ? DEFAULT_SIZE : opts.size
  return (
    'width:' + size + 'rpx;' +
    'height:' + size + 'rpx;' +
    'display:inline-block;' +
    'vertical-align:middle;' +
    'flex-shrink:0;' +
    'background-repeat:no-repeat;' +
    'background-position:center;' +
    'background-size:100% 100%;' +
    'background-image:url(' + uri + ');'
  )
}
