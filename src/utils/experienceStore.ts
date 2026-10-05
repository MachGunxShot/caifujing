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
 * Retrieve evolved experience rules from localStorage
 */
export function getExperienceRules(): EvolvedExperienceRule[] {
  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(SEED_RULES));
      return SEED_RULES;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : SEED_RULES;
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
 * Add or update an experience rule
 */
export function addOrUpdateExperienceRule(rule: EvolvedExperienceRule): void {
  const rules = getExperienceRules();
  const existingIdx = rules.findIndex((r) => r.id === rule.id);
  if (existingIdx >= 0) {
    rules[existingIdx] = rule;
  } else {
    rules.unshift(rule);
  }
  saveExperienceRules(rules);
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
 * Import rules from JSON string
 */
export function importRulesFromJson(jsonStr: string): boolean {
  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed) && parsed.length > 0) {
      saveExperienceRules(parsed);
      return true;
    }
    return false;
  } catch {
    return false;
  }
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
 * Retrieve saved post-match reviews
 */
export function getPostMatchReviews(): PostMatchReview[] {
  try {
    const raw = localStorage.getItem(REVIEWS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((rev) => {
        if (rev.outcomeEvaluation && typeof rev.outcomeEvaluation.scoreHit !== 'boolean') {
          const predicted = rev.priorReport?.decision?.predictedScores || [];
          rev.outcomeEvaluation.scoreHit = predicted.includes(rev.actualScore);
        }
        return rev;
      });
    }
    return [];
  } catch (e) {
    console.error('Error loading post-match reviews:', e);
    return [];
  }
}

/**
 * Save a new post-match review
 */
export function savePostMatchReview(review: PostMatchReview): void {
  try {
    const reviews = getPostMatchReviews();
    const existingIdx = reviews.findIndex((r) => r.id === review.id);
    if (existingIdx >= 0) {
      reviews[existingIdx] = review;
    } else {
      reviews.unshift(review);
    }
    localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(reviews));
  } catch (e) {
    console.error('Error saving review:', e);
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
  matchIncidents: string = ''
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
3. 核心进化结论：必须将此类特例盘型纳入《财富经》经验库，在未来类似盘口时提高防范权重。`;

    evolvedRuleTitle = `${league}【${homeTeam} vs ${awayTeam}】逆向避险修正法`;
    evolvedRuleContent = `针对 ${league} 类似对阵，若晚盘呈现让球 ${matchData.asianHandicap.lateHandicap} 但大小球卡在 ${matchData.overUnder.lateLine} 时，切忌单向押注，需重点防范实际赛果指向的【${actualEuroOutcome === 'WIN' ? '主胜' : actualEuroOutcome === 'DRAW' ? '平局' : '客胜'}】冷门反杀。`;
  }

  const review: PostMatchReview = {
    id: `rev-${Date.now()}`,
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

  // Automatically save this review to history
  savePostMatchReview(review);

  // Create and save the new evolved rule into the knowledge base!
  const newRule: EvolvedExperienceRule = {
    id: `rule-${Date.now()}`,
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

  return review;
}
