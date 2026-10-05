/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { MatchInputForm } from './components/MatchInputForm';
import { ActuarialReport } from './components/ActuarialReport';
import { DataCalculations } from './components/DataCalculations';
import { ModelKnowledgeBase } from './components/ModelKnowledgeBase';
import { AttachmentUploadModal } from './components/AttachmentUploadModal';
import { BatchMatrixDashboard } from './components/BatchMatrixDashboard';
import { ReviewEvolutionView } from './components/ReviewEvolutionView';
import { FullMatchData, AnalysisReportResult, BatchMatchItem } from './types/fortuneActuary';
import { PRESET_CASES, PresetCase } from './utils/presetCases';
import { generateActuarialRuleReport } from './utils/actuaryEngine';
import {
  getActiveExperiencePromptText,
  evaluateMatchOutcomeAndExtractLesson,
  savePostMatchReview,
} from './utils/experienceStore';
import { ShieldCheck, Sparkles, TrendingUp, AlertTriangle, HelpCircle, Layers, Brain } from 'lucide-react';

export default function App() {
  // Start with the classic Real Madrid high interest trap or Man City solid case
  const initialPreset = PRESET_CASES[1]; // 【高息吸筹 / 名气诱导】
  const [matchData, setMatchData] = useState<FullMatchData>(initialPreset.data);
  const [activeTab, setActiveTab] = useState<'report' | 'calculator' | 'models' | 'batch' | 'review'>('report');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [rawAiText, setRawAiText] = useState<string>('');
  const [report, setReport] = useState<AnalysisReportResult>(() =>
    generateActuarialRuleReport(initialPreset.data)
  );

  // Attachment upload modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  
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

  // Batch matches queue (preloaded with the classic cases for immediate testing)
  const [batchQueue, setBatchQueue] = useState<BatchMatchItem[]>(() => {
    return PRESET_CASES.map((c) => ({
      id: c.id,
      sourceName: c.name,
      data: c.data,
      report: generateActuarialRuleReport(c.data),
      status: 'done',
      timestamp: Date.now(),
    }));
  });

  // Analyze function calling server-side Gemini 3.8 Flash with actuarial rule engine fallback
  const handleAnalyze = async (dataToAnalyze: FullMatchData = matchData) => {
    setIsLoading(true);
    // Instant local actuarial rule engine computation for immediate responsiveness
    const localReport = generateActuarialRuleReport(dataToAnalyze);
    setReport(localReport);
    setActiveTab('report');

    try {
      const experiencePrompt = getActiveExperiencePromptText();
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...dataToAnalyze,
          experiencePrompt,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.aiAnalysis) {
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
          });
        }
      }
    } catch (err) {
      console.warn('Backend Gemini API call skipped or errored, using deterministic actuarial engine:', err);
    } finally {
      setIsLoading(false);
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
  const handleImageAnalyzed = (extractedData: FullMatchData | null, aiAnalysis: string) => {
    const targetData = extractedData || matchData;
    setMatchData(targetData);
    setRawAiText(aiAnalysis);
    const updatedReport = generateActuarialRuleReport(targetData);
    setReport(updatedReport);
    setActiveTab('report');

    // Add to batch queue
    const newItem: BatchMatchItem = {
      id: `img-${Date.now()}`,
      sourceName: `截图识盘_${targetData.matchInfo.homeTeam}vs${targetData.matchInfo.awayTeam}`,
      data: targetData,
      report: updatedReport,
      rawAiText: aiAnalysis,
      status: 'done',
      timestamp: Date.now(),
    };
    setBatchQueue((prev) => [newItem, ...prev]);
  };

  // Batch imported callback (Smart Merge with Lock Protection: never overwrites locked/started matches!)
  const handleBatchImported = (matches: FullMatchData[]) => {
    let protectedCount = 0;
    let updatedCount = 0;
    let newCount = 0;

    setBatchQueue((prevQueue) => {
      const updatedQueue = [...prevQueue];

      for (const m of matches) {
        const home = m.matchInfo.homeTeam.trim();
        const away = m.matchInfo.awayTeam.trim();
        const existingIndex = updatedQueue.findIndex(
          (item) =>
            item.data.matchInfo.homeTeam.trim() === home &&
            item.data.matchInfo.awayTeam.trim() === away
        );

        if (existingIndex >= 0) {
          const existing = updatedQueue[existingIndex];
          if (existing.isLocked) {
            // 🔒 LOCKED! Strictly preserve the frozen pre-match snapshot & predictions!
            protectedCount++;
            continue;
          } else {
            // Update unlocked match with newer snapshot data: Smart Early-vs-Late Merge!
            updatedCount++;

            const prevData = existing.data;
            const mergedMatchData: FullMatchData = {
              ...m,
              matchInfo: {
                ...m.matchInfo,
                matchTime: m.matchInfo.matchTime || prevData.matchInfo.matchTime,
                marketStory: m.matchInfo.marketStory || prevData.matchInfo.marketStory,
              },
              euroOdds: {
                // If previous match data already captured earlyWin, and the new upload only has late odds (or earlyWin wasn't updated)
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

            updatedQueue[existingIndex] = {
              ...existing,
              data: mergedMatchData,
              report: updatedReport,
              status: 'done',
              timestamp: Date.now(),
            };
          }
        } else {
          // Brand new match, add to queue
          newCount++;
          updatedQueue.push({
            id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            sourceName: `导入场次_${home}vs${away}`,
            data: m,
            report: generateActuarialRuleReport(m),
            status: 'done',
            timestamp: Date.now(),
          });
        }
      }

      return updatedQueue;
    });

    setImportNotification({
      message: `智能差量导入完成：共抓取 ${matches.length} 场赛事`,
      details: protectedCount > 0
        ? `🔒 已封盘保护 ${protectedCount} 场（终盘快照与原预测 100% 冻结，未受覆盖），🔄 临场更新 ${updatedCount} 场，➕ 新增 ${newCount} 场`
        : `🔄 更新 ${updatedCount} 场临场赛事盘口，➕ 新增 ${newCount} 场`,
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

  // Auto-lock matches that have kicked off or have specific matchTime (e.g. <= cutoff)
  const handleAutoLockStartedMatches = (cutoffTimeStr?: string) => {
    let count = 0;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    setBatchQueue((prev) =>
      prev.map((item) => {
        if (item.isLocked) return item;
        const mTime = item.data.matchInfo.matchTime || '';
        let shouldLock = false;

        if (cutoffTimeStr) {
          // E.g., if match time equals cutoff or user explicitly specified
          if (mTime.includes(cutoffTimeStr) || mTime.localeCompare(cutoffTimeStr) <= 0) {
            shouldLock = true;
          }
        } else {
          // Default: if match has a concrete time like "00:00" or user wants to lock current early games
          shouldLock = true;
        }

        if (shouldLock) {
          count++;
          return {
            ...item,
            isLocked: true,
            lockedAt: mTime || timeStr,
            lockedReason: '开赛封盘保护 (固化终盘)',
          };
        }
        return item;
      })
    );

    return count;
  };

  // Toggle lock for a specific match (protects snapshot against re-imports)
  const handleToggleLockMatch = (id: string) => {
    setBatchQueue((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const willLock = !item.isLocked;
          return {
            ...item,
            isLocked: willLock,
            lockedAt: willLock
              ? new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
              : undefined,
            lockedReason: willLock ? '已开赛封盘保护' : undefined,
          };
        }
        return item;
      })
    );
  };

  // Batch lock or unlock matches
  const handleBatchLockMatches = (lock: boolean) => {
    const timeStr = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    setBatchQueue((prev) =>
      prev.map((item) => ({
        ...item,
        isLocked: lock,
        lockedAt: lock ? item.lockedAt || timeStr : undefined,
        lockedReason: lock ? item.lockedReason || '开赛封盘保护' : undefined,
      }))
    );
  };

  // Record actual match score and automatically perform post-match evaluation and knowledge archiving
  const handleRecordScoreAndReview = (
    id: string,
    homeScore: number,
    awayScore: number,
    incidents: string = ''
  ) => {
    setBatchQueue((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const rep = item.report || generateActuarialRuleReport(item.data);
          const review = evaluateMatchOutcomeAndExtractLesson(
            item.data,
            rep,
            homeScore,
            awayScore,
            incidents
          );
          // Persist into PostMatchReviews storage
          savePostMatchReview(review);

          return {
            ...item,
            finalScore: `${homeScore}-${awayScore}`,
            isReviewed: true,
            isLocked: true, // Automatically lock once result is recorded
            review,
          };
        }
        return item;
      })
    );
  };

  const handleSelectBatchMatch = (match: FullMatchData) => {
    setMatchData(match);
    setRawAiText('');
    setReport(generateActuarialRuleReport(match));
    setActiveTab('report');
  };

  // Switch active match while strictly keeping the current tab (e.g. staying in calculator, review, etc.)
  const handleSelectMatchKeepTab = (match: FullMatchData) => {
    setMatchData(match);
    setRawAiText('');
    setReport(generateActuarialRuleReport(match));
  };

  // Batch analyze all matches in queue and render them
  const handleBatchAnalyzeAll = async () => {
    if (batchQueue.length === 0) return;
    setIsBatchAnalyzing(true);
    setActiveTab('batch');

    // Instantly compute deterministic actuarial rule report for all matches
    const updatedQueue: BatchMatchItem[] = batchQueue.map((item) => {
      const rep = generateActuarialRuleReport(item.data);
      return {
        ...item,
        report: rep,
        status: 'done',
      };
    });

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

      {/* Main Terminal Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* SCENARIO 1: FULL-WIDTH WORKSPACE TABS (Batch Matrix, Post-Match Review, Model KB) */}
        {(activeTab === 'batch' || activeTab === 'review' || activeTab === 'models') && (
          <div className="w-full space-y-6">
            {activeTab === 'batch' && (
              <BatchMatrixDashboard
                queue={batchQueue}
                onSelectMatch={handleSelectBatchMatch}
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
              <ModelKnowledgeBase onLoadPreset={handleSelectPreset} />
            )}
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

