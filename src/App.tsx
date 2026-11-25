/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useLayoutEffect, useRef, Suspense, lazy } from 'react';
import { Header } from './components/Header';
import { MatchInputForm } from './components/MatchInputForm';
import { ActuarialReport } from './components/ActuarialReport';
import { DataCalculations } from './components/DataCalculations';
import { AttachmentUploadModal } from './components/AttachmentUploadModal';
import { FullMatchData, AnalysisReportResult, BatchMatchItem } from './types/fortuneActuary';
import { PRESET_CASES, PresetCase } from './utils/presetCases';
import { generateActuarialRuleReport, compareEarlyVsLateConfidence } from './utils/actuaryEngine';
import {
  calculateSalesDate,
  calibrateReviewSalesDate,
  getReviewSalesInfo,
  hasExplicitKickoffDate,
  parseKickoffDetails,
  isMatchBeforeOrAtCutoff,
  matchTeamsFuzzy,
  normalizeTeamName,
  extractKickoffTime,
} from './utils/salesDayUtils';
import {
  getActiveExperiencePromptText,
  evaluateMatchOutcomeAndExtractLesson,
  savePostMatchReview,
  getPostMatchReviews,
} from './utils/experienceStore';
import { ShieldCheck, Sparkles, TrendingUp, AlertTriangle, HelpCircle, Layers, Brain } from 'lucide-react';

// The full-width tabs are by far the largest components; load them on first visit
// so the default report tab doesn't pay for them up front.
const BatchMatrixDashboard = lazy(() => import('./components/BatchMatrixDashboard').then((m) => ({ default: m.BatchMatrixDashboard })));
const ReviewEvolutionView = lazy(() => import('./components/ReviewEvolutionView').then((m) => ({ default: m.ReviewEvolutionView })));
const ModelKnowledgeBase = lazy(() => import('./components/ModelKnowledgeBase').then((m) => ({ default: m.ModelKnowledgeBase })));

import { createQueueWriter, QUEUE_STORAGE_KEY } from './utils/queuePersistence';
import { hasVerifiedSnapshot, sealQueuePrediction, snapshotKickoff } from './utils/predictionSnapshot';
const WORKSPACE_BACKUP_KEY = 'fortune_actuary_user_workspace';
const MATCH_STORAGE_KEY = 'fortune_actuary_current_match_v2';
const REPORT_STORAGE_KEY = 'fortune_actuary_current_report_v2';
const ACTIVE_TAB_STORAGE_KEY = 'fortune_actuary_active_tab_v2';

// The active queue key is authoritative; the workspace backup is written less often
// and is only a recovery source when the active key is missing or unreadable.
const BACKUP_INTERVAL_MS = 5 * 60 * 1000;

const LEGACY_STORAGE_KEYS = [
  'fortune_actuary_batch_queue_v2',
  'fortune_actuary_user_workspace',
  'fortune_actuary_batch_queue',
  'fortune_actuary_batch_queue_v1',
  'fortune_actuary_queue',
  'fortune_actuary_matches',
];

import { extractLeagueFromText } from './utils/textParser';

/**
 * Sanitizes and recalibrates queue items against current actuarial rules,
 * clearing false shifts from first-time single uploads and fixing inverted confidence states.
 */
function sanitizeAndRecalibrateQueue(queue: BatchMatchItem[]): BatchMatchItem[] {
  return queue.map((item) => {
    if ((item.isLocked || item.isReviewed || item.marketRecordedAt !== undefined || item.predictionSnapshot) && item.report) return item;
    // If kickoff time was lost or left as '临场', see if marketStory has the time
    let matchTime = item.data.matchInfo.matchTime;
    if (!matchTime || matchTime === '临场') {
      const storyTime = extractKickoffTime(item.data.matchInfo.marketStory || '');
      if (storyTime && storyTime !== '临场') {
        matchTime = storyTime;
      }
    }

    // Recalibrate league if it was left unstated or defaulted to generic fallback ('常规联赛' / '常规赛事')
    let league = item.data.matchInfo.league;
    if (!league || league === '常规联赛' || league === '常规赛事') {
      const calibratedLeague =
        extractLeagueFromText(`${item.data.matchInfo.homeTeam} vs ${item.data.matchInfo.awayTeam}`) ||
        extractLeagueFromText(item.data.matchInfo.marketStory || '');
      if (calibratedLeague) {
        league = calibratedLeague;
      }
    }

    const currentData: FullMatchData = {
      ...item.data,
      matchInfo: {
        ...item.data.matchInfo,
        matchTime,
        league: league || item.data.matchInfo.league || '常规联赛',
      },
    };

    const rep = generateActuarialRuleReport(currentData);

    // Check if match has genuine dual-odds evidence (either intra-text early vs late, or genuine update from early snapshot)
    const hasDualOdds = Boolean(
      (currentData.asianHandicap?.earlyHandicap &&
       currentData.asianHandicap?.lateHandicap &&
       currentData.asianHandicap.earlyHandicap !== currentData.asianHandicap.lateHandicap) ||
      Math.abs((currentData.asianHandicap?.earlyHomeOdds || 0) - (currentData.asianHandicap?.lateHomeOdds || 0)) > 0.02 ||
      Math.abs((currentData.euroOdds?.earlyWin || 0) - (currentData.euroOdds?.lateWin || 0)) > 0.02 ||
      (item.earlyDataSnapshot && (
        (item.earlyDataSnapshot.asianHandicap?.lateHandicap &&
         currentData.asianHandicap?.lateHandicap &&
         item.earlyDataSnapshot.asianHandicap.lateHandicap !== currentData.asianHandicap.lateHandicap) ||
        Math.abs((item.earlyDataSnapshot.asianHandicap?.lateHomeOdds || 0) - (currentData.asianHandicap?.lateHomeOdds || 0)) > 0.02 ||
        Math.abs((item.earlyDataSnapshot.euroOdds?.lateWin || 0) - (currentData.euroOdds?.lateWin || 0)) > 0.02
      ))
    );

    let confidenceShift = hasDualOdds
      ? compareEarlyVsLateConfidence(
          currentData,
          item.earlyReportSnapshot,
          rep,
          item.earlyDataSnapshot
        )
      : undefined;

    // Strict mathematical sanity check: star jumps MUST increase confidence; star drops MUST decrease
    if (confidenceShift) {
      if (confidenceShift.starChange > 0 && confidenceShift.shiftType !== 'INCREASED') {
        confidenceShift = { ...confidenceShift, shiftType: 'INCREASED' };
      } else if (confidenceShift.starChange < 0 && confidenceShift.shiftType !== 'DECREASED') {
        confidenceShift = { ...confidenceShift, shiftType: 'DECREASED' };
      }
    }

    return {
      ...item,
      data: currentData,
      report: rep,
      confidenceShift,
    };
  });
}

