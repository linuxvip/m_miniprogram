/**
 * 「我的」页面纯逻辑测试（T-5.9 ~ T-5.15）
 *
 * 三类最容易出错的东西：
 *  1. **字段映射**：后端的用户案例用的是 `year_ganzhi`，命例库用的是 `ganzhi`，
 *     两条路都要能编出同一种命盘页 query；
 *  2. **脏数据**：云端偏好是自由 JSON，status 里什么怪东西都可能有；
 *  3. **设置面板的显示值**：分段选择要给出下标、开关要给出文案、经度输入按开关显隐。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PROFILE_TABS, isProfileTab, genderOf, genderBadge, pillarsOf, caseSummary, formatDay,
  normalizeUserCase, normalizeUserCases, userCaseChartQuery,
  favoriteTitle, favoriteDetail, favoriteChartQuery, normalizeFavorite, normalizeFavorites,
  mergePreferences, settingsRows, applySetting, toCloudPreferences, SETTING_ROWS, dropById
} from '../utils/profile.js'
import { DEFAULT_PREFERENCES } from '../utils/preferences.js'
import { parseChartQuery } from '../utils/chartRoute.js'

const USER_CASE = {
  id: 12,
  gender: 1,
  year_ganzhi: '甲子',
  month_ganzhi: '丙寅',
  day_ganzhi: '戊午',
  hour_ganzhi: '庚申',
  subject_name: '张某',
  notes: '  备注  ',
  created_time: '2026-09-24T15:10:30+08:00'
}

/* ==================== 通用 ==================== */

test('四个子栏目固定，非法 key 不认', () => {
  assert.deepEqual(PROFILE_TABS.map((t) => t.key), ['CASES', 'FAVORITES', 'SETTINGS', 'ABOUT'])
  assert.equal(isProfileTab('CASES'), true)
  assert.equal(isProfileTab('ARTICLE'), false)
})

test('性别：后端 1/0 ↔ 乾/坤', () => {
  assert.equal(genderOf(1), 'MALE')
  assert.equal(genderOf(0), 'FEMALE')
  assert.equal(genderBadge(1).text, '乾')
  assert.equal(genderBadge(0).text, '坤')
  assert.equal(pillarsOf(USER_CASE).length, 4)
  assert.equal(caseSummary(USER_CASE), '甲子 丙寅 戊午 庚申')
  assert.equal(caseSummary({}), '', '四柱不全时不硬凑')
})

test('时间：ISO 转本地日期，坏值不崩', () => {
  assert.equal(formatDay('2026-09-24T15:10:30+08:00'), '2026-09-24')
  assert.equal(formatDay(''), '')
  assert.equal(formatDay(null), '')
  assert.equal(formatDay('不是时间'), '不是时间')
})

/* ==================== 我的案例 ==================== */

test('normalizeUserCase 铺成卡片要的形状', () => {
  const item = normalizeUserCase(USER_CASE)
  assert.equal(item.id, '12')
  assert.equal(item.gender, 'MALE')
  assert.equal(item.badge, '乾')
  assert.equal(item.displayName, '张某')
  assert.equal(item.notes, '备注', '备注要去掉两端空白')
  assert.equal(item.hasNotes, true)
  assert.equal(item.summary, '甲子 丙寅 戊午 庚申')
  assert.equal(item.day, '2026-09-24')
})

test('normalizeUserCase 兜住空字段', () => {
  const item = normalizeUserCase({ id: 7, gender: 0 })
  assert.equal(item.displayName, '未命名案例')
  assert.equal(item.badge, '坤')
  assert.equal(item.hasNotes, false)
  assert.equal(item.summary, '')
  assert.equal(normalizeUserCase(null).id, '')
  assert.deepEqual(normalizeUserCases(null), [])
  assert.equal(normalizeUserCases([{}, {}]).length, 2)
})

test('我的案例 → 命盘页 query：与命例库跳排盘同一条路', () => {
  const params = new URLSearchParams(userCaseChartQuery(USER_CASE))
  assert.equal(params.get('t'), 'DIRECT')
  assert.equal(params.get('g'), 'MALE')
  assert.equal(params.get('yg') + params.get('yz'), '甲子')
  assert.equal(params.get('hg') + params.get('hz'), '庚申')

  // 反着解一遍：命盘页拿到这条 query 要能还原出同样四个字
  const parsed = parseChartQuery(Object.fromEntries(params))
  assert.deepEqual(parsed.direct, {
    yearGan: '甲', yearZhi: '子',
    monthGan: '丙', monthZhi: '寅',
    dayGan: '戊', dayZhi: '午',
    hourGan: '庚', hourZhi: '申'
  })
})

/* ==================== 我的收藏 ==================== */

test('收藏三种类型：标题与摘要各取各的字段', () => {
  assert.equal(favoriteTitle({ kind: 'destiny_case', source: '巾箱秘术' }), '巾箱秘术')
  assert.equal(favoriteTitle({ kind: 'destiny_case' }), '命例库')
  assert.equal(favoriteTitle({ kind: 'article', title: '论四柱' }), '论四柱')
  assert.equal(favoriteTitle({ kind: 'user_case', subject_name: '李某' }), '李某')
  assert.equal(favoriteTitle({}), '收藏')

  assert.equal(favoriteDetail({ kind: 'destiny_case', year_ganzhi: '甲子', day_ganzhi: '戊午' }), '甲子 戊午')
  assert.equal(favoriteDetail({ kind: 'article', summary: '摘要' }), '摘要')
})

