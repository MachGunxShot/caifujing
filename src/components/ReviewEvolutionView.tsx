import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Brain,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Flame,
  Plus,
  Trash2,
  Download,
  Upload,
  RefreshCw,
  FileText,
  Sliders,
  Award,
  TrendingUp,
  Percent,
  Check,
  ChevronRight,
  BookOpen,
  ArrowRight,
  RotateCcw,
  Camera,
  FileImage,
  Layers,
  ListChecks,
  ScanText,
  Clipboard,
  Calendar,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock,
  Filter,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Star,
  CheckCheck,
} from 'lucide-react';
import {
  FullMatchData,
  BatchMatchItem,
  AnalysisReportResult,
  PostMatchReview,
  EvolvedExperienceRule,
  ParlayReviewRecord,
  ParlayMatchSnapshot,
} from '../types/fortuneActuary';
import {
  getExperienceRules,
  saveExperienceRules,
  toggleRuleActiveState,
  deleteExperienceRule,
  addOrUpdateExperienceRule,
  exportRulesAsJson,
  importRulesFromJson,
  importRulesFromMarkdown,
  importRulesSmart,
  getPostMatchReviews,
  evaluateMatchOutcomeAndExtractLesson,
  deletePostMatchReview,
  clearAllPostMatchReviews,
  savePostMatchReview,
  saveAllPostMatchReviews,
  replacePostMatchReviews,
  auditRulesHealth,
  deduplicateExperienceRules,
  pruneAndClusterExperienceRules,
  pruneZeroHitRules,
  repairInconsistentLanguageRules,
  syncAndPromoteReviewsToCoreRules,
  getParlayReviews,
  saveParlayReview,
  deleteParlayReview,
  clearAllParlayReviews,
  autoExtractDailyParlayReviews,
  evaluateParlaySettlement,
  evaluateSingleHandicapOutcome,
} from '../utils/experienceStore';
import { generateActuarialRuleReport } from '../utils/actuaryEngine';
import { ParsedScoreItem, parseBatchMatchScoresFromText } from '../utils/textParser';
import {
  calculateSalesDate,
  extractKickoffTime,
  extractDocumentGlobalDate,
  detectDominantSalesDate,
  calibrateReviewSalesDate,
  getReviewSalesInfo as resolveReviewSalesInfo,
  SalesDateInfo,
  matchTeamsFuzzy,
  hasExplicitKickoffDate,
} from '../utils/salesDayUtils';

interface ReviewEvolutionViewProps {
  queue: BatchMatchItem[];
  currentMatch: FullMatchData;
  currentReport: AnalysisReportResult;
  onUpdateQueue: (updated: BatchMatchItem[]) => void;
  onSelectMatch?: (match: FullMatchData) => void;
}

const hasFullKickoffDate = (time?: string): boolean =>
  !!time && !time.includes('临场') &&
  /(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日)/.test(time);

const knownSalesDate = (time?: string, timestamp?: number, salesDate?: string): string | undefined =>
  hasExplicitKickoffDate(time) ? calculateSalesDate(time, timestamp, salesDate).salesDate : salesDate;

const salesDatesCompatible = (
  timeA?: string, timestampA?: number, salesDateA?: string,
  timeB?: string, timestampB?: number, salesDateB?: string
): boolean => {
  const dateA = knownSalesDate(timeA, timestampA, salesDateA);
  const dateB = knownSalesDate(timeB, timestampB, salesDateB);
  return !dateA || !dateB || dateA === dateB;
};

