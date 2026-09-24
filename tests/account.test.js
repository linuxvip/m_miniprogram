/**
 * 账号相关纯逻辑测试（T-1.16 保存案例 / T-3.6 收藏）
 *
 * 这两块都直接写服务端数据，错了要么产生脏数据、要么用户以为存下了其实没存：
 *  1. **保存请求体**：后端逐柱校验干支、gender 要 1/0，拼错就是 400；
 *  2. **input_snapshot**：会随案例上云，不能把命例原文 / cid 这类「别人的东西」带上去；
 *  3. **收藏查表**：服务端 `object_id` 是数字，本地可能是字符串，对不上就出现
 *     「明明收藏了，心形还是空的」。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PILLAR_KEYS, ganzhiOf, missingPillars, canSaveCase, missingPillarsLabel,
  snapshotOf, saveCasePayload, OBJECT_TYPES, favoriteToast,
  favoriteKey, favoriteIdsOf, isFavorited, withFavorite, markFavorites
} from '../utils/account.js'

const chart = (overrides = {}) => ({
  year: { gan: '甲', zhi: '子' },
  month: { gan: '丙', zhi: '寅' },
  day: { gan: '戊', zhi: '午' },
  hour: { gan: '庚', zhi: '申' },
  ...overrides
})

const input = (overrides = {}) => ({
  type: 'SOLAR',
  year: 1990,
  month: 1,
  day: 1,
  hour: 12,
  minute: 30,
  gender: 'MALE',
  name: '张某',
  useTrueSolarTime: false,
  longitude: 116.4,
  timezoneOffset: 8,
  sect: 2,
  ...overrides
})

/* ==================== 四柱完整性 ==================== */

test('四柱齐全时才认为可保存', () => {
  assert.deepEqual(PILLAR_KEYS, ['year', 'month', 'day', 'hour'])
  assert.equal(canSaveCase(chart()), true)
  assert.deepEqual(missingPillars(chart()), [])

  // 1900-2100 之外算不出时辰：hour 是空对象
  const noHour = chart({ hour: null })
  assert.equal(canSaveCase(noHour), false)
  assert.deepEqual(missingPillars(noHour), ['hour'])
  assert.equal(missingPillarsLabel(noHour), '时柱')

  const half = missingPillarsLabel(chart({ year: { gan: '甲' }, hour: null }))
  assert.equal(half, '年柱、时柱')
})

test('干支只取 天干 + 地支，缺一个就算这一柱没有', () => {
  assert.equal(ganzhiOf(chart(), 'day'), '戊午')
  assert.equal(ganzhiOf(chart({ day: { gan: '戊' } }), 'day'), '')
  assert.equal(ganzhiOf(null, 'day'), '')
})

/* ==================== 保存请求体 ==================== */

test('保存请求体：gender 转 1/0，姓名去空白，四柱拼成两个字', () => {
  const male = saveCasePayload(chart(), input(), '')
  assert.deepEqual(
    PILLAR_KEYS.map((k) => male[`${k}_ganzhi`]),
    ['甲子', '丙寅', '戊午', '庚申']
  )
  assert.equal(male.gender, 1)
  assert.equal(male.subject_name, '张某')
  assert.equal(male.notes, '')

  assert.equal(saveCasePayload(chart(), input({ gender: 'FEMALE' }), '').gender, 0)
  assert.equal(saveCasePayload(chart(), input({ name: '  李某  ' }), '').subject_name, '李某')
  assert.equal(saveCasePayload(chart(), input(), '古籍原文').notes, '古籍原文')
})

test('input_snapshot 只装排盘输入，不带 cid / 命例原文', () => {
  const payload = saveCasePayload(chart(), input(), '原文')
  const snap = payload.input_snapshot

  assert.equal(snap.type, 'SOLAR')
  assert.equal(snap.gender, 'MALE')
  assert.equal(snap.year, 1990)
  assert.equal(snap.minute, 30)
  assert.equal(snap.timezoneOffset, 8)
  assert.equal(snap.name, '张某')
  assert.equal(snap.longitude, 116.4)
  assert.equal('cid' in snap, false)
  assert.equal(JSON.stringify(snap).includes('原文'), false)
})

test('snapshotOf：DIRECT 模式带上四柱，姓名空着就不写这个字段', () => {
  const direct = { yearGan: '甲', yearZhi: '子', monthGan: '丙', monthZhi: '寅', dayGan: '戊', dayZhi: '午', hourGan: '庚', hourZhi: '申' }
  const snap = snapshotOf(input({ type: 'DIRECT', name: '', direct, longitude: undefined }))

  assert.deepEqual(snap.direct, direct)
  assert.equal('name' in snap, false)
  assert.equal('longitude' in snap, false)
  // 深拷贝：改快照不能影响原对象
  snap.direct.yearGan = '乙'
  assert.equal(direct.yearGan, '甲')
})

/* ==================== 收藏 ==================== */

test('收藏类型常量与后端 OBJECT_TYPE_MAP 对齐', () => {
  assert.deepEqual(OBJECT_TYPES, {
    destinyCase: 'destiny_case',
    article: 'article',
    userCase: 'user_case'
  })
})

test('收藏列表 → id 查表：数字 / 字符串统一，空 id 丢掉', () => {
  const ids = favoriteIdsOf([
    { id: 1, object_id: 3699 },
    { id: 2, object_id: '500' },
    { id: 3, object_id: null },
    null
  ])
  assert.deepEqual(ids, { 3699: true, 500: true })
  assert.equal(isFavorited(ids, 3699), true)
  assert.equal(isFavorited(ids, '3699'), true, '数字与字符串都要认')
  assert.equal(isFavorited(ids, 1), false)
  assert.equal(isFavorited(null, 3699), false)
  assert.deepEqual(favoriteIdsOf(null), {})
})

test('withFavorite 返回新对象，不改原来那份（setData 要看得出变化）', () => {
  const before = { 1: true }
  const added = withFavorite(before, 2, true)
  assert.deepEqual(before, { 1: true })
  assert.deepEqual(added, { 1: true, 2: true })

  const removed = withFavorite(added, '1', false)
  assert.deepEqual(removed, { 2: true })
  assert.deepEqual(withFavorite(added, '', true), added, '空 id 不写入')
})

test('markFavorites 只补 favorited，其余字段原样保留', () => {
  const cases = [
    { id: 3699, source: '巾箱秘术', feedback: '原文', expanded: true },
    { id: '500', source: '铁口擂台' }
  ]
  const marked = markFavorites(cases, favoriteIdsOf([{ object_id: 3699 }]))

  assert.equal(marked[0].favorited, true)
  assert.equal(marked[0].source, '巾箱秘术')
  assert.equal(marked[0].expanded, true, '展开态不能被覆盖')
  assert.equal(marked[1].favorited, false)
  assert.equal(cases[0].favorited, undefined, '不改原数组')
  assert.deepEqual(markFavorites(null, {}), [])
})

test('收藏结果文案只看服务端返回的状态', () => {
  assert.equal(favoriteKey(undefined), '')
  assert.equal(favoriteKey(3699), '3699')
  assert.equal(favoriteToast(true), '已收藏')
  assert.equal(favoriteToast(false), '已取消收藏')
})
