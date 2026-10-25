/**
 * Sports Lottery Sales Day (竞彩销售日) & Match Kickoff Time Extraction Engine
 * 
 * 核心业务规则：
 * 1. 销售日周期：当日早上 11:00 至次日早上 11:00 为一个销售日。
 *    - 若比赛在 11:00 及之后开赛，属于当天销售日 (YYYY-MM-DD)。
 *    - 若比赛在 11:00 之前开赛 (如凌晨 00:00~10:59 欧冠/美职联/早场比赛)，属于前一天销售日 (YYYY-MM-DD - 1天)。
 * 2. 深度识别 Markdown 与文本中的各种开赛时间格式：
 *    - 显式标签: "开赛时间: 2026-03-28 23:00", "比赛时间: 03-29 03:00", "开赛：23:00"
 *    - 表格列: | 欧冠 | 2026-03-28 23:00 | 曼城 | 皇马 | 或 | 23:00 |
 *    - 标题/括号: "## 【1】曼城 vs 皇马 (2026-03-28 23:00)"
 *    - 竞彩对阵编码: "周六001 23:00"
 * 3. 销售日归组与赛果对照：
 *    - 复盘严格以比赛所属销售日为基准归类，彻底杜绝“跨天复盘导致同轮次赛事被分割到两天”的混乱。
 */

import type { PostMatchReview } from '../types/fortuneActuary';

export interface SalesDateInfo {
  salesDate: string;             // YYYY-MM-DD, e.g. "2026-03-28"
  salesDateLabel: string;        // e.g. "2026年03月28日 销售日"
  salesCycleText: string;        // e.g. "03-28 11:00 ~ 03-29 11:00"
  dayOfWeek: string;             // e.g. "星期六"
  isCurrentSalesDay: boolean;    // 当前系统时间是否在此销售周期内
  kickoffTimeFormatted: string;  // 格式化后的开赛时间
}

export const TEAM_ALIASES: Array<[string, string]> = [
  // Premier League
  ['曼城', '曼彻斯特城'],
  ['曼联', '曼彻斯特联'],
  ['热刺', '托特纳姆热刺'],
  ['纽卡', '纽卡斯尔联'],
  ['纽卡', '纽卡斯尔'],
  ['狼队', '伍尔弗汉普顿流浪者'],
  ['狼队', '伍尔弗汉普顿'],
  ['西汉姆', '西汉姆联'],
  ['诺丁汉', '诺丁汉森林'],
  ['森林', '诺丁汉森林'],
  ['维拉', '阿斯顿维拉'],
  ['莱斯特', '莱斯特城'],
  ['布莱顿', '海鸥'],

  // La Liga
  ['皇马', '皇家马德里'],
  ['马竞', '马德里竞技'],
  ['巴萨', '巴塞罗那'],
  ['毕尔巴鄂', '毕尔巴鄂竞技'],
  ['毕巴', '毕尔巴鄂竞技'],
  ['毕巴', '毕尔巴鄂'],
  ['皇家社会', '皇社'],
  ['贝蒂斯', '皇家贝蒂斯'],
  ['塞维利亚', '塞维'],
  ['西班牙人', '皇家西班牙人'],
  ['赫塔菲', '赫塔费'],
  ['塞尔塔', '维戈塞尔塔'],

  // Serie A
  ['国米', '国际米兰'],
  ['AC米兰', '米兰'],
  ['尤文', '尤文图斯'],
  ['那不勒斯', '拿坡里'],
  ['罗马', '罗马'],
  ['拉齐奥', '拉齐奥'],
  ['佛罗伦萨', '紫百合'],
  ['亚特兰大', '亚特兰大'],

  // Bundesliga
  ['拜仁', '拜仁慕尼黑'],
  ['多特', '多特蒙德'],
  ['莱比锡', 'RB莱比锡'],
  ['莱比锡', '莱比锡红牛'],
  ['勒沃库森', '药厂'],
  ['勒沃库森', '拜耳勒沃库森'],
  ['门兴', '门兴格拉德巴赫'],
  ['不来梅', '云达不来梅'],
  ['狼堡', '沃尔夫斯堡'],

  // Ligue 1
  ['巴黎', '巴黎圣日耳曼'],
  ['摩纳哥', '摩纳哥'],
  ['马赛', '马赛'],
  ['里昂', '奥林匹克里昂'],
  ['里尔', '里尔'],
  ['雷恩', '雷恩'],
  ['尼斯', '尼斯'],
  ['朗斯', '朗斯'],
];

