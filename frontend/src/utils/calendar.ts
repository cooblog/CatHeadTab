export const WEEK_DAYS_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
export const WEEK_DAYS_ZH = ['日', '一', '二', '三', '四', '五', '六'];

const MIN_LUNAR_YEAR = 1900;

const LUNAR_INFO = [
  0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
  0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
  0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
  0x06566,0x0d4a0,0x0ea50,0x16a95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
  0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
  0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
  0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
  0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
  0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
  0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,
  0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
  0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
  0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
  0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
  0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
  0x14b63,
];

const MAX_LUNAR_YEAR = MIN_LUNAR_YEAR + LUNAR_INFO.length - 1;

/** Year range with lunar data available — calendar UI should not navigate outside it. */
export const MIN_CALENDAR_YEAR = MIN_LUNAR_YEAR;
export const MAX_CALENDAR_YEAR = MAX_LUNAR_YEAR;
const LUNAR_MONTHS = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const LUNAR_DAYS = [
  '初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
  '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
  '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十',
];

const HEAVENLY_STEMS = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const EARTHLY_BRANCHES = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const ZODIAC_ANIMALS = ['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'];

export type CalendarFestivalCategory = 'chinese' | 'international' | 'solarTerm';

export interface LunarDate {
  year: number;
  month: number;
  day: number;
  isLeap: boolean;
  monthStr: string;
  dayStr: string;
  ganzhi: string;
  zodiac: string;
  supported: boolean;
}

export interface CalendarFestival {
  id: string;
  nameZh: string;
  nameEn: string;
  shortZh: string;
  shortEn: string;
  category: CalendarFestivalCategory;
  priority: number;
}

export interface CalendarDay {
  date: Date;
  key: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  lunar: LunarDate;
  festivals: CalendarFestival[];
}

export interface UpcomingCalendarEvent {
  date: Date;
  key: string;
  festival: CalendarFestival;
  daysAway: number;
}

function lunarInfo(y: number): number {
  return LUNAR_INFO[y - MIN_LUNAR_YEAR] ?? 0;
}

export function isSupportedLunarYear(year: number): boolean {
  return year >= MIN_LUNAR_YEAR && year <= MAX_LUNAR_YEAR;
}

function lunarYearDays(y: number): number {
  let sum = 348;
  const info = lunarInfo(y);
  for (let i = 0x8000; i > 0x8; i >>= 1) {
    sum += (info & i) ? 1 : 0;
  }
  return sum + leapDays(y);
}

function leapMonth(y: number): number {
  return lunarInfo(y) & 0xf;
}

function leapDays(y: number): number {
  if (leapMonth(y)) {
    return (lunarInfo(y) & 0x10000) ? 30 : 29;
  }
  return 0;
}

function monthDays(y: number, m: number): number {
  return (lunarInfo(y) & (0x10000 >> m)) ? 30 : 29;
}

function getGanzhiYear(year: number): string {
  const idx = (year - 4) % 60;
  return HEAVENLY_STEMS[idx % 10] + EARTHLY_BRANCHES[idx % 12];
}

function getFallbackLunarDate(year: number, month: number, day: number): LunarDate {
  return {
    year,
    month,
    day,
    isLeap: false,
    monthStr: `${month}月`,
    dayStr: `${day}日`,
    ganzhi: getGanzhiYear(year),
    zodiac: ZODIAC_ANIMALS[(year - 4) % 12],
    supported: false,
  };
}

export function solarToLunar(solarYear: number, solarMonth: number, solarDay: number): LunarDate {
  if (!isSupportedLunarYear(solarYear)) {
    return getFallbackLunarDate(solarYear, solarMonth, solarDay);
  }

  const baseDate = new Date(MIN_LUNAR_YEAR, 0, 31);
  const objDate = new Date(solarYear, solarMonth - 1, solarDay);
  let offset = Math.floor((objDate.getTime() - baseDate.getTime()) / 86400000);

  let lunarYear = MIN_LUNAR_YEAR;
  let temp = 0;
  for (lunarYear = MIN_LUNAR_YEAR; lunarYear <= MAX_LUNAR_YEAR && offset > 0; lunarYear++) {
    temp = lunarYearDays(lunarYear);
    offset -= temp;
  }
  if (offset < 0) {
    offset += temp;
    lunarYear--;
  }

  const leap = leapMonth(lunarYear);
  let isLeap = false;
  let lunarMonth = 1;

  for (lunarMonth = 1; lunarMonth < 13 && offset > 0; lunarMonth++) {
    if (leap > 0 && lunarMonth === (leap + 1) && !isLeap) {
      --lunarMonth;
      isLeap = true;
      temp = leapDays(lunarYear);
    } else {
      temp = monthDays(lunarYear, lunarMonth);
    }
    if (isLeap && lunarMonth === (leap + 1)) {
      isLeap = false;
    }
    offset -= temp;
  }

  if (offset === 0 && leap > 0 && lunarMonth === leap + 1) {
    if (isLeap) {
      isLeap = false;
    } else {
      isLeap = true;
      --lunarMonth;
    }
  }
  if (offset < 0) {
    offset += temp;
    --lunarMonth;
  }

  const lunarDay = offset + 1;
  return {
    year: lunarYear,
    month: lunarMonth,
    day: lunarDay,
    isLeap,
    monthStr: (isLeap ? '闰' : '') + LUNAR_MONTHS[lunarMonth - 1] + '月',
    dayStr: LUNAR_DAYS[lunarDay - 1],
    ganzhi: getGanzhiYear(lunarYear),
    zodiac: ZODIAC_ANIMALS[(lunarYear - 4) % 12],
    supported: true,
  };
}

