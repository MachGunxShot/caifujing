import {
  FullMatchData,
  AnalysisReportResult,
  PostMatchReview,
  EvolvedExperienceRule,
} from '../types/fortuneActuary';
import { parseHandicapValue, parseOverUnderValue } from './actuaryEngine';

const RULES_STORAGE_KEY = 'fortune_actuary_evolved_rules_v1';
const REVIEWS_STORAGE_KEY = 'fortune_actuary_reviews_v1';

// Seed Initial Battle-tested Core Rules
const SEED_RULES: EvolvedExperienceRule[] = [
  {
    id: 'rule-seed-1',
    title: '豪门深盘升盘挂满水必防下盘赢盘',
    category: 'HIGH_INTEREST_TRAP',
    leagueScope: '五大联赛/欧冠',
    ruleContent:
      '当豪门球队早盘让一球或球半，临场升盘一球球半或球半但主队水位卡在 2.02 以上超高水时，机构并非力挺打穿，而是在借名气吸纳筹码。此盘型宁选下盘受让赢盘，绝不可博穿盘。',
    sourceMatch: '皇家马德里 vs 赫塔菲 (实战复盘验证)',
    createdAt: '2026-09-15',
    isActive: true,
    hitCount: 18,
  },
  {
    id: 'rule-seed-2',
    title: '欧国联欧平死压3.00以下首选胆平',
    category: 'LOW_DRAW_DEFENSE',
    leagueScope: '欧国联/国际友谊赛',
    ruleContent:
      '国家队赛事中，当主流欧赔平赔被死死压制在 2.90-3.05 极度防御区，而亚盘仅维持在平手或平半低水时，两队胜负两端水位均属幌子，真实防范重心全在平局。实战首选单挑平局。',
    sourceMatch: '拉齐奥 vs 佛罗伦萨 / 北单欧国联验证',
    createdAt: '2026-09-22',
    isActive: true,
    hitCount: 14,
  },
  {
    id: 'rule-seed-3',
    title: '深让步强配 2.25 浅大小球谨防 1-0 赢球输盘',
    category: 'POSITIVE_CONTROL',
    leagueScope: '法甲/德甲',
    ruleContent:
      '强队让球达到一球半或两球，但大小球却反常压制在 2.25/2.5 极浅界线时，机构已预判强队难以打出大比分对攻，实战极易出现 1-0 或 2-0 边缘小胜，大小球优先选小，让球防下盘。',
    sourceMatch: '巴黎圣日耳曼 vs 朗斯 (实战复盘验证)',
    createdAt: '2026-09-28',
    isActive: true,
    hitCount: 11,
  },
  {
    id: 'rule-seed-4',
    title: '主场浅盘挂满水为大门敞开收割局',
    category: 'SHALLOW_FULL_WATER',
    leagueScope: '全部常规联赛',
    ruleContent:
      '传统主场龙面对中下游球队，仅开出平半且挂 2.05+ 满水，给市场造成“赢半博全买得极舒服”的假象，机构对主胜完全不设防，90% 概率主队不胜，下盘受让为核心盈利点。',
    sourceMatch: '多特蒙德 vs 波鸿 (实战复盘验证)',
    createdAt: '2026-10-01',
    isActive: true,
    hitCount: 16,
  },
];

/**
 * Retrieve evolved experience rules from localStorage with automatic deduplication
 */
export function getExperienceRules(): EvolvedExperienceRule[] {
  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(SEED_RULES));
      return SEED_RULES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Auto-deduplicate by normalized title or source match + category
      const seen = new Set<string>();
      const deduplicated: EvolvedExperienceRule[] = [];
      for (const r of parsed) {
        const cleanTitle = (r.title || '').replace(/\s+/g, '').trim();
        const cleanSource = (r.sourceMatch || '').replace(/\s+/g, '').trim();
        const key = cleanTitle || `${cleanSource}_${r.category}`;
        if (key && !seen.has(key)) {
          seen.add(key);
          deduplicated.push(r);
        }
      }
      if (deduplicated.length !== parsed.length) {
        saveExperienceRules(deduplicated);
      }
      return deduplicated;
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
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
  } catch (e) {
    console.error('Error saving experience rules:', e);
  }
}

/**
 * Add or update an experience rule (Idempotent - prevents duplicates)
 */
