import React, { useState, useMemo } from 'react';
import {
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Play,
  Trash2,
  Download,
  Flame,
  Plus,
  Sparkles,
  Star,
  Target,
  FileSpreadsheet,
  FileText,
  Eye,
  Check,
  Percent,
  BarChart3,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  Lock,
  Unlock,
  ShieldAlert,
  Award,
  ExternalLink,
  Clock,
  Zap,
  CheckCheck,
  X,
  Copy,
  History,
  Activity,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from 'lucide-react';
import { BatchMatchItem, FullMatchData, AnalysisReportResult } from '../types/fortuneActuary';
import { generateActuarialRuleReport } from '../utils/actuaryEngine';
import { MarkdownView } from './MarkdownView';
import { HandicapOddsDistributionChart } from './HandicapOddsDistributionChart';

interface BatchMatrixDashboardProps {
  queue: BatchMatchItem[];
  onSelectMatch: (match: FullMatchData) => void;
  onClearQueue: () => void;
  onResetToPresets?: () => void;
  onOpenUploadModal: () => void;
  onBatchAnalyzeAll: () => Promise<void>;
  isBatchAnalyzing: boolean;
  onToggleLockMatch?: (id: string) => void;
  onBatchLockMatches?: (lock: boolean) => void;
  onAutoLockStartedMatches?: (cutoffTime?: string) => number;
  importNotification?: {
    message: string;
    details: string;
    protectedCount: number;
    updatedCount: number;
    newCount: number;
  } | null;
  onDismissNotification?: () => void;
  onRecordScoreAndReview?: (id: string, homeScore: number, awayScore: number, incidents?: string) => void;
  onNavigateToReview?: () => void;
}

export const BatchMatrixDashboard: React.FC<BatchMatrixDashboardProps> = ({
  queue,
  onSelectMatch,
  onClearQueue,
  onResetToPresets,
  onOpenUploadModal,
  onBatchAnalyzeAll,
  isBatchAnalyzing,
  onToggleLockMatch,
  onBatchLockMatches,
  onAutoLockStartedMatches,
  importNotification,
  onDismissNotification,
  onRecordScoreAndReview,
  onNavigateToReview,
}) => {
  const [viewStyle, setViewStyle] = useState<'matrix' | 'cards' | 'sandbox'>('matrix');
  const [starFilter, setStarFilter] = useState<number | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<'stars' | 'time' | 'default'>('stars');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  // Secondary sort preference when sorting by stars:
  // 'certainty' (稳胆确定性优先：极限榨水 > 平赔低洼 > 高息吸筹) vs 'time' (临场早开赛优先)
  const [subSortBy, setSubSortBy] = useState<'certainty' | 'time'>('certainty');
  const [isGroupedByTier, setIsGroupedByTier] = useState<boolean>(false);
  const [copiedBatch, setCopiedBatch] = useState(false);
  const [copiedCombo, setCopiedCombo] = useState(false);
  const [showD3Chart, setShowD3Chart] = useState(true);

  // Auto-lock by kickoff time modal & toast
  const [isAutoLockModalOpen, setIsAutoLockModalOpen] = useState(false);
  const [cutoffInput, setCutoffInput] = useState<string>('00:00');
  const [lockFeedbackToast, setLockFeedbackToast] = useState<string | null>(null);

  // Quick Post-Match Review Modal State
  const [reviewTarget, setReviewTarget] = useState<{
    item: BatchMatchItem;
    report: AnalysisReportResult;
  } | null>(null);
  const [homeGoals, setHomeGoals] = useState<number>(0);
  const [awayGoals, setAwayGoals] = useState<number>(0);
  const [incidents, setIncidents] = useState<string>('');
  const [reviewSuccessMsg, setReviewSuccessMsg] = useState<string | null>(null);

  const getBadgeForModel = (model: string) => {
    switch (model) {
      case 'POSITIVE_CONTROL':
        return { text: '极限榨水', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' };
      case 'HIGH_INTEREST_TRAP':
        return { text: '高息诱上', cls: 'bg-rose-500/20 text-rose-400 border-rose-500/40' };
      case 'AVALANCHE_RETREAT':
        return { text: '雪崩退盘', cls: 'bg-purple-500/20 text-purple-400 border-purple-500/40' };
      case 'LOW_DRAW_DEFENSE':
        return { text: '平赔低洼', cls: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' };
      case 'SHALLOW_FULL_WATER':
        return { text: '浅盘满水', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/40' };
      default:
        return { text: '博弈调仓', cls: 'bg-slate-800 text-slate-400 border-slate-700' };
    }
  };

  const renderStarRating = (stars: number) => {
    return (
      <div className="flex items-center gap-0.5 text-amber-400">
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            className={`w-3.5 h-3.5 ${
              s <= stars ? 'fill-amber-400 text-amber-400' : 'text-slate-700 fill-slate-800'
            }`}
          />
        ))}
      </div>
    );
  };

  // Pre-process all items with computed actuarial reports
  const processedItems = useMemo(() => {
    return queue.map((item, originalIndex) => {
      const report = item.report || generateActuarialRuleReport(item.data);
      const dec = report.decision;
      const model = report.identifiedModel;
      const time = item.data.matchInfo.matchTime || '99:99';
      return {
        item,
        originalIndex,
        report,
        dec,
        model,
        time,
        stars: dec.starRating,
      };
    });
  }, [queue]);

  const fiveStarCount = useMemo(() => processedItems.filter((p) => p.stars === 5).length, [processedItems]);
  const fourStarCount = useMemo(() => processedItems.filter((p) => p.stars === 4).length, [processedItems]);
  const threeStarCount = useMemo(() => processedItems.filter((p) => p.stars === 3).length, [processedItems]);
  const lockedMatchesCount = useMemo(() => queue.filter((q) => q.isLocked).length, [queue]);

  // Apply star filter
  const filteredItems = useMemo(() => {
    if (starFilter === 'ALL') return processedItems;
    return processedItems.filter((p) => p.stars === starFilter);
  }, [processedItems, starFilter]);

  // Apply multi-tier sorting (stars, sub-sorting preferences, time, default)
  const sortedItems = useMemo(() => {
    const list = [...filteredItems];
    list.sort((a, b) => {
      if (sortBy === 'stars') {
        const starDiff = sortOrder === 'desc' ? b.stars - a.stars : a.stars - b.stars;
        if (starDiff !== 0) return starDiff;

        // Sub-sorting within the same star rating:
        if (subSortBy === 'time') {
          // Kick-off time chronological priority (early matches first to prevent missing bets)
          const timeDiff = a.time.localeCompare(b.time);
          if (timeDiff !== 0) return timeDiff;
        }

        // Sub-sort by model certainty / solid banker significance:
        // 极限榨水 (稳胆 4) -> 平赔低洼 (胆平 3) -> 高息吸筹 (杀猪盘反选 2) -> 浅盘满水 (1)
        const modelRank = (m: string) => {
          if (m === 'POSITIVE_CONTROL') return 4;
          if (m === 'LOW_DRAW_DEFENSE') return 3;
          if (m === 'HIGH_INTEREST_TRAP') return 2;
          if (m === 'SHALLOW_FULL_WATER') return 1;
          return 0;
        };
        const mDiff = modelRank(b.model) - modelRank(a.model);
        if (mDiff !== 0) return mDiff;

        // Finally by kick-off time
        return a.time.localeCompare(b.time);
      }

      if (sortBy === 'time') {
        const tCmp = a.time.localeCompare(b.time);
        return sortOrder === 'desc' ? -tCmp : tCmp;
      }

      // Default: original input order
      return sortOrder === 'desc'
        ? b.originalIndex - a.originalIndex
        : a.originalIndex - b.originalIndex;
    });
    return list;
  }, [filteredItems, sortBy, sortOrder, subSortBy]);

  // Tier groupings for tiered display
  const tier5Items = useMemo(() => sortedItems.filter((p) => p.stars === 5), [sortedItems]);
  const tier4Items = useMemo(() => sortedItems.filter((p) => p.stars === 4), [sortedItems]);
  const tier3Items = useMemo(() => sortedItems.filter((p) => p.stars <= 3), [sortedItems]);

  // Recommended Parlay Combo (2-in-1 / 3-in-1) based on high-star actuary selections
  const parlayRecommendation = useMemo(() => {
    const candidates = sortedItems.filter((p) => p.stars >= 4);
    if (candidates.length < 2) return null;

    const p1 = candidates[0];
    const p2 = candidates[1];

    return {
      match1: p1,
      match2: p2,
      title: '《财富经》今日核心稳胆 · 2串1 实战方案',
      description: '基于【星级最高 + 机构正向控赔避险 + 胆平/受让稳盘】精选的双胆组合，兼顾高胜率与风控防守',
      comboText: `【2串1实战方案】${p1.item.data.matchInfo.homeTeam} (${p1.dec.handicapPick} / ${p1.dec.euroPick}) × ${p2.item.data.matchInfo.homeTeam} (${p2.dec.handicapPick} / ${p2.dec.euroPick})`,
    };
  }, [sortedItems]);

  const toggleSort = (field: 'stars' | 'time' | 'default') => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const handleExecuteAutoLock = () => {
    if (onAutoLockStartedMatches) {
      const lockedCount = onAutoLockStartedMatches(cutoffInput.trim() || undefined);
      setLockFeedbackToast(
        lockedCount > 0
          ? `已成功锁定 ${lockedCount} 场比赛！终盘快照已冻结，再次导入 Markdown 自动免疫覆盖。`
          : `未发现符合截止时间（${cutoffInput}）且未锁定的比赛。`
      );
      setTimeout(() => setLockFeedbackToast(null), 3500);
    }
    setIsAutoLockModalOpen(false);
  };

  const handleCopyCombo = () => {
    if (!parlayRecommendation) return;
    const { match1, match2, title, description } = parlayRecommendation;
    const text = `🏆 ${title}\n` +
      `📌 组合理由：${description}\n` +
      `---------------------------------\n` +
      `第一胆 [${match1.stars}★ ${match1.report.modelTitle}]：${match1.item.data.matchInfo.homeTeam} vs ${match1.item.data.matchInfo.awayTeam} (${match1.item.data.matchInfo.matchTime})\n` +
      `👉 推荐：${match1.dec.handicapPick} ｜ 胜平负：${match1.dec.euroPick} ｜ 比分：${match1.dec.predictedScores.slice(0, 2).join('/')}\n\n` +
      `第二胆 [${match2.stars}★ ${match2.report.modelTitle}]：${match2.item.data.matchInfo.homeTeam} vs ${match2.item.data.matchInfo.awayTeam} (${match2.item.data.matchInfo.matchTime})\n` +
      `👉 推荐：${match2.dec.handicapPick} ｜ 胜平负：${match2.dec.euroPick} ｜ 比分：${match2.dec.predictedScores.slice(0, 2).join('/')}\n` +
      `---------------------------------\n` +
      `⚠️ 财富经风控：防范临场假变盘，已固化开赛终盘快照。`;

    navigator.clipboard.writeText(text);
    setCopiedCombo(true);
    setTimeout(() => setCopiedCombo(false), 2000);
  };

  const handleExportMarkdownSummary = () => {
    if (sortedItems.length === 0) return;
    let md = `# 《财富经》足彩批量决策大盘报告汇总 (${sortedItems.length} 场)\n\n`;
    md += `> **生成时间**：${new Date().toLocaleString()} ｜ **排序模式**：${
      sortBy === 'stars'
        ? sortOrder === 'desc'
          ? `推荐星级从高到低 (${subSortBy === 'certainty' ? '确定性稳胆优先' : '临场早开赛优先'})`
          : '推荐星级从低到高'
        : sortBy === 'time'
        ? '开赛时间排序'
        : '原始导入顺序'
    } ｜ **封盘固化**：已锁定 ${lockedMatchesCount}/${queue.length} 场\n\n`;

    if (parlayRecommendation) {
      const { match1, match2 } = parlayRecommendation;
      md += `### 🎯 【今日核心稳胆 2串1 实战方案推荐】\n`;
      md += `- **稳胆一**：**${match1.item.data.matchInfo.homeTeam}** vs **${match1.item.data.matchInfo.awayTeam}** (${match1.item.data.matchInfo.matchTime}) ｜ 推荐：\`${match1.dec.handicapPick}\` / **${match1.dec.euroPick}** (${match1.stars}★ ${match1.report.modelTitle})\n`;
      md += `- **稳胆二**：**${match2.item.data.matchInfo.homeTeam}** vs **${match2.item.data.matchInfo.awayTeam}** (${match2.item.data.matchInfo.matchTime}) ｜ 推荐：\`${match2.dec.handicapPick}\` / **${match2.dec.euroPick}** (${match2.stars}★ ${match2.report.modelTitle})\n`;
      md += `> **风控解析**：正向控赔真实避险 + 平赔低洼/反选保护，防范临场假盘，终盘快照已固化。\n\n---\n\n`;
    }

    if (tier5Items.length > 0) {
      md += `### 👑 【第一梯队 · 五星稳胆专区 (${tier5Items.length} 场)】\n\n`;
      md += `| 推荐星级 | 联赛/对阵 | 开赛时间 | 胜平负首选 | 让球首选 | 大小球首选 | 参考比分 | 操盘定性 | 封盘状态 |\n`;
      md += `| :---: | :--- | :---: | :---: | :--- | :---: | :---: | :---: | :---: |\n`;
      tier5Items.forEach(({ item, report, dec }) => {
        md += `| ★★★★★ | **${item.data.matchInfo.homeTeam}** vs **${item.data.matchInfo.awayTeam}** (${item.data.matchInfo.league}) | ${item.data.matchInfo.matchTime || '临场'} | **${dec.euroPick}** | \`${dec.handicapPick}\` | ${dec.overUnderPick} | ${dec.predictedScores.join(', ')} | **${report.modelTitle}** | ${item.isLocked ? '🔒已固化' : '未锁'} |\n`;
      });
      md += `\n`;
    }

    if (tier4Items.length > 0) {
      md += `### 💎 【第二梯队 · 四星重点博弈区 (${tier4Items.length} 场)】\n\n`;
      md += `| 推荐星级 | 联赛/对阵 | 开赛时间 | 胜平负首选 | 让球首选 | 大小球首选 | 参考比分 | 操盘定性 | 封盘状态 |\n`;
      md += `| :---: | :--- | :---: | :---: | :--- | :---: | :---: | :---: | :---: |\n`;
      tier4Items.forEach(({ item, report, dec }) => {
        md += `| ★★★★☆ | **${item.data.matchInfo.homeTeam}** vs **${item.data.matchInfo.awayTeam}** (${item.data.matchInfo.league}) | ${item.data.matchInfo.matchTime || '临场'} | **${dec.euroPick}** | \`${dec.handicapPick}\` | ${dec.overUnderPick} | ${dec.predictedScores.join(', ')} | **${report.modelTitle}** | ${item.isLocked ? '🔒已固化' : '未锁'} |\n`;
      });
      md += `\n`;
    }

    if (tier3Items.length > 0) {
      md += `### ⚡ 【第三梯队 · 三星常规调仓区 (${tier3Items.length} 场)】\n\n`;
      md += `| 推荐星级 | 联赛/对阵 | 开赛时间 | 胜平负首选 | 让球首选 | 大小球首选 | 参考比分 | 操盘定性 | 封盘状态 |\n`;
      md += `| :---: | :--- | :---: | :---: | :--- | :---: | :---: | :---: | :---: |\n`;
      tier3Items.forEach(({ item, report, dec }) => {
        md += `| ★★★☆☆ | **${item.data.matchInfo.homeTeam}** vs **${item.data.matchInfo.awayTeam}** (${item.data.matchInfo.league}) | ${item.data.matchInfo.matchTime || '临场'} | **${dec.euroPick}** | \`${dec.handicapPick}\` | ${dec.overUnderPick} | ${dec.predictedScores.join(', ')} | **${report.modelTitle}** | ${item.isLocked ? '🔒已固化' : '未锁'} |\n`;
      });
      md += `\n`;
    }

    md += `---\n\n## 逐场深度《财富经》三维测谎诊断\n\n`;
    sortedItems.forEach(({ item, report }, idx) => {
      md += `### 【${idx + 1}】${item.data.matchInfo.homeTeam} vs ${item.data.matchInfo.awayTeam} (${item.data.matchInfo.league})\n\n`;
      md += `- **开赛时刻**：${item.data.matchInfo.matchTime || '临场'} ｜ **盘口快照状态**：${item.isLocked ? `🔒已封盘固化 (${item.lockedAt || '开赛'})` : '🔓未封盘'}\n`;
      md += `1. **【盘面第一印象】**\n${report.firstImpression}\n\n`;
      md += `2. **【三维联动测谎】**\n${report.threeDimLieDetection}\n\n`;
      md += `3. **【财富经最终判定】**\n- **推荐方向**：${report.finalVerdict.direction}\n- **比分细化**：${report.finalVerdict.directionDetail}\n- **避坑提示**：${report.finalVerdict.riskWarning}\n\n---\n\n`;
    });

    navigator.clipboard.writeText(md);
    setCopiedBatch(true);
    setTimeout(() => setCopiedBatch(false), 2000);
  };

  const handleConfirmReview = () => {
    if (!reviewTarget || !onRecordScoreAndReview) return;
    onRecordScoreAndReview(reviewTarget.item.id, homeGoals, awayGoals, incidents);
    setReviewSuccessMsg('✅ 复盘核验已完成！已自动评估胜平负/让球/大小球命中率，并归档沉淀核心经验法则！');
    setTimeout(() => {
      setReviewTarget(null);
      setReviewSuccessMsg(null);
    }, 1400);
  };

  if (queue.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-slate-800 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
          <Layers className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-white">批量决策队列池为空</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            您可以点击“上传附件”上传赔率截图、导入快照文件或粘贴多场比赛。导入后支持一键批量测谎输出：推荐星级、胜平负首选、让球首选、大小球首选与参考比分！
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={onOpenUploadModal}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-lg shadow-lg inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>立即上传截图或导入批量文件</span>
          </button>
          {onResetToPresets && (
            <button
              type="button"
              onClick={onResetToPresets}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs rounded-lg border border-slate-700 shadow inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-cyan-400" />
              <span>载入 5 场经典教学预设案例</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Row Renderer for Matrix Table
  const renderTableRow = (
    { item, report, dec, originalIndex }: (typeof sortedItems)[0],
    idx: number
  ) => {
    const badge = getBadgeForModel(report.identifiedModel);
    const isFiveStar = dec.starRating === 5;
    const isFourStar = dec.starRating === 4;

    return (
      <tr
        key={item.id}
        onClick={() => onSelectMatch(item.data)}
        className={`transition-colors group cursor-pointer ${
          isFiveStar
            ? 'border-l-4 border-l-amber-400 bg-gradient-to-r from-amber-500/[0.08] via-amber-500/[0.02] to-transparent hover:bg-amber-500/[0.12]'
            : isFourStar
            ? 'border-l-4 border-l-emerald-400 bg-gradient-to-r from-emerald-500/[0.05] via-emerald-500/[0.01] to-transparent hover:bg-emerald-500/[0.08]'
            : 'border-l-4 border-l-slate-800 hover:bg-slate-850/80'
        }`}
      >
        {/* Number & Original Rank */}
        <td className="py-3 px-3 font-mono text-center">
          {isFiveStar ? (
            <div className="font-extrabold text-amber-400 text-xs">
              TOP {idx + 1}
            </div>
          ) : (
            <div className="font-bold text-slate-400 text-xs">
              {idx + 1}
            </div>
          )}
          <div className="text-[9px] text-slate-500 font-mono mt-0.5">
            原#{originalIndex + 1}
          </div>
        </td>

        {/* 1. 推荐星级 */}
        <td className="py-3 px-3 whitespace-nowrap">
          {renderStarRating(dec.starRating)}
          <div className="flex items-center gap-1 mt-0.5">
            <span className={`text-[10px] font-mono ${isFiveStar ? 'text-amber-400 font-bold' : 'text-slate-400'}`}>
              {dec.starRating}星置信度
            </span>
            {isFiveStar && (
              <span className="px-1 py-0.2 rounded text-[9px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                {report.identifiedModel === 'POSITIVE_CONTROL'
                  ? '稳胆'
                  : report.identifiedModel === 'LOW_DRAW_DEFENSE'
                  ? '胆平'
                  : '核心'}
              </span>
            )}
          </div>
        </td>

        {/* 赛事对阵 */}
        <td className="py-3 px-4 min-w-[240px] whitespace-nowrap">
          <div className="flex items-center gap-1.5 font-bold text-white group-hover:text-emerald-300 transition-colors text-xs sm:text-[13px]">
            <span className="font-extrabold tracking-wide">{item.data.matchInfo.homeTeam}</span>
            <span className="text-[10px] font-mono text-slate-400 font-semibold px-1 py-0.2 rounded bg-slate-950 border border-slate-800">
              VS
            </span>
            <span className="font-extrabold tracking-wide">{item.data.matchInfo.awayTeam}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1 font-mono">
            <span className="px-1.5 py-0.2 rounded bg-slate-800 text-emerald-400 font-semibold border border-slate-700/70">
              {item.data.matchInfo.league || '常规赛事'}
            </span>
            {item.data.matchInfo.matchTime && (
              <span className="text-slate-300 font-bold flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5 text-cyan-400" />
                <span>{item.data.matchInfo.matchTime}</span>
              </span>
            )}
            {item.isLocked && (
              <span
                className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold flex items-center gap-0.5"
                title={`🔒 终盘快照已固化 (${item.lockedAt || '已封盘'}) · 再次导入新 Markdown 时自动免疫覆盖，赛后复盘 100% 对应此时预测！`}
              >
                <Lock className="w-2.5 h-2.5 text-amber-400" />
                <span>终盘已锁</span>
              </span>
            )}
          </div>
        </td>

        {/* 2. 胜平负首选 */}
        <td className="py-3 px-3 font-bold whitespace-nowrap">
          <span
            className={`px-2 py-1 rounded text-xs border ${
              dec.euroPick.includes('主胜')
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                : dec.euroPick.includes('平')
                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                : 'bg-rose-500/15 text-rose-300 border-rose-500/40'
            }`}
          >
            {dec.euroPick}
          </span>
        </td>

        {/* 3. 让球首选 */}
        <td className="py-3 px-3 whitespace-nowrap">
          <div className="font-mono font-bold text-cyan-300">
            {dec.handicapPick}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            盘口: {item.data.asianHandicap.lateHandicap || '平手'} ｜ 主水 {item.data.asianHandicap.lateHomeOdds.toFixed(2)}
          </div>
        </td>

        {/* 4. 大小球首选 */}
        <td className="py-3 px-3 whitespace-nowrap">
          <span
            className={`font-mono text-xs font-semibold ${
              dec.overUnderPick.includes('大') ? 'text-amber-400' : 'text-cyan-400'
            }`}
          >
            {dec.overUnderPick}
          </span>
        </td>

        {/* 5. 参考比分 */}
        <td className="py-3 px-3 whitespace-nowrap">
          <div className="flex items-center gap-1 font-mono">
            {dec.predictedScores.slice(0, 3).map((score) => (
              <span
                key={score}
                className="px-1.5 py-0.5 bg-slate-950 text-slate-200 rounded border border-slate-800 text-[11px] font-semibold"
              >
                {score}
              </span>
            ))}
          </div>
        </td>

        {/* 操盘定性 */}
        <td className="py-3 px-3 whitespace-nowrap">
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badge.cls}`}>
            {badge.text}
          </span>
        </td>

        {/* 单场穿透 & 封盘复盘操作区 */}
        <td className="py-3 px-3 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-1.5">
            {/* Lock / Unlock Toggle Button */}
            {onToggleLockMatch && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLockMatch(item.id);
                }}
                className={`px-2 py-1 rounded text-[11px] font-bold border flex items-center gap-1 transition-all cursor-pointer ${
                  item.isLocked
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30'
                    : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'
                }`}
                title={
                  item.isLocked
                    ? `已锁定 (${item.lockedAt || '已封盘'})，点击可解除锁定`
                    : '锁定此场终盘快照与五项推荐，后续导入新 Markdown 时自动免疫覆盖'
                }
              >
                {item.isLocked ? (
                  <>
                    <Lock className="w-3 h-3 text-amber-400" />
                    <span>已锁</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3 h-3 text-slate-400" />
                    <span>锁定</span>
                  </>
                )}
              </button>
            )}

            {/* Post-match Review Button */}
            {item.isReviewed ? (
              <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold flex items-center gap-1">
                <CheckCheck className="w-3 h-3 text-emerald-400" />
                <span>完赛 {item.finalScore}</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setReviewTarget({ item, report });
                  setHomeGoals(0);
                  setAwayGoals(0);
                  setIncidents('');
                  setReviewSuccessMsg(null);
                }}
                className={`px-2 py-1 text-[11px] font-bold rounded transition-all flex items-center gap-1 cursor-pointer border ${
                  item.isLocked
                    ? 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border-cyan-500/50 shadow-sm'
                    : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border-slate-700'
                }`}
                title="赛后录入真实比分，自动与开赛前锁定的预测核验，并沉淀经验法则"
              >
                <Target className="w-3 h-3 text-cyan-400" />
                <span>复盘</span>
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectMatch(item.data);
              }}
              className="px-2 py-1 bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-300 text-[11px] font-bold rounded border border-slate-700 transition-all inline-flex items-center gap-1 cursor-pointer"
              title="载入左侧单场精算台"
            >
              <span>研判</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  // Card Stream Renderer
  const renderCardStreamItem = (
    { item, report: rep, dec, originalIndex }: (typeof sortedItems)[0],
    idx: number
  ) => {
    const badge = getBadgeForModel(rep.identifiedModel);
    const isFiveStar = dec.starRating === 5;

    return (
      <div
        key={item.id}
        className={`bg-slate-900 border rounded-xl p-5 shadow-lg space-y-4 hover:border-slate-700 transition-all ${
          isFiveStar
            ? 'border-amber-500/50 shadow-amber-500/5 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/10'
            : 'border-slate-800'
        }`}
      >
        {/* Match Card Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${isFiveStar ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-emerald-400 bg-emerald-500/10'}`}>
                TOP #{idx + 1} 场（原#{originalIndex + 1}）
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {item.data.matchInfo.league} ｜ {item.data.matchInfo.matchTime || '临场'}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold border ${badge.cls}`}>
                {badge.text}
              </span>
              <div className="ml-1">{renderStarRating(dec.starRating)}</div>
              {item.isLocked && (
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5 text-amber-400" />
                  <span>终盘快照已锁 ({item.lockedAt || '开赛'})</span>
                </span>
              )}
            </div>
            <h3 className="text-base font-black text-white mt-1">
              {item.data.matchInfo.homeTeam} VS {item.data.matchInfo.awayTeam}
            </h3>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {onToggleLockMatch && (
              <button
                type="button"
                onClick={() => onToggleLockMatch(item.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1 transition-all cursor-pointer ${
                  item.isLocked
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'
                }`}
                title="锁定/解锁终盘快照"
              >
                {item.isLocked ? (
                  <>
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>已封盘</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5" />
                    <span>锁定快照</span>
                  </>
                )}
              </button>
            )}

            {!item.isReviewed ? (
              <button
                type="button"
                onClick={() => {
                  setReviewTarget({ item, report: rep });
                  setHomeGoals(0);
                  setAwayGoals(0);
                  setIncidents('');
                  setReviewSuccessMsg(null);
                }}
                className="px-2.5 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
              >
                <Target className="w-3.5 h-3.5 text-cyan-400" />
                <span>赛后复盘</span>
              </button>
            ) : (
              <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold">
                完赛 {item.finalScore}
              </span>
            )}

            <button
              type="button"
              onClick={() => onSelectMatch(item.data)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>载入精算台</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Batch 5-Core Decision Grid for this Match */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          {/* 1. 推荐星级 */}
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400">推荐星级</div>
            <div className="mt-1">{renderStarRating(dec.starRating)}</div>
            <div className="text-[10px] text-amber-400 font-mono mt-0.5">
              {dec.starRating} 星置信度
            </div>
          </div>

          {/* 2. 胜平负首选 */}
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400">胜平负首选</div>
            <div className="font-black text-emerald-400 text-sm mt-0.5">
              {dec.euroPick}
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              {item.data.euroOdds.lateWin}/{item.data.euroOdds.lateDraw}/{item.data.euroOdds.lateLoss}
            </div>
          </div>

          {/* 3. 让球首选 */}
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>让球首选</span>
              <span className="text-[10px] text-cyan-400 font-mono font-bold bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-800/40">
                盘口: {item.data.asianHandicap.lateHandicap || '平手'}
              </span>
            </div>
            <div className="font-bold text-cyan-300 text-xs mt-0.5 truncate" title={dec.handicapPick}>
              {dec.handicapPick}
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              主水 {item.data.asianHandicap.lateHomeOdds.toFixed(2)} ｜ 客水 {item.data.asianHandicap.lateAwayOdds.toFixed(2)}
            </div>
          </div>

          {/* 4. 大小球首选 */}
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400">大小球首选</div>
            <div className="font-bold text-amber-400 text-xs mt-0.5 truncate">
              {dec.overUnderPick}
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              盘界 {item.data.overUnder.lateLine}
            </div>
          </div>

          {/* 5. 参考比分 */}
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 col-span-2 sm:col-span-1">
            <div className="text-[10px] text-slate-400">参考比分</div>
            <div className="flex items-center gap-1 mt-1 font-mono">
              {dec.predictedScores.map((s) => (
                <span key={s} className="px-1 py-0.5 bg-slate-900 rounded text-slate-200 text-[10px] font-bold">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 3 Sections Rendered Directly */}
        <div className="space-y-3 pt-1">
          {/* Section 1 */}
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/60 text-xs">
            <div className="font-bold text-emerald-400 mb-1">
              1. 【盘面第一印象】
            </div>
            <MarkdownView content={rep.firstImpression} />
          </div>

          {/* Section 2 */}
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/60 text-xs">
            <div className="font-bold text-cyan-400 mb-1">
              2. 【三维联动测谎】
            </div>
            <MarkdownView content={rep.threeDimLieDetection} />
          </div>

          {/* Section 3 */}
          <div className="bg-gradient-to-r from-emerald-950/30 to-slate-950 p-3 rounded-lg border border-emerald-500/30 text-xs space-y-1.5">
            <div className="font-bold text-white flex items-center justify-between">
              <span className="text-emerald-300">3. 【财富经最终判定】</span>
              <span className="text-amber-400 font-normal text-[11px]">
                {rep.finalVerdict.direction}
              </span>
            </div>
            <div className="text-slate-300 font-mono text-[11px]">
              {rep.finalVerdict.directionDetail}
            </div>
            <div className="text-rose-300 text-[11px] pt-1 border-t border-slate-800/80">
              <strong>⚠️ 避坑风险提示：</strong>
              {rep.finalVerdict.riskWarning}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Sandbox Stream Renderer (🎲 批量博弈沙盘流)
  const renderSandboxStreamItem = (
    { item, report: rep, dec, originalIndex }: (typeof sortedItems)[0],
    idx: number
  ) => {
    const badge = getBadgeForModel(rep.identifiedModel);
    const isFiveStar = dec.starRating === 5;
    const mData = item.data;
    const earlyWin = mData.euroOdds.earlyWin;
    const lateWin = mData.euroOdds.lateWin;
    const winDiff = lateWin - earlyWin;
    const winDiffStr = winDiff > 0 ? `+${winDiff.toFixed(2)}` : winDiff.toFixed(2);
    const modelTitle = rep.modelTitle || badge.text;

    return (
      <div
        key={item.id}
        className={`bg-slate-900 border rounded-xl p-5 shadow-lg space-y-4 hover:border-slate-700 transition-all ${
          isFiveStar
            ? 'border-amber-500/50 shadow-amber-500/5 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/10'
            : 'border-slate-800'
        }`}
      >
        {/* Header */}
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
                TOP #{idx + 1} 场（原#{originalIndex + 1}）
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {mData.matchInfo.league || '常规联赛'} ｜ {mData.matchInfo.matchTime || '临场'}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold border ${badge.cls}`}>
                {badge.text}
              </span>
              <div className="ml-1">{renderStarRating(dec.starRating)}</div>
              {item.isLocked && (
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5 text-amber-400" />
                  <span>终盘快照已锁 ({item.lockedAt || '开赛'})</span>
                </span>
              )}
            </div>
            <h3 className="text-base font-black text-white mt-1">
              {mData.matchInfo.homeTeam} VS {mData.matchInfo.awayTeam}
            </h3>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {onToggleLockMatch && (
              <button
                type="button"
                onClick={() => onToggleLockMatch(item.id)}
                className={`px-2.5 py-1 rounded text-xs font-bold border flex items-center gap-1 transition-all cursor-pointer ${
                  item.isLocked
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30'
                    : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'
                }`}
                title="锁定/解锁开赛快照"
              >
                {item.isLocked ? (
                  <>
                    <Lock className="w-3 h-3 text-amber-400" />
                    <span>已锁</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3 h-3 text-slate-400" />
                    <span>锁定</span>
                  </>
                )}
              </button>
            )}

            {item.isReviewed ? (
              <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1">
                <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>完赛 {item.finalScore}</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setReviewTarget({ item, report: rep });
                  setHomeGoals(0);
                  setAwayGoals(0);
                  setIncidents('');
                  setReviewSuccessMsg(null);
                }}
                className={`px-2.5 py-1 text-xs font-bold rounded transition-all flex items-center gap-1 cursor-pointer border ${
                  item.isLocked
                    ? 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border-cyan-500/50 shadow-sm'
                    : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border-slate-700'
                }`}
                title="录入完赛真实赛果，核验沙盘推演与模型"
              >
                <Target className="w-3 h-3 text-cyan-400" />
                <span>赛后复盘</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onSelectMatch(mData)}
              className="px-3 py-1 bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-200 text-xs font-bold rounded border border-slate-700 transition-all inline-flex items-center gap-1 cursor-pointer"
            >
              <span>三维精修</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Story */}
        <div className="text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
          <strong className="text-amber-300">战意与题材背景：</strong>
          {mData.matchInfo.marketStory || `${mData.matchInfo.homeTeam} 与 ${mData.matchInfo.awayTeam} 战力对碰，临场资金在胜平负与让球盘呈现博弈分流。`}
        </div>

        {/* Odds Jump Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs font-mono">
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 font-sans font-bold flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>欧指（百家）初终跳变</span>
            </span>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">初：{earlyWin.toFixed(2)} ｜ {mData.euroOdds.earlyDraw.toFixed(2)} ｜ {mData.euroOdds.earlyLoss.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-cyan-400 font-bold">终：{lateWin.toFixed(2)} ｜ {mData.euroOdds.lateDraw.toFixed(2)} ｜ {mData.euroOdds.lateLoss.toFixed(2)}</span>
            </div>
            <p className="text-[10px] text-slate-400 font-sans pt-1 border-t border-slate-800/60 leading-relaxed truncate">
              主胜升跌 {winDiffStr}，平赔 {mData.euroOdds.lateDraw.toFixed(2)}
            </p>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 font-sans font-bold flex items-center gap-1">
              <Target className="w-3.5 h-3.5 text-emerald-400" />
              <span>亚盘（机构风向标）初终跳变</span>
            </span>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">初：{mData.asianHandicap.earlyHandicap} ｜ 水 {mData.asianHandicap.earlyHomeOdds.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-emerald-400 font-bold">终：{mData.asianHandicap.lateHandicap} ｜ 水 {mData.asianHandicap.lateHomeOdds.toFixed(2)}</span>
            </div>
            <p className="text-[10px] text-slate-400 font-sans pt-1 border-t border-slate-800/60 leading-relaxed truncate">
              让步 {mData.asianHandicap.earlyHandicap} ➔ {mData.asianHandicap.lateHandicap}，水差 {(mData.asianHandicap.lateHomeOdds - mData.asianHandicap.earlyHomeOdds) > 0 ? `+${(mData.asianHandicap.lateHomeOdds - mData.asianHandicap.earlyHomeOdds).toFixed(2)}` : (mData.asianHandicap.lateHomeOdds - mData.asianHandicap.earlyHomeOdds).toFixed(2)}
            </p>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 font-sans font-bold flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>大小球初终跳变</span>
            </span>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">初：{mData.overUnder.earlyLine}球 ｜ 水 {mData.overUnder.earlyOverOdds.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-amber-400 font-bold">终：{mData.overUnder.lateLine}球 ｜ 水 {mData.overUnder.lateOverOdds.toFixed(2)}</span>
            </div>
            <p className="text-[10px] text-slate-400 font-sans pt-1 border-t border-slate-800/60 leading-relaxed truncate">
              {rep.metrics.overUnderVerdict}
            </p>
          </div>
        </div>

        {/* 4-Stage Deduction Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 space-y-1">
            <div className="text-slate-400 font-bold text-[11px]">第一阶段 · 早盘基石建仓</div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              初盘给出 {mData.asianHandicap.earlyHandicap} 搭配欧赔 {earlyWin.toFixed(2)}，机构设立第一道防护墙防范冷门并均衡两端底仓。
            </p>
          </div>
          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 space-y-1">
            <div className="text-slate-400 font-bold text-[11px]">第二阶段 · 资金发酵沉淀</div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              受市场题材发酵，筹码在胜平负与让球盘呈现流动，盘面通过水位浮动持续试探市场承压极限。
            </p>
          </div>
          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 space-y-1">
            <div className="text-cyan-300 font-bold text-[11px]">第三阶段 · 临场风控变轨</div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              {rep.firstImpression ? rep.firstImpression.slice(0, 130) + '...' : `机构定性为【${modelTitle}】，临场重点防范 ${dec.euroPick} 与 ${dec.handicapPick}。`}
            </p>
          </div>
          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 space-y-1">
            <div className="text-emerald-300 font-bold text-[11px]">第四阶段 · 终局博弈与避坑</div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              {rep.finalVerdict.direction}；{rep.finalVerdict.directionDetail}。{rep.finalVerdict.riskWarning}
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 1. Multi-Import & Differential Merge Feedback Banner */}
      {importNotification && (
        <div className="bg-emerald-950/40 border border-emerald-500/50 rounded-xl p-3.5 flex items-start justify-between gap-3 shadow-lg animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <span>{importNotification.message}</span>
                {importNotification.protectedCount > 0 && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5 text-amber-400" />
                    <span>{importNotification.protectedCount} 场封盘免疫覆盖</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                {importNotification.details}
              </p>
            </div>
          </div>
          {onDismissNotification && (
            <button
              type="button"
              onClick={onDismissNotification}
              className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* 2. Interactive Kickoff Lock Assistant Toolbar (Addressing Point 5 directly) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">⏱️ 开赛时间管理与终盘快照固化</span>
              <span className="px-2 py-0.5 rounded-full bg-slate-950 text-[10px] font-mono text-amber-300 font-bold border border-slate-800">
                🔒 终盘已固化 {lockedMatchesCount} / {queue.length} 场
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              开赛后锁定快照，后续<strong>多次导入新时间点的 Markdown 时自动免疫覆盖</strong>，终盘与决策原封不动，便于后续客观复盘！
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsAutoLockModalOpen(true)}
            className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="按开赛时间智能锁定早于指定时刻的场次"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>智能锁定已开赛场次</span>
          </button>
          {onBatchLockMatches && (
            <>
              <button
                type="button"
                onClick={() => onBatchLockMatches(true)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                title="一键锁定当前所有场次的终盘快照"
              >
                <Lock className="w-3 h-3 text-amber-400" />
                <span>全量锁定</span>
              </button>
              <button
                type="button"
                onClick={() => onBatchLockMatches(false)}
                className="px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-750 text-slate-400 hover:text-white border border-slate-700 text-xs rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                title="解除全部锁定"
              >
                <Unlock className="w-3 h-3" />
                <span>解锁全部</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Lock Feedback Toast */}
      {lockFeedbackToast && (
        <div className="bg-amber-500/20 border border-amber-500/40 text-amber-300 px-4 py-2 rounded-xl text-xs flex items-center justify-between shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-amber-400" />
            <span>{lockFeedbackToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setLockFeedbackToast(null)}
            className="text-amber-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* PROMINENT BATCH ANALYZE ACTION BUTTON */}
      <div className="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-3.5 shadow-xl">
        <button
          type="button"
          onClick={onBatchAnalyzeAll}
          disabled={isBatchAnalyzing}
          className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:via-teal-400 hover:to-cyan-400 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 transform active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer"
        >
          {isBatchAnalyzing ? (
            <>
              <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              <span>《财富经》全量批处理测谎中... 已处理 {queue.length} 场</span>
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 text-slate-950" />
              <span>
                ⚡ 批量一键启动《财富经》全量测谎精算 · 批量渲染全部 {queue.length} 场
              </span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </>
          )}
        </button>

        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 px-1">
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>自动输出：推荐星级 · 胜平负首选 · 让球首选 · 大小球首选 · 参考比分</span>
          </span>
          <span className="text-cyan-400 font-mono">
            单场上下文隔离 · 0% Token 污染
          </span>
        </div>
      </div>

      {/* 3. Recommended Parlay Combo Card (Addressing Point 4 directly) */}
      {parlayRecommendation && sortBy === 'stars' && (
        <div className="bg-gradient-to-r from-amber-500/[0.12] via-slate-900 to-cyan-500/[0.10] border border-amber-500/40 rounded-xl p-4 shadow-xl space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-500/20 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center font-black text-xs">
                👑
              </span>
              <h4 className="text-sm font-black text-white tracking-wide">
                {parlayRecommendation.title}
              </h4>
              <span className="px-2 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                高置信稳胆配对
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyCombo}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg shadow transition-all flex items-center gap-1 cursor-pointer self-start sm:self-auto"
            >
              {copiedCombo ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>已复制方案</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>复制实战 2串1 方案</span>
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* Match 1 */}
            <div className="bg-slate-950/80 border border-amber-500/30 rounded-lg p-2.5 text-xs flex items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 font-bold text-white">
                  <span>稳胆 1：{parlayRecommendation.match1.item.data.matchInfo.homeTeam} vs {parlayRecommendation.match1.item.data.matchInfo.awayTeam}</span>
                  <span className="text-[10px] text-cyan-400 font-mono">({parlayRecommendation.match1.item.data.matchInfo.matchTime})</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  操盘：<span className="text-amber-300 font-bold">{parlayRecommendation.match1.report.modelTitle}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono font-bold text-emerald-400 text-xs">
                  {parlayRecommendation.match1.dec.handicapPick}
                </div>
                <div className="text-[10px] text-slate-300">
                  胜平负: {parlayRecommendation.match1.dec.euroPick}
                </div>
              </div>
            </div>

            {/* Match 2 */}
            <div className="bg-slate-950/80 border border-cyan-500/30 rounded-lg p-2.5 text-xs flex items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 font-bold text-white">
                  <span>稳胆 2：{parlayRecommendation.match2.item.data.matchInfo.homeTeam} vs {parlayRecommendation.match2.item.data.matchInfo.awayTeam}</span>
                  <span className="text-[10px] text-cyan-400 font-mono">({parlayRecommendation.match2.item.data.matchInfo.matchTime})</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  操盘：<span className="text-cyan-300 font-bold">{parlayRecommendation.match2.report.modelTitle}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono font-bold text-cyan-300 text-xs">
                  {parlayRecommendation.match2.dec.handicapPick}
                </div>
                <div className="text-[10px] text-slate-300">
                  胜平负: {parlayRecommendation.match2.dec.euroPick}
                </div>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
            💡 <strong>风控心法</strong>：{parlayRecommendation.description}。两场赛事已独立精算测谎，有效规避诱上陷阱。
          </p>
        </div>
      )}

      {/* Control Bar: View Switcher, Star Filters & Sorting Optimizations */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-md">
        {/* View Mode Toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setViewStyle('matrix')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                viewStyle === 'matrix'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>📊 批量决策大盘表</span>
            </button>
            <button
              type="button"
              onClick={() => setViewStyle('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                viewStyle === 'cards'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>📑 全量卡片流渲染</span>
            </button>
            <button
              type="button"
              onClick={() => setViewStyle('sandbox')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                viewStyle === 'sandbox'
                  ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="批量全览所有场次的四步动态博弈沙盘推演与早晚盘差量"
            >
              <History className="w-3.5 h-3.5" />
              <span>🎲 批量博弈沙盘流</span>
            </button>
          </div>

          {/* D3 Distribution Chart Toggle */}
          <button
            type="button"
            onClick={() => setShowD3Chart(!showD3Chart)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
              showD3Chart
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>{showD3Chart ? '收起趋势图' : '盘口趋势图'}</span>
          </button>

          {/* Star Filter Pills */}
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => setStarFilter('ALL')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                starFilter === 'ALL'
                  ? 'bg-slate-800 text-white border border-slate-600 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              全部 ({queue.length})
            </button>
            <button
              onClick={() => setStarFilter(5)}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                starFilter === 5
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              5星 ({fiveStarCount})
            </button>
            <button
              onClick={() => setStarFilter(4)}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                starFilter === 4
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              4星 ({fourStarCount})
            </button>
          </div>

          {/* Sorting Engine & Sub-Sort Options */}
          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
            <span className="text-[10px] text-slate-500 font-bold px-1 flex items-center gap-0.5">
              <SlidersHorizontal className="w-3 h-3 text-cyan-400" />
              <span>排序</span>
            </span>
            <button
              type="button"
              onClick={() => toggleSort('stars')}
              className={`px-2 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                sortBy === 'stars'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="按星级高低排序（5星稳胆优先）"
            >
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span>星级优先</span>
              {sortBy === 'stars' && (
                sortOrder === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />
              )}
            </button>
            <button
              type="button"
              onClick={() => toggleSort('time')}
              className={`px-2 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                sortBy === 'time'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="按开赛时间排序"
            >
              <span>开赛时间</span>
              {sortBy === 'time' && (
                sortOrder === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />
              )}
            </button>
            <button
              type="button"
              onClick={() => toggleSort('default')}
              className={`px-2 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                sortBy === 'default'
                  ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="按原始导入序号排序"
            >
              <span>原始序号</span>
              {sortBy === 'default' && (
                sortOrder === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />
              )}
            </button>
          </div>

          {/* Sub-Sort within Star Priority */}
          {sortBy === 'stars' && (
            <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-amber-500/30 text-xs">
              <span className="text-[10px] text-amber-400 font-bold px-1">
                同星级内：
              </span>
              <button
                type="button"
                onClick={() => setSubSortBy('certainty')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                  subSortBy === 'certainty'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="同星级内：按操盘模型确定性排序（极限榨水 > 平赔防守 > 高息反选）"
              >
                🏅 稳胆确定性
              </button>
              <button
                type="button"
                onClick={() => setSubSortBy('time')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                  subSortBy === 'time'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="同星级内：按开赛时间由早到晚排序，方便及时投注"
              >
                ⏱️ 临场早开赛
              </button>
            </div>
          )}

          {/* Tier Grouping Toggle Button */}
          <button
            type="button"
            onClick={() => setIsGroupedByTier(!isGroupedByTier)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              isGroupedByTier
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-sm'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
            }`}
            title="切换按梯队分组展示（五星稳胆区 / 四星博弈区 / 三星调仓区）"
          >
            <span>🗂️ 梯队分组展示</span>
          </button>
        </div>

        {/* Export and Clear buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportMarkdownSummary}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
          >
            {copiedBatch ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">已复制排序后 Markdown</span>
              </>
            ) : (
              <>
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                <span>复制批量 Markdown 汇总</span>
              </>
            )}
          </button>
          {onResetToPresets && (
            <button
              type="button"
              onClick={onResetToPresets}
              className="p-1.5 text-slate-400 hover:text-cyan-300 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors cursor-pointer"
              title="重置/重新载入 5 场经典教学预设案例"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClearQueue}
            className="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors cursor-pointer"
            title="清空当前队列"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sorting Status Summary Banner */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-xs flex items-center justify-between flex-wrap gap-2 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-slate-300">
            {sortBy === 'stars' ? (
              <>
                当前已按 <strong className="text-amber-400 font-bold">{sortOrder === 'desc' ? '星级从高到低 (5星稳胆优先)' : '星级从低到高'}</strong> 自动精选排序
                <span className="text-slate-400 ml-1.5">
                  （二级排序：<strong className="text-cyan-300">{subSortBy === 'certainty' ? '确定性稳胆优先' : '临场早开赛优先'}</strong>）
                </span>
                {sortOrder === 'desc' && (
                  <span className="text-slate-400 ml-1.5">
                    — 前 <strong className="text-amber-300 font-extrabold">{fiveStarCount}</strong> 场为 5 星级核心决策赛事，后 <strong className="text-slate-300">{threeStarCount}</strong> 场为 3 星常规调仓盘
                  </span>
                )}
              </>
            ) : sortBy === 'time' ? (
              <>
                当前已按 <strong className="text-cyan-400 font-bold">开赛时间 ({sortOrder === 'desc' ? '由晚到早' : '由早到晚'})</strong> 排序
              </>
            ) : (
              <>
                当前按 <strong className="text-slate-200 font-bold">原始导入录入顺序</strong> 呈现
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
            <span>共 <strong className="text-white">{sortedItems.length}</strong> 场</span>
            <span>｜</span>
            <span className="text-amber-400 font-bold">5星: {fiveStarCount} 场</span>
            <span>｜</span>
            <span className="text-emerald-400">4星: {fourStarCount} 场</span>
            <span>｜</span>
            <span className="text-slate-400">3星: {threeStarCount} 场</span>
            <span>｜</span>
            <span className="text-amber-300 font-bold">
              🔒 锁定: {lockedMatchesCount} 场
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400/90 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>实时自动存盘就绪</span>
          </div>
        </div>
      </div>

      {/* D3.js Visualization: Handicap Odds Distribution Chart */}
      {showD3Chart && (
        <HandicapOddsDistributionChart
          matches={queue.map((q) => q.data)}
        />
      )}

      {/* VIEW STYLE A: BATCH DECISION TABLE */}
      {viewStyle === 'matrix' && (
        <div className="space-y-4">
          {isGroupedByTier ? (
            /* Tiered Grouped Table Display */
            <div className="space-y-6">
              {/* Tier 5 */}
              {tier5Items.length > 0 && (
                <div className="bg-slate-900 border border-amber-500/40 rounded-xl overflow-hidden shadow-lg shadow-amber-500/5">
                  <div className="bg-gradient-to-r from-amber-500/20 via-slate-950 to-slate-900 px-4 py-2.5 border-b border-amber-500/30 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 font-extrabold text-sm">👑 第一梯队 · 五星黄金稳胆区</span>
                      <span className="px-2 py-0.2 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/40">
                        {tier5Items.length} 场核心精选
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      机构避险正向控赔 / 极度看好打出，适合作为 2串1 / 3串1 核心稳胆
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs min-w-[1020px]">
                      <thead className="bg-slate-950/90 text-slate-400 text-[11px] uppercase border-b border-slate-800">
                        <tr>
                          <th className="py-2.5 px-3 w-14 text-center">#</th>
                          <th className="py-2.5 px-3 w-32">推荐星级</th>
                          <th className="py-2.5 px-4 min-w-[240px]">赛事 / 对阵</th>
                          <th className="py-2.5 px-3 min-w-[120px]">胜平负首选</th>
                          <th className="py-2.5 px-3 min-w-[160px]">让球首选</th>
                          <th className="py-2.5 px-3 min-w-[120px]">大小球首选</th>
                          <th className="py-2.5 px-3 min-w-[130px]">参考比分</th>
                          <th className="py-2.5 px-3 min-w-[100px]">操盘定性</th>
                          <th className="py-2.5 px-3 min-w-[160px] text-right">操作与研判</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70 font-sans">
                        {tier5Items.map((item, idx) => renderTableRow(item, idx))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tier 4 */}
              {tier4Items.length > 0 && (
                <div className="bg-slate-900 border border-emerald-500/40 rounded-xl overflow-hidden shadow-lg">
                  <div className="bg-gradient-to-r from-emerald-500/15 via-slate-950 to-slate-900 px-4 py-2.5 border-b border-emerald-500/30 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-300 font-extrabold text-sm">💎 第二梯队 · 四星重点博弈区</span>
                      <span className="px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/40">
                        {tier4Items.length} 场明确信号
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      明确操盘意图（高息诱上杀猪盘反选 / 平赔防守），适合单场重点或容错
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs min-w-[1020px]">
                      <thead className="bg-slate-950/90 text-slate-400 text-[11px] uppercase border-b border-slate-800">
                        <tr>
                          <th className="py-2.5 px-3 w-14 text-center">#</th>
                          <th className="py-2.5 px-3 w-32">推荐星级</th>
                          <th className="py-2.5 px-4 min-w-[240px]">赛事 / 对阵</th>
                          <th className="py-2.5 px-3 min-w-[120px]">胜平负首选</th>
                          <th className="py-2.5 px-3 min-w-[160px]">让球首选</th>
                          <th className="py-2.5 px-3 min-w-[120px]">大小球首选</th>
                          <th className="py-2.5 px-3 min-w-[130px]">参考比分</th>
                          <th className="py-2.5 px-3 min-w-[100px]">操盘定性</th>
                          <th className="py-2.5 px-3 min-w-[160px] text-right">操作与研判</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70 font-sans">
                        {tier4Items.map((item, idx) => renderTableRow(item, idx))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tier 3 */}
              {tier3Items.length > 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                  <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-300 font-extrabold text-sm">⚡ 第三梯队 · 三星常规调仓区</span>
                      <span className="px-2 py-0.2 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold border border-slate-700">
                        {tier3Items.length} 场均势博弈
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      机构常规盘赔波动与平衡对冲，防范平局与震荡
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs min-w-[1020px]">
                      <thead className="bg-slate-950/90 text-slate-400 text-[11px] uppercase border-b border-slate-800">
                        <tr>
                          <th className="py-2.5 px-3 w-14 text-center">#</th>
                          <th className="py-2.5 px-3 w-32">推荐星级</th>
                          <th className="py-2.5 px-4 min-w-[240px]">赛事 / 对阵</th>
                          <th className="py-2.5 px-3 min-w-[120px]">胜平负首选</th>
                          <th className="py-2.5 px-3 min-w-[160px]">让球首选</th>
                          <th className="py-2.5 px-3 min-w-[120px]">大小球首选</th>
                          <th className="py-2.5 px-3 min-w-[130px]">参考比分</th>
                          <th className="py-2.5 px-3 min-w-[100px]">操盘定性</th>
                          <th className="py-2.5 px-3 min-w-[160px] text-right">操作与研判</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70 font-sans">
                        {tier3Items.map((item, idx) => renderTableRow(item, idx))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Flat Matrix Table */
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[1020px]">
                  <thead className="bg-slate-950/90 text-slate-400 text-[11px] uppercase border-b border-slate-800 sticky top-0">
                    <tr>
                      <th
                        onClick={() => toggleSort('default')}
                        className="py-3 px-3 w-14 text-center whitespace-nowrap cursor-pointer hover:text-white select-none"
                        title="点击切换原始序号排序"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>#</span>
                          {sortBy === 'default' && (
                            sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-cyan-400" /> : <ArrowUp className="w-3 h-3 text-cyan-400" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => toggleSort('stars')}
                        className="py-3 px-3 w-32 whitespace-nowrap cursor-pointer hover:text-amber-300 select-none"
                        title="点击切换星级从高到低/从低到高"
                      >
                        <div className="flex items-center gap-1 font-bold">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          <span className={sortBy === 'stars' ? 'text-amber-300' : ''}>推荐星级</span>
                          {sortBy === 'stars' ? (
                            sortOrder === 'desc' ? (
                              <span className="text-[10px] text-amber-400 font-mono ml-0.5">↓(高)</span>
                            ) : (
                              <span className="text-[10px] text-amber-400 font-mono ml-0.5">↑(低)</span>
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-600" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => toggleSort('time')}
                        className="py-3 px-4 min-w-[240px] whitespace-nowrap cursor-pointer hover:text-cyan-300 select-none"
                        title="点击按开赛时间排序"
                      >
                        <div className="flex items-center gap-1">
                          <span className={sortBy === 'time' ? 'text-cyan-300 font-bold' : ''}>赛事 / 对阵</span>
                          {sortBy === 'time' ? (
                            sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-cyan-400" /> : <ArrowUp className="w-3 h-3 text-cyan-400" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-600" />
                          )}
                        </div>
                      </th>
                      <th className="py-3 px-3 min-w-[120px] whitespace-nowrap">胜平负首选</th>
                      <th className="py-3 px-3 min-w-[160px] whitespace-nowrap">让球首选</th>
                      <th className="py-3 px-3 min-w-[120px] whitespace-nowrap">大小球首选</th>
                      <th className="py-3 px-3 min-w-[130px] whitespace-nowrap">参考比分</th>
                      <th className="py-3 px-3 min-w-[100px] whitespace-nowrap">操盘定性</th>
                      <th className="py-3 px-3 min-w-[160px] text-right whitespace-nowrap">操作与研判</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 font-sans">
                    {sortedItems.map((item, idx) => renderTableRow(item, idx))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW STYLE B: FULL RENDERED STREAM CARDS */}
      {viewStyle === 'cards' && (
        <div className="space-y-6">
          {sortedItems.map((item, idx) => renderCardStreamItem(item, idx))}
        </div>
      )}

      {/* VIEW STYLE C: FULL BATCH SANDBOX DEDUCTION STREAM */}
      {viewStyle === 'sandbox' && (
        <div className="space-y-6">
          {sortedItems.map((item, idx) => renderSandboxStreamItem(item, idx))}
        </div>
      )}

      {/* 4. Quick Post-Match Review Modal (Seamlessly linking frozen snapshots to review) */}
      {reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
                  <Target className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide">
                    🎯 赛后精算复盘与经验进化 · {reviewTarget.item.data.matchInfo.homeTeam} VS {reviewTarget.item.data.matchInfo.awayTeam}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    开赛前终盘快照已固化 · 录入完赛赛果印证命中率，自动沉淀法则至进化知识库
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReviewTarget(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {reviewSuccessMsg && (
                <div className="bg-emerald-950/50 border border-emerald-500/50 rounded-xl p-3 text-emerald-300 font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{reviewSuccessMsg}</span>
                </div>
              )}

              {/* Frozen Pre-match Snapshot & Predictions */}
              <div className="bg-slate-950 p-4 rounded-xl border border-amber-500/30 space-y-2">
                <div className="flex items-center justify-between text-slate-300 font-bold">
                  <span className="text-amber-400 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    <span>【开赛前固化的终盘快照与五项预测】（绝对免疫多次导入篡改）</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {reviewTarget.item.data.matchInfo.matchTime} 开赛
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">推荐星级</span>
                    <span className="text-amber-400 font-bold">{reviewTarget.report.decision.starRating} 星置信度</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">胜平负首选</span>
                    <span className="text-emerald-400 font-bold">{reviewTarget.report.decision.euroPick}</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">让球首选</span>
                    <span className="text-cyan-400 font-bold">{reviewTarget.report.decision.handicapPick}</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">大小球首选</span>
                    <span className="text-amber-300 font-bold">{reviewTarget.report.decision.overUnderPick}</span>
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 pt-1">
                  <strong>终盘定性</strong>：{reviewTarget.report.modelTitle} ｜ <strong>参考比分</strong>：{reviewTarget.report.decision.predictedScores.join(', ')}
                </div>
              </div>

              {/* Enter Actual Result */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="font-bold text-white flex items-center justify-between">
                  <span>录入真实完赛赛果与关键转折事件</span>
                  <span className="text-emerald-400 text-[11px] font-mono">自动精准核验</span>
                </div>

                <div className="flex items-center justify-center gap-4 py-2">
                  <div className="text-center">
                    <div className="text-xs font-bold text-slate-300 mb-1">
                      {reviewTarget.item.data.matchInfo.homeTeam} (主)
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={homeGoals}
                      onChange={(e) => setHomeGoals(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-16 h-12 bg-slate-900 border border-slate-700 rounded-xl text-center text-xl font-black text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>

                  <span className="text-2xl font-black text-slate-600">:</span>

                  <div className="text-center">
                    <div className="text-xs font-bold text-slate-300 mb-1">
                      {reviewTarget.item.data.matchInfo.awayTeam} (客)
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={awayGoals}
                      onChange={(e) => setAwayGoals(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-16 h-12 bg-slate-900 border border-slate-700 rounded-xl text-center text-xl font-black text-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    比赛转折事件与关键细节（选填，如红牌、点球、主力早退、伤停补时绝杀）
                  </label>
                  <input
                    type="text"
                    value={incidents}
                    onChange={(e) => setIncidents(e.target.value)}
                    placeholder="如：主队第30分钟红牌少打一人；客队补时点球绝杀"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-950/60">
              <span className="text-[11px] text-slate-400">
                核验完成后将直接沉淀至<strong>《财富经》经验进化库</strong>，永久反哺后续大盘测谎！
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReviewTarget(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 rounded-lg"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReview}
                  className="px-5 py-2 text-xs font-black text-slate-950 bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 rounded-lg shadow-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>提交核验并提炼法则</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Auto Lock Cutoff Time Modal */}
      {isAutoLockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                  <Lock className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-sm font-bold text-white">
                  智能按开赛时刻批量锁定快照
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAutoLockModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-3 text-xs">
              <p className="text-slate-300 leading-relaxed">
                请输入开赛截止时间。系统将自动<strong>锁定开赛时刻早于或等于该时间的比赛</strong>，并将其终盘赔率快照与五项推荐永久封存：
              </p>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  开赛截止时刻（HH:mm 格式，例如 00:00 或 02:45）
                </label>
                <input
                  type="text"
                  value={cutoffInput}
                  onChange={(e) => setCutoffInput(e.target.value)}
                  placeholder="00:00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-amber-300 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <span className="text-[11px] text-slate-500">快捷填充：</span>
                <button
                  type="button"
                  onClick={() => setCutoffInput('00:00')}
                  className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 text-[11px] font-mono border border-slate-700 hover:bg-slate-750"
                >
                  00:00 (塞浦路斯等)
                </button>
                <button
                  type="button"
                  onClick={() => setCutoffInput('02:45')}
                  className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 text-[11px] font-mono border border-slate-700 hover:bg-slate-750"
                >
                  02:45 (欧国联主力)
                </button>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 text-[11px] text-amber-300/90 leading-relaxed">
                🔒 <strong>防覆盖说明</strong>：锁定后的比赛在下一次导入更新盘口的 Markdown 时，将被自动保护跳过，绝不会被最新盘口重置，确保赛后复盘与当时判定 100% 对应！
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-slate-800 bg-slate-950/60">
              <button
                type="button"
                onClick={() => setIsAutoLockModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 rounded-lg"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleExecuteAutoLock}
                className="px-5 py-2 text-xs font-black text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-lg flex items-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>立即锁定</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