export function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function getDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getMonthDayKey(date: Date): string {
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isSameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function festival(
  id: string,
  nameZh: string,
  nameEn: string,
  shortZh: string,
  shortEn: string,
  category: CalendarFestivalCategory,
  priority: number,
): CalendarFestival {
  return { id, nameZh, nameEn, shortZh, shortEn, category, priority };
}

const CHINESE_SOLAR_FESTIVALS: Record<string, CalendarFestival[]> = {
  '01-01': [festival('cn-new-year', '元旦', "New Year's Day", '元旦', 'New Year', 'chinese', 70)],
  '03-08': [festival('womens-day', '妇女节', "International Women's Day", '妇女节', "Women's", 'chinese', 55)],
  '03-12': [festival('arbor-day-cn', '植树节', 'China Arbor Day', '植树节', 'Arbor', 'chinese', 50)],
  '05-01': [festival('labour-day-cn', '劳动节', 'Labour Day', '劳动节', 'Labour', 'chinese', 65)],
  '05-04': [festival('youth-day-cn', '青年节', 'Youth Day', '青年节', 'Youth', 'chinese', 50)],
  '06-01': [festival('children-day-cn', '儿童节', "Children's Day", '儿童节', 'Children', 'chinese', 55)],
  '08-01': [festival('army-day-cn', '建军节', 'PLA Army Day', '建军节', 'Army', 'chinese', 50)],
  '09-10': [festival('teachers-day-cn', '教师节', "Teachers' Day", '教师节', 'Teachers', 'chinese', 55)],
  '10-01': [festival('national-day-cn', '国庆节', 'China National Day', '国庆节', 'National', 'chinese', 80)],
};

const LUNAR_FESTIVALS: Record<string, CalendarFestival[]> = {
  '01-01': [festival('spring-festival', '春节', 'Spring Festival', '春节', 'Spring', 'chinese', 100)],
  '01-15': [festival('lantern-festival', '元宵节', 'Lantern Festival', '元宵', 'Lantern', 'chinese', 90)],
  '02-02': [festival('dragon-heads-raising-day', '龙抬头', 'Dragon Heads-raising Day', '龙抬头', 'Dragon', 'chinese', 65)],
  '05-05': [festival('dragon-boat-festival', '端午节', 'Dragon Boat Festival', '端午节', 'Dragon Boat', 'chinese', 95)],
  '07-07': [festival('qixi-festival', '七夕节', 'Qixi Festival', '七夕', 'Qixi', 'chinese', 80)],
  '07-15': [festival('ghost-festival', '中元节', 'Ghost Festival', '中元', 'Ghost', 'chinese', 70)],
  '08-15': [festival('mid-autumn-festival', '中秋节', 'Mid-Autumn Festival', '中秋节', 'Mid-Autumn', 'chinese', 95)],
  '09-09': [festival('double-ninth-festival', '重阳节', 'Double Ninth Festival', '重阳', 'Double 9th', 'chinese', 80)],
  '12-08': [festival('laba-festival', '腊八节', 'Laba Festival', '腊八', 'Laba', 'chinese', 70)],
  '12-23': [festival('little-new-year-north', '北方小年', 'Little New Year', '小年', 'Little New', 'chinese', 65)],
  '12-24': [festival('little-new-year-south', '南方小年', 'Little New Year', '小年', 'Little New', 'chinese', 65)],
};

const INTERNATIONAL_SOLAR_FESTIVALS: Record<string, CalendarFestival[]> = {
  '02-14': [festival('valentines-day', '情人节', "Valentine's Day", '情人节', 'Valentine', 'international', 60)],
  '03-17': [festival('st-patricks-day', '圣帕特里克节', "St. Patrick's Day", '圣帕特', 'St Patrick', 'international', 45)],
  '04-01': [festival('april-fools-day', '愚人节', "April Fools' Day", '愚人节', 'April Fool', 'international', 50)],
  '04-22': [festival('earth-day', '世界地球日', 'Earth Day', '地球日', 'Earth Day', 'international', 45)],
  '10-31': [festival('halloween', '万圣夜', 'Halloween', '万圣夜', 'Halloween', 'international', 60)],
  '12-24': [festival('christmas-eve', '平安夜', 'Christmas Eve', '平安夜', 'Xmas Eve', 'international', 60)],
  '12-25': [festival('christmas', '圣诞节', 'Christmas Day', '圣诞节', 'Christmas', 'international', 70)],
  '12-31': [festival('new-years-eve', '跨年夜', "New Year's Eve", '跨年', 'NYE', 'international', 60)],
};

const SOLAR_TERM_NAMES_ZH = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分',
  '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分',
  '寒露', '霜降', '立冬', '小雪', '大雪', '冬至',
];

