/**
 * 展示层主题常量（T-0.6）
 *
 * 这里是 app.wxss 中 CSS 变量的 JS 镜像，供「需要按值动态着色 / 拼 class 名」的场景使用。
 * 改色时请与 app.wxss 的 --wx-* 一起改，两处必须保持一致。
 *
 * 取值来源：网页端 minghaishiyi_frontend/constants.ts 的 ELEMENT_COLORS
 * （Tailwind 类 → 等价 hex），因此配色与网页端逐像素一致。
 */

import { STEM_ELEMENTS, BRANCH_ELEMENTS } from './bazi/constants.js'

/** 五行 → class 后缀 */
export const ELEMENT_KEY = {
  木: 'mu',
  火: 'huo',
  土: 'tu',
  金: 'jin',
  水: 'shui'
}

/** 五行 → hex 三色（对应网页端 bg-*-100 / text-*-900 / border-*-300） */
export const ELEMENT_HEX = {
  木: { text: '#064e3b', bg: '#d1fae5', border: '#6ee7b7' },
  火: { text: '#881337', bg: '#ffe4e6', border: '#fda4af' },
  土: { text: '#78350f', bg: '#fef3c7', border: '#fcd34d' },
  金: { text: '#1e293b', bg: '#e2e8f0', border: '#94a3b8' },
  水: { text: '#0c4a6e', bg: '#e0f2fe', border: '#7dd3fc' }
}

/** 兜底色（网页端 ELEMENT_COLORS.default） */
export const FALLBACK_HEX = { text: '#292524', bg: '#f5f5f4', border: '#d6d3d1' }

/** 仅文字色的 class，用于大字干支、五行统计 */
export const elementTextClass = (element) => `el-${ELEMENT_KEY[element] || 'none'}`

/** 底色 + 边框 + 文字 的 class，用于命盘格、徽章 */
export const elementBoxClass = (element) => `box-${ELEMENT_KEY[element] || 'none'}`

/** 取五行 hex，取不到时返回兜底色 */
export const elementHex = (element) => ELEMENT_HEX[element] || FALLBACK_HEX

/** 由单个汉字取五行：天干用 STEM_ELEMENTS，地支用 BRANCH_ELEMENTS，取不到返回空串 */
export const elementOfChar = (char, isStem = true) =>
  (isStem ? STEM_ELEMENTS[char] : BRANCH_ELEMENTS[char]) || ''

/** 由单个汉字直接取文字 class */
export const charTextClass = (char, isStem = true) =>
  elementTextClass(elementOfChar(char, isStem))

/**
 * 性别配色与文案
 * 对应网页端：乾造 = sky 系（元男）、坤造 = rose 系（元女）
 */
export const GENDERS = {
  MALE: {
    label: '乾造',
    fullLabel: '乾造（男）',
    dayMasterLabel: '元男',
    text: '#0369a1',   // sky-700
    bg: '#f0f9ff',     // sky-50
    border: '#bae6fd'  // sky-200
  },
  FEMALE: {
    label: '坤造',
    fullLabel: '坤造（女）',
    dayMasterLabel: '元女',
    text: '#be123c',   // rose-700
    bg: '#fff1f2',     // rose-50
    border: '#fecdd3'  // rose-200
  }
}

/** 后端用 1 = 乾造 / 0 = 坤造，这里做一次统一映射 */
export const genderKeyFromApi = (value) => (Number(value) === 1 ? 'MALE' : 'FEMALE')

/** 后端/网页端用的 1 / 0 */
export const genderValueForApi = (key) => (key === 'MALE' ? 1 : 0)

/**
 * 命盘格的行定义（对齐网页端 BaZiChartDisplay 的 PillarGrid）
 * 顺序即渲染顺序，新增字段时补在这里即可，页面不必改。
 */
export const PILLAR_ROWS = [
  { key: 'gan', label: '天干', kind: 'char-stem' },
  { key: 'zhi', label: '地支', kind: 'char-branch' },
  { key: 'cangGan', label: '藏干', kind: 'list' },
  { key: 'cangGanShiShen', label: '副星', kind: 'list' },
  { key: 'xingYun', label: '星运', kind: 'text' },
  { key: 'ziZuo', label: '自坐', kind: 'text' },
  { key: 'xunKong', label: '空亡', kind: 'text' },
  { key: 'naYin', label: '纳音', kind: 'text' }
]
