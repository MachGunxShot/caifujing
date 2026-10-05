import { FullMatchData } from '../types/fortuneActuary';

/**
 * Standardize handicap string to numeric handicap from Home perspective
 */
export function normalizeWaterOdds(water: number): number {
  if (water <= 0) return 1.90;
  // If water is expressed in Asian format (e.g. 0.85, 1.06, 0.989)
  // In European odds format, water 0.85 is payout 1.85
  if (water > 0 && water < 1.5) {
    return parseFloat((water + 1.0).toFixed(2));
  }
  return parseFloat(water.toFixed(2));
}

/**
 * Parse a natural string representing match odds for a single match
 */
export function parseNaturalTextOdds(text: string, currentData: FullMatchData): Partial<FullMatchData> {
  const result: Partial<FullMatchData> = {
    matchInfo: { ...currentData.matchInfo },
    asianHandicap: { ...currentData.asianHandicap },
    euroOdds: { ...currentData.euroOdds },
    overUnder: { ...currentData.overUnder },
  };

  const fullText = text;

  // 1. Teams & League extraction (e.g. "英超 阿森纳 vs 切尔西" or "瑞士 vs 斯洛文尼亚")
  const vsMatch = fullText.match(/([^\d\s\n,;，；|/\\#【】（(]{2,10})\s*(?:vs|VS|对阵|对|\-)\s*([^\d\s\n,;，；|/\\#【】（(]{2,10})/i);
  if (vsMatch && result.matchInfo) {
    const home = vsMatch[1].trim();
    const away = vsMatch[2].trim();
    if (!home.startsWith('主队') && !away.startsWith('客队') && !home.includes('重新核') && !home.includes('对阵')) {
      result.matchInfo.homeTeam = home;
      result.matchInfo.awayTeam = away;
    }
  }

  // League keywords
  const leagueMatch = fullText.match(/(欧国联|英超|西甲|德甲|意甲|法甲|欧冠|欧罗巴|英冠|日职|荷甲|葡超|世界杯|亚洲杯|欧洲杯|中超|北单|竞彩)/);
  if (leagueMatch && result.matchInfo) {
    result.matchInfo.league = leagueMatch[1] + (leagueMatch[1].includes('联') || leagueMatch[1].includes('杯') || leagueMatch[1].includes('单') ? '' : '联赛');
  }

  // 2. Euro odds extraction
  // Format: 欧初1.36/4.40/7.50即1.30/4.60/9.50 or 1.45 4.50 7.00 -> 1.30 5.00 9.00
  const euroDualMatch = fullText.match(/欧初\s*(\d+\.\d{1,3})[/ ]+(\d+\.\d{1,3})[/ ]+(\d+\.\d{1,3})\s*即\s*(\d+\.\d{1,3})[/ ]+(\d+\.\d{1,3})[/ ]+(\d+\.\d{1,3})/);
  if (euroDualMatch && result.euroOdds) {
    result.euroOdds.earlyWin = parseFloat(euroDualMatch[1]);
    result.euroOdds.earlyDraw = parseFloat(euroDualMatch[2]);
    result.euroOdds.earlyLoss = parseFloat(euroDualMatch[3]);
    result.euroOdds.lateWin = parseFloat(euroDualMatch[4]);
    result.euroOdds.lateDraw = parseFloat(euroDualMatch[5]);
    result.euroOdds.lateLoss = parseFloat(euroDualMatch[6]);
  } else {
    const euroGroups = [...fullText.matchAll(/(\d+\.\d{1,3})[\s/]+(\d+\.\d{1,3})[\s/]+(\d+\.\d{1,3})/g)];
    if (euroGroups.length >= 2 && result.euroOdds) {
      result.euroOdds.earlyWin = parseFloat(euroGroups[0][1]);
      result.euroOdds.earlyDraw = parseFloat(euroGroups[0][2]);
      result.euroOdds.earlyLoss = parseFloat(euroGroups[0][3]);
      result.euroOdds.lateWin = parseFloat(euroGroups[1][1]);
      result.euroOdds.lateDraw = parseFloat(euroGroups[1][2]);
      result.euroOdds.lateLoss = parseFloat(euroGroups[1][3]);
    } else if (euroGroups.length === 1 && result.euroOdds) {
      result.euroOdds.lateWin = parseFloat(euroGroups[0][1]);
      result.euroOdds.lateDraw = parseFloat(euroGroups[0][2]);
      result.euroOdds.lateLoss = parseFloat(euroGroups[0][3]);
    }
  }

  // 3. Asian Handicap extraction
  // Format: 亚初一球/球半[0.910/0.800]即球半[1.060/0.780] or 受半球/一球
  const asianDualMatch = fullText.match(/亚初\s*([^\d\[\]\s]+)\[([\d.]+)[/ ]+([\d.]+)\]\s*即\s*([^\d\[\]\s]+)\[([\d.]+)[/ ]+([\d.]+)\]/);
  if (asianDualMatch && result.asianHandicap) {
    result.asianHandicap.earlyHandicap = asianDualMatch[1];
    result.asianHandicap.earlyHomeOdds = normalizeWaterOdds(parseFloat(asianDualMatch[2]));
    result.asianHandicap.earlyAwayOdds = normalizeWaterOdds(parseFloat(asianDualMatch[3]));
    result.asianHandicap.lateHandicap = asianDualMatch[4];
    result.asianHandicap.lateHomeOdds = normalizeWaterOdds(parseFloat(asianDualMatch[5]));
    result.asianHandicap.lateAwayOdds = normalizeWaterOdds(parseFloat(asianDualMatch[6]));
  } else {
    const handicapKeywords = [
      '两球半/三球', '两球半', '两球/两球半', '两球',
      '球半/两球', '球半', '一球/球半', '一球',
      '受一球', '受半球/一球', '受半球', '受平半',
      '半一', '半球', '平半', '平手',
      '-3.0', '-2.75', '-2.5', '-2.25', '-2.0',
      '-1.75', '-1.5', '-1.25', '-1.0',
      '-0.75', '-0.5', '-0.25', '0', '+0.25', '+0.5', '+0.75', '+1.0'
    ];

    for (const hk of handicapKeywords) {
      if (fullText.includes(hk) && result.asianHandicap) {
        result.asianHandicap.lateHandicap = hk;
        break;
      }
    }

    const waterMatch = fullText.match(/(?:水位|水|盘水|主水均|主水)[\s:：]*(\d\.\d{2,3})/);
    if (waterMatch && result.asianHandicap) {
      result.asianHandicap.lateHomeOdds = normalizeWaterOdds(parseFloat(waterMatch[1]));
    }
    const guestWaterMatch = fullText.match(/(?:客水均|客水)[\s:：]*(\d\.\d{2,3})/);
    if (guestWaterMatch && result.asianHandicap) {
      result.asianHandicap.lateAwayOdds = normalizeWaterOdds(parseFloat(guestWaterMatch[1]));
    }
  }

  // 4. Over/Under extraction
  // Format: 大初2.5[0.70/1.05]即2.5[0.80/0.91]
  const ouDualMatch = fullText.match(/大初\s*([\d./]+)\[([\d.]+)[/ ]+([\d.]+)\]\s*即\s*([\d./]+)\[([\d.]+)[/ ]+([\d.]+)\]/);
  if (ouDualMatch && result.overUnder) {
    result.overUnder.earlyLine = ouDualMatch[1];
    result.overUnder.earlyOverOdds = normalizeWaterOdds(parseFloat(ouDualMatch[2]));
    result.overUnder.earlyUnderOdds = normalizeWaterOdds(parseFloat(ouDualMatch[3]));
    result.overUnder.lateLine = ouDualMatch[4];
    result.overUnder.lateOverOdds = normalizeWaterOdds(parseFloat(ouDualMatch[5]));
    result.overUnder.lateUnderOdds = normalizeWaterOdds(parseFloat(ouDualMatch[6]));
  } else {
    const ouMatch = fullText.match(/(?:大小球|大小|总进球|进球数|O\/U|盘口分布)[\s:：]*(\d(?:\.\d{1,2})?(?:\/\d(?:\.\d{1,2})?)?)/i);
    if (ouMatch && result.overUnder) {
      result.overUnder.lateLine = ouMatch[1];
    }
    const bigWaterMatch = fullText.match(/(?:大球水均|大球水|大水)[\s:：]*(\d\.\d{2,3})/);
    if (bigWaterMatch && result.overUnder) {
      result.overUnder.lateOverOdds = normalizeWaterOdds(parseFloat(bigWaterMatch[1]));
    }
    const smallWaterMatch = fullText.match(/(?:小球水均|小球水|小水)[\s:：]*(\d\.\d{2,3})/);
    if (smallWaterMatch && result.overUnder) {
      result.overUnder.lateUnderOdds = normalizeWaterOdds(parseFloat(smallWaterMatch[1]));
    }
  }

  return result;
}

/**
 * Intelligent Multi-Match Batch Parser:
 * Capable of handling complex Markdown snapshot documents (like 500比分抓取快照 with details),
 * CSV tables, Markdown tables, or plain text lists WITHOUT producing dummy matches!
 */
export function parseBatchMatchesFromText(rawText: string): FullMatchData[] {
  if (!rawText || !rawText.trim()) return [];

  const matches: FullMatchData[] = [];
  const text = rawText.trim();

  // Pattern 1: Section-based multi-match document
  // e.g. "## 【1】瑞士 vs 斯洛文尼亚" or "## 瑞士 vs 斯洛文尼亚" or "### 1. 瑞士 vs 斯洛文尼亚"
  const sectionSplitPattern = /(?:^|\n)(?=##+\s*(?:【?\d+】?\.?\s*)?[^\n]*?(?:vs|VS|对阵|对|\-)[^\n]*)/gi;
  const sections = text.split(sectionSplitPattern).map(s => s.trim()).filter(Boolean);

  if (sections.length > 1 || (sections.length === 1 && /##+\s*.*?(?:vs|VS)/i.test(sections[0]))) {
    for (const section of sections) {
      // Find team heading in this section
      const headingMatch = section.match(/##+\s*(?:【?\d+】?\.?\s*)?([^\d\s\n#【】（(]{2,10})\s*(?:vs|VS|对阵|对|\-)\s*([^\d\s\n#【】（(]{2,10})/i);
      if (!headingMatch) continue;

      const home = headingMatch[1].trim();
      const away = headingMatch[2].trim();

      // Filter out invalid headings like "对阵 vs 开赛"
      if (home === '对阵' || home.includes('快照') || home.includes('列表')) continue;

      // Extract league from section
      const leagueMatch = section.match(/联赛[：:]\s*([^\s|｜]+)/);
      const league = leagueMatch ? leagueMatch[1].trim() : '欧国联';

      // Extract match time
      const timeMatch = section.match(/开赛[：:]\s*([^\s|｜]+)/);
      const matchTime = timeMatch ? timeMatch[1].trim() : '临场';

      const matchItem: FullMatchData = {
        matchInfo: {
          league,
          homeTeam: home,
          awayTeam: away,
          matchTime,
          marketStory: `原始快照抓取对阵: ${home} vs ${away}`,
        },
        asianHandicap: {
          earlyHandicap: '-0.5',
          earlyHomeOdds: 1.90,
          earlyAwayOdds: 1.90,
          lateHandicap: '-0.5',
          lateHomeOdds: 1.90,
          lateAwayOdds: 1.90,
        },
        euroOdds: {
          earlyWin: 2.10,
          earlyDraw: 3.30,
          earlyLoss: 3.40,
          lateWin: 2.10,
          lateDraw: 3.30,
          lateLoss: 3.40,
        },
        overUnder: {
          earlyLine: '2.5',
          earlyOverOdds: 1.90,
          earlyUnderOdds: 1.90,
          lateLine: '2.5',
          lateOverOdds: 1.90,
          lateUnderOdds: 1.90,
        },
      };

      // Parse detailed odds within this section
      const parsedDetails = parseNaturalTextOdds(section, matchItem);
      const combinedMatch: FullMatchData = {
        ...matchItem,
        ...parsedDetails,
        matchInfo: {
          ...matchItem.matchInfo,
          ...(parsedDetails.matchInfo || {}),
        },
        asianHandicap: {
          ...matchItem.asianHandicap,
          ...(parsedDetails.asianHandicap || {}),
        },
        euroOdds: {
          ...matchItem.euroOdds,
          ...(parsedDetails.euroOdds || {}),
        },
        overUnder: {
          ...matchItem.overUnder,
          ...(parsedDetails.overUnder || {}),
        },
      };

      matches.push(combinedMatch);
    }

    if (matches.length > 0) {
      return matches;
    }
  }

  // Pattern 2: Summary table or CSV format (only lines with actual "vs" and real team names)
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Skip Markdown decorative lines and headers
    if (line.startsWith('#') || line.includes('---') || line.includes('对阵（开赛）') || line.includes('逐家明细') || line.includes('快照')) {
      continue;
    }

    // Must contain VS / 对阵 to be a valid match line
    const vsMatch = line.match(/([^\d\s\n,;，；|/\\#【】（(]{2,10})\s*(?:vs|VS|对阵|对|\-)\s*([^\d\s\n,;，；|/\\#【】（(]{2,10})/i);
    if (!vsMatch) continue;

    const home = vsMatch[1].trim();
    const away = vsMatch[2].trim();

    // Guard against noise
    if (home.includes('主队') || away.includes('客队') || home.includes('对阵') || home.includes('列表') || home.includes('范围')) {
      continue;
    }

    // Check if it's a CSV row
    const cols = line.includes('|')
      ? line.split('|').map(c => c.trim()).filter(Boolean)
      : line.includes(',')
      ? line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''))
      : [];

    if (cols.length >= 7 && !line.includes('家')) {
      // Full CSV / Markdown row with odds
      const defaultMatch: FullMatchData = {
        matchInfo: {
          league: cols[0] || '常规联赛',
          homeTeam: cols[1] || home,
          awayTeam: cols[2] || away,
          matchTime: '临场',
          marketStory: cols[11] || cols[10] || '',
        },
        asianHandicap: {
          earlyHandicap: cols[3] || '-0.5',
          earlyHomeOdds: parseFloat(cols[4]) || 1.90,
          earlyAwayOdds: 1.90,
          lateHandicap: cols[5] || cols[3] || '-0.5',
          lateHomeOdds: parseFloat(cols[6]) || 1.90,
          lateAwayOdds: 1.90,
        },
        euroOdds: {
          earlyWin: parseFloat(cols[7]) || 2.10,
          earlyDraw: parseFloat(cols[8]) || 3.30,
          earlyLoss: parseFloat(cols[9]) || 3.40,
          lateWin: parseFloat(cols[7]) || 2.10,
          lateDraw: parseFloat(cols[8]) || 3.30,
          lateLoss: parseFloat(cols[9]) || 3.40,
        },
        overUnder: {
          earlyLine: cols[10] || '2.5',
          earlyOverOdds: 1.90,
          earlyUnderOdds: 1.90,
          lateLine: cols[10] || '2.5',
          lateOverOdds: 1.90,
          lateUnderOdds: 1.90,
        },
      };
      matches.push(defaultMatch);
      continue;
    }

    // Line with natural text
    const defaultData: FullMatchData = {
      matchInfo: {
        league: '欧国联',
        homeTeam: home,
        awayTeam: away,
        matchTime: '临场',
        marketStory: '',
      },
      asianHandicap: {
        earlyHandicap: '0',
        earlyHomeOdds: 1.90,
        earlyAwayOdds: 1.90,
        lateHandicap: '0',
        lateHomeOdds: 1.90,
        lateAwayOdds: 1.90,
      },
      euroOdds: {
        earlyWin: 2.50,
        earlyDraw: 3.20,
        earlyLoss: 2.60,
        lateWin: 2.50,
        lateDraw: 3.20,
        lateLoss: 2.60,
      },
      overUnder: {
        earlyLine: '2.5',
        earlyOverOdds: 1.90,
        earlyUnderOdds: 1.90,
        lateLine: '2.5',
        lateOverOdds: 1.90,
        lateUnderOdds: 1.90,
      },
    };

    const parsed = parseNaturalTextOdds(line, defaultData);
    matches.push({
      ...defaultData,
      ...parsed,
      matchInfo: {
        ...defaultData.matchInfo,
        ...(parsed.matchInfo || {}),
        homeTeam: home,
        awayTeam: away,
      },
      asianHandicap: {
        ...defaultData.asianHandicap,
        ...(parsed.asianHandicap || {}),
      },
      euroOdds: {
        ...defaultData.euroOdds,
        ...(parsed.euroOdds || {}),
      },
      overUnder: {
        ...defaultData.overUnder,
        ...(parsed.overUnder || {}),
      },
    });
  }

  // De-duplicate matches by team pair
  const seen = new Set<string>();
  const uniqueMatches: FullMatchData[] = [];

  for (const m of matches) {
    const key = `${m.matchInfo.homeTeam}-${m.matchInfo.awayTeam}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueMatches.push(m);
    }
  }

  return uniqueMatches;
}

export const SAMPLE_BATCH_CSV = `联赛,主队,客队,初盘,初水,即时盘,即水,即胜,即平,即负,大小球,题材
英超,曼彻斯特城,埃弗顿,-1.75,1.95,-1.75,1.76,1.22,6.80,12.0,3.25,争冠极限榨水稳胆
西甲,皇家马德里,赫塔菲,-1.0,1.86,-1.25,2.06,1.42,4.60,7.20,2.5,豪门名气拉满升盘满水诱上
德甲,多特蒙德,波鸿,-0.5,1.92,-0.25,2.05,2.15,3.45,3.30,2.75,主场浅盘满水丢分死穴
意甲,拉齐奥,佛罗伦萨,-0.25,1.98,-0.25,1.94,2.50,2.90,2.95,2.25,平赔低洼死压2.90首选胆平
法甲,巴黎圣日耳曼,朗斯,-1.5,1.98,-1.5,1.88,1.32,5.40,8.50,2.25,深让步配浅大小球防1-0
英超,布莱顿,托特纳姆热刺,0,1.91,0,1.93,2.50,3.75,2.65,3.25,浅盘配深大小球两队对攻刷大`;

export const SAMPLE_BATCH_MARKDOWN = `| 联赛 | 主队 | 客队 | 初盘 | 初水 | 即时盘 | 即水 | 胜 | 平 | 负 | 大小球 | 题材 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 英超 | 曼彻斯特城 | 埃弗顿 | -1.75 | 1.95 | -1.75 | 1.76 | 1.22 | 6.80 | 12.0 | 3.25 | 争冠极限榨水稳胆 |
| 西甲 | 皇家马德里 | 赫塔菲 | -1.0 | 1.86 | -1.25 | 2.06 | 1.42 | 4.60 | 7.20 | 2.5 | 豪门名气拉满升盘满水诱上 |
| 德甲 | 多特蒙德 | 波鸿 | -0.5 | 1.92 | -0.25 | 2.05 | 2.15 | 3.45 | 3.30 | 2.75 | 主场浅盘满水丢分死穴 |
| 意甲 | 拉齐奥 | 佛罗伦萨 | -0.25 | 1.98 | -0.25 | 1.94 | 2.50 | 2.90 | 2.95 | 2.25 | 平赔低洼死压2.90首选胆平 |
| 法甲 | 巴黎圣日耳曼 | 朗斯 | -1.5 | 1.98 | -1.5 | 1.88 | 1.32 | 5.40 | 8.50 | 2.25 | 深让步配浅大小球防1-0 |
| 英超 | 布莱顿 | 托特纳姆热刺 | 0 | 1.91 | 0 | 1.93 | 2.50 | 3.75 | 2.65 | 3.25 | 浅盘配深大小球两队对攻刷大 |`;

export function generateMatchMarkdown(
  matchData: FullMatchData,
  report: import('../types/fortuneActuary').AnalysisReportResult,
  rawAiText?: string
): string {
  if (rawAiText && rawAiText.trim()) {
    return `# 《财富经》足彩精算研判报告 · ${matchData.matchInfo.homeTeam} VS ${matchData.matchInfo.awayTeam}

> **研判底线逻辑**：早盘看意图，晚盘看真实风控；永远学会“证伪”而非“自我证明”；天上不会掉无缘无故的馅饼。

| 维度 | 早盘初盘 | 临场晚盘即时盘水 |
| :--- | :--- | :--- |
| **赛事联赛** | ${matchData.matchInfo.league || '常规联赛'} | 比赛时间: ${matchData.matchInfo.matchTime || '临场'} |
| **对阵双方** | 主队: **${matchData.matchInfo.homeTeam}** | 客队: **${matchData.matchInfo.awayTeam}** |
| **亚盘让步** | ${matchData.asianHandicap.earlyHandicap} (主水 ${matchData.asianHandicap.earlyHomeOdds} / 客水 ${matchData.asianHandicap.earlyAwayOdds}) | **${matchData.asianHandicap.lateHandicap}** (主水 **${matchData.asianHandicap.lateHomeOdds}** / 客水 **${matchData.asianHandicap.lateAwayOdds}**) |
| **欧指走势** | ${matchData.euroOdds.earlyWin} / ${matchData.euroOdds.earlyDraw} / ${matchData.euroOdds.earlyLoss} | **${matchData.euroOdds.lateWin}** / **${matchData.euroOdds.lateDraw}** / **${matchData.euroOdds.lateLoss}** |
| **大小球联动** | ${matchData.overUnder.earlyLine} 球 (大水 ${matchData.overUnder.earlyOverOdds}) | **${matchData.overUnder.lateLine}** 球 (大水 **${matchData.overUnder.lateOverOdds}**) |

---

${rawAiText}
`;
  }

  return `# 《财富经》足彩精算研判报告 · ${matchData.matchInfo.homeTeam} VS ${matchData.matchInfo.awayTeam}

> **操盘定性标签**：**${report.modelTitle}**
> **研判底线逻辑**：早盘看意图，晚盘看真实风控；永远学会“证伪”而非“自我证明”；买得太舒服必定是陷阱。

| 维度 | 早盘初盘 | 临场晚盘即时盘水 |
| :--- | :--- | :--- |
| **赛事联赛** | ${matchData.matchInfo.league || '常规联赛'} | 比赛时间: ${matchData.matchInfo.matchTime || '临场'} |
| **对阵双方** | 主队: **${matchData.matchInfo.homeTeam}** | 客队: **${matchData.matchInfo.awayTeam}** |
| **亚盘让步** | ${matchData.asianHandicap.earlyHandicap} (主水 ${matchData.asianHandicap.earlyHomeOdds}) | **${matchData.asianHandicap.lateHandicap}** (主水 **${matchData.asianHandicap.lateHomeOdds}**) |
| **欧指走势** | ${matchData.euroOdds.earlyWin} / ${matchData.euroOdds.earlyDraw} / ${matchData.euroOdds.earlyLoss} | **${matchData.euroOdds.lateWin}** / **${matchData.euroOdds.lateDraw}** / **${matchData.euroOdds.lateLoss}** |
| **大小球联动** | ${matchData.overUnder.earlyLine} 球 (大水 ${matchData.overUnder.earlyOverOdds}) | **${matchData.overUnder.lateLine}** 球 (大水 **${matchData.overUnder.lateOverOdds}**) |

---

### 1. 【盘面第一印象】
${report.firstImpression}

---

### 2. 【三维联动测谎】
${report.threeDimLieDetection}

---

### 3. 【财富经最终判定】
- **${report.finalVerdict.direction}**
- **盘路细化**：\`${report.finalVerdict.directionDetail}\`
- **避坑风险提示**：
> ⚠️ **${report.finalVerdict.riskWarning}**
`;
}

// ==================== BATCH MATCH SCORE PARSER ====================

export interface ParsedScoreItem {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  incidents?: string;
  matchedId?: string; // 'current' or batch item id
  matchedName?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'MANUAL';
}

function normalizeTeamForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/[队fc\s·\-_\/]/g, '')
    .trim();
}

/**
 * Parses batch match scores from plain text, markdown, CSV, or OCR outputs
 */
export function parseBatchMatchScoresFromText(
  rawText: string,
  candidates: { id: string; home: string; away: string; league?: string }[] = []
): ParsedScoreItem[] {
  const lines = rawText.split('\n');
  const results: ParsedScoreItem[] = [];
  let itemCounter = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('---') || line.startsWith('===') || line.includes('主队') && line.includes('客队') && line.includes('比分')) {
      continue;
    }

    let home = '';
    let away = '';
    let homeScore = -1;
    let awayScore = -1;
    let incidents = '';

    // Check for incident notes in parentheses
    const incidentMatch = line.match(/[（(]([^）)]+)[）)]/);
    if (incidentMatch) {
      incidents = incidentMatch[1].trim();
    }

    const cleanLine = line.replace(/[（(][^）)]+[）)]/g, '').trim();

    // Pattern 1: [TeamA] vs [TeamB] [Score] (e.g. "曼城 vs 埃弗顿 2-1" or "曼城 VS 埃弗顿 : 2:1")
    const p1 = cleanLine.match(/([^\d\n\r|:,;\t]{2,12})\s*(?:vs|VS|对阵|对)\s*([^\d\n\r|:,;\t]{2,12})[\s\t,，:：|]+(?:比分)?\s*(\d{1,2})\s*[-:：比\s]\s*(\d{1,2})/i);
    if (p1) {
      home = p1[1].trim();
      away = p1[2].trim();
      homeScore = parseInt(p1[3], 10);
      awayScore = parseInt(p1[4], 10);
    }

    // Pattern 2: [TeamA] [Score] [TeamB] (e.g. "曼城 2-1 埃弗顿", "瑞士 1:0 斯洛文尼亚", "完场 曼城 2比1 埃弗顿")
    if (homeScore === -1) {
      const p2 = cleanLine.match(/(?:完场|全场|终场|赛果)?\s*([^\d\n\r|:,;\t]{2,12})\s*(\d{1,2})\s*[-:：比\s]\s*(\d{1,2})\s*([^\d\n\r|:,;\t]{2,12})/);
      if (p2) {
        home = p2[1].replace(/完场|全场|终场|赛果/g, '').trim();
        homeScore = parseInt(p2[2], 10);
        awayScore = parseInt(p2[3], 10);
        away = p2[4].trim();
      }
    }

    // Pattern 3: Markdown table row with pipes (e.g. "| 瑞士 | 1-0 | 斯洛文尼亚 |" or "| 瑞士 vs 斯洛文尼亚 | 1:0 |")
    if (homeScore === -1 && line.includes('|')) {
      const parts = line.split('|').map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        for (let i = 0; i < parts.length; i++) {
          const scoreMatch = parts[i].match(/^(\d{1,2})\s*[-:：比]\s*(\d{1,2})$/);
          if (scoreMatch) {
            homeScore = parseInt(scoreMatch[1], 10);
            awayScore = parseInt(scoreMatch[2], 10);
            // Team names from previous or next columns
            if (i > 0 && parts[i - 1].includes('vs')) {
              const [h, a] = parts[i - 1].split(/vs/i);
              home = h.trim();
              away = a.trim();
            } else if (i > 0 && i < parts.length - 1) {
              home = parts[i - 1];
              away = parts[i + 1];
            }
            break;
          }
        }
      }
    }

    // Pattern 4: CSV / Tab separated line: "瑞士,1,0,斯洛文尼亚" or "瑞士,斯洛文尼亚,1-0"
    if (homeScore === -1 && (line.includes(',') || line.includes('\t'))) {
      const tokens = line.split(/[\t,，]/).map(t => t.trim()).filter(Boolean);
      if (tokens.length >= 3) {
        for (const token of tokens) {
          const sm = token.match(/^(\d{1,2})\s*[-:：比]\s*(\d{1,2})$/);
          if (sm) {
            homeScore = parseInt(sm[1], 10);
            awayScore = parseInt(sm[2], 10);
            break;
          }
        }
        if (homeScore !== -1) {
          const nonScoreTokens = tokens.filter(t => !t.match(/^\d{1,2}\s*[-:：比]\s*\d{1,2}$/));
          if (nonScoreTokens.length >= 2) {
            home = nonScoreTokens[0];
            away = nonScoreTokens[1];
          }
        }
      }
    }

    if (homeScore >= 0 && awayScore >= 0 && (home || away)) {
      itemCounter++;
      // Fuzzy matching with candidate matches in queue
      let matchedId: string | undefined = undefined;
      let matchedName: string | undefined = undefined;
      let confidence: 'HIGH' | 'MEDIUM' | 'MANUAL' = 'MEDIUM';

      const normHome = normalizeTeamForMatch(home);
      const normAway = normalizeTeamForMatch(away);

      for (const cand of candidates) {
        const candNormHome = normalizeTeamForMatch(cand.home);
        const candNormAway = normalizeTeamForMatch(cand.away);

        const homeMatch =
          normHome &&
          (candNormHome.includes(normHome) || normHome.includes(candNormHome) || cand.home === home);
        const awayMatch =
          normAway &&
          (candNormAway.includes(normAway) || normAway.includes(candNormAway) || cand.away === away);

        if (homeMatch && awayMatch) {
          matchedId = cand.id;
          matchedName = `${cand.home} vs ${cand.away}`;
          confidence = 'HIGH';
          break;
        } else if (homeMatch || awayMatch) {
          matchedId = cand.id;
          matchedName = `${cand.home} vs ${cand.away}`;
          confidence = 'MEDIUM';
        }
      }

      results.push({
        id: `parsed-score-${Date.now()}-${itemCounter}`,
        homeTeam: home || '主队',
        awayTeam: away || '客队',
        homeScore,
        awayScore,
        incidents,
        matchedId,
        matchedName,
        confidence,
      });
    }
  }

  return results;
}
