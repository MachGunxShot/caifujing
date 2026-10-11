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

/**
 * 提取文本或 Markdown 文档中全局的日期标头 (如 "# 2026-03-28 竞彩大名单" 或 "日期: 2026-03-28")
 */
export function extractDocumentGlobalDate(text: string): string | null {
  if (!text) return null;

  // 1. Explicit date line: 日期：2026-03-28 or 比赛日: 2026-03-28 or 销售日: 2026-03-28
  const explicitMatch = text.match(/(?:日期|比赛日|销售日|开赛日期|时间)[：:\s]+(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})/i);
  if (explicitMatch) return normalizeDateString(explicitMatch[1]);

  // 2. Heading date: # 2026-03-28 or ## 2026-03-28 or # 2026年3月28日
  const headingMatch = text.match(/#+\s*.*?(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (headingMatch) {
    const y = headingMatch[1];
    const m = headingMatch[2].padStart(2, '0');
    const d = headingMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 3. First standard full date found in first 500 characters
  const headerSample = text.slice(0, 500);
  const generalDateMatch = headerSample.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (generalDateMatch) {
    const y = generalDateMatch[1];
    const m = generalDateMatch[2].padStart(2, '0');
    const d = generalDateMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

/**
 * 将各种格式的日期串标准化为 YYYY-MM-DD
 */
function normalizeDateString(raw: string): string {
  const parts = raw.split(/[-/.]/);
  if (parts.length === 3) {
    const y = parts[0].length === 4 ? parts[0] : `20${parts[0]}`;
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return raw;
}

/**
 * 从单场比赛的 Markdown 片段、表格行或纯文本中高精度提取开赛时间
 */
export function extractKickoffTime(sectionOrLine: string, documentContext?: string): string {
  if (!sectionOrLine || !sectionOrLine.trim()) return '临场';

  const text = sectionOrLine.trim();
  const globalDocDate = documentContext ? extractDocumentGlobalDate(documentContext) : null;

  // 1. Explicit label match with full datetime (e.g. "开赛时间: 2026-03-28 23:00" or "比赛时间: 2026-03-28 23:00")
  const fullDateTimeLabelMatch = text.match(
    /(?:开赛时间|比赛时间|开赛时刻|开赛|比赛|时刻|时间)[：:\s]+(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)/i
  );
  if (fullDateTimeLabelMatch) {
    return cleanKickoffTime(fullDateTimeLabelMatch[1]);
  }

  // 2. Explicit label match with month-day + time (e.g. "开赛时间: 03-28 23:00" or "比赛时间: 3-28 23:00")
  const mdTimeLabelMatch = text.match(
    /(?:开赛时间|比赛时间|开赛时刻|开赛|比赛|时刻|时间)[：:\s]+(\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)/i
  );
  if (mdTimeLabelMatch) {
    const raw = mdTimeLabelMatch[1].trim();
    const currentYear = globalDocDate ? globalDocDate.split('-')[0] : new Date().getFullYear().toString();
    return `${currentYear}-${cleanKickoffTime(raw)}`;
  }

  // 3. Explicit label match with Chinese format (e.g. "比赛时间: 3月28日 23:00" or "开赛: 03月28日 23:00")
  const cnDateLabelMatch = text.match(
    /(?:开赛时间|比赛时间|开赛时刻|开赛|比赛|时刻|时间)[：:\s]+(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日(?:\s*周[一二三四五六日天])?\s*(\d{1,2}:\d{2})/i
  );
  if (cnDateLabelMatch) {
    const y = cnDateLabelMatch[1] || (globalDocDate ? globalDocDate.split('-')[0] : new Date().getFullYear().toString());
    const m = cnDateLabelMatch[2].padStart(2, '0');
    const d = cnDateLabelMatch[3].padStart(2, '0');
    const time = cnDateLabelMatch[4];
    return `${y}-${m}-${d} ${time}`;
  }

  // 4. Explicit label match with time only (e.g. "开赛时间: 23:00" or "开赛: 03:00")
  const timeOnlyLabelMatch = text.match(
    /(?:开赛时间|比赛时间|开赛时刻|开赛|时刻)[：:\s]+(\d{1,2}:\d{2}(?::\d{2})?)/i
  );
  if (timeOnlyLabelMatch) {
    const t = timeOnlyLabelMatch[1].slice(0, 5);
    if (globalDocDate) {
      return `${globalDocDate} ${t}`;
    }
    return t;
  }

  // 5. Look for full datetime anywhere in text: e.g. "2026-03-28 23:00" or "2026/03/28 23:00"
  const generalFullDateTimeMatch = text.match(
    /\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\b/
  );
  if (generalFullDateTimeMatch) {
    return cleanKickoffTime(generalFullDateTimeMatch[1]);
  }

  // 6. Look for month-day + time anywhere in text: e.g. "03-28 23:00" or "03/28 23:00"
  const generalMdTimeMatch = text.match(
    /\b(\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2})\b/
  );
  if (generalMdTimeMatch) {
    const raw = generalMdTimeMatch[1].trim();
    const currentYear = globalDocDate ? globalDocDate.split('-')[0] : new Date().getFullYear().toString();
    return `${currentYear}-${cleanKickoffTime(raw)}`;
  }

  // 7. Check Markdown table columns: e.g. "| 欧冠 | 2026-03-28 23:00 | 曼城 | 皇马 |"
  if (text.includes('|')) {
    const cols = text.split('|').map((c) => c.trim()).filter(Boolean);
    for (const col of cols) {
      // Check full datetime column
      const colFullMatch = col.match(/^20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}$/);
      if (colFullMatch) return cleanKickoffTime(colFullMatch[0]);

      // Check month-day time column
      const colMdMatch = col.match(/^\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}$/);
      if (colMdMatch) {
        const currentYear = globalDocDate ? globalDocDate.split('-')[0] : new Date().getFullYear().toString();
        return `${currentYear}-${cleanKickoffTime(colMdMatch[0])}`;
      }

      // Check lone HH:mm column (and exclude scores like "2:1" or odds like "1.90")
      const colTimeMatch = col.match(/^(\d{1,2}:\d{2})$/);
      if (colTimeMatch) {
        const t = colTimeMatch[1];
        if (globalDocDate) return `${globalDocDate} ${t}`;
        return t;
      }
    }
  }

  // 8. Match parenthesized or bracketed time: e.g. "(23:00)" or "【23:00】" or "周六001 23:00"
  const parenTimeMatch = text.match(/(?:周[一二三四五六日天]\d{3}\s*)?[(（【]?(\d{1,2}:\d{2})[)）】]?/);
  if (parenTimeMatch && !parenTimeMatch[0].includes('-')) {
    const t = parenTimeMatch[1];
    // Verify it's a valid hour (00-23) and minute (00-59)
    const [h, m] = t.split(':').map(Number);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      if (globalDocDate) return `${globalDocDate} ${t}`;
      return t;
    }
  }

  return '临场';
}

