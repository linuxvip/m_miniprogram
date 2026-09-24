export const MALE = '乾造 (男)'
export const FEMALE = '坤造 (女)'

export const SOLAR = 'SOLAR'
export const LUNAR = 'LUNAR'
export const DIRECT = 'DIRECT'

export const CASES = [
  { name: '普通公历 1990-05-15 10:30 男', args: [1990, 5, 15, 10, 30, MALE, SOLAR] },
  { name: '跨年子时 1985-12-31 23:45 女', args: [1985, 12, 31, 23, 45, FEMALE, SOLAR] },
  { name: '闰年闰日 2000-02-29 00:05 男', args: [2000, 2, 29, 0, 5, MALE, SOLAR] },
  { name: '早子时边界 1999-01-01 00:00 男', args: [1999, 1, 1, 0, 0, MALE, SOLAR] },
  { name: '晚子时边界 2001-06-01 23:59 女', args: [2001, 6, 1, 23, 59, FEMALE, SOLAR] },
  { name: '真太阳时 北京 116.4074E', args: [1990, 5, 15, 10, 30, MALE, SOLAR, null, true, 116.4074] },
  { name: '真太阳时 乌鲁木齐 87.6168E', args: [1990, 5, 15, 10, 30, FEMALE, SOLAR, null, true, 87.6168] },
  { name: '晚子换日 sect=1', args: [1990, 5, 15, 23, 30, MALE, SOLAR, null, false, null, { sect: 1 }] },
  { name: '子正换日 sect=2', args: [1990, 5, 15, 23, 30, MALE, SOLAR, null, false, null, { sect: 2 }] },
  { name: '时区偏移 东七区', args: [1990, 5, 15, 10, 30, MALE, SOLAR, null, false, null, { timezoneOffset: 7 }] },
  { name: '农历输入 1990 年四月廿一', args: [1990, 4, 21, 10, 30, MALE, LUNAR] },
  { name: '下限外 1899-03-03', args: [1899, 3, 3, 8, 0, MALE, SOLAR] },
  { name: '边界 1900-01-01 00:00', args: [1900, 1, 1, 0, 0, MALE, SOLAR] },
  { name: '边界 2100-12-31 23:00', args: [2100, 12, 31, 23, 0, FEMALE, SOLAR] },
  {
    name: '直选干支（带已知公历）',
    args: [1990, 5, 15, 10, 30, MALE, DIRECT, {
      yearGan: '庚', yearZhi: '午', monthGan: '辛', monthZhi: '巳',
      dayGan: '庚', dayZhi: '辰', hourGan: '辛', hourZhi: '巳',
      matchedSolar: { year: 1990, month: 5, day: 15, hour: 10, minute: 30 }
    }]
  }
]

export const EXPECTED_PILLARS = {
  '普通公历 1990-05-15 10:30 男': '庚午 辛巳 庚辰 辛巳',
  '跨年子时 1985-12-31 23:45 女': '乙丑 戊子 甲辰 丙子',
  '闰年闰日 2000-02-29 00:05 男': '庚辰 戊寅 丁巳 庚子',
  '早子时边界 1999-01-01 00:00 男': '戊寅 甲子 癸丑 壬子',
  '晚子时边界 2001-06-01 23:59 女': '辛巳 癸巳 乙未 戊子',
  '真太阳时 北京 116.4074E': '庚午 辛巳 庚辰 辛巳',
  '真太阳时 乌鲁木齐 87.6168E': '庚午 辛巳 庚辰 庚辰',
  '晚子换日 sect=1': '庚午 辛巳 辛巳 戊子',
  '子正换日 sect=2': '庚午 辛巳 庚辰 戊子',
  '时区偏移 东七区': '庚午 辛巳 庚辰 壬午',
  '农历输入 1990 年四月廿一': '庚午 辛巳 庚辰 辛巳',
  '下限外 1899-03-03': '己亥 丙寅 庚午 庚辰',
  '边界 1900-01-01 00:00': '己亥 丙子 甲戌 甲子',
  '边界 2100-12-31 23:00': '庚申 戊子 丁未 壬子',
  '直选干支（带已知公历）': '庚午 辛巳 庚辰 辛巳'
}
