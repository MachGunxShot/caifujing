export type ManipulationModelType =
  | 'POSITIVE_CONTROL'     // 极限榨水 / 正向控赔
  | 'HIGH_INTEREST_TRAP'   // 高息吸筹 / 名气诱导
  | 'AVALANCHE_RETREAT'    // 雪崩退盘 / 退热示弱
  | 'LOW_DRAW_DEFENSE'     // 平赔低洼 / 平赔排雷
  | 'SHALLOW_FULL_WATER'   // 浅盘满水死亡
  | 'UNCLASSIFIED';        // 复合型/常规调整

export interface MatchInfo {
  league: string;
  homeTeam: string;
  awayTeam: string;
  matchTime: string;
  marketStory: string; // 球队名气对比、市场热度、战意题材、核心伤停
}

export interface AsianHandicapData {
  earlyHandicap: string;  // 如 -0.75 (半一)
  earlyHomeOdds: number;  // 如 1.92
  earlyAwayOdds: number;  // 如 1.90
  lateHandicap: string;   // 如 -1.0 (一球)
  lateHomeOdds: number;   // 如 2.05
  lateAwayOdds: number;   // 如 1.78
}

export interface EuroOddsData {
  earlyWin: number;
  earlyDraw: number;
  earlyLoss: number;
  lateWin: number;
  lateDraw: number;
  lateLoss: number;
}

export interface OverUnderData {
  earlyLine: string;      // 如 2.5
  earlyOverOdds: number;  // 如 1.95
  earlyUnderOdds: number; // 如 1.85
  lateLine: string;       // 如 2.5
  lateOverOdds: number;   // 如 1.82
  lateUnderOdds: number;  // 如 2.02
}

export interface FullMatchData {
  matchInfo: MatchInfo;
  asianHandicap: AsianHandicapData;
  euroOdds: EuroOddsData;
  overUnder: OverUnderData;
  additionalNotes?: string;
}

export interface ActuarialMetrics {
  earlyReturnRate: number; // 欧指返还率
  lateReturnRate: number;
  earlyHomeProb: number;   // 隐含胜率 %
  earlyDrawProb: number;
  earlyAwayProb: number;
  lateHomeProb: number;
  lateDrawProb: number;
  lateAwayProb: number;
  winTrend: 'DROP' | 'RISE' | 'STABLE';
  drawTrend: 'DROP' | 'RISE' | 'STABLE';
  lossTrend: 'DROP' | 'RISE' | 'STABLE';
  asianTrend: 'UP_LINE' | 'DOWN_LINE' | 'SAME_LINE';
  homeWaterTrend: 'DROP' | 'RISE' | 'STABLE';
  detectedModels: {
    model: ManipulationModelType;
    title: string;
    confidence: number;
    description: string;
    riskLevel: 'LOW_RISK_SOLID' | 'HIGH_RISK_TRAP' | 'DRAW_DEFENSE' | 'UPSET_WARNING';
  }[];
  overUnderVerdict: string;
  handicapDiscrepancy: string;
}

export interface StructuredDecision {
  starRating: number;          // 推荐星级 1-5 星
  euroPick: string;            // 胜平负首选 (如: 主胜 / 平局 / 让球负)
  handicapPick: string;        // 让球首选 (如: 上盘 曼城 -1.75 / 下盘 赫塔菲 +1.25)
  overUnderPick: string;       // 大小球首选 (如: 小球 <=2.5 / 大球 >=3.0)
  predictedScores: string[];   // 参考比分 (如: ["2-0", "3-0", "2-1"])
  confidenceReason: string;    // 定性精算法由
}

export interface AnalysisReportResult {
  // Output requirement 1
  firstImpression: string;      // 1. 【盘面第一印象】：定性该盘口属于正向控赔、高息诱上还是平赔风控。
  // Output requirement 2
  threeDimLieDetection: string; // 2. 【三维联动测谎】：交叉验证亚盘水位、欧赔走势与大小球盘口是否匹配。
  // Output requirement 3
  finalVerdict: {
    direction: string;          // 推荐方向（上盘/下盘/大球/小球/平局）
    directionDetail: string;    // 具体盘口与比分倾向
    riskWarning: string;        // 避坑风险提示
  };
  decision: StructuredDecision; // 批量决策核心五项输出
  identifiedModel: ManipulationModelType;
  modelTitle: string;
  source: 'GEMINI_AI' | 'ACTUARIAL_RULE_ENGINE';
  metrics: ActuarialMetrics;
}

export type ConfidenceShiftType = 'INCREASED' | 'DECREASED' | 'STABLE';