/**
 * 清洗规范化开赛时间文本
 */
function cleanKickoffTime(raw: string): string {
  // Replace slashes or dots with dashes
  let clean = raw.trim().replace(/[/.]/g, '-');
  // Normalize double spaces
  clean = clean.replace(/\s+/g, ' ');
  // Ensure seconds are stripped if present (e.g. 23:00:00 -> 23:00)
  clean = clean.replace(/(\d{1,2}:\d{2}):\d{2}/, '$1');
  return clean;
}

/**
 * 核心算法：依据开赛时间与彩票规则计算“销售日 (Sales Day)”
 * 规则：当日早上 11:00 至次日早上 11:00 为一个销售日。
 * 
 * @param kickoffTime 开赛时间 (如 "2026-03-28 23:00" 或 "2026-03-29 03:00" 或 "23:00" 或 "临场")
 * @param fallbackTimestamp 若未识别出开赛日期时的后备时间戳 (如比赛导入/复盘创建的时间戳)
 * @param preferredSalesDate 优先绑定的批次销售日 (如已有队列主销售日 "2026-03-28"，防止同轮次比赛跳跃到次日)
 */
export function calculateSalesDate(
  kickoffTime?: string,
  fallbackTimestamp?: number,
  preferredSalesDate?: string
): SalesDateInfo {
  const daysOfWeek = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const now = new Date();

  // 当前活跃销售日 (系统此时此刻所处的销售日)
  let currentActiveSalesDate = '';
  if (now.getHours() >= 11) {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    currentActiveSalesDate = `${y}-${m}-${d}`;
  } else {
    const yest = new Date(now.getTime() - 24 * 3600 * 1000);
    const y = yest.getFullYear();
    const m = String(yest.getMonth() + 1).padStart(2, '0');
    const d = String(yest.getDate()).padStart(2, '0');
    currentActiveSalesDate = `${y}-${m}-${d}`;
  }

  const timeStr = (kickoffTime || '').trim();

  // 1. 深度解析开赛时间
  let kickoffYear: number | null = null;
  let kickoffMonth: number | null = null;
  let kickoffDay: number | null = null;
  let kickoffHour: number | null = null;
  let kickoffMinute: number | null = null;
  let hasExplicitDate = false;

  // A. Check if kickoffTime has full date and time: YYYY-MM-DD HH:mm
  const fullMatch = timeStr.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (fullMatch) {
    hasExplicitDate = true;
    kickoffYear = parseInt(fullMatch[1], 10);
    kickoffMonth = parseInt(fullMatch[2], 10);
    kickoffDay = parseInt(fullMatch[3], 10);
    kickoffHour = fullMatch[4] !== undefined ? parseInt(fullMatch[4], 10) : 12;
    kickoffMinute = fullMatch[5] !== undefined ? parseInt(fullMatch[5], 10) : 0;
  } else {
    // B. Check if it's MM-DD HH:mm
    const mdMatch = timeStr.match(/(\d{1,2})[-/.](\d{1,2})\s+(\d{1,2}):(\d{2})/);
    if (mdMatch) {
      hasExplicitDate = true;
      const baseYear = fallbackTimestamp ? new Date(fallbackTimestamp).getFullYear() : now.getFullYear();
      kickoffYear = baseYear;
      kickoffMonth = parseInt(mdMatch[1], 10);
      kickoffDay = parseInt(mdMatch[2], 10);
      kickoffHour = parseInt(mdMatch[3], 10);
      kickoffMinute = parseInt(mdMatch[4], 10);
    } else {
      // C. Check if it's lone HH:mm (e.g. "23:00" or "03:00")
      const timeOnlyMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
      if (timeOnlyMatch) {
        kickoffHour = parseInt(timeOnlyMatch[1], 10);
        kickoffMinute = parseInt(timeOnlyMatch[2], 10);

        // 若提供了批次锚定销售日 preferredSalesDate，作为基准日
        if (preferredSalesDate && /^\d{4}-\d{2}-\d{2}$/.test(preferredSalesDate)) {
          const [py, pm, pd] = preferredSalesDate.split('-').map(Number);
          kickoffYear = py;
          kickoffMonth = pm;
          kickoffDay = pd;
          // 若为次日凌晨 (00:00~10:59)，实际比赛开赛时间为次日日历天
          if (kickoffHour < 11) {
            const nextDay = new Date(new Date(py, pm - 1, pd).getTime() + 24 * 3600 * 1000);
            kickoffYear = nextDay.getFullYear();
            kickoffMonth = nextDay.getMonth() + 1;
            kickoffDay = nextDay.getDate();
          }
        } else {
          const base = fallbackTimestamp ? new Date(fallbackTimestamp) : now;
          kickoffYear = base.getFullYear();
          kickoffMonth = base.getMonth() + 1;
          kickoffDay = base.getDate();
          if (kickoffHour < 11) {
            const nextCalendarDay = new Date(base.getTime() + 24 * 3600 * 1000);
            kickoffYear = nextCalendarDay.getFullYear();
            kickoffMonth = nextCalendarDay.getMonth() + 1;
            kickoffDay = nextCalendarDay.getDate();
          }
        }
      }
    }
  }

  // 2. 若完全未解析出具体时间，采用 preferredSalesDate 或后备时间戳
  if (kickoffYear === null || kickoffMonth === null || kickoffDay === null || kickoffHour === null) {
    if (preferredSalesDate && /^\d{4}-\d{2}-\d{2}$/.test(preferredSalesDate)) {
      const [py, pm, pd] = preferredSalesDate.split('-').map(Number);
      kickoffYear = py;
      kickoffMonth = pm;
      kickoffDay = pd;
      kickoffHour = 12; // 默认中午12:00（属于 preferredSalesDate 销售日）
      kickoffMinute = 0;
    } else {
      const fallbackDate = fallbackTimestamp ? new Date(fallbackTimestamp) : now;
      kickoffYear = fallbackDate.getFullYear();
      kickoffMonth = fallbackDate.getMonth() + 1;
      kickoffDay = fallbackDate.getDate();
      kickoffHour = fallbackDate.getHours();
      kickoffMinute = fallbackDate.getMinutes();
    }
  }

  // 3. 应用核心竞彩销售日法则：当日 11:00 至次日 11:00 为一个销售日！
  const kickoffDateObj = new Date(kickoffYear, kickoffMonth - 1, kickoffDay, kickoffHour, kickoffMinute || 0);

  let salesDateYear = kickoffYear;
  let salesDateMonth = kickoffMonth;
  let salesDateDay = kickoffDay;

  if (kickoffHour < 11) {
    // 早于 11:00 (即 00:00 ~ 10:59:59 期间开赛的比赛)，属于前一天开始的销售日！
    const prevDay = new Date(kickoffDateObj.getTime() - 24 * 3600 * 1000);
    salesDateYear = prevDay.getFullYear();
    salesDateMonth = prevDay.getMonth() + 1;
    salesDateDay = prevDay.getDate();
  }

  // 格式化 Sales Date: YYYY-MM-DD
  const sy = String(salesDateYear);
  const sm = String(salesDateMonth).padStart(2, '0');
  const sd = String(salesDateDay).padStart(2, '0');
  const salesDate = `${sy}-${sm}-${sd}`;
  const salesDateLabel = `${sy}年${sm}月${sd}日 销售日`;

  // 计算销售周期说明：如 "03-28 11:00 ~ 03-29 11:00"
  const salesBaseDate = new Date(salesDateYear, salesDateMonth - 1, salesDateDay);
  const nextSalesDate = new Date(salesBaseDate.getTime() + 24 * 3600 * 1000);
  const nsm = String(nextSalesDate.getMonth() + 1).padStart(2, '0');
  const nsd = String(nextSalesDate.getDate()).padStart(2, '0');
  const salesCycleText = `${sm}-${sd} 11:00 ~ ${nsm}-${nsd} 11:00`;

  // 星期几
  const dayOfWeek = daysOfWeek[salesBaseDate.getDay()];
  const isCurrentSalesDay = salesDate === currentActiveSalesDate;

  // 格式化输出开赛时间
  let kickoffTimeFormatted = timeStr;
  if (!kickoffTimeFormatted || kickoffTimeFormatted === '临场' || kickoffTimeFormatted === '已完场') {
    kickoffTimeFormatted = `${sm}-${sd} 临场`;
  } else if (!hasExplicitDate) {
    const kh = String(kickoffHour).padStart(2, '0');
    const km = String(kickoffMinute || 0).padStart(2, '0');
    const kmMonth = String(kickoffMonth).padStart(2, '0');
    const kmDay = String(kickoffDay).padStart(2, '0');
    kickoffTimeFormatted = `${kmMonth}-${kmDay} ${kh}:${km}`;
  }

  return {
    salesDate,
    salesDateLabel,
    salesCycleText,
    dayOfWeek,
    isCurrentSalesDay,
    kickoffTimeFormatted,
  };
}

