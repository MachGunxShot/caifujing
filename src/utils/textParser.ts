import { FullMatchData } from '../types/fortuneActuary';
import { calculateSalesDate, extractDocumentGlobalDate, extractKickoffTime, hasExplicitKickoffDate, matchTeamsFuzzy } from './salesDayUtils';

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
 * Accurately extracts league name from text or markdown headers,
 * strictly prioritizing specific names (e.g. "巴西甲", "巴甲") over substrings (e.g. "西甲")
 * to prevent bizarre misclassifications.
 */
export function extractLeagueFromText(text: string): string | null {
  if (!text) return null;

  // 1. Explicit league tag: e.g. 联赛：巴西甲, 赛事: 巴甲, 比赛：欧冠
  const explicitMatch = text.match(/(?:联赛|赛事|级别|比赛)[：:\s]+([^\s|｜\n,，;；()（）[\]【】]{2,12})/);
  if (explicitMatch) {
    const name = explicitMatch[1].trim();
    if (name && !['对阵', '常规', '快照', '列表'].includes(name)) {
      return normalizeLeagueName(name);
    }
  }

  // 2. Bracketed prefix in header or text: e.g. 【巴西甲】, [巴西甲], (巴甲), 【巴乙】
  const bracketMatch = text.match(/(?:\[|【|\()([^\d\s\n,;，；|/\\#【】（()[\]]{2,10})(?:\]|】|\))/);
  if (bracketMatch) {
    const raw = bracketMatch[1].trim();
    if (/(?:甲|乙|超|冠|联|杯|赛)/.test(raw)) {
      return normalizeLeagueName(raw);
    }
  }

  // 3. Keyword matching - MUST BE ORDERED with longest and specific first!
  // NOTICE: 巴西甲, 巴西乙, 巴甲, 巴乙 MUST come BEFORE 西甲, 西乙!
  const SPECIFIC_LEAGUES: Array<{ pattern: RegExp; name: string }> = [
    // South American & American
    { pattern: /(?:巴西甲级联赛|巴西甲级|巴西甲|巴西A|巴甲联赛|巴甲)/i, name: '巴西甲' },
    { pattern: /(?:巴西乙级联赛|巴西乙级|巴西乙|巴西B|巴乙联赛|巴乙)/i, name: '巴西乙' },
    { pattern: /(?:阿根廷甲级联赛|阿根廷甲|阿甲)/i, name: '阿甲' },
    { pattern: /(?:美职业|美职联|美职|MLS)/i, name: '美职联' },
    { pattern: /(?:墨超|墨西哥联|墨联)/i, name: '墨超' },
    { pattern: /(?:解放者杯|南美解放者杯)/i, name: '解放者杯' },
    { pattern: /(?:南美杯|南美俱乐部杯)/i, name: '南美杯' },

    // European Big 5 & second tiers
    { pattern: /(?:英格兰超级联赛|英超)/i, name: '英超' },
    { pattern: /(?:英格兰冠军联赛|英冠)/i, name: '英冠' },
    { pattern: /(?:英甲)/i, name: '英甲' },
    { pattern: /(?:西班牙甲级联赛|西班牙甲|(?<!巴)西甲)/i, name: '西甲' },
    { pattern: /(?:西班牙乙级联赛|西班牙乙|(?<!巴)西乙)/i, name: '西乙' },
    { pattern: /(?:德国甲级联赛|德甲)/i, name: '德甲' },
    { pattern: /(?:德国乙级联赛|德乙)/i, name: '德乙' },
    { pattern: /(?:意大利甲级联赛|意甲)/i, name: '意甲' },
    { pattern: /(?:意大利乙级联赛|意乙)/i, name: '意乙' },
    { pattern: /(?:法国甲级联赛|法甲)/i, name: '法甲' },
    { pattern: /(?:法国乙级联赛|法乙)/i, name: '法乙' },

    // European Continental & other European
    { pattern: /(?:欧洲国家联赛|欧国联)/i, name: '欧国联' },
    { pattern: /(?:欧洲冠军联赛|欧冠联|欧冠)/i, name: '欧冠' },
    { pattern: /(?:欧罗巴杯|欧罗巴联赛|欧联杯|欧罗巴)/i, name: '欧联杯' },
    { pattern: /(?:欧洲协会联赛|欧协联|欧协杯)/i, name: '欧协联' },
    { pattern: /(?:荷兰甲级联赛|荷甲)/i, name: '荷甲' },
    { pattern: /(?:葡萄牙超级联赛|葡超)/i, name: '葡超' },
    { pattern: /(?:苏格兰超级联赛|苏超)/i, name: '苏超' },
    { pattern: /(?:比利时甲级联赛|比甲)/i, name: '比甲' },
    { pattern: /(?:俄罗斯超级联赛|俄超)/i, name: '俄超' },
    { pattern: /(?:土耳其超级联赛|土超)/i, name: '土超' },
    { pattern: /(?:瑞士超级联赛|瑞士超)/i, name: '瑞士超' },
    { pattern: /(?:奥地利甲级联赛|奥甲)/i, name: '奥甲' },
    { pattern: /(?:丹麦超级联赛|丹麦超)/i, name: '丹麦超' },
    { pattern: /(?:挪威超级联赛|挪超)/i, name: '挪超' },
    { pattern: /(?:瑞典超级联赛|瑞典超)/i, name: '瑞典超' },

    // Asia & Domestic
    { pattern: /(?:日本职业联赛|日职联|日职|J1)/i, name: '日职联' },
    { pattern: /(?:日本乙级联赛|日职乙|J2)/i, name: '日职乙' },
    { pattern: /(?:韩国K联赛|韩K联|韩K)/i, name: '韩K联' },
    { pattern: /(?:澳大利亚超级联赛|澳洲甲|澳超)/i, name: '澳超' },
    { pattern: /(?:沙特超级联赛|沙特联)/i, name: '沙特联' },
    { pattern: /(?:中国超级联赛|中超)/i, name: '中超' },
    { pattern: /(?:中国甲级联赛|中甲)/i, name: '中甲' },
    { pattern: /(?:亚冠精英联赛|亚冠精英|亚冠联|亚冠)/i, name: '亚冠' },

    // International tournaments
    { pattern: /(?:世界杯)/i, name: '世界杯' },
    { pattern: /(?:欧洲杯)/i, name: '欧洲杯' },
    { pattern: /(?:美洲杯)/i, name: '美洲杯' },
    { pattern: /(?:亚洲杯)/i, name: '亚洲杯' },
    { pattern: /(?:非洲杯)/i, name: '非洲杯' },
    { pattern: /(?:足总杯)/i, name: '足总杯' },
    { pattern: /(?:国王杯)/i, name: '国王杯' },
    { pattern: /(?:意杯|意大利杯)/i, name: '意杯' },
    { pattern: /(?:德杯|德国杯)/i, name: '德杯' },
    { pattern: /(?:国际友谊赛|友谊赛)/i, name: '国际友谊' },
    { pattern: /(?:北单|北京单场)/i, name: '北单' },
    { pattern: /(?:竞彩足球|竞彩)/i, name: '竞彩' },
  ];

  for (const item of SPECIFIC_LEAGUES) {
    if (item.pattern.test(text)) {
      return item.name;
    }
  }

  return null;
}

function normalizeLeagueName(name: string): string {
  const n = name.trim();
  if (n.includes('巴西甲') || n.includes('巴甲') || n.includes('巴西A')) return '巴西甲';
  if (n.includes('巴西乙') || n.includes('巴乙') || n.includes('巴西B')) return '巴西乙';
  if (n.includes('阿根廷') || n.includes('阿甲')) return '阿甲';
  if (n.includes('英超')) return '英超';
  if (n.includes('西甲') && !n.includes('巴西甲') && !n.includes('巴甲') && !n.includes('巴西')) return '西甲';
  if (n.includes('西乙') && !n.includes('巴西乙') && !n.includes('巴乙') && !n.includes('巴西')) return '西乙';
  if (n.includes('德甲')) return '德甲';
  if (n.includes('意甲')) return '意甲';
  if (n.includes('法甲')) return '法甲';
  if (n.includes('日职')) return '日职联';
  if (n.includes('韩K')) return '韩K联';
  if (n.includes('美职')) return '美职联';
  if (n.includes('中超')) return '中超';
  if (n.includes('欧冠')) return '欧冠';
  if (n.includes('欧国联')) return '欧国联';
  return n;
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

  // Blacklisted non-team words
  const INVALID_WORDS = [
    '时点', '核对', '快照', '验证', '明细', '公司', '总结', '对阵',
    '列表', '板块', '参考', '截止', '开赛', '范围', '销售日', '指数',
    '数据', '时间', '表头', '赔率', '抓取', '逐家', '原盘', '即时'
  ];

  const isValidTeamName = (name: string): boolean => {
    if (!name || name.length < 2 || name.length > 12) return false;
    if (INVALID_WORDS.some((w) => name.includes(w))) return false;
    if (/^[#\d\s\-*|/\\.,:：]+$/.test(name)) return false;
    return true;
  };

  // 1. Teams & League extraction (Ensure on the SAME line, no newlines!)
  const vsMatch = fullText.match(
    /(?:^|\n|[#|•\-])[^\S\r\n]*([^\d\s\n,;，；|/\\#【】（(]{2,10})[^\S\r\n]*(?:\bvs\b|\bVS\b|\bVs\b|对阵)[^\S\r\n]*([^\d\s\n,;，；|/\\#【】（(]{2,10})/i
  );
  if (vsMatch && result.matchInfo) {
    const home = vsMatch[1].trim();
    const away = vsMatch[2].trim();
    if (isValidTeamName(home) && isValidTeamName(away)) {
      result.matchInfo.homeTeam = home;
      result.matchInfo.awayTeam = away;
    }
  }

  // League keywords & explicit extraction (strictly prioritizing specific prefixes like 巴西甲/巴甲 over 西甲)
  const extractedLeague = extractLeagueFromText(fullText);
  if (extractedLeague && result.matchInfo) {
    result.matchInfo.league = extractedLeague;
  }

  // Kickoff time extraction
  const extractedTime = extractKickoffTime(fullText);
  if (extractedTime && extractedTime !== '临场' && result.matchInfo) {
    result.matchInfo.matchTime = extractedTime;
  }

  // 2. Euro odds extraction
  // Format: 欧初1.36/4.40/7.50即1.30/4.60/9.50 or 1.45 4.50 7.00 -> 1.30 5.00 9.00
  const euroDualMatch = fullText.match(
    /欧初\s*(\d+\.\d{1,3})[/ ]+(\d+\.\d{1,3})[/ ]+(\d+\.\d{1,3})\s*即\s*(\d+\.\d{1,3})[/ ]+(\d+\.\d{1,3})[/ ]+(\d+\.\d{1,3})/
  );
  if (euroDualMatch && result.euroOdds) {
    result.euroOdds.earlyWin = parseFloat(euroDualMatch[1]);
    result.euroOdds.earlyDraw = parseFloat(euroDualMatch[2]);
    result.euroOdds.earlyLoss = parseFloat(euroDualMatch[3]);
    result.euroOdds.lateWin = parseFloat(euroDualMatch[4]);
    result.euroOdds.lateDraw = parseFloat(euroDualMatch[5]);
    result.euroOdds.lateLoss = parseFloat(euroDualMatch[6]);
  } else {
    const euroGroups = [
      ...fullText.matchAll(/(\d+\.\d{1,3})[\s/]+(\d+\.\d{1,3})[\s/]+(\d+\.\d{1,3})/g),
    ];
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
  // Check for dual match: 亚初一球/球半[0.910/0.800]即球半[1.060/0.780]
  const asianDualMatch = fullText.match(
    /亚初\s*([^\s\[\]]+)\[([\d.]+)[/ ]+([\d.]+)\]\s*即\s*([^\s\[\]]+)\[([\d.]+)[/ ]+([\d.]+)\]/
  );
  if (asianDualMatch && result.asianHandicap) {
    result.asianHandicap.earlyHandicap = asianDualMatch[1];
    result.asianHandicap.earlyHomeOdds = normalizeWaterOdds(parseFloat(asianDualMatch[2]));
    result.asianHandicap.earlyAwayOdds = normalizeWaterOdds(parseFloat(asianDualMatch[3]));
    result.asianHandicap.lateHandicap = asianDualMatch[4];
    result.asianHandicap.lateHomeOdds = normalizeWaterOdds(parseFloat(asianDualMatch[5]));
    result.asianHandicap.lateAwayOdds = normalizeWaterOdds(parseFloat(asianDualMatch[6]));
  } else {
    // 3.1 Check crawler snapshot format:
    // "盘口分布 受半球/一球×12" or "盘口分布 一球×14"
    const distMatch = fullText.match(/盘口分布\s*([^\s×·,，()（）\d]+(?:[^\s×·,，()（）]+)?)/);
    // "让球线 -1（主队让1球）" or "让球线 1（主队受让1球（客队让1球））" or "让球线 0（不让球）"
    const lineWithDescMatch = fullText.match(/让球线\s*[:：\-*]*\s*([+\-]?\d+(?:\.\d+)?)\s*（([^）]+)）/);

    if (distMatch && result.asianHandicap) {
      result.asianHandicap.lateHandicap = distMatch[1].trim();
      if (lineWithDescMatch && result.matchInfo) {
        result.matchInfo.marketStory = `北单/竞彩让球线: ${lineWithDescMatch[0]}`;
      }
    } else if (lineWithDescMatch && result.asianHandicap) {
      const lineVal = parseFloat(lineWithDescMatch[1]);
      if (lineVal === 0) {
        result.asianHandicap.lateHandicap = '平手 (0)';
      } else if (lineVal < 0) {
        result.asianHandicap.lateHandicap = `主让${Math.abs(lineVal)}球 (${lineVal})`;
      } else {
        result.asianHandicap.lateHandicap = `客让${lineVal}球 (+${lineVal})`;
      }
    } else {
      // Longest keywords first so "受半球/一球" and "受一球" match before "一球"!
      const handicapKeywords = [
        '两球半/三球', '两球/两球半', '球半/两球', '受半球/一球', '一球/球半',
        '两球半', '受两球', '两球', '受球半', '球半', '受一球', '一球',
        '受半一', '半一', '受半球', '半球', '受平半', '平半', '平手',
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
    }

    // Water level extraction
    const waterMatch = fullText.match(/(?:即时主水均|主水均|水位|水|盘水|主水)[\s:：]*(\d\.\d{2,3})/);
    if (waterMatch && result.asianHandicap) {
      result.asianHandicap.lateHomeOdds = normalizeWaterOdds(parseFloat(waterMatch[1]));
    }
    const guestWaterMatch = fullText.match(/(?:即时客水均|客水均|客水)[\s:：]*(\d\.\d{2,3})/);
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

  const INVALID_WORDS = [
    '时点', '核对', '快照', '验证', '明细', '公司', '总结', '对阵',
    '列表', '板块', '参考', '截止', '开赛', '范围', '销售日', '指数',
    '数据', '时间', '表头', '赔率', '抓取', '逐家', '原盘', '即时'
  ];

  const isValidTeamName = (name: string): boolean => {
    if (!name || name.length < 2 || name.length > 12) return false;
    if (INVALID_WORDS.some((w) => name.includes(w))) return false;
    if (/^[#\d\s\-*|/\\.,:：]+$/.test(name)) return false;
    return true;
  };

  // Pattern 1A: Numbered match sections (e.g. "## 【1】塞浦路斯 vs 拉脱维亚")
  const numberedSplitPattern =
    /(?:^|\n)(?=##+\s*【?\s*\d+\s*】?\.?\s*[^\n\r]*?(?:\bvs\b|\bVS\b|对阵)[^\n\r]*)/gi;
  let sections = text
    .split(numberedSplitPattern)
    .map((s) => s.trim())
    .filter((s) =>
      /##+\s*【?\s*\d+\s*】?\.?\s*[^\n\r]*?(?:\bvs\b|\bVS\b|对阵)/i.test(s)
    );

  // Pattern 1B: If no numbered sections, try general single-line match headings
  if (sections.length === 0) {
    const generalSplitPattern =
      /(?:^|\n)(?=##+\s*[^\n\r]*?(?:\bvs\b|\bVS\b|对阵)[^\n\r]*)/gi;
    sections = text
      .split(generalSplitPattern)
      .map((s) => s.trim())
      .filter((s) => /##+\s*[^\n\r]*?(?:\bvs\b|\bVS\b|对阵)/i.test(s));
  }

  if (sections.length > 0) {
    for (const section of sections) {
      // Find team heading strictly on the FIRST line of the section (prevents newline bleed)
      const firstLine = section.split('\n')[0].trim();
      const headingMatch = firstLine.match(
        /##+\s*(?:【?\s*\d+\s*】?\.?\s*)?([^\d\s\n#【】（(]{2,10})[^\S\r\n]*(?:\bvs\b|\bVS\b|对阵)[^\S\r\n]*([^\d\s\n#【】（(]{2,10})/i
      );
      if (!headingMatch) continue;

      const home = headingMatch[1].trim();
      const away = headingMatch[2].trim();

      if (!isValidTeamName(home) || !isValidTeamName(away)) continue;

      // Extract league from section
      const league =
        extractLeagueFromText(section) ||
        extractLeagueFromText(firstLine) ||
        '常规联赛';

      // Extract match time (intelligent recognition of Markdown datetime formats)
      const matchTime = extractKickoffTime(section, rawText);

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
          homeTeam: home,
          awayTeam: away,
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

    const rowMatchTime = extractKickoffTime(line, rawText);

    if (cols.length >= 7 && !line.includes('家')) {
      // Full CSV / Markdown row with odds
      const defaultMatch: FullMatchData = {
        matchInfo: {
          league: normalizeLeagueName(cols[0] || '常规联赛'),
          homeTeam: cols[1] || home,
          awayTeam: cols[2] || away,
          matchTime: rowMatchTime,
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
        league: extractLeagueFromText(line) || '常规联赛',
        homeTeam: home,
        awayTeam: away,
        matchTime: rowMatchTime,
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

export const SAMPLE_BATCH_MARKDOWN = `# 2026-03-28 竞彩足球大盘分析 (竞彩销售日: 03-28 11:00 ~ 03-29 11:00)

## 【1】曼彻斯特城 vs 埃弗顿
- 联赛：英超
- 开赛时间：2026-03-28 23:00
- 亚盘让步：-1.75 (初盘 1.95 / 即时 1.76)
- 欧指走势：1.22 6.80 12.0
- 大小球：3.25 (大水 1.90 / 小水 1.90)
- 题材：争冠极限榨水稳胆

## 【2】皇家马德里 vs 赫塔菲
- 联赛：西甲
- 开赛时间：2026-03-29 03:00
- 亚盘让步：-1.25 (初盘 -1.0 1.86 / 即时 -1.25 2.06)
- 欧指走势：1.42 4.60 7.20
- 大小球：2.5 (大水 1.90 / 小水 1.90)
- 题材：豪门名气拉满升盘满水诱上

## 【3】多特蒙德 vs 波鸿
- 联赛：德甲
- 开赛时间：2026-03-28 22:30
- 亚盘让步：-0.25 (初盘 -0.5 1.92 / 即时 -0.25 2.05)
- 欧指走势：2.15 3.45 3.30
- 大小球：2.75 (大水 1.90 / 小水 1.90)
- 题材：主场浅盘满水丢分死穴

## 【4】拉齐奥 vs 佛罗伦萨
- 联赛：意甲
- 开赛时间：2026-03-29 03:45
- 亚盘让步：-0.25 (初盘 1.98 / 即时 1.94)
- 欧指走势：2.50 2.90 2.95
- 大小球：2.25 (大水 1.90 / 小水 1.90)
- 题材：平赔低洼死压2.90首选胆平`;

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
  matchTime?: string;
  salesDate?: string;
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

function normalizeScoreDate(raw: string, yearAnchor?: string): string | undefined {
  const full = raw.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  const monthDay = raw.match(/(\d{1,2})[-/.月](\d{1,2})(?:日)?/);
  const year = full ? Number(full[1]) : Number(yearAnchor?.slice(0, 4) || new Date().getFullYear());
  const month = full ? Number(full[2]) : Number(monthDay?.[1]);
  const day = full ? Number(full[3]) : Number(monthDay?.[2]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeScoreClock(raw: string): string | undefined {
  const match = raw.match(/(\d{1,2})[:：](\d{2})/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return undefined;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function splitScoreColumns(line: string): string[] {
  return line.split(/[|\t,，]/).map(part => part.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

/** Extract only unambiguous kickoff metadata; a plain score such as 2:45 is not a clock. */
function extractScoreLineMetadata(
  line: string,
  salesDateAnchor?: string,
  yearAnchor?: string,
  timeColumnIndex?: number
): { cleanLine: string; matchTime?: string; salesDate?: string } {
  let cleanLine = line;
  let anchor = salesDateAnchor;
  let date: string | undefined;
  let clock: string | undefined;

  const salesLabel = cleanLine.match(/(?:竞彩)?销售日\s*[：:]?\s*(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?)/);
  const salesSuffix = cleanLine.match(/(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?)\s*销售日/);
  const salesMatch = salesLabel || salesSuffix;
  if (salesMatch) {
    anchor = normalizeScoreDate(salesMatch[1], yearAnchor) || anchor;
    cleanLine = cleanLine.replace(salesMatch[0], ' ');
  }

  // Full calendar dates always describe the actual kickoff, including dates in parentheses.
  const fullDateTime = cleanLine.match(/(?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}(?:\s+|T)|(?:20\d{2}年)?\d{1,2}月\d{1,2}日\s*)(\d{1,2}[:：]\d{2}(?:[:：]\d{2})?)/);
  if (fullDateTime) {
    date = normalizeScoreDate(fullDateTime[0], anchor || yearAnchor);
    clock = normalizeScoreClock(fullDateTime[1]);
    cleanLine = cleanLine.replace(fullDateTime[0], ' ');
  }

  // Month/day requires a time label or its own column, so a score like "2-1 2:45" stays a score.
  const labeledTime = cleanLine.match(/(?:开赛时间|比赛时间|开赛时刻|开赛|时刻|时间)\s*[：:]?\s*((?:\d{1,2}[-/.]\d{1,2}\s+)?\d{1,2}[:：]\d{2}(?:[:：]\d{2})?)/);
  if (labeledTime) {
    if (!clock) {
      clock = normalizeScoreClock(labeledTime[1]);
      if (/[-/.]/.test(labeledTime[1])) date = normalizeScoreDate(labeledTime[1], anchor || yearAnchor);
    }
    cleanLine = cleanLine.replace(labeledTime[0], ' ');
  }

  if (!clock && /[|\t,，]/.test(cleanLine)) {
    const columns = splitScoreColumns(cleanLine);
    const dateTimeColumn = columns.find(column => /^\d{1,2}[-/.]\d{1,2}\s+\d{1,2}[:：]\d{2}$/.test(column));
    if (dateTimeColumn) {
      date = normalizeScoreDate(dateTimeColumn, anchor || yearAnchor);
      clock = normalizeScoreClock(dateTimeColumn);
      cleanLine = cleanLine.replace(dateTimeColumn, ' ');
    } else {
      const labeledColumn = timeColumnIndex === undefined ? undefined : columns[timeColumnIndex];
      // Without a header, require a separate score column and a padded HH:mm clock.
      const clockColumn = labeledColumn && /^\d{1,2}[:：]\d{2}$/.test(labeledColumn)
        ? labeledColumn
        : columns.find((column, index) => /^(?:[01]\d|2[0-3])[:：][0-5]\d$/.test(column)
          && columns.some((other, otherIndex) => otherIndex !== index && /^\d{1,2}\s*[-:：比]\s*\d{1,2}$/.test(other)));
      if (clockColumn) {
        clock = normalizeScoreClock(clockColumn);
        cleanLine = cleanLine.replace(clockColumn, ' ');
      }
    }
  }

  // A separate calendar-date column can accompany a clock column or omit the time altogether.
  const fullDate = cleanLine.match(/20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?/);
  if (fullDate) {
    if (!date) date = normalizeScoreDate(fullDate[0], anchor || yearAnchor);
    cleanLine = cleanLine.replace(fullDate[0], ' ');
  }
  cleanLine = cleanLine.replace(/(?:开赛日期|开赛时间|比赛时间|开赛时刻|开赛|时刻|时间)\s*[：:]\s*/g, ' ');

  if (!date && clock && anchor) {
    const [year, month, day] = anchor.split('-').map(Number);
    const actualDate = new Date(year, month - 1, day + (Number(clock.slice(0, 2)) < 11 ? 1 : 0));
    date = `${actualDate.getFullYear()}-${String(actualDate.getMonth() + 1).padStart(2, '0')}-${String(actualDate.getDate()).padStart(2, '0')}`;
  }
  const matchTime = date ? `${date}${clock ? ` ${clock}` : ''}` : clock;
  const salesDate = date ? calculateSalesDate(matchTime, undefined, anchor).salesDate : anchor;
  return { cleanLine, matchTime, salesDate };
}

/**
 * Parses batch match scores from plain text, markdown, CSV, or OCR outputs
 */
export function parseBatchMatchScoresFromText(
  rawText: string,
  candidates: { id: string; home: string; away: string; league?: string; matchTime?: string; timestamp?: number; salesDate?: string }[] = []
): ParsedScoreItem[] {
  const lines = rawText.split('\n');
  const results: ParsedScoreItem[] = [];
  let itemCounter = 0;
  const documentDate = extractDocumentGlobalDate(rawText) || undefined;
  let salesDateAnchor: string | undefined;
  let timeColumnIndex: number | undefined;
  const candidatesWithDates = candidates.map(candidate => ({
    candidate,
    salesDate: (candidate.salesDate && /^\d{4}-\d{2}-\d{2}$/.test(candidate.salesDate)) || hasExplicitKickoffDate(candidate.matchTime)
      ? calculateSalesDate(candidate.matchTime, candidate.timestamp, candidate.salesDate).salesDate
      : undefined,
  }));

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const isDateHeading = line.startsWith('#')
      || /^(?:[>\-*]\s*)?(?:竞彩)?(?:销售日|日期|比赛日)\s*[：:]?\s*20\d{2}/.test(line)
      || /^(?:[>\-*]\s*)?20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?\s*销售日\s*$/.test(line);
    if (isDateHeading) {
      const headingDate = extractDocumentGlobalDate(line) || normalizeScoreDate(line, documentDate);
      if (headingDate) salesDateAnchor = headingDate;
    }
    if (line.includes('主队') && line.includes('客队') && line.includes('比分')) {
      const columns = splitScoreColumns(line);
      const columnIndex = columns.findIndex(column => /^(?:开赛时间|比赛时间|开赛|时间|日期时间)$/.test(column));
      timeColumnIndex = columnIndex < 0 ? undefined : columnIndex;
      continue;
    }
    if (!line || line.startsWith('#') || line.startsWith('---') || line.startsWith('===') || isDateHeading) {
      continue;
    }

    const metadata = extractScoreLineMetadata(line, salesDateAnchor, documentDate, timeColumnIndex);

    let home = '';
    let away = '';
    let homeScore = -1;
    let awayScore = -1;
    let incidents = '';

    // Check for incident notes in parentheses
    const incidentMatch = metadata.cleanLine.match(/[（(]([^）)]+)[）)]/);
    if (incidentMatch) {
      incidents = incidentMatch[1].replace(/^[\s,，;；]+|[\s,，;；]+$/g, '').trim();
    }

    const cleanLine = metadata.cleanLine.replace(/[（(][^）)]*[）)]/g, '').trim();

    // Pattern 1: [TeamA] vs [TeamB] [Score] (e.g. "曼城 vs 埃弗顿 2-1" or "曼城 VS 埃弗顿 : 2:1")
    const p1 = cleanLine.match(/([^\d\n\r|:：,，;；\t]{2,12})\s*(?:vs|VS|对阵|对)\s*([^\d\n\r|:：,，;；\t]{2,12})[\s\t,，:：|]+(?:比分)?\s*(\d{1,2})\s*[-:：比\s]\s*(\d{1,2})/i);
    if (p1) {
      home = p1[1].trim();
      away = p1[2].trim();
      homeScore = parseInt(p1[3], 10);
      awayScore = parseInt(p1[4], 10);
    }

    // Pattern 2: [TeamA] [Score] [TeamB] (e.g. "曼城 2-1 埃弗顿", "瑞士 1:0 斯洛文尼亚", "完场 曼城 2比1 埃弗顿")
    if (homeScore === -1) {
      const p2 = cleanLine.match(/(?:完场|全场|终场|赛果)?\s*([^\d\n\r|:：,，;；\t]{2,12})\s*(\d{1,2})\s*[-:：比\s]\s*(\d{1,2})\s*([^\d\n\r|:：,，;；\t]{2,12})/);
      if (p2) {
        home = p2[1].replace(/完场|全场|终场|赛果/g, '').trim();
        homeScore = parseInt(p2[2], 10);
        awayScore = parseInt(p2[3], 10);
        away = p2[4].trim();
      }
    }

    // Pattern 3: Markdown table row with pipes (e.g. "| 瑞士 | 1-0 | 斯洛文尼亚 |" or "| 瑞士 vs 斯洛文尼亚 | 1:0 |")
    if (homeScore === -1 && cleanLine.includes('|')) {
      const parts = cleanLine.split('|').map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        for (let i = 0; i < parts.length; i++) {
          const scoreMatch = parts[i].match(/^(\d{1,2})\s*[-:：比]\s*(\d{1,2})$/);
          if (scoreMatch) {
            homeScore = parseInt(scoreMatch[1], 10);
            awayScore = parseInt(scoreMatch[2], 10);
            // Team names from previous or next columns
            if (i > 0 && /vs|对阵|对/i.test(parts[i - 1])) {
              const [h, a] = parts[i - 1].split(/vs|对阵|对/i);
              home = h.trim();
              away = a.trim();
            } else if (i > 0 && i < parts.length - 1) {
              home = parts[i - 1];
              away = parts[i + 1];
            } else if (i >= 2) {
              home = parts[i - 2];
              away = parts[i - 1];
            }
            break;
          }
        }
      }
    }

    // Pattern 4: CSV / Tab separated line: "瑞士,1,0,斯洛文尼亚" or "瑞士,斯洛文尼亚,1-0"
    if (homeScore === -1 && /[,，\t]/.test(cleanLine)) {
      const tokens = splitScoreColumns(cleanLine);
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
        } else {
          const scoreIndex = tokens.findIndex((token, index) => /^\d{1,2}$/.test(token)
            && index < tokens.length - 1 && /^\d{1,2}$/.test(tokens[index + 1]));
          if (scoreIndex > 0 && scoreIndex + 2 < tokens.length) {
            home = tokens[scoreIndex - 1];
            away = tokens[scoreIndex + 2];
            homeScore = Number(tokens[scoreIndex]);
            awayScore = Number(tokens[scoreIndex + 1]);
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

      const matchingDates = new Set(candidatesWithDates
        .filter(({ candidate, salesDate }) => salesDate && matchTeamsFuzzy(home, candidate.home) && matchTeamsFuzzy(away, candidate.away))
        .map(({ salesDate }) => salesDate));
      const ambiguousDate = !metadata.salesDate && matchingDates.size > 1;

      for (const { candidate: cand, salesDate: candidateSalesDate } of candidatesWithDates) {
        if (ambiguousDate || (metadata.salesDate && candidateSalesDate && metadata.salesDate !== candidateSalesDate)) continue;
        const homeMatch = matchTeamsFuzzy(home, cand.home);
        const awayMatch = matchTeamsFuzzy(away, cand.away);

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
        matchTime: metadata.matchTime,
        salesDate: metadata.salesDate,
        incidents,
        matchedId,
        matchedName,
        confidence,
      });
    }
  }

  return results;
}