export function normalizeTeamName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[队fc俱乐部联城\s·\-_\/]/g, '')
    .trim();
}

/**
 * Intelligent Team Matching with Aliases, Substrings and Character Overlap
 */
export function matchTeamsFuzzy(nameA: string, nameB: string): boolean {
  if (!nameA || !nameB) return false;
  const rawA = nameA.trim();
  const rawB = nameB.trim();
  if (rawA === rawB) return true;

  const normA = normalizeTeamName(rawA);
  const normB = normalizeTeamName(rawB);
  if (normA && normA === normB) return true;

  if (normA.length >= 2 && normB.length >= 2) {
    if (normA.includes(normB) || normB.includes(normA)) return true;
  }

  // Alias dictionary check
  for (const [aliasA, aliasB] of TEAM_ALIASES) {
    const isA1 = rawA.includes(aliasA) || aliasA.includes(rawA);
    const isB2 = rawB.includes(aliasB) || aliasB.includes(rawB);
    if (isA1 && isB2) return true;

    const isA2 = rawA.includes(aliasB) || aliasB.includes(rawA);
    const isB1 = rawB.includes(aliasA) || aliasA.includes(rawB);
    if (isA2 && isB1) return true;
  }

  // Character overlap ratio
  const setA = new Set(normA.split(''));
  let overlap = 0;
  for (const ch of normB) {
    if (setA.has(ch)) overlap++;
  }
  const minLen = Math.min(normA.length, normB.length);
  if (minLen >= 2 && overlap / minLen >= 0.6) {
    return true;
  }

  return false;
}

/** Sales dates use Beijing time (UTC+8), independently of the browser timezone. */
const SALES_TIMEZONE_OFFSET = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?/;
const TIME_PATTERN = /(\d{1,2})[:：](\d{2})(?::\d{2})?/;

function calendarDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
    ? date : null;
}

function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function parseSalesDate(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  return calendarDate(year, month, day);
}

function businessDate(timestamp: number): Date {
  return new Date(timestamp + SALES_TIMEZONE_OFFSET);
}

function activeSalesDate(timestamp: number): Date {
  const wallTime = businessDate(timestamp);
  const date = calendarDate(wallTime.getUTCFullYear(), wallTime.getUTCMonth() + 1, wallTime.getUTCDate())!;
  if (wallTime.getUTCHours() < 11) date.setUTCDate(date.getUTCDate() - 1);
  return date;
}

function normalizeDateString(raw: string): string | null {
  const match = raw.match(DATE_PATTERN);
  if (!match) return null;
  const date = calendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
  return date ? dateKey(date) : null;
}

