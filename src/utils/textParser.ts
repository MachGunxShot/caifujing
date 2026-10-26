import { FullMatchData, AsianHandicapData, EuroOddsData, OverUnderData } from '../types/fortuneActuary';
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
    { pattern: /(?:丹麦超级联赛|丹麦超级|丹麦超)/i, name: '丹麦超' },
    { pattern: /(?:挪威超级联赛|挪威超级|挪威超联|挪威超|挪超)/i, name: '挪超' },
    { pattern: /(?:挪威甲级联赛|挪威甲级|挪威甲|挪甲)/i, name: '挪甲' },
    { pattern: /(?:瑞典超级联赛|瑞典超级|瑞典超)/i, name: '瑞典超' },

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

  // 4. Well-known iconic club recognition when document leaves league unstated
  const CLUB_LEAGUE_MAP: Array<{ pattern: RegExp; name: string }> = [
    { pattern: /(?:巴黎圣日耳曼|里昂|摩纳哥|马赛|里尔|朗斯|雷恩)/, name: '法甲' },
    { pattern: /(?:皇家马德里|巴塞罗那|马德里竞技|塞维利亚|奥萨苏纳|赫塔菲|毕尔巴鄂|比利亚雷亚尔|皇家社会|巴伦西亚|赫罗纳)/, name: '西甲' },
    { pattern: /(?:本菲卡|波尔图|葡萄牙体育|圣塔克莱拉|布拉加|吉马良斯|法马利康)/, name: '葡超' },
    { pattern: /(?:曼彻斯特城|阿森纳|利物浦|切尔西|托特纳姆热刺|曼联|纽卡斯尔|阿斯顿维拉|布莱顿|埃弗顿)/, name: '英超' },
    { pattern: /(?:拜仁慕尼黑|多特蒙德|勒沃库森|莱比锡|法兰克福|波鸿|斯图加特)/, name: '德甲' },
    { pattern: /(?:国际米兰|AC米兰|尤文图斯|那不勒斯|罗马|拉齐奥|佛罗伦萨|亚特兰大)/, name: '意甲' },
    { pattern: /(?:法林明高|弗拉门戈|帕尔梅拉斯|圣保罗|米内罗竞技|科林蒂安|巴拉纳竞技|福塔雷萨|克鲁塞罗)/, name: '巴西甲' },
    { pattern: /(?:科里蒂巴|哥里迪巴|甘美奥|格雷米奥|累西腓体育|塞阿拉)/, name: '巴西乙' },
    { pattern: /(?:博卡青年|河床|拉普拉塔大学生|学生队|竞技俱乐部|独立队|圣塔菲联|科尔多瓦学院|利斯特雷|瑞斯塔)/, name: '阿甲' },
    { pattern: /(?:阿尔艾因|阿尔艾利吉达|吉达国民|阿尔萨德|卡达西亚|瓜达席亚|伊蒂哈德吉达|吉达联合|阿尔葛拉法|加拉法|帕克塔科|塔什干棉农|巴格达空军|费尔干纳夫兹|泰拉克托)/, name: '亚冠' },
    { pattern: /(?:博德闪耀|莫尔德|罗森博格|汉坎|布兰|维京|桑德菲杰|特罗姆瑟|萨普斯堡|利勒斯特罗姆|海于格松|腓特烈斯塔|奥德|克里斯蒂安松|KFUM奥斯陆|斯特罗姆加斯特|斯达|瓦勒伦加)/, name: '挪超' },
    { pattern: /(?:斯塔贝克|康斯文格|兰赫姆|莫斯|劳福斯|松达尔|布莱尼|埃格尔森德|姆延达伦|阿萨纳|勒旺厄尔)/, name: '挪甲' },
    { pattern: /(?:马尔默|埃尔夫斯堡|佐加顿斯|哈马比|索尔纳|赫根|北雪平|米亚尔比|天狼星|哈尔姆斯塔德|哥德堡|韦斯特罗斯|卡尔马|盖斯|布鲁马波卡纳|韦纳穆)/, name: '瑞典超' },
    { pattern: /(?:埃因霍温|费耶诺德|阿贾克斯|阿尔克马尔|特温特|乌德勒支|前进之鹰|奈梅亨|海伦芬|福图纳锡塔德|兹沃勒|阿尔梅勒城|瓦尔韦克|鹿特丹斯巴达|威廉二世|格罗宁根|布雷达|赫拉克勒斯)/, name: '荷甲' },
    { pattern: /(?:布鲁日|圣吉罗斯|安德莱赫特|亨克|根特|安特卫普|色格拉布鲁日|标准列日|韦斯特洛|圣图尔登|梅赫伦|沙勒罗瓦|奥哈瓦里|科特赖克|比尔肖特|登德尔)/, name: '比甲' },
    { pattern: /(?:哥本哈根|中日德兰|布隆德比|诺西兰|奥胡斯|锡尔克堡|维堡|兰讷斯|瓦埃勒|奥尔堡|桑德捷斯基|灵比)/, name: '丹麦超' },
    { pattern: /(?:凯尔特人|格拉斯哥流浪者|流浪者|哈茨|阿伯丁|希伯尼安|基尔马诺克|圣米伦|马瑟韦尔|邓迪联|邓迪FC)/, name: '苏超' },
    { pattern: /(?:利兹联|伯恩利|谢菲尔德联|谢菲联|卢顿|桑德兰|西布罗姆维奇|西布朗|米德尔斯堡|诺维奇|考文垂|沃特福德|斯托克城|布里斯托尔城|斯旺西|普雷斯顿|布莱克本|赫尔城|女王公园巡游者|加的夫城|朴茨茅斯|德比郡|牛津联|谢周三|普利茅斯)/, name: '英冠' },
    { pattern: /(?:神户胜利船|广岛三箭|町田泽维亚|町田|鹿岛鹿角|大阪钢巴|东京绿茵|大阪樱花|FC东京|横滨水手|名古屋鲸八|名古屋鲸|福冈黄蜂|川崎前锋|浦和红钻|京都不死鸟|湘南丽海|柏太阳神|鸟栖砂岩|磐田喜悦|札幌冈萨多|清水心跳)/, name: '日职联' },
    { pattern: /(?:蔚山HD|蔚山现代|浦项铁人|光州FC|全北现代|首尔FC|金泉尚武|江原FC|水原FC|济州联|大田市民|大邱FC|仁川联)/, name: '韩K联' },
  ];

  for (const item of CLUB_LEAGUE_MAP) {
    if (item.pattern.test(text)) {
      return item.name;
    }
  }

  return null;
}