/**
 * Cross-references matches in the queue against the persistent PostMatchReview store,
 * guaranteeing that any match ever reviewed retains its finalScore, isReviewed flag,
 * and review object even after page reloads or cache re-evaluations.
 */
function syncQueueWithSavedReviews(queue: BatchMatchItem[]): BatchMatchItem[] {
  try {
    const sanitizedQueue = sanitizeAndRecalibrateQueue(queue);
    const reviews = getPostMatchReviews();
    if (!reviews || reviews.length === 0) return sanitizedQueue;

    return sanitizedQueue.map((item) => {
      // Refresh embedded copies from the authoritative archive after sales-day corrections.
      if (item.isReviewed && item.finalScore && item.review) {
        const savedReview = reviews.find((review) => review.id === item.review!.id);
        return savedReview ? { ...item, review: savedReview } : item;
      }

      const home = (item.data?.matchInfo?.homeTeam || '').trim();
      const away = (item.data?.matchInfo?.awayTeam || '').trim();

      const matchedReview = reviews.find((r) => {
        if (r.id === item.id || r.id === item.review?.id) return true;
        if (hasExplicitKickoffDate(item.data?.matchInfo?.matchTime) &&
            calculateSalesDate(item.data.matchInfo.matchTime, item.timestamp).salesDate !== getReviewSalesInfo(r).salesDate) return false;
        const rHome = (r.matchData?.matchInfo?.homeTeam || '').trim();
        const rAway = (r.matchData?.matchInfo?.awayTeam || '').trim();
        return (
          home &&
          away &&
          rHome &&
          rAway &&
          matchTeamsFuzzy(home, rHome) &&
          matchTeamsFuzzy(away, rAway)
        );
      });

      if (matchedReview) {
        return {
          ...item,
          isReviewed: true,
          finalScore: matchedReview.actualScore,
          isLocked: true,
          review: matchedReview,
        };
      }

      return item;
    });
  } catch (e) {
    console.warn('syncQueueWithSavedReviews error:', e);
    return sanitizeAndRecalibrateQueue(queue);
  }
}

/**
 * Robust loader that searches all historical storage keys to recover user's real analyzed matches,
 * while preventing teaching presets from polluting the user's authentic workspace.
 */
function loadUserSavedQueue(activeRaw: string | null | undefined): BatchMatchItem[] {
  for (const key of LEGACY_STORAGE_KEYS) {
    try {
      const saved = key === QUEUE_STORAGE_KEY ? activeRaw : localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        // An intentionally emptied active queue must stay empty, not be refilled from older keys.
        if (key === QUEUE_STORAGE_KEY && Array.isArray(parsed) && parsed.length === 0) return [];
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Filter to user's real analyzed matches (exclude preset cases)
          const realMatches = parsed.filter(
            (item: any) =>
              item &&
              item.data &&
              item.data.matchInfo &&
              item.data.matchInfo.homeTeam &&
              !item.id?.startsWith('preset-') &&
              !PRESET_CASES.some((c) => c.id === item.id)
          );
          if (realMatches.length > 0) {
            return syncQueueWithSavedReviews(realMatches);
          }
        }
      }
    } catch (e) {
      console.warn(`Failed reading saved queue from ${key}:`, e);
    }
  }

  // Check if there is a single analyzed match saved from yesterday
  try {
    const singleMatch =
      localStorage.getItem(MATCH_STORAGE_KEY) ||
      localStorage.getItem('fortune_actuary_current_match');
    if (singleMatch) {
      const parsed = JSON.parse(singleMatch);
      if (
        parsed &&
        parsed.matchInfo &&
        parsed.matchInfo.homeTeam &&
        !PRESET_CASES.some(
          (c) =>
            c.data.matchInfo.homeTeam === parsed.matchInfo.homeTeam &&
            c.data.matchInfo.awayTeam === parsed.matchInfo.awayTeam
        )
      ) {
        return syncQueueWithSavedReviews([
          {
            id: `restored-${Date.now()}`,
            sourceName: `历史实战_${parsed.matchInfo.homeTeam}vs${parsed.matchInfo.awayTeam}`,
            data: parsed,
            report: generateActuarialRuleReport(parsed),
            status: 'done',
            timestamp: Date.now(),
          },
        ]);
      }
    }
  } catch (e) {}

  // If no user matches exist at all (clean pristine state), return empty array.
  // Never silently inject teaching presets into the user's real workspace!
  return [];
}

