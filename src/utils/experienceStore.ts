import { V4_RED_LINES } from './coreRulesV4';
import { decisionOutcomes, parseEuroPick, readStoredScore } from './euroStatistics';
import {
  FullMatchData,
  AnalysisReportResult,
  PostMatchReview,
  PredictionSnapshot,
  EvolvedExperienceRule,
  ParlayReviewRecord,
  ParlayMatchSnapshot,
} from '../types/fortuneActuary';
import { parseHandicapValue, parseOverUnderValue } from './actuaryEngine';
import { calculateSalesDate, calibrateReviewSalesDate, getReviewSalesInfo, matchTeamsFuzzy } from './salesDayUtils';

const RULES_STORAGE_KEY = 'fortune_actuary_evolved_rules_v1';
const REVIEWS_STORAGE_KEY = 'fortune_actuary_reviews_v1';
const SALES_DAY_BACKUP_KEY = 'fortune_reviews_sales_day_backup_v1';
const PARLAY_REVIEWS_STORAGE_KEY = 'fortune_actuary_parlay_reviews_v1';

// Seed Initial Battle-tested Core Rules (5 Core Models + 3 Lie Detector Matrix + Workflow + Staking + Philosophy)
export const SEED_RULES: EvolvedExperienceRule[] = [
  {
    id: 'rule-model-POSITIVE_CONTROL',
    title: '【极限榨水 / 正向控赔】',
    category: 'POSITIVE_CONTROL',
    leagueScope: '全联赛通用 / 欧冠 / 五大联赛',
    ruleContent:
      '先确认同一让步方胜赔走低，再看亚盘升深或同盘降水，以及大小球有无下调。盘口变化互相支持时才保留五星资格。低赔率本身只能说明回本所需命中率高，不能证明有正回报。',
    sourceMatch: 'FC首尔 3-1 浦项制铁 / 罗森博格 4-0 腓特烈斯塔 / 曼城 2-0 埃弗顿 / 法国 4-1 比利时 (实盘验证)',
    createdAt: '2026-09-15',
    isActive: true,
    hitCount: 0,
  },
  {
    id: 'rule-model-HIGH_INTEREST_TRAP',
    title: '【高息吸筹 / 名气诱导】',
    category: 'HIGH_INTEREST_TRAP',
    leagueScope: '全联赛通用 / 豪门联赛 / 热门题材赛事',
    ruleContent:
      '升盘后让步方持续处于高水，且胜赔同步走高，记录为热门方向的反证。升盘自然换水须与同盘口比较。防冷双选按覆盖两项记录，每项使用一半模拟投入。',
    sourceMatch: '江原FC 0-3 富川1995 / 巴西 1-2 挪威 / 皇家马德里 1-1 赫塔菲 (实盘验证)',
    createdAt: '2026-09-18',
    isActive: true,
    hitCount: 0,
  },
  {
    id: 'rule-model-AVALANCHE_RETREAT',
    title: '【雪崩退盘 / 退热示弱】',
    category: 'AVALANCHE_RETREAT',
    leagueScope: '主流透明联赛 / 杯赛',
    ruleContent:
      '区分退盘伴随升水与换盘后的自然调价；主力伤停或轮换需要独立信息确认。仅有盘口变化时将原因记为待核实，不能推定球队内幕。',
    sourceMatch: '浦项制铁 0-1 金泉尚武 / 光州FC 1-1 金泉尚武 / 利物浦 1-2 纽卡斯尔联 (实盘验证)',
    createdAt: '2026-09-20',
    isActive: true,
    hitCount: 0,
  },
  {
    id: 'rule-model-LOW_DRAW_DEFENSE',
    title: '【平赔低洼 / 防平】',
    category: 'LOW_DRAW_DEFENSE',
    leagueScope: '欧国联 / 杯赛 / 均势联赛 / 国际赛',
    ruleContent:
      '平赔低于 3.00 且两队让步接近时，核对早晚平赔与进球线。赛前明确记录单挑平局或胜平、平负双选，复盘分别计算单选命中与双选覆盖。',
    sourceMatch: '普拉腾斯 1-1 科金博联合 / 赫塔费 1-1 维戈塞尔塔 / 拉齐奥 1-1 佛罗伦萨 (实盘验证)',
    createdAt: '2026-09-22',
    isActive: true,
    hitCount: 0,
  },
  {
    id: 'rule-model-SHALLOW_FULL_WATER',
    title: '【浅盘满水 / 让步不足】',
    category: 'SHALLOW_FULL_WATER',
    leagueScope: '常规联赛主客场 / 名气强队',
    ruleContent:
      '浅让步伴随持续高水可削弱对让步方的支持。核对早晚盘与两侧胜赔；方向分歧时保留观察。受让赢盘与胜平负不败分别结算。',
    sourceMatch: '安德莱赫特 3-1 哈马比 / 清水心跳 1-2 柏太阳神 / 多特蒙德 1-2 波鸿 (实盘验证)',
    createdAt: '2026-09-25',
    isActive: true,
    hitCount: 0,
  },
  {
    id: 'rule-goals-detector-1',
    title: '【深让步与低进球线】',
    category: 'POSITIVE_CONTROL',
    leagueScope: '全部主流联赛',
    ruleContent:
      '让步达到 1.25 球且进球线不高于 2.25 时，区分赢球、小胜走盘与穿盘。记录两个市场各自的赛前方向和赔率。',
    sourceMatch: '巴黎圣日耳曼 2-0 朗斯 / 尤文图斯 1-0 恩波利 (实盘验证)',
    createdAt: '2026-09-28',
    isActive: true,
    hitCount: 0,
  },
  {
    id: 'rule-goals-detector-2',
    title: '【浅让步与高进球线】',
    category: 'GENERAL',
    leagueScope: '进球活跃型联赛 / 德甲 / 荷甲 / 英超',
    ruleContent:
      '平手或平半配合 2.75 及以上进球线时，记录可能的高进球环境。结合早晚进球线和大小两侧水位核实，单独复盘大小球。',
    sourceMatch: '布莱顿 2-3 托特纳姆热刺 / 霍芬海姆 3-2 不莱梅 (实盘验证)',
    createdAt: '2026-09-29',
    isActive: true,
    hitCount: 0,
  },
  {
    id: 'rule-goals-detector-3',
    title: '【大球降水未升线】',
    category: 'SPECIAL_SITUATION',
    leagueScope: '热门对攻赛事 / 杯赛淘汰赛',
    ruleContent:
      '大球水位下调但进球线停在 2.5 时，记录价格变化与盘口变化的背离；不得仅凭大球降水推断热门方能打穿。',
    sourceMatch: '拜仁慕尼黑 1-0 勒沃库森 / 曼联 1-1 切尔西 (实盘验证)',
    createdAt: '2026-09-30',
    isActive: true,
    hitCount: 0,
  },
  {
    id: 'rule-workflow-three-steps',
    title: '【v4 三步研判】',
    category: 'GENERAL',
    leagueScope: '全赛事通用操作规程',
    ruleContent:
      '保存初盘、临场盘及球队定位；逐项核对同一方的欧赔、亚盘与大小球；先检查临场红线，再冻结赛前方向和星级。回看历史时区分原预测与事后重算。',
    sourceMatch: '《财富经》全流程手操复盘验证法',
    createdAt: '2026-09-10',
    isActive: true,
    hitCount: 0,
  },
  {
    id: 'rule-risk-management',
    title: '【组合风险与等额回报】',
    category: 'GENERAL',
    leagueScope: '全投注生存风控底线',
    ruleContent:
      '仅把已通过盘口交叉核对的正向控赔场次列入核心二串一。五串一及更长的单线组合，一场失准即可全损。单场模拟按总投入 1 单位结算，双选平分，不把覆盖率当作回报率。',
    sourceMatch: '《财富经》资金管理与分仓操盘纪律',
    createdAt: '2026-09-05',
    isActive: true,
    hitCount: 0,
  },
  {
    id: 'rule-philosophy-core',
    title: '【赔率、证伪与验证】',
    category: 'GENERAL',
    leagueScope: '全局足彩量化精算心法',
    ruleContent:
      '赔率体现市场定价，星级表示规则吻合程度。用赛前记录与后来比赛检验表现，按赔率段比较同组热门基准，同时报告样本数、胜平负覆盖和净回报。不要把固定置信分当作已测胜率。',
    sourceMatch: '《财富经》终极手操指南与系统心法',
    createdAt: '2026-09-01',
    isActive: true,
    hitCount: 0,
  },
  {
    id: 'rule-risk-v4-red-lines',
    title: '【v4 临场四条红线】',
    category: 'GENERAL',
    leagueScope: '单场复核 / 组合筛选',
    ruleContent: V4_RED_LINES.join('\n'),
    sourceMatch: '《财富经》v4 手册 · 临场红线',
    createdAt: '2026-11-23',
    isActive: true,
    hitCount: 0,
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

  const modelId = 'rule-model-' + category;
  if (SEED_RULES.some(rule => rule.id === modelId)) return modelId;
  if (text.includes('临场红线') || text.includes('四条红线')) return 'rule-risk-v4-red-lines';

  // 1. Goals Detector Matrix
  if (text.includes('GOALS') || text.includes('大小球') || text.includes('进球数') || text.includes('测谎')) {
    if (text.includes('降水') || text.includes('死卡') || text.includes('2.5') || text.includes('双向收割')) {
      return 'rule-goals-detector-3';
    }
    if (text.includes('对攻') || text.includes('互爆') || text.includes('巨型') || text.includes('深大小球') || text.includes('2.75') || text.includes('3.0')) {
      return 'rule-goals-detector-2';
    }
    return 'rule-goals-detector-1';
  }

  // 2. Risk Management & Staking
  if (text.includes('资金') || text.includes('串关') || text.includes('分仓') || text.includes('容错') || text.includes('2串1') || text.includes('生存法则') || text.includes('STAKING') || text.includes('RISK')) {
    return 'rule-risk-management';
  }

  // 3. Workflow
  if (text.includes('工作流') || text.includes('三步') || text.includes('速查') || text.includes('WORKFLOW') || text.includes('变轨') || text.includes('锁定')) {
    return 'rule-workflow-three-steps';
  }

  // 4. 5 Classic Models
  if (text.includes('HIGH_INTEREST_TRAP') || text.includes('高息') || text.includes('吸筹') || text.includes('杀猪') || text.includes('诱导') || text.includes('名气') || text.includes('逆向') || text.includes('爆冷')) {
    return 'rule-model-HIGH_INTEREST_TRAP';
  }
  if (text.includes('AVALANCHE_RETREAT') || text.includes('雪崩') || text.includes('退盘') || text.includes('退热') || text.includes('示弱') || text.includes('利空') || text.includes('跟退') || text.includes('洗盘')) {
    return 'rule-model-AVALANCHE_RETREAT';
  }
  if (text.includes('LOW_DRAW_DEFENSE') || text.includes('平赔') || text.includes('低洼') || text.includes('排雷') || text.includes('防平') || text.includes('双平') || text.includes('平局') || text.includes('胆平')) {
    return 'rule-model-LOW_DRAW_DEFENSE';
  }
  if (text.includes('SHALLOW_FULL_WATER') || text.includes('浅盘') || text.includes('满水') || text.includes('死亡') || text.includes('虚化')) {
    return 'rule-model-SHALLOW_FULL_WATER';
  }
  if (text.includes('POSITIVE_CONTROL') || text.includes('榨水') || text.includes('正向控赔') || text.includes('正路') || text.includes('稳胆') || text.includes('实力穿盘') || text.includes('经济型赢盘')) {
    return 'rule-model-POSITIVE_CONTROL';
  }
  if (text.includes('心法') || text.includes('PHILOSOPHY') || text.includes('GENERAL') || text.includes('证伪') || text.includes('铁律')) {
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
        sourceMatch: r.sourceMatch || existing.sourceMatch,
      });
      continue;
    }

    // B. Check if it's an explicit manual custom rule (created via user "+ 追加经验" modal)
    if (r.id.startsWith('manual-')) {
      const cleanSourceR = (r.sourceMatch || '')
        .replace(/\(完场[^\)]*\)/g, '')
        .replace(/\(实盘验证\)/g, '')
        .replace(/\(实战验证\)/g, '')
        .replace(/\s+/g, '')
        .trim();
      const existing = userManualRules.find(
        (mr) =>
          mr.id === r.id ||
          (mr.title === r.title && mr.ruleContent === r.ruleContent) ||
          (cleanSourceR &&
            (mr.sourceMatch || '')
              .replace(/\(完场[^\)]*\)/g, '')
              .replace(/\(实盘验证\)/g, '')
              .replace(/\(实战验证\)/g, '')
              .replace(/\s+/g, '')
              .trim() === cleanSourceR)
      );
      if (existing) {
        existing.hitCount = Math.max(existing.hitCount || 0, (existing.hitCount || 0) + (r.hitCount || 0));
        if (r.sourceMatch && !existing.sourceMatch?.includes(r.sourceMatch)) {
          existing.sourceMatch = `${existing.sourceMatch || ''} / ${r.sourceMatch}`.replace(/^\s*\/\s*/, '');
        }
      } else {
        userManualRules.push({ ...r });
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
// Consolidation is expensive and runs on every read; cache the result per stored string.
// Any write (here or a direct setItem elsewhere) changes the string and invalidates it.
// Callers mutate the returned objects, so every hit hands out a fresh parse.
let rulesReadCache: { raw: string; json: string } | null = null;

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
    if (rulesReadCache && rulesReadCache.raw === raw) {
      return JSON.parse(rulesReadCache.json);
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Always guarantee consolidation so rules are clean and never bloated into 60 matches
      const consolidated = consolidateRulesToCoreMaster(parsed);
      const json = JSON.stringify(consolidated);
      if (json !== JSON.stringify(parsed)) {
        try { localStorage.setItem(RULES_STORAGE_KEY, json); } catch { /* Keep current rules available in memory. */ }
      }
      rulesReadCache = { raw: localStorage.getItem(RULES_STORAGE_KEY) ?? raw, json };
      return JSON.parse(json);
    }
    return SEED_RULES;
  } catch (e) {
    console.error('Error loading experience rules:', e);
    return SEED_RULES;
  }
}