/**
 * 智能检测比赛列表或队列中主流的竞彩销售日 (Dominant Sales Date)
 * 用于当批量复盘或解析赛果时，为整个批次提供统领性的锚定销售日，防止散落比赛因时间缺省或跨夜跳入次日
 */
export function detectDominantSalesDate(
  items: Array<{
    matchInfo?: { matchTime?: string };
    data?: { matchInfo?: { matchTime?: string } };
    timestamp?: number;
    salesDate?: string;
  }>
): string | null {
  if (!items || items.length === 0) return null;

  const dateCounts = new Map<string, number>();

  for (const item of items) {
    if (item.salesDate && /^\d{4}-\d{2}-\d{2}$/.test(item.salesDate)) {
      dateCounts.set(item.salesDate, (dateCounts.get(item.salesDate) || 0) + 3);
      continue;
    }

    const matchTime = item.data?.matchInfo?.matchTime || item.matchInfo?.matchTime;
    const ts = item.timestamp;

    if (matchTime && matchTime !== '临场' && matchTime !== '已完场') {
      const salesInfo = calculateSalesDate(matchTime, ts);
      dateCounts.set(salesInfo.salesDate, (dateCounts.get(salesInfo.salesDate) || 0) + 2);
    } else if (ts) {
      const salesInfo = calculateSalesDate('临场', ts);
      dateCounts.set(salesInfo.salesDate, (dateCounts.get(salesInfo.salesDate) || 0) + 1);
    }
  }

  if (dateCounts.size === 0) return null;

  let maxCount = -1;
  let dominantDate: string | null = null;
  for (const [date, count] of dateCounts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      dominantDate = date;
    }
  }

  return dominantDate;
}

