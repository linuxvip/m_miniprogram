import { iconStyle, DEFAULT_COLOR, DEFAULT_SIZE, DEFAULT_STROKE } from '../../utils/icons.js'

/**
 * 页内图标组件（T-0.5）
 *
 * 网页端的 lucide-react 在小程序不可用，这里用 utils/icons.js 生成的
 * SVG data URI 通过 CSS background-image 渲染。
 *
 * 用法：
 *   <ui-icon name="chevron-right" color="#a8a29e" size="{{32}}" />
 *   <ui-icon name="x" color="#78716c" size="{{44}}" stroke="{{2}}" />
 * 已注册在 app.json 的全局 usingComponents，各页面无需重复注册。
 */
Component({
  properties: {
    /** 图标名，见 utils/icons.js 的 ICONS */
    name: { type: String, value: '' },
    /** 描边色 */
    color: { type: String, value: DEFAULT_COLOR },
    /** 尺寸，单位 rpx */
    size: { type: Number, value: DEFAULT_SIZE },
    /** 线宽，与网页端 strokeWidth 对齐 */
    stroke: { type: Number, value: DEFAULT_STROKE },
    /** 是否用描边色填充（收藏心形的实心态） */
    fill: { type: Boolean, value: false }
  },

  data: {
    styleStr: ''
  },

  observers: {
    'name, color, size, stroke, fill': function (name, color, size, stroke, fill) {
      if (!name) {
        this.setData({ styleStr: 'display:none' })
        return
      }
      this.setData({ styleStr: iconStyle(name, color, { size, stroke, fill }) })
    }
  }
})