/**
 * Save an updated list of experience rules (Always auto-consolidates to prevent bloat)
 */
export function saveExperienceRules(rules: EvolvedExperienceRule[]): void {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    const cleanConsolidated = consolidateRulesToCoreMaster(rules);
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(cleanConsolidated));
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
      r.id.startsWith('rule-goals-') ||
      r.id.startsWith('rule-philosophy-') ||
      r.id.startsWith('rule-workflow-') ||
      r.id.startsWith('rule-risk-');

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
 * 一键去重引擎：
 * 消除法则库体检中发现的重复法则（同场比赛多条法则或同质重复），
 * 严格执行用户确认的去重策略：“保留最新或命中最高的一条并合并战绩样板”
 */
export function deduplicateExperienceRules(): {
  beforeCount: number;
  afterCount: number;
  removedCount: number;
  mergedCount: number;
  newRules: EvolvedExperienceRule[];
} {
  let rawRules: EvolvedExperienceRule[] = [];
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(RULES_STORAGE_KEY) : null;
    if (raw) rawRules = JSON.parse(raw);
  } catch (e) {
    rawRules = [];
  }
  const sourceRules = rawRules.length > 0 ? rawRules : getExperienceRules();
  const beforeCount = sourceRules.length;

  if (beforeCount === 0) {
    return {
      beforeCount: 0,
      afterCount: 0,
      removedCount: 0,
      mergedCount: 0,
      newRules: [],
    };
  }

  // 辅助函数：提取归一化赛果对阵（去除多余标记与空格）
  const getCleanSource = (r: EvolvedExperienceRule) =>
    (r.sourceMatch || '')
      .replace(/【|】/g, '')
      .replace(/\(完场[^\)]*\)/g, '')
      .replace(/\(实盘验证\)/g, '')
      .replace(/\(实战验证\)/g, '')
      .replace(/\s+/g, '')
      .trim();

  // 辅助函数：提取归一化标题
  const getCleanTitle = (r: EvolvedExperienceRule) =>
    (r.title || '')
      .replace(/【|】|《|》/g, '')
      .replace(/\s+/g, '')
      .trim()
      .toLowerCase();

  // 并查集构建重复归并群组
  const n = sourceRules.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    if (parent[i] === i) return i;
    parent[i] = find(parent[i]);
    return parent[i];
  };
  const union = (i: number, j: number) => {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) {
      parent[rootJ] = rootI;
    }
  };

  const idMap = new Map<string, number>();
  const sourceMap = new Map<string, number>();
  const titleMap = new Map<string, number>();

  for (let i = 0; i < n; i++) {
    const r = sourceRules[i];
    if (!r) continue;

    // 1. 同 ID 归并
    if (r.id) {
      if (idMap.has(r.id)) {
        union(i, idMap.get(r.id)!);
      } else {
        idMap.set(r.id, i);
      }
    }

    // 2. 同场赛果样板归并
    const cs = getCleanSource(r);
    if (cs) {
      if (sourceMap.has(cs)) {
        union(i, sourceMap.get(cs)!);
      } else {
        sourceMap.set(cs, i);
      }
    }

    // 3. 同标题核心规则归并（标题长度>=4避免过于宽泛的通则被误并）
    const ct = getCleanTitle(r);
    if (ct && ct.length >= 4) {
      if (titleMap.has(ct)) {
        union(i, titleMap.get(ct)!);
      } else {
        titleMap.set(ct, i);
      }
    }
  }

  // 按根节点分组
  const groups = new Map<number, EvolvedExperienceRule[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(sourceRules[i]);
  }

  let mergedCount = 0;
  const cleanRules: EvolvedExperienceRule[] = [];

  groups.forEach((group) => {
    if (group.length === 1) {
      cleanRules.push(group[0]);
      return;
    }

    // 发现重复组：合并战绩样板，择优保留
    mergedCount += group.length - 1;

    // 按照用户确认的去重保留策略排序：
    // 1. hitCount 实战印证命中最高者优先
    // 2. 若命中次数一致，则 createdAt 最新者优先
    // 3. 若均一致，官方种子核心母本法则优先
    // 4. 丰富度（ruleContent 详细程度）优先
    const sorted = [...group].sort((a, b) => {
      const hitDiff = (b.hitCount || 0) - (a.hitCount || 0);
      if (hitDiff !== 0) return hitDiff;

      const dateA = a.createdAt || '';
      const dateB = b.createdAt || '';
      const dateDiff = dateB.localeCompare(dateA);
      if (dateDiff !== 0) return dateDiff;

      const aIsCore =
        a.id.startsWith('rule-model-') ||
        a.id.startsWith('rule-philosophy-') ||
        a.id.startsWith('rule-risk-') ||
        a.id.startsWith('rule-workflow-') ||
        a.id.startsWith('rule-goals-');
      const bIsCore =
        b.id.startsWith('rule-model-') ||
        b.id.startsWith('rule-philosophy-') ||
        b.id.startsWith('rule-risk-') ||
        b.id.startsWith('rule-workflow-') ||
        b.id.startsWith('rule-goals-');
      if (aIsCore && !bIsCore) return -1;
      if (!aIsCore && bIsCore) return 1;

      return (b.ruleContent || '').length - (a.ruleContent || '').length;
    });

    const winner: EvolvedExperienceRule = { ...sorted[0] };

    // 合并实战战绩样板：汇总各重复项中的 sourceMatch 赛果案例，去重后拼合
    const samplesSet = new Set<string>();
    const normalizedSamples = new Set<string>();

    for (const item of group) {
      if (!item.sourceMatch) continue;
      const parts = item.sourceMatch.split(/\s*[\/\n]\s*/);
      for (const rawPart of parts) {
        const part = rawPart.trim();
        if (!part) continue;
        const norm = part
          .replace(/【|】/g, '')
          .replace(/\(完场[^\)]*\)/g, '')
          .replace(/\(实盘验证\)/g, '')
          .replace(/\(实战验证\)/g, '')
          .replace(/\s+/g, '')
          .trim();
        if (norm && !normalizedSamples.has(norm)) {
          normalizedSamples.add(norm);
          samplesSet.add(part);
        }
      }
    }

    if (samplesSet.size > 0) {
      winner.sourceMatch = Array.from(samplesSet).join(' / ');
    }

    // 累加所有被合并重复项的实盘印证命中次数
    const totalHitCount = group.reduce((sum, item) => sum + (item.hitCount || 0), 0);
    winner.hitCount = Math.max(winner.hitCount || 0, totalHitCount);

    // 状态保持：若有任一条激活，则母本保持激活
    winner.isActive = group.some((item) => item.isActive !== false);

    cleanRules.push(winner);
  });

  const afterCount = cleanRules.length;
  const removedCount = Math.max(0, beforeCount - afterCount);

  // 直接写回持久化存储
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(cleanRules));
    }
  } catch (e) {
    console.error('Error saving deduplicated experience rules:', e);
  }

  return {
    beforeCount,
    afterCount,
    removedCount,
    mergedCount,
    newRules: cleanRules,
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
  // First run thorough deduplication
  const dedupRes = deduplicateExperienceRules();
  const rawRules = dedupRes.newRules;
  const beforeCount = dedupRes.beforeCount;

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
      r.id.startsWith('rule-goals-') ||
      r.id.startsWith('rule-philosophy-') ||
      r.id.startsWith('rule-workflow-') ||
      r.id.startsWith('rule-risk-')
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
    // 1. Master Core Rules are authoritative definitions and should never be corrupted by inverted text replacements
    const isMasterCore =
      r.id.startsWith('rule-model-') ||
      r.id.startsWith('rule-goals-') ||
      r.id.startsWith('rule-philosophy-') ||
      r.id.startsWith('rule-workflow-') ||
      r.id.startsWith('rule-risk-') ||
      r.id.startsWith('rule-classic-');

    if (isMasterCore) {
      return r;
    }

    let title = r.title;
    let content = r.ruleContent;
    let category = r.category;
    let changed = false;

    // Detect inverted language where a blowout win was erroneously called '冷门反杀'
    if (
      (content.includes('【主胜】冷门反杀') || title.includes('【主胜】冷门反杀') || title.includes('逆向爆冷修正法')) &&
      (content.includes('法国') || content.includes('比利时') || r.sourceMatch?.includes('法国'))
    ) {
      title = '欧国联【法国 vs 比利时】深盘实力穿盘验证法';
      category = 'POSITIVE_CONTROL';
      content = '针对 欧国联 类似对阵，若晚盘让步达 一球/球半 且大小球高达 3.5 时，属于真实对攻且让步深邃，切忌盲博受让下盘，顺应让步强队绝对攻势穿盘打出。';
      changed = true;
    } else if (
      (content.includes('【客胜】冷门反杀') || title.includes('【客胜】冷门反杀') || title.includes('逆向爆冷修正法')) &&
      (content.includes('摩尔多瓦') || content.includes('斯洛伐克') || r.sourceMatch?.includes('斯洛伐克'))
    ) {
      title = '欧国联【摩尔多瓦 vs 斯洛伐克】客让深盘实力穿透法则';
      category = 'POSITIVE_CONTROL';
      content = '针对 欧国联 类似对阵，若晚盘呈现客让 受球半 且机构防线牢固，强弱分明格局下切忌盲博弱队受让，防范客队实力碾压穿盘大胜。';
      changed = true;
    } else if (content.includes('【主胜】冷门反杀')) {
      content = content.replace(/【主胜】冷门反杀/g, '【主队实力穿盘】');
      title = title.replace(/逆向避险修正法/g, '实力穿盘验证法').replace(/【主胜】冷门反杀/g, '深盘实力穿盘');
      category = 'POSITIVE_CONTROL';
      changed = true;
    } else if (
      content.includes('【客胜】冷门反杀') &&
      (content.includes('受球半') || content.includes('受两球') || content.includes('受一球') || content.includes('净胜'))
    ) {
      content = content.replace(/【客胜】冷门反杀/g, '【客队实力穿透】');
      title = title.replace(/逆向避险修正法/g, '客让实力穿透法').replace(/【客胜】冷门反杀/g, '客胜实力穿盘');
      category = 'POSITIVE_CONTROL';
      changed = true;
    }

    if (changed && (title !== r.title || content !== r.ruleContent || category !== r.category)) {
      repairedCount++;
      return { ...r, title, category, ruleContent: content };
    }
    return r;
  });

  if (repairedCount > 0) {
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(repaired));
      }
    } catch (e) {
      console.error(e);
    }
    saveExperienceRules(repaired);

    // Also sanitize any corresponding post-match review titles to avoid recurring inverted text
    try {
      const storedReviews = getPostMatchReviews();
      let revChanged = false;
      for (const rev of storedReviews) {
        if (rev.evolvedRuleTitle?.includes('【主胜】冷门反杀') || rev.evolvedRuleContent?.includes('【主胜】冷门反杀')) {
          rev.evolvedRuleTitle = rev.evolvedRuleTitle.replace(/【主胜】冷门反杀/g, '深盘实力穿盘').replace(/逆向避险修正法/g, '实力穿盘验证法');
          rev.evolvedRuleContent = (rev.evolvedRuleContent || '').replace(/【主胜】冷门反杀/g, '【主队实力穿盘】');
          revChanged = true;
        }
        if (rev.evolvedRuleTitle?.includes('【客胜】冷门反杀') || rev.evolvedRuleContent?.includes('【客胜】冷门反杀')) {
          rev.evolvedRuleTitle = rev.evolvedRuleTitle.replace(/【客胜】冷门反杀/g, '客让实力穿盘').replace(/逆向避险修正法/g, '客让实力穿透法');
          rev.evolvedRuleContent = (rev.evolvedRuleContent || '').replace(/【客胜】冷门反杀/g, '【客队实力穿透】');
          revChanged = true;
        }
      }
      if (revChanged && typeof localStorage !== 'undefined') {
        writeReviewArchive(storedReviews);
      }
    } catch (e) {
      // ignore
    }
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
【《财富经》实战复盘自我进化法则库（已吸纳 ${activeRules.length} 条已启用法则，案例次数不代表命中率）】：
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
// Same idea as rulesReadCache: recalibrating every review on each of the dozens of
// reads per interaction is wasted work once the stored archive is already calibrated.
interface ReviewArchive {
  reviews: PostMatchReview[];
  unreadable: unknown[];
  changed: boolean;
}
let reviewsReadCache: { raw: string; json: string } | null = null;

