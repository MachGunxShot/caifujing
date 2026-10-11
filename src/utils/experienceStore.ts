import {
  FullMatchData,
  AnalysisReportResult,
  PostMatchReview,
  EvolvedExperienceRule,
} from '../types/fortuneActuary';
import { parseHandicapValue, parseOverUnderValue } from './actuaryEngine';
import { calculateSalesDate } from './salesDayUtils';

const RULES_STORAGE_KEY = 'fortune_actuary_evolved_rules_v1';
const REVIEWS_STORAGE_KEY = 'fortune_actuary_reviews_v1';

// Seed Initial Battle-tested Core Rules (5 Core Models + Lie Detector + Philosophy)
export const SEED_RULES: EvolvedExperienceRule[] = [
  {
    id: 'rule-model-POSITIVE_CONTROL',
    title: '【极限榨水 / 正向控赔】核心稳胆法则',
    category: 'POSITIVE_CONTROL',
    leagueScope: '全联赛通用 / 欧冠 / 五大联赛',
    ruleContent:
      '当主流欧指持续下调、亚指维持原盘或强力升盘，且晚盘上盘水位被砸制在 1.80 以下极低水时，机构并非诱盘，而是通过牺牲水位利润进行真实赔付防范。天上不会掉馅饼，超低水才是机构最诚实的投降书。实战首选让球正路打出，做稳胆核心。',
    sourceMatch: '曼城 2-0 埃弗顿 / 巴黎 4-1 朗斯 / 法国 4-1 比利时 (实盘验证)',
    createdAt: '2026-09-15',
    isActive: true,
    hitCount: 22,
  },
  {
    id: 'rule-model-HIGH_INTEREST_TRAP',
    title: '【高息吸筹 / 名气诱导】高危杀猪盘防坑法则',
    category: 'HIGH_INTEREST_TRAP',
    leagueScope: '全联赛通用 / 豪门联赛',
    ruleContent:
      '强队坐拥名气或抢分题材，早盘让步偏深，临场强升盘但上盘水位长期死卡在 2.02 以上超高水/满水。机构大开方便之门制造“让步坚挺、大胜穿盘”假象。若庄家真怕打出绝不敢悬挂满水白送筹码。实战坚决反选受让下盘，绝不可盲目博穿。',
    sourceMatch: '皇家马德里 1-1 赫塔菲 / 拜仁 1-2 门兴 (实盘验证)',
    createdAt: '2026-09-18',
    isActive: true,
    hitCount: 19,
  },
  {
    id: 'rule-model-AVALANCHE_RETREAT',
    title: '【雪崩退盘 / 退热示弱】利空避险与跟退法则',
    category: 'AVALANCHE_RETREAT',
    leagueScope: '主流透明联赛',
    ruleContent:
      '临场出现非正常剧烈退盘（如一球退半一、半一退半球），且水位抬升至中高水。正规联赛大庄风控提前捕捉到未公开核心利空（主力伤停、内讧、战意缺失）紧急止损避险。切忌盲目抄底强队，跟退盘者生，坚决顺应退盘支持下盘客队不败。',
    sourceMatch: '利物浦 1-2 纽卡斯尔联 / 切尔西 0-1 狼队 (实盘验证)',
    createdAt: '2026-09-20',
    isActive: true,
    hitCount: 15,
  },
  {
    id: 'rule-model-LOW_DRAW_DEFENSE',
    title: '【平赔低洼 / 平赔排雷】绝杀防平与双平法则',
    category: 'LOW_DRAW_DEFENSE',
    leagueScope: '欧国联 / 杯赛 / 均势联赛',
    ruleContent:
      '主流欧赔平赔被死死压制在 3.00 以下（竞彩 <2.75 极度防御区），亚盘维持在平手或平半两头对冲。资金在主客胜两端分流，机构真实防范重心全在平局。平局打出通吃两头盘口。平赔破 3.00 触发最高预警，实战首选单挑平局，次选双平防守。',
    sourceMatch: '拉齐奥 1-1 佛罗伦萨 / 瑞士 0-0 丹麦 (实盘验证)',
    createdAt: '2026-09-22',
    isActive: true,
    hitCount: 18,
  },
  {
    id: 'rule-model-SHALLOW_FULL_WATER',
    title: '【浅盘满水死亡】主场优势虚化与反杀法则',
    category: 'SHALLOW_FULL_WATER',
    leagueScope: '常规联赛主客场',
    ruleContent:
      '传统主场龙面对中下游球队仅开平手或平半生死盘，且长期挂 2.05+ 满水。机构对主胜完全不设防，利用“买主队赢球即赢半或全收”的贪婪心理收割。90% 概率主队不胜，毫不犹豫反选下盘客队不败。',
    sourceMatch: '多特蒙德 1-2 波鸿 / 毕尔巴鄂 0-1 赫罗纳 (实盘验证)',
    createdAt: '2026-09-25',
    isActive: true,
    hitCount: 17,
  },
  {
    id: 'rule-goals-detector-1',
    title: '大小球联动测谎：深让步配浅大小球卡盘警报',
    category: 'POSITIVE_CONTROL',
    leagueScope: '全部主流联赛',
    ruleContent:
      '强队深让步（球半/两球）但大小球反常压制在 2.25/2.5 极浅界线，机构已预判难以大胜对攻，极易打出 1-0 或 2-0 边缘小胜。大小球优先选小，让球严防下盘赢盘或卡盘。',
    sourceMatch: '巴黎圣日耳曼 vs 朗斯 / 尤文图斯 vs 恩波利 (实盘验证)',
    createdAt: '2026-09-28',
    isActive: true,
    hitCount: 14,
  },
  {
    id: 'rule-philosophy-core',
    title: '《财富经》核心心法：数据是流动的，人性是恒定的',
    category: 'GENERAL',
    leagueScope: '全局足彩精算心法',
    ruleContent:
      '永远学会“证伪”而非“自我证明”。早盘看意图，晚盘看真实风控。买得太舒服必定是陷阱，超低水才是机构最诚实的投降书。数据表象之下，资金流与机构风控底牌的一致性才是唯一真理。',
    sourceMatch: '《财富经》经典精算法则大盘心法',
    createdAt: '2026-09-01',
    isActive: true,
    hitCount: 30,
  },
];

/**
 * Map any category, title, or content to the corresponding Master Core Rule ID
 */
export function getTargetMasterRuleId(
  category?: string,
  title?: string,
  content?: string
): string {
  const text = `${category || ''} ${title || ''} ${content || ''}`.toUpperCase();
  if (text.includes('GOALS') || text.includes('大小球') || text.includes('测谎') || text.includes('DETECTOR')) {
    return 'rule-goals-detector-1';
  }
  if (text.includes('HIGH_INTEREST_TRAP') || text.includes('高息') || text.includes('吸筹') || text.includes('杀猪') || text.includes('诱导') || text.includes('名气') || text.includes('逆向') || text.includes('爆冷')) {
    return 'rule-model-HIGH_INTEREST_TRAP';
  }
  if (text.includes('AVALANCHE_RETREAT') || text.includes('雪崩') || text.includes('退盘') || text.includes('退热') || text.includes('示弱') || text.includes('利空') || text.includes('跟退')) {
    return 'rule-model-AVALANCHE_RETREAT';
  }
  if (text.includes('LOW_DRAW_DEFENSE') || text.includes('平赔') || text.includes('低洼') || text.includes('排雷') || text.includes('防平') || text.includes('双平') || text.includes('平局')) {
    return 'rule-model-LOW_DRAW_DEFENSE';
  }
  if (text.includes('SHALLOW_FULL_WATER') || text.includes('浅盘') || text.includes('满水') || text.includes('死亡') || text.includes('虚化')) {
    return 'rule-model-SHALLOW_FULL_WATER';
  }
  if (text.includes('POSITIVE_CONTROL') || text.includes('榨水') || text.includes('正向控赔') || text.includes('正路') || text.includes('稳胆') || text.includes('实力穿盘') || text.includes('经济型赢盘')) {
    return 'rule-model-POSITIVE_CONTROL';
  }
  if (text.includes('心法') || text.includes('PHILOSOPHY') || text.includes('GENERAL')) {
    return 'rule-philosophy-core';
  }
  return 'rule-model-POSITIVE_CONTROL';
}

