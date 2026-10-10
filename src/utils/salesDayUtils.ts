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

export interface SalesDateInfo {
  salesDate: string;             // YYYY-MM-DD, e.g. "2026-03-28"
  salesDateLabel: string;        // e.g. "2026年03月28日 销售日"
  salesCycleText: string;        // e.g. "03-28 11:00 ~ 03-29 11:00"
  dayOfWeek: string;             // e.g. "星期六"
  isCurrentSalesDay: boolean;    // 当前系统时间是否在此销售周期内
  kickoffTimeFormatted: string;  // 格式化后的开赛时间
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
 */
export function calculateSalesDate(
  kickoffTime?: string,
  fallbackTimestamp?: number
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

  // 1. 解析开赛时间
  let kickoffYear: number | null = null;
  let kickoffMonth: number | null = null;
  let kickoffDay: number | null = null;
  let kickoffHour: number | null = null;
  let kickoffMinute: number | null = null;

  const timeStr = (kickoffTime || '').trim();

  // Check if kickoffTime has full date and time: YYYY-MM-DD HH:mm
  const fullMatch = timeStr.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (fullMatch) {
    kickoffYear = parseInt(fullMatch[1], 10);
    kickoffMonth = parseInt(fullMatch[2], 10);
    kickoffDay = parseInt(fullMatch[3], 10);
    kickoffHour = fullMatch[4] !== undefined ? parseInt(fullMatch[4], 10) : 12; // 默认若只有日期无具体小时，设为中午12:00（属于当天销售日）
    kickoffMinute = fullMatch[5] !== undefined ? parseInt(fullMatch[5], 10) : 0;
  } else {
    // Check if it's MM-DD HH:mm
    const mdMatch = timeStr.match(/(\d{1,2})[-/.](\d{1,2})\s+(\d{1,2}):(\d{2})/);
    if (mdMatch) {
      const baseYear = fallbackTimestamp ? new Date(fallbackTimestamp).getFullYear() : now.getFullYear();
      kickoffYear = baseYear;
      kickoffMonth = parseInt(mdMatch[1], 10);
      kickoffDay = parseInt(mdMatch[2], 10);
      kickoffHour = parseInt(mdMatch[3], 10);
      kickoffMinute = parseInt(mdMatch[4], 10);
    } else {
      // Check if it's lone HH:mm (e.g. "23:00" or "03:00")
      const timeOnlyMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
      if (timeOnlyMatch) {
        const base = fallbackTimestamp ? new Date(fallbackTimestamp) : now;
        kickoffYear = base.getFullYear();
        kickoffMonth = base.getMonth() + 1;
        kickoffDay = base.getDate();
        kickoffHour = parseInt(timeOnlyMatch[1], 10);
        kickoffMinute = parseInt(timeOnlyMatch[2], 10);
      }
    }
  }

  // 2. 若完全未解析出具体时间，采用后备时间戳 (导入/复盘时间戳)
  if (kickoffYear === null || kickoffMonth === null || kickoffDay === null || kickoffHour === null) {
    const fallbackDate = fallbackTimestamp ? new Date(fallbackTimestamp) : now;
    kickoffYear = fallbackDate.getFullYear();
    kickoffMonth = fallbackDate.getMonth() + 1;
    kickoffDay = fallbackDate.getDate();
    kickoffHour = fallbackDate.getHours();
    kickoffMinute = fallbackDate.getMinutes();
  }

  // 3. 应用核心竞彩销售日法则：当日 11:00 至次日 11:00 为一个销售日！
  // 创建开赛时间 Date 实体
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

  // 是否属于当前正在销售/开赛复盘中的销售日
  const isCurrentSalesDay = salesDate === currentActiveSalesDate;

  // 格式化输出开赛时间
  let kickoffTimeFormatted = timeStr;
  if (!kickoffTimeFormatted || kickoffTimeFormatted === '临场') {
    const kh = String(kickoffHour).padStart(2, '0');
    const km = String(kickoffMinute || 0).padStart(2, '0');
    kickoffTimeFormatted = `${sm}-${sd} ${kh}:${km}`;
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