export default function App() {
  const initialPreset = PRESET_CASES[1]; // 【高息吸筹 / 名气诱导】

  // Persistent Batch Queue: load user's real analyzed matches from localStorage!
  const [initialWorkspace] = useState(() => {
    let raw: string | null | undefined;
    try { raw = localStorage.getItem(QUEUE_STORAGE_KEY); } catch { /* Storage is unavailable. */ }
    const queue = loadUserSavedQueue(raw);
    return { queue, writer: createQueueWriter(queue, raw) };
  });
  const [batchQueue, setBatchQueue] = useState(initialWorkspace.queue);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const lastBackupAtRef = useRef(0);

  // Persistent Match Data
  const [matchData, setMatchData] = useState<FullMatchData>(() => {
    try {
      const saved =
        localStorage.getItem(MATCH_STORAGE_KEY) ||
        localStorage.getItem('fortune_actuary_current_match');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.matchInfo && parsed.matchInfo.homeTeam) {
          return parsed;
        }
      }
      // If no single match, reuse the queue already loaded above (loading again re-runs migrations)
      if (batchQueue.length > 0 && batchQueue[0].data?.matchInfo?.homeTeam) {
        return batchQueue[0].data;
      }
    } catch (e) {}
    return initialPreset.data;
  });

  // Persistent Active Tab
  const [activeTab, setActiveTab] = useState<'report' | 'calculator' | 'models' | 'batch' | 'review'>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
      if (saved && ['report', 'calculator', 'models', 'batch', 'review'].includes(saved)) {
        return saved as any;
      }
    } catch (e) {}
    return 'report';
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const analyzeAbortRef = useRef<AbortController | null>(null);
  const analyzingDataRef = useRef<FullMatchData | null>(null);
  const [rawAiText, setRawAiText] = useState<string>('');

  // Persistent Report
  const [report, setReport] = useState<AnalysisReportResult>(() => {
    try {
      const saved = localStorage.getItem(REPORT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.identifiedModel) {
          return parsed;
        }
      }
    } catch (e) {}
    return generateActuarialRuleReport(matchData || initialPreset.data);
  });

  // Attachment upload modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  const [showResetPresetsConfirm, setShowResetPresetsConfirm] = useState(false);
  const [appNotice, setAppNotice] = useState<string | null>(null);
  
  // Notification banner for multi-import differential updates & lock protection
  const [importNotification, setImportNotification] = useState<{
    message: string;
    details: string;
    protectedCount: number;
    updatedCount: number;
    newCount: number;
  } | null>(null);

  // Independent mode states: 'single' (2-column matched workbench) vs 'batch' (independent full-width page)
  const [reportMode, setReportMode] = useState<'single' | 'batch'>('single');
  const [calcMode, setCalcMode] = useState<'single' | 'batch'>('single');

  const latestQueueRef = useRef(batchQueue);
  const persistQueueRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    latestQueueRef.current = batchQueue;
    const { writer } = initialWorkspace;
    const persist = () => {
      const json = writer.save(localStorage, latestQueueRef.current);
      if (json === null) return;
      setStorageWarning(null);
      if (Date.now() - lastBackupAtRef.current >= BACKUP_INTERVAL_MS) {
        try {
          localStorage.setItem(WORKSPACE_BACKUP_KEY, json);
          lastBackupAtRef.current = Date.now();
        } catch {
          localStorage.removeItem(WORKSPACE_BACKUP_KEY);
        }
      }
    };
    persistQueueRef.current = persist;
    const flush = async () => {
      if (!writer.isDirty(latestQueueRef.current)) return;
      try {
        // Serialize the version check and write across localhost tabs.
        if (navigator.locks) await navigator.locks.request(QUEUE_STORAGE_KEY, persist);
        else persist();
      } catch (error) {
        setStorageWarning(error instanceof Error && error.name === 'Error' ? error.message :
          '队列未保存，请导出本页备份并检查浏览器存储空间。');
      }
    };
    void flush();
  }, [batchQueue, initialWorkspace]);

  // Mount-only pagehide listener: browsers drop async navigator.locks promises during unload,
  // so flush any pending dirty queue synchronously before the tab closes.
  useEffect(() => {
    const { writer } = initialWorkspace;
    const handlePageHide = () => {
      if (!writer.isDirty(latestQueueRef.current)) return;
      try {
        persistQueueRef.current();
      } catch {
        // Ignore unload-time storage errors
      }
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [initialWorkspace]);

  useEffect(() => {
    const warn = () => setStorageWarning('复盘档案写入失败。请保留当前页面并检查浏览器存储空间和档案格式。');
    window.addEventListener('fortune-review-save-error', warn);
    return () => window.removeEventListener('fortune-review-save-error', warn);
  }, []);

  // Switching to (or editing) another match makes a pending AI answer stale: cancel it.
  useEffect(() => {
    if (analyzeAbortRef.current && analyzingDataRef.current !== matchData) {
      analyzeAbortRef.current.abort();
      analyzeAbortRef.current = null;
      analyzingDataRef.current = null;
      setIsLoading(false);
    }
  }, [matchData]);

  // Auto-persist matchData
  useEffect(() => {
    try {
      localStorage.setItem(MATCH_STORAGE_KEY, JSON.stringify(matchData));
    } catch (e) {}
  }, [matchData]);

  // Auto-persist report
  useEffect(() => {
    try {
      localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(report));
    } catch (e) {}
  }, [report]);

  // Auto-persist activeTab
  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
    } catch (e) {}
  }, [activeTab]);

  // Explicit handler to reload 5 classic teaching presets (confirmed via in-app modal)
  const handleResetToPresets = () => {
    setShowResetPresetsConfirm(true);
  };

  const confirmResetToPresets = () => {
    const presets: BatchMatchItem[] = PRESET_CASES.map((c) => ({
      id: c.id,
      sourceName: c.name,
      data: c.data,
      report: generateActuarialRuleReport(c.data),
      status: 'done' as const,
      timestamp: Date.now(),
    }));
    latestQueueRef.current = presets;
    setBatchQueue(presets);
    setMatchData(PRESET_CASES[1].data);
    setReport(generateActuarialRuleReport(PRESET_CASES[1].data));
    setShowResetPresetsConfirm(false);
  };

  // Analyze function calling server-side Gemini with actuarial rule engine fallback
  const handleAnalyze = async (dataToAnalyze: FullMatchData = matchData) => {
    // Only the latest request may write results: a slow answer for match A must not
    // overwrite the report of match B that the user switched to in the meantime.
    analyzeAbortRef.current?.abort();
    const controller = new AbortController();
    analyzeAbortRef.current = controller;
    analyzingDataRef.current = dataToAnalyze;

    setIsLoading(true);
    setRawAiText('');
    // Instant local actuarial rule engine computation for immediate responsiveness
    const localReport = generateActuarialRuleReport(dataToAnalyze);
    setReport(localReport);
    setActiveTab('report');

    try {
      if (localReport.decision.v4Assessment) return;
      const experiencePrompt = getActiveExperiencePromptText();
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...dataToAnalyze,
          experiencePrompt,
        }),
        signal: controller.signal,
      });

      if (response.ok) {
        const data = await response.json();
        if (controller.signal.aborted) return;
        // Engine fallback text is the same content as localReport; keep it labelled as engine output.
        if (data.aiAnalysis && data.source === 'GEMINI_AI') {
          setRawAiText(data.aiAnalysis);

          // If the AI response contains structured sections, we can enhance the report
          const aiText = data.aiAnalysis as string;
          let parsedImpression = localReport.firstImpression;
          let parsedLieDetection = localReport.threeDimLieDetection;
          let parsedVerdict = localReport.finalVerdict;

          // Extract section 1
          const s1Match = aiText.match(/(?:1\.\s*)?【盘面第一印象】[：:]?\s*([\s\S]*?)(?=(?:2\.\s*)?【三维联动测谎】|$)/);
          if (s1Match && s1Match[1].trim()) {
            parsedImpression = s1Match[1].trim();
          }

          // Extract section 2
          const s2Match = aiText.match(/(?:2\.\s*)?【三维联动测谎】[：:]?\s*([\s\S]*?)(?=(?:3\.\s*)?【财富经最终判定】|$)/);
          if (s2Match && s2Match[1].trim()) {
            parsedLieDetection = s2Match[1].trim();
          }

          // Extract section 3
          const s3Match = aiText.match(/(?:3\.\s*)?【财富经最终判定】[：:]?\s*([\s\S]*)/);
          if (s3Match && s3Match[1].trim()) {
            const s3Content = s3Match[1].trim();
            const recMatch = s3Content.match(/【?推荐方向[】:：]?\s*([^\n\r]+)/);
            const riskMatch = s3Content.match(/【?避坑风险提示[】:：]?\s*([\s\S]+)/);

            parsedVerdict = {
              direction: recMatch ? `【推荐方向】：${recMatch[1].trim()}` : localReport.finalVerdict.direction,
              directionDetail: s3Content.split('\n')[0] || localReport.finalVerdict.directionDetail,
              riskWarning: riskMatch ? riskMatch[1].trim() : localReport.finalVerdict.riskWarning,
            };
          }

          setReport({
            ...localReport,
            firstImpression: parsedImpression,
            threeDimLieDetection: parsedLieDetection,
            finalVerdict: parsedVerdict,
            source: 'GEMINI_AI',
            geminiModel: typeof data.geminiModel === 'string' ? data.geminiModel : undefined,
          });
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.warn('Backend Gemini API call skipped or errored, using deterministic actuarial engine:', err);
    } finally {
      if (analyzeAbortRef.current === controller) {
        analyzeAbortRef.current = null;
        analyzingDataRef.current = null;
        setIsLoading(false);
      }
    }
  };

  const handleSelectPreset = (preset: PresetCase) => {
    setMatchData(preset.data);
    setRawAiText('');
    handleAnalyze(preset.data);
  };

  const handleReset = () => {
    const blank: FullMatchData = {
      matchInfo: {
        league: '',
        homeTeam: '',
        awayTeam: '',
        matchTime: '',
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
      additionalNotes: '',
    };
    setMatchData(blank);
    setRawAiText('');
    setReport(generateActuarialRuleReport(blank));
  };

  // Image analysis callback
  const handleImageAnalyzed = (targetData: FullMatchData, aiAnalysis: string, geminiModel?: string) => {
    const updatedReport = generateActuarialRuleReport(targetData);
    setMatchData(targetData);
    const reportAiText = updatedReport.decision.v4Assessment ? '' : aiAnalysis;
    if (reportAiText) {
      updatedReport.source = 'GEMINI_AI';
      updatedReport.geminiModel = geminiModel;
    }
    setRawAiText(reportAiText);
    setReport(updatedReport);
    setActiveTab('report');

    // Add to batch queue
    const newItem: BatchMatchItem = {
      id: `img-${Date.now()}`,
      sourceName: `截图识盘_${targetData.matchInfo.homeTeam}vs${targetData.matchInfo.awayTeam}`,
      data: targetData,
      report: updatedReport,
      rawAiText: reportAiText,
      marketRecordedAt: Date.now(),
      status: 'done',
      timestamp: Date.now(),
    };
    setBatchQueue((prev) => [newItem, ...prev]);
  };

  // Explicit handler to purge teaching presets and keep only real analyzed matches
  const handlePurgePresets = () => {
    const prev = latestQueueRef.current;
    const filtered = prev.filter(
      (item) =>
        !item.id.startsWith('preset-') &&
        !PRESET_CASES.some((c) => c.id === item.id)
    );
    if (filtered.length === 0) {
      setAppNotice('当前队列仅包含教学预设案例，请先导入您的实战分析比赛。');
      return;
    }
    setAppNotice(null);
    latestQueueRef.current = filtered;
    setBatchQueue(filtered);
  };

  // Explicit handler to import an entire batch queue backup (JSON)
  const handleImportQueue = (imported: BatchMatchItem[]) => {
    if (!Array.isArray(imported) || imported.length === 0) return;
    const first = imported[0];
    const firstReport = first.report || generateActuarialRuleReport(first.data);
    setBatchQueue(imported);
    setMatchData(first.data);
    setReport(firstReport);
  };

  // Batch imported callback (Smart Merge with Lock Protection: never overwrites locked/started matches!)
  const handleBatchImported = (matches: FullMatchData[]) => {
    let protectedCount = 0;
    let updatedCount = 0;
    let newCount = 0;
    let incConfidenceCount = 0;
    let decConfidenceCount = 0;
    let stableConfidenceCount = 0;

    const prevQueue = latestQueueRef.current;
    // If queue is currently ONLY the default teaching presets, replace them with user's real imported matches!
    const isOnlyPresets = prevQueue.every(
      (item) =>
        item.id.startsWith('preset-') ||
        PRESET_CASES.some((c) => c.id === item.id)
    );
    const updatedQueue = isOnlyPresets ? [] : [...prevQueue];

    for (const m of matches) {
      const home = m.matchInfo.homeTeam.trim();
      const away = m.matchInfo.awayTeam.trim();
      const existingIndex = updatedQueue.findIndex(
        (item) =>
          ((item.data.matchInfo.homeTeam.trim() === home && item.data.matchInfo.awayTeam.trim() === away) ||
           (matchTeamsFuzzy(item.data.matchInfo.homeTeam, home) && matchTeamsFuzzy(item.data.matchInfo.awayTeam, away))) &&
          !(hasExplicitKickoffDate(m.matchInfo.matchTime) && hasExplicitKickoffDate(item.data.matchInfo.matchTime) &&
            calculateSalesDate(m.matchInfo.matchTime).salesDate !== calculateSalesDate(item.data.matchInfo.matchTime, item.timestamp).salesDate)
      );

      if (existingIndex >= 0) {
        let existing = updatedQueue[existingIndex];
        const kickoff = snapshotKickoff(existing.data);
        if (kickoff !== undefined && kickoff <= Date.now()) {
          existing = { ...sealQueuePrediction(existing, Date.now()), isLocked: true };
          updatedQueue[existingIndex] = existing;
        }
        if (existing.isLocked || existing.predictionSnapshot || existing.isReviewed || existing.finalScore) {
          protectedCount++;
          // Lock Protection: preserve locked odds and predictions.
          // If matchTime was previously '临场' or missing, update matchTime from new data!
          if (!existing.predictionSnapshot && (!existing.data.matchInfo.matchTime || existing.data.matchInfo.matchTime === '临场') &&
              m.matchInfo.matchTime && m.matchInfo.matchTime !== '临场') {
            updatedQueue[existingIndex] = {
              ...existing,
              data: {
                ...existing.data,
                matchInfo: {
                  ...existing.data.matchInfo,
                  matchTime: m.matchInfo.matchTime,
                },
              },
            };
          }
          continue;
        }

        // Smart Early-vs-Late Merge: Even if the match was previously analyzed or reviewed in the morning,
        // late market data must update the actuarial report so the 2串1 parlay recommendation reflects late market shifts!
        updatedCount++;

        const prevData = existing.data;
        const prevReport = existing.report || generateActuarialRuleReport(prevData);
        const earlyDataToCompare = existing.earlyDataSnapshot || prevData;
        const earlyReportToCompare = existing.earlyReportSnapshot || prevReport;

        const mergedMatchData: FullMatchData = {
          ...m,
          matchInfo: {
            ...m.matchInfo,
            homeProfile: m.matchInfo.homeProfile ?? prevData.matchInfo.homeProfile,
            awayProfile: m.matchInfo.awayProfile ?? prevData.matchInfo.awayProfile,
            matchTime: (m.matchInfo.matchTime && !/临场|已完场/.test(m.matchInfo.matchTime))
              ? m.matchInfo.matchTime
              : (prevData.matchInfo.matchTime || m.matchInfo.matchTime || '临场'),
            marketStory: m.matchInfo.marketStory || prevData.matchInfo.marketStory,
          },
          euroOdds: {
            // If previous match data already captured earlyWin, and the new upload only has late odds
            earlyWin: (prevData.euroOdds.earlyWin > 0 && (!m.euroOdds.earlyWin || m.euroOdds.earlyWin === m.euroOdds.lateWin))
              ? prevData.euroOdds.earlyWin
              : (m.euroOdds.earlyWin || prevData.euroOdds.earlyWin),
            earlyDraw: (prevData.euroOdds.earlyDraw > 0 && (!m.euroOdds.earlyDraw || m.euroOdds.earlyDraw === m.euroOdds.lateDraw))
              ? prevData.euroOdds.earlyDraw
              : (m.euroOdds.earlyDraw || prevData.euroOdds.earlyDraw),
            earlyLoss: (prevData.euroOdds.earlyLoss > 0 && (!m.euroOdds.earlyLoss || m.euroOdds.earlyLoss === m.euroOdds.lateLoss))
              ? prevData.euroOdds.earlyLoss
              : (m.euroOdds.earlyLoss || prevData.euroOdds.earlyLoss),
            lateWin: m.euroOdds.lateWin || prevData.euroOdds.lateWin,
            lateDraw: m.euroOdds.lateDraw || prevData.euroOdds.lateDraw,
            lateLoss: m.euroOdds.lateLoss || prevData.euroOdds.lateLoss,
          },
          asianHandicap: {
            earlyHandicap: prevData.asianHandicap.earlyHandicap || m.asianHandicap.earlyHandicap,
            earlyHomeOdds: (prevData.asianHandicap.earlyHomeOdds > 0 && (!m.asianHandicap.earlyHomeOdds || m.asianHandicap.earlyHomeOdds === m.asianHandicap.lateHomeOdds))
              ? prevData.asianHandicap.earlyHomeOdds
              : (m.asianHandicap.earlyHomeOdds || prevData.asianHandicap.earlyHomeOdds),
            earlyAwayOdds: (prevData.asianHandicap.earlyAwayOdds > 0 && (!m.asianHandicap.earlyAwayOdds || m.asianHandicap.earlyAwayOdds === m.asianHandicap.lateAwayOdds))
              ? prevData.asianHandicap.earlyAwayOdds
              : (m.asianHandicap.earlyAwayOdds || prevData.asianHandicap.earlyAwayOdds),
            lateHandicap: m.asianHandicap.lateHandicap || prevData.asianHandicap.lateHandicap,
            lateHomeOdds: m.asianHandicap.lateHomeOdds || prevData.asianHandicap.lateHomeOdds,
            lateAwayOdds: m.asianHandicap.lateAwayOdds || prevData.asianHandicap.lateAwayOdds,
          },
          overUnder: {
            earlyLine: prevData.overUnder.earlyLine || m.overUnder.earlyLine,
            earlyOverOdds: prevData.overUnder.earlyOverOdds || m.overUnder.earlyOverOdds,
            earlyUnderOdds: prevData.overUnder.earlyUnderOdds || m.overUnder.earlyUnderOdds,
            lateLine: m.overUnder.lateLine || prevData.overUnder.lateLine,
            lateOverOdds: m.overUnder.lateOverOdds || prevData.overUnder.lateOverOdds,
            lateUnderOdds: m.overUnder.lateUnderOdds || prevData.overUnder.lateUnderOdds,
          },
        };

        const updatedReport = generateActuarialRuleReport(mergedMatchData);
        const confidenceShift = compareEarlyVsLateConfidence(
          mergedMatchData,
          earlyReportToCompare,
          updatedReport,
          earlyDataToCompare
        );

        if (confidenceShift.shiftType === 'INCREASED') incConfidenceCount++;
        else if (confidenceShift.shiftType === 'DECREASED') decConfidenceCount++;
        else stableConfidenceCount++;

        updatedQueue[existingIndex] = {
          ...existing,
          data: mergedMatchData,
          report: updatedReport,
          earlyDataSnapshot: earlyDataToCompare,
          earlyReportSnapshot: earlyReportToCompare,
          confidenceShift,
          status: 'done',
          timestamp: Date.now(),
          marketRecordedAt: Date.now(),
          isReviewed: existing.isReviewed,
          finalScore: existing.finalScore,
          isLocked: existing.isLocked,
        };
      } else {
        // Brand new match, add to queue (首次导入基石盘口)
        newCount++;
        const rep = generateActuarialRuleReport(m);
        
        // 仅当文本内明确抓取到双重盘口（如“欧初...即...”或“亚初...即...”）时，才在首次建立变轨比对
        const hasExplicitDualOdds =
          Boolean(
            m.asianHandicap.earlyHandicap &&
            m.asianHandicap.lateHandicap &&
            m.asianHandicap.earlyHandicap !== m.asianHandicap.lateHandicap
          ) ||
          Math.abs(m.asianHandicap.earlyHomeOdds - m.asianHandicap.lateHomeOdds) > 0.02 ||
          Math.abs(m.euroOdds.earlyWin - m.euroOdds.lateWin) > 0.02;

        let confidenceShift = hasExplicitDualOdds
          ? compareEarlyVsLateConfidence(m, undefined, rep)
          : undefined;

        if (confidenceShift) {
          if (confidenceShift.starChange > 0 && confidenceShift.shiftType !== 'INCREASED') {
            confidenceShift = { ...confidenceShift, shiftType: 'INCREASED' };
          } else if (confidenceShift.starChange < 0 && confidenceShift.shiftType !== 'DECREASED') {
            confidenceShift = { ...confidenceShift, shiftType: 'DECREASED' };
          }
        }

        if (confidenceShift?.shiftType === 'INCREASED') incConfidenceCount++;
        else if (confidenceShift?.shiftType === 'DECREASED') decConfidenceCount++;
        else if (confidenceShift) stableConfidenceCount++;

        updatedQueue.push({
          id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          sourceName: `导入场次_${home}vs${away}`,
          data: m,
          report: rep,
          earlyDataSnapshot: m, // 保存初盘快照，供晚盘二次导入时精准比对变轨
          earlyReportSnapshot: rep,
          marketRecordedAt: Date.now(),
          confidenceShift,
          status: 'done',
          timestamp: Date.now(),
        });
      }
    }

    latestQueueRef.current = updatedQueue;
    setBatchQueue(updatedQueue);

    const shiftDetailText = updatedCount > 0
      ? ` ｜ ⚡ 晚盘变轨：⬆️ 增加信心 ${incConfidenceCount} 场，⬇️ 减少信心 ${decConfidenceCount} 场，⏸️ 走势平稳 ${stableConfidenceCount} 场`
      : (newCount > 0 ? ` ｜ 📌 首次录入初盘基石已锁定（临场二次导入时自动比对变轨轨迹）` : '');

    setImportNotification({
      message: `智能差量导入完成：共抓取 ${matches.length} 场赛事`,
      details: protectedCount > 0
        ? `🔒 已封盘保护 ${protectedCount} 场（终盘快照与原预测 100% 冻结，未受覆盖），🔄 临场更新 ${updatedCount} 场，➕ 新增 ${newCount} 场${shiftDetailText}`
        : `🔄 更新 ${updatedCount} 场临场赛事盘口，➕ 新增 ${newCount} 场${shiftDetailText}`,
      protectedCount,
      updatedCount,
      newCount,
    });

    setActiveTab('batch');

    // Also populate the first imported match into active view
    if (matches[0]) {
      setMatchData(matches[0]);
      setReport(generateActuarialRuleReport(matches[0]));
      setRawAiText('');
    }
  };

  // Auto-lock matches by kickoff time or by explicit target IDs (never naively locks everything)
  const handleAutoLockStartedMatches = (
    target?: string | string[] | { mode?: 'started' | 'cutoff' | 'exact' | 'ids'; cutoffTime?: string; ids?: string[] }
  ): number => {
    const now = Date.now();
    const targetIdsToLock = new Set<string>();

    if (Array.isArray(target)) {
      // Direct array of specific match IDs
      target.forEach((id) => targetIdsToLock.add(id));
    } else if (typeof target === 'object' && target !== null && Array.isArray(target.ids)) {
      // Structured object with explicit target IDs
      target.ids.forEach((id) => targetIdsToLock.add(id));
    } else {
      const targetStr = typeof target === 'string' ? target.trim() : '';

      for (const item of batchQueue) {
        if (item.isLocked) continue;
        const mTime = item.data.matchInfo.matchTime || '';
        if (!mTime || mTime === '临场') continue;

        if (targetStr && targetStr !== 'STARTED') {
          // Cutoff evaluation (e.g. "23:00" or "00:30")
          if (isMatchBeforeOrAtCutoff(mTime, targetStr, item.timestamp, 'lte')) {
            targetIdsToLock.add(item.id);
          }
        } else {
          // Default or 'STARTED': only lock matches whose real-world kickoff has actually arrived
          const details = parseKickoffDetails(mTime, item.timestamp, now);
          if (details.hasTime && details.isStarted) {
            targetIdsToLock.add(item.id);
          }
        }
      }
    }

    // Accurately compute count of unlocked matches to be locked
    let count = 0;
    for (const item of batchQueue) {
      if (!item.isLocked && targetIdsToLock.has(item.id)) {
        count++;
      }
    }

    if (count > 0) {
      setBatchQueue((prev) =>
        prev.map((item) => {
          if (item.isLocked) return item;
          if (targetIdsToLock.has(item.id)) {
            return {
              ...sealQueuePrediction(item, now),
              isLocked: true,
              lockedAt: item.lockedAt || new Date(now).toISOString(),
              lockedReason: '开赛封盘保护 (固化终盘)',
            };
          }
          return item;
        })
      );
    }

    return count;
  };

  const handleSaveCurrentSnapshot = () => {
    const now = Date.now();
    const { homeTeam, awayTeam, matchTime } = matchData.matchInfo;
    if (!homeTeam.trim() || !awayTeam.trim()) return '请先填写主客队。';
    const kickoff = snapshotKickoff(matchData);
    if (kickoff !== undefined && kickoff <= now) return '比赛已经开赛，无法补建赛前快照。';
    if (![matchData.euroOdds.lateWin, matchData.euroOdds.lateDraw, matchData.euroOdds.lateLoss].every(odds => odds > 1 && Number.isFinite(odds))) {
      return '请填写有效的三项晚盘欧赔。';
    }
    const existing = batchQueue.find(item => {
      const info = item.data.matchInfo;
      return normalizeTeamName(info.homeTeam) === normalizeTeamName(homeTeam) &&
        normalizeTeamName(info.awayTeam) === normalizeTeamName(awayTeam) &&
        (kickoff !== undefined ? snapshotKickoff(item.data) === kickoff : info.matchTime === matchTime);
    });
    if (existing?.isReviewed || existing?.finalScore) return '这场比赛已有赛果。';
    if (existing?.predictionSnapshot) return '这场比赛已保存原始快照。';
    const item = sealQueuePrediction({
      ...existing,
      id: existing?.id || `snapshot-${now}-${Math.random().toString(36).slice(2, 9)}`,
      data: matchData,
      report: generateActuarialRuleReport(matchData),
      rawAiText: undefined,
      confidenceShift: undefined,
      timestamp: existing?.timestamp ?? now,
      marketRecordedAt: now,
      status: 'done',
    }, now, true);
    if (!item.predictionSnapshot) return '当前数据无法保存为盘赔快照。';
    setBatchQueue(queue => existing
      ? queue.map(previous => previous.id === item.id && !previous.predictionSnapshot && !previous.isReviewed ? item : previous)
      : [item, ...queue]);
    return hasVerifiedSnapshot(item.predictionSnapshot)
      ? '已保存赛前快照，可在批量矩阵里查看。'
      : '已保存快照。缺少完整开赛时间，无法确认赛前留档。';
  };

  // A dated prediction snapshot remains sealed when unlocking older market records.
  const handleToggleLockMatch = (id: string) => {
    const now = Date.now();
    setBatchQueue(queue => queue.map(item => {
      if (item.id !== id || item.predictionSnapshot || item.isReviewed) return item;
      if (item.isLocked) return { ...item, isLocked: false, lockedAt: undefined, lockedReason: undefined };
      return { ...sealQueuePrediction(item, now, true), isLocked: true, lockedAt: new Date(now).toISOString(), lockedReason: '手动封盘' };
    }));
  };

  const handleBatchLockMatches = (lock: boolean) => {
    const now = Date.now();
    setBatchQueue(queue => queue.map(item => {
      if (item.predictionSnapshot || item.isReviewed || item.isLocked === lock) return item;
      if (!lock) return { ...item, isLocked: false, lockedAt: undefined, lockedReason: undefined };
      return { ...sealQueuePrediction(item, now, true), isLocked: true, lockedAt: new Date(now).toISOString(), lockedReason: '批量封盘' };
    }));
  };

  // Delete a single match from the batch queue
  const handleDeleteBatchMatch = (id: string) => {
    setBatchQueue((prev) => prev.filter((item) => item.id !== id));
  };

  // Record actual match score and automatically perform post-match evaluation and knowledge archiving
  const handleRecordScoreAndReview = (
    id: string,
    homeScore: number,
    awayScore: number,
    incidents: string = ''
  ) => {
    const targetItem = latestQueueRef.current.find((item) => item.id === id);
    if (!targetItem) return;

    const sealed = sealQueuePrediction(targetItem, Date.now());
    const rep = sealed.report || generateActuarialRuleReport(sealed.data);
    let review = evaluateMatchOutcomeAndExtractLesson(
      targetItem.data,
      rep,
      homeScore,
      awayScore,
      incidents,
      false,
      targetItem.review?.salesDateOverride || targetItem.review?.salesDate,
      targetItem.timestamp,
      targetItem.review,
      sealed.predictionSnapshot
    );
    if (targetItem.review?.salesDateOverride) {
      review = calibrateReviewSalesDate({ ...review, salesDateOverride: targetItem.review.salesDateOverride });
    }
    // Persist into PostMatchReviews storage outside React's state updater
    if (!savePostMatchReview(review)) return;

    const nextItem: BatchMatchItem = {
      ...sealed,
      finalScore: `${homeScore}-${awayScore}`,
      isReviewed: true,
      isLocked: true, // Automatically lock once result is recorded
      review,
    };

    setBatchQueue((prev) =>
      prev.map((item) => (item.id === id ? nextItem : item))
    );
  };

  const handleSelectBatchMatch = (match: FullMatchData) => {
    setMatchData(match);
    setRawAiText('');
    setReport(batchQueue.find(item => item.data === match)?.report || generateActuarialRuleReport(match));
    setActiveTab('report');
  };

  // Switch active match while strictly keeping the current tab (e.g. staying in calculator, review, etc.)
  const handleSelectMatchKeepTab = (match: FullMatchData) => {
    setMatchData(match);
    setRawAiText('');
    setReport(batchQueue.find(item => item.data === match)?.report || generateActuarialRuleReport(match));
  };

  // Batch analyze all matches in queue and render them
  const handleBatchAnalyzeAll = async () => {
    if (batchQueue.length === 0) return;
    setIsBatchAnalyzing(true);
    setActiveTab('batch');

    // Instantly compute deterministic actuarial rule report & sanitize confidence shifts for all matches
    const updatedQueue: BatchMatchItem[] = sanitizeAndRecalibrateQueue(batchQueue).map((item) => ({
      ...item,
      status: 'done',
    }));

    setBatchQueue(updatedQueue);
    // Simulate minor async processing for smooth UI feedback
    await new Promise((r) => setTimeout(r, 400));
    setIsBatchAnalyzing(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <Header
        onSelectPreset={handleSelectPreset}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onReset={handleReset}
        isAiAnalyzing={isLoading}
        onOpenUploadModal={() => setIsUploadModalOpen(true)}
        batchCount={batchQueue.length}
        batchQueue={batchQueue}
        currentMatch={matchData}
        onSelectMatch={handleSelectMatchKeepTab}
      />

      {storageWarning && (
        <div role="alert" className="mx-4 mt-3 rounded-lg border border-red-500/50 bg-red-950/70 px-4 py-2.5 text-xs text-red-200 flex items-start justify-between gap-3">
          <span>⚠️ {storageWarning}</span>
          <button type="button" onClick={() => setStorageWarning(null)} className="shrink-0 text-red-300 hover:text-white">关闭</button>
        </div>
      )}

      {appNotice && (
        <div role="status" className="mx-4 mt-3 rounded-lg border border-amber-500/40 bg-amber-950/60 px-4 py-2.5 text-xs text-amber-200 flex items-start justify-between gap-3">
          <span>{appNotice}</span>
          <button type="button" onClick={() => setAppNotice(null)} className="shrink-0 text-amber-300 hover:text-white">关闭</button>
        </div>
      )}

      {/* Main Terminal Body */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* SCENARIO 1: FULL-WIDTH WORKSPACE TABS (Batch Matrix, Post-Match Review, Model KB) */}
        {(activeTab === 'batch' || activeTab === 'review' || activeTab === 'models') && (
          <div className="w-full space-y-6">
            <Suspense fallback={<div className="py-16 text-center text-xs text-slate-500">模块加载中…</div>}>
            {activeTab === 'batch' && (
              <BatchMatrixDashboard
                queue={batchQueue}
                onSelectMatch={handleSelectBatchMatch}
                onDeleteMatch={handleDeleteBatchMatch}
                onClearQueue={() => setBatchQueue([])}
                onOpenUploadModal={() => setIsUploadModalOpen(true)}
                onBatchAnalyzeAll={handleBatchAnalyzeAll}
                isBatchAnalyzing={isBatchAnalyzing}
                onToggleLockMatch={handleToggleLockMatch}
                onBatchLockMatches={handleBatchLockMatches}
                onAutoLockStartedMatches={handleAutoLockStartedMatches}
                importNotification={importNotification}
                onDismissNotification={() => setImportNotification(null)}
                onRecordScoreAndReview={handleRecordScoreAndReview}
                onNavigateToReview={() => setActiveTab('review')}
                onResetToPresets={handleResetToPresets}
                onPurgePresets={handlePurgePresets}
                onImportQueue={handleImportQueue}
              />
            )}

            {activeTab === 'review' && (
              <ReviewEvolutionView
                queue={batchQueue}
                currentMatch={matchData}
                currentReport={report}
                onUpdateQueue={setBatchQueue}
                onSelectMatch={(m) => {
                  setMatchData(m);
                  setReport(generateActuarialRuleReport(m));
                }}
              />
            )}

            {activeTab === 'models' && (
              <ModelKnowledgeBase
                onLoadPreset={handleSelectPreset}
                currentMatch={matchData}
                currentReport={report}
                batchQueue={batchQueue}
                onSelectMatch={handleSelectMatchKeepTab}
                onNavigateToWorkbench={() => setActiveTab('report')}
              />
            )}
            </Suspense>
          </div>
        )}

        {/* SCENARIO 2: INDEPENDENT FULL-WIDTH BATCH DISPLAY OR SYNCHRONIZED TWO-COLUMN WORKSPACE */}
        {(activeTab === 'report' || activeTab === 'calculator') && (
          (activeTab === 'report' ? reportMode === 'batch' : calcMode === 'batch') ? (
            /* Independent Full-Width Page: Hides the single-match input form to prevent data desync */
            <div className="w-full space-y-6">
              {activeTab === 'report' && (
                <ActuarialReport
                  report={report}
                  rawAiText={rawAiText}
                  matchData={matchData}
                  isLoading={isLoading}
                  onNavigateToReview={() => setActiveTab('review')}
                  batchQueue={batchQueue}
                  onSelectMatch={handleSelectMatchKeepTab}
                  reportMode={reportMode}
                  onReportModeChange={setReportMode}
                />
              )}

              {activeTab === 'calculator' && (
                <DataCalculations
                  metrics={report.metrics}
                  matchData={matchData}
                  matches={batchQueue.map((b) => b.data)}
                  batchQueue={batchQueue}
                  onSelectMatch={handleSelectMatchKeepTab}
                  calcMode={calcMode}
                  onCalcModeChange={setCalcMode}
                />
              )}
            </div>
          ) : (
            /* Synchronized 2-Column Workbench: Left input form (5 cols) + Right report/calculator (7 cols) 100% matched */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Data Input and Form (5 cols on lg) - 100% Synchronized with Current Match */}
              <div className="lg:col-span-5 space-y-4">
                <MatchInputForm
                  data={matchData}
                  onChange={setMatchData}
                  onSubmit={() => handleAnalyze(matchData)}
                  onSaveSnapshot={handleSaveCurrentSnapshot}
                  isLoading={isLoading}
                  onSelectPreset={handleSelectPreset}
                  onOpenUploadModal={() => setIsUploadModalOpen(true)}
                  onBatchAnalyzeAll={handleBatchAnalyzeAll}
                  batchCount={batchQueue.length}
                />
              </div>

              {/* Right Column: Actuarial Report or Math Calculator (7 cols on lg) */}
              <div className="lg:col-span-7">
                {activeTab === 'report' && (
                  <ActuarialReport
                    report={report}
                    rawAiText={rawAiText}
                    matchData={matchData}
                    isLoading={isLoading}
                    onNavigateToReview={() => setActiveTab('review')}
                    batchQueue={batchQueue}
                    onSelectMatch={handleSelectMatchKeepTab}
                    reportMode={reportMode}
                    onReportModeChange={setReportMode}
                  />
                )}

                {activeTab === 'calculator' && (
                  <DataCalculations
                    metrics={report.metrics}
                    matchData={matchData}
                    matches={batchQueue.map((b) => b.data)}
                    batchQueue={batchQueue}
                    onSelectMatch={handleSelectMatchKeepTab}
                    calcMode={calcMode}
                    onCalcModeChange={setCalcMode}
                  />
                )}
              </div>
            </div>
          )
        )}
      </main>

      {/* Attachment Upload & Batch Modal */}
      <AttachmentUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onImageAnalyzed={handleImageAnalyzed}
        onBatchImported={handleBatchImported}
      />

      {/* In-app confirmation modal for resetting to teaching presets */}
      {showResetPresetsConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <h3 className="text-sm font-bold text-white">确认载入教学预设案例</h3>
            </div>
            <div className="px-5 py-4 text-xs text-slate-300 leading-relaxed">
              确定要载入官方 5 场经典教学预设案例吗？当前队列中的比赛将被重置为教学用例（曼城、皇马、利物浦、拉齐奥、多特蒙德）。
            </div>
            <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowResetPresetsConfirm(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmResetToPresets}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer"
              >
                确认载入
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Info */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>《财富经》足彩盘赔精算与风控博弈系统 · 顶级精算师量化引擎</span>
          </div>
          <div className="text-[11px] text-slate-600">
            支持盘赔截图OCR识别 · CSV多场次沙箱隔离批处理 · 零上下文膨胀
          </div>
        </div>
      </footer>
    </div>
  );
}