/** Extract the document's sales-day heading, before considering individual match dates. */
export function extractDocumentGlobalDate(text: string): string | null {
  if (!text) return null;
  const cleaned = text.replace(/\*\*/g, '');
  const salesLabel = cleaned.match(/销售日(?:期)?[：:\s]+(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?)/);
  if (salesLabel) return normalizeDateString(salesLabel[1]);
  const heading = cleaned.match(/^#+[^\n]*(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?)/m);
  if (heading) return normalizeDateString(heading[1]);
  const label = cleaned.match(/(?:^|\n)\s*(?:日期|比赛日|开赛日期)[：:\s]+(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?)/);
  if (label) return normalizeDateString(label[1]);
  return normalizeDateString(cleaned.slice(0, 500));
}

function cleanKickoffTime(raw: string): string {
  return raw.trim().replace(/[/.]/g, '-').replace(/：/g, ':').replace(/\s+/g, ' ')
    .replace(/(\d{1,2}:\d{2}):\d{2}/, '$1');
}

function validTime(hour: number, minute: number): boolean {
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60;
}

/** A calendar date is evidence only when it is valid; generated "日期 临场" is not a kickoff. */
export function hasExplicitKickoffDate(value?: string): boolean {
  if (!value || /临场|已完场/.test(value)) return false;
  const full = value.match(DATE_PATTERN);
  if (full) return !!calendarDate(Number(full[1]), Number(full[2]), Number(full[3]));
  return /\d{1,2}[-/.月]\d{1,2}日?\s+\d{1,2}[:：]\d{2}/.test(value);
}

/** Extract kickoff time, resolving time-only entries within the document's sales cycle. */
export function extractKickoffTime(sectionOrLine: string, documentContext?: string): string {
  if (!sectionOrLine?.trim()) return '临场';
  const text = sectionOrLine.replace(/\*\*/g, '').trim();
  const anchor = documentContext ? extractDocumentGlobalDate(documentContext) : null;
  const full = text.match(/20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?(?:\s*(?:周|星期)[一二三四五六日天])?[T\s]+\d{1,2}[:：]\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/i);
  if (full) return calculateSalesDate(full[0]).kickoffTimeFormatted;
  const monthDay = text.match(/(?:^|[^\d-])(\d{1,2}[-/.月]\d{1,2}日?\s+\d{1,2}[:：]\d{2})/);
  if (monthDay) return calculateSalesDate(monthDay[1], undefined, anchor || undefined).kickoffTimeFormatted;
  const label = text.match(/(?:开赛时间|比赛时间|开赛时刻|开赛|时刻|时间)[：:\s]+((?:(?:次日|翌日)\s*)?\d{1,2}[:：]\d{2})/);
  const tableTime = text.split('|').map(col => col.trim()).find(col => /^\d{1,2}[:：]\d{2}$/.test(col));
  const standalone = text.match(/(?:^|\s|[（(【])((?:(?:次日|翌日)\s*)?\d{1,2}[:：]\d{2})(?=$|\s|[）)】])/);
  const value = label?.[1] || tableTime || standalone?.[1];
  if (value) {
    const time = value.match(TIME_PATTERN)!;
    if (!validTime(Number(time[1]), Number(time[2]))) return '临场';
    if (anchor) {
      const day = parseSalesDate(anchor)!;
      if (Number(time[1]) < 11 || /次日|翌日/.test(value)) day.setUTCDate(day.getUTCDate() + 1);
      return `${dateKey(day)} ${String(Number(time[1])).padStart(2, '0')}:${time[2]}`;
    }
    // Retain the weekday when present, instead of throwing away useful date context.
    const weekday = text.match(/(?:周|星期)[一二三四五六日天](?:\d{3})?/);
    return `${weekday ? weekday[0] + ' ' : ''}${cleanKickoffTime(value)}`;
  }
  const dateLabel = text.match(/(?:开赛时间|比赛时间|开赛日期)[：:\s]+(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?)/);
  return dateLabel ? normalizeDateString(dateLabel[1]) || '临场' : '临场';
}

/** [11:00, next day 11:00): explicit kickoff dates always win over a batch anchor. */
export function calculateSalesDate(
  kickoffTime?: string,
  fallbackTimestamp?: number,
  preferredSalesDate?: string
): SalesDateInfo {
  const timestamp = Number.isFinite(fallbackTimestamp) ? fallbackTimestamp! : Date.now();
  const anchor = parseSalesDate(preferredSalesDate);
  const fallback = activeSalesDate(timestamp);
  const reference = anchor || fallback;
  const text = (kickoffTime || '').trim();
  const time = text.match(TIME_PATTERN);
  const hour = time ? Number(time[1]) : 12;
  const minute = time ? Number(time[2]) : 0;
  let kickoffDate: Date | null = null;
  let resolvedHour = hour;
  let resolvedMinute = minute;
  let explicit = false;

  if (!/临场|已完场/.test(text) && validTime(hour, minute)) {
    // Zoned ISO timestamps represent instants; display them in Beijing time.
    if (/^20\d{2}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
      const parsed = Date.parse(text.replace(' ', 'T'));
      const isoDate = text.match(DATE_PATTERN)!;
      if (Number.isFinite(parsed) && calendarDate(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]))) {
        const wallTime = businessDate(parsed);
        kickoffDate = calendarDate(wallTime.getUTCFullYear(), wallTime.getUTCMonth() + 1, wallTime.getUTCDate());
        resolvedHour = wallTime.getUTCHours();
        resolvedMinute = wallTime.getUTCMinutes();
        explicit = true;
      }
    } else {
      const full = text.match(DATE_PATTERN);
      const md = !full && text.match(/(\d{1,2})[-/.月](\d{1,2})日?\s+\d{1,2}[:：]\d{2}/);
      if (full) {
        kickoffDate = calendarDate(Number(full[1]), Number(full[2]), Number(full[3]));
        explicit = !!kickoffDate;
      } else if (md) {
        // Choose the nearest year to the anchor, including December/January rollover.
        const year = reference.getUTCFullYear();
        const candidates = [year - 1, year, year + 1]
          .map(y => calendarDate(y, Number(md[1]), Number(md[2])))
          .filter((date): date is Date => !!date)
          .sort((a, b) => Math.abs(a.getTime() - reference.getTime()) - Math.abs(b.getTime() - reference.getTime()));
        kickoffDate = candidates[0] || null;
        explicit = !!kickoffDate;
      } else {
        const weekday = text.match(/(?:周|星期)([一二三四五六日天])/);
        if (weekday) {
          const weekdayMap: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
          const target = weekdayMap[weekday[1]];
          // 竞彩编号中的周几是销售日；凌晨场次在该销售日的次日开赛。
          const lotteryCode = /(?:周|星期)[一二三四五六日天]\d{3}/.test(text);
          let difference = target - reference.getUTCDay();
          if (difference > 3) difference -= 7;
          if (difference < -3) difference += 7;
          kickoffDate = new Date(reference.getTime());
          kickoffDate.setUTCDate(kickoffDate.getUTCDate() + difference + (lotteryCode && hour < 11 ? 1 : 0));
          explicit = true;
        } else if (time) {
          kickoffDate = new Date(reference.getTime());
          if (hour < 11 || /次日|翌日/.test(text)) kickoffDate.setUTCDate(kickoffDate.getUTCDate() + 1);
        }
      }
    }
  }

  let salesDateObj = new Date(reference.getTime());
  let kickoffTimeFormatted = text || '临场';
  if (kickoffDate) {
    salesDateObj = new Date(kickoffDate.getTime());
    if (resolvedHour < 11) salesDateObj.setUTCDate(salesDateObj.getUTCDate() - 1);
    if (explicit) {
      kickoffTimeFormatted = dateKey(kickoffDate) + (time ? ` ${String(resolvedHour).padStart(2, '0')}:${String(resolvedMinute).padStart(2, '0')}` : '');
    }
  }
  const salesDate = dateKey(salesDateObj);
  const nextDay = new Date(salesDateObj.getTime() + DAY_MS);
  const [year, month, day] = salesDate.split('-');
  return {
    salesDate,
    salesDateLabel: `${year}年${month}月${day}日 销售日`,
    salesCycleText: `${salesDate.slice(5)} 11:00 ~ ${dateKey(nextDay).slice(5)} 11:00`,
    dayOfWeek: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][salesDateObj.getUTCDay()],
    isCurrentSalesDay: salesDate === dateKey(activeSalesDate(Date.now())),
    kickoffTimeFormatted,
  };
}