export function normalizeLeagueName(name: string): string {
  if (!name) return '常规联赛';
  const n = name.trim();
  // 挪威系列：只要包含“超级”或“挪超”，严格归一为“挪超”，阻断误判为“挪甲”
  if (n.includes('挪威超级') || n.includes('挪威超') || n.includes('挪超') || n.includes('挪威足球超级')) return '挪超';
  if (n.includes('挪威甲') || n.includes('挪甲') || n.includes('挪威足球甲级')) return '挪甲';
  // 瑞典/丹麦/芬兰
  if (n.includes('瑞典超级') || n.includes('瑞典超')) return '瑞典超';
  if (n.includes('瑞典甲') || n.includes('瑞典超甲') || n.includes('超甲')) return '瑞典甲';
  if (n.includes('丹麦超级') || n.includes('丹麦超')) return '丹麦超';
  if (n.includes('丹麦甲')) return '丹麦甲';
  if (n.includes('芬兰超级') || n.includes('芬超')) return '芬超';
  // 巴西
  if (n.includes('巴西甲') || n.includes('巴甲') || n.includes('巴西A')) return '巴西甲';
  if (n.includes('巴西乙') || n.includes('巴乙') || n.includes('巴西B')) return '巴西乙';
  // 阿根廷
  if (n.includes('阿根廷') || n.includes('阿甲')) return '阿甲';
  // 五大联赛及次级
  if (n.includes('英格兰超级') || n.includes('英超')) return '英超';
  if (n.includes('英格兰冠军') || n.includes('英冠')) return '英冠';
  if (n.includes('英甲')) return '英甲';
  if ((n.includes('西甲') || n.includes('西班牙甲')) && !n.includes('巴西')) return '西甲';
  if ((n.includes('西乙') || n.includes('西班牙乙')) && !n.includes('巴西')) return '西乙';
  if (n.includes('德甲') || n.includes('德国甲')) return '德甲';
  if (n.includes('德乙') || n.includes('德国乙')) return '德乙';
  if (n.includes('意甲') || n.includes('意大利甲')) return '意甲';
  if (n.includes('意乙') || n.includes('意大利乙')) return '意乙';
  if (n.includes('法甲') || n.includes('法国甲')) return '法甲';
  if (n.includes('法乙') || n.includes('法国乙')) return '法乙';
  // 欧洲其他主流
  if (n.includes('葡超') || n.includes('葡萄牙超级')) return '葡超';
  if (n.includes('葡甲') || n.includes('葡萄牙甲')) return '葡甲';
  if (n.includes('荷甲') || n.includes('荷兰甲')) return '荷甲';
  if (n.includes('荷乙') || n.includes('荷兰乙')) return '荷乙';
  if (n.includes('比甲') || n.includes('比利时甲')) return '比甲';
  if (n.includes('比乙') || n.includes('比利时乙')) return '比乙';
  if (n.includes('苏超') || n.includes('苏格兰超级')) return '苏超';
  if (n.includes('苏冠') || n.includes('苏格兰冠军')) return '苏冠';
  if (n.includes('俄超') || n.includes('俄罗斯超级')) return '俄超';
  if (n.includes('土超') || n.includes('土耳其超级')) return '土超';
  if (n.includes('瑞士超') || n.includes('瑞士超级')) return '瑞士超';
  if (n.includes('奥甲') || n.includes('奥地利甲')) return '奥甲';
  // 欧战及国际
  if (n.includes('欧冠') || n.includes('欧洲冠军')) return '欧冠';
  if (n.includes('欧联') || n.includes('欧罗巴')) return '欧联杯';
  if (n.includes('欧协')) return '欧协联';
  if (n.includes('欧国联') || n.includes('欧洲国家联赛')) return '欧国联';
  // 亚洲/美洲/澳洲
  if (n.includes('日职联') || n.includes('日职') || n.includes('J1') || n.includes('日本职业')) return '日职联';
  if (n.includes('日职乙') || n.includes('J2') || n.includes('日本乙级')) return '日职乙';
  if (n.includes('韩K') || n.includes('韩国K')) return '韩K联';
  if (n.includes('澳超') || n.includes('澳洲甲') || n.includes('澳大利亚超级')) return '澳超';
  if (n.includes('沙特联') || n.includes('沙特超')) return '沙特联';
  if (n.includes('中超') || n.includes('中国超级')) return '中超';
  if (n.includes('中甲') || n.includes('中国甲级')) return '中甲';
  if (n.includes('美职') || n.includes('MLS')) return '美职联';
  if (n.includes('墨超') || n.includes('墨西哥超') || n.includes('墨西哥联')) return '墨超';
  if (n.includes('解放者杯')) return '解放者杯';
  if (n.includes('南美杯')) return '南美杯';
  return n;
}

