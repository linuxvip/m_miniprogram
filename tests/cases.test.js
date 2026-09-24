/**
 * 命例库纯逻辑测试（T-3.1 / T-3.2 / T-3.3 / T-3.9）
 *
 * 这里钉住的是三类「错了会很难查」的东西：
 *  1. 筛选条件 → 查询参数的映射（哪个走精确匹配、哪个走 icontains、哪些要跳过）；
 *  2. 分页游标：后端的 next 是 http 绝对地址且带着旧筛选条件，我们只用它取页码；
 *  3. label JSON 的解析与徽章顺序，以及「加载更多」连点两次时的去重。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ALL, PAGE_SIZE, LABEL_KEYS, LABEL_FIELDS, PILLAR_KEYS,
  defaultFilters, genderForApi, genderFromApi, genderLabel, parseLabelTags, splitGanzhi,
  normalizeCase, buildCaseQuery, pageFromNext, filtersActive, appendCases,
  labelPickerRow, labelPickerRows, sourcePickerRow, pickerValueAt,
  directFromGanzhi, chartQueryForCase, caseContextFor, EMPTY_FEEDBACK
} from '../utils/cases.js'
import { fetchCases, fetchCaseSources, CASES_PATH, SOURCES_PATH } from '../utils/casesApi.js'

const RAW_CASE = {
  id: 3699,
  source: '巾箱秘术',
  gender: 1,
  year_ganzhi: '甲子',
  month_ganzhi: '丙寅',
  day_ganzhi: '戊午',
  hour_ganzhi: '庚申',
  feedback: '命主幼年家贫，后经商致富。',
  label: '{"出身":"农村普通家庭","学历":"初中","职业类别":"经商","职业细分":"个体开店","婚姻状态":"已婚(初婚)","财富层次":"小富"}'
}

/* ==================== label 解析 ==================== */

test('parseLabelTags 按 LABEL_KEYS 顺序取字段，丢掉 0 / 空串 / 缺失', () => {
  const tags = parseLabelTags(JSON.stringify({
    出身: '农村普通家庭', 学历: '本科', 职业类别: '', 职业细分: '教师', 婚姻状态: '未婚', 财富层次: 0
  }))
  assert.deepEqual(tags, ['农村普通家庭', '本科', '教师', '未婚'])
  assert.ok(LABEL_KEYS.indexOf('职业细分') > 0, '职业细分也要展示（只是不做下拉）')
})

test('parseLabelTags 去重：两个字段取值相同时不重复铺徽章', () => {
  // 干数据里确实会出现「职业类别 = 经商、职业细分 = 经商」这种重叠
  assert.deepEqual(
    parseLabelTags(JSON.stringify({ 出身: '农村普通家庭', 学历: '本科', 职业类别: '经商', 职业细分: '经商' })),
    ['农村普通家庭', '本科', '经商']
  )
  assert.deepEqual(parseLabelTags('本科,本科,离异'), ['本科', '离异'])
  assert.deepEqual(parseLabelTags('["本科","本科"]'), ['本科'])
})

test('parseLabelTags 对非 JSON 的历史数据按逗号兜底，空值返回空数组', () => {
  assert.deepEqual(parseLabelTags('农村，本科, 教师'), ['农村', '本科', '教师'])
  assert.deepEqual(parseLabelTags(''), [])
  assert.deepEqual(parseLabelTags(null), [])
  assert.deepEqual(parseLabelTags(undefined), [])
  assert.deepEqual(parseLabelTags('"就是个字符串"'), ['就是个字符串'])
  assert.deepEqual(parseLabelTags('["本科","离异",""]'), ['本科', '离异'], '数组形态的 label 也要能显示')
  assert.deepEqual(parseLabelTags('   '), [])
})

/* ==================== 性别 ==================== */

test('性别在接口与界面之间双向映射', () => {
  assert.equal(genderForApi('MALE'), '1')
  assert.equal(genderForApi('FEMALE'), '0')
  assert.equal(genderForApi(ALL), '')
  assert.equal(genderFromApi(1), 'MALE')
  assert.equal(genderFromApi('1'), 'MALE')
  assert.equal(genderFromApi('男'), 'MALE')
  assert.equal(genderFromApi('乾'), 'MALE')
  assert.equal(genderFromApi(0), 'FEMALE')
  assert.equal(genderFromApi('坤'), 'FEMALE')
  assert.equal(genderLabel('MALE'), '乾')
  assert.equal(genderLabel('FEMALE'), '坤')
})

/* ==================== 卡片视图模型 ==================== */