/** Prefer raw kickoff evidence over old generated display dates. Manual corrections are explicit. */
export function getReviewSalesInfo(review: PostMatchReview): SalesDateInfo {
  const raw = review.matchData?.matchInfo?.matchTime || '';
  const savedKickoff = review.kickoffTime || '';
  const hasUsefulTime = (value: string) => !/临场|已完场/.test(value) && (hasExplicitKickoffDate(value) || TIME_PATTERN.test(value) || /(?:周|星期)[一二三四五六日天]/.test(value));
  let kickoff = hasUsefulTime(raw) ? raw : hasUsefulTime(savedKickoff) ? savedKickoff : '临场';
  if (!hasExplicitKickoffDate(raw)) {
    const storyTime = extractKickoffTime(review.matchData?.matchInfo?.marketStory || '');
    if (hasExplicitKickoffDate(storyTime) || (kickoff === '临场' && storyTime !== '临场')) kickoff = storyTime;
  }
  const override = parseSalesDate(review.salesDateOverride) ? review.salesDateOverride : undefined;
  if (override) {
    return { ...calculateSalesDate(undefined, review.reviewTimestamp, override), kickoffTimeFormatted: kickoff };
  }
  // Weekdays are relative calendar evidence; use the historical timestamp rather than a wrong stored group.
  const preferred = /(?:周|星期)[一二三四五六日天]/.test(kickoff) ? undefined : review.salesDate;
  return calculateSalesDate(kickoff, review.reviewTimestamp, preferred);
}