function parseColOdds(col: string): { home: number; handicap: string; away: number } | null {
  if (!col) return null;
  const parts = col.split(/[/|]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const home = parseFloat(parts[0]);
  const away = parseFloat(parts[parts.length - 1]);
  const middle = parts.slice(1, parts.length - 1).join('/');
  if (isNaN(home) || isNaN(away) || !middle) return null;
  return { home, handicap: middle, away };
}

/**
 * Parses structured company detail tables (### 亚让, ### 大小球, ### 欧指)
 * typically produced by professional crawler captures (球探 / Titan007 / 500网).
 */
export function parseSectionOddsTables(sectionText: string): {
  asianHandicap?: Partial<FullMatchData['asianHandicap']>;
  euroOdds?: Partial<FullMatchData['euroOdds']>;
  overUnder?: Partial<FullMatchData['overUnder']>;
} {
  const lines = sectionText.split('\n').map((l) => l.trim());
  let currentSub = '';

  const asianLines: Array<{
    company: string;
    earlyHome: number;
    earlyHandicap: string;
    earlyAway: number;
    lateHome: number;
    lateHandicap: string;
    lateAway: number;
  }> = [];

  const ouLines: Array<{
    company: string;
    earlyOver: number;
    earlyLine: string;
    earlyUnder: number;
    lateOver: number;
    lateLine: string;
    lateUnder: number;
  }> = [];

  const euroLines: Array<{
    company: string;
    earlyWin: number;
    earlyDraw: number;
    earlyLoss: number;
    lateWin: number;
    lateDraw: number;
    lateLoss: number;
  }> = [];

  for (const line of lines) {
    if (line.includes('### 亚让') || line.includes('### 亚盘') || line.includes('### 让球')) {
      currentSub = 'asian';
      continue;
    }
    if (line.includes('### 大小球') || line.includes('### 大小')) {
      currentSub = 'ou';
      continue;
    }
    if (line.includes('### 欧指') || line.includes('### 欧赔') || line.includes('### 1x2')) {
      currentSub = 'euro';
      continue;
    }
    if (line.startsWith('## ') && currentSub) break;

    if (!line.includes('|') || line.includes('---|') || line.includes('公司ID') || line.includes('来源')) continue;

    const cols = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cols.length < 4) continue;

    const companyName = cols[1] || '';
    const lineRank = cols[2] || '';
    const earlyCol = cols[cols.length - 2];
    const lateCol = cols[cols.length - 1];

    if (currentSub === 'asian') {
      const isMain = lineRank === '1' || lineRank === '主';
      if (isMain) {
        const early = parseColOdds(earlyCol);
        const late = parseColOdds(lateCol);
        if (early && late) {
          asianLines.push({
            company: companyName,
            earlyHome: early.home,
            earlyHandicap: early.handicap,
            earlyAway: early.away,
            lateHome: late.home,
            lateHandicap: late.handicap,
            lateAway: late.away,
          });
        }
      }
    } else if (currentSub === 'ou') {
      const isMain = lineRank === '1' || lineRank === '主';
      if (isMain) {
        const early = parseColOdds(earlyCol);
        const late = parseColOdds(lateCol);
        if (early && late) {
          ouLines.push({
            company: companyName,
            earlyOver: early.home,
            earlyLine: early.handicap,
            earlyUnder: early.away,
            lateOver: late.home,
            lateLine: late.handicap,
            lateUnder: late.away,
          });
        }
      }
    } else if (currentSub === 'euro') {
      const partsEarly = earlyCol.split(/[/|]/).map((p) => parseFloat(p.trim())).filter((n) => !isNaN(n));
      const partsLate = lateCol.split(/[/|]/).map((p) => parseFloat(p.trim())).filter((n) => !isNaN(n));
      if (partsEarly.length >= 3 && partsLate.length >= 3) {
        euroLines.push({
          company: companyName,
          earlyWin: partsEarly[0],
          earlyDraw: partsEarly[1],
          earlyLoss: partsEarly[2],
          lateWin: partsLate[0],
          lateDraw: partsLate[1],
          lateLoss: partsLate[2],
        });
      }
    }
  }

  const result: {
    asianHandicap?: Partial<FullMatchData['asianHandicap']>;
    euroOdds?: Partial<FullMatchData['euroOdds']>;
    overUnder?: Partial<FullMatchData['overUnder']>;
  } = {};

  if (asianLines.length > 0) {
    // Prefer authoritative industry benchmark (澳彩 Macauslot or Crown or Bet365)
    const benchmark =
      asianLines.find((a) => a.company.includes('澳')) ||
      asianLines.find((a) => a.company.includes('Crow')) ||
      asianLines.find((a) => a.company.includes('36')) ||
      asianLines[0];

    const avgEarlyHome = asianLines.reduce((acc, a) => acc + a.earlyHome, 0) / asianLines.length;
    const avgEarlyAway = asianLines.reduce((acc, a) => acc + a.earlyAway, 0) / asianLines.length;
    const avgLateHome = asianLines.reduce((acc, a) => acc + a.lateHome, 0) / asianLines.length;
    const avgLateAway = asianLines.reduce((acc, a) => acc + a.lateAway, 0) / asianLines.length;

    result.asianHandicap = {
      earlyHandicap: benchmark.earlyHandicap,
      earlyHomeOdds: normalizeWaterOdds(benchmark.earlyHome || avgEarlyHome),
      earlyAwayOdds: normalizeWaterOdds(benchmark.earlyAway || avgEarlyAway),
      lateHandicap: benchmark.lateHandicap,
      lateHomeOdds: normalizeWaterOdds(benchmark.lateHome || avgLateHome),
      lateAwayOdds: normalizeWaterOdds(benchmark.lateAway || avgLateAway),
    };
  }

  if (ouLines.length > 0) {
    const benchmark =
      ouLines.find((o) => o.company.includes('澳')) ||
      ouLines.find((o) => o.company.includes('Crow')) ||
      ouLines.find((o) => o.company.includes('36')) ||
      ouLines[0];

    result.overUnder = {
      earlyLine: benchmark.earlyLine,
      earlyOverOdds: normalizeWaterOdds(benchmark.earlyOver),
      earlyUnderOdds: normalizeWaterOdds(benchmark.earlyUnder),
      lateLine: benchmark.lateLine,
      lateOverOdds: normalizeWaterOdds(benchmark.lateOver),
      lateUnderOdds: normalizeWaterOdds(benchmark.lateUnder),
    };
  }

  if (euroLines.length > 0) {
    const benchmark =
      euroLines.find((e) => e.company.includes('Macau') || e.company.includes('澳')) ||
      euroLines.find((e) => e.company.includes('365') || e.company.includes('Bet 365')) ||
      euroLines.find((e) => e.company.includes('William') || e.company.includes('威')) ||
      euroLines[0];

    result.euroOdds = {
      earlyWin: benchmark.earlyWin,
      earlyDraw: benchmark.earlyDraw,
      earlyLoss: benchmark.earlyLoss,
      lateWin: benchmark.lateWin,
      lateDraw: benchmark.lateDraw,
      lateLoss: benchmark.lateLoss,
    };
  }

  return result;
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

  // 0. Primary pass: Parse structured detail tables if present (### 亚让, ### 大小球, ### 欧指)
  const tables = parseSectionOddsTables(fullText);
  if (tables.asianHandicap && result.asianHandicap) {
    result.asianHandicap = { ...result.asianHandicap, ...tables.asianHandicap } as AsianHandicapData;
  }
  if (tables.euroOdds && result.euroOdds) {
    result.euroOdds = { ...result.euroOdds, ...tables.euroOdds } as EuroOddsData;
  }
  if (tables.overUnder && result.overUnder) {
    result.overUnder = { ...result.overUnder, ...tables.overUnder } as OverUnderData;
  }

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

  let euroTransitionMatch: RegExpMatchArray | null = null;
  let asianDualMatch: RegExpMatchArray | null = null;
  let ouDualMatch: RegExpMatchArray | null = null;

  // 2. Euro odds extraction (fallback only if not already provided by tables)
  if (!tables.euroOdds) {
    euroTransitionMatch = fullText.match(
      /(?:欧初|初盘|初指|初赔)?\s*(\d+\.\d{1,3})[/ ]+(\d+\.\d{1,3})[/ ]+(\d+\.\d{1,3})\s*(?:即|->|➔|转|至|即时|临场)\s*(\d+\.\d{1,3})[/ ]+(\d+\.\d{1,3})[/ ]+(\d+\.\d{1,3})/
    );
    const euroGroups = [
      ...fullText.matchAll(/(\d+\.\d{1,3})[\s/]+(\d+\.\d{1,3})[\s/]+(\d+\.\d{1,3})/g),
    ];
    if (euroTransitionMatch && result.euroOdds) {
      result.euroOdds.earlyWin = parseFloat(euroTransitionMatch[1]);
      result.euroOdds.earlyDraw = parseFloat(euroTransitionMatch[2]);
      result.euroOdds.earlyLoss = parseFloat(euroTransitionMatch[3]);
      result.euroOdds.lateWin = parseFloat(euroTransitionMatch[4]);
      result.euroOdds.lateDraw = parseFloat(euroTransitionMatch[5]);
      result.euroOdds.lateLoss = parseFloat(euroTransitionMatch[6]);
    } else if (euroGroups.length > 0 && result.euroOdds) {
      // Single snapshot: apply the extracted Euro odds to BOTH early and late baseline
      const targetGroup = euroGroups[euroGroups.length - 1]; // use the most relevant/latest group
      const w = parseFloat(targetGroup[1]);
      const d = parseFloat(targetGroup[2]);
      const l = parseFloat(targetGroup[3]);
      result.euroOdds.earlyWin = w;
      result.euroOdds.earlyDraw = d;
      result.euroOdds.earlyLoss = l;
      result.euroOdds.lateWin = w;
      result.euroOdds.lateDraw = d;
      result.euroOdds.lateLoss = l;
    }
  }

  // 3. Asian Handicap extraction (fallback only if not already provided by tables)
  if (!tables.asianHandicap) {
    // Check for dual match: 亚初一球/球半[0.910/0.800]即球半[1.060/0.780] or 一球[0.85/1.05] -> 一球/球半[1.02/0.88]
    asianDualMatch = fullText.match(
      /(?:亚初|初盘|初指)?\s*([^\s\[\]]+)\[([\d.]+)[/ ]+([\d.]+)\]\s*(?:即|->|➔|转|至|即时|临场)\s*([^\s\[\]]+)\[([\d.]+)[/ ]+([\d.]+)\]/
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
        // Crucial: ALL "受" prefixes MUST precede their non-"受" counterparts to prevent stripping!
        const handicapKeywords = [
          // 1. Compound/split lines with "受" (MUST come before non-"受"!)
          '受两球半/三球', '受两球/两球半', '受球半/两球', '受一球半/两球',
          '受一球/球半', '受半球/一球', '受平手/半球', '受平/半', '受半/一',
          // 2. Single lines with "受" (MUST come before non-"受"!)
          '受三球半', '受三球', '受两球半', '受两球', '受球半', '受一球', '受半球', '受半一', '受平半',
          // 3. Compound/split lines without "受"
          '两球半/三球', '两球/两球半', '球半/两球', '一球半/两球',
          '一球/球半', '半球/一球', '平手/半球', '半一', '平半',
          // 4. Single lines without "受"
          '三球半', '三球', '两球半', '两球', '球半', '一球', '半球', '平手',
          // 5. Signed numeric lines
          '+3.5', '+3.0', '+2.75', '+2.5', '+2.25', '+2.0', '+1.75', '+1.5', '+1.25', '+1.0', '+0.75', '+0.5', '+0.25',
          '-3.5', '-3.0', '-2.75', '-2.5', '-2.25', '-2.0', '-1.75', '-1.5', '-1.25', '-1.0', '-0.75', '-0.5', '-0.25', '0'
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
  }

  // 4. Over/Under extraction (fallback only if not already provided by tables)
  if (!tables.overUnder) {
    ouDualMatch = fullText.match(/大初\s*([\d./]+)\[([\d.]+)[/ ]+([\d.]+)\]\s*即\s*([\d./]+)\[([\d.]+)[/ ]+([\d.]+)\]/);
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
  }

  // When only a single snapshot is provided (not explicit dual transition and not tables),
  // synchronize early baseline to match the parsed single snapshot so we don't
  // compare against hardcoded initial placeholders!
  if (!tables.asianHandicap && !asianDualMatch && result.asianHandicap) {
    result.asianHandicap.earlyHandicap = result.asianHandicap.lateHandicap;
    result.asianHandicap.earlyHomeOdds = result.asianHandicap.lateHomeOdds;
    result.asianHandicap.earlyAwayOdds = result.asianHandicap.lateAwayOdds;
  }
  if (!tables.euroOdds && !euroTransitionMatch && result.euroOdds) {
    result.euroOdds.earlyWin = result.euroOdds.lateWin;
    result.euroOdds.earlyDraw = result.euroOdds.lateDraw;
    result.euroOdds.earlyLoss = result.euroOdds.lateLoss;
  }
  if (!tables.overUnder && !ouDualMatch && result.overUnder) {
    result.overUnder.earlyLine = result.overUnder.lateLine;
    result.overUnder.earlyOverOdds = result.overUnder.lateOverOdds;
    result.overUnder.earlyUnderOdds = result.overUnder.lateUnderOdds;
  }

  return result;
}

export interface OverviewMatchMetadata {
  index?: number;
  home: string;
  away: string;
  aliasHome?: string;
  aliasAway?: string;
  kickoffTime?: string;
  league?: string;
}

/**
 * Accurately extracts metadata (kickoff time, league, team aliases, match index)
 * from document overview tables (such as 球探抓取快照 top table) or overview lists.
 */
export function extractOverviewMetadata(rawText: string): OverviewMatchMetadata[] {
  if (!rawText) return [];
  const results: OverviewMatchMetadata[] = [];
  const lines = rawText.split('\n').map((l) => l.trim());

  let inTable = false;
  let indexCol = -1;
  let timeCol = -1;
  let leagueCol = -1;
  let homeCol = -1;
  let awayCol = -1;
  let matchCols: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Detect markdown table rows
    if (line.includes('|')) {
      const parts = line.split('|').map((p) => p.trim());
      // remove leading/trailing empty string from outer pipes
      const cols = parts.slice(1, parts.length - 1);

      // Check if this is a header row
      const isHeader =
        cols.some((c) => /(?:对阵|比赛|球队|主队|客队|名称)/i.test(c)) &&
        cols.some((c) => /(?:开赛|时间|时刻|日期|序号|场次|编号)/i.test(c));

      if (isHeader) {
        inTable = true;
        indexCol = cols.findIndex((c) => /^(?:序号|场次|编号|ID|#)$/i.test(c));
        timeCol = cols.findIndex((c) => /(?:开赛|比赛时间|开赛时间|时刻|时间|日期)/i.test(c));
        leagueCol = cols.findIndex((c) => /(?:联赛|赛事|级别)/i.test(c));
        homeCol = cols.findIndex((c) => /(?:主队)/i.test(c));
        awayCol = cols.findIndex((c) => /(?:客队)/i.test(c));
        matchCols = cols
          .map((c, idx) => (/(?:对阵|比赛|名称|截图|球队)/i.test(c) ? idx : -1))
          .filter((idx) => idx >= 0);
        continue;
      }

      // Divider row
      if (inTable && cols.every((c) => /^[:\-\s]+$/.test(c))) {
        continue;
      }

      // Table data row
      if (inTable) {
        // If line has stopped being a table (e.g. section starts or empty)
        if (line.startsWith('#') || cols.length < 2) {
          inTable = false;
        } else {
          let rawTime = timeCol >= 0 && cols[timeCol] ? cols[timeCol] : '';
          if (!rawTime || rawTime === '临场') {
            rawTime = cols.find((c) => /\d{1,2}[:：]\d{2}/.test(c) || /20\d{2}[-/.]/.test(c)) || '';
          }
          const kickoffTime = rawTime ? extractKickoffTime(rawTime, rawText) : undefined;

          let index: number | undefined;
          if (indexCol >= 0 && /^\d+$/.test(cols[indexCol])) {
            index = parseInt(cols[indexCol], 10);
          } else if (/^\d+$/.test(cols[0])) {
            index = parseInt(cols[0], 10);
          }

          let home = '';
          let away = '';
          let aliasHome: string | undefined;
          let aliasAway: string | undefined;

          if (homeCol >= 0 && awayCol >= 0 && cols[homeCol] && cols[awayCol]) {
            home = cols[homeCol];
            away = cols[awayCol];
          } else {
            const candidateCols =
              matchCols.length > 0 ? matchCols.map((idx) => cols[idx]).filter(Boolean) : cols;
            for (const colVal of candidateCols) {
              const vs = colVal.match(
                /([^\d\s\n#【】（(]{2,12})[^\S\r\n]*(?:vs|VS|对阵|对|\-)[^\S\r\n]*([^\d\s\n#【】（(]{2,12})/i
              );
              if (vs) {
                const h = vs[1].trim();
                const a = vs[2].trim();
                if (!home) {
                  home = h;
                  away = a;
                } else if (!aliasHome && (h !== home || a !== away)) {
                  aliasHome = h;
                  aliasAway = a;
                }
              }
            }
          }

          let league =
            leagueCol >= 0 && cols[leagueCol] ? normalizeLeagueName(cols[leagueCol]) : undefined;
          if (!league) {
            league = extractLeagueFromText(line) || undefined;
          }

          if (home && away) {
            results.push({
              index,
              home,
              away,
              aliasHome,
              aliasAway,
              kickoffTime: kickoffTime && kickoffTime !== '临场' ? kickoffTime : undefined,
              league,
            });
          }
        }
      }
    } else {
      // Non-table line
      inTable = false;
      // Also check if line is an overview list entry like "1. 费尔干纳夫兹 vs 伊蒂哈德吉达 2026-10-26 21:45"
      if (!line.startsWith('#') && (line.includes('vs') || line.includes('VS') || line.includes('对阵'))) {
        const vsMatch = line.match(
          /(?:(?:【?(\d+)】?|[#\d]+)[.、\s]+)?([^\d\s\n#【】（(]{2,12})[^\S\r\n]*(?:vs|VS|对阵|对)[^\S\r\n]*([^\d\s\n#【】（(]{2,12})/i
        );
        if (vsMatch) {
          const index = vsMatch[1] ? parseInt(vsMatch[1], 10) : undefined;
          const home = vsMatch[2].trim();
          const away = vsMatch[3].trim();
          const rawTime = extractKickoffTime(line, rawText);
          if (rawTime && rawTime !== '临场' && home && away) {
            results.push({
              index,
              home,
              away,
              kickoffTime: rawTime,
              league: extractLeagueFromText(line) || undefined,
            });
          }
        }
      }
    }
  }

  return results;
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
  const overviewList = extractOverviewMetadata(rawText);

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
      let sectionIndex: number | undefined;
      let home = '';
      let away = '';
      let headingLeagueHint: string | undefined;

      const idxMatch = firstLine.match(/^##+\s*【?(\d+)】?[.、\s]*/);
      if (idxMatch) {
        sectionIndex = parseInt(idxMatch[1], 10);
      }
      const lineContent = firstLine.replace(/^##+\s*(?:【?\s*\d+\s*】?\.?\s*)?/, '').trim();
      const vsParts = lineContent.split(/[^\S\r\n]*(?:\bvs\b|\bVS\b|对阵)[^\S\r\n]*/i);

      if (vsParts.length >= 2) {
        let left = vsParts[0].trim();
        let right = vsParts[1].trim();

        // Check bracketed league prefix on left
        const bMatch = left.match(/^[【\[\(]([^】\]\)]+)[】\]\)]\s*(.+)$/);
        if (bMatch) {
          headingLeagueHint = bMatch[1].trim();
          left = bMatch[2].trim();
        } else {
          const tokens = left.split(/\s+/);
          if (tokens.length >= 2 && isValidTeamName(tokens[tokens.length - 1])) {
            headingLeagueHint = tokens.slice(0, tokens.length - 1).join(' ');
            left = tokens[tokens.length - 1];
          }
        }

        // Right side: strip bracketed suffix or notes
        const rightBMatch = right.match(/^([^\s（(【\[]+)\s*[（(【\[]([^）)】\]]+)[）)】\]]$/);
        if (rightBMatch) {
          right = rightBMatch[1].trim();
          if (!headingLeagueHint) headingLeagueHint = rightBMatch[2].trim();
        } else {
          const rTokens = right.split(/\s+/);
          right = rTokens[0];
        }

        home = left;
        away = right;
      } else {
        const headingMatch = firstLine.match(
          /##+\s*(?:【?\s*(\d+)\s*】?\.?\s*)?([^\d\s\n#【】（(]{2,10})[^\S\r\n]*(?:\bvs\b|\bVS\b|对阵)[^\S\r\n]*([^\d\s\n#【】（(]{2,10})/i
        );
        if (!headingMatch) continue;
        sectionIndex = headingMatch[1] ? parseInt(headingMatch[1], 10) : undefined;
        home = headingMatch[2].trim();
        away = headingMatch[3].trim();
      }

      if (!isValidTeamName(home) || !isValidTeamName(away)) continue;

      // Correlate with overview table metadata if available
      let matchedMeta: OverviewMatchMetadata | undefined;
      if (sectionIndex !== undefined) {
        matchedMeta = overviewList.find((item) =>
          item.index === sectionIndex &&
          (matchTeamsFuzzy(home, item.home) ||
           matchTeamsFuzzy(away, item.away) ||
           matchTeamsFuzzy(home, item.aliasHome || '') ||
           matchTeamsFuzzy(away, item.aliasAway || ''))
        );
        if (!matchedMeta) {
          matchedMeta = overviewList.find((item) => item.index === sectionIndex);
        }
      }
      if (!matchedMeta) {
        matchedMeta = overviewList.find((item) =>
          (matchTeamsFuzzy(home, item.home) && matchTeamsFuzzy(away, item.away)) ||
          (item.aliasHome && item.aliasAway && matchTeamsFuzzy(home, item.aliasHome) && matchTeamsFuzzy(away, item.aliasAway))
        );
      }
      if (!matchedMeta) {
        const candidates = overviewList.filter((item) =>
          matchTeamsFuzzy(home, item.home) ||
          matchTeamsFuzzy(away, item.away) ||
          matchTeamsFuzzy(home, item.aliasHome || '') ||
          matchTeamsFuzzy(away, item.aliasAway || '')
        );
        if (candidates.length === 1) {
          matchedMeta = candidates[0];
        }
      }

      // Extract match time (intelligent recognition of Markdown datetime formats)
      let matchTime = extractKickoffTime(section, rawText);
      if ((!matchTime || matchTime === '临场') && matchedMeta?.kickoffTime && matchedMeta.kickoffTime !== '临场') {
        matchTime = matchedMeta.kickoffTime;
      }

      // Extract league from headingLeagueHint, firstLine, section or overview table
      let league =
        (headingLeagueHint ? normalizeLeagueName(headingLeagueHint) : undefined) ||
        extractLeagueFromText(firstLine) ||
        extractLeagueFromText(section) ||
        matchedMeta?.league ||
        '常规联赛';

      // If team name accidentally captured the league prefix (e.g. "挪威超级 汉坎" or "挪超博德闪耀")
      const LEAGUE_PREFIX_PAIRS: Array<[RegExp, string]> = [
        [/^(?:挪威超级联赛|挪威超级|挪威超联|挪威超|挪超)\s*/i, '挪超'],
        [/^(?:挪威甲级联赛|挪威甲级|挪威甲|挪甲)\s*/i, '挪甲'],
        [/^(?:西班牙甲级联赛|西班牙甲|西甲)\s*/i, '西甲'],
        [/^(?:西班牙乙级联赛|西班牙乙|西乙)\s*/i, '西乙'],
        [/^(?:英格兰超级联赛|英超)\s*/i, '英超'],
        [/^(?:英格兰冠军联赛|英冠)\s*/i, '英冠'],
        [/^(?:德国甲级联赛|德甲)\s*/i, '德甲'],
        [/^(?:意大利甲级联赛|意甲)\s*/i, '意甲'],
        [/^(?:法国甲级联赛|法甲)\s*/i, '法甲'],
        [/^(?:葡萄牙超级联赛|葡超)\s*/i, '葡超'],
        [/^(?:荷兰甲级联赛|荷甲)\s*/i, '荷甲'],
        [/^(?:比利时甲级联赛|比甲)\s*/i, '比甲'],
        [/^(?:瑞典超级联赛|瑞典超)\s*/i, '瑞典超'],
        [/^(?:丹麦超级联赛|丹麦超)\s*/i, '丹麦超'],
        [/^(?:巴西甲级联赛|巴西甲|巴甲)\s*/i, '巴西甲'],
        [/^(?:巴西乙级联赛|巴西乙|巴乙)\s*/i, '巴西乙'],
        [/^(?:阿根廷甲级联赛|阿甲)\s*/i, '阿甲'],
        [/^(?:欧洲冠军联赛|欧冠)\s*/i, '欧冠'],
        [/^(?:亚冠精英联赛|亚冠)\s*/i, '亚冠'],
      ];

      for (const [p, lName] of LEAGUE_PREFIX_PAIRS) {
        if (p.test(home) && home.replace(p, '').trim().length >= 2) {
          if (league === '常规联赛' || !league) {
            league = lName;
          }
          home = home.replace(p, '').trim();
          break;
        }
      }

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

    let rowMatchTime = extractKickoffTime(line, rawText);
    if ((!rowMatchTime || rowMatchTime === '临场') && overviewList.length > 0) {
      const meta = overviewList.find((item) =>
        (matchTeamsFuzzy(home, item.home) && matchTeamsFuzzy(away, item.away)) ||
        (item.aliasHome && item.aliasAway && matchTeamsFuzzy(home, item.aliasHome) && matchTeamsFuzzy(away, item.aliasAway))
      );
      if (meta?.kickoffTime) {
        rowMatchTime = meta.kickoffTime;
      }
    }

    if (cols.length >= 7 && !line.includes('家')) {
      // Full CSV / Markdown row with odds
      // Distinguish Format A (Standard 9-col single snapshot: 联赛, 主队, 客队, 盘口, 主水, 客水, 胜, 平, 负)
      // vs Format B (Explicit dual odds: 联赛, 主队, 客队, 初盘, 初水, 即盘, 即水, 胜, 平, 负)
      const col3IsHandicap = isNaN(parseFloat(cols[3])) || cols[3].includes('球') || cols[3].includes('平');
      const col5IsWater = !isNaN(parseFloat(cols[5])) && parseFloat(cols[5]) >= 0.5 && parseFloat(cols[5]) <= 2.5 && !cols[5].includes('球') && !cols[5].includes('平');

      let earlyHandicap = cols[3] || '-0.5';
      let lateHandicap = cols[3] || '-0.5';
      let earlyHomeOdds = parseFloat(cols[4]) || 1.90;
      let lateHomeOdds = parseFloat(cols[4]) || 1.90;
      let earlyAwayOdds = 1.90;
      let lateAwayOdds = 1.90;
      let earlyWin = 2.10;
      let earlyDraw = 3.30;
      let earlyLoss = 3.40;
      let lateWin = 2.10;
      let lateDraw = 3.30;
      let lateLoss = 3.40;

      if (col5IsWater && cols.length >= 9) {
        // Standard single snapshot: cols[3]=盘口, cols[4]=主水, cols[5]=客水, cols[6]=胜, cols[7]=平, cols[8]=负
        earlyHandicap = cols[3];
        lateHandicap = cols[3];
        earlyHomeOdds = parseFloat(cols[4]) || 1.90;
        lateHomeOdds = parseFloat(cols[4]) || 1.90;
        earlyAwayOdds = parseFloat(cols[5]) || 1.90;
        lateAwayOdds = parseFloat(cols[5]) || 1.90;
        const w = parseFloat(cols[6]) || 2.10;
        const d = parseFloat(cols[7]) || 3.30;
        const l = parseFloat(cols[8]) || 3.40;
        earlyWin = w; lateWin = w;
        earlyDraw = d; lateDraw = d;
        earlyLoss = l; lateLoss = l;
      } else if (!col5IsWater && cols.length >= 9) {
        // Dual handicap table: cols[3]=初盘, cols[4]=初水, cols[5]=即盘, cols[6]=即水, cols[7]=胜, cols[8]=平, cols[9]=负
        earlyHandicap = cols[3] || '-0.5';
        earlyHomeOdds = parseFloat(cols[4]) || 1.90;
        lateHandicap = cols[5] || cols[3] || '-0.5';
        lateHomeOdds = parseFloat(cols[6]) || 1.90;
        const w = parseFloat(cols[7]) || 2.10;
        const d = parseFloat(cols[8]) || 3.30;
        const l = parseFloat(cols[9]) || 3.40;
        earlyWin = w; lateWin = w;
        earlyDraw = d; lateDraw = d;
        earlyLoss = l; lateLoss = l;
      } else {
        // Generic fallback with consistent baseline
        earlyHandicap = cols[3] || '平手';
        lateHandicap = cols[3] || '平手';
        earlyHomeOdds = parseFloat(cols[4]) || 1.90;
        lateHomeOdds = parseFloat(cols[4]) || 1.90;
      }

      const defaultMatch: FullMatchData = {
        matchInfo: {
          league: normalizeLeagueName(cols[0] || '常规联赛'),
          homeTeam: cols[1] || home,
          awayTeam: cols[2] || away,
          matchTime: rowMatchTime,
          marketStory: cols[11] || cols[10] || '',
        },
        asianHandicap: {
          earlyHandicap,
          earlyHomeOdds,
          earlyAwayOdds,
          lateHandicap,
          lateHomeOdds,
          lateAwayOdds,
        },
        euroOdds: {
          earlyWin,
          earlyDraw,
          earlyLoss,
          lateWin,
          lateDraw,
          lateLoss,
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
    // Skip Markdown table dividers like |---|---|
    if (/^\|?[\s\-:|]+\|?$/.test(line) || line.startsWith('---') || line.startsWith('===') || !line) {
      continue;
    }

    // If it's a date heading without match score, extract date anchor and continue
    if (isDateHeading && !/\d{1,2}\s*[-:：比]\s*\d{1,2}/.test(line)) {
      continue;
    }

    // If it's a markdown heading without match score, continue
    if (line.startsWith('#') && !/\d{1,2}\s*[-:：比]\s*\d{1,2}/.test(line)) {
      continue;
    }

    // Strip leading markdown heading tokens, lists, numbers
    const strippedLine = line.replace(/^#+\s*/, '');
    const metadata = extractScoreLineMetadata(strippedLine, salesDateAnchor, documentDate, timeColumnIndex);

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

    // Strip parentheses and Markdown syntax (bullets, bold, backticks)
    let cleanLine = metadata.cleanLine
      .replace(/[（(][^）)]*[）)]/g, '')
      .replace(/^[*\-+]\s+|\d+[.、]\s+/g, '')
      .replace(/[*_`#]/g, '')
      .trim();

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