export interface ConfidenceComparisonResult {
  shiftType: ConfidenceShiftType; // 'INCREASED' | 'DECREASED' | 'STABLE'
  starChange: number;            // e.g. +2, +1, 0, -1, -2
  earlyStars: number;
  lateStars: number;
  earlyEuroPick: string;
  lateEuroPick: string;
  earlyHandicapPick: string;
  lateHandicapPick: string;
  earlyOverUnderPick?: string;
  lateOverUnderPick?: string;
  earlyModel: ManipulationModelType;
  lateModel: ManipulationModelType;
  earlyModelTitle: string;
  lateModelTitle: string;
  summaryTitle: string;          // e.g. "晚盘信心大幅增加 (+2星 · 机构控赔加固)"
  keyReasons: string[];          // 核心异动判定动因列表
  detailedExplanation: string;   // 详尽深度博弈研判
  waterDiff: {
    home: number;
    away: number;
    giving: number;
  };
  euroDiff: {
    win: number;
    draw: number;
    loss: number;
    giving: number;
  };
  probDiff: {
    win: number;
    draw: number;
    loss: number;
  };
  earlyOddsSummary: {
    handicap: string;
    homeOdds: number;
    awayOdds: number;
    win: number;
    draw: number;
    loss: number;
    overUnderLine?: string;
  };
  lateOddsSummary: {
    handicap: string;
    homeOdds: number;
    awayOdds: number;
    win: number;
    draw: number;
    loss: number;
    overUnderLine?: string;
  };
}

export interface BatchMatchItem {
  id: string;
  sourceName?: string;
  data: FullMatchData;
  report?: AnalysisReportResult;
  rawAiText?: string;
  status: 'idle' | 'analyzing' | 'done' | 'error';
  timestamp: number;
  review?: PostMatchReview;
  isLocked?: boolean;         // 🔒 封盘锁定：开赛后固定盘口快照，防止多次导入新 Markdown 时被篡改或覆盖
  lockedAt?: string;          // 锁定时间（如 "10-06 00:00"）
  lockedReason?: string;      // 锁定理由（如 "开赛封盘保护"）
  finalScore?: string;        // 完赛真实比分 (如 "3-1")
  isReviewed?: boolean;       // 是否已归档到《财富经》复盘进化库
  
  // 早晚盘变轨快照与信心异动
  earlyDataSnapshot?: FullMatchData;          // 早盘原始快照
  earlyReportSnapshot?: AnalysisReportResult; // 早盘原始精算报告
  confidenceShift?: ConfidenceComparisonResult; // 早晚盘信心异动分析
}

export interface PostMatchReview {
  id: string;
  matchData: FullMatchData;
  priorReport: AnalysisReportResult;
  actualScore: string;           // e.g. "2-1"
  actualHomeScore: number;
  actualAwayScore: number;
  matchIncidents?: string;       // 比赛转折点 (红牌、点球、补时绝杀、主力早退等)
  reviewTimestamp: number;
  
  // Sports lottery sales day (竞彩销售日：当日11:00至次日11:00)
  salesDate?: string;            // e.g. "2026-03-28"
  salesDateOverride?: string;    // 用户手动确认的销售日；不改原始开赛时间
  salesDateLabel?: string;       // e.g. "2026年03月28日 销售日"
  salesCycleText?: string;       // e.g. "03-28 11:00 ~ 03-29 11:00"
  kickoffTime?: string;          // 识别的比赛开赛时间 (如 "2026-03-28 23:00")
  
  // Evaluation results
  outcomeEvaluation: {
    euroHit: boolean;            // 胜平负命中
    handicapHit: boolean;        // 让球赢盘
    overUnderHit: boolean;       // 大小球命中
    scoreHit: boolean;           // 比分命中
    modelVerified: boolean;      // 操盘手意图是否得到印证
    summaryNote: string;
  };

  // Actuarial Dissection & Core Lesson
  dissectionText: string;        // 复盘深度博弈解析
  evolvedRuleTitle: string;      // 提炼的核心法则标题
  evolvedRuleContent: string;    // 提炼的核心经验法则内容 (注入知识库)
  ruleCategory: ManipulationModelType | 'SPECIAL_SITUATION' | 'GENERAL';
}

export interface EvolvedExperienceRule {
  id: string;
  title: string;                 // 法则名称
  category: ManipulationModelType | 'SPECIAL_SITUATION' | 'GENERAL';
  leagueScope: string;           // 适用联赛范围
  ruleContent: string;           // 经验法则正文
  sourceMatch: string;           // 提炼来源赛事
  createdAt: string;
  isActive: boolean;             // 是否激活并注入AI大模型提示词与精算系统
  hitCount?: number;             // 经验被印证次数
}

