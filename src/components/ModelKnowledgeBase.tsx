import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  ShieldAlert,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Flame,
  CheckCircle2,
  HelpCircle,
  Sparkles,
  Compass,
  Check,
  MousePointerClick,
  Zap,
  Target,
  Table,
  Layers,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  History,
  Activity,
  Copy,
  Star,
  Filter,
} from 'lucide-react';
import { PRESET_CASES, PresetCase } from '../utils/presetCases';
import { FullMatchData, AnalysisReportResult, BatchMatchItem } from '../types/fortuneActuary';
import { generateActuarialRuleReport } from '../utils/actuaryEngine';

interface ModelKnowledgeBaseProps {
  onLoadPreset: (preset: PresetCase) => void;
  currentMatch?: FullMatchData;
  currentReport?: AnalysisReportResult;
  batchQueue?: BatchMatchItem[];
  onSelectMatch?: (match: FullMatchData) => void;
  onNavigateToWorkbench?: () => void;
}

export const ModelKnowledgeBase: React.FC<ModelKnowledgeBaseProps> = ({
  onLoadPreset,
  currentMatch,
  currentReport,
  batchQueue = [],
  onSelectMatch,
  onNavigateToWorkbench,
}) => {
  const [activeModel, setActiveModel] = useState<number>(0);
  const [isSandboxOpen, setIsSandboxOpen] = useState<boolean>(true);

  // Top-level View Mode: 'batchShowcase' (批量推演大屏展示) vs 'theoryGuide' (五大模型理论知识库)
  const [topViewMode, setTopViewMode] = useState<'batchShowcase' | 'theoryGuide'>(() => {
    return batchQueue && batchQueue.length > 0 ? 'batchShowcase' : 'theoryGuide';
  });
  const [batchShowcaseModelFilter, setBatchShowcaseModelFilter] = useState<string>('ALL');
  const [batchShowcaseStarFilter, setBatchShowcaseStarFilter] = useState<number | 'ALL'>('ALL');
  const [batchShowcaseStatusFilter, setBatchShowcaseStatusFilter] = useState<'ALL' | 'REVIEWED' | 'UNFINISHED'>('ALL');
  const [isAllBatchShowcaseExpanded, setIsAllBatchShowcaseExpanded] = useState<boolean>(true);
  const [copiedSingleMatchId, setCopiedSingleMatchId] = useState<string | null>(null);

  // User-selected mode for Sandbox Deduction: 'batch' (批量展示全部场次) vs 'single' (单场精推) vs 'preset' (经典教科书教学)
  const [sandboxTarget, setSandboxTarget] = useState<'single' | 'batch' | 'preset'>(() => {
    if (batchQueue && batchQueue.length > 1) return 'batch';
    if (currentMatch && currentMatch.matchInfo.homeTeam) return 'single';
    return 'preset';
  });
  const [selectedMatchId, setSelectedMatchId] = useState<string>('');
  const [batchModelFilter, setBatchModelFilter] = useState<string>('ALL');
  const [copiedBatchSandbox, setCopiedBatchSandbox] = useState<boolean>(false);

  // 30s Interactive Diagnostic Tool States
  const [diagEuroTrend, setDiagEuroTrend] = useState<'DROP' | 'DRAW_LOW' | 'RISE_OR_FLAT'>('DROP');
  const [diagAsianTrend, setDiagAsianTrend] = useState<'SAME_OR_DEEP' | 'UP_LINE' | 'DOWN_LINE' | 'SHALLOW'>('SAME_OR_DEEP');
  const [diagWaterLevel, setDiagWaterLevel] = useState<'LOW' | 'MID' | 'HIGH_FULL'>('LOW');

  const models = [
    {
      id: 'POSITIVE_CONTROL',
      title: '【极限榨水 / 正向控赔】',
      subTitle: '真风控控赔 · 正路做稳胆',
      badge: '正向控赔（需核对临场红线）',
      badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
      caseName: '曼城 2-0 埃弗顿（欧赔1.22 + 球半两球1.76超低水稳胆打出）',
      formula: '欧赔持续下调 + 亚指维持原盘或升盘 + 上盘水位砸至 <1.80 极低水',
      mindset:
        '大庄在临场资金大举介入后，不惜降低彩民的盈利吸引力，强行将赔付水位砸入冰点。机构宁可少赚抽水，也绝不敢冒高额赔付风险，这是货真价实的防范打出。',
      traps: '彩民常因“赔率只有1.75回报太低”而心理抗拒，转去博冷，结果惨遭绝杀。',
      rule: '低水须与同侧胜赔、亚盘变动及大小球共同核对。仅凭低赔不升五星。',
      presetId: 'case-positive-control',
      actionPick: '分别记录让球与独赢方向',
    },
    {
      id: 'HIGH_INTEREST_TRAP',
      title: '【高息吸筹 / 名气诱导】',
      subTitle: '大热必死 · 公开诱上坚决去下盘',
      badge: '高危杀猪盘 (绝不盲从)',
      badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/40',
      caseName: '皇家马德里 1-1 赫塔菲（强升一球球半 + 满水2.06大热爆冷）',
      formula: '强队名气/战意题材拉满 + 强升盘 + 上盘水位死卡 2.00~2.08 超高水/满水',
      mindset:
        '借豪门光环制造“让步坚挺、大胜穿盘”的幻觉，盘面大开方便之门，同时挂出满水高额诱饵。如果庄家真怕上盘打出，绝不敢长期悬挂满水让市场白捡暴利。',
      traps: '被球队历史战绩与豪门光环蒙蔽，沉迷“赢球即赢盘甚至赢半个球”的虚假安全感。',
      rule: '升盘挂满水，十有九次鬼。买得太舒服、回报率过高的盘面，坚决反选受让下盘。',
      presetId: 'case-high-interest-trap',
      actionPick: '反选受让下盘 / 博客队不败',
    },
    {
      id: 'AVALANCHE_RETREAT',
      title: '【雪崩退盘 / 退热示弱】',
      subTitle: '利空坐实跟退盘 · 豪门暴力洗盘需辨析',
      badge: '避险退防 (利空止损)',
      badgeColor: 'bg-purple-500/15 text-purple-400 border-purple-500/40',
      caseName: '利物浦 1-2 纽卡斯尔联（由一球退至半一高水，主力伤停逆转）',
      formula: '临场剧烈退盘 (如一球退半一/半一退半球) + 水位抬升至中高水',
      mindset:
        '正规透明联赛无端退盘升水，往往是机构核心风控提前捕捉到了未公开的核心利空（主力突发伤停、更衣室内讧、战意放弃）而紧急止损避险。',
      traps: '自作聪明以为“豪门退盘是机构在故意吓退资金，正好便宜抄底”，最终一脚踩空。',
      rule: '透明联赛大庄掌握绝对信息差，跟退盘者生，盲抄底者亡。常规联赛坚决跟退盘走客队。',
      presetId: 'case-avalanche-retreat',
      actionPick: '顺应退盘去下盘 / 谨防爆冷',
    },
    {
      id: 'LOW_DRAW_DEFENSE',
      title: '【平赔低洼 / 平赔排雷】',
      subTitle: '欧平死压 <3.00 · 严防平局真实避险',
      badge: '首选胆平 (高赔利器)',
      badgeColor: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/40',
      caseName: '拉齐奥 1-1 佛罗伦萨（欧平平赔打入2.90低洼，绝杀平局打出）',
      formula: '欧平平赔死压至 <3.00 (竞彩 <2.75) + 亚盘平手/平半浅盘两头对冲',
      mindset:
        '机构在胜负两端制造水位波动充当障眼法，资金在主胜与客胜间来回分流，而大庄的核心防御红线全部筑在平赔之上。平局一旦打出，机构通吃两头盘口。',
      traps: '总在主胜或客胜之间赌单边，忽略了平赔已经击穿机构防线的客观事实。',
      rule: '平赔破3.00为最高级风控预警，两头下注极易被绝杀，首选平局与双选平。',
      presetId: 'case-low-draw-defense',
      actionPick: '首选单平 / 次选双平防守',
    },
    {
      id: 'SHALLOW_FULL_WATER',
      title: '【浅盘满水死亡】',
      subTitle: '主场优势归零 · 强队让步无力必丢分',
      badge: '冷门死穴 (主队丢分)',
      badgeColor: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
      caseName: '多特蒙德 1-2 波鸿（主场仅开平半挂2.05满水，爆冷失利）',
      formula: '强队主场对中下游仅开平手/平半 + 长期挂 2.00+ 满水',
      mindset:
        '主队坐拥主场天利与人气，却开出几乎不设防的平半满水，买主队“赢球即收全且有高回报”。机构完全不担心主胜穿透，实则早已判了强队死刑。',
      traps: '“强队在主场总能赢一个吧”，盲目迷信主场保底胜率。',
      rule: '浅盘满水死亡线，送钱盘面是断头台。毫不犹豫反选下盘客队不败。',
      presetId: 'case-shallow-full-water',
      actionPick: '毫不犹豫反选客队受让',
    },
  ];

  // In-Situ Sandbox Details for Each Preset Case
  const getSandboxDetails = (modelIdx: number) => {
    switch (modelIdx) {
      case 0:
        return {
          matchTitle: '曼彻斯特城 vs 埃弗顿',
          league: '英超联赛 ｜ 周六 20:30',
          finalScore: '2 - 0 (稳胆打出，曼城赢球赢盘)',
          story: '曼城争冠白热化全主力出战，埃弗顿保级客场疲弱，市场狂热堆积曼城。',
          earlyEuro: '1.30 ｜ 5.50 ｜ 9.50',
          lateEuro: '1.22 ｜ 6.80 ｜ 12.00',
          euroShift: '主胜从 1.30 暴力下砸至 1.22 (-0.08)，平负大幅抬升避险',
          earlyAsian: '球半/两球 (-1.75) ｜ 主水 1.95',
          lateAsian: '球半/两球 (-1.75) ｜ 主水 1.76 (极低水)',
          asianShift: '维持球半/两球高门槛不变，主队水位一路狂砸至 1.76 冰点',
          earlyOU: '3.0球 ｜ 大水 1.88',
          lateOU: '3.25球 ｜ 大水 1.82',
          ouShift: '大小球升至 3.25，与大胜预期形成强力正向支撑',
          step1: '【早盘开盘意图】：初设主胜 1.30 搭配球半/两球中水，合理平衡初入基石资金。',
          step2: '【资金狂热冲击】：临场资金如潮水般涌入曼城，市场一致看好大胜穿盘。',
          step3: '【机构风控变轨】：大庄若想诱上，完全可以顺势升两球挂 2.05 满水；但庄家反其道而行之，把水位一路砸至 1.76 超低水冰点！宁可被骂小气，绝不敢给高回报赔付！',
          step4: '【赛后复盘印证】：曼城 2-0 经济实惠打出，正路核心稳胆顺利兑现，印证大庄极限榨水为真实风控！',
        };
      case 1:
        return {
          matchTitle: '皇家马德里 vs 赫塔菲',
          league: '西甲联赛 ｜ 周日 03:00',
          finalScore: '1 - 1 (皇马爆冷逼平，下盘全赢)',
          story: '皇马欧冠大胜势头正盛，球迷与散户狂热追捧，赫塔菲客场4轮不胜，机构借势做局。',
          earlyEuro: '1.48 ｜ 4.30 ｜ 6.80',
          lateEuro: '1.42 ｜ 4.60 ｜ 7.20',
          euroShift: '欧指主胜微降制造看好假象，但降幅与深盘严重脱节',
          earlyAsian: '一球 (-1.0) ｜ 主水 1.86',
          lateAsian: '一球/球半 (-1.25) ｜ 主水 2.06 (满水)',
          asianShift: '强升一球球半制造穿盘幻觉，却死卡 2.06 超高满水诱饵',
          earlyOU: '2.75球 ｜ 大水 1.90',
          lateOU: '2.5球 ｜ 大水 1.85',
          ouShift: '大小球不升反退至 2.5，与亚盘强行升盘自相矛盾',
          step1: '【早盘开盘意图】：初盘仅开一球低水，刻意制造容易赢球且门槛极低的心理暗示。',
          step2: '【散户狂热追捧】：皇马欧冠余威震天，散户普遍坚信“赢一个球保底走水，赢两个全收”。',
          step3: '【机构风控变轨】：庄家顺水推舟强升一球/球半，但上盘水位长期死卡 2.06 满水！大开方便之门，以高额诱饵吸纳上盘巨资！',
          step4: '【赛后复盘印证】：皇马 1-1 被弱旅绝平，机构挂满水精准诱上，大热必死通吃全盘！',
        };
      case 2:
        return {
          matchTitle: '利物浦 vs 纽卡斯尔联',
          league: '英超联赛 ｜ 周一 04:00',
          finalScore: '1 - 2 (豪门遭逆转，下盘完胜)',
          story: '利物浦主场声名显赫，但赛前传出核心中场和头号射手流感缺席，晚盘资金大面积撤退。',
          earlyEuro: '1.55 ｜ 4.10 ｜ 5.60',
          lateEuro: '1.76 ｜ 3.85 ｜ 4.50',
          euroShift: '主胜由 1.55 暴涨至 1.76 (+0.21)，客胜平赔断崖下滑',
          earlyAsian: '一球 (-1.0) ｜ 主水 1.90',
          lateAsian: '半球/一球 (-0.75) ｜ 主水 2.02',
          asianShift: '临场剧烈退盘，由一球退至半一甚至半球高水',
          earlyOU: '3.0球 ｜ 大水 1.92',
          lateOU: '2.75球 ｜ 大水 2.00',
          ouShift: '大小球同步回落，印证利物浦进攻核心缺阵攻击力受损',
          step1: '【早盘开盘意图】：一球让步匹配两队声望，早盘资金处于常规分布。',
          step2: '【突发核心利空】：大庄先于公开媒体掌握利物浦绝对主力早退与伤停名单。',
          step3: '【机构风控变轨】：大庄为避免赔付，不惜砸碎豪门颜面连续退盘至半一甚至半球，将风险紧急转嫁给盲目抄底的散户。',
          step4: '【赛后复盘印证】：利物浦 1-2 惨遭逆转击败，跟退盘走客队生，盲目抄底强队死！',
        };
      case 3:
        return {
          matchTitle: '拉齐奥 vs 佛罗伦萨',
          league: '意甲联赛 ｜ 周日 22:00',
          finalScore: '1 - 1 (终盘典型闷平，胆平高赔打出)',
          story: '两队争夺欧战资格积分仅差1分，战术打法均偏向稳守反击，机构对平局极度警惕。',
          earlyEuro: '2.45 ｜ 3.15 ｜ 2.90',
          lateEuro: '2.50 ｜ 2.90 ｜ 2.95',
          euroShift: '主胜抬升，欧平平赔打入 2.90 极度敏感的低洼红线',
          earlyAsian: '平手/半球 (-0.25) ｜ 主水 1.98',
          lateAsian: '平手/半球 (-0.25) ｜ 主水 1.94',
          asianShift: '亚盘死卡平半浅盘，胜负两端水位反复拉扯对冲',
          earlyOU: '2.25球 ｜ 大水 1.90',
          lateOU: '2.0/2.5球 ｜ 大水 2.02',
          ouShift: '大小球持续向小球挤压，强烈指向 1-1 或 0-0 经济型平局',
          step1: '【早盘开盘意图】：胜平负呈均势三叉戟，初设平赔 3.15 试探。',
          step2: '【两端资金对冲】：散户在“主场优势”与“客队反弹”两头激烈博弈，资金被有效分流。',
          step3: '【机构风控变轨】：大庄将核心防御红线悄悄筑于平赔之上，平赔死死压在 2.90 以下，平局打出庄家通吃胜负两头筹码！',
          step4: '【赛后复盘印证】：两队 1-1 握手言和，平赔低洼胆平精准命中，高赔轻松打出！',
        };
      case 4:
        return {
          matchTitle: '多特蒙德 vs 波鸿',
          league: '德甲联赛 ｜ 周六 21:30',
          finalScore: '1 - 2 (豪门主场大热倒灶，下盘完胜)',
          story: '多特蒙德坐拥威斯特法伦魔鬼主场，但本赛季防线漏洞百出，面对保级队让步虚弱。',
          earlyEuro: '1.90 ｜ 3.60 ｜ 3.80',
          lateEuro: '2.15 ｜ 3.45 ｜ 3.30',
          euroShift: '主胜欧赔暴涨至 2.15 失去赢球基石，客胜大幅下滑',
          earlyAsian: '半球 (-0.5) ｜ 主水 1.92',
          lateAsian: '平手/半球 (-0.25) ｜ 主水 2.05 (满水)',
          asianShift: '主场退至平半无阻力浅盘，且长期挂 2.05 超高满水',
          earlyOU: '3.0球 ｜ 大水 1.88',
          lateOU: '2.75球 ｜ 大水 2.00',
          ouShift: '大小球走低，揭示多特进攻难有作为',
          step1: '【早盘开盘意图】：初设半球仅给微弱门槛，暗藏让步乏力玄机。',
          step2: '【散户心理惯性】：散户普遍坚信“强队在主场总能赢一个”，大量资金无脑涌入多特。',
          step3: '【机构风控变轨】：大庄退至平半并大方给 2.05 满水，买多特“赢球即可收全”，完全不设防！送钱盘面必是断头台！',
          step4: '【赛后复盘印证】：多特蒙德 1-2 爆冷吞下败仗，浅盘满水死亡线再次应验，反选客队完胜！',
        };
      default:
        return null;
    }
  };

  // 30s Interactive Diagnostic Matcher
  const diagnosedResult = useMemo(() => {
    // 1. POSITIVE CONTROL
    if (diagEuroTrend === 'DROP' && (diagAsianTrend === 'SAME_OR_DEEP' || diagAsianTrend === 'UP_LINE') && diagWaterLevel === 'LOW') {
      return {
        modelIdx: 0,
        model: models[0],
        verdict: '正向控赔形态 · 待临场复核',
        advice: '此处只识别盘口形态。请在精算台核对早晚盘与球队定位，通过 v4 红线复核后再判断核心资格。',
      };
    }
    // 2. HIGH INTEREST TRAP
    if (diagAsianTrend === 'UP_LINE' && diagWaterLevel === 'HIGH_FULL') {
      return {
        modelIdx: 1,
        model: models[1],
        verdict: '🚨 确诊【高息吸筹 / 杀猪盘陷阱】',
        advice: '强升盘挂 2.00+ 满水，机构大开方便之门诱上！买得太舒服必定是大热必死，坚决反选受让下盘（客队不败）！',
      };
    }
    // 3. LOW DRAW DEFENSE
    if (diagEuroTrend === 'DRAW_LOW') {
      return {
        modelIdx: 3,
        model: models[3],
        verdict: '⚖️ 确诊【平赔低洼 / 严防平局】',
        advice: '欧平平赔打入 3.00 以下风控红线，两头震荡均为障眼法！平局防范等级极高，首选单平或让球负/让平防守！',
      };
    }
    // 4. AVALANCHE RETREAT
    if (diagAsianTrend === 'DOWN_LINE') {
      return {
        modelIdx: 2,
        model: models[2],
        verdict: '📉 确诊【雪崩退盘 / 避险退热】',
        advice: '临场剧烈退盘升水，坐实重大突发利空（主力伤停或战意退缩）！绝不盲目抄底强队，顺应退盘去下盘！',
      };
    }
    // 5. SHALLOW FULL WATER
    if (diagAsianTrend === 'SHALLOW' && diagWaterLevel === 'HIGH_FULL') {
      return {
        modelIdx: 4,
        model: models[4],
        verdict: '⚠️ 确诊【浅盘满水死亡线】',
        advice: '强队坐拥主场却让步极浅且挂满水，机构完全不担心打出！防范主队爆大冷，反选客队不败！',
      };
    }

    if (diagWaterLevel === 'LOW') {
      return {
        modelIdx: 0,
        model: models[0],
        verdict: '偏向【正向控赔避险形态】',
        advice: '水位处于偏低防范区间，建议结合大小球盘口验证主胜穿盘空间。',
      };
    }

    return {
      modelIdx: 1,
      model: models[1],
      verdict: '偏向【高水阻上或利诱博弈盘】',
      advice: '水位高企，建议保持警惕，结合大小球走势防范假升盘诱导。',
    };
  }, [diagEuroTrend, diagAsianTrend, diagWaterLevel]);

  // Determine currently selected real match for live sandbox deduction
  const activeSelectedMatch = useMemo(() => {
    if (selectedMatchId && batchQueue && batchQueue.length > 0) {
      const found = batchQueue.find((b) => b.id === selectedMatchId);
      if (found) return found;
    }
    if (batchQueue && batchQueue.length > 0) {
      const matchInQueue = batchQueue.find(
        (b) =>
          b.data.matchInfo.homeTeam === currentMatch?.matchInfo.homeTeam &&
          b.data.matchInfo.awayTeam === currentMatch?.matchInfo.awayTeam
      );
      if (matchInQueue) return matchInQueue;
      return batchQueue[0];
    }
    if (currentMatch && currentMatch.matchInfo.homeTeam) {
      return {
        id: 'current-active',
        data: currentMatch,
        report: currentReport || generateActuarialRuleReport(currentMatch),
        status: 'done' as const,
        timestamp: Date.now(),
      };
    }
    return null;
  }, [selectedMatchId, batchQueue, currentMatch, currentReport]);

  // Dynamic 4-Step Game Theory Sandbox Generator for ANY match
  const buildMatchSandbox = (
    mData: FullMatchData,
    rep: AnalysisReportResult,
    finalScore?: string
  ) => {
    const { homeTeam, awayTeam, league, matchTime, marketStory } = mData.matchInfo;
    const earlyWin = mData.euroOdds.earlyWin;
    const lateWin = mData.euroOdds.lateWin;
    const winDiff = lateWin - earlyWin;
    const winDiffStr = winDiff > 0 ? `+${winDiff.toFixed(2)}` : winDiff.toFixed(2);
    const modelTitle = rep.modelTitle || '博弈调仓中性盘';

    return {
      matchTitle: `${homeTeam} vs ${awayTeam}`,
      league: `${league || '常规联赛'} ｜ ${matchTime || '临场'}`,
      finalScore: finalScore
        ? `${finalScore} (已完赛真实比分)`
        : '⏳ 临场即时博弈推演 (前瞻盘面)',
      story:
        marketStory ||
        `${homeTeam} 与 ${awayTeam} 战力对碰，临场资金在胜平负与让球盘呈现博弈分流与热度倾斜。`,
      earlyEuro: `${earlyWin.toFixed(2)} ｜ ${mData.euroOdds.earlyDraw.toFixed(2)} ｜ ${mData.euroOdds.earlyLoss.toFixed(2)}`,
      lateEuro: `${lateWin.toFixed(2)} ｜ ${mData.euroOdds.lateDraw.toFixed(2)} ｜ ${mData.euroOdds.lateLoss.toFixed(2)}`,
      euroShift: `主胜欧赔由早盘 ${earlyWin.toFixed(2)} 变动至终盘 ${lateWin.toFixed(2)} (${winDiffStr})，平赔 ${mData.euroOdds.lateDraw.toFixed(2)}，客胜 ${mData.euroOdds.lateLoss.toFixed(2)}`,
      earlyAsian: `${mData.asianHandicap.earlyHandicap} ｜ 主水 ${mData.asianHandicap.earlyHomeOdds.toFixed(2)}`,
      lateAsian: `${mData.asianHandicap.lateHandicap} ｜ 主水 ${mData.asianHandicap.lateHomeOdds.toFixed(2)}`,
      asianShift: `让步由初盘 ${mData.asianHandicap.earlyHandicap} (主水 ${mData.asianHandicap.earlyHomeOdds.toFixed(2)}) 变动至终盘 ${mData.asianHandicap.lateHandicap} (主水 ${mData.asianHandicap.lateHomeOdds.toFixed(2)})`,
      earlyOU: `${mData.overUnder.earlyLine}球 ｜ 大水 ${mData.overUnder.earlyOverOdds.toFixed(2)}`,
      lateOU: `${mData.overUnder.lateLine}球 ｜ 大水 ${mData.overUnder.lateOverOdds.toFixed(2)}`,
      ouShift: `大小球界线 ${mData.overUnder.lateLine} 球，${rep.metrics.overUnderVerdict}`,
      step1: `【早盘意图】：初盘给出 ${mData.asianHandicap.earlyHandicap} 搭配欧指 ${earlyWin.toFixed(2)} 初赔，机构第一道防线旨在均衡两端基石资金。`,
      step2: `【资金发酵】：伴随市场题材与公众热度发酵，筹码在主胜与让球盘持续沉淀，资金倾斜引发水位微调。`,
      step3: `【临场风控变轨】：${rep.firstImpression ? rep.firstImpression.slice(0, 140) + '...' : `机构临场变轨定性为【${modelTitle}】，重点防范 ${rep.decision.euroPick}。`}`,
      step4: `【终局推演与避坑】：${rep.finalVerdict.direction}；${rep.finalVerdict.directionDetail}。${rep.finalVerdict.riskWarning}`,
      isLiveMatch: true,
      homeTeam,
      awayTeam,
    };
  };

  const dynamicMatchSandbox = useMemo(() => {
    if (!activeSelectedMatch) return null;
    const mData = activeSelectedMatch.data;
    const rep = activeSelectedMatch.report || generateActuarialRuleReport(mData);
    return buildMatchSandbox(mData, rep, activeSelectedMatch.finalScore);
  }, [activeSelectedMatch]);

  const handleCopyBatchSandbox = () => {
    if (!batchQueue || batchQueue.length === 0) return;
    const md = batchQueue
      .map((item, idx) => {
        const rep = item.report || generateActuarialRuleReport(item.data);
        const box = buildMatchSandbox(item.data, rep, item.finalScore);
        return `### 【第 ${idx + 1} 场沙盘推演】${box.matchTitle} (${box.league})
- **赛果状态**：${box.finalScore}
- **战意题材**：${box.story}
- **欧指初终跳变**：${box.earlyEuro} ➔ ${box.lateEuro} (${box.euroShift})
- **亚盘初终跳变**：${box.earlyAsian} ➔ ${box.lateAsian} (${box.asianShift})
- **大小球跳变**：${box.earlyOU} ➔ ${box.lateOU} (${box.ouShift})

#### 四步动态博弈沙盘测谎推演：
1. **${box.step1}**
2. **${box.step2}**
3. **${box.step3}**
4. **${box.step4}**`;
      })
      .join('\n\n---\n\n');

    navigator.clipboard.writeText(md);
    setCopiedBatchSandbox(true);
    setTimeout(() => setCopiedBatchSandbox(false), 2000);
  };

  // If user chooses current live match, use dynamicMatchSandbox; else use textbook preset
  const activeSandbox =
    (sandboxTarget === 'single' || sandboxTarget === 'batch') && dynamicMatchSandbox
      ? dynamicMatchSandbox
      : getSandboxDetails(activeModel);

  return (
    <div className="space-y-5">
      {/* 0. Master Switcher Bar: 批量推演矩阵大屏 vs 五大模型理论知识库 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 text-emerald-400 flex items-center justify-center font-bold">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white flex items-center gap-2">
              <span>五大模型 · 矩阵推演与知识库</span>
              {batchQueue.length > 0 && (
                <span className="px-2 py-0.2 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  实盘已载入 {batchQueue.length} 场
                </span>
              )}
            </h2>
            <p className="text-[11px] text-slate-400">
              支持一键切换「批量推演矩阵大屏」全览所有场次沙盘，或查阅「五大经典模型字典」
            </p>
          </div>
        </div>

        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs self-stretch sm:self-auto">
          <button
            type="button"
            onClick={() => setTopViewMode('batchShowcase')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
              topViewMode === 'batchShowcase'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>📑 批量推演矩阵大屏</span>
            {batchQueue.length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-900/60 font-normal">
                {batchQueue.length}场
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setTopViewMode('theoryGuide')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
              topViewMode === 'theoryGuide'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>📘 五大模型理论知识库 & 测谎仪</span>
          </button>
        </div>
      </div>

      {topViewMode === 'batchShowcase' ? (
        <div className="space-y-4">
          {/* Top Model Distribution Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">五大操盘模型 · 批量实盘命中全景透视</h3>
                  <p className="text-[11px] text-slate-400">
                    当前导入队列共 <strong className="text-white font-mono">{batchQueue.length}</strong> 场比赛，系统算法已完成全部比赛的操盘模型智能归类
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyBatchSandbox}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 cursor-pointer shadow-sm"
                >
                  {copiedBatchSandbox ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-bold">已复制全部沙盘合辑</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-emerald-400" />
                      <span>复制全部沙盘合辑 (Markdown)</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setIsAllBatchShowcaseExpanded(!isAllBatchShowcaseExpanded)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-cyan-300 text-xs font-semibold rounded-lg border border-slate-700 cursor-pointer"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>{isAllBatchShowcaseExpanded ? '折叠全部沙盘' : '展开全部沙盘'}</span>
                </button>
              </div>
            </div>

            {/* Model Distribution Pills Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <button
                type="button"
                onClick={() => setBatchShowcaseModelFilter('ALL')}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                  batchShowcaseModelFilter === 'ALL'
                    ? 'bg-slate-800 border-emerald-500 text-white shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="text-[10px] text-slate-400 font-bold">全量队列</div>
                <div className="text-base font-black text-white font-mono">{batchQueue.length} <span className="text-xs font-normal">场</span></div>
                <div className="text-[10px] text-emerald-400 font-mono mt-0.5">100% 覆盖</div>
              </button>

              {models.map((m, idx) => {
                const count = batchQueue.filter((b) => {
                  const rep = b.report || generateActuarialRuleReport(b.data);
                  return rep.identifiedModel === m.id;
                }).length;
                const isSelected = batchShowcaseModelFilter === m.id;

                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setBatchShowcaseModelFilter(isSelected ? 'ALL' : m.id)}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-800 border-cyan-500 text-white shadow-md ring-1 ring-cyan-500/50'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono text-cyan-400 font-bold">
                      <span>0{idx + 1}. {m.title.replace(/[【】]/g, '').slice(0, 4)}</span>
                      {count > 0 && <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />}
                    </div>
                    <div className="text-base font-black text-white font-mono mt-0.5">
                      {count} <span className="text-xs font-normal text-slate-400">场</span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">
                      {m.badge.split(' ')[0]}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Filter Chips Bar */}
            <div className="flex items-center justify-between gap-2 flex-wrap pt-1 text-xs border-t border-slate-800/60">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Filter className="w-3 h-3 text-cyan-400" />
                  <span>筛选过滤:</span>
                </span>

                {/* Status Filter */}
                <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setBatchShowcaseStatusFilter('ALL')}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                      batchShowcaseStatusFilter === 'ALL'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    全部状态
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchShowcaseStatusFilter('REVIEWED')}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                      batchShowcaseStatusFilter === 'REVIEWED'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    已完赛 ({batchQueue.filter((b) => b.isReviewed || b.finalScore).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchShowcaseStatusFilter('UNFINISHED')}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                      batchShowcaseStatusFilter === 'UNFINISHED'
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    未开赛/前瞻 ({batchQueue.filter((b) => !b.isReviewed && !b.finalScore).length})
                  </button>
                </div>

                {/* Star Filter */}
                <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setBatchShowcaseStarFilter('ALL')}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                      batchShowcaseStarFilter === 'ALL'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    全部星级
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchShowcaseStarFilter(5)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                      batchShowcaseStarFilter === 5
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    ★★★★★ 5星稳胆
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchShowcaseStarFilter(4)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                      batchShowcaseStarFilter === 4
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    ★★★★ 4星博弈
                  </button>
                </div>
              </div>

              {onNavigateToWorkbench && (
                <button
                  type="button"
                  onClick={onNavigateToWorkbench}
                  className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-bold hover:underline cursor-pointer"
                >
                  <span>前往「三维测谎」工作台全屏研判</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Cards List */}
          {batchQueue.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto text-xl font-bold">
                📑
              </div>
              <h4 className="text-base font-black text-white">当前批量队列为空</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                请在页面顶部点击「上传附件」导入 Markdown 或 CSV 格式比赛数据，系统将自动对每场比赛进行五大模型识别与四步博弈沙盘推演！
              </p>
              <button
                type="button"
                onClick={() => setTopViewMode('theoryGuide')}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition-colors cursor-pointer"
              >
                查阅五大模型理论字典与教学案例
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {batchQueue
                .filter((item) => {
                  const rep = item.report || generateActuarialRuleReport(item.data);
                  if (batchShowcaseModelFilter !== 'ALL' && rep.identifiedModel !== batchShowcaseModelFilter) {
                    return false;
                  }
                  if (batchShowcaseStarFilter !== 'ALL' && rep.decision.starRating !== batchShowcaseStarFilter) {
                    return false;
                  }
                  if (batchShowcaseStatusFilter === 'REVIEWED' && !(item.isReviewed || item.finalScore)) {
                    return false;
                  }
                  if (batchShowcaseStatusFilter === 'UNFINISHED' && (item.isReviewed || item.finalScore)) {
                    return false;
                  }
                  return true;
                })
                .map((item, idx) => {
                  const rep = item.report || generateActuarialRuleReport(item.data);
                  const box = buildMatchSandbox(item.data, rep, item.finalScore);
                  const modelItem = models.find((m) => m.id === rep.identifiedModel);
                  const isFiveStar = rep.decision.starRating === 5;

                  return (
                    <div
                      key={item.id}
                      className={`bg-slate-900 border rounded-xl p-5 shadow-lg space-y-4 transition-all hover:border-slate-700 ${
                        isFiveStar
                          ? 'border-amber-500/50 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/10'
                          : 'border-slate-800'
                      }`}
                    >
                      {/* Card Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                                isFiveStar
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : 'text-emerald-400 bg-emerald-500/10'
                              }`}
                            >
                              #{idx + 1} 场
                            </span>
                            <span className="text-xs text-slate-400 font-medium">
                              {box.league}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-bold border ${
                                modelItem?.badgeColor || 'bg-slate-800 text-slate-400 border-slate-700'
                              }`}
                            >
                              【{rep.modelTitle}】
                            </span>
                            <span className="text-amber-400 font-mono text-xs font-bold">
                              {'★'.repeat(rep.decision.starRating)}
                              {'☆'.repeat(5 - rep.decision.starRating)}
                            </span>
                            {item.isLocked && (
                              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                                🔒 快照已锁 ({item.lockedAt || '开赛'})
                              </span>
                            )}
                          </div>
                          <h4 className="text-base font-black text-white mt-1">
                            {box.matchTitle}
                          </h4>
                        </div>

                        {/* Top-Right Badges & Actions */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-xs font-mono font-bold text-emerald-400 px-2.5 py-1 rounded bg-emerald-950/60 border border-emerald-800/40">
                            {box.finalScore}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const md = `### 【沙盘推演】${box.matchTitle}\n- 赛果：${box.finalScore}\n- 操盘模型：${rep.modelTitle}\n- 战意：${box.story}\n- 欧赔：${box.earlyEuro} ➔ ${box.lateEuro}\n- 亚盘：${box.earlyAsian} ➔ ${box.lateAsian}\n- 大小球：${box.earlyOU} ➔ ${box.lateOU}\n\n#### 四步动态博弈推演：\n1. ${box.step1}\n2. ${box.step2}\n3. ${box.step3}\n4. ${box.step4}`;
                              navigator.clipboard.writeText(md);
                              setCopiedSingleMatchId(item.id);
                              setTimeout(() => setCopiedSingleMatchId(null), 2000);
                            }}
                            className="px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-slate-300 rounded border border-slate-700 transition-colors inline-flex items-center gap-1 cursor-pointer"
                            title="复制单场沙盘推演 Markdown"
                          >
                            {copiedSingleMatchId === item.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400 font-bold">已复制</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 text-slate-400" />
                                <span>复制沙盘</span>
                              </>
                            )}
                          </button>

                          {onSelectMatch && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectMatch(item.data);
                                if (onNavigateToWorkbench) onNavigateToWorkbench();
                              }}
                              className="px-3 py-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-black rounded shadow transition-all inline-flex items-center gap-1 cursor-pointer"
                              title="带着这场比赛的早晚盘数据，跳转到「三维测谎」工作台"
                            >
                              <span>三维精修</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Story */}
                      <div className="text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                        <strong className="text-amber-300">战意与题材背景：</strong>
                        {box.story}
                      </div>

                      {/* Odds Transition Card */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs font-mono">
                        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
                          <span className="text-[10px] text-slate-400 font-sans font-bold flex items-center gap-1">
                            <Activity className="w-3.5 h-3.5 text-cyan-400" />
                            <span>欧指跳变</span>
                          </span>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400">初：{box.earlyEuro}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-cyan-400 font-bold">终：{box.lateEuro}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 font-sans pt-1 border-t border-slate-800/60 leading-relaxed truncate">
                            {box.euroShift}
                          </p>
                        </div>

                        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
                          <span className="text-[10px] text-slate-400 font-sans font-bold flex items-center gap-1">
                            <Target className="w-3.5 h-3.5 text-emerald-400" />
                            <span>亚盘跳变</span>
                          </span>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400">初：{box.earlyAsian}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-emerald-400 font-bold">终：{box.lateAsian}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 font-sans pt-1 border-t border-slate-800/60 leading-relaxed truncate">
                            {box.asianShift}
                          </p>
                        </div>

                        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
                          <span className="text-[10px] text-slate-400 font-sans font-bold flex items-center gap-1">
                            <Flame className="w-3.5 h-3.5 text-amber-400" />
                            <span>大小球跳变</span>
                          </span>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400">初：{box.earlyOU}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-amber-400 font-bold">终：{box.lateOU}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 font-sans pt-1 border-t border-slate-800/60 leading-relaxed truncate">
                            {box.ouShift}
                          </p>
                        </div>
                      </div>

                      {/* 4-Step Deduction Walkthrough */}
                      {isAllBatchShowcaseExpanded && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 space-y-1">
                            <div className="text-slate-400 font-bold text-[11px]">
                              第一阶段 · 早盘基石建仓
                            </div>
                            <p className="text-slate-300 text-[11px] leading-relaxed">
                              {box.step1}
                            </p>
                          </div>
                          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 space-y-1">
                            <div className="text-slate-400 font-bold text-[11px]">
                              第二阶段 · 资金发酵沉淀
                            </div>
                            <p className="text-slate-300 text-[11px] leading-relaxed">
                              {box.step2}
                            </p>
                          </div>
                          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 space-y-1">
                            <div className="text-cyan-300 font-bold text-[11px]">
                              第三阶段 · 临场风控变轨
                            </div>
                            <p className="text-slate-300 text-[11px] leading-relaxed">
                              {box.step3}
                            </p>
                          </div>
                          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 space-y-1">
                            <div className="text-emerald-300 font-bold text-[11px]">
                              第四阶段 · 终局印证与避坑
                            </div>
                            <p className="text-slate-300 text-[11px] leading-relaxed">
                              {box.step4}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
      {/* 1. Core Orientation Banner: How to Use this Section */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/40 rounded-xl p-4 shadow-lg">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-wide">
              💡 指南：五大模型板块究竟怎么用？如何指导实战？
            </h2>
            <p className="text-xs text-slate-400">
              它是整个《财富经》系统的<strong>“宪法总纲”与“测谎大脑”</strong>，日常使用只需牢记以下三点：
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-2">
          <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-1">
            <div className="text-emerald-400 font-bold flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[11px] font-mono">1</span>
              <span>您无需手动套用（系统自动诊断）</span>
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              在「单场台」输入或在「批量大盘」导入 Markdown 时，<strong>系统算法会自动拿着这五大模型进行量化诊断</strong>，自动给每场比赛打上模型标签，无需您死记硬背！
            </p>
          </div>

          <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-1">
            <div className="text-cyan-400 font-bold flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[11px] font-mono">2</span>
              <span>实战字典对照（看庄家底牌）</span>
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              当批量大盘判定某场为【高息诱上】或【平赔低洼】时，来本板块查阅<strong>庄家的资金意图、散户最常犯的致死陷阱与《财富经》破局买法</strong>。
            </p>
          </div>

          <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-1">
            <div className="text-amber-400 font-bold flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[11px] font-mono">3</span>
              <span>原地动态沙盘推演（无需跳走）</span>
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              每个模型都配有<strong>真实历史战役的四步沙盘推演</strong>。直接在下方卡片中展开学习初盘到终盘的资金变轨；若需手动调参，也可自主选择跳转到三维测谎工作台！
            </p>
          </div>
        </div>
      </div>

      {/* 2. Interactive 30-Second Fast Diagnostic Tool */}
      <div className="bg-slate-900 border border-cyan-500/40 rounded-xl p-4 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                ⚡ 盘口 30 秒实战交互对号入座 · 极速测谎仪
              </h3>
              <p className="text-[11px] text-slate-400">
                手里拿着一场比赛不知道属于哪个模型？点击选择 3 个盘赔特征，系统立即为您确诊操盘意图！
              </p>
            </div>
          </div>
          <span className="text-[11px] text-cyan-300 font-mono self-start sm:self-auto px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/40">
            交互式自测
          </span>
        </div>

        {/* 3 Step Interactive Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {/* Criterion 1: Euro Odds Trend */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
            <span className="text-slate-300 font-bold block">① 欧指走势特征：</span>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setDiagEuroTrend('DROP')}
                className={`w-full p-2 rounded text-left transition-all border flex items-center justify-between cursor-pointer ${
                  diagEuroTrend === 'DROP'
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>主胜持续大幅下调 (去水)</span>
                {diagEuroTrend === 'DROP' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
              </button>
              <button
                type="button"
                onClick={() => setDiagEuroTrend('DRAW_LOW')}
                className={`w-full p-2 rounded text-left transition-all border flex items-center justify-between cursor-pointer ${
                  diagEuroTrend === 'DRAW_LOW'
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>平赔死压低洼 (&lt;3.00)</span>
                {diagEuroTrend === 'DRAW_LOW' && <Check className="w-3.5 h-3.5 text-cyan-400" />}
              </button>
              <button
                type="button"
                onClick={() => setDiagEuroTrend('RISE_OR_FLAT')}
                className={`w-full p-2 rounded text-left transition-all border flex items-center justify-between cursor-pointer ${
                  diagEuroTrend === 'RISE_OR_FLAT'
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>主胜抬升 / 胜负两头震荡</span>
                {diagEuroTrend === 'RISE_OR_FLAT' && <Check className="w-3.5 h-3.5 text-amber-400" />}
              </button>
            </div>
          </div>

          {/* Criterion 2: Asian Handicap Line Trend */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
            <span className="text-slate-300 font-bold block">② 亚盘形态变动：</span>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setDiagAsianTrend('SAME_OR_DEEP')}
                className={`w-full p-2 rounded text-left transition-all border flex items-center justify-between cursor-pointer ${
                  diagAsianTrend === 'SAME_OR_DEEP'
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>维持原盘深让 / 真实设阻</span>
                {diagAsianTrend === 'SAME_OR_DEEP' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
              </button>
              <button
                type="button"
                onClick={() => setDiagAsianTrend('UP_LINE')}
                className={`w-full p-2 rounded text-left transition-all border flex items-center justify-between cursor-pointer ${
                  diagAsianTrend === 'UP_LINE'
                    ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>强行升盘 (如一球升一球半)</span>
                {diagAsianTrend === 'UP_LINE' && <Check className="w-3.5 h-3.5 text-rose-400" />}
              </button>
              <button
                type="button"
                onClick={() => setDiagAsianTrend('DOWN_LINE')}
                className={`w-full p-2 rounded text-left transition-all border flex items-center justify-between cursor-pointer ${
                  diagAsianTrend === 'DOWN_LINE'
                    ? 'bg-purple-500/20 border-purple-500/50 text-purple-300 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>剧烈退盘 (如一球退半一/半球)</span>
                {diagAsianTrend === 'DOWN_LINE' && <Check className="w-3.5 h-3.5 text-purple-400" />}
              </button>
              <button
                type="button"
                onClick={() => setDiagAsianTrend('SHALLOW')}
                className={`w-full p-2 rounded text-left transition-all border flex items-center justify-between cursor-pointer ${
                  diagAsianTrend === 'SHALLOW'
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>浅让步平手 / 平半不设防</span>
                {diagAsianTrend === 'SHALLOW' && <Check className="w-3.5 h-3.5 text-amber-400" />}
              </button>
            </div>
          </div>

          {/* Criterion 3: Water/Odds Level */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
            <span className="text-slate-300 font-bold block">③ 上盘终盘水位：</span>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setDiagWaterLevel('LOW')}
                className={`w-full p-2 rounded text-left transition-all border flex items-center justify-between cursor-pointer ${
                  diagWaterLevel === 'LOW'
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>&lt; 1.80 极低水 (榨水避险)</span>
                {diagWaterLevel === 'LOW' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
              </button>
              <button
                type="button"
                onClick={() => setDiagWaterLevel('MID')}
                className={`w-full p-2 rounded text-left transition-all border flex items-center justify-between cursor-pointer ${
                  diagWaterLevel === 'MID'
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>1.85 ~ 1.95 均衡中水区间</span>
                {diagWaterLevel === 'MID' && <Check className="w-3.5 h-3.5 text-cyan-400" />}
              </button>
              <button
                type="button"
                onClick={() => setDiagWaterLevel('HIGH_FULL')}
                className={`w-full p-2 rounded text-left transition-all border flex items-center justify-between cursor-pointer ${
                  diagWaterLevel === 'HIGH_FULL'
                    ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>2.00 ~ 2.08 超高水 / 满水利诱</span>
                {diagWaterLevel === 'HIGH_FULL' && <Check className="w-3.5 h-3.5 text-rose-400" />}
              </button>
            </div>
          </div>
        </div>

        {/* Real-Time Diagnostic Output Banner */}
        <div className="bg-gradient-to-r from-cyan-950/40 via-slate-950 to-slate-900 border border-cyan-500/30 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-cyan-300">
                {diagnosedResult.verdict}
              </span>
              <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                匹配模型 0{diagnosedResult.modelIdx + 1}
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              👉 <strong>《财富经》破局买法</strong>：{diagnosedResult.advice}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveModel(diagnosedResult.modelIdx);
                setIsSandboxOpen(true);
              }}
              className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 font-bold text-xs rounded-lg transition-all flex items-center gap-1 cursor-pointer"
            >
              <span>查看确诊模型沙盘</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Five Classic Models Cheat Sheet Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <Table className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">五大模型实战作战速查表（一览无余）</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[760px]">
            <thead className="bg-slate-950/80 text-slate-400 text-[11px] uppercase border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">模型名称</th>
                <th className="py-2.5 px-3">盘赔核心特征</th>
                <th className="py-2.5 px-3">庄家真实意图</th>
                <th className="py-2.5 px-3">散户常见致死陷阱</th>
                <th className="py-2.5 px-3 text-right">《财富经》决断操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 font-sans">
              {models.map((m, idx) => (
                <tr
                  key={m.id}
                  onClick={() => {
                    setActiveModel(idx);
                    setIsSandboxOpen(true);
                  }}
                  className={`cursor-pointer transition-colors ${
                    activeModel === idx ? 'bg-slate-800/80' : 'hover:bg-slate-850/60'
                  }`}
                >
                  <td className="py-3 px-3 font-bold text-white whitespace-nowrap">
                    <span className="text-emerald-400 font-mono mr-1">0{idx + 1}.</span>
                    <span>{m.title.replace(/[【】]/g, '')}</span>
                  </td>
                  <td className="py-3 px-3 text-slate-300 font-mono text-[11px]">
                    {m.formula}
                  </td>
                  <td className="py-3 px-3 text-cyan-300 text-[11px]">
                    {idx === 0 && '怕打出，压低水降低赔付成本'}
                    {idx === 1 && '造大胜假象，挂满水吸筹诱上'}
                    {idx === 2 && '截获突发利空，紧急退盘止损'}
                    {idx === 3 && '筑防御红线于平赔，通吃两端'}
                    {idx === 4 && '豪门让步无力，机构判其死刑'}
                  </td>
                  <td className="py-3 px-3 text-rose-300 text-[11px]">
                    {idx === 0 && '嫌水位1.75太低博冷反被杀'}
                    {idx === 1 && '沉迷豪门光环贪图满水暴利'}
                    {idx === 2 && '误判豪门退盘是吓退资金盲目抄底'}
                    {idx === 3 && '赌两端单边忽略平赔破3.00防线'}
                    {idx === 4 && '迷信“强队主场总能赢一个”'}
                  </td>
                  <td className="py-3 px-3 text-right whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-xs font-black border ${m.badgeColor}`}>
                      {m.actionPick}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Five Classic Models Navigation & IN-SITU Sandbox Simulation */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">五大经典模型全景深度剖析与原地沙盘推演</h3>
          </div>
          <span className="text-[11px] text-slate-400">点击标签切换模型，直接在下方查看动态推演</span>
        </div>

        {/* Model Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
          {models.map((m, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveModel(idx)}
              className={`p-2.5 rounded-lg text-left transition-all border cursor-pointer ${
                activeModel === idx
                  ? 'bg-slate-800 border-emerald-500/60 shadow text-white'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <div className="text-[10px] font-mono text-emerald-400 font-semibold mb-0.5">
                模型 0{idx + 1}
              </div>
              <div className="text-xs font-bold truncate">{m.title.replace(/[【】]/g, '')}</div>
            </button>
          ))}
        </div>

        {/* Active Model Deep Dive Card */}
        {models[activeModel] && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
            {/* Model Card Header & Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-850 pb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-base font-black text-white">{models[activeModel].title}</h4>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${models[activeModel].badgeColor}`}>
                    {models[activeModel].badge}
                  </span>
                </div>
                <p className="text-xs text-emerald-400 mt-1 font-medium">
                  {models[activeModel].subTitle}
                </p>
              </div>

              {/* In-situ Sandbox Toggle & Explicit Workbench Jump Button */}
              <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setIsSandboxOpen(!isSandboxOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-cyan-300 border border-cyan-500/40 text-xs font-bold rounded-lg shadow cursor-pointer transition-colors"
                  title="在当前页面直接展开或收起该案例的早晚盘动态博弈推演，不跳走页面"
                >
                  <History className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{isSandboxOpen ? '收起沙盘推演' : '展开沙盘实战推演 (原地演练)'}</span>
                  {isSandboxOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {sandboxTarget === 'batch' ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (onNavigateToWorkbench) onNavigateToWorkbench();
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-black rounded-lg shadow cursor-pointer transition-all"
                    title="前往「三维测谎」工作台批量展示视图"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>前往「三维测谎」批量视图</span>
                    <ExternalLink className="w-3 h-3 ml-0.5" />
                  </button>
                ) : sandboxTarget === 'single' && activeSelectedMatch ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (onSelectMatch) onSelectMatch(activeSelectedMatch.data);
                      if (onNavigateToWorkbench) onNavigateToWorkbench();
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 text-xs font-black rounded-lg shadow cursor-pointer transition-all"
                    title={`前往「三维测谎」工作台研判当前选定比赛：${activeSelectedMatch.data.matchInfo.homeTeam} vs ${activeSelectedMatch.data.matchInfo.awayTeam}`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>前往「三维测谎」研判当前比赛 ({activeSelectedMatch.data.matchInfo.homeTeam})</span>
                    <ExternalLink className="w-3 h-3 ml-0.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const found = PRESET_CASES.find((c) => c.id === models[activeModel].presetId);
                      if (found) onLoadPreset(found);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-black rounded-lg shadow cursor-pointer transition-colors"
                    title="载入该比赛全套初盘终盘数据，前往「三维测谎」工作台进行参数微调与 AI 测谎报告查看"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>载入教学预设到「三维测谎」</span>
                    <ExternalLink className="w-3 h-3 ml-0.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Model Formula and Theory */}
            <div className="space-y-2 text-xs">
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 font-semibold">【判决公式与形态】：</span>
                <span className="text-slate-200 font-mono font-medium">{models[activeModel].formula}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 space-y-1">
                  <div className="text-cyan-400 font-bold">机构操盘底牌剖析</div>
                  <p className="text-slate-300 leading-relaxed">{models[activeModel].mindset}</p>
                </div>
                <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 space-y-1">
                  <div className="text-rose-400 font-bold">散户盲区与致死陷阱</div>
                  <p className="text-slate-300 leading-relaxed">{models[activeModel].traps}</p>
                </div>
                <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 space-y-1">
                  <div className="text-amber-400 font-bold">《财富经》避坑断语</div>
                  <p className="text-slate-300 leading-relaxed font-semibold">{models[activeModel].rule}</p>
                </div>
              </div>
            </div>

            {/* IN-SITU INTERACTIVE SANDBOX SIMULATION (Directly addressing user feedback!) */}
            {isSandboxOpen && activeSandbox && (
              <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-cyan-500/30 rounded-xl p-4 space-y-4 shadow-xl animate-in fade-in duration-200">
                {/* 1. Sandbox Target Switcher: Batch vs Single vs Preset */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-950/90 p-2.5 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1">
                      <Target className="w-3.5 h-3.5 text-cyan-400" />
                      <span>推演展示模式：</span>
                    </span>
                    <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-xs">
                      <button
                        type="button"
                        onClick={() => setSandboxTarget('batch')}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all font-bold cursor-pointer ${
                          sandboxTarget === 'batch'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5 text-emerald-400" />
                        <span>📑 批量全览</span>
                        <span className="text-[10px] text-emerald-400 font-mono font-normal">
                          (共 {batchQueue.length} 场)
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSandboxTarget('single')}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all font-bold cursor-pointer ${
                          sandboxTarget === 'single'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Target className="w-3.5 h-3.5 text-cyan-400" />
                        <span>🎯 单场精推</span>
                        {activeSelectedMatch && (
                          <span className="text-[10px] text-cyan-400 font-mono font-normal">
                            ({activeSelectedMatch.data.matchInfo.homeTeam})
                          </span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setSandboxTarget('preset')}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all font-bold cursor-pointer ${
                          sandboxTarget === 'preset'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                        <span>📚 教学案例</span>
                        <span className="text-[10px] text-amber-400 font-mono font-normal">
                          ({models[activeModel].caseName.split('（')[0].slice(0, 8)})
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Batch Actions or Single Match Dropdown */}
                  {sandboxTarget === 'single' && batchQueue && batchQueue.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">切换推演场次:</span>
                      <select
                        value={selectedMatchId || activeSelectedMatch?.id || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedMatchId(val);
                          const found = batchQueue.find((b) => b.id === val);
                          if (found && onSelectMatch) {
                            onSelectMatch(found.data);
                          }
                        }}
                        className="bg-slate-900 border border-cyan-500/40 text-cyan-300 text-xs rounded-lg px-2.5 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
                      >
                        {batchQueue.map((b, i) => (
                          <option key={b.id} value={b.id}>
                            #{i + 1} {b.data.matchInfo.homeTeam} vs {b.data.matchInfo.awayTeam} ({b.data.matchInfo.league || '联赛'})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {sandboxTarget === 'batch' && batchQueue.length > 0 && (
                    <button
                      type="button"
                      onClick={handleCopyBatchSandbox}
                      className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 cursor-pointer"
                    >
                      {copiedBatchSandbox ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400 font-bold">已复制全部沙盘合辑</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-emerald-400" />
                          <span>一键复制 {batchQueue.length} 场沙盘合辑 (Markdown)</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* BATCH ALL MATCHES STREAM */}
                {sandboxTarget === 'batch' ? (
                  <div className="space-y-4">
                    {/* Model Filter Pills */}
                    {batchQueue.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap text-xs bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Filter className="w-3 h-3 text-cyan-400" />
                          <span>按操盘模型筛选:</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setBatchModelFilter('ALL')}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors cursor-pointer ${
                            batchModelFilter === 'ALL'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          全部 ({batchQueue.length})
                        </button>
                        {models.map((m) => {
                          const count = batchQueue.filter((b) => {
                            const rep = b.report || generateActuarialRuleReport(b.data);
                            return rep.identifiedModel === m.id;
                          }).length;
                          if (count === 0) return null;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setBatchModelFilter(m.id)}
                              className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors cursor-pointer ${
                                batchModelFilter === m.id
                                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                              }`}
                            >
                              {m.title.replace(/[【】]/g, '').slice(0, 4)} ({count})
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {batchQueue.length === 0 ? (
                      <div className="bg-slate-950/80 p-8 rounded-xl border border-slate-800 text-center space-y-2">
                        <div className="text-slate-400 text-xs">当前批量队列为空，尚未导入多场次比赛数据。</div>
                        <p className="text-[11px] text-slate-500">
                          请在顶部点击「上传附件」导入 Markdown 或 CSV 格式比赛，即可在此批量全览所有场次的四步沙盘推演！
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {batchQueue
                          .filter((item) => {
                            if (batchModelFilter === 'ALL') return true;
                            const rep = item.report || generateActuarialRuleReport(item.data);
                            return rep.identifiedModel === batchModelFilter;
                          })
                          .map((item, idx) => {
                            const rep = item.report || generateActuarialRuleReport(item.data);
                            const box = buildMatchSandbox(item.data, rep, item.finalScore);
                            const modelItem = models.find((m) => m.id === rep.identifiedModel);
                            return (
                              <div
                                key={item.id}
                                className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-3.5 shadow-md relative"
                              >
                                {/* Header */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="w-5 h-5 rounded bg-emerald-500/15 text-emerald-400 font-mono text-[11px] font-bold flex items-center justify-center">
                                      #{idx + 1}
                                    </span>
                                    <h5 className="text-sm font-black text-white">
                                      {box.matchTitle}
                                    </h5>
                                    <span className="text-[11px] text-slate-400 font-mono">
                                      ({box.league})
                                    </span>
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                        modelItem?.badgeColor ||
                                        'bg-slate-800 text-slate-400 border-slate-700'
                                      }`}
                                    >
                                      【{rep.modelTitle}】
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <div className="text-xs font-mono font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/40">
                                      {box.finalScore}
                                    </div>
                                    {onSelectMatch && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onSelectMatch(item.data);
                                          if (onNavigateToWorkbench) onNavigateToWorkbench();
                                        }}
                                        className="px-2.5 py-1 text-xs font-bold bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-slate-200 rounded border border-slate-700 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                      >
                                        <span>三维研判</span>
                                        <ArrowRight className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Story */}
                                <div className="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                                  <strong className="text-amber-300">战意与题材背景：</strong>
                                  {box.story}
                                </div>

                                {/* Odds Transition Card */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs font-mono">
                                  <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 space-y-1">
                                    <span className="text-[10px] text-slate-400 font-sans font-bold flex items-center gap-1">
                                      <Activity className="w-3.5 h-3.5 text-cyan-400" />
                                      <span>欧指跳变</span>
                                    </span>
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="text-slate-400">初：{box.earlyEuro}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="text-cyan-400 font-bold">终：{box.lateEuro}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-sans pt-1 border-t border-slate-800/60 leading-relaxed truncate">
                                      {box.euroShift}
                                    </p>
                                  </div>

                                  <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 space-y-1">
                                    <span className="text-[10px] text-slate-400 font-sans font-bold flex items-center gap-1">
                                      <Target className="w-3.5 h-3.5 text-emerald-400" />
                                      <span>亚盘跳变</span>
                                    </span>
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="text-slate-400">初：{box.earlyAsian}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="text-emerald-400 font-bold">终：{box.lateAsian}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-sans pt-1 border-t border-slate-800/60 leading-relaxed truncate">
                                      {box.asianShift}
                                    </p>
                                  </div>

                                  <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 space-y-1">
                                    <span className="text-[10px] text-slate-400 font-sans font-bold flex items-center gap-1">
                                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                                      <span>大小球跳变</span>
                                    </span>
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="text-slate-400">初：{box.earlyOU}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="text-amber-400 font-bold">终：{box.lateOU}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-sans pt-1 border-t border-slate-800/60 leading-relaxed truncate">
                                      {box.ouShift}
                                    </p>
                                  </div>
                                </div>

                                {/* 4-Step Deduction Walkthrough */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                                  <div className="bg-slate-900/70 p-2.5 rounded-lg border border-slate-800 space-y-1">
                                    <div className="text-slate-400 font-bold text-[11px]">
                                      第一阶段 · 早盘基石建仓
                                    </div>
                                    <p className="text-slate-300 text-[11px] leading-relaxed">
                                      {box.step1}
                                    </p>
                                  </div>
                                  <div className="bg-slate-900/70 p-2.5 rounded-lg border border-slate-800 space-y-1">
                                    <div className="text-slate-400 font-bold text-[11px]">
                                      第二阶段 · 资金发酵沉淀
                                    </div>
                                    <p className="text-slate-300 text-[11px] leading-relaxed">
                                      {box.step2}
                                    </p>
                                  </div>
                                  <div className="bg-slate-900/70 p-2.5 rounded-lg border border-slate-800 space-y-1">
                                    <div className="text-cyan-300 font-bold text-[11px]">
                                      第三阶段 · 临场风控变轨
                                    </div>
                                    <p className="text-slate-300 text-[11px] leading-relaxed">
                                      {box.step3}
                                    </p>
                                  </div>
                                  <div className="bg-slate-900/70 p-2.5 rounded-lg border border-slate-800 space-y-1">
                                    <div className="text-emerald-300 font-bold text-[11px]">
                                      第四阶段 · 终局印证与避坑
                                    </div>
                                    <p className="text-slate-300 text-[11px] leading-relaxed">
                                      {box.step4}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                ) : (
                  /* SINGLE OR PRESET MATCH VIEW */
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-bold text-xs">
                          🎲
                        </span>
                        <h5 className="text-sm font-black text-white">
                          【{activeSandbox.matchTitle}】真实战役 · 盘赔动态博弈推演沙盘
                        </h5>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {activeSandbox.league}
                        </span>
                      </div>
                      <div className="text-xs font-mono font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/40 self-start sm:self-auto">
                        赛果：{activeSandbox.finalScore}
                      </div>
                    </div>

                    {/* Pre-Match Context */}
                    <div className="text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                      <strong className="text-amber-300">战意与题材背景：</strong>{activeSandbox.story}
                    </div>

                    {/* Odds Transition Card: Early vs Late */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
                      {/* Euro Odds Transition */}
                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
                        <span className="text-[11px] text-slate-400 font-sans font-bold flex items-center gap-1">
                          <Activity className="w-3.5 h-3.5 text-cyan-400" />
                          <span>欧指（百家平均）跳变</span>
                        </span>
                        <div className="flex items-center justify-between pt-1 text-[11px]">
                          <span className="text-slate-400">早盘初赔：</span>
                          <span className="text-slate-200 font-bold">{activeSandbox.earlyEuro}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-cyan-400 font-bold">临场终赔：</span>
                          <span className="text-cyan-300 font-black">{activeSandbox.lateEuro}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-sans pt-1 border-t border-slate-800/60 leading-relaxed">
                          {activeSandbox.euroShift}
                        </p>
                      </div>

                      {/* Asian Handicap Transition */}
                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
                        <span className="text-[11px] text-slate-400 font-sans font-bold flex items-center gap-1">
                          <Target className="w-3.5 h-3.5 text-emerald-400" />
                          <span>亚盘（机构风向标）跳变</span>
                        </span>
                        <div className="flex items-center justify-between pt-1 text-[11px]">
                          <span className="text-slate-400">早盘初指：</span>
                          <span className="text-slate-200 font-bold">{activeSandbox.earlyAsian}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-emerald-400 font-bold">临场终盘：</span>
                          <span className="text-emerald-300 font-black">{activeSandbox.lateAsian}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-sans pt-1 border-t border-slate-800/60 leading-relaxed">
                          {activeSandbox.asianShift}
                        </p>
                      </div>

                      {/* Over/Under Transition */}
                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
                        <span className="text-[11px] text-slate-400 font-sans font-bold flex items-center gap-1">
                          <Flame className="w-3.5 h-3.5 text-amber-400" />
                          <span>大小球（进球预期）跳变</span>
                        </span>
                        <div className="flex items-center justify-between pt-1 text-[11px]">
                          <span className="text-slate-400">早盘初线：</span>
                          <span className="text-slate-200 font-bold">{activeSandbox.earlyOU}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-amber-400 font-bold">临场终线：</span>
                          <span className="text-amber-300 font-black">{activeSandbox.lateOU}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-sans pt-1 border-t border-slate-800/60 leading-relaxed">
                          {activeSandbox.ouShift}
                        </p>
                      </div>
                    </div>

                    {/* Step-by-Step Actuarial Deduction Walkthrough */}
                    <div className="space-y-2 pt-1 text-xs">
                      <div className="text-slate-300 font-bold flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-cyan-400" />
                        <span>四步沙盘操盘博弈测谎推演：</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 space-y-1">
                          <div className="text-slate-400 font-bold text-[11px]">第一阶段 · 早盘意图</div>
                          <p className="text-slate-300 text-[11px] leading-relaxed">{activeSandbox.step1}</p>
                        </div>
                        <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 space-y-1">
                          <div className="text-slate-400 font-bold text-[11px]">第二阶段 · 资金发酵</div>
                          <p className="text-slate-300 text-[11px] leading-relaxed">{activeSandbox.step2}</p>
                        </div>
                        <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 space-y-1">
                          <div className="text-cyan-300 font-bold text-[11px]">第三阶段 · 临场风控变轨</div>
                          <p className="text-slate-300 text-[11px] leading-relaxed">{activeSandbox.step3}</p>
                        </div>
                        <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 space-y-1">
                          <div className="text-emerald-300 font-bold text-[11px]">第四阶段 · 终局印证</div>
                          <p className="text-slate-300 text-[11px] leading-relaxed">{activeSandbox.step4}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Over/Under Cross-Examination Matrix */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">
          <Flame className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-white">三维联动：大小球联动测谎口诀表</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
            <div className="text-emerald-400 font-bold">
              深让步 (-1.25+) + 浅大小球 (2.25)
            </div>
            <p className="text-slate-400 leading-relaxed">
              强队让球极深，但大小球死卡浅线。机构深知强队破门乏力或对手打法极度坚韧，强烈指向 <strong className="text-white">1-0、2-0</strong> 经济型小胜。
            </p>
            <div className="text-[11px] font-mono text-emerald-400 font-semibold">
              ➔ 最终判定：去小球，防让平
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
            <div className="text-cyan-400 font-bold">
              浅让步 (平手/平半) + 深大小球 (2.75+)
            </div>
            <p className="text-slate-400 leading-relaxed">
              胜负盘势均力敌无让步阻力，但大小球暴力拉深。揭示两队防线形同虚设，战术大开大合，机构真实底牌引导对攻刷大。
            </p>
            <div className="text-[11px] font-mono text-cyan-400 font-semibold">
              ➔ 最终判定：直接追大球，双飞破门
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
            <div className="text-rose-400 font-bold">
              大球题材 + 死卡 2.5 仅降水不升盘
            </div>
            <p className="text-slate-400 leading-relaxed">
              市场充斥进球大战的狂热题材，但庄家死卡 2.5 盘口不越雷池，仅做微降水诱上。假大球双向收割陷阱。
            </p>
            <div className="text-[11px] font-mono text-rose-400 font-semibold">
              ➔ 最终判定：反选小球，严防冷门下盘
            </div>
          </div>
        </div>
      </div>
        </div>
      )}
    </div>
  );
};