/** One match per sales day: the score is deliberately not part of the key, so a corrected score replaces the old entry. */
function reviewMatchKey(r: PostMatchReview): string {
  const home = (r.matchData?.matchInfo?.homeTeam || '').replace(/\s+/g, '').trim();
  const away = (r.matchData?.matchInfo?.awayTeam || '').replace(/\s+/g, '').trim();
  return home && away ? `${home}_vs_${away}_${r.salesDate || ''}` : `id:${r.id}`;
}

function calibrateStoredReview(rev: PostMatchReview) {
  if (!rev?.id || !rev.matchData?.matchInfo || !rev.priorReport || !rev.outcomeEvaluation) {
    throw new Error('复盘记录缺少必要字段');
  }
  let changed = false;
  const cal = calibrateReviewSalesDate({ ...rev, outcomeEvaluation: { ...rev.outcomeEvaluation } });
  if (cal.salesDate !== rev.salesDate || cal.kickoffTime !== rev.kickoffTime) {
    changed = true;
  }

  // Ensure scoreHit boolean is accurately evaluated
  if (cal.outcomeEvaluation && typeof cal.outcomeEvaluation.scoreHit !== 'boolean') {
    const predicted = cal.priorReport?.decision?.predictedScores || [];
    cal.outcomeEvaluation.scoreHit = predicted.includes(cal.actualScore);
    changed = true;
  }

  // Re-evaluate euroHit, handicapHit, overUnderHit, and modelVerified with latest precise actuarial logic
  const storedScore = readStoredScore(cal);
  if (cal.matchData && cal.priorReport && cal.outcomeEvaluation && storedScore) {
    const hScore = storedScore.home;
    const aScore = storedScore.away;
    const goalDiff = hScore - aScore;
    const actualEuroOutcome = goalDiff > 0 ? 'WIN' : goalDiff === 0 ? 'DRAW' : 'LOSS';

    const newEuroHit = decisionOutcomes(cal.priorReport.decision).includes(actualEuroOutcome);
    const hdcRes = evaluateHandicapDetailedOutcome(
      cal.matchData,
      cal.priorReport,
      hScore,
      aScore
    );
    const newOverUnderHit = evaluateOverUnderHit(
      cal.matchData.overUnder.lateLine,
      cal.priorReport.decision?.overUnderPick || '',
      hScore,
      aScore
    );
    const newModelVerified = newEuroHit && hdcRes.hit;

    // Match the old generated sentences so that manually edited lessons survive a reload.
    const oldText = cal.evolvedRuleContent || '';
    const template = /^针对 .* 深盘，强队仅取得 1 球微弱优势（完场 [^）]+），未能完成深盘穿盘，受让方【.+】赢盘守住底线。$/.test(oldText)
      || /^在 .* 对阵中，.*强势穿盘大胜，切忌盲目反选受让下盘，顺应深盘打穿实力。$/.test(oldText)
      || /^在 .* 对阵中，.*属于典型的一球小胜赢盘，绝非深盘穿盘。$/.test(oldText)
      || /^针对 .* 双方实力接近之胶着盘型.*守住盘面底线。$/.test(oldText)
      || /^在 .* 类似对阵中.*机构平赔防守有效兑现，两头对冲下平局.*具备极高防御价值。$/.test(oldText);
    if (template) {
      const lesson = boundaryHandicapLesson(cal.matchData, hScore, aScore);
      if (lesson) {
        cal.evolvedRuleContent = lesson.content;
        if (/(?:小胜卡盘修正法|深盘实力穿盘大胜验证|一球小胜经济型赢盘验证|受让守盘修正法|冷平防守验证)$/.test(cal.evolvedRuleTitle)) {
          cal.evolvedRuleTitle = lesson.title;
        }
        changed = true;
      }
    }

    if (
      cal.outcomeEvaluation.euroHit !== newEuroHit ||
      cal.outcomeEvaluation.handicapHit !== hdcRes.hit ||
      cal.outcomeEvaluation.handicapDetail !== hdcRes.detail ||
      cal.outcomeEvaluation.handicapDetailLabel !== hdcRes.detailLabel ||
      cal.outcomeEvaluation.overUnderHit !== newOverUnderHit ||
      cal.outcomeEvaluation.modelVerified !== newModelVerified
    ) {
      changed = true;
    }

    cal.outcomeEvaluation.euroHit = newEuroHit;
    cal.outcomeEvaluation.handicapHit = hdcRes.hit;
    cal.outcomeEvaluation.handicapDetail = hdcRes.detail;
    cal.outcomeEvaluation.handicapDetailLabel = hdcRes.detailLabel;
    cal.outcomeEvaluation.overUnderHit = newOverUnderHit;
    cal.outcomeEvaluation.modelVerified = newModelVerified;
  }
  return { review: cal, changed };
}