const SOLAR_TERM_NAMES_EN = [
  'Minor Cold', 'Major Cold', 'Start of Spring', 'Rain Water', 'Awakening of Insects', 'Spring Equinox',
  'Qingming', 'Grain Rain', 'Start of Summer', 'Grain Buds', 'Grain in Ear', 'Summer Solstice',
  'Minor Heat', 'Major Heat', 'Start of Autumn', 'End of Heat', 'White Dew', 'Autumn Equinox',
  'Cold Dew', 'Frost Descent', 'Start of Winter', 'Minor Snow', 'Major Snow', 'Winter Solstice',
];

const SOLAR_TERM_INFO = [
  0, 21208, 42467, 63836, 85337, 107014,
  128867, 150921, 173149, 195551, 218072, 240693,
  263343, 285989, 308563, 331033, 353350, 375494,
  397447, 419210, 440795, 462224, 483532, 504758,
];

const solarTermCache = new Map<number, Map<string, CalendarFestival>>();

function getSolarTermDate(year: number, index: number): Date {
  const timestamp = Date.UTC(1900, 0, 6, 2, 5)
    + 31556925974.7 * (year - 1900)
    + SOLAR_TERM_INFO[index] * 60000;
  const beijingDate = new Date(timestamp + 8 * 60 * 60 * 1000);
  return new Date(beijingDate.getUTCFullYear(), beijingDate.getUTCMonth(), beijingDate.getUTCDate());
}

function getSolarTermMap(year: number): Map<string, CalendarFestival> {
  const cached = solarTermCache.get(year);
  if (cached) return cached;

  const map = new Map<string, CalendarFestival>();
  SOLAR_TERM_NAMES_ZH.forEach((nameZh, index) => {
    const nameEn = SOLAR_TERM_NAMES_EN[index];
    map.set(getDateKey(getSolarTermDate(year, index)), festival(
      `solar-term-${index}`,
      nameZh,
      nameEn,
      nameZh,
      nameEn,
      index === 6 ? 'chinese' : 'solarTerm',
      index === 6 ? 88 : 58,
    ));
  });
  solarTermCache.set(year, map);
  return map;
}

function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function isNthWeekdayOfMonth(date: Date, monthIndex: number, weekday: number, nth: number): boolean {
  if (date.getMonth() !== monthIndex || date.getDay() !== weekday) return false;
  return Math.floor((date.getDate() - 1) / 7) + 1 === nth;
}

function isLastWeekdayOfMonth(date: Date, monthIndex: number, weekday: number): boolean {
  if (date.getMonth() !== monthIndex || date.getDay() !== weekday) return false;
  return addDays(date, 7).getMonth() !== monthIndex;
}