/**
 * 校准所有历史复盘记录中的销售日归属，修复此前因跨天复盘或时间格式差异误跳到次日的场次
 */
export function calibrateReviewSalesDate(
  review: PostMatchReview,
  anchorSalesDate?: string
): PostMatchReview {
  // 优先采用 matchData 中的原始开赛时间（防止被此前误校准重写覆盖）
  const rawMatchTime = review.matchData?.matchInfo?.matchTime;
  const currentKickoff = review.kickoffTime;
  const story = review.matchData?.matchInfo?.marketStory || '';

  let kickoffToUse = '临场';
  if (rawMatchTime && rawMatchTime !== '临场' && rawMatchTime !== '已完场') {
    kickoffToUse = rawMatchTime;
  } else if (currentKickoff && currentKickoff !== '临场' && currentKickoff !== '已完场') {
    kickoffToUse = currentKickoff;
  }

  // 优先保留 review 已有的真实 salesDate 作为基准，避免因复盘时间戳漂移导致全场次跳跃
  let effectivePreferred = anchorSalesDate || review.salesDate;

  // 若文本中明文标有“周日”但当前被归为周六销售日，智能纠偏至周日
  if (/周日/.test(story) || /周日/.test(rawMatchTime || '')) {
    if (effectivePreferred && /^\d{4}-\d{2}-\d{2}$/.test(effectivePreferred)) {
      const [y, m, d] = effectivePreferred.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      if (dt.getDay() === 6) { // 周六 -> 纠偏至周日
        const sun = new Date(dt.getTime() + 24 * 3600 * 1000);
        effectivePreferred = `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, '0')}-${String(sun.getDate()).padStart(2, '0')}`;
      }
    }
  }

  const updatedInfo = calculateSalesDate(kickoffToUse, review.reviewTimestamp, effectivePreferred);

  return {
    ...review,
    salesDate: updatedInfo.salesDate,
    salesDateLabel: updatedInfo.salesDateLabel,
    salesCycleText: updatedInfo.salesCycleText,
    kickoffTime: updatedInfo.kickoffTimeFormatted,
  };
}