/**
 * 核心去重与聚类合并引擎：
 * 将零散单场复盘（如 rule-Home-Away-Model、60场碎片比赛）深度聚类合并回《财富经》核心模型法则，
 * 累计实战印证命中次数 (hitCount)，将碎片赛果收敛为权威核心通则，绝不臃肿泛滥成几十条单场记录！
 */
export function consolidateRulesToCoreMaster(rules: EvolvedExperienceRule[]): EvolvedExperienceRule[] {
  // 1. Build authoritative map of Master Core Rules keyed by their immutable Rule IDs
  const masterRulesMap = new Map<string, EvolvedExperienceRule>();
  for (const sr of SEED_RULES) {
    masterRulesMap.set(sr.id, { ...sr });
  }

  // 2. Identify manual custom rules created by user
  const userManualRules: EvolvedExperienceRule[] = [];

  for (const r of rules) {
    if (!r) continue;

    // A. Check if it's already one of the official master core rules
    if (masterRulesMap.has(r.id)) {
      const existing = masterRulesMap.get(r.id)!;
      masterRulesMap.set(r.id, {
        ...existing,
        hitCount: Math.max(existing.hitCount || 0, r.hitCount || 0),
        isActive: r.isActive ?? existing.isActive,
      });
      continue;
    }

    // B. Check if it's an explicit manual custom rule (created via user "+ 追加经验" modal)
    if (r.id.startsWith('manual-')) {
      const isDuplicate = userManualRules.some(
        (mr) => mr.id === r.id || (mr.title === r.title && mr.ruleContent === r.ruleContent)
      );
      if (!isDuplicate) {
        userManualRules.push(r);
      }
      continue;
    }

    // C. All other rules (single match reviews, batch auto-rules, legacy seeds, etc.)
    // MUST BE CONSOLIDATED INTO THE 7 MASTER CORE RULES!
    const targetMasterId = getTargetMasterRuleId(r.category, r.title, r.ruleContent);
    const master = masterRulesMap.get(targetMasterId) || masterRulesMap.get('rule-model-POSITIVE_CONTROL')!;

    // Accumulate hitCount
    if ((r.hitCount || 0) > 0) {
      master.hitCount = (master.hitCount || 0) + (r.hitCount || 1);
    }

    // Append clean source match to real verified battle cases
    const rawMatchText = r.sourceMatch || (r.title.includes('【') ? r.title : '');
    if (rawMatchText) {
      const matchClean = rawMatchText
        .replace(/【|】/g, '')
        .replace(/\(完场[^\)]*\)/g, '')
        .replace(/\(实盘验证\)/g, '')
        .replace(/\(实战验证\)/g, '')
        .trim();
      if (matchClean) {
        const parts = (master.sourceMatch || '').split(' / ').map((p) => p.trim()).filter(Boolean);
        if (!parts.some((p) => p.includes(matchClean) || matchClean.includes(p))) {
          if (parts.length >= 8) parts.shift();
          parts.push(matchClean);
          master.sourceMatch = parts.join(' / ');
        }
      }
    }
  }

  // Combine consolidated master rules + user manual rules
  return [...Array.from(masterRulesMap.values()), ...userManualRules];
}

/**
 * Retrieve evolved experience rules from localStorage with automatic deduplication & consolidation
 */
export function getExperienceRules(): EvolvedExperienceRule[] {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return SEED_RULES;
    }
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(SEED_RULES));
      return SEED_RULES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Always guarantee consolidation so rules are clean and never bloated into 60 matches
      const consolidated = consolidateRulesToCoreMaster(parsed);
      if (
        consolidated.length !== parsed.length ||
        parsed.some(
          (p) =>
            p &&
            p.id &&
            !p.id.startsWith('rule-model-') &&
            !p.id.startsWith('manual-') &&
            p.id !== 'rule-goals-detector-1' &&
            p.id !== 'rule-philosophy-core'
        )
      ) {
        saveExperienceRules(consolidated);
      }
      return consolidated;
    }
    return SEED_RULES;
  } catch (e) {
    console.error('Error loading experience rules:', e);
    return SEED_RULES;
  }
}

/**
 * Save an updated list of experience rules
 */
export function saveExperienceRules(rules: EvolvedExperienceRule[]): void {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
  } catch (e) {
    console.error('Error saving experience rules:', e);
  }
}

/**
 * Add or update an experience rule (Consolidates match reviews into Core Model Rules)
 */
export function addOrUpdateExperienceRule(rule: EvolvedExperienceRule): void {
  const rules = getExperienceRules();

  // If rule is not an explicit user manual rule (i.e. It's an auto-generated match lesson),
  // directly consolidate into Master Core Rules!
  if (!rule.id.startsWith('manual-')) {
    const targetMasterId = getTargetMasterRuleId(rule.category, rule.title, rule.ruleContent);
    const master = rules.find((r) => r.id === targetMasterId) || rules[0];
    if (master) {
      if ((rule.hitCount || 0) > 0) {
        master.hitCount = (master.hitCount || 0) + (rule.hitCount || 1);
      }
      if (rule.sourceMatch) {
        const cleanMatch = rule.sourceMatch.replace(/\(完场[^\)]*\)/g, '').trim();
        const parts = (master.sourceMatch || '').split(' / ').map((p) => p.trim()).filter(Boolean);
        if (cleanMatch && !parts.some((p) => p.includes(cleanMatch) || cleanMatch.includes(p))) {
          if (parts.length >= 8) parts.shift();
          parts.push(cleanMatch);
          master.sourceMatch = parts.join(' / ');
        }
      }
      saveExperienceRules(rules);
      return;
    }
  }

  // Handle explicit manual rules
  const existingIdx = rules.findIndex(
    (r) => r.id === rule.id || (r.title === rule.title && r.category === rule.category)
  );

  if (existingIdx >= 0) {
    rules[existingIdx] = {
      ...rules[existingIdx],
      ...rule,
      id: rules[existingIdx].id,
      hitCount: Math.max(rules[existingIdx].hitCount || 0, rule.hitCount || 1),
      isActive: rules[existingIdx].isActive ?? true,
    };
  } else {
    rules.push(rule);
  }
  saveExperienceRules(rules);
}

/**
 * 查漏补缺：将历史已复盘战报批量同步沉淀至《财富经》核心法则库
 * 
 * 核心功能：
 * 1. 自动对全量或指定批次的历史复盘进行扫描查漏补缺
 * 2. 深度调用去重与合并引擎：将每场战报智能归入对应操盘核心模型（5大核心模型与心法准则），绝不膨胀成60条单场冗余条目！
 * 3. 实战印证累计：若赛果成功印证盘口风控（modelVerified 为 true，或胜平负+让球均命中），自动累加该法则的 hitCount，提升其置信权重
 * 4. 动态记录最新验证实战例证 (sourceMatch)，持续优化沉淀
 * 
 * @param targetReviews 可选，若不传则扫描全量历史复盘战报
 * @returns 同步统计结果
 */
export function syncAndPromoteReviewsToCoreRules(targetReviews?: PostMatchReview[]): {
  addedCount: number;
  updatedCount: number;
  verifiedHitsCount: number;
  totalProcessed: number;
} {
  const reviewsToProcess = targetReviews || getPostMatchReviews();
  const rules = getExperienceRules(); // Already auto-consolidated into Master Core Rules

  let updatedCount = 0;
  let verifiedHitsCount = 0;

  for (const rev of reviewsToProcess) {
    const homeTeam = rev.matchData?.matchInfo?.homeTeam || '主队';
    const awayTeam = rev.matchData?.matchInfo?.awayTeam || '客队';
    const category = rev.ruleCategory || rev.priorReport?.identifiedModel || 'GENERAL';

    const isVerified =
      !!rev.outcomeEvaluation?.modelVerified ||
      (!!rev.outcomeEvaluation?.euroHit && !!rev.outcomeEvaluation?.handicapHit);

    // 寻找对应操盘模型的《财富经》核心法则
    const targetMasterId = getTargetMasterRuleId(category, rev.evolvedRuleTitle, rev.evolvedRuleContent);
    const master = rules.find((r) => r.id === targetMasterId) || rules[0];

    if (master) {
      updatedCount++;
      if (isVerified) {
        master.hitCount = (master.hitCount || 0) + 1;
        verifiedHitsCount++;
      }

      // 将本场实战验证例证追加到核心法则的验证案例库中
      const matchText = `${homeTeam} ${rev.actualScore || '完赛'} ${awayTeam}`;
      const parts = (master.sourceMatch || '').split(' / ').map((p) => p.trim()).filter(Boolean);
      if (!parts.some((p) => p.includes(homeTeam) && p.includes(awayTeam))) {
        if (parts.length >= 8) parts.shift();
        parts.push(matchText);
        master.sourceMatch = parts.join(' / ');
      }
    }
  }

  saveExperienceRules(rules);

  return {
    addedCount: 0,
    updatedCount,
    verifiedHitsCount,
    totalProcessed: reviewsToProcess.length,
  };
}