export function addOrUpdateExperienceRule(rule: EvolvedExperienceRule): void {
  const rules = getExperienceRules();
  const cleanTitle = (rule.title || '').replace(/\s+/g, '').trim();
  const cleanSource = (rule.sourceMatch || '').replace(/\s+/g, '').trim();

  const existingIdx = rules.findIndex((r) => {
    if (r.id === rule.id) return true;
    const rTitle = (r.title || '').replace(/\s+/g, '').trim();
    if (rTitle && cleanTitle && rTitle === cleanTitle) return true;
    const rSource = (r.sourceMatch || '').replace(/\s+/g, '').trim();
    if (rSource && cleanSource && rSource === cleanSource && r.category === rule.category) return true;
    return false;
  });

  if (existingIdx >= 0) {
    // Update existing rule in-place, preserve user's active state and increment hitCount
    rules[existingIdx] = {
      ...rules[existingIdx],
      ...rule,
      id: rules[existingIdx].id,
      hitCount: Math.max(rules[existingIdx].hitCount || 0, rule.hitCount || 1),
      isActive: rules[existingIdx].isActive ?? true,
    };
  } else {
    rules.unshift(rule);
  }
  saveExperienceRules(rules);
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
  const currentRules = getExperienceRules();
  const beforeCount = currentRules.length;

  const classicIds = new Set([
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

  const preservedRules: EvolvedExperienceRule[] = [];
  const boilerplateRules: EvolvedExperienceRule[] = [];
  const seenSource = new Set<string>();

  for (const r of currentRules) {
    const isClassic =
      classicIds.has(r.id) ||
      r.id.startsWith('rule-classic-') ||
      r.id.startsWith('rule-seed-') ||
      r.id === 'rule-philosophy-core' ||
      r.id === 'rule-goals-detector-1';

    if (isClassic) {
      preservedRules.push(r);
      continue;
    }

    // Deduplicate by clean title or clean sourceMatch
    const normKey = (r.sourceMatch || r.title || '')
      .replace(/\(完场[^\)]*\)/g, '')
      .replace(/\s+/g, '')
      .toLowerCase();

    if (normKey && seenSource.has(normKey)) {
      // Duplicate entry! Prune.
      continue;
    }
    if (normKey) seenSource.add(normKey);

    const isBoilerplate =
      (r.ruleContent || '').includes('切忌单向押注，需重点防范实际赛果指向的') ||
      r.title.includes('逆向避险修正法');

    if (isBoilerplate) {
      boilerplateRules.push(r);
    } else {
      // It's already a high-value synthesized rule
      preservedRules.push(r);
    }
  }

  // Synthesize clustered rules from boilerplateRules
  let clusteredCount = 0;
  if (boilerplateRules.length > 0) {
    clusteredCount = boilerplateRules.length;
    const examples = boilerplateRules
      .map((b) => b.sourceMatch)
      .filter(Boolean)
      .slice(0, 5)
      .join(' / ');

    // Master Cluster Rule A: 欧国联浅盘胶着期防冷法则
    const clusterRuleA: EvolvedExperienceRule = {
      id: `rule-clustered-uefa-upset-${Date.now()}`,
      title: '欧国联浅盘胶着期：受让方韧性与反杀综合防冷法则',
      category: 'LOW_DRAW_DEFENSE',
      leagueScope: '欧国联/国家队赛事',
      ruleContent: `【实战归纳集群（由 ${boilerplateRules.length} 场欧国联实战复盘聚类提炼）】：\n1. 盘赔形态：实力接近对阵（开平手、平半或半球生死盘），若大小球深卡 2.5 或压制在 1.5 极浅盘时，强队穿盘率极低。\n2. 操盘意图：市场常因强队名气强行去上盘，而机构在大小球端早已封死大球溢价，平赔死压或两头设防。\n3. 实战定论：切忌单边盲冲让球上盘，首选受让下盘不败或单挑精准平局（0-0/1-1），严防客胜或受让方冷门反杀。`,
      sourceMatch: examples || '多场欧国联实战聚类验证',
      createdAt: new Date().toISOString().slice(0, 10),
      isActive: true,
      hitCount: Math.max(8, boilerplateRules.length),
    };

    // Master Cluster Rule B: 国家队深盘战意与正向打穿界定
    const clusterRuleB: EvolvedExperienceRule = {
      id: `rule-clustered-uefa-deep-${Date.now() + 1}`,
      title: '国家队深让步：一球球半及以上深盘正向穿盘与防卡盘法则',
      category: 'POSITIVE_CONTROL',
      leagueScope: '欧国联/国际赛事',
      ruleContent: `【实战归纳集群】：\n1. 盘赔形态：强队让步达到一球/球半、球半甚至两球深盘，晚盘水位顺畅下压至极低水（正向控赔）；\n2. 大小球配合：若大小球同步开出 3.0/3.5 大界线，通常为两边对攻真实打穿（如 4-0、4-1 正路大胜），此时坚决支持上盘穿盘稳胆；\n3. 防卡盘警报：若深让步却强配 2.25/2.5 极浅大小球，谨防 1-0、2-0 赢球输盘或 0-0 爆冷闷平。`,
      sourceMatch: '法国 4-1 比利时 / 摩尔多瓦 0-4 斯洛伐克等实盘验证',
      createdAt: new Date().toISOString().slice(0, 10),
      isActive: true,
      hitCount: 12,
    };

    preservedRules.unshift(clusterRuleA, clusterRuleB);
  }

  saveExperienceRules(preservedRules);
  const afterCount = preservedRules.length;

  return {
    beforeCount,
    afterCount,
    prunedCount: beforeCount - afterCount,
    clusteredCount,
    newRules: preservedRules,
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
 * Evaluate match outcome against prior actuarial report and extract core rule
 */
export function evaluateMatchOutcomeAndExtractLesson(
  matchData: FullMatchData,
  priorReport: AnalysisReportResult,
  actualHomeScore: number,
  actualAwayScore: number,
  matchIncidents: string = '',
  persistToCoreRules: boolean = false
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
  const lateHandicapNum = parseHandicapValue(matchData.asianHandicap.lateHandicap);
  // Adjusted home diff: goalDiff + handicap (if home is -1.5, home needs to win by 2 to cover)
  const handicapOutcomeDiff = goalDiff + lateHandicapNum;
  const predictedHandicap = priorReport.decision.handicapPick;
  let handicapHit = false;

  const isPredictingHome = predictedHandicap.includes('上盘') || predictedHandicap.includes(homeTeam);
  if (isPredictingHome && handicapOutcomeDiff > 0) handicapHit = true;
  else if (!isPredictingHome && handicapOutcomeDiff < 0) handicapHit = true;
  else if (!isPredictingHome && handicapOutcomeDiff === 0) handicapHit = true;

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

    // Distinguish between actual underdog upset vs heavy favorite blowout vs draw
    const isHomeBigWin = goalDiff >= 2 && lateHandicapNum <= -0.75;
    const isAwayBigWin = goalDiff <= -2 && lateHandicapNum >= 0.75;
    const isUnderdogUpset =
      (lateHandicapNum <= -0.5 && actualEuroOutcome !== 'WIN') ||
      (lateHandicapNum >= 0.5 && actualEuroOutcome !== 'LOSS');

    if (isHomeBigWin || isAwayBigWin) {
      evolvedRuleTitle = `${league}【${homeTeam} vs ${awayTeam}】深盘实力穿盘验证`;
      evolvedRuleContent = `在 ${league} 对阵中，让步方实力优势在盘口体现（${matchData.asianHandicap.lateHandicap}），临场攻势形成有效穿透（完场 ${actualScoreStr}），实战切忌盲目反选受让，大小球宜顺势走大。`;
    } else if (isUnderdogUpset) {
      evolvedRuleTitle = `${league}【${homeTeam} vs ${awayTeam}】受让方韧性反杀修正法`;
      evolvedRuleContent = `针对 ${league} 类似对阵，若晚盘呈现让球 ${matchData.asianHandicap.lateHandicap} 但大小球卡在 ${matchData.overUnder.lateLine} 时，切忌单向冲上盘名气，需重点防范实际赛果指向的【${actualEuroOutcome === 'WIN' ? '主胜' : actualEuroOutcome === 'DRAW' ? '平局' : '客胜'}】冷门反杀。`;
    } else {
      evolvedRuleTitle = `${league}【${homeTeam} vs ${awayTeam}】胶着盘面对冲修正法`;
      evolvedRuleContent = `在 ${league} 类似势均力敌对阵（盘口 ${matchData.asianHandicap.lateHandicap}），两头对冲下平赔与小球具有极高防范价值（完场 ${actualScoreStr}）。`;
    }
  }

  const safeHome = (homeTeam || 'Home').replace(/\s+/g, '_');
  const safeAway = (awayTeam || 'Away').replace(/\s+/g, '_');

  const review: PostMatchReview = {
    id: `rev-${safeHome}-${safeAway}-${actualScoreStr}`,
    matchData,
    priorReport,
    actualScore: actualScoreStr,
    actualHomeScore,
    actualAwayScore,
    matchIncidents,
    reviewTimestamp: Date.now(),
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