export function detectDominantSalesDate(items: Array<{
  matchInfo?: { matchTime?: string };
  data?: { matchInfo?: { matchTime?: string } };
  timestamp?: number;
  salesDate?: string;
}>): string | null {
  const counts = new Map<string, number>();
  for (const item of items || []) {
    const time = item.data?.matchInfo?.matchTime || item.matchInfo?.matchTime;
    const info = calculateSalesDate(time, item.timestamp, item.salesDate);
    counts.set(info.salesDate, (counts.get(info.salesDate) || 0) + (hasExplicitKickoffDate(time) ? 3 : 1));
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

export function calibrateReviewSalesDate(review: PostMatchReview, anchorSalesDate?: string): PostMatchReview {
  const info = getReviewSalesInfo(anchorSalesDate ? { ...review, salesDate: anchorSalesDate } : review);
  return { ...review, salesDate: info.salesDate, salesDateLabel: info.salesDateLabel,
    salesCycleText: info.salesCycleText, kickoffTime: info.kickoffTimeFormatted };
}

/** Explicitly confirmed grouping keeps the original kickoff data for later inspection. */
export function unifyReviewsToOneSalesDay(reviews: PostMatchReview[], targetSalesDate: string): PostMatchReview[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetSalesDate) || !parseSalesDate(targetSalesDate)) return reviews;
  return reviews.map(review => calibrateReviewSalesDate({ ...review, salesDateOverride: targetSalesDate }));
}

export interface ParsedKickoffDetails {
  raw: string;
  hasTime: boolean;
  timeOnly: string; // e.g. "20:30" or "02:45"
  hour: number;
  minute: number;
  salesDayOffset: number; // 0..1439 minutes from 11:00 AM of sales day
  displayLabel: string;
  kickoffTimestamp: number;
  isStarted: boolean;
  salesDate: string;
}

/**
 * Returns minute offset from 11:00 AM of lottery sales cycle (11:00 AM -> next day 10:59 AM)
 * Hour 11:00 -> 0; Hour 23:00 -> 720; Hour 00:00 (next day) -> 780; Hour 02:45 -> 945
 */
export function getSalesDayMinuteOffset(hour: number, minute: number): number {
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return 9999;
  if (hour >= 11) {
    return (hour - 11) * 60 + minute;
  } else {
    return (hour + 13) * 60 + minute;
  }
}

/**
 * Robustly parses match kickoff time into structured components and exact Beijing/UTC epoch timestamp
 */
export function parseKickoffDetails(
  matchTime?: string,
  fallbackTimestamp?: number,
  nowMs: number = Date.now()
): ParsedKickoffDetails {
  const raw = (matchTime || '').trim();
  const salesInfo = calculateSalesDate(raw, fallbackTimestamp);
  const timeMatch = raw.match(/(\d{1,2})[:：](\d{2})/);

  if (!timeMatch || /临场|已完场/.test(raw)) {
    return {
      raw,
      hasTime: false,
      timeOnly: '',
      hour: -1,
      minute: -1,
      salesDayOffset: 9999,
      displayLabel: raw || '临场',
      kickoffTimestamp: Infinity,
      isStarted: false,
      salesDate: salesInfo.salesDate,
    };
  }

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (!validTime(hour, minute)) {
    return {
      raw,
      hasTime: false,
      timeOnly: '',
      hour: -1,
      minute: -1,
      salesDayOffset: 9999,
      displayLabel: raw || '临场',
      kickoffTimestamp: Infinity,
      isStarted: false,
      salesDate: salesInfo.salesDate,
    };
  }

  const timeOnly = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const salesDayOffset = getSalesDayMinuteOffset(hour, minute);

  // Resolve calendar date in Beijing time (UTC+8)
  const dateMatch = salesInfo.kickoffTimeFormatted.match(/(20\d{2})-(\d{2})-(\d{2})/);
  let year: number;
  let month: number;
  let day: number;

  if (dateMatch) {
    year = Number(dateMatch[1]);
    month = Number(dateMatch[2]);
    day = Number(dateMatch[3]);
  } else {
    const [sYear, sMonth, sDay] = salesInfo.salesDate.split('-').map(Number);
    year = sYear;
    month = sMonth;
    day = sDay;
    if (hour < 11 || /次日|翌日/.test(raw)) {
      const nextDayDate = new Date(Date.UTC(year, month - 1, day + 1));
      year = nextDayDate.getUTCFullYear();
      month = nextDayDate.getUTCMonth() + 1;
      day = nextDayDate.getUTCDate();
    }
  }

  const kickoffTimestamp = Date.UTC(year, month - 1, day, hour, minute) - SALES_TIMEZONE_OFFSET;
  const isStarted = Number.isFinite(kickoffTimestamp) && kickoffTimestamp <= nowMs;

  return {
    raw,
    hasTime: true,
    timeOnly,
    hour,
    minute,
    salesDayOffset,
    displayLabel: salesInfo.kickoffTimeFormatted || timeOnly,
    kickoffTimestamp,
    isStarted,
    salesDate: salesInfo.salesDate,
  };
}