function readReviewArchive(raw: string | null): ReviewArchive {
  if (raw === null) return { reviews: [], unreadable: [], changed: false };
  if (reviewsReadCache?.raw === raw) return JSON.parse(reviewsReadCache.json);
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows)) throw new Error('复盘档案格式错误');
  const archive: ReviewArchive = { reviews: [], unreadable: [], changed: false };
  const seen = new Set<string>();
  for (const row of rows) {
    try {
      const { review, changed } = calibrateStoredReview(row);
      const key = reviewMatchKey(review);
      if (seen.has(key)) {
        archive.changed = true;
        continue;
      }
      seen.add(key);
      archive.reviews.push(review);
      archive.changed ||= changed;
    } catch {
      archive.unreadable.push(row);
    }
  }
  reviewsReadCache = { raw, json: JSON.stringify(archive) };
  return archive;
}

// Keep unrecognized historical rows alongside the valid rows on every ordinary write.
// Parsing must succeed before replacing an archive, even when the caller supplies its own list.
function writeReviewArchive(reviews: PostMatchReview[], archive = readReviewArchive(localStorage.getItem(REVIEWS_STORAGE_KEY))) {
  localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify([...reviews, ...archive.unreadable]));
}

export function getPostMatchReviews(): PostMatchReview[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(REVIEWS_STORAGE_KEY);
    const archive = readReviewArchive(raw);
    if (archive.changed && raw !== null) {
      try {
        if (!localStorage.getItem(SALES_DAY_BACKUP_KEY)) localStorage.setItem(SALES_DAY_BACKUP_KEY, raw);
        writeReviewArchive(archive.reviews, archive);
      } catch (error) {
        console.warn('Could not persist review migration:', error);
      }
    }
    return archive.reviews;
  } catch (error) {
    console.error('Error loading post-match reviews:', error);
    return [];
  }
}

/**
 * Save a post-match review (Idempotent: updates existing review of the same match rather than creating duplicate)
 */
export function savePostMatchReview(review: PostMatchReview): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const calReview = calibrateReviewSalesDate(review);
    const currentRaw = localStorage.getItem(REVIEWS_STORAGE_KEY);
    const archive = readReviewArchive(currentRaw);
    const reviews = archive.reviews;
    const targetKey = reviewMatchKey(calReview);
    const existingIdx = reviews.findIndex(
      (r) => r.id === calReview.id || reviewMatchKey(r) === targetKey
    );

    if (currentRaw && !localStorage.getItem(SALES_DAY_BACKUP_KEY)) {
      localStorage.setItem(SALES_DAY_BACKUP_KEY, currentRaw);
    }

    if (existingIdx >= 0) {
      const existing = reviews[existingIdx];
      const override = calReview.salesDateOverride !== undefined ? calReview.salesDateOverride : existing.salesDateOverride;
      reviews[existingIdx] = {
        ...calReview,
        ...(existing.predictionSnapshot ? {
          predictionSnapshot: existing.predictionSnapshot, matchData: existing.matchData, priorReport: existing.priorReport,
        } : {}),
        id: existing.id, // preserve ID
        salesDateOverride: override,
        salesDate: override || calReview.salesDate,
        reviewTimestamp: calReview.reviewTimestamp || existing.reviewTimestamp || Date.now(),
      };
      if (existing.predictionSnapshot) {
        const next = reviews[existingIdx];
        next.outcomeEvaluation.scoreHit = next.priorReport.decision.predictedScores.includes(next.actualScore);
        reviews[existingIdx] = calibrateStoredReview(next).review;
      }
    } else {
      reviews.unshift(calReview);
    }
    writeReviewArchive(reviews, archive);
    return true;
  } catch (e) {
    console.error('Error saving review:', e);
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      queueMicrotask(() => window.dispatchEvent(new Event('fortune-review-save-error')));
    }
    return false;
  }
}

