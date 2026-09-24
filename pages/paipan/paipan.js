import { calculateBaZi } from '../../utils/bazi/baziCalc'
import { Gender, CalendarType } from '../../utils/bazi/types'

const ELEMENT_CLASS = {
  木: 'el-mu',
  火: 'el-huo',
  土: 'el-tu',
  金: 'el-jin',
  水: 'el-shui'
}

const PILLAR_ORDER = [
  ['year', '年柱'],
  ['month', '月柱'],
  ['day', '日柱'],
  ['hour', '时柱']
]

const pad2 = (n) => String(n).padStart(2, '0')

const todayString = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

Page({
  data: {
    date: todayString(),
    time: '12:00',
    gender: 'MALE',
    result: null,
    pillars: [],
    error: ''
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value })
  },

  onTimeChange(e) {
    this.setData({ time: e.detail.value })
  },

  onGenderChange(e) {
    this.setData({ gender: e.detail.value })
  },

  calculate() {
    const [year, month, day] = this.data.date.split('-').map(Number)
    const [hour, minute] = this.data.time.split(':').map(Number)

    let chart
    try {
      chart = calculateBaZi(
        year, month, day, hour, minute,
        this.data.gender === 'MALE' ? Gender.MALE : Gender.FEMALE,
        CalendarType.SOLAR
      )
    } catch (err) {
      this.setData({ result: null, pillars: [], error: `排盘失败：${err.message}` })
      return
    }

    const pillars = PILLAR_ORDER.map(([key, label]) => {
      const p = chart[key]
      return {
        label,
        gan: p.gan,
        zhi: p.zhi,
        ganClass: ELEMENT_CLASS[p.ganElement] || '',
        zhiClass: ELEMENT_CLASS[p.zhiElement] || '',
        shiShen: p.shiShen,
        naYin: p.naYin,
        cangGan: (p.cangGan || []).join(''),
        cangGanShiShen: p.cangGanShiShen || [],
        xingYun: p.xingYun,
        ziZuo: p.ziZuo,
        xunKong: p.xunKong
      }
    })

    this.setData({
      error: '',
      result: {
        solarDate: chart.solarDate,
        lunarDate: chart.lunarDate,
        jieQi: chart.jieQi,
        zodiac: chart.zodiac,
        constellation: chart.constellation,
        weekDay: chart.weekDay,
        dayMasterElement: chart.dayMasterElement,
        strengthLevel: chart.dayMasterStrength ? chart.dayMasterStrength.level : '',
        strengthDesc: chart.dayMasterStrength ? chart.dayMasterStrength.description : '',
        yunDirection: chart.yunDirection,
        qiYunText: chart.qiYunText,
        siLingDesc: chart.siLingDesc,
        wuXing: (chart.wuXing || []).map((w) => ({
          element: w.element,
          count: w.count,
          cls: ELEMENT_CLASS[w.element] || ''
        })),
        shenSha: (chart.shenSha || []).slice(0, 12)
      },
      pillars
    })
  }
})