/**
 * Intelligently normalizes flexible user cutoff input (e.g. "0030", "00.30", "00点30分", "00:30", "周日 00:30")
 */
export function normalizeCutoffTimeInput(input: string): string {
  if (!input) return '';
  let cleaned = input.trim().replace(/：/g, ':');
  // Handle Chinese style e.g. "00点30分" or "00点30"
  const cnMatch = cleaned.match(/(\d{1,2})点(\d{2})/);
  if (cnMatch) {
    return `${cnMatch[1].padStart(2, '0')}:${cnMatch[2]}`;
  }
  // Handle 4 continuous digits e.g. "0030" or "2300"
  const fourDigit = cleaned.match(/^(\d{2})(\d{2})$/);
  if (fourDigit) {
    return `${fourDigit[1]}:${fourDigit[2]}`;
  }
  // Handle dot or dash separation e.g. "00.30" or "00-30"
  const dotSeparated = cleaned.match(/^(\d{1,2})[.\-_](\d{2})$/);
  if (dotSeparated) {
    return `${dotSeparated[1].padStart(2, '0')}:${dotSeparated[2]}`;
  }
  // Standard HH:mm extraction if there are surrounding characters
  const stdMatch = cleaned.match(/(\d{1,2})[:：](\d{2})/);
  if (stdMatch) {
    const prefixDate = cleaned.match(/(?:20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?|\d{1,2}[-/.月]\d{1,2}日?|(?:周|星期)[一二三四五六日天])/);
    const timeFormatted = `${stdMatch[1].padStart(2, '0')}:${stdMatch[2]}`;
    return prefixDate ? `${prefixDate[0]} ${timeFormatted}` : timeFormatted;
  }
  return cleaned;
}

/**
 * Compares whether matchTime is before or at cutoffStr
 * mode 'lte': <= cutoff (chronologically earlier or equal)
 * mode 'exact': == cutoff
 */
export function isMatchBeforeOrAtCutoff(
  matchTime?: string,
  cutoffStr?: string,
  fallbackTimestamp?: number,
  mode: 'lte' | 'exact' = 'lte'
): boolean {
  if (!matchTime || !cutoffStr) return false;
  const normalizedCutoff = normalizeCutoffTimeInput(cutoffStr);
  const matchDetails = parseKickoffDetails(matchTime, fallbackTimestamp);
  if (!matchDetails.hasTime) return false;

  const cutoffDetails = parseKickoffDetails(normalizedCutoff, fallbackTimestamp);
  if (!cutoffDetails.hasTime) return false;

  if (mode === 'exact') {
    return matchDetails.timeOnly === cutoffDetails.timeOnly;
  }

  // Check if cutoff explicitly specifies a calendar date or weekday
  const cutoffHasExplicitDate =
    hasExplicitKickoffDate(normalizedCutoff) || /(?:周|星期)[一二三四五六日天]/.test(normalizedCutoff);

  // If cutoff has an explicit date/weekday: compare precise timestamps
  if (cutoffHasExplicitDate) {
    if (
      Number.isFinite(matchDetails.kickoffTimestamp) &&
      Number.isFinite(cutoffDetails.kickoffTimestamp) &&
      matchDetails.kickoffTimestamp !== Infinity &&
      cutoffDetails.kickoffTimestamp !== Infinity
    ) {
      return matchDetails.kickoffTimestamp <= cutoffDetails.kickoffTimestamp;
    }
  }

  // When cutoff is a pure time (e.g. "00:30", "23:00", without calendar date):
  // 1. Primary rule: Compare lottery sales cycle continuous timeline offset
  // (11:00 AM of sales day -> 23:00 [720] -> 00:00 [780] -> 00:05 [785] -> 00:30 [810] -> 02:45 [945])
  if (matchDetails.salesDayOffset <= cutoffDetails.salesDayOffset) {
    return true;
  }

  // 2. Secondary fallback: Clock time comparison within same window (e.g. both 00:05 and 00:30 in early morning)
  const matchMinuteOfDay = matchDetails.hour * 60 + matchDetails.minute;
  const cutoffMinuteOfDay = cutoffDetails.hour * 60 + cutoffDetails.minute;
  if (matchMinuteOfDay <= cutoffMinuteOfDay) {
    if (
      (matchDetails.hour < 11 && cutoffDetails.hour < 11) ||
      (matchDetails.hour >= 11 && cutoffDetails.hour >= 11)
    ) {
      return true;
    }
  }

  return false;
}