/**
 * Audit health and redundancy of the current experience rules database
 */
export interface RulesHealthAudit {
  totalCount: number;
  activeCount: number;
  classicCount: number;
  synthesizedCount: number;
  boilerplateCount: number;
  duplicateCount: number;
  zeroHitCount: number;
  healthScore: number;
  suggestions: string[];
}

export function auditRulesHealth(customRules?: EvolvedExperienceRule[]): RulesHealthAudit {
  const rules = customRules || getExperienceRules();
  const classicIds = new Set([
    'rule-model-POSITIVE_CONTROL',
    'rule-model-HIGH_INTEREST_TRAP',
    'rule-model-AVALANCHE_RETREAT',
    'rule-model-LOW_DRAW_DEFENSE',
    'rule-model-SHALLOW_FULL_WATER',
    'rule-philosophy-core',
    'rule-goals-detector-1',
    'rule-classic-R1',
    'rule-classic-R2',
    'rule-classic-R3',
    'rule-classic-R4',
    'rule-classic-R5',
    'rule-seed-1',
    'rule-seed-2',
    'rule-seed-3',
    'rule-seed-4',
  ]);

  let classicCount = 0;
  let boilerplateCount = 0;
  let zeroHitCount = 0;
  let synthesizedCount = 0;
  const matchSeen = new Map<string, number>();

  for (const r of rules) {
    const isClassic =
      classicIds.has(r.id) ||
      r.id.startsWith('rule-model-') ||
      r.id.startsWith('rule-classic-') ||
      r.id.startsWith('rule-seed-') ||
      r.id === 'rule-philosophy-core' ||
      r.id === 'rule-goals-detector-1';

    if (isClassic) {
      classicCount++;
      continue;
    }

    if ((r.hitCount ?? 0) === 0) {
      zeroHitCount++;
    }

    const content = r.ruleContent || '';
    const isBoilerplate =
      content.includes('切忌单向押注，需重点防范实际赛果指向的') ||
      r.title.includes('逆向避险修正法');

    if (isBoilerplate) {
      boilerplateCount++;
    } else {
      synthesizedCount++;
    }

    // Check duplicate by source match
    const cleanSource = (r.sourceMatch || '')
      .replace(/\(完场[^\)]*\)/g, '')
      .replace(/\s+/g, '')
      .trim();
    if (cleanSource) {
      matchSeen.set(cleanSource, (matchSeen.get(cleanSource) || 0) + 1);
    }
  }

  let duplicateCount = 0;
  matchSeen.forEach((cnt) => {
    if (cnt > 1) duplicateCount += cnt - 1;
  });

  const suggestions: string[] = [];
  if (boilerplateCount >= 5) {
    suggestions.push(
      `检测到 ${boilerplateCount} 条单场机械同质化规则（过度拟合），建议执行「一键智能聚类精炼」，提炼为行业通则。`
    );
  }
  if (duplicateCount > 0) {
    suggestions.push(`检测到 ${duplicateCount} 处同场比赛重复法则（如单场生成两条），建议一键去重。`);
  }
  if (zeroHitCount >= 5) {
    suggestions.push(
      `法则库中存在 ${zeroHitCount} 条未被二次印证的孤立单场记录（命中次数为0），建议清理或归档。`
    );
  }
  if (rules.length > 20 && boilerplateCount > 8) {
    suggestions.push(
      `法则库已达 ${rules.length} 条，规则过密会导致 AI 研判过拟合与冲突，推荐将核心高精法则控制在 15-20 条黄金区间。`
    );
  }

  // Calculate health score: 100 max
  const penalty = boilerplateCount * 3 + duplicateCount * 6 + (zeroHitCount > 5 ? 12 : 0);
  const healthScore = Math.max(25, Math.min(100, 100 - penalty));

  return {
    totalCount: rules.length,
    activeCount: rules.filter((r) => r.isActive).length,
    classicCount,
    synthesizedCount,
    boilerplateCount,
    duplicateCount,
    zeroHitCount,
    healthScore,
    suggestions,
  };
}

/**
 * Smart Prune & Cluster experience rules:
 * Clusters repetitive boilerplate single-match rules into synthesized master rules and eliminates duplicates!
 */
export function pruneAndClusterExperienceRules(): {
  beforeCount: number;
  afterCount: number;
  prunedCount: number;
  clusteredCount: number;
  newRules: EvolvedExperienceRule[];
} {
  let rawRules: EvolvedExperienceRule[] = [];
  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    if (raw) rawRules = JSON.parse(raw);
  } catch (e) {
    rawRules = [];
  }
  const beforeCount = Math.max(rawRules.length, getExperienceRules().length);

  // Use core consolidation engine to fold single match rules into master models
  const consolidated = consolidateRulesToCoreMaster(rawRules.length > 0 ? rawRules : getExperienceRules());
  saveExperienceRules(consolidated);
  const afterCount = consolidated.length;

  return {
    beforeCount,
    afterCount,
    prunedCount: Math.max(0, beforeCount - afterCount),
    clusteredCount: Math.max(0, beforeCount - afterCount),
    newRules: consolidated,
  };
}

/**
 * Remove isolated single-case rules with zero hit count (preserves classic seed rules)
 */
export function pruneZeroHitRules(): {
  removedCount: number;
  newRules: EvolvedExperienceRule[];
} {
  const currentRules = getExperienceRules();
  const classicIds = new Set([
    'rule-model-POSITIVE_CONTROL',
    'rule-model-HIGH_INTEREST_TRAP',
    'rule-model-AVALANCHE_RETREAT',
    'rule-model-LOW_DRAW_DEFENSE',
    'rule-model-SHALLOW_FULL_WATER',
    'rule-philosophy-core',
    'rule-goals-detector-1',
    'rule-classic-R1',
    'rule-classic-R2',
    'rule-classic-R3',
    'rule-classic-R4',
    'rule-classic-R5',
    'rule-seed-1',
    'rule-seed-2',
    'rule-seed-3',
    'rule-seed-4',
  ]);

  const preserved = currentRules.filter((r) => {
    if (
      classicIds.has(r.id) ||
      r.id.startsWith('rule-model-') ||
      r.id.startsWith('rule-classic-') ||
      r.id.startsWith('rule-seed-') ||
      r.id === 'rule-philosophy-core' ||
      r.id === 'rule-goals-detector-1'
    ) {
      return true;
    }
    return (r.hitCount ?? 0) > 0;
  });

  const removedCount = currentRules.length - preserved.length;
  saveExperienceRules(preserved);
  return { removedCount, newRules: preserved };
}

/**
 * Detects and repairs legacy rules that contain contradictory or inverted language,
 * such as calling a favorite blowout '【主胜】冷门反杀' or '【客胜】冷门反杀'.
 */