test('splitGanzhi 拆出干支并带五行文字色，缺字用占位符', () => {
  assert.deepEqual(splitGanzhi('甲子'), { gan: '甲', zhi: '子', ganCls: 'el-mu', zhiCls: 'el-shui' })
  assert.deepEqual(splitGanzhi('丙午'), { gan: '丙', zhi: '午', ganCls: 'el-huo', zhiCls: 'el-huo' })
  assert.deepEqual(splitGanzhi(''), { gan: '?', zhi: '?', ganCls: 'el-none', zhiCls: 'el-none' })
  assert.deepEqual(splitGanzhi('甲'), { gan: '甲', zhi: '?', ganCls: 'el-mu', zhiCls: 'el-none' })
})

test('normalizeCase 把接口数据铺成卡片要的形状', () => {
  const item = normalizeCase(RAW_CASE)
  assert.equal(item.id, '3699', 'id 统一成字符串，wx:key 才不会数字/字符串混用')
  assert.equal(item.gender, 'MALE')
  assert.equal(item.genderLabel, '乾')
  assert.equal(item.genderCls, 'lib-gender-male')
  assert.deepEqual(item.ganzhi, ['甲子', '丙寅', '戊午', '庚申'])
  assert.equal(item.pillars.length, 4)
  assert.equal(item.pillars[0].gan, '甲')
  // 四柱各自带稳定 key，wxml 里才能用 wx:key="key"
  assert.deepEqual(item.pillars.map((p) => p.key), ['year', 'month', 'day', 'hour'])
  assert.equal(item.tags.length, 6)
  assert.equal(item.shownTags.length, 6)
  assert.equal(item.moreTags, 0)
  assert.equal(item.feedback, RAW_CASE.feedback)
  assert.equal(item.expanded, false)
})

test('normalizeCase 兜住空字段：坤造、未知来源、无反馈', () => {
  const item = normalizeCase({ id: 7, gender: 0 })
  assert.equal(item.gender, 'FEMALE')
  assert.equal(item.genderCls, 'lib-gender-female')
  assert.equal(item.source, '未知来源')
  assert.equal(item.feedback, '暂无反馈内容')
  assert.deepEqual(item.tags, [])
  assert.deepEqual(item.ganzhi, ['', '', '', ''])
  assert.equal(normalizeCase(null).id, '')
})

test('徽章超过 6 个时折成「+N」（网页端只铺 6 个）', () => {
  const item = normalizeCase({ id: 1, label: '{"出身":"农村普通家庭","学历":"本科","职业类别":"经商","职业细分":"教师","婚姻状态":"未婚","财富层次":"小富"}' })
  assert.equal(item.shownTags.length, 6)
  assert.equal(item.moreTags, 0)

  const many = normalizeCase({ id: 2, label: 'a,b,c,d,e,f,g,h' })
  assert.equal(many.tags.length, 8)
  assert.equal(many.shownTags.length, 6)
  assert.equal(many.moreTags, 2)
})

/* ==================== 筛选 → 查询参数 ==================== */

test('默认筛选只带 page_size：不带任何会把结果筛空的参数', () => {
  assert.deepEqual(buildCaseQuery(defaultFilters()), { page_size: PAGE_SIZE })
  assert.equal(PAGE_SIZE, 12, '与网页端一致，一页 12 条')
})

test('性别 / 来源 / 关键词 / 四柱 / 五个枚举字段都能翻成参数', () => {
  const filters = defaultFilters()
  filters.gender = 'FEMALE'
  filters.source = '巾箱秘术'
  filters.keyword = '  教师  '
  filters.pillars = { year: ' 甲子 ', month: '', day: '戊', hour: '' }
  filters.labels.xueli = '本科'
  filters.labels.caifu_cengci = '小富'
  assert.deepEqual(buildCaseQuery(filters), {
    page_size: PAGE_SIZE,
    gender: '0',
    source: '巾箱秘术',
    label: '教师',
    year_ganzhi: '甲子',
    day_ganzhi: '戊',
    xueli: '本科',
    caifu_cengci: '小富'
  })
})

test('「全部」与空白一律不发参数', () => {
  const filters = defaultFilters()
  filters.gender = ALL
  filters.source = ALL
  filters.keyword = '   '
  filters.pillars = { year: '', month: '  ', day: '', hour: '' }
  LABEL_FIELDS.forEach((f) => { filters.labels[f.key] = ALL })
  assert.deepEqual(buildCaseQuery(filters), { page_size: PAGE_SIZE })
})

test('页码只有 >1 才拼进参数；非法页码退回第 1 页', () => {
  assert.deepEqual(buildCaseQuery(defaultFilters(), 1), { page_size: PAGE_SIZE })
  assert.equal(buildCaseQuery(defaultFilters(), 3).page, 3)
  assert.equal(buildCaseQuery(defaultFilters(), 'x').page, undefined)
  assert.equal(buildCaseQuery(defaultFilters(), 0).page, undefined)
})