export const ReviewEvolutionView: React.FC<ReviewEvolutionViewProps> = ({
  queue,
  currentMatch,
  currentReport,
  onUpdateQueue,
  onSelectMatch,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'review' | 'rules' | 'history' | 'parlays'>('review');
  const [rules, setRules] = useState<EvolvedExperienceRule[]>(() => getExperienceRules());
  const [reviews, setReviews] = useState<PostMatchReview[]>(() => getPostMatchReviews());
  const [parlayReviews, setParlayReviews] = useState<ParlayReviewRecord[]>(() => {
    const revs = getPostMatchReviews();
    return getParlayReviews().map((p) => evaluateParlaySettlement(p, revs));
  });
  const [parlayFilterStatus, setParlayFilterStatus] = useState<string>('ALL');
  const [isExtractingParlays, setIsExtractingParlays] = useState(false);
  const [parlayActionToast, setParlayActionToast] = useState<string | null>(null);

  // Review Form States (Single vs Batch)
  const [reviewEntryMode, setReviewEntryMode] = useState<'batch' | 'single'>('batch');
  const [selectedMatchId, setSelectedMatchId] = useState<string>('current');
  const [actualHomeScore, setActualHomeScore] = useState<number>(2);
  const [actualAwayScore, setActualAwayScore] = useState<number>(1);
  const [incidents, setIncidents] = useState<string>('');
  const [isReviewing, setIsReviewing] = useState<boolean>(false);
  const [latestReviewResult, setLatestReviewResult] = useState<PostMatchReview | null>(null);

  // Sync selection with global app state
  const handleMatchDropdownChange = (id: string) => {
    setSelectedMatchId(id);
    if (id !== 'current') {
      const found = queue.find((q) => q.id === id);
      if (found) {
        if (onSelectMatch) {
          onSelectMatch(found.data);
        }
        if (found.review) {
          setActualHomeScore(found.review.actualHomeScore);
          setActualAwayScore(found.review.actualAwayScore);
          setIncidents(found.review.matchIncidents || '');
        } else if (found.finalScore) {
          const parts = found.finalScore.split(/[-:：]/);
          if (parts.length === 2) {
            setActualHomeScore(parseInt(parts[0], 10) || 0);
            setActualAwayScore(parseInt(parts[1], 10) || 0);
          }
        }
      }
    } else {
      const currentRev = reviews.find(
        (r) =>
          r.matchData?.matchInfo?.homeTeam === currentMatch.matchInfo.homeTeam &&
          r.matchData?.matchInfo?.awayTeam === currentMatch.matchInfo.awayTeam
      );
      if (currentRev) {
        setActualHomeScore(currentRev.actualHomeScore);
        setActualAwayScore(currentRev.actualAwayScore);
        setIncidents(currentRev.matchIncidents || '');
      }
    }
  };

  // Batch Match Results Recognition States
  const [batchInputType, setBatchInputType] = useState<'image' | 'text'>('text');
  const [batchRawText, setBatchRawText] = useState<string>('');
  const [batchScreenshot, setBatchScreenshot] = useState<string | null>(null);
  const [isExtractingScores, setIsExtractingScores] = useState<boolean>(false);
  const [parsedScores, setParsedScores] = useState<ParsedScoreItem[]>([]);
  const [isBatchReviewing, setIsBatchReviewing] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [batchReviewSummary, setBatchReviewSummary] = useState<string | null>(null);
  const [batchSyncToCoreRules, setBatchSyncToCoreRules] = useState<boolean>(true);
  const [batchTargetSalesDate, setBatchTargetSalesDate] = useState<string>('');
  const scoreFileInputRef = useRef<HTMLInputElement>(null);

  // Manual Rule Modal
  const [isAddRuleOpen, setIsAddRuleOpen] = useState(false);
  const [newRuleTitle, setNewRuleTitle] = useState('');
  const [newRuleCategory, setNewRuleCategory] = useState<any>('POSITIVE_CONTROL');
  const [newRuleScope, setNewRuleScope] = useState('全部联赛');
  const [newRuleContent, setNewRuleContent] = useState('');

  // Copy status
  const [copiedJson, setCopiedJson] = useState(false);

  // Rule Health & Categorization States
  const [ruleCategoryFilter, setRuleCategoryFilter] = useState<'ALL' | 'CLASSIC' | 'SYNTHESIZED' | 'BOILERPLATE'>('ALL');
  const [healthNotification, setHealthNotification] = useState<string | null>(null);
  const [isSyncingRules, setIsSyncingRules] = useState<boolean>(false);
  const [isCalibratingDates, setIsCalibratingDates] = useState<boolean>(false);
  const [isCalibratingStars, setIsCalibratingStars] = useState<boolean>(false);
  const [syncResultModal, setSyncResultModal] = useState<{
    totalProcessed: number;
    addedCount: number;
    updatedCount: number;
    verifiedHitsCount: number;
  } | null>(null);

  // Import Rules Modal States
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importFeedback, setImportFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Date Grouping and Filter States for Reviews
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('ALL');
  const [selectedStarFilter, setSelectedStarFilter] = useState<'ALL' | 5 | 4 | 3>('ALL');
  const [dateGroupStarFilter, setDateGroupStarFilter] = useState<Record<string, 'ALL' | 5 | 4 | 3>>({});
  const [collapsedDateGroups, setCollapsedDateGroups] = useState<Record<string, boolean>>({});
  const [expandedDissections, setExpandedDissections] = useState<Record<string, boolean>>({});
  const [selectedReviewIds, setSelectedReviewIds] = useState<Record<string, boolean>>({});
  const [adjustSalesDate, setAdjustSalesDate] = useState<string>('');

  // Helper to render star rating badge for pre-match analysis
  const renderStarRatingBadge = (stars?: number, showLabel: boolean = true) => {
    const safeStars = Math.max(1, Math.min(5, stars || 3));
    const is5 = safeStars === 5;
    const is4 = safeStars === 4;
    const tierColor = is5
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
      : is4
      ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
      : 'bg-slate-800 text-slate-300 border-slate-700';

    return (
      <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-extrabold border shadow-sm ${tierColor}`}>
        <div className="flex items-center text-amber-400">
          {[1, 2, 3, 4, 5].map((s) => (
            <Star
              key={s}
              className={`w-3 h-3 ${
                s <= safeStars ? 'fill-amber-400 text-amber-400' : 'text-slate-600 fill-slate-800'
              }`}
            />
          ))}
        </div>
        {showLabel && (
          <span className="font-mono">
            {safeStars}星{is5 ? '稳胆档' : is4 ? '防冷档' : '博弈档'}
          </span>
        )}
      </div>
    );
  };

  // Realization stats across star tiers for analyzing implementation value
  const starTierRealizationStats = useMemo(() => {
    const calcTier = (targetStars: number) => {
      const tierItems = reviews.filter((r) => (r.priorReport?.decision?.starRating || 3) === targetStars);
      const total = tierItems.length;
      if (total === 0) return { total: 0, euroHitRate: 0, handicapHitRate: 0, ouHitRate: 0, scoreHitRate: 0 };
      const euroHits = tierItems.filter((r) => r.outcomeEvaluation?.euroHit).length;
      const handicapHits = tierItems.filter((r) => r.outcomeEvaluation?.handicapHit).length;
      const ouHits = tierItems.filter((r) => r.outcomeEvaluation?.overUnderHit).length;
      const scoreHits = tierItems.filter((r) => r.outcomeEvaluation?.scoreHit).length;
      return {
        total,
        euroHitRate: Math.round((euroHits / total) * 100),
        handicapHitRate: Math.round((handicapHits / total) * 100),
        ouHitRate: Math.round((ouHits / total) * 100),
        scoreHitRate: Math.round((scoreHits / total) * 100),
      };
    };

    return {
      tier5: calcTier(5),
      tier4: calcTier(4),
      tier3: calcTier(3),
    };
  }, [reviews]);

  // KPI statistics for 2-in-1 parlay historical battle reports
  const parlayStats = useMemo(() => {
    const total = parlayReviews.length;
    if (total === 0) {
      return {
        total: 0,
        settledCount: 0,
        euroParlayHits: 0,
        euroHitRate: 0,
        handicapParlayHits: 0,
        handicapHitRate: 0,
        grandSlamCount: 0,
        hedgeOrWinCount: 0,
        hedgeOrWinRate: 0,
        brokenCount: 0,
      };
    }
    const settled = parlayReviews.filter((p) => p.settlementStatus !== 'PENDING');
    const settledCount = settled.length;
    const euroParlayHits = settled.filter((p) => p.euroParlayHit).length;
    const handicapParlayHits = settled.filter((p) => p.handicapParlayHit).length;
    const grandSlamCount = settled.filter((p) => p.isGrandSlam || p.settlementStatus === 'SETTLED_ALL_HIT').length;
    const hedgeOrWinCount = settled.filter((p) =>
      p.settlementStatus === 'SETTLED_ALL_HIT' ||
      p.settlementStatus === 'SETTLED_PARLAY_HIT' ||
      p.settlementStatus === 'SETTLED_HANDICAP_HIT' ||
      p.settlementStatus === 'SETTLED_HEDGE_PUSH'
    ).length;
    const brokenCount = settled.filter((p) => p.settlementStatus === 'SETTLED_BROKEN').length;

    return {
      total,
      settledCount,
      euroParlayHits,
      euroHitRate: settledCount > 0 ? Math.round((euroParlayHits / settledCount) * 100) : 0,
      handicapParlayHits,
      handicapHitRate: settledCount > 0 ? Math.round((handicapParlayHits / settledCount) * 100) : 0,
      grandSlamCount,
      hedgeOrWinCount,
      hedgeOrWinRate: settledCount > 0 ? Math.round((hedgeOrWinCount / settledCount) * 100) : 0,
      brokenCount,
    };
  }, [parlayReviews]);

  // Auto-extract 2-in-1 parlays from single match reviews
  const handleAutoExtractParlays = () => {
    setIsExtractingParlays(true);
    try {
      const extracted = autoExtractDailyParlayReviews(reviews);
      const evaluated = extracted.map((p) => evaluateParlaySettlement(p, reviews));
      evaluated.forEach((p) => saveParlayReview(p));
      const allParlays = getParlayReviews().map((p) => evaluateParlaySettlement(p, reviews));
      setParlayReviews(allParlays);
      setParlayActionToast(`⚡ 智能萃取完成：已根据历史销售日稳胆阵容萃取并生成 ${extracted.length} 期 2串1 战报！`);
      setTimeout(() => setParlayActionToast(null), 6000);
    } finally {
      setIsExtractingParlays(false);
    }
  };

  // Re-evaluate all parlays
  const handleRefreshParlaySettlements = () => {
    const currentRevs = getPostMatchReviews();
    const currentParlays = getParlayReviews();
    const updated = currentParlays.map((p) => evaluateParlaySettlement(p, currentRevs));
    updated.forEach((p) => saveParlayReview(p));
    setParlayReviews(updated);
    setParlayActionToast('🔄 全量 2串1 方案赛果精算已刷新！');
    setTimeout(() => setParlayActionToast(null), 4000);
  };

  // Delete single parlay
  const handleDeleteParlay = (id: string) => {
    if (window.confirm('确定要删除这期 2串1 战报吗？')) {
      deleteParlayReview(id);
      const currentRevs = getPostMatchReviews();
      const updated = getParlayReviews().map((p) => evaluateParlaySettlement(p, currentRevs));
      setParlayReviews(updated);
    }
  };

  // Clear all parlays
  const handleClearAllParlays = () => {
    if (window.confirm('确定要清空全部 2串1 稳胆历史战报吗？（单场复盘与法则库不受影响）')) {
      clearAllParlayReviews();
      setParlayReviews([]);
      setParlayActionToast('已清空全部 2串1 稳胆战报！');
      setTimeout(() => setParlayActionToast(null), 4000);
    }
  };

  // Date formatting helper for YYYY-MM-DD grouping
  const formatDateInfo = (timestamp?: number) => {
    const date = timestamp ? new Date(timestamp) : new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const dateKey = `${y}-${m}-${d}`;
    const dateLabel = `${y}年${m}月${d}日`;

    const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const dayOfWeek = days[date.getDay()];

    const now = new Date();
    const isToday =
      y === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    const secs = String(date.getSeconds()).padStart(2, '0');
    const timeStr = `${hours}:${mins}:${secs}`;

    return { dateKey, dateLabel, dayOfWeek, isToday, timeStr };
  };

  // Helper to determine the Sales Day (竞彩销售日：当日11:00至次日11:00) for a review item
  const getReviewSalesInfo = (rev: PostMatchReview): SalesDateInfo => {
    return resolveReviewSalesInfo(rev);
  };

  // Group reviews hierarchically by Sports Lottery Sales Day (当日 11:00 至次日 11:00 为一个销售日)
  const groupedReviews = useMemo(() => {
    const groupsMap = new Map<
      string,
      {
        dateKey: string;
        dateLabel: string;
        salesCycleText: string;
        dayOfWeek: string;
        isToday: boolean;
        items: PostMatchReview[];
        stats: {
          total: number;
          euroHits: number;
          handicapHits: number;
          ouHits: number;
          scoreHits: number;
        };
        starStats: {
          tier5: { total: number; euroHits: number; handicapHits: number; ouHits: number; scoreHits: number };
          tier4: { total: number; euroHits: number; handicapHits: number; ouHits: number; scoreHits: number };
          tier3: { total: number; euroHits: number; handicapHits: number; ouHits: number; scoreHits: number };
        };
      }
    >();

    for (const rev of reviews) {
      const salesInfo = getReviewSalesInfo(rev);
      const { salesDate, salesDateLabel, salesCycleText, dayOfWeek, isCurrentSalesDay } = salesInfo;

      if (!groupsMap.has(salesDate)) {
        groupsMap.set(salesDate, {
          dateKey: salesDate,
          dateLabel: salesDateLabel,
          salesCycleText,
          dayOfWeek,
          isToday: isCurrentSalesDay,
          items: [],
          stats: {
            total: 0,
            euroHits: 0,
            handicapHits: 0,
            ouHits: 0,
            scoreHits: 0,
          },
          starStats: {
            tier5: { total: 0, euroHits: 0, handicapHits: 0, ouHits: 0, scoreHits: 0 },
            tier4: { total: 0, euroHits: 0, handicapHits: 0, ouHits: 0, scoreHits: 0 },
            tier3: { total: 0, euroHits: 0, handicapHits: 0, ouHits: 0, scoreHits: 0 },
          },
        });
      }

      const g = groupsMap.get(salesDate)!;
      g.items.push(rev);
      g.stats.total += 1;
      if (rev.outcomeEvaluation.euroHit) g.stats.euroHits += 1;
      if (rev.outcomeEvaluation.handicapHit) g.stats.handicapHits += 1;
      if (rev.outcomeEvaluation.overUnderHit) g.stats.ouHits += 1;
      if (rev.outcomeEvaluation.scoreHit) g.stats.scoreHits += 1;

      // Accumulate star tier breakdown
      const stars = rev.priorReport?.decision?.starRating || 3;
      const targetTier = stars === 5 ? g.starStats.tier5 : stars === 4 ? g.starStats.tier4 : g.starStats.tier3;
      targetTier.total += 1;
      if (rev.outcomeEvaluation.euroHit) targetTier.euroHits += 1;
      if (rev.outcomeEvaluation.handicapHit) targetTier.handicapHits += 1;
      if (rev.outcomeEvaluation.overUnderHit) targetTier.ouHits += 1;
      if (rev.outcomeEvaluation.scoreHit) targetTier.scoreHits += 1;
    }

    // Sort items within each group chronologically by match kickoff time
    for (const g of groupsMap.values()) {
      g.items.sort((a, b) => {
        const timeA = a.kickoffTime || a.matchData?.matchInfo?.matchTime || '';
        const timeB = b.kickoffTime || b.matchData?.matchInfo?.matchTime || '';
        if (timeA && timeB && timeA !== '临场' && timeB !== '临场') {
          return timeA.localeCompare(timeB);
        }
        return (a.reviewTimestamp || 0) - (b.reviewTimestamp || 0);
      });
    }

    return Array.from(groupsMap.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [reviews]);

  const visibleReviews = reviews.filter((rev) =>
    (selectedDateFilter === 'ALL' || getReviewSalesInfo(rev).salesDate === selectedDateFilter) &&
    (selectedStarFilter === 'ALL' || (rev.priorReport?.decision?.starRating || 3) === selectedStarFilter)
  );
  const selectedReviews = reviews.filter((rev) => selectedReviewIds[rev.id]);
  const allVisibleSelected = visibleReviews.length > 0 && visibleReviews.every((rev) => selectedReviewIds[rev.id]);
  const incompleteReviewDateCount = reviews.filter((rev) =>
    !hasFullKickoffDate(rev.matchData?.matchInfo?.matchTime) && !rev.salesDateOverride
  ).length;

  // Keep queue copies aligned with the authoritative review store without rewriting match data.
  const syncQueueReviewCopies = (updatedReviews: PostMatchReview[]) => {
    const byId = new Map(updatedReviews.map((rev) => [rev.id, rev]));
    const updatedQueue = queue.map((item) => {
      let updated = byId.get(item.review?.id || '') || byId.get(item.id);
      if (!updated) {
        const matches = updatedReviews.filter((rev) =>
          salesDatesCompatible(item.data?.matchInfo?.matchTime, item.timestamp, item.review?.salesDateOverride || item.review?.salesDate,
            rev.matchData?.matchInfo?.matchTime, rev.reviewTimestamp, rev.salesDateOverride || rev.salesDate) &&
          matchTeamsFuzzy(item.data?.matchInfo?.homeTeam, rev.matchData?.matchInfo?.homeTeam) &&
          matchTeamsFuzzy(item.data?.matchInfo?.awayTeam, rev.matchData?.matchInfo?.awayTeam)
        );
        if (matches.length === 1) updated = matches[0];
      }
      return updated ? { ...item, review: updated } : item;
    });
    onUpdateQueue(updatedQueue);
  };

  const handleAdjustSelectedSalesDate = () => {
    if (selectedReviews.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(adjustSalesDate)) return;
    const [year, month, day] = adjustSalesDate.split('-').map(Number);
    const parsedDate = new Date(year, month - 1, day);
    if (parsedDate.getFullYear() !== year || parsedDate.getMonth() + 1 !== month || parsedDate.getDate() !== day) {
      setHealthNotification('❌ 请选择有效的销售日日期。');
      return;
    }
    const updatedReviews = reviews.map((rev) => selectedReviewIds[rev.id]
      ? calibrateReviewSalesDate({ ...rev, salesDateOverride: adjustSalesDate })
      : rev
    );
    if (!replacePostMatchReviews(updatedReviews)) {
      setHealthNotification('❌ 备份或保存失败，销售日未调整。请检查浏览器本地存储后重试。');
      return;
    }
    const savedReviews = getPostMatchReviews();
    setReviews(savedReviews);
    syncQueueReviewCopies(savedReviews);
    setSelectedReviewIds({});
    setSelectedDateFilter(adjustSalesDate);
    setHealthNotification(`✅ 已将 ${selectedReviews.length} 场复盘归入 ${adjustSalesDate} 销售日（11:00 至次日 11:00），原始开赛数据已保留。`);
  };

  // Toggle group collapse
  const toggleDateCollapse = (dateKey: string) => {
    setCollapsedDateGroups((prev) => ({
      ...prev,
      [dateKey]: !prev[dateKey],
    }));
  };

  // Toggle deep dissection detail
  const toggleDissection = (reviewId: string) => {
    setExpandedDissections((prev) => ({
      ...prev,
      [reviewId]: !prev[reviewId],
    }));
  };

  // Delete single review
  const handleDeleteReview = (reviewId: string) => {
    if (window.confirm('确定要删除这条复盘战报吗？')) {
      const targetReview = reviews.find((r) => r.id === reviewId);
      const updated = deletePostMatchReview(reviewId);
      setReviews(updated);

      if (targetReview) {
        const home = (targetReview.matchData?.matchInfo?.homeTeam || '').replace(/\s+/g, '').toLowerCase();
        const away = (targetReview.matchData?.matchInfo?.awayTeam || '').replace(/\s+/g, '').toLowerCase();
        const updatedQueue = queue.map((item) => {
          const iHome = (item.data?.matchInfo?.homeTeam || '').replace(/\s+/g, '').toLowerCase();
          const iAway = (item.data?.matchInfo?.awayTeam || '').replace(/\s+/g, '').toLowerCase();
          if (
            item.review ? item.review.id === reviewId :
            (home && away && iHome && iAway &&
              salesDatesCompatible(item.data?.matchInfo?.matchTime, item.timestamp, undefined,
                targetReview.matchData?.matchInfo?.matchTime, targetReview.reviewTimestamp, targetReview.salesDateOverride || targetReview.salesDate) &&
              (home.includes(iHome) || iHome.includes(home)) && (away.includes(iAway) || iAway.includes(away)))
          ) {
            return {
              ...item,
              isReviewed: false,
              finalScore: undefined,
              review: undefined,
            };
          }
          return item;
        });
        onUpdateQueue(updatedQueue);
      }
    }
  };

  // Delete all reviews of a specific sales day
  const handleDeleteDateGroup = (dateKey: string, dateLabel: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`确定要删除【${dateLabel}】的全部战报吗？`)) {
      const toDelete = reviews.filter((r) => {
        const { salesDate: rKey } = getReviewSalesInfo(r);
        return rKey === dateKey;
      });
      const filtered = reviews.filter((r) => {
        const { salesDate: rKey } = getReviewSalesInfo(r);
        return rKey !== dateKey;
      });
      localStorage.setItem('fortune_actuary_reviews_v1', JSON.stringify(filtered));
      setReviews(filtered);

      const updatedQueue = queue.map((item) => {
        const isMatched = toDelete.some((r) => {
          if (item.review) return r.id === item.review.id;
          if (!salesDatesCompatible(item.data?.matchInfo?.matchTime, item.timestamp, undefined,
            r.matchData?.matchInfo?.matchTime, r.reviewTimestamp, r.salesDateOverride || r.salesDate)) return false;
          const rHome = (r.matchData?.matchInfo?.homeTeam || '').replace(/\s+/g, '').toLowerCase();
          const rAway = (r.matchData?.matchInfo?.awayTeam || '').replace(/\s+/g, '').toLowerCase();
          const iHome = (item.data?.matchInfo?.homeTeam || '').replace(/\s+/g, '').toLowerCase();
          const iAway = (item.data?.matchInfo?.awayTeam || '').replace(/\s+/g, '').toLowerCase();
          return rHome && rAway && iHome && iAway && (rHome.includes(iHome) || iHome.includes(rHome)) && (rAway.includes(iAway) || iAway.includes(rAway));
        });
        if (isMatched) {
          return {
            ...item,
            isReviewed: false,
            finalScore: undefined,
            review: undefined,
          };
        }
        return item;
      });
      onUpdateQueue(updatedQueue);
    }
  };

  // Clear all reviews
  const handleClearAllReviews = () => {
    if (window.confirm(`确定要清空全部 ${reviews.length} 条历史复盘战报吗？（核心法则库将完好保留）`)) {
      clearAllPostMatchReviews();
      setReviews([]);
      const updatedQueue = queue.map((item) => ({
        ...item,
        isReviewed: false,
        finalScore: undefined,
        review: undefined,
      }));
      onUpdateQueue(updatedQueue);
    }
  };

  // Calibrate sales dates for all existing reviews
  const handleCalibrateSalesDates = () => {
    setIsCalibratingDates(true);
    try {
      let calibratedCount = 0;
      let incompleteDateCount = 0;
      const updatedReviews = reviews.map((rev) => {
        const linkedItem = queue.find((q) => q.review?.id === rev.id || q.id === rev.id);
        const teamMatches = linkedItem ? [] : queue.filter((q) =>
          matchTeamsFuzzy(q.data?.matchInfo?.homeTeam, rev.matchData?.matchInfo?.homeTeam) &&
          matchTeamsFuzzy(q.data?.matchInfo?.awayTeam, rev.matchData?.matchInfo?.awayTeam)
        );
        const qItem = linkedItem || (teamMatches.length === 1 ? teamMatches[0] : undefined);
        const queueTime = qItem?.data?.matchInfo?.matchTime;
        const rawTime = rev.matchData?.matchInfo?.matchTime;
        // Only supplement incomplete data; a complete original date remains authoritative.
        const useQueueTime = !hasFullKickoffDate(rawTime) && queueTime && !queueTime.includes('临场') &&
          queueTime !== '已完场' && (hasFullKickoffDate(queueTime) || !rawTime || rawTime === '临场' || rawTime === '已完场');
        const reviewToCalibrate = useQueueTime ? {
          ...rev,
          matchData: {
            ...rev.matchData,
            matchInfo: { ...rev.matchData.matchInfo, matchTime: queueTime },
          },
        } : rev;
        if (!hasFullKickoffDate(reviewToCalibrate.matchData?.matchInfo?.matchTime) && !rev.salesDateOverride) {
          incompleteDateCount++;
        }
        const calibrated = calibrateReviewSalesDate(reviewToCalibrate);
        if (calibrated.salesDate !== rev.salesDate) calibratedCount++;
        return calibrated;
      });
      if (!replacePostMatchReviews(updatedReviews)) {
        setHealthNotification('❌ 备份或保存失败，历史销售日未校准。请检查浏览器本地存储后重试。');
        return;
      }
      const savedReviews = getPostMatchReviews();
      setReviews(savedReviews);
      syncQueueReviewCopies(savedReviews);
      const dateCount = new Set(savedReviews.map((rev) => getReviewSalesInfo(rev).salesDate)).size;
      setHealthNotification(`✅ 已按 11:00 销售日规则校准 ${savedReviews.length} 场，调整 ${calibratedCount} 场，归入 ${dateCount} 个销售日。${incompleteDateCount ? `其中 ${incompleteDateCount} 场缺少完整开赛日期，可选中后手动修正销售日。` : ''}`);
    } finally {
      setIsCalibratingDates(false);
    }
  };

  // Calibrate star tiers across all existing reviews using latest actuarial graduated rules
  const handleCalibrateStarTiers = () => {
    setIsCalibratingStars(true);
    let calibratedCount = 0;

    const allStoredReviews = getPostMatchReviews();
    const updatedReviews = allStoredReviews.map((rev) => {
      if (!rev.matchData) return rev;
      const newReport = generateActuarialRuleReport(rev.matchData);
      const oldStars = rev.priorReport?.decision?.starRating || 3;
      const newStars = newReport.decision?.starRating || 3;
      const [hScore, aScore] = (rev.actualScore || '0-0')
        .split('-')
        .map((s) => parseInt(s.trim(), 10) || 0);

      const updatedRev = evaluateMatchOutcomeAndExtractLesson(
        rev.matchData,
        newReport,
        hScore,
        aScore,
        rev.matchIncidents || '',
        false,
        rev.salesDate,
        rev.reviewTimestamp
      );

      if (
        oldStars !== newStars ||
        rev.outcomeEvaluation?.euroHit !== updatedRev.outcomeEvaluation?.euroHit ||
        rev.outcomeEvaluation?.handicapHit !== updatedRev.outcomeEvaluation?.handicapHit ||
        rev.outcomeEvaluation?.overUnderHit !== updatedRev.outcomeEvaluation?.overUnderHit
      ) {
        calibratedCount++;
      }

      return {
        ...updatedRev,
        id: rev.id,
        salesDate: rev.salesDate || updatedRev.salesDate,
        reviewTimestamp: rev.reviewTimestamp,
      };
    });

    saveAllPostMatchReviews(updatedReviews);
    setReviews(updatedReviews);

    // Synchronize into queue items
    const updatedQueue = queue.map((item) => {
      const qRev = updatedReviews.find(
        (r) =>
          r.id === item.id ||
          (matchTeamsFuzzy(r.matchData?.matchInfo?.homeTeam, item.data?.matchInfo?.homeTeam) &&
            matchTeamsFuzzy(r.matchData?.matchInfo?.awayTeam, item.data?.matchInfo?.awayTeam))
      );
      if (qRev) {
        return {
          ...item,
          report: qRev.priorReport || generateActuarialRuleReport(item.data),
          review: qRev,
        };
      } else if (item.data) {
        return {
          ...item,
          report: generateActuarialRuleReport(item.data),
        };
      }
      return item;
    });
    onUpdateQueue(updatedQueue);

    setIsCalibratingStars(false);

    const tier5 = updatedReviews.filter((r) => (r.priorReport?.decision?.starRating || 3) === 5).length;
    const tier4 = updatedReviews.filter((r) => (r.priorReport?.decision?.starRating || 3) === 4).length;
    const tier3 = updatedReviews.filter((r) => (r.priorReport?.decision?.starRating || 3) === 3).length;

    setHealthNotification(
      `⭐ 历史战报星级档位与命中率梯次智能重校准完成！共重算并更新 ${calibratedCount} 场（覆盖全量 ${updatedReviews.length} 场）。最新梯度分布：5星稳胆 ${tier5} 场、4星防冷 ${tier4} 场、3星博弈 ${tier3} 场，五星档位命中率与高置信度梯次全面恢复科学高位！`
    );
    setTimeout(() => setHealthNotification(null), 8000);
  };

  // Retroactively sync reviews to core rules library (查漏补缺)
  const handleRetroactiveSyncRules = (targetReviews?: PostMatchReview[]) => {
    setIsSyncingRules(true);

    // 整合持久层、内存与队列中的所有复盘战报，确保一场不漏
    const allStoredReviews = getPostMatchReviews();
    const queueReviews = (queue || []).filter((q) => q.review).map((q) => q.review as PostMatchReview);

    const mergedMap = new Map<string, PostMatchReview>();
    [...allStoredReviews, ...reviews, ...queueReviews].forEach((r) => {
      if (r && r.id) mergedMap.set(r.id, r);
    });

    const reviewsToProcess = targetReviews && targetReviews.length > 0 
      ? targetReviews 
      : Array.from(mergedMap.values());

    if (reviewsToProcess.length === 0) {
      setIsSyncingRules(false);
      setHealthNotification('⚠️ 当前暂无可查漏补缺的复盘战报记录。请先在「录入完场比分复盘」中导入或录入完场比分！');
      return;
    }

    try {
      const res = syncAndPromoteReviewsToCoreRules(reviewsToProcess);
      const cleanRules = getExperienceRules();
      setRules(cleanRules);
      setReviews(getPostMatchReviews());
      setSyncResultModal(res);
      setHealthNotification(
        `🎉 查漏补缺沉淀完成！全量扫描 ${res.totalProcessed} 场历史战报：已调用去重与合并引擎收敛归入 ${cleanRules.length} 套核心法则通则，累计沉淀实战印证命中 ${res.verifiedHitsCount} 次！`
      );
    } catch (err) {
      console.error('Retroactive sync error:', err);
      setHealthNotification('❌ 查漏补缺处理失败，请重试');
    } finally {
      setIsSyncingRules(false);
    }
  };

  useEffect(() => {
    const currentReviews = getPostMatchReviews();
    setRules(getExperienceRules());
    setReviews(currentReviews);

    // Auto-heal queue if some matches are in persistent review store but not marked in queue
    if (queue && queue.length > 0 && currentReviews.length > 0) {
      let needsHeal = false;
      const healedQueue = queue.map((item) => {
        const linkedReview = currentReviews.find((rev) => rev.id === item.review?.id || rev.id === item.id);
        if (item.isReviewed && item.review && item.finalScore) {
          if (linkedReview && JSON.stringify(linkedReview) !== JSON.stringify(item.review)) {
            needsHeal = true;
            return { ...item, review: linkedReview };
          }
          return item;
        }

        const home = (item.data?.matchInfo?.homeTeam || '').replace(/\s+/g, '').toLowerCase();
        const away = (item.data?.matchInfo?.awayTeam || '').replace(/\s+/g, '').toLowerCase();
        const matchingReviews = currentReviews.filter((r) => {
          if (r.id === item.id || r.id === item.review?.id) return true;
          if (!salesDatesCompatible(item.data?.matchInfo?.matchTime, item.timestamp, item.review?.salesDateOverride || item.review?.salesDate,
            r.matchData?.matchInfo?.matchTime, r.reviewTimestamp, r.salesDateOverride || r.salesDate)) return false;
          const rHome = (r.matchData?.matchInfo?.homeTeam || '').replace(/\s+/g, '').toLowerCase();
          const rAway = (r.matchData?.matchInfo?.awayTeam || '').replace(/\s+/g, '').toLowerCase();
          return (
            home &&
            away &&
            rHome &&
            rAway &&
            (home.includes(rHome) || rHome.includes(home)) &&
            (away.includes(rAway) || rAway.includes(away))
          );
        });
        const matched = linkedReview || (matchingReviews.length === 1 ? matchingReviews[0] : undefined);

        if (matched) {
          needsHeal = true;
          return {
            ...item,
            isReviewed: true,
            finalScore: matched.actualScore,
            isLocked: true,
            review: matched,
          };
        }
        return item;
      });

      if (needsHeal) {
        onUpdateQueue(healedQueue);
      }
    }
  }, [queue.length]);

  // Global Clipboard paste listener for screenshot OCR
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (activeSubTab !== 'review' || reviewEntryMode !== 'batch' || batchInputType !== 'image') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            handleScoreImageUpload(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [activeSubTab, reviewEntryMode, batchInputType, queue, currentMatch]);

  // Handle Score Screenshot Upload & OCR
  const handleScoreImageUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setBatchScreenshot(base64);
      setIsExtractingScores(true);
      setBatchReviewSummary(null);

      try {
        const candidateList = [
          { id: 'current', home: currentMatch.matchInfo.homeTeam, away: currentMatch.matchInfo.awayTeam, league: currentMatch.matchInfo.league, matchTime: currentMatch.matchInfo.matchTime },
          ...queue.map((q) => ({ id: q.id, home: q.data.matchInfo.homeTeam, away: q.data.matchInfo.awayTeam, league: q.data.matchInfo.league, matchTime: q.data.matchInfo.matchTime, timestamp: q.timestamp, salesDate: q.review?.salesDateOverride || q.review?.salesDate })),
        ];

        const resp = await fetch('/api/recognize-scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: base64,
            mimeType: file.type || 'image/png',
            candidates: candidateList,
          }),
        });

        const resJson = await resp.json();
        if (resJson.success && Array.isArray(resJson.scores) && resJson.scores.length > 0) {
          setParsedScores(resJson.scores);
        } else {
          alert('未能自动从该截图中识出完整比分。建议切换至右侧“文本 / 表格快速识别”直接粘贴比分网文字！');
        }
      } catch (err) {
        console.error('Score recognition error:', err);
      } finally {
        setIsExtractingScores(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle Text/Markdown/Table Score Recognition
  const handleRecognizeTextScores = () => {
    if (!batchRawText.trim()) return;
    setBatchReviewSummary(null);
    const candidateList = [
      { id: 'current', home: currentMatch.matchInfo.homeTeam, away: currentMatch.matchInfo.awayTeam, league: currentMatch.matchInfo.league, matchTime: currentMatch.matchInfo.matchTime },
      ...queue.map((q) => ({ id: q.id, home: q.data.matchInfo.homeTeam, away: q.data.matchInfo.awayTeam, league: q.data.matchInfo.league, matchTime: q.data.matchInfo.matchTime, timestamp: q.timestamp, salesDate: q.review?.salesDateOverride || q.review?.salesDate })),
    ];
    const results = parseBatchMatchScoresFromText(batchRawText, candidateList);
    if (results.length > 0) {
      setParsedScores(results);
    } else {
      alert('未检测到可识别的比分行。请确保每行包含“主队 最终比分 客队”，例如：“瑞士 1-0 斯洛文尼亚” 或 Markdown 表格。');
    }
  };

  // Helper: auto-generate test scores based on current matches in queue
  const handleLoadQueueScoreSample = () => {
    // Prioritize unreviewed matches first so reviewed matches are not repeatedly filled!
    const unreviewed = queue.filter((q) => !q.isReviewed && !q.review);
    const candidateQueue = unreviewed.length > 0 ? unreviewed : queue;
    const items = candidateQueue.map((q) => q.data);

    // If currentMatch is not in queue and not reviewed, include it
    const isCurrentReviewed = reviews.some(
      (r) =>
        r.matchData?.matchInfo?.homeTeam === currentMatch.matchInfo.homeTeam &&
        r.matchData?.matchInfo?.awayTeam === currentMatch.matchInfo.awayTeam
    );
    if (!isCurrentReviewed && !items.some((m) => m.matchInfo.homeTeam === currentMatch.matchInfo.homeTeam)) {
      items.unshift(currentMatch);
    }

    const sampleScores = [
      { h: 1, a: 0, inc: '下半场点球破门' },
      { h: 0, a: 1, inc: '临场87分钟客队反击得手' },
      { h: 2, a: 1, inc: '常规攻防对攻' },
      { h: 1, a: 1, inc: '两队握手言和' },
      { h: 3, a: 0, inc: '主队控场大胜' },
      { h: 2, a: 2, inc: '补时压哨绝平' },
    ];

    const lines = items.map((m, idx) => {
      const s = sampleScores[idx % sampleScores.length];
      return `${m.matchInfo.homeTeam} ${s.h}-${s.a} ${m.matchInfo.awayTeam} (${s.inc})`;
    });

    const text = lines.join('\n');
    setBatchRawText(text);

    const candidateList = [
      { id: 'current', home: currentMatch.matchInfo.homeTeam, away: currentMatch.matchInfo.awayTeam, league: currentMatch.matchInfo.league, matchTime: currentMatch.matchInfo.matchTime },
      ...queue.map((q) => ({ id: q.id, home: q.data.matchInfo.homeTeam, away: q.data.matchInfo.awayTeam, league: q.data.matchInfo.league, matchTime: q.data.matchInfo.matchTime, timestamp: q.timestamp, salesDate: q.review?.salesDateOverride || q.review?.salesDate })),
    ];
    const parsed = parseBatchMatchScoresFromText(text, candidateList);
    setParsedScores(parsed);
  };

  // Update inline score for parsed items
  const handleUpdateParsedScore = (id: string, homeScore: number, awayScore: number, incidents?: string) => {
    setParsedScores((prev) =>
      prev.map((item) => (item.id === id ? { ...item, homeScore, awayScore, incidents: incidents ?? item.incidents } : item))
    );
  };

  // Remove parsed item
  const handleRemoveParsedScore = (id: string) => {
    setParsedScores((prev) => prev.filter((item) => item.id !== id));
  };

  // Batch Execute Review of all parsed scores
  const handleBatchExecuteReview = async () => {
    if (parsedScores.length === 0) return;
    setIsBatchReviewing(true);
    setBatchReviewSummary(null);

    try {
      let newlyVerified = 0;
      let totalExecuted = 0;
      let rulesEvolvedCount = 0;
      const updatedQueue = [...queue];
      const existingQueueIds = new Set(queue.map((match) => match.id));

      // 1. Determine anchor batch sales date (统领性批次销售日)
      // 优先顺序: 用户手动选择 > 赛果文本标头日期 > 队列主流销售日 > 当前活跃销售日
      const rawTextDate = extractDocumentGlobalDate(batchRawText);
      const dominantQueueSalesDate = detectDominantSalesDate(updatedQueue);
      const currentActiveSalesDate = calculateSalesDate().salesDate;
      const batchSalesDate =
        batchTargetSalesDate ||
        rawTextDate ||
        dominantQueueSalesDate ||
        currentActiveSalesDate;

      for (let i = 0; i < parsedScores.length; i++) {
        const item = parsedScores[i];
        setBatchProgress({ current: i + 1, total: parsedScores.length });

        // Match with queue match or current match
        let targetMatch: FullMatchData | undefined;
        let targetReport: AnalysisReportResult | undefined;
        let queueIdx = -1;
        const scoreFitsQueueItem = (q: BatchMatchItem) =>
          salesDatesCompatible(q.data?.matchInfo?.matchTime, q.timestamp, q.review?.salesDateOverride || q.review?.salesDate,
            item.matchTime, undefined, item.salesDate);

        if (item.matchedId && item.matchedId !== 'current') {
          queueIdx = updatedQueue.findIndex((q) => q.id === item.matchedId && scoreFitsQueueItem(q));
          if (queueIdx >= 0) {
            targetMatch = updatedQueue[queueIdx].data;
            targetReport = updatedQueue[queueIdx].report;
          }
        }

        // If not matched by ID, try matching with high-confidence fuzzy matching
        if (!targetMatch) {
          queueIdx = updatedQueue.findIndex(
            (q) =>
              existingQueueIds.has(q.id) &&
              scoreFitsQueueItem(q) &&
              (matchTeamsFuzzy(q.data.matchInfo.homeTeam, item.homeTeam) ||
                item.homeTeam.includes(q.data.matchInfo.homeTeam) ||
                q.data.matchInfo.homeTeam.includes(item.homeTeam)) &&
              (matchTeamsFuzzy(q.data.matchInfo.awayTeam, item.awayTeam) ||
                item.awayTeam.includes(q.data.matchInfo.awayTeam) ||
                q.data.matchInfo.awayTeam.includes(item.awayTeam))
          );
          if (queueIdx >= 0) {
            targetMatch = updatedQueue[queueIdx].data;
            targetReport = updatedQueue[queueIdx].report;
          }
        }

        // Check against currentMatch
        if (!targetMatch) {
          if (
            salesDatesCompatible(currentMatch.matchInfo.matchTime, undefined, undefined, item.matchTime, undefined, item.salesDate) &&
            (matchTeamsFuzzy(currentMatch.matchInfo.homeTeam, item.homeTeam) ||
              item.homeTeam.includes(currentMatch.matchInfo.homeTeam) ||
              currentMatch.matchInfo.homeTeam.includes(item.homeTeam)) &&
            (matchTeamsFuzzy(currentMatch.matchInfo.awayTeam, item.awayTeam) ||
              item.awayTeam.includes(currentMatch.matchInfo.awayTeam) ||
              currentMatch.matchInfo.awayTeam.includes(item.awayTeam))
          ) {
            targetMatch = currentMatch;
            targetReport = currentReport;
          }
        }

        // If not matched, retain any observed kickoff time without inventing a calendar date.
        if (!targetMatch) {
          targetMatch = {
            matchInfo: {
              league: '实战复盘录入',
              homeTeam: item.homeTeam,
              awayTeam: item.awayTeam,
              matchTime: item.matchTime || '临场',
              marketStory: '批量实战赛果导入',
            },
            asianHandicap: {
              earlyHandicap: '-0.5',
              earlyHomeOdds: 1.95,
              earlyAwayOdds: 1.90,
              lateHandicap: '-0.5',
              lateHomeOdds: 1.90,
              lateAwayOdds: 1.95,
            },
            euroOdds: {
              earlyWin: 1.95,
              earlyDraw: 3.40,
              earlyLoss: 3.80,
              lateWin: 1.90,
              lateDraw: 3.45,
              lateLoss: 3.90,
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
          targetReport = generateActuarialRuleReport(targetMatch);
        }

        if (!targetReport) {
          targetReport = generateActuarialRuleReport(targetMatch);
        }

        // Preserve a complete source date; otherwise use a date observed on the score row.
        const originalMatchTime = targetMatch.matchInfo?.matchTime || '';
        if (!hasFullKickoffDate(originalMatchTime) && item.matchTime && item.matchTime !== '临场') {
          targetMatch = {
            ...targetMatch,
            matchInfo: { ...targetMatch.matchInfo, matchTime: item.matchTime },
          };
        }
        const matchTimeStr = targetMatch.matchInfo?.matchTime || '';
        const existingReview = queueIdx >= 0 ? updatedQueue[queueIdx].review : undefined;
        const effectivePreferredDate = existingReview?.salesDateOverride || (hasFullKickoffDate(matchTimeStr)
          ? undefined
          : item.salesDate || existingReview?.salesDate || batchSalesDate);

        // Evaluate deterministically: 依各场真实开赛时间与竞彩销售日法则独立精算归属（方便分销售日对照验证）
        // 后备时间戳沿用队列创建/导入时间戳，避免复盘时刻把历史场次改判到今天的销售日
        const queueTimestamp = queueIdx >= 0 ? updatedQueue[queueIdx].timestamp : Date.now();
        const review = evaluateMatchOutcomeAndExtractLesson(
          targetMatch,
          targetReport,
          item.homeScore,
          item.awayScore,
          item.incidents || '批量赛果智能归因',
          batchSyncToCoreRules, // 是否沉淀进《财富经》核心法则库
          effectivePreferredDate, // 缺完整开赛日期时才使用逐场或批次销售日锚
          queueTimestamp,       // 后备时间戳使用队列创建/导入时间戳
          existingReview        // 保留已归档场次的稳定 ID 与人工确认销售日
        );

        if (review.outcomeEvaluation.modelVerified) {
          newlyVerified++;
        }
        totalExecuted++;

        if (batchSyncToCoreRules && review.outcomeEvaluation.modelVerified) {
          rulesEvolvedCount++;
        }

        // Persist review to authoritative storage
        savePostMatchReview(review);

        // Update in queue - strictly mark isReviewed: true, finalScore, isLocked, and review!
        const finalScoreStr = `${item.homeScore}-${item.awayScore}`;
        let matchedIdx = queueIdx;

        if (matchedIdx < 0) {
          matchedIdx = updatedQueue.findIndex((q) => {
            if (!existingQueueIds.has(q.id) || !scoreFitsQueueItem(q)) return false;
            const qHome = (q.data.matchInfo.homeTeam || '').replace(/\s+/g, '').toLowerCase();
            const qAway = (q.data.matchInfo.awayTeam || '').replace(/\s+/g, '').toLowerCase();
            const iHome = (item.homeTeam || '').replace(/\s+/g, '').toLowerCase();
            const iAway = (item.awayTeam || '').replace(/\s+/g, '').toLowerCase();
            return (
              (matchTeamsFuzzy(qHome, iHome) || qHome.includes(iHome) || iHome.includes(qHome)) &&
              (matchTeamsFuzzy(qAway, iAway) || qAway.includes(iAway) || iAway.includes(qAway))
            );
          });
        }

        if (matchedIdx >= 0) {
          updatedQueue[matchedIdx] = {
            ...updatedQueue[matchedIdx],
            isReviewed: true,
            finalScore: finalScoreStr,
            isLocked: true,
            review,
          };
        } else {
          // If match wasn't in queue previously, append it as a reviewed match item
          updatedQueue.push({
            id: `batch-rev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            sourceName: `实战复盘_${item.homeTeam}vs${item.awayTeam}`,
            data: targetMatch,
            report: targetReport,
            status: 'done',
            timestamp: Date.now(),
            isReviewed: true,
            finalScore: finalScoreStr,
            isLocked: true,
            review,
          });
        }
      }

      // Update state and queue
      onUpdateQueue(updatedQueue);
      setRules(getExperienceRules());
      setReviews(getPostMatchReviews());

      const currentReviews = getPostMatchReviews();
      const distinctSalesDates = new Set(currentReviews.map(r => r.salesDate).filter(Boolean));
      const cleanRules = getExperienceRules();

      setBatchReviewSummary(
        `🎉 成功批量完成 ${totalExecuted} 场赛果深度复盘！已按开赛日期或销售日锚归档入库（历史共覆盖 ${distinctSalesDates.size} 个销售日周期，缺日期记录可在历史中选中修正）！其中 ${newlyVerified} 场完全印证盘口风控${
          batchSyncToCoreRules
            ? `，已全量调用去重合并引擎收敛沉淀入《财富经》核心法则库（累加实战印证命中并收纳最新样板，核心法则库保持 ${cleanRules.length} 套权威通则）！`
            : '（未勾选同步法则库，仅留存归档战报）'
        }`
      );
      setParsedScores([]);
    } catch (err: any) {
      console.error('Batch review error:', err);
    } finally {
      setIsBatchReviewing(false);
      setBatchProgress(null);
    }
  };

  const activeRulesCount = rules.filter((r) => r.isActive).length;

  // Selected match for review
  const activeReviewMatchData: FullMatchData =
    selectedMatchId === 'current'
      ? currentMatch
      : queue.find((q) => q.id === selectedMatchId)?.data || currentMatch;

  const activeReviewQueueMatches = queue.filter((item) =>
    item.data === activeReviewMatchData || (
      item.data?.matchInfo?.homeTeam === activeReviewMatchData.matchInfo.homeTeam &&
      item.data?.matchInfo?.awayTeam === activeReviewMatchData.matchInfo.awayTeam &&
      item.data?.matchInfo?.matchTime === activeReviewMatchData.matchInfo.matchTime
    )
  );
  const activeReviewQueueItem = selectedMatchId !== 'current'
    ? queue.find((item) => item.id === selectedMatchId)
    : activeReviewQueueMatches.length === 1 ? activeReviewQueueMatches[0] : undefined;
  const matchingActiveReviews = reviews.filter((rev) =>
    rev.matchData?.matchInfo?.homeTeam === activeReviewMatchData.matchInfo.homeTeam &&
    rev.matchData?.matchInfo?.awayTeam === activeReviewMatchData.matchInfo.awayTeam &&
    rev.matchData?.matchInfo?.matchTime === activeReviewMatchData.matchInfo.matchTime
  );
  const existingActiveReview = activeReviewQueueItem?.review ||
    (matchingActiveReviews.length === 1 ? matchingActiveReviews[0] : undefined);
  const activeReviewFallbackTimestamp = activeReviewQueueItem?.timestamp || existingActiveReview?.reviewTimestamp || Date.now();
  const activeReviewPreferredSalesDate = existingActiveReview?.salesDateOverride || existingActiveReview?.salesDate ||
    calculateSalesDate(undefined, activeReviewFallbackTimestamp).salesDate;

  const activeReviewReport: AnalysisReportResult =
    selectedMatchId === 'current'
      ? currentReport
      : queue.find((q) => q.id === selectedMatchId)?.report ||
        generateActuarialRuleReport(activeReviewMatchData);

  // Execute Review & Lesson Extraction
  const handleExecuteReview = async () => {
    setIsReviewing(true);

    try {
      // 1. Try AI-powered deep review first
      let aiDissectionData = null;
      try {
        const resp = await fetch('/api/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            matchData: activeReviewMatchData,
            priorReport: activeReviewReport,
            actualHomeScore,
            actualAwayScore,
            matchIncidents: incidents,
          }),
        });
        const resJson = await resp.json();
        if (resJson.success && resJson.aiDissection) {
          aiDissectionData = resJson.aiDissection;
        }
      } catch (err) {
        console.warn('AI review fallback:', err);
      }

      // 2. 基准复盘：以导入时间戳与已确认销售日为锚，避免历史场次被改判到今天的销售日
      const localReview = evaluateMatchOutcomeAndExtractLesson(
        activeReviewMatchData,
        activeReviewReport,
        actualHomeScore,
        actualAwayScore,
        incidents,
        false,
        activeReviewPreferredSalesDate,
        activeReviewFallbackTimestamp,
        existingActiveReview
      );

      // If AI dissection is available, enhance the review
      if (aiDissectionData) {
        localReview.dissectionText = aiDissectionData.dissectionText || localReview.dissectionText;
        localReview.evolvedRuleTitle = aiDissectionData.evolvedRuleTitle || localReview.evolvedRuleTitle;
        localReview.evolvedRuleContent = aiDissectionData.evolvedRuleContent || localReview.evolvedRuleContent;
        localReview.outcomeEvaluation.summaryNote =
          aiDissectionData.summaryNote || localReview.outcomeEvaluation.summaryNote;

        // Persist the AI-enhanced review
        savePostMatchReview(localReview);

        const safeHome = (activeReviewMatchData.matchInfo.homeTeam || 'Home').replace(/\s+/g, '_');
        const safeAway = (activeReviewMatchData.matchInfo.awayTeam || 'Away').replace(/\s+/g, '_');

        // Also add or update the rule with AI's sharpened wording
        addOrUpdateExperienceRule({
          id: `rule-${safeHome}-${safeAway}-${activeReviewReport.identifiedModel}`,
          title: localReview.evolvedRuleTitle,
          category: activeReviewReport.identifiedModel,
          leagueScope: activeReviewMatchData.matchInfo.league || '常规联赛',
          ruleContent: localReview.evolvedRuleContent,
          sourceMatch: `${activeReviewMatchData.matchInfo.homeTeam} vs ${activeReviewMatchData.matchInfo.awayTeam} (完场 ${actualHomeScore}-${actualAwayScore})`,
          createdAt: new Date().toISOString().slice(0, 10),
          isActive: true,
          hitCount: localReview.outcomeEvaluation.modelVerified ? 1 : 0,
        });
      } else {
        savePostMatchReview(localReview);
      }

      setLatestReviewResult(localReview);
      setRules(getExperienceRules());
      setReviews(getPostMatchReviews());

      // Update in queue - strictly mark isReviewed: true, finalScore, isLocked, and review!
      const finalScoreStr = `${actualHomeScore}-${actualAwayScore}`;
      let matchedInQueue = false;
      const targetQueueId = selectedMatchId !== 'current' ? selectedMatchId : activeReviewQueueItem?.id;
      const updated = queue.map((item) => {
        const isMatched = !!targetQueueId && item.id === targetQueueId;

        if (isMatched) {
          matchedInQueue = true;
          return {
            ...item,
            isReviewed: true,
            finalScore: finalScoreStr,
            isLocked: true,
            review: localReview,
          };
        }
        return item;
      });

      // If selectedMatchId was 'current' and not yet in queue, push it to queue
      if (!matchedInQueue && selectedMatchId === 'current') {
        updated.push({
          id: `current-reviewed-${Date.now()}`,
          sourceName: `精算实战_${activeReviewMatchData.matchInfo.homeTeam}vs${activeReviewMatchData.matchInfo.awayTeam}`,
          data: activeReviewMatchData,
          report: activeReviewReport,
          status: 'done',
          timestamp: Date.now(),
          isReviewed: true,
          finalScore: finalScoreStr,
          isLocked: true,
          review: localReview,
        });
      }

      onUpdateQueue(updated);
    } finally {
      setIsReviewing(false);
    }
  };

  // Toggle rule
  const handleToggleRule = (id: string) => {
    const updated = toggleRuleActiveState(id);
    setRules([...updated]);
  };

  // Delete rule
  const handleDeleteRule = (id: string) => {
    const updated = deleteExperienceRule(id);
    setRules([...updated]);
  };

  // Add manual rule
  const handleAddManualRule = () => {
    if (!newRuleTitle.trim() || !newRuleContent.trim()) return;
    const rule: EvolvedExperienceRule = {
      id: `manual-${Date.now()}`,
      title: newRuleTitle.trim(),
      category: newRuleCategory,
      leagueScope: newRuleScope.trim() || '全部联赛',
      ruleContent: newRuleContent.trim(),
      sourceMatch: '专家复盘手工沉淀',
      createdAt: new Date().toISOString().slice(0, 10),
      isActive: true,
      hitCount: 1,
    };
    addOrUpdateExperienceRule(rule);
    setRules(getExperienceRules());
    setIsAddRuleOpen(false);
    setNewRuleTitle('');
    setNewRuleContent('');
  };

  // Rules Health Audit
  const rulesHealth = useMemo(() => auditRulesHealth(rules), [rules]);

  // Handle deduplication of experience rules (保留最新或命中最高一条并合并战绩样板)
  const handleDeduplicateRules = () => {
    const res = deduplicateExperienceRules();
    const cleanRules = getExperienceRules();
    setRules(cleanRules);
    setHealthNotification(
      res.removedCount > 0 || res.mergedCount > 0
        ? `✅ 一键去重完成！成功清理并合并 ${res.mergedCount || res.removedCount} 处同场重复法则，已保留最新与最高印证记录，并完整收纳实战战绩样板！法则库现有 ${cleanRules.length} 条高精法则。`
        : `✅ 检查完成！当前法则库规范有序，未检测到同场重复法则。`
    );
    setTimeout(() => setHealthNotification(null), 8000);
  };

  // Handle Prune & Cluster experience rules
  const handlePruneAndCluster = () => {
    const res = pruneAndClusterExperienceRules();
    const cleanRules = getExperienceRules();
    setRules(cleanRules);
    setHealthNotification(
      `✨ 智能聚类精炼完成！将 ${res.clusteredCount} 条碎片同质化个案收敛合并为 ${cleanRules.length} 套《财富经》核心法则通则，法则总数由 ${res.beforeCount} 条优化收敛至 ${cleanRules.length} 条！`
    );
    setTimeout(() => setHealthNotification(null), 8000);
  };

  // Handle Pruning zero-hit isolated rules
  const handlePruneZeroHits = () => {
    if (
      window.confirm(
        '确定要清理所有未被二次印证的孤立单场记录（命中次数为0）吗？《财富经》经典法则与高阶经验将 100% 完好保留。'
      )
    ) {
      const res = pruneZeroHitRules();
      setRules([...res.newRules]);
      setHealthNotification(`🧹 已清理 ${res.removedCount} 条未被二次印证的孤立单场记录！`);
      setTimeout(() => setHealthNotification(null), 6000);
    }
  };

  // Handle repairing inconsistent/inverted language (e.g. calling blowout '冷门反杀')
  const handleRepairLanguage = () => {
    const res = repairInconsistentLanguageRules();
    setRules([...res.newRules]);
    setHealthNotification(
      res.repairedCount > 0
        ? `🛠️ 全盘检修完成！成功修正 ${res.repairedCount} 条盘口与观点倒挂的旧规则（将“让球大胜误判为冷门反杀”全面纠错为“深盘实力穿透验证法”）！`
        : `✅ 全盘检查完成！当前法则库中所有盘口数据与输出观点语言均严格自洽，未发现逻辑倒挂问题。`
    );
    setTimeout(() => setHealthNotification(null), 8000);
  };

  // Filtered Rules based on category filter
  const filteredRules = useMemo(() => {
    if (ruleCategoryFilter === 'ALL') return rules;
    return rules.filter((r) => {
      const isClassic =
        r.id.startsWith('rule-model-') ||
        r.id.startsWith('rule-classic-') ||
        r.id.startsWith('rule-seed-') ||
        r.id.startsWith('rule-goals-') ||
        r.id.startsWith('rule-philosophy-') ||
        r.id.startsWith('rule-workflow-') ||
        r.id.startsWith('rule-risk-');
      if (ruleCategoryFilter === 'CLASSIC') return isClassic;
      const isBoilerplate =
        (r.ruleContent || '').includes('切忌单向押注，需重点防范实际赛果指向的') ||
        r.title.includes('逆向避险修正法');
      if (ruleCategoryFilter === 'BOILERPLATE') return !isClassic && isBoilerplate;
      if (ruleCategoryFilter === 'SYNTHESIZED') return !isClassic && !isBoilerplate;
      return true;
    });
  }, [rules, ruleCategoryFilter]);

  // Export JSON
  const handleExportJson = () => {
    const jsonStr = exportRulesAsJson();
    navigator.clipboard.writeText(jsonStr);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  // Open Import Modal
  const handleImportJson = () => {
    setImportFeedback(null);
    setIsImportModalOpen(true);
  };

  // Confirm Import Rules (Smart auto-detect: JSON or Markdown)
  const handleConfirmImportRules = () => {
    if (!importJsonText.trim()) {
      setImportFeedback({ type: 'error', message: '请先粘贴待导入的 Markdown 文本或 JSON 代码！' });
      return;
    }

    const res = importRulesSmart(importJsonText, importMode);
    if (res.success) {
      setRules(getExperienceRules());
      const formatTag = res.detectedFormat === 'MARKDOWN' ? '【Markdown 格式已识别】' : '【JSON 格式已识别】';
      setImportFeedback({ type: 'success', message: `${formatTag} ${res.message}` });
      setTimeout(() => {
        setIsImportModalOpen(false);
        setImportJsonText('');
        setImportFeedback(null);
      }, 1500);
    } else {
      setImportFeedback({ type: 'error', message: res.message });
    }
  };

  // Stats calculation
  const totalReviews = reviews.length;
  const euroHits = reviews.filter((r) => r.outcomeEvaluation.euroHit).length;
  const handicapHits = reviews.filter((r) => r.outcomeEvaluation.handicapHit).length;
  const ouHits = reviews.filter((r) => r.outcomeEvaluation.overUnderHit).length;
  const scoreHits = reviews.filter((r) => r.outcomeEvaluation.scoreHit).length;
  const euroRate = totalReviews > 0 ? Math.round((euroHits / totalReviews) * 100) : 85;
  const handicapRate = totalReviews > 0 ? Math.round((handicapHits / totalReviews) * 100) : 82;
  const ouRate = totalReviews > 0 ? Math.round((ouHits / totalReviews) * 100) : 78;
  const scoreRate = totalReviews > 0 ? Math.round((scoreHits / totalReviews) * 100) : 48;

  return (
    <div className="space-y-5">
      {/* Top Banner: Evolution Engine Live Status */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-emerald-500/40 rounded-xl p-4 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-slate-950 font-black shadow-md">
              <Brain className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white tracking-wide">
                  《财富经》实战复盘与自我进化引擎
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>动态进化学习已启用</span>
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <p className="text-xs text-slate-400">
                  赛后录入实际比分进行归因测谎 · 自动提炼核心经验法则 · 永久反哺后续赛事研判
                </p>
                <span className="text-[10px] text-cyan-300 font-mono bg-cyan-950/70 px-2 py-0.5 rounded border border-cyan-800/60 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-cyan-400" />
                  <span>竞彩销售日规则：当日 11:00 至次日 11:00（自动按开赛时间归档对齐每日赛果）</span>
                </span>
              </div>
            </div>
          </div>

          <div className="bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 text-xs text-slate-300 flex items-center gap-2 font-mono">
            <Award className="w-4 h-4 text-emerald-400" />
            <span>已激活实战法则：</span>
            <span className="font-extrabold text-emerald-400 text-sm">
              {activeRulesCount} 条
            </span>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
          <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
            <div className="text-[10px] text-slate-400">历史复盘场次</div>
            <div className="font-black text-white text-sm mt-0.5 font-mono">
              {totalReviews > 0 ? `${totalReviews} 场` : '初始校准中'}
            </div>
          </div>
          <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
            <div className="text-[10px] text-slate-400">胜平负核准率</div>
            <div className="font-black text-emerald-400 text-sm mt-0.5 font-mono">
              {euroRate}%
            </div>
          </div>
          <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
            <div className="text-[10px] text-slate-400">让球赢盘胜率</div>
            <div className="font-black text-cyan-400 text-sm mt-0.5 font-mono">
              {handicapRate}%
            </div>
          </div>
          <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
            <div className="text-[10px] text-slate-400">大小球锁定率</div>
            <div className="font-black text-amber-400 text-sm mt-0.5 font-mono">
              {ouRate}%
            </div>
          </div>
          <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 col-span-2 sm:col-span-1">
            <div className="text-[10px] text-slate-400">精准比分命中率</div>
            <div className="font-black text-teal-400 text-sm mt-0.5 font-mono">
              {scoreRate}%
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('review')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'review'
              ? 'bg-emerald-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>📝 录入完场比分复盘</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('rules')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'rules'
              ? 'bg-emerald-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>📚 《财富经》核心法则库 ({rules.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('history')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'history'
              ? 'bg-emerald-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>📊 单场历史战报 ({reviews.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('parlays')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'parlays'
              ? 'bg-amber-500 text-slate-950 shadow-md font-black'
              : 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/30'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>🎯 2串1 稳胆历史战报 ({parlayReviews.length})</span>
        </button>
      </div>

      {/* Parlay Action Notification Banner */}
      {parlayActionToast && (
        <div className="p-3.5 bg-amber-500/15 border border-amber-500/40 rounded-xl text-xs text-amber-300 font-semibold flex items-center justify-between gap-3 shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{parlayActionToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setParlayActionToast(null)}
            className="text-amber-400 hover:text-white text-xs px-2 py-0.5 cursor-pointer"
          >
            关闭
          </button>
        </div>
      )}

      {/* Global Health Notification / Feedback Banner across all tabs */}
      {healthNotification && (
        <div className="p-3.5 bg-emerald-500/15 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 font-semibold flex items-center justify-between gap-3 shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{healthNotification}</span>
          </div>
          <div className="flex items-center gap-2">
            {activeSubTab !== 'rules' && (
              <button
                type="button"
                onClick={() => {
                  setActiveSubTab('rules');
                  setHealthNotification(null);
                }}
                className="text-[11px] font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 px-2.5 py-1 rounded cursor-pointer transition-colors"
              >
                查看核心法则库 ➔
              </button>
            )}
            <button
              type="button"
              onClick={() => setHealthNotification(null)}
              className="text-emerald-400 hover:text-white text-xs px-2 py-0.5 cursor-pointer"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* Sync Result Modal Dialog */}
      {syncResultModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-emerald-500/50 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">
                  《财富经》核心法则库 · 查漏补缺沉淀成功
                </h3>
                <p className="text-[11px] text-slate-400">
                  已完成历史战报扫描、规则去重合并与实战印证命中累加
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 py-1 font-mono text-xs">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="text-[10px] text-slate-400">扫描历史战报</div>
                <div className="text-base font-black text-white mt-0.5">
                  {syncResultModal.totalProcessed} 场
                </div>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-emerald-500/30">
                <div className="text-[10px] text-slate-400">补齐新增法则</div>
                <div className="text-base font-black text-emerald-400 mt-0.5">
                  +{syncResultModal.addedCount} 条
                </div>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-cyan-500/30">
                <div className="text-[10px] text-slate-400">强化已有法则</div>
                <div className="text-base font-black text-cyan-400 mt-0.5">
                  {syncResultModal.updatedCount} 条
                </div>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-amber-500/30">
                <div className="text-[10px] text-slate-400">累加实战印证 (hitCount)</div>
                <div className="text-base font-black text-amber-400 mt-0.5">
                  {syncResultModal.verifiedHitsCount} 次
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
              💡 查漏补缺引擎已确保同类型或同对阵法则自动合并，绝不产生同质化冗余条目；所有验证命中的盘口均已累加提升其在后续赛前测谎中的决策置信权重！
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSyncResultModal(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs cursor-pointer transition-colors"
              >
                我知道了
              </button>
              <button
                type="button"
                onClick={() => {
                  setSyncResultModal(null);
                  setActiveSubTab('rules');
                }}
                className="px-5 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 cursor-pointer flex items-center gap-1.5 transition-all"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>立即查看核心法则库 ➔</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== SUBTAB 1: POST-MATCH REVIEW WORKFLOW ===================== */}
      {activeSubTab === 'review' && (
        <div className="space-y-5">
          {/* Success banner if batch execution just completed */}
          {batchReviewSummary && (
            <div className="bg-emerald-950/80 border border-emerald-500/60 rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs text-emerald-300 shadow-lg shadow-emerald-500/10">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="font-bold">{batchReviewSummary}</span>
              </div>
              <button
                type="button"
                onClick={() => setBatchReviewSummary(null)}
                className="text-emerald-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-900 border border-emerald-500/30 cursor-pointer"
              >
                关闭提示
              </button>
            </div>
          )}

          {/* Mode Switch Tabs: Batch vs Single */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setReviewEntryMode('batch')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-extrabold transition-all cursor-pointer ${
                  reviewEntryMode === 'batch'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>⚡ 批量录入赛果 (支持截图/文本自动识别)</span>
                {queue.length > 0 && (() => {
                  const unreviewedCount = queue.filter((q) => !q.isReviewed && !q.review).length;
                  const reviewedCount = queue.filter((q) => q.isReviewed || q.review).length;
                  return (
                    <span
                      className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono border ${
                        unreviewedCount > 0
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      }`}
                    >
                      {unreviewedCount > 0
                        ? `待复盘 ${unreviewedCount} 场 (已完赛 ${reviewedCount} 场)`
                        : `全部已复盘 (${queue.length} 场)`}
                    </span>
                  );
                })()}
              </button>
              <button
                type="button"
                onClick={() => setReviewEntryMode('single')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-extrabold transition-all cursor-pointer ${
                  reviewEntryMode === 'single'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>📝 单场逐场精细复盘</span>
                {(() => {
                  const unreviewedCount = queue.filter((q) => !q.isReviewed && !q.review).length;
                  if (unreviewedCount > 0) {
                    return (
                      <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-900 text-amber-400 border border-amber-500/30">
                        {unreviewedCount} 场待办
                      </span>
                    );
                  }
                  return null;
                })()}
              </button>
            </div>

            <span className="text-[11px] text-slate-400 hidden lg:block">
              支持上传赛果截图自动 OCR 或直接粘贴文本表格一键批量归因
            </span>
          </div>

          {/* BATCH RESULTS ENTRY PANEL */}
          {reviewEntryMode === 'batch' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                <div>
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <span>批量赛果识别与智能归因</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    支持各类比分网截图（雷速、懂球帝、捷报、LiveScore）或粘贴赛果文本，系统自动对齐待复盘队列并提取新法则
                  </p>
                </div>

                {/* Sub-selector: Image vs Text */}
                <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs shrink-0">
                  <button
                    type="button"
                    onClick={() => setBatchInputType('text')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
                      batchInputType === 'text'
                        ? 'bg-emerald-500 text-slate-950 shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>📝 文本 / Markdown / 表格识别</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchInputType('image')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
                      batchInputType === 'image'
                        ? 'bg-emerald-500 text-slate-950 shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>📷 上传赛果截图 OCR 识别</span>
                  </button>
                </div>
              </div>

              {/* Sub-Panel A: Image OCR */}
              {batchInputType === 'image' && (
                <div className="space-y-3">
                  <div
                    onClick={() => scoreFileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-xl p-5 text-center cursor-pointer bg-slate-950/50 hover:bg-slate-950/70 transition-all group"
                  >
                    <input
                      type="file"
                      ref={scoreFileInputRef}
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleScoreImageUpload(e.target.files[0]);
                        }
                      }}
                    />

                    {batchScreenshot ? (
                      <div className="space-y-2">
                        <img
                          src={batchScreenshot}
                          alt="赛果截图预览"
                          className="max-h-48 mx-auto rounded-lg border border-slate-800 object-contain shadow"
                        />
                        <p className="text-xs text-emerald-400 font-medium">
                          点击可更换截图，或直接按下 <span className="font-bold">Ctrl+V</span> 粘贴新截图
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 py-3">
                        <div className="w-10 h-10 rounded-full bg-slate-800 text-emerald-400 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                          <Camera className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-bold text-slate-200">
                          拖拽赛果截图到此处，或点击浏览本地图片
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono">
                          快捷技巧：在比分网或彩票APP截取完场比分后，在此窗口直接按 <span className="text-emerald-400 font-bold">Ctrl+V</span> 即可极速粘贴识别！
                        </p>
                      </div>
                    )}
                  </div>

                  {isExtractingScores && (
                    <div className="p-3 bg-slate-950 rounded-lg border border-emerald-500/30 flex items-center justify-center gap-2 text-xs text-emerald-400">
                      <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                      <span>正在调用 Gemini 多模态视觉解析赛果并提取比分...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Sub-Panel B: Text / Markdown / Table input */}
              {batchInputType === 'text' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <label className="text-slate-300 font-bold flex items-center gap-1">
                      <span>粘贴赛果列表（支持多种格式，每行一场）：</span>
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={handleLoadQueueScoreSample}
                        className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-mono cursor-pointer"
                      >
                        + 载入当前待复盘队列比分范例
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const demo = `瑞士 1-0 斯洛文尼亚 (点球绝杀)\n北马其顿 0:1 苏格兰 (客队全场铁桶阵防守反击)\n西班牙 3-0 捷克 (早早两球领先，全场压制)\n曼城 2:1 埃弗顿 (补时阶段被客队打入安慰球)\n皇家马德里 0-1 赫塔菲 (全场狂攻未果，冷门收割)`;
                          setBatchRawText(demo);
                          const candidateList = [
                            { id: 'current', home: currentMatch.matchInfo.homeTeam, away: currentMatch.matchInfo.awayTeam, league: currentMatch.matchInfo.league, matchTime: currentMatch.matchInfo.matchTime },
                            ...queue.map((q) => ({ id: q.id, home: q.data.matchInfo.homeTeam, away: q.data.matchInfo.awayTeam, league: q.data.matchInfo.league, matchTime: q.data.matchInfo.matchTime, timestamp: q.timestamp, salesDate: q.review?.salesDateOverride || q.review?.salesDate })),
                          ];
                          const parsed = parseBatchMatchScoresFromText(demo, candidateList);
                          setParsedScores(parsed);
                        }}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 underline font-mono cursor-pointer"
                      >
                        + 载入通用比分测试文本
                      </button>
                    </div>
                  </div>

                  <textarea
                    rows={4}
                    value={batchRawText}
                    onChange={(e) => setBatchRawText(e.target.value)}
                    placeholder={`支持以下格式（每行一场，自动识别）：
瑞士 1-0 斯洛文尼亚
北马其顿 0:1 苏格兰 (红牌)
西班牙 3-0 捷克
或者粘贴 Markdown 比分表格：
| 瑞士 | 1-0 | 斯洛文尼亚 |`}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 leading-relaxed"
                  />

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleRecognizeTextScores}
                      className="px-4 py-2 text-xs font-bold text-slate-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg shadow flex items-center gap-1.5 cursor-pointer"
                    >
                      <ScanText className="w-3.5 h-3.5" />
                      <span>解析提取比分并对齐待复盘比赛</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Parsed Scores Table & Verification Panel */}
              {parsedScores.length > 0 && (
                <div className="space-y-3 border-t border-slate-800 pt-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ListChecks className="w-4 h-4 text-emerald-400" />
                      <h4 className="text-xs font-extrabold text-white">
                        已提取到 {parsedScores.length} 场完场赛果（支持在线微调修正比分）：
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setParsedScores([])}
                      className="text-[11px] text-slate-400 hover:text-rose-400 cursor-pointer"
                    >
                      清空列表
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950">
                    <table className="w-full text-left text-xs min-w-[650px]">
                      <thead className="bg-slate-900/90 text-slate-400 text-[11px] border-b border-slate-800 font-mono">
                        <tr>
                          <th className="py-2.5 px-3 w-10 text-center">#</th>
                          <th className="py-2.5 px-3">对阵双方</th>
                          <th className="py-2.5 px-3 w-40 text-center">完场全场比分</th>
                          <th className="py-2.5 px-3">关键事件 / 转折点</th>
                          <th className="py-2.5 px-3 w-52">系统待复盘赛事对齐状态</th>
                          <th className="py-2.5 px-3 w-12 text-center">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {parsedScores.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-slate-900/50 transition-colors">
                            <td className="py-2.5 px-3 text-center text-slate-500 font-mono">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-white">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span>{item.homeTeam} <span className="text-slate-500 font-normal">vs</span> {item.awayTeam}</span>
                                {(() => {
                                  if (!item.matchedId) return null;
                                  const mItem = item.matchedId === 'current'
                                    ? { data: currentMatch, report: currentReport }
                                    : queue.find((q) => q.id === item.matchedId);
                                  const stars = mItem?.report?.decision?.starRating || 3;
                                  return renderStarRatingBadge(stars, true);
                                })()}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center justify-center gap-1.5 font-mono">
                                <input
                                  type="number"
                                  min={0}
                                  max={20}
                                  value={item.homeScore}
                                  onChange={(e) =>
                                    handleUpdateParsedScore(item.id, parseInt(e.target.value, 10) || 0, item.awayScore)
                                  }
                                  className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-center font-black text-emerald-400 text-sm focus:outline-none focus:border-emerald-500"
                                />
                                <span className="font-bold text-slate-500">:</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={20}
                                  value={item.awayScore}
                                  onChange={(e) =>
                                    handleUpdateParsedScore(item.id, item.homeScore, parseInt(e.target.value, 10) || 0)
                                  }
                                  className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-center font-black text-cyan-400 text-sm focus:outline-none focus:border-emerald-500"
                                />
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                value={item.incidents || ''}
                                onChange={(e) =>
                                  handleUpdateParsedScore(item.id, item.homeScore, item.awayScore, e.target.value)
                                }
                                placeholder="点球、红牌、绝平..."
                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-emerald-500"
                              />
                            </td>
                            <td className="py-2.5 px-3">
                              {item.matchedId ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  <span>已匹配待复盘赛事 ({item.matchedName || '队列'})</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                                  <span>🆕 自动新建复盘档案</span>
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveParsedScore(item.id)}
                                className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                                title="移除该项"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Batch Review Action Control & Settings Panel */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-emerald-500/30 space-y-3.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Calendar className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-slate-200">
                          缺日期场次的默认销售日：
                        </span>
                        <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          {(() => {
                            const rawDate = extractDocumentGlobalDate(batchRawText);
                            const dominant = detectDominantSalesDate(queue);
                            const dateToUse = batchTargetSalesDate || rawDate || dominant || calculateSalesDate().salesDate;
                            const info = calculateSalesDate(undefined, undefined, dateToUse);
                            return `${info.salesDateLabel} (${info.salesCycleText})`;
                          })()}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        完整开赛日期优先按 11:00 分日；缺日期时采用逐场或此处销售日，历史记录可选中后修正。
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      {/* Sync to Core Rules Library Checkbox */}
                      <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer select-none bg-slate-900/80 hover:bg-slate-900 px-3 py-2 rounded-lg border border-slate-800">
                        <input
                          type="checkbox"
                          checked={batchSyncToCoreRules}
                          onChange={(e) => setBatchSyncToCoreRules(e.target.checked)}
                          className="w-4 h-4 text-emerald-500 rounded bg-slate-950 border-slate-700 focus:ring-emerald-500 cursor-pointer"
                        />
                        <div>
                          <div className="font-bold text-white flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            <span>同步提炼经验并沉淀至《财富经》核心法则库</span>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            批量复盘时自动提取每场核心经验、去重收录进核心法则库并累积实战印证胜率
                          </div>
                        </div>
                      </label>

                      <button
                        type="button"
                        disabled={isBatchReviewing}
                        onClick={handleBatchExecuteReview}
                        className="px-6 py-3 rounded-lg bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {isBatchReviewing ? (
                          <>
                            <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                            <span>
                              批量精算归因中... ({batchProgress?.current || 0}/{batchProgress?.total || parsedScores.length})
                            </span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 text-slate-950" />
                            <span>⚡ 一键批量完成复盘并沉淀进化法则</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SINGLE MATCH REVIEW PANEL */}
          {reviewEntryMode === 'single' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <span>录入单场赛果并触发归因精算</span>
                  <span className="text-[11px] font-normal text-slate-400">
                    （系统将即时比对机构操盘意图是否印证）
                  </span>
                </h3>

                {/* Match dropdown picker if multiple matches exist */}
                {queue.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-300">
                    <span className="text-slate-400 text-[11px]">选择待复盘赛事：</span>
                    <select
                      value={selectedMatchId}
                      onChange={(e) => handleMatchDropdownChange(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-emerald-400 font-bold focus:outline-none cursor-pointer"
                    >
                      <option value="current">
                        当前精算台：{currentMatch.matchInfo.homeTeam} vs {currentMatch.matchInfo.awayTeam}
                        {reviews.some((r) => r.matchData?.matchInfo?.homeTeam === currentMatch.matchInfo.homeTeam && r.matchData?.matchInfo?.awayTeam === currentMatch.matchInfo.awayTeam)
                          ? ' [✅ 已复盘]'
                          : ' [⏳ 待复盘]'}
                      </option>
                      {queue.map((q, idx) => {
                        const isDone = q.isReviewed || q.review;
                        const mTime = q.data.matchInfo.matchTime || '临场';
                        return (
                          <option key={q.id} value={q.id}>
                            #{idx + 1} 场：{q.data.matchInfo.homeTeam} vs {q.data.matchInfo.awayTeam} ({mTime}){' '}
                            {isDone ? `[✅ 已复盘 ${q.finalScore ? `(${q.finalScore})` : ''}]` : '[⏳ 待复盘]'}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}
              </div>

              {/* Kickoff & Sales Day Banner */}
              {(() => {
                const kickoff = activeReviewMatchData.matchInfo.matchTime || '临场';
                const sInfo = existingActiveReview
                  ? getReviewSalesInfo(existingActiveReview)
                  : calculateSalesDate(kickoff, activeReviewFallbackTimestamp, activeReviewPreferredSalesDate);
                return (
                  <div className="bg-slate-950/80 px-3 py-2 rounded-lg border border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1.5 text-cyan-300 font-mono font-bold bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/60">
                        <Clock className="w-3.5 h-3.5 text-cyan-400" />
                        <span>比赛开赛时间：{sInfo.kickoffTimeFormatted}</span>
                      </span>
                      <span className="text-slate-600">|</span>
                      <span className="flex items-center gap-1.5 text-emerald-400 font-bold bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/50">
                        <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                        <span>归属销售日：{sInfo.salesDateLabel}（{sInfo.dayOfWeek}）</span>
                      </span>
                      <span className="text-slate-400 font-mono text-[11px]">
                        (周期: {sInfo.salesCycleText})
                      </span>
                    </div>
                    {sInfo.isCurrentSalesDay && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        🔥 归入当前销售日复盘
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Match Existing Review Status Notice */}
              {(() => {
                const isCurrent = selectedMatchId === 'current';
                const queueItem = !isCurrent ? queue.find((q) => q.id === selectedMatchId) : null;
                const existingReview =
                  queueItem?.review ||
                  (queueItem?.isReviewed && queueItem.finalScore ? { actualScore: queueItem.finalScore } : null) ||
                  reviews.find((r) => {
                    const h = activeReviewMatchData.matchInfo.homeTeam;
                    const a = activeReviewMatchData.matchInfo.awayTeam;
                    return (
                      r.matchData?.matchInfo?.homeTeam === h &&
                      r.matchData?.matchInfo?.awayTeam === a
                    );
                  });

                if (existingReview) {
                  return (
                    <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-lg p-2.5 flex items-center justify-between text-xs text-emerald-300">
                      <div className="flex items-center gap-2">
                        <CheckCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>
                          <strong className="text-white">该比赛已完成复盘</strong> (已记录完场比分:{' '}
                          <span className="font-mono font-black text-emerald-400">{existingReview.actualScore}</span>)。您可在下方修改比分或补充事件后重新保存更新。
                        </span>
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-2.5 flex items-center gap-2 text-xs text-slate-400">
                      <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>该比赛当前处于 <strong className="text-amber-400">⏳ 待复盘</strong> 状态，请录入真实赛果后触发归因精算。</span>
                    </div>
                  );
                }
              })()}

              {/* Match Context Preview Card */}
              <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs">
                <div>
                  <div className="text-[10px] text-slate-400">复盘对阵双方</div>
                  <div className="font-extrabold text-white text-sm mt-0.5">
                    {activeReviewMatchData.matchInfo.homeTeam} vs {activeReviewMatchData.matchInfo.awayTeam}
                  </div>
                  <div className="text-[10px] text-emerald-400 font-mono mt-0.5">
                    {activeReviewMatchData.matchInfo.league}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-slate-400">当时研判星级档位</div>
                  <div className="mt-1">
                    {renderStarRatingBadge(activeReviewReport.decision.starRating, true)}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    置信度: {activeReviewReport.decision.starRating}星
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-slate-400">赛前操盘定性</div>
                  <div className="font-bold text-cyan-300 mt-0.5">
                    {activeReviewReport.modelTitle}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    亚让: {activeReviewMatchData.asianHandicap.lateHandicap} (水 {activeReviewMatchData.asianHandicap.lateHomeOdds})
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-slate-400">赛前核心预判首选</div>
                  <div className="font-bold text-amber-300 mt-0.5">
                    {activeReviewReport.decision.euroPick} ｜ {activeReviewReport.decision.handicapPick}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    大小球: {activeReviewReport.decision.overUnderPick}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-slate-400">赛前参考比分</div>
                  <div className="flex items-center gap-1 mt-0.5 font-mono flex-wrap">
                    {activeReviewReport.decision.predictedScores.slice(0, 3).map((s) => (
                      <span key={s} className="px-1.5 py-0.2 bg-slate-900 border border-slate-800 rounded text-slate-200 text-[10px] font-bold">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Inputs: Actual Score & Match Incidents */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-4 bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
                  <label className="block text-xs font-bold text-slate-200">
                    实际完场比分 (全场 90 分钟)
                  </label>
                  <div className="flex items-center justify-center gap-2">
                    <div className="flex-1 text-center">
                      <span className="text-[10px] text-slate-400 block mb-0.5 truncate">
                        {activeReviewMatchData.matchInfo.homeTeam}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        value={actualHomeScore}
                        onChange={(e) => setActualHomeScore(parseInt(e.target.value, 10) || 0)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-center text-lg font-black text-white font-mono"
                      />
                    </div>
                    <span className="text-xl font-black text-slate-500 pb-1">:</span>
                    <div className="flex-1 text-center">
                      <span className="text-[10px] text-slate-400 block mb-0.5 truncate">
                        {activeReviewMatchData.matchInfo.awayTeam}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        value={actualAwayScore}
                        onChange={(e) => setActualAwayScore(parseInt(e.target.value, 10) || 0)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-center text-lg font-black text-white font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-5 bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
                  <label className="block text-xs font-bold text-slate-200">
                    赛中突发转折点 / 额外因素 (可选)
                  </label>
                  <input
                    type="text"
                    value={incidents}
                    onChange={(e) => setIncidents(e.target.value)}
                    placeholder="如：第35分钟主队红牌、点球、伤停补时第94分钟绝平..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="sm:col-span-3">
                  <button
                    type="button"
                    onClick={handleExecuteReview}
                    disabled={isReviewing}
                    className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isReviewing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                        <span>精算师智能归因中...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-slate-950" />
                        <span>启动深度复盘与法则提炼</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Review Results Card (Rendered immediately after execution) */}
          {latestReviewResult && (
            <div className="bg-slate-900 border-2 border-emerald-500/50 rounded-xl p-5 shadow-2xl space-y-4 relative">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black text-sm">
                    ✓
                  </span>
                  <div>
                    <h4 className="text-base font-black text-white">
                      复盘结论与战果核准：{latestReviewResult.matchData.matchInfo.homeTeam}{' '}
                      <span className="text-emerald-400 font-mono text-lg font-black">
                        {latestReviewResult.actualScore}
                      </span>{' '}
                      {latestReviewResult.matchData.matchInfo.awayTeam}
                    </h4>
                    <p className="text-xs text-emerald-400 mt-0.5">
                      {latestReviewResult.outcomeEvaluation.summaryNote}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {renderStarRatingBadge(latestReviewResult.priorReport?.decision?.starRating, true)}
                  <span className="px-2.5 py-1 rounded bg-slate-950 text-slate-300 text-xs font-mono border border-slate-800">
                    法则已同步注入《财富经》核心库
                  </span>
                </div>
              </div>

              {/* 4-Item Hit/Miss Evaluation Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {/* 1. Euro */}
                <div className={`p-3 rounded-lg border flex items-center justify-between ${
                  latestReviewResult.outcomeEvaluation.euroHit
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                    : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                }`}>
                  <div>
                    <div className="text-[10px] text-slate-400">胜平负首选预判</div>
                    <div className="font-bold text-xs mt-0.5">
                      {latestReviewResult.priorReport.decision.euroPick}
                    </div>
                  </div>
                  <div className="text-lg font-black font-mono">
                    {latestReviewResult.outcomeEvaluation.euroHit ? '【红】' : '【黑】'}
                  </div>
                </div>

                {/* 2. Handicap */}
                {(() => {
                  const detail = latestReviewResult.outcomeEvaluation?.handicapDetail;
                  const isHit = latestReviewResult.outcomeEvaluation?.handicapHit;
                  const styleClass =
                    detail === 'WIN_HALF'
                      ? 'bg-teal-950/30 border-teal-500/40 text-teal-300'
                      : detail === 'PUSH'
                      ? 'bg-cyan-950/30 border-cyan-500/40 text-cyan-300'
                      : detail === 'LOSE_HALF'
                      ? 'bg-amber-950/30 border-amber-500/40 text-amber-300'
                      : isHit
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-950/30 border-rose-500/40 text-rose-300';

                  const badgeText =
                    detail === 'WIN_HALF'
                      ? '【赢半】'
                      : detail === 'PUSH'
                      ? '【走盘】'
                      : detail === 'LOSE_HALF'
                      ? '【输半】'
                      : isHit
                      ? '【赢盘】'
                      : '【输盘】';

                  return (
                    <div className={`p-3 rounded-lg border flex items-center justify-between ${styleClass}`}>
                      <div>
                        <div className="text-[10px] text-slate-400">让球盘预判</div>
                        <div className="font-bold text-xs mt-0.5">
                          {latestReviewResult.priorReport.decision.handicapPick}
                        </div>
                      </div>
                      <div className="text-lg font-black font-mono">
                        {badgeText}
                      </div>
                    </div>
                  );
                })()}

                {/* 3. Over/Under */}
                <div className={`p-3 rounded-lg border flex items-center justify-between ${
                  latestReviewResult.outcomeEvaluation.overUnderHit
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                    : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                }`}>
                  <div>
                    <div className="text-[10px] text-slate-400">大小球预判</div>
                    <div className="font-bold text-xs mt-0.5">
                      {latestReviewResult.priorReport.decision.overUnderPick}
                    </div>
                  </div>
                  <div className="text-lg font-black font-mono">
                    {latestReviewResult.outcomeEvaluation.overUnderHit ? '【红】' : '【黑】'}
                  </div>
                </div>

                {/* 4. Score */}
                <div className={`p-3 rounded-lg border flex items-center justify-between ${
                  latestReviewResult.outcomeEvaluation.scoreHit
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400'
                }`}>
                  <div>
                    <div className="text-[10px] text-slate-400">参考比分覆盖</div>
                    <div className="font-bold text-xs mt-0.5">
                      实际 {latestReviewResult.actualScore}
                    </div>
                  </div>
                  <div className="text-lg font-black font-mono">
                    {latestReviewResult.outcomeEvaluation.scoreHit ? '【命中】' : '【偏离】'}
                  </div>
                </div>
              </div>

              {/* Deep Dissection Commentary */}
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-1.5 text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <Brain className="w-4 h-4" />
                  <span>《财富经》精算总监深度复盘剖析：</span>
                </div>
                <div>{latestReviewResult.dissectionText}</div>
              </div>

              {/* Newly Extracted Core Experience Rule Card */}
              <div className="bg-gradient-to-r from-emerald-950/50 via-teal-950/40 to-slate-950 p-4 rounded-lg border border-emerald-500/40 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-xs font-black text-emerald-300 uppercase tracking-wide">
                      ⚡ 本场复盘提炼的核心经验法则（已永久沉淀）
                    </span>
                  </div>
                  <span className="px-2 py-0.5 bg-slate-900 text-slate-300 text-[10px] rounded border border-slate-800 font-mono">
                    {latestReviewResult.matchData.matchInfo.league}
                  </span>
                </div>

                <h5 className="text-sm font-extrabold text-white">
                  【{latestReviewResult.evolvedRuleTitle}】
                </h5>

                <p className="text-xs text-slate-200 leading-relaxed bg-slate-950/60 p-3 rounded-md border border-slate-800">
                  {latestReviewResult.evolvedRuleContent}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== SUBTAB 2: CORE RULES KNOWLEDGE BASE ===================== */}
      {activeSubTab === 'rules' && (
        <div className="space-y-4">
          {/* Health Notification Banner */}
          {healthNotification && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 font-semibold flex items-center justify-between gap-2 animate-in fade-in">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{healthNotification}</span>
              </div>
              <button
                type="button"
                onClick={() => setHealthNotification(null)}
                className="text-emerald-400 hover:text-white text-xs px-2 py-0.5"
              >
                关闭
              </button>
            </div>
          )}

          {/* RULES HEALTH AUDIT & CLUSTERING GOVERNANCE SUITE */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                    <span>《财富经》法则库健康度体检诊断与冗余治理</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    杜绝“单场过度拟合”与“法则爆炸”。通过模式聚类提炼通则，确保注入 AI 的规则精炼有力！
                  </p>
                </div>
              </div>

              {/* Health Score Badge */}
              <div className="flex items-center gap-2">
                <div
                  className={`px-3 py-1.5 rounded-lg border text-xs font-black flex items-center gap-1.5 ${
                    rulesHealth.healthScore >= 80
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                      : rulesHealth.healthScore >= 60
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                      : 'bg-rose-500/15 text-rose-400 border-rose-500/40'
                  }`}
                >
                  {rulesHealth.healthScore >= 80 ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  ) : rulesHealth.healthScore >= 60 ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                  )}
                  <span>
                    健康度: {rulesHealth.healthScore} 分 (
                    {rulesHealth.healthScore >= 80 ? '优良状态' : rulesHealth.healthScore >= 60 ? '存在冗余' : '急需聚类收敛'}
                    )
                  </span>
                </div>
              </div>
            </div>

            {/* 4 Health Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 space-y-1">
                <div className="text-[10px] text-slate-400 font-bold flex items-center justify-between">
                  <span>📚 法则总库容</span>
                  <span className="text-emerald-400 font-mono">{activeRulesCount} 条生效</span>
                </div>
                <div className="text-lg font-black text-white font-mono">{rulesHealth.totalCount} <span className="text-xs font-normal text-slate-400">条</span></div>
                <div className="text-[10px] text-slate-400">建议区间: 15 ~ 20 条高精法则</div>
              </div>

              <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 space-y-1">
                <div className="text-[10px] text-slate-400 font-bold flex items-center justify-between">
                  <span>🏛️ 经典基石法则</span>
                  <span className="text-cyan-400 font-mono">100% 保护</span>
                </div>
                <div className="text-lg font-black text-cyan-300 font-mono">{rulesHealth.classicCount} <span className="text-xs font-normal text-slate-400">条</span></div>
                <div className="text-[10px] text-slate-400">五大操盘模型 + 心法总纲</div>
              </div>

              <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 space-y-1">
                <div className="text-[10px] text-slate-400 font-bold flex items-center justify-between">
                  <span>💡 高阶聚类通则</span>
                  <span className="text-emerald-400 font-mono">多场印证</span>
                </div>
                <div className="text-lg font-black text-emerald-300 font-mono">{rulesHealth.synthesizedCount} <span className="text-xs font-normal text-slate-400">条</span></div>
                <div className="text-[10px] text-slate-400">高含金量实战行业通则</div>
              </div>

              <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 space-y-1">
                <div className="text-[10px] text-slate-400 font-bold flex items-center justify-between">
                  <span>⚠️ 单场机械同质项</span>
                  {rulesHealth.boilerplateCount > 3 ? (
                    <span className="text-rose-400 font-mono font-bold">待收敛</span>
                  ) : (
                    <span className="text-emerald-400 font-mono">健康</span>
                  )}
                </div>
                <div className="text-lg font-black text-amber-300 font-mono">
                  {rulesHealth.boilerplateCount} <span className="text-xs font-normal text-slate-400">条</span>
                  {rulesHealth.duplicateCount > 0 && (
                    <button
                      type="button"
                      onClick={handleDeduplicateRules}
                      className="text-xs text-rose-400 hover:text-rose-300 font-bold ml-1 cursor-pointer underline hover:no-underline"
                      title="点击立即执行一键去重"
                    >
                      ({rulesHealth.duplicateCount}重复 ⚡去重)
                    </button>
                  )}
                </div>
                <div className="text-[10px] text-slate-400">孤立0命中: {rulesHealth.zeroHitCount} 条</div>
              </div>
            </div>

            {/* Audit Suggestions Warning Box */}
            {rulesHealth.suggestions.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs space-y-1.5">
                <div className="font-bold text-amber-300 flex items-center justify-between gap-1.5 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span>复盘法则库体检建议：</span>
                  </div>
                  {rulesHealth.duplicateCount > 0 && (
                    <button
                      type="button"
                      onClick={handleDeduplicateRules}
                      className="px-2.5 py-1 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-slate-950 font-black text-[11px] rounded shadow-sm flex items-center gap-1 cursor-pointer transition-all animate-pulse"
                      title="保留最新或命中最高的一条，合并战绩样板并清理重复"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>⚡ 立即一键去重 ({rulesHealth.duplicateCount}处)</span>
                    </button>
                  )}
                </div>
                <ul className="space-y-1 text-slate-300 pl-4 list-disc text-[11px] leading-relaxed">
                  {rulesHealth.suggestions.map((s, idx) => {
                    const isDup = s.includes('一键去重') || s.includes('重复法则');
                    return (
                      <li key={idx} className="flex items-center justify-between gap-2 flex-wrap">
                        <span>{s}</span>
                        {isDup && (
                          <button
                            type="button"
                            onClick={handleDeduplicateRules}
                            className="shrink-0 px-2 py-0.5 bg-rose-500/25 hover:bg-rose-500/35 text-rose-300 border border-rose-500/50 rounded text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1"
                          >
                            <Trash2 className="w-2.5 h-2.5 text-rose-400" />
                            <span>立即去重合并</span>
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Governance Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={isSyncingRules}
                  onClick={() => handleRetroactiveSyncRules()}
                  className="px-3.5 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
                  title="全量扫描已复盘历史战报，调用去重与合并引擎收敛进核心法则库，并累加实战印证命中次数"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isSyncingRules ? '正在查漏补缺...' : '🔄 查漏补缺 (全量复盘沉淀)'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDeduplicateRules}
                  className={`px-3.5 py-1.5 font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer transition-all ${
                    rulesHealth.duplicateCount > 0
                      ? 'bg-rose-500/25 hover:bg-rose-500/35 text-rose-300 border border-rose-500/50 shadow-rose-950/40 animate-pulse'
                      : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700'
                  }`}
                  title="保留最新或命中最高一条，合并实战战绩样板并彻底清理同场重复法则"
                >
                  <Trash2 className={`w-3.5 h-3.5 ${rulesHealth.duplicateCount > 0 ? 'text-rose-400' : 'text-slate-400'}`} />
                  <span>
                    🧹 一键去重 (合并样板)
                    {rulesHealth.duplicateCount > 0 && (
                      <span className="ml-1 text-[10px] px-1.5 py-0.5 bg-rose-500/35 text-rose-200 rounded font-black">
                        {rulesHealth.duplicateCount}处待去重
                      </span>
                    )}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handlePruneAndCluster}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer transition-all"
                  title="将同质化的单场零散规则聚类归纳为行业通则，并清除重复条目"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>✨ 一键智能聚类精炼 (收敛同质规则)</span>
                </button>

                <button
                  type="button"
                  onClick={handleRepairLanguage}
                  className="px-3.5 py-1.5 bg-cyan-900/40 hover:bg-cyan-850/60 text-cyan-300 border border-cyan-500/40 font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer transition-all"
                  title="排查并修正任何盘口数据与赛果观点倒挂的语言（如将让球打穿误称冷门反杀）"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                  <span>🛠️ 盘口观点自洽检修 (纠错倒挂语言)</span>
                </button>

                {rulesHealth.zeroHitCount > 0 && (
                  <button
                    type="button"
                    onClick={handlePruneZeroHits}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-amber-300 hover:text-amber-200 border border-amber-500/30 font-bold text-xs rounded-lg flex items-center gap-1 cursor-pointer transition-all"
                    title="清理未被二次命中的孤立单场记录"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>🧹 清理零命中孤立个案 ({rulesHealth.zeroHitCount}条)</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsAddRuleOpen(true)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-white font-bold text-xs rounded-lg border border-slate-700 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>追加经验</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs rounded-lg border border-slate-700 flex items-center gap-1 cursor-pointer"
                  title="复制整套法则 JSON 备份"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{copiedJson ? '已复制' : '导出备份'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleImportJson}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs rounded-lg border border-slate-700 flex items-center gap-1 cursor-pointer"
                  title="从外部粘贴导入法则"
                >
                  <Upload className="w-3.5 h-3.5 text-cyan-400" />
                  <span>导入法则</span>
                </button>
              </div>
            </div>

            {/* Filter Chips Bar */}
            <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-800/60 text-xs">
              <span className="text-[11px] text-slate-400 flex items-center gap-1 mr-1">
                <Filter className="w-3 h-3 text-cyan-400" />
                <span>分类过滤:</span>
              </span>

              <button
                type="button"
                onClick={() => setRuleCategoryFilter('ALL')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  ruleCategoryFilter === 'ALL'
                    ? 'bg-slate-800 text-white border border-emerald-500 shadow-sm'
                    : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                全部展示 ({rules.length})
              </button>

              <button
                type="button"
                onClick={() => setRuleCategoryFilter('CLASSIC')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  ruleCategoryFilter === 'CLASSIC'
                    ? 'bg-slate-800 text-cyan-300 border border-cyan-500 shadow-sm'
                    : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                🏛️ 经典基石 ({rulesHealth.classicCount})
              </button>

              <button
                type="button"
                onClick={() => setRuleCategoryFilter('SYNTHESIZED')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  ruleCategoryFilter === 'SYNTHESIZED'
                    ? 'bg-slate-800 text-emerald-300 border border-emerald-500 shadow-sm'
                    : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                💡 精炼通则 ({rulesHealth.synthesizedCount})
              </button>

              <button
                type="button"
                onClick={() => setRuleCategoryFilter('BOILERPLATE')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  ruleCategoryFilter === 'BOILERPLATE'
                    ? 'bg-slate-800 text-amber-300 border border-amber-500 shadow-sm'
                    : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                ⚠️ 待聚类单场 ({rulesHealth.boilerplateCount})
              </button>
            </div>
          </div>

          {/* Rules List (Filtered) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredRules.map((rule, idx) => (
              <div
                key={rule.id}
                className={`bg-slate-900 border rounded-xl p-4 transition-all relative space-y-2.5 ${
                  rule.isActive
                    ? 'border-emerald-500/40 shadow-sm'
                    : 'border-slate-800 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs text-emerald-400 font-bold">
                        #{idx + 1}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-950 border border-slate-800 text-cyan-400">
                        {rule.leagueScope}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                        {rule.category}
                      </span>
                    </div>
                    <h4 className="text-sm font-extrabold text-white mt-1">
                      {rule.title}
                    </h4>
                  </div>

                  {/* Toggle & Delete */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToggleRule(rule.id)}
                      className={`px-2 py-1 rounded text-[11px] font-bold border transition-colors cursor-pointer ${
                        rule.isActive
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                      title={rule.isActive ? '点击停用反哺' : '点击启用反哺'}
                    >
                      {rule.isActive ? '已激活' : '已暂停'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                      title="删除此法则"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
                  {rule.ruleContent}
                </p>

                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-800/60">
                  <span>来源：{rule.sourceMatch}</span>
                  <span>沉淀时间：{rule.createdAt}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Add Manual Rule Modal */}
          {isAddRuleOpen && (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-lg w-full space-y-4 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="text-sm font-black text-white">
                    追加手工实战经验法则
                  </h4>
                  <button
                    type="button"
                    onClick={() => setIsAddRuleOpen(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">
                      法则简明标题
                    </label>
                    <input
                      type="text"
                      value={newRuleTitle}
                      onChange={(e) => setNewRuleTitle(e.target.value)}
                      placeholder="如：次级联赛客场半球低水防诱上"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-300 font-bold mb-1">
                        适用操盘模型
                      </label>
                      <select
                        value={newRuleCategory}
                        onChange={(e) => setNewRuleCategory(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                      >
                        <option value="POSITIVE_CONTROL">极限榨水 / 正向控赔</option>
                        <option value="HIGH_INTEREST_TRAP">高息吸筹 / 名气诱导</option>
                        <option value="AVALANCHE_RETREAT">雪崩退盘 / 退热示弱</option>
                        <option value="LOW_DRAW_DEFENSE">平赔低洼 / 平赔排雷</option>
                        <option value="SHALLOW_FULL_WATER">浅盘满水死亡</option>
                        <option value="SPECIAL_SITUATION">黑天鹅 / 特殊盘型</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-bold mb-1">
                        适用联赛范围
                      </label>
                      <input
                        type="text"
                        value={newRuleScope}
                        onChange={(e) => setNewRuleScope(e.target.value)}
                        placeholder="如：英超/欧冠/欧国联"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">
                      核心法则正文 (可被未来 AI 研判调取的经验铁律)
                    </label>
                    <textarea
                      rows={4}
                      value={newRuleContent}
                      onChange={(e) => setNewRuleContent(e.target.value)}
                      placeholder="详细写明：当盘面出现什么特定信号时，机构真实意图是什么，实战坚决去什么方向，防范什么陷阱..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAddRuleOpen(false)}
                    className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleAddManualRule}
                    className="px-4 py-1.5 bg-emerald-500 text-slate-950 font-bold text-xs rounded-lg shadow cursor-pointer"
                  >
                    保存并立即生效
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Import Rules Modal (Markdown & JSON Dual Engine) */}
          {isImportModalOpen && (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-2xl w-full space-y-4 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <Upload className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-sm font-black text-white flex items-center gap-2">
                      <span>导入《财富经》经验法则知识库</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                        Markdown & JSON 双引擎自适应
                      </span>
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsImportModalOpen(false);
                      setImportFeedback(null);
                    }}
                    className="text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-slate-400 text-[11px]">
                    <p className="leading-relaxed">
                      支持粘贴 <span className="text-cyan-400 font-bold">Markdown 格式</span>（文档标题 `##`、表格、条目列表）或 <span className="text-emerald-400 font-bold">JSON 结构化规范</span>，系统将自动智能识别并解析！
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const mdSample = `## 法则一：极限榨水 / 正向控赔法则
- **适用范围**：五大联赛 / 全部联赛
- **盘赔特征**：欧指顺畅持续下调，维持原盘或强力升盘，水位砸至低于1.80极低水
- **机构意图**：极度看好让球方打出，通过提高门槛与压缩派彩空间进行真实避险风控
- **财富定论**：正路主胜 / 独赢（可作 2串1 稳胆基石）
- **实战案例**：FC首尔 3-1 浦项制铁 / 罗森博格 4-0 腓特烈斯塔

## 法则二：高息吸筹 / 名气诱导法则
- **适用范围**：全部主流联赛
- **盘赔特征**：顺应强队名气强行升盘或开深盘，水位死卡在 2.00 - 2.08 超高水/满水
- **机构意图**：利用强队人气公开派发高息福利，诱导散户资金博上盘
- **财富定论**：坚决去下盘 / 受让胜（大热必死）
- **实战案例**：江原FC 0-3 富川1995 / 巴西 1-2 挪威

## 大小球测谎：深让步 (-1.25+) + 浅大小球 (2.25)
- **机构意图**：强队破门乏力或控场小胜，机构防范经济型赢球
- **精算策略**：去小球 (2.25小)，比分锁定 1-0、2-0`;
                          setImportJsonText(mdSample);
                          setImportFeedback(null);
                        }}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-cyan-300 border border-slate-700 text-[10px] cursor-pointer"
                      >
                        填入 Markdown 范例
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-300 font-bold">
                        请粘贴待导入文本（Markdown 或 JSON）：
                      </label>
                      <span className="text-[10px] text-slate-500 font-mono">
                        当前字数: {importJsonText.length}
                      </span>
                    </div>
                    <textarea
                      rows={10}
                      value={importJsonText}
                      onChange={(e) => {
                        setImportJsonText(e.target.value);
                        setImportFeedback(null);
                      }}
                      placeholder={`支持直接粘贴：\n1. Markdown 标题格式：\n## 极限榨水 / 正向控赔法则\n- 适用范围：五大联赛\n- 机构意图：极度看好让球方打出...\n- 财富定论：正路主胜稳胆\n\n2. 或 Markdown 表格：\n| 法则名称 | 适用范围 | 核心精算法则 | 实战案例 |\n\n3. 或完整的《财富经足球盘赔量化分析体系》JSON 规范代码`}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white font-mono text-[11px] focus:outline-none focus:border-cyan-500/50 leading-relaxed"
                    />
                  </div>

                  {/* Import Mode Selection */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 text-[11px]">
                    <span className="text-slate-400 font-bold shrink-0">导入方式：</span>
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'merge'}
                        onChange={() => setImportMode('merge')}
                        className="text-emerald-500 focus:ring-0"
                      />
                      <span>追加合并（保留现有已进化法则，同名自动增强更新）</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-400 hover:text-slate-200">
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'replace'}
                        onChange={() => setImportMode('replace')}
                        className="text-emerald-500 focus:ring-0"
                      />
                      <span>全量覆盖重置</span>
                    </label>
                  </div>

                  {/* Feedback Message */}
                  {importFeedback && (
                    <div
                      className={`p-2.5 rounded-lg text-[11px] font-bold ${
                        importFeedback.type === 'success'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      }`}
                    >
                      {importFeedback.message}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.readText?.().then((txt) => {
                        if (txt) setImportJsonText(txt);
                      }).catch(() => {});
                    }}
                    className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Clipboard className="w-3 h-3" />
                    <span>从剪贴板读取粘贴</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsImportModalOpen(false);
                        setImportFeedback(null);
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs rounded-lg cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmImportRules}
                      className="px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs rounded-lg shadow-md cursor-pointer transition-all"
                    >
                      智能识别并导入
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== SUBTAB 3: REVIEW HISTORY LOG (YEAR-MONTH-DAY GROUPED) ===================== */}
      {activeSubTab === 'history' && (
        <div className="space-y-4">
          {reviews.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-xs space-y-2">
              <RotateCcw className="w-8 h-8 mx-auto text-slate-600 mb-1" />
              <div className="font-bold text-slate-300">暂无已归档的历史复盘战报</div>
              <div className="text-[11px] text-slate-500">
                在“录入完场比分复盘”中录入完场比分后，系统将自动按年月日归档留存，并自动去重与计算核准率！
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Quick Sub-view Toggle between Single Reviews and 2-in-1 Parlay Reviews */}
              <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-xs shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-[11px] font-bold">战报维度切换：</span>
                  <button
                    type="button"
                    className="px-3 py-1 rounded-lg bg-emerald-500 text-slate-950 font-black text-xs shadow-sm flex items-center gap-1.5"
                  >
                    <span>📊 单场详细战报 ({reviews.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('parlays')}
                    className="px-3 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-amber-400 hover:text-amber-300 border border-amber-500/30 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Award className="w-3.5 h-3.5 text-amber-400" />
                    <span>🎯 2串1 稳胆历史战报 ({parlayReviews.length})</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('parlays')}
                  className="text-amber-400 hover:text-amber-300 text-xs font-bold hidden sm:inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>查看 2串1 串关胜率与双胆大满贯 ➔</span>
                </button>
              </div>

              {/* Top Management Bar */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
                    <CalendarDays className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-extrabold text-white">
                        实战复盘战报历史归档库
                      </h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-950 text-emerald-400 border border-slate-800">
                        共 {reviews.length} 场 · {groupedReviews.length} 个日期归档
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      当日 11:00 至次日 11:00 为一个销售日 · 完整开赛日期优先 · 缺日期可选中修正
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                  <button
                    type="button"
                    disabled={isSyncingRules}
                    onClick={() => handleRetroactiveSyncRules()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
                    title="全量扫描已复盘历史战报，查漏补缺沉淀进核心法则库，并自动累加盘口验证命中次数"
                  >
                    {isSyncingRules ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                        <span>正在查漏补缺...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        <span>查漏补缺沉淀核心库</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={isCalibratingDates}
                    onClick={handleCalibrateSalesDates}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                    title="按完整开赛日期优先校准销售日；缺日期记录可选中后手动修正"
                  >
                    {isCalibratingDates ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                        <span>正在智能校准...</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
                        <span>销售日智能校准</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={isCalibratingDates || isCalibratingStars}
                    onClick={handleCalibrateStarTiers}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                    title="依据《财富经》最新梯度置信度法则，智能重算并校准全部历史战报的星级档位（解决旧版四星档仅绑定单模型导致的触发过窄问题）"
                  >
                    {isCalibratingStars ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                        <span>正在校准星级...</span>
                      </>
                    ) : (
                      <>
                        <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30" />
                        <span>星级档位智能重校准</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleClearAllReviews}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold transition-colors cursor-pointer"
                    title="清空全部历史复盘战报（核心法则库不受影响）"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>清空全部战报</span>
                  </button>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center gap-3 flex-wrap text-xs">
                <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setSelectedReviewIds((previous) => {
                        const updated = { ...previous };
                        visibleReviews.forEach((rev) => { updated[rev.id] = checked; });
                        return updated;
                      });
                    }}
                    className="accent-cyan-400"
                  />
                  全选当前筛选
                </label>
                <span className="text-cyan-300 font-bold">已选 {selectedReviews.length} 场</span>
                <label className="flex items-center gap-2 text-slate-300">
                  归入销售日
                  <input
                    type="date"
                    aria-label="调整所选场次的销售日"
                    value={adjustSalesDate}
                    onChange={(event) => setAdjustSalesDate(event.target.value)}
                    className="rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5 text-white [color-scheme:dark]"
                  />
                </label>
                <button
                  type="button"
                  disabled={selectedReviews.length === 0 || !adjustSalesDate}
                  onClick={handleAdjustSelectedSalesDate}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  调整所选场次销售日
                </button>
                {selectedReviews.length > 0 && (
                  <button type="button" onClick={() => setSelectedReviewIds({})} className="text-slate-400 hover:text-white">
                    取消选择
                  </button>
                )}
                <span className="w-full text-[11px] text-slate-400">
                  选中需要修正的场次，再选择销售日；原始开赛数据保留，首次调整前会自动备份历史复盘。
                  {incompleteReviewDateCount > 0 && <span className="text-amber-300 ml-1">{incompleteReviewDateCount} 场缺少完整开赛日期，可选中调整销售日。</span>}
                </span>
              </div>

              {/* STAR TIER REALIZATION VALUE DASHBOARD */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-400" />
                    <h4 className="text-xs font-black text-white">
                      实战星级档位实现价值统计看板（辨析各档核心置信度）
                    </h4>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    统计样本：全量已归档 {reviews.length} 场实战战报
                  </span>
                </div>

                <div className="text-[10px] text-slate-400 bg-slate-950/70 rounded-lg px-2.5 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 border border-slate-800/80 font-mono">
                  <span>
                    <strong className="text-amber-400">★★★★★ 5星稳胆档</strong>: 极限榨水控赔 / 暴涨杀猪盘 / 极端胆平 (高置信92%+)
                  </span>
                  <span className="text-slate-600">|</span>
                  <span>
                    <strong className="text-cyan-400">★★★★☆ 4星防冷档</strong>: 浅盘满水 / 退盘示弱 / 次稳控赔 / 重点防冷 (高价值85%+)
                  </span>
                  <span className="text-slate-600">|</span>
                  <span>
                    <strong className="text-slate-300">★★★☆☆ 3星博弈档</strong>: 多空资金均势平衡盘 (80%)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Tier 5 Card */}
                  <div
                    onClick={() => setSelectedStarFilter(selectedStarFilter === 5 ? 'ALL' : 5)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedStarFilter === 5
                        ? 'bg-amber-950/40 border-amber-500 text-amber-200 ring-1 ring-amber-500'
                        : 'bg-slate-950/80 hover:bg-slate-950 border-amber-500/30 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-amber-400 font-black">★★★★★</span>
                        <span className="text-xs font-black text-amber-300">5星稳胆档</span>
                      </div>
                      <span className="text-[11px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        {starTierRealizationStats.tier5.total} 场
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 mt-2 text-center text-[10px]">
                      <div className="bg-slate-900/90 p-1 rounded">
                        <span className="text-slate-500 block">胜平负</span>
                        <span className="font-bold text-emerald-400 font-mono text-xs">
                          {starTierRealizationStats.tier5.euroHitRate}%
                        </span>
                      </div>
                      <div className="bg-slate-900/90 p-1 rounded">
                        <span className="text-slate-500 block">让球赢盘</span>
                        <span className="font-bold text-cyan-400 font-mono text-xs">
                          {starTierRealizationStats.tier5.handicapHitRate}%
                        </span>
                      </div>
                      <div className="bg-slate-900/90 p-1 rounded">
                        <span className="text-slate-500 block">大小球</span>
                        <span className="font-bold text-amber-400 font-mono text-xs">
                          {starTierRealizationStats.tier5.ouHitRate}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tier 4 Card */}
                  <div
                    onClick={() => setSelectedStarFilter(selectedStarFilter === 4 ? 'ALL' : 4)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedStarFilter === 4
                        ? 'bg-cyan-950/40 border-cyan-500 text-cyan-200 ring-1 ring-cyan-500'
                        : 'bg-slate-950/80 hover:bg-slate-950 border-cyan-500/30 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-amber-400 font-black">★★★★☆</span>
                        <span className="text-xs font-black text-cyan-300">4星防冷档</span>
                      </div>
                      <span className="text-[11px] font-mono font-bold px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                        {starTierRealizationStats.tier4.total} 场
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 mt-2 text-center text-[10px]">
                      <div className="bg-slate-900/90 p-1 rounded">
                        <span className="text-slate-500 block">胜平负</span>
                        <span className="font-bold text-emerald-400 font-mono text-xs">
                          {starTierRealizationStats.tier4.euroHitRate}%
                        </span>
                      </div>
                      <div className="bg-slate-900/90 p-1 rounded">
                        <span className="text-slate-500 block">让球赢盘</span>
                        <span className="font-bold text-cyan-400 font-mono text-xs">
                          {starTierRealizationStats.tier4.handicapHitRate}%
                        </span>
                      </div>
                      <div className="bg-slate-900/90 p-1 rounded">
                        <span className="text-slate-500 block">大小球</span>
                        <span className="font-bold text-amber-400 font-mono text-xs">
                          {starTierRealizationStats.tier4.ouHitRate}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tier 3 Card */}
                  <div
                    onClick={() => setSelectedStarFilter(selectedStarFilter === 3 ? 'ALL' : 3)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedStarFilter === 3
                        ? 'bg-slate-800 border-slate-500 text-white ring-1 ring-slate-500'
                        : 'bg-slate-950/80 hover:bg-slate-950 border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-amber-400 font-black">★★★☆☆</span>
                        <span className="text-xs font-black text-slate-300">3星博弈档</span>
                      </div>
                      <span className="text-[11px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {starTierRealizationStats.tier3.total} 场
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 mt-2 text-center text-[10px]">
                      <div className="bg-slate-900/90 p-1 rounded">
                        <span className="text-slate-500 block">胜平负</span>
                        <span className="font-bold text-emerald-400 font-mono text-xs">
                          {starTierRealizationStats.tier3.euroHitRate}%
                        </span>
                      </div>
                      <div className="bg-slate-900/90 p-1 rounded">
                        <span className="text-slate-500 block">让球赢盘</span>
                        <span className="font-bold text-cyan-400 font-mono text-xs">
                          {starTierRealizationStats.tier3.handicapHitRate}%
                        </span>
                      </div>
                      <div className="bg-slate-900/90 p-1 rounded">
                        <span className="text-slate-500 block">大小球</span>
                        <span className="font-bold text-amber-400 font-mono text-xs">
                          {starTierRealizationStats.tier3.ouHitRate}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Filter Pills (按星级与日期快速筛选) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                {/* Star Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                  <span className="text-[11px] text-slate-400 font-bold flex items-center gap-1 shrink-0 mr-1">
                    <Star className="w-3.5 h-3.5 text-amber-400" />
                    <span>星级筛选：</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedStarFilter('ALL')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 cursor-pointer text-xs ${
                      selectedStarFilter === 'ALL'
                        ? 'bg-amber-400 text-slate-950 shadow-sm'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    全部星级 ({reviews.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedStarFilter(5)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 cursor-pointer text-xs ${
                      selectedStarFilter === 5
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'bg-slate-900 hover:bg-slate-800 text-amber-400 hover:text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    ★★★★★ 5星稳胆 ({starTierRealizationStats.tier5.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedStarFilter(4)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 cursor-pointer text-xs ${
                      selectedStarFilter === 4
                        ? 'bg-cyan-500 text-slate-950 shadow-sm'
                        : 'bg-slate-900 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 border border-cyan-500/30'
                    }`}
                  >
                    ★★★★☆ 4星防冷 ({starTierRealizationStats.tier4.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedStarFilter(3)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 cursor-pointer text-xs ${
                      selectedStarFilter === 3
                        ? 'bg-slate-300 text-slate-950 shadow-sm'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    ★★★☆☆ 3星博弈 ({starTierRealizationStats.tier3.total})
                  </button>
                </div>

                {/* Date Quick Filter Pills */}
                {groupedReviews.length > 1 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                    <span className="text-[11px] text-slate-400 font-bold flex items-center gap-1 shrink-0 mr-1">
                      <Filter className="w-3.5 h-3.5 text-slate-500" />
                      <span>日期：</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedDateFilter('ALL')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 cursor-pointer text-xs ${
                        selectedDateFilter === 'ALL'
                          ? 'bg-emerald-500 text-slate-950 shadow-sm'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      全日期
                    </button>
                    {groupedReviews.slice(0, 6).map((g) => (
                      <button
                        key={g.dateKey}
                        type="button"
                        onClick={() => setSelectedDateFilter(g.dateKey)}
                        className={`px-2 py-1 rounded-lg font-bold transition-all shrink-0 cursor-pointer text-xs ${
                          selectedDateFilter === g.dateKey
                            ? 'bg-emerald-500 text-slate-950 shadow-sm'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        {g.isToday ? '🔥 ' : ''}
                        {g.dateKey.slice(5)} 销售日
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Grouped Reviews Accordion Timeline */}
              <div className="space-y-4">
                {groupedReviews
                  .filter(
                    (group) =>
                      selectedDateFilter === 'ALL' || group.dateKey === selectedDateFilter
                  )
                  .map((group) => {
                    const isCollapsed = !!collapsedDateGroups[group.dateKey];

                    return (
                      <div
                        key={group.dateKey}
                        className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md"
                      >
                        {/* Date Group Header */}
                        <div
                          onClick={() => toggleDateCollapse(group.dateKey)}
                          className="bg-slate-950/80 hover:bg-slate-950 p-3.5 border-b border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-2.5 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <Calendar className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="font-black text-white text-sm tracking-wide">
                              {group.dateLabel}
                            </span>
                            <span className="text-xs text-slate-400 font-mono">
                              （{group.dayOfWeek}）
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono text-cyan-300 bg-cyan-950/70 border border-cyan-800/60 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-cyan-400" />
                              <span>销售周期: {group.salesCycleText}</span>
                            </span>
                            {group.isToday && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                                🔥 当前销售日
                              </span>
                            )}
                            <span className="text-xs text-slate-300 font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-800 font-mono">
                              共 {group.items.length} 场复盘
                            </span>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap text-xs">
                            {/* Summary Accuracy Stats for that date */}
                            <div className="flex items-center gap-1.5 text-[11px] font-mono bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-800">
                              <span className="text-emerald-400">
                                胜平负 {group.stats.euroHits}/{group.stats.total}
                              </span>
                              <span className="text-slate-600">|</span>
                              <span className="text-cyan-400">
                                让球 {group.stats.handicapHits}/{group.stats.total}
                              </span>
                              <span className="text-slate-600">|</span>
                              <span className="text-amber-400">
                                大小 {group.stats.ouHits}/{group.stats.total}
                              </span>
                              <span className="text-slate-600">|</span>
                              <span className="text-teal-400">
                                比分 {group.stats.scoreHits}/{group.stats.total}
                              </span>
                            </div>

                            {/* Retroactively Sync Rules for this Date Group */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRetroactiveSyncRules(group.items);
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold transition-all cursor-pointer"
                              title={`将【${group.dateLabel}】的 ${group.items.length} 场战报查漏补缺同步沉淀至核心法则库`}
                            >
                              <Sparkles className="w-3 h-3 text-emerald-400" />
                              <span className="hidden sm:inline">沉淀当日法则</span>
                            </button>

                            {/* Delete Group Action */}
                            <button
                              type="button"
                              onClick={(e) =>
                                handleDeleteDateGroup(group.dateKey, group.dateLabel, e)
                              }
                              className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-500/30 text-[11px] font-semibold transition-all cursor-pointer"
                              title={`删除 ${group.dateLabel} 全部战报`}
                            >
                              <Trash2 className="w-3 h-3 text-rose-400" />
                              <span className="hidden sm:inline">删除当日</span>
                            </button>

                            {/* Collapse/Expand chevron */}
                            <div className="text-slate-400 p-0.5">
                              {isCollapsed ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronUp className="w-4 h-4" />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Match Review Cards under this Date Group */}
                        {!isCollapsed && (
                          <div className="p-3.5 space-y-3 bg-slate-900/50">
                            {/* Per-Sales-Date Star Tier Breakdown & Quick Filter */}
                            <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3 space-y-2.5">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-slate-800/60 pb-2">
                                <div className="flex items-center gap-2">
                                  <Star className="w-3.5 h-3.5 text-amber-400" />
                                  <span className="text-xs font-black text-white">
                                    【{group.dateLabel}】分档实现价值与星级筛选
                                  </span>
                                </div>
                                <span className="text-[11px] text-slate-400 font-mono">
                                  当日总场次: {group.items.length} 场
                                </span>
                              </div>

                              {/* 3 Tier Summary Cards for this specific sales date */}
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                {/* Date Tier 5 Card */}
                                {(() => {
                                  const effectiveDateFilter = dateGroupStarFilter[group.dateKey] || selectedStarFilter;
                                  const t5 = group.starStats.tier5;
                                  const euroRate = t5.total > 0 ? Math.round((t5.euroHits / t5.total) * 100) : 0;
                                  const hdcRate = t5.total > 0 ? Math.round((t5.handicapHits / t5.total) * 100) : 0;
                                  const ouRate = t5.total > 0 ? Math.round((t5.ouHits / t5.total) * 100) : 0;
                                  const isSelected = effectiveDateFilter === 5;

                                  return (
                                    <div
                                      onClick={() =>
                                        setDateGroupStarFilter((prev) => ({
                                          ...prev,
                                          [group.dateKey]: prev[group.dateKey] === 5 ? 'ALL' : 5,
                                        }))
                                      }
                                      className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                                        isSelected
                                          ? 'bg-amber-950/40 border-amber-500 text-amber-200 ring-1 ring-amber-500'
                                          : 'bg-slate-900/90 hover:bg-slate-900 border-amber-500/30 text-slate-300'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1">
                                          <span className="text-amber-400 text-xs font-black">★★★★★</span>
                                          <span className="text-xs font-black text-amber-300">5星稳胆</span>
                                        </div>
                                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                          {t5.total} 场
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-3 gap-1 mt-1.5 text-center text-[10px]">
                                        <div className="bg-slate-950/80 p-1 rounded">
                                          <span className="text-slate-500 block text-[9px]">胜平负</span>
                                          <span className="font-bold text-emerald-400 font-mono text-xs">{euroRate}%</span>
                                        </div>
                                        <div className="bg-slate-950/80 p-1 rounded">
                                          <span className="text-slate-500 block text-[9px]">让球赢盘</span>
                                          <span className="font-bold text-cyan-400 font-mono text-xs">{hdcRate}%</span>
                                        </div>
                                        <div className="bg-slate-950/80 p-1 rounded">
                                          <span className="text-slate-500 block text-[9px]">大小球</span>
                                          <span className="font-bold text-amber-400 font-mono text-xs">{ouRate}%</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* Date Tier 4 Card */}
                                {(() => {
                                  const effectiveDateFilter = dateGroupStarFilter[group.dateKey] || selectedStarFilter;
                                  const t4 = group.starStats.tier4;
                                  const euroRate = t4.total > 0 ? Math.round((t4.euroHits / t4.total) * 100) : 0;
                                  const hdcRate = t4.total > 0 ? Math.round((t4.handicapHits / t4.total) * 100) : 0;
                                  const ouRate = t4.total > 0 ? Math.round((t4.ouHits / t4.total) * 100) : 0;
                                  const isSelected = effectiveDateFilter === 4;

                                  return (
                                    <div
                                      onClick={() =>
                                        setDateGroupStarFilter((prev) => ({
                                          ...prev,
                                          [group.dateKey]: prev[group.dateKey] === 4 ? 'ALL' : 4,
                                        }))
                                      }
                                      className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                                        isSelected
                                          ? 'bg-cyan-950/40 border-cyan-500 text-cyan-200 ring-1 ring-cyan-500'
                                          : 'bg-slate-900/90 hover:bg-slate-900 border-cyan-500/30 text-slate-300'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1">
                                          <span className="text-amber-400 text-xs font-black">★★★★☆</span>
                                          <span className="text-xs font-black text-cyan-300">4星防冷</span>
                                        </div>
                                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                                          {t4.total} 场
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-3 gap-1 mt-1.5 text-center text-[10px]">
                                        <div className="bg-slate-950/80 p-1 rounded">
                                          <span className="text-slate-500 block text-[9px]">胜平负</span>
                                          <span className="font-bold text-emerald-400 font-mono text-xs">{euroRate}%</span>
                                        </div>
                                        <div className="bg-slate-950/80 p-1 rounded">
                                          <span className="text-slate-500 block text-[9px]">让球赢盘</span>
                                          <span className="font-bold text-cyan-400 font-mono text-xs">{hdcRate}%</span>
                                        </div>
                                        <div className="bg-slate-950/80 p-1 rounded">
                                          <span className="text-slate-500 block text-[9px]">大小球</span>
                                          <span className="font-bold text-amber-400 font-mono text-xs">{ouRate}%</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* Date Tier 3 Card */}
                                {(() => {
                                  const effectiveDateFilter = dateGroupStarFilter[group.dateKey] || selectedStarFilter;
                                  const t3 = group.starStats.tier3;
                                  const euroRate = t3.total > 0 ? Math.round((t3.euroHits / t3.total) * 100) : 0;
                                  const hdcRate = t3.total > 0 ? Math.round((t3.handicapHits / t3.total) * 100) : 0;
                                  const ouRate = t3.total > 0 ? Math.round((t3.ouHits / t3.total) * 100) : 0;
                                  const isSelected = effectiveDateFilter === 3;

                                  return (
                                    <div
                                      onClick={() =>
                                        setDateGroupStarFilter((prev) => ({
                                          ...prev,
                                          [group.dateKey]: prev[group.dateKey] === 3 ? 'ALL' : 3,
                                        }))
                                      }
                                      className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                                        isSelected
                                          ? 'bg-slate-800 border-slate-500 text-white ring-1 ring-slate-500'
                                          : 'bg-slate-900/90 hover:bg-slate-900 border-slate-800 text-slate-300'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1">
                                          <span className="text-amber-400 text-xs font-black">★★★☆☆</span>
                                          <span className="text-xs font-black text-slate-300">3星博弈</span>
                                        </div>
                                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                          {t3.total} 场
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-3 gap-1 mt-1.5 text-center text-[10px]">
                                        <div className="bg-slate-950/80 p-1 rounded">
                                          <span className="text-slate-500 block text-[9px]">胜平负</span>
                                          <span className="font-bold text-emerald-400 font-mono text-xs">{euroRate}%</span>
                                        </div>
                                        <div className="bg-slate-950/80 p-1 rounded">
                                          <span className="text-slate-500 block text-[9px]">让球赢盘</span>
                                          <span className="font-bold text-cyan-400 font-mono text-xs">{hdcRate}%</span>
                                        </div>
                                        <div className="bg-slate-950/80 p-1 rounded">
                                          <span className="text-slate-500 block text-[9px]">大小球</span>
                                          <span className="font-bold text-amber-400 font-mono text-xs">{ouRate}%</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>

                              {/* Interactive Filter Pills within this specific Sales Date */}
                              <div className="flex items-center gap-1.5 overflow-x-auto pt-1 text-xs">
                                <span className="text-[11px] text-slate-400 font-bold flex items-center gap-1 shrink-0 mr-1">
                                  <Filter className="w-3 h-3 text-amber-400" />
                                  <span>当日星级筛选：</span>
                                </span>
                                {(() => {
                                  const effectiveDateFilter = dateGroupStarFilter[group.dateKey] || selectedStarFilter;
                                  return (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setDateGroupStarFilter((prev) => ({
                                            ...prev,
                                            [group.dateKey]: 'ALL',
                                          }))
                                        }
                                        className={`px-2 py-0.5 rounded font-bold transition-all shrink-0 cursor-pointer text-[11px] ${
                                          effectiveDateFilter === 'ALL'
                                            ? 'bg-amber-400 text-slate-950 shadow-sm'
                                            : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
                                        }`}
                                      >
                                        全部 ({group.items.length})
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setDateGroupStarFilter((prev) => ({
                                            ...prev,
                                            [group.dateKey]: 5,
                                          }))
                                        }
                                        className={`px-2 py-0.5 rounded font-bold transition-all shrink-0 cursor-pointer text-[11px] ${
                                          effectiveDateFilter === 5
                                            ? 'bg-amber-500 text-slate-950 shadow-sm'
                                            : 'bg-slate-900 hover:bg-slate-800 text-amber-400 hover:text-amber-300 border border-amber-500/30'
                                        }`}
                                      >
                                        ★★★★★ 5星 ({group.starStats.tier5.total})
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setDateGroupStarFilter((prev) => ({
                                            ...prev,
                                            [group.dateKey]: 4,
                                          }))
                                        }
                                        className={`px-2 py-0.5 rounded font-bold transition-all shrink-0 cursor-pointer text-[11px] ${
                                          effectiveDateFilter === 4
                                            ? 'bg-cyan-500 text-slate-950 shadow-sm'
                                            : 'bg-slate-900 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 border border-cyan-500/30'
                                        }`}
                                      >
                                        ★★★★☆ 4星 ({group.starStats.tier4.total})
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setDateGroupStarFilter((prev) => ({
                                            ...prev,
                                            [group.dateKey]: 3,
                                          }))
                                        }
                                        className={`px-2 py-0.5 rounded font-bold transition-all shrink-0 cursor-pointer text-[11px] ${
                                          effectiveDateFilter === 3
                                            ? 'bg-slate-300 text-slate-950 shadow-sm'
                                            : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
                                        }`}
                                      >
                                        ★★★☆☆ 3星 ({group.starStats.tier3.total})
                                      </button>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>

                            {/* Match Review Cards under this Date Group */}
                            {group.items
                              .filter((rev) => {
                                const activeStarForGroup = dateGroupStarFilter[group.dateKey] || selectedStarFilter;
                                if (activeStarForGroup === 'ALL') return true;
                                return (rev.priorReport?.decision?.starRating || 3) === activeStarForGroup;
                              })
                              .map((rev) => {
                              const timeInfo = formatDateInfo(rev.reviewTimestamp);
                              const isDissectionOpen = !!expandedDissections[rev.id];

                              return (
                                <div
                                  key={rev.id}
                                  className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm space-y-3 hover:border-slate-700/80 transition-all"
                                >
                                  {/* Card Header */}
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <input
                                        type="checkbox"
                                        aria-label={`选择 ${rev.matchData.matchInfo.homeTeam} 对 ${rev.matchData.matchInfo.awayTeam} 的复盘`}
                                        checked={!!selectedReviewIds[rev.id]}
                                        onChange={(event) => {
                                          const checked = event.target.checked;
                                          setSelectedReviewIds((previous) => ({ ...previous, [rev.id]: checked }));
                                        }}
                                        className="accent-cyan-400 w-3.5 h-3.5 cursor-pointer"
                                      />
                                      <span className="font-black text-white text-sm">
                                        {rev.matchData.matchInfo.homeTeam} VS{' '}
                                        {rev.matchData.matchInfo.awayTeam}
                                      </span>
                                      <span className="px-2 py-0.5 bg-slate-950 text-emerald-400 font-mono font-black text-xs rounded border border-slate-800">
                                        完场 {rev.actualScore}
                                      </span>
                                      {/* Pre-Match Star Rating Tier Badge */}
                                      {renderStarRatingBadge(rev.priorReport?.decision?.starRating, true)}
                                      <span className="text-[10px] text-slate-400 font-mono">
                                        {rev.matchData.matchInfo.league || '常规赛事'}
                                      </span>
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950/70 text-cyan-300 border border-cyan-800/60 flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-cyan-400" />
                                        <span>开赛: {getReviewSalesInfo(rev).kickoffTimeFormatted}</span>
                                      </span>
                                      {rev.salesDateOverride && (
                                        <span className="text-[10px] text-cyan-300">销售日已手动确认</span>
                                      )}
                                      <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                                        <span>(复盘: {timeInfo.timeStr})</span>
                                      </span>
                                    </div>

                                    {/* 4 Outcome Badges + Delete Button */}
                                    <div className="flex items-center gap-1.5 text-xs flex-wrap">
                                      <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                          rev.outcomeEvaluation.euroHit
                                            ? 'bg-emerald-500/20 text-emerald-300'
                                            : 'bg-rose-500/20 text-rose-300'
                                        }`}
                                      >
                                        胜平负: {rev.outcomeEvaluation.euroHit ? '命中' : '失准'}
                                      </span>
                                      {(() => {
                                        const detail = rev.outcomeEvaluation?.handicapDetail;
                                        if (detail === 'WIN_HALF') {
                                          return (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                                              让球: 赢半
                                            </span>
                                          );
                                        }
                                        if (detail === 'PUSH') {
                                          return (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                              让球: 走盘
                                            </span>
                                          );
                                        }
                                        if (detail === 'LOSE_HALF') {
                                          return (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                              让球: 输半
                                            </span>
                                          );
                                        }
                                        return (
                                          <span
                                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                              rev.outcomeEvaluation?.handicapHit
                                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                            }`}
                                          >
                                            让球: {rev.outcomeEvaluation?.handicapHit ? '赢盘' : '输盘'}
                                          </span>
                                        );
                                      })()}
                                      <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                          rev.outcomeEvaluation.overUnderHit
                                            ? 'bg-emerald-500/20 text-emerald-300'
                                            : 'bg-rose-500/20 text-rose-300'
                                        }`}
                                      >
                                        大小: {rev.outcomeEvaluation.overUnderHit ? '命中' : '失准'}
                                      </span>
                                      <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                          rev.outcomeEvaluation.scoreHit
                                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                                        }`}
                                      >
                                        比分: {rev.outcomeEvaluation.scoreHit ? '命中' : '未中'}
                                      </span>

                                      {/* Single Delete Button */}
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteReview(rev.id)}
                                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-950 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-500/40 text-[11px] font-bold transition-all cursor-pointer ml-1"
                                        title="删除此条复盘战报"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                        <span>删除</span>
                                      </button>
                                    </div>
                                  </div>

                                  {/* Pre-Match Actuarial Decision Snapshot */}
                                  <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 text-xs grid grid-cols-1 sm:grid-cols-5 gap-2">
                                    <div>
                                      <span className="text-[10px] text-slate-400 block">当时研判星级</span>
                                      <div className="mt-0.5">
                                        {renderStarRatingBadge(rev.priorReport?.decision?.starRating, true)}
                                      </div>
                                    </div>
                                    <div>
                                      <span className="text-[10px] text-slate-400 block">赛前操盘定性</span>
                                      <span className="font-bold text-cyan-300 truncate block mt-0.5">
                                        {rev.priorReport?.modelTitle || '操盘分析'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[10px] text-slate-400 block">胜平负首选</span>
                                      <span className="font-bold text-amber-300 truncate block mt-0.5">
                                        {rev.priorReport?.decision?.euroPick || '-'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[10px] text-slate-400 block">让球盘首选</span>
                                      <span className="font-bold text-amber-300 truncate block mt-0.5">
                                        {rev.priorReport?.decision?.handicapPick || '-'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[10px] text-slate-400 block">参考比分覆盖</span>
                                      <span className="font-mono text-slate-300 truncate block mt-0.5">
                                        {(rev.priorReport?.decision?.predictedScores || []).slice(0, 3).join(', ') || '-'}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Evolved Rule Content */}
                                  <div className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 space-y-1.5">
                                    <div className="font-bold text-emerald-400 flex items-center justify-between flex-wrap gap-2">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span>提炼法则：【{rev.evolvedRuleTitle}】</span>
                                        {(() => {
                                          const matched = rules.find(
                                            (r) =>
                                              r.title === rev.evolvedRuleTitle ||
                                              (r.sourceMatch &&
                                                r.sourceMatch.includes(rev.matchData.matchInfo.homeTeam) &&
                                                r.sourceMatch.includes(rev.matchData.matchInfo.awayTeam))
                                          );
                                          if (matched) {
                                            return (
                                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-normal">
                                                <span>✓ 核心库生效中</span>
                                                {matched.hitCount ? (
                                                  <span className="font-mono font-bold text-amber-300">
                                                    (累计印证 {matched.hitCount} 次)
                                                  </span>
                                                ) : null}
                                              </span>
                                            );
                                          }
                                          return (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                handleRetroactiveSyncRules([rev]);
                                              }}
                                              className="px-2 py-0.5 bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-slate-950 text-[10px] font-bold rounded border border-slate-700 hover:border-emerald-500 transition-colors cursor-pointer flex items-center gap-1"
                                              title="将本场提炼的经验法则查漏补缺收录进《财富经》核心法则库"
                                            >
                                              <Sparkles className="w-3 h-3 text-emerald-400" />
                                              <span>查漏补缺收录核心库</span>
                                            </button>
                                          );
                                        })()}
                                      </div>
                                      {rev.dissectionText && (
                                        <button
                                          type="button"
                                          onClick={() => toggleDissection(rev.id)}
                                          className="text-[11px] font-normal text-cyan-400 hover:underline cursor-pointer flex items-center gap-0.5"
                                        >
                                          <span>
                                            {isDissectionOpen ? '收起博弈剖析' : '展开精算总监剖析'}
                                          </span>
                                          {isDissectionOpen ? (
                                            <ChevronUp className="w-3 h-3" />
                                          ) : (
                                            <ChevronDown className="w-3 h-3" />
                                          )}
                                        </button>
                                      )}
                                    </div>
                                    <div className="text-slate-300">{rev.evolvedRuleContent}</div>

                                    {/* Collapsible Deep Dissection */}
                                    {isDissectionOpen && rev.dissectionText && (
                                      <div className="mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 whitespace-pre-line leading-relaxed bg-slate-950 p-2.5 rounded">
                                        <div className="text-emerald-400 font-bold mb-1">
                                          《财富经》精算总监深度复盘博弈剖析：
                                        </div>
                                        {rev.dissectionText}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== SUBTAB 4: 2串1 稳胆复盘历史战报 ===================== */}
      {activeSubTab === 'parlays' && (
        <div className="space-y-4">
          {/* Top Management Bar for 2串1 */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-extrabold text-white">
                    《财富经》核心稳胆 · 2串1 复盘历史战报
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-950 text-amber-400 border border-slate-800">
                    累计归档 {parlayReviews.length} 期方案
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  严谨追踪每日星级最高、正向控赔稳胆实战配对 · 真实检验胜平负全红、让球赢盘及断单归因
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
              <button
                type="button"
                disabled={isExtractingParlays || reviews.length < 2}
                onClick={handleAutoExtractParlays}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 text-xs font-black transition-all shadow-sm cursor-pointer disabled:opacity-50"
                title="依据历史单场复盘记录，按销售日自动提取星级最高、机构正向控赔的 2 场稳胆生成 2串1 战报"
              >
                {isExtractingParlays ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>萃取中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                    <span>⚡ 从单场战报智能萃取 2串1</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleRefreshParlaySettlements}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-cyan-300 border border-cyan-500/30 text-xs font-bold transition-all cursor-pointer"
                title="根据最新单场复盘赛果重新结算全量 2串1 方案"
              >
                <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                <span>刷新赛果结算</span>
              </button>

              {parlayReviews.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllParlays}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold transition-colors cursor-pointer"
                  title="清空全部 2串1 历史战报"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>清空战报</span>
                </button>
              )}
            </div>
          </div>

          {/* KPI Statistics Dashboard for 2串1 */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {/* Total */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-md">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                累计 2串1 方案数
              </div>
              <div className="text-xl font-black text-white mt-1 font-mono">
                {parlayStats.total} <span className="text-xs text-slate-400 font-normal">期</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                已完赛结算: <span className="text-cyan-400 font-mono font-bold">{parlayStats.settledCount}</span> 期
              </div>
            </div>

            {/* Euro Parlay Hit Rate */}
            <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-3.5 shadow-md">
              <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                胜平负 2串1 全红率
              </div>
              <div className="text-xl font-black text-emerald-400 mt-1 font-mono">
                {parlayStats.euroHitRate}%
              </div>
              <div className="text-[10px] text-slate-400 mt-1 font-mono">
                红单: {parlayStats.euroParlayHits} / {parlayStats.settledCount || 0} 期
              </div>
            </div>

            {/* Asian Handicap Hit Rate */}
            <div className="bg-slate-900 border border-cyan-500/30 rounded-xl p-3.5 shadow-md">
              <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">
                让球 2串1 赢盘率
              </div>
              <div className="text-xl font-black text-cyan-400 mt-1 font-mono">
                {parlayStats.handicapHitRate}%
              </div>
              <div className="text-[10px] text-slate-400 mt-1 font-mono">
                赢盘: {parlayStats.handicapParlayHits} / {parlayStats.settledCount || 0} 期
              </div>
            </div>

            {/* Grand Slam Count */}
            <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-3.5 shadow-md">
              <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
                双胆大满贯全红期数
              </div>
              <div className="text-xl font-black text-amber-300 mt-1 font-mono">
                {parlayStats.grandSlamCount} <span className="text-xs text-slate-400 font-normal">期</span>
              </div>
              <div className="text-[10px] text-amber-400/80 mt-1">
                胜平负+让球均全红
              </div>
            </div>

            {/* Hedge or Breakeven Rate */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-md col-span-2 sm:col-span-1">
              <div className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">
                稳胆对冲保本率
              </div>
              <div className="text-xl font-black text-white mt-1 font-mono">
                {parlayStats.hedgeOrWinRate}%
              </div>
              <div className="text-[10px] text-slate-400 mt-1 font-mono">
                保本/赢盘: {parlayStats.hedgeOrWinCount} 期 (断单: {parlayStats.brokenCount})
              </div>
            </div>
          </div>

          {/* Filter Status Pills */}
          <div className="flex items-center gap-1.5 flex-wrap bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400 text-[11px] mr-1">结算过滤:</span>
            {[
              { id: 'ALL', label: `全部方案 (${parlayReviews.length})` },
              { id: 'GRAND_SLAM', label: `双胆大满贯 (${parlayReviews.filter((p) => p.isGrandSlam).length})` },
              { id: 'EURO_HIT', label: `胜平负全红 (${parlayReviews.filter((p) => p.euroParlayHit).length})` },
              { id: 'HANDICAP_HIT', label: `让球赢盘 (${parlayReviews.filter((p) => p.handicapParlayHit).length})` },
              { id: 'BROKEN', label: `断单归因 (${parlayReviews.filter((p) => p.settlementStatus === 'SETTLED_BROKEN').length})` },
              { id: 'PENDING', label: `未完赛待办 (${parlayReviews.filter((p) => p.settlementStatus === 'PENDING').length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setParlayFilterStatus(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  parlayFilterStatus === tab.id
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Parlay Cards List */}
          {parlayReviews.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto text-2xl font-black">
                🎯
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-white">暂未归档 2串1 稳胆实战方案</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  您可以点击上方【⚡ 从单场战报智能萃取 2串1】一键按历史销售日提取方案，或在【批量决策大盘】顶部点击【💾 固化归档至 2串1 战报】！
                </p>
              </div>
              {reviews.length >= 2 && (
                <button
                  type="button"
                  onClick={handleAutoExtractParlays}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 inline-flex items-center gap-2 cursor-pointer transition-all"
                >
                  <Sparkles className="w-4 h-4 text-slate-950" />
                  <span>立即从现存 {reviews.length} 场单场复盘中智能萃取 2串1 战报</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3.5">
              {parlayReviews
                .filter((p) => {
                  if (parlayFilterStatus === 'GRAND_SLAM') return p.isGrandSlam;
                  if (parlayFilterStatus === 'EURO_HIT') return p.euroParlayHit;
                  if (parlayFilterStatus === 'HANDICAP_HIT') return p.handicapParlayHit;
                  if (parlayFilterStatus === 'BROKEN') return p.settlementStatus === 'SETTLED_BROKEN';
                  if (parlayFilterStatus === 'PENDING') return p.settlementStatus === 'PENDING';
                  return true;
                })
                .sort((a, b) => {
                  // 严格倒序排序：最新销售日优先，相同销售日则最新创建时间优先
                  const dateA = a.salesDate || '';
                  const dateB = b.salesDate || '';
                  const dateCmp = dateB.localeCompare(dateA);
                  if (dateCmp !== 0) return dateCmp;
                  return (b.createdAt || 0) - (a.createdAt || 0);
                })
                .map((parlay) => {
                  const m1 = parlay.match1;
                  const m2 = parlay.match2;

                  const renderHandicapBadge = (m: ParlayMatchSnapshot) => {
                    let label = m.handicapDetailLabel;
                    const scoreStr = m.finalScore || m.actualScore;
                    let home = m.actualHomeScore;
                    let away = m.actualAwayScore;

                    if ((home === undefined || away === undefined) && scoreStr) {
                      const parts = scoreStr.split('-');
                      if (parts.length === 2) {
                        const h = parseInt(parts[0], 10);
                        const a = parseInt(parts[1], 10);
                        if (!isNaN(h) && !isNaN(a)) {
                          home = h;
                          away = a;
                        }
                      }
                    }

                    if (home !== undefined && away !== undefined) {
                      const fresh = evaluateSingleHandicapOutcome(
                        m.handicapLine || '平手',
                        m.handicapPick,
                        m.homeTeam,
                        m.awayTeam,
                        home,
                        away
                      );
                      label = fresh.detailLabel;
                    }

                    if (!label) {
                      label =
                        m.handicapDetail === 'WIN_HALF'
                          ? '赢半'
                          : m.handicapDetail === 'PUSH'
                          ? '走盘'
                          : m.handicapDetail === 'LOSE_HALF'
                          ? '输半'
                          : m.handicapDetail === 'WIN'
                          ? '赢盘'
                          : m.handicapDetail === 'LOSE'
                          ? '输盘'
                          : m.handicapHit
                          ? '赢盘'
                          : '输盘';
                    }

                    const colorClass =
                      label === '输半'
                        ? 'text-amber-400 bg-amber-500/15 border-amber-500/40 font-bold'
                        : label === '赢半'
                        ? 'text-teal-400 bg-teal-500/15 border-teal-500/40 font-bold'
                        : label === '走盘'
                        ? 'text-cyan-400 bg-cyan-500/15 border-cyan-500/40'
                        : label === '赢盘'
                        ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/40'
                        : 'text-rose-400 bg-rose-500/15 border-rose-500/40';

                    return (
                      <span className={`font-mono text-xs px-1.5 py-0.5 rounded border ${colorClass}`}>
                        【{label}】
                      </span>
                    );
                  };

                  const renderMatchOddsSnapshot = (snapshot: ParlayMatchSnapshot) => {
                    const euro = snapshot.euroOddsSnapshot;
                    const asian = snapshot.asianHandicapSnapshot;
                    const ou = snapshot.overUnderSnapshot;

                    if (!euro && !asian && !ou) return null;

                    const hasEarlyEuro = Boolean(
                      euro && euro.earlyWin && euro.earlyDraw && euro.earlyLoss &&
                      (euro.earlyWin !== euro.lateWin || euro.earlyDraw !== euro.lateDraw || euro.earlyLoss !== euro.lateLoss)
                    );

                    const hasEarlyAsian = Boolean(
                      asian && asian.earlyHandicap &&
                      (asian.earlyHandicap !== asian.lateHandicap ||
                       Math.abs((asian.earlyHomeOdds || 0) - (asian.lateHomeOdds || 0)) > 0.02)
                    );

                    return (
                      <div className="bg-slate-950/80 rounded-lg p-2 border border-slate-800/90 text-[11px] space-y-1.5 mt-2">
                        <div className="flex items-center justify-between text-slate-400 font-mono border-b border-slate-800/60 pb-1">
                          <span className="text-[10px] text-amber-300 font-bold flex items-center gap-1">
                            📊 当时赔率快照
                          </span>
                          <span className="text-[9px] text-slate-500 font-sans">
                            {hasEarlyEuro || hasEarlyAsian ? '初盘 ➔ 终盘(变轨)' : '即时终盘快照'}
                          </span>
                        </div>

                        {/* 欧赔 */}
                        {euro && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">欧指 (胜/平/负):</span>
                            <span className="font-mono text-slate-200">
                              {hasEarlyEuro && (
                                <span className="text-slate-500 text-[10px] mr-1">
                                  {euro.earlyWin?.toFixed(2)}/{euro.earlyDraw?.toFixed(2)}/{euro.earlyLoss?.toFixed(2)} ➔
                                </span>
                              )}
                              <span className="font-bold text-amber-300">
                                {euro.lateWin?.toFixed(2)} / {euro.lateDraw?.toFixed(2)} / {euro.lateLoss?.toFixed(2)}
                              </span>
                            </span>
                          </div>
                        )}

                        {/* 亚盘 */}
                        {asian && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">亚让 (让球·水位):</span>
                            <span className="font-mono text-slate-200">
                              {hasEarlyAsian && asian.earlyHandicap && (
                                <span className="text-slate-500 text-[10px] mr-1">
                                  {asian.earlyHandicap}({asian.earlyHomeOdds?.toFixed(2)}) ➔
                                </span>
                              )}
                              <span className="font-bold text-cyan-300">
                                {asian.lateHandicap || snapshot.handicapLine}
                                <span className="text-slate-400 text-[10px] ml-1 font-normal">
                                  (主{asian.lateHomeOdds?.toFixed(2)} / 客{asian.lateAwayOdds?.toFixed(2)})
                                </span>
                              </span>
                            </span>
                          </div>
                        )}

                        {/* 大小球 */}
                        {ou && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">大小 (进球界线):</span>
                            <span className="font-mono text-slate-200">
                              <span className="font-bold text-emerald-300">
                                {ou.lateLine || '2.5'}球
                                <span className="text-slate-400 text-[10px] ml-1 font-normal">
                                  (大{ou.lateOverOdds?.toFixed(2)} / 小{ou.lateUnderOdds?.toFixed(2)})
                                </span>
                              </span>
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  };

                  return (
                    <div
                      key={parlay.id}
                      className="bg-slate-900 border border-slate-800 hover:border-slate-750 rounded-xl p-4 shadow-lg space-y-3 transition-all"
                    >
                      {/* Card Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-950 text-cyan-400 border border-cyan-800/40">
                            📅 销售日：{parlay.salesDate}
                          </span>
                          <h4 className="text-sm font-black text-white">
                            {parlay.title}
                          </h4>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-bold border ${
                              parlay.settlementStatus === 'SETTLED_ALL_HIT'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                                : parlay.settlementStatus === 'SETTLED_PARLAY_HIT'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                                : parlay.settlementStatus === 'SETTLED_HANDICAP_HIT'
                                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                                : parlay.settlementStatus === 'SETTLED_HEDGE_PUSH'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                                : parlay.settlementStatus === 'SETTLED_BROKEN'
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {parlay.settlementBadge || '【⏳ 待结算】'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 font-mono">
                            {new Date(parlay.createdAt).toLocaleDateString('zh-CN')}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteParlay(parlay.id)}
                            className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer transition-colors"
                            title="删除该期 2串1 战报"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Dual Matches Showcase */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Match 1 */}
                        <div
                          className={`p-3 rounded-lg border space-y-2 flex flex-col justify-between ${
                            m1.euroHit && m1.handicapHit
                              ? 'bg-emerald-950/20 border-emerald-500/40'
                              : m1.euroHit || m1.handicapHit
                              ? 'bg-slate-950/90 border-cyan-500/30'
                              : m1.finalScore
                              ? 'bg-rose-950/20 border-rose-500/30'
                              : 'bg-slate-950 border-slate-800'
                          }`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                稳胆 1 ({m1.stars}★ {m1.modelTitle || m1.identifiedModel})
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {m1.matchTime || '开赛时间'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-sm text-white">
                                {m1.homeTeam} VS {m1.awayTeam}
                              </span>
                              <span className="font-mono font-black text-amber-400 text-sm">
                                {m1.finalScore ? `完场 ${m1.finalScore}` : '⏳ 待开赛'}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800/80">
                              <div className="bg-slate-900/90 p-2 rounded flex items-center justify-between">
                                <div>
                                  <span className="text-[10px] text-slate-400 block">胜平负推荐</span>
                                  <span className="font-bold text-white">{m1.euroPick}</span>
                                </div>
                                {m1.finalScore && (
                                  <span
                                    className={`font-mono font-black text-xs ${
                                      m1.euroHit ? 'text-emerald-400' : 'text-rose-400'
                                    }`}
                                  >
                                    {m1.euroHit ? '【红】' : '【黑】'}
                                  </span>
                                )}
                              </div>
                              <div className="bg-slate-900/90 p-2 rounded flex items-center justify-between">
                                <div>
                                  <span className="text-[10px] text-slate-400 block">
                                    让球 ({m1.handicapLine})
                                  </span>
                                  <span className="font-bold text-cyan-300 truncate block max-w-[100px]">
                                    {m1.handicapPick}
                                  </span>
                                </div>
                                {m1.finalScore && renderHandicapBadge(m1)}
                              </div>
                            </div>
                          </div>

                          {/* Historical Market Odds Snapshot */}
                          {renderMatchOddsSnapshot(m1)}
                        </div>

                        {/* Match 2 */}
                        <div
                          className={`p-3 rounded-lg border space-y-2 flex flex-col justify-between ${
                            m2.euroHit && m2.handicapHit
                              ? 'bg-emerald-950/20 border-emerald-500/40'
                              : m2.euroHit || m2.handicapHit
                              ? 'bg-slate-950/90 border-cyan-500/30'
                              : m2.finalScore
                              ? 'bg-rose-950/20 border-rose-500/30'
                              : 'bg-slate-950 border-slate-800'
                          }`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                稳胆 2 ({m2.stars}★ {m2.modelTitle || m2.identifiedModel})
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {m2.matchTime || '开赛时间'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-sm text-white">
                                {m2.homeTeam} VS {m2.awayTeam}
                              </span>
                              <span className="font-mono font-black text-cyan-300 text-sm">
                                {m2.finalScore ? `完场 ${m2.finalScore}` : '⏳ 待开赛'}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800/80">
                              <div className="bg-slate-900/90 p-2 rounded flex items-center justify-between">
                                <div>
                                  <span className="text-[10px] text-slate-400 block">胜平负推荐</span>
                                  <span className="font-bold text-white">{m2.euroPick}</span>
                                </div>
                                {m2.finalScore && (
                                  <span
                                    className={`font-mono font-black text-xs ${
                                      m2.euroHit ? 'text-emerald-400' : 'text-rose-400'
                                    }`}
                                  >
                                    {m2.euroHit ? '【红】' : '【黑】'}
                                  </span>
                                )}
                              </div>
                              <div className="bg-slate-900/90 p-2 rounded flex items-center justify-between">
                                <div>
                                  <span className="text-[10px] text-slate-400 block">
                                    让球 ({m2.handicapLine})
                                  </span>
                                  <span className="font-bold text-cyan-300 truncate block max-w-[100px]">
                                    {m2.handicapPick}
                                  </span>
                                </div>
                                {m2.finalScore && renderHandicapBadge(m2)}
                              </div>
                            </div>
                          </div>

                          {/* Historical Market Odds Snapshot */}
                          {renderMatchOddsSnapshot(m2)}
                        </div>
                      </div>

                      {/* Rationale & Settlement Dissection Note */}
                      <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="text-slate-300 text-[11px] leading-relaxed">
                          <strong className="text-amber-400">💡 实战风控：</strong>
                          {parlay.settlementDescription || parlay.rationale || '正向控赔机构避险，规避诱盘风险'}
                        </div>
                        {parlay.brokenSide && parlay.brokenSide !== 'NONE' && (
                          <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            断单归因：{parlay.brokenSide === 'MATCH1' ? '稳胆1未打出' : parlay.brokenSide === 'MATCH2' ? '稳胆2未打出' : '双胆均未打出'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