export function repairInconsistentLanguageRules(): {
  repairedCount: number;
  totalRules: number;
  newRules: EvolvedExperienceRule[];
} {
  const currentRules = getExperienceRules();
  let repairedCount = 0;

  const repaired = currentRules.map((r) => {
    let title = r.title;
    let content = r.ruleContent;
    let category = r.category;
    let changed = false;

    // Detect inverted language in France vs Belgium (4-1 win by France)
    if (
      (r.sourceMatch?.includes('法国') && r.sourceMatch?.includes('比利时')) ||
      (content.includes('法国') && content.includes('比利时')) ||
      (content.includes('一球/球半') && content.includes('3.5') && content.includes('【主胜】冷门反杀'))
    ) {
      title = '欧国联【法国 vs 比利时】深盘实力穿盘验证法';
      category = 'POSITIVE_CONTROL';
      content = '针对 欧国联 类似对阵，若晚盘让步达 一球/球半 且大小球高达 3.5 时，属于真实对攻且让步深邃，切忌盲博受让下盘，顺应让步强队绝对攻势穿盘打出。';
      changed = true;
    }
    // Detect inverted language in Moldova vs Slovakia (0-4 win by Slovakia)
    else if (
      (r.sourceMatch?.includes('摩尔多瓦') && r.sourceMatch?.includes('斯洛伐克')) ||
      (content.includes('摩尔多瓦') && content.includes('斯洛伐克')) ||
      (content.includes('受球半') && content.includes('【客胜】冷门反杀'))
    ) {
      title = '欧国联【摩尔多瓦 vs 斯洛伐克】客让深盘实力穿透法则';
      category = 'POSITIVE_CONTROL';
      content = '针对 欧国联 类似对阵，若晚盘呈现客让 受球半 且机构防线牢固，强弱分明格局下切忌盲博弱队受让，防范客队实力碾压穿盘大胜。';
      changed = true;
    }
    // General repair for any remaining inverted rules
    else if (content.includes('【主胜】冷门反杀')) {
      content = content.replace('【主胜】冷门反杀', '【主队实力穿盘】');
      title = title.replace('逆向避险修正法', '实力穿盘验证法');
      changed = true;
    } else if (
      content.includes('【客胜】冷门反杀') &&
      (content.includes('受球半') || content.includes('受两球') || content.includes('受一球'))
    ) {
      content = content.replace('【客胜】冷门反杀', '【客队实力穿透】');
      title = title.replace('逆向避险修正法', '客让实力穿透法');
      changed = true;
    }

    if (changed) {
      repairedCount++;
      return { ...r, title, category, ruleContent: content };
    }
    return r;
  });

  if (repairedCount > 0) {
    saveExperienceRules(repaired);
  }

  return { repairedCount, totalRules: repaired.length, newRules: repaired };
}

/**
 * Toggle rule activation state
 */
export function toggleRuleActiveState(ruleId: string): EvolvedExperienceRule[] {
  const rules = getExperienceRules();
  const target = rules.find((r) => r.id === ruleId);
  if (target) {
    target.isActive = !target.isActive;
    saveExperienceRules(rules);
  }
  return rules;
}

/**
 * Delete a rule
 */
export function deleteExperienceRule(ruleId: string): EvolvedExperienceRule[] {
  const rules = getExperienceRules().filter((r) => r.id !== ruleId);
  saveExperienceRules(rules);
  return rules;
}

/**
 * Export rules as formatted JSON string
 */
export function exportRulesAsJson(): string {
  const rules = getExperienceRules();
  return JSON.stringify(rules, null, 2);
}

/**
 * Import rules from JSON string (supports standard array, structured systems, and markdown-wrapped JSON)
 */
export function importRulesFromJson(
  jsonStr: string,
  mode: 'merge' | 'replace' = 'merge'
): { success: boolean; count: number; message: string } {
  try {
    // 1. Strip potential Markdown code fences
    let cleanStr = jsonStr.trim();
    if (cleanStr.startsWith('```')) {
      cleanStr = cleanStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }

    const parsed = JSON.parse(cleanStr);
    const convertedRules: EvolvedExperienceRule[] = [];

    // Category mapping helper
    const mapCategory = (cat?: string, id?: string): any => {
      const s = ((cat || '') + ' ' + (id || '')).toUpperCase();
      if (s.includes('榨水') || s.includes('正向') || s.includes('正路') || s.includes('R1') || s.includes('POSITIVE_CONTROL')) {
        return 'POSITIVE_CONTROL';
      }
      if (s.includes('高息') || s.includes('吸筹') || s.includes('名气') || s.includes('避坑') || s.includes('R2') || s.includes('HIGH_INTEREST_TRAP')) {
        return 'HIGH_INTEREST_TRAP';
      }
      if (s.includes('退盘') || s.includes('异动') || s.includes('退热') || s.includes('R3') || s.includes('AVALANCHE_RETREAT')) {
        return 'AVALANCHE_RETREAT';
      }
      if (s.includes('平赔') || s.includes('胆平') || s.includes('R4') || s.includes('LOW_DRAW_DEFENSE')) {
        return 'LOW_DRAW_DEFENSE';
      }
      if (s.includes('浅盘') || s.includes('满水') || s.includes('失守') || s.includes('R5') || s.includes('SHALLOW_FULL_WATER')) {
        return 'SHALLOW_FULL_WATER';
      }
      return 'GENERAL';
    };

    // Case 1: Standard Array of rules
    if (Array.isArray(parsed)) {
      for (let i = 0; i < parsed.length; i++) {
        const item = parsed[i];
        if (item && (item.title || item.name || item.ruleContent)) {
          convertedRules.push({
            id: item.id || `rule-import-${Date.now()}-${i}`,
            title: item.title || item.name || `实战法则 #${i + 1}`,
            category: mapCategory(item.category, item.id),
            leagueScope: item.leagueScope || item.scope || '全部主流联赛',
            ruleContent: item.ruleContent || item.content || item.decision || JSON.stringify(item),
            sourceMatch: item.sourceMatch || (Array.isArray(item.examples) ? item.examples.join(' / ') : '外部经验导入'),
            createdAt: item.createdAt || new Date().toISOString().slice(0, 10),
            isActive: item.isActive ?? true,
            hitCount: item.hitCount || 10,
          });
        }
      }
    } else if (typeof parsed === 'object' && parsed !== null) {
      // Case 2: Structured Fortune Actuary System Specification Object

      // A. five_classic_rules
      if (Array.isArray(parsed.five_classic_rules)) {
        parsed.five_classic_rules.forEach((r: any, idx: number) => {
          const cat = mapCategory(r.category || r.name, r.rule_id);
          const hf = r.handicap_features;
          const featuresStr = hf
            ? `【盘赔形态】：欧指[${hf.euro_odds || '未设'}] ｜ 亚盘[${hf.asian_handicap || '未设'}] ｜ 水位[${hf.water_level || '未设'}]`
            : '';
          const intentStr = r.bookmaker_intent ? `【操盘意图】：${r.bookmaker_intent}` : '';
          const decisionStr = r.decision ? `【财富经定论】：${r.decision}` : '';
          const content = [featuresStr, intentStr, decisionStr].filter(Boolean).join('\n') || r.description || '';

          convertedRules.push({
            id: `rule-classic-${r.rule_id || idx + 1}`,
            title: r.name || `《财富经》经典法则 ${r.rule_id || idx + 1}`,
            category: cat,
            leagueScope: '全部主流联赛',
            ruleContent: content,
            sourceMatch: Array.isArray(r.examples) ? r.examples.join(' / ') : '经典实战盘口验证',
            createdAt: new Date().toISOString().slice(0, 10),
            isActive: true,
            hitCount: 20,
          });
        });
      }

      // B. total_goals_lie_detector (大小球测谎法则)
      if (Array.isArray(parsed.total_goals_lie_detector)) {
        parsed.total_goals_lie_detector.forEach((item: any, idx: number) => {
          const content = `【形态匹配】：${item.pattern}\n【操盘意图】：${item.bookmaker_intent || ''}\n【精算策略】：${item.strategy || ''}`;
          convertedRules.push({
            id: `rule-goals-detector-${idx + 1}`,
            title: `大小球测谎：${item.pattern}`,
            category: 'GENERAL',
            leagueScope: '常规联赛大小球',
            ruleContent: content,
            sourceMatch: '《财富经》大小球三维联动测谎',
            createdAt: new Date().toISOString().slice(0, 10),
            isActive: true,
            hitCount: 15,
          });
        });
      }

      // C. core_philosophy (心法准则)
      if (parsed.core_philosophy && parsed.core_philosophy.key_principles) {
        const principles = parsed.core_philosophy.key_principles;
        if (Array.isArray(principles)) {
          convertedRules.push({
            id: 'rule-philosophy-core',
            title: `《财富经》核心心法：${parsed.core_philosophy.motto || '数据是流动的，人性是恒定的'}`,
            category: 'GENERAL',
            leagueScope: '全局战术心法与避坑红线',
            ruleContent: `【核心箴言准则】：\n${principles.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}`,
            sourceMatch: '《财富经》量化分析体系总纲',
            createdAt: new Date().toISOString().slice(0, 10),
            isActive: true,
            hitCount: 99,
          });
        }
      }

      // D. rules / evolvedRules array
      if (Array.isArray(parsed.rules)) {
        for (const item of parsed.rules) {
          if (item && (item.title || item.name)) {
            convertedRules.push({
              id: item.id || `rule-import-${Date.now()}`,
              title: item.title || item.name,
              category: mapCategory(item.category, item.id),
              leagueScope: item.leagueScope || '全部联赛',
              ruleContent: item.ruleContent || item.content || JSON.stringify(item),
              sourceMatch: item.sourceMatch || '外部导入',
              createdAt: item.createdAt || new Date().toISOString().slice(0, 10),
              isActive: item.isActive ?? true,
              hitCount: item.hitCount || 10,
            });
          }
        }
      }
      if (Array.isArray(parsed.evolvedRules)) {
        for (const item of parsed.evolvedRules) {
          if (item && (item.title || item.name)) {
            convertedRules.push({
              id: item.id || `rule-import-${Date.now()}`,
              title: item.title || item.name,
              category: mapCategory(item.category, item.id),
              leagueScope: item.leagueScope || '全部联赛',
              ruleContent: item.ruleContent || item.content || JSON.stringify(item),
              sourceMatch: item.sourceMatch || '外部导入',
              createdAt: item.createdAt || new Date().toISOString().slice(0, 10),
              isActive: item.isActive ?? true,
              hitCount: item.hitCount || 10,
            });
          }
        }
      }
    }

    if (convertedRules.length === 0) {
      return { success: false, count: 0, message: '未能在提供的 JSON 中解析到有效的法则条目。' };
    }

    // Merge or replace
    if (mode === 'replace') {
      saveExperienceRules(convertedRules);
    } else {
      // Merge with existing
      for (const r of convertedRules) {
        addOrUpdateExperienceRule(r);
      }
    }

    return {
      success: true,
      count: convertedRules.length,
      message: `成功解析并导入 ${convertedRules.length} 条《财富经》核心法则与大小球测谎规则！`,
    };
  } catch (err: any) {
    return { success: false, count: 0, message: `JSON 解析异常: ${err?.message || '格式错误'}` };
  }
}