/**
 * Delete a single post-match review by ID
 */
export function deletePostMatchReview(reviewId: string): PostMatchReview[] {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
    const archive = readReviewArchive(localStorage.getItem(REVIEWS_STORAGE_KEY));
    const reviews = archive.reviews.filter((r) => r.id !== reviewId);
    writeReviewArchive(reviews, archive);
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
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(REVIEWS_STORAGE_KEY);
    }
  } catch (e) {
    console.error('Error clearing reviews:', e);
  }
}

/**
 * Batch save all post-match reviews directly to storage
 */
export function saveAllPostMatchReviews(reviews: PostMatchReview[]): void {
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      writeReviewArchive(reviews);
    }
  } catch (e) {
    console.error('Error batch saving reviews:', e);
  }
}

/**
 * Safely replace all post-match reviews with automatic backup and boolean status
 */
export function replacePostMatchReviews(reviews: PostMatchReview[]): boolean {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
    const existing = localStorage.getItem(REVIEWS_STORAGE_KEY);
    if (existing) {
      localStorage.setItem(`${REVIEWS_STORAGE_KEY}_backup`, existing);
    }
    writeReviewArchive(reviews);
    return true;
  } catch (e) {
    console.error('Error replacing reviews:', e);
    return false;
  }
}

/**
 * Rigorously evaluates 2-Pick Parlay (2串1) settlement against individual match reviews
 */
export function evaluateParlaySettlement(
  parlay: ParlayReviewRecord,
  allReviews: PostMatchReview[]
): ParlayReviewRecord {
  const findReviewForMatch = (m: ParlayMatchSnapshot) => {
    return allReviews.find((r) => {
      const rHome = r.matchData?.matchInfo?.homeTeam || '';
      const rAway = r.matchData?.matchInfo?.awayTeam || '';
      return (
        m.homeTeam &&
        m.awayTeam &&
        rHome &&
        rAway &&
        matchTeamsFuzzy(m.homeTeam, rHome) &&
        matchTeamsFuzzy(m.awayTeam, rAway)
      );
    });
  };

  const rev1 = findReviewForMatch(parlay.match1);
  const rev2 = findReviewForMatch(parlay.match2);

  const parseScoreNums = (scoreStr?: string) => {
    if (!scoreStr) return { home: undefined, away: undefined };
    const parts = scoreStr.split('-');
    if (parts.length === 2) {
      const h = parseInt(parts[0], 10);
      const a = parseInt(parts[1], 10);
      if (!isNaN(h) && !isNaN(a)) return { home: h, away: a };
    }
    return { home: undefined, away: undefined };
  };

  const finalScore1 = rev1?.actualScore || parlay.match1.actualScore || parlay.match1.finalScore;
  let home1 = rev1?.actualHomeScore ?? parlay.match1.actualHomeScore;
  let away1 = rev1?.actualAwayScore ?? parlay.match1.actualAwayScore;
  if (home1 === undefined && finalScore1) {
    const p = parseScoreNums(finalScore1);
    home1 = p.home;
    away1 = p.away;
  }

  const finalScore2 = rev2?.actualScore || parlay.match2.actualScore || parlay.match2.finalScore;
  let home2 = rev2?.actualHomeScore ?? parlay.match2.actualHomeScore;
  let away2 = rev2?.actualAwayScore ?? parlay.match2.actualAwayScore;
  if (home2 === undefined && finalScore2) {
    const p = parseScoreNums(finalScore2);
    home2 = p.home;
    away2 = p.away;
  }

  const line1 = parlay.match1.handicapLine || rev1?.matchData?.asianHandicap?.lateHandicap || '平手';
  const line2 = parlay.match2.handicapLine || rev2?.matchData?.asianHandicap?.lateHandicap || '平手';

  const hc1 = (home1 !== undefined && away1 !== undefined)
    ? evaluateSingleHandicapOutcome(line1, parlay.match1.handicapPick, parlay.match1.homeTeam, parlay.match1.awayTeam, home1, away1)
    : undefined;

  const hc2 = (home2 !== undefined && away2 !== undefined)
    ? evaluateSingleHandicapOutcome(line2, parlay.match2.handicapPick, parlay.match2.homeTeam, parlay.match2.awayTeam, home2, away2)
    : undefined;

  // Settle each leg against its own frozen pick, even when the cached boolean
  // predates the correction or a single-match report has since been rerated.
  const settleLeg = (leg: ParlayMatchSnapshot, home?: number, away?: number, fallback?: boolean) => {
    const picks = parseEuroPick(leg.euroPick);
    if (home === undefined || away === undefined || !picks.length) return leg.euroHit ?? fallback;
    return picks.includes(home > away ? 'WIN' : home < away ? 'LOSS' : 'DRAW');
  };
  const euroHit1 = settleLeg(parlay.match1, home1, away1, rev1?.outcomeEvaluation?.euroHit);
  const euroHit2 = settleLeg(parlay.match2, home2, away2, rev2?.outcomeEvaluation?.euroHit);

  const m1: ParlayMatchSnapshot = {
    ...parlay.match1,
    actualScore: finalScore1,
    finalScore: finalScore1,
    actualHomeScore: home1,
    actualAwayScore: away1,
    stars: parlay.match1.stars || parlay.match1.starRating || 4,
    starRating: parlay.match1.starRating || parlay.match1.stars || 4,
    identifiedModel: parlay.match1.identifiedModel || rev1?.ruleCategory || '',
    modelTitle: parlay.match1.modelTitle || rev1?.priorReport?.modelTitle || '稳胆',
    handicapLine: line1,
    isFinished: Boolean(finalScore1),
    euroHit: euroHit1,
    handicapHit: hc1 ? hc1.hit : (rev1?.outcomeEvaluation?.handicapHit !== undefined ? rev1.outcomeEvaluation.handicapHit : parlay.match1.handicapHit),
    handicapDetail: hc1 ? hc1.detail : (rev1?.outcomeEvaluation?.handicapDetail || parlay.match1.handicapDetail),
    handicapDetailLabel: hc1 ? hc1.detailLabel : (rev1?.outcomeEvaluation?.handicapDetailLabel || parlay.match1.handicapDetailLabel),
    euroOddsSnapshot: parlay.match1.euroOddsSnapshot || (rev1?.matchData?.euroOdds ? { ...rev1.matchData.euroOdds } : undefined),
    asianHandicapSnapshot: parlay.match1.asianHandicapSnapshot || (rev1?.matchData?.asianHandicap ? { ...rev1.matchData.asianHandicap } : undefined),
    overUnderSnapshot: parlay.match1.overUnderSnapshot || (rev1?.matchData?.overUnder ? { ...rev1.matchData.overUnder } : undefined),
  };

  const m2: ParlayMatchSnapshot = {
    ...parlay.match2,
    actualScore: finalScore2,
    finalScore: finalScore2,
    actualHomeScore: home2,
    actualAwayScore: away2,
    stars: parlay.match2.stars || parlay.match2.starRating || 4,
    starRating: parlay.match2.starRating || parlay.match2.stars || 4,
    identifiedModel: parlay.match2.identifiedModel || rev2?.ruleCategory || '',
    modelTitle: parlay.match2.modelTitle || rev2?.priorReport?.modelTitle || '稳胆',
    handicapLine: line2,
    isFinished: Boolean(finalScore2),
    euroHit: euroHit2,
    handicapHit: hc2 ? hc2.hit : (rev2?.outcomeEvaluation?.handicapHit !== undefined ? rev2.outcomeEvaluation.handicapHit : parlay.match2.handicapHit),
    handicapDetail: hc2 ? hc2.detail : (rev2?.outcomeEvaluation?.handicapDetail || parlay.match2.handicapDetail),
    handicapDetailLabel: hc2 ? hc2.detailLabel : (rev2?.outcomeEvaluation?.handicapDetailLabel || parlay.match2.handicapDetailLabel),
    euroOddsSnapshot: parlay.match2.euroOddsSnapshot || (rev2?.matchData?.euroOdds ? { ...rev2.matchData.euroOdds } : undefined),
    asianHandicapSnapshot: parlay.match2.asianHandicapSnapshot || (rev2?.matchData?.asianHandicap ? { ...rev2.matchData.asianHandicap } : undefined),
    overUnderSnapshot: parlay.match2.overUnderSnapshot || (rev2?.matchData?.overUnder ? { ...rev2.matchData.overUnder } : undefined),
  };

  const isSettled = Boolean(m1.isFinished && m2.isFinished);
  const parlayEuroHit = Boolean(m1.euroHit && m2.euroHit);
  const parlayHandicapHit = Boolean(m1.handicapHit && m2.handicapHit);
  const parlayGrandSlam = Boolean(parlayEuroHit && parlayHandicapHit);

  let parlayStatus: ParlayReviewRecord['parlayStatus'] = 'PENDING';
  let settlementStatus: NonNullable<ParlayReviewRecord['settlementStatus']> = 'PENDING';
  let statusLabel = '【⏳ 待完赛】';
  let brokenSide: NonNullable<ParlayReviewRecord['brokenSide']> = 'NONE';

  if (isSettled) {
    if (parlayGrandSlam) {
      parlayStatus = 'FULL_HIT';
      settlementStatus = 'SETTLED_ALL_HIT';
      statusLabel = '【👑 双胆大满贯全红】';
    } else if (parlayEuroHit) {
      parlayStatus = 'EURO_HIT';
      settlementStatus = 'SETTLED_PARLAY_HIT';
      statusLabel = '【🎉 胜平负 2串1 全红收米】';
    } else if (parlayHandicapHit) {
      parlayStatus = 'HANDICAP_HIT';
      settlementStatus = 'SETTLED_HANDICAP_HIT';
      statusLabel = '【🎉 让球 2串1 红单赢盘】';
    } else if (
      (m1.handicapDetail === 'PUSH' || m2.handicapDetail === 'PUSH') &&
      (m1.handicapHit || m2.handicapHit)
    ) {
      parlayStatus = 'PUSH_COVER';
      settlementStatus = 'SETTLED_HEDGE_PUSH';
      statusLabel = '【🛡️ 对冲保本】';
    } else {
      parlayStatus = 'BROKEN';
      settlementStatus = 'SETTLED_BROKEN';
      const m1Failed = !m1.euroHit && !m1.handicapHit;
      const m2Failed = !m2.euroHit && !m2.handicapHit;
      if (m1Failed && m2Failed) {
        brokenSide = 'BOTH';
        statusLabel = '【❌ 双胆皆黑断单】';
      } else if (m1Failed) {
        brokenSide = 'MATCH1';
        statusLabel = `【⚠️ 1红1黑断单 · 稳胆1(${m1.homeTeam})爆冷】`;
      } else {
        brokenSide = 'MATCH2';
        statusLabel = `【⚠️ 1红1黑断单 · 稳胆2(${m2.homeTeam})爆冷】`;
      }
    }
  }

  let summaryNote = parlay.summaryNote || '';
  if (isSettled) {
    if (parlayGrandSlam) {
      summaryNote = `两场核心稳胆双维度 100% 穿透打出！胜平负与亚指让球双双收米，顶级大满贯红单！`;
    } else if (parlayEuroHit) {
      summaryNote = `胜平负双选/独赢稳健打出，成功收下 2串1 奖金！亚指端存在部分卡盘或赢半。`;
    } else if (parlayHandicapHit) {
      summaryNote = `亚指让球双胆全赢盘打出！让球门槛与受让安全垫完全发挥作用。`;
    } else if (parlayStatus === 'PUSH_COVER') {
      summaryNote = `出现走盘对冲，成功保住实战本金。`;
    } else {
      summaryNote = `其中一场遭遇冷门打破平衡，已自动提取对应抗冷教训沉淀至经验法则库。`;
    }

    if (m1.handicapDetail === 'LOSE_HALF') {
      summaryNote += ` (注：稳胆1【${m1.homeTeam}】战平卡在平半盘口，判定为【输半】)`;
    }
    if (m2.handicapDetail === 'LOSE_HALF') {
      summaryNote += ` (注：稳胆2【${m2.homeTeam}】战平卡在平半盘口，判定为【输半】)`;
    }
  }

  return {
    ...parlay,
    match1: m1,
    match2: m2,
    isSettled,
    parlayEuroHit,
    euroParlayHit: parlayEuroHit,
    parlayHandicapHit,
    handicapParlayHit: parlayHandicapHit,
    parlayGrandSlam,
    isGrandSlam: parlayGrandSlam,
    parlayStatus,
    settlementStatus,
    statusLabel,
    settlementBadge: statusLabel,
    summaryNote,
    settlementDescription: summaryNote,
    brokenSide,
  };
}