test('五个可下拉字段与后端参数名一一对应（写错就静默筛不出数据）', () => {
  assert.deepEqual(LABEL_FIELDS.map((f) => f.key),
    ['chusheng', 'xueli', 'zhiye_leibie', 'hunyin_zhuangtai', 'caifu_cengci'])
  LABEL_FIELDS.forEach((field) => {
    assert.ok(field.label && field.options.length >= 5, `${field.label} 选项太少`)
    assert.equal(field.options.indexOf(ALL), -1, '选项里不能混进「全部」，那是界面层的概念')
    assert.equal(new Set(field.options).size, field.options.length, `${field.label} 选项有重复`)
  })
  assert.equal(PILLAR_KEYS.join(','), 'year,month,day,hour')
})

/* ==================== 分页 ==================== */

test('pageFromNext 只取页码：后端的 http 绝对地址不能直接拿来请求', () => {
  assert.equal(pageFromNext('http://www.minghaishiyi.cn/api/destiny-cases/?page=2&page_size=12'), 2)
  assert.equal(pageFromNext('http://110.40.159.5/api/destiny-cases/?page=37'), 37)
  assert.equal(pageFromNext('http://x/api/destiny-cases/?page=1'), null, '第 1 页不等于「还有下一页」')
  assert.equal(pageFromNext(null), null)
  assert.equal(pageFromNext(''), null)
  assert.equal(pageFromNext('http://x/api/destiny-cases/'), null)
})

test('appendCases 按 id 去重，连点两次「加载更多」不会出现重复卡片', () => {
  const first = [{ id: '1' }, { id: '2' }]
  const second = [{ id: '2' }, { id: '3' }]
  assert.deepEqual(appendCases(first, second).map((c) => c.id), ['1', '2', '3'])
  assert.deepEqual(appendCases([], second).map((c) => c.id), ['2', '3'])
  assert.deepEqual(appendCases(first, []).map((c) => c.id), ['1', '2'])
  assert.deepEqual(appendCases(null, null), [])
  assert.deepEqual(appendCases([{ id: '1' }], [null, undefined]).map((c) => c.id), ['1'])
})

/* ==================== 是否有筛选 / picker 模型 ==================== */

test('filtersActive 认得出每一种筛选', () => {
  assert.equal(filtersActive(defaultFilters()), false)
  assert.equal(filtersActive({ ...defaultFilters(), gender: 'MALE' }), true)
  assert.equal(filtersActive({ ...defaultFilters(), source: '巾箱秘术' }), true)
  assert.equal(filtersActive({ ...defaultFilters(), keyword: 'a' }), true)
  assert.equal(filtersActive({ ...defaultFilters(), keyword: '   ' }), false)
  assert.equal(filtersActive({ ...defaultFilters(), pillars: { year: '甲', month: '', day: '', hour: '' } }), true)
  const withLabel = defaultFilters()
  withLabel.labels.hunyin_zhuangtai = '离异'
  assert.equal(filtersActive(withLabel), true)
})

test('labelPickerRow 把「全部」放在第 0 项，并给出当前选中下标', () => {
  const field = LABEL_FIELDS[1] // 学历
  const row = labelPickerRow(field, defaultFilters())
  assert.deepEqual(row.values, [ALL].concat(field.options))
  assert.deepEqual(row.range, ['全部'].concat(field.options))
  assert.equal(row.index, 0)
  assert.equal(row.active, false)

  const filters = defaultFilters()
  filters.labels[field.key] = '大专'
  const picked = labelPickerRow(field, filters)
  assert.equal(picked.index, field.options.indexOf('大专') + 1)
  assert.equal(picked.value, '大专')
  assert.equal(picked.active, true)
})

test('labelPickerRow 遇到字典外的脏值退回「全部」，不会越界', () => {
  const field = LABEL_FIELDS[0]
  const filters = defaultFilters()
  filters.labels[field.key] = '温饱'
  const row = labelPickerRow(field, filters)
  assert.equal(row.index, 0)
  assert.equal(row.value, ALL)
})

test('labelPickerRows 一次给出 5 行，供 wxml 直接铺', () => {
  const rows = labelPickerRows(defaultFilters())
  assert.equal(rows.length, 5)
  assert.deepEqual(rows.map((r) => r.label), ['出身', '学历', '职业类别', '婚姻状态', '财富层次'])
})