function getDynamicInternationalFestivals(date: Date): CalendarFestival[] {
  const year = date.getFullYear();
  const key = getDateKey(date);
  const easter = getEasterDate(year);
  const thanksgiving = (() => {
    for (let day = 22; day <= 28; day++) {
      const candidate = new Date(year, 10, day);
      if (candidate.getDay() === 4) return candidate;
    }
    return new Date(year, 10, 26);
  })();

  const festivals: CalendarFestival[] = [];
  if (key === getDateKey(addDays(easter, -2))) {
    festivals.push(festival('good-friday', '耶稣受难日', 'Good Friday', '受难日', 'Good Fri', 'international', 52));
  }
  if (key === getDateKey(easter)) {
    festivals.push(festival('easter', '复活节', 'Easter', '复活节', 'Easter', 'international', 62));
  }
  if (isNthWeekdayOfMonth(date, 0, 1, 3)) {
    festivals.push(festival('mlk-day', '马丁路德金纪念日', 'Martin Luther King Jr. Day', 'MLK日', 'MLK Day', 'international', 42));
  }
  if (isNthWeekdayOfMonth(date, 1, 1, 3)) {
    festivals.push(festival('presidents-day', '美国总统日', "Presidents' Day", '总统日', 'Presidents', 'international', 42));
  }
  if (isNthWeekdayOfMonth(date, 4, 0, 2)) {
    festivals.push(festival('mothers-day', '母亲节', "Mother's Day", '母亲节', 'Mother', 'international', 62));
  }
  if (isLastWeekdayOfMonth(date, 4, 1)) {
    festivals.push(festival('memorial-day-us', '美国阵亡将士纪念日', 'Memorial Day', '纪念日', 'Memorial', 'international', 42));
  }
  if (isNthWeekdayOfMonth(date, 5, 0, 3)) {
    festivals.push(festival('fathers-day', '父亲节', "Father's Day", '父亲节', 'Father', 'international', 62));
  }
  if (isNthWeekdayOfMonth(date, 8, 1, 1)) {
    festivals.push(festival('labor-day-us', '美国劳动节', 'Labor Day', 'Labor Day', 'Labor', 'international', 42));
  }
  if (key === getDateKey(thanksgiving)) {
    festivals.push(festival('thanksgiving', '感恩节', 'Thanksgiving', '感恩节', 'Thanks', 'international', 62));
  }
  if (key === getDateKey(addDays(thanksgiving, 1))) {
    festivals.push(festival('black-friday', '黑色星期五', 'Black Friday', '黑五', 'Black Fri', 'international', 50));
  }
  if (key === getDateKey(addDays(thanksgiving, 4))) {
    festivals.push(festival('cyber-monday', '网络星期一', 'Cyber Monday', '网一', 'Cyber Mon', 'international', 45));
  }
  return festivals;
}

export function getFestivalsForDate(date: Date, lunar = solarToLunar(date.getFullYear(), date.getMonth() + 1, date.getDate())): CalendarFestival[] {
  const solarKey = getMonthDayKey(date);
  const lunarKey = `${pad(lunar.month)}-${pad(lunar.day)}`;
  const festivals: CalendarFestival[] = [
    ...(CHINESE_SOLAR_FESTIVALS[solarKey] ?? []),
    ...(INTERNATIONAL_SOLAR_FESTIVALS[solarKey] ?? []),
    ...(lunar.isLeap ? [] : (LUNAR_FESTIVALS[lunarKey] ?? [])),
    ...getDynamicInternationalFestivals(date),
  ];

  if (lunar.supported && !lunar.isLeap && lunar.month === 12 && lunar.day === monthDays(lunar.year, 12)) {
    festivals.push(festival('lunar-new-years-eve', '除夕', "Lunar New Year's Eve", '除夕', 'Lunar Eve', 'chinese', 98));
  }

  const solarTerm = getSolarTermMap(date.getFullYear()).get(getDateKey(date));
  if (solarTerm) {
    festivals.push(solarTerm);
  }

  return festivals.sort((a, b) => b.priority - a.priority);
}

export function buildCalendarMonth(year: number, monthIndex: number, today = new Date()): CalendarDay[] {
  const first = new Date(year, monthIndex, 1);
  const start = addDays(first, -first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(start, index);
    const lunar = solarToLunar(date.getFullYear(), date.getMonth() + 1, date.getDate());
    return {
      date,
      key: getDateKey(date),
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === monthIndex,
      isToday: isSameDate(date, today),
      lunar,
      festivals: getFestivalsForDate(date, lunar),
    };
  });
}

export function getCalendarCellLabel(day: CalendarDay, isZh: boolean): string {
  const festivalLabel = day.festivals[0];
  if (festivalLabel) return isZh ? festivalLabel.shortZh : festivalLabel.shortEn;
  if (!day.lunar.supported) return '';
  if (day.lunar.day === 1) return isZh ? day.lunar.monthStr : `L${day.lunar.month}`;
  return isZh ? day.lunar.dayStr : String(day.lunar.day);
}

export function getUpcomingCalendarEvents(startDate: Date, limit = 10, searchDays = 120): UpcomingCalendarEvent[] {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const events: UpcomingCalendarEvent[] = [];

  for (let offset = 0; offset <= searchDays && events.length < limit; offset++) {
    const date = addDays(start, offset);
    const festivals = getFestivalsForDate(date);
    festivals.forEach((item) => {
      if (events.length < limit) {
        events.push({
          date,
          key: `${getDateKey(date)}-${item.id}`,
          festival: item,
          daysAway: offset,
        });
      }
    });
  }

  return events;
}

export function formatLunarDate(lunar: LunarDate, isZh: boolean): string {
  if (!lunar.supported) return isZh ? '农历超出支持范围' : 'Lunar date out of range';
  if (isZh) return `${lunar.ganzhi}年 ${lunar.zodiac}年 ${lunar.monthStr}${lunar.dayStr}`;
  return `${lunar.ganzhi} year of the ${lunar.zodiac}, Lunar ${lunar.month}/${lunar.day}`;
}