/**
 * Parse Markdown formatted rules into EvolvedExperienceRule[]
 * Supports:
 * 1. Markdown Tables: | 法则名称 | 适用范围 | 核心法则正文 | 实战案例 |
 * 2. Markdown Headings (## 【极限榨水法则】 with bullet points)
 * 3. Markdown Numbered lists: 1. 【法则名称】（适用范围）\n 核心法则：...
 */
export function parseRulesFromMarkdown(mdStr: string): EvolvedExperienceRule[] {
  const rules: EvolvedExperienceRule[] = [];
  const text = mdStr.trim();
  if (!text) return rules;

  const mapCategory = (str?: string): any => {
    const s = (str || '').toUpperCase();
    if (s.includes('榨水') || s.includes('正向') || s.includes('正路') || s.includes('R1') || s.includes('POSITIVE')) return 'POSITIVE_CONTROL';
    if (s.includes('高息') || s.includes('吸筹') || s.includes('名气') || s.includes('避坑') || s.includes('R2') || s.includes('HIGH_INTEREST')) return 'HIGH_INTEREST_TRAP';
    if (s.includes('退盘') || s.includes('异动') || s.includes('退热') || s.includes('R3') || s.includes('AVALANCHE')) return 'AVALANCHE_RETREAT';
    if (s.includes('平赔') || s.includes('胆平') || s.includes('R4') || s.includes('LOW_DRAW')) return 'LOW_DRAW_DEFENSE';
    if (s.includes('浅盘') || s.includes('满水') || s.includes('失守') || s.includes('R5') || s.includes('SHALLOW')) return 'SHALLOW_FULL_WATER';
    return 'GENERAL';
  };

  // Method 1: Check for Markdown Tables
  const lines = text.split('\n');
  const tableRows = lines.filter((l) => l.trim().startsWith('|') && l.trim().endsWith('|'));
  if (tableRows.length >= 3) {
    const hasDivider = tableRows[1].includes('---');
    if (hasDivider) {
      const dataRows = tableRows.slice(2);
      for (let i = 0; i < dataRows.length; i++) {
        const cols = dataRows[i]
          .split('|')
          .map((c) => c.trim())
          .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        if (cols.length >= 2) {
          let title = '';
          let scope = '全部主流联赛';
          let content = '';
          let source = 'Markdown 表格导入';

          if (cols.length >= 4) {
            title = cols[0];
            scope = cols[1];
            content = cols[2];
            source = cols[3];
          } else if (cols.length === 3) {
            title = cols[0];
            scope = cols[1];
            content = cols[2];
          } else {
            title = cols[0];
            content = cols[1];
          }

          if (title && content) {
            rules.push({
              id: `rule-md-table-${Date.now()}-${i}`,
              title: title.replace(/^[#\*\s【]+|[#\*\s】]+$/g, ''),
              category: mapCategory(title + ' ' + content),
              leagueScope: scope || '全部主流联赛',
              ruleContent: content,
              sourceMatch: source || 'Markdown 知识库导入',
              createdAt: new Date().toISOString().slice(0, 10),
              isActive: true,
              hitCount: 15,
            });
          }
        }
      }
      if (rules.length > 0) return rules;
    }
  }

  // Method 2: Header-based sections (## 或 ###)
  const headerRegex = /^(#{1,4})\s+(.+)$/gm;
  const headerMatches = Array.from(text.matchAll(headerRegex));

  if (headerMatches.length >= 1) {
    for (let i = 0; i < headerMatches.length; i++) {
      const match = headerMatches[i];
      const titleRaw = match[2].trim();
      const startIndex = match.index! + match[0].length;
      const endIndex = i + 1 < headerMatches.length ? headerMatches[i + 1].index! : text.length;
      const sectionBody = text.slice(startIndex, endIndex).trim();

      const cleanTitle = titleRaw.replace(/^[【\[（\(#\*\s]+|[】\]）\)#\*\s]+$/g, '').trim();

      let leagueScope = '全部主流联赛';
      let sourceMatch = 'Markdown 体系导入';
      const bulletLines: string[] = [];

      const bodyLines = sectionBody.split('\n');
      for (const bLine of bodyLines) {
        const trimmed = bLine.trim();
        if (!trimmed) continue;

        const scopeMatch = trimmed.match(/^[-*•]?\s*(?:\*\*)?(?:适用范围|适用联赛|联赛范围)(?:\*\*)?[：:]\s*(.+)$/i);
        if (scopeMatch) {
          leagueScope = scopeMatch[1].replace(/\*\*/g, '').trim();
          continue;
        }

        const sourceMatchResult = trimmed.match(/^[-*•]?\s*(?:\*\*)?(?:实战案例|来源赛事|验证案例|经典案例)(?:\*\*)?[：:]\s*(.+)$/i);
        if (sourceMatchResult) {
          sourceMatch = sourceMatchResult[1].replace(/\*\*/g, '').trim();
          continue;
        }

        bulletLines.push(trimmed);
      }

      const content = bulletLines.join('\n') || sectionBody;
      if (cleanTitle && content) {
        rules.push({
          id: `rule-md-heading-${Date.now()}-${i}`,
          title: cleanTitle,
          category: mapCategory(cleanTitle + ' ' + content),
          leagueScope,
          ruleContent: content,
          sourceMatch,
          createdAt: new Date().toISOString().slice(0, 10),
          isActive: true,
          hitCount: 15,
        });
      }
    }
    if (rules.length > 0) return rules;
  }

  // Method 3: Numbered list pattern (1. 【...】 or 1. ...\n 核心法则：...)
  const listRegex = /(?:^|\n)(?:\d+[\.、]|\(\d+\))\s*(?:【|\*\*)?([^\n】\*]+)(?:】|\*\*)?(?:（([^）\n]+)）)?\s*\n([\s\S]*?)(?=(?:\n(?:\d+[\.、]|\(\d+\))\s*(?:【|\*\*)|$))/g;
  const listMatches = Array.from(text.matchAll(listRegex));

  if (listMatches.length > 0) {
    for (let i = 0; i < listMatches.length; i++) {
      const match = listMatches[i];
      const title = match[1].trim();
      const scope = match[2]?.trim() || '全部常规联赛';
      const body = match[3]?.trim();

      if (title && body) {
        rules.push({
          id: `rule-md-list-${Date.now()}-${i}`,
          title,
          category: mapCategory(title + ' ' + body),
          leagueScope: scope,
          ruleContent: body,
          sourceMatch: 'Markdown 列表导入',
          createdAt: new Date().toISOString().slice(0, 10),
          isActive: true,
          hitCount: 15,
        });
      }
    }
    if (rules.length > 0) return rules;
  }

  return rules;
}

/**
 * Import rules from Markdown string
 */
export function importRulesFromMarkdown(
  mdStr: string,
  mode: 'merge' | 'replace' = 'merge'
): { success: boolean; count: number; message: string } {
  try {
    const rules = parseRulesFromMarkdown(mdStr);
    if (rules.length === 0) {
      return {
        success: false,
        count: 0,
        message: '未能识别出有效的 Markdown 法则结构（支持标题级 ## 法则、列表 1. 【法则】 或 Markdown 表格）。',
      };
    }

    if (mode === 'replace') {
      saveExperienceRules(rules);
    } else {
      for (const r of rules) {
        addOrUpdateExperienceRule(r);
      }
    }

    return {
      success: true,
      count: rules.length,
      message: `成功解析并导入 ${rules.length} 条 Markdown 格式的实战经验法则！`,
    };
  } catch (err: any) {
    return {
      success: false,
      count: 0,
      message: `Markdown 解析失败: ${err?.message || '未知错误'}`,
    };
  }
}

/**
 * Smart Auto-Detector for importing rules (JSON or Markdown)
 */
export function importRulesSmart(
  input: string,
  mode: 'merge' | 'replace' = 'merge'
): { success: boolean; count: number; message: string; detectedFormat: 'JSON' | 'MARKDOWN' } {
  const trimmed = input.trim();
  const looksLikeJson =
    trimmed.startsWith('{') ||
    trimmed.startsWith('[') ||
    trimmed.startsWith('```json') ||
    (trimmed.includes('"five_classic_rules"') && trimmed.includes('{'));

  if (looksLikeJson) {
    const jsonRes = importRulesFromJson(trimmed, mode);
    if (jsonRes.success) {
      return { ...jsonRes, detectedFormat: 'JSON' };
    }
  }

  // Try Markdown parsing
  const mdRes = importRulesFromMarkdown(trimmed, mode);
  if (mdRes.success) {
    return { ...mdRes, detectedFormat: 'MARKDOWN' };
  }

  // Fallback to JSON error if it seemed like JSON
  if (looksLikeJson) {
    const jsonRes = importRulesFromJson(trimmed, mode);
    return { ...jsonRes, detectedFormat: 'JSON' };
  }

  return { ...mdRes, detectedFormat: 'MARKDOWN' };
}

/**
 * Get active experience rules text for injecting into AI system prompt
 */
export function getActiveExperiencePromptText(): string {
  const activeRules = getExperienceRules().filter((r) => r.isActive);
  if (activeRules.length === 0) return '';

  return `
【《财富经》实战复盘自我进化法则库（已吸纳 ${activeRules.length} 条经过实战检验的核心经验）】：
${activeRules
  .map(
    (r, i) =>
      `${i + 1}. 【${r.title}】（适用范围：${r.leagueScope}）\n   核心精算法则：${r.ruleContent}`
  )
  .join('\n')}
请在本次赛事的【三维联动测谎】与【财富经最终判定】中，严格调取并比对上述实战进化法则，对符合特征的盘面进行强力校准与避险！
`;
}

/**
 * Retrieve saved post-match reviews with automatic deduplication
 */
export function getPostMatchReviews(): PostMatchReview[] {
  try {
    const raw = localStorage.getItem(REVIEWS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const seen = new Set<string>();
      const deduplicated: PostMatchReview[] = [];

      for (const rev of parsed) {
        // Ensure scoreHit boolean is accurately evaluated
        if (rev.outcomeEvaluation && typeof rev.outcomeEvaluation.scoreHit !== 'boolean') {
          const predicted = rev.priorReport?.decision?.predictedScores || [];
          rev.outcomeEvaluation.scoreHit = predicted.includes(rev.actualScore);
        }

        // Re-evaluate handicapHit and modelVerified with precise Asian Handicap logic
        if (rev.matchData && rev.priorReport && rev.outcomeEvaluation) {
          rev.outcomeEvaluation.handicapHit = evaluateHandicapHit(
            rev.matchData,
            rev.priorReport,
            rev.actualHomeScore,
            rev.actualAwayScore
          );
          rev.outcomeEvaluation.modelVerified =
            rev.outcomeEvaluation.euroHit && rev.outcomeEvaluation.handicapHit;
        }

        // Deduplicate key: home vs away + actual score
        const home = (rev.matchData?.matchInfo?.homeTeam || '').replace(/\s+/g, '').trim();
        const away = (rev.matchData?.matchInfo?.awayTeam || '').replace(/\s+/g, '').trim();
        const score = (rev.actualScore || '').replace(/\s+/g, '').trim();
        const key = home && away ? `${home}_vs_${away}_${score}` : rev.id;

        if (!seen.has(key)) {
          seen.add(key);
          deduplicated.push(rev);
        }
      }

      // If duplicates were pruned, sync back to localStorage
      if (deduplicated.length !== parsed.length) {
        localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(deduplicated));
      }
      return deduplicated;
    }
    return [];
  } catch (e) {
    console.error('Error loading post-match reviews:', e);
    return [];
  }
}

/**
 * Save a post-match review (Idempotent: updates existing review of the same match rather than creating duplicate)
 */
export function savePostMatchReview(review: PostMatchReview): void {
  try {
    const reviews = getPostMatchReviews();
    const getMatchKey = (r: PostMatchReview) => {
      const home = (r.matchData?.matchInfo?.homeTeam || '').replace(/\s+/g, '').trim();
      const away = (r.matchData?.matchInfo?.awayTeam || '').replace(/\s+/g, '').trim();
      const score = (r.actualScore || '').replace(/\s+/g, '').trim();
      return `${home}_vs_${away}_${score}`;
    };

    const targetKey = getMatchKey(review);
    const existingIdx = reviews.findIndex(
      (r) => r.id === review.id || getMatchKey(r) === targetKey
    );

    if (existingIdx >= 0) {
      reviews[existingIdx] = {
        ...review,
        id: reviews[existingIdx].id, // preserve ID
        reviewTimestamp: reviews[existingIdx].reviewTimestamp || review.reviewTimestamp,
      };
    } else {
      reviews.unshift(review);
    }
    localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(reviews));
  } catch (e) {
    console.error('Error saving review:', e);
  }
}

/**
 * Delete a single post-match review by ID
 */
export function deletePostMatchReview(reviewId: string): PostMatchReview[] {
  try {
    const reviews = getPostMatchReviews().filter((r) => r.id !== reviewId);
    localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(reviews));
    return reviews;
  } catch (e) {
    console.error('Error deleting review:', e);
    return [];
  }
}

/**
 * Clear all post-match reviews
 */
export function clearAllPostMatchReviews(): void {
  try {
    localStorage.removeItem(REVIEWS_STORAGE_KEY);
  } catch (e) {
    console.error('Error clearing reviews:', e);
  }
}

/**
 * Rigorously evaluates whether the Asian Handicap prediction hit (won/covered the spread).
 * Handles all cases: Home giving, Away giving (客让), and Flat (平手盘).
 */
export function evaluateHandicapHit(
  matchData: FullMatchData,
  priorReport: AnalysisReportResult,
  actualHomeScore: number,
  actualAwayScore: number
): boolean {
  const homeTeam = matchData.matchInfo?.homeTeam || '';
  const awayTeam = matchData.matchInfo?.awayTeam || '';
  const predictedHandicap = (priorReport.decision?.handicapPick || '').trim();

  const normHome = homeTeam.trim().toLowerCase();
  const normAway = awayTeam.trim().toLowerCase();
  const normPred = predictedHandicap.toLowerCase();

  const lateHandicapStr = (matchData.asianHandicap?.lateHandicap || '').trim();
  const parsedHandicapVal = parseHandicapValue(lateHandicapStr);

  // Who is giving handicap?
  // In Asian Handicap notation:
  // - If parsedHandicapVal > 0 or text has '客让'/'受让'/'受', Away gives handicap to Home.
  // - If parsedHandicapVal < 0 or text has '主让', Home gives handicap to Away.
  let isAwayGiving =
    parsedHandicapVal > 0 ||
    lateHandicapStr.includes('客让') ||
    lateHandicapStr.includes('受让') ||
    lateHandicapStr.includes('受') ||
    normPred.includes('客让');

  let isHomeGiving =
    parsedHandicapVal < 0 ||
    lateHandicapStr.includes('主让') ||
    normPred.includes('主让');

  if (normPred.includes('客让')) {
    isAwayGiving = true;
    isHomeGiving = false;
  } else if (normPred.includes('主让')) {
    isHomeGiving = true;
    isAwayGiving = false;
  }

  // Extract numerical handicap goals magnitude H (>= 0)
  let handicapGoals = Math.abs(parsedHandicapVal);
  if (handicapGoals === 0) {
    const matchLine = normPred.match(/[-+]?(\d+(?:\.\d+)?)/);
    if (matchLine) {
      handicapGoals = parseFloat(matchLine[1]) || 0;
    }
  }

  // Determine which side the prediction picked:
  let pickedSide: 'HOME' | 'AWAY' = 'HOME';
  if (normAway && normPred.includes(normAway)) {
    pickedSide = 'AWAY';
  } else if (normHome && normPred.includes(normHome)) {
    pickedSide = 'HOME';
  } else if (normPred.includes('客')) {
    pickedSide = 'AWAY';
  } else if (normPred.includes('主')) {
    pickedSide = 'HOME';
  } else if (normPred.includes('上盘')) {
    // 上盘 is the favorite giving the handicap!
    pickedSide = isAwayGiving ? 'AWAY' : 'HOME';
  } else if (normPred.includes('下盘')) {
    // 下盘 is the underdog receiving the handicap!
    pickedSide = isAwayGiving ? 'HOME' : 'AWAY';
  }

  // Evaluate outcome based on actual score and handicap line
  if (isAwayGiving) {
    // Away (e.g. 维京) gives handicapGoals to Home (e.g. 布兰)
    const awayLead = actualAwayScore - actualHomeScore;
    const diff = awayLead - handicapGoals;
    // Push (走盘): net lead exactly equals handicap
    if (Math.abs(diff) < 0.001) return false;

    if (pickedSide === 'AWAY') {
      return diff > 0; // Away beat the spread (穿盘 / 赢盘)
    } else {
      return diff < 0; // Home covered with +handicap
    }
  } else if (isHomeGiving) {
    // Home (e.g. 曼城) gives handicapGoals to Away (e.g. 埃弗顿)
    const homeLead = actualHomeScore - actualAwayScore;
    const diff = homeLead - handicapGoals;
    if (Math.abs(diff) < 0.001) return false;

    if (pickedSide === 'HOME') {
      return diff > 0; // Home beat the spread (穿盘 / 赢盘)
    } else {
      return diff < 0; // Away covered with +handicap
    }
  } else {
    // Flat / Pick'em (平手 0)
    if (actualHomeScore === actualAwayScore) return false;
    return pickedSide === 'HOME' ? actualHomeScore > actualAwayScore : actualAwayScore > actualHomeScore;
  }
}

/**
 * Evaluate match outcome against prior actuarial report and extract core rule
 */
export function evaluateMatchOutcomeAndExtractLesson(
  matchData: FullMatchData,
  priorReport: AnalysisReportResult,
  actualHomeScore: number,
  actualAwayScore: number,
  matchIncidents: string = '',
  persistToCoreRules: boolean = false,
  preferredSalesDate?: string,
  fallbackTimestamp?: number
): PostMatchReview {
  const { homeTeam, awayTeam, league } = matchData.matchInfo;
  const actualScoreStr = `${actualHomeScore}-${actualAwayScore}`;
  const totalGoals = actualHomeScore + actualAwayScore;
  const goalDiff = actualHomeScore - actualAwayScore;

  // 1. Euro Pick Evaluation
  // Determine actual Euro outcome
  const actualEuroOutcome = goalDiff > 0 ? 'WIN' : goalDiff === 0 ? 'DRAW' : 'LOSS';
  const predictedEuro = priorReport.decision.euroPick;
  let euroHit = false;

  if (predictedEuro.includes('主胜') && actualEuroOutcome === 'WIN') euroHit = true;
  else if (predictedEuro.includes('平') && actualEuroOutcome === 'DRAW') euroHit = true;
  else if (predictedEuro.includes('让球负') && (actualEuroOutcome === 'LOSS' || actualEuroOutcome === 'DRAW')) euroHit = true;
  else if (predictedEuro.includes('客队不败') && (actualEuroOutcome === 'LOSS' || actualEuroOutcome === 'DRAW')) euroHit = true;
  else if (predictedEuro.includes('客胜') && actualEuroOutcome === 'LOSS') euroHit = true;

  // 2. Handicap Evaluation
  const handicapHit = evaluateHandicapHit(
    matchData,
    priorReport,
    actualHomeScore,
    actualAwayScore
  );

  // 3. Over/Under Evaluation
  const ouLineNum = parseOverUnderValue(matchData.overUnder.lateLine);
  const isActualOver = totalGoals > ouLineNum;
  const predictedOU = priorReport.decision.overUnderPick;
  let overUnderHit = false;

  if (predictedOU.includes('大球') && isActualOver) overUnderHit = true;
  else if (predictedOU.includes('小球') && !isActualOver) overUnderHit = true;

  // 4. Score Match
  const scoreHit = priorReport.decision.predictedScores.includes(actualScoreStr);

  // 5. Model Verification
  const modelVerified = euroHit && handicapHit;

  // 6. Actuarial Dissection & Core Lesson Synthesis
  let summaryNote = '';
  let dissectionText = '';
  let evolvedRuleTitle = '';
  let evolvedRuleContent = '';

  const model = priorReport.identifiedModel;

  if (modelVerified) {
    summaryNote = `《财富经》【${priorReport.modelTitle}】研判完全印证！机构真实风控底牌被精准穿透。`;
    dissectionText = `【赛后精算复盘】本场 ${homeTeam} vs ${awayTeam} 实际完场 ${actualScoreStr}。
机构在晚盘所展现的【${priorReport.modelTitle}】操盘特征在赛果中得到 100% 验证。
1. 盘口真实意图：机构临场调水完全不是虚热吸筹，而是严密设防。
2. 资金流与赛果闭环：晚盘的水位变动直接对应了赛事的最终走向，三维测谎联动成功排雷。
3. 比赛进程：${matchIncidents ? `现场转折点记录（${matchIncidents}）印证了机构对基本面风险的敏锐洞察。` : '比赛完全在预设操盘轨迹内运行。'}`;

    evolvedRuleTitle = `${league}【${priorReport.modelTitle}】正向验证稳胆法`;
    evolvedRuleContent = `在 ${league} 等赛事中，当盘面确认【${priorReport.modelTitle}】（即时亚让 ${matchData.asianHandicap.lateHandicap} 水 ${matchData.asianHandicap.lateHomeOdds.toFixed(2)}，欧平 ${matchData.euroOdds.lateDraw.toFixed(2)}），机构风控极为可信，实战首选【${priorReport.decision.euroPick}】，让球锁定【${priorReport.decision.handicapPick}】。`;
  } else {
    summaryNote = `研判出现偏离。盘面遭遇非常规突发变量或机构升级了反向诱导套路。`;
    dissectionText = `【赛后精算复盘与纠偏】本场 ${homeTeam} vs ${awayTeam} 完场比分 ${actualScoreStr} 与预设模型产生偏差。
1. 偏差归因：${matchIncidents ? `受赛中关键事件影响（${matchIncidents}），打破了初盘战力平衡。` : '机构在临场使用了更深层的障眼法，临场盘口变轨存在双重反诱。'}
2. 欧亚指标再检视：初盘欧指 ${matchData.euroOdds.earlyWin}/${matchData.euroOdds.earlyDraw}/${matchData.euroOdds.earlyLoss} 调整至 ${matchData.euroOdds.lateWin}/${matchData.euroOdds.lateDraw}/${matchData.euroOdds.lateLoss}，平赔实际承受了极大对冲压力。
3. 核心进化结论：必须将此类特例盘型沉淀到实战战报库，在未来类似盘口时提高防范权重。`;

    // Distinguish between actual underdog upset vs heavy favorite blowout vs 1-goal small win vs push vs draw
    const lateHandicapNum = parseHandicapValue(matchData.asianHandicap.lateHandicap);
    const handicapOutcomeDiff = goalDiff + lateHandicapNum;
    const isHomeGiving = lateHandicapNum < 0;
    const isAwayGiving = lateHandicapNum > 0;
    const favoriteTeam = isHomeGiving ? homeTeam : isAwayGiving ? awayTeam : (matchData.euroOdds.lateWin <= matchData.euroOdds.lateLoss ? homeTeam : awayTeam);
    const underdogTeam = isHomeGiving ? awayTeam : isAwayGiving ? homeTeam : (matchData.euroOdds.lateWin <= matchData.euroOdds.lateLoss ? awayTeam : homeTeam);

    const isHomeCover = handicapOutcomeDiff > 0;
    const isAwayCover = handicapOutcomeDiff < 0;
    const isPush = Math.abs(handicapOutcomeDiff) < 0.01;

    const isFavoriteCover = (isHomeGiving && isHomeCover) || (isAwayGiving && isAwayCover);
    const isFavoriteBlowout = isFavoriteCover && Math.abs(goalDiff) >= 2;
    const isUnderdogOutrightWin = (isHomeGiving && goalDiff < 0) || (isAwayGiving && goalDiff > 0);
    const isDraw = goalDiff === 0;

    if (isFavoriteBlowout) {
      // 净胜 2 球及以上，且成功打穿深盘
      evolvedRuleTitle = `${league}【${homeTeam} vs ${awayTeam}】${favoriteTeam}深盘实力穿盘大胜验证`;
      evolvedRuleContent = `在 ${league} 对阵中，让步强队【${favoriteTeam}】具备绝对实力优势并在即时盘口得到体现（${matchData.asianHandicap.lateHandicap}）。实战打出 ${actualScoreStr}（净胜 ${Math.abs(goalDiff)} 球）强势穿盘大胜，切忌盲目反选受让下盘，顺应深盘打穿实力。`;
    } else if (isFavoriteCover && Math.abs(goalDiff) === 1) {
      // 仅净胜 1 球（如 1-0, 2-1），在浅盘（平半、半球、半一）下实现赢盘，明确属于“一球小胜赢盘”而非“穿盘”
      evolvedRuleTitle = `${league}【${homeTeam} vs ${awayTeam}】${favoriteTeam}一球小胜经济型赢盘验证`;
      evolvedRuleContent = `在 ${league} 对阵中，让步方【${favoriteTeam}】盘口为 ${matchData.asianHandicap.lateHandicap}。实战打出 ${actualScoreStr} 经济型小胜（净胜 1 球），虽未打穿深盘但稳稳收下让球盘口。属于典型的一球小胜赢盘，绝非深盘穿盘。`;
    } else if (isPush) {
      // 恰好卡在让球线上走盘（如 让一球 打出 1-0）
      evolvedRuleTitle = `${league}【${homeTeam} vs ${awayTeam}】恰卡盘口走盘退款验证`;
      evolvedRuleContent = `针对 ${league} 类似对阵，让球盘口为 ${matchData.asianHandicap.lateHandicap}，实际完场比分 ${actualScoreStr}（净胜 ${Math.abs(goalDiff)} 球）恰好卡在盘口临界点走盘退还本金。实战需警惕机构精准控盘防范全赢。`;
    } else if (isUnderdogOutrightWin) {
      evolvedRuleTitle = `${league}【${homeTeam} vs ${awayTeam}】受让方【${underdogTeam}】逆向爆冷修正法`;
      evolvedRuleContent = `针对 ${league} 类似对阵，若晚盘呈现让球 ${matchData.asianHandicap.lateHandicap} 但大小球卡在 ${matchData.overUnder.lateLine} 时，切忌单向盲冲让球方名气，需重点防范受让方【${underdogTeam}】逆向爆冷胜出（完场 ${actualScoreStr}）。`;
    } else if (isDraw) {
      evolvedRuleTitle = `${league}【${homeTeam} vs ${awayTeam}】平赔低洼/冷平防守验证`;
      evolvedRuleContent = `在 ${league} 类似对阵中（盘口 ${matchData.asianHandicap.lateHandicap}），机构平赔防守有效兑现，两头对冲下平局（完场 ${actualScoreStr}）具备极高防御价值。`;
    } else {
      evolvedRuleTitle = `${league}【${homeTeam} vs ${awayTeam}】强队赢球输盘/小胜卡盘修正法`;
      evolvedRuleContent = `针对 ${league} 让步 ${matchData.asianHandicap.lateHandicap} 深盘，强队仅取得 1 球微弱优势（完场 ${actualScoreStr}），未能完成深盘穿盘，受让方【${underdogTeam}】赢盘守住底线。`;
    }
  }

  const safeHome = (homeTeam || 'Home').replace(/\s+/g, '_');
  const safeAway = (awayTeam || 'Away').replace(/\s+/g, '_');

  const effectiveTimestamp = fallbackTimestamp || Date.now();
  const kickoffTime = matchData.matchInfo?.matchTime || '临场';
  const salesInfo = calculateSalesDate(kickoffTime, effectiveTimestamp, preferredSalesDate);

  const review: PostMatchReview = {
    id: `rev-${safeHome}-${safeAway}-${actualScoreStr}`,
    matchData,
    priorReport,
    actualScore: actualScoreStr,
    actualHomeScore,
    actualAwayScore,
    matchIncidents,
    reviewTimestamp: effectiveTimestamp,
    salesDate: salesInfo.salesDate,
    salesDateLabel: salesInfo.salesDateLabel,
    salesCycleText: salesInfo.salesCycleText,
    kickoffTime: salesInfo.kickoffTimeFormatted,
    outcomeEvaluation: {
      euroHit,
      handicapHit,
      overUnderHit,
      scoreHit,
      modelVerified,
      summaryNote,
    },
    dissectionText,
    evolvedRuleTitle,
    evolvedRuleContent,
    ruleCategory: model,
  };

  // Automatically save this review to history (idempotent)
  savePostMatchReview(review);

  // Only persist to core experience rules if explicitly requested (preventing runaway rule bloat)
  if (persistToCoreRules) {
    const newRule: EvolvedExperienceRule = {
      id: `rule-${safeHome}-${safeAway}-${model}`,
      title: evolvedRuleTitle,
      category: model,
      leagueScope: league || '全部联赛',
      ruleContent: evolvedRuleContent,
      sourceMatch: `${homeTeam} vs ${awayTeam} (完场: ${actualScoreStr})`,
      createdAt: new Date().toISOString().slice(0, 10),
      isActive: true,
      hitCount: modelVerified ? 1 : 0,
    };
    addOrUpdateExperienceRule(newRule);
  }

  return review;
}