/**
 * Retrieve saved 2-Pick Parlay review records, synchronized with latest individual match scores
 * Sorted descending by salesDate and createdAt (最新日期在前)
 */
export function getParlayReviews(): ParlayReviewRecord[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(PARLAY_REVIEWS_STORAGE_KEY);
    const stored: ParlayReviewRecord[] = raw ? JSON.parse(raw) : [];
    const allMatchReviews = getPostMatchReviews();

    const settledList = stored.map((p) => evaluateParlaySettlement(p, allMatchReviews));
    // 严格按销售日倒序与创建时间倒序排序 (最新在前)
    settledList.sort((a, b) => {
      const dateA = a.salesDate || '';
      const dateB = b.salesDate || '';
      const dateCmp = dateB.localeCompare(dateA);
      if (dateCmp !== 0) return dateCmp;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    return settledList;
  } catch (e) {
    console.error('Error loading parlay reviews:', e);
    return [];
  }
}

/**
 * Save a 2-Pick Parlay review record (Idempotent: updates existing with same ID or salesDate)
 */
export function saveParlayReview(record: ParlayReviewRecord): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const allMatchReviews = getPostMatchReviews();
    const evaluated = evaluateParlaySettlement(record, allMatchReviews);
    const existingList = getParlayReviews();

    const idx = existingList.findIndex(
      (p) => p.id === evaluated.id || (p.salesDate && p.salesDate === evaluated.salesDate)
    );

    if (idx >= 0) {
      existingList[idx] = evaluated;
    } else {
      existingList.unshift(evaluated);
    }

    localStorage.setItem(PARLAY_REVIEWS_STORAGE_KEY, JSON.stringify(existingList));
  } catch (e) {
    console.error('Error saving parlay review:', e);
  }
}

/**
 * Delete a single parlay review by ID
 */
export function deleteParlayReview(id: string): ParlayReviewRecord[] {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
    const updated = getParlayReviews().filter((p) => p.id !== id);
    localStorage.setItem(PARLAY_REVIEWS_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Error deleting parlay review:', e);
    return [];
  }
}

/**
 * Clear all parlay review battle reports
 */
export function clearAllParlayReviews(): void {
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(PARLAY_REVIEWS_STORAGE_KEY);
    }
  } catch (e) {
    console.error('Error clearing parlay reviews:', e);
  }
}

/**
 * Automatically synthesizes daily 2-in-1 parlay reviews from historical match reviews
 * Captures historical market odds snapshots and sorts descending by salesDate & createdAt
 */