test('sourcePickerRow 用接口返回的顺序，脏值退回「全部来源」', () => {
  const sources = ['巾箱秘术', '铁口擂台', '神龙杯擂台']
  const row = sourcePickerRow(defaultFilters(), sources)
  assert.deepEqual(row.range, ['全部来源'].concat(sources))
  assert.equal(row.index, 0)

  const picked = sourcePickerRow({ ...defaultFilters(), source: '铁口擂台' }, sources)
  assert.equal(picked.index, 2)
  assert.equal(picked.value, '铁口擂台')
  assert.equal(picked.active, true)

  assert.equal(sourcePickerRow({ ...defaultFilters(), source: '不存在的来源' }, sources).index, 0)
  assert.equal(sourcePickerRow(defaultFilters(), null).range.length, 1)
})

test('pickerValueAt 防越界', () => {
  assert.equal(pickerValueAt([ALL, 'a', 'b'], 2), 'b')
  assert.equal(pickerValueAt([ALL, 'a'], 9), ALL)
  assert.equal(pickerValueAt(null, 0), ALL)
})

/* ==================== 命例 → 命盘页（T-3.4） ==================== */

test('directFromGanzhi 把四柱拆成 DIRECT 模式要的八个字', () => {
  assert.deepEqual(directFromGanzhi(['甲子', '丙寅', '戊午', '庚申']), {
    yearGan: '甲', yearZhi: '子',
    monthGan: '丙', monthZhi: '寅',
    dayGan: '戊', dayZhi: '午',
    hourGan: '庚', hourZhi: '申'
  })
  assert.deepEqual(directFromGanzhi(['甲子']).hourZhi, '', '缺柱给空串，calculateBaZi 那边会当不完整处理')
  assert.deepEqual(directFromGanzhi(null).dayGan, '')
})

test('chartQueryForCase 编出 DIRECT 的 query：只带 t / g / 八个字', () => {
  const item = normalizeCase(RAW_CASE)
  // 值都经过 encodeURIComponent（干支会被转义），所以用 URLSearchParams 反向读
  const params = new URLSearchParams(chartQueryForCase(item))

  assert.equal(params.get('t'), 'DIRECT')
  assert.equal(params.get('g'), 'MALE')
  assert.equal(params.get('yg') + params.get('yz'), '甲子')
  assert.equal(params.get('mg') + params.get('mz'), '丙寅')
  assert.equal(params.get('dg') + params.get('dz'), '戊午')
  assert.equal(params.get('hg') + params.get('hz'), '庚申')
  assert.equal(params.get('tst'), '0', '四柱模式下不需要真太阳时校正')
  assert.equal(params.has('y'), false, '没必要带公历参数')
  assert.equal(new URLSearchParams(chartQueryForCase(normalizeCase({ id: 1, gender: 0 }))).get('g'), 'FEMALE')
})

test('caseContextFor 只认 cid 对得上的那一条', () => {
  const store = { id: 3699, feedback: '  原文  ', source: '巾箱秘术' }
  assert.deepEqual(caseContextFor('3699', store), { feedback: '原文', source: '巾箱秘术' })
  assert.equal(caseContextFor(3699, store) !== null, true, '数字 / 字符串 id 都要认')
  assert.equal(caseContextFor('3700', store), null, 'id 对不上就不显示')
  assert.equal(caseContextFor(undefined, store), null, '手动排盘没有 cid，不该翻出上一条命例')
  assert.equal(caseContextFor('3699', null), null)
  assert.equal(caseContextFor('3699', { id: 3699 }), null, '没有原文时不渲染')
  assert.equal(caseContextFor('3699', { id: 3699, feedback: EMPTY_FEEDBACK }), null, '占位文案不算原文')
})

/* ==================== 接口层 ==================== */

test('fetchCases / fetchCaseSources 打对路径、不带 token', async () => {
  const calls = []
  const fakeGet = (path, options) => {
    calls.push({ path, options })
    return Promise.resolve(path === SOURCES_PATH ? { sources: ['巾箱秘术', ''] } : { count: 0, results: [] })
  }
  await fetchCases({ page_size: 12 }, fakeGet)
  assert.equal(calls[0].path, CASES_PATH)
  assert.deepEqual(calls[0].options.params, { page_size: 12 })
  assert.equal(calls[0].options.auth, false)

  const sources = await fetchCaseSources(fakeGet)
  assert.equal(calls[1].path, SOURCES_PATH)
  assert.deepEqual(sources, ['巾箱秘术'], '顺手把空来源滤掉')

  const empty = await fetchCaseSources(() => Promise.resolve(null))
  assert.deepEqual(empty, [], '接口挂了 / 返回怪东西时给空数组，页面不用再判空')
})
