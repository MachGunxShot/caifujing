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
import { getActiveExperiencePromptText } from './utils/experienceStore';
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

  // Batch imported callback
  const handleBatchImported = (matches: FullMatchData[]) => {
    const newItems: BatchMatchItem[] = matches.map((m, idx) => ({
      id: `batch-${Date.now()}-${idx}`,
      sourceName: `导入场次_${m.matchInfo.homeTeam}vs${m.matchInfo.awayTeam}`,
      data: m,
      report: generateActuarialRuleReport(m),
      status: 'done',
      timestamp: Date.now(),
    }));

    setBatchQueue((prev) => [...newItems, ...prev]);
    setActiveTab('batch');

    // Also populate the first imported match into active view
    if (matches[0]) {
      setMatchData(matches[0]);
      setReport(generateActuarialRuleReport(matches[0]));
      setRawAiText('');
    }
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