export function autoExtractDailyParlayReviews(matchReviews: PostMatchReview[]): ParlayReviewRecord[] {
  if (!matchReviews || matchReviews.length < 2) return [];

  // Group match reviews by sales date
  const groups = new Map<string, PostMatchReview[]>();
  for (const rev of matchReviews) {
    // Older archived predictions predate v4 and keep their original selection criteria.
    if (rev.priorReport?.decision?.coreEligible === false) continue;
    const sDate = rev.salesDate || '常规归档';
    if (!groups.has(sDate)) {
      groups.set(sDate, []);
    }
    groups.get(sDate)!.push(rev);
  }

  const generatedParlays: ParlayReviewRecord[] = [];

  for (const [dateKey, list] of groups.entries()) {
    if (list.length < 2) continue;

    // Rank candidates by stars, model certainty, and model verified
    const sorted = [...list].sort((a, b) => {
      const starA = a.priorReport?.decision?.starRating || 3;
      const starB = b.priorReport?.decision?.starRating || 3;
      if (starB !== starA) return starB - starA;

      const modelRank = (m?: string) => {
        if (m === 'POSITIVE_CONTROL') return 4;
        if (m === 'LOW_DRAW_DEFENSE') return 3;
        if (m === 'HIGH_INTEREST_TRAP') return 2;
        if (m === 'SHALLOW_FULL_WATER') return 1;
        return 0;
      };

      const mDiff = modelRank(b.priorReport?.identifiedModel) - modelRank(a.priorReport?.identifiedModel);
      if (mDiff !== 0) return mDiff;

      return (a.kickoffTime || '').localeCompare(b.kickoffTime || '');
    });

    const m1 = sorted[0];
    const m2 = sorted[1];

    const snap1: ParlayMatchSnapshot = {
      homeTeam: m1.matchData.matchInfo.homeTeam,
      awayTeam: m1.matchData.matchInfo.awayTeam,
      league: m1.matchData.matchInfo.league,
      matchTime: m1.kickoffTime || m1.matchData.matchInfo.matchTime || '',
      modelTitle: m1.priorReport.modelTitle,
      identifiedModel: m1.priorReport.identifiedModel,
      starRating: m1.priorReport.decision.starRating,
      stars: m1.priorReport.decision.starRating,
      euroPick: m1.priorReport.decision.euroPick,
      handicapPick: m1.priorReport.decision.handicapPick,
      handicapLine: m1.matchData.asianHandicap.lateHandicap || m1.matchData.asianHandicap.earlyHandicap || '平手',
      actualScore: m1.actualScore,
      finalScore: m1.actualScore,
      actualHomeScore: m1.actualHomeScore,
      actualAwayScore: m1.actualAwayScore,
      isFinished: Boolean(m1.actualScore),
      euroHit: m1.outcomeEvaluation.euroHit,
      handicapHit: m1.outcomeEvaluation.handicapHit,
      handicapDetail: m1.outcomeEvaluation.handicapDetail,
      handicapDetailLabel: m1.outcomeEvaluation.handicapDetailLabel,
      euroOddsSnapshot: m1.matchData.euroOdds ? { ...m1.matchData.euroOdds } : undefined,
      asianHandicapSnapshot: m1.matchData.asianHandicap ? { ...m1.matchData.asianHandicap } : undefined,
      overUnderSnapshot: m1.matchData.overUnder ? { ...m1.matchData.overUnder } : undefined,
    };

    const snap2: ParlayMatchSnapshot = {
      homeTeam: m2.matchData.matchInfo.homeTeam,
      awayTeam: m2.matchData.matchInfo.awayTeam,
      league: m2.matchData.matchInfo.league,
      matchTime: m2.kickoffTime || m2.matchData.matchInfo.matchTime || '',
      modelTitle: m2.priorReport.modelTitle,
      identifiedModel: m2.priorReport.identifiedModel,
      starRating: m2.priorReport.decision.starRating,
      stars: m2.priorReport.decision.starRating,
      euroPick: m2.priorReport.decision.euroPick,
      handicapPick: m2.priorReport.decision.handicapPick,
      handicapLine: m2.matchData.asianHandicap.lateHandicap || m2.matchData.asianHandicap.earlyHandicap || '平手',
      actualScore: m2.actualScore,
      finalScore: m2.actualScore,
      actualHomeScore: m2.actualHomeScore,
      actualAwayScore: m2.actualAwayScore,
      isFinished: Boolean(m2.actualScore),
      euroHit: m2.outcomeEvaluation.euroHit,
      handicapHit: m2.outcomeEvaluation.handicapHit,
      handicapDetail: m2.outcomeEvaluation.handicapDetail,
      handicapDetailLabel: m2.outcomeEvaluation.handicapDetailLabel,
      euroOddsSnapshot: m2.matchData.euroOdds ? { ...m2.matchData.euroOdds } : undefined,
      asianHandicapSnapshot: m2.matchData.asianHandicap ? { ...m2.matchData.asianHandicap } : undefined,
      overUnderSnapshot: m2.matchData.overUnder ? { ...m2.matchData.overUnder } : undefined,
    };

    const parlayRecord: ParlayReviewRecord = {
      id: `parlay-${dateKey}`,
      salesDate: dateKey,
      salesDateLabel: m1.salesDateLabel || `${dateKey} 销售日`,
      title: '《财富经》核心稳胆 · 2串1 实战方案',
      comboText: `【2串1实战方案】${snap1.homeTeam} (${snap1.handicapPick} / ${snap1.euroPick}) × ${snap2.homeTeam} (${snap2.handicapPick} / ${snap2.euroPick})`,
      createdAt: m1.reviewTimestamp || Date.now(),
      match1: snap1,
      match2: snap2,
      isSettled: Boolean(snap1.actualScore && snap2.actualScore),
      parlayEuroHit: Boolean(snap1.euroHit && snap2.euroHit),
      parlayHandicapHit: Boolean(snap1.handicapHit && snap2.handicapHit),
      parlayGrandSlam: Boolean(snap1.euroHit && snap2.euroHit && snap1.handicapHit && snap2.handicapHit),
      parlayStatus: 'PENDING',
      statusLabel: '',
      summaryNote: '',
    };

    generatedParlays.push(evaluateParlaySettlement(parlayRecord, matchReviews));
  }

  // 严格倒序排序：最新销售日与最新创建时间优先
  generatedParlays.sort((a, b) => {
    const dateA = a.salesDate || '';
    const dateB = b.salesDate || '';
    const dateCmp = dateB.localeCompare(dateA);
    if (dateCmp !== 0) return dateCmp;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  return generatedParlays;
}

/**
 * Rigorously evaluates whether the Euro outcome (胜平负) was correctly predicted
 * Supports all single and dual-protection expressions (e.g. 稳胆, 让胜/让负受让不败, 胆平, 双平设防, 主客不败)
 */
export function evaluateEuroHit(
  predictedEuro: string,
  actualEuroOutcome: 'WIN' | 'DRAW' | 'LOSS'
): boolean {
  return parseEuroPick(predictedEuro).includes(actualEuroOutcome);
}

/**
 * Rigorously evaluates whether Over/Under prediction hit
 */
export function evaluateOverUnderHit(
  lateLine: string,
  predictedOU: string,
  actualHomeScore: number,
  actualAwayScore: number
): boolean {
  const ouLineNum = parseOverUnderValue(lateLine);
  const totalGoals = (actualHomeScore || 0) + (actualAwayScore || 0);
  const pred = (predictedOU || '').trim();

  // If push on whole lines (e.g. 2.0 or 3.0), principal is safe -> positive cover
  if (Math.abs(totalGoals - ouLineNum) < 0.001) {
    return true;
  }

  const isActualOver = totalGoals > ouLineNum;
  if (pred.includes('大球') && isActualOver) return true;
  if (pred.includes('小球') && !isActualOver) return true;
  return false;
}

export interface HandicapOutcomeDetail {
  hit: boolean;
  detail: 'WIN' | 'WIN_HALF' | 'PUSH' | 'LOSE_HALF' | 'LOSE';
  detailLabel: '赢盘' | '赢半' | '走盘' | '输半' | '输盘';
  effectiveDiff: number;
  pickedSide: 'HOME' | 'AWAY';
  handicapLineApplied: number;
}

/**
 * Pure evaluation function for Asian Handicap outcome:
 * Supports arbitrary prediction strings, team names, lines, and actual scores.
 * Accurately distinguishes:
 * - 赢全 (WIN): effDiff > 0.25 -> hit = true
 * - 赢半 (WIN_HALF): effDiff === +0.25 -> hit = true (赢得一半水位分红)
 * - 走盘 (PUSH): effDiff === 0 -> hit = true (走水退本保本)
 * - 输半 (LOSE_HALF): effDiff === -0.25 -> hit = false (输掉一半本金，如名古屋鲸平手/半球战平1-1，判定为输半)
 * - 输全 (LOSE): effDiff < -0.25 -> hit = false
 */
export function evaluateSingleHandicapOutcome(
  handicapLineStr: string,
  predictedHandicapStr: string,
  homeTeam: string,
  awayTeam: string,
  actualHomeScore: number,
  actualAwayScore: number
): HandicapOutcomeDetail {
  const normHome = (homeTeam || '').replace(/\s+/g, '').toLowerCase();
  const normAway = (awayTeam || '').replace(/\s+/g, '').toLowerCase();
  const normPred = (predictedHandicapStr || '').replace(/\s+/g, '').toLowerCase();
  const parsedHandicapVal = parseHandicapValue(handicapLineStr || '0');

  let pickedSide: 'HOME' | 'AWAY' = 'HOME';
  const mentionsHome = Boolean(normHome && normPred.includes(normHome));
  const mentionsAway = Boolean(normAway && normPred.includes(normAway));

  if (mentionsHome && !mentionsAway) {
    pickedSide = 'HOME';
  } else if (mentionsAway && !mentionsHome) {
    pickedSide = 'AWAY';
  } else if (normPred.includes('客队') || normPred.includes('客让')) {
    pickedSide = 'AWAY';
  } else if (normPred.includes('主队') || normPred.includes('主让')) {
    pickedSide = 'HOME';
  } else {
    // If prediction mentions 上盘 vs 下盘
    const isAwayGiving =
      parsedHandicapVal > 0 ||
      (handicapLineStr || '').includes('客让') ||
      (handicapLineStr || '').includes('受让') ||
      (handicapLineStr || '').includes('受');
    const homeIsFav = !isAwayGiving;

    if (normPred.includes('上盘')) {
      pickedSide = homeIsFav ? 'HOME' : 'AWAY';
    } else if (normPred.includes('下盘')) {
      pickedSide = homeIsFav ? 'AWAY' : 'HOME';
    } else if (normPred.includes('客')) {
      pickedSide = 'AWAY';
    } else {
      pickedSide = 'HOME';
    }
  }

  let H = 0;
  // If the match's official handicap line is parsed (e.g. '受球半/两球' -> +1.75, '平手/半球' -> -0.25),
  // use this official market line to prevent any rounded prediction text from altering the true line.
  if (parsedHandicapVal !== 0) {
    const homeH = parsedHandicapVal;
    H = pickedSide === 'HOME' ? homeH : -homeH;
  } else {
    // If line is scratch/even or unparsed, check explicit signed handicap from prediction text
    const explicitSigned = (predictedHandicapStr || '').match(/\(\s*([+-]\d+(?:\.\d+)?)/);
    if (explicitSigned) {
      H = parseFloat(explicitSigned[1]) || 0;
    } else {
      H = 0;
    }
  }

  const goalsPicked = pickedSide === 'HOME' ? actualHomeScore : actualAwayScore;
  const goalsOpponent = pickedSide === 'HOME' ? actualAwayScore : actualHomeScore;
  const netGoals = goalsPicked - goalsOpponent;
  const effDiff = netGoals + H;

  let detail: 'WIN' | 'WIN_HALF' | 'PUSH' | 'LOSE_HALF' | 'LOSE' = 'LOSE';
  let detailLabel: '赢盘' | '赢半' | '走盘' | '输半' | '输盘' = '输盘';
  let hit = false;

  if (effDiff > 0.25 + 0.001) {
    detail = 'WIN';
    detailLabel = '赢盘';
    hit = true;
  } else if (Math.abs(effDiff - 0.25) < 0.001) {
    detail = 'WIN_HALF';
    detailLabel = '赢半';
    hit = true;
  } else if (Math.abs(effDiff) < 0.001) {
    detail = 'PUSH';
    detailLabel = '走盘';
    hit = true;
  } else if (Math.abs(effDiff - (-0.25)) < 0.001) {
    detail = 'LOSE_HALF';
    detailLabel = '输半';
    hit = false;
  } else {
    detail = 'LOSE';
    detailLabel = '输盘';
    hit = false;
  }

  return { hit, detail, detailLabel, effectiveDiff: effDiff, pickedSide, handicapLineApplied: H };
}

/**
 * Rigorously evaluates Asian Handicap outcomes for FullMatchData
 */
export function evaluateHandicapDetailedOutcome(
  matchData: FullMatchData,
  priorReport: AnalysisReportResult,
  actualHomeScore: number,
  actualAwayScore: number
): HandicapOutcomeDetail {
  const homeTeam = matchData.matchInfo?.homeTeam || '';
  const awayTeam = matchData.matchInfo?.awayTeam || '';
  const predictedHandicap = (priorReport.decision?.handicapPick || '').trim();
  const lateHandicapStr = (matchData.asianHandicap?.lateHandicap || '').trim();

  return evaluateSingleHandicapOutcome(
    lateHandicapStr,
    predictedHandicap,
    homeTeam,
    awayTeam,
    actualHomeScore,
    actualAwayScore
  );
}

/**
 * Rigorously evaluates whether the Asian Handicap prediction hit (won/covered the spread, including win half & push).
 */
export function evaluateHandicapHit(
  matchData: FullMatchData,
  priorReport: AnalysisReportResult,
  actualHomeScore: number,
  actualAwayScore: number
): boolean {
  return evaluateHandicapDetailedOutcome(matchData, priorReport, actualHomeScore, actualAwayScore).hit;
}

// Quarter lines settle each side independently of the direction selected in the prediction.
export function boundaryHandicapLesson(data: FullMatchData, home: number, away: number) {
  const line = data.asianHandicap?.lateHandicap;
  const h = parseHandicapValue(line || '', NaN);
  if (!Number.isFinite(h)) return null;
  const { league, homeTeam, awayTeam } = data.matchInfo;
  const prefix = `${league}【${homeTeam} vs ${awayTeam}】`;
  const diff = home - away;
  const margin = diff === 0 ? '双方战平' : `【${diff > 0 ? homeTeam : awayTeam}】净胜 ${Math.abs(diff)} 球`;
  const result = `完场 ${home}-${away}，${margin}。`;
  if (h === 0) {
    return { title: prefix + '平手盘结算', content: result + (diff === 0 ? '平手盘双方走盘。' : '平手盘胜方赢盘，负方输盘。') };
  }
  const upper = evaluateSingleHandicapOutcome(line, '上盘', '', '', home, away);
  const lower = evaluateSingleHandicapOutcome(line, '下盘', '', '', home, away);
  const givingWon = (h < 0 ? diff : -diff) > 0;
  if (upper.detail !== 'WIN_HALF' && upper.detail !== 'LOSE_HALF' && !(givingWon && upper.detail === 'LOSE')) return null;
  return {
    title: prefix + (givingWon ? '让步方赢球，上盘' : '上盘') + upper.detailLabel,
    content: result + `让步方【${h < 0 ? homeTeam : awayTeam}】让 ${Math.abs(h)} 球，上盘${upper.detailLabel}，受让方【${h < 0 ? awayTeam : homeTeam}】${lower.detailLabel}。`,
  };
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
  fallbackTimestamp?: number,
  existingReview?: PostMatchReview,
  predictionSnapshot?: PredictionSnapshot
): PostMatchReview {
  if (existingReview?.predictionSnapshot) {
    matchData = existingReview.matchData;
    priorReport = existingReview.priorReport;
    predictionSnapshot = existingReview.predictionSnapshot;
  }
  const { homeTeam, awayTeam, league } = matchData.matchInfo;
  const actualScoreStr = `${actualHomeScore}-${actualAwayScore}`;
  const goalDiff = actualHomeScore - actualAwayScore;

  // 1. Euro Pick Evaluation (胜平负 / 让胜让负双重保险)
  const actualEuroOutcome = goalDiff > 0 ? 'WIN' : goalDiff === 0 ? 'DRAW' : 'LOSS';
  const euroHit = decisionOutcomes(priorReport.decision).includes(actualEuroOutcome);

  // 2. Handicap Evaluation (亚指让球赢盘 / 赢半 / 走盘对冲保本)
  const handicapOutcome = evaluateHandicapDetailedOutcome(
    matchData,
    priorReport,
    actualHomeScore,
    actualAwayScore
  );
  const handicapHit = handicapOutcome.hit;

  // 3. Over/Under Evaluation (大小球测谎联动)
  const overUnderHit = evaluateOverUnderHit(
    matchData.overUnder.lateLine,
    priorReport.decision.overUnderPick || '',
    actualHomeScore,
    actualAwayScore
  );

  // 4. Score Match (波胆精准命中)
  const scoreHit = priorReport.decision.predictedScores.includes(actualScoreStr);

  // 5. Model Verification (核心定性模型双核印证)
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

    const boundary = boundaryHandicapLesson(matchData, actualHomeScore, actualAwayScore);
    if (boundary) {
      evolvedRuleTitle = boundary.title;
      evolvedRuleContent = boundary.content;
    } else if (isFavoriteBlowout) {
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
      evolvedRuleTitle = `${league}【${homeTeam} vs ${awayTeam}】让球结算复核`;
      evolvedRuleContent = `完场 ${actualScoreStr}，净胜球差 ${Math.abs(goalDiff)} 球，赛前让球首选结算为${handicapOutcome.detailLabel}。`;
    }
  }

  const safeHome = (homeTeam || 'Home').replace(/\s+/g, '_');
  const safeAway = (awayTeam || 'Away').replace(/\s+/g, '_');

  const effectiveTimestamp = fallbackTimestamp || Date.now();
  const kickoffTime = matchData.matchInfo?.matchTime || '临场';
  const salesInfo = calculateSalesDate(kickoffTime, effectiveTimestamp, preferredSalesDate);

  const review: PostMatchReview = {
    id: existingReview?.id || `rev-${safeHome}-${safeAway}-${actualScoreStr}`,
    matchData,
    priorReport,
    predictionSnapshot,
    actualScore: actualScoreStr,
    actualHomeScore,
    actualAwayScore,
    matchIncidents,
    reviewTimestamp: existingReview?.reviewTimestamp || effectiveTimestamp,
    resultRecordedAt: Date.now(),
    salesDate: existingReview?.salesDateOverride || salesInfo.salesDate,
    salesDateLabel: salesInfo.salesDateLabel,
    salesCycleText: salesInfo.salesCycleText,
    kickoffTime: salesInfo.kickoffTimeFormatted,
    salesDateOverride: existingReview?.salesDateOverride,
    outcomeEvaluation: {
      euroHit,
      handicapHit,
      overUnderHit,
      scoreHit,
      modelVerified,
      summaryNote,
      handicapDetail: handicapOutcome.detail,
      handicapDetailLabel: handicapOutcome.detailLabel,
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