test('只有命例与我的案例能跳命盘；文章打不开（P1 暂缓）', () => {
  const caseQuery = favoriteChartQuery({ kind: 'destiny_case', gender: 0, year_ganzhi: '甲子' })
  assert.equal(new URLSearchParams(caseQuery).get('g'), 'FEMALE')

  assert.equal(favoriteChartQuery({ kind: 'article', title: 'x' }), '')
  assert.equal(favoriteChartQuery(null), '')
})

test('normalizeFavorite 带出类型徽章与可跳转标记', () => {
  const fav = normalizeFavorite({
    id: 3,
    created_time: '2026-09-20T08:00:00+08:00',
    object_summary: { kind: 'destiny_case', id: 88, source: '铁口擂台', gender: 1, year_ganzhi: '甲子' }
  })
  assert.equal(fav.id, '3')
  assert.equal(fav.kindLabel, '命例')
  assert.equal(fav.title, '铁口擂台')
  assert.equal(fav.detail, '甲子')
  assert.equal(fav.day, '2026-09-20')
  assert.equal(fav.chartQuery.indexOf('t=DIRECT') >= 0, true)

  const article = normalizeFavorite({ id: 4, object_summary: { kind: 'article', title: '文' } })
  assert.equal(article.chartQuery, '')
  assert.equal(article.hasDetail, false)

  assert.equal(normalizeFavorite({}).kindLabel, '收藏')
  assert.deepEqual(normalizeFavorites('不是数组'), [])
})

/* ==================== 设置（T-5.11 / T-5.13） ==================== */

test('mergePreferences：好的云值覆盖本地，坏的忽略', () => {
  const local = { gender: 'FEMALE', sect: 1, manualLongitude: '100' }
  const merged = mergePreferences({
    gender: 'MALE',
    calendarType: 'DIRECT',
    sect: 2,
    timezoneOffset: '9',
    useTrueSolarTime: false,
    useManualLongitude: true,
    manualLongitude: 116.4
  }, local)

  assert.equal(merged.gender, 'MALE')
  assert.equal(merged.calendarType, 'DIRECT')
  assert.equal(merged.sect, 2)
  assert.equal(merged.timezoneOffset, '9')
  assert.equal(merged.useTrueSolarTime, false)
  assert.equal(merged.manualLongitude, '116.4', '数字也要能收下')

  const dirty = mergePreferences({
    gender: '男', calendarType: 'HUH', sect: 7, timezoneOffset: '99',
    useTrueSolarTime: 'yes', manualLongitude: null
  }, local)
  assert.equal(dirty.gender, 'FEMALE', '坏值退回本地值')
  assert.equal(dirty.calendarType, 'SOLAR')
  assert.equal(dirty.sect, 1)
  assert.equal(dirty.timezoneOffset, '8')
  assert.equal(dirty.useTrueSolarTime, true)
  assert.equal(dirty.manualLongitude, '100')

  assert.deepEqual(mergePreferences(null, null), DEFAULT_PREFERENCES)
})

test('settingsRows：分段给下标、开关给文案、经度按开关显隐', () => {
  const rows = settingsRows({ ...DEFAULT_PREFERENCES, gender: 'FEMALE', sect: 1, useManualLongitude: true, manualLongitude: '116.4' })
  const byKey = (key) => rows.filter((r) => r.key === key)[0]

  assert.equal(byKey('gender').label, '坤造')
  assert.equal(byKey('gender').index, 1)
  assert.equal(byKey('calendarType').label, '公历')
  assert.equal(byKey('useTrueSolarTime').label, '开启')
  assert.equal(byKey('sect').on, true)
  assert.equal(byKey('sect').label, '开启')
  assert.equal(byKey('manualLongitude').show, true)
  assert.equal(byKey('manualLongitude').label, '116.4')
  assert.equal(byKey('timezoneOffset').label, 'UTC+8 (北京, 默认)')
  assert.equal(byKey('timezoneOffset').range.length, 27)

  const closed = settingsRows({ ...DEFAULT_PREFERENCES, useManualLongitude: false })
  assert.equal(closed.filter((r) => r.key === 'manualLongitude')[0].show, false)
  assert.equal(settingsRows(null).length, SETTING_ROWS.length)
})

test('applySetting：改一个键，不碰原对象', () => {
  const before = { ...DEFAULT_PREFERENCES }
  const next = applySetting(before, 'sect', true)
  assert.equal(next.sect, 1)
  assert.equal(before.sect, 2, '不能改到原对象')

  assert.equal(applySetting(before, 'sect', false).sect, 2)
  assert.equal(applySetting(before, 'useTrueSolarTime', 0).useTrueSolarTime, false)
  assert.equal(applySetting(before, 'manualLongitude', 116.4).manualLongitude, '116.4')
  assert.equal(applySetting(before, 'calendarType', 'LUNAR').calendarType, 'LUNAR')
})

test('toCloudPreferences：只推该同步的字段', () => {
  const cloud = toCloudPreferences(DEFAULT_PREFERENCES)
  assert.deepEqual(Object.keys(cloud).sort(), [
    'calendarType', 'gender', 'manualLongitude', 'sect',
    'timezoneOffset', 'useManualLongitude', 'useTrueSolarTime'
  ])
  assert.equal('longitude' in cloud, false, '经纬度与地区名不上云（体积与隐私）')
  assert.equal('locationName' in cloud, false)
})

test('取消收藏：dropById 按字符串 id 去掉一条，不改原数组（乐观更新用）', () => {
  const list = [{ id: '1' }, { id: 2 }, { id: '3' }]
  assert.deepEqual(dropById(list, 2), [{ id: '1' }, { id: '3' }], '数字与字符串都要认')
  assert.deepEqual(dropById(list, '9'), list, '找不到就原样返回')
  assert.equal(list.length, 3, '原数组不能被改')
  assert.deepEqual(dropById(null, 1), [])
})
